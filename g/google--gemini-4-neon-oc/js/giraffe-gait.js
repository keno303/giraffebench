// Biomechanically Accurate Giraffe Ipsilateral Pacing Gait & Analytical Leg IK Solver
(function (global) {
  'use strict';

  const GiraffeGait = {};

  /**
   * Aligns a bone in world space so that its rest direction `restDir` maps to `targetDir`,
   * keeping the lateral axis (`+X` / sagittal plane) twist-free!
   */
  const _rotAxis = new THREE.Vector3();
  const _restSide = new THREE.Vector3();
  const _targSide = new THREE.Vector3();
  const _mRest = new THREE.Matrix4();
  const _mTarg = new THREE.Matrix4();
  const _qRest = new THREE.Quaternion();
  const _qTarg = new THREE.Quaternion();
  const _invParentQ = new THREE.Quaternion();
  const _upRef = new THREE.Vector3();

  function buildBasisFromDirAndSide(dir, sideHint, outMat) {
    // Primary axis = Y = dir (unit)
    // Secondary axis = X = orthogonalized sideHint
    // Tertiary axis = Z = X x Y
    const y = dir.clone().normalize();
    const x = sideHint.clone().addScaledVector(y, -sideHint.dot(y));
    if (x.lengthSq() < 1e-6) {
      x.set(1, 0, 0);
    } else {
      x.normalize();
    }
    const z = new THREE.Vector3().crossVectors(x, y).normalize();
    outMat.makeBasis(x, y, z);
  }

  function setBoneWorldDirection(bone, parentWorldQuat, restDir, targetDir, sideHint, outWorldQuat) {
    const restSide = new THREE.Vector3(1, 0, 0);
    buildBasisFromDirAndSide(restDir, restSide, _mRest);
    buildBasisFromDirAndSide(targetDir, sideHint, _mTarg);
    _qRest.setFromRotationMatrix(_mRest);
    _qTarg.setFromRotationMatrix(_mTarg);

    // worldQ maps rest frame -> target frame: worldQ = qTarg * inverse(qRest)
    outWorldQuat.copy(_qTarg).multiply(_qRest.invert());

    // Convert world rotation to local bone quaternion
    _invParentQ.copy(parentWorldQuat).invert();
    bone.quaternion.copy(_invParentQ).multiply(outWorldQuat);
  }

  /**
   * Creates the giraffe gait & procedural animation controller.
   */
  GiraffeGait.createController = function (giraffe) {
    const rig = giraffe.rig;
    const M = GiraffeMath;

    // Ipsilateral pacing gait configuration:
    // Right Hind (0.00) & Right Front (0.11) swing together;
    // Left Hind (0.50) & Left Front (0.61) swing together!
    const LEG_CONFIG = {
      RH: { offset: 0.00, sweep: 1.14, lift: 0.21, duty: 0.63 },
      RF: { offset: 0.11, sweep: 1.18, lift: 0.24, duty: 0.63 },
      LH: { offset: 0.50, sweep: 1.14, lift: 0.21, duty: 0.63 },
      LF: { offset: 0.61, sweep: 1.18, lift: 0.24, duty: 0.63 },
    };

    const CYCLE_DURATION = 1.82; // seconds per full pacing stride at 1.0x speed
    // Exact zero-slip ground speed: (avgSweep / duty) / CYCLE_DURATION
    const AVG_SWEEP = 1.16;
    const BASE_DUTY = 0.63;
    const BASE_WALK_SPEED = (AVG_SWEEP / BASE_DUTY) / CYCLE_DURATION; // ~1.01 m/s

    const state = {
      phase: 0.18,          // Start in a dynamic, photogenic mid-stride pose!
      time: 0,
      speed: 1.0,           // 0 = idle standing, 1 = natural savannah walk
      paused: false,
      walkBlend: 1.0,
      groundDistance: 0,    // Cumulative meters walked (syncs ground texture & foliage!)

      // Blink state
      nextBlinkTime: 2.2,
      blinkProgress: -1,

      // Occasional tail fly-swish
      nextSwishTime: 5.5,
      swishProgress: -1,

      // Track foot stance state for hoof-impact dust puffs
      wasStance: { LF: true, RF: true, LH: true, RH: true },
      onHoofStep: null, // optional callback(worldPos, isLiftoff)
    };

    // Reusable scratch vectors/quaternions (zero per-frame GC churn!)
    const vTop = new THREE.Vector3();
    const vUpper = new THREE.Vector3();
    const vMid = new THREE.Vector3();
    const vFetlock = new THREE.Vector3();
    const vCoronet = new THREE.Vector3();
    const vHoof = new THREE.Vector3();
    const vDir = new THREE.Vector3();
    const vBend = new THREE.Vector3();
    const vSide = new THREE.Vector3(1, 0, 0);

    const qParent = new THREE.Quaternion();
    const qTop = new THREE.Quaternion();
    const qUpper = new THREE.Quaternion();
    const qMid = new THREE.Quaternion();
    const qFetlock = new THREE.Quaternion();
    const qHoof = new THREE.Quaternion();
    const qTmp = new THREE.Quaternion();

    /**
     * Evaluates a single leg's foot target and solves its 4-segment anatomical IK.
     */
    function solveLeg(key, phase, walkAmt, bodyRoll, bodyYaw) {
      const leg = rig.legs[key];
      const cfg = LEG_CONFIG[key];
      const j = leg.joints;
      const L = leg.lengths;

      // Local leg cycle u in [0, 1): [0, duty) = stance, [duty, 1) = swing
      const u = ((phase - cfg.offset) % 1 + 1) % 1;
      const inStance = u < cfg.duty;

      // Fire hoof impact / toe-off dust callback on transitions
      if (state.onHoofStep && walkAmt > 0.25) {
        if (inStance && !state.wasStance[key]) {
          state.onHoofStep(new THREE.Vector3(j.hoof.x, 0.02, j.hoof.z + cfg.sweep * 0.5), false);
        } else if (!inStance && state.wasStance[key]) {
          state.onHoofStep(new THREE.Vector3(j.hoof.x, 0.02, j.hoof.z - cfg.sweep * 0.5), true);
        }
      }
      state.wasStance[key] = inStance;

      const halfSweep = cfg.sweep * 0.5 * walkAmt;
      let hoofZ = j.hoof.z;
      let hoofY = 0.0;
      let hoofX = j.hoof.x;
      let hoofPitch = 0.0;      // + tilts toe down, - tilts toe up
      let pasternFlex = 0.0;    // + curls pastern backward (swing), - dorsiflexes under stance load

      if (walkAmt < 0.001) {
        // Gentle idle weight-shift standing
        hoofZ = j.hoof.z;
        hoofY = 0.0;
      } else if (inStance) {
        const s = u / cfg.duty; // 0 = heel-strike (front), 1 = toe-off (back)
        // Exact constant backward speed matching ground velocity -> ZERO SLIP!
        hoofZ = j.hoof.z + halfSweep * (1.0 - 2.0 * s);
        hoofY = 0.0;

        // Subtle heel-strike contact roll & toe-off push-off pitch
        if (s < 0.09) {
          const t0 = 1.0 - s / 0.09;
          hoofPitch = -0.14 * t0 * t0 * walkAmt; // toe slightly up at touchdown
        } else if (s > 0.85) {
          const t1 = (s - 0.85) / 0.15;
          hoofPitch = 0.42 * t1 * t1 * walkAmt;  // push off through toe!
          hoofY = 0.025 * t1 * t1 * walkAmt;     // heel begins rising slightly
        }

        // Authentic ungulate fetlock spring-load compression during mid-stance!
        const loadBell = Math.sin(s * Math.PI);
        pasternFlex = -0.22 * loadBell * walkAmt;
      } else {
        // SWING PHASE: w in [0, 1]
        const w = (u - cfg.duty) / (1.0 - cfg.duty);

        // Smooth C1 forward swing curve with gentle natural forward protraction & touch-down deceleration
        const smoothW = w * w * (3.0 - 2.0 * w);
        const reachOvershoot = Math.sin(w * Math.PI) * Math.sin(w * Math.PI * 0.5) * 0.04 * walkAmt;
        hoofZ = j.hoof.z - halfSweep + (2.0 * halfSweep) * smoothW + reachOvershoot;

        // Graceful asymmetric swing arc (lifts cleanly after toe-off, descends softly to heel-strike)
        const arc = Math.pow(Math.sin(Math.PI * Math.pow(w, 0.88)), 1.25);
        hoofY = cfg.lift * arc * walkAmt;

        // Slight inward tracking during mid-swing (giraffes track hooves close to centerline!)
        hoofX = j.hoof.x - leg.side * 0.025 * Math.sin(Math.PI * w) * walkAmt;

        // Graceful palmar hoof & pastern curl during swing lift, extending cleanly before landing
        const curlWave = Math.sin(Math.PI * Math.pow(w, 0.72));
        hoofPitch = (0.58 * curlWave - 0.18 * Math.pow(w, 2.5)) * walkAmt;
        pasternFlex = (0.52 * curlWave - 0.14 * Math.pow(w, 2.2)) * walkAmt;
      }

      // 1. World position of hoof sole target
      vHoof.set(hoofX, hoofY, hoofZ);

      // 2. Compute coronet world pos above hoof sole
      // In rest pose, coronet - hoof = (0, +0.11, -0.03)
      const sinHP = Math.sin(hoofPitch);
      const cosHP = Math.cos(hoofPitch);
      const corOffY = 0.11 * cosHP - (-0.03) * sinHP;
      const corOffZ = 0.11 * sinHP + (-0.03) * cosHP;
      vCoronet.set(hoofX, hoofY + corOffY, hoofZ + corOffZ);

      // 3. Compute fetlock world pos above coronet along sloped pastern!
      // Rest pastern goes from coronet UP-and-BACK to fetlock: (0, +0.17, -0.09)
      const restPasternAngle = Math.atan2(-0.09, 0.17); // ~ -0.487 rad (sloped back)
      const curPasternAngle = restPasternAngle + pasternFlex;
      vFetlock.set(
        hoofX,
        vCoronet.y + L.pastern * Math.cos(curPasternAngle),
        vCoronet.z + L.pastern * Math.sin(curPasternAngle)
      );

      // 4. Read exact current world position & orientation of the leg's parent bone (chest or pelvis)
      leg.parentBone.updateWorldMatrix(true, false);
      leg.bones.top.updateWorldMatrix(true, false);
      vTop.setFromMatrixPosition(leg.bones.top.matrixWorld);
      leg.parentBone.getWorldQuaternion(qParent);

      // Sagittal lateral vector rotated by current torso roll/yaw
      vSide.set(1, 0, 0).applyQuaternion(qParent).normalize();

      // 5. Place upper joint (elbow for front leg, stifle for hind leg)
      //    using biomechanically coupled humerus/femur swing!
      const zRel = (vFetlock.z - vTop.z);
      const restUpperDir = leg.restDirs.upper;

      if (leg.isFront) {
        // Humerus swings smoothly with forward/backward foot protraction + lifts slightly on mid-swing
        const restAngle = Math.atan2(restUpperDir.z, -restUpperDir.y); // negative (elbow behind shoulder)
        const swingLift = (!inStance) ? Math.sin(Math.PI * ((u - cfg.duty) / (1 - cfg.duty))) : 0;
        const humAngle = restAngle + M.clamp(zRel * 0.62, -0.48, 0.56) + 0.16 * swingLift * walkAmt;

        vUpper.set(
          vTop.x + (j.upper.x - j.top.x),
          vTop.y - L.upper * Math.cos(humAngle),
          vTop.z + L.upper * Math.sin(humAngle)
        );

        // 6. Analytical 2-Bone IK from Elbow -> Carpus -> Fetlock!
        //    Front carpus bends FORWARD (+Z)!
        vBend.set(0, 0.08, 1.0).normalize();
        M.solveTwoBoneIK(vUpper, vFetlock, L.mid, L.cannon, vBend, vMid, vFetlock);
      } else {
        // Hind Femur swings forward on protraction & backward on push-off!
        const restAngle = Math.atan2(restUpperDir.z, -restUpperDir.y); // positive (stifle in front of hip)
        const swingLift = (!inStance) ? Math.sin(Math.PI * ((u - cfg.duty) / (1 - cfg.duty))) : 0;
        const femAngle = restAngle + M.clamp(zRel * 0.52, -0.44, 0.52) + 0.22 * swingLift * walkAmt;

        vUpper.set(
          vTop.x + (j.upper.x - j.top.x),
          vTop.y - L.upper * Math.cos(femAngle),
          vTop.z + L.upper * Math.sin(femAngle)
        );

        // 6. Analytical 2-Bone IK from Stifle -> Hock -> Fetlock!
        //    Hind hock points BACKWARD (-Z)!
        vBend.set(0, 0.08, -1.0).normalize();
        M.solveTwoBoneIK(vUpper, vFetlock, L.mid, L.cannon, vBend, vMid, vFetlock);
      }

      // 7. Convert solved joint chain (vTop -> vUpper -> vMid -> vFetlock -> vCoronet) into exact bone quaternions!
      // Bone 1: top (shoulder/hip) points from vTop -> vUpper
      vDir.subVectors(vUpper, vTop).normalize();
      setBoneWorldDirection(leg.bones.top, qParent, leg.restDirs.upper, vDir, vSide, qTop);

      // Bone 2: upper (elbow/stifle) points from vUpper -> vMid
      vDir.subVectors(vMid, vUpper).normalize();
      setBoneWorldDirection(leg.bones.upper, qTop, leg.restDirs.mid, vDir, vSide, qUpper);

      // Bone 3: mid (carpus/hock) points from vMid -> vFetlock
      vDir.subVectors(vFetlock, vMid).normalize();
      setBoneWorldDirection(leg.bones.mid, qUpper, leg.restDirs.cannon, vDir, vSide, qMid);

      // Bone 4: fetlock points from vFetlock -> vCoronet
      vDir.subVectors(vCoronet, vFetlock).normalize();
      setBoneWorldDirection(leg.bones.fetlock, qMid, leg.restDirs.pastern, vDir, vSide, qFetlock);

      // Bone 5: hoof aligns world pitch cleanly to hoofPitch (keeping sole flush with ground on stance!)
      qHoof.setFromAxisAngle(vSide, hoofPitch);
      qTmp.copy(qFetlock).invert().multiply(qHoof);
      leg.bones.hoof.quaternion.copy(qTmp);
    }

    /**
     * Advances animation by dt seconds (or evaluates exact frozen phase if dt === 0).
     */
    function update(dt) {
      const effectiveSpeed = state.paused ? 0 : state.speed;
      // Smoothly transition walkBlend toward 0 when speed == 0, or 1 when walking
      const targetBlend = state.speed > 0.02 ? Math.min(1.0, state.speed / 0.25) : 0.0;
      if (dt > 0) {
        state.walkBlend = M.lerp(state.walkBlend, targetBlend, Math.min(1, dt * 4.5));
      } else {
        state.walkBlend = targetBlend;
      }

      const walkAmt = state.walkBlend;

      if (!state.paused && dt > 0) {
        state.time += dt;
        const dPhase = (dt / CYCLE_DURATION) * state.speed;
        state.phase = (state.phase + dPhase) % 1.0;
        // Exact ground travel synced to stance hoof velocity!
        state.groundDistance += BASE_WALK_SPEED * state.speed * walkAmt * dt;
      }

      const phi = state.phase;
      const tau = Math.PI * 2;
      const t = state.time;

      // --- 1. TORSO / PELVIS / SPINE / CHEST MOTION ---
      // Inverted pendulum bob (2x frequency): keeps all 4 legs comfortably inside IK reach with 100% flush ground contact!
      const bobPhase = (phi - 0.06) * 2 * tau;
      const pelvisBob = (-0.052 + 0.032 * (-Math.cos(bobPhase))) * walkAmt;

      // Lateral center-of-mass weight shift over the currently planted stance pair!
      // At phi ~ 0.35: Right legs (-X) planted, Left legs (+X) swinging -> shift weight gently toward -X (right)!
      // At phi ~ 0.85: Left legs (+X) planted, Right legs (-X) swinging -> shift weight gently toward +X (left)!
      const weightPhase = (phi - 0.10) * tau;
      const lateralShift = -0.055 * Math.sin(weightPhase) * walkAmt;

      // Subtle torso pitch (back rocks gently as hind vs front push off)
      const pelvisPitch = 0.026 * Math.sin(bobPhase - 0.5) * walkAmt;
      // Subtle torso roll (tilts slightly toward stance side)
      const pelvisRoll = 0.036 * Math.sin(weightPhase) * walkAmt;
      // Subtle pelvic yaw as swinging hind leg reaches forward
      const pelvisYaw = 0.045 * Math.cos(weightPhase) * walkAmt;

      // Gentle breathing motion (always alive even when standing!)
      const breath = Math.sin(t * 1.35);

      const bPelvis = rig.byName.pelvis;
      const bSpine  = rig.byName.spine;
      const bChest  = rig.byName.chest;

      bPelvis.position.set(
        rig.rest.pelvis.x + lateralShift,
        rig.rest.pelvis.y + pelvisBob + 0.005 * breath,
        rig.rest.pelvis.z
      );
      bPelvis.rotation.set(pelvisPitch, pelvisYaw, pelvisRoll);

      // Mid-spine flexes subtly to transmit pacing rhythm smoothly
      bSpine.rotation.set(
        -0.015 * Math.sin(bobPhase) * walkAmt + 0.006 * breath,
        -0.025 * Math.cos(weightPhase) * walkAmt,
        -0.018 * Math.sin(weightPhase) * walkAmt
      );

      // Chest counter-yaws slightly with front shoulder protraction
      bChest.rotation.set(
        0.022 * Math.sin(bobPhase + 0.35) * walkAmt + 0.008 * breath,
        0.038 * Math.cos(weightPhase - 0.55) * walkAmt,
        -0.014 * Math.sin(weightPhase) * walkAmt
      );

      // --- 2. ICONIC GIRAFFE NECK COUNTERBALANCING NOD & SWAY ---
      // Twice per stride cycle, the long graceful neck pumps forward & back with progressive organic wave lag!
      const neckBones = [
        rig.byName.neck0,
        rig.byName.neck1,
        rig.byName.neck2,
        rig.byName.neck3,
        rig.byName.neck4,
      ];
      // Distribution weights along neck segments
      const pitchAmps = [0.058, 0.044, 0.032, 0.022, 0.014];
      const swayAmps  = [0.022, 0.018, 0.014, 0.010, 0.006];

      let totalNeckPitch = 0;
      let totalNeckRoll = 0;
      let totalNeckYaw = 0;

      // Subtle living idle sway even when paused/standing
      const idleNeckPitch = 0.012 * Math.sin(t * 0.55) + 0.005 * breath;
      const idleNeckYaw   = 0.025 * Math.sin(t * 0.37 + 0.8);

      for (let i = 0; i < neckBones.length; i++) {
        const lag = i * 0.24; // graceful traveling wave up the neck!
        const pWalk = pitchAmps[i] * Math.sin(bobPhase - 0.65 - lag) * walkAmt;
        const pIdle = idleNeckPitch * (0.28 - i * 0.03);
        const pitch = pWalk + pIdle;

        // Lateral neck counterbalance leans subtly toward the planted stance side!
        const roll = swayAmps[i] * Math.sin(weightPhase - 0.25 - lag * 0.4) * walkAmt;
        const yaw  = (0.012 * Math.cos(weightPhase - lag * 0.3) * walkAmt) + idleNeckYaw * 0.22;

        neckBones[i].rotation.set(pitch, yaw, roll);
        totalNeckPitch += pitch;
        totalNeckRoll += roll;
        totalNeckYaw += yaw;
      }

      // --- 3. HEAD VESTIBULO-OCULAR STABILIZATION & ALERT GAZE ---
      const bHead = rig.byName.head;
      const alertLookYaw = 0.065 * Math.sin(t * 0.31) + 0.035 * Math.sin(t * 0.73 + 1.2);
      const alertLookPitch = 0.022 * Math.sin(t * 0.47 + 0.4);
      // Counter-rotate ~72% of cumulative neck pitch/roll so head glides smoothly & steadily!
      bHead.rotation.set(
        -totalNeckPitch * 0.72 + alertLookPitch,
        -totalNeckYaw * 0.35 + alertLookYaw,
        -totalNeckRoll * 0.65
      );

      // --- 4. INDEPENDENT EAR TWITCHING ---
      const earL = rig.byName.earL;
      const earR = rig.byName.earR;
      const twitchL = Math.pow(Math.max(0, Math.sin(t * 1.9 + 0.4) * Math.sin(t * 0.43)), 5) * 0.26;
      const twitchR = Math.pow(Math.max(0, Math.sin(t * 2.1 + 2.7) * Math.sin(t * 0.37 + 1.1)), 5) * 0.26;
      earL.rotation.set(0.05 * Math.sin(t * 0.8), 0.10 * Math.sin(t * 0.52) + twitchL, 0.06 * Math.sin(bobPhase) * walkAmt);
      earR.rotation.set(0.05 * Math.cos(t * 0.75), -0.10 * Math.sin(t * 0.48 + 1.4) - twitchR, -0.06 * Math.sin(bobPhase) * walkAmt);

      // --- 5. NATURAL EYE BLINKING ---
      if (!state.paused && dt > 0) {
        if (state.blinkProgress < 0 && t >= state.nextBlinkTime) {
          state.blinkProgress = 0;
        }
        if (state.blinkProgress >= 0) {
          state.blinkProgress += dt / 0.26; // crisp 260ms natural blink
          if (state.blinkProgress >= 1.0) {
            state.blinkProgress = -1;
            state.nextBlinkTime = t + 3.2 + ((Math.sin(t * 12.9898) * 0.5 + 0.5) * 3.8);
          }
        }
      }
      const blinkAmt = state.blinkProgress >= 0
        ? Math.sin(Math.min(1, state.blinkProgress) * Math.PI)
        : 0;
      const upperClosedAngle = 0.04;
      const upperOpenAngle = -0.56;
      const lowerClosedAngle = 0.16;
      const lowerOpenAngle = 0.42;
      if (giraffe.eyelids.upperL) {
        const uAng = M.lerp(upperOpenAngle, upperClosedAngle, blinkAmt);
        const lAng = M.lerp(lowerOpenAngle, lowerClosedAngle, blinkAmt);
        giraffe.eyelids.upperL.rotation.x = uAng;
        giraffe.eyelids.upperR.rotation.x = uAng;
        giraffe.eyelids.lowerL.rotation.x = lAng;
        giraffe.eyelids.lowerR.rotation.x = lAng;
      }

      // --- 6. TAIL PENDULUM SWAY & OCCASIONAL FLY SWISH ---
      if (!state.paused && dt > 0) {
        if (state.swishProgress < 0 && t >= state.nextSwishTime) {
          state.swishProgress = 0;
        }
        if (state.swishProgress >= 0) {
          state.swishProgress += dt / 1.15;
          if (state.swishProgress >= 1.0) {
            state.swishProgress = -1;
            state.nextSwishTime = t + 5.0 + ((Math.sin(t * 7.13) * 0.5 + 0.5) * 6.0);
          }
        }
      }
      const swishWave = state.swishProgress >= 0
        ? Math.sin(state.swishProgress * Math.PI * 3.0) * Math.sin(state.swishProgress * Math.PI) * 0.42
        : 0;

      const tailBones = [rig.byName.tail0, rig.byName.tail1, rig.byName.tail2, rig.byName.tail3];
      for (let i = 0; i < tailBones.length; i++) {
        const tLag = i * 0.48;
        const sideSway = (0.11 * Math.sin(weightPhase - 0.9 - tLag) * walkAmt
          + 0.045 * Math.sin(t * 1.4 - tLag)
          + swishWave * (0.45 + i * 0.25));
        const backSwing = (0.045 * Math.sin(bobPhase - 0.7 - tLag) * walkAmt) + Math.abs(swishWave) * 0.15;
        tailBones[i].rotation.set(backSwing, 0, sideSway);
      }

      // Update world matrices of torso before solving legs!
      rig.rootGroup.updateMatrixWorld(true);

      // --- 7. SOLVE ALL 4 ARTICULATED LEGS WITH ZERO-SLIP ANALYTICAL IK ---
      solveLeg('LF', phi, walkAmt, pelvisRoll, pelvisYaw);
      solveLeg('RF', phi, walkAmt, pelvisRoll, pelvisYaw);
      solveLeg('LH', phi, walkAmt, pelvisRoll, pelvisYaw);
      solveLeg('RH', phi, walkAmt, pelvisRoll, pelvisYaw);

      rig.rootGroup.updateMatrixWorld(true);
    }

    return {
      state,
      update,
      BASE_WALK_SPEED,
      CYCLE_DURATION,
      setPhase: function (p) {
        state.phase = ((p % 1) + 1) % 1;
        update(0);
      },
    };
  };

  global.GiraffeGait = GiraffeGait;
})(window);
