(function (global) {
  'use strict';

  const App = (global.GiraffeApp = global.GiraffeApp || {});
  const { clamp, lerp, smoothstep } = App.Math;

  function buildLoftGeometry(rings, radialSegs, capStart, capEnd) {
    const numRings = rings.length;
    const cols = radialSegs + 1;
    const positions = [];
    const restPositions = [];
    const uvs = [];
    const skinIndices = [];
    const skinWeights = [];
    const indices = [];

    for (let i = 0; i < numRings; i++) {
      const ring = rings[i];
      const v = i / (numRings - 1);
      for (let j = 0; j < cols; j++) {
        const pt = ring[j % radialSegs];
        positions.push(pt.pos.x, pt.pos.y, pt.pos.z);
        restPositions.push(pt.pos.x, pt.pos.y, pt.pos.z);
        uvs.push(j / radialSegs, v);
        skinIndices.push(
          pt.skinIndices[0],
          pt.skinIndices[1],
          pt.skinIndices[2],
          pt.skinIndices[3]
        );
        skinWeights.push(
          pt.skinWeights[0],
          pt.skinWeights[1],
          pt.skinWeights[2],
          pt.skinWeights[3]
        );
      }
    }

    // Verify outward triangle winding
    const midI = Math.floor(numRings * 0.5);
    const pA = rings[midI][0].pos;
    const pB = rings[midI + 1][0].pos;
    const pC = rings[midI][1].pos;
    const center = rings[midI][0].center;
    const e1 = new THREE.Vector3().subVectors(pB, pA);
    const e2 = new THREE.Vector3().subVectors(pC, pA);
    const triN = new THREE.Vector3().crossVectors(e1, e2);
    const outward = new THREE.Vector3().subVectors(pA, center);
    const flipWinding = triN.dot(outward) < 0;

    for (let i = 0; i < numRings - 1; i++) {
      for (let j = 0; j < radialSegs; j++) {
        const a = i * cols + j;
        const b = (i + 1) * cols + j;
        const c = (i + 1) * cols + (j + 1);
        const d = i * cols + (j + 1);
        if (!flipWinding) {
          indices.push(a, b, d);
          indices.push(b, c, d);
        } else {
          indices.push(a, d, b);
          indices.push(b, d, c);
        }
      }
    }

    if (capStart) {
      const ring0 = rings[0];
      const cIdx = positions.length / 3;
      const cPos = ring0[0].center;
      const si = ring0[0].skinIndices;
      const sw = ring0[0].skinWeights;
      positions.push(cPos.x, cPos.y, cPos.z);
      restPositions.push(cPos.x, cPos.y, cPos.z);
      uvs.push(0.5, 0);
      skinIndices.push(si[0], si[1], si[2], si[3]);
      skinWeights.push(sw[0], sw[1], sw[2], sw[3]);
      for (let j = 0; j < radialSegs; j++) {
        if (!flipWinding) indices.push(cIdx, j, j + 1);
        else indices.push(cIdx, j + 1, j);
      }
    }

    if (capEnd) {
      const last = numRings - 1;
      const ringL = rings[last];
      const cIdx = positions.length / 3;
      const cPos = ringL[0].center;
      const si = ringL[0].skinIndices;
      const sw = ringL[0].skinWeights;
      positions.push(cPos.x, cPos.y, cPos.z);
      restPositions.push(cPos.x, cPos.y, cPos.z);
      uvs.push(0.5, 1);
      skinIndices.push(si[0], si[1], si[2], si[3]);
      skinWeights.push(sw[0], sw[1], sw[2], sw[3]);
      const base = last * cols;
      for (let j = 0; j < radialSegs; j++) {
        if (!flipWinding) indices.push(cIdx, base + j + 1, base + j);
        else indices.push(cIdx, base + j, base + j + 1);
      }
    }

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geom.setAttribute('aRestPos', new THREE.Float32BufferAttribute(restPositions, 3));
    geom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geom.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndices, 4));
    geom.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeights, 4));
    geom.setIndex(indices);
    geom.computeVertexNormals();
    return geom;
  }

  function evalStation(stations, s) {
    if (s <= stations[0].s) return stations[0];
    const last = stations[stations.length - 1];
    if (s >= last.s) return last;
    let idx = 0;
    for (let i = 0; i < stations.length - 1; i++) {
      if (s >= stations[i].s && s <= stations[i + 1].s) {
        idx = i;
        break;
      }
    }
    const a = stations[idx];
    const b = stations[idx + 1];
    const t = (s - a.s) / Math.max(1e-6, b.s - a.s);
    const st = t * t * (3 - 2 * t);
    const out = { s };
    for (const key of Object.keys(a)) {
      if (key === 's') continue;
      const va = a[key] !== undefined ? a[key] : 0;
      const vb = b[key] !== undefined ? b[key] : 0;
      out[key] = key === 'boneHint' ? lerp(va, vb, t) : lerp(va, vb, st);
    }
    return out;
  }

  function chainSkinWeights(boneChain, boneHint) {
    const maxIdx = boneChain.length - 1;
    const clamped = clamp(boneHint, 0, maxIdx);
    const i0 = Math.floor(clamped);
    const i1 = Math.min(maxIdx, i0 + 1);
    const frac = clamped - i0;
    const w1 = smoothstep(0.0, 1.0, frac);
    return {
      skinIndices: [boneChain[i0], boneChain[i1], 0, 0],
      skinWeights: [1.0 - w1, w1, 0, 0],
    };
  }

  // ---------------------------------------------------------------------------
  // 1. CONTINUOUS TORSO + WITHERS + NECK MESH (Smooth curvature, ZERO spikes!)
  // ---------------------------------------------------------------------------
  function buildTorsoNeckGeometry(skelData) {
    const idx = skelData.index;
    const spineChain = [
      idx.pelvis,   // 0
      idx.spineMid, // 1
      idx.chest,    // 2
      idx.neck0,    // 3
      idx.neck1,    // 4
      idx.neck2,    // 5
      idx.neck3,    // 6
      idx.neck4,    // 7
      idx.neck5,    // 8
      idx.head,     // 9
    ];

    // Smooth, large-radius centerline sweep from rump through deep chest & withers up to atlas!
    // Curvature stays gentle everywhere so dorsal rings NEVER cross over!
    const rawStations = [
      // Rump & Pelvis
      { s: 0.000, z: -1.03, y: 1.98, rx: 0.05, ryTop: 0.05, ryBot: 0.05, topPinch: 0.05, botPinch: 0.05, withersY: 0.00, boneHint: 0.00 },
      { s: 0.035, z: -0.95, y: 2.02, rx: 0.22, ryTop: 0.19, ryBot: 0.21, topPinch: 0.12, botPinch: 0.08, withersY: 0.00, boneHint: 0.00 },
      { s: 0.095, z: -0.78, y: 2.06, rx: 0.35, ryTop: 0.27, ryBot: 0.31, topPinch: 0.14, botPinch: 0.10, withersY: 0.00, boneHint: 0.05 },
      { s: 0.165, z: -0.55, y: 2.10, rx: 0.385, ryTop: 0.30, ryBot: 0.36, topPinch: 0.15, botPinch: 0.12, withersY: 0.00, boneHint: 0.35 },
      // Lumbar / sleek flank
      { s: 0.245, z: -0.24, y: 2.16, rx: 0.375, ryTop: 0.34, ryBot: 0.40, topPinch: 0.16, botPinch: 0.14, withersY: 0.02, boneHint: 0.85 },
      // Deep barrel & rising slope toward withers
      { s: 0.330, z:  0.10, y: 2.24, rx: 0.39, ryTop: 0.42, ryBot: 0.50, topPinch: 0.20, botPinch: 0.18, withersY: 0.07, boneHint: 1.45 },
      // Prominent smooth WITHERS HUMP & deep brisket (gentle radius + vertical dorsal arch!)
      { s: 0.415, z:  0.44, y: 2.34, rx: 0.37, ryTop: 0.43, ryBot: 0.57, topPinch: 0.25, botPinch: 0.24, withersY: 0.15, boneHint: 2.00 },
      // Smooth sweeping chest-to-neck junction
      { s: 0.490, z:  0.67, y: 2.52, rx: 0.28, ryTop: 0.31, ryBot: 0.43, topPinch: 0.26, botPinch: 0.18, withersY: 0.06, boneHint: 2.80 },
      { s: 0.555, z:  0.84, y: 2.76, rx: 0.21, ryTop: 0.24, ryBot: 0.29, topPinch: 0.28, botPinch: 0.10, withersY: 0.00, boneHint: 3.60 },
      // Long graceful tapering laterally-compressed giraffe neck!
      { s: 0.630, z:  1.01, y: 3.06, rx: 0.176, ryTop: 0.205, ryBot: 0.238, topPinch: 0.28, botPinch: 0.08, withersY: 0.0, boneHint: 4.55 },
      { s: 0.705, z:  1.18, y: 3.38, rx: 0.152, ryTop: 0.178, ryBot: 0.202, topPinch: 0.28, botPinch: 0.06, withersY: 0.0, boneHint: 5.55 },
      { s: 0.780, z:  1.35, y: 3.70, rx: 0.132, ryTop: 0.155, ryBot: 0.172, topPinch: 0.27, botPinch: 0.05, withersY: 0.0, boneHint: 6.55 },
      { s: 0.855, z:  1.51, y: 4.00, rx: 0.114, ryTop: 0.134, ryBot: 0.146, topPinch: 0.25, botPinch: 0.05, withersY: 0.0, boneHint: 7.50 },
      { s: 0.930, z:  1.65, y: 4.28, rx: 0.094, ryTop: 0.112, ryBot: 0.116, topPinch: 0.22, botPinch: 0.05, withersY: 0.0, boneHint: 8.35 },
      // Atlas / throatlatch tucked cleanly inside cranium center (zero cheek grazing!)
      { s: 1.000, z:  1.77, y: 4.47, rx: 0.064, ryTop: 0.080, ryBot: 0.076, topPinch: 0.16, botPinch: 0.05, withersY: 0.0, boneHint: 8.92 },
    ];

    const numRings = 84;
    const radialSegs = 32;
    const centers = [];
    const params = [];

    for (let i = 0; i < numRings; i++) {
      const s = i / (numRings - 1);
      params.push(s);
      const st = evalStation(rawStations, s);
      centers.push(new THREE.Vector3(0, st.y, st.z));
    }

    // Smooth centerline heavily (8 passes) so tangent rotation through chest->neck is silky!
    for (let pass = 0; pass < 8; pass++) {
      const copy = centers.map((v) => v.clone());
      for (let i = 1; i < numRings - 1; i++) {
        centers[i]
          .copy(copy[i - 1])
          .multiplyScalar(0.24)
          .addScaledVector(copy[i], 0.52)
          .addScaledVector(copy[i + 1], 0.24);
      }
    }

    // Track dorsal crest curve for the upright mane so mane sits 100% flush with ZERO gap!
    const dorsalCrestSamples = [];
    const rings = [];

    for (let i = 0; i < numRings; i++) {
      const s = params[i];
      const st = evalStation(rawStations, s);
      const center = centers[i];

      const prev = centers[Math.max(0, i - 1)];
      const next = centers[Math.min(numRings - 1, i + 1)];
      const tangent = new THREE.Vector3().subVectors(next, prev).normalize();

      const sideAxis = new THREE.Vector3(1, 0, 0);
      const upAxis = new THREE.Vector3().crossVectors(tangent, sideAxis).normalize();

      const weights = chainSkinWeights(spineChain, st.boneHint);
      const ring = [];

      for (let j = 0; j < radialSegs; j++) {
        const theta = (j / radialSegs) * Math.PI * 2;
        const sinT = Math.sin(theta);
        const cosT = Math.cos(theta);

        let rx = st.rx;
        let ry = cosT >= 0 ? st.ryTop : st.ryBot;

        if (cosT > 0) {
          rx *= 1.0 - st.topPinch * Math.pow(cosT, 1.45);
        } else {
          rx *= 1.0 - st.botPinch * Math.pow(-cosT, 1.55);
        }

        // Subtle muscular shoulder fullness on sides of thorax
        let radialSide = sinT * rx;
        if (s > 0.30 && s < 0.48) {
          const sh = Math.sin(((s - 0.30) / 0.18) * Math.PI);
          const upperSide = Math.exp(-Math.pow((cosT - 0.1) / 0.55, 2));
          radialSide += Math.sign(sinT) * 0.024 * sh * upperSide * Math.abs(sinT);
        }

        const pos = center
          .clone()
          .addScaledVector(sideAxis, radialSide)
          .addScaledVector(upAxis, cosT * ry);

        // Smooth Gaussian dorsal withers hump (zero ring crossover, zero sharp ridge!)
        const wBell = Math.exp(-Math.pow((s - 0.395) / 0.095, 2));
        if (wBell > 0.01 && cosT > 0.0) {
          pos.y += 0.135 * wBell * Math.pow(cosT, 1.8);
        }

        ring.push({
          pos,
          center: center.clone(),
          skinIndices: weights.skinIndices,
          skinWeights: weights.skinWeights,
        });

        if (j === 0 && s >= 0.39) {
          dorsalCrestSamples.push({
            pos: pos.clone(),
            normal: upAxis.clone(),
            boneHint: st.boneHint,
            s,
          });
        }
      }
      rings.push(ring);
    }

    return {
      geometry: buildLoftGeometry(rings, radialSegs, true, true),
      dorsalCrestSamples,
    };
  }

  // ---------------------------------------------------------------------------
  // 2. DEDICATED ANATOMICAL GIRAFFE HEAD MESH (Cranium + Orbits + Boss + Muzzle + Jaw!)
  // ---------------------------------------------------------------------------
  function buildHeadGeometry(skelData) {
    const idx = skelData.index;
    const headIdx = idx.head;
    const neck5Idx = idx.neck5;

    // Refined aristocratic giraffe head axis (glass-smooth occipital dome + sculpted jaw -> nose tip 2.388!)
    const headStations = [
      // Rounded occipital dome seated cleanly over atlas (100% rigid cranium -> zero cheek crease!)
      { s: 0.00, z: 1.668, y: 4.468, rx: 0.044, ryT: 0.052, ryB: 0.054, topP: 0.06, botP: 0.06, cheek: 0.0, orbit: 0.0, boss: 0.0, chin: 0.0, nos: 0.0, wH: 0.92 },
      { s: 0.06, z: 1.718, y: 4.486, rx: 0.096, ryT: 0.108, ryB: 0.114, topP: 0.08, botP: 0.08, cheek: 0.008, orbit: 0.0, boss: 0.0, chin: 0.0, nos: 0.0, wH: 0.98 },
      { s: 0.14, z: 1.780, y: 4.500, rx: 0.116, ryT: 0.132, ryB: 0.140, topP: 0.12, botP: 0.12, cheek: 0.016, orbit: 0.0, boss: 0.0, chin: 0.0, nos: 0.0, wH: 1.00 },
      // Broad cranium & clean sculpted mandible jowl
      { s: 0.25, z: 1.860, y: 4.508, rx: 0.119, ryT: 0.146, ryB: 0.144, topP: 0.14, botP: 0.16, cheek: 0.020, orbit: 0.0, boss: 0.0, chin: 0.0, nos: 0.0, wH: 1.00 },
      // Prominent lateral eye orbits & characteristic forehead bony boss (third median ossicone!)
      { s: 0.40, z: 1.970, y: 4.490, rx: 0.114, ryT: 0.128, ryB: 0.126, topP: 0.16, botP: 0.22, cheek: 0.014, orbit: 0.029, boss: 0.032, chin: 0.0, nos: 0.0, wH: 1.0 },
      // Refined forehead stop -> slender slightly concave nasal bridge!
      { s: 0.56, z: 2.090, y: 4.415, rx: 0.072, ryT: 0.082, ryB: 0.088, topP: 0.22, botP: 0.28, cheek: 0.0, orbit: 0.0, boss: 0.010, chin: 0.0, nos: 0.0, wH: 1.0 },
      { s: 0.72, z: 2.210, y: 4.355, rx: 0.056, ryT: 0.064, ryB: 0.070, topP: 0.20, botP: 0.26, cheek: 0.0, orbit: 0.0, boss: 0.0, chin: 0.006, nos: 0.004, wH: 1.0 },
      // Flared nostril wings + distinct rounded prehensile upper lip & lower jaw/chin!
      { s: 0.87, z: 2.315, y: 4.308, rx: 0.059, ryT: 0.065, ryB: 0.062, topP: 0.08, botP: 0.16, cheek: 0.0, orbit: 0.0, boss: 0.0, chin: 0.016, nos: 0.020, wH: 1.0 },
      { s: 0.95, z: 2.362, y: 4.290, rx: 0.050, ryT: 0.052, ryB: 0.044, topP: 0.06, botP: 0.12, cheek: 0.0, orbit: 0.0, boss: 0.0, chin: 0.009, nos: 0.006, wH: 1.0 },
      // Soft rounded velvety nose tip
      { s: 1.00, z: 2.388, y: 4.286, rx: 0.014, ryT: 0.016, ryB: 0.012, topP: 0.0, botP: 0.0, cheek: 0.0, orbit: 0.0, boss: 0.0, chin: 0.0, nos: 0.0, wH: 1.0 },
    ];

    const numRings = 56;
    const radialSegs = 36;
    const centers = [];
    const params = [];

    for (let i = 0; i < numRings; i++) {
      const s = i / (numRings - 1);
      params.push(s);
      const st = evalStation(headStations, s);
      centers.push(new THREE.Vector3(0, st.y, st.z));
    }
    // 4-pass Laplacian centerline smoothing for silky cranium-to-nasal-bridge flow
    for (let pass = 0; pass < 4; pass++) {
      const copy = centers.map((c) => c.clone());
      for (let i = 1; i < numRings - 1; i++) {
        centers[i].y = copy[i - 1].y * 0.25 + copy[i].y * 0.5 + copy[i + 1].y * 0.25;
        centers[i].z = copy[i - 1].z * 0.25 + copy[i].z * 0.5 + copy[i + 1].z * 0.25;
      }
    }

    const rings = [];
    for (let i = 0; i < numRings; i++) {
      const s = params[i];
      const st = evalStation(headStations, s);
      const center = centers[i];

      const prev = centers[Math.max(0, i - 1)];
      const next = centers[Math.min(numRings - 1, i + 1)];
      const tangent = new THREE.Vector3().subVectors(next, prev).normalize();
      const sideAxis = new THREE.Vector3(1, 0, 0);
      const upAxis = new THREE.Vector3().crossVectors(tangent, sideAxis).normalize();

      const wH = st.wH;
      const si = [headIdx, neck5Idx, 0, 0];
      const sw = [wH, 1.0 - wH, 0, 0];

      const ring = [];
      for (let j = 0; j < radialSegs; j++) {
        const theta = (j / radialSegs) * Math.PI * 2;
        const sinT = Math.sin(theta);
        const cosT = Math.cos(theta);

        let rx = st.rx;
        let ry = cosT >= 0 ? st.ryT : st.ryB;

        if (cosT > 0) rx *= 1.0 - st.topP * Math.pow(cosT, 1.5);
        else rx *= 1.0 - st.botP * Math.pow(-cosT, 1.4);

        let rSide = sinT * rx;
        let rUp = cosT * ry;

        // Rounded masseter cheek/jaw fullness
        if (st.cheek > 0 && cosT < 0.1 && cosT > -0.88) {
          const ch = Math.sin(clamp((cosT + 0.88) / 0.98, 0, 1) * Math.PI);
          rSide += Math.sign(sinT) * st.cheek * Math.abs(sinT) * ch;
        }

        // Bony lateral orbital brow ridge around the eyes
        if (st.orbit > 0) {
          const band = Math.exp(-Math.pow((cosT - 0.30) / 0.34, 2));
          rSide += Math.sign(sinT) * st.orbit * Math.pow(Math.abs(sinT), 1.4) * band;
        }

        // Characteristic forehead bony median boss
        if (st.boss > 0 && cosT > 0.55) {
          rUp += st.boss * Math.pow((cosT - 0.55) / 0.45, 2.0);
        }

        // Flared velvety nostril wings + subtle recessed dark nostril dimples
        if (st.nos > 0) {
          const wing = Math.exp(-Math.pow((cosT - 0.25) / 0.35, 2));
          rSide += Math.sign(sinT) * st.nos * Math.abs(sinT) * wing;
        }

        // Distinct lower lip & mouth cleft groove under muzzle
        if (st.chin > 0 && cosT < -0.35) {
          // Subtle horizontal mouth crease around cosT ~ -0.50, rounded chin below
          const crease = Math.exp(-Math.pow((cosT + 0.52) / 0.14, 2));
          rSide -= Math.sign(sinT) * 0.006 * crease;
          rUp -= st.chin * Math.pow((-cosT - 0.35) / 0.65, 1.5);
        }

        const pos = center
          .clone()
          .addScaledVector(sideAxis, rSide)
          .addScaledVector(upAxis, rUp);

        ring.push({
          pos,
          center: center.clone(),
          skinIndices: si,
          skinWeights: sw,
        });
      }
      rings.push(ring);
    }

    return buildLoftGeometry(rings, radialSegs, true, true);
  }

  // ---------------------------------------------------------------------------
  // 3. SCULPTED ANATOMICAL LIMB MESH (Seamless Shoulder/Haunch -> Coronet)
  // ---------------------------------------------------------------------------
  function buildLegGeometry(skelData, legKey) {
    const spec = skelData.legSpecs[legKey];
    const isFront = spec.isFront;
    const side = spec.sideSign;
    const pts = spec.restPoints; // [0:sh/hip, 1:elb/stif, 2:carp/hock, 3:fetl, 4:hoof]
    const boneIdx = spec.indices;
    const parentTorsoBone = isFront ? skelData.index.chest : skelData.index.pelvis;

    // Top muscular scapula / gluteal skirt tucked cleanly INSIDE the torso so it NEVER pokes through the backline!
    const topBlend = pts[0].clone();
    if (isFront) {
      topBlend.x -= side * 0.18;
      topBlend.y += 0.14;
      topBlend.z -= 0.04;
    } else {
      topBlend.x -= side * 0.19;
      topBlend.y += 0.03;
      topBlend.z += 0.12;
    }

    // Extend coronet collar cleanly down over hoof top (88% along fetlock->hoof)
    // weighted 100% to hoof bone so pastern wraps seamlessly at EVERY hoof pitch angle!
    const coronet = new THREE.Vector3().lerpVectors(pts[3], pts[4], 0.88);

    let stations;
    if (isFront) {
      const sh = pts[0], elb = pts[1], carp = pts[2], fet = pts[3];
      const shAbove = new THREE.Vector3().lerpVectors(topBlend, sh, 0.52);
      const shMid = new THREE.Vector3().lerpVectors(sh, elb, 0.48);
      const foreUpper = new THREE.Vector3().lerpVectors(elb, carp, 0.24);
      const foreMid = new THREE.Vector3().lerpVectors(elb, carp, 0.62);
      const carpAbove = new THREE.Vector3().lerpVectors(elb, carp, 0.90);
      const carpBelow = new THREE.Vector3().lerpVectors(carp, fet, 0.12);
      const canMid = new THREE.Vector3().lerpVectors(carp, fet, 0.55);
      const fetAbove = new THREE.Vector3().lerpVectors(carp, fet, 0.89);
      const pasMid = new THREE.Vector3().lerpVectors(fet, coronet, 0.52);

      stations = [
        { pos: topBlend,  rx: 0.085, rzF: 0.15,  rzB: 0.16,  bA: parentTorsoBone, bB: boneIdx[0], wB: 0.00 },
        { pos: shAbove,   rx: 0.145, rzF: 0.19,  rzB: 0.21,  bA: parentTorsoBone, bB: boneIdx[0], wB: 0.32 },
        { pos: sh,        rx: 0.145, rzF: 0.175, rzB: 0.195, bA: parentTorsoBone, bB: boneIdx[0], wB: 0.78 },
        { pos: shMid,     rx: 0.112, rzF: 0.125, rzB: 0.155, bA: boneIdx[0],      bB: boneIdx[1], wB: 0.22 },
        { pos: elb,       rx: 0.090, rzF: 0.095, rzB: 0.128, bA: boneIdx[0],      bB: boneIdx[1], wB: 0.72 },
        { pos: foreUpper, rx: 0.082, rzF: 0.088, rzB: 0.098, bA: boneIdx[1],      bB: boneIdx[1], wB: 0.00 },
        { pos: foreMid,   rx: 0.060, rzF: 0.064, rzB: 0.070, bA: boneIdx[1],      bB: boneIdx[2], wB: 0.10 },
        { pos: carpAbove, rx: 0.055, rzF: 0.061, rzB: 0.063, bA: boneIdx[1],      bB: boneIdx[2], wB: 0.38 },
        { pos: carp,      rx: 0.060, rzF: 0.068, rzB: 0.066, bA: boneIdx[1],      bB: boneIdx[2], wB: 0.68 },
        { pos: carpBelow, rx: 0.046, rzF: 0.050, rzB: 0.055, bA: boneIdx[2],      bB: boneIdx[2], wB: 0.00 },
        { pos: canMid,    rx: 0.039, rzF: 0.042, rzB: 0.048, bA: boneIdx[2],      bB: boneIdx[2], wB: 0.00 },
        { pos: fetAbove,  rx: 0.041, rzF: 0.044, rzB: 0.050, bA: boneIdx[2],      bB: boneIdx[3], wB: 0.25 },
        { pos: fet,       rx: 0.050, rzF: 0.050, rzB: 0.066, bA: boneIdx[2],      bB: boneIdx[3], wB: 0.65 },
        { pos: pasMid,    rx: 0.044, rzF: 0.048, rzB: 0.048, bA: boneIdx[3],      bB: boneIdx[4], wB: 0.45 },
        { pos: coronet,   rx: 0.054, rzF: 0.064, rzB: 0.054, bA: boneIdx[3],      bB: boneIdx[4], wB: 1.00 },
      ];
    } else {
      const hip = pts[0], stif = pts[1], hock = pts[2], fet = pts[3];
      const hipAbove = new THREE.Vector3().lerpVectors(topBlend, hip, 0.52);
      const thighMid = new THREE.Vector3().lerpVectors(hip, stif, 0.50);
      const gaskUpper = new THREE.Vector3().lerpVectors(stif, hock, 0.28);
      const gaskMid = new THREE.Vector3().lerpVectors(stif, hock, 0.62);
      const hockAbove = new THREE.Vector3().lerpVectors(stif, hock, 0.88);
      const hockBelow = new THREE.Vector3().lerpVectors(hock, fet, 0.14);
      const canMid = new THREE.Vector3().lerpVectors(hock, fet, 0.55);
      const fetAbove = new THREE.Vector3().lerpVectors(hock, fet, 0.89);
      const pasMid = new THREE.Vector3().lerpVectors(fet, coronet, 0.52);

      stations = [
        { pos: topBlend,  rx: 0.092, rzF: 0.155, rzB: 0.165, bA: parentTorsoBone, bB: boneIdx[0], wB: 0.00 },
        { pos: hipAbove,  rx: 0.146, rzF: 0.198, rzB: 0.210, bA: parentTorsoBone, bB: boneIdx[0], wB: 0.34 },
        { pos: hip,       rx: 0.155, rzF: 0.205, rzB: 0.225, bA: parentTorsoBone, bB: boneIdx[0], wB: 0.78 },
        { pos: thighMid,  rx: 0.126, rzF: 0.155, rzB: 0.185, bA: boneIdx[0],      bB: boneIdx[1], wB: 0.22 },
        { pos: stif,      rx: 0.098, rzF: 0.115, rzB: 0.145, bA: boneIdx[0],      bB: boneIdx[1], wB: 0.68 },
        { pos: gaskUpper, rx: 0.084, rzF: 0.086, rzB: 0.120, bA: boneIdx[1],      bB: boneIdx[1], wB: 0.00 },
        { pos: gaskMid,   rx: 0.060, rzF: 0.064, rzB: 0.092, bA: boneIdx[1],      bB: boneIdx[2], wB: 0.12 },
        { pos: hockAbove, rx: 0.054, rzF: 0.058, rzB: 0.084, bA: boneIdx[1],      bB: boneIdx[2], wB: 0.42 },
        { pos: hock,      rx: 0.056, rzF: 0.060, rzB: 0.094, bA: boneIdx[1],      bB: boneIdx[2], wB: 0.72 },
        { pos: hockBelow, rx: 0.044, rzF: 0.046, rzB: 0.060, bA: boneIdx[2],      bB: boneIdx[2], wB: 0.00 },
        { pos: canMid,    rx: 0.039, rzF: 0.042, rzB: 0.050, bA: boneIdx[2],      bB: boneIdx[2], wB: 0.00 },
        { pos: fetAbove,  rx: 0.041, rzF: 0.044, rzB: 0.050, bA: boneIdx[2],      bB: boneIdx[3], wB: 0.25 },
        { pos: fet,       rx: 0.050, rzF: 0.050, rzB: 0.066, bA: boneIdx[2],      bB: boneIdx[3], wB: 0.65 },
        { pos: pasMid,    rx: 0.044, rzF: 0.048, rzB: 0.048, bA: boneIdx[3],      bB: boneIdx[4], wB: 0.45 },
        { pos: coronet,   rx: 0.054, rzF: 0.064, rzB: 0.054, bA: boneIdx[3],      bB: boneIdx[4], wB: 1.00 },
      ];
    }

    const denseStations = [];
    const subPerSeg = 3;
    for (let i = 0; i < stations.length - 1; i++) {
      const a = stations[i];
      const b = stations[i + 1];
      const count = i === stations.length - 2 ? subPerSeg + 1 : subPerSeg;
      for (let k = 0; k < count; k++) {
        const t = k / subPerSeg;
        const st = t * t * (3 - 2 * t);
        const wMap = {};
        const addW = (bIdx, w) => {
          if (w <= 1e-4) return;
          wMap[bIdx] = (wMap[bIdx] || 0) + w;
        };
        addW(a.bA, (1 - a.wB) * (1 - t));
        addW(a.bB, a.wB * (1 - t));
        addW(b.bA, (1 - b.wB) * t);
        addW(b.bB, b.wB * t);

        const entries = Object.entries(wMap)
          .map(([bi, w]) => [parseInt(bi, 10), w])
          .sort((u, v) => v[1] - u[1])
          .slice(0, 4);
        let sum = 0;
        for (const e of entries) sum += e[1];
        const si = [0, 0, 0, 0];
        const sw = [0, 0, 0, 0];
        for (let e = 0; e < entries.length; e++) {
          si[e] = entries[e][0];
          sw[e] = entries[e][1] / (sum || 1);
        }

        denseStations.push({
          pos: new THREE.Vector3().lerpVectors(a.pos, b.pos, t),
          rx: lerp(a.rx, b.rx, st),
          rzF: lerp(a.rzF, b.rzF, st),
          rzB: lerp(a.rzB, b.rzB, st),
          si,
          sw,
        });
      }
    }

    const radialSegs = 20;
    const rings = [];
    for (let i = 0; i < denseStations.length; i++) {
      const st = denseStations[i];
      const prev = denseStations[Math.max(0, i - 1)].pos;
      const next = denseStations[Math.min(denseStations.length - 1, i + 1)].pos;
      const down = new THREE.Vector3().subVectors(next, prev).normalize();

      const sideAxis = new THREE.Vector3(1, 0, 0);
      const fwdAxis = new THREE.Vector3().crossVectors(sideAxis, down).normalize();
      if (fwdAxis.z < 0) fwdAxis.negate();

      const ring = [];
      for (let j = 0; j < radialSegs; j++) {
        const theta = (j / radialSegs) * Math.PI * 2;
        const cosT = Math.cos(theta);
        const sinT = Math.sin(theta);
        const rz = cosT >= 0 ? st.rzF : st.rzB;
        let rx = st.rx;
        if (cosT < -0.2 && i > 14 && i < denseStations.length - 6) {
          rx *= 1.0 - 0.22 * Math.pow(-cosT, 1.8);
        }
        const pos = st.pos
          .clone()
          .addScaledVector(fwdAxis, cosT * rz)
          .addScaledVector(sideAxis, sinT * rx);

        ring.push({
          pos,
          center: st.pos.clone(),
          skinIndices: st.si,
          skinWeights: st.sw,
        });
      }
      rings.push(ring);
    }

    return buildLoftGeometry(rings, radialSegs, true, true);
  }

  // ---------------------------------------------------------------------------
  // 4. CLOVEN HOOVES & DEWCLAWS
  // ---------------------------------------------------------------------------
  function createClovenHoofGroup(hoofMat, coatMat) {
    const group = new THREE.Group();
    for (const s of [-1, 1]) {
      const toeGeom = new THREE.CylinderGeometry(0.028, 0.040, 0.098, 14, 4);
      const pos = toeGeom.attributes.position;
      const v = new THREE.Vector3();
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i);
        const h = (v.y + 0.049) / 0.098;
        if (v.x * s < 0) v.x *= 0.42;
        else v.x *= 1.06;
        if (v.z > 0) v.z *= lerp(1.78, 1.24, h);
        else v.z *= lerp(1.24, 0.96, h);
        // Subtle inward bevel at top hairline so keratin locks seamlessly into fur coronet
        const crownTaper = 1.0 - smoothstep(0.76, 1.0, h) * 0.14;
        v.x *= crownTaper;
        v.z = v.z * crownTaper - h * 0.040;
        v.y += 0.049;
        pos.setXYZ(i, v.x, v.y, v.z);
      }
      toeGeom.computeVertexNormals();
      const toeMesh = new THREE.Mesh(toeGeom, hoofMat);
      toeMesh.position.set(s * 0.023, 0, 0.010);
      toeMesh.castShadow = true;
      toeMesh.receiveShadow = true;
      group.add(toeMesh);
    }

    // Sleek cream-fur coronet collar seated tightly over the tapered hoof crown (zero bump & zero heel gap!)
    const cuffGeom = new THREE.SphereGeometry(0.047, 16, 12);
    cuffGeom.scale(0.96, 0.62, 0.90);
    cuffGeom.translate(0, 0.094, -0.015);
    bakeRestPosOffset(cuffGeom, new THREE.Vector3(0.25, 0.10, 0.30), null);
    const cuffMesh = new THREE.Mesh(cuffGeom, coatMat);
    cuffMesh.castShadow = true;
    group.add(cuffMesh);

    return group;
  }

  function createDewclawsGroup(hoofMat) {
    const group = new THREE.Group();
    const geom = new THREE.ConeGeometry(0.010, 0.030, 8);
    geom.rotateX(-Math.PI * 0.72);
    for (const s of [-1, 1]) {
      const claw = new THREE.Mesh(geom, hoofMat);
      claw.position.set(s * 0.020, -0.022, -0.056);
      claw.castShadow = true;
      group.add(claw);
    }
    return group;
  }

  // ---------------------------------------------------------------------------
  // 5. HEAD DETAILS (Deeply-seated Ossicones, Ears, Glossy Eyes, Blinking Eyelids & Lashes)
  // ---------------------------------------------------------------------------
  function bakeRestPosOffset(geometry, headRestPos, localMatrix) {
    const posAttr = geometry.attributes.position;
    const restArr = new Float32Array(posAttr.count * 3);
    const v = new THREE.Vector3();
    for (let i = 0; i < posAttr.count; i++) {
      v.fromBufferAttribute(posAttr, i);
      if (localMatrix) v.applyMatrix4(localMatrix);
      v.add(headRestPos);
      restArr[i * 3] = v.x;
      restArr[i * 3 + 1] = v.y;
      restArr[i * 3 + 2] = v.z;
    }
    geometry.setAttribute('aRestPos', new THREE.BufferAttribute(restArr, 3));
  }

  function attachHeadDetails(skelData, coatMat, eyeMat, hairMat, innerEarMat) {
    const headBone = skelData.bones[skelData.index.head];
    const headRest = skelData.restPositions[skelData.index.head]; // (0, 4.46, 1.80)

    const animParts = {
      earL: null,
      earR: null,
      eyelidUpperL: null,
      eyelidUpperR: null,
      nostrilL: null,
      nostrilR: null,
    };

    // --- A. TWO DEEPLY-SEATED OSSICONES + SHAGGY DARK HAIR TUFTS ---
    // Cranium top at z=1.85 is y = 4.51 + 0.145 = 4.655 -> local y = +0.195;
    // We sink the ossicone roots down to local y = +0.115 so they emerge seamlessly from the skull!
    for (const s of [-1, 1]) {
      const ossiGroup = new THREE.Group();
      ossiGroup.position.set(s * 0.044, 0.115, 0.055);
      ossiGroup.rotation.set(-0.22, 0, -s * 0.13);
      ossiGroup.updateMatrix();

      const shaftLen = 0.22;
      const shaftGeom = new THREE.CylinderGeometry(0.016, 0.029, shaftLen, 14, 8);
      const sp = shaftGeom.attributes.position;
      for (let i = 0; i < sp.count; i++) {
        let x = sp.getX(i);
        let y = sp.getY(i) + shaftLen * 0.5;
        let z = sp.getZ(i);
        const h = y / shaftLen;
        const flareBase = 0.42 * Math.pow(1 - h, 3.2);
        const knobTip = 0.25 * Math.exp(-Math.pow((h - 0.92) / 0.13, 2));
        const scale = 1.0 + flareBase + knobTip;
        sp.setXYZ(i, x * scale, y, z * scale);
      }
      shaftGeom.computeVertexNormals();
      bakeRestPosOffset(shaftGeom, headRest, ossiGroup.matrix);

      const shaftMesh = new THREE.Mesh(shaftGeom, coatMat);
      shaftMesh.castShadow = true;
      ossiGroup.add(shaftMesh);

      // Natural bristly dark-espresso hair tuft crown on ossicone tip (multi-tuft fluffy rosette!)
      const tuftGroup = new THREE.Group();
      tuftGroup.position.set(0, shaftLen - 0.004, 0);
      const tuftCore = new THREE.SphereGeometry(0.023, 14, 12);
      tuftCore.scale(1.04, 1.28, 1.04);
      const tp = tuftCore.attributes.position;
      for (let i = 0; i < tp.count; i++) {
        const vx = tp.getX(i), vy = tp.getY(i), vz = tp.getZ(i);
        const j = 1.0 + 0.16 * Math.sin(vx * 130 + vz * 95) * Math.cos(vy * 85);
        tp.setXYZ(i, vx * j, vy * j, vz * j);
      }
      tuftCore.computeVertexNormals();
      const coreMesh = new THREE.Mesh(tuftCore, hairMat);
      coreMesh.castShadow = true;
      tuftGroup.add(coreMesh);

      // Fine radiating bristly hair locks crowning each ossicone
      const bristleGeom = new THREE.ConeGeometry(0.0065, 0.032, 5);
      bristleGeom.translate(0, 0.014, 0);
      for (let b = 0; b < 9; b++) {
        const ang = (b / 9) * Math.PI * 2 + (s > 0 ? 0.3 : 0.0);
        const tilt = 0.25 + (b % 3) * 0.18;
        const bristle = new THREE.Mesh(bristleGeom, hairMat);
        bristle.position.set(Math.cos(ang) * 0.011, 0.006, Math.sin(ang) * 0.011);
        bristle.rotation.set(Math.sin(ang) * tilt, ang, -Math.cos(ang) * tilt);
        tuftGroup.add(bristle);
      }
      ossiGroup.add(tuftGroup);

      headBone.add(ossiGroup);
    }

    // --- A2. SCULPTED 3D SLIT NOSTRILS (Dark oval recessed slits on upper snout!) ---
    const nostrilMat = new THREE.MeshStandardMaterial({
      color: App.Materials.srgbColor(0x16100d),
      roughness: 0.72,
      metalness: 0.0,
    });
    for (const s of [-1, 1]) {
      const nosGeom = new THREE.SphereGeometry(0.0145, 12, 10);
      nosGeom.scale(0.56, 0.60, 1.70);
      const nosMesh = new THREE.Mesh(nosGeom, nostrilMat);
      // Seated cleanly proud of the flared upper-lateral snout wall (visible in portrait & 3/4!)
      nosMesh.position.set(s * 0.061, -0.126, 0.514);
      nosMesh.rotation.set(0.32, s * 0.24, s * 0.18);
      headBone.add(nosMesh);
      if (s > 0) animParts.nostrilL = nosMesh;
      else animParts.nostrilR = nosMesh;
    }

    // --- B. TWO SNUGLY-ROOTED ARTICULATED LEAF-SHAPED EARS ---
    for (const s of [-1, 1]) {
      const earPivot = new THREE.Group();
      // Rooted snugly into the side-rear of the cranium (zero detachment!)
      earPivot.position.set(s * 0.072, 0.095, -0.025);
      earPivot.userData.baseRot = new THREE.Euler(0.16, s * 0.34, -s * 0.96);
      earPivot.rotation.copy(earPivot.userData.baseRot);
      earPivot.updateMatrix();

      // Tubular ear base collar sunk deeply & smoothly into cranium
      const collarGeom = new THREE.CylinderGeometry(0.022, 0.035, 0.056, 12);
      collarGeom.translate(0, 0.002, -0.004);
      bakeRestPosOffset(collarGeom, headRest, earPivot.matrix);
      earPivot.add(new THREE.Mesh(collarGeom, coatMat));

      const earGeom = new THREE.PlaneGeometry(0.094, 0.225, 12, 16);
      const ep = earGeom.attributes.position;
      for (let i = 0; i < ep.count; i++) {
        let x = ep.getX(i);
        let y = ep.getY(i) + 0.1125;
        const u = x / 0.047;
        const v = y / 0.225;
        const widthEnv = Math.sin(Math.pow(v, 0.72) * Math.PI);
        x = u * 0.050 * (0.26 + 0.86 * widthEnv);
        const cup = (u * u - 0.55) * 0.022 * Math.sin(v * Math.PI);
        const arch = -0.018 * v * v;
        ep.setXYZ(i, x, y, cup + arch);
      }
      earGeom.computeVertexNormals();

      const outerGeom = earGeom.clone();
      const op = outerGeom.attributes.position;
      for (let i = 0; i < op.count; i++) op.setZ(i, op.getZ(i) - 0.005);
      const oIdx = outerGeom.index;
      for (let i = 0; i < oIdx.count; i += 3) {
        const b = oIdx.getX(i + 1);
        const c = oIdx.getX(i + 2);
        oIdx.setX(i + 1, c);
        oIdx.setX(i + 2, b);
      }
      outerGeom.computeVertexNormals();
      bakeRestPosOffset(outerGeom, headRest, earPivot.matrix);

      const outerEar = new THREE.Mesh(outerGeom, coatMat);
      outerEar.castShadow = true;
      earPivot.add(outerEar);

      const innerGeom = earGeom.clone();
      innerGeom.scale(0.84, 0.92, 1.0);
      innerGeom.translate(0, 0.010, 0.002);
      earPivot.add(new THREE.Mesh(innerGeom, innerEarMat));

      const rimGeom = new THREE.TorusGeometry(0.048, 0.0055, 6, 18);
      rimGeom.scale(0.95, 2.20, 0.75);
      rimGeom.translate(0, 0.115, -0.004);
      bakeRestPosOffset(rimGeom, headRest, earPivot.matrix);
      earPivot.add(new THREE.Mesh(rimGeom, coatMat));

      headBone.add(earPivot);
      if (s > 0) animParts.earL = earPivot;
      else animParts.earR = earPivot;
    }

    // --- C. EXPRESSIVE GLOSSY EYES, BLINKING EYELIDS & LONG CURVED EYELASHES ---
    for (const s of [-1, 1]) {
      const eyeGroup = new THREE.Group();
      // Seated snugly inside the sculpted orbital brow sockets!
      eyeGroup.position.set(s * 0.108, 0.036, 0.165);
      eyeGroup.rotation.set(0.05, s * 1.04, 0);
      eyeGroup.updateMatrix();

      const ballGeom = new THREE.SphereGeometry(0.0295, 22, 18);
      const ballMesh = new THREE.Mesh(ballGeom, eyeMat);
      ballMesh.rotation.y = -Math.PI * 0.5;
      eyeGroup.add(ballMesh);

      const lidPivot = new THREE.Group();
      const upperLidGeom = new THREE.SphereGeometry(
        0.0325,
        16,
        10,
        0,
        Math.PI * 2,
        0,
        Math.PI * 0.50
      );
      bakeRestPosOffset(upperLidGeom, headRest, eyeGroup.matrix);
      lidPivot.userData.openRotX = -0.45;
      lidPivot.userData.closedRotX = 0.62;
      lidPivot.rotation.x = lidPivot.userData.openRotX;
      lidPivot.add(new THREE.Mesh(upperLidGeom, coatMat));

      // Iconic long lush curved dark giraffe eyelashes (13 slender arched lashes!)
      const lashGeom = new THREE.ConeGeometry(0.0011, 0.026, 4);
      lashGeom.translate(0, 0.013, 0);
      for (let k = -6; k <= 6; k++) {
        const ang = k * 0.155;
        const lash = new THREE.Mesh(lashGeom, hairMat);
        const r = 0.0322;
        const lenScale = 1.05 - Math.abs(k) * 0.065;
        lash.scale.set(1.0, lenScale, 1.0);
        lash.position.set(Math.sin(ang) * r, -0.001, Math.cos(ang) * r);
        lash.rotation.set(Math.PI * 0.40, ang, -ang * 0.22);
        lidPivot.add(lash);
      }
      eyeGroup.add(lidPivot);

      const lowerLidGeom = new THREE.SphereGeometry(
        0.0322,
        16,
        8,
        0,
        Math.PI * 2,
        Math.PI * 0.66,
        Math.PI * 0.34
      );
      bakeRestPosOffset(lowerLidGeom, headRest, eyeGroup.matrix);
      eyeGroup.add(new THREE.Mesh(lowerLidGeom, coatMat));

      headBone.add(eyeGroup);
      if (s > 0) animParts.eyelidUpperL = lidPivot;
      else animParts.eyelidUpperR = lidPivot;
    }

    // --- D. DELICATE TACTILE MUZZLE WHISKERS (VIBRISSAE) ---
    const whiskerMat = new THREE.MeshStandardMaterial({
      color: App.Materials.srgbColor(0x52453a),
      roughness: 0.85,
      metalness: 0.0,
    });
    const whiskerGeom = new THREE.ConeGeometry(0.0008, 0.036, 4);
    whiskerGeom.translate(0, 0.018, 0);
    const wRng = App.Math.createRNG(3344);
    for (const s of [-1, 1]) {
      for (let k = 0; k < 6; k++) {
        const wMesh = new THREE.Mesh(whiskerGeom, whiskerMat);
        const along = k / 5;
        const wz = 0.470 + along * 0.095;
        const wy = -0.172 - along * 0.016 + (wRng() - 0.5) * 0.012;
        const wx = s * (0.048 - along * 0.012);
        wMesh.position.set(wx, wy, wz);
        wMesh.rotation.set(
          Math.PI * 0.54 + (wRng() - 0.5) * 0.22,
          s * (0.28 + wRng() * 0.28),
          -s * (1.05 + (wRng() - 0.5) * 0.22)
        );
        wMesh.scale.set(1.0, 0.65 + wRng() * 0.48, 1.0);
        headBone.add(wMesh);
      }
    }

    return animParts;
  }

  // ---------------------------------------------------------------------------
  // 6. FLUSH-FITTING SKINNED UPRIGHT DORSAL MANE (Built directly from dorsal crest!)
  // ---------------------------------------------------------------------------
  function buildManeGeometry(skelData, dorsalCrestSamples) {
    const idx = skelData.index;
    const spineChain = [
      idx.pelvis, idx.spineMid, idx.chest,
      idx.neck0, idx.neck1, idx.neck2, idx.neck3, idx.neck4, idx.neck5, idx.head,
    ];

    const count = dorsalCrestSamples.length;
    const positions = [];
    const uvs = [];
    const skinIndices = [];
    const skinWeights = [];
    const indices = [];
    const rng = App.Math.createRNG(8812);

    for (let i = 0; i < count; i++) {
      const sample = dorsalCrestSamples[i];
      const t = i / (count - 1);
      // Smoothly emerge from 0 at withers and fade cleanly behind poll (brushy harmonic tuft silhouette!)
      const fadeIn = smoothstep(0.0, 0.16, t);
      const fadeOut = smoothstep(1.0, 0.88, t);
      const tuftWave =
        0.94 +
        0.09 * Math.sin(t * 48.0) +
        0.05 * Math.sin(t * 112.0 + 1.4);
      const h = (0.004 + 0.118 * fadeIn * fadeOut) * tuftWave;
      const w = lerp(0.024, 0.014, t);
      const sw = chainSkinWeights(spineChain, sample.boneHint);

      const dorsalOut = sample.normal.clone().normalize();
      if (dorsalOut.y < 0) dorsalOut.negate();

      // Sink root 3 cm inside the dorsal crest so ZERO gap can ever show!
      const root = sample.pos.clone().addScaledVector(dorsalOut, -0.030);
      const leftBase = root.clone().add(new THREE.Vector3(w, 0, 0));
      const rightBase = root.clone().add(new THREE.Vector3(-w, 0, 0));
      const midLeft = root.clone().addScaledVector(dorsalOut, h * 0.56).add(new THREE.Vector3(w * 0.52, 0, 0));
      const midRight = root.clone().addScaledVector(dorsalOut, h * 0.56).add(new THREE.Vector3(-w * 0.52, 0, 0));
      const tip = root.clone().addScaledVector(dorsalOut, h).add(new THREE.Vector3(Math.sin(t * 36.0) * 0.004, 0, 0));

      const slice = [leftBase, midLeft, tip, midRight, rightBase];
      const vCoords = [0.0, 0.58, 1.0, 0.58, 0.0];
      for (let k = 0; k < 5; k++) {
        positions.push(slice[k].x, slice[k].y, slice[k].z);
        uvs.push(t, vCoords[k]);
        skinIndices.push(sw.skinIndices[0], sw.skinIndices[1], 0, 0);
        skinWeights.push(sw.skinWeights[0], sw.skinWeights[1], 0, 0);
      }
    }

    for (let i = 0; i < count - 1; i++) {
      for (let k = 0; k < 4; k++) {
        const a = i * 5 + k;
        const b = (i + 1) * 5 + k;
        const c = (i + 1) * 5 + (k + 1);
        const d = i * 5 + (k + 1);
        indices.push(a, d, b);
        indices.push(b, d, c);
      }
    }

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geom.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndices, 4));
    geom.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeights, 4));
    geom.setIndex(indices);
    geom.computeVertexNormals();
    return geom;
  }

  // ---------------------------------------------------------------------------
  // 7. SKINNED TAIL SHAFT + DARK HAIR TASSEL
  // ---------------------------------------------------------------------------
  function buildTailShaftGeometry(skelData) {
    const idx = skelData.index;
    const chain = [idx.pelvis, idx.tail0, idx.tail1, idx.tail2, idx.tail3, idx.tail4];
    const pts = [
      skelData.restPositions[idx.tail0].clone().add(new THREE.Vector3(0, 0.03, 0.07)),
      skelData.restPositions[idx.tail0],
      skelData.restPositions[idx.tail1],
      skelData.restPositions[idx.tail2],
      skelData.restPositions[idx.tail3],
      skelData.restPositions[idx.tail4],
    ];
    const radii = [0.055, 0.036, 0.025, 0.019, 0.016, 0.014];
    const curve = new THREE.CatmullRomCurve3(pts);

    const numRings = 24;
    const radialSegs = 12;
    const rings = [];
    for (let i = 0; i < numRings; i++) {
      const t = i / (numRings - 1);
      const center = curve.getPoint(t);
      const tang = curve.getTangent(t).normalize();
      const side = new THREE.Vector3(1, 0, 0);
      const fwd = new THREE.Vector3().crossVectors(side, tang).normalize();

      const fIdx = t * (radii.length - 1);
      const i0 = Math.floor(fIdx);
      const i1 = Math.min(radii.length - 1, i0 + 1);
      const r = lerp(radii[i0], radii[i1], fIdx - i0);
      const sw = chainSkinWeights(chain, fIdx);

      const ring = [];
      for (let j = 0; j < radialSegs; j++) {
        const th = (j / radialSegs) * Math.PI * 2;
        const pos = center
          .clone()
          .addScaledVector(side, Math.sin(th) * r)
          .addScaledVector(fwd, Math.cos(th) * r);
        ring.push({
          pos,
          center: center.clone(),
          skinIndices: sw.skinIndices,
          skinWeights: sw.skinWeights,
        });
      }
      rings.push(ring);
    }

    return buildLoftGeometry(rings, radialSegs, true, true);
  }

  function createTailTasselGroup(hairMat) {
    const group = new THREE.Group();
    const rng = App.Math.createRNG(7731);

    const coreGeom = new THREE.CylinderGeometry(0.014, 0.005, 0.42, 12, 8);
    const cp = coreGeom.attributes.position;
    for (let i = 0; i < cp.count; i++) {
      let x = cp.getX(i), y = cp.getY(i), z = cp.getZ(i);
      const h = (0.21 - y) / 0.42;
      const bulge = Math.sin(Math.pow(clamp(h, 0, 1), 0.72) * Math.PI);
      const scale = 0.65 + 2.5 * bulge;
      cp.setXYZ(i, x * scale, y - 0.20, z * scale);
    }
    coreGeom.computeVertexNormals();
    const core = new THREE.Mesh(coreGeom, hairMat);
    core.castShadow = true;
    group.add(core);

    for (let k = 0; k < 14; k++) {
      const ang = (k / 14) * Math.PI * 2;
      const len = 0.28 + rng() * 0.22;
      const strandGeom = new THREE.ConeGeometry(0.013 + rng() * 0.007, len, 7);
      strandGeom.rotateX(Math.PI);
      const rad = 0.010 + (k % 2) * 0.009;
      strandGeom.translate(
        Math.cos(ang) * rad,
        -len * 0.5 - 0.02 - rng() * 0.08,
        Math.sin(ang) * rad
      );
      const strand = new THREE.Mesh(strandGeom, hairMat);
      strand.rotation.set((rng() - 0.5) * 0.14, 0, (rng() - 0.5) * 0.14);
      strand.castShadow = true;
      group.add(strand);
    }

    return group;
  }

  // ---------------------------------------------------------------------------
  // ASSEMBLE COMPLETE GIRAFFE
  // ---------------------------------------------------------------------------
  function createGiraffe() {
    const root = new THREE.Group();
    root.name = 'GiraffeRoot';

    const skelData = App.Skeleton.createGiraffeSkeleton();
    root.add(skelData.rootBone);

    const coatMat = App.Materials.createGiraffeCoatMaterial();
    const hoofMat = App.Materials.createHoofMaterial();
    const eyeMat = App.Materials.createEyeMaterial();
    const maneMat = App.Materials.createManeMaterial();
    const tasselMat = App.Materials.createHairMaterial(0x160a05, 0.92);
    const innerEarMat = App.Materials.createInnerEarMaterial();

    root.updateMatrixWorld(true);

    // 1. Torso + Withers + Neck
    const torsoResult = buildTorsoNeckGeometry(skelData);
    const torsoMesh = new THREE.SkinnedMesh(torsoResult.geometry, coatMat);
    torsoMesh.castShadow = true;
    torsoMesh.receiveShadow = true;
    torsoMesh.frustumCulled = false;
    torsoMesh.bind(skelData.skeleton);
    root.add(torsoMesh);

    // 2. Dedicated Sculpted Giraffe Head (skinned to neck5/head for silky throatlatch!)
    const headGeom = buildHeadGeometry(skelData);
    const headMesh = new THREE.SkinnedMesh(headGeom, coatMat);
    headMesh.castShadow = true;
    headMesh.receiveShadow = true;
    headMesh.frustumCulled = false;
    headMesh.bind(skelData.skeleton);
    root.add(headMesh);

    // 3. Four Anatomical Skinned Legs + Cloven Hooves + Dewclaws
    const legKeys = ['fl', 'fr', 'hl', 'hr'];
    for (const lk of legKeys) {
      const legGeom = buildLegGeometry(skelData, lk);
      const legMesh = new THREE.SkinnedMesh(legGeom, coatMat);
      legMesh.castShadow = true;
      legMesh.receiveShadow = true;
      legMesh.frustumCulled = false;
      legMesh.bind(skelData.skeleton);
      root.add(legMesh);

      const hoofBone = skelData.bones[skelData.legSpecs[lk].indices[4]];
      hoofBone.add(createClovenHoofGroup(hoofMat, coatMat));

      const fetlockBone = skelData.bones[skelData.legSpecs[lk].indices[3]];
      fetlockBone.add(createDewclawsGroup(hoofMat));
    }

    // 4. Head Features (Ossicones, Ears, Eyes, Blinking Eyelids, Eyelashes)
    const headAnim = attachHeadDetails(skelData, coatMat, eyeMat, tasselMat, innerEarMat);

    // 5. Flush-Fitting Skinned Dorsal Mane
    const maneGeom = buildManeGeometry(skelData, torsoResult.dorsalCrestSamples);
    const maneMesh = new THREE.SkinnedMesh(maneGeom, maneMat);
    maneMesh.castShadow = true;
    maneMesh.receiveShadow = true;
    maneMesh.frustumCulled = false;
    maneMesh.bind(skelData.skeleton);
    root.add(maneMesh);

    // 6. Skinned Tail Shaft + Dark Hair Tassel
    const tailGeom = buildTailShaftGeometry(skelData);
    const tailMesh = new THREE.SkinnedMesh(tailGeom, coatMat);
    tailMesh.castShadow = true;
    tailMesh.receiveShadow = true;
    tailMesh.frustumCulled = false;
    tailMesh.bind(skelData.skeleton);
    root.add(tailMesh);

    const tailEndBone = skelData.bones[skelData.index.tail4];
    tailEndBone.add(createTailTasselGroup(tasselMat));

    return {
      root,
      skelData,
      headAnim,
      materials: { coatMat, hoofMat, eyeMat, maneMat, tasselMat, innerEarMat },
    };
  }

  App.GiraffeMesh = {
    createGiraffe,
  };
})(window);
