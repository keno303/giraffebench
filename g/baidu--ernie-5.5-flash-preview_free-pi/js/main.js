/* Scene bootstrap, camera, interaction and animation loop. */
(function () {
  'use strict';
  var T = THREE;

  var canvas = document.getElementById('scene');
  var renderer;
  try {
    renderer = new T.WebGLRenderer({ canvas: canvas, antialias: true, powerPreference: 'high-performance' });
  } catch (e) {
    document.getElementById('loading').innerHTML = '<div class="load-card"><h1>WebGL unavailable</h1><p>This scene needs WebGL. Please try a current version of Chrome, Firefox, Safari or Edge.</p></div>';
    return;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputEncoding = T.sRGBEncoding;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.95;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFSoftShadowMap;

  var paused = false;
  var scene = new T.Scene();
  scene.fog = new T.Fog(0xe6dcc4, 55, 190);

  var camera = new T.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.1, 600);

  var world = new World(scene, renderer);
  var giraffe = new Giraffe();
  scene.add(giraffe.group);

  // ---------- walking path ----------
  var PATH_R = 14.5;
  var pathAngle = 0.0;
  var giraffePos = new T.Vector3(0, 0, PATH_R);
  var giraffeFwd = new T.Vector3(1, 0, 0);
  giraffe.group.position.copy(giraffePos);
  giraffe.group.rotation.y = pathAngle + Math.PI / 2;

  // ---------- orbit camera ----------
  var portrait = window.innerHeight > window.innerWidth;
  var cam = {
    theta: 0.55,
    phi: 1.47,
    radius: portrait ? 15.6 : 13.8,
    target: new T.Vector3(giraffePos.x, 3.0, giraffePos.z),
    desired: new T.Vector3(),
    auto: true,
    lastInput: performance.now()
  };

  // ---------- debug views (used during development) ----------
  var params = new URLSearchParams(location.search);
  var debugMode = params.get('view');
  var dbgH = 6.6;
  if (debugMode) {
    document.body.classList.add('debug');
    var vg = document.querySelector('.vignette'); if (vg) vg.style.display = 'none';
    var hd = document.querySelector('header'); if (hd) hd.style.display = 'none';
    var ft = document.querySelector('footer'); if (ft) ft.style.display = 'none';
    world.env.visible = false;
    scene.fog = null;
    scene.background = new T.Color(0xeee9dc);
    giraffe.phase = parseFloat(params.get('phase') || '0.32');
    giraffe.update(0, 0);
    paused = true;
    var H = 6.6;
    dbgH = H;
    var dbgTarget = new T.Vector3(0, 3.0, 14);
    if (debugMode === 'head') { H = 1.35; dbgH = H; dbgTarget.set(2.58, 4.98, 14); }
    else if (debugMode === 'body') { H = 3.6; dbgH = H; dbgTarget.set(0, 2.6, 14); }
    else if (debugMode === 'headfront') { H = 1.5; dbgH = H; dbgTarget.set(2.58, 4.98, 14); }
    var aspect = window.innerWidth / window.innerHeight;
    camera = new T.OrthographicCamera(-H * aspect / 2, H * aspect / 2, H / 2, -H / 2, 0.1, 120);
    if (debugMode === 'front') camera.position.set(22, 3.4, 14);
    else if (debugMode === 'three') camera.position.set(13, 4.2, 27);
    else if (debugMode === 'back') camera.position.set(-13, 4.2, 1);
    else if (debugMode === 'head' || debugMode === 'body') camera.position.set(dbgTarget.x, dbgTarget.y, 30);
    else if (debugMode === 'headfront') camera.position.set(22, 5.0, 14);
    else camera.position.set(0, 3.0, 30);
    camera.lookAt(dbgTarget);
    if (params.get('flat') === '1') scene.overrideMaterial = new T.MeshBasicMaterial({ color: 0x161616 });
  }

  function updateCamera(dt) {
    var idle = (performance.now() - cam.lastInput) / 1000;
    if (cam.auto && idle > 7 && !dragging) cam.theta += dt * 0.045;

    cam.desired.set(giraffePos.x + giraffeFwd.x * 0.9, 3.0, giraffePos.z + giraffeFwd.z * 0.9);
    var k = 1 - Math.exp(-dt * 3.2);
    cam.target.lerp(cam.desired, k);

    var sp = Math.sin(cam.phi), cp = Math.cos(cam.phi);
    var x = cam.radius * sp * Math.sin(cam.theta);
    var y = cam.radius * cp;
    var z = cam.radius * sp * Math.cos(cam.theta);
    camera.position.set(cam.target.x + x, Math.max(0.6, cam.target.y + y), cam.target.z + z);
    camera.lookAt(cam.target);
  }

  // ---------- input ----------
  var dragging = false, lastX = 0, lastY = 0, activePointer = null;
  canvas.addEventListener('pointerdown', function (e) {
    dragging = true; activePointer = e.pointerId;
    lastX = e.clientX; lastY = e.clientY;
    cam.lastInput = performance.now();
    canvas.setPointerCapture(e.pointerId);
    canvas.classList.add('grabbing');
  });
  canvas.addEventListener('pointermove', function (e) {
    if (!dragging || e.pointerId !== activePointer) return;
    var dx = e.clientX - lastX, dy = e.clientY - lastY;
    lastX = e.clientX; lastY = e.clientY;
    cam.theta -= dx * 0.006;
    cam.phi = Math.max(0.32, Math.min(1.48, cam.phi - dy * 0.005));
    cam.lastInput = performance.now();
  });
  function endDrag(e) {
    if (e.pointerId !== activePointer) return;
    dragging = false; activePointer = null;
    canvas.classList.remove('grabbing');
  }
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('wheel', function (e) {
    e.preventDefault();
    cam.radius = Math.max(6, Math.min(30, cam.radius * Math.exp(e.deltaY * 0.0011)));
    cam.lastInput = performance.now();
  }, { passive: false });

  window.addEventListener('keydown', function (e) {
    if (e.code === 'Space') {
      e.preventDefault();
      paused = !paused;
      syncPauseBtn();
    } else if (e.key === 'o' || e.key === 'O') {
      cam.auto = !cam.auto;
      syncAutoBtn();
    }
  });

  // ---------- UI ----------
  var pauseBtn = document.getElementById('pause');
  var autoBtn = document.getElementById('auto');
  function syncPauseBtn() {
    pauseBtn.textContent = paused ? 'Resume' : 'Pause';
    pauseBtn.classList.toggle('on', paused);
  }
  function syncAutoBtn() {
    autoBtn.textContent = cam.auto ? 'Auto-orbit on' : 'Auto-orbit off';
    autoBtn.classList.toggle('on', cam.auto);
  }
  pauseBtn.addEventListener('click', function () { paused = !paused; syncPauseBtn(); });
  autoBtn.addEventListener('click', function () { cam.auto = !cam.auto; cam.lastInput = performance.now(); syncAutoBtn(); });
  syncPauseBtn(); syncAutoBtn();

  // ---------- resize ----------
  function onResize() {
    if (camera.isPerspectiveCamera) {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
    } else if (camera.isOrthographicCamera) {
      var H = dbgH, aspect = window.innerWidth / window.innerHeight;
      camera.left = -H * aspect / 2; camera.right = H * aspect / 2;
      camera.top = H / 2; camera.bottom = -H / 2;
      camera.updateProjectionMatrix();
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
  }
  window.addEventListener('resize', onResize);

  // ---------- dust on hooffalls ----------
  var lastLegPhase = giraffe.legs.map(function (l) { return (giraffe.phase + l.phaseOffset) % 1; });
  var tmpV = new T.Vector3();
  function checkHooffalls() {
    for (var i = 0; i < giraffe.legs.length; i++) {
      var l = giraffe.legs[i];
      var p = (giraffe.phase + l.phaseOffset) % 1;
      var prev = lastLegPhase[i];
      var landed = p < 0.64 && (prev >= 0.64 || p < prev);
      if (landed && giraffe.group.position.distanceTo(camera.position) < 60) {
        giraffe.group.updateMatrixWorld(true);
        l.hoof.getWorldPosition(tmpV);
        world.spawnDust(tmpV);
      }
      lastLegPhase[i] = p;
    }
  }

  if (params.get('stats') === '1') {
    setTimeout(function () {
      var p = document.createElement('pre');
      p.id = 'stats';
      p.textContent = JSON.stringify({
        calls: renderer.info.render.calls,
        triangles: renderer.info.render.triangles,
        geometries: renderer.info.memory.geometries,
        textures: renderer.info.memory.textures,
        programs: renderer.info.programs ? renderer.info.programs.length : -1
      });
      document.body.appendChild(p);
    }, 1500);
  }

  // ---------- loop ----------
  var clock = new T.Clock();
  var elapsed = 0;
  var firstFrame = true;
  var loading = document.getElementById('loading');

  function animate() {
    requestAnimationFrame(animate);
    var dt = Math.min(clock.getDelta(), 0.05);
    if (!paused) {
      elapsed += dt;
      giraffe.update(dt, elapsed);

      var speed = giraffe.getSpeed();
      pathAngle += (speed * dt) / PATH_R;
      giraffePos.set(Math.sin(pathAngle) * PATH_R, 0, Math.cos(pathAngle) * PATH_R);
      giraffeFwd.set(Math.cos(pathAngle), 0, -Math.sin(pathAngle));
      giraffe.group.position.copy(giraffePos);
      giraffe.group.rotation.y = pathAngle + Math.PI / 2;
      checkHooffalls();
    }
    world.update(giraffePos, paused ? 0 : dt);
    if (!debugMode) updateCamera(dt);
    renderer.render(scene, camera);

    if (firstFrame) {
      firstFrame = false;
      loading.classList.add('hide');
      setTimeout(function () { if (loading.parentNode) loading.parentNode.removeChild(loading); }, 900);
    }
  }
  animate();
})();