// Procedural Reticulated Giraffe Coat Shader (True Linear-Space PBR) & Supporting Materials
(function (global) {
  'use strict';

  const CoatMaterials = {};

  /**
   * Creates the main giraffe coat MeshPhysicalMaterial using onBeforeCompile
   * to evaluate seamless 3D rest-pose Voronoi reticulated patches in TRUE LINEAR
   * color space, with organic edge warp, natural melanin variation, silky fur
   * micro-grain, distance-attenuated velvet normal detail, and warm rim sheen.
   */
  CoatMaterials.createCoatMaterial = function () {
    const mat = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      roughness: 0.86,
      metalness: 0.0,
      sheen: 0.38,
      sheenRoughness: 0.72,
      sheenColor: new THREE.Color(0xe8c391),
      clearcoat: 0.0,
      envMapIntensity: 0.65,
    });

    mat.onBeforeCompile = function (shader) {
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
          attribute vec3 aRestPos;
          attribute vec4 aCoatMeta; // x: spotMask, y: dorsalDarken, z: creamBelly, w: muzzleOrDust
          varying vec3 vRestPos;
          varying vec4 vCoatMeta;
          varying vec3 vRestWorldY;`
        )
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          vRestPos = aRestPos;
          vCoatMeta = aCoatMeta;
          vRestWorldY = vec3(position.x, position.y, position.z);`
        );

      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
          varying vec3 vRestPos;
          varying vec4 vCoatMeta;
          varying vec3 vRestWorldY;

          vec3 gHash33(vec3 p) {
            p = vec3(
              dot(p, vec3(127.1, 311.7, 74.7)),
              dot(p, vec3(269.5, 183.3, 246.1)),
              dot(p, vec3(113.5, 271.9, 124.6))
            );
            return fract(sin(p) * 43758.5453123);
          }

          float gHash31(vec3 p) {
            return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453123);
          }

          float gNoise3(vec3 p) {
            vec3 i = floor(p);
            vec3 f = fract(p);
            vec3 u = f * f * (3.0 - 2.0 * f);
            float n000 = gHash31(i + vec3(0.0, 0.0, 0.0));
            float n100 = gHash31(i + vec3(1.0, 0.0, 0.0));
            float n010 = gHash31(i + vec3(0.0, 1.0, 0.0));
            float n110 = gHash31(i + vec3(1.0, 1.0, 0.0));
            float n001 = gHash31(i + vec3(0.0, 0.0, 1.0));
            float n101 = gHash31(i + vec3(1.0, 0.0, 1.0));
            float n011 = gHash31(i + vec3(0.0, 1.0, 1.0));
            float n111 = gHash31(i + vec3(1.0, 1.0, 1.0));
            float nx00 = mix(n000, n100, u.x);
            float nx10 = mix(n010, n110, u.x);
            float nx01 = mix(n001, n101, u.x);
            float nx11 = mix(n011, n111, u.x);
            float nxy0 = mix(nx00, nx10, u.y);
            float nxy1 = mix(nx01, nx11, u.y);
            return mix(nxy0, nxy1, u.z);
          }

          float gFbm3(vec3 p) {
            float v = 0.0;
            float a = 0.5;
            for (int i = 0; i < 3; i++) {
              v += a * gNoise3(p);
              p = p * 2.04 + vec3(17.1, 31.7, 11.3);
              a *= 0.5;
            }
            return v;
          }

          // Exact Euclidean bisector distance 3D Voronoi -> vec3(edgeDist, cellId, centerDist)
          vec3 gVoronoi3D(vec3 x) {
            vec3 n = floor(x);
            vec3 f = fract(x);

            vec3 mg, mr;
            float md = 8.0;
            float cellId = 0.0;

            for (int k = -1; k <= 1; k++) {
              for (int j = -1; j <= 1; j++) {
                for (int i = -1; i <= 1; i++) {
                  vec3 g = vec3(float(i), float(j), float(k));
                  vec3 o = gHash33(n + g);
                  o = 0.12 + 0.76 * o;
                  vec3 r = g + o - f;
                  float d = dot(r, r);
                  if (d < md) {
                    md = d;
                    mr = r;
                    mg = g;
                    cellId = o.x * 0.53 + o.y * 0.31 + o.z * 0.16;
                  }
                }
              }
            }

            float edgeDist = 8.0;
            for (int k = -1; k <= 1; k++) {
              for (int j = -1; j <= 1; j++) {
                for (int i = -1; i <= 1; i++) {
                  vec3 g = mg + vec3(float(i), float(j), float(k));
                  vec3 o = gHash33(n + g);
                  o = 0.12 + 0.76 * o;
                  vec3 r = g + o - f;
                  vec3 diff = r - mr;
                  if (dot(diff, diff) > 0.00001) {
                    edgeDist = min(edgeDist, dot(0.5 * (mr + r), normalize(diff)));
                  }
                }
              }
            }

            return vec3(edgeDist, cellId, sqrt(md));
          }`
        )
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
          {
            // Authentic Reticulated Giraffe polygonal patch scale (balanced phase offset across chest/shoulders)
            vec3 p = vRestPos * 3.75 + vec3(1.42, 0.78, 2.18);

            // Smooth organic warp so polygon borders feel biological without giant cream gaps
            vec3 warp = vec3(
              gFbm3(p * 1.05 + vec3(3.1, 7.4, 2.2)) - 0.5,
              gFbm3(p * 1.05 + vec3(19.3, 1.7, 9.8)) - 0.5,
              gFbm3(p * 1.05 + vec3(8.5, 14.2, 23.1)) - 0.5
            );
            float furEdge = gNoise3(vRestPos * 34.0) - 0.5;

            vec3 vor = gVoronoi3D(p + warp * 0.23);
            float edgeDist = vor.x + furEdge * 0.016;
            float cellId = vor.y;

            float spotMask = clamp(vCoatMeta.x, 0.0, 1.0);
            float dorsalDark = clamp(vCoatMeta.y, 0.0, 1.0);
            float creamBelly = clamp(vCoatMeta.z, 0.0, 1.0);
            float muzzleDust = clamp(vCoatMeta.w, 0.0, 1.0);

            // Crisp warm-ivory reticulation lines (~0.062) on torso/neck,
            // widening smoothly as spots shrink & dissolve into creamy stockings/muzzle
            float lineHalfWidth = mix(0.26, 0.062, smoothstep(0.05, 0.85, spotMask));
            float patchFactor = smoothstep(lineHalfWidth - 0.020, lineHalfWidth + 0.026, edgeDist);
            patchFactor *= smoothstep(0.02, 0.25, spotMask);

            // TRUE LINEAR-SPACE PHOTOREALISTIC RETICULATED GIRAFFE PALETTE
            vec3 creamBase     = vec3(0.58, 0.43, 0.23);
            vec3 creamBellyCol = vec3(0.60, 0.48, 0.29);
            vec3 creamCol = mix(creamBase, creamBellyCol, creamBelly);

            // Deep rich burnt-sienna / chestnut / mahogany patches
            vec3 patchWarm = vec3(0.235, 0.064, 0.013);
            vec3 patchMid  = vec3(0.155, 0.037, 0.007);
            vec3 patchDeep = vec3(0.082, 0.018, 0.0035);

            vec3 patchCol = mix(patchWarm, patchMid, smoothstep(0.12, 0.88, cellId));
            float innerRich = smoothstep(0.06, 0.34, edgeDist);
            patchCol = mix(patchCol * 1.16, patchCol * 0.82, innerRich * 0.58);
            patchCol = mix(patchCol, patchDeep, dorsalDark * 0.62);

            float macroVar = gNoise3(vRestPos * 6.5);
            patchCol *= (0.89 + 0.22 * macroVar);
            creamCol *= (0.94 + 0.12 * macroVar);

            // Silky short-fur micro-grain
            vec3 furCoord = vec3(vRestPos.x * 58.0, vRestPos.y * 28.0, vRestPos.z * 58.0);
            float furGrain = gNoise3(furCoord) * 0.65 + gNoise3(furCoord * 1.9) * 0.35;
            float furShade = 0.93 + 0.13 * furGrain;

            vec3 coatColor = mix(creamCol, patchCol, patchFactor);

            // Velvety grey-taupe snout & lips on head, dusty savannah earth & coronet transition on lower ankles
            float isHead = step(3.2, vRestWorldY.y);
            vec3 muzzleVelvet = vec3(0.135, 0.092, 0.060);
            vec3 savannahDust = vec3(0.32, 0.22, 0.12);
            vec3 coronetDark  = vec3(0.14, 0.10, 0.065);
            float coronetBand = (1.0 - isHead) * (1.0 - smoothstep(0.105, 0.175, vRestWorldY.y));
            coatColor = mix(coatColor, muzzleVelvet, muzzleDust * isHead * 0.74);
            coatColor = mix(coatColor, savannahDust, muzzleDust * (1.0 - isHead) * 0.46);
            coatColor = mix(coatColor, coronetDark, coronetBand * 0.55);

            coatColor *= furShade;
            diffuseColor.rgb *= coatColor;
          }`
        )
        .replace(
          '#include <roughnessmap_fragment>',
          `#include <roughnessmap_fragment>
          {
            float furMicro = gNoise3(vec3(vRestPos.x * 64.0, vRestPos.y * 32.0, vRestPos.z * 64.0));
            roughnessFactor = clamp(0.82 + 0.12 * furMicro, 0.70, 0.96);
          }`
        )
        .replace(
          '#include <normal_fragment_maps>',
          `#include <normal_fragment_maps>
          {
            // Gentle distance-attenuated plush velvet fur normal detail (zero mid-range sparkle!)
            float camDist = length(vViewPosition);
            float detailFade = 1.0 / (1.0 + camDist * camDist * 0.12);
            if (detailFade > 0.05) {
              vec3 fP = vec3(vRestPos.x * 68.0, vRestPos.y * 34.0, vRestPos.z * 68.0);
              float h = gNoise3(fP);
              vec3 dPosX = dFdx(vViewPosition);
              vec3 dPosY = dFdy(vViewPosition);
              float dHx = dFdx(h);
              float dHy = dFdy(h);
              vec3 r1 = cross(dPosY, normal);
              vec3 r2 = cross(normal, dPosX);
              float det = dot(dPosX, r1);
              if (abs(det) > 1e-6) {
                vec3 surfGrad = sign(det) * (dHx * r1 + dHy * r2);
                normal = normalize(abs(det) * normal - (0.0055 * detailFade) * surfGrad);
              }
            }
          }`
        );
    };

    mat.customProgramCacheKey = function () {
      return 'giraffe-reticulated-coat-v2';
    };

    return mat;
  };

  /**
   * Procedural keratinous cloven hoof material with horizontal growth ridges & savannah dust.
   */
  CoatMaterials.createHoofMaterial = function () {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');

    const grad = ctx.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0.0, '#30261f');
    grad.addColorStop(0.25, '#1f1915');
    grad.addColorStop(0.76, '#171310');
    grad.addColorStop(1.0, '#463728');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 256, 256);

    for (let y = 0; y < 256; y += 3) {
      const alpha = 0.04 + Math.sin(y * 0.35) * 0.035 + Math.sin(y * 0.13) * 0.025;
      ctx.fillStyle = y % 6 === 0
        ? `rgba(255,235,210,${Math.max(0, alpha)})`
        : `rgba(0,0,0,${Math.max(0, alpha * 1.4)})`;
      ctx.fillRect(0, y, 256, 2);
    }

    for (let x = 0; x < 256; x += 2) {
      ctx.fillStyle = x % 4 === 0 ? 'rgba(255,240,220,0.025)' : 'rgba(0,0,0,0.05)';
      ctx.fillRect(x, 0, 1, 256);
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.encoding = THREE.sRGBEncoding;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;

    return new THREE.MeshStandardMaterial({
      map: tex,
      roughness: 0.52,
      metalness: 0.04,
      envMapIntensity: 0.65,
    });
  };

  /**
   * Glossy expressive giraffe eye material with detailed deep-brown iris & horizontal pupil.
   */
  CoatMaterials.createEyeMaterial = function () {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    const cx = 256;
    const cy = 256;

    // Dark mahogany sclera (authentic ungulate eye)
    ctx.fillStyle = '#1f1611';
    ctx.fillRect(0, 0, 512, 512);

    const irisGrad = ctx.createRadialGradient(cx, cy, 42, cx, cy, 185);
    irisGrad.addColorStop(0.0, '#0a0503');
    irisGrad.addColorStop(0.38, '#261208');
    irisGrad.addColorStop(0.72, '#4a230e');
    irisGrad.addColorStop(0.90, '#231006');
    irisGrad.addColorStop(1.0, '#100804');
    ctx.beginPath();
    ctx.arc(cx, cy, 186, 0, Math.PI * 2);
    ctx.fillStyle = irisGrad;
    ctx.fill();

    const rng = GiraffeMath.createRNG(409);
    for (let i = 0; i < 240; i++) {
      const a = (i / 240) * Math.PI * 2 + (rng() - 0.5) * 0.02;
      const r0 = 55 + rng() * 25;
      const r1 = 158 + rng() * 24;
      ctx.strokeStyle = rng() > 0.5 ? 'rgba(135, 72, 28, 0.25)' : 'rgba(18, 8, 3, 0.30)';
      ctx.lineWidth = 1.2 + rng() * 1.4;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
      ctx.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
      ctx.stroke();
    }

    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(1.18, 0.85);
    ctx.beginPath();
    ctx.arc(0, 0, 74, 0, Math.PI * 2);
    ctx.fillStyle = '#040303';
    ctx.fill();
    ctx.restore();

    const tex = new THREE.CanvasTexture(canvas);
    tex.encoding = THREE.sRGBEncoding;

    return new THREE.MeshPhysicalMaterial({
      map: tex,
      roughness: 0.05,
      metalness: 0.0,
      clearcoat: 1.0,
      clearcoatRoughness: 0.02,
      envMapIntensity: 1.8,
    });
  };

  /**
   * Rich dark chestnut-to-espresso brush mane material.
   */
  CoatMaterials.createManeMaterial = function () {
    return new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      vertexColors: true,
      roughness: 0.86,
      metalness: 0.0,
      sheen: 0.25,
      sheenRoughness: 0.78,
      sheenColor: new THREE.Color(0x9e6a3b),
      side: THREE.DoubleSide,
    });
  };

  /**
   * Deep rich espresso/black hair material for ossicone knobs, eyelashes & tail tassel.
   */
  CoatMaterials.createDarkHairMaterial = function () {
    return new THREE.MeshStandardMaterial({
      color: 0x1a1009,
      roughness: 0.90,
      metalness: 0.0,
    });
  };

  /**
   * Soft warm dusty-tan inner-ear velvety skin (vertex-colored darker deep inside ear canal!).
   */
  CoatMaterials.createInnerEarMaterial = function () {
    return new THREE.MeshStandardMaterial({
      color: 0xffffff,
      vertexColors: true,
      roughness: 0.90,
      metalness: 0.0,
    });
  };

  /**
   * Dark velvety nostril interior.
   */
  CoatMaterials.createNostrilMaterial = function () {
    return new THREE.MeshStandardMaterial({
      color: 0x16100d,
      roughness: 0.70,
      metalness: 0.0,
    });
  };

  global.GiraffeCoatMaterials = CoatMaterials;
})(window);
