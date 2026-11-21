(function (global) {
  'use strict';

  const App = (global.GiraffeApp = global.GiraffeApp || {});

  // Helper for Three.js r147 (converts sRGB hex color to true linear light space!)
  function srgbColor(hex) {
    return new THREE.Color(hex).convertSRGBToLinear();
  }

  function createGiraffeCoatMaterial() {
    const mat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.84,
      metalness: 0.0,
      envMapIntensity: 0.30,
    });

    const uniforms = {
      uSunDir: { value: new THREE.Vector3(0.72, 0.42, 0.55).normalize() },
      uRimColor: { value: new THREE.Color(0.32, 0.20, 0.09) },
    };
    mat.userData.coatUniforms = uniforms;

    mat.onBeforeCompile = function (shader) {
      shader.uniforms.uSunDir = uniforms.uSunDir;
      shader.uniforms.uRimColor = uniforms.uRimColor;

      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
          attribute vec3 aRestPos;
          varying vec3 vRestPos;
          varying vec3 vRestNormal;
          varying vec3 vWorldNormalG;`
        )
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          vRestPos = aRestPos;
          vRestNormal = normal;`
        )
        .replace(
          '#include <project_vertex>',
          `#include <project_vertex>
          vWorldNormalG = normalize(mat3(modelMatrix) * objectNormal);`
        );

      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
          uniform vec3 uSunDir;
          uniform vec3 uRimColor;
          varying vec3 vRestPos;
          varying vec3 vRestNormal;
          varying vec3 vWorldNormalG;

          vec3 gHash33(vec3 p) {
            p = vec3(
              dot(p, vec3(127.1, 311.7, 74.7)),
              dot(p, vec3(269.5, 183.3, 246.1)),
              dot(p, vec3(113.5, 271.9, 124.6))
            );
            return fract(sin(p) * 43758.5453123);
          }

          float gHash31(vec3 p) {
            return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453);
          }

          float gNoise3(vec3 p) {
            vec3 i = floor(p);
            vec3 f = fract(p);
            f = f * f * (3.0 - 2.0 * f);
            float n000 = gHash31(i + vec3(0.0, 0.0, 0.0));
            float n100 = gHash31(i + vec3(1.0, 0.0, 0.0));
            float n010 = gHash31(i + vec3(0.0, 1.0, 0.0));
            float n110 = gHash31(i + vec3(1.0, 1.0, 0.0));
            float n001 = gHash31(i + vec3(0.0, 0.0, 1.0));
            float n101 = gHash31(i + vec3(1.0, 0.0, 1.0));
            float n011 = gHash31(i + vec3(0.0, 1.0, 1.0));
            float n111 = gHash31(i + vec3(1.0, 1.0, 1.0));
            float nx00 = mix(n000, n100, f.x);
            float nx10 = mix(n010, n110, f.x);
            float nx01 = mix(n001, n101, f.x);
            float nx11 = mix(n011, n111, f.x);
            float nxy0 = mix(nx00, nx10, f.y);
            float nxy1 = mix(nx01, nx11, f.y);
            return mix(nxy0, nxy1, f.z);
          }

          float gFbm3(vec3 p) {
            float v = 0.0;
            float a = 0.5;
            for (int i = 0; i < 3; i++) {
              v += a * (gNoise3(p) * 2.0 - 1.0);
              p = p * 2.04 + vec3(13.1, 7.7, 5.3);
              a *= 0.5;
            }
            return v;
          }

          // 3D Voronoi returning: x = border distance (F2 - F1), y = F1, z = cell hash
          vec3 gVoronoi3D(vec3 x) {
            vec3 n = floor(x);
            vec3 f = fract(x);

            float md1 = 8.0;
            float md2 = 8.0;
            vec3 bestCell = vec3(0.0);

            for (int k = -1; k <= 1; k++) {
              for (int j = -1; j <= 1; j++) {
                for (int i = -1; i <= 1; i++) {
                  vec3 g = vec3(float(i), float(j), float(k));
                  vec3 cell = n + g;
                  vec3 o = gHash33(cell);
                  vec3 r = g + (0.16 + 0.68 * o) - f;
                  float d = dot(r, r);
                  if (d < md1) {
                    md2 = md1;
                    md1 = d;
                    bestCell = cell;
                  } else if (d < md2) {
                    md2 = d;
                  }
                }
              }
            }
            float d1 = sqrt(md1);
            float d2 = sqrt(md2);
            return vec3(d2 - d1, d1, gHash31(bestCell));
          }

          float gFurHeight(vec3 p) {
            // Directional short-velvet fur combed downward along body/neck & limbs
            vec3 sp = vec3(p.x * 160.0, p.y * 56.0, p.z * 160.0);
            float n1 = gNoise3(sp);
            float n2 = gNoise3(sp * 2.5 + vec3(4.2, 1.9, 7.1));
            float n3 = gNoise3(sp * 5.2 + vec3(9.4, 3.1, 2.6));
            return n1 * 0.52 + n2 * 0.32 + n3 * 0.16;
          }`
        )
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
          vec3 rp = vRestPos;
          vec3 rn = normalize(vRestNormal);

          // Organic multi-octave biological domain warp for natural irregular giraffe blotches
          vec3 warp = vec3(
            gFbm3(rp * 3.8 + vec3(1.2, 3.4, 2.1)),
            gFbm3(rp * 3.8 + vec3(6.7, 0.9, 4.5)),
            gFbm3(rp * 3.8 + vec3(2.9, 5.1, 8.3))
          );
          vec3 warpMicro = vec3(
            gNoise3(rp * 14.5 + vec3(3.1, 1.4, 7.2)) - 0.5,
            gNoise3(rp * 14.5 + vec3(8.2, 4.7, 2.3)) - 0.5,
            gNoise3(rp * 14.5 + vec3(1.9, 6.8, 5.1)) - 0.5
          );

          // Two fixed-frequency 3D Voronoi fields cross-faded cleanly by anatomical zone
          vec3 vorBody = gVoronoi3D(rp * 4.55 + warp * 0.38 + warpMicro * 0.08);
          vec3 vorFine = gVoronoi3D(rp * 10.40 + warp * 0.42 + warpMicro * 0.09 + vec3(17.3, 4.1, 9.2));

          float fineHeadWeight = smoothstep(3.92, 4.44, rp.y);
          float fineLegWeight = 1.0 - smoothstep(0.62, 1.48, rp.y);
          float fineMix = clamp(max(fineHeadWeight, fineLegWeight), 0.0, 1.0);

          float jitterBody = gFbm3(rp * 17.5 + vec3(9.1, 2.3, 5.7)) * 0.056;
          float jitterFine = gFbm3(rp * 28.0 + vec3(3.4, 8.2, 1.7)) * 0.062;

          float maskBody = smoothstep(0.086, 0.140, vorBody.x + jitterBody);
          float maskFine = smoothstep(0.112, 0.180, vorFine.x + jitterFine);

          float patchMask = mix(maskBody, maskFine, fineMix);
          float edgeDist = mix(vorBody.x, vorFine.x, fineMix);
          float cellRand = mix(vorBody.z, vorFine.z, fineMix);

          // Lower legs (below carpus/hock ~1.05m): spots fade softly into warm buff-cream stockings
          float stockingFade = smoothstep(0.56, 1.24, rp.y);
          patchMask *= stockingFade;

          // Belly / groin / inner leg underside
          float bellyRegion = smoothstep(2.04, 1.60, rp.y) * smoothstep(-0.78, 0.62, rp.z) * smoothstep(0.82, 0.20, abs(rp.z));
          float underside = smoothstep(0.02, -0.62, rn.y) * smoothstep(1.30, 2.25, rp.y);
          float innerLeg = smoothstep(1.65, 1.15, rp.y) * smoothstep(0.18, 0.10, abs(rp.x));
          float paleMask = clamp(underside * 0.72 + bellyRegion * 0.30 + innerLeg * 0.38, 0.0, 0.88);
          patchMask *= (1.0 - paleMask * 0.78);

          // Head & refined muzzle transitions (head bone at y=4.46, z=1.80; nose tip at z=2.385, y=4.285)
          float isHead = smoothstep(4.12, 4.34, rp.y) * smoothstep(1.66, 1.94, rp.z);
          float muzzleGrad = smoothstep(2.08, 2.29, rp.z) * isHead;
          float lipRegion = smoothstep(2.26, 2.38, rp.z) * isHead;
          patchMask *= (1.0 - muzzleGrad * 0.94);

          // Subtle darker warm-tawny blaze down bridge of nose & forehead boss
          float foreheadStripe = smoothstep(0.055, 0.012, abs(rp.x)) * smoothstep(1.90, 2.16, rp.z) * smoothstep(2.33, 2.18, rp.z) * smoothstep(4.36, 4.52, rp.y);

          // Soft dark eye orbital ring
          float eyeDistL = length(rp - vec3(0.108, 4.496, 1.965));
          float eyeDistR = length(rp - vec3(-0.108, 4.496, 1.965));
          float eyeRing = 1.0 - smoothstep(0.028, 0.060, min(eyeDistL, eyeDistR));

          // ===================================================================
          // LINEAR-SPACE PBR GIRAFFE PALETTE (ACESFilmic calibrated!)
          // ===================================================================
          vec3 creamBase = vec3(0.52, 0.37, 0.195);
          vec3 creamBelly = vec3(0.60, 0.46, 0.28);
          vec3 creamStocking = vec3(0.53, 0.40, 0.235);

          // Rich deep roasted chestnut / burnt-mahogany patches with darker umber centers
          vec3 patchEdgeCol = vec3(0.22, 0.078, 0.020);
          vec3 patchDeepCol = vec3(0.095, 0.028, 0.007);
          float coreDepth = smoothstep(0.12, 0.42, edgeDist);
          vec3 patchCol = mix(patchEdgeCol, patchDeepCol, coreDepth * 0.74);

          float toneShift = (cellRand - 0.5) * 0.28;
          patchCol *= (1.0 + vec3(toneShift * 0.9, toneShift * 0.8, toneShift * 0.55));

          // Slightly deeper umber along dorsal spine, withers & back of ears
          float dorsalDark = smoothstep(0.28, 0.85, rn.y) * smoothstep(1.85, 3.25, rp.y);
          patchCol = mix(patchCol, patchCol * vec3(0.70, 0.65, 0.60), dorsalDark * 0.52);

          vec3 lightCoat = mix(creamBase, creamBelly, paleMask);
          lightCoat = mix(creamStocking, lightCoat, smoothstep(0.45, 1.25, rp.y));
          vec3 coatCol = mix(lightCoat, patchCol, patchMask);

          // Warm tawny forehead blaze + rich velvety taupe-charcoal giraffe muzzle & dark prehensile lips!
          vec3 foreheadTawny = vec3(0.19, 0.095, 0.038);
          coatCol = mix(coatCol, foreheadTawny, foreheadStripe * 0.56);

          vec3 muzzleVelvet = vec3(0.125, 0.094, 0.068);
          vec3 lipSmoky = vec3(0.034, 0.026, 0.022);
          coatCol = mix(coatCol, muzzleVelvet, muzzleGrad * 0.88);
          coatCol = mix(coatCol, lipSmoky, lipRegion * 0.78);

          // Expressive dark mouth cleft separating prehensile upper lip & lower chin!
          float mouthPlane = abs((rp.y - 4.274) + (rp.z - 2.34) * 0.25);
          float mouthMask = smoothstep(0.014, 0.002, mouthPlane) * smoothstep(2.18, 2.27, rp.z) * smoothstep(2.39, 2.34, rp.z) * isHead;
          coatCol = mix(coatCol, vec3(0.015, 0.011, 0.009), mouthMask * 0.90);

          // Soft darker inner-nostril shading right around the 3D sculpted nostril slits!
          float nosL = length((rp - vec3(0.042, 4.316, 2.326)) * vec3(1.1, 1.5, 0.85));
          float nosR = length((rp - vec3(-0.042, 4.316, 2.326)) * vec3(1.1, 1.5, 0.85));
          float nostrilMask = 1.0 - smoothstep(0.010, 0.026, min(nosL, nosR));
          coatCol = mix(coatCol, vec3(0.018, 0.013, 0.011), nostrilMask * 0.92);

          // Soft dark eye-liner around eyelids
          coatCol = mix(coatCol, vec3(0.042, 0.026, 0.016), eyeRing * 0.62);

          // Earthy Serengeti ochre dust patina near fetlocks & coronet (y < 0.36m)
          float hoofDust = 1.0 - smoothstep(0.06, 0.36, rp.y);
          coatCol = mix(coatCol, vec3(0.28, 0.18, 0.095), hoofDust * 0.50);

          // Fine directional short-fur micro-variation & subtle muscle/jugular anatomical shading
          float furGrain = gFurHeight(rp);
          coatCol *= (0.90 + 0.20 * furGrain);

          // Subtle jugular groove running along lateral-ventral neck + subtle anatomical muscle relief
          float neckZone = smoothstep(2.65, 3.05, rp.y) * smoothstep(4.35, 4.05, rp.y);
          float jugGroove = neckZone * smoothstep(0.14, 0.04, abs(abs(rp.x) - 0.11)) * smoothstep(0.35, -0.35, rn.z) * 0.11;

          // Subtle ribcage & scapular shoulder/pelvis muscular depth modulation
          float ribZone = smoothstep(1.85, 2.25, rp.y) * smoothstep(2.75, 2.45, rp.y) * smoothstep(-0.35, 0.02, rp.z) * smoothstep(0.45, 0.18, rp.z) * smoothstep(0.35, 0.85, abs(rn.x));
          float ribWave = sin(rp.z * 28.0 + rp.y * 5.0) * 0.032 * ribZone;
          float shoulderCrease = smoothstep(1.80, 2.35, rp.y) * smoothstep(2.70, 2.35, rp.y) * smoothstep(0.16, 0.02, abs(rp.z - 0.44)) * smoothstep(0.35, 0.85, abs(rn.x)) * 0.075;

          // Anatomical AO in groin, armpits, throatlatch, underside
          float aoGroin = smoothstep(0.30, 0.07, abs(rp.x)) * smoothstep(2.05, 1.60, rp.y) * smoothstep(-0.78, -0.35, rp.z) * smoothstep(0.05, -0.35, rp.z);
          float aoAxilla = smoothstep(0.30, 0.07, abs(rp.x)) * smoothstep(2.05, 1.58, rp.y) * smoothstep(0.20, 0.54, rp.z) * smoothstep(0.76, 0.48, rp.z);
          float aoUnder = smoothstep(-0.15, -0.85, rn.y) * smoothstep(1.25, 2.05, rp.y) * 0.22;
          float aoThroat = smoothstep(4.20, 4.38, rp.y) * smoothstep(4.52, 4.38, rp.y) * smoothstep(1.62, 1.88, rp.z) * smoothstep(2.04, 1.86, rp.z) * smoothstep(-0.1, -0.7, rn.y) * 0.22;
          coatCol *= (1.0 + ribWave - clamp(aoGroin * 0.28 + aoAxilla * 0.28 + aoUnder + jugGroove + aoThroat + shoulderCrease, 0.0, 0.44));

          diffuseColor.rgb *= coatCol;`
        )
        .replace(
          '#include <roughnessmap_fragment>',
          `#include <roughnessmap_fragment>
          roughnessFactor = mix(0.86, 0.72, patchMask);
          roughnessFactor = mix(roughnessFactor, 0.94, muzzleGrad * 0.78);
          roughnessFactor = clamp(roughnessFactor + (furGrain - 0.5) * 0.10, 0.56, 0.96);`
        )
        .replace(
          '#include <normal_fragment_maps>',
          `#include <normal_fragment_maps>
          float fH = gFurHeight(vRestPos);
          vec3 dPosX = dFdx(vViewPosition);
          vec3 dPosY = dFdy(vViewPosition);
          float dHx = dFdx(fH);
          float dHy = dFdy(fH);
          vec3 bumpPerturb = normalize(cross(dPosY, normal) * dHx + cross(normal, dPosX) * dHy + vec3(1e-5));
          float bumpAmp = 0.068 * smoothstep(0.0, 1.0, 1.0 / (1.0 + length(vViewPosition) * 0.14));
          normal = normalize(normal - bumpPerturb * bumpAmp);`
        )
        .replace(
          '#include <dithering_fragment>',
          `vec3 viewDirW = normalize(vViewPosition);
          float fres = pow(1.0 - clamp(dot(normal, viewDirW), 0.0, 1.0), 3.2);
          float sunWrap = 0.42 + 0.58 * clamp(dot(normalize(vWorldNormalG), uSunDir) * 0.5 + 0.5, 0.0, 1.0);
          gl_FragColor.rgb += uRimColor * fres * sunWrap * 0.30;
          #include <dithering_fragment>`
        );
    };

    mat.customProgramCacheKey = function () {
      return 'giraffe_coat_pbr_v4';
    };

    return mat;
  }

  function createHoofMaterial() {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');

    const grad = ctx.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, '#251e18');
    grad.addColorStop(0.55, '#17120e');
    grad.addColorStop(1, '#2f241a');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 256, 256);

    for (let i = 0; i < 160; i++) {
      const x = (i / 160) * 256;
      const alpha = 0.05 + (i % 7) * 0.014;
      ctx.fillStyle = i % 2 === 0 ? `rgba(78,64,50,${alpha})` : `rgba(8,6,4,${alpha})`;
      ctx.fillRect(x, 0, 1.5, 256);
    }
    for (let y = 18; y < 256; y += 22) {
      ctx.fillStyle = 'rgba(0,0,0,0.16)';
      ctx.fillRect(0, y, 256, 3);
    }
    const dustGrad = ctx.createLinearGradient(0, 195, 0, 256);
    dustGrad.addColorStop(0, 'rgba(128,90,52,0)');
    dustGrad.addColorStop(1, 'rgba(128,90,52,0.52)');
    ctx.fillStyle = dustGrad;
    ctx.fillRect(0, 195, 256, 61);

    const tex = new THREE.CanvasTexture(canvas);
    tex.encoding = THREE.sRGBEncoding;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;

    return new THREE.MeshStandardMaterial({
      map: tex,
      roughness: 0.46,
      metalness: 0.04,
      envMapIntensity: 0.35,
    });
  }

  function createEyeMaterial() {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    const cx = 256;
    const cy = 256;

    ctx.fillStyle = '#1e140e';
    ctx.fillRect(0, 0, 512, 512);

    // Warm amber-mahogany eye iris with bright wet tear-film catchlight feel
    const irisGrad = ctx.createRadialGradient(cx, cy, 42, cx, cy, 212);
    irisGrad.addColorStop(0.0, '#180904');
    irisGrad.addColorStop(0.36, '#4c220c');
    irisGrad.addColorStop(0.72, '#8b4a1c');
    irisGrad.addColorStop(0.88, '#381808');
    irisGrad.addColorStop(1.0, '#140804');
    ctx.fillStyle = irisGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, 214, 0, Math.PI * 2);
    ctx.fill();

    ctx.save();
    ctx.translate(cx, cy);
    for (let i = 0; i < 140; i++) {
      ctx.rotate((Math.PI * 2) / 140);
      ctx.strokeStyle = i % 3 === 0 ? 'rgba(228, 150, 74, 0.48)' : 'rgba(26, 11, 4, 0.28)';
      ctx.lineWidth = 2.1;
      ctx.beginPath();
      ctx.moveTo(46, 0);
      ctx.lineTo(194, 0);
      ctx.stroke();
    }
    ctx.restore();

    // Warm lower-iris amber bounce (sunlit savanna light refracting through cornea!)
    const irisGlow = ctx.createRadialGradient(cx, cy + 56, 12, cx, cy + 48, 130);
    irisGlow.addColorStop(0.0, 'rgba(182, 108, 46, 0.50)');
    irisGlow.addColorStop(0.55, 'rgba(128, 66, 24, 0.22)');
    irisGlow.addColorStop(1.0, 'rgba(0, 0, 0, 0.0)');
    ctx.fillStyle = irisGlow;
    ctx.beginPath();
    ctx.arc(cx, cy, 195, 0, Math.PI * 2);
    ctx.fill();

    // Horizontal pill-shaped ungulate pupil
    ctx.fillStyle = '#030202';
    ctx.beginPath();
    ctx.ellipse(cx, cy, 82, 48, 0, 0, Math.PI * 2);
    ctx.fill();

    // Crisp sunlit sky catchlight visible right on the upper cornea below the eyelid (living soulful gleam!)
    const glint = ctx.createRadialGradient(cx - 26, cy - 4, 2, cx - 26, cy - 4, 21);
    glint.addColorStop(0, 'rgba(255, 252, 242, 0.98)');
    glint.addColorStop(0.42, 'rgba(255, 245, 224, 0.50)');
    glint.addColorStop(1, 'rgba(255, 242, 215, 0.0)');
    ctx.fillStyle = glint;
    ctx.beginPath();
    ctx.arc(cx - 26, cy - 4, 21, 0, Math.PI * 2);
    ctx.fill();

    // Delicate secondary warm ground-bounce sparkle on lower iris
    const glint2 = ctx.createRadialGradient(cx + 38, cy + 32, 1, cx + 38, cy + 32, 11);
    glint2.addColorStop(0, 'rgba(255, 226, 178, 0.62)');
    glint2.addColorStop(1, 'rgba(255, 226, 178, 0.0)');
    ctx.fillStyle = glint2;
    ctx.beginPath();
    ctx.arc(cx + 38, cy + 32, 11, 0, Math.PI * 2);
    ctx.fill();

    const tex = new THREE.CanvasTexture(canvas);
    tex.encoding = THREE.sRGBEncoding;

    return new THREE.MeshPhysicalMaterial({
      map: tex,
      roughness: 0.035,
      metalness: 0.0,
      clearcoat: 1.0,
      clearcoatRoughness: 0.02,
      reflectivity: 1.0,
      envMapIntensity: 1.35,
    });
  }

  function createHairMaterial(baseColorHex, roughness) {
    return new THREE.MeshStandardMaterial({
      color: srgbColor(baseColorHex || 0x2d160a),
      roughness: roughness !== undefined ? roughness : 0.90,
      metalness: 0.0,
      envMapIntensity: 0.22,
    });
  }

  function createInnerEarMaterial() {
    // Painted anatomical inner ear (warm shaded taupe-rose conch with fine hair fringes)
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');

    const g = ctx.createRadialGradient(128, 175, 18, 128, 128, 130);
    g.addColorStop(0.0, '#4f3528'); // deep shadowed ear canal base
    g.addColorStop(0.42, '#7d5a47'); // warm dusty rose-taupe conch
    g.addColorStop(0.78, '#a68366'); // softer inner rim
    g.addColorStop(1.0, '#c8ab86');  // pale creamy outer fringe hairs
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 256);

    // Delicate cartilage ridges & pale silky inner-ear guard hairs
    ctx.strokeStyle = 'rgba(60, 36, 24, 0.28)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(106, 235);
    ctx.quadraticCurveTo(96, 130, 128, 42);
    ctx.moveTo(150, 235);
    ctx.quadraticCurveTo(160, 130, 128, 42);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(225, 200, 165, 0.35)';
    ctx.lineWidth = 1.6;
    for (let i = 0; i < 65; i++) {
      const y = 30 + (i / 65) * 195;
      ctx.beginPath();
      ctx.moveTo(24, y);
      ctx.lineTo(74 + (i % 5) * 6, y - 6);
      ctx.moveTo(232, y);
      ctx.lineTo(182 - (i % 5) * 6, y - 6);
      ctx.stroke();
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.encoding = THREE.sRGBEncoding;

    return new THREE.MeshStandardMaterial({
      map: tex,
      roughness: 0.92,
      metalness: 0.0,
      envMapIntensity: 0.18,
    });
  }

  function createSoftDustSpriteTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
    g.addColorStop(0, 'rgba(255, 240, 208, 0.95)');
    g.addColorStop(0.4, 'rgba(255, 228, 182, 0.45)');
    g.addColorStop(1, 'rgba(255, 220, 165, 0.0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    const tex = new THREE.CanvasTexture(canvas);
    tex.encoding = THREE.sRGBEncoding;
    return tex;
  }

  function createSavannaGroundTexture() {
    const size = 1024;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#976e3e';
    ctx.fillRect(0, 0, size, size);

    const rng = App.Math.createRNG(4219);

    // Broad organic dry-soil & sun-baked ochre patches (tile-wrapped cleanly)
    for (let i = 0; i < 720; i++) {
      const x = rng() * size;
      const y = rng() * size;
      const r = 18 + rng() * 82;
      const tone = rng();
      let col;
      if (tone < 0.36) col = 'rgba(116, 74, 36, 0.18)';
      else if (tone < 0.72) col = 'rgba(164, 126, 68, 0.18)';
      else col = 'rgba(94, 88, 46, 0.14)';
      for (let ox = -1; ox <= 1; ox++) {
        for (let oy = -1; oy <= 1; oy++) {
          ctx.fillStyle = col;
          ctx.beginPath();
          ctx.arc(x + ox * size, y + oy * size, r, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    // Fine organic rounded sand grains & micro-pebbles (NO blocky squares!)
    for (let i = 0; i < 24000; i++) {
      const x = rng() * size;
      const y = rng() * size;
      const rad = 0.6 + rng() * 1.45;
      const bright = rng();
      if (bright < 0.48) ctx.fillStyle = `rgba(68, 44, 22, ${0.14 + rng() * 0.20})`;
      else if (bright < 0.84) ctx.fillStyle = `rgba(190, 154, 94, ${0.12 + rng() * 0.18})`;
      else ctx.fillStyle = `rgba(52, 38, 22, ${0.18 + rng() * 0.20})`;
      ctx.beginPath();
      ctx.arc(x, y, rad, 0, Math.PI * 2);
      ctx.fill();
    }

    // Scattered dried savanna chaff & fine straw stalks
    ctx.lineWidth = 1.0;
    for (let i = 0; i < 3600; i++) {
      const x = rng() * size;
      const y = rng() * size;
      const ang = rng() * Math.PI * 2;
      const len = 3 + rng() * 9;
      ctx.strokeStyle = rng() > 0.35 ? 'rgba(162, 126, 68, 0.26)' : 'rgba(84, 76, 36, 0.24)';
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len);
      ctx.stroke();
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.encoding = THREE.sRGBEncoding;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(42, 42);
    tex.anisotropy = 8;
    return tex;
  }

  function createAcaciaBarkTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#3f3023';
    ctx.fillRect(0, 0, 256, 512);

    const rng = App.Math.createRNG(8812);
    // Deep longitudinal African acacia bark fissures + weathered grey-brown ridges
    for (let i = 0; i < 240; i++) {
      const x = rng() * 256;
      const y = rng() * 512;
      const w = 1.5 + rng() * 5.0;
      const h = 35 + rng() * 140;
      const light = rng();
      if (light < 0.45) ctx.fillStyle = `rgba(22, 16, 11, ${0.32 + rng() * 0.35})`;
      else if (light < 0.85) ctx.fillStyle = `rgba(92, 74, 54, ${0.22 + rng() * 0.24})`;
      else ctx.fillStyle = `rgba(116, 108, 86, ${0.14 + rng() * 0.16})`; // subtle dry savanna lichen
      ctx.fillRect(x, y, w, h);
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.encoding = THREE.sRGBEncoding;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(2, 4);
    return tex;
  }

  function createContactShadowTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    const g = ctx.createRadialGradient(64, 64, 6, 64, 64, 60);
    g.addColorStop(0.0, 'rgba(18, 12, 6, 0.56)');
    g.addColorStop(0.45, 'rgba(24, 16, 8, 0.28)');
    g.addColorStop(1.0, 'rgba(24, 16, 8, 0.0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
    const tex = new THREE.CanvasTexture(canvas);
    tex.encoding = THREE.sRGBEncoding;
    return tex;
  }

  function createAcaciaFoliageTexture() {
    const size = 512;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, size, size);

    const rng = App.Math.createRNG(4123);
    const cx = size * 0.5;
    const cy = size * 0.5;

    // 1. Delicate radiating dark woody acacia twigs from center outward
    ctx.lineCap = 'round';
    const twigAngles = [];
    for (let t = 0; t < 16; t++) {
      const ang = (t / 16) * Math.PI * 2 + (rng() - 0.5) * 0.30;
      const len = size * (0.28 + rng() * 0.16);
      twigAngles.push({ ang, len });
      ctx.strokeStyle = 'rgba(46, 35, 24, 0.92)';
      ctx.lineWidth = 2.6 + rng() * 1.4;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      const midX = cx + Math.cos(ang + (rng() - 0.5) * 0.2) * len * 0.55;
      const midY = cy + Math.sin(ang + (rng() - 0.5) * 0.2) * len * 0.55;
      const endX = cx + Math.cos(ang) * len;
      const endY = cy + Math.sin(ang) * len;
      ctx.quadraticCurveTo(midX, midY, endX, endY);
      ctx.stroke();
    }

    // 2. Hundreds of feathery bipinnate acacia leaf sprays (dappled organic silhouette!)
    const palette = [
      '#394c24',
      '#475d2b',
      '#556b32',
      '#617638',
      '#728340',
      '#4d5f2c',
      '#3f5226',
    ];

    // Dense interior + airy feathery outer halo so sunlight filters through the crown
    for (let i = 0; i < 340; i++) {
      const rNorm = Math.pow(rng(), 0.62);
      const ang = rng() * Math.PI * 2;
      const rad = rNorm * (size * 0.44);
      const px = cx + Math.cos(ang) * rad;
      const py = cy + Math.sin(ang) * rad;

      // Draw a tiny feathery bipinnate frond (5-8 paired micro-leaflets along a stem)
      const frondAng = ang + (rng() - 0.5) * 1.4;
      const frondLen = 18 + rng() * 26 * (1.15 - rNorm * 0.45);
      const pairs = 5 + Math.floor(rng() * 4);
      const baseCol = palette[Math.floor(rng() * palette.length)];

      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(frondAng);

      // Tiny rachis stem
      ctx.strokeStyle = 'rgba(54, 48, 28, 0.72)';
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.moveTo(-frondLen * 0.35, 0);
      ctx.lineTo(frondLen * 0.65, 0);
      ctx.stroke();

      ctx.fillStyle = baseCol;
      for (let p = 0; p < pairs; p++) {
        const t = -0.30 + (p / (pairs - 1)) * 0.92;
        const lx = t * frondLen;
        const leafW = (3.4 + rng() * 2.4) * (1.0 - Math.abs(t - 0.15) * 0.45);
        const leafL = 7.0 + rng() * 5.0;
        // Left & right paired feathery leaflets
        ctx.beginPath();
        ctx.ellipse(lx, -leafL * 0.48, leafW * 0.55, leafL * 0.52, -0.32, 0, Math.PI * 2);
        ctx.ellipse(lx, leafL * 0.48, leafW * 0.55, leafL * 0.52, 0.32, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.encoding = THREE.sRGBEncoding;
    tex.anisotropy = 4;
    return tex;
  }

  function createManeHairTexture() {
    const w = 512;
    const h = 128;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, w, h);

    const rng = App.Math.createRNG(6190);
    // Dense bristly erect giraffe mane strands (u=along neck, v=0 base -> v=1 jagged feathered tips)
    for (let i = 0; i < 620; i++) {
      const x = rng() * w;
      const tipH = 0.58 + rng() * 0.40; // jagged uneven bristly crest!
      const tilt = (rng() - 0.42) * 14;
      const lw = 1.2 + rng() * 2.4;
      const shade = rng();
      const grad = ctx.createLinearGradient(x, h, x + tilt, h * (1.0 - tipH));
      if (shade < 0.22) {
        // Warm golden-chestnut sunlit tuft
        grad.addColorStop(0.0, 'rgba(72, 42, 22, 1.0)');
        grad.addColorStop(0.65, 'rgba(98, 56, 28, 0.96)');
        grad.addColorStop(1.0, 'rgba(138, 86, 44, 0.0)');
      } else {
        // Rich dark umber-espresso mane bristle
        grad.addColorStop(0.0, 'rgba(42, 24, 14, 1.0)');
        grad.addColorStop(0.72, 'rgba(54, 30, 16, 0.96)');
        grad.addColorStop(1.0, 'rgba(76, 44, 24, 0.0)');
      }
      ctx.strokeStyle = grad;
      ctx.lineWidth = lw;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x, h + 4);
      ctx.lineTo(x + tilt, h * (1.0 - tipH));
      ctx.stroke();
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.encoding = THREE.sRGBEncoding;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.repeat.set(3.5, 1.0);
    return tex;
  }

  function createManeMaterial() {
    const maneTex = createManeHairTexture();
    return new THREE.MeshStandardMaterial({
      map: maneTex,
      color: srgbColor(0xe6d4be),
      roughness: 0.90,
      metalness: 0.0,
      alphaTest: 0.28,
      side: THREE.DoubleSide,
      envMapIntensity: 0.22,
    });
  }

  function createKopjeRockTexture() {
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    const rng = App.Math.createRNG(8831);

    ctx.fillStyle = '#73604e';
    ctx.fillRect(0, 0, size, size);

    // Granite mineral mottling & sun-baked dust pockets
    for (let i = 0; i < 1400; i++) {
      const x = rng() * size;
      const y = rng() * size;
      const r = 1.5 + rng() * 12;
      const pick = rng();
      if (pick < 0.35) ctx.fillStyle = 'rgba(54, 42, 34, 0.22)';
      else if (pick < 0.72) ctx.fillStyle = 'rgba(138, 114, 88, 0.20)';
      else if (pick < 0.90) ctx.fillStyle = 'rgba(165, 138, 96, 0.16)';
      else ctx.fillStyle = 'rgba(116, 124, 78, 0.18)'; // warm golden-olive Serengeti granite lichen!
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    // Fine weathered granite bedding cracks & crevices
    for (let i = 0; i < 42; i++) {
      const x0 = rng() * size;
      const y0 = rng() * size;
      ctx.strokeStyle = 'rgba(34, 26, 20, 0.32)';
      ctx.lineWidth = 0.8 + rng() * 1.6;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.quadraticCurveTo(
        x0 + (rng() - 0.5) * 34,
        y0 + (rng() - 0.5) * 26,
        x0 + (rng() - 0.5) * 58,
        y0 + (rng() - 0.5) * 44
      );
      ctx.stroke();
    }

    // Fine quartz/feldspar grit speckles
    for (let i = 0; i < 1600; i++) {
      const x = rng() * size;
      const y = rng() * size;
      ctx.fillStyle = rng() > 0.5 ? 'rgba(210, 192, 162, 0.18)' : 'rgba(28, 22, 16, 0.20)';
      ctx.fillRect(x, y, 1.4, 1.4);
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.encoding = THREE.sRGBEncoding;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(2, 2);
    return tex;
  }

  function createTermiteClayTexture() {
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    const rng = App.Math.createRNG(5419);

    ctx.fillStyle = '#8b6140';
    ctx.fillRect(0, 0, size, size);

    // Vertical rain-eroded clay rivulets & warm terracotta strata
    for (let i = 0; i < 160; i++) {
      const x = rng() * size;
      const w = 1.5 + rng() * 5.0;
      ctx.fillStyle = rng() > 0.45 ? 'rgba(104, 68, 42, 0.26)' : 'rgba(164, 120, 80, 0.22)';
      ctx.fillRect(x, 0, w, size);
    }

    // Sun-baked laterite pores & granular clay crumb texture
    for (let i = 0; i < 1800; i++) {
      const x = rng() * size;
      const y = rng() * size;
      const r = 0.8 + rng() * 2.8;
      ctx.fillStyle = rng() > 0.55 ? 'rgba(62, 38, 22, 0.24)' : 'rgba(182, 138, 92, 0.20)';
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.encoding = THREE.sRGBEncoding;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(2, 2);
    return tex;
  }

  App.Materials = {
    srgbColor,
    createGiraffeCoatMaterial,
    createHoofMaterial,
    createEyeMaterial,
    createHairMaterial,
    createManeMaterial,
    createInnerEarMaterial,
    createSoftDustSpriteTexture,
    createSavannaGroundTexture,
    createAcaciaBarkTexture,
    createAcaciaFoliageTexture,
    createKopjeRockTexture,
    createTermiteClayTexture,
    createContactShadowTexture,
  };
})(window);
