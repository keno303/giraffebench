/* =============================================================================
   textures.js — procedural textures (no external assets, no network)
   Everything is generated on a <canvas> at load time.
   ========================================================================== */
(function () {
  'use strict';
  const NS = (window.GIRAFFE = window.GIRAFFE || {});

  /* ---------- deterministic RNG ---------- */
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  NS.mulberry32 = mulberry32;

  function hash2i(x, y, s) {
    let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 1442695041);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }

  /* ---------- periodic value noise + fbm (tileable) ---------- */
  function makeValueNoise(seed, period) {
    const lat = new Float32Array(period * period);
    for (let y = 0; y < period; y++)
      for (let x = 0; x < period; x++) lat[y * period + x] = hash2i(x, y, seed);
    return function (x, y) {
      const fx = x * period, fy = y * period;
      let ix = Math.floor(fx), iy = Math.floor(fy);
      const tx = fx - ix, ty = fy - iy;
      const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
      let x0 = ix % period; if (x0 < 0) x0 += period;
      let y0 = iy % period; if (y0 < 0) y0 += period;
      const x1 = (x0 + 1) % period, y1 = (y0 + 1) % period;
      const a = lat[y0 * period + x0], b = lat[y0 * period + x1];
      const c = lat[y1 * period + x0], d = lat[y1 * period + x1];
      const top = a + (b - a) * sx, bot = c + (d - c) * sx;
      return top + (bot - top) * sy;
    };
  }
  NS.makeValueNoise = makeValueNoise;

  function makeFbm(seed, basePeriod, octaves) {
    const layers = [];
    let p = basePeriod, amp = 0.5, norm = 0;
    for (let i = 0; i < octaves; i++) {
      layers.push({ n: makeValueNoise(seed + i * 7919, p), amp });
      norm += amp; p *= 2; amp *= 0.5;
    }
    return function (x, y) {
      let v = 0;
      for (let i = 0; i < layers.length; i++) v += layers[i].n(x, y) * layers[i].amp;
      return v / norm;
    };
  }
  NS.makeFbm = makeFbm;

  /* ---------- giraffe coat ----------------------------------------------
     Tileable reticulated pattern: jittered Voronoi cells, cream borders.
     Returns { map, normalMap } as THREE.CanvasTexture.                      */
  NS.coatTexture = function (opt) {
    opt = opt || {};
    const size = opt.size || 768;
    const cells = opt.cells || 8;
    const seed = opt.seed || 11;
    const base = opt.base || [240, 228, 200];            // cream lines
    const spots = opt.spots || [[156, 90, 44], [138, 76, 36], [174, 106, 54]];
    const lineW = opt.lineW == null ? 0.05 : opt.lineW;   // in cell units
    const contrast = opt.contrast == null ? 1 : opt.contrast;
    const rnd = mulberry32(seed);

    const seeds = [];
    for (let j = 0; j < cells; j++) {
      for (let i = 0; i < cells; i++) {
        seeds.push({
          x: (i + 0.5 + (rnd() - 0.5) * 0.72) / cells,
          y: (j + 0.5 + (rnd() - 0.5) * 0.72) / cells,
          c: spots[(rnd() * spots.length) | 0],
          k: rnd()
        });
      }
    }
    const N = seeds.length;

    const colCv = document.createElement('canvas');
    colCv.width = colCv.height = size;
    const cctx = colCv.getContext('2d');
    const img = cctx.createImageData(size, size);
    const data = img.data;

    const height = new Float32Array(size * size);
    const mottle = makeFbm(seed * 31 + 5, 4, 4);
    const grain = mulberry32(seed * 13 + 1);

    for (let y = 0; y < size; y++) {
      const fy = (y + 0.5) / size;
      for (let x = 0; x < size; x++) {
        const fx = (x + 0.5) / size;
        let d1 = 1e9, d2 = 1e9, idx = 0;
        for (let i = 0; i < N; i++) {
          let dx = fx - seeds[i].x; if (dx > 0.5) dx -= 1; else if (dx < -0.5) dx += 1;
          let dy = fy - seeds[i].y; if (dy > 0.5) dy -= 1; else if (dy < -0.5) dy += 1;
          const d = dx * dx + dy * dy;
          if (d < d1) { d2 = d1; d1 = d; idx = i; }
          else if (d < d2) { d2 = d; }
        }
        const t = (Math.sqrt(d2) - Math.sqrt(d1)) * 0.5 * cells;  // cell units from border
        let r, g, b;
        if (t < lineW) {
          // cream line, slightly warm and shaded
          const m = 0.94 + 0.09 * mottle(fx * 2, fy * 2);
          r = base[0] * m; g = base[1] * m; b = base[2] * m;
          height[y * size + x] = 0.0;
        } else {
          const s = seeds[idx];
          const edge = Math.min(1, (t - lineW) / 0.10);
          const k = (0.90 + 0.22 * s.k) * (0.86 + 0.14 * edge);
          const m = 0.93 + 0.14 * mottle(fx * 1.5 + 3.1, fy * 1.5 + 7.7);
          r = s.c[0] * k * m; g = s.c[1] * k * m; b = s.c[2] * k * m;
          height[y * size + x] = 0.55 + 0.45 * edge;
        }
        // fine grain + subtle large scale shading
        const n = (grain() - 0.5) * 10 * contrast;
        const j = (y * size + x) * 4;
        data[j] = Math.max(0, Math.min(255, r + n));
        data[j + 1] = Math.max(0, Math.min(255, g + n));
        data[j + 2] = Math.max(0, Math.min(255, b + n));
        data[j + 3] = 255;
      }
    }
    cctx.putImageData(img, 0, 0);

    /* normal map from the height field (cream lines recessed) */
    const nrmCv = document.createElement('canvas');
    nrmCv.width = nrmCv.height = size;
    const nctx = nrmCv.getContext('2d');
    const nimg = nctx.createImageData(size, size);
    const nd = nimg.data;
    const strength = 2.4;
    for (let y = 0; y < size; y++) {
      const ym = ((y - 1) + size) % size, yp = (y + 1) % size;
      for (let x = 0; x < size; x++) {
        const xm = ((x - 1) + size) % size, xp = (x + 1) % size;
        const dx = (height[y * size + xp] - height[y * size + xm]) * strength;
        const dy = (height[yp * size + x] - height[ym * size + x]) * strength;
        // normal = normalize(-dx, -dy, 1)
        let nx = -dx, ny = -dy, nz = 1;
        const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
        const j = (y * size + x) * 4;
        nd[j] = (nx * 0.5 + 0.5) * 255;
        nd[j + 1] = (ny * 0.5 + 0.5) * 255;
        nd[j + 2] = (nz * 0.5 + 0.5) * 255;
        nd[j + 3] = 255;
      }
    }
    nctx.putImageData(nimg, 0, 0);

    const map = new THREE.CanvasTexture(colCv);
    map.colorSpace = THREE.SRGBColorSpace;
    map.wrapS = map.wrapT = THREE.RepeatWrapping;
    map.anisotropy = 8;
    const normalMap = new THREE.CanvasTexture(nrmCv);
    normalMap.wrapS = normalMap.wrapT = THREE.RepeatWrapping;
    normalMap.anisotropy = 8;
    return { map: map, normalMap: normalMap };
  };

  /* ---------- savanna ground ------------------------------------------- */
  NS.groundTexture = function (opt) {
    opt = opt || {};
    const size = opt.size || 512;
    const seed = opt.seed || 5;
    const cv = document.createElement('canvas');
    cv.width = cv.height = size;
    const ctx = cv.getContext('2d');
    const img = ctx.createImageData(size, size);
    const d = img.data;
    const f1 = makeFbm(seed, 5, 5);
    const f2 = makeFbm(seed + 91, 11, 4);
    const f3 = makeFbm(seed + 311, 2, 3);
    const rnd = mulberry32(seed * 17 + 3);

    const dry = [176, 158, 100];   // dry grass
    const green = [104, 116, 58];  // olive
    const soil = [96, 78, 50];     // bare earth

    for (let y = 0; y < size; y++) {
      const fy = y / size;
      for (let x = 0; x < size; x++) {
        const fx = x / size;
        const a = f1(fx, fy);
        const b = f2(fx, fy);
        const c = f3(fx, fy);
        // blend dry <-> green
        let t = Math.min(1, Math.max(0, (a - 0.32) * 2.4));
        let r = green[0] + (dry[0] - green[0]) * t;
        let g = green[1] + (dry[1] - green[1]) * t;
        let bl = green[2] + (dry[2] - green[2]) * t;
        // patches of bare soil
        const s = Math.min(1, Math.max(0, (b - 0.58) * 5.0));
        r = r + (soil[0] - r) * s * 0.85;
        g = g + (soil[1] - g) * s * 0.85;
        bl = bl + (soil[2] - bl) * s * 0.85;
        // fine mottling / blade speckle
        const sp = (c - 0.5) * 46 + (rnd() - 0.5) * 26;
        const shade = 0.9 + 0.2 * a;
        const j = (y * size + x) * 4;
        d[j] = Math.max(0, Math.min(255, r * shade + sp));
        d[j + 1] = Math.max(0, Math.min(255, g * shade + sp));
        d[j + 2] = Math.max(0, Math.min(255, bl * shade + sp * 0.8));
        d[j + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);

    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.anisotropy = 8;
    return tex;
  };

  /* ---------- soft round sprite (dust, glow) --------------------------- */
  NS.softCircle = function (size, inner, outer, pow) {
    const cv = document.createElement('canvas');
    cv.width = cv.height = size;
    const ctx = cv.getContext('2d');
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, inner);
    g.addColorStop(Math.min(0.9, pow || 0.35), outer);
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };

  /* ---------- radial alpha for grass blades ---------------------------- */
  NS.bladeTexture = function () {
    const w = 16, h = 64;
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const ctx = cv.getContext('2d');
    ctx.clearRect(0, 0, w, h);
    const g = ctx.createLinearGradient(0, h, 0, 0);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.55, 'rgba(255,255,255,0.95)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(w * 0.5 - 2.5, h);
    ctx.quadraticCurveTo(w * 0.5 - 3.5, h * 0.35, w * 0.5, 0);
    ctx.quadraticCurveTo(w * 0.5 + 3.5, h * 0.35, w * 0.5 + 2.5, h);
    ctx.closePath();
    ctx.fill();
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };

  /* ---------- helpers --------------------------------------------------- */
  NS.canvasTexture = function (cv, srgb) {
    const t = new THREE.CanvasTexture(cv);
    if (srgb !== false) t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
    return t;
  };
})();