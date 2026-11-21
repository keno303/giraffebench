(function (global) {
  'use strict';

  const App = (global.GiraffeApp = global.GiraffeApp || {});
  const { clamp, lerp, smoothstep, smootherstep, fract, groundHeight, solveTwoBoneIK } = App.Math;

  // Compute rotation quaternion aligning bone rest direction onto animated direction
  // with zero twist around the bone axis (preserving sagittal limb plane).
  const _xr = new THREE.Vector3();
  const _yr = new THREE.Vector3();
  const _zr = new THREE.Vector3();
  const _xa = new THREE.Vector3();
  const _ya = new THREE.Vector3();
  const _za = new THREE.Vector3();
  const _mRest = new THREE.Matrix4();
  const _mAnim = new THREE.Matrix4();
  const _mRot = new THREE.Matrix4();

  function computeSegmentWorldQuat(restDir, animDir, sideHint, outQuat) {
    _yr.copy(restDir).normalize();
    _zr.crossVectors(sideHint, _yr);
    if (_zr.lengthSq() < 1e-6) _zr.set(0, 0, 1);
    else _zr.normalize();
    _xr.crossVectors(_yr, _zr).normalize();
    _mRest.makeBasis(_xr, _yr, _zr);

    _ya.copy(animDir).normalize();
    _za.crossVectors(sideHint, _ya);
    if (_za.lengthSq() < 1e-6) _za.set(0, 0, 1);
    else _za.normalize();
    _xa.crossVectors(_ya, _za).normalize();
    _mAnim.makeBasis(_xa, _ya, _za);

    // M_rot = M_anim * transpose(M_rest)
    _mRest.transpose();
    _mRot.multiplyMatrices(_mAnim, _mRest);
    outQuat.setFromRotationMatrix(_mRot);
    return outQuat;
  }

  function createGaitController(giraffe) {
    const skel = giraffe.skelData;
    const bones = skel.bones;
    const restPos = skel.restPositions;
    const idx = skel.index;

    // Authentic giraffe pacing / lateral-couplet gait parameters
    const params = {
      cycleDuration: 1.52, // seconds per full stride at speed = 1.0
      strideLength: 1.36,  // meters traveled per full stride cycle
      dutyFactor: 0.68,    // fraction of cycle each hoof is planted on ground
      swingHeight: 0.23,   // hoof peak clearance above savanna ground
      // Lateral pacing phase offsets (hind leads ipsilateral fore by 0.13 cycle!)
      phaseOffsets: {
        hl: 0.00,
        fl: -0.13,
        hr: 0.50,
        fr: 0.37,
      },
    };

    const state = {
      cycles: 0.0,
      time: 0.0,
      walkZ: 0.0,
      speed: 1.0,
      paused: false,
      prevInSwing: { fl: false, fr: false, hl: false, hr: false },
      legInSwing: { fl: false, fr: false, hl: false, hr: false },
      hoofWorldPositions: {
        fl: new THREE.Vector3(),
        fr: new THREE.Vector3(),
        hl: new THREE.Vector3(),
        hr: new THREE.Vector3(),
      },
      onFootStrike: null, // optional callback(worldPos) for subtle savanna dust puffs
    };

    // Reusable scratch vectors/quaternions (zero per-frame GC allocations!)
    const vSide = new THREE.Vector3(1, 0, 0);
    const vPoleFwd = new THREE.Vector3(0, 0, 1);
    const vPoleBack = new THREE.Vector3(0, 0, -1);
    const pRoot = new THREE.Vector3();
    const pUpper = new THREE.Vector3();
    const pMid = new THREE.Vector3();
    const pFetlock = new THREE.Vector3();
    const pHoof = new THREE.Vector3();
    const vSegDir = new THREE.Vector3();
    const vToFet = new THREE.Vector3();
    const vUpperDir = new THREE.Vector3();
    const qParentWorld = new THREE.Quaternion();
    const qParentInv = new THREE.Quaternion();
    const qSegWorld = new THREE.Quaternion();
    const qLocal = new THREE.Quaternion();
    const qHoofPitch = new THREE.Quaternion();
    const eScratch = new THREE.Euler();
    const mParentInv = new THREE.Matrix4();
    const vLocalTmp = new THREE.Vector3();
    const vWorldFoot = new THREE.Vector3();

    // Evaluate a single leg's target hoof position (in giraffe-local space), swing state, and hoof pitch
    function evalFootTarget(legKey, cycles, walkZ, rootY) {
      const spec = skel.legSpecs[legKey];
      const duty = params.dutyFactor;
      const L = params.strideLength;
      const stanceHalf = 0.5 * duty * L;

      const u = fract(cycles + params.phaseOffsets[legKey]);
      const inSwing = u >= duty;

      let relZ;
      let liftY = 0;
      let hoofPitch = 0;
      let loadFactor = 0; // [0..1] weight bearing on this leg
      let swingFrac = 0;

      if (!inSwing) {
        // STANCE PHASE: Exact linear backward motion at -L per cycle => ZERO WORLD FOOT SLIP!
        const s = u / duty; // 0 (heel strike) -> 1 (toe off)
        relZ = spec.restHoofZ + stanceHalf - u * L;
        liftY = 0;

        // Weight-bearing load curve (ramps smoothly up after strike, peaks mid-stance, eases off before breakover)
        loadFactor = Math.sin(s * Math.PI);
        loadFactor = Math.pow(clamp(loadFactor, 0, 1), 0.75);

        // Subtle heel-strike settle & late-stance toe-off breakover pitch
        const heelSettle = (1 - smoothstep(0.0, 0.12, s)) * 0.14;
        const toeBreakover = smoothstep(0.84, 1.0, s) * -0.42;
        hoofPitch = heelSettle + toeBreakover;
      } else {
        // SWING PHASE: Smooth forward carry & natural ungulate ground clearance arc
        const w = (u - duty) / (1 - duty); // 0 -> 1
        swingFrac = w;
        // Asymmetric forward advance (slight acceleration through mid-swing, gentle reach into heel strike)
        const adv = smootherstep(0, 1, w);
        relZ = spec.restHoofZ + lerp(-stanceHalf, stanceHalf, adv);

        // Asymmetric lift arch (peaks around w = 0.44 for crisp early toe clearance)
        const liftEnv = Math.sin(Math.pow(w, 0.85) * Math.PI);
        liftY = params.swingHeight * Math.pow(clamp(liftEnv, 0, 1), 1.15);

        // Relaxed dangling hoof during mid-swing, extending cleanly forward before heel-strike
        if (w < 0.65) {
          hoofPitch = lerp(-0.42, -0.52, Math.sin((w / 0.65) * Math.PI));
        } else {
          hoofPitch = lerp(-0.34, 0.16, smoothstep(0.65, 1.0, w));
        }
        loadFactor = 0;
      }

      // Slight lateral swing clearance so hooves track cleanly without clipping
      const lateralClear = inSwing ? spec.sideSign * 0.018 * Math.sin(swingFrac * Math.PI) : 0;
      const relX = spec.restHoofX + lateralClear;

      // Exact world terrain height under this hoof!
      const worldX = relX;
      const worldZ = walkZ + relZ;
      const gY = groundHeight(worldX, worldZ);
      const relY = gY - rootY + liftY;

      return {
        x: relX,
        y: relY,
        z: relZ,
        worldX,
        worldY: gY,
        worldZ,
        inSwing,
        swingFrac,
        loadFactor,
        hoofPitch,
      };
    }

    function solveAndApplyLeg(legKey, foot, cycles) {
      const spec = skel.legSpecs[legKey];
      const bIdx = spec.indices;
      const rootBone = bones[bIdx[0]];
      const parentBone = rootBone.parent;

      // Subtle natural scapula forward-back glide on forelegs (giraffes lack a collarbone!)
      if (spec.isFront) {
        const restLocal = restPos[bIdx[0]].clone().sub(restPos[idx.chest]);
        const strideGlideZ = clamp((foot.z - spec.restHoofZ) * 0.11, -0.055, 0.055);
        const swingLiftY = foot.inSwing ? 0.025 * Math.sin(foot.swingFrac * Math.PI) : 0;
        rootBone.position.set(restLocal.x, restLocal.y + swingLiftY, restLocal.z + strideGlideZ);
      }

      // Refresh parent chain to read exact animated root joint position in giraffe-local space
      giraffe.root.updateMatrixWorld(true);
      mParentInv.copy(giraffe.root.matrixWorld).invert();

      pRoot.setFromMatrixPosition(rootBone.matrixWorld).applyMatrix4(mParentInv);

      // Target hoof position in giraffe-local space
      pHoof.set(foot.x, foot.y, foot.z);

      // Compute fetlock target from hoof + pastern length with realistic weight-bearing dorsiflexion!
      const L_pastern = spec.segLengths[3];
      // Rest pastern leans back ~16° (0.28 rad); under 1000kg mid-stance load it yields to ~26°!
      let pasternBackAngle = 0.28 + foot.loadFactor * 0.18;
      if (foot.inSwing) {
        // Relaxed curled pastern during swing
        pasternBackAngle = lerp(0.28, -0.14, Math.sin(foot.swingFrac * Math.PI));
      }
      pFetlock.set(
        pHoof.x,
        pHoof.y + Math.cos(pasternBackAngle) * L_pastern,
        pHoof.z - Math.sin(pasternBackAngle) * L_pastern
      );

      // Segment lengths
      const L1 = spec.segLengths[0]; // humerus or femur
      const L2 = spec.segLengths[1]; // radius or tibia
      const L3 = spec.segLengths[2]; // cannon bone

      vToFet.subVectors(pFetlock, pRoot);
      const dTotal = vToFet.length();

      if (spec.isFront) {
        // FORELEG: Shoulder -> Elbow -> Carpus (bends +Z) -> Fetlock
        // During STANCE: tall stately columnar foreleg (minimal knee bend, humerus aligned cleanly over forearm!)
        // During SWING: humerus swings forward strongly & carpus folds cleanly ~50° to clear savanna grass!
        const legSwingAngle = Math.atan2(vToFet.z, Math.max(0.2, -vToFet.y));
        const swingBell = foot.inSwing ? Math.sin(foot.swingFrac * Math.PI) : 0;
        const baseBackBias = lerp(-0.12, 0.24, swingBell);
        let humerusAngle = legSwingAngle * 0.78 + baseBackBias;

        // Smoothly align humerus toward fetlock at full reach so knee NEVER pops
        const maxReach = L1 + L2 + L3;
        const reachRatio = clamp(dTotal / (maxReach * 0.994), 0, 1);
        const straighten = smoothstep(0.84, 0.99, reachRatio);
        humerusAngle = lerp(humerusAngle, legSwingAngle, straighten * 0.92);

        vUpperDir.set(
          (pFetlock.x - pRoot.x) * 0.16,
          -Math.cos(humerusAngle),
          Math.sin(humerusAngle)
        ).normalize();
        pUpper.copy(pRoot).addScaledVector(vUpperDir, L1);

        // Guarantee dist(elbow, fetlock) <= 0.995 * (L2 + L3)
        const dMid = pUpper.distanceTo(pFetlock);
        const maxMid = (L2 + L3) * 0.995;
        if (dMid > maxMid) {
          const blend = clamp((dMid - maxMid) / 0.18 + 0.15, 0, 0.94);
          vUpperDir.lerp(vToFet.clone().normalize(), blend).normalize();
          pUpper.copy(pRoot).addScaledVector(vUpperDir, L1);
        }

        // Exact 2-bone analytical IK for Elbow -> Carpus -> Fetlock (pole +Z forward!)
        solveTwoBoneIK(pUpper, pFetlock, L2, L3, vPoleFwd, pMid, null);
      } else {
        // HINDLEG: Hip -> Stifle -> Hock (bends -Z) -> Fetlock
        // Tall regal ungulate hind stance; deep hock flexion during swing!
        const legSwingAngle = Math.atan2(vToFet.z, Math.max(0.2, -vToFet.y));
        const swingBell = foot.inSwing ? Math.sin(foot.swingFrac * Math.PI) : 0;
        let femurAngle = 0.22 + legSwingAngle * 0.68 + swingBell * 0.30;

        const maxReach = L1 + L2 + L3;
        const reachRatio = clamp(dTotal / (maxReach * 0.994), 0, 1);
        const straighten = smoothstep(0.85, 0.99, reachRatio);
        femurAngle = lerp(femurAngle, legSwingAngle, straighten * 0.78);

        vUpperDir.set(
          (pFetlock.x - pRoot.x) * 0.16,
          -Math.cos(femurAngle),
          Math.sin(femurAngle)
        ).normalize();
        pUpper.copy(pRoot).addScaledVector(vUpperDir, L1);

        const dMid = pUpper.distanceTo(pFetlock);
        const maxMid = (L2 + L3) * 0.995;
        if (dMid > maxMid) {
          const blend = clamp((dMid - maxMid) / 0.18 + 0.15, 0, 0.94);
          vUpperDir.lerp(vToFet.clone().normalize(), blend).normalize();
          pUpper.copy(pRoot).addScaledVector(vUpperDir, L1);
        }

        // Exact 2-bone analytical IK for Stifle -> Hock -> Fetlock (pole -Z backward!)
        solveTwoBoneIK(pUpper, pFetlock, L2, L3, vPoleBack, pMid, null);
      }

      // Now orient the 4 segment bones [0->1, 1->2, 2->3, 3->4] in giraffe-local space!
      const solvedPts = [pRoot, pUpper, pMid, pFetlock, pHoof];
      // Get parent bone's orientation in giraffe-local space (root group has identity rotation)
      parentBone.getWorldQuaternion(qParentWorld);
      // Remove giraffe.root rotation if any
      giraffe.root.getWorldQuaternion(qLocal);
      qLocal.invert();
      qParentWorld.premultiply(qLocal);

      for (let s = 0; s < 4; s++) {
        vSegDir.subVectors(solvedPts[s + 1], solvedPts[s]);
        if (vSegDir.lengthSq() < 1e-8) vSegDir.copy(spec.segRestDirs[s]);
        else vSegDir.normalize();

        computeSegmentWorldQuat(spec.segRestDirs[s], vSegDir, vSide, qSegWorld);

        qParentInv.copy(qParentWorld).invert();
        qLocal.multiplyQuaternions(qParentInv, qSegWorld);
        bones[bIdx[s]].quaternion.copy(qLocal);

        qParentWorld.copy(qSegWorld);
      }

      // Orient hoof bone cleanly level with ground during stance, rolling smoothly during breakover/swing
      eScratch.set(foot.hoofPitch, 0, 0);
      qHoofPitch.setFromEuler(eScratch);
      qParentInv.copy(qParentWorld).invert();
      bones[bIdx[4]].quaternion.multiplyQuaternions(qParentInv, qHoofPitch);
    }

    function update(dt) {
      if (!state.paused) {
        const effDt = dt * state.speed;
        state.time += dt;
        state.cycles += effDt / params.cycleDuration;
      }

      const cycles = state.cycles;
      const phi = fract(cycles);
      const t = state.time;

      // World forward traversal (100% locked to stride length!)
      state.walkZ = cycles * params.strideLength;
      const rootGroundY = groundHeight(0, state.walkZ);
      giraffe.root.position.set(0, rootGroundY, state.walkZ);

      // -----------------------------------------------------------------------
      // 1. SPINE, PELVIS & WITHERS BIOMECHANICS (Weight shift + subtle bob + roll)
      // -----------------------------------------------------------------------
      const tau = Math.PI * 2;
      // 2x vertical bob: tall inverted-pendulum rise over straight vertical supporting foreleg!
      const bodyBobY = 0.022 + Math.cos((phi - 0.14) * tau * 2) * 0.032;
      // 1x lateral weight shift over the grounded lateral pair!
      // Right pair supports around phi ~ 0.90 (-X); Left pair supports around phi ~ 0.40 (+X)
      const lateralSwayX = Math.sin((phi - 0.15) * tau) * 0.042;
      // Subtle forward-back surge (2x stride)
      const surgeZ = Math.sin((phi - 0.08) * tau * 2) * 0.016;

      const pelvisRest = restPos[idx.pelvis];
      bones[idx.pelvis].position.set(
        pelvisRest.x + lateralSwayX,
        pelvisRest.y + bodyBobY,
        pelvisRest.z + surgeZ
      );

      // Pelvic roll (hip drops slightly on swinging hind leg side) + yaw (hip advances with swing leg)
      const pelvisPitch = Math.sin((phi - 0.12) * tau * 2) * 0.028;
      const pelvisRoll = Math.sin((phi - 0.15) * tau) * 0.048;
      const pelvisYaw = Math.cos((phi - 0.02) * tau) * 0.044;
      bones[idx.pelvis].rotation.set(pelvisPitch, pelvisYaw, pelvisRoll);

      // Mid-spine counter-flexion (keeps ribcage smooth while pelvis swings!)
      const spineYaw = -pelvisYaw * 0.65;
      const spineRoll = -pelvisRoll * 0.45;
      const spinePitch = -pelvisPitch * 0.45;
      bones[idx.spineMid].rotation.set(spinePitch, spineYaw, spineRoll);

      // Chest / Withers subtle counter-rotation + calm ribcage breathing (~0.26 Hz)
      const breath = Math.sin(t * 1.65) * 0.012;
      const chestYaw = Math.cos((phi + 0.10) * tau) * 0.032;
      const chestRoll = -pelvisRoll * 0.35;
      const chestPitch = Math.sin((phi - 0.25) * tau * 2) * 0.022 + breath * 0.4;
      bones[idx.chest].rotation.set(chestPitch, chestYaw, chestRoll);
      // Subtle ribcage lateral breathing expansion
      bones[idx.chest].scale.set(1.0 + breath * 0.85, 1.0 + breath * 0.35, 1.0);

      // -----------------------------------------------------------------------
      // 2. ICONIC GIRAFFE NECK COUNTER-BALANCE PENDULUM & HEAD STABILIZATION
      // -----------------------------------------------------------------------
      // 2x stride nod: neck swings smoothly forward/down as each foreleg swings forward,
      // and draws gracefully up/back as the foreleg plants!
      const neckBones = [idx.neck0, idx.neck1, idx.neck2, idx.neck3, idx.neck4, idx.neck5];
      // Base weights distribute most pendulum pitch at lower cervical vertebrae (like real giraffes!)
      const pitchDist = [0.29, 0.23, 0.17, 0.13, 0.10, 0.08];
      const swayDist  = [0.22, 0.20, 0.18, 0.16, 0.13, 0.11];

      // Gentle slow natural curiosity look-around (head + upper neck turn calmly left/right)
      const lookYaw = Math.sin(t * 0.27) * 0.12 + Math.sin(t * 0.11 + 1.3) * 0.08;
      const lookPitch = Math.sin(t * 0.19 + 0.7) * 0.035;

      let totalNeckPitch = pelvisPitch + spinePitch + chestPitch;
      let totalNeckRoll = pelvisRoll + spineRoll + chestRoll;
      let totalNeckYaw = pelvisYaw + spineYaw + chestYaw;

      for (let k = 0; k < neckBones.length; k++) {
        // Traveling wave phase lag up the 7 cervical vertebrae (~0.045 cycle lag from base to top)
        const lag = k * 0.022;
        const nodWave = Math.sin((phi - 0.82 - lag) * tau * 2);
        const swayWave = Math.sin((phi - 0.18 - lag * 0.8) * tau);

        const segPitch = nodWave * 0.21 * pitchDist[k] + lookPitch * (k >= 2 ? 0.16 : 0.06);
        const segRoll = swayWave * 0.075 * swayDist[k];
        const segYaw = lookYaw * (k >= 2 ? 0.14 : 0.04) - swayWave * 0.025 * swayDist[k];

        bones[neckBones[k]].rotation.set(segPitch, segYaw, segRoll);
        totalNeckPitch += segPitch;
        totalNeckRoll += segRoll;
        totalNeckYaw += segYaw;
      }

      // HEAD STABILIZATION (vestibulo-ocular reflex!):
      // Counter-rotates ~86% of cumulative neck pitch so the giraffe's gaze stays poised and level!
      const headPitch = -totalNeckPitch * 0.86 + Math.sin((phi - 0.90) * tau * 2) * 0.018 + lookPitch * 0.25;
      const headRoll = -totalNeckRoll * 0.72;
      const headYaw = lookYaw * 0.42 - totalNeckYaw * 0.30;
      bones[idx.head].rotation.set(headPitch, headYaw, headRoll);

      // -----------------------------------------------------------------------
      // 3. HEAD LIFE DETAILS: NATURAL BLINKING & INDEPENDENT EAR FLICKS
      // -----------------------------------------------------------------------
      const ha = giraffe.headAnim;
      if (ha) {
        // Periodic natural eye blink every ~4.2 seconds (crisp 0.19s blink)
        const blinkCycle = fract(t * 0.235 + 0.31);
        let blinkAmount = 0;
        if (blinkCycle > 0.955) {
          const b = (blinkCycle - 0.955) / 0.045; // 0..1
          blinkAmount = Math.sin(b * Math.PI);
          blinkAmount = Math.pow(blinkAmount, 0.65);
        }
        if (ha.eyelidUpperL) {
          ha.eyelidUpperL.rotation.x = lerp(
            ha.eyelidUpperL.userData.openRotX,
            ha.eyelidUpperL.userData.closedRotX,
            blinkAmount
          );
        }
        if (ha.eyelidUpperR) {
          ha.eyelidUpperR.rotation.x = lerp(
            ha.eyelidUpperR.userData.openRotX,
            ha.eyelidUpperR.userData.closedRotX,
            blinkAmount
          );
        }

        // Independent organic ear swivels & occasional crisp fly-flicks
        const earFlickL = Math.pow(Math.max(0, Math.sin(t * 0.85) * Math.sin(t * 3.7)), 6) * 0.34;
        const earFlickR = Math.pow(Math.max(0, Math.sin(t * 0.71 + 2.1) * Math.sin(t * 4.1)), 6) * 0.34;
        if (ha.earL) {
          const base = ha.earL.userData.baseRot;
          ha.earL.rotation.set(
            base.x + Math.sin(t * 1.1) * 0.05 + earFlickL * 0.4,
            base.y + Math.sin(t * 0.55) * 0.12 - earFlickL,
            base.z + Math.cos(t * 0.9) * 0.04 + earFlickL * 0.35
          );
        }
        if (ha.earR) {
          const base = ha.earR.userData.baseRot;
          ha.earR.rotation.set(
            base.x + Math.sin(t * 1.05 + 1.4) * 0.05 + earFlickR * 0.4,
            base.y + Math.sin(t * 0.62 + 0.8) * 0.12 + earFlickR,
            base.z + Math.cos(t * 0.85 + 0.5) * 0.04 - earFlickR * 0.35
          );
        }

        // Subtle living nostril breathing flare synced to ribcage respiration!
        const nosFlare = 1.0 + 0.14 * Math.max(0, breath);
        if (ha.nostrilL) ha.nostrilL.scale.set(nosFlare, nosFlare, 1.0 + 0.06 * Math.max(0, breath));
        if (ha.nostrilR) ha.nostrilR.scale.set(nosFlare, nosFlare, 1.0 + 0.06 * Math.max(0, breath));
      }

      // -----------------------------------------------------------------------
      // 4. TAIL PENDULUM SWAY + OCCASIONAL FLY SWISH
      // -----------------------------------------------------------------------
      const tailBones = [idx.tail0, idx.tail1, idx.tail2, idx.tail3, idx.tail4];
      const swishBurst = Math.pow(Math.max(0, Math.sin(t * 0.42 + 0.6)), 8);
      for (let k = 0; k < tailBones.length; k++) {
        const lag = k * 0.08;
        const walkSway = Math.sin((phi - 0.10 - lag) * tau) * (0.065 + k * 0.025);
        const flySwish = swishBurst * Math.sin(t * 7.5 - k * 0.55) * (0.14 + k * 0.05);
        const walkSwingBack = Math.sin((phi - lag) * tau * 2) * (0.04 + k * 0.015);
        bones[tailBones[k]].rotation.set(
          walkSwingBack - 0.03 * k,
          0,
          walkSway + flySwish
        );
      }

      // -----------------------------------------------------------------------
      // 5. SOLVE ALL FOUR LEGS WITH EXACT GROUND-LOCKED IK
      // -----------------------------------------------------------------------
      const legKeys = ['fl', 'fr', 'hl', 'hr'];
      for (let i = 0; i < legKeys.length; i++) {
        const lk = legKeys[i];
        const foot = evalFootTarget(lk, cycles, state.walkZ, rootGroundY);
        solveAndApplyLeg(lk, foot, cycles);

        state.hoofWorldPositions[lk].set(foot.worldX, foot.worldY, foot.worldZ);
        state.legInSwing[lk] = foot.inSwing;

        // Trigger subtle savanna hoof dust puff right at heel-strike (swing -> stance transition)!
        if (!state.paused && state.prevInSwing[lk] && !foot.inSwing && state.onFootStrike) {
          vWorldFoot.set(foot.worldX, foot.worldY + 0.02, foot.worldZ);
          state.onFootStrike(vWorldFoot);
        }
        state.prevInSwing[lk] = foot.inSwing;
      }

      giraffe.root.updateMatrixWorld(true);
    }

    function setPhase(phaseValue) {
      state.cycles = phaseValue;
      state.time = phaseValue * params.cycleDuration;
      update(0);
    }

    return {
      params,
      state,
      update,
      setPhase,
    };
  }

  App.Gait = {
    createGaitController,
  };
})(window);
