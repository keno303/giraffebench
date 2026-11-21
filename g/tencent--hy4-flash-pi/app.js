/* Walking giraffe — procedural Three.js scene, no external assets. */
(function () {
  'use strict';

  var errorBox = document.getElementById('error');
  function fail(err) {
    errorBox.style.display = 'flex';
    errorBox.textContent = 'Could not start the scene:\n\n' + (err && err.stack ? err.stack : err);
    var l = document.getElementById('loading');
    if (l) l.classList.add('hidden');
    console.error(err);
  }

  if (!window.THREE) { fail(new Error('Three.js did not load. Keep vendor/three.min.js next to index.html.')); return; }

  try { init(); } catch (e) { fail(e); }

  function init() {
    var T = THREE;
    var PI2 = Math.PI * 2;
    var clamp = T.MathUtils.clamp;

    function rng(seed) {
      var s = seed >>> 0;
      return function () { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
    }
    function lerp(a, b, t) { return a + (b - a) * t; }
    function smooth(t) { return t * t * (3 - 2 * t); }

    /* ------------------------------------------------------------------ *
     * Procedural textures
     * ------------------------------------------------------------------ */

    // Reticulated giraffe coat: irregular dark patches on a cream ground.
    function makeFurTexture(seed, opts) {
      var rnd = rng(seed);
      var size = 512;
      var cv = document.createElement('canvas');
      cv.width = cv.height = size;
      var c = cv.getContext('2d');

      c.fillStyle = opts.base;
      c.fillRect(0, 0, size, size);

      // uneven cream ground
      for (var i = 0; i < 520; i++) {
        var rr = rnd() * 34 + 6;
        c.fillStyle = rnd() > 0.5 ? 'rgba(255,240,205,0.055)' : 'rgba(120,80,42,0.035)';
        c.beginPath();
        c.arc(rnd() * size, rnd() * size, rr, 0, PI2);
        c.fill();
      }

      var nx = opts.cols, ny = opts.rows;
      var cw = size / nx, ch = size / ny;

      function patch(cx, cy, radius, color, squash) {
        var n = 7 + Math.floor(rnd() * 4);
        var pts = [];
        for (var k = 0; k < n; k++) {
          var a = (k / n) * PI2 + (rnd() - 0.5) * 0.34;
          var r = radius * (0.76 + rnd() * 0.48);
          pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r * (squash || 1)]);
        }
        c.fillStyle = color;
        c.beginPath();
        c.moveTo(pts[0][0], pts[0][1]);
        for (var k2 = 1; k2 < n; k2++) c.lineTo(pts[k2][0], pts[k2][1]);
        c.closePath();
        c.fill();
      }

      for (var y = 0; y < ny; y++) {
        for (var x = 0; x < nx; x++) {
          var jx = (rnd() - 0.5) * 0.66;
          var jy = (rnd() - 0.5) * 0.66;
          var cx = (x + 0.5 + jx) * cw;
          var cy = (y + 0.5 + jy) * ch;
          var rad = Math.min(cw, ch) * (0.46 + rnd() * 0.15);
          var col = opts.colors[Math.floor(rnd() * opts.colors.length)];
          for (var ox = -1; ox <= 1; ox++) {
            for (var oy = -1; oy <= 1; oy++) {
              patch(cx + ox * size, cy + oy * size, rad, col, 0.9 + rnd() * 0.2);
            }
          }
          // little satellite blotches break up the grid
          if (rnd() > 0.78) {
            var sx = cx + (rnd() - 0.5) * cw * 1.15;
            var sy = cy + (rnd() - 0.5) * ch * 1.15;
            for (var ox2 = -1; ox2 <= 1; ox2++) {
              for (var oy2 = -1; oy2 <= 1; oy2++) {
                patch(sx + ox2 * size, sy + oy2 * size, rad * (0.16 + rnd() * 0.19), col, 1);
              }
            }
          }
        }
      }

      // fine hair-like speckle
      for (var s = 0; s < 6500; s++) {
        c.fillStyle = rnd() > 0.45 ? 'rgba(70,45,22,0.075)' : 'rgba(255,246,220,0.10)';
        var px = rnd() * size, py = rnd() * size;
        c.fillRect(px, py, rnd() > 0.85 ? 2 : 1, 1);
      }

      var tex = new T.CanvasTexture(cv);
      tex.wrapS = tex.wrapT = T.RepeatWrapping;
      tex.encoding = T.sRGBEncoding;
      tex.anisotropy = 8;
      return tex;
    }

    function makeGroundTexture() {
      var rnd = rng(9137);
      var size = 512;
      var cv = document.createElement('canvas');
      cv.width = cv.height = size;
      var c = cv.getContext('2d');
      c.fillStyle = '#b29b76';
      c.fillRect(0, 0, size, size);
      var i, x, y, r;
      for (i = 0; i < 2600; i++) {
        x = rnd() * size; y = rnd() * size; r = 1 + rnd() * 9;
        var cols = ['rgba(211,188,138,0.16)', 'rgba(122,103,68,0.13)', 'rgba(158,150,93,0.15)', 'rgba(232,210,166,0.10)'];
        c.fillStyle = cols[Math.floor(rnd() * cols.length)];
        c.beginPath(); c.arc(x, y, r, 0, PI2); c.fill();
      }
      // dry grass flecks
      for (i = 0; i < 3400; i++) {
        x = rnd() * size; y = rnd() * size;
        c.strokeStyle = rnd() > 0.5 ? 'rgba(123,124,68,0.24)' : 'rgba(224,203,153,0.28)';
        c.lineWidth = rnd() > 0.8 ? 1.4 : 0.8;
        c.beginPath(); c.moveTo(x, y); c.lineTo(x + (rnd() - 0.5) * 5, y - 2 - rnd() * 6); c.stroke();
      }
      // fine grain
      var img = c.getImageData(0, 0, size, size), d = img.data;
      for (i = 0; i < d.length; i += 4) {
        var n = (rnd() - 0.5) * 19;
        d[i] = clamp(d[i] + n, 0, 255);
        d[i + 1] = clamp(d[i + 1] + n, 0, 255);
        d[i + 2] = clamp(d[i + 2] + n, 0, 255);
      }
      c.putImageData(img, 0, 0);
      var tex = new T.CanvasTexture(cv);
      tex.wrapS = tex.wrapT = T.RepeatWrapping;
      tex.encoding = T.sRGBEncoding;
      tex.anisotropy = 8;
      return tex;
    }

    function makeGlowTexture() {
      var cv = document.createElement('canvas');
      cv.width = cv.height = 128;
      var c = cv.getContext('2d');
      var g = c.createRadialGradient(64, 64, 2, 64, 64, 63);
      g.addColorStop(0, 'rgba(255,246,214,1)');
      g.addColorStop(0.16, 'rgba(255,229,166,0.85)');
      g.addColorStop(0.5, 'rgba(255,208,135,0.22)');
      g.addColorStop(1, 'rgba(255,200,120,0)');
      c.fillStyle = g; c.fillRect(0, 0, 128, 128);
      var t = new T.CanvasTexture(cv);
      t.encoding = T.sRGBEncoding;
      return t;
    }

    function makeShadowTexture() {
      var cv = document.createElement('canvas');
      cv.width = cv.height = 64;
      var c = cv.getContext('2d');
      var g = c.createRadialGradient(32, 32, 0, 32, 32, 31);
      g.addColorStop(0, 'rgba(38,26,12,0.72)');
      g.addColorStop(0.45, 'rgba(38,26,12,0.36)');
      g.addColorStop(1, 'rgba(38,26,12,0)');
      c.fillStyle = g; c.fillRect(0, 0, 64, 64);
      return new T.CanvasTexture(cv);
    }

    /* ------------------------------------------------------------------ *
     * Renderer, scene, camera
     * ------------------------------------------------------------------ */

    var canvas = document.getElementById('scene');
    var renderer = new T.WebGLRenderer({ canvas: canvas, antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = T.PCFSoftShadowMap;
    renderer.outputEncoding = T.sRGBEncoding;
    renderer.toneMapping = T.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.96;

    var scene = new T.Scene();
    scene.fog = new T.Fog(0xd8c6a4, 34, 145);

    var camera = new T.PerspectiveCamera(37, window.innerWidth / window.innerHeight, 0.1, 500);
    var camTarget = new T.Vector3(0.22, 3.22, 0);
    var camYaw = 0.72, camPitch = 0.10, camDist = 13.6;
    var userYaw = camYaw;

    function updateCamera() {
      var yaw = userYaw + 0.022 * Math.sin(performance.now() * 0.00021);
      camera.position.set(
        camTarget.x + camDist * Math.cos(camPitch) * Math.sin(yaw),
        camTarget.y + camDist * Math.sin(camPitch),
        camTarget.z + camDist * Math.cos(camPitch) * Math.cos(yaw)
      );
      camera.lookAt(camTarget);
    }
    updateCamera();

    // sky dome with vertical colour gradient
    (function sky() {
      var geo = new T.SphereGeometry(240, 40, 24);
      var cols = [], pos = geo.attributes.position;
      var horizon = new T.Color(0xf2ddb4), mid = new T.Color(0xa6c9de), zenith = new T.Color(0x4d86b8);
      var tmp = new T.Color();
      for (var i = 0; i < pos.count; i++) {
        var h = clamp(pos.getY(i) / 240, -1, 1);
        if (h < 0.12) tmp.copy(horizon).lerp(mid, smooth(clamp((h + 0.12) / 0.24, 0, 1)));
        else tmp.copy(mid).lerp(zenith, smooth(clamp((h - 0.12) / 0.88, 0, 1)));
        cols.push(tmp.r, tmp.g, tmp.b);
      }
      geo.setAttribute('color', new T.Float32BufferAttribute(cols, 3));
      var m = new T.Mesh(geo, new T.MeshBasicMaterial({ vertexColors: true, side: T.BackSide, depthWrite: false, fog: false, toneMapped:false }));
      m.renderOrder = -10;
      scene.add(m);

      var sun = new T.Sprite(new T.SpriteMaterial({ map: makeGlowTexture(), transparent: true, depthWrite: false, fog: false, blending: T.AdditiveBlending, opacity: 0.85 }));
      sun.position.set(-75, 62, -105);
      sun.scale.set(75, 75, 1);
      scene.add(sun);
    })();

    // lighting
    scene.add(new T.HemisphereLight(0xcfe4f5, 0xa08154, 0.62));
    scene.add(new T.AmbientLight(0xffffff, 0.10));
    var sunLight = new T.DirectionalLight(0xffe9c4, 1.55);
    sunLight.position.set(-6, 21, 7);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.set(2048, 2048);
    sunLight.shadow.camera.left = -9;
    sunLight.shadow.camera.right = 9;
    sunLight.shadow.camera.top = 9;
    sunLight.shadow.camera.bottom = -9;
    sunLight.shadow.camera.near = 1;
    sunLight.shadow.camera.far = 46;
    sunLight.shadow.bias = -0.00015;
    sunLight.shadow.normalBias = 0.022;
    sunLight.shadow.radius = 3;
    sunLight.target.position.set(0, 2.8, 0);
    scene.add(sunLight, sunLight.target);
    var fill = new T.DirectionalLight(0x9fc2d8, 0.24);
    fill.position.set(8, 6, -10);
    scene.add(fill);

    /* ------------------------------------------------------------------ *
     * Ground and savanna props
     * ------------------------------------------------------------------ */

    var groundTex = makeGroundTexture();
    var GROUND_TILE = 6.4;
    groundTex.repeat.set(400 / GROUND_TILE, 400 / GROUND_TILE);
    var ground = new T.Mesh(
      new T.PlaneGeometry(400, 400),
      new T.MeshStandardMaterial({ map: groundTex, roughness: 1, metalness: 0, color: 0xffffff })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    var props = [];
    var grassMesh = null;
    var propRnd = rng(4471);

    // grass tufts, one instanced mesh for the whole field
    (function grass() {
      var v = [], idx = [];
      function blade(cx, cz, lean, h, w) {
        var b = v.length / 3;
        v.push(cx - w, 0, cz, cx + w, 0, cz, cx + lean, h, cz + lean * 0.25);
        idx.push(b, b + 1, b + 2);
      }
      blade(-0.10, 0, -0.12, 0.42, 0.035);
      blade(0.08, 0.03, 0.13, 0.34, 0.032);
      blade(-0.02, -0.07, 0.02, 0.50, 0.030);
      blade(0.13, -0.03, 0.20, 0.27, 0.028);
      blade(-0.17, 0.05, -0.24, 0.25, 0.028);
      var g = new T.BufferGeometry();
      g.setAttribute('position', new T.Float32BufferAttribute(v, 3));
      g.setIndex(idx); g.computeVertexNormals();
      var count = 300;
      var im = new T.InstancedMesh(g, new T.MeshLambertMaterial({ color: 0xffffff, side: T.DoubleSide }), count);
      im.castShadow = false; im.receiveShadow = false;
      var dummy = new T.Object3D(), col = new T.Color();
      for (var i = 0; i < count; i++) {
        var x = (propRnd() - 0.5) * 105;
        var z = (propRnd() - 0.5) * 46;
        if (Math.abs(z) < 1.9) z += z > 0 ? 2.4 : -2.4;
        var s = 0.6 + propRnd() * 1.35;
        dummy.position.set(x, 0, z);
        dummy.rotation.y = propRnd() * PI2;
        dummy.scale.set(s, s * (0.7 + propRnd() * 0.7), s);
        dummy.updateMatrix();
        im.setMatrixAt(i, dummy.matrix);
        col.setHSL(0.16 + propRnd() * 0.07, 0.22 + propRnd() * 0.20, 0.30 + propRnd() * 0.19);
        im.setColorAt(i, col);
        props.push({ mesh: im, index: i, x: x, z: z, rot: dummy.rotation.y, sx: dummy.scale.x, sy: dummy.scale.y, sz: dummy.scale.z, col: col.clone(), type: 'grass' });
      }
      im.instanceMatrix.needsUpdate = true;
      grassMesh = im;
      scene.add(im);
    })();

    // small stones
    (function stones() {
      var geo = new T.DodecahedronGeometry(1, 0);
      var mat = new T.MeshStandardMaterial({ color: 0x8c8068, roughness: 1, flatShading: true });
      for (var i = 0; i < 34; i++) {
        var m = new T.Mesh(geo, mat);
        var x = (propRnd() - 0.5) * 100, z = (propRnd() - 0.5) * 38;
        if (Math.abs(z) < 1.6) z += 2.6;
        var s = 0.08 + propRnd() * 0.22;
        m.position.set(x, s * 0.35, z);
        m.scale.set(s * 1.4, s * 0.55, s);
        m.rotation.y = propRnd() * PI2;
        m.castShadow = true; m.receiveShadow = true;
        scene.add(m);
        props.push({ mesh: m, x: x, z: z, type: 'stone' });
      }
    })();

    // umbrella acacias in the background
    var trunkMat = new T.MeshStandardMaterial({ color: 0x6b5941, roughness: 1, flatShading: true });
    var leafMats = [
      new T.MeshStandardMaterial({ color: 0x5d7044, roughness: 1, flatShading: true }),
      new T.MeshStandardMaterial({ color: 0x6a7b4a, roughness: 1, flatShading: true })
    ];
    function makeAcacia(scale) {
      var g = new T.Group();
      var h = 3.0 + propRnd() * 1.6;
      var trunk = new T.Mesh(new T.CylinderGeometry(0.10, 0.26, h, 7), trunkMat);
      trunk.position.y = h * 0.5;
      trunk.rotation.z = (propRnd() - 0.5) * 0.13;
      trunk.castShadow = true;
      g.add(trunk);
      for (var i = 0; i < 3; i++) {
        var branch = new T.Mesh(new T.CylinderGeometry(0.035, 0.10, 1.5, 5), trunkMat);
        branch.position.set((i - 1) * 0.55, h * 0.86, 0);
        branch.rotation.z = (i - 1) * -0.55;
        g.add(branch);
      }
      for (var j = 0; j < 4; j++) {
        var canopy = new T.Mesh(new T.SphereGeometry(1, 10, 6), leafMats[j % 2]);
        canopy.position.set((j - 1.5) * 0.75, h + 0.18 + propRnd() * 0.22, (propRnd() - 0.5) * 0.8);
        canopy.scale.set(1.2 + propRnd() * 0.5, 0.28 + propRnd() * 0.1, 1.0 + propRnd() * 0.35);
        canopy.castShadow = true;
        g.add(canopy);
      }
      g.scale.setScalar(scale);
      return g;
    }
    for (var t = 0; t < 11; t++) {
      var tree = makeAcacia(0.75 + propRnd() * 0.8);
      var tx = (t / 11 - 0.5) * 92 + (propRnd() - 0.5) * 6;
      var tz = -13 - propRnd() * 17;
      if (t % 4 === 0) tz = 13 + propRnd() * 8;
      tree.position.set(tx, 0, tz);
      scene.add(tree);
      props.push({ mesh: tree, x: tx, z: tz, type: 'tree' });
    }

    // far haze ridges
    (function ridges() {
      var mat = new T.MeshLambertMaterial({ color: 0x9c9279, fog: true });
      var g = new T.SphereGeometry(1, 16, 8);
      for (var i = 0; i < 7; i++) {
        var m = new T.Mesh(g, mat);
        m.position.set((i - 3) * 32 - 8, -7.5, -70 - (i % 2) * 12);
        m.scale.set(21, 8 + (i % 3) * 2, 7);
        scene.add(m);
      }
    })();

    /* ------------------------------------------------------------------ *
     * Materials
     * ------------------------------------------------------------------ */

    var furBody = makeFurTexture(1201, { base: '#e8cca1', cols: 6, rows: 5,
      colors: ['#7d4d25', '#8a5528', '#714522', '#925c2d'] });
    var furNeck = makeFurTexture(1202, { base: '#e9cfa6', cols: 7, rows: 7,
      colors: ['#7d4d25', '#8b5629', '#714522', '#955e2f'] });
    var furLegs = makeFurTexture(1203, { base: '#e5c99f', cols: 6, rows: 6,
      colors: ['#7b4b24', '#875328', '#704522'] });

    function repeatTex(tex, u, v) {
      var t = tex.clone(); t.needsUpdate = true; t.repeat.set(u, v); return t;
    }
    function furMat(tex, u, v, extra) {
      var map = repeatTex(tex, u, v);
      var o = {
        map: map, bumpMap: map, bumpScale: 0.018,
        roughness: 0.94, metalness: 0, color: 0xffffff
      };
      if (extra) for (var k in extra) o[k] = extra[k];
      return new T.MeshStandardMaterial(o);
    }

    var matTorso = furMat(furBody, 2.6, 1.15);
    var matShoulder = furMat(furBody, 1.2, 1.0);
    var matNeck = furMat(furNeck, 2.1, 2.0);
    var matLegUpper = furMat(furLegs, 1.25, 0.95);
    var matLegLower = furMat(furLegs, 0.9, 1.25, { color: 0xe8dcc6 });
    var matTail = furMat(furNeck, 0.9, 1.6);

    var matMuzzle = new T.MeshStandardMaterial({ color: 0xa9865f, roughness: 0.98 });
    var matMuzzleDark = new T.MeshStandardMaterial({ color: 0x805c3c, roughness: 1 });
    var matDark = new T.MeshStandardMaterial({ color: 0x3d2c1e, roughness: 0.92 });
    var matHoof = new T.MeshStandardMaterial({ color: 0x17110c, roughness: 1 });
    var matMane = new T.MeshStandardMaterial({ color: 0x5d3e24, roughness: 1 });
    var matTuft = new T.MeshStandardMaterial({ color: 0x302217, roughness: 1 });
    var matEye = new T.MeshStandardMaterial({ color: 0x1c110b, roughness: 0.16, metalness: 0.03 });
    var matIris = new T.MeshStandardMaterial({ color: 0x8a5c2b, roughness: 0.28 });
    var matGlint = new T.MeshBasicMaterial({ color: 0xfff6e2 });
    var matInnerEar = new T.MeshStandardMaterial({ color: 0xb98d6c, roughness: 1 });

    /* ------------------------------------------------------------------ *
     * Geometry helpers
     * ------------------------------------------------------------------ */

    function addMesh(parent, geo, mat, x, y, z) {
      var m = new T.Mesh(geo, mat);
      if (x !== undefined) m.position.set(x, y, z);
      m.castShadow = true; m.receiveShadow = true;
      parent.add(m);
      return m;
    }
    function ellipsoid(parent, mat, rx, ry, rz, x, y, z, seg) {
      var m = addMesh(parent, new T.SphereGeometry(1, seg || 20, (seg || 20) * 0.7 | 0), mat, x, y, z);
      m.scale.set(rx, ry, rz);
      return m;
    }
    function bone(parent, len, rTop, rBottom, mat, segments) {
      var g = new T.CylinderGeometry(rTop, rBottom, len, segments || 14, 1);
      g.translate(0, -len / 2, 0);
      return addMesh(parent, g, mat, 0, 0, 0);
    }

    // Loft an elliptical cross-section along X (body). UV: u around, v along.
    function bodyGeometry(length, rings, radial, profile) {
      var pos = [], uv = [], idx = [], i, j;
      for (i = 0; i <= rings; i++) {
        var t = i / rings;
        var pr = profile(t);
        var x = (t - 0.5) * length;
        for (j = 0; j <= radial; j++) {
          var a = j / radial * PI2;
          pos.push(x, pr.cy + Math.sin(a) * pr.ry, Math.cos(a) * pr.rz);
          uv.push(j / radial, t);
        }
      }
      for (i = 0; i < rings; i++) {
        for (j = 0; j < radial; j++) {
          var a = i * (radial + 1) + j, b = a + radial + 1;
          idx.push(a, b, a + 1, b, b + 1, a + 1);
        }
      }
      var g = new T.BufferGeometry();
      g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
      g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
      g.setIndex(idx); g.computeVertexNormals();
      return g;
    }

    // Varying-radius tube along a curve. UV: u around, v along.
    function tubeGeometry(curve, subdiv, radial, radiusFn, flatten) {
      var frames = curve.computeFrenetFrames(subdiv, false);
      var pos = [], uv = [], idx = [], i, j;
      var p = new T.Vector3(), v = new T.Vector3();
      for (i = 0; i <= subdiv; i++) {
        var t = i / subdiv;
        curve.getPointAt(t, p);
        var N = frames.normals[i], B = frames.binormals[i];
        var r = radiusFn(t);
        for (j = 0; j <= radial; j++) {
          var a = j / radial * PI2;
          v.copy(p)
            .addScaledVector(N, Math.cos(a) * r)
            .addScaledVector(B, Math.sin(a) * r * (flatten || 1));
          pos.push(v.x, v.y, v.z);
          uv.push(j / radial, t);
        }
      }
      for (i = 0; i < subdiv; i++) {
        for (j = 0; j < radial; j++) {
          var a = i * (radial + 1) + j, b = a + radial + 1;
          idx.push(a, a + 1, b, a + 1, b + 1, b);
        }
      }
      var g = new T.BufferGeometry();
      g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
      g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
      g.setIndex(idx); g.computeVertexNormals();
      return g;
    }

    /* ------------------------------------------------------------------ *
     * The giraffe
     * ------------------------------------------------------------------ */

    var root = new T.Group();
    scene.add(root);
    var body = new T.Group();
    body.position.y = 3.08;
    root.add(body);

    // torso: deep chest, sloping back, slight withers hump
    addMesh(body, bodyGeometry(3.90, 46, 40, function (t) {
      var f = Math.pow(Math.max(Math.sin(Math.PI * t), 0), 0.34);
      var withers = 0.12 * Math.exp(-Math.pow((t - 0.76) / 0.17, 2));
      return {
        ry: 0.30 + 0.50 * f * (1 + 0.08 * t),
        rz: 0.26 + 0.34 * f * (1 + 0.03 * t),
        cy: -0.13 + 0.22 * t + withers
      };
    }), matTorso);

    // rounded chest and rump close the open ends of the loft
    var chestCap = ellipsoid(body, matTorso, 0.28, 0.31, 0.27, 1.91, 0.09, 0, 22);
    var rumpCap = ellipsoid(body, matTorso, 0.28, 0.30, 0.26, -1.91, -0.13, 0, 22);
    chestCap.rotation.z = Math.PI / 2;
    rumpCap.rotation.z = Math.PI / 2;
    // subtle belly tuck
    ellipsoid(body, matTorso, 0.95, 0.30, 0.44, -0.15, -0.50, 0, 24);

    // neck: pivot at the chest, gently S-curved
    var neck = new T.Group();
    neck.position.set(1.12, 0.30, 0);
    body.add(neck);
    var neckCurve = new T.CatmullRomCurve3([
      new T.Vector3(0, 0, 0),
      new T.Vector3(0.16, 0.72, 0),
      new T.Vector3(0.53, 1.52, 0),
      new T.Vector3(0.96, 2.18, 0),
      new T.Vector3(1.27, 2.62, 0)
    ]);
    addMesh(neck, tubeGeometry(neckCurve, 64, 30, function (t) {
      return 0.47 - 0.20 * t + 0.035 * Math.sin(Math.PI * t);
    }, 0.88), matNeck);

    // mane along the crest of the neck
    (function mane() {
      var up = new T.Vector3(0, 1, 0);
      var dir = new T.Vector3(), p = new T.Vector3();
      for (var i = 0; i < 22; i++) {
        var t = 0.035 + i / 22 * 0.92;
        neckCurve.getPointAt(t, p);
        var r = 0.47 - 0.20 * t + 0.035 * Math.sin(Math.PI * t);
        var h = 0.085 * (1 - t * 0.45);
        var cone = addMesh(neck, new T.ConeGeometry(h * 0.42, h, 5), matMane,
          p.x - r * 0.72, p.y + r * 0.35, p.z);
        dir.set(-0.72 - t * 0.25, 0.68, 0).normalize();
        cone.quaternion.setFromUnitVectors(up, dir);
      }
    })();

    // head
    var head = new T.Group();
    head.position.set(1.27, 2.62, 0);
    head.rotation.z = -0.10;
    neck.add(head);

    ellipsoid(head, matNeck, 0.46, 0.36, 0.31, 0.10, 0.08, 0, 24);
    ellipsoid(head, matMuzzle, 0.42, 0.19, 0.215, 0.66, -0.15, 0, 22);
    ellipsoid(head, matMuzzleDark, 0.17, 0.15, 0.19, 1.02, -0.13, 0, 18);
    ellipsoid(head, matNeck, 0.29, 0.18, 0.25, 0.06, -0.18, 0, 18); // jaw/cheek
    // mouth line and lower lip
    var lip = ellipsoid(head, matDark, 0.31, 0.025, 0.18, 0.92, -0.295, 0, 16);
    lip.rotation.z = 0.03;
    ellipsoid(head, matMuzzle, 0.16, 0.075, 0.16, 0.96, -0.34, 0, 14);

    // nostrils
    [-1, 1].forEach(function (side) {
      var n = ellipsoid(head, matDark, 0.06, 0.085, 0.035, 1.05, -0.06, side * 0.125, 14);
      n.rotation.z = -0.28;
    });

    // eyes, iris, pupil, glint and lashes
    var eyes = [];
    [-1, 1].forEach(function (side) {
      var eg = new T.Group();
      eg.position.set(0.28, 0.16, side * 0.282);
      head.add(eg);
      ellipsoid(eg, matMuzzleDark, 0.15, 0.16, 0.028, -0.01, 0, -side * 0.03, 16); // eye patch
      ellipsoid(eg, matDark, 0.112, 0.118, 0.052, 0, 0, 0, 18);
      ellipsoid(eg, matIris, 0.080, 0.088, 0.052, 0.012, 0, side * 0.022, 16);
      ellipsoid(eg, matEye, 0.047, 0.064, 0.045, 0.026, 0, side * 0.048, 14);
      ellipsoid(eg, matGlint, 0.017, 0.020, 0.012, 0.040, 0.038, side * 0.067, 10).castShadow = false;
      // upper lashes
      for (var i = 0; i < 5; i++) {
        var a = -0.55 + i * 0.33;
        var lash = addMesh(eg, new T.ConeGeometry(0.010, 0.105, 4), matDark,
          Math.sin(a) * 0.085 + 0.01, Math.cos(a) * 0.09 + 0.035, side * 0.045);
        lash.rotation.z = -a + 0.35;
      }
      // brow ridge
      var brow = ellipsoid(eg, matNeck, 0.15, 0.055, 0.07, 0.0, 0.13, 0, 14);
      brow.rotation.z = 0.12;
      eyes.push(eg);
    });

    // ears with inner pink
    var ears = [];
    [-1, 1].forEach(function (side) {
      var ear = new T.Group();
      ear.position.set(-0.07, 0.34, side * 0.24);
      ear.rotation.set(side * 0.78, 0, -0.42 + side * 0.04);
      head.add(ear);
      var outer = ellipsoid(ear, matNeck, 0.09, 0.31, 0.14, -0.02, 0.21, side * 0.10, 18);
      outer.rotation.z = 0.18;
      var inner = ellipsoid(ear, matInnerEar, 0.05, 0.24, 0.10, 0.035, 0.22, side * 0.15, 16);
      inner.rotation.z = 0.14;
      ears.push(ear);
    });

    // ossicones (skin-covered horns)
    [-1, 1].forEach(function (side) {
      var base = ellipsoid(head, matNeck, 0.09, 0.06, 0.09, -0.03, 0.39, side * 0.12, 14);
      var horn = bone(head, 0.35, 0.072, 0.055, matDark, 10);
      horn.position.set(-0.05, 0.42, side * 0.12);
      horn.rotation.z = 0.12;
      var tuft = ellipsoid(head, matMane, 0.075, 0.10, 0.075, -0.085, 0.76, side * 0.12, 14);
      tuft.rotation.z = 0.12;
    });

    // tail
    var tail = new T.Group();
    tail.position.set(-1.93, 0.10, 0);
    body.add(tail);
    var tailCurve = new T.CatmullRomCurve3([
      new T.Vector3(0, 0, 0),
      new T.Vector3(-0.24, -0.38, 0),
      new T.Vector3(-0.42, -0.85, 0),
      new T.Vector3(-0.46, -1.28, 0)
    ]);
    addMesh(tail, tubeGeometry(tailCurve, 26, 12, function (t) { return 0.085 - 0.045 * t; }, 0.9), matTail);
    var tuft = ellipsoid(tail, matTuft, 0.13, 0.34, 0.13, -0.47, -1.53, 0, 14);
    tuft.rotation.z = -0.12;

    /* ------------------------------------------------------------------ *
     * Legs with two-bone IK
     * ------------------------------------------------------------------ */

    var shadowTex = makeShadowTexture();
    var legs = [];
    function buildLeg(cfg) {
      var hip = new T.Group();
      hip.position.set(cfg.x, cfg.y, cfg.z);
      body.add(hip);

      var upper = bone(hip, cfg.l1, cfg.front ? 0.27 : 0.30, 0.18, matLegUpper, 16);
      // upper-leg muscle
      ellipsoid(hip, matLegUpper, cfg.front ? 0.26 : 0.29, cfg.l1 * 0.40, 0.24, 0, -cfg.l1 * 0.37, 0, 16);

      var knee = new T.Group();
      knee.position.y = -cfg.l1;
      hip.add(knee);
      ellipsoid(knee, matLegUpper, 0.145, 0.16, 0.145, 0, 0, 0, 14);
      var lower = bone(knee, cfg.l2, 0.15, 0.095, matLegLower, 14);
      if (!cfg.front) {
        // the hind hock points backward
        var hock = ellipsoid(knee, matLegLower, 0.15, 0.21, 0.14, -0.07, -cfg.l2 * 0.52, 0, 14);
        hock.rotation.z = -0.2;
      }

      var ankle = new T.Group();
      ankle.position.y = -cfg.l2;
      knee.add(ankle);
      ellipsoid(ankle, matLegLower, 0.105, 0.13, 0.105, 0, -0.02, 0, 12);
      var hoof = addMesh(ankle, new T.CylinderGeometry(0.155, 0.185, 0.22, 10), matHoof, 0.05, -0.15, 0);
      hoof.scale.z = 0.88;
      hoof.rotation.z = -0.05;
      // cleft line between the two toes
      var cleft = addMesh(ankle, new T.BoxGeometry(0.19, 0.02, 0.014), matDark, 0.08, -0.26, 0);
      cleft.castShadow = false;

      var contact = new T.Mesh(
        new T.PlaneGeometry(0.55, 0.44),
        new T.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false, opacity: 0.18, fog: false })
      );
      contact.rotation.x = -Math.PI / 2;
      contact.renderOrder = 2;
      scene.add(contact);

      return {
        hip: hip, knee: knee, ankle: ankle, hoof: hoof,
        front: cfg.front, l1: cfg.l1, l2: cfg.l2,
        x: cfg.x, y: cfg.y, z: cfg.z, phase: cfg.phase,
        bend: cfg.front ? -1 : 1, contact: contact
      };
    }

    legs.push(buildLeg({ front: false, x: -1.30, y: -0.13, z: -0.45, l1: 1.56, l2: 1.46, phase: 0.00 })); // left hind
    legs.push(buildLeg({ front: true,  x:  1.12, y: -0.17, z: -0.45, l1: 1.50, l2: 1.52, phase: 0.25 })); // left front
    legs.push(buildLeg({ front: false, x: -1.30, y: -0.13, z:  0.45, l1: 1.56, l2: 1.46, phase: 0.50 })); // right hind
    legs.push(buildLeg({ front: true,  x:  1.12, y: -0.17, z:  0.45, l1: 1.50, l2: 1.52, phase: 0.75 })); // right front

    /* ------------------------------------------------------------------ *
     * Gait and animation
     * ------------------------------------------------------------------ */

    var BASE_CADENCE = 0.60;      // stride cycles per second
    var BASE_STRIDE = 2.05;       // metres per stride cycle
    var speed = 1.0;              // user multiplier
    var paused = false;
    var time = 0;
    var footWorld = new T.Vector3(), footLocal = new T.Vector3();

    function solveLeg(leg, cycle, activity) {
      var p = ((cycle + leg.phase) % 1 + 1) % 1;
      var stance = 0.64;
      var stride = BASE_STRIDE * 0.5 * activity;
      var fx, lift = 0;
      if (p < stance) {
        var q = p / stance;
        fx = stride * (1 - 2 * q);
      } else {
        var q2 = (p - stance) / (1 - stance);
        fx = stride * (-1 + 2 * smooth(q2));
        lift = 0.30 * Math.sin(Math.PI * q2) * activity;
      }

      footWorld.set(leg.x + fx, 0.34 + lift, leg.z);
      body.worldToLocal(footLocal.copy(footWorld));
      var dx = footLocal.x - leg.x;
      var dyDown = leg.y - footLocal.y;   // positive downwards in body-local space

      var d = Math.sqrt(dx * dx + dyDown * dyDown);
      var maxD = leg.l1 + leg.l2 - 0.004;
      var minD = Math.abs(leg.l1 - leg.l2) + 0.004;
      d = clamp(d, minD, maxD);
      var alpha = Math.atan2(dx, dyDown);
      var cosDelta = (leg.l1 * leg.l1 + d * d - leg.l2 * leg.l2) / (2 * leg.l1 * d);
      var delta = Math.acos(clamp(cosDelta, -1, 1));
      var a1 = alpha + leg.bend * delta;
      var kx = leg.l1 * Math.sin(a1), ky = leg.l1 * Math.cos(a1);
      var a2 = Math.atan2(dx - kx, dyDown - ky);

      leg.hip.rotation.z = a1;
      leg.knee.rotation.z = a2 - a1;
      leg.ankle.rotation.z = -(a2) * 0.22 - 0.05;
      leg.hoof.rotation.z = -0.06 + 0.18 * Math.sin(Math.PI * clamp((p - stance) / (1 - stance), 0, 1)) * activity;

      leg.contact.position.set(footWorld.x, 0.014, footWorld.z);
      var sc = 1 - lift * 0.9;
      leg.contact.scale.set(sc, sc, 1);
      leg.contact.material.opacity = 0.18 * clamp(1 - lift * 2.2, 0.10, 1);
    }

    function animate(dt) {
      var activity = clamp(speed, 0, 2) / 1.0;
      var visual = Math.min(activity, 1.35);
      var cadence = BASE_CADENCE * Math.max(activity, 0.0001);
      var cycle = time * cadence;

      // body bob/sway — two peaks per stride, as in a walking giraffe
      var w = PI2 * cycle;
      body.position.y = 3.08 + visual * (0.038 * Math.cos(2 * w) + 0.012 * Math.sin(w));
      body.rotation.z = visual * 0.014 * Math.sin(w + 0.5);
      body.rotation.x = visual * 0.013 * Math.sin(w - 0.8);
      body.rotation.y = visual * 0.006 * Math.sin(w * 0.5);
      body.updateMatrixWorld(true);

      for (var i = 0; i < legs.length; i++) solveLeg(legs[i], cycle, visual);

      // neck counterbalances the body; head searches/nods gently
      neck.rotation.z = -0.015 + visual * 0.020 * Math.sin(w + 1.1) + 0.010 * Math.sin(time * 0.63);
      neck.rotation.y = 0.012 * Math.sin(time * 0.37);
      head.rotation.z = -0.10 + visual * 0.038 * Math.sin(w + 2.0) + 0.018 * Math.sin(time * 0.9);
      head.rotation.y = 0.035 * Math.sin(time * 0.52);
      for (var e = 0; e < 2; e++) {
        var twitch = Math.max(0, Math.sin(time * 1.7 + e * 4.3) - 0.92) * 1.6;
        ears[e].rotation.y = (e ? 1 : -1) * (0.12 + twitch);
      }

      tail.rotation.y = 0.26 * Math.sin(time * 1.35) + 0.10 * Math.sin(time * 3.2);
      tail.rotation.z = -0.05 + 0.10 * Math.sin(time * 1.1);

      // world scroll: the animal moves forward at ground level
      var metresPerSecond = BASE_STRIDE * BASE_CADENCE * activity;
      var shift = metresPerSecond * dt / GROUND_TILE;
      groundTex.offset.x += shift;
      for (var pi = 0; pi < props.length; pi++) {
        var prop = props[pi];
        prop.x -= metresPerSecond * dt;
        if (prop.x < -49) prop.x += 98;
        if (prop.type === 'tree' || prop.type === 'stone') {
          prop.mesh.position.x = prop.x;
        } else {
          dummy.position.set(prop.x, 0, prop.z);
          dummy.rotation.set(0, prop.rot, 0);
          dummy.scale.set(prop.sx, prop.sy, prop.sz);
          dummy.updateMatrix();
          prop.mesh.setMatrixAt(prop.index, dummy.matrix);
        }
      }
      if (grassMesh) grassMesh.instanceMatrix.needsUpdate = true;
    }

    var dummy = new T.Object3D(); // shared by instanced grass updates

    /* ------------------------------------------------------------------ *
     * Controls
     * ------------------------------------------------------------------ */

    var speedLabel = document.getElementById('speedValue');
    function setSpeed(v) {
      speed = clamp(Math.round(v * 10) / 10, 0, 2);
      speedLabel.textContent = speed.toFixed(1) + '×';
    }
    function setPaused(p) {
      paused = p;
      document.getElementById('pause').textContent = p ? '▶' : '❚❚';
    }
    function setView(yaw, pitch, dist) {
      userYaw = yaw; camPitch = pitch; camDist = dist;
    }
    document.getElementById('slower').onclick = function () { setSpeed(speed - 0.1); };
    document.getElementById('faster').onclick = function () { setSpeed(speed + 0.1); };
    document.getElementById('pause').onclick = function () { setPaused(!paused); };
    document.getElementById('side').onclick = function () { setView(0.02, 0.07, 13.8); };
    document.getElementById('front').onclick = function () { setView(Math.PI / 2 - 0.12, 0.10, 13.8); };
    document.getElementById('reset').onclick = function () { setView(0.72, 0.10, 13.6); };

    window.addEventListener('keydown', function (ev) {
      if (ev.code === 'Space') { ev.preventDefault(); setPaused(!paused); }
      else if (ev.code === 'ArrowLeft') setSpeed(speed - 0.1);
      else if (ev.code === 'ArrowRight') setSpeed(speed + 0.1);
      else if (ev.key === '1') setView(0.02, 0.07, 13.8);
      else if (ev.key === '2') setView(Math.PI / 2 - 0.12, 0.10, 13.8);
      else if (ev.key.toLowerCase() === 'r') setView(0.72, 0.10, 13.6);
    });

    var dragging = false, lastX = 0, lastY = 0, moved = false;
    canvas.addEventListener('pointerdown', function (ev) {
      dragging = true; moved = false; lastX = ev.clientX; lastY = ev.clientY;
      canvas.setPointerCapture(ev.pointerId);
    });
    canvas.addEventListener('pointermove', function (ev) {
      if (!dragging) return;
      var dx = ev.clientX - lastX, dy = ev.clientY - lastY;
      if (Math.abs(dx) + Math.abs(dy) > 1) moved = true;
      lastX = ev.clientX; lastY = ev.clientY;
      userYaw -= dx * 0.005;
      camPitch = clamp(camPitch + dy * 0.003, -0.12, 0.78);
    });
    canvas.addEventListener('pointerup', function (ev) {
      dragging = false;
      try { canvas.releasePointerCapture(ev.pointerId); } catch (e) {}
    });
    canvas.addEventListener('wheel', function (ev) {
      ev.preventDefault();
      camDist = clamp(camDist * (1 + Math.sign(ev.deltaY) * 0.08), 5.5, 24);
    }, { passive: false });

    window.addEventListener('resize', function () {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight, false);
    });

    /* ------------------------------------------------------------------ *
     * Main loop
     * ------------------------------------------------------------------ */

    var clock = new T.Clock();
    var firstFrame = true;
    function frame() {
      requestAnimationFrame(frame);
      var dt = Math.min(clock.getDelta(), 0.05);
      if (!paused) { time += dt; animate(dt); }
      updateCamera();
      renderer.render(scene, camera);
      if (firstFrame) {
        firstFrame = false;
        var l = document.getElementById('loading');
        l.classList.add('hidden');
      }
    }
    setSpeed(1.0);
    animate(0);
    frame();
  }
})();
