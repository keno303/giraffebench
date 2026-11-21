(function (global) {
  'use strict';

  const App = (global.GiraffeApp = global.GiraffeApp || {});
  const { groundHeight, createRNG, clamp, lerp } = App.Math;

  const LIGHTING_PRESETS = {
    golden: {
      name: 'Golden Hour',
      sunPos: new THREE.Vector3(38, 19, 24),
      sunColor: new THREE.Color(0xffdfa8),
      sunIntensity: 2.35,
      hemiSky: new THREE.Color(0x6e98c8),
      hemiGround: new THREE.Color(0x8a5e32),
      hemiIntensity: 0.62,
      rimColor: new THREE.Color(0xffbe70),
      rimIntensity: 0.35,
      fogColor: new THREE.Color(0xd5b687),
      fogDensity: 0.0054,
      skyTop: new THREE.Color(0x1f4e8c),
      skyMid: new THREE.Color(0x6694bc),
      skyHorizon: new THREE.Color(0xdfba84),
      sunGlow: new THREE.Color(0xffe8b0),
      exposure: 0.94,
    },
    midday: {
      name: 'Midday Sun',
      sunPos: new THREE.Vector3(24, 52, 18),
      sunColor: new THREE.Color(0xfff6e5),
      sunIntensity: 2.45,
      hemiSky: new THREE.Color(0x74b2e6),
      hemiGround: new THREE.Color(0x9a7546),
      hemiIntensity: 0.68,
      rimColor: new THREE.Color(0xffeec8),
      rimIntensity: 0.22,
      fogColor: new THREE.Color(0xc9d7e0),
      fogDensity: 0.0040,
      skyTop: new THREE.Color(0x1754a6),
      skyMid: new THREE.Color(0x5b9fd8),
      skyHorizon: new THREE.Color(0xd2dde4),
      sunGlow: new THREE.Color(0xffffff),
      exposure: 0.92,
    },
    sunset: {
      name: 'Sunset Glow',
      sunPos: new THREE.Vector3(38, 15.5, 24),
      sunColor: new THREE.Color(0xff9c44),
      sunIntensity: 2.75,
      hemiSky: new THREE.Color(0x7c6a92),
      hemiGround: new THREE.Color(0x96552a),
      hemiIntensity: 0.66,
      rimColor: new THREE.Color(0xff8030),
      rimIntensity: 0.60,
      fogColor: new THREE.Color(0xd08c5a),
      fogDensity: 0.0058,
      skyTop: new THREE.Color(0x1a2652),
      skyMid: new THREE.Color(0x744f6e),
      skyHorizon: new THREE.Color(0xe49256),
      sunGlow: new THREE.Color(0xffbe70),
      exposure: 1.02,
    },
  };

  function createSkyDome() {
    const geom = new THREE.SphereGeometry(320, 32, 20);
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        uSunDir: { value: new THREE.Vector3(0.7, 0.4, 0.4).normalize() },
        uTopColor: { value: LIGHTING_PRESETS.golden.skyTop.clone() },
        uMidColor: { value: LIGHTING_PRESETS.golden.skyMid.clone() },
        uHorizonColor: { value: LIGHTING_PRESETS.golden.skyHorizon.clone() },
        uSunColor: { value: LIGHTING_PRESETS.golden.sunGlow.clone() },
        uTime: { value: 0 },
      },
      vertexShader: `
        varying vec3 vWorldDir;
        void main() {
          vWorldDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 uSunDir;
        uniform vec3 uTopColor;
        uniform vec3 uMidColor;
        uniform vec3 uHorizonColor;
        uniform vec3 uSunColor;
        uniform float uTime;
        varying vec3 vWorldDir;

        float hash21(vec2 p) {
          p = fract(p * vec2(123.34, 456.21));
          p += dot(p, p + 45.32);
          return fract(p.x * p.y);
        }
        float noise2(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(
            mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
            mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x),
            f.y
          );
        }
        float fbm(vec2 p) {
          float v = 0.0;
          float a = 0.5;
          for (int i = 0; i < 4; i++) {
            v += a * noise2(p);
            p = p * 2.05 + vec2(3.7, 1.9);
            a *= 0.5;
          }
          return v;
        }

        void main() {
          vec3 dir = normalize(vWorldDir);
          float h = clamp(dir.y, 0.0, 1.0);

          vec3 col = mix(uHorizonColor, uMidColor, smoothstep(0.0, 0.26, h));
          col = mix(col, uTopColor, smoothstep(0.22, 0.85, h));

          if (dir.y < 0.0) {
            col = mix(uHorizonColor, uHorizonColor * 0.68, smoothstep(0.0, -0.25, dir.y));
          }

          float sunDot = max(dot(dir, normalize(uSunDir)), 0.0);
          float mieHalo = pow(sunDot, 5.5) * 0.36 + pow(sunDot, 36.0) * 0.46;
          float sunDisc = smoothstep(0.9982, 0.9994, sunDot) * 2.1;
          col += uSunColor * (mieHalo + sunDisc);

          if (dir.y > 0.03) {
            vec2 cloudUV = dir.xz / (dir.y + 0.18) * 1.15 + vec2(uTime * 0.004, uTime * 0.0015);
            float c1 = fbm(cloudUV * vec2(1.0, 2.2));
            float cWisps = fbm(cloudUV * vec2(2.4, 6.2) + vec2(4.2, 1.7));
            float cloudMask = (smoothstep(0.55, 0.82, c1) * 0.78 + smoothstep(0.62, 0.88, cWisps) * 0.32)
              * smoothstep(0.03, 0.24, dir.y) * smoothstep(0.95, 0.42, dir.y);
            vec3 cloudCol = mix(vec3(0.97, 0.92, 0.85), uSunColor, 0.38 + 0.48 * pow(sunDot, 2.6));
            col = mix(col, cloudCol, clamp(cloudMask * 0.36, 0.0, 0.55));
          }

          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });

    const mesh = new THREE.Mesh(geom, mat);
    mesh.renderOrder = -10;
    return { mesh, mat };
  }

  // Sculpted organic Umbrella Acacia tree with gnarled bark, branching limbs & layered dark-olive canopy!
  function createAcaciaTree(seed, barkMat, foliageMatDark, foliageMatMid) {
    const rng = createRNG(seed);
    const tree = new THREE.Group();

    const height = 5.2 + rng() * 2.8;
    const trunkBaseR = 0.24 + rng() * 0.10;
    const leanX = (rng() - 0.5) * 0.65;
    const leanZ = (rng() - 0.5) * 0.65;

    const trunkPts = [
      new THREE.Vector3(0, -0.25, 0),
      new THREE.Vector3(leanX * 0.3, height * 0.18, leanZ * 0.3),
      new THREE.Vector3(leanX * 0.7 + (rng() - 0.5) * 0.25, height * 0.36, leanZ * 0.7 + (rng() - 0.5) * 0.25),
      new THREE.Vector3(leanX, height * 0.52, leanZ),
    ];
    const trunkCurve = new THREE.CatmullRomCurve3(trunkPts);
    const trunkGeom = new THREE.TubeGeometry(trunkCurve, 12, trunkBaseR * 0.70, 8, false);
    const tp = trunkGeom.attributes.position;
    for (let i = 0; i < tp.count; i++) {
      const y = tp.getY(i);
      const t = clamp(y / (height * 0.52), 0, 1);
      const flare = lerp(1.48, 0.72, t);
      const c = trunkCurve.getPoint(t);
      tp.setX(i, c.x + (tp.getX(i) - c.x) * flare);
      tp.setZ(i, c.z + (tp.getZ(i) - c.z) * flare);
    }
    trunkGeom.computeVertexNormals();
    const trunkMesh = new THREE.Mesh(trunkGeom, barkMat);
    trunkMesh.castShadow = true;
    trunkMesh.receiveShadow = true;
    tree.add(trunkMesh);

    const forkOrigin = trunkPts[3];
    const numMain = 5 + Math.floor(rng() * 3);

    for (let b = 0; b < numMain; b++) {
      const ang = (b / numMain) * Math.PI * 2 + (rng() - 0.5) * 0.45;
      const spread = 2.6 + rng() * 2.4;
      const topY = height * (0.86 + rng() * 0.18);

      const midPt = new THREE.Vector3(
        forkOrigin.x + Math.cos(ang) * spread * 0.46,
        lerp(forkOrigin.y, topY, 0.56) - 0.10 + (rng() - 0.5) * 0.25,
        forkOrigin.z + Math.sin(ang) * spread * 0.46
      );
      const endPt = new THREE.Vector3(
        forkOrigin.x + Math.cos(ang) * spread,
        topY,
        forkOrigin.z + Math.sin(ang) * spread
      );

      const bCurve = new THREE.CatmullRomCurve3([forkOrigin, midPt, endPt]);
      const bGeom = new THREE.TubeGeometry(bCurve, 10, trunkBaseR * 0.25, 6, false);
      const bp = bGeom.attributes.position;
      for (let i = 0; i < bp.count; i++) {
        const ringIdx = Math.floor(i / 7);
        const bt = clamp(ringIdx / 10, 0, 1);
        const taper = lerp(1.36, 0.44, bt);
        const bc = bCurve.getPoint(bt);
        bp.setXYZ(
          i,
          bc.x + (bp.getX(i) - bc.x) * taper,
          bc.y + (bp.getY(i) - bc.y) * taper,
          bc.z + (bp.getZ(i) - bc.z) * taper
        );
      }
      bGeom.computeVertexNormals();
      const bMesh = new THREE.Mesh(bGeom, barkMat);
      bMesh.castShadow = true;
      tree.add(bMesh);

      // Secondary sub-branch forking outward near the canopy underside!
      const subAng = ang + (rng() > 0.5 ? 1 : -1) * (0.35 + rng() * 0.35);
      const subEnd = new THREE.Vector3(
        midPt.x + Math.cos(subAng) * (1.2 + rng() * 1.1),
        topY - 0.15 + (rng() - 0.5) * 0.25,
        midPt.z + Math.sin(subAng) * (1.2 + rng() * 1.1)
      );
      const subCurve = new THREE.CatmullRomCurve3([midPt, subEnd]);
      const subGeom = new THREE.TubeGeometry(subCurve, 6, trunkBaseR * 0.14, 5, false);
      const spb = subGeom.attributes.position;
      for (let i = 0; i < spb.count; i++) {
        const ringIdx = Math.floor(i / 6);
        const st = clamp(ringIdx / 6, 0, 1);
        const taper = lerp(1.22, 0.45, st);
        const sc = subCurve.getPoint(st);
        spb.setXYZ(
          i,
          sc.x + (spb.getX(i) - sc.x) * taper,
          sc.y + (spb.getY(i) - sc.y) * taper,
          sc.z + (spb.getZ(i) - sc.z) * taper
        );
      }
      subGeom.computeVertexNormals();
      const subMesh = new THREE.Mesh(subGeom, barkMat);
      subMesh.castShadow = true;
      tree.add(subMesh);

      // Multi-layered gossamer feathery bipinnate umbrella foliage sprays (flat-topped sunlit silhouette!)
      const anchors = [endPt, subEnd];
      for (let a = 0; a < anchors.length; a++) {
        const anc = anchors[a];
        const clusterCount = 4 + Math.floor(rng() * 2);
        for (let p = 0; p < clusterCount; p++) {
          const padR = 1.15 + rng() * 1.05;
          const domeH = 0.24 + rng() * 0.16;
          // Gently arched feathery spray disc (gives 3D crown volume from low & high angles!)
          const sprayGeom = new THREE.PlaneGeometry(padR * 2.0, padR * 2.0, 4, 4);
          sprayGeom.rotateX(-Math.PI * 0.5);
          const sp = sprayGeom.attributes.position;
          for (let k = 0; k < sp.count; k++) {
            const vx = sp.getX(k), vz = sp.getZ(k);
            const rNorm = Math.min(1.0, Math.hypot(vx, vz) / padR);
            const arch = (1.0 - rNorm * rNorm) * domeH;
            const flutter = Math.sin(vx * 3.1 + p * 2.2 + seed) * 0.045;
            sp.setY(k, arch + flutter);
          }
          sprayGeom.computeVertexNormals();
          const fMat = (p + b) % 2 === 0 ? foliageMatDark : foliageMatMid;
          const spray = new THREE.Mesh(sprayGeom, fMat);
          spray.position.set(
            anc.x + (rng() - 0.5) * 1.55,
            anc.y + (rng() - 0.5) * 0.34 + 0.06 + (p % 3) * 0.12,
            anc.z + (rng() - 0.5) * 1.55
          );
          spray.rotation.set(
            (rng() - 0.5) * 0.22,
            rng() * Math.PI * 2,
            (rng() - 0.5) * 0.22
          );
          spray.castShadow = true;
          spray.receiveShadow = true;
          tree.add(spray);
        }
      }
    }

    return tree;
  }

  // Slender, graceful multi-blade dry savanna grass tuft (properly linear-calibrated colors!)
  function createGrassTuftGeometry() {
    const positions = [];
    const normals = [];
    const colors = [];
    const indices = [];

    const blades = 9;
    let vOff = 0;
    for (let b = 0; b < blades; b++) {
      const isPlume = b >= 7; // 2 slender taller arching Themeda triandra golden seed stalks!
      const ang = (b / blades) * Math.PI * 2 + (b % 2) * 0.27;
      const dx = Math.cos(ang);
      const dz = Math.sin(ang);
      const px = -dz;
      const pz = dx;
      const baseW = isPlume ? 0.0085 : 0.011;
      const h = isPlume ? 0.50 + (b - 7) * 0.11 : 0.27 + (b % 3) * 0.085;
      const lean = isPlume ? 0.17 + (b - 7) * 0.05 : 0.08 + (b % 2) * 0.055;

      const r0x = dx * 0.028, r0z = dz * 0.028;
      const pts = [
        [r0x - px * baseW, 0.0, r0z - pz * baseW],
        [r0x + px * baseW, 0.0, r0z + pz * baseW],
        [r0x + dx * lean * 0.36 - px * baseW * 0.62, h * 0.54, r0z + dz * lean * 0.36 - pz * baseW * 0.62],
        [r0x + dx * lean * 0.36 + px * baseW * 0.62, h * 0.54, r0z + dz * lean * 0.36 + pz * baseW * 0.62],
        [r0x + dx * lean, h, r0z + dz * lean],
      ];

      // Linear-space natural dry savanna straw, olive roots & sunlit golden seed tips
      const cRoot = [0.16, 0.14, 0.048];
      const cMid  = isPlume ? [0.40, 0.29, 0.095] : [0.34, 0.25, 0.082];
      const cTip  = isPlume ? [0.60, 0.45, 0.165] : [0.50, 0.38, 0.145];
      const cols = [cRoot, cRoot, cMid, cMid, cTip];

      for (let k = 0; k < 5; k++) {
        positions.push(pts[k][0], pts[k][1], pts[k][2]);
        normals.push(0, 1, 0);
        colors.push(cols[k][0], cols[k][1], cols[k][2]);
      }

      indices.push(vOff + 0, vOff + 1, vOff + 2);
      indices.push(vOff + 1, vOff + 3, vOff + 2);
      indices.push(vOff + 2, vOff + 3, vOff + 4);
      vOff += 5;
    }

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geom.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geom.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geom.setIndex(indices);
    return geom;
  }

  function createSavannaEnvironment(scene) {
    const envGroup = new THREE.Group();
    scene.add(envGroup);

    // 1. Sky Dome
    const sky = createSkyDome();
    envGroup.add(sky.mesh);

    // 2. Seamless Endless Savanna Ground (with world-space sandy micro-detail + dusty game trail!)
    const groundSize = 180;
    const groundSegs = 96;
    const tileStep = groundSize / 42;
    const groundGeom = new THREE.PlaneGeometry(groundSize, groundSize, groundSegs, groundSegs);
    groundGeom.rotateX(-Math.PI * 0.5);

    const groundTex = App.Materials.createSavannaGroundTexture();
    const groundMat = new THREE.MeshStandardMaterial({
      map: groundTex,
      roughness: 0.96,
      metalness: 0.0,
      envMapIntensity: 0.22,
    });
    groundMat.onBeforeCompile = function (shader) {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>\nvarying vec3 vGroundWorld;`)
        .replace(
          '#include <worldpos_vertex>',
          `#include <worldpos_vertex>\nvGroundWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;`
        );
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
          varying vec3 vGroundWorld;
          float gHash21(vec2 p) {
            p = fract(p * vec2(123.34, 456.21));
            p += dot(p, p + 45.32);
            return fract(p.x * p.y);
          }
          float gValNoise(vec2 p) {
            vec2 i = floor(p);
            vec2 f = fract(p);
            f = f * f * (3.0 - 2.0 * f);
            return mix(
              mix(gHash21(i), gHash21(i + vec2(1.0, 0.0)), f.x),
              mix(gHash21(i + vec2(0.0, 1.0)), gHash21(i + vec2(1.0, 1.0)), f.x),
              f.y
            );
          }`
        )
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
          // Subtle winding sandy game trail along |x| < 1.5m + crisp micro sand grain at close range!
          float trailWiggle = sin(vGroundWorld.z * 0.09) * 0.28 + cos(vGroundWorld.z * 0.21) * 0.14;
          float trailDist = abs(vGroundWorld.x - trailWiggle);
          float trailMask = 1.0 - smoothstep(0.65, 1.85, trailDist);
          float broadVar = gValNoise(vGroundWorld.xz * 0.14);
          float microGrain = gValNoise(vGroundWorld.xz * 19.0) * 0.6 + gValNoise(vGroundWorld.xz * 47.0) * 0.4;
          vec3 dustyTrailTint = vec3(1.10, 0.99, 0.88);
          diffuseColor.rgb *= mix(vec3(1.0), dustyTrailTint, trailMask * 0.45);
          diffuseColor.rgb *= (0.88 + 0.24 * broadVar);
          diffuseColor.rgb *= (0.93 + 0.14 * microGrain);`
        );
    };
    groundMat.customProgramCacheKey = function () {
      return 'savanna_ground_detail_v1';
    };

    const groundMesh = new THREE.Mesh(groundGeom, groundMat);
    groundMesh.receiveShadow = true;
    envGroup.add(groundMesh);

    let lastGroundSnapZ = Number.NaN;
    function updateGroundTerrain(centerZ) {
      const snapZ = Math.floor(centerZ / tileStep) * tileStep;
      if (snapZ === lastGroundSnapZ) return;
      lastGroundSnapZ = snapZ;

      groundMesh.position.set(0, 0, snapZ);
      const pos = groundGeom.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const vx = pos.getX(i);
        const vz = pos.getZ(i);
        pos.setY(i, groundHeight(vx, vz + snapZ));
      }
      pos.needsUpdate = true;
      groundGeom.computeVertexNormals();
    }
    updateGroundTerrain(0);

    // 3. Multi-Layered Distant Rift Valley Escarpment / Serengeti Horizon Ridges (sunlit ridge shading!)
    const horizonGeom = new THREE.CylinderGeometry(220, 230, 22, 112, 5, true);
    const hp = horizonGeom.attributes.position;
    const hCols = new Float32Array(hp.count * 3);
    const hCol = new THREE.Color();
    for (let i = 0; i < hp.count; i++) {
      const vx = hp.getX(i), vy = hp.getY(i), vz = hp.getZ(i);
      const fracY = (vy + 11.0) / 22.0; // 0 at base .. 1 at crest
      const ang = Math.atan2(vz, vx);
      const ridge =
        Math.sin(ang * 3.0 + 0.4) * 4.4 +
        Math.sin(ang * 7.0 - 1.2) * 2.6 +
        Math.cos(ang * 13.0 + 2.1) * 1.1;
      const mesa = Math.min(11.5, Math.max(1.8, 6.2 + ridge));
      const newY = lerp(-6.0, mesa, fracY);
      hp.setY(i, newY);
      // Warm atmospheric mist at base -> subtle sunlit ochre/mauve cliff face near ridge crest
      const slopeSun = 0.5 + 0.5 * Math.cos(ang * 7.0 - 0.6);
      hCol.setRGB(
        lerp(0.95, 0.72 + slopeSun * 0.14, Math.pow(fracY, 1.35)),
        lerp(0.91, 0.65 + slopeSun * 0.11, Math.pow(fracY, 1.35)),
        lerp(0.86, 0.66 + slopeSun * 0.08, Math.pow(fracY, 1.35))
      );
      hCols[i * 3] = hCol.r;
      hCols[i * 3 + 1] = hCol.g;
      hCols[i * 3 + 2] = hCol.b;
    }
    horizonGeom.setAttribute('color', new THREE.BufferAttribute(hCols, 3));
    horizonGeom.computeVertexNormals();
    const horizonMat = new THREE.MeshStandardMaterial({
      color: 0x867472,
      vertexColors: true,
      roughness: 1.0,
      metalness: 0.0,
      envMapIntensity: 0.15,
      side: THREE.BackSide,
    });
    const horizonRing = new THREE.Mesh(horizonGeom, horizonMat);
    envGroup.add(horizonRing);

    // Distant second Rift Valley table-top escarpment peeking softly above the foreground hills
    const horizonFarGeom = new THREE.CylinderGeometry(285, 295, 28, 112, 5, true);
    const hfp = horizonFarGeom.attributes.position;
    const hfCols = new Float32Array(hfp.count * 3);
    for (let i = 0; i < hfp.count; i++) {
      const vx = hfp.getX(i), vy = hfp.getY(i), vz = hfp.getZ(i);
      const fracY = (vy + 14.0) / 28.0;
      const ang = Math.atan2(vz, vx);
      const ridge =
        Math.sin(ang * 2.0 - 1.1) * 8.5 +
        Math.cos(ang * 5.0 + 0.8) * 4.8 +
        Math.sin(ang * 11.0 - 0.3) * 1.9;
      // Classic flat-topped African plateau/escarpment silhouette
      const plateau = Math.min(19.5, Math.max(4.5, 11.8 + ridge));
      hfp.setY(i, lerp(-6.0, plateau, fracY));
      const slopeSun = 0.5 + 0.5 * Math.sin(ang * 5.0 + 1.2);
      hCol.setRGB(
        lerp(0.98, 0.80 + slopeSun * 0.10, Math.pow(fracY, 1.4)),
        lerp(0.95, 0.76 + slopeSun * 0.08, Math.pow(fracY, 1.4)),
        lerp(0.93, 0.80 + slopeSun * 0.06, Math.pow(fracY, 1.4))
      );
      hfCols[i * 3] = hCol.r;
      hfCols[i * 3 + 1] = hCol.g;
      hfCols[i * 3 + 2] = hCol.b;
    }
    horizonFarGeom.setAttribute('color', new THREE.BufferAttribute(hfCols, 3));
    horizonFarGeom.computeVertexNormals();
    const horizonFarMat = new THREE.MeshStandardMaterial({
      color: 0xa0949a,
      vertexColors: true,
      roughness: 1.0,
      metalness: 0.0,
      envMapIntensity: 0.12,
      side: THREE.BackSide,
    });
    const horizonRingFar = new THREE.Mesh(horizonFarGeom, horizonFarMat);
    envGroup.add(horizonRingFar);

    // 4. Instanced Wind-Swaying Savanna Grass Tufts (seamless feathered Serengeti meadow!)
    const grassCount = 5400;
    const grassGeom = createGrassTuftGeometry();
    const grassUniforms = { uTime: { value: 0 } };
    const grassMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.92,
      metalness: 0.0,
      envMapIntensity: 0.20,
      side: THREE.DoubleSide,
    });
    grassMat.onBeforeCompile = function (shader) {
      shader.uniforms.uTime = grassUniforms.uTime;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>\nuniform float uTime;`)
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          #ifdef USE_INSTANCING
            vec3 instPos = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
            float swayPhase = uTime * 1.65 + instPos.x * 0.28 + instPos.z * 0.22;
            float bend = position.y * position.y * 0.34;
            transformed.x += sin(swayPhase) * bend;
            transformed.z += cos(swayPhase * 0.78) * bend * 0.5;
          #endif`
        );
    };

    const grassMesh = new THREE.InstancedMesh(grassGeom, grassMat, grassCount);
    grassMesh.receiveShadow = true;
    envGroup.add(grassMesh);

    const rng = createRNG(9031);
    const grassRangeX = 94;
    const grassRangeZ = 104;
    const grassData = [];
    const dummy = new THREE.Object3D();

    for (let i = 0; i < grassCount; i++) {
      // Bell-shaped lateral distribution so grass dissolves naturally into the far Serengeti plains (zero hard edge!)
      let gx = ((rng() + rng()) * 0.5 - 0.5) * grassRangeX;
      const gz = (rng() - 0.5) * grassRangeZ;
      // Softly feathered organic game trail (zero ruler-straight corridor edge!)
      const trailCenter = Math.sin(gz * 0.085) * 0.55 + Math.cos(gz * 0.19) * 0.30;
      const trailHalf = 1.05 + Math.sin(gz * 0.15) * 0.35 + Math.cos(gz * 0.31) * 0.22;
      const dTrail = Math.abs(gx - trailCenter);
      if (dTrail < trailHalf && rng() < 0.78 * (1.0 - dTrail / (trailHalf + 0.45))) {
        gx += (gx >= trailCenter ? 1 : -1) * (trailHalf + rng() * 5.2);
      }
      const distTrail = Math.abs(gx - trailCenter);
      const outerFade = 1.0 - clamp((Math.abs(gx) - 24.0) / 23.0, 0, 1) * 0.52;
      const trailScale = (distTrail < 1.55 ? 0.36 + rng() * 0.36 : 0.72 + rng() * 0.95) * outerFade;
      grassData.push({
        x: gx,
        z: gz,
        rotY: rng() * Math.PI * 2,
        scaleX: (0.85 + rng() * 0.65) * trailScale,
        scaleY: (0.75 + rng() * 0.85) * trailScale,
      });
    }

    let lastGrassInit = true;
    function updateGrassInstances(centerZ) {
      let dirty = false;
      const halfZ = grassRangeZ * 0.5;
      for (let i = 0; i < grassCount; i++) {
        const g = grassData[i];
        let wrapped = false;
        while (g.z < centerZ - halfZ) {
          g.z += grassRangeZ;
          wrapped = true;
        }
        while (g.z > centerZ + halfZ) {
          g.z -= grassRangeZ;
          wrapped = true;
        }
        if (wrapped || lastGrassInit) {
          const gy = groundHeight(g.x, g.z) - 0.02;
          dummy.position.set(g.x, gy, g.z);
          dummy.rotation.set(0, g.rotY, 0);
          dummy.scale.set(g.scaleX, g.scaleY, g.scaleX);
          dummy.updateMatrix();
          grassMesh.setMatrixAt(i, dummy.matrix);
          dirty = true;
        }
      }
      if (dirty) grassMesh.instanceMatrix.needsUpdate = true;
      lastGrassInit = false;
    }
    updateGrassInstances(0);

    // 5. Rich Textured Dark-Bark Umbrella Acacia Trees + Termite Mounds + Scrub + Boulders
    const srgb = App.Materials.srgbColor;
    const barkTex = App.Materials.createAcaciaBarkTexture();
    const barkMat = new THREE.MeshStandardMaterial({
      map: barkTex,
      color: srgb(0x887460),
      roughness: 0.96,
      metalness: 0.0,
      envMapIntensity: 0.16,
    });
    const foliageTex = App.Materials.createAcaciaFoliageTexture();
    const foliageMatDark = new THREE.MeshStandardMaterial({
      map: foliageTex,
      color: srgb(0xbecaa0),
      roughness: 0.88,
      metalness: 0.0,
      alphaTest: 0.32,
      side: THREE.DoubleSide,
      envMapIntensity: 0.22,
    });
    const foliageMatMid = new THREE.MeshStandardMaterial({
      map: foliageTex,
      color: srgb(0xdce4b8),
      roughness: 0.86,
      metalness: 0.0,
      alphaTest: 0.30,
      side: THREE.DoubleSide,
      envMapIntensity: 0.24,
    });
    const rockTex = App.Materials.createKopjeRockTexture();
    const rockMat = new THREE.MeshStandardMaterial({
      map: rockTex,
      color: srgb(0xd4c8b8),
      roughness: 0.94,
      metalness: 0.0,
      envMapIntensity: 0.16,
    });

    const trees = [];
    const treeWrapZ = 160;
    const treePlacements = [
      { x: -16.5, z: 16.0, s: 1.08, seed: 101 },
      { x: -27.0, z: -10.0, s: 1.28, seed: 102 },
      { x: -19.0, z: 48.0, s: 0.98, seed: 103 },
      { x: -36.0, z: 28.0, s: 1.38, seed: 104 },
      { x:  25.0, z: 32.0, s: 1.12, seed: 105 },
      { x:  35.0, z: -20.0, s: 1.22, seed: 106 },
      { x: -18.5, z: -42.0, s: 1.04, seed: 107 },
      { x:  28.0, z: 70.0, s: 1.18, seed: 108 },
      { x: -30.0, z: -58.0, s: 1.32, seed: 109 },
      { x:  21.5, z: -52.0, s: 0.95, seed: 110 },
      { x: -45.0, z: 64.0, s: 1.42, seed: 111 },
      { x:  42.0, z: 14.0, s: 1.28, seed: 112 },
      // Far hazy Serengeti horizon acacia groves (epic African spatial depth!)
      { x: -64.0, z:  42.0, s: 1.55, seed: 113 },
      { x: -58.0, z: -26.0, s: 1.48, seed: 114 },
      { x: -74.0, z:  12.0, s: 1.68, seed: 115 },
      { x:  62.0, z:  54.0, s: 1.58, seed: 116 },
      { x:  56.0, z: -38.0, s: 1.44, seed: 117 },
      { x:  76.0, z:  -4.0, s: 1.65, seed: 118 },
    ];

    const contactTex = App.Materials.createContactShadowTexture();
    const treeShadeGeom = new THREE.PlaneGeometry(9.2, 9.2);
    treeShadeGeom.rotateX(-Math.PI * 0.5);
    const treeShadeMat = new THREE.MeshBasicMaterial({
      map: contactTex,
      transparent: true,
      opacity: 0.34,
      depthWrite: false,
    });

    for (const tp of treePlacements) {
      const tMesh = createAcaciaTree(tp.seed, barkMat, foliageMatDark, foliageMatMid);
      // Soft ambient dappled savanna shade beneath each umbrella acacia crown
      const shade = new THREE.Mesh(treeShadeGeom, treeShadeMat);
      shade.position.set(0, 0.04, 0);
      shade.renderOrder = 1;
      tMesh.add(shade);
      tMesh.scale.setScalar(tp.s);
      tMesh.rotation.y = (tp.seed * 1.7) % (Math.PI * 2);
      const ty = groundHeight(tp.x, tp.z);
      tMesh.position.set(tp.x, ty, tp.z);
      envGroup.add(tMesh);
      trees.push({ mesh: tMesh, x: tp.x, z: tp.z });
    }

    // Weathered organic Serengeti kopje boulders (high-subdiv smooth granite + lichen texture!)
    const rocks = [];
    const rockVariants = [];
    for (let v = 0; v < 4; v++) {
      const rg = new THREE.IcosahedronGeometry(0.55, 3);
      const rp = rg.attributes.position;
      for (let k = 0; k < rp.count; k++) {
        let vx = rp.getX(k), vy = rp.getY(k), vz = rp.getZ(k);
        const n1 = Math.sin(vx * 3.7 + v * 1.9) * Math.cos(vz * 3.4 - v * 1.3);
        const n2 = Math.sin((vx + vy) * 6.5 + v * 2.7) * Math.cos(vz * 5.8);
        const d = 0.88 + 0.16 * n1 + 0.05 * n2;
        if (vy < -0.18) vy = -0.18 + (vy + 0.18) * 0.4; // flat grounded base
        rp.setXYZ(k, vx * d, vy * d, vz * d);
      }
      rg.computeVertexNormals();
      rockVariants.push(rg);
    }
    for (let i = 0; i < 22; i++) {
      const rx = (rng() > 0.5 ? 1 : -1) * (4.2 + rng() * 28);
      const rz = (rng() - 0.5) * 110;
      const rMesh = new THREE.Mesh(rockVariants[i % rockVariants.length], rockMat);
      const sx = 0.55 + rng() * 1.25;
      const sy = 0.24 + rng() * 0.42;
      const sz = 0.55 + rng() * 1.15;
      rMesh.scale.set(sx, sy, sz);
      rMesh.rotation.set((rng() - 0.5) * 0.22, rng() * Math.PI * 2, (rng() - 0.5) * 0.22);
      rMesh.position.set(rx, groundHeight(rx, rz) + sy * 0.10, rz);
      rMesh.castShadow = true;
      rMesh.receiveShadow = true;
      envGroup.add(rMesh);
      rocks.push({ mesh: rMesh, x: rx, z: rz, sy });
    }

    // 5b. Weathered Serengeti Clay Termite Mounds & Multi-Stem Thorny Acacia Shrubs
    const termiteTex = App.Materials.createTermiteClayTexture();
    const termiteMat = new THREE.MeshStandardMaterial({
      map: termiteTex,
      color: srgb(0xd8c2aa),
      roughness: 0.96,
      metalness: 0.0,
      envMapIntensity: 0.15,
    });
    const props = [];
    const propWrapZ = 140;

    function createTermiteMound(seed) {
      const r = createRNG(seed);
      const g = new THREE.Group();
      // Broad eroded clay mound base
      const baseGeom = new THREE.SphereGeometry(0.95 + r() * 0.28, 14, 10);
      const bp = baseGeom.attributes.position;
      for (let k = 0; k < bp.count; k++) {
        let vx = bp.getX(k), vy = bp.getY(k), vz = bp.getZ(k);
        const ang = Math.atan2(vz, vx);
        const ridge = 1.0 + 0.18 * Math.sin(ang * 5.0 + seed) + 0.09 * Math.cos(ang * 9.0 - vy * 3.0);
        vy = vy > 0 ? vy * 0.72 : vy * 0.25;
        bp.setXYZ(k, vx * ridge, vy + 0.16, vz * ridge);
      }
      baseGeom.computeVertexNormals();
      const baseMesh = new THREE.Mesh(baseGeom, termiteMat);
      baseMesh.castShadow = true;
      baseMesh.receiveShadow = true;
      g.add(baseMesh);

      // 3 organic rounded vertical clay chimneys (authentic cathedral termite mound!)
      const chimneyCount = 3;
      for (let s = 0; s < chimneyCount; s++) {
        const chH = (s === 0 ? 1.45 : 0.75 + r() * 0.45) + r() * 0.35;
        const chR = s === 0 ? 0.34 : 0.20 + r() * 0.08;
        const cg = new THREE.CylinderGeometry(chR * 0.46, chR, chH, 12, 7);
        const cp = cg.attributes.position;
        for (let k = 0; k < cp.count; k++) {
          let vx = cp.getX(k), vy = cp.getY(k), vz = cp.getZ(k);
          const h = (vy + chH * 0.5) / chH;
          const ang = Math.atan2(vz, vx);
          const flute = 1.0 + 0.22 * Math.sin(ang * 4.0 + s * 2.1 + seed) * (1.0 - h * 0.35);
          const tipRound = h > 0.88 ? Math.cos(((h - 0.88) / 0.12) * Math.PI * 0.46) : 1.0;
          cp.setXYZ(k, vx * flute * tipRound, vy + chH * 0.5 + 0.12, vz * flute * tipRound);
        }
        cg.computeVertexNormals();
        const cm = new THREE.Mesh(cg, termiteMat);
        if (s > 0) {
          const a = (s / (chimneyCount - 1)) * Math.PI * 1.4 + seed;
          cm.position.set(Math.cos(a) * 0.42, 0, Math.sin(a) * 0.42);
        }
        cm.rotation.set((r() - 0.5) * 0.10, 0, (r() - 0.5) * 0.10);
        cm.castShadow = true;
        cm.receiveShadow = true;
        g.add(cm);
      }
      return g;
    }

    function createScrubBush(seed) {
      const r = createRNG(seed);
      const g = new THREE.Group();
      const branches = 5 + Math.floor(r() * 3);
      for (let b = 0; b < branches; b++) {
        const ang = (b / branches) * Math.PI * 2 + (r() - 0.5) * 0.55;
        const spread = 0.48 + r() * 0.42;
        const h = 0.45 + r() * 0.42;
        const bCurve = new THREE.CatmullRomCurve3([
          new THREE.Vector3(0, -0.04, 0),
          new THREE.Vector3(Math.cos(ang) * spread * 0.45, h * 0.55, Math.sin(ang) * spread * 0.45),
          new THREE.Vector3(Math.cos(ang) * spread, h, Math.sin(ang) * spread),
        ]);
        const bGeom = new THREE.TubeGeometry(bCurve, 5, 0.022 + r() * 0.010, 5, false);
        const bMesh = new THREE.Mesh(bGeom, barkMat);
        bMesh.castShadow = true;
        g.add(bMesh);

        // Flat feathery bipinnate leaf spray perched at branch tip (baby umbrella acacia!)
        const padR = 0.32 + r() * 0.22;
        const padGeom = new THREE.PlaneGeometry(padR * 2.0, padR * 2.0, 3, 3);
        padGeom.rotateX(-Math.PI * 0.5);
        const pp = padGeom.attributes.position;
        for (let k = 0; k < pp.count; k++) {
          const vx = pp.getX(k), vz = pp.getZ(k);
          const rn = Math.min(1.0, Math.hypot(vx, vz) / padR);
          pp.setY(k, (1.0 - rn * rn) * 0.08);
        }
        padGeom.computeVertexNormals();
        const pad = new THREE.Mesh(padGeom, b % 2 === 0 ? foliageMatDark : foliageMatMid);
        pad.position.set(Math.cos(ang) * spread, h + 0.02, Math.sin(ang) * spread);
        pad.rotation.y = r() * Math.PI * 2;
        pad.castShadow = true;
        pad.receiveShadow = true;
        g.add(pad);
      }
      return g;
    }

    const moundSpots = [
      { x: -10.5, z: 24.0, seed: 501 },
      { x:  14.2, z: -18.0, seed: 502 },
      { x: -22.0, z: -34.0, seed: 503 },
      { x:  18.5, z: 54.0, seed: 504 },
    ];
    for (const ms of moundSpots) {
      const m = createTermiteMound(ms.seed);
      m.position.set(ms.x, groundHeight(ms.x, ms.z) - 0.05, ms.z);
      envGroup.add(m);
      props.push({ mesh: m, x: ms.x, z: ms.z, yOff: -0.05 });
    }
    for (let i = 0; i < 16; i++) {
      const bx = (rng() > 0.5 ? 1 : -1) * (6.2 + rng() * 28);
      const bz = (rng() - 0.5) * propWrapZ;
      const bush = createScrubBush(600 + i);
      bush.position.set(bx, groundHeight(bx, bz) - 0.03, bz);
      envGroup.add(bush);
      props.push({ mesh: bush, x: bx, z: bz, yOff: -0.03 });
    }

    // 5c. Distant Soaring Savanna Vultures / Eagles Circling High on Far Horizon Thermals
    const birdMat = new THREE.MeshBasicMaterial({ color: 0x352b25, side: THREE.DoubleSide });
    const birds = [];
    const birdConfigs = [
      { cx: -38, bz: -34, r: 12.0, alt: 16.5, spd: 0.14, ph: 0.4 },
      { cx: -28, bz: -44, r: 14.0, alt: 19.0, spd: 0.12, ph: 1.9 },
      { cx: -48, bz: -24, r: 13.0, alt: 21.0, spd: 0.13, ph: 3.4 },
      { cx:  36, bz:  42, r: 15.0, alt: 18.5, spd: 0.14, ph: 4.8 },
      { cx: -34, bz:  46, r: 13.5, alt: 20.5, spd: 0.15, ph: 2.6 },
      { cx:  44, bz: -38, r: 15.0, alt: 17.5, spd: 0.11, ph: 5.5 },
    ];
    // Tapered swept eagle wing (pointed primary feathers, not a rectangle!)
    const wingShape = new THREE.Shape();
    wingShape.moveTo(0, -0.10);
    wingShape.quadraticCurveTo(0.32, -0.12, 0.72, -0.02);
    wingShape.lineTo(0.76, 0.03);
    wingShape.quadraticCurveTo(0.36, 0.10, 0, 0.10);
    wingShape.closePath();
    const wingGeom = new THREE.ShapeGeometry(wingShape, 4);
    wingGeom.rotateX(-Math.PI * 0.5);

    for (let i = 0; i < birdConfigs.length; i++) {
      const cfg = birdConfigs[i];
      const bird = new THREE.Group();
      const wingL = new THREE.Mesh(wingGeom, birdMat);
      const wingR = new THREE.Mesh(wingGeom, birdMat);
      wingR.scale.x = -1;
      bird.add(wingL);
      bird.add(wingR);
      const body = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.40, 5), birdMat);
      body.rotation.x = Math.PI * 0.5;
      bird.add(body);
      envGroup.add(bird);
      birds.push({
        group: bird,
        wingL,
        wingR,
        centerX: cfg.cx,
        baseZ: cfg.bz,
        radius: cfg.r,
        altitude: cfg.alt,
        speed: cfg.spd,
        phase: cfg.ph,
      });
    }

    // 5d. Soft Ground-Hugging Hoof Contact Shadows (AO weight lock!)
    const contactShadowGeom = new THREE.PlaneGeometry(0.46, 0.56);
    contactShadowGeom.rotateX(-Math.PI * 0.5);
    const hoofShadows = {};
    for (const lk of ['fl', 'fr', 'hl', 'hr']) {
      const cMat = new THREE.MeshBasicMaterial({
        map: contactTex,
        transparent: true,
        opacity: 0.0,
        depthWrite: false,
      });
      const cMesh = new THREE.Mesh(contactShadowGeom, cMat);
      cMesh.renderOrder = 2;
      envGroup.add(cMesh);
      hoofShadows[lk] = { mesh: cMesh, mat: cMat };
    }

    function updateHoofShadows(hoofPositions) {
      if (!hoofPositions) return;
      for (const lk of ['fl', 'fr', 'hl', 'hr']) {
        const hp = hoofPositions[lk];
        if (!hp) continue;
        const gy = groundHeight(hp.x, hp.z);
        const hAbove = Math.max(0, hp.y - gy);
        const s = hoofShadows[lk];
        s.mesh.position.set(hp.x, gy + 0.012, hp.z);
        const proximity = Math.max(0, 1.0 - hAbove / 0.45);
        s.mat.opacity = proximity * proximity * 0.72;
        const sc = 0.78 + hAbove * 0.75;
        s.mesh.scale.set(sc, 1, sc);
      }
    }

    // 6. Subtle Soft-Feathered Sunlit Savanna Hoof Dust Wisps (zero hard polygon edges!)
    const dustSpriteTex = App.Materials.createSoftDustSpriteTexture();
    const dustPool = [];
    for (let i = 0; i < 28; i++) {
      const dm = new THREE.SpriteMaterial({
        map: dustSpriteTex,
        color: 0xd4ad76,
        transparent: true,
        opacity: 0,
        depthWrite: false,
      });
      const m = new THREE.Sprite(dm);
      m.visible = false;
      envGroup.add(m);
      dustPool.push({
        mesh: m,
        mat: dm,
        vel: new THREE.Vector3(),
        age: 99,
        life: 0.9,
      });
    }
    let dustCursor = 0;

    function spawnHoofDust(worldPos) {
      for (let k = 0; k < 3; k++) {
        const p = dustPool[dustCursor];
        dustCursor = (dustCursor + 1) % dustPool.length;
        p.age = 0;
        p.life = 0.65 + Math.random() * 0.45;
        p.mesh.visible = true;
        p.mesh.position.set(
          worldPos.x + (Math.random() - 0.5) * 0.14,
          worldPos.y + 0.05 + Math.random() * 0.06,
          worldPos.z + (Math.random() - 0.5) * 0.14
        );
        p.mesh.scale.setScalar(0.20 + Math.random() * 0.10);
        p.vel.set(
          (Math.random() - 0.5) * 0.28,
          0.14 + Math.random() * 0.12,
          -0.22 + (Math.random() - 0.5) * 0.18
        );
      }
    }

    // 7. Soft Circular Glowing Floating Savanna Dust Motes (warm low-air sunlit band)
    const moteCount = 85;
    const motePos = new Float32Array(moteCount * 3);
    const moteBase = [];
    for (let i = 0; i < moteCount; i++) {
      const mx = (rng() - 0.5) * 18;
      const my = 0.25 + rng() * 2.15;
      const mz = (rng() - 0.5) * 18;
      moteBase.push({ x: mx, y: my, z: mz, phase: rng() * Math.PI * 2 });
      motePos[i * 3] = mx;
      motePos[i * 3 + 1] = my;
      motePos[i * 3 + 2] = mz;
    }
    const moteGeom = new THREE.BufferGeometry();
    moteGeom.setAttribute('position', new THREE.BufferAttribute(motePos, 3));
    const moteMat = new THREE.PointsMaterial({
      map: dustSpriteTex,
      color: 0xffd28e,
      size: 0.08,
      transparent: true,
      opacity: 0.34,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const motePoints = new THREE.Points(moteGeom, moteMat);
    envGroup.add(motePoints);

    function applyPreset(presetKey, lights, renderer) {
      const p = LIGHTING_PRESETS[presetKey] || LIGHTING_PRESETS.golden;
      const sunDir = p.sunPos.clone().normalize();
      sky.mat.uniforms.uSunDir.value.copy(sunDir);
      sky.mat.uniforms.uTopColor.value.copy(p.skyTop);
      sky.mat.uniforms.uMidColor.value.copy(p.skyMid);
      sky.mat.uniforms.uHorizonColor.value.copy(p.skyHorizon);
      sky.mat.uniforms.uSunColor.value.copy(p.sunGlow);

      scene.fog.color.copy(p.fogColor);
      scene.fog.density = p.fogDensity;

      lights.sun.color.copy(p.sunColor);
      lights.sun.intensity = p.sunIntensity;
      lights.sunOffset.copy(p.sunPos);

      lights.hemi.color.copy(p.hemiSky);
      lights.hemi.groundColor.copy(p.hemiGround);
      lights.hemi.intensity = p.hemiIntensity;

      lights.rim.color.copy(p.rimColor);
      lights.rim.intensity = p.rimIntensity;

      horizonMat.color.copy(p.fogColor).multiplyScalar(0.68);
      horizonFarMat.color.copy(p.fogColor).multiplyScalar(0.84);
      renderer.toneMappingExposure = p.exposure;
    }

    function update(dt, time, giraffeZ) {
      sky.mesh.position.set(0, 0, giraffeZ);
      sky.mat.uniforms.uTime.value = time;
      horizonRing.position.set(0, 0, giraffeZ);
      horizonRingFar.position.set(0, 0, giraffeZ);
      grassUniforms.uTime.value = time;

      updateGroundTerrain(giraffeZ);
      updateGrassInstances(giraffeZ);

      const halfTreeZ = treeWrapZ * 0.5;
      for (let i = 0; i < trees.length; i++) {
        const t = trees[i];
        let moved = false;
        while (t.z < giraffeZ - halfTreeZ) {
          t.z += treeWrapZ;
          moved = true;
        }
        while (t.z > giraffeZ + halfTreeZ) {
          t.z -= treeWrapZ;
          moved = true;
        }
        if (moved) {
          t.mesh.position.set(t.x, groundHeight(t.x, t.z), t.z);
        }
      }

      const rockWrapZ = 110;
      const halfRockZ = rockWrapZ * 0.5;
      for (let i = 0; i < rocks.length; i++) {
        const r = rocks[i];
        let moved = false;
        while (r.z < giraffeZ - halfRockZ) {
          r.z += rockWrapZ;
          moved = true;
        }
        while (r.z > giraffeZ + halfRockZ) {
          r.z -= rockWrapZ;
          moved = true;
        }
        if (moved) {
          r.mesh.position.set(r.x, groundHeight(r.x, r.z) + r.sy * 0.10, r.z);
        }
      }

      const halfPropZ = propWrapZ * 0.5;
      for (let i = 0; i < props.length; i++) {
        const pr = props[i];
        let moved = false;
        while (pr.z < giraffeZ - halfPropZ) {
          pr.z += propWrapZ;
          moved = true;
        }
        while (pr.z > giraffeZ + halfPropZ) {
          pr.z -= propWrapZ;
          moved = true;
        }
        if (moved) {
          pr.mesh.position.set(pr.x, groundHeight(pr.x, pr.z) + pr.yOff, pr.z);
        }
      }

      for (let i = 0; i < birds.length; i++) {
        const b = birds[i];
        const ang = time * b.speed + b.phase;
        const bx = b.centerX + Math.cos(ang) * b.radius;
        const bz = giraffeZ + b.baseZ + Math.sin(ang) * b.radius;
        const by = b.altitude + Math.sin(ang * 1.7 + b.phase) * 1.1;
        b.group.position.set(bx, by, bz);
        b.group.rotation.y = -ang;
        b.group.rotation.z = 0.22; // gentle bank into thermal turn
        // Lazy soaring glide punctuated by occasional slow wingbeats
        const flapEnv = Math.max(0, Math.sin(time * 0.45 + b.phase * 2.0) - 0.45) * 1.8;
        const flap = Math.sin(time * 4.8 + b.phase) * 0.42 * flapEnv + 0.08;
        b.wingL.rotation.z = flap;
        b.wingR.rotation.z = -flap;
      }

      for (let i = 0; i < dustPool.length; i++) {
        const p = dustPool[i];
        if (p.age >= p.life) continue;
        p.age += dt;
        const frac = p.age / p.life;
        if (frac >= 1) {
          p.mesh.visible = false;
          continue;
        }
        p.mesh.position.addScaledVector(p.vel, dt);
        p.vel.multiplyScalar(Math.pow(0.25, dt));
        p.mesh.scale.setScalar(0.20 + frac * 0.48);
        p.mat.opacity = Math.sin(frac * Math.PI) * 0.28;
      }

      const mp = moteGeom.attributes.position;
      for (let i = 0; i < moteCount; i++) {
        const b = moteBase[i];
        mp.setXYZ(
          i,
          b.x + Math.sin(time * 0.35 + b.phase) * 0.45,
          b.y + Math.cos(time * 0.28 + b.phase * 1.3) * 0.25,
          giraffeZ + b.z + Math.sin(time * 0.22 + b.phase * 0.7) * 0.45
        );
      }
      mp.needsUpdate = true;
    }

    return {
      sky,
      applyPreset,
      spawnHoofDust,
      updateHoofShadows,
      update,
    };
  }

  App.Environment = {
    LIGHTING_PRESETS,
    createSavannaEnvironment,
  };
})(window);
