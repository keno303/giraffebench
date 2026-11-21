// Main Scene Bootstrap, Camera Presets, HUD Controls & Render Loop
(function () {
  'use strict';

  const container = document.getElementById('canvas-container');

  // --- 1. RENDERER ---
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    powerPreference: 'high-performance',
    preserveDrawingBuffer: false,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.06;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.physicallyCorrectLights = false;
  container.appendChild(renderer.domElement);

  // --- 2. SCENE & TELEPHOTO-STYLE CAMERA ---
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(
    38,
    window.innerWidth / window.innerHeight,
    0.08,
    360
  );

  const CAMERA_PRESETS = {
    hero: {
      pos: new THREE.Vector3(-6.4, 2.75, 6.2),
      target: new THREE.Vector3(0.0, 2.55, 0.55),
    },
    profile: {
      pos: new THREE.Vector3(-8.4, 2.55, 0.55),
      target: new THREE.Vector3(0.0, 2.52, 0.55),
    },
    head: {
      pos: new THREE.Vector3(-1.38, 4.72, 2.98),
      target: new THREE.Vector3(0.0, 4.72, 2.18),
    },
    front: {
      pos: new THREE.Vector3(-3.4, 1.90, 7.8),
      target: new THREE.Vector3(0.0, 2.65, 0.65),
    },
    legs: {
      pos: new THREE.Vector3(-3.3, 0.85, 1.35),
      target: new THREE.Vector3(0.0, 0.72, 0.05),
    },
  };

  camera.position.copy(CAMERA_PRESETS.hero.pos);

  const controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.minDistance = 0.75;
  controls.maxDistance = 26.0;
  controls.maxPolarAngle = Math.PI * 0.492;
  controls.target.copy(CAMERA_PRESETS.hero.target);
  controls.update();

  // Smooth preset transition state
  let camTransition = null;
  controls.addEventListener('start', function () {
    camTransition = null; // User takes over immediately on drag/zoom
  });

  function transitionToPreset(name, instant) {
    const preset = CAMERA_PRESETS[name];
    if (!preset) return;
    updateActiveButton('[data-cam]', 'data-cam', name);
    if (instant) {
      camTransition = null;
      camera.position.copy(preset.pos);
      controls.target.copy(preset.target);
      controls.update();
      return;
    }
    camTransition = {
      startPos: camera.position.clone(),
      startTarget: controls.target.clone(),
      endPos: preset.pos.clone(),
      endTarget: preset.target.clone(),
      t: 0,
      duration: 0.85,
    };
  }

  // --- 3. BUILD SAVANNAH ENVIRONMENT & REALISTIC GIRAFFE ---
  const env = SavannahEnv.createEnvironment(scene, renderer);
  const giraffe = GiraffeMesh.buildGiraffe();
  scene.add(giraffe.root);

  const gait = GiraffeGait.createController(giraffe);
  gait.state.onHoofStep = function (pos, isLiftoff) {
    env.spawnHoofDust(pos, isLiftoff);
  };

  // Evaluate initial pose cleanly
  gait.update(0);

  // --- 4. HUD WIRING ---
  function updateActiveButton(selector, attr, activeVal) {
    document.querySelectorAll(selector).forEach(function (btn) {
      btn.classList.toggle('active', btn.getAttribute(attr) === activeVal);
    });
  }

  const playPauseBtn = document.getElementById('btn-play-pause');
  const speedSlider = document.getElementById('speed-slider');
  const speedLabel = document.getElementById('speed-value');
  const hudToggleBtn = document.getElementById('btn-toggle-hud');
  const hudPanel = document.getElementById('hud-panel');

  function syncPlayPauseUI() {
    if (!playPauseBtn) return;
    playPauseBtn.textContent = gait.state.paused ? 'Play' : 'Pause';
    playPauseBtn.classList.toggle('paused', gait.state.paused);
  }

  if (playPauseBtn) {
    playPauseBtn.addEventListener('click', function () {
      gait.state.paused = !gait.state.paused;
      syncPlayPauseUI();
    });
  }

  if (speedSlider) {
    speedSlider.addEventListener('input', function () {
      const val = parseFloat(speedSlider.value);
      gait.state.speed = val;
      if (speedLabel) {
        speedLabel.textContent = val < 0.03 ? 'Idle' : `${val.toFixed(2)}×`;
      }
    });
  }

  document.querySelectorAll('[data-cam]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      transitionToPreset(btn.getAttribute('data-cam'), false);
    });
  });

  document.querySelectorAll('[data-tod]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      const key = btn.getAttribute('data-tod');
      env.applyTimeOfDay(key);
      updateActiveButton('[data-tod]', 'data-tod', key);
    });
  });

  if (hudToggleBtn && hudPanel) {
    hudToggleBtn.addEventListener('click', function () {
      hudPanel.classList.toggle('collapsed');
      hudToggleBtn.textContent = hudPanel.classList.contains('collapsed') ? 'Controls' : 'Hide';
    });
  }

  window.addEventListener('keydown', function (e) {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
    if (e.code === 'Space') {
      e.preventDefault();
      gait.state.paused = !gait.state.paused;
      syncPlayPauseUI();
    } else if (e.key === '1') transitionToPreset('hero', false);
    else if (e.key === '2') transitionToPreset('profile', false);
    else if (e.key === '3') transitionToPreset('head', false);
    else if (e.key === '4') transitionToPreset('front', false);
    else if (e.key === '5') transitionToPreset('legs', false);
    else if (e.key === 'h' || e.key === 'H') {
      if (hudPanel) hudPanel.classList.toggle('collapsed');
    }
  });

  // --- 5. RESIZE HANDLER ---
  window.addEventListener('resize', function () {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // --- 6. RENDER LOOP ---
  let lastTime = performance.now();

  function animate(now) {
    requestAnimationFrame(animate);
    const rawDt = (now - lastTime) * 0.001;
    lastTime = now;
    const dt = Math.min(rawDt, 0.05);

    gait.update(dt);
    env.update(dt, gait.state.time, gait.state.groundDistance);

    if (camTransition) {
      camTransition.t += dt / camTransition.duration;
      const u = Math.min(1, camTransition.t);
      const ease = u * u * (3 - 2 * u);
      camera.position.lerpVectors(camTransition.startPos, camTransition.endPos, ease);
      controls.target.lerpVectors(camTransition.startTarget, camTransition.endTarget, ease);
      if (u >= 1) camTransition = null;
    }

    controls.update();
    renderer.render(scene, camera);
  }

  requestAnimationFrame(animate);

  // --- 7. INSPECTION / DEBUG HOOK ---
  window.__giraffeDebug = {
    setCamera: function (posArr, targetArr) {
      camTransition = null;
      camera.position.set(posArr[0], posArr[1], posArr[2]);
      controls.target.set(targetArr[0], targetArr[1], targetArr[2]);
      controls.update();
      renderer.render(scene, camera);
    },
    setPreset: function (name) {
      transitionToPreset(name, true);
      renderer.render(scene, camera);
    },
    setPhase: function (phase) {
      gait.state.paused = true;
      syncPlayPauseUI();
      gait.setPhase(phase);
      env.update(0, gait.state.time, gait.state.groundDistance);
      renderer.render(scene, camera);
    },
    setPaused: function (p) {
      gait.state.paused = !!p;
      syncPlayPauseUI();
    },
    setTimeOfDay: function (key) {
      env.applyTimeOfDay(key);
      updateActiveButton('[data-tod]', 'data-tod', key);
      renderer.render(scene, camera);
    },
    setHudVisible: function (vis) {
      const ui = document.getElementById('hud-root');
      if (ui) ui.style.display = vis ? '' : 'none';
    },
    getJointPositions: function () {
      giraffe.root.updateMatrixWorld(true);
      const out = {};
      for (const b of giraffe.rig.bones) {
        const v = new THREE.Vector3().setFromMatrixPosition(b.matrixWorld);
        out[b.name] = [+v.x.toFixed(3), +v.y.toFixed(3), +v.z.toFixed(3)];
      }
      return out;
    },
    renderNow: function () {
      renderer.render(scene, camera);
    },
  };
})();
