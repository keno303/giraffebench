/* =============================================================================
   world.js — savanna environment: sky, terrain, grass, acacias, dust
   ========================================================================== */
(function () {
  'use strict';
  const NS = window.GIRAFFE;
  const V3 = THREE.Vector3;

  const SUN_DIR = new V3(0.72, 0.60, 0.34).normalize();

  /* ---------- terrain ---------------------------------------------------- */
  function terrainHeight(x, z) {
    const r = Math.hypot(x, z);
    const k = NS.smoothstep(46, 110, r);
    if (k <= 0) return 0;
    const n =
      Math.sin(x * 0.021 + 1.3) * Math.cos(z * 0.017 - 0.7) * 0.5 +
      Math.sin(x * 0.008 - 2.1) * 0.5 +
      Math.cos(z * 0.011 + 0.4) * 0.35;
    return k * (2.6 + n * 4.2);
  }
  NS.terrainHeight = terrainHeight;

  /* ---------- sky -------------------------------------------------------- */
  function makeSky() {
    const geo = new THREE.SphereGeometry(600, 40, 24);
    /* NOTE: ShaderMaterial output is written straight to the framebuffer, so the
       colours below are authored directly in sRGB (no linear->sRGB conversion). */
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        sunDir: { value: SUN_DIR.clone() },
        zenith: { value: new THREE.Vector3(0.200, 0.440, 0.720) },
        horizon: { value: new THREE.Vector3(0.780, 0.780, 0.735) },
        ground: { value: new THREE.Vector3(0.640, 0.590, 0.480) },
        sunCol: { value: new THREE.Vector3(1.0, 0.96, 0.86) }
      },
      vertexShader: [
        'varying vec3 vDir;',
        'void main(){',
        '  vDir = position;',
        '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
        '}'
      ].join('\n'),
      fragmentShader: [
        'varying vec3 vDir;',
        'uniform vec3 sunDir, zenith, horizon, ground, sunCol;',
        'float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }',
        'float vnoise(vec2 p){',
        '  vec2 i = floor(p), f = fract(p);',
        '  vec2 u = f * f * (3.0 - 2.0 * f);',
        '  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),',
        '             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);',
        '}',
        'float fbm(vec2 p){',
        '  float v = 0.0, a = 0.5;',
        '  for (int i = 0; i < 4; i++) { v += a * vnoise(p); p *= 2.03; a *= 0.5; }',
        '  return v;',
        '}',
        'void main(){',
        '  vec3 d = normalize(vDir);',
        '  float h = d.y;',
        '  vec3 col = mix(horizon, zenith, pow(clamp(h, 0.0, 1.0), 0.62));',
        '  if (h < 0.0) col = mix(horizon, ground, clamp(-h * 4.0, 0.0, 1.0));',
        '  /* clouds */',
        '  if (h > 0.02) {',
        '    vec2 uv = d.xz / (h + 0.18) * 0.55;',
        '    float c = fbm(uv * 1.4 + vec2(3.2, 1.7));',
        '    c = smoothstep(0.52, 0.78, c) * smoothstep(0.02, 0.25, h);',
        '    vec3 cc = mix(vec3(0.88, 0.87, 0.85), vec3(1.0, 0.98, 0.93), pow(max(dot(d, sunDir), 0.0), 3.0));',
        '    col = mix(col, cc, c * 0.8);',
        '  }',
        '  float sd = max(dot(d, sunDir), 0.0);',
        '  col += sunCol * pow(sd, 1400.0) * 1.4;',
        '  col += sunCol * pow(sd, 24.0) * 0.20;',
        '  col += sunCol * pow(sd, 4.0) * 0.05;',
        '  gl_FragColor = vec4(col, 1.0);',
        '}'
      ].join('\n')
    });
    const m = new THREE.Mesh(geo, mat);
    m.frustumCulled = false;
    m.renderOrder = -1;
    return m;
  }

  /* ---------- grass tuft geometry ---------------------------------------- */
  function makeTuftGeometry(blades, seed) {
    const rnd = NS.mulberry32(seed);
    const pos = [], col = [], idx = [];
    let vi = 0;
    for (let b = 0; b < blades; b++) {
      const a = rnd() * Math.PI * 2;
      const dx = Math.cos(a), dz = Math.sin(a);
      const px = -dz, pz = dx;
      const h = 0.26 + rnd() * 0.34;
      const w = 0.016 + rnd() * 0.014;
      const lean = 0.18 + rnd() * 0.45;
      const ox = (rnd() - 0.5) * 0.10, oz = (rnd() - 0.5) * 0.10;
      const segs = 2;
      let prevL = null, prevR = null;
      for (let s = 0; s <= segs; s++) {
        const t = s / segs;
        const y = h * t;
        const off = lean * h * t * t;
        const cx = ox + dx * off, cz = oz + dz * off;
        const ww = w * (1 - t * 0.92);
        const lx = cx + px * ww, lz = cz + pz * ww;
        const rx = cx - px * ww, rz = cz - pz * ww;
        pos.push(lx, y, lz, rx, y, rz);
        const shade = 0.55 + 0.45 * t;
        col.push(shade * 0.92, shade, shade * 0.80, shade * 0.92, shade, shade * 0.80);
        if (s > 0) {
          const a0 = vi - 2, b0 = vi - 1, a1 = vi, b1 = vi + 1;
          idx.push(a0, a1, b0, b0, a1, b1);
        }
        vi += 2;
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }

  /* ---------- acacia ------------------------------------------------------ */
  const barkMat = new THREE.MeshStandardMaterial({ color: 0x4a3b2c, roughness: 0.95 });
  const leafMats = [
    new THREE.MeshStandardMaterial({ color: 0x4f5f2e, roughness: 0.9 }),
    new THREE.MeshStandardMaterial({ color: 0x5d6d35, roughness: 0.9 }),
    new THREE.MeshStandardMaterial({ color: 0x44552a, roughness: 0.9 })
  ];

  function makeAcacia(seed, scale) {
    const rnd = NS.mulberry32(seed);
    const g = new THREE.Group();
    const trunkH = (2.2 + rnd() * 1.2) * scale;
    const trunkR = 0.16 * scale;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(trunkR * 0.55, trunkR, trunkH, 7, 1), barkMat);
    trunk.position.y = trunkH / 2;
    trunk.rotation.z = (rnd() - 0.5) * 0.12;
    trunk.castShadow = true; trunk.receiveShadow = true;
    g.add(trunk);

    const crownY = trunkH;
    const branches = 3 + ((rnd() * 2) | 0);
    const crown = new THREE.Group();
    crown.position.y = crownY;
    g.add(crown);
    const leafMat = leafMats[(rnd() * leafMats.length) | 0];
    for (let i = 0; i < branches; i++) {
      const a = (i / branches) * Math.PI * 2 + rnd() * 0.8;
      const len = (1.1 + rnd() * 0.9) * scale;
      const br = new THREE.Mesh(new THREE.CylinderGeometry(0.04 * scale, 0.09 * scale, len, 5, 1), barkMat);
      br.position.set(Math.cos(a) * len * 0.32, len * 0.26, Math.sin(a) * len * 0.32);
      br.rotation.set(Math.sin(a) * 0.85, 0, -Math.cos(a) * 0.85);
      br.castShadow = true;
      crown.add(br);

      const blobs = 2 + ((rnd() * 2) | 0);
      for (let j = 0; j < blobs; j++) {
        const s = (0.85 + rnd() * 0.7) * scale;
        const m = new THREE.Mesh(new THREE.SphereGeometry(1, 9, 6), leafMat);
        m.position.set(
          Math.cos(a) * len * (0.55 + rnd() * 0.4) + (rnd() - 0.5) * 0.5 * scale,
          len * 0.42 + (rnd() - 0.3) * 0.35 * scale,
          Math.sin(a) * len * (0.55 + rnd() * 0.4) + (rnd() - 0.5) * 0.5 * scale
        );
        m.scale.set(s * 1.35, s * 0.38, s * 1.25);
        m.castShadow = true; m.receiveShadow = true;
        crown.add(m);
      }
    }
    /* flat top pad */
    const pad = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 7), leafMat);
    pad.scale.set(1.9 * scale, 0.30 * scale, 1.75 * scale);
    pad.position.y = 0.55 * scale;
    pad.castShadow = true; pad.receiveShadow = true;
    crown.add(pad);

    return g;
  }

  /* ---------- dust -------------------------------------------------------- */
  function makeDust(scene) {
    const MAX = 90;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(MAX * 3);
    const life = new Float32Array(MAX);
    const size = new Float32Array(MAX);
    const seedA = new Float32Array(MAX);
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aLife', new THREE.BufferAttribute(life, 1));
    geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seedA, 1));

    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: {
        uTex: { value: NS.softCircle(64, 'rgba(255,255,255,0.9)', 'rgba(255,255,255,0.35)', 0.5) },
        uColor: { value: new THREE.Color(0.80, 0.72, 0.56) },
        uPixel: { value: 1 }
      },
      vertexShader: [
        'attribute float aLife; attribute float aSize; attribute float aSeed;',
        'varying float vLife; varying float vSeed;',
        'uniform float uPixel;',
        'void main(){',
        '  vLife = aLife; vSeed = aSeed;',
        '  vec4 mv = modelViewMatrix * vec4(position, 1.0);',
        '  float grow = 1.0 + (1.0 - aLife) * 2.6;',
        '  gl_PointSize = aSize * grow * uPixel * (260.0 / max(-mv.z, 0.1));',
        '  gl_Position = projectionMatrix * mv;',
        '}'
      ].join('\n'),
      fragmentShader: [
        'uniform sampler2D uTex; uniform vec3 uColor;',
        'varying float vLife; varying float vSeed;',
        'void main(){',
        '  vec4 t = texture2D(uTex, gl_PointCoord);',
        '  float a = t.a * smoothstep(0.0, 0.18, vLife) * vLife * 0.55;',
        '  if (a < 0.004) discard;',
        '  gl_FragColor = vec4(uColor, a);',
        '}'
      ].join('\n')
    });

    const points = new THREE.Points(geo, mat);
    points.frustumCulled = false;
    scene.add(points);

    const parts = [];
    for (let i = 0; i < MAX; i++) parts.push({ life: 0, vx: 0, vy: 0, vz: 0, max: 1, s: 1 });
    let cursor = 0;

    function spawn(p, strength) {
      const q = parts[cursor];
      cursor = (cursor + 1) % MAX;
      q.life = 1;
      q.max = 0.9 + Math.random() * 0.8;
      const a = Math.random() * Math.PI * 2, r = Math.random() * 0.18;
      pos[cursor * 3] = p.x + Math.cos(a) * r;
      pos[cursor * 3 + 1] = p.y + 0.03 + Math.random() * 0.08;
      pos[cursor * 3 + 2] = p.z + Math.sin(a) * r;
      q.vx = Math.cos(a) * 0.25 * strength;
      q.vz = Math.sin(a) * 0.25 * strength;
      q.vy = 0.35 + Math.random() * 0.35;
      q.s = 0.10 + Math.random() * 0.12;
    }

    function update(dt) {
      for (let i = 0; i < MAX; i++) {
        const q = parts[i];
        if (q.life <= 0) { life[i] = 0; continue; }
        q.life -= dt / q.max;
        if (q.life < 0) q.life = 0;
        pos[i * 3] += q.vx * dt;
        pos[i * 3 + 1] += q.vy * dt;
        pos[i * 3 + 2] += q.vz * dt;
        q.vy -= 0.25 * dt;
        q.vx *= 0.985; q.vz *= 0.985;
        life[i] = q.life;
        size[i] = q.s;
        seedA[i] = i * 0.37;
      }
      geo.attributes.position.needsUpdate = true;
      geo.attributes.aLife.needsUpdate = true;
      geo.attributes.aSize.needsUpdate = true;
    }

    return { spawn: spawn, update: update, points: points };
  }

  /* ---------- world ------------------------------------------------------- */
  NS.createWorld = function (scene, renderer) {
    const group = new THREE.Group();
    scene.add(group);

    /* sky */
    const sky = makeSky();
    scene.add(sky);

    /* fog */
    const fogCol = new THREE.Color(0xd9cdb2);
    scene.fog = new THREE.Fog(fogCol, 70, 300);

    /* lights */
    const hemi = new THREE.HemisphereLight(0xbcd6f2, 0x7a6a46, 1.30);
    scene.add(hemi);

    const sun = new THREE.DirectionalLight(0xfff0d2, 3.1);
    sun.position.copy(SUN_DIR).multiplyScalar(40);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 110;
    sun.shadow.camera.left = -9;
    sun.shadow.camera.right = 9;
    sun.shadow.camera.top = 9;
    sun.shadow.camera.bottom = -9;
    sun.shadow.bias = -0.0006;
    sun.shadow.normalBias = 0.022;
    scene.add(sun);
    scene.add(sun.target);

    const fill = new THREE.DirectionalLight(0xa9c6e8, 0.75);
    fill.position.set(-SUN_DIR.x * 30, 14, -SUN_DIR.z * 30);
    scene.add(fill);

    /* ground */
    const gTex = NS.groundTexture({ size: 512, seed: 5 });
    gTex.repeat.set(90, 90);
    const groundGeo = new THREE.PlaneGeometry(800, 800, 170, 170);
    groundGeo.rotateX(-Math.PI / 2);
    const gp = groundGeo.attributes.position;
    const gcol = new Float32Array(gp.count * 3);
    const gTint = NS.makeFbm(77, 3, 3);
    for (let i = 0; i < gp.count; i++) {
      const x = gp.getX(i), z = gp.getZ(i);
      const h = terrainHeight(x, z);
      gp.setY(i, h);
      /* large scale tint: greener hollows, drier/lighter tops */
      const n = gTint((x + 400) / 800, (z + 400) / 800);
      const dry = NS.smoothstep(0.5, 6.0, h);
      gcol[i * 3] = Math.min(1, 0.80 + 0.26 * n + 0.14 * dry);
      gcol[i * 3 + 1] = Math.min(1, 0.84 + 0.20 * n + 0.02 * dry);
      gcol[i * 3 + 2] = Math.min(1, 0.74 + 0.16 * n - 0.10 * dry);
    }
    groundGeo.setAttribute('color', new THREE.BufferAttribute(gcol, 3));
    groundGeo.computeVertexNormals();
    const groundMat = new THREE.MeshStandardMaterial({
      map: gTex, roughness: 0.97, metalness: 0, color: 0xffffff, vertexColors: true
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.receiveShadow = true;
    group.add(ground);

    /* grass tufts */
    const tuftGeo = makeTuftGeometry(7, 3);
    const grassMat = new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: 0.95, metalness: 0, side: THREE.DoubleSide
    });
    const GRASS_N = 4200;
    const grass = new THREE.InstancedMesh(tuftGeo, grassMat, GRASS_N);
    grass.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const dummy = new THREE.Object3D();
    const col = new THREE.Color();
    const rnd = NS.mulberry32(99);
    const grassData = new Array(GRASS_N);
    for (let i = 0; i < GRASS_N; i++) {
      // denser near the middle
      const a = rnd() * Math.PI * 2;
      /* 55 % of the tufts in a band around the animal's path, the rest spread out */
      const r = (i < GRASS_N * 0.55)
        ? 15 + rnd() * 26
        : 5 + Math.pow(rnd(), 1.30) * 88;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      const y = terrainHeight(x, z) - 0.02;
      const ry = rnd() * Math.PI * 2;
      const sc = 0.7 + rnd() * 0.9;
      const sy = sc * (0.8 + rnd() * 0.6);
      grassData[i] = { x: x, y: y, z: z, ry: ry, sx: sc, sy: sy, ph: rnd() * 6.283 };
      dummy.position.set(x, y, z);
      dummy.rotation.y = ry;
      dummy.scale.set(sc, sy, sc);
      dummy.updateMatrix();
      grass.setMatrixAt(i, dummy.matrix);
      const t = rnd();
      col.setRGB(0.42 + t * 0.22, 0.44 + t * 0.18, 0.20 + t * 0.12);
      grass.setColorAt(i, col);
    }
    grass.instanceMatrix.needsUpdate = true;
    if (grass.instanceColor) grass.instanceColor.needsUpdate = true;
    grass.receiveShadow = true;
    grass.castShadow = false;
    grass.frustumCulled = false;
    group.add(grass);

    /* trees */
    const treeCount = 18;
    const trnd = NS.mulberry32(1234);
    for (let i = 0; i < treeCount; i++) {
      const a = (i / treeCount) * Math.PI * 2 + trnd() * 0.5;
      const r = 52 + trnd() * 120;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      const t = makeAcacia(1000 + i, 1.1 + trnd() * 1.5);
      t.position.set(x, terrainHeight(x, z) - 0.1, z);
      t.rotation.y = trnd() * Math.PI * 2;
      group.add(t);
    }
    /* a few close, small shrubs */
    for (let i = 0; i < 10; i++) {
      const a = trnd() * Math.PI * 2, r = 14 + trnd() * 30;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      const t = makeAcacia(500 + i, 0.35 + trnd() * 0.3);
      t.position.set(x, terrainHeight(x, z) - 0.05, z);
      t.rotation.y = trnd() * Math.PI * 2;
      group.add(t);
    }

    /* rocks */
    const rockMat = new THREE.MeshStandardMaterial({ color: 0x6b6154, roughness: 0.95 });
    const rrnd = NS.mulberry32(77);
    for (let i = 0; i < 14; i++) {
      const a = rrnd() * Math.PI * 2, r = 10 + rrnd() * 55;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      const s = 0.25 + rrnd() * 0.7;
      const m = new THREE.Mesh(new THREE.DodecahedronGeometry(1, 0), rockMat);
      m.position.set(x, terrainHeight(x, z) + s * 0.25, z);
      m.scale.set(s, s * 0.6, s * 0.9);
      m.rotation.set(rrnd() * 3, rrnd() * 3, rrnd() * 3);
      m.castShadow = true; m.receiveShadow = true;
      group.add(m);
    }

    /* birds */
    const birds = [];
    const birdMat = new THREE.MeshBasicMaterial({ color: 0x2a2622, side: THREE.DoubleSide });
    const birdGeo = new THREE.BufferGeometry();
    birdGeo.setAttribute('position', new THREE.Float32BufferAttribute([
      0, 0, 0, -0.55, 0.12, -0.18, -0.02, 0, 0.10,
      0, 0, 0, 0.55, 0.12, -0.18, 0.02, 0, 0.10
    ], 3));
    birdGeo.computeVertexNormals();
    for (let i = 0; i < 7; i++) {
      const b = new THREE.Mesh(birdGeo, birdMat);
      const s = 0.55 + Math.random() * 0.5;
      b.scale.setScalar(s);
      b.userData = {
        r: 55 + Math.random() * 45,
        h: 26 + Math.random() * 16,
        a: Math.random() * Math.PI * 2,
        sp: 0.05 + Math.random() * 0.04,
        cx: (Math.random() - 0.5) * 60,
        cz: (Math.random() - 0.5) * 60
      };
      scene.add(b);
      birds.push(b);
    }

    const dust = makeDust(scene);

    /* ---------- update ---------------------------------------------------- */
    const tmp = new V3();
    let time = 0, grassTick = 0;

    function updateGrass(t) {
      /* gentle wind: rotate each tuft about its base */
      for (let i = 0; i < GRASS_N; i++) {
        const d = grassData[i];
        const w = Math.sin(t * 1.35 + d.ph) * 0.055 + Math.sin(t * 2.6 + d.ph * 1.7) * 0.022;
        dummy.position.set(d.x, d.y, d.z);
        dummy.rotation.set(w * 0.55, d.ry, w);
        dummy.scale.set(d.sx, d.sy, d.sx);
        dummy.updateMatrix();
        grass.setMatrixAt(i, dummy.matrix);
      }
      grass.instanceMatrix.needsUpdate = true;
    }

    function update(dt, focus) {
      time += dt;
      /* 30 Hz is plenty for slow grass movement */
      grassTick += dt;
      if (grassTick > 0.033) { updateGrass(time); grassTick = 0; }
      /* sun / shadow follows the animal */
      sun.target.position.set(focus.x, 1.6, focus.z);
      sun.target.updateMatrixWorld();
      sun.position.copy(focus).add(tmp.copy(SUN_DIR).multiplyScalar(45));
      sun.position.y = focus.y + 45 * SUN_DIR.y;

      /* birds */
      for (const b of birds) {
        const u = b.userData;
        u.a += u.sp * dt;
        const x = u.cx + Math.cos(u.a) * u.r;
        const z = u.cz + Math.sin(u.a) * u.r;
        b.position.set(x, u.h + Math.sin(u.a * 2.3) * 1.4, z);
        b.rotation.y = -u.a + Math.PI / 2;
        b.rotation.z = Math.sin(time * 5 + u.a * 3) * 0.35;
      }

      dust.update(dt);
    }

    return {
      group: group,
      birds: birds,
      sun: sun,
      sunDir: SUN_DIR.clone(),
      dust: dust,
      update: update,
      sky: sky
    };
  };
})();