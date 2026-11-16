/* =============================================================================
   giraffe.js — procedural Giraffa camelopardalis with a 4-beat walk cycle

   Model space: metres, +Z forward, +Y up, hooves on y = 0.
   The whole animal is built from lofted cross-sections so the silhouette
   (deep chest, sloping back, long S-curved neck) reads correctly from any angle.
   ========================================================================== */
(function () {
  'use strict';
  const NS = window.GIRAFFE;
  const V3 = THREE.Vector3;
  const UP = new V3(0, 1, 0);

  const PIVOT = new V3(0, 2.40, 0);     // body rotation pivot (barrel centre)

  /* coat textures are expensive to synthesise: build once, share by all animals */
  let _coatCache = null;
  function coatCache() {
    if (!_coatCache) {
      _coatCache = {
        big: NS.coatTexture({ size: 768, cells: 7, seed: 11, lineW: 0.045 }),
        small: NS.coatTexture({ size: 384, cells: 6, seed: 29, lineW: 0.05 })
      };
    }
    return _coatCache;
  }

  let _matCache = null;
  function getMaterials() {
    if (_matCache) return _matCache;
    const _c = coatCache();
    const coatBig = _c.big;
    const coatSmall = _c.small;

    function coatMat(tex, rx, ry, extra) {
      const map = tex.map.clone(); map.needsUpdate = true;
      map.repeat.set(rx, ry); map.wrapS = map.wrapT = THREE.RepeatWrapping;
      const nrm = tex.normalMap.clone(); nrm.needsUpdate = true;
      nrm.repeat.set(rx, ry); nrm.wrapS = nrm.wrapT = THREE.RepeatWrapping;
      const m = new THREE.MeshStandardMaterial(Object.assign({
        map: map, normalMap: nrm,
        normalScale: new THREE.Vector2(0.55, 0.55),
        roughness: 0.94, metalness: 0.0
      }, extra || {}));
      m.map.anisotropy = 8;
      return m;
    }

    const matBody = coatMat(coatBig, 1.45, 1.15);
    const matNeck = coatMat(coatBig, 1.05, 0.95);
    const matHead = coatMat(coatSmall, 1.00, 0.92);
    const matUpperLeg = coatMat(coatSmall, 0.62, 1.25);
    const matUpperLegHind = coatMat(coatSmall, 0.62, 0.85);

    function limbGradient(bottom, top) {
      const cv = document.createElement('canvas');
      cv.width = 8; cv.height = 64;
      const ctx = cv.getContext('2d');
      const g = ctx.createLinearGradient(0, 0, 0, 64);
      g.addColorStop(0, top);
      g.addColorStop(1, bottom);
      ctx.fillStyle = g; ctx.fillRect(0, 0, 8, 64);
      return NS.canvasTexture(cv);
    }
    const matPale = new THREE.MeshStandardMaterial({ map: limbGradient('#e2d5b8', '#bda87f'), roughness: 0.9, metalness: 0 });
    const matPaleDark = new THREE.MeshStandardMaterial({ map: limbGradient('#d6c6a6', '#ac9670'), roughness: 0.92, metalness: 0 });
    const matHoof = new THREE.MeshStandardMaterial({ color: 0x3b322b, roughness: 0.55, metalness: 0.05 });
    const matHair = new THREE.MeshStandardMaterial({ color: 0x2a1d14, roughness: 0.95, metalness: 0 });
    const matHorn = new THREE.MeshStandardMaterial({ color: 0x6b5136, roughness: 0.8, metalness: 0 });
    const matKnob = new THREE.MeshStandardMaterial({ color: 0x241812, roughness: 0.85, metalness: 0 });
    const matEye = new THREE.MeshStandardMaterial({ color: 0x0d0906, roughness: 0.12, metalness: 0.0 });
    const matEyeHi = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const matNose = new THREE.MeshStandardMaterial({ color: 0x4a3a30, roughness: 0.55, metalness: 0 });
    const matEarIn = new THREE.MeshStandardMaterial({ color: 0xb08f72, roughness: 0.95, metalness: 0 });

    _matCache = { matBody: matBody, matNeck: matNeck, matHead: matHead, matUpperLeg: matUpperLeg, matUpperLegHind: matUpperLegHind, matPale: matPale, matPaleDark: matPaleDark, matHoof: matHoof, matHair: matHair, matHorn: matHorn, matKnob: matKnob, matEye: matEye, matEyeHi: matEyeHi, matNose: matNose, matEarIn: matEarIn };
    return _matCache;
  }

  NS.createGiraffe = function (opts) {
    opts = opts || {};
    const lowDetail = !!opts.lowDetail;
    /* ------------------------------------------------------------------ */
    /* materials                                                          */
    /* ------------------------------------------------------------------ */
    const M = getMaterials();
    const matBody = M.matBody, matNeck = M.matNeck, matHead = M.matHead,
      matUpperLeg = M.matUpperLeg, matUpperLegHind = M.matUpperLegHind,
      matPale = M.matPale, matPaleDark = M.matPaleDark, matHoof = M.matHoof,
      matHair = M.matHair, matHorn = M.matHorn, matKnob = M.matKnob,
      matEye = M.matEye, matEyeHi = M.matEyeHi, matNose = M.matNose,
      matEarIn = M.matEarIn;

    /* ------------------------------------------------------------------ */
    /* hierarchy                                                          */
    /* ------------------------------------------------------------------ */
    const root = new THREE.Group();
    const body = new THREE.Group();          // animated (bob / sway / roll)
    body.position.copy(PIVOT);
    root.add(body);
    const inner = new THREE.Group();         // model-space contents
    inner.position.copy(PIVOT).multiplyScalar(-1);
    body.add(inner);

    const shadowMeshes = [];
    function add(mesh, cast) {
      mesh.castShadow = cast !== false;
      mesh.receiveShadow = true;
      inner.add(mesh);
      shadowMeshes.push(mesh);
      return mesh;
    }

    const shadeCoat = (x, y, z, nx, ny, nz) => {
      const up = ny * 0.5 + 0.5;                 // 0 belly .. 1 back
      let s = 0.74 + 0.26 * up;
      // slight darkening towards the flank midline
      return s;
    };

    /* ------------------------------------------------------------------ */
    /* torso                                                              */
    /* ------------------------------------------------------------------ */
    const bodyPts = [
      [0, 2.50, -1.05], [0, 2.55, -0.86], [0, 2.49, -0.50],
      [0, 2.42, -0.05], [0, 2.43, 0.38], [0, 2.50, 0.72], [0, 2.46, 0.94]
    ].map(p => new V3(p[0], p[1], p[2]));
    const bodyCurve = new THREE.CatmullRomCurve3(bodyPts, false, 'catmullrom', 0.5);
    const bodyProfile = [
      { t: 0.00, rx: 0.30, ry: 0.36 },
      { t: 0.10, rx: 0.40, ry: 0.46 },
      { t: 0.28, rx: 0.47, ry: 0.54 },
      { t: 0.50, rx: 0.50, ry: 0.59 },
      { t: 0.70, rx: 0.49, ry: 0.60 },
      { t: 0.86, rx: 0.45, ry: 0.56 },
      { t: 1.00, rx: 0.33, ry: 0.43 }
    ];
    const bodyLoft = NS.loft(bodyCurve, {
      segments: 34, radial: 26, roundStart: true, roundEnd: true, capSegments: 4, capScale: 0.75,
      profile: t => NS.sampleKeys(bodyProfile, t),
      shade: shadeCoat
    });
    add(new THREE.Mesh(bodyLoft.geometry, matBody));

    /* brisket / chest between the forelegs */
    const brisket = new THREE.Mesh(new THREE.SphereGeometry(1, 18, 14), matBody);
    brisket.position.set(0, 2.12, 0.66);
    brisket.scale.set(0.33, 0.44, 0.36);
    add(brisket);

    /* shoulder blades — subtle masses that make the withers read */
    for (const s of [-1, 1]) {
      const sh = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 12), matBody);
      sh.position.set(s * 0.30, 2.52, 0.62);
      sh.scale.set(0.20, 0.30, 0.30);
      add(sh);
    }

    /* ------------------------------------------------------------------ */
    /* neck                                                               */
    /* ------------------------------------------------------------------ */
    const NECK_BASE = new V3(0, 2.50, 0.66);
    const neckPivot = new THREE.Group();
    neckPivot.position.copy(NECK_BASE);
    inner.add(neckPivot);

    const neckPts = [
      [0, -0.04, -0.05], [0, 0.30, 0.01], [0, 0.65, 0.13],
      [0, 1.00, 0.31], [0, 1.34, 0.53], [0, 1.64, 0.75], [0, 1.86, 0.91]
    ].map(p => new V3(p[0], p[1], p[2]));
    const neckCurve = new THREE.CatmullRomCurve3(neckPts, false, 'catmullrom', 0.5);
    const neckProfile = [
      { t: 0.00, rx: 0.375, ry: 0.425 },
      { t: 0.10, rx: 0.35, ry: 0.40 },
      { t: 0.35, rx: 0.29, ry: 0.33 },
      { t: 0.62, rx: 0.235, ry: 0.27 },
      { t: 0.84, rx: 0.195, ry: 0.22 },
      { t: 1.00, rx: 0.165, ry: 0.185 }
    ];
    const neckLoft = NS.loft(neckCurve, {
      segments: 36, radial: 24,
      profile: t => NS.sampleKeys(neckProfile, t),
      shade: shadeCoat
    });
    const neckMesh = new THREE.Mesh(neckLoft.geometry, matNeck);
    neckMesh.castShadow = true; neckMesh.receiveShadow = true;
    neckPivot.add(neckMesh);

    /* ------------------------------------------------------------------ */
    /* head                                                               */
    /* ------------------------------------------------------------------ */
    const HEAD_BASE = new V3(0, 1.86, 0.91);
    const headPivot = new THREE.Group();
    headPivot.position.copy(HEAD_BASE);
    neckPivot.add(headPivot);
    const head = new THREE.Group();
    head.rotation.x = 0.16;
    head.scale.setScalar(0.86);                  // nose slightly down
    headPivot.add(head);

    const headPts = [
      [0, 0.035, -0.17], [0, 0.10, -0.07], [0, 0.115, 0.05],
      [0, 0.075, 0.17], [0, 0.02, 0.29], [0, -0.03, 0.40], [0, -0.055, 0.47]
    ].map(p => new V3(p[0], p[1], p[2]));
    const headCurve = new THREE.CatmullRomCurve3(headPts, false, 'catmullrom', 0.5);
    const headProfile = [
      { t: 0.00, rx: 0.075, ry: 0.085 },
      { t: 0.16, rx: 0.115, ry: 0.125 },
      { t: 0.36, rx: 0.125, ry: 0.135 },
      { t: 0.56, rx: 0.105, ry: 0.115 },
      { t: 0.78, rx: 0.088, ry: 0.095 },
      { t: 1.00, rx: 0.075, ry: 0.078 }
    ];
    const headLoft = NS.loft(headCurve, {
      segments: 26, radial: 20, roundStart: true, roundEnd: true, capSegments: 4, capScale: 0.8,
      profile: t => NS.sampleKeys(headProfile, t)
    });
    const headMesh = new THREE.Mesh(headLoft.geometry, matHead);
    headMesh.castShadow = true; headMesh.receiveShadow = true;
    head.add(headMesh);

    /* cheek / jaw mass */
    for (const s of [-1, 1]) {
      const ch = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 12), matHead);
      ch.position.set(s * 0.072, -0.015, 0.10);
      ch.scale.set(0.055, 0.075, 0.115);
      ch.castShadow = true; ch.receiveShadow = true;
      head.add(ch);
    }
    /* lower jaw */
    const jaw = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), matPaleDark);
    jaw.position.set(0, -0.075, 0.30);
    jaw.scale.set(0.072, 0.055, 0.145);
    jaw.castShadow = true; jaw.receiveShadow = true;
    head.add(jaw);

    /* muzzle / nose pad */
    const nose = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), matNose);
    nose.position.set(0, -0.035, 0.455);
    nose.scale.set(0.070, 0.055, 0.045);
    head.add(nose);
    if (!lowDetail) {
      for (const s of [-1, 1]) {
        const nos = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 6), matKnob);
        nos.position.set(s * 0.034, -0.02, 0.487);
        nos.scale.set(0.016, 0.011, 0.012);
        head.add(nos);
      }
      /* mouth line */
      const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.008, 0.012), matKnob);
      mouth.position.set(0, -0.082, 0.40);
      head.add(mouth);
    }

    /* eyes */
    const eyes = [];
    for (const s of [-1, 1]) {
      const socket = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 12), matPaleDark);
      socket.position.set(s * 0.098, 0.072, 0.155);
      socket.scale.set(0.045, 0.052, 0.058);
      head.add(socket);

      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.041, 16, 14), matEye);
      eye.position.set(s * 0.112, 0.072, 0.163);
      eye.scale.set(0.85, 1, 1);
      head.add(eye);
      eyes.push(eye);

      if (!lowDetail) {
        const hi = new THREE.Mesh(new THREE.SphereGeometry(0.0085, 8, 8), matEyeHi);
        hi.position.set(s * 0.140, 0.088, 0.190);
        head.add(hi);
      }

      /* brow */
      if (!lowDetail) {
        const brow = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 10), matHead);
        brow.position.set(s * 0.088, 0.108, 0.135);
        brow.scale.set(0.045, 0.022, 0.062);
        head.add(brow);
      }
    }

    /* ossicones */
    const ossicones = [];
    for (const s of [-1, 1]) {
      const g = new THREE.Group();
      g.position.set(s * 0.062, 0.145, -0.045);
      g.rotation.set(-0.30, 0, s * 0.16);
      head.add(g);
      const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.030, 0.145, 10, 1), matHorn);
      stalk.position.y = 0.0725;
      stalk.castShadow = true;
      g.add(stalk);
      const knob = new THREE.Mesh(new THREE.SphereGeometry(0.040, 14, 12), matKnob);
      knob.position.y = 0.152;
      knob.scale.set(1, 0.92, 1);
      knob.castShadow = true;
      g.add(knob);
      ossicones.push(g);
    }
    /* forelock tuft between ossicones */
    for (let i = 0; i < (lowDetail ? 0 : 7); i++) {
      const t = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.075, 5), matHair);
      t.position.set((Math.random() - 0.5) * 0.075, 0.155 + Math.random() * 0.02, -0.01 + Math.random() * 0.05);
      t.rotation.set(-0.5 + Math.random() * 0.4, 0, (Math.random() - 0.5) * 0.5);
      head.add(t);
    }

    /* ears */
    const ears = [];
    for (const s of [-1, 1]) {
      const g = new THREE.Group();
      g.position.set(s * 0.10, 0.105, -0.055);
      g.rotation.set(-0.15, s * 0.35, s * -1.05);
      head.add(g);
      const leaf = new THREE.Mesh(NS.leafGeometry(0.20, 0.085, 0.012), matHead);
      leaf.castShadow = true;
      g.add(leaf);
      if (!lowDetail) {
        const inr = new THREE.Mesh(NS.leafGeometry(0.15, 0.055, 0.006), matEarIn);
        inr.position.set(0, 0.02, 0.008);
        g.add(inr);
      }
      ears.push({ g: g, side: s });
    }

    /* ------------------------------------------------------------------ */
    /* mane                                                               */
    /* ------------------------------------------------------------------ */
    {
      const maneMat = matHair;
      const N = lowDetail ? 14 : 48;
      for (let i = 0; i < N; i++) {
        const t = 0.02 + (i / (N - 1)) * 0.95;
        const f = NS.curveFrame(neckCurve, t);
        const prof = NS.sampleKeys(neckProfile, t);
        const p = f.p.clone().addScaledVector(f.dorsal, prof.ry * 0.94);
        const h = 0.062 + 0.022 * Math.sin(i * 1.7) + 0.016 * (1 - t);
        const cone = new THREE.Mesh(new THREE.ConeGeometry(0.020, h, 4, 1), maneMat);
        cone.position.copy(p);
        const dir = f.dorsal.clone().multiplyScalar(0.75).addScaledVector(f.t, -0.55).normalize();
        cone.quaternion.setFromUnitVectors(UP, dir);
        cone.translateY(h * 0.35);
        cone.castShadow = true;
        neckPivot.add(cone);
      }
      /* withers tuft */
      for (let i = 0; i < (lowDetail ? 0 : 6); i++) {
        const cone = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.09, 4), maneMat);
        cone.position.set(0, 2.99 + Math.random() * 0.02, 0.55 + i * 0.06);
        cone.rotation.x = -0.5;
        cone.castShadow = true;
        inner.add(cone);
      }
    }

    /* ------------------------------------------------------------------ */
    /* tail                                                               */
    /* ------------------------------------------------------------------ */
    const tail = new THREE.Group();
    tail.position.set(0, 2.52, -1.24);
    inner.add(tail);
    const tailSegs = [];
    const TAIL_N = 7;
    let parent = tail;
    for (let i = 0; i < TAIL_N; i++) {
      const g = new THREE.Group();
      if (i > 0) g.position.y = -0.115;
      parent.add(g);
      const r0 = 0.042 - i * 0.0035;
      const seg = new THREE.Mesh(new THREE.CylinderGeometry(r0 * 0.85, r0, 0.12, 8, 1), matHair);
      seg.position.y = -0.058;
      seg.castShadow = true;
      g.add(seg);
      tailSegs.push(g);
      parent = g;
    }
    const tuft = new THREE.Group();
    tuft.position.y = -0.115;
    parent.add(tuft);
    for (let i = 0; i < (lowDetail ? 6 : 16); i++) {
      const h = 0.20 + Math.random() * 0.10;
      const c = new THREE.Mesh(new THREE.ConeGeometry(0.010, h, 4), matHair);
      const a = Math.random() * Math.PI * 2, rr = Math.random() * 0.035;
      c.position.set(Math.cos(a) * rr, -h * 0.5, Math.sin(a) * rr);
      c.rotation.set((Math.random() - 0.5) * 0.5, 0, (Math.random() - 0.5) * 0.5);
      c.castShadow = true;
      tuft.add(c);
    }

    /* ------------------------------------------------------------------ */
    /* legs                                                               */
    /* ------------------------------------------------------------------ */
    const sphereGeo = new THREE.SphereGeometry(1, 12, 10);

    function makeLeg(cfg) {
      const leg = {
        side: cfg.side, front: cfg.front,
        attach: cfg.attach.clone(),     // body space
        L1: cfg.L1, L2: cfg.L2, L3: cfg.L3,
        phase: cfg.phase,
        baseZ: cfg.attach.z,
        hip: new V3()
      };
      const matUpper = cfg.front ? matUpperLeg : matUpperLegHind;

      leg.upper = new THREE.Mesh(NS.limbGeometry(cfg.front ? 0.58 : 0.62, 12), matUpper);
      leg.lower = new THREE.Mesh(NS.limbGeometry(0.78, 10), cfg.front ? matPale : matPaleDark);
      leg.pastern = new THREE.Mesh(NS.limbGeometry(0.86, 9), matPaleDark);
      leg.upper.castShadow = leg.lower.castShadow = leg.pastern.castShadow = true;
      leg.upper.receiveShadow = leg.lower.receiveShadow = leg.pastern.receiveShadow = true;
      root.add(leg.upper, leg.lower, leg.pastern);

      leg.knee = new THREE.Mesh(sphereGeo, cfg.front ? matPale : matPaleDark);
      leg.knee.castShadow = true; root.add(leg.knee);
      leg.fet = new THREE.Mesh(sphereGeo, matPaleDark);
      leg.fet.castShadow = true; root.add(leg.fet);

      leg.foot = new THREE.Group();
      root.add(leg.foot);
      const hoofGeo = new THREE.CylinderGeometry(0.075, 0.085, 0.095, 12, 1);
      for (const s of [-1, 1]) {
        const h = new THREE.Mesh(hoofGeo, matHoof);
        h.position.set(s * 0.036, 0.0475, 0.004);
        h.scale.set(0.52, 1, 1.12);
        h.castShadow = true; h.receiveShadow = true;
        leg.foot.add(h);
      }
      return leg;
    }

    const legs = [
      makeLeg({ side: 1, front: true, attach: new V3(0.295, 2.60, 0.72), L1: 1.27, L2: 1.17, L3: 0.22, phase: 0.25 }),
      makeLeg({ side: -1, front: true, attach: new V3(-0.295, 2.60, 0.72), L1: 1.27, L2: 1.17, L3: 0.22, phase: 0.75 }),
      makeLeg({ side: 1, front: false, attach: new V3(0.265, 2.42, -0.95), L1: 0.99, L2: 0.95, L3: 0.62, phase: 0.00 }),
      makeLeg({ side: -1, front: false, attach: new V3(-0.265, 2.42, -0.95), L1: 0.99, L2: 0.95, L3: 0.62, phase: 0.50 })
    ];
    /* tag leg parts so the QA harness can isolate them */
    legs.forEach((l, i) => {
      [l.upper, l.lower, l.pastern, l.knee, l.fet, l.foot].forEach(o => { o.userData.leg = i; o.userData.isLeg = true; });
    });

    /* ------------------------------------------------------------------ */
    /* gait parameters                                                    */
    /* ------------------------------------------------------------------ */
    const GAIT = {
      stride: 0.95,      // fore-aft travel of the hoof during stance (m)
      duty: 0.62,        // fraction of cycle a foot is planted
      lift: 0.22,        // hoof clearance during swing
      /* distance the body covers per full cycle: stride / duty, so that a
         planted hoof stays fixed in world space (no sliding) */
      cycleDist: 0.95 / 0.62
    };

    const state = {
      distance: 0,
      phase: 0,
      speed: 1,
      time: 0,
      paused: false
    };

    const _v = new V3(), _k = new V3(), _f = new V3(), _a = new V3(), _b = new V3();
    const _hipLocal = new V3();

    /* 2-bone IK in the YZ plane. Returns knee position. */
    function solveKnee(A, target, L1, L2, bend) {
      const dy = target.y - A.y, dz = target.z - A.z;
      let d = Math.hypot(dy, dz);
      d = Math.min(d, L1 + L2 - 0.001);
      d = Math.max(d, Math.abs(L1 - L2) + 0.001);
      const base = Math.atan2(dz, -dy);
      const cosA = (d * d + L1 * L1 - L2 * L2) / (2 * d * L1);
      const ang = Math.acos(NS.clamp(cosA, -1, 1));
      const a1 = base + bend * ang;
      return new V3(A.x, A.y - Math.cos(a1) * L1, A.z + Math.sin(a1) * L1);
    }

    function updateLeg(leg, phase) {
      /* foot target in root space */
      const s = ((phase % 1) + 1) % 1;
      let zOff, y = 0, pitch = 0;
      if (s < GAIT.duty) {
        const u = s / GAIT.duty;
        zOff = GAIT.stride * (0.5 - u);
      } else {
        const u = (s - GAIT.duty) / (1 - GAIT.duty);
        const e = u * u * (3 - 2 * u);
        zOff = GAIT.stride * (e - 0.5);
        y = GAIT.lift * Math.pow(Math.sin(Math.PI * u), 0.85);
        pitch = -0.42 * Math.sin(Math.PI * u) + 0.18 * Math.sin(2 * Math.PI * u);
      }

      const foot = _v.set(leg.hip.x * 0.965, y, leg.baseZ + zOff);

      /* third segment (pastern / cannon) */
      const L3 = leg.L3;
      const ankle = _f.set(foot.x, foot.y + L3, foot.z - (leg.front ? 0.015 : 0.03));

      const knee = solveKnee(leg.hip, ankle, leg.L1, leg.L2, 1);

      /* upper */
      NS.placeBetween(leg.upper, leg.hip, knee, leg.front ? 0.155 : 0.165);
      /* lower */
      NS.placeBetween(leg.lower, knee, ankle, leg.front ? 0.078 : 0.082);
      /* joint knobs */
      leg.knee.position.copy(knee);
      const kr = leg.front ? 0.085 : 0.092;
      leg.knee.scale.set(kr, kr * 0.9, kr * 1.05);
      leg.fet.position.copy(ankle);
      leg.fet.scale.set(0.068, 0.06, 0.075);

      /* pastern */
      const hoofTop = _a.set(foot.x, foot.y + 0.095, foot.z + 0.005);
      NS.placeBetween(leg.pastern, ankle, hoofTop, 0.062);

      /* hoof */
      leg.foot.position.copy(foot);
      leg.foot.rotation.x = pitch;
      leg.foot.rotation.z = 0;
    }

    /* ------------------------------------------------------------------ */
    /* per-frame animation                                                */
    /* ------------------------------------------------------------------ */
    function update(dt, speed) {
      state.time += dt;
      if (!state.paused) state.distance += speed * dt;
      state.speed = speed;
      const phase = (state.distance / GAIT.cycleDist) % 1;

      const TAU = Math.PI * 2;
      const ph = phase * TAU;

      /* body: 2 bobs per cycle, lateral sway once per cycle */
      body.position.set(
        PIVOT.x + 0.070 * Math.sin(ph + 0.6),
        PIVOT.y + 0.028 * Math.cos(ph * 2 + 0.9),
        PIVOT.z
      );
      body.rotation.z = 0.030 * Math.sin(ph + 0.6);
      body.rotation.x = 0.010 * Math.sin(ph * 2 + 0.4);
      body.rotation.y = 0.012 * Math.sin(ph + 1.2);

      /* hips follow the body */
      body.updateMatrix();
      for (const leg of legs) {
        _hipLocal.copy(leg.attach).sub(PIVOT).applyMatrix4(body.matrix);
        leg.hip.copy(_hipLocal);
        updateLeg(leg, phase + leg.phase);
      }

      /* breathing */
      const breath = Math.sin(state.time * 1.35) * 0.5 + 0.5;
      brisket.scale.set(0.33 * (1 + 0.018 * breath), 0.44 * (1 + 0.012 * breath), 0.36);

      /* neck: sways with the stride, head stabilises */
      neckPivot.rotation.z = 0.075 * Math.sin(ph + 0.35);
      neckPivot.rotation.x = 0.028 * Math.sin(ph * 2 + 1.4);
      headPivot.rotation.z = -0.55 * 0.075 * Math.sin(ph + 0.05);
      headPivot.rotation.x = -0.6 * 0.028 * Math.sin(ph * 2 + 1.4) + 0.012 * Math.sin(state.time * 0.7);
      head.rotation.y = 0.03 * Math.sin(state.time * 0.23);

      /* ears flick now and then */
      for (const e of ears) {
        const t = state.time * 0.7 + (e.side > 0 ? 0 : 1.7);
        const flick = Math.max(0, Math.sin(t * 2.3) - 0.93) * 9.0;
        e.g.rotation.z = e.side * -1.05 + e.side * flick * 0.35;
        e.g.rotation.x = -0.15 + flick * 0.15;
      }

      /* tail: travelling wave */
      for (let i = 0; i < tailSegs.length; i++) {
        const g = tailSegs[i];
        const lag = i * 0.55;
        g.rotation.z = 0.16 * Math.sin(ph * 0.5 - lag + 0.4) * (0.4 + i * 0.12);
        g.rotation.x = 0.10 * Math.sin(ph * 0.5 - lag + 1.1) * (0.4 + i * 0.12) + 0.05;
      }

      /* blink */
      const blinkPhase = (state.time % 5.3);
      const blink = blinkPhase < 0.14 ? Math.sin((blinkPhase / 0.14) * Math.PI) : 0;
      for (const eye of eyes) eye.scale.y = 1 - 0.92 * blink;
    }

    /* ------------------------------------------------------------------ */
    /* public                                                             */
    /* ------------------------------------------------------------------ */
    const api = {
      root: root,
      body: body,
      head: head,
      neckPivot: neckPivot,
      legs: legs,
      gait: GAIT,
      textures: { coatBig: coatCache().big, coatSmall: coatCache().small },
      state: state,
      update: update,
      phase: () => (state.distance / GAIT.cycleDist) % 1,
      /* world-space point the camera should look at */
      focus(out) {
        out.set(0, 2.9, 0.55);
        root.localToWorld(out);
        return out;
      },
      /* true when a hoof is planted (used for dust puffs) */
      isPlanting(i, dt) { return false; }
    };

    /* rest pose so the first frame is already correct */
    update(0, 1);
    /* scale to a real adult bull: ~5.2 m at the ossicones */
    root.scale.setScalar(1.115);
    return api;
  };
})();