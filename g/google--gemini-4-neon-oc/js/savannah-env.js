// Golden-Hour East African Savannah Environment, Procedural Sky, Acacias, Grass & Dust
(function (global) {
  'use strict';

  const SavannahEnv = {};

  const PRESETS = {
    golden: {
      name: 'Golden Hour',
      sunDir: new THREE.Vector3(-0.68, 0.34, 0.65).normalize(),
      sunColor: new THREE.Color(0xffdfa8),
      sunIntensity: 1.55,
      hemiSky: new THREE.Color(0x7caad9),
      hemiGround: new THREE.Color(0x9a6536),
      hemiIntensity: 0.56,
      rimColor: new THREE.Color(0xffb463),
      rimIntensity: 0.38,
      skyTop: new THREE.Color(0x1f4b82),
      skyMid: new THREE.Color(0x6d99c0),
      skyHorizon: new THREE.Color(0xebb57c),
      sunGlow: new THREE.Color(0xffe7b8),
      fogColor: new THREE.Color(0xdca974),
      fogDensity: 0.0112,
      exposure: 0.96,
    },
    midday: {
      name: 'Savannah Noon',
      sunDir: new THREE.Vector3(-0.35, 0.86, 0.38).normalize(),
      sunColor: new THREE.Color(0xfff5e4),
      sunIntensity: 1.75,
      hemiSky: new THREE.Color(0x8ec5f2),
      hemiGround: new THREE.Color(0xa67c4e),
      hemiIntensity: 0.68,
      rimColor: new THREE.Color(0xfff0d6),
      rimIntensity: 0.18,
      skyTop: new THREE.Color(0x1f5ca8),
      skyMid: new THREE.Color(0x6eaee0),
      skyHorizon: new THREE.Color(0xd2e0e8),
      sunGlow: new THREE.Color(0xffffeb),
      fogColor: new THREE.Color(0xcbd5cf),
      fogDensity: 0.0085,
      exposure: 0.92,
    },
    sunset: {
      name: 'Serengeti Dusk',
      sunDir: new THREE.Vector3(-0.78, 0.16, 0.60).normalize(),
      sunColor: new THREE.Color(0xff8c42),
      sunIntensity: 1.48,
      hemiSky: new THREE.Color(0x5c4c7d),
      hemiGround: new THREE.Color(0x723e22),
      hemiIntensity: 0.48,
      rimColor: new THREE.Color(0xff6b28),
      rimIntensity: 0.58,
      skyTop: new THREE.Color(0x152047),
      skyMid: new THREE.Color(0x6e405f),
      skyHorizon: new THREE.Color(0xe67b42),
      sunGlow: new THREE.Color(0xffbd66),
      fogColor: new THREE.Color(0xbd6e48),
      fogDensity: 0.0132,
      exposure: 0.98,
    },
  };

  /**
   * Creates a seamless tileable savannah earth albedo + bump texture pair.
   */
  function createGroundTextures() {
    const size = 512;
    const albedoCanvas = document.createElement('canvas');
    albedoCanvas.width = size;
    albedoCanvas.height = size;
    const ctxA = albedoCanvas.getContext('2d');

    const bumpCanvas = document.createElement('canvas');
    bumpCanvas.width = size;
    bumpCanvas.height = size;
    const ctxB = bumpCanvas.getContext('2d');

    const imgA = ctxA.createImageData(size, size);
    const imgB = ctxB.createImageData(size, size);
    const dA = imgA.data;
    const dB = imgB.data;

    // Periodic 2D trigonometric + hash tileable noise
    function tileNoise(u, v, freq, seed) {
      const a = u * Math.PI * 2;
      const b = v * Math.PI * 2;
      // Map 2D torus into 3D/4D-like smooth periodic noise using GiraffeMath.noise3D
      const r = freq / (Math.PI * 2);
      const nx = Math.cos(a) * r + seed * 13.7;
      const ny = Math.sin(a) * r + Math.cos(b) * r * 0.7;
      const nz = Math.sin(b) * r + seed * 7.3;
      return GiraffeMath.noise3D(nx, ny, nz);
    }

    const rng = GiraffeMath.createRNG(909);

    for (let y = 0; y < size; y++) {
      const v = y / size;
      for (let x = 0; x < size; x++) {
        const u = x / size;
        const n1 = tileNoise(u, v, 4.0, 1.0);
        const n2 = tileNoise(u, v, 10.0, 2.3) * 0.5;
        const n3 = tileNoise(u, v, 24.0, 4.7) * 0.25;
        const grain = (rng() - 0.5) * 0.14;
        const h = (n1 + n2 + n3) * 0.5 + 0.5 + grain;

        // Rich sun-baked East African ochre/terracotta earth with organic darker soil patches
        const dryPatch = GiraffeMath.smoothstep(0.32, 0.80, h);
        const r = Math.round(GiraffeMath.clamp(132 + dryPatch * 36 + grain * 42, 0, 255));
        const g = Math.round(GiraffeMath.clamp(98  + dryPatch * 29 + grain * 32, 0, 255));
        const b = Math.round(GiraffeMath.clamp(58  + dryPatch * 17 + grain * 22, 0, 255));

        const idx = (y * size + x) * 4;
        dA[idx] = r;
        dA[idx + 1] = g;
        dA[idx + 2] = b;
        dA[idx + 3] = 255;

        const bv = Math.round(GiraffeMath.clamp(h * 255, 0, 255));
        dB[idx] = bv;
        dB[idx + 1] = bv;
        dB[idx + 2] = bv;
        dB[idx + 3] = 255;
      }
    }

    ctxA.putImageData(imgA, 0, 0);
    ctxB.putImageData(imgB, 0, 0);

    // Paint subtle scattered dried grass straws & tiny pebbles onto albedo
    for (let i = 0; i < 650; i++) {
      const px = rng() * size;
      const py = rng() * size;
      const len = 3 + rng() * 9;
      const ang = rng() * Math.PI * 2;
      ctxA.strokeStyle = rng() > 0.4 ? 'rgba(186, 152, 92, 0.35)' : 'rgba(108, 82, 52, 0.32)';
      ctxA.lineWidth = 1;
      ctxA.beginPath();
      ctxA.moveTo(px, py);
      ctxA.lineTo(px + Math.cos(ang) * len, py + Math.sin(ang) * len);
      ctxA.stroke();
    }

    const albedo = new THREE.CanvasTexture(albedoCanvas);
    albedo.encoding = THREE.sRGBEncoding;
    albedo.wrapS = THREE.RepeatWrapping;
    albedo.wrapT = THREE.RepeatWrapping;
    albedo.anisotropy = 8;

    const bump = new THREE.CanvasTexture(bumpCanvas);
    bump.wrapS = THREE.RepeatWrapping;
    bump.wrapT = THREE.RepeatWrapping;
    bump.anisotropy = 4;

    return { albedo, bump };
  }

  /**
   * Builds a multi-blade savannah grass tuft geometry for InstancedMesh.
   */
  function createGrassTuftGeometry() {
    const positions = [];
    const normals = [];
    const colors = [];
    const indices = [];
    const rng = GiraffeMath.createRNG(555);

    const bladeCount = 9;
    const cBase = new THREE.Color(0x5e4a22).convertSRGBToLinear();
    const cMid  = new THREE.Color(0x9e7d3a).convertSRGBToLinear();
    const cTip  = new THREE.Color(0xcfa958).convertSRGBToLinear();
    const cTmp  = new THREE.Color();

    let vOffset = 0;
    for (let b = 0; b < bladeCount; b++) {
      const ang = (b / bladeCount) * Math.PI * 2 + (rng() - 0.5) * 0.45;
      const rad = 0.02 + rng() * 0.05;
      const bx = Math.cos(ang) * rad;
      const bz = Math.sin(ang) * rad;
      const h = 0.24 + rng() * 0.28;
      const lean = 0.08 + rng() * 0.16;
      const w = 0.018 + rng() * 0.010;
      const dirX = Math.cos(ang);
      const dirZ = Math.sin(ang);
      const perpX = -dirZ;
      const perpZ = dirX;
      const shade = 0.85 + rng() * 0.30;

      // 3 height segments (bottom, mid, pointed tip)
      const segs = [
        { t: 0.0, wf: 1.0, col: cBase },
        { t: 0.52, wf: 0.62, col: cMid },
        { t: 1.0, wf: 0.04, col: cTip },
      ];

      for (let s = 0; s < segs.length; s++) {
        const t = segs[s].t;
        const hw = w * segs[s].wf * 0.5;
        const bend = t * t * lean;
        const cx = bx + dirX * bend;
        const cy = h * t;
        const cz = bz + dirZ * bend;
        cTmp.copy(segs[s].col).multiplyScalar(shade);

        for (const sgn of [-1, 1]) {
          positions.push(cx + perpX * hw * sgn, cy, cz + perpZ * hw * sgn);
          normals.push(dirX * 0.35, 0.92, dirZ * 0.35);
          colors.push(cTmp.r, cTmp.g, cTmp.b);
        }
      }

      indices.push(vOffset + 0, vOffset + 1, vOffset + 2);
      indices.push(vOffset + 1, vOffset + 3, vOffset + 2);
      indices.push(vOffset + 2, vOffset + 3, vOffset + 4);
      indices.push(vOffset + 3, vOffset + 5, vOffset + 4);
      vOffset += 6;
    }

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geom.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geom.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geom.setIndex(indices);
    return geom;
  }

  /**
   * Builds an iconic East African Flat-Topped Umbrella Acacia tree (Vachellia tortilis)!
   */
  function createUmbrellaAcacia(seed, barkMat, foliageMat) {
    const rng = GiraffeMath.createRNG(seed);
    const group = new THREE.Group();

    const trunkH = 3.2 + rng() * 1.4;
    const leanX = (rng() - 0.5) * 0.7;
    const leanZ = (rng() - 0.5) * 0.7;

    // Helper: curved tapered branch tube
    function addBranch(pts, rStart, rEnd, segs, radSegs) {
      const curve = new THREE.CatmullRomCurve3(pts);
      const frames = curve.computeFrenetFrames(segs, false);
      const positions = [];
      const indices = [];

      for (let i = 0; i <= segs; i++) {
        const t = i / segs;
        const p = curve.getPointAt(t);
        const r = GiraffeMath.lerp(rStart, rEnd, Math.pow(t, 0.75));
        const N = frames.normals[i];
        const B = frames.binormals[i];
        for (let j = 0; j <= radSegs; j++) {
          const a = (j / radSegs) * Math.PI * 2;
          const vx = p.x + r * (Math.cos(a) * N.x + Math.sin(a) * B.x);
          const vy = p.y + r * (Math.cos(a) * N.y + Math.sin(a) * B.y);
          const vz = p.z + r * (Math.cos(a) * N.z + Math.sin(a) * B.z);
          positions.push(vx, vy, vz);
        }
      }

      const stride = radSegs + 1;
      for (let i = 0; i < segs; i++) {
        for (let j = 0; j < radSegs; j++) {
          const a = i * stride + j;
          const b = a + 1;
          const d = (i + 1) * stride + j;
          const e = d + 1;
          indices.push(a, d, b);
          indices.push(b, d, e);
        }
      }

      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      g.setIndex(indices);
      g.computeVertexNormals();
      const m = new THREE.Mesh(g, barkMat);
      m.castShadow = true;
      m.receiveShadow = true;
      group.add(m);
    }

    // Main gnarled trunk splitting halfway up
    const splitPt = new THREE.Vector3(leanX * 0.65, trunkH * 0.58, leanZ * 0.65);
    addBranch(
      [
        new THREE.Vector3(0, -0.1, 0),
        new THREE.Vector3(leanX * 0.25, trunkH * 0.28, leanZ * 0.25),
        splitPt,
      ],
      0.24 + rng() * 0.08,
      0.14 + rng() * 0.04,
      8,
      8
    );

    // 4-5 wide spreading primary limbs forming the iconic flat umbrella crown!
    const numLimbs = 4 + Math.floor(rng() * 2);
    const canopyY = trunkH + 1.0 + rng() * 0.6;

    for (let i = 0; i < numLimbs; i++) {
      const a = (i / numLimbs) * Math.PI * 2 + (rng() - 0.5) * 0.4;
      const spread = 2.6 + rng() * 1.8;
      const midPt = new THREE.Vector3(
        splitPt.x + Math.cos(a) * spread * 0.52,
        splitPt.y + (canopyY - splitPt.y) * 0.62,
        splitPt.z + Math.sin(a) * spread * 0.52
      );
      const tipPt = new THREE.Vector3(
        splitPt.x + Math.cos(a) * spread,
        canopyY + (rng() - 0.5) * 0.35,
        splitPt.z + Math.sin(a) * spread
      );

      addBranch([splitPt, midPt, tipPt], 0.11, 0.032, 7, 6);

      // Layered flat-topped feathery foliage pads with natural true-linear vertex-color canopy AO!
      const cUnder = new THREE.Color(0x233315).convertSRGBToLinear();
      const cMidF  = new THREE.Color(0x445922).convertSRGBToLinear();
      const cTopF  = new THREE.Color(0x697c32).convertSRGBToLinear();
      const cF     = new THREE.Color();

      function makeFoliagePad(padR, seedOff) {
        const padGeom = new THREE.IcosahedronGeometry(padR, 3);
        const pos = padGeom.getAttribute('position');
        const cols = new Float32Array(pos.count * 3);
        for (let k = 0; k < pos.count; k++) {
          let vx = pos.getX(k);
          let vy = pos.getY(k);
          let vz = pos.getZ(k);
          const n1 = GiraffeMath.noise3D(vx * 1.5 + seedOff, vy * 1.5, vz * 1.5);
          const n2 = GiraffeMath.noise3D(vx * 4.2 + seedOff, vy * 4.2, vz * 4.2) * 0.35;
          const n = n1 + n2;
          const yNorm = vy / padR; // -1 bottom to +1 top
          // Flatten into layered horizontal acacia umbrella pad with feathery edges
          vy *= (vy > 0 ? 0.22 : 0.14);
          vx *= (1.0 + n * 0.22);
          vz *= (1.0 + n * 0.22);
          vy += n * 0.12;
          pos.setXYZ(k, vx, vy, vz);

          // Rich vertical canopy AO: dark shaded olive underneath, warm sunlit olive-sage on top!
          const topT = GiraffeMath.smoothstep(-0.6, 0.85, yNorm + n2 * 0.4);
          if (topT < 0.5) cF.copy(cUnder).lerp(cMidF, topT * 2);
          else cF.copy(cMidF).lerp(cTopF, (topT - 0.5) * 2);
          cols[k * 3] = cF.r;
          cols[k * 3 + 1] = cF.g;
          cols[k * 3 + 2] = cF.b;
        }
        padGeom.setAttribute('color', new THREE.BufferAttribute(cols, 3));
        padGeom.computeVertexNormals();
        return padGeom;
      }

      const pads = 3 + Math.floor(rng() * 2);
      for (let p = 0; p < pads; p++) {
        const padR = 1.10 + rng() * 0.85;
        const padMesh = new THREE.Mesh(makeFoliagePad(padR, seed + i * 17 + p * 31), foliageMat);
        padMesh.position.set(
          tipPt.x + (rng() - 0.5) * 1.45,
          tipPt.y + 0.15 + (rng() - 0.5) * 0.26,
          tipPt.z + (rng() - 0.5) * 1.45
        );
        padMesh.castShadow = true;
        padMesh.receiveShadow = true;
        group.add(padMesh);
      }
    }

    // Central crown cap connecting limbs
    const cUnderC = new THREE.Color(0x233315).convertSRGBToLinear();
    const cMidFC  = new THREE.Color(0x445922).convertSRGBToLinear();
    const cTopFC  = new THREE.Color(0x697c32).convertSRGBToLinear();
    const cFC     = new THREE.Color();
    const capR = 2.15 + rng() * 0.55;
    const capGeom = new THREE.IcosahedronGeometry(capR, 3);
    const cPos = capGeom.getAttribute('position');
    const capCols = new Float32Array(cPos.count * 3);
    for (let k = 0; k < cPos.count; k++) {
      let vx = cPos.getX(k);
      let vy = cPos.getY(k);
      let vz = cPos.getZ(k);
      const n = GiraffeMath.noise3D(vx * 1.2 + seed, vy * 1.2, vz * 1.2)
              + GiraffeMath.noise3D(vx * 3.8 + seed, vy * 3.8, vz * 3.8) * 0.3;
      const yNorm = vy / capR;
      vy *= (vy > 0 ? 0.20 : 0.13);
      vx *= (1.0 + n * 0.18);
      vz *= (1.0 + n * 0.18);
      cPos.setXYZ(k, vx, vy, vz);
      const topT = GiraffeMath.smoothstep(-0.6, 0.85, yNorm);
      if (topT < 0.5) cFC.copy(cUnderC).lerp(cMidFC, topT * 2);
      else cFC.copy(cMidFC).lerp(cTopFC, (topT - 0.5) * 2);
      capCols[k * 3] = cFC.r;
      capCols[k * 3 + 1] = cFC.g;
      capCols[k * 3 + 2] = cFC.b;
    }
    capGeom.setAttribute('color', new THREE.BufferAttribute(capCols, 3));
    capGeom.computeVertexNormals();
    const capMesh = new THREE.Mesh(capGeom, foliageMat);
    capMesh.position.set(splitPt.x, canopyY + 0.32, splitPt.z);
    capMesh.castShadow = true;
    capMesh.receiveShadow = true;
    group.add(capMesh);

    return group;
  }

  /**
   * Creates the complete Savannah environment, lighting, sky dome, PMREM IBL,
   * endless scrolling ground, grass tufts, acacias, distant hills & dust puffs.
   */
  SavannahEnv.createEnvironment = function (scene, renderer) {
    const envGroup = new THREE.Group();
    envGroup.name = 'SavannahEnvironment';
    scene.add(envGroup);

    // --- 1. PROCEDURAL ATMOSPHERIC SKY DOME ---
    const skyUniforms = {
      uSunDir:     { value: PRESETS.golden.sunDir.clone() },
      uSkyTop:     { value: PRESETS.golden.skyTop.clone() },
      uSkyMid:     { value: PRESETS.golden.skyMid.clone() },
      uSkyHorizon: { value: PRESETS.golden.skyHorizon.clone() },
      uSunGlow:    { value: PRESETS.golden.sunGlow.clone() },
    };

    const skyMat = new THREE.ShaderMaterial({
      uniforms: skyUniforms,
      side: THREE.BackSide,
      depthWrite: false,
      vertexShader: `
        varying vec3 vWorldDir;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorldDir = normalize(wp.xyz);
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: `
        uniform vec3 uSunDir;
        uniform vec3 uSkyTop;
        uniform vec3 uSkyMid;
        uniform vec3 uSkyHorizon;
        uniform vec3 uSunGlow;
        varying vec3 vWorldDir;

        void main() {
          vec3 dir = normalize(vWorldDir);
          float y = clamp(dir.y, 0.0, 1.0);

          // Multi-band atmospheric scattering gradient
          vec3 col = mix(uSkyHorizon, uSkyMid, smoothstep(0.0, 0.24, y));
          col = mix(col, uSkyTop, smoothstep(0.18, 0.82, y));

          // Warm horizon Mie band
          float sunDot = max(0.0, dot(dir, normalize(uSunDir)));
          float mieWide = pow(sunDot, 5.0) * 0.36;
          float mieTight = pow(sunDot, 48.0) * 0.75;
          float sunDisc = smoothstep(0.9985, 0.9996, sunDot) * 2.2;

          col += uSunGlow * (mieWide + mieTight + sunDisc);

          // Subtle ground bounce below horizon
          if (dir.y < 0.0) {
            col = mix(uSkyHorizon * 0.72, vec3(0.45, 0.32, 0.20), smoothstep(0.0, -0.35, dir.y));
          }

          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });

    const skyMesh = new THREE.Mesh(new THREE.SphereGeometry(220, 32, 20), skyMat);
    skyMesh.name = 'SkyDome';
    envGroup.add(skyMesh);

    // --- 2. LIGHTS (Sun Key + Hemisphere Bounce + Golden Rim) ---
    const sunLight = new THREE.DirectionalLight(PRESETS.golden.sunColor, PRESETS.golden.sunIntensity);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.set(2048, 2048);
    sunLight.shadow.camera.near = 2;
    sunLight.shadow.camera.far = 42;
    const dShadow = 9.2;
    sunLight.shadow.camera.left = -dShadow;
    sunLight.shadow.camera.right = dShadow;
    sunLight.shadow.camera.top = dShadow;
    sunLight.shadow.camera.bottom = -dShadow;
    sunLight.shadow.bias = -0.00045;
    sunLight.shadow.normalBias = 0.025;
    scene.add(sunLight);
    scene.add(sunLight.target);
    sunLight.target.position.set(0, 1.8, 0.3);

    const hemiLight = new THREE.HemisphereLight(
      PRESETS.golden.hemiSky,
      PRESETS.golden.hemiGround,
      PRESETS.golden.hemiIntensity
    );
    scene.add(hemiLight);

    const rimLight = new THREE.DirectionalLight(PRESETS.golden.rimColor, PRESETS.golden.rimIntensity);
    scene.add(rimLight);

    // Procedural PMREM environment from sky dome for photorealistic IBL on eyes, fur sheen & hooves
    const pmremGen = new THREE.PMREMGenerator(renderer);
    pmremGen.compileEquirectangularShader();
    let currentEnvRT = null;

    function rebuildIBL() {
      const envScene = new THREE.Scene();
      const envSky = new THREE.Mesh(new THREE.SphereGeometry(20, 24, 16), skyMat);
      envScene.add(envSky);
      const nextRT = pmremGen.fromScene(envScene, 0.04);
      scene.environment = nextRT.texture;
      if (currentEnvRT) currentEnvRT.dispose();
      currentEnvRT = nextRT;
    }

    // --- 3. SCROLLING SAVANNAH EARTH GROUND (Zero-Tiling Multi-Scale Shader!) ---
    const GROUND_SIZE = 240;
    const TILE_METERS = 13.5; // Large tile + world-space macro breakup = ZERO tiling artifacts!
    const { albedo: groundTex, bump: groundBump } = createGroundTextures();
    const repeatCount = GROUND_SIZE / TILE_METERS;
    groundTex.repeat.set(repeatCount, repeatCount);
    groundBump.repeat.set(repeatCount, repeatCount);

    const groundMat = new THREE.MeshStandardMaterial({
      map: groundTex,
      bumpMap: groundBump,
      bumpScale: 0.038,
      roughness: 0.96,
      metalness: 0.0,
      envMapIntensity: 0.28,
    });
    const groundUniforms = { uGroundDist: { value: 0 } };
    groundMat.onBeforeCompile = function (shader) {
      shader.uniforms.uGroundDist = groundUniforms.uGroundDist;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vGroundWorld;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGroundWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
          uniform float uGroundDist;
          varying vec3 vGroundWorld;
          float gHash21(vec2 p) {
            return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
          }
          float gNoise2(vec2 p) {
            vec2 i = floor(p);
            vec2 f = fract(p);
            vec2 u = f * f * (3.0 - 2.0 * f);
            return mix(
              mix(gHash21(i), gHash21(i + vec2(1.0, 0.0)), u.x),
              mix(gHash21(i + vec2(0.0, 1.0)), gHash21(i + vec2(1.0, 1.0)), u.x),
              u.y
            );
          }`
        )
        .replace(
          '#include <map_fragment>',
          `#include <map_fragment>
          {
            // World-locked non-repeating macro savannah soil & subtle trail variation!
            vec2 wp = vec2(vGroundWorld.x, vGroundWorld.z + uGroundDist);
            float nMacro1 = gNoise2(wp * 0.055);
            float nMacro2 = gNoise2(wp * 0.14 + vec2(17.3, 9.1));
            float patchMix = nMacro1 * 0.65 + nMacro2 * 0.35;
            // Subtle warm sandy ochre vs darker dry olive-earth patches
            vec3 sandyTint = vec3(1.12, 1.06, 0.94);
            vec3 dryEarth  = vec3(0.76, 0.72, 0.62);
            // Subtle worn game trail along x = 0
            float trail = exp(-wp.x * wp.x * 0.45);
            vec3 macroCol = mix(dryEarth, sandyTint, smoothstep(0.22, 0.78, patchMix));
            macroCol = mix(macroCol, vec3(1.04, 0.96, 0.84), trail * 0.35);
            diffuseColor.rgb *= macroCol;
          }`
        );
    };
    groundMat.customProgramCacheKey = () => 'savannah-ground-macro-v1';

    const groundGeom = new THREE.PlaneGeometry(GROUND_SIZE, GROUND_SIZE, 1, 1);
    groundGeom.rotateX(-Math.PI * 0.5);
    const groundMesh = new THREE.Mesh(groundGeom, groundMat);
    groundMesh.name = 'SavannahGround';
    groundMesh.receiveShadow = true;
    envGroup.add(groundMesh);

    // --- 4. INSTANCED SWAYING SAVANNAH GRASS TUFTS (Wrapped seamlessly with walking!) ---
    const grassGeom = createGrassTuftGeometry();
    const grassMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.86,
      metalness: 0.0,
      side: THREE.DoubleSide,
      envMapIntensity: 0.65,
    });

    const GRASS_COUNT = 3200;
    const GRASS_SPAN_Z = 72;
    const GRASS_SPAN_X = 68;
    const grassInst = new THREE.InstancedMesh(grassGeom, grassMat, GRASS_COUNT);
    grassInst.castShadow = false;
    grassInst.receiveShadow = true;
    grassInst.frustumCulled = false;
    envGroup.add(grassInst);

    const rng = GiraffeMath.createRNG(2026);
    const grassData = [];
    const grassTint = new THREE.Color();
    for (let i = 0; i < GRASS_COUNT; i++) {
      let x = (rng() - 0.5) * GRASS_SPAN_X;
      // Keep the narrow dusty game-trail right under the giraffe's hooves mostly open so hooves shine clearly!
      if (Math.abs(x) < 1.15 && rng() < 0.90) {
        x += Math.sign(x || 1) * (1.15 + rng() * 3.8);
      }
      const z = (rng() - 0.5) * GRASS_SPAN_Z;
      const scale = (0.55 + rng() * 1.15) * (Math.abs(x) < 2.1 ? 0.52 : 1.0);
      grassData.push({
        x,
        z0: z,
        rotY: rng() * Math.PI * 2,
        scale,
        swayPhase: rng() * Math.PI * 2,
      });
      // Subtle botanical variation: golden dry straw vs warm muted olive-green shoots
      const isOlive = rng() < 0.28;
      if (isOlive) {
        grassTint.setRGB(0.68 + rng() * 0.16, 0.78 + rng() * 0.16, 0.44 + rng() * 0.12);
      } else {
        const v = 0.78 + rng() * 0.28;
        grassTint.setRGB(v, v * 0.94, v * 0.80);
      }
      grassInst.setColorAt(i, grassTint);
    }
    if (grassInst.instanceColor) grassInst.instanceColor.needsUpdate = true;

    // --- 5. SCATTERED SAVANNAH PEBBLES & SMALL ROCKS ---
    const rockGeom = new THREE.DodecahedronGeometry(0.13, 1);
    const rPos = rockGeom.getAttribute('position');
    for (let k = 0; k < rPos.count; k++) {
      const vx = rPos.getX(k), vy = rPos.getY(k), vz = rPos.getZ(k);
      const n = 1.0 + 0.28 * GiraffeMath.noise3D(vx * 7, vy * 7, vz * 7);
      rPos.setXYZ(k, vx * n, vy * 0.50 * n, vz * n);
    }
    rockGeom.computeVertexNormals();
    const rockMat = new THREE.MeshStandardMaterial({
      color: 0x4a3826,
      roughness: 0.98,
      metalness: 0.0,
      envMapIntensity: 0.12,
    });

    const ROCK_COUNT = 220;
    const rockInst = new THREE.InstancedMesh(rockGeom, rockMat, ROCK_COUNT);
    rockInst.castShadow = true;
    rockInst.receiveShadow = true;
    rockInst.frustumCulled = false;
    envGroup.add(rockInst);

    const rockData = [];
    for (let i = 0; i < ROCK_COUNT; i++) {
      let x = (rng() - 0.5) * 56;
      if (Math.abs(x) < 1.3) x += Math.sign(x || 1) * (1.3 + rng() * 2.5);
      rockData.push({
        x,
        z0: (rng() - 0.5) * GRASS_SPAN_Z,
        rotY: rng() * Math.PI * 2,
        sx: 0.45 + rng() * 1.4,
        sy: 0.35 + rng() * 0.9,
        sz: 0.45 + rng() * 1.4,
      });
    }

    // --- 6. ICONIC UMBRELLA ACACIA TREES (Endless looping savannah plain!) ---
    const barkMat = new THREE.MeshStandardMaterial({
      color: 0x33261c,
      roughness: 0.96,
      metalness: 0.0,
      envMapIntensity: 0.35,
    });
    const foliageMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      vertexColors: true,
      roughness: 0.92,
      metalness: 0.0,
      envMapIntensity: 0.45,
    });

    const TREE_LOOP_Z = 140;
    const acaciaSpecs = [
      { x: -13.5, z0:  16, s: 1.05 },
      { x:  15.0, z0:  28, s: 1.18 },
      { x: -24.0, z0: -12, s: 1.32 },
      { x:  19.5, z0: -22, s: 0.96 },
      { x: -16.0, z0: -48, s: 1.12 },
      { x:  28.0, z0:   4, s: 1.25 },
      { x: -34.0, z0:  42, s: 1.40 },
      { x:  14.5, z0:  62, s: 0.92 },
      { x: -18.5, z0:  52, s: 1.15 },
      { x:  36.0, z0: -52, s: 1.35 },
    ];

    const acacias = acaciaSpecs.map((spec, idx) => {
      const tree = createUmbrellaAcacia(1000 + idx * 73, barkMat, foliageMat);
      tree.scale.setScalar(spec.s);
      tree.rotation.y = rng() * Math.PI * 2;
      tree.position.set(spec.x, 0, spec.z0);
      envGroup.add(tree);
      return { mesh: tree, x: spec.x, z0: spec.z0 };
    });

    // --- 7. DISTANT MISTY SAVANNAH HORIZON HILLS / KOPJES ---
    const hillRingPts = 128;
    const hillRadius = 125;
    const hPos = [];
    const hIdx = [];
    for (let i = 0; i <= hillRingPts; i++) {
      const a = (i / hillRingPts) * Math.PI * 2;
      const cx = Math.cos(a) * hillRadius;
      const cz = Math.sin(a) * hillRadius;
      const h = 2.2
        + Math.max(0, Math.sin(a * 3.0 + 0.7)) * 6.5
        + Math.max(0, Math.sin(a * 7.0 - 1.2)) * 3.2
        + (GiraffeMath.noise2D(Math.cos(a) * 3.5, Math.sin(a) * 3.5) * 0.5 + 0.5) * 4.5;
      hPos.push(cx, -0.5, cz);
      hPos.push(cx, h, cz);
    }
    for (let i = 0; i < hillRingPts; i++) {
      const a = i * 2;
      const b = a + 1;
      const c = a + 2;
      const d = a + 3;
      hIdx.push(a, c, b);
      hIdx.push(b, c, d);
    }
    const hillGeom = new THREE.BufferGeometry();
    hillGeom.setAttribute('position', new THREE.Float32BufferAttribute(hPos, 3));
    hillGeom.setIndex(hIdx);
    hillGeom.computeVertexNormals();
    const hillMat = new THREE.MeshStandardMaterial({
      color: 0x9c8067,
      roughness: 1.0,
      metalness: 0.0,
      side: THREE.DoubleSide,
    });
    const hillMesh = new THREE.Mesh(hillGeom, hillMat);
    hillMesh.name = 'DistantHills';
    envGroup.add(hillMesh);

    // --- 8. SUBTLE HOOF-IMPACT GOLDEN DUST PUFFS ---
    const dustCanvas = document.createElement('canvas');
    dustCanvas.width = 64;
    dustCanvas.height = 64;
    const dCtx = dustCanvas.getContext('2d');
    const dGrad = dCtx.createRadialGradient(32, 32, 2, 32, 32, 30);
    dGrad.addColorStop(0, 'rgba(235, 200, 148, 0.52)');
    dGrad.addColorStop(0.5, 'rgba(218, 178, 126, 0.22)');
    dGrad.addColorStop(1, 'rgba(218, 178, 126, 0.0)');
    dCtx.fillStyle = dGrad;
    dCtx.fillRect(0, 0, 64, 64);
    const dustTex = new THREE.CanvasTexture(dustCanvas);

    const MAX_DUST = 36;
    const dustPool = [];
    for (let i = 0; i < MAX_DUST; i++) {
      const spMat = new THREE.SpriteMaterial({
        map: dustTex,
        transparent: true,
        opacity: 0,
        depthWrite: false,
      });
      const sp = new THREE.Sprite(spMat);
      sp.visible = false;
      envGroup.add(sp);
      dustPool.push({
        sprite: sp,
        age: 99,
        life: 1,
        vx: 0,
        vy: 0,
        vz: 0,
        baseScale: 0.25,
      });
    }
    let dustCursor = 0;

    function spawnHoofDust(worldPos, isLiftoff) {
      const count = isLiftoff ? 2 : 3;
      for (let i = 0; i < count; i++) {
        const p = dustPool[dustCursor];
        dustCursor = (dustCursor + 1) % MAX_DUST;
        p.age = 0;
        p.life = 0.75 + Math.random() * 0.55;
        p.baseScale = 0.16 + Math.random() * 0.14;
        p.sprite.position.set(
          worldPos.x + (Math.random() - 0.5) * 0.14,
          0.06 + Math.random() * 0.05,
          worldPos.z + (Math.random() - 0.5) * 0.14
        );
        p.vx = (Math.random() - 0.5) * 0.22;
        p.vy = 0.16 + Math.random() * 0.18;
        p.vz = -0.18 - Math.random() * 0.15;
        p.sprite.visible = true;
      }
    }

    // --- APPLY TIME-OF-DAY PRESET ---
    let activePresetKey = 'golden';
    function applyTimeOfDay(presetKey) {
      const p = PRESETS[presetKey] || PRESETS.golden;
      activePresetKey = presetKey;

      skyUniforms.uSunDir.value.copy(p.sunDir);
      skyUniforms.uSkyTop.value.copy(p.skyTop);
      skyUniforms.uSkyMid.value.copy(p.skyMid);
      skyUniforms.uSkyHorizon.value.copy(p.skyHorizon);
      skyUniforms.uSunGlow.value.copy(p.sunGlow);

      sunLight.position.copy(p.sunDir).multiplyScalar(22);
      sunLight.color.copy(p.sunColor);
      sunLight.intensity = p.sunIntensity;

      hemiLight.color.copy(p.hemiSky);
      hemiLight.groundColor.copy(p.hemiGround);
      hemiLight.intensity = p.hemiIntensity;

      // Rim light placed opposite-ish/grazing from the low sun to sculpt fur silhouette
      rimLight.position.set(-p.sunDir.x * 12, 6, -p.sunDir.z * 14);
      rimLight.color.copy(p.rimColor);
      rimLight.intensity = p.rimIntensity;

      scene.fog = new THREE.FogExp2(p.fogColor.getHex(), p.fogDensity);
      renderer.toneMappingExposure = p.exposure;

      rebuildIBL();
    }

    applyTimeOfDay('golden');

    // Scratch object for fast InstancedMesh matrix updates
    const dummy = new THREE.Object3D();
    let prevGroundDist = 0;

    function wrapZ(z, span) {
      const half = span * 0.5;
      return ((((z + half) % span) + span) % span) - half;
    }

    function update(dt, time, groundDistance) {
      const dDist = groundDistance - prevGroundDist;
      prevGroundDist = groundDistance;

      // 1. Scroll ground texture at EXACT 1:1 meter ratio matching stance hooves!
      // Plane UV.y goes toward -Z (since rotateX(-PI/2) maps +Y plane -> -Z world),
      // so moving ground backward (-Z) shifts offset.y negatively or positively:
      // Let's verify: vertex z = -planeY. Plane UV v increases with +planeY = -z.
      // Moving texture features toward -Z means at a fixed world z, we sample a larger z_world = z + groundDistance
      // -> smaller v -> offset.y = -groundDistance / TILE_METERS!
      groundTex.offset.y = -(groundDistance / TILE_METERS) % 1;
      groundBump.offset.y = groundTex.offset.y;
      groundUniforms.uGroundDist.value = groundDistance;

      // 2. Update instanced grass tufts (wrapped backward along -Z + subtle wind breeze!)
      for (let i = 0; i < GRASS_COUNT; i++) {
        const g = grassData[i];
        const wz = wrapZ(g.z0 - groundDistance, GRASS_SPAN_Z);
        const breeze = Math.sin(time * 1.9 + g.swayPhase + g.x * 0.25 + wz * 0.18) * 0.09;
        dummy.position.set(g.x, 0, wz);
        dummy.rotation.set(breeze, g.rotY, breeze * 0.6);
        dummy.scale.setScalar(g.scale);
        dummy.updateMatrix();
        grassInst.setMatrixAt(i, dummy.matrix);
      }
      grassInst.instanceMatrix.needsUpdate = true;

      // 3. Update pebbles/rocks (half-embedded naturally into the savannah soil!)
      for (let i = 0; i < ROCK_COUNT; i++) {
        const r = rockData[i];
        const wz = wrapZ(r.z0 - groundDistance, GRASS_SPAN_Z);
        dummy.position.set(r.x, -0.015, wz);
        dummy.rotation.set(0, r.rotY, 0);
        dummy.scale.set(r.sx, r.sy, r.sz);
        dummy.updateMatrix();
        rockInst.setMatrixAt(i, dummy.matrix);
      }
      rockInst.instanceMatrix.needsUpdate = true;

      // 4. Wrap umbrella acacias smoothly along endless savannah plain
      for (let i = 0; i < acacias.length; i++) {
        const a = acacias[i];
        a.mesh.position.z = wrapZ(a.z0 - groundDistance, TREE_LOOP_Z);
      }

      // 5. Animate hoof-kick dust wisps
      for (let i = 0; i < MAX_DUST; i++) {
        const p = dustPool[i];
        if (!p.sprite.visible) continue;
        p.age += dt;
        if (p.age >= p.life) {
          p.sprite.visible = false;
          continue;
        }
        const f = p.age / p.life;
        p.sprite.position.x += p.vx * dt;
        p.sprite.position.y += p.vy * (1 - f * 0.6) * dt;
        p.sprite.position.z += p.vz * dt - dDist;
        const sc = p.baseScale * (1.0 + f * 2.8);
        p.sprite.scale.set(sc, sc, 1);
        p.sprite.material.opacity = Math.sin(f * Math.PI) * 0.55 * (1 - f * 0.35);
      }
    }

    // Initial placement
    update(0, 0, 0);

    return {
      update,
      spawnHoofDust,
      applyTimeOfDay,
      getPresetKey: () => activePresetKey,
      sunLight,
    };
  };

  global.SavannahEnv = SavannahEnv;
})(window);
