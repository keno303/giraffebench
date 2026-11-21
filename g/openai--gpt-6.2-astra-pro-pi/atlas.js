/* Entry point. No imports, fetches, loaders for local files, or build tools are required. */
"use strict";
(() => {
  const get = (id) => document.getElementById(id);
  const host = get("scene"),
    viewer = document.querySelector(".viewer"),
    select = get("view");
  const guide = get("guide"),
    reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const start = 0.31,
    presets = {
      profile: { x: 0.37, y: 2.62, z: 0, yaw: 0.31, pitch: -0.051, h: 6.26 },
      head: { x: 1.57, y: 4.57, z: 0, yaw: 0.51, pitch: -0.064, h: 2.18 },
      gait: { x: -0.02, y: 1.2, z: 0, yaw: 0.23, pitch: 0.012, h: 3.06 },
      wide: { x: 0.2, y: 2.25, z: 0, yaw: -0.31, pitch: 0.011, h: 8.63 },
    };
  let playing = !reduced,
    rate = 1,
    fallback = false,
    video,
    lost = false;
  let renderer,
    scene,
    camera,
    animal,
    habitat,
    time = start,
    last = 0,
    prevTime = NaN;
  let aspect = 1,
    first = true,
    dirty = true,
    base = "profile",
    dest = { ...presets.profile },
    view = { ...dest };

  function updateLabels() {
    get("playicon").setAttribute("href", playing ? "#pause" : "#play");
    get("toggle").setAttribute("aria-label", playing ? "Pause animation" : "Resume animation");
    get("status").textContent = fallback
      ? playing
        ? "Recorded observation"
        : "Observation paused"
      : playing
        ? "Live observation"
        : "Observation paused";
    get("statusDot").style.background = playing ? "" : "#a27a4a";
  }
  function play(value) {
    playing = value;
    if (video) {
      if (playing)
        video.play().catch(() => {
          playing = false;
          updateLabels();
        });
      else video.pause();
    }
    last = 0;
    dirty = true;
    updateLabels();
  }
  get("toggle").onclick = () => play(!playing);
  const speeds = document.querySelectorAll("[data-rate]");
  speeds.forEach((b) => {
    b.setAttribute("aria-pressed", Number(b.dataset.rate) === rate);
    b.onclick = () => {
      rate = Number(b.dataset.rate);
      if (video) video.playbackRate = rate;
      speeds.forEach((x) => {
        x.classList.toggle("active", x === b);
        x.setAttribute("aria-pressed", x === b);
      });
    };
  });
  get("full").onclick = async () => {
    try {
      if (viewer.classList.contains("maximized")) viewer.classList.remove("maximized");
      else if (document.fullscreenElement) await document.exitFullscreen();
      else if (viewer.requestFullscreen) await viewer.requestFullscreen();
      else viewer.classList.toggle("maximized");
    } catch {
      viewer.classList.toggle("maximized");
    }
  };
  document.addEventListener("fullscreenchange", () => {
    get("full").setAttribute(
      "aria-label",
      document.fullscreenElement ? "Exit fullscreen" : "Toggle fullscreen",
    );
    if (guide.open) guide.close();
    (document.fullscreenElement ? viewer : document.body).appendChild(guide);
  });
  get("guideOpen").onclick = () => guide.showModal();
  guide.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      guide.close();
    }
  });
  guide.addEventListener("click", (e) => {
    if (e.target === guide) {
      const r = guide.getBoundingClientRect();
      if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom)
        guide.close();
    }
  });
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") viewer.classList.remove("maximized");
    if (
      e.code === "Space" &&
      !e.repeat &&
      !guide.open &&
      !["BUTTON", "SELECT", "INPUT", "A"].includes(document.activeElement.tagName)
    ) {
      e.preventDefault();
      play(!playing);
    }
  });
  document.addEventListener("visibilitychange", () => {
    last = 0;
    dirty = true;
  });

  // A locally recorded view of this same animated scene is available if WebGL is unavailable.
  function recording() {
    fallback = true;
    host.setAttribute("aria-busy", "false");
    video = document.createElement("video");
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    video.poster = "assets/field-still.jpg";
    video.src = "assets/walk-study.mp4";
    video.preload = "auto";
    video.setAttribute("aria-label", "Recorded walking study of the giraffe (WebGL unavailable)");
    host.prepend(video);
    get("guideOpen").hidden = true;
    const note = document.createElement("option");
    note.textContent = "Recorded view";
    note.value = "recording";
    select.replaceChildren(note);
    select.disabled = true;
    video.onerror = () => {
      get("error").hidden = false;
      play(false);
      get("toggle").disabled = true;
    };
    play(playing);
  }
  try {
    renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
  } catch {
    recording();
    return;
  }

  const canvas = renderer.domElement;
  const resolutionCap = Math.min(devicePixelRatio || 1, host.clientWidth < 650 ? 1.5 : 1.75);
  renderer.setPixelRatio(resolutionCap);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.06;
  canvas.tabIndex = 0;
  canvas.setAttribute("role", "img");
  canvas.setAttribute(
    "aria-label",
    "A walking reticulated giraffe. Arrow keys orbit, plus and minus zoom, Space pauses, R reframes.",
  );
  host.prepend(canvas);
  THREE.DefaultLoadingManager.onLoad = () => {
    dirty = true;
  };
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(30, 1, 0.045, 180);
  animal = makeGiraffe();
  scene.add(animal.root);
  habitat = makeHabitat(scene, renderer);
  canvas.addEventListener("webglcontextlost", (e) => {
    e.preventDefault();
    lost = true;
    get("status").textContent = "Restoring display";
  });
  canvas.addEventListener("webglcontextrestored", () => {
    lost = false;
    dirty = true;
    last = 0;
    updateLabels();
  });
  function resize() {
    const r = host.getBoundingClientRect();
    renderer.setSize(Math.max(1, r.width), Math.max(1, r.height), false);
    aspect = r.width / Math.max(1, r.height);
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
    dirty = true;
  }
  new ResizeObserver(resize).observe(host);
  resize();
  updateLabels();
  function preset(name) {
    const yaw = dest.yaw;
    base = name;
    dest = { ...presets[name] };
    dest.yaw += Math.round((yaw - dest.yaw) / TAU) * TAU;
    if (reduced) view = { ...dest };
    dirty = true;
  }
  select.onchange = () => preset(select.value);
  const pointers = new Map();
  function pinch() {
    const a = [...pointers.values()];
    return a.length === 2 ? Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y) : 0;
  }
  canvas.onpointerdown = (e) => {
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    canvas.focus({ preventScroll: true });
  };
  canvas.onpointermove = (e) => {
    const p = pointers.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x,
      dy = e.clientY - p.y,
      prev = pinch();
    p.x = e.clientX;
    p.y = e.clientY;
    if (pointers.size > 1) {
      let next = pinch();
      if (prev > 0 && next > 0) dest.h = clamp((dest.h * prev) / next, 1.45, 13);
    } else {
      dest.yaw -= dx * 0.0064;
      dest.pitch = clamp(dest.pitch + dy * 0.004, -0.075, 1.13);
    }
    dirty = true;
  };
  canvas.onpointerup =
    canvas.onpointercancel =
    canvas.onlostpointercapture =
      (e) => pointers.delete(e.pointerId);
  canvas.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      dest.h = clamp(dest.h * Math.exp(clamp(e.deltaY, -100, 100) * 0.0015), 1.45, 13);
      dirty = true;
    },
    { passive: false },
  );
  canvas.ondblclick = () => preset(base);
  canvas.onkeydown = (e) => {
    switch (e.key) {
      case "ArrowLeft":
        dest.yaw += 0.105;
        break;
      case "ArrowRight":
        dest.yaw -= 0.105;
        break;
      case "ArrowUp":
        dest.pitch = clamp(dest.pitch + 0.07, -0.075, 1.13);
        break;
      case "ArrowDown":
        dest.pitch = clamp(dest.pitch - 0.07, -0.075, 1.13);
        break;
      case "+":
      case "=":
        dest.h = clamp(dest.h * 0.9, 1.45, 13);
        break;
      case "-":
        dest.h = clamp(dest.h / 0.9, 1.45, 13);
        break;
      case "r":
      case "R":
        preset(base);
        break;
      default:
        return;
    }
    e.preventDefault();
    dirty = true;
  };
  const target = new THREE.Vector3();
  let slow = 0,
    samples = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    if (lost || document.hidden) {
      last = 0;
      return;
    }
    const dt = last ? Math.min(0.1, (now - last) * 0.001) : 0;
    last = now;
    if (playing) time += dt * rate;
    const k = first || reduced ? 1 : 1 - Math.exp(-dt * 9.2);
    let cameraMoved = false;
    for (let key in view) {
      let diff = dest[key] - view[key];
      if (Math.abs(diff) > 1e-5) {
        view[key] += k * diff;
        cameraMoved = true;
      } else view[key] = dest[key];
    }
    const animate = prevTime !== time;
    if (!first && !dirty && !animate && !cameraMoved) return;
    let d = (view.h * 0.5) / Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5));
    d *= Math.max(1, (base === "head" ? 0.56 : base === "gait" ? 0.9 : 0.66) / aspect);
    target.set(view.x, view.y, view.z);
    camera.position.set(
      target.x + d * Math.sin(view.yaw) * Math.cos(view.pitch),
      target.y + d * Math.sin(view.pitch),
      target.z + d * Math.cos(view.yaw) * Math.cos(view.pitch),
    );
    camera.lookAt(target);
    if (animate) animal.update(time);
    habitat.update((time - start) * animal.velocity, time, camera, animal.legs);
    renderer.render(scene, camera);
    prevTime = time;
    dirty = false;
    if (first) {
      first = false;
      host.setAttribute("aria-busy", "false");
    }
    // Bound the fragment workload on small or high-DPI integrated GPUs.
    if (playing && ++samples > 70) {
      if (dt > 0.043) slow++;
      else slow = Math.max(0, slow - 1);
      if (slow > 38 && renderer.getPixelRatio() > 0.8) {
        renderer.setPixelRatio(Math.max(0.8, renderer.getPixelRatio() * 0.83));
        slow = 0;
        dirty = true;
      }
    }
  }
  requestAnimationFrame(frame);
})();
