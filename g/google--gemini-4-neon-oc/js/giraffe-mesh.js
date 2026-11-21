// High-Resolution Procedural Anatomical Giraffe SkinnedMesh & Detail Sculptor
(function (global) {
  'use strict';

  const GiraffeMesh = {};

  /**
   * Helper to build an indexed BufferGeometry from a grid of rings
   * rings[r][c] = { pos: Vector3, restPos: Vector3, coatMeta: Vector4, skinIndices: [4], skinWeights: [4] }
   * capStart / capEnd: optional center vertex objects to close ends cleanly.
   */
  function buildLoftedSkinnedGeometry(rings, radialSegs, capStart, capEnd) {
    const numRings = rings.length;
    const stride = radialSegs + 1; // duplicate seam column for clean normals/UVs if needed
    const positions = [];
    const restPositions = [];
    const coatMetas = [];
    const uvs = [];
    const skinIndices = [];
    const skinWeights = [];
    const indices = [];

    function pushVert(v, u, vv) {
      positions.push(v.pos.x, v.pos.y, v.pos.z);
      restPositions.push(v.restPos.x, v.restPos.y, v.restPos.z);
      coatMetas.push(v.coatMeta.x, v.coatMeta.y, v.coatMeta.z, v.coatMeta.w);
      uvs.push(u, vv);
      skinIndices.push(v.si[0], v.si[1], v.si[2], v.si[3]);
      skinWeights.push(v.sw[0], v.sw[1], v.sw[2], v.sw[3]);
    }

    for (let r = 0; r < numRings; r++) {
      const ring = rings[r];
      const vv = r / (numRings - 1);
      for (let c = 0; c <= radialSegs; c++) {
        const v = ring[c % radialSegs];
        pushVert(v, c / radialSegs, vv);
      }
    }

    for (let r = 0; r < numRings - 1; r++) {
      for (let c = 0; c < radialSegs; c++) {
        const a = r * stride + c;
        const b = a + 1;
        const d = (r + 1) * stride + c;
        const e = d + 1;
        indices.push(a, d, b);
        indices.push(b, d, e);
      }
    }

    if (capStart) {
      const centerIdx = positions.length / 3;
      pushVert(capStart, 0.5, 0.0);
      for (let c = 0; c < radialSegs; c++) {
        indices.push(centerIdx, c, c + 1);
      }
    }

    if (capEnd) {
      const centerIdx = positions.length / 3;
      pushVert(capEnd, 0.5, 1.0);
      const base = (numRings - 1) * stride;
      for (let c = 0; c < radialSegs; c++) {
        indices.push(centerIdx, base + c + 1, base + c);
      }
    }

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geom.setAttribute('aRestPos', new THREE.Float32BufferAttribute(restPositions, 3));
    geom.setAttribute('aCoatMeta', new THREE.Float32BufferAttribute(coatMetas, 4));
    geom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geom.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndices, 4));
    geom.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeights, 4));
    geom.setIndex(indices);
    geom.computeVertexNormals();

    // Weld normals smoothly across the radial seam column (c = 0 and c = radialSegs)
    const nAttr = geom.getAttribute('normal');
    for (let r = 0; r < numRings; r++) {
      const i0 = r * stride;
      const i1 = r * stride + radialSegs;
      const nx = nAttr.getX(i0) + nAttr.getX(i1);
      const ny = nAttr.getY(i0) + nAttr.getY(i1);
      const nz = nAttr.getZ(i0) + nAttr.getZ(i1);
      const len = Math.hypot(nx, ny, nz) || 1;
      nAttr.setXYZ(i0, nx / len, ny / len, nz / len);
      nAttr.setXYZ(i1, nx / len, ny / len, nz / len);
    }
    nAttr.needsUpdate = true;

    return geom;
  }

  /**
   * Computes smooth skin weights along an ordered chain of bones given scalar position s along the chain.
   * bonePositions: array of { boneIdx, s } monotonically increasing.
   */
  function computeChainWeights(s, boneAnchors, blendWidth) {
    const bw = blendWidth || 0.08;
    const weights = [];
    for (let i = 0; i < boneAnchors.length; i++) {
      const dist = Math.abs(s - boneAnchors[i].s);
      // Smooth Gaussian-like influence kernel
      const w = Math.exp(-(dist * dist) / (2 * bw * bw));
      weights.push({ idx: boneAnchors[i].boneIdx, w });
    }
    // Keep top 4 influences and normalize
    weights.sort((a, b) => b.w - a.w);
    const top = weights.slice(0, 4);
    let sum = 0;
    for (let i = 0; i < top.length; i++) sum += top[i].w;
    if (sum < 1e-6) sum = 1;
    const si = [0, 0, 0, 0];
    const sw = [0, 0, 0, 0];
    for (let i = 0; i < top.length; i++) {
      si[i] = top[i].idx;
      sw[i] = top[i].w / sum;
    }
    return { si, sw };
  }

  /**
   * Piecewise linear/smooth Catmull-Rom curve sampler for arrays of Vector3 or numbers.
   */
  function sampleCurvePoints(controlPts, numSamples) {
    const curve = new THREE.CatmullRomCurve3(controlPts, false, 'centripetal', 0.45);
    const pts = [];
    for (let i = 0; i < numSamples; i++) {
      pts.push(curve.getPoint(i / (numSamples - 1)));
    }
    return { curve, pts };
  }

  /**
   * 1. UNIFIED TORSO + NECK + SCULPTED SKULL/HEAD/MUZZLE SkinnedMesh
   */
  function buildBodyNeckHead(rig, coatMat) {
    const M = GiraffeMath;
    const R = rig.rest;

    // Anatomical centerline control points from rear rump -> back -> withers -> neck -> skull -> muzzle tip
    const ctrl = [
      new THREE.Vector3(0, 2.23, -1.12), // 0: smooth rounded rear haunch
      new THREE.Vector3(0, 2.31, -0.92), // 1: smooth sloping croup (no lump!)
      new THREE.Vector3(0, 2.38, -0.64), // 2: pelvis center
      new THREE.Vector3(0, 2.43, -0.26), // 3: mid-flank / loin
      new THREE.Vector3(0, 2.50,  0.16), // 4: barrel ribcage
      new THREE.Vector3(0, 2.59,  0.54), // 5: chest / under withers
      new THREE.Vector3(0, 2.78,  0.84), // 6: thoracic inlet / neck base
      new THREE.Vector3(0, 3.09,  1.07), // 7: lower neck
      new THREE.Vector3(0, 3.47,  1.30), // 8: lower-mid neck
      new THREE.Vector3(0, 3.88,  1.52), // 9: mid-upper neck
      new THREE.Vector3(0, 4.28,  1.72), // 10: upper neck
      new THREE.Vector3(0, 4.61,  1.88), // 11: atlas / graceful throatlatch
      new THREE.Vector3(0, 4.74,  2.02), // 12: cranium / behind eyes
      new THREE.Vector3(0, 4.70,  2.17), // 13: eyes / forehead
      new THREE.Vector3(0, 4.64,  2.33), // 14: sleek graceful nasal bridge
      new THREE.Vector3(0, 4.58,  2.47), // 15: pre-muzzle snout
      new THREE.Vector3(0, 4.53,  2.57), // 16: soft rounded muzzle tip
    ];

    const numRings = 110;
    const radialSegs = 40;
    const { curve } = sampleCurvePoints(ctrl, numRings);

    // Map exact spine-bone anchors along arc-length parameter s in [0, 1]
    const spineBoneList = [
      rig.byName.pelvis,
      rig.byName.spine,
      rig.byName.chest,
      rig.byName.neck0,
      rig.byName.neck1,
      rig.byName.neck2,
      rig.byName.neck3,
      rig.byName.neck4,
      rig.byName.head,
    ];

    // Find closest s on curve for each bone
    const samples = [];
    for (let i = 0; i < numRings; i++) {
      const s = i / (numRings - 1);
      samples.push({ s, p: curve.getPoint(s) });
    }

    const boneAnchors = spineBoneList.map((b) => {
      let bestS = 0;
      let bestD = Infinity;
      for (let i = 0; i < samples.length; i++) {
        const d = samples[i].p.distanceToSquared(b.userData.restWorld);
        if (d < bestD) {
          bestD = d;
          bestS = samples[i].s;
        }
      }
      return { boneIdx: b.userData.index, s: bestS, name: b.name };
    });

    // Compute smooth cumulative pattern-space center along spine so Voronoi patches
    // shrink smoothly and organically from torso (1.0x) -> neck (1.35x) -> head (2.5x)
    // WITHOUT radial coordinate distortion!
    const restCenter = [samples[0].p.clone()];
    const ringScales = [1.0];
    for (let i = 1; i < numRings; i++) {
      const s = samples[i].s;
      // Local pattern scale multiplier by anatomical region
      const neckT = M.smoothstep(0.36, 0.56, s);
      const headT = M.smoothstep(0.73, 0.88, s);
      const localScale = 1.0 + neckT * 0.42 + headT * 1.35;
      ringScales.push(localScale);

      const delta = new THREE.Vector3().subVectors(samples[i].p, samples[i - 1].p);
      const prev = restCenter[i - 1];
      restCenter.push(prev.clone().addScaledVector(delta, localScale));
    }

    // Store anatomical dorsal ridge points along the neck for mane placement!
    const dorsalCrestPoints = [];

    const rings = [];
    const rightVec = new THREE.Vector3(1, 0, 0);
    const tangent = new THREE.Vector3();
    const dorsal = new THREE.Vector3();

    for (let i = 0; i < numRings; i++) {
      const s = i / (numRings - 1);
      const center = samples[i].p;

      // Exact twist-free sagittal frame (X = 0 plane)
      const pPrev = samples[Math.max(0, i - 1)].p;
      const pNext = samples[Math.min(numRings - 1, i + 1)].p;
      tangent.subVectors(pNext, pPrev).normalize();
      dorsal.crossVectors(tangent, rightVec).normalize();

      // Determine anatomical cross-section radii (width, dorsalHeight, ventralDepth)
      // Regions:
      //   s: 0.00..0.06  rear rump taper
      //   s: 0.06..0.18  pelvis / croup
      //   s: 0.18..0.31  ribcage / flank
      //   s: 0.31..0.41  high withers hump & deep brisket/chest
      //   s: 0.41..0.76  long tapering graceful neck
      //   s: 0.76..0.82  atlas / throat-to-jaw transition
      //   s: 0.82..0.90  cranium / eyes / brow / cheeks
      //   s: 0.90..0.98  tapering nasal bridge & slender jaw
      //   s: 0.98..1.00  rounded soft muzzle tip

      let halfW, halfUp, halfDown;
      // Helper smooth bell curve
      const bell = (x, mu, sig) => Math.exp(-((x - mu) * (x - mu)) / (2 * sig * sig));

      if (s < 0.44) {
        // TORSO & CHEST — silky smooth sloping back -> rounded croup -> muscular withers!
        const rumpSmooth = M.smoothstep(0.0, 0.14, s);
        const rumpDome = Math.pow(rumpSmooth, 0.72);
        const chestTaper = 1.0 - M.smoothstep(0.35, 0.44, s);

        // Width: athletic narrow ribcage, fuller pelvis & ribs, smooth taper into neck base
        halfW = 0.280 * rumpDome
          + 0.068 * bell(s, 0.22, 0.11)   // ribcage fullness
          + 0.044 * bell(s, 0.13, 0.065)  // rounded gluteal/pelvis fullness
          - 0.110 * M.smoothstep(0.31, 0.44, s);

        // Dorsal height: silky smooth rise along croup/back into broad muscular WITHERS crest (ZERO rear lump!)
        halfUp = 0.215 * rumpSmooth
          + 0.07 * M.smoothstep(0.09, 0.29, s)
          + 0.22 * bell(s, 0.355, 0.105)
          - 0.06 * M.smoothstep(0.39, 0.44, s);

        // Ventral depth: clean flank tuck, athletic ribcage, refined brisket keel
        halfDown = 0.280 * rumpDome
          - 0.05 * bell(s, 0.13, 0.05)    // subtle flank/groin tuck
          + 0.22 * bell(s, 0.27, 0.105)   // deep barrel ribcage
          + 0.12 * bell(s, 0.35, 0.065)   // sleek brisket between front shoulders
          - 0.13 * M.smoothstep(0.36, 0.44, s);

        halfW = Math.max(halfW, 0.18 * (1 - chestTaper) + 0.012);
      } else if (s < 0.775) {
        // NECK (s from 0.44 to 0.775)
        const nt = (s - 0.44) / (0.775 - 0.44); // 0 at neck base -> 1 at atlas
        const baseFlare = Math.pow(1 - M.smoothstep(0.0, 0.28, nt), 1.5);

        halfW = M.lerp(0.172, 0.080, Math.pow(nt, 0.85)) + 0.032 * baseFlare;
        halfUp = M.lerp(0.240, 0.114, Math.pow(nt, 0.82)) + 0.105 * baseFlare;
        halfDown = M.lerp(0.225, 0.084, Math.pow(nt, 0.84)) + 0.065 * baseFlare;
      } else {
        // HEAD & SCULPTED SKULL (s from 0.775 to 1.00)
        const ht = (s - 0.775) / (1.0 - 0.775); // 0 at atlas -> 1 at muzzle tip

        const craniumBell = bell(ht, 0.26, 0.16);
        const browBell = bell(ht, 0.40, 0.10);
        const jawBell = bell(ht, 0.24, 0.13);
        const muzzlePad = bell(ht, 0.90, 0.09);
        const noseTipTaper = 1.0 - M.smoothstep(0.90, 1.0, ht);

        halfW = (0.076
          + 0.044 * craniumBell
          + 0.016 * browBell
          - 0.034 * M.smoothstep(0.42, 0.82, ht)
          + 0.013 * muzzlePad) * Math.pow(Math.max(0.001, noseTipTaper), 0.44);

        halfUp = (0.108
          + 0.026 * craniumBell
          + 0.013 * bell(ht, 0.40, 0.08) // refined median forehead boss
          - 0.064 * M.smoothstep(0.32, 0.88, ht) // ultra-sleek graceful giraffe nasal bridge!
          + 0.014 * muzzlePad) * Math.pow(Math.max(0.001, noseTipTaper), 0.42);

        halfDown = (0.084
          + 0.046 * jawBell               // clean mandible / cheek fullness (no throat fold!)
          - 0.046 * M.smoothstep(0.36, 0.84, ht)
          + 0.008 * muzzlePad) * Math.pow(Math.max(0.001, noseTipTaper), 0.45);
      }

      // Compute bone weights for this ring
      const bw = s > 0.77 ? 0.045 : (s > 0.40 ? 0.068 : 0.095);
      let swInfo;
      if (s > 0.83) {
        const headT = M.smoothstep(0.80, 0.85, s);
        swInfo = {
          si: [rig.byName.head.userData.index, rig.byName.neck4.userData.index, 0, 0],
          sw: [headT, 1 - headT, 0, 0],
        };
      } else {
        swInfo = computeChainWeights(s, boneAnchors, bw);
      }

      const ring = [];
      const localScale = ringScales[i];

      // Save dorsal neck crest for mane placement:
      // Starts smoothly at withers (s=0.335) and stops cleanly at occiput/poll BEHIND ossicones (s=0.752)!
      if (s >= 0.335 && s <= 0.752) {
        const crestPos = center.clone().addScaledVector(dorsal, halfUp * 0.96);
        dorsalCrestPoints.push({
          s,
          pos: crestPos,
          dorsal: dorsal.clone(),
          tangent: tangent.clone(),
          si: swInfo.si,
          sw: swInfo.sw,
        });
      }

      for (let c = 0; c < radialSegs; c++) {
        // theta = 0 is pure dorsal (+dorsal), PI/2 is Left (+X), PI is ventral (-dorsal), 3PI/2 is Right (-X)
        const theta = (c / radialSegs) * Math.PI * 2;
        const cosT = Math.cos(theta); // +1 dorsal, -1 ventral
        const sinT = Math.sin(theta); // +1 left, -1 right

        let rx = sinT * halfW;
        let ry = cosT >= 0 ? cosT * halfUp : cosT * halfDown;

        // --- ANATOMICAL CROSS-SECTION SCULPTING ---
        if (s < 0.44) {
          // 1. Dorsal spine / withers ridge: slightly narrower peak on top (teardrop crest)
          if (cosT > 0.2) {
            const crestPinch = M.smoothstep(0.2, 0.95, cosT) * M.smoothstep(0.18, 0.38, s);
            rx *= (1.0 - 0.22 * crestPinch);
          }
          // 2. Keel-like deep chest / brisket pinch at bottom front
          if (cosT < -0.3) {
            const keelPinch = M.smoothstep(-0.3, -0.95, cosT) * bell(s, 0.35, 0.08);
            rx *= (1.0 - 0.25 * keelPinch);
          }
          // 3. Subtle athletic ribcage flattening on upper sides & shoulder blade bulge
          const sideFactor = Math.abs(sinT);
          const shoulderBulge = bell(s, 0.34, 0.055) * Math.exp(-Math.pow(cosT - 0.15, 2) / 0.18);
          rx += Math.sign(sinT) * 0.032 * shoulderBulge * sideFactor;

          // Subtle hip / pelvic wing (tuber coxae) contour on upper rump sides
          const hipWing = bell(s, 0.11, 0.04) * Math.exp(-Math.pow(cosT - 0.35, 2) / 0.14);
          rx += Math.sign(sinT) * 0.022 * hipWing * sideFactor;
        } else if (s < 0.775) {
          // NECK: laterally compressed teardrop (narrow crisp dorsal mane crest, fuller muscular throat)
          if (cosT > 0.15) {
            const crestT = M.smoothstep(0.15, 0.95, cosT);
            rx *= (1.0 - 0.32 * crestT);
          }
          // Subtle sternocephalicus/trachea roundness on front throat
          if (cosT < -0.25) {
            rx *= (1.0 - 0.10 * M.smoothstep(-0.25, -0.95, cosT));
          }
        } else {
          // HEAD SCULPTING (ht from 0 at atlas to 1 at muzzle tip)
          const ht = (s - 0.775) / (1.0 - 0.775);

          // A. Prominent Supraorbital Brow Ridges (above eye sockets, ht ~ 0.38..0.50, angle ~ ±42 deg)
          const browHt = bell(ht, 0.43, 0.065);
          const browAngle = Math.exp(-Math.pow(Math.abs(theta > Math.PI ? Math.PI * 2 - theta : theta) - 0.78, 2) / 0.12);
          const browPush = 0.024 * browHt * browAngle;
          rx += Math.sign(sinT) * browPush * 0.75;
          ry += browPush * 0.65;

          // B. Recessed Eye Sockets (ht ~ 0.42..0.52, angle ~ ±62 deg)
          const eyeHt = bell(ht, 0.455, 0.052);
          const absAngle = theta > Math.PI ? Math.PI * 2 - theta : theta;
          const eyeAngle = Math.exp(-Math.pow(absAngle - 1.18, 2) / 0.09);
          const socketDepth = 0.024 * eyeHt * eyeAngle;
          rx -= Math.sign(sinT) * socketDepth * 0.92;
          ry -= socketDepth * 0.15;

          // C. Median Forehead Boss (narrow central bump along dorsal midline, ht ~ 0.48)
          const bossHt = bell(ht, 0.48, 0.065);
          const bossAng = Math.exp(-Math.pow(absAngle, 2) / 0.14);
          ry += 0.018 * bossHt * bossAng;

          // D. Tapered slender bridge of nose (slightly sculpted concave cheek below eyes)
          const cheekHollow = bell(ht, 0.64, 0.10) * Math.exp(-Math.pow(absAngle - 1.55, 2) / 0.18);
          rx -= Math.sign(sinT) * 0.012 * cheekHollow;

          // E. Cheekbone / Masseter Jaw fullness (lower rear skull)
          const jawWidth = bell(ht, 0.24, 0.10) * Math.exp(-Math.pow(absAngle - 2.15, 2) / 0.22);
          rx += Math.sign(sinT) * 0.016 * jawWidth;

          // F. Soft Prehensile Upper Lip overhang & subtle mouth crease near muzzle tip
          const lipRegion = M.smoothstep(0.82, 0.94, ht);
          if (cosT < -0.15 && cosT > -0.75) {
            const mouthLine = Math.exp(-Math.pow(absAngle - 2.20, 2) / 0.04) * lipRegion;
            rx *= (1.0 - 0.10 * mouthLine);
            ry += 0.004 * mouthLine;
          }
          // Subtle indented nostril dimples on upper-side muzzle (ht ~ 0.87..0.93)
          const nostrilHt = bell(ht, 0.885, 0.032);
          const nostrilAng = Math.exp(-Math.pow(absAngle - 0.98, 2) / 0.09);
          const nostrilIndent = 0.012 * nostrilHt * nostrilAng;
          rx -= Math.sign(sinT) * nostrilIndent;
          ry -= nostrilIndent * 0.4;
        }

        // World position in rest pose
        const pos = center.clone()
          .addScaledVector(rightVec, rx)
          .addScaledVector(dorsal, ry);

        // Seamless scaled pattern-space coordinate (matching radial offset scale to axial scale!)
        const restPos = restCenter[i].clone()
          .addScaledVector(rightVec, rx * localScale)
          .addScaledVector(dorsal, ry * localScale);

        // Anatomical Coat Metadata:
        // x: spotMask (1 = bold spots, 0 = cream unspotted belly / muzzle)
        // y: dorsalDarken (richer darker mahogany on upper back/withers/crown)
        // z: creamBelly (lighter ivory on underbelly & throat)
        // w: muzzleVelvet (grey-brown soft velvet on muzzle tip & nostrils)
        let spotMask = 1.0;
        let dorsalDarken = M.smoothstep(0.15, 0.95, cosT) * (1.0 - M.smoothstep(0.75, 0.90, s));
        let creamBelly = 0.0;
        let muzzleVelvet = 0.0;

        if (s < 0.44) {
          // Spots wrap generously across chest/brisket and flanks; only narrow mid-belly underside fades to cream!
          const bellyZone = (1.0 - M.smoothstep(0.26, 0.36, s)) * M.smoothstep(0.06, 0.14, s);
          const bellyT = M.smoothstep(-0.68, -0.96, cosT) * (0.35 + 0.65 * bellyZone);
          spotMask *= (1.0 - bellyT * 0.85);
          creamBelly = bellyT;
        } else if (s < 0.78) {
          // Neck: spots wrap cleanly all around the muscular neck & chest throat
          const throatT = M.smoothstep(-0.84, -0.99, cosT);
          spotMask *= (1.0 - throatT * 0.25);
          creamBelly = throatT * 0.4;
        } else {
          // Head: delicate small spots on cheeks & forehead, fading cleanly to velvety unspotted muzzle!
          const ht = (s - 0.775) / (1.0 - 0.775);
          const muzzleFade = M.smoothstep(0.62, 0.82, ht);
          const chinFade = M.smoothstep(-0.45, -0.88, cosT);
          spotMask = (1.0 - muzzleFade) * (1.0 - chinFade * 0.80) * 0.92;
          creamBelly = Math.max(chinFade * 0.65, muzzleFade * 0.28);
          muzzleVelvet = M.smoothstep(0.75, 0.95, ht) * (0.58 + 0.42 * M.smoothstep(-0.2, 0.6, cosT));
          dorsalDarken = 0.30 * M.smoothstep(0.2, 0.9, cosT) * (1.0 - muzzleFade);
        }

        ring.push({
          pos,
          restPos,
          coatMeta: new THREE.Vector4(spotMask, dorsalDarken, creamBelly, muzzleVelvet),
          si: swInfo.si,
          sw: swInfo.sw,
        });
      }

      rings.push(ring);
    }

    // Smooth axial relaxation around the tight throatlatch bend (s ~ 0.70..0.88)
    // Guarantees 100% buttery smooth non-folding ventral skin under the jaw!
    const rStart = Math.floor(numRings * 0.70);
    const rEnd   = Math.floor(numRings * 0.88);
    for (let pass = 0; pass < 8; pass++) {
      for (let r = rStart; r <= rEnd; r++) {
        for (let c = 0; c < radialSegs; c++) {
          const theta = (c / radialSegs) * Math.PI * 2;
          const ventralAmt = M.smoothstep(0.10, -0.70, Math.cos(theta));
          if (ventralAmt > 0.01) {
            const prevP = rings[r - 1][c].pos;
            const nextP = rings[r + 1][c].pos;
            const curP  = rings[r][c].pos;
            const avgY = (prevP.y + nextP.y) * 0.5;
            const avgZ = (prevP.z + nextP.z) * 0.5;
            const blend = 0.46 * ventralAmt;
            curP.y = M.lerp(curP.y, avgY, blend);
            curP.z = M.lerp(curP.z, avgZ, blend);
          }
        }
      }
    }

    // Rear rump & smooth velvety muzzle tip caps
    const capStart = {
      pos: samples[0].p.clone(),
      restPos: restCenter[0].clone(),
      coatMeta: new THREE.Vector4(0.85, 0.2, 0.1, 0.0),
      si: [rig.byName.pelvis.userData.index, 0, 0, 0],
      sw: [1, 0, 0, 0],
    };

    const lastIdx = numRings - 1;
    const capEnd = {
      pos: samples[lastIdx].p.clone(),
      restPos: restCenter[lastIdx].clone(),
      coatMeta: new THREE.Vector4(0.0, 0.0, 0.2, 0.92),
      si: [rig.byName.head.userData.index, 0, 0, 0],
      sw: [1, 0, 0, 0],
    };

    const geom = buildLoftedSkinnedGeometry(rings, radialSegs, capStart, capEnd);
    const mesh = new THREE.SkinnedMesh(geom, coatMat);
    mesh.name = 'GiraffeBodyNeckHead';
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    mesh.bind(rig.skeleton);

    return { mesh, dorsalCrestPoints };
  }

  /**
   * 2. ANATOMICALLY SCULPTED LEG SkinnedMesh (Seamless Shoulder/Thigh to Coronet)
   */
  function buildLegMesh(rig, legData, coatMat) {
    const M = GiraffeMath;
    const j = legData.joints;
    const side = legData.side;
    const isFront = legData.isFront;
    const b = legData.bones;

    // Build smooth centerline anchored cleanly INSIDE the mid-chest / mid-pelvis (never poking above the croup/withers!)
    const anchorTop = j.top.clone().add(new THREE.Vector3(-side * 0.11, isFront ? 0.15 : 0.13, isFront ? -0.04 : 0.04));
    const ctrl = isFront
      ? [
          anchorTop,
          j.top.clone().add(new THREE.Vector3(-side * 0.02, 0.04, 0.02)),
          j.upper.clone(),               // elbow
          j.upper.clone().lerp(j.mid, 0.5),
          j.mid.clone(),                 // carpus (front knee)
          j.mid.clone().lerp(j.fetlock, 0.5),
          j.fetlock.clone(),             // fetlock
          j.coronet.clone(),             // coronet band above hoof
          j.coronet.clone().add(new THREE.Vector3(0, -0.022, 0.008)), // tucked slightly inside hoof rim
        ]
      : [
          anchorTop,
          j.top.clone().add(new THREE.Vector3(-side * 0.02, 0.04, -0.02)),
          j.upper.clone(),               // stifle
          j.upper.clone().lerp(j.mid, 0.52),
          j.mid.clone(),                 // hock (tarsus)
          j.mid.clone().lerp(j.fetlock, 0.5),
          j.fetlock.clone(),             // fetlock
          j.coronet.clone(),             // coronet band above hoof
          j.coronet.clone().add(new THREE.Vector3(0, -0.022, 0.008)),
        ];

    const numRings = 56;
    const radialSegs = 24;
    const curve = new THREE.CatmullRomCurve3(ctrl, false, 'centripetal', 0.25);

    const samples = [];
    for (let i = 0; i < numRings; i++) {
      const s = i / (numRings - 1);
      samples.push({ s, p: curve.getPoint(s) });
    }

    // Locate exact parameter s of each anatomical joint along the leg curve
    function findS(targetPt) {
      let bestS = 0;
      let bestD = Infinity;
      for (let i = 0; i < samples.length; i++) {
        const d = samples[i].p.distanceToSquared(targetPt);
        if (d < bestD) {
          bestD = d;
          bestS = samples[i].s;
        }
      }
      return bestS;
    }

    const sTop     = findS(j.top);
    const sUpper   = findS(j.upper);
    const sMid     = findS(j.mid);
    const sFetlock = findS(j.fetlock);
    const sCoronet = findS(j.coronet);

    // Seamless pattern coordinate integration starting from exact world rest pos at top!
    const restCenter = [samples[0].p.clone()];
    const ringScales = [1.0];
    for (let i = 1; i < numRings; i++) {
      const s = samples[i].s;
      const localScale = 1.0 + M.smoothstep(sUpper, sMid + 0.08, s) * 0.95;
      ringScales.push(localScale);
      const delta = new THREE.Vector3().subVectors(samples[i].p, samples[i - 1].p);
      restCenter.push(restCenter[i - 1].clone().addScaledVector(delta, localScale));
    }

    const rings = [];
    const rightAxis = new THREE.Vector3(1, 0, 0);
    const tangent = new THREE.Vector3();
    const forwardAxis = new THREE.Vector3();
    const bell = (x, mu, sig) => Math.exp(-((x - mu) * (x - mu)) / (2 * sig * sig));

    const parentBoneIdx = legData.parentBone.userData.index;
    const idxTop     = b.top.userData.index;
    const idxUpper   = b.upper.userData.index;
    const idxMid     = b.mid.userData.index;
    const idxFetlock = b.fetlock.userData.index;
    const idxHoof    = b.hoof.userData.index;

    for (let i = 0; i < numRings; i++) {
      const s = samples[i].s;
      const center = samples[i].p;
      const pPrev = samples[Math.max(0, i - 1)].p;
      const pNext = samples[Math.min(numRings - 1, i + 1)].p;
      tangent.subVectors(pNext, pPrev).normalize(); // points downward along leg

      // Forward axis perpendicular to leg centerline in sagittal plane
      // tangent ≈ (0, -1, 0), rightAxis = (1, 0, 0) -> rightAxis × tangent = (0, 0, -1), so tangent × rightAxis = (0, 0, +1)!
      forwardAxis.crossVectors(tangent, rightAxis).normalize();

      // Anatomical leg cross-section radii: rSide (X), rFront (+Z), rBack (-Z)
      let rSide, rFront, rBack;

      if (isFront) {
        // FRONT LEG SCULPTING
        const upperFlare = M.smoothstep(sUpper + 0.05, 0.02, s);
        const forearmT = M.remap(s, sUpper, sMid, 0, 1);
        const cannonT  = M.remap(s, sMid, sFetlock, 0, 1);

        // Base slender ungulate taper (smooth dome closure at s=0 so upper cuff never pokes out!)
        const topDome = M.smoothstep(0.0, 0.055, s);
        rSide  = (0.040 + 0.082 * Math.pow(upperFlare, 1.35) + 0.028 * (1 - forearmT) * M.smoothstep(sMid, sUpper, s)) * (0.45 + 0.55 * topDome);
        rFront = (0.044 + 0.135 * Math.pow(upperFlare, 1.25) + 0.036 * (1 - forearmT) * M.smoothstep(sMid, sUpper, s)) * (0.45 + 0.55 * topDome);
        rBack  = (0.044 + 0.125 * Math.pow(upperFlare, 1.25) + 0.032 * (1 - forearmT) * M.smoothstep(sMid, sUpper, s)) * (0.45 + 0.55 * topDome);

        // Prominent bony elbow point (olecranon) jutting backward at sUpper!
        rBack += 0.036 * bell(s, sUpper, 0.038);

        // Iconic knobbly CARPUS (front knee) joint bulge!
        const carpusBump = bell(s, sMid, 0.036);
        rSide  += 0.015 * carpusBump;
        rFront += 0.021 * carpusBump;
        rBack  += 0.018 * carpusBump;

        // Slender sculpted cannon bone (sMid..sFetlock)
        const cannonPinch = Math.sin(cannonT * Math.PI) * M.smoothstep(sMid, sMid + 0.06, s) * (1 - M.smoothstep(sFetlock - 0.06, sFetlock, s));
        rSide  -= 0.008 * cannonPinch;
        rFront -= 0.006 * cannonPinch;

        // Rounded Fetlock knob bulging slightly backward
        const fetBump = bell(s, sFetlock, 0.026);
        rSide  += 0.011 * fetBump;
        rFront += 0.008 * fetBump;
        rBack  += 0.022 * fetBump;

        // Slender pastern tapering slightly before coronet flare
        const pasternMid = (sFetlock + sCoronet) * 0.5;
        const pastPinch = bell(s, pasternMid, 0.025);
        rSide  -= 0.006 * pastPinch;
        rFront -= 0.005 * pastPinch;
        rBack  -= 0.005 * pastPinch;

        // Coronet flare meeting top of hoof cleanly
        const corFlare = M.smoothstep(sCoronet - 0.03, sCoronet + 0.015, s);
        rSide  += 0.012 * corFlare;
        rFront += 0.015 * corFlare;
        rBack  += 0.010 * corFlare;
      } else {
        // HIND LEG SCULPTING
        const thighFlare = M.smoothstep(sUpper + 0.08, 0.02, s);
        const gaskinT = M.remap(s, sUpper, sMid, 0, 1);
        const cannonT = M.remap(s, sMid, sFetlock, 0, 1);

        const topDome = M.smoothstep(0.0, 0.06, s);
        rSide  = (0.038 + 0.095 * Math.pow(thighFlare, 1.3) + 0.032 * (1 - gaskinT) * M.smoothstep(sMid, sUpper, s)) * (0.42 + 0.58 * topDome);
        rFront = (0.043 + 0.155 * Math.pow(thighFlare, 1.2) + 0.040 * (1 - gaskinT) * M.smoothstep(sMid, sUpper, s)) * (0.42 + 0.58 * topDome);
        rBack  = (0.043 + 0.155 * Math.pow(thighFlare, 1.2) + 0.038 * (1 - gaskinT) * M.smoothstep(sMid, sUpper, s)) * (0.42 + 0.58 * topDome);

        // Stifle (true knee) forward prominence
        rFront += 0.034 * bell(s, sUpper, 0.045);

        // Sharp backward-pointing HOCK (calcaneus / Achilles heel point)!
        const hockBump = bell(s, sMid, 0.034);
        rSide  += 0.012 * hockBump;
        rFront += 0.012 * hockBump;
        rBack  += 0.044 * hockBump; // unmistakable sharp ungulate hock!

        // Slender hind cannon bone
        const cannonPinch = Math.sin(cannonT * Math.PI) * M.smoothstep(sMid, sMid + 0.06, s) * (1 - M.smoothstep(sFetlock - 0.06, sFetlock, s));
        rSide  -= 0.008 * cannonPinch;
        rFront -= 0.006 * cannonPinch;

        // Fetlock knob
        const fetBump = bell(s, sFetlock, 0.026);
        rSide  += 0.011 * fetBump;
        rFront += 0.008 * fetBump;
        rBack  += 0.022 * fetBump;

        // Pastern & coronet
        const pasternMid = (sFetlock + sCoronet) * 0.5;
        const pastPinch = bell(s, pasternMid, 0.025);
        rSide  -= 0.006 * pastPinch;
        rFront -= 0.005 * pastPinch;
        rBack  -= 0.005 * pastPinch;

        const corFlare = M.smoothstep(sCoronet - 0.03, sCoronet + 0.015, s);
        rSide  += 0.012 * corFlare;
        rFront += 0.014 * corFlare;
        rBack  += 0.010 * corFlare;
      }

      // Compute clean piecewise linear skin weights across exact joint boundaries
      // so joints hinge organically without rigid snapping OR gummy over-blending!
      let si = [0, 0, 0, 0];
      let sw = [1, 0, 0, 0];

      if (s < sTop + 0.05) {
        // Blend smoothly from torso (parentBone) into upper leg (top)
        const t = M.smoothstep(0.01, sTop + 0.05, s);
        si = [parentBoneIdx, idxTop, 0, 0];
        sw = [1 - t, t, 0, 0];
      } else if (s < sUpper) {
        const t = M.smoothstep(sUpper - 0.055, sUpper + 0.045, s);
        si = [idxTop, idxUpper, 0, 0];
        sw = [1 - t, t, 0, 0];
      } else if (s < sMid) {
        const t = M.smoothstep(sMid - 0.045, sMid + 0.045, s);
        si = [idxUpper, idxMid, 0, 0];
        sw = [1 - t, t, 0, 0];
      } else if (s < sFetlock) {
        const t = M.smoothstep(sFetlock - 0.04, sFetlock + 0.035, s);
        si = [idxMid, idxFetlock, 0, 0];
        sw = [1 - t, t, 0, 0];
      } else {
        const t = M.smoothstep(sCoronet - 0.035, sCoronet + 0.01, s);
        si = [idxFetlock, idxHoof, 0, 0];
        sw = [1 - t, t, 0, 0];
      }

      const ring = [];
      const localScale = ringScales[i];

      for (let c = 0; c < radialSegs; c++) {
        // theta = 0 is +forward, PI/2 is +X, PI is -forward (back), 3PI/2 is -X
        const theta = (c / radialSegs) * Math.PI * 2;
        const cosT = Math.cos(theta); // +1 front, -1 back
        const sinT = Math.sin(theta); // +1 (+X), -1 (-X)

        let dx = sinT * rSide;
        let dz = cosT >= 0 ? cosT * rFront : cosT * rBack;

        // Subtle flexor tendon groove on the lateral/medial rear of the cannon bone
        if (s > sMid + 0.05 && s < sFetlock - 0.04) {
          const groove = Math.exp(-Math.pow(cosT + 0.42, 2) / 0.07) * Math.abs(sinT);
          dx *= (1.0 - 0.16 * groove);
        }

        // Slightly tuck inner upper thigh/shoulder smoothly into the torso flank
        const isInner = (sinT * side) < 0;
        if (isInner && s < sUpper) {
          const innerTuck = M.smoothstep(sUpper, 0.02, s);
          dx *= (1.0 - 0.18 * innerTuck);
        }

        const pos = center.clone()
          .addScaledVector(rightAxis, dx)
          .addScaledVector(forwardAxis, dz);

        const restPos = restCenter[i].clone()
          .addScaledVector(rightAxis, dx * localScale)
          .addScaledVector(forwardAxis, dz * localScale);

        // Coat metadata:
        // Spots strong on upper shoulder/thigh, shrink & fade into creamy-ivory "stockings" below carpus/hock!
        const heightFade = M.smoothstep(0.62, 1.38, pos.y);
        const innerFade = isInner ? (1.0 - 0.72 * Math.abs(sinT) * M.smoothstep(1.3, 2.05, pos.y)) : 1.0;
        const spotMask = heightFade * innerFade;
        const creamBelly = Math.max(1.0 - heightFade, isInner ? Math.abs(sinT) * 0.7 : 0.0);
        const dustLower = M.smoothstep(0.42, 0.10, pos.y); // subtle savannah dust near ankles

        ring.push({
          pos,
          restPos,
          coatMeta: new THREE.Vector4(spotMask, 0.05 * heightFade, creamBelly * 0.85, dustLower),
          si,
          sw,
        });
      }

      rings.push(ring);
    }

    const capStart = {
      pos: samples[0].p.clone(),
      restPos: restCenter[0].clone(),
      coatMeta: new THREE.Vector4(1.0, 0.1, 0.0, 0.0),
      si: [parentBoneIdx, 0, 0, 0],
      sw: [1, 0, 0, 0],
    };

    const lastIdx = numRings - 1;
    const capEnd = {
      pos: samples[lastIdx].p.clone(),
      restPos: restCenter[lastIdx].clone(),
      coatMeta: new THREE.Vector4(0.0, 0.0, 0.8, 0.7),
      si: [idxHoof, 0, 0, 0],
      sw: [1, 0, 0, 0],
    };

    const geom = buildLoftedSkinnedGeometry(rings, radialSegs, capStart, capEnd);
    const mesh = new THREE.SkinnedMesh(geom, coatMat);
    mesh.name = `GiraffeLeg_${legData.key}`;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    mesh.bind(rig.skeleton);
    return mesh;
  }

  /**
   * 3. SCULPTED CLOVEN HOOF + DEWCLAWS (attached to each leg's hoof & fetlock bones)
   */
  function buildClovenHoof(hoofMat, isFront) {
    const group = new THREE.Group();
    group.name = 'ClovenHoof';

    // Hoof bone sits at coronet: y = 0.11 above ground, z offset from coronet to sole center ≈ +0.03
    // Build Left & Right asymmetric cloven claws (cleats) with a realistic central cleft!
    const hoofH = 0.112;
    const scaleX = isFront ? 1.0 : 0.92;
    const scaleZ = isFront ? 1.0 : 0.94;

    function makeClaw(clawSide) {
      // Sculpted lofted half-hoof claw: flat sole at y = -0.110, coronet rim at y = +0.008
      const rings = 10;
      const segs = 20;
      const positions = [];
      const uvs = [];
      const indices = [];

      for (let r = 0; r <= rings; r++) {
        const t = r / rings; // 0 = coronet top, 1 = sole bottom
        const y = 0.006 - t * hoofH;

        // Sloped front wall (~52 deg), steeper back heel, widens toward ground sole
        const frontZ = (0.048 + t * 0.056) * scaleZ;
        const backZ  = (-0.045 - t * 0.012) * scaleZ;
        const outerW = (0.048 + t * 0.022) * scaleX;
        // Inner cleft gap widens slightly toward toe & bottom
        const innerGap = 0.003 + t * 0.004;

        for (let c = 0; c <= segs; c++) {
          const u = c / segs;
          const ang = u * Math.PI * 2;
          const cosA = Math.cos(ang); // +1 front, -1 back
          const sinA = Math.sin(ang); // +1 outer, -1 inner

          let z = cosA >= 0 ? cosA * frontZ : cosA * (-backZ);
          // Slight flattening along the inner cleft face
          let localX;
          if (sinA >= 0) {
            // Rounded outer hoof wall
            localX = innerGap + sinA * (outerW - innerGap);
          } else {
            // Flat-ish slightly curved inner cleft wall
            localX = innerGap + (1.0 - Math.abs(sinA)) * 0.004;
            // Taper toe tip smoothly at front
            if (cosA > 0.35) {
              localX += (cosA - 0.35) * 0.010;
            }
          }

          // Subtle bevel at sole bottom edge
          if (r === rings) {
            localX *= 0.96;
            z *= 0.97;
          }

          positions.push(clawSide * localX, y, z + 0.010);
          uvs.push(u, t);
        }
      }

      const stride = segs + 1;
      for (let r = 0; r < rings; r++) {
        for (let c = 0; c < segs; c++) {
          const a = r * stride + c;
          const b = a + 1;
          const d = (r + 1) * stride + c;
          const e = d + 1;
          if (clawSide > 0) {
            indices.push(a, d, b);
            indices.push(b, d, e);
          } else {
            indices.push(a, b, d);
            indices.push(b, e, d);
          }
        }
      }

      // Close sole bottom & coronet top
      const topCenter = positions.length / 3;
      positions.push(clawSide * 0.025 * scaleX, 0.006, 0.01);
      uvs.push(0.5, 0);
      for (let c = 0; c < segs; c++) {
        if (clawSide > 0) indices.push(topCenter, c, c + 1);
        else indices.push(topCenter, c + 1, c);
      }

      const botCenter = positions.length / 3;
      positions.push(clawSide * 0.032 * scaleX, 0.006 - hoofH, 0.025);
      uvs.push(0.5, 1);
      const botBase = rings * stride;
      for (let c = 0; c < segs; c++) {
        if (clawSide > 0) indices.push(botCenter, botBase + c + 1, botBase + c);
        else indices.push(botCenter, botBase + c, botBase + c + 1);
      }

      const geom = new THREE.BufferGeometry();
      geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      geom.setIndex(indices);
      geom.computeVertexNormals();

      const m = new THREE.Mesh(geom, hoofMat);
      m.castShadow = true;
      m.receiveShadow = true;
      return m;
    }

    group.add(makeClaw(1));
    group.add(makeClaw(-1));
    return group;
  }

  /**
   * 4. OSSICONES (paired spotted skin-covered stalks + velvety dark tufted hair knobs)
   */
  function buildOssicones(headBone, restHeadPos, coatMat, darkHairMat) {
    const group = new THREE.Group();
    group.name = 'Ossicones';
    const rng = GiraffeMath.createRNG(881);

    for (const side of [1, -1]) {
      const hornGroup = new THREE.Group();
      // Base sits deep & seamlessly on parietal dome behind/above eyes
      const baseWorld = new THREE.Vector3(side * 0.046, 4.832, 1.988);
      hornGroup.position.subVectors(baseWorld, restHeadPos);
      // Slight natural backward tilt (~12 deg) and gentle outward splay (~6 deg)
      hornGroup.rotation.set(-0.21, 0, -side * 0.11);

      // Tapered skin-covered ossicone stalk with smooth flared base & subtle bony tip
      const stalkLen = 0.230;
      const stalkPts = [];
      const steps = 14;
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const baseFlare = 0.018 * Math.pow(1.0 - GiraffeMath.smoothstep(0.0, 0.32, t), 1.5);
        const r = 0.023 * (1 - t * 0.26) + baseFlare + 0.007 * Math.exp(-Math.pow(t - 0.90, 2) / 0.020);
        stalkPts.push(new THREE.Vector2(Math.max(0.002, r), t * stalkLen));
      }
      const stalkGeom = new THREE.LatheGeometry(stalkPts, 20);
      const posAttr = stalkGeom.getAttribute('position');
      const restArr = new Float32Array(posAttr.count * 3);
      const metaArr = new Float32Array(posAttr.count * 4);
      for (let i = 0; i < posAttr.count; i++) {
        const y = posAttr.getY(i);
        const t = y / stalkLen;
        restArr[i * 3]     = (baseWorld.x + posAttr.getX(i)) * 2.6;
        restArr[i * 3 + 1] = (baseWorld.y + y) * 2.6;
        restArr[i * 3 + 2] = (baseWorld.z + posAttr.getZ(i)) * 2.6;
        metaArr[i * 4]     = 0.85 * (1.0 - GiraffeMath.smoothstep(0.45, 0.92, t));
        metaArr[i * 4 + 1] = 0.35 + 0.55 * t;
        metaArr[i * 4 + 2] = 0.0;
        metaArr[i * 4 + 3] = GiraffeMath.smoothstep(0.35, 0.96, t) * 0.85;
      }
      stalkGeom.setAttribute('aRestPos', new THREE.BufferAttribute(restArr, 3));
      stalkGeom.setAttribute('aCoatMeta', new THREE.BufferAttribute(metaArr, 4));
      const stalkMesh = new THREE.Mesh(stalkGeom, coatMat);
      stalkMesh.castShadow = true;
      stalkMesh.receiveShadow = true;
      hornGroup.add(stalkMesh);

      // Smooth velvety plush dark-espresso hair knob cap (NO faceted rock shading!)
      const capMat = new THREE.MeshPhysicalMaterial({
        color: 0x1d120a,
        roughness: 0.96,
        metalness: 0.0,
        sheen: 0.35,
        sheenRoughness: 0.82,
        sheenColor: new THREE.Color(0x5a3a22),
        envMapIntensity: 0.3,
      });
      const capGeom = new THREE.SphereGeometry(0.0285, 28, 22);
      const cPos = capGeom.getAttribute('position');
      for (let k = 0; k < cPos.count; k++) {
        let vx = cPos.getX(k);
        let vy = cPos.getY(k);
        let vz = cPos.getZ(k);
        const n = GiraffeMath.noise3D(vx * 45 + side * 7, vy * 45, vz * 45);
        const sc = 1.0 + n * 0.055;
        vy *= (vy > 0 ? 1.15 : 0.88);
        cPos.setXYZ(k, vx * sc, vy * sc, vz * sc);
      }
      capGeom.computeVertexNormals();
      const capMesh = new THREE.Mesh(capGeom, capMat);
      capMesh.position.y = stalkLen - 0.002;
      capMesh.castShadow = true;
      hornGroup.add(capMesh);

      const collarGeom = new THREE.SphereGeometry(0.0255, 20, 14);
      collarGeom.scale(1.02, 0.58, 1.02);
      const collarMesh = new THREE.Mesh(collarGeom, new THREE.MeshStandardMaterial({
        color: 0x382112,
        roughness: 0.95,
        envMapIntensity: 0.25,
      }));
      collarMesh.position.y = stalkLen - 0.020;
      hornGroup.add(collarMesh);

      group.add(hornGroup);
    }

    headBone.add(group);
    return group;
  }

  /**
   * 5. CUPPED ANATOMICAL EARS (mounted to earL and earR bones for independent twitching!)
   */
  function buildEars(rig, coatMat, innerEarMat) {
    const ears = {};

    for (const side of [1, -1]) {
      const earBone = side > 0 ? rig.byName.earL : rig.byName.earR;
      const earGroup = new THREE.Group();
      earGroup.name = side > 0 ? 'EarL' : 'EarR';

      const lenSegs = 16;
      const widSegs = 12;
      const earLen = 0.225;
      const maxHalfW = 0.050;

      function createEarShell(isInner) {
        const positions = [];
        const restPos = [];
        const coatMeta = [];
        const colors = [];
        const uvs = [];
        const indices = [];

        // True linear-converted warm dusty-rose/taupe inner ear colors (NO chalky white!)
        const cDeep = new THREE.Color(0x47281c).convertSRGBToLinear();
        const cMid  = new THREE.Color(0x8a6149).convertSRGBToLinear();
        const cRim  = new THREE.Color(0xb58e6c).convertSRGBToLinear();
        const cTmp  = new THREE.Color();

        for (let i = 0; i <= lenSegs; i++) {
          const u = i / lenSegs; // 0 = rooted inside skull, 1 = pointed ear tip
          // Smooth tubular root (u=0 -> halfW=0.018) expanding into broad lanceolate leaf -> pointed tip!
          const leafEnv = Math.sin(Math.pow(u, 0.72) * Math.PI);
          const rootBase = 0.018 * (1.0 - GiraffeMath.smoothstep(0.0, 0.25, u));
          const halfW = maxHalfW * leafEnv + rootBase;
          const cupDepth = 0.024 * Math.sin(u * Math.PI) * (1.0 - 0.35 * u) + 0.008 * (1.0 - u);
          const archY = 0.014 * Math.sin(u * Math.PI * 0.9) + u * 0.026;
          const backZ = -u * 0.072;

          for (let j = 0; j <= widSegs; j++) {
            const v = j / widSegs;
            const vCentered = (v - 0.5) * 2; // -1 to +1

            // Start 1.5cm inside skull contour so ear grows 100% seamlessly out of head!
            const x = side * (-0.015 + u * (earLen + 0.015));
            const y = archY + vCentered * halfW;
            const cupZ = -(1.0 - vCentered * vCentered) * cupDepth;
            const thicknessOffset = isInner ? 0.0025 : -0.006 * (1.0 - vCentered * vCentered * 0.65);
            const z = backZ + cupZ + thicknessOffset;

            positions.push(x, y, z);
            restPos.push((x + side * 0.1) * 2.6, (4.82 + y) * 2.6, (1.90 + z) * 2.6);
            const spot = 0.75 * (1.0 - u * 0.62);
            coatMeta.push(spot, 0.25 + 0.30 * u, 0.10, 0.15 * u);
            uvs.push(u, v);

            const canalFactor = (1.0 - Math.abs(vCentered)) * (1.0 - u * 0.72);
            const rimFactor = Math.abs(vCentered);
            cTmp.copy(cMid).lerp(cDeep, canalFactor * 0.78).lerp(cRim, rimFactor * 0.50);
            colors.push(cTmp.r, cTmp.g, cTmp.b);
          }
        }

        const stride = widSegs + 1;
        for (let i = 0; i < lenSegs; i++) {
          for (let j = 0; j < widSegs; j++) {
            const a = i * stride + j;
            const b = a + 1;
            const d = (i + 1) * stride + j;
            const e = d + 1;
            // Verify outward normal direction:
            // Inner cup faces FORWARD (+Z), outer back faces BACKWARD (-Z)!
            // Vector (d - a) = (+side * dx, 0, -dz); Vector (b - a) = (0, +dy, 0).
            // (d - a) x (b - a) = (0, 0, +side * dx * dy) -> points +Z when side > 0, -Z when side < 0!
            // So for isInner (+Z normal): need +Z -> (a, d, b) when side > 0, (a, b, d) when side < 0!
            const useADB = (side > 0) === isInner;
            if (useADB) {
              indices.push(a, d, b);
              indices.push(b, d, e);
            } else {
              indices.push(a, b, d);
              indices.push(b, e, d);
            }
          }
        }

        const geom = new THREE.BufferGeometry();
        geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geom.setAttribute('aRestPos', new THREE.Float32BufferAttribute(restPos, 3));
        geom.setAttribute('aCoatMeta', new THREE.Float32BufferAttribute(coatMeta, 4));
        geom.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
        geom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
        geom.setIndex(indices);
        geom.computeVertexNormals();
        return geom;
      }

      const outerMesh = new THREE.Mesh(createEarShell(false), coatMat);
      outerMesh.castShadow = true;
      outerMesh.receiveShadow = true;
      earGroup.add(outerMesh);

      const innerMesh = new THREE.Mesh(createEarShell(true), innerEarMat);
      innerMesh.receiveShadow = true;
      earGroup.add(innerMesh);

      earBone.add(earGroup);
      ears[side > 0 ? 'L' : 'R'] = earBone;
    }

    return ears;
  }

  /**
   * 6. RECESSED GLOSSY EYES, NATURAL DARK-RIMMED EYELIDS, CURVED EYELASHES & NOSTRILS
   */
  function buildFaceDetails(headBone, restHeadPos, eyeMat, coatMat, darkHairMat, nostrilMat) {
    const eyelids = { upperL: null, upperR: null, lowerL: null, lowerR: null };

    // Rich deep dark-umber matte eyelid skin (authentic dark giraffe eye-ring, ZERO pale glare!)
    const lidMat = new THREE.MeshStandardMaterial({
      color: 0x2e1b10,
      roughness: 0.95,
      metalness: 0.0,
      envMapIntensity: 0.15,
    });
    const lidRimMat = new THREE.MeshStandardMaterial({
      color: 0x120b07,
      roughness: 0.72,
      metalness: 0.0,
      envMapIntensity: 0.2,
    });

    for (const side of [1, -1]) {
      const eyeGroup = new THREE.Group();
      // Nestled deeply and naturally inside the sculpted orbital socket beneath the brow ridge!
      const eyeWorld = new THREE.Vector3(side * 0.085, 4.764, 2.142);
      eyeGroup.position.subVectors(eyeWorld, restHeadPos);
      eyeGroup.rotation.set(0.06, side * 0.86, 0);

      const eyeRadius = 0.0295;
      const eyeGeom = new THREE.SphereGeometry(eyeRadius, 24, 20);
      eyeGeom.rotateY(-Math.PI * 0.5);
      const eyeMesh = new THREE.Mesh(eyeGeom, eyeMat);
      eyeGroup.add(eyeMesh);

      // Animated UPPER EYELID (soft matte dark-umber fold closely enveloping eyeball)
      const upperPivot = new THREE.Group();
      const upperLidGeom = new THREE.SphereGeometry(
        eyeRadius * 1.075, 22, 14,
        0, Math.PI * 2,
        0, Math.PI * 0.52
      );
      const upperLidMesh = new THREE.Mesh(upperLidGeom, lidMat);
      upperLidMesh.castShadow = true;
      upperPivot.add(upperLidMesh);

      const rimGeom = new THREE.TorusGeometry(eyeRadius * 1.06, 0.0024, 6, 20, Math.PI * 1.12);
      const rimMesh = new THREE.Mesh(rimGeom, lidRimMat);
      rimMesh.rotation.x = Math.PI * 0.5;
      rimMesh.rotation.z = -Math.PI * 0.06;
      upperPivot.add(rimMesh);

      // Delicate curved dark giraffe eyelashes radiating from upper lid margin
      const lashCount = 15;
      for (let k = 0; k < lashCount; k++) {
        const frac = (k / (lashCount - 1)) - 0.5;
        const ang = frac * 1.52;
        const lashLen = 0.015 + 0.008 * Math.cos(frac * Math.PI);
        const lashGeom = new THREE.ConeGeometry(0.0009, lashLen, 4);
        lashGeom.translate(0, lashLen * 0.5, 0);
        const lash = new THREE.Mesh(lashGeom, darkHairMat);
        const rRim = eyeRadius * 1.06;
        lash.position.set(Math.sin(ang) * rRim, -0.001, Math.cos(ang) * rRim);
        lash.rotation.set(Math.PI * 0.45, ang, 0);
        upperPivot.add(lash);
      }

      upperPivot.rotation.x = -0.58;
      eyeGroup.add(upperPivot);

      // Animated LOWER EYELID
      const lowerPivot = new THREE.Group();
      const lowerLidGeom = new THREE.SphereGeometry(
        eyeRadius * 1.065, 18, 10,
        0, Math.PI * 2,
        Math.PI * 0.52, Math.PI * 0.48
      );
      const lowerLidMesh = new THREE.Mesh(lowerLidGeom, lidMat);
      lowerPivot.add(lowerLidMesh);
      lowerPivot.rotation.x = 0.44;
      eyeGroup.add(lowerPivot);

      if (side > 0) {
        eyelids.upperL = upperPivot;
        eyelids.lowerL = lowerPivot;
      } else {
        eyelids.upperR = upperPivot;
        eyelids.lowerR = lowerPivot;
      }

      headBone.add(eyeGroup);

      // Recessed dark slit nostril
      const nostrilGeom = new THREE.SphereGeometry(0.014, 12, 10);
      nostrilGeom.scale(0.38, 0.52, 1.40);
      const nostrilMesh = new THREE.Mesh(nostrilGeom, nostrilMat);
      const nosWorld = new THREE.Vector3(side * 0.036, 4.572, 2.478);
      nostrilMesh.position.subVectors(nosWorld, restHeadPos);
      nostrilMesh.rotation.set(0.42, side * 0.50, -side * 0.25);
      headBone.add(nostrilMesh);
    }

    return eyelids;
  }

  /**
   * 7. DENSE PLUSH ERECT BRUSH MANE (SkinnedMesh stopping cleanly at occiput behind ossicones!)
   */
  function buildManeMesh(rig, dorsalCrestPoints, maneMat) {
    const rng = GiraffeMath.createRNG(31415);
    const positions = [];
    const colors = [];
    const skinIndices = [];
    const skinWeights = [];
    const indices = [];

    // Rich dark chestnut-to-espresso true linear vertex colors (plush giraffe brush mane!)
    const cRoot = new THREE.Color(0x5a2b10).convertSRGBToLinear();
    const cMid  = new THREE.Color(0x331608).convertSRGBToLinear();
    const cTip  = new THREE.Color(0x160904).convertSRGBToLinear();
    const cTmp  = new THREE.Color();

    const rightVec = new THREE.Vector3(1, 0, 0);
    const vPos = new THREE.Vector3();

    // High density (380 slender overlapping brush strands) -> reads as soft lush brush, ZERO spikes!
    const numTufts = 380;
    let vertCount = 0;

    for (let t = 0; t < numTufts; t++) {
      const frac = t / (numTufts - 1);
      const idxFloat = frac * (dorsalCrestPoints.length - 1);
      const i0 = Math.floor(idxFloat);
      const i1 = Math.min(dorsalCrestPoints.length - 1, i0 + 1);
      const alpha = idxFloat - i0;

      const p0 = dorsalCrestPoints[i0];
      const p1 = dorsalCrestPoints[i1];

      const base = p0.pos.clone().lerp(p1.pos, alpha);
      const upDir = p0.dorsal.clone().lerp(p1.dorsal, alpha).normalize();
      const tangDir = p0.tangent.clone().lerp(p1.tangent, alpha).normalize();

      // Smooth envelope: tapers cleanly to 0 at withers AND at the occiput right behind ossicones!
      const env = Math.sin(Math.pow(frac, 0.85) * Math.PI);
      const tuftLen = (0.025 + 0.068 * Math.pow(env, 0.6)) * (0.85 + rng() * 0.30);

      // 5 subtle lateral rows across the narrow dorsal crest for plush 3D brush volume
      const row = (t % 5) - 2; // -2, -1, 0, +1, +2
      const latOffset = row * 0.0065 + (rng() - 0.5) * 0.004;
      const latSplay = row * 0.11 + (rng() - 0.5) * 0.14;
      // Gentle natural backward rake along the crest so hairs shingle softly together
      const leanBack = -0.30 + (rng() - 0.5) * 0.18;

      const hairDir = upDir.clone()
        .addScaledVector(rightVec, latSplay)
        .addScaledVector(tangDir, leanBack)
        .normalize();

      const bladeWidth = 0.0075 + rng() * 0.0045;
      const bladeDepth = 0.015 + rng() * 0.008;
      const rootPos = base.clone()
        .addScaledVector(upDir, -0.015)
        .addScaledVector(rightVec, latOffset);

      const tiers = [
        { h: 0.0,  w: 1.0,  col: cRoot },
        { h: 0.58, w: 0.78, col: cMid },
        { h: 1.0,  w: 0.18, col: cTip },
      ];

      const jitterShade = 0.82 + rng() * 0.34;

      for (let q = 0; q < 2; q++) {
        const axis = q === 0 ? tangDir : rightVec;
        const span = q === 0 ? bladeDepth : bladeWidth;
        const qBase = vertCount;

        for (let k = 0; k < tiers.length; k++) {
          const tier = tiers[k];
          const w = span * tier.w;
          const midPt = rootPos.clone().addScaledVector(hairDir, tuftLen * tier.h);
          cTmp.copy(tier.col).multiplyScalar(jitterShade);

          for (const sgn of [-1, 1]) {
            vPos.copy(midPt).addScaledVector(axis, sgn * w * 0.5);
            positions.push(vPos.x, vPos.y, vPos.z);
            colors.push(cTmp.r, cTmp.g, cTmp.b);
            skinIndices.push(p0.si[0], p0.si[1], p0.si[2], p0.si[3]);
            skinWeights.push(p0.sw[0], p0.sw[1], p0.sw[2], p0.sw[3]);
            vertCount++;
          }
        }

        indices.push(qBase + 0, qBase + 2, qBase + 1);
        indices.push(qBase + 1, qBase + 2, qBase + 3);
        indices.push(qBase + 2, qBase + 4, qBase + 3);
        indices.push(qBase + 3, qBase + 4, qBase + 5);
      }
    }

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geom.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geom.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndices, 4));
    geom.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeights, 4));
    geom.setIndex(indices);
    geom.computeVertexNormals();

    const mesh = new THREE.SkinnedMesh(geom, maneMat);
    mesh.name = 'GiraffeMane';
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    mesh.bind(rig.skeleton);
    return mesh;
  }

  /**
   * 8. ARTICULATED TAIL STALK (SkinnedMesh) + FLOWING DARK HORSEHAIR TASSEL
   */
  function buildTail(rig, coatMat, darkHairMat) {
    const R = rig.rest;
    const M = GiraffeMath;

    const ctrl = [
      new THREE.Vector3(0, 2.31, -1.00), // embedded cleanly in smooth rear rump
      R.tail0.clone(),
      R.tail1.clone(),
      R.tail2.clone(),
      R.tail3.clone(),
    ];

    const numRings = 24;
    const radialSegs = 12;
    const curve = new THREE.CatmullRomCurve3(ctrl);
    const tailBones = [
      { boneIdx: rig.byName.pelvis.userData.index, s: 0.0 },
      { boneIdx: rig.byName.tail0.userData.index,  s: 0.22 },
      { boneIdx: rig.byName.tail1.userData.index,  s: 0.48 },
      { boneIdx: rig.byName.tail2.userData.index,  s: 0.74 },
      { boneIdx: rig.byName.tail3.userData.index,  s: 1.0 },
    ];

    const rings = [];
    const rightVec = new THREE.Vector3(1, 0, 0);
    const tang = new THREE.Vector3();
    const fwd = new THREE.Vector3();

    for (let i = 0; i < numRings; i++) {
      const s = i / (numRings - 1);
      const center = curve.getPoint(s);
      const pPrev = curve.getPoint(Math.max(0, s - 0.02));
      const pNext = curve.getPoint(Math.min(1, s + 0.02));
      tang.subVectors(pNext, pPrev).normalize();
      fwd.crossVectors(tang, rightVec).normalize();

      const radius = M.lerp(0.052, 0.017, Math.pow(s, 0.65));
      const swInfo = computeChainWeights(s, tailBones, 0.14);

      const ring = [];
      for (let c = 0; c < radialSegs; c++) {
        const a = (c / radialSegs) * Math.PI * 2;
        const pos = center.clone()
          .addScaledVector(rightVec, Math.sin(a) * radius)
          .addScaledVector(fwd, Math.cos(a) * radius);
        const spotMask = (1.0 - M.smoothstep(0.15, 0.65, s)) * 0.85;
        ring.push({
          pos,
          restPos: pos.clone().multiplyScalar(1.35),
          coatMeta: new THREE.Vector4(spotMask, 0.1 * (1 - s), 0.4 * s, 0.0),
          si: swInfo.si,
          sw: swInfo.sw,
        });
      }
      rings.push(ring);
    }

    const geom = buildLoftedSkinnedGeometry(rings, radialSegs, null, null);
    const tailMesh = new THREE.SkinnedMesh(geom, coatMat);
    tailMesh.name = 'GiraffeTail';
    tailMesh.castShadow = true;
    tailMesh.receiveShadow = true;
    tailMesh.frustumCulled = false;
    tailMesh.bind(rig.skeleton);

    // Lush layered black/espresso horsehair fly-swatter tassel on tail3 bone!
    const tasselGroup = new THREE.Group();
    tasselGroup.name = 'TailTassel';
    const rng = M.createRNG(707);

    // Core dense plume
    const corePts = [
      new THREE.Vector2(0.015, 0.0),
      new THREE.Vector2(0.032, -0.08),
      new THREE.Vector2(0.038, -0.18),
      new THREE.Vector2(0.026, -0.28),
      new THREE.Vector2(0.004, -0.35),
    ];
    const coreGeom = new THREE.LatheGeometry(corePts, 12);
    const coreMesh = new THREE.Mesh(coreGeom, darkHairMat);
    coreMesh.castShadow = true;
    tasselGroup.add(coreMesh);

    // Outer flowing wispy hair locks around the tassel
    const lockGeom = new THREE.ConeGeometry(0.0085, 0.34, 5);
    lockGeom.rotateX(Math.PI); // tip pointing down
    lockGeom.translate(0, -0.17, 0);

    for (let k = 0; k < 28; k++) {
      const a = (k / 28) * Math.PI * 2 + rng() * 0.2;
      const rad = 0.010 + rng() * 0.016;
      const lock = new THREE.Mesh(lockGeom, darkHairMat);
      lock.position.set(Math.cos(a) * rad, -rng() * 0.06, Math.sin(a) * rad);
      lock.rotation.set(Math.sin(a) * (0.06 + rng() * 0.08), 0, -Math.cos(a) * (0.06 + rng() * 0.08));
      lock.scale.set(0.8 + rng() * 0.5, 0.78 + rng() * 0.42, 0.8 + rng() * 0.5);
      lock.castShadow = true;
      tasselGroup.add(lock);
    }

    rig.byName.tail3.add(tasselGroup);
    return tailMesh;
  }

  /**
   * Master Builder: Creates the complete realistic giraffe assembly & attaches all parts to the rig!
   */
  GiraffeMesh.buildGiraffe = function () {
    const rig = GiraffeSkeleton.createRig();

    // Create all PBR materials
    const materials = {
      coat: GiraffeCoatMaterials.createCoatMaterial(),
      hoof: GiraffeCoatMaterials.createHoofMaterial(),
      eye: GiraffeCoatMaterials.createEyeMaterial(),
      mane: GiraffeCoatMaterials.createManeMaterial(),
      darkHair: GiraffeCoatMaterials.createDarkHairMaterial(),
      innerEar: GiraffeCoatMaterials.createInnerEarMaterial(),
      nostril: GiraffeCoatMaterials.createNostrilMaterial(),
    };

    const meshGroup = new THREE.Group();
    meshGroup.name = 'GiraffeMeshes';
    rig.rootGroup.add(meshGroup);

    // 1. Unified Torso + Neck + Head
    const { mesh: bodyMesh, dorsalCrestPoints } = buildBodyNeckHead(rig, materials.coat);
    meshGroup.add(bodyMesh);

    // 2. Four seamless sculpted legs + cloven hooves + dewclaws
    const legKeys = ['LF', 'RF', 'LH', 'RH'];
    for (const key of legKeys) {
      const legData = rig.legs[key];
      const legMesh = buildLegMesh(rig, legData, materials.coat);
      meshGroup.add(legMesh);

      // Cloven hoof mounted to hoof bone (coronet)
      const hoof = buildClovenHoof(materials.hoof, legData.isFront);
      legData.bones.hoof.add(hoof);

      // Small dark keratinous dewclaws behind fetlock!
      for (const sgn of [-1, 1]) {
        const dewGeom = new THREE.ConeGeometry(0.011, 0.036, 7);
        dewGeom.rotateX(Math.PI * 0.78);
        const dew = new THREE.Mesh(dewGeom, materials.hoof);
        dew.position.set(sgn * 0.020, -0.022, -0.052);
        dew.castShadow = true;
        legData.bones.fetlock.add(dew);
      }
    }

    // 3. Ossicones with dark fuzzy tufted caps
    buildOssicones(rig.byName.head, rig.rest.head, materials.coat, materials.darkHair);

    // 4. Cupped anatomical ears
    const ears = buildEars(rig, materials.coat, materials.innerEar);

    // 5. Recessed glossy eyes, animated eyelids, curved eyelashes & nostrils
    const eyelids = buildFaceDetails(
      rig.byName.head,
      rig.rest.head,
      materials.eye,
      materials.coat,
      materials.darkHair,
      materials.nostril
    );

    // 6. Lush erect dorsal neck mane
    const maneMesh = buildManeMesh(rig, dorsalCrestPoints, materials.mane);
    meshGroup.add(maneMesh);

    // 7. Articulated tail + flowing horsehair tassel
    const tailMesh = buildTail(rig, materials.coat, materials.darkHair);
    meshGroup.add(tailMesh);

    return {
      root: rig.rootGroup,
      rig,
      materials,
      eyelids,
      ears,
    };
  };

  global.GiraffeMesh = GiraffeMesh;
})(window);
