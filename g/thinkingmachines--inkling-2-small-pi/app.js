/* Giraffa camelopardalis — procedural giraffe with walk cycle
 * Runs directly from file:// — no build step, no server.
 */
(function () {
  'use strict';

  // ---------------------------------------------------------------- utils
  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;

  function makeCanvas(size) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    return c;
  }

  function canvasTexture(size, draw, opts) {
    const c = makeCanvas(size);
    const ctx = c.getContext('2d');
    draw(ctx, size);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    if (opts && opts.repeat) {
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(opts.repeat[0], opts.repeat[1]);
    }
    return tex;
  }

  function paintIrregularPatch(ctx, cx, cy, r, n, jitter, fill) {
    ctx.beginPath();
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2;
      const rr = r * (1 - jitter / 2 + Math.random() * jitter);
      const x = cx + Math.cos(a) * rr;
      const y = cy + Math.sin(a) * rr * 0.82;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
  }

  // ------------------------------------------------------- coat textures
  const SPOT_DARK = ['#553521', '#5d3a24', '#4b2e1d', '#63402a'];
  function drawCoatBase(ctx, s, baseTop, baseBottom) {
    ctx.fillStyle = baseTop;
    ctx.fillRect(0, 0, s, s);
    // very subtle vertical tint instead of a hard gradient
    const g = ctx.createLinearGradient(0, 0, 0, s);
    g.addColorStop(0, 'rgba(255,255,255,0.05)');
    g.addColorStop(1, 'rgba(60,35,10,0.07)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
    // faint mottling
    for (let i = 0; i < 260; i++) {
      ctx.fillStyle = 'rgba(120,90,50,' + (Math.random() * 0.08) + ')';
      ctx.beginPath();
      ctx.ellipse(Math.random() * s, Math.random() * s, rand(8, 40), rand(6, 26), Math.random() * 3, 0, 7);
      ctx.fill();
    }
  }
  function drawSpots(ctx, s, count, rMin, rMax, alpha) {
    for (let i = 0; i < count; i++) {
      const r = rand(rMin, rMax);
      const cx = Math.random() * s, cy = Math.random() * s;
      const col = SPOT_DARK[(Math.random() * SPOT_DARK.length) | 0];
      ctx.globalAlpha = alpha;
      paintIrregularPatch(ctx, cx, cy, r, 8 + ((Math.random() * 3) | 0), 0.75, col);
      // outline hint, slightly darker, offset to fake depth
      ctx.globalAlpha = alpha * 0.5;
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = '#3a2413';
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  const coatTex = canvasTexture(512, (ctx, s) => {
    drawCoatBase(ctx, s, '#d2b078', '#cbb06f');
    drawSpots(ctx, s, 95, 20, 46, 1);
    // fine speckle
    for (let i = 0; i < 900; i++) {
      ctx.fillStyle = 'rgba(70,45,22,' + Math.random() * 0.25 + ')';
      ctx.fillRect(Math.random() * s, Math.random() * s, 1.6, 1.6);
    }
  }, { repeat: [1.6, 1.6] });

  const neckTex = canvasTexture(512, (ctx, s) => {
    drawCoatBase(ctx, s, '#d2b078', '#cbb06f');
    drawSpots(ctx, s, 70, 18, 40, 1);
  }, { repeat: [1, 1] });

  const legTex = canvasTexture(256, (ctx, s) => {
    drawCoatBase(ctx, s, '#d8c69c', '#cdba8e');
    drawSpots(ctx, s, 11, 12, 26, 0.7);   // sparse, faint spots on lower legs
  }, { repeat: [1, 1] });

  const headTex = canvasTexture(256, (ctx, s) => {
    drawCoatBase(ctx, s, '#d3b276', '#c6a263');
    drawSpots(ctx, s, 22, 12, 26, 0.9);
  }, { repeat: [1, 1] });

  const groundTex = canvasTexture(1024, (ctx, s) => {
    ctx.fillStyle = '#b59c66';
    ctx.fillRect(0, 0, s, s);
    // large dry-grass patches
    const patchCols = ['#a3a05e', '#8f8748', '#c4ac74', '#7d7642', '#b9a262'];
    for (let i = 0; i < 260; i++) {
      ctx.fillStyle = patchCols[(Math.random() * patchCols.length) | 0];
      ctx.globalAlpha = 0.35 + Math.random() * 0.3;
      ctx.beginPath();
      ctx.ellipse(Math.random() * s, Math.random() * s, rand(14, 90), rand(10, 60), Math.random() * 3, 0, 7);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    // trampled ring where the giraffe walks (walking radius 11 m of 90 m ground)
    const pxPerM = s / 180;
    ctx.strokeStyle = 'rgba(74,58,32,0.5)';
    ctx.lineWidth = 11 * pxPerM * 0.28;
    ctx.setLineDash([26, 18]);
    ctx.beginPath();
    ctx.arc(s / 2, s / 2, 11 * pxPerM, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    // pebbles & speckle
    for (let i = 0; i < 5200; i++) {
      ctx.fillStyle = Math.random() < 0.5 ? 'rgba(80,64,38,0.35)' : 'rgba(230,214,170,0.4)';
      ctx.fillRect(Math.random() * s, Math.random() * s, rand(1, 3.4), rand(1, 3.4));
    }
  });
  groundTex.anisotropy = 16;

  const barkTex = canvasTexture(256, (ctx, s) => {
    ctx.fillStyle = '#6b4c30';
    ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 60; i++) {
      ctx.strokeStyle = 'rgba(' + (Math.random() < 0.5 ? '40,26,14' : '140,105,66') + ',' + rand(0.35, 0.8) + ')';
      ctx.lineWidth = rand(2, 7);
      const x = Math.random() * s;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.bezierCurveTo(x + rand(-18, 18), s * 0.33, x + rand(-18, 18), s * 0.66, x + rand(-12, 12), s);
      ctx.stroke();
    }
  }, { repeat: [2, 2] });

  const cloudTex = (function () {
    const c = makeCanvas(256);
    const ctx = c.getContext('2d');
    const puffs = [
      [88, 150, 62], [130, 132, 74], [176, 150, 56],
      [120, 158, 70], [168, 160, 46], [80, 162, 40]
    ];
    puffs.forEach(([x, y, r]) => {
      const g = ctx.createRadialGradient(x, y, 2, x, y, r);
      g.addColorStop(0, 'rgba(255,252,244,0.95)');
      g.addColorStop(0.55, 'rgba(255,252,244,0.55)');
      g.addColorStop(1, 'rgba(255,252,244,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 256, 256);
    });
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();

  const sunTex = (function () {
    const c = makeCanvas(128);
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,246,220,1)');
    g.addColorStop(0.25, 'rgba(255,236,180,0.9)');
    g.addColorStop(1, 'rgba(255,230,160,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();

  // ------------------------------------------------------------- renderer
  const canvas = document.getElementById('scene');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadows;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xe3cfa3, 42, 135);

  // Sky dome with gradient + sun glow
  const sunDir = new THREE.Vector3(0.55, 0.52, 0.42).normalize();
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      cZenith: { value: new THREE.Color(0x5d8fc0) },
      cMid:    { value: new THREE.Color(0xa9bfa8) },
      cHorizon:{ value: new THREE.Color(0xeedcae) },
      sunDir:  { value: sunDir.clone() }
    },
    vertexShader: `
      varying vec3 vDir;
      void main(){
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform vec3 cZenith, cMid, cHorizon, sunDir;
      varying vec3 vDir;
      void main(){
        vec3 d = normalize(vDir);
        float h = d.y;
        vec3 col = mix(cHorizon, cMid, smoothstep(-0.02, 0.18, h));
        col = mix(col, cZenith, smoothstep(0.12, 0.72, h));
        if (h < 0.0) col = mix(cHorizon, cHorizon * 0.82, clamp(-h * 2.4, 0.0, 1.0));
        float s = max(dot(d, normalize(sunDir)), 0.0);
        col += vec3(1.0, 0.88, 0.62) * pow(s, 350.0) * 1.6;   // disc
        col += vec3(1.0, 0.82, 0.5)  * pow(s, 18.0)  * 0.35;  // halo
        gl_FragColor = vec4(col, 1.0);
      }`
  });
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(320, 32, 20), skyMat));

  // Sun sprite
  const sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: sunTex, transparent: true, depthWrite: false, fog: false
  }));
  sunSprite.position.copy(sunDir).multiplyScalar(280);
  sunSprite.scale.set(70, 70, 1);
  scene.add(sunSprite);

  // ------------------------------------------------------------- lights
  const hemi = new THREE.HemisphereLight(0xcfe0ec, 0x8a6f47, 0.85);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xfff0d8, 2.35);
  sun.position.copy(sunDir).multiplyScalar(46);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -17; sun.shadow.camera.right = 17;
  sun.shadow.camera.top = 17; sun.shadow.camera.bottom = -17;
  sun.shadow.camera.near = 8; sun.shadow.camera.far = 110;
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.02;
  scene.add(sun);
  scene.add(sun.target);

  const fill = new THREE.DirectionalLight(0xbfd4e0, 0.5);
  fill.position.set(-30, 18, -26);
  scene.add(fill);

  // ---------------------------------------------------------- materials
  const coatMat  = new THREE.MeshStandardMaterial({ map: coatTex, roughness: 0.82, metalness: 0.0 });
  const neckMat  = new THREE.MeshStandardMaterial({ map: neckTex, roughness: 0.82, metalness: 0.0 });
  const headMat  = new THREE.MeshStandardMaterial({ map: headTex, roughness: 0.82, metalness: 0.0 });
  const legMat   = new THREE.MeshStandardMaterial({ map: legTex, roughness: 0.85, metalness: 0.0 });
  const darkMat  = new THREE.MeshStandardMaterial({ color: 0x352416, roughness: 0.9 });   // mane, tufts
  const hoofMat  = new THREE.MeshStandardMaterial({ color: 0x2e2823, roughness: 0.55 });
  const skinDark = new THREE.MeshStandardMaterial({ color: 0x1c130c, roughness: 0.45 }); // nose, eyes base
  const creamMat = new THREE.MeshStandardMaterial({ color: 0xdcc9a0, roughness: 0.8 });
  const eyeMat   = new THREE.MeshStandardMaterial({ color: 0x14100a, roughness: 0.12, metalness: 0.35 });

  const sphere = (r, w, h) => new THREE.SphereGeometry(r, w || 20, h || 14);

  // =========================================================== GIRAFFE ===
  const giraffe = new THREE.Group();   // root, positioned on path, rotated to heading
  const body = new THREE.Group();      // inner group for bob/roll/sway
  giraffe.add(body);
  scene.add(giraffe);

  // ---- torso
  const barrel = new THREE.Mesh(sphere(1, 40, 28), coatMat);
  barrel.scale.set(0.60, 0.585, 1.24);
  barrel.position.set(0, 2.70, 0);
  body.add(barrel);

  const chest = new THREE.Mesh(sphere(0.52, 28, 20), coatMat);
  chest.scale.set(1.02, 1.06, 0.92);
  chest.position.set(0, 2.62, 0.86);
  body.add(chest);

  const rump = new THREE.Mesh(sphere(0.55, 28, 20), coatMat);
  rump.scale.set(0.96, 0.92, 0.95);
  rump.position.set(0, 2.72, -0.84);
  body.add(rump);

  const withers = new THREE.Mesh(sphere(0.34, 20, 14), coatMat);
  withers.scale.set(0.9, 0.75, 1.1);
  withers.position.set(0, 3.13, 0.62);
  body.add(withers);

  // belly (slightly lighter, subtle)
  const belly = new THREE.Mesh(sphere(0.5, 24, 16), creamMat);
  belly.scale.set(0.98, 0.44, 1.95);
  belly.position.set(0, 2.27, 0);
  body.add(belly);

  // ---- neck (3 nested segments, gentle S-curve)
  const neckRoot = new THREE.Group();
  neckRoot.position.set(0, 3.08, 0.94);
  neckRoot.rotation.x = 0.46;
  body.add(neckRoot);

  const NECK_R = [0.205, 0.175, 0.148];
  const NECK_L = [0.92, 0.88, 0.78];
  const segGroups = [];
  let parent = neckRoot;
  for (let i = 0; i < 3; i++) {
    if (i > 0) { parent.children; } // parent already positioned
    const g = new THREE.Group();
    if (i > 0) g.position.set(0, NECK_L[i - 1], 0);
    g.rotation.x = i === 0 ? 0 : (i === 1 ? -0.13 : -0.235);
    const geo = new THREE.CylinderGeometry(NECK_R[i + 1] || 0.148, NECK_R[i], NECK_L[i], 18, 1);
    const mesh = new THREE.Mesh(geo, neckMat);
    mesh.position.y = NECK_L[i] / 2;
    g.add(mesh);
    // joint ball at top to smooth the kink
    const joint = new THREE.Mesh(sphere((NECK_R[i + 1] || 0.130) * 1.02, 16, 12), neckMat);
    joint.position.y = NECK_L[i];
    g.add(joint);
    parent.add(g);
    segGroups.push(g);
    parent = g;
  }

  // mane — dark mohawk tufts along the back (-Z side) of the neck
  const maneTufts = [];
  const makeTuft = (w, h, d) => {
    const m = new THREE.Mesh(new THREE.ConeGeometry(w, h, 5), darkMat);
    m.scale.z = d / w;
    return m;
  };
  segGroups.forEach((seg, si) => {
    const r = NECK_R[si];
    const L = NECK_L[si];
    const n = 7;
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      const tuft = makeTuft(0.055, 0.17 + 0.05 * Math.sin(t * Math.PI), 0.05);
      tuft.position.set(0, t * L, -(r * 0.92 + 0.015));
      tuft.rotation.x = -0.22;
      seg.add(tuft);
      maneTufts.push(tuft);
    }
  });

  // ---- head
  const headRoot = new THREE.Group();
  headRoot.position.set(0, NECK_L[2], 0);
  // counter the accumulated forward tilt so the face looks forward, not into the ground
  headRoot.rotation.x = -0.10;
  segGroups[2].add(headRoot);

  const skull = new THREE.Mesh(sphere(1, 24, 18), headMat);
  skull.scale.set(0.128, 0.142, 0.185);
  skull.position.set(0, 0.02, 0.02);
  headRoot.add(skull);

  // forehead bump (giraffe forehead is bony & broad)
  const brow = new THREE.Mesh(sphere(0.105, 18, 12), headMat);
  brow.scale.set(1.15, 0.7, 0.9);
  brow.position.set(0, 0.085, 0.075);
  headRoot.add(brow);

  // muzzle — elongated, slightly downturned, cream
  const muzzle = new THREE.Mesh(sphere(1, 22, 16), creamMat);
  muzzle.scale.set(0.093, 0.088, 0.175);
  muzzle.position.set(0, -0.085, 0.185);
  muzzle.rotation.x = 0.18;
  headRoot.add(muzzle);

  // nose cap
  const nose = new THREE.Mesh(sphere(1, 18, 12), skinDark);
  nose.scale.set(0.078, 0.062, 0.055);
  nose.position.set(0, -0.125, 0.335);
  nose.rotation.x = 0.25;
  headRoot.add(nose);

  // nostrils
  [-1, 1].forEach(s => {
    const n = new THREE.Mesh(sphere(0.0135, 8, 8), new THREE.MeshStandardMaterial({ color: 0x070403, roughness: 0.6 }));
    n.position.set(s * 0.036, -0.125, 0.385);
    headRoot.add(n);
  });

  // eyes — large, dark, glossy, with a catch-light
  [-1, 1].forEach(s => {
    const eye = new THREE.Mesh(sphere(0.0305, 14, 12), eyeMat);
    eye.position.set(s * 0.096, 0.015, 0.135);
    headRoot.add(eye);
    const glint = new THREE.Mesh(sphere(0.008, 6, 6),
      new THREE.MeshBasicMaterial({ color: 0xfff6e0 }));
    glint.position.set(s * 0.103, 0.026, 0.160);
    headRoot.add(glint);
    // heavy upper eyelash ridge
    const lash = new THREE.Mesh(new THREE.TorusGeometry(0.030, 0.006, 6, 14, Math.PI * 0.9), darkMat);
    lash.position.copy(eye.position).add(new THREE.Vector3(0, 0.012, 0.004));
    lash.rotation.set(Math.PI / 2.6, s * 0.35, s > 0 ? -0.35 : Math.PI + 0.35);
    headRoot.add(lash);
  });

  // ossicones — skin-covered cylinders with dark tufts
  [-1, 1].forEach(s => {
    const oss = new THREE.Mesh(new THREE.CylinderGeometry(0.021, 0.026, 0.115, 10), headMat);
    oss.position.set(s * 0.058, 0.185, -0.015);
    oss.rotation.z = -s * 0.12;
    headRoot.add(oss);
    const tuft = new THREE.Mesh(sphere(0.036, 10, 8), darkMat);
    tuft.position.set(s * 0.065, 0.245, -0.015);
    tuft.scale.y = 0.75;
    headRoot.add(tuft);
  });
  // median bony bump (male trait)
  const bump = new THREE.Mesh(new THREE.ConeGeometry(0.024, 0.075, 8), headMat);
  bump.position.set(0, 0.175, 0.035);
  headRoot.add(bump);

  // forelock tuft between ossicones
  const forelock = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.11, 7), darkMat);
  forelock.position.set(0, 0.165, -0.075);
  forelock.rotation.x = -0.35;
  headRoot.add(forelock);

  // ears — leaf-shaped, on the sides
  [-1, 1].forEach(s => {
    const ear = new THREE.Mesh(sphere(1, 14, 10), headMat);
    ear.scale.set(0.075, 0.042, 0.028);
    ear.position.set(s * 0.155, 0.045, -0.035);
    ear.rotation.z = s * 0.5;
    ear.rotation.y = s * -0.35;
    headRoot.add(ear);
    const inner = new THREE.Mesh(sphere(1, 10, 8), creamMat);
    inner.scale.set(0.052, 0.027, 0.012);
    inner.position.set(s * 0.168, 0.048, -0.022);
    inner.rotation.z = s * 0.5;
    inner.rotation.y = s * -0.4;
    headRoot.add(inner);
  });

  // cheek tufts / beard
  const beard = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.16, 6), darkMat);
  beard.position.set(0, -0.19, 0.16);
  beard.rotation.x = Math.PI + 0.35;
  headRoot.add(beard);

  // ---- legs
  const HOOF_H = 0.16;
  function buildLeg(isHind) {
    const upperLen = isHind ? 1.10 : 1.16;
    const lowerLen = isHind ? 1.30 : 1.24;
    const hip = new THREE.Group();

    const hipBall = new THREE.Mesh(sphere(isHind ? 0.145 : 0.125, 14, 10), coatMat);
    hip.add(hipBall);

    // upper segment (coat pattern up top, fading to plain)
    const upper = new THREE.Mesh(new THREE.CylinderGeometry(isHind ? 0.128 : 0.104, isHind ? 0.088 : 0.078, upperLen, 14), coatMat);
    upper.position.y = -upperLen / 2;
    if (isHind) upper.rotation.x = -0.15;         // stifle angles forward
    hip.add(upper);

    const knee = new THREE.Group();
    knee.position.y = -upperLen;
    hip.add(knee);

    const kneeBall = new THREE.Mesh(sphere(isHind ? 0.095 : 0.082, 12, 10), legMat);
    knee.add(kneeBall);

    const lower = new THREE.Mesh(new THREE.CylinderGeometry(isHind ? 0.082 : 0.072, 0.055, lowerLen, 12), legMat);
    lower.position.y = -lowerLen / 2;
    if (isHind) lower.rotation.x = 0.14;          // hock sits back, cannon drops down
    knee.add(lower);

    const fetlock = new THREE.Group();
    fetlock.position.y = -lowerLen;
    knee.add(fetlock);

    const fetlockBall = new THREE.Mesh(sphere(0.062, 10, 8), legMat);
    fetlock.add(fetlockBall);

    const hoof = new THREE.Mesh(new THREE.CylinderGeometry(0.088, 0.096, HOOF_H, 12), hoofMat);
    hoof.position.y = -HOOF_H / 2 + 0.015;
    fetlock.add(hoof);

    return { hip, knee, fetlock, upperLen, lowerLen };
  }

  const legFL = buildLeg(false); legFL.hip.position.set( 0.40, 2.52,  0.78);
  const legFR = buildLeg(false); legFR.hip.position.set(-0.40, 2.52,  0.78);
  const legHL = buildLeg(true);  legHL.hip.position.set( 0.40, 2.56, -0.80);
  const legHR = buildLeg(true);  legHR.hip.position.set(-0.40, 2.56, -0.80);
  [legFL, legFR, legHL, legHR].forEach(l => body.add(l.hip));

  // dark chestnut calluses on upper inner front legs (subtle, skip-able detail)
  // (kept minimal — geometry noise risk not worth it)

  // ---- tail
  const tailPivot = new THREE.Group();
  tailPivot.position.set(0, 2.95, -1.32);
  body.add(tailPivot);
  const tailSeg = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.030, 0.78, 8), coatMat);
  tailSeg.position.y = -0.39;
  tailPivot.add(tailSeg);
  const tailTuft = new THREE.Mesh(new THREE.ConeGeometry(0.075, 0.42, 8), darkMat);
  tailTuft.position.y = -0.95;
  tailTuft.rotation.x = Math.PI;
  tailPivot.add(tailTuft);

  // shadows on everything in the giraffe
  giraffe.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; } });

  // ============================================================ WORLD ====
  // ground
  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(95, 48),
    new THREE.MeshStandardMaterial({ map: groundTex, roughness: 1, metalness: 0 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // distant ridge / hills
  const hillMat = new THREE.MeshStandardMaterial({ color: 0xa68d5f, roughness: 1, flatShading: true });
  [[-70, -40, 34, 9], [30, -78, 46, 12], [78, 30, 30, 8], [-55, 55, 40, 10], [0, 88, 52, 11]].forEach(([x, z, r, h]) => {
    const hill = new THREE.Mesh(new THREE.ConeGeometry(r, h, 7), hillMat);
    hill.position.set(x, h * 0.32, z);
    hill.rotation.y = Math.random() * Math.PI;
    scene.add(hill);
  });

  // acacia trees
  const barkMat = new THREE.MeshStandardMaterial({ map: barkTex, roughness: 0.95 });
  const canopyMat = new THREE.MeshStandardMaterial({ color: 0x5c6b31, roughness: 1, flatShading: true });
  const canopyMat2 = new THREE.MeshStandardMaterial({ color: 0x6d7838, roughness: 1, flatShading: true });

  function jitteredBlob(r, detail, jitter) {
    const g = new THREE.IcosahedronGeometry(r, detail);
    const pos = g.attributes.position;
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      const n = 1 + (Math.sin(v.x * 12.9898 + v.y * 78.233 + v.z * 37.719) * 43758.5453 % 1) * jitter;
      v.multiplyScalar(Math.abs(n) * 0.5 + 0.75);
      pos.setXYZ(i, v.x, v.y, v.z);
    }
    g.computeVertexNormals();
    return g;
  }

  function makeAcacia(scale) {
    const tree = new THREE.Group();
    const lean = rand(-0.14, 0.14);
    const trunkH = 2.3 * scale;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.14 * scale, 0.26 * scale, trunkH, 9), barkMat);
    trunk.position.y = trunkH / 2;
    trunk.rotation.z = lean;
    tree.add(trunk);
    // two main limbs
    for (let i = 0; i < 2; i++) {
      const limb = new THREE.Mesh(new THREE.CylinderGeometry(0.06 * scale, 0.11 * scale, 1.5 * scale, 7), barkMat);
      const side = i === 0 ? 1 : -1;
      limb.position.set(side * 0.45 * scale, trunkH + 0.35 * scale, rand(-0.2, 0.2));
      limb.rotation.z = side * 0.7;
      tree.add(limb);
    }
    // flat-topped canopy: 3-4 jittered blobs, squashed
    const blobs = 3 + ((Math.random() * 2) | 0);
    for (let i = 0; i < blobs; i++) {
      const blob = new THREE.Mesh(jitteredBlob(rand(0.9, 1.5) * scale, 1, 0.5), i % 2 ? canopyMat : canopyMat2);
      blob.scale.set(1.5, 0.42, 1.35);
      blob.position.set(rand(-1.3, 1.3) * scale, trunkH + rand(0.9, 1.35) * scale, rand(-1.1, 1.1) * scale);
      tree.add(blob);
    }
    tree.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    return tree;
  }

  const treeSpots = [
    [16, -20, 1.15], [-19, -14, 0.9], [24, 9, 1.35], [-25, 16, 1.1],
    [7, -30, 1.25], [-8, 27, 0.95], [34, -12, 0.85], [-33, -4, 1.2], [14, 26, 1.0]
  ];
  treeSpots.forEach(([x, z, s]) => {
    const t = makeAcacia(s);
    t.position.set(x, 0, z);
    t.rotation.y = Math.random() * Math.PI * 2;
    scene.add(t);
  });

  // rocks
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x8d8578, roughness: 0.95, flatShading: true });
  for (let i = 0; i < 14; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = rand(14, 55);
    const rock = new THREE.Mesh(jitteredBlob(rand(0.25, 0.9), 0, 0.6), rockMat);
    rock.position.set(Math.cos(a) * r, rand(0.05, 0.2), Math.sin(a) * r);
    rock.scale.y = rand(0.5, 0.8);
    rock.rotation.y = Math.random() * Math.PI;
    rock.castShadow = rock.receiveShadow = true;
    scene.add(rock);
  }

  // grass tufts — instanced cones
  const grassGeo = new THREE.ConeGeometry(0.05, 0.4, 5);
  grassGeo.translate(0, 0.18, 0);
  const grassMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1 });
  const grass = new THREE.InstancedMesh(grassGeo, grassMat, 900);
  const dummy = new THREE.Object3D();
  const gCol = new THREE.Color();
  for (let i = 0; i < 900; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = 3 + Math.pow(Math.random(), 0.7) * 62;
    dummy.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
    dummy.rotation.set(rand(-0.22, 0.22), Math.random() * Math.PI, rand(-0.22, 0.22));
    const sc = rand(0.6, 1.6);
    dummy.scale.set(sc, sc * rand(0.8, 1.5), sc);
    dummy.updateMatrix();
    grass.setMatrixAt(i, dummy.matrix);
    gCol.setHSL(0.115 + Math.random() * 0.05, rand(0.3, 0.5), rand(0.25, 0.38));
    grass.setColorAt(i, gCol);
  }
  grass.instanceMatrix.needsUpdate = true;
  if (grass.instanceColor) grass.instanceColor.needsUpdate = true;
  scene.add(grass);

  // clouds
  const clouds = [];
  for (let i = 0; i < 8; i++) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({
      map: cloudTex, transparent: true, opacity: rand(0.65, 0.95), depthWrite: false, fog: false
    }));
    const a = Math.random() * Math.PI * 2;
    sp.position.set(Math.cos(a) * rand(60, 150), rand(26, 55), Math.sin(a) * rand(60, 150));
    const s = rand(28, 62);
    sp.scale.set(s, s * 0.55, 1);
    sp.userData.angle = a;
    sp.userData.dist = Math.hypot(sp.position.x, sp.position.z);
    sp.userData.speed = rand(0.004, 0.009);
    clouds.push(sp);
    scene.add(sp);
  }

  // birds — simple flapping silhouettes circling high up
  const birdMat = new THREE.MeshBasicMaterial({ color: 0x2a241c, side: THREE.DoubleSide });
  const birds = [];
  for (let i = 0; i < 4; i++) {
    const bird = new THREE.Group();
    const wingGeo = new THREE.PlaneGeometry(1.05, 0.26);
    wingGeo.translate(0.52, 0, 0);
    const wl = new THREE.Mesh(wingGeo, birdMat);
    const wr = new THREE.Mesh(wingGeo, birdMat);
    wr.rotation.y = Math.PI;
    bird.add(wl, wr);
    bird.userData = { angle: Math.random() * Math.PI * 2, radius: rand(14, 24), height: rand(13, 19), speed: rand(0.12, 0.2), phase: Math.random() * 7, wl, wr };
    birds.push(bird);
    scene.add(bird);
  }

  // ------------------------------------------------------------- camera
  const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 400);
  const camTarget = new THREE.Vector3(0, 2.6, 0);
  {
    // frame the giraffe from the front-left quarter on load, not from behind/inside the scene
    const ang0 = Math.PI * 0.35;                 // matches initial distance below
    const heading0 = Math.atan2(-Math.sin(ang0), Math.cos(ang0));
    var camTheta = heading0 + 0.6;
    var gx0 = Math.cos(ang0) * 11, gz0 = Math.sin(ang0) * 11;
    camTarget.set(gx0, 2.65, gz0);
    var camRadiusInit = 11.0;
    var sinP = Math.sin(1.22);
    camera.position.set(
      camTarget.x + camRadiusInit * sinP * Math.sin(camTheta),
      camTarget.y + camRadiusInit * Math.cos(1.22) * 0.7 + 0.9,
      camTarget.z + camRadiusInit * sinP * Math.cos(camTheta)
    );
    camera.lookAt(camTarget);
  }
  var camRadius = 11.0;
  var camPhi = 1.22;         // polar-ish: angle from horizontal feel
  var cameraMode = 'orbit';  // 'orbit' | 'follow'
  try {                      // optional deep-links: ?r=6&theta=0.5&phi=1.0
    const q = new URLSearchParams(window.location.search);
    if (q.has('r')) camRadius = clamp(parseFloat(q.get('r')) || 11.0, 4, 30);
    if (q.has('theta')) camTheta += parseFloat(q.get('theta')) || 0;
    if (q.has('phi')) camPhi = clamp(parseFloat(q.get('phi')) || 1.22, 0.7, 1.48);
  } catch (e) { /* ignore */ }
  let dragging = false;
  let lastPointer = { x: 0, y: 0 };
  let lastDragEnd = -10;

  canvas.addEventListener('pointerdown', e => {
    dragging = true;
    lastPointer = { x: e.clientX, y: e.clientY };
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', e => {
    if (!dragging) return;
    const dx = e.clientX - lastPointer.x, dy = e.clientY - lastPointer.y;
    lastPointer = { x: e.clientX, y: e.clientY };
    camTheta -= dx * 0.0052;
    camPhi = clamp(camPhi + dy * 0.004, 0.7, 1.48);
  });
  const endDrag = () => { dragging = false; lastDragEnd = perfNow(); };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('wheel', e => {
    e.preventDefault();
    camRadius = clamp(camRadius * (1 + e.deltaY * 0.0011), 5.0, 26);
  }, { passive: false });

  function perfNow() { return performance.now() / 1000; }

  function updateCamera(dt, giraffePos, heading) {
    camTarget.lerp(new THREE.Vector3(giraffePos.x, giraffePos.y + 2.55, giraffePos.z), 1 - Math.pow(0.0015, dt));
    if (cameraMode === 'follow') {
      const back = new THREE.Vector3(Math.sin(heading), 0, Math.cos(heading));
      const desired = camTarget.clone().addScaledVector(back, -9.2).add(new THREE.Vector3(0, 3.4, 0));
      camera.position.lerp(desired, 1 - Math.pow(0.01, dt));
      camera.lookAt(camTarget.x, camTarget.y + 0.3, camTarget.z);
    } else {
      // slow cinematic auto-orbit, pauses briefly after user drags
      if (!dragging && perfNow() - lastDragEnd > 2.5) camTheta += dt * 0.055;
      const sinPhi = Math.sin(camPhi);
      const desired = new THREE.Vector3(
        camTarget.x + camRadius * sinPhi * Math.sin(camTheta),
        camTarget.y + camRadius * Math.cos(camPhi) * 0.7 + 0.9,
        camTarget.z + camRadius * sinPhi * Math.cos(camTheta)
      );
      camera.position.lerp(desired, 1 - Math.pow(0.0008, dt));
      camera.lookAt(camTarget);
    }
  }

  // --------------------------------------------------------- animation
  const WALK_RADIUS = 11;
  const STRIDE = 2.35;             // metres per full stride cycle
  const BASE_SPEED = 1.45;         // m/s
  let distance = Math.PI * 0.35;   // starting arc position
  let animTime = 0;
  let speedFactor = 1;
  let paused = false;

  const phaseFor = { FL: 0, FR: Math.PI, HL: 0.38, HR: Math.PI + 0.38 }; // pace gait, hind slightly lagging

  function animateLeg(leg, phase, isHind) {
    const swing = 0.52;
    const bendAmp = isHind ? 1.05 : 1.3;
    const hipRot = swing * Math.sin(phase);
    // knee folds while the leg is swinging forward through the air
    const lift = Math.pow(Math.max(0, Math.sin(phase - 2.6)), 2);
    // carpal (front) folds backward; hock (hind) folds forward
    const kneeRot = (isHind ? -1 : 1) * bendAmp * lift;
    leg.hip.rotation.x = hipRot;
    leg.knee.rotation.x = kneeRot;
    leg.fetlock.rotation.x = -(hipRot + kneeRot) * 0.62 + 0.08 * Math.sin(phase * 2);
  }

  function tick(nowMs) {
    requestAnimationFrame(tick);
    const now = nowMs / 1000;
    let dt = Math.min(0.05, now - (tick.last || now));
    tick.last = now;

    if (!paused) {
      animTime += dt;
      const speed = BASE_SPEED * speedFactor;
      distance += speed * dt;

      const ang = distance / WALK_RADIUS;
      const gx = Math.cos(ang) * WALK_RADIUS;
      const gz = Math.sin(ang) * WALK_RADIUS;
      const heading = Math.atan2(-Math.sin(ang), Math.cos(ang));  // tangent of circle, facing travel dir
      giraffe.position.set(gx, 0, gz);
      giraffe.rotation.y = heading;

      const ph = (distance / STRIDE) * Math.PI * 2;

      animateLeg(legFL, ph + phaseFor.FL, false);
      animateLeg(legFR, ph + phaseFor.FR, false);
      animateLeg(legHL, ph + phaseFor.HL, true);
      animateLeg(legHR, ph + phaseFor.HR, true);

      // body: lateral sway (pace gait rocks side to side), vertical bob, counter-yaw
      body.position.y = 0.055 * Math.sin(2 * ph + 1.1);
      body.rotation.z = 0.038 * Math.sin(ph);
      body.rotation.x = 0.018 * Math.sin(2 * ph + 0.4);
      body.rotation.y = 0.035 * Math.sin(ph + Math.PI / 2);

      // neck & head: gentle nod opposite the stride, plus slow look-around
      const look = Math.sin(animTime * 0.35) * 0.22;
      neckRoot.rotation.x = 0.46 + 0.035 * Math.sin(ph * 2 + 0.7);
      neckRoot.rotation.y = look;
      neckRoot.rotation.z = 0.03 * Math.sin(ph + 0.5);
      headRoot.rotation.y = -look * 0.7 + 0.06 * Math.sin(ph * 2 + 1.9);
      headRoot.rotation.x = -0.10 + 0.045 * Math.sin(ph * 2 + 1.1);

      // tail: loose swish with occasional unhurried sway
      tailPivot.rotation.x = 0.42 + 0.1 * Math.sin(animTime * 1.1);
      tailPivot.rotation.z = 0.35 * Math.sin(animTime * 1.6 + 1.2) + 0.12 * Math.sin(ph);

      // clouds drift
      clouds.forEach(c => {
        c.userData.angle += c.userData.speed * dt * 0.12;
        c.position.x = Math.cos(c.userData.angle) * c.userData.dist;
        c.position.z = Math.sin(c.userData.angle) * c.userData.dist;
      });

      // birds circle & flap
      birds.forEach(b => {
        const u = b.userData;
        u.angle += u.speed * dt;
        b.position.set(Math.cos(u.angle) * u.radius, u.height + Math.sin(animTime * 0.7 + u.phase) * 0.8, Math.sin(u.angle) * u.radius);
        b.rotation.y = -u.angle; // face along flight path-ish
        const flap = Math.sin(animTime * 6 + u.phase) * 0.55;
        u.wl.rotation.z = flap;
        u.wr.rotation.z = -flap;
      });
    }

    updateCamera(dt, giraffe.position, giraffe.rotation.y);
    renderer.render(scene, camera);
  }

  // -------------------------------------------------------------- UI
  const btnPause = document.getElementById('btn-pause');
  const btnCamera = document.getElementById('btn-camera');
  const speedInput = document.getElementById('speed');
  const speedVal = document.getElementById('speed-val');

  function setPaused(p) {
    paused = p;
    btnPause.textContent = paused ? '▶ Resume' : '⏸ Pause';
  }
  function toggleCamera() {
    cameraMode = cameraMode === 'orbit' ? 'follow' : 'orbit';
    btnCamera.textContent = cameraMode === 'orbit' ? '🎥 Orbit' : '🎥 Follow';
  }
  btnPause.addEventListener('click', () => setPaused(!paused));
  btnCamera.addEventListener('click', toggleCamera);
  speedInput.addEventListener('input', () => {
    speedFactor = parseFloat(speedInput.value);
    speedVal.textContent = speedFactor.toFixed(2) + '×';
  });
  window.addEventListener('keydown', e => {
    if (e.code === 'Space') { e.preventDefault(); setPaused(!paused); }
    else if (e.key === 'c' || e.key === 'C') toggleCamera();
  });

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // initialize distance/stride phase consistently before first frame
  distance = Math.PI * 0.35;
  requestAnimationFrame(tick);
})();
