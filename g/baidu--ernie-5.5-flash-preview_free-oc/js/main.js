/* =============================================================================
   main.js — renderer, camera, orbit controls, walk loop, QA hooks
   ========================================================================== */
(function () {
  'use strict';
  const NS = window.GIRAFFE;
  const V3 = THREE.Vector3;
  const params = new URLSearchParams(location.search);
  const QA = params.has('qa');
  const QA_T = params.has('t') ? parseFloat(params.get('t')) : null;

  const T0 = performance.now();

  function boot() {
    if (typeof THREE === 'undefined') {
      const el = document.getElementById('err');
      if (el) { el.style.display = 'grid'; el.firstElementChild.textContent = 'Three.js failed to load (vendor/three.min.js).'; }
      return;
    }

    const canvas = document.getElementById('scene');
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({
        canvas: canvas, antialias: true, powerPreference: 'high-performance', alpha: false
      });
    } catch (e) {
      showError('WebGL is not available in this browser. ' + e.message);
      return;
    }
    if (!renderer.getContext()) {
      showError('Could not create a WebGL context.');
      return;
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.02;
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xbed6ea);

    const camera = new THREE.PerspectiveCamera(38, window.innerWidth / window.innerHeight, 0.1, 1200);

    /* ------------------------------------------------------------------ */
    /* world + animal                                                      */
    /* ------------------------------------------------------------------ */
    const world = NS.createWorld(scene, renderer);
    const giraffe = NS.createGiraffe();
    scene.add(giraffe.root);

    /* two distant animals give the scene scale; they share the coat textures */
  const herd = [];
  for (let i = 0; i < 2; i++) {
    const g = NS.createGiraffe({ lowDetail: true });
    g.root.userData.isHerd = true;
    g.root.scale.multiplyScalar(0.92 + i * 0.06);
    scene.add(g.root);
    herd.push({ g: g, r: 57 + i * 21, a: 3.80 + i * 0.62, sp: 0.60 + i * 0.08 });
  }
  function placeHerd(h, dt, sp) {
    h.a += (sp * h.sp * dt) / h.r;
    const x = Math.cos(h.a) * h.r, z = Math.sin(h.a) * h.r;
    h.g.root.position.set(x, NS.terrainHeight(x, z) - 0.02, z);
    h.g.root.rotation.y = -h.a;
  }
  herd.forEach(h => { placeHerd(h, 0, 0); h.g.update(0, 0); });

  /* QA switches */
    if (params.get('noshadow') === '1') { renderer.shadowMap.enabled = false; world.sun.castShadow = false; }
    if (params.get('plain') === '1' || params.get('basic') === '1') {
      const basic = params.get('basic') === '1';
      giraffe.root.traverse(o => {
        if (!o.isMesh) return;
        if (basic && o.material && o.material.map) {
          o.material = new THREE.MeshBasicMaterial({ map: o.material.map });
        } else if (!basic) {
          o.material = new THREE.MeshStandardMaterial({ color: 0xb98a5a, roughness: 0.9 });
        }
      });
    }

    /* ------------------------------------------------------------------ */
    /* state                                                               */
    /* ------------------------------------------------------------------ */
    const BASE_SPEED = 0.85;   // metres / second at 1x

    const state = {
      time: 0,
      speed: 1,
      paused: false,
      pathA: 0,
      R: 26
    };

    const focus = new V3();
    const focusSmooth = new V3();
    let focusInit = false;

    /* place on the circular path */
    function placeOnPath() {
      const a = state.pathA;
      giraffe.root.position.set(Math.sin(a) * state.R, 0, Math.cos(a) * state.R);
      giraffe.root.rotation.y = Math.atan2(Math.cos(a), -Math.sin(a));
    }
    placeOnPath();

    giraffe.focus(focus);
    focusSmooth.copy(focus);

    /* ------------------------------------------------------------------ */
    /* orbit camera                                                        */
    /* ------------------------------------------------------------------ */
    const cam = {
      theta: 0.66, phi: 1.48, dist: 19.5,
      tTheta: 0.66, tPhi: 1.48, tDist: 11.2,
      idle: 0, intro: 0
    };
    const HOME = { theta: 0.66, phi: 1.48, dist: 11.2 };

    function applyCamera(dt, snap) {
      /* slow cinematic push-in on first load (cancelled by any interaction) */
      if (!snap && cam.intro < 1) {
        cam.intro = Math.min(1, cam.intro + dt / 3.4);
        const e = 1 - Math.pow(1 - cam.intro, 3);
        cam.dist = 19.5 + (cam.tDist - 19.5) * e;
        cam.phi = 1.30 + (cam.tPhi - 1.30) * e;
      }
      const k = snap ? 1 : 1 - Math.exp(-dt * 7.0);
      cam.theta += (cam.tTheta - cam.theta) * k;
      cam.phi += (cam.tPhi - cam.phi) * k;
      cam.dist += (cam.tDist - cam.dist) * k;
      /* orbit angle is relative to the animal's heading -> the camera tracks it */
      const th = cam.theta + giraffe.root.rotation.y;
      const sp = Math.sin(cam.phi), cp = Math.cos(cam.phi);
      camera.position.set(
        focusSmooth.x + cam.dist * sp * Math.sin(th),
        focusSmooth.y + cam.dist * cp,
        focusSmooth.z + cam.dist * sp * Math.cos(th)
      );
      if (camera.position.y < 0.55) camera.position.y = 0.55;
      camera.lookAt(focusSmooth);
    }

    /* pointer orbit */
    let dragging = false, lastX = 0, lastY = 0, pointers = new Map(), pinchDist = 0;
    canvas.addEventListener('pointerdown', (e) => {
      cam.intro = 1;
      canvas.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 1) { dragging = true; lastX = e.clientX; lastY = e.clientY; }
      if (pointers.size === 2) {
        const p = [...pointers.values()];
        pinchDist = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
        dragging = false;
      }
      cam.idle = 0;
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!pointers.has(e.pointerId)) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      cam.idle = 0;
      if (pointers.size === 2) {
        const p = [...pointers.values()];
        const d = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
        if (pinchDist > 0) {
          cam.tDist = NS.clamp(cam.tDist * (pinchDist / d), 3.4, 42);
        }
        pinchDist = d;
        return;
      }
      if (!dragging) return;
      const dx = e.clientX - lastX, dy = e.clientY - lastY;
      lastX = e.clientX; lastY = e.clientY;
      cam.tTheta -= dx * 0.0052;
      cam.tPhi = NS.clamp(cam.tPhi - dy * 0.0045, 0.22, 1.515);
    });
    function endPointer(e) {
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinchDist = 0;
      if (pointers.size === 0) dragging = false;
    }
    canvas.addEventListener('pointerup', endPointer);
    canvas.addEventListener('pointercancel', endPointer);
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      cam.intro = 1;
      cam.idle = 0;
      cam.tDist = NS.clamp(cam.tDist * (1 + Math.sign(e.deltaY) * 0.08), 3.4, 42);
    }, { passive: false });

    /* ------------------------------------------------------------------ */
    /* UI                                                                  */
    /* ------------------------------------------------------------------ */
    const btnPause = document.getElementById('btn-pause');
    const btnSpeed = document.getElementById('btn-speed');
    const btnView = document.getElementById('btn-view');
    const hint = document.getElementById('hint');

    btnPause.addEventListener('click', () => {
      state.paused = !state.paused;
      btnPause.textContent = state.paused ? 'Play' : 'Pause';
      btnPause.classList.toggle('on', state.paused);
    });
    const SPEEDS = [1, 1.6, 0.5];
    let speedIdx = 0;
    btnSpeed.addEventListener('click', () => {
      speedIdx = (speedIdx + 1) % SPEEDS.length;
      state.speed = SPEEDS[speedIdx];
      btnSpeed.textContent = 'Speed ' + (state.speed === 1 ? '1×' : state.speed + '×');
    });
    btnView.addEventListener('click', () => {
      cam.tTheta = HOME.theta; cam.tPhi = HOME.phi; cam.tDist = HOME.dist;
      cam.idle = 0;
    });
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space') { e.preventDefault(); btnPause.click(); }
    });
    setTimeout(() => hint.classList.add('gone'), 8000);

    /* ------------------------------------------------------------------ */
    /* dust on footfalls                                                   */
    /* ------------------------------------------------------------------ */
    const prevPhase = [0, 0, 0, 0];
    const _fp = new V3();
    function footfalls() {
      const base = giraffe.phase();
      for (let i = 0; i < giraffe.legs.length; i++) {
        const leg = giraffe.legs[i];
        const p = (base + leg.phase) % 1;
        const prev = prevPhase[i];
        // wrap of the cycle = the foot just landed
        if (prev > 0.85 && p < 0.15 && state.speed > 0.05 && !state.paused) {
          _fp.copy(leg.foot.position);
          _fp.y = 0.05;
          giraffe.root.localToWorld(_fp);
          world.dust.spawn(_fp, 1);
        }
        prevPhase[i] = p;
      }
    }

    /* ------------------------------------------------------------------ */
    /* loop                                                                */
    /* ------------------------------------------------------------------ */
    function step(dt) {
      state.time += dt;
      const sp = state.paused ? 0 : state.speed * BASE_SPEED;
      giraffe.update(dt, sp);
      for (const h of herd) { placeHerd(h, dt, sp); h.g.update(dt, sp * h.sp * 0.9); }
      if (!QA || QA_T === null) {
        state.pathA += (sp * dt) / state.R;
        placeOnPath();
      }
      giraffe.focus(focus);
      if (!focusInit) { focusSmooth.copy(focus); focusInit = true; }
      else focusSmooth.lerp(focus, 1 - Math.exp(-dt * 4.5));

      world.update(dt, focusSmooth);
      footfalls();

      cam.idle += dt;
      if (cam.idle > 6 && !dragging) cam.tTheta += dt * 0.045;
      applyCamera(dt, false);
    }

    let last = performance.now();
    let frames = 0;

    function frame(now) {
      const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
      last = now;
      if (!QA || QA_T === null) step(dt);
      else applyCamera(0.016, true);
      renderer.render(scene, camera);
      frames++;
      if (frames === 2) {
        const l = document.getElementById('loader');
        if (l) { l.classList.add('gone'); setTimeout(() => l.remove(), 900); }
      }
      requestAnimationFrame(frame);
    }

    /* ------------------------------------------------------------------ */
    /* QA harness (only used for automated visual checks)                  */
    /* ------------------------------------------------------------------ */
    window.__qa = {
      freeze() { state.paused = true; },
      setTime(t) {
        giraffe.state.distance = 0;
        giraffe.state.time = 0;
        state.time = 0;
        state.paused = false;
        let acc = 0;
        while (acc < t) { step(1 / 60); acc += 1 / 60; if (acc > 200) break; }
        state.paused = true;
        giraffe.focus(focus); focusSmooth.copy(focus);
        applyCamera(0.016, true);
        renderer.render(scene, camera);
      },
      setCam(theta, phi, dist) {
        cam.theta = cam.tTheta = theta;
        cam.phi = cam.tPhi = phi;
        cam.dist = cam.tDist = dist;
        applyCamera(0.016, true);
        renderer.render(scene, camera);
      },
      ascii(cols, rows, view, only) {
        if (view === 'real') { rows = 26; cols = 84; }
        const W = view === 'real' ? 504 : 320, H = view === 'real' ? 300 : 420;
        const rt = new THREE.WebGLRenderTarget(W, H);
        const camQ = view === 'real'
        ? camera.clone()
        : new THREE.PerspectiveCamera(26, W / H, 0.1, 800);
        const box = new THREE.Box3().setFromObject(giraffe.root);
        const center = box.getCenter(new V3());
        const size = box.getSize(new V3());
        let radius = Math.max(size.y, size.x * 1.05, size.z) * 0.5;
        if (view === 'head') {
          giraffe.head.localToWorld(center.set(0, 0.03, 0.20));
          radius = 0.55;
        } else if (view === 'headside') {
        giraffe.head.localToWorld(center.set(0, 0.03, 0.18));
        radius = 0.42;
      } else if (view === 'legs') {
          center.set(0, 1.1, 0.2);
          radius = 1.5;
        }
        const dist = (radius / Math.tan(THREE.MathUtils.degToRad(13))) * 1.04;
        let dir;
        if (view === 'real') { camQ.aspect = W / H; camQ.updateProjectionMatrix(); camQ.updateMatrixWorld(); }
        else if (view === 'side') dir = new V3(1, 0.05, 0);
        else if (view === 'front') dir = new V3(0, 0.05, 1);
        else if (view === 'back') dir = new V3(0, 0.05, -1);
        else if (view === 'side2') dir = new V3(-1, 0.05, 0);
        else if (view === 'head') dir = new V3(0.85, 0.18, 0.55).normalize();
        else if (view === 'headside') dir = new V3(1, 0.03, 0.0);
        else if (view === 'legs') dir = new V3(0.9, 0.10, 0.35).normalize();
        else dir = new V3(0.85, 0.30, 0.9).normalize();
        if (view !== 'real') {
          camQ.position.copy(center).addScaledVector(dir.clone().normalize(), dist);
          camQ.lookAt(center);
          camQ.updateMatrixWorld();
        }

        const vis = [];
        if (!params.has('showherd')) herd.forEach(h => { vis.push([h.g.root, h.g.root.visible]); h.g.root.visible = false; });
        if (only) {
          giraffe.root.traverse(o => {
            if (o.userData.isLeg) {
              vis.push([o, o.visible]);
              o.visible = (only === 'leg' + o.userData.leg);
            } else if (o === giraffe.body) {
              vis.push([o, o.visible]);
              o.visible = (only === 'body');
            }
          });
        }
        world.group.visible = false;
        world.sky.visible = false;
        world.dust.points.visible = false;
        if (world.birds) world.birds.forEach(b => { vis.push([b, b.visible]); b.visible = false; });
        const oldBg = scene.background, oldFog = scene.fog, oldOv = scene.overrideMaterial;
        scene.background = new THREE.Color(0xffffff);
        scene.fog = null;
        scene.overrideMaterial = new THREE.MeshBasicMaterial({ color: 0x000000, fog: false });

        renderer.setRenderTarget(rt);
        renderer.setClearColor(0xffffff, 1);
        renderer.clear();
        renderer.render(scene, camQ);
        const buf = new Uint8Array(W * H * 4);
        renderer.readRenderTargetPixels(rt, 0, 0, W, H, buf);
        renderer.setRenderTarget(null);
        renderer.setClearColor(0x000000, 1);

        scene.background = oldBg; scene.fog = oldFog; scene.overrideMaterial = oldOv;
        world.group.visible = true; world.sky.visible = true; world.dust.points.visible = true;
        vis.forEach(([b, v]) => b.visible = v);
        rt.dispose();

        /* silhouette -> ascii */
        const cw = W / cols, ch = H / rows;
        const lines = [];
        let minx = 1e9, maxx = -1e9, miny = 1e9, maxy = -1e9, count = 0;
        for (let r = 0; r < rows; r++) {
          let line = '';
          for (let c = 0; c < cols; c++) {
            let hit = 0, tot = 0;
            for (let sy = 0; sy < 3; sy++) {
              for (let sx = 0; sx < 3; sx++) {
                const px = Math.min(W - 1, Math.floor(c * cw + (sx + 0.5) * cw / 3));
                const py = Math.min(H - 1, Math.floor(r * ch + (sy + 0.5) * ch / 3));
                const idx = (py * W + px) * 4;
                // buffer rows are bottom-up: flip
                const yy = H - 1 - py;
                const j = (yy * W + px) * 4;
                const v = buf[j];
                tot++;
                if (v < 128) {
                  hit++;
                  if (px < minx) minx = px; if (px > maxx) maxx = px;
                  if (yy < miny) miny = yy; if (yy > maxy) maxy = yy;
                  count++;
                }
              }
            }
            const f = hit / tot;
            line += f > 0.6 ? '#' : f > 0.22 ? '+' : f > 0.03 ? '.' : ' ';
          }
          lines.push(line.replace(/\s+$/, ''));
        }
        return {
          ascii: lines.join('\n'),
          bbox: maxx < 0 ? null : [minx / W, miny / H, maxx / W, maxy / H],
          size: [size.x.toFixed(2), size.y.toFixed(2), size.z.toFixed(2)],
          coverage: (count / (W * H)).toFixed(3),
          markers: (function () {
            const out = {};
            const P = (name, v) => {
              const p = v.clone().project(camQ);
              out[name] = [Math.round((p.x * 0.5 + 0.5) * cols), Math.round((1 - (p.y * 0.5 + 0.5)) * rows)];
            };
            const wp = (o) => o.getWorldPosition(new V3());
            P('nose', giraffe.head.localToWorld(new V3(0, -0.04, 0.50)));
            P('skull', giraffe.head.localToWorld(new V3(0, 0.12, 0.02)));
            P('neckBase', giraffe.neckPivot.localToWorld(new V3(0, 0.1, 0)));
            P('withers', giraffe.body.localToWorld(new V3(0, 0.60, 0.0)));
            P('rump', giraffe.body.localToWorld(new V3(0, 0.45, -1.0)));
            P('belly', giraffe.body.localToWorld(new V3(0, -0.60, 0.0)));
            giraffe.legs.forEach((l, i) => {
              P('hip' + i, giraffe.root.localToWorld(l.hip.clone()));
              P('foot' + i, wp(l.foot));
            });
            return out;
          })()
        };
      },
      pixels() {
        renderer.render(scene, camera);
        const gl = renderer.getContext();
        const W = gl.drawingBufferWidth, H = gl.drawingBufferHeight;
        const buf = new Uint8Array(W * H * 4);
        gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, buf);
        const hex = (x, y) => {
          const j = (NS.clamp(y, 0, H - 1) * W + NS.clamp(x, 0, W - 1)) * 4;
          return '#' + [buf[j], buf[j + 1], buf[j + 2]].map(v => v.toString(16).padStart(2, '0')).join('');
        };
        const pts = [];
        for (let i = 0; i < 5; i++) {
          for (let j = 0; j < 5; j++) {
            pts.push([i, j, hex(Math.floor((i + 0.5) / 5 * (W - 1)), Math.floor((j + 0.5) / 5 * (H - 1)))]);
          }
        }
        /* coarse colour grid, sRGB averages */
        const GX = 28, GY = 18, grid = [];
        for (let j = 0; j < GY; j++) {
          const row = [];
          for (let i = 0; i < GX; i++) {
            let r = 0, g = 0, b = 0, n = 0;
            const x0 = Math.floor(i / GX * W), x1 = Math.floor((i + 1) / GX * W);
            const y0 = Math.floor(j / GY * H), y1 = Math.floor((j + 1) / GY * H);
            for (let y = y0; y < y1; y += 3) {
              for (let x = x0; x < x1; x += 3) {
                const q = (y * W + x) * 4;
                r += buf[q]; g += buf[q + 1]; b += buf[q + 2]; n++;
              }
            }
            row.push([Math.round(r / n), Math.round(g / n), Math.round(b / n)]);
          }
          grid.push(row);
        }
        return { size: [W, H], pts: pts, grid: grid };
      },
      probe() {
        renderer.render(scene, camera);
        const gl = renderer.getContext();
        const W = gl.drawingBufferWidth, H = gl.drawingBufferHeight;
        const body = giraffe.body;
        const pts = {
          barrel: body.localToWorld(new V3(0.40, 0.02, -0.30)),
          shoulder: body.localToWorld(new V3(0.38, 0.22, 0.50)),
          rump: body.localToWorld(new V3(0.34, 0.18, -1.00)),
          neckMid: giraffe.neckPivot.localToWorld(new V3(0.16, 1.0, 0.34)),
          neckLow: giraffe.neckPivot.localToWorld(new V3(0.30, 0.35, 0.10)),
          headSide: giraffe.head.localToWorld(new V3(0.11, 0.08, 0.10)),
          legFront: giraffe.legs[0].upper.getWorldPosition(new V3()),
          legHind: giraffe.legs[2].upper.getWorldPosition(new V3())
        };
        const out = {};
        const b = new Uint8Array(4);
        for (const k in pts) {
          const p = pts[k].clone().project(camera);
          const x = Math.round(NS.clamp((p.x * 0.5 + 0.5) * W, 0, W - 1));
          const y = Math.round(NS.clamp((p.y * 0.5 + 0.5) * H, 0, H - 1));
          gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, b);
          out[k] = '#' + [b[0], b[1], b[2]].map(v => v.toString(16).padStart(2, '0')).join('');
        }
        const gp = giraffe.root.position;
        out.shadowGround = (function () {
          const v = new V3(gp.x - 3.0, 0.03, gp.z - 1.4).project(camera);
          const x = Math.round(NS.clamp((v.x * 0.5 + 0.5) * W, 0, W - 1));
          const y = Math.round(NS.clamp((v.y * 0.5 + 0.5) * H, 0, H - 1));
          gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, b);
          return '#' + [b[0], b[1], b[2]].map(q => q.toString(16).padStart(2, '0')).join('');
        })();
        const ndc = { skyTop: [0, 0.96], skyMid: [0, 0.72], horizonL: [-0.85, 0.28], groundNear: [0, -0.75], groundMid: [-0.6, -0.35] };
        for (const k in ndc) {
          const x = Math.round((ndc[k][0] * 0.5 + 0.5) * (W - 1));
          const y = Math.round((ndc[k][1] * 0.5 + 0.5) * (H - 1));
          gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, b);
          out[k] = '#' + [b[0], b[1], b[2]].map(v => v.toString(16).padStart(2, '0')).join('');
        }
        return out;
      },
      normals() {
      let count = 0, inward = 0, worst = 1;
      giraffe.root.traverse(o => {
        if (!o.isMesh || !o.geometry || !o.geometry.attributes.normal) return;
        const pos = o.geometry.attributes.position, nor = o.geometry.attributes.normal;
        o.geometry.computeBoundingSphere();
        const c = o.geometry.boundingSphere.center;
        for (let i = 0; i < pos.count; i += 13) {
          const vx = pos.getX(i) - c.x, vy = pos.getY(i) - c.y, vz = pos.getZ(i) - c.z;
          const l = Math.hypot(vx, vy, vz) || 1;
          const d = (vx * nor.getX(i) + vy * nor.getY(i) + vz * nor.getZ(i)) / l;
          if (d < 0) inward++;
          if (d < worst) worst = d;
          count++;
        }
      });
      return { samples: count, inward: inward, ratio: +(inward / Math.max(1, count)).toFixed(3), worst: +worst.toFixed(2) };
    },
    coatGrid() {
        const cv = giraffe.textures.coatBig.map.image;
        const N = 32;
        const c = document.createElement('canvas');
        c.width = c.height = N;
        const ctx = c.getContext('2d');
        ctx.drawImage(cv, 0, 0, N, N);
        const d = ctx.getImageData(0, 0, N, N).data;
        const rows = [];
        for (let y = 0; y < N; y++) {
          let line = '';
          for (let x = 0; x < N; x++) {
            const j = (y * N + x) * 4;
            line += (d[j] > 195 ? '.' : d[j] > 150 ? 'o' : '#');
          }
          rows.push(line);
        }
        return rows.join('\n');
      },
      info() {
        const box = new THREE.Box3().setFromObject(giraffe.root);
        const s = box.getSize(new V3());
        return {
          height: s.y, length: s.z, width: s.x,
          min: box.min.toArray().map(v => +v.toFixed(2)),
          max: box.max.toArray().map(v => +v.toFixed(2)),
          herd: herd.map(h => { const v = h.g.root.position.clone().project(camera); return [+v.x.toFixed(2), +v.y.toFixed(2)]; }),
        drawCalls: renderer.info.render.calls,
          tris: renderer.info.render.triangles,
          cam: camera.position.toArray().map(v => +v.toFixed(2))
        };
      }
    };

    /* ------------------------------------------------------------------ */
    /* boot                                                                */
    /* ------------------------------------------------------------------ */
    function onResize() {
      const w = window.innerWidth, h = window.innerHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h, false);
    }
    window.addEventListener('resize', onResize);
  document.addEventListener('visibilitychange', function () { last = performance.now(); });

    window.addEventListener('error', (e) => showError(e.message));

    function showError(msg) {
      const el = document.getElementById('err');
      if (!el) return;
      el.style.display = 'grid';
      el.firstElementChild.textContent = 'Unable to start the scene: ' + msg;
    }

    /* deterministic QA mode */
      /* deterministic QA mode: animal stands at the origin facing +Z */
    if (QA && QA_T !== null) {
      giraffe.root.position.set(0, 0, 0);
      giraffe.root.rotation.y = 0;
      state.paused = false;
      let acc = 0;
      giraffe.state.distance = 0;
      giraffe.state.time = 0;
      while (acc < QA_T) { step(1 / 60); acc += 1 / 60; if (acc > 200) break; }
      state.paused = true;
      giraffe.root.position.set(0, 0, 0);
      giraffe.root.rotation.y = 0;
      giraffe.focus(focus); focusSmooth.copy(focus);
      applyCamera(0.016, true);
    }

    requestAnimationFrame(frame);

    /* run QA and publish results into the DOM (base64) */
    if (QA) {
      const runQA = () => {
        if (!window.__qa) return false;
        try {
          const out = { loadMs: window.__loadMs, info: window.__qa.info() };
          const views = (params.get('views') || 'side').split(',');
          out.views = {};
          for (const v of views) out.views[v] = window.__qa.ascii(80, 54, v, params.get('only') || null);
          if (params.get('pixels') === '1') out.pixels = window.__qa.pixels();
          if (params.get('probe') === '1') out.probe = window.__qa.probe();
          if (params.get('coat') === '1') out.coat = window.__qa.coatGrid();
        if (params.get('normals') === '1') out.normals = window.__qa.normals();
          let el = document.getElementById('diag');
          if (!el) { el = document.createElement('div'); el.id = 'diag'; document.body.appendChild(el); }
          el.textContent = btoa(unescape(encodeURIComponent(JSON.stringify(out))));
          document.title = 'QA_DONE';
        } catch (e) {
          const el = document.getElementById('diag') || document.body.appendChild(document.createElement('div'));
          el.textContent = 'ERR:' + e.message + '|' + e.stack;
          document.title = 'QA_ERR';
        }
        return true;
      };
      let tries = 0;
      const iv = setInterval(function () {
        if (runQA() || tries++ > 400) clearInterval(iv);
      }, 25);
    }

    /* report load timing for diagnostics */
    window.__loadMs = Math.round(performance.now() - T0);
  }

  /* let the browser paint the loading screen before the heavy build */
  requestAnimationFrame(function () { setTimeout(boot, 30); });
})();