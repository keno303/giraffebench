/* Procedural textures for the giraffe scene.
   Everything is generated on <canvas> so the page works from file:// with no assets. */
(function () {
  'use strict';

  // ---------- deterministic RNG ----------
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // cheap smooth value noise, tileable-ish on a 256 lattice
  function makeNoise2D(seed) {
    var rnd = mulberry32(seed);
    var N = 256, grid = new Float32Array(N * N);
    for (var i = 0; i < N * N; i++) grid[i] = rnd();
    function at(x, y) {
      x = ((x % N) + N) % N; y = ((y % N) + N) % N;
      return grid[(y | 0) * N + (x | 0)];
    }
    return function (x, y) {
      var xi = Math.floor(x), yi = Math.floor(y);
      var xf = x - xi, yf = y - yi;
      var u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
      var a = at(xi, yi), b = at(xi + 1, yi), c = at(xi, yi + 1), d = at(xi + 1, yi + 1);
      return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
    };
  }

  function lerp(a, b, t) { return a + (b - a) * t; }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  function makeCanvas(size) {
    var c = document.createElement('canvas');
    c.width = size; c.height = size;
    return c;
  }

  // ---------- giraffe coat ----------
  // Tileable Voronoi cells with cream gutters: reads as a giraffe coat.
  function makeCoatTexture(size, seedCount, seed, opt) {
    opt = opt || {};
    var base = opt.base || [234, 210, 168];
    var darkA = opt.darkA || [143, 79, 44];
    var darkB = opt.darkB || [176, 108, 63];
    var gutter = opt.gutter || [243, 226, 193];
    var gutterW = opt.gutterW || 5.5;
    var contrast = opt.contrast == null ? 1 : opt.contrast;
    var warp = opt.warp == null ? 0.14 : opt.warp;
    var seedMul = opt.seedMul || 1;

    var rnd = mulberry32(seed);
    var noise = makeNoise2D(seed + 91);
    var seeds = [];
    for (var i = 0; i < seedCount; i++) {
      var t = rnd();
      var cr = lerp(darkA[0], darkB[0], t);
      var cg = lerp(darkA[1], darkB[1], t);
      var cb = lerp(darkA[2], darkB[2], t);
      // occasional lighter, sun-bleached patch
      if (rnd() < 0.14) { cr = lerp(cr, 205, 0.35); cg = lerp(cg, 150, 0.35); cb = lerp(cb, 100, 0.35); }
      seeds.push({ x: rnd() * size * seedMul, y: rnd() * size * seedMul, r: cr, g: cg, b: cb });
    }

    var c = makeCanvas(size);
    var ctx = c.getContext('2d');
    var img = ctx.createImageData(size, size);
    var data = img.data;
    var inv = 1 / size;
    var half = size / 2;
    var ns = size / 64;

    for (var y = 0; y < size; y++) {
      for (var x = 0; x < size; x++) {
        var d1 = 1e12, d2 = 1e12, idx = 0;
        for (var s = 0; s < seeds.length; s++) {
          var sd = seeds[s];
          var dx = x - sd.x, dy = y - sd.y;
          if (dx > half) dx -= size; else if (dx < -half) dx += size;
          if (dy > half) dy -= size; else if (dy < -half) dy += size;
          // warp the metric so cells are irregular polygons
          var w = 1 + warp * (noise((x + sd.y) * 0.012, (y + sd.x) * 0.012) - 0.5) * 2;
          var d = Math.sqrt(dx * dx + dy * dy) * w;
          if (d < d1) { d2 = d1; d1 = d; idx = s; }
          else if (d < d2) { d2 = d; }
        }
        var sd2 = seeds[idx];
        var edge = d2 - d1;
        var n = noise(x * 0.08, y * 0.08) * 0.5 + noise(x * 0.31 + 17, y * 0.31) * 0.5;
        var r, g, b;
        if (edge < gutterW * (0.8 + n * 0.5)) {
          var gt = 0.75 + n * 0.25;
          r = lerp(gutter[0], base[0], gt); g = lerp(gutter[1], base[1], gt); b = lerp(gutter[2], base[2], gt);
        } else {
          var shade = 0.9 + n * 0.2;
          r = sd2.r * shade; g = sd2.g * shade; b = sd2.b * shade;
          // soft darker centre so patches are not flat
          var cd = Math.min(1, d1 / 60);
          r = lerp(r * 0.93, r, cd); g = lerp(g * 0.93, g, cd); b = lerp(b * 0.93, b, cd);
        }
        // contrast toward the palette
        r = lerp(base[0], r, contrast); g = lerp(base[1], g, contrast); b = lerp(base[2], b, contrast);
        var o = (y * size + x) * 4;
        data[o] = clamp(r, 0, 255); data[o + 1] = clamp(g, 0, 255); data[o + 2] = clamp(b, 0, 255); data[o + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);

    // subtle vertical shading variation / fur streaks
    ctx.globalAlpha = 0.05;
    for (var k = 0; k < 900; k++) {
      var lx = rnd() * size, ly = rnd() * size;
      ctx.strokeStyle = rnd() < 0.5 ? '#000' : '#fff';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(lx, ly);
      ctx.lineTo(lx + (rnd() - 0.5) * 3, ly + 6 + rnd() * 10);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    var tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.anisotropy = 8;
    tex.encoding = THREE.sRGBEncoding;
    return tex;
  }

  // Plain cream hide with faint mottling, for lower legs / muzzle / inner ears.
  function makeHideTexture(size, seed) {
    var rnd = mulberry32(seed || 7);
    var noise = makeNoise2D((seed || 7) + 3);
    var c = makeCanvas(size);
    var ctx = c.getContext('2d');
    var img = ctx.createImageData(size, size);
    var d = img.data;
    for (var y = 0; y < size; y++) {
      for (var x = 0; x < size; x++) {
        var n = noise(x * 0.06, y * 0.06) * 0.6 + noise(x * 0.2 + 11, y * 0.2) * 0.4;
        var v = 0.92 + n * 0.13;
        var o = (y * size + x) * 4;
        d[o] = clamp(235 * v, 0, 255);
        d[o + 1] = clamp(216 * v, 0, 255);
        d[o + 2] = clamp(181 * v, 0, 255);
        d[o + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    var tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.anisotropy = 8;
    tex.encoding = THREE.sRGBEncoding;
    return tex;
  }

  // Spotted upper / plain lower leg hide. Canvas top (v=1) is the knee side.
  function makeLowerLegTexture(size, seed) {
    var w = size, h = size * 2;
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    var ctx = c.getContext('2d');
    var rnd = mulberry32(seed || 13);
    var noise = makeNoise2D((seed || 13) + 4);

    var img = ctx.createImageData(w, h), d = img.data;
    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        var n = noise(x * 0.09, y * 0.09) * 0.6 + noise(x * 0.3 + 9, y * 0.3) * 0.4;
        var v = 0.93 + n * 0.1;
        var o = (y * w + x) * 4;
        d[o] = clamp(233 * v, 0, 255);
        d[o + 1] = clamp(214 * v, 0, 255);
        d[o + 2] = clamp(179 * v, 0, 255);
        d[o + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);

    // irregular chestnut patches across the upper part
    for (var i = 0; i < 30; i++) {
      var cx = rnd() * w, cy = rnd() * h * 0.42;
      var rx = 9 + rnd() * 18, ry = 13 + rnd() * 26;
      var cr = 138 + rnd() * 32, cg = 72 + rnd() * 26, cb = 38 + rnd() * 18;
      ctx.fillStyle = 'rgb(' + (cr | 0) + ',' + (cg | 0) + ',' + (cb | 0) + ')';
      ctx.beginPath();
      var n = 7 + ((rnd() * 3) | 0);
      for (var k = 0; k < n; k++) {
        var a = (k / n) * Math.PI * 2;
        var rr = 0.78 + rnd() * 0.42;
        var px = cx + Math.cos(a) * rx * rr, py = cy + Math.sin(a) * ry * rr;
        if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
    }

    // fade the spots into plain cream toward the fetlock (canvas bottom)
    var g = ctx.createLinearGradient(0, h * 0.30, 0, h * 0.58);
    g.addColorStop(0, 'rgba(233,214,179,0)');
    g.addColorStop(1, 'rgba(233,214,179,1)');
    ctx.fillStyle = g;
    ctx.fillRect(0, h * 0.30, w, h * 0.30);

    var tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.anisotropy = 8;
    tex.encoding = THREE.sRGBEncoding;
    return tex;
  }

  // ---------- savanna ground ----------
  function makeGroundTexture(size, seed) {
    var rnd = mulberry32(seed || 21);
    var c = makeCanvas(size);
    var ctx = c.getContext('2d');
    ctx.fillStyle = '#a08d58';
    ctx.fillRect(0, 0, size, size);

    // large soft colour patches (tileable via 9-wrap drawing)
    var cols = ['#8b7c47', '#b39b63', '#6f7842', '#c0a973', '#7d6a3e', '#98854f'];
    for (var i = 0; i < 120; i++) {
      var x = rnd() * size, y = rnd() * size, r = 20 + rnd() * 90;
      var col = cols[(rnd() * cols.length) | 0];
      ctx.globalAlpha = 0.16 + rnd() * 0.2;
      for (var ox = -1; ox <= 1; ox++) for (var oy = -1; oy <= 1; oy++) {
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.ellipse(x + ox * size, y + oy * size, r, r * (0.5 + rnd() * 0.6), rnd() * 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;

    // dry grass strokes
    for (var s = 0; s < 5200; s++) {
      var sx = rnd() * size, sy = rnd() * size;
      var len = 3 + rnd() * 11;
      var ang = -Math.PI / 2 + (rnd() - 0.5) * 1.5;
      var hue = rnd();
      var col2 = hue < 0.45 ? '#8b8a4c' : (hue < 0.8 ? '#c2ad72' : '#6f7440');
      ctx.strokeStyle = col2;
      ctx.globalAlpha = 0.22 + rnd() * 0.5;
      ctx.lineWidth = 0.7 + rnd() * 1.1;
      for (var ox2 = -1; ox2 <= 1; ox2++) for (var oy2 = -1; oy2 <= 1; oy2++) {
        ctx.beginPath();
        ctx.moveTo(sx + ox2 * size, sy + oy2 * size);
        ctx.lineTo(sx + ox2 * size + Math.cos(ang) * len, sy + oy2 * size + Math.sin(ang) * len);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;

    // fine grain
    var img = ctx.getImageData(0, 0, size, size), d = img.data;
    for (var p = 0; p < d.length; p += 4) {
      var n = (rnd() - 0.5) * 18;
      d[p] = clamp(d[p] + n, 0, 255); d[p + 1] = clamp(d[p + 1] + n, 0, 255); d[p + 2] = clamp(d[p + 2] + n, 0, 255);
    }
    ctx.putImageData(img, 0, 0);

    var tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.anisotropy = 8;
    tex.encoding = THREE.sRGBEncoding;
    return tex;
  }

  // ---------- grass tuft (alpha cutout) ----------
  function makeGrassTexture(size) {
    var c = makeCanvas(size);
    var ctx = c.getContext('2d');
    var rnd = mulberry32(4242);
    ctx.clearRect(0, 0, size, size);
    for (var i = 0; i < 26; i++) {
      var bx = size * 0.5 + (rnd() - 0.5) * size * 0.42;
      var h = size * (0.35 + rnd() * 0.6);
      var lean = (rnd() - 0.5) * size * 0.35;
      var w = size * (0.008 + rnd() * 0.02);
      var g = ctx.createLinearGradient(0, size, 0, size - h);
      var dry = rnd();
      g.addColorStop(0, dry < 0.4 ? '#4e5a2c' : '#6f6c33');
      g.addColorStop(0.65, dry < 0.4 ? '#7d8a45' : '#a8995a');
      g.addColorStop(1, dry < 0.4 ? '#9aa55e' : '#d3be7f');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(bx - w, size);
      ctx.quadraticCurveTo(bx + lean * 0.3, size - h * 0.55, bx + lean, size - h);
      ctx.quadraticCurveTo(bx + lean * 0.3 + w * 0.6, size - h * 0.5, bx + w, size);
      ctx.closePath();
      ctx.fill();
    }
    var tex = new THREE.CanvasTexture(c);
    tex.anisotropy = 8;
    tex.encoding = THREE.sRGBEncoding;
    return tex;
  }

  // ---------- acacia bark ----------
  function makeBarkTexture(size) {
    var rnd = mulberry32(99);
    var c = makeCanvas(size);
    var ctx = c.getContext('2d');
    ctx.fillStyle = '#5b4a38';
    ctx.fillRect(0, 0, size, size);
    for (var i = 0; i < 260; i++) {
      ctx.strokeStyle = rnd() < 0.5 ? '#493a2c' : '#6d5943';
      ctx.globalAlpha = 0.3 + rnd() * 0.4;
      ctx.lineWidth = 0.7 + rnd() * 2.4;
      var x = rnd() * size;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.bezierCurveTo(x + (rnd() - 0.5) * 8, size * 0.33, x + (rnd() - 0.5) * 8, size * 0.66, x + (rnd() - 0.5) * 4, size);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    var tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.encoding = THREE.sRGBEncoding;
    return tex;
  }

  // ---------- soft round sprite (dust / sun glow) ----------
  function makeSoftCircle(size, inner, outer) {
    var c = makeCanvas(size);
    var ctx = c.getContext('2d');
    var g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, inner);
    g.addColorStop(0.45, inner);
    g.addColorStop(1, outer);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    var tex = new THREE.CanvasTexture(c);
    tex.encoding = THREE.sRGBEncoding;
    return tex;
  }

  window.GiraffeTextures = {
    makeCoatTexture: makeCoatTexture,
    makeHideTexture: makeHideTexture,
    makeLowerLegTexture: makeLowerLegTexture,
    makeGroundTexture: makeGroundTexture,
    makeGrassTexture: makeGrassTexture,
    makeBarkTexture: makeBarkTexture,
    makeSoftCircle: makeSoftCircle,
    mulberry32: mulberry32
  };
})();