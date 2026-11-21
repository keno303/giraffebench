(function (global) {
  'use strict';

  const App = (global.GiraffeApp = global.GiraffeApp || {});
  const { clamp, lerp } = App.Math;

  const CAMERA_PRESETS = {
    hero: {
      label: '3/4 Hero',
      offset: new THREE.Vector3(7.4, 2.75, 5.8),
      target: new THREE.Vector3(0.0, 2.48, 0.55),
      trackHead: false,
    },
    side: {
      label: 'Side Profile',
      offset: new THREE.Vector3(8.6, 2.58, 0.55),
      target: new THREE.Vector3(0.0, 2.48, 0.55),
      trackHead: false,
    },
    front: {
      label: 'Front 3/4',
      offset: new THREE.Vector3(3.8, 2.72, 8.6),
      target: new THREE.Vector3(0.0, 2.52, 0.65),
      trackHead: false,
    },
    head: {
      label: 'Head Portrait',
      offset: new THREE.Vector3(0.95, 0.14, 0.90),
      target: new THREE.Vector3(0.0, 0.04, 0.28),
      trackHead: true,
    },
    low: {
      label: 'Low Savanna',
      offset: new THREE.Vector3(6.4, 0.92, 5.6),
      target: new THREE.Vector3(0.0, 2.58, 0.60),
      trackHead: false,
    },
    hooves: {
      label: 'Hooves & Gait',
      offset: new THREE.Vector3(2.85, 0.72, 0.95),
      target: new THREE.Vector3(0.0, 0.58, 0.00),
      trackHead: false,
    },
  };

  function parseQueryParams() {
    const out = {};
    const q = (global.location && global.location.search) || '';
    const params = new URLSearchParams(q);
    for (const [k, v] of params.entries()) {
      out[k] = v;
    }
    return out;
  }

  function init() {
    const query = parseQueryParams();
    const container = document.getElementById('viewport');

    // Renderer setup (Photorealistic PBR + ACES Filmic + Soft Shadows)
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
    });
    renderer.setPixelRatio(Math.min(global.devicePixelRatio || 1, 2));
    renderer.setSize(global.innerWidth, global.innerHeight);
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);

    // Scene & Atmospheric Fog
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0xdfc49b, 0.0052);

    // Camera & OrbitControls
    const camera = new THREE.PerspectiveCamera(
      38,
      global.innerWidth / global.innerHeight,
      0.08,
      600
    );
    const controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.065;
    controls.maxPolarAngle = Math.PI * 0.495;
    controls.minDistance = 0.75;
    controls.maxDistance = 38;

    // Three-point Natural Savanna Lighting
    const sun = new THREE.DirectionalLight(0xffe4b8, 2.75);
    sun.castShadow = true;
    sun.shadow.mapSize.width = 2048;
    sun.shadow.mapSize.height = 2048;
    sun.shadow.camera.near = 6;
    sun.shadow.camera.far = 110;
    const dShadow = 10.5;
    sun.shadow.camera.left = -dShadow;
    sun.shadow.camera.right = dShadow;
    sun.shadow.camera.top = dShadow;
    sun.shadow.camera.bottom = -dShadow;
    sun.shadow.bias = -0.00035;
    sun.shadow.normalBias = 0.025;
    scene.add(sun);
    scene.add(sun.target);

    const hemi = new THREE.HemisphereLight(0x9bc0ea, 0xc48e54, 0.92);
    scene.add(hemi);

    // Subtle warm sunlit rim/bounce light from opposite rear-quarter
    const rim = new THREE.DirectionalLight(0xffc985, 0.45);
    scene.add(rim);
    scene.add(rim.target);

    const lights = {
      sun,
      hemi,
      rim,
      sunOffset: new THREE.Vector3(38, 22, 24),
    };

    // Build Savanna Environment
    const env = App.Environment.createSavannaEnvironment(scene);

    // Generate PBR Environment Map (PMREM) from the procedural sky dome for realistic eye & coat reflections
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    pmremGenerator.compileEquirectangularShader();
    let envRT = null;

    function rebuildEnvMap() {
      const envScene = new THREE.Scene();
      const skyClone = env.sky.mesh.clone();
      skyClone.position.set(0, 0, 0);
      envScene.add(skyClone);
      if (envRT) envRT.dispose();
      envRT = pmremGenerator.fromScene(envScene, 0.04);
      scene.environment = envRT.texture;
    }

    const initialLight = query.light && App.Environment.LIGHTING_PRESETS[query.light]
      ? query.light
      : 'golden';
    env.applyPreset(initialLight, lights, renderer);
    rebuildEnvMap();

    // Build Realistic Skinned Giraffe + Gait Controller
    const giraffe = App.GiraffeMesh.createGiraffe();
    scene.add(giraffe.root);

    function syncCoatLighting(presetKey) {
      const cu = giraffe.materials.coatMat.userData.coatUniforms;
      if (!cu) return;
      const p = App.Environment.LIGHTING_PRESETS[presetKey] || App.Environment.LIGHTING_PRESETS.golden;
      cu.uSunDir.value.copy(p.sunPos).normalize();
      if (presetKey === 'sunset') cu.uRimColor.value.setRGB(0.45, 0.21, 0.08);
      else if (presetKey === 'midday') cu.uRimColor.value.setRGB(0.24, 0.20, 0.14);
      else cu.uRimColor.value.setRGB(0.36, 0.23, 0.10);
    }
    syncCoatLighting(initialLight);

    const gait = App.Gait.createGaitController(giraffe);
    gait.state.onFootStrike = (worldPos) => {
      env.spawnHoofDust(worldPos);
    };

    // Apply optional query params for deterministic inspection
    if (query.speed !== undefined) {
      gait.state.speed = clamp(parseFloat(query.speed) || 1.0, 0.1, 2.5);
    }
    if (query.phase !== undefined) {
      gait.setPhase(parseFloat(query.phase) || 0.0);
    } else {
      gait.update(0);
    }
    if (query.paused === '1' || query.paused === 'true') {
      gait.state.paused = true;
    }

    // Camera Tracking & Smooth Preset Blending
    let activePresetKey = query.cam && CAMERA_PRESETS[query.cam] ? query.cam : 'hero';
    let followEnabled = true;
    let camTransition = 0; // 1 -> smoothly easing into preset; 0 -> user free orbit
    const desiredCamPos = new THREE.Vector3();
    const desiredTarget = new THREE.Vector3();
    const headWorldPos = new THREE.Vector3();
    const prevAnchor = new THREE.Vector3();
    const currAnchor = new THREE.Vector3();

    function getAnchorPos(preset, out) {
      if (preset.trackHead) {
        const headBone = giraffe.skelData.bones[giraffe.skelData.index.head];
        headBone.getWorldPosition(out);
      } else {
        out.set(0, giraffe.root.position.y, gait.state.walkZ);
      }
      return out;
    }

    function applyCameraPreset(key, immediate) {
      const preset = CAMERA_PRESETS[key] || CAMERA_PRESETS.hero;
      activePresetKey = key;
      getAnchorPos(preset, currAnchor);
      desiredTarget.copy(currAnchor).add(preset.target);
      desiredCamPos.copy(currAnchor).add(preset.offset);

      if (immediate) {
        camera.position.copy(desiredCamPos);
        controls.target.copy(desiredTarget);
        controls.update();
        camTransition = 0;
      } else {
        camTransition = 1.0;
      }
      prevAnchor.copy(currAnchor);
      updatePresetButtonsUI();
    }

    // Cancel auto-transition if user manually grabs OrbitControls
    controls.addEventListener('start', () => {
      camTransition = 0;
    });

    // -------------------------------------------------------------------------
    // HUD / UI BINDINGS
    // -------------------------------------------------------------------------
    const uiPanel = document.getElementById('hud-panel');
    const toggleUiBtn = document.getElementById('btn-toggle-ui');
    const playPauseBtn = document.getElementById('btn-play-pause');
    const speedSlider = document.getElementById('slider-speed');
    const speedValue = document.getElementById('speed-val');
    const followCheck = document.getElementById('chk-follow');
    const camBtnContainer = document.getElementById('cam-buttons');
    const lightBtnContainer = document.getElementById('light-buttons');
    const hoofPills = {
      hl: document.getElementById('hoof-hl'),
      fl: document.getElementById('hoof-fl'),
      hr: document.getElementById('hoof-hr'),
      fr: document.getElementById('hoof-fr'),
    };

    function setUIVisible(visible) {
      if (visible) {
        uiPanel.classList.remove('hidden');
        toggleUiBtn.textContent = 'Hide UI';
      } else {
        uiPanel.classList.add('hidden');
        toggleUiBtn.textContent = 'Controls';
      }
    }

    if (query.ui === '0' || query.ui === 'false') {
      setUIVisible(false);
      toggleUiBtn.style.display = 'none';
      const titleBadge = document.getElementById('title-badge');
      if (titleBadge) titleBadge.style.display = 'none';
    }

    toggleUiBtn.addEventListener('click', () => {
      setUIVisible(uiPanel.classList.contains('hidden'));
    });

    function updatePlayBtn() {
      playPauseBtn.textContent = gait.state.paused ? '▶ Play' : '❚❚ Pause';
    }
    updatePlayBtn();

    playPauseBtn.addEventListener('click', () => {
      gait.state.paused = !gait.state.paused;
      updatePlayBtn();
    });

    speedSlider.value = String(gait.state.speed);
    speedValue.textContent = `${gait.state.speed.toFixed(2)}×`;
    speedSlider.addEventListener('input', () => {
      gait.state.speed = parseFloat(speedSlider.value);
      speedValue.textContent = `${gait.state.speed.toFixed(2)}×`;
    });

    followCheck.checked = followEnabled;
    followCheck.addEventListener('change', () => {
      followEnabled = followCheck.checked;
    });

    // Camera preset buttons
    const camButtons = {};
    Object.keys(CAMERA_PRESETS).forEach((key) => {
      const btn = document.createElement('button');
      btn.className = 'pill-btn';
      btn.textContent = CAMERA_PRESETS[key].label;
      btn.addEventListener('click', () => applyCameraPreset(key, false));
      camBtnContainer.appendChild(btn);
      camButtons[key] = btn;
    });

    function updatePresetButtonsUI() {
      Object.keys(camButtons).forEach((k) => {
        camButtons[k].classList.toggle('active', k === activePresetKey);
      });
    }
    applyCameraPreset(activePresetKey, true);

    // Lighting preset buttons
    const lightButtons = {};
    let activeLightKey = initialLight;
    Object.keys(App.Environment.LIGHTING_PRESETS).forEach((key) => {
      const btn = document.createElement('button');
      btn.className = 'pill-btn';
      btn.textContent = App.Environment.LIGHTING_PRESETS[key].name;
      btn.addEventListener('click', () => {
        activeLightKey = key;
        env.applyPreset(key, lights, renderer);
        syncCoatLighting(key);
        rebuildEnvMap();
        updateLightButtonsUI();
      });
      lightBtnContainer.appendChild(btn);
      lightButtons[key] = btn;
    });

    function updateLightButtonsUI() {
      Object.keys(lightButtons).forEach((k) => {
        lightButtons[k].classList.toggle('active', k === activeLightKey);
      });
    }
    updateLightButtonsUI();

    // Keyboard shortcuts (Space = Pause, H = Toggle UI, L = Cycle Lighting, R = Reset View, 1..6 = Camera Presets)
    const presetOrder = Object.keys(CAMERA_PRESETS);
    const lightOrder = Object.keys(App.Environment.LIGHTING_PRESETS);
    global.addEventListener('keydown', (e) => {
      if (e.code === 'Space') {
        e.preventDefault();
        gait.state.paused = !gait.state.paused;
        updatePlayBtn();
      } else if (e.key === 'h' || e.key === 'H') {
        setUIVisible(uiPanel.classList.contains('hidden'));
      } else if (e.key === 'l' || e.key === 'L') {
        const nextIdx = (lightOrder.indexOf(activeLightKey) + 1) % lightOrder.length;
        activeLightKey = lightOrder[nextIdx];
        env.applyPreset(activeLightKey, lights, renderer);
        syncCoatLighting(activeLightKey);
        rebuildEnvMap();
        updateLightButtonsUI();
      } else if (e.key === 'r' || e.key === 'R') {
        applyCameraPreset('hero', false);
      } else if (e.key >= '1' && e.key <= '6') {
        const idx = parseInt(e.key, 10) - 1;
        if (presetOrder[idx]) applyCameraPreset(presetOrder[idx], false);
      }
    });

    // Resize handler
    global.addEventListener('resize', () => {
      camera.aspect = global.innerWidth / global.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(global.innerWidth, global.innerHeight);
    });

    // -------------------------------------------------------------------------
    // ANIMATION LOOP
    // -------------------------------------------------------------------------
    let lastTime = performance.now();
    const deltaAnchor = new THREE.Vector3();

    function animate(now) {
      requestAnimationFrame(animate);
      const dt = Math.min((now - lastTime) * 0.001, 0.05);
      lastTime = now;

      // Update giraffe biomechanics & IK
      gait.update(dt);

      // Update savanna environment (terrain snap, grass wrap, dust puffs, birds, hoof shadows)
      const gz = gait.state.walkZ;
      const gy = giraffe.root.position.y;
      env.update(dt, gait.state.time, gz);
      env.updateHoofShadows(gait.state.hoofWorldPositions);

      // Live ipsilateral pacing footfall pills
      for (const lk of ['hl', 'fl', 'hr', 'fr']) {
        if (hoofPills[lk]) {
          hoofPills[lk].classList.toggle('stance', !gait.state.legInSwing[lk]);
        }
      }

      // Keep sun & tight shadow frustum centered on walking giraffe
      sun.target.position.set(0, gy + 2.0, gz + 0.5);
      sun.position.copy(sun.target.position).add(lights.sunOffset);
      sun.target.updateMatrixWorld();

      rim.target.position.set(0, gy + 2.4, gz + 0.5);
      rim.position.set(
        -lights.sunOffset.x * 0.55,
        gy + 12.0,
        gz - lights.sunOffset.z * 0.65
      );
      rim.target.updateMatrixWorld();

      // Update camera tracking smoothly
      const preset = CAMERA_PRESETS[activePresetKey];
      getAnchorPos(preset, currAnchor);

      if (camTransition > 0.001) {
        desiredTarget.copy(currAnchor).add(preset.target);
        desiredCamPos.copy(currAnchor).add(preset.offset);
        const alpha = 1 - Math.exp(-5.5 * dt);
        camera.position.lerp(desiredCamPos, alpha);
        controls.target.lerp(desiredTarget, alpha);
        if (camera.position.distanceTo(desiredCamPos) < 0.02) {
          camTransition = 0;
        }
      } else if (followEnabled) {
        deltaAnchor.subVectors(currAnchor, prevAnchor);
        camera.position.add(deltaAnchor);
        controls.target.add(deltaAnchor);
      }
      prevAnchor.copy(currAnchor);

      controls.update();
      renderer.render(scene, camera);
    }

    // Expose inspection hook for debugging / verification
    App.instance = {
      scene,
      camera,
      renderer,
      giraffe,
      gait,
      env,
      applyCameraPreset,
    };

    requestAnimationFrame(animate);
  }

  global.addEventListener('DOMContentLoaded', init);
})(window);
