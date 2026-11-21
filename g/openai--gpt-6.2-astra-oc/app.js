(() => {
  "use strict";
  const $ = (id) => document.getElementById(id),
    stage = $("stage"),
    cv = $("scene"),
    viewer = $("viewer");
  const notes = $("notes");
  $("journal").onclick = () => notes.showModal();
  notes.querySelector("button").onclick = () => notes.close();
  notes.addEventListener("click", (e) => {
    if (e.target !== notes) return;
    const r = notes.getBoundingClientRect();
    if (
      e.clientX < r.left ||
      e.clientX > r.right ||
      e.clientY < r.top ||
      e.clientY > r.bottom
    )
      notes.close();
  });
  $("fullscreen").onclick = async () => {
    if (document.fullscreenElement) await document.exitFullscreen();
    else if (viewer.classList.contains("full")) viewer.classList.remove("full");
    else {
      try {
        await viewer.requestFullscreen();
      } catch {
        viewer.classList.add("full");
      }
    }
  };
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") viewer.classList.remove("full");
  });
  function displayPlaying(playing) {
    $("play").setAttribute(
      "aria-label",
      playing ? "Pause walk" : "Resume walk",
    );
    $("play").title = playing ? "Pause walk (Space)" : "Resume walk (Space)";
    $("playIcon").textContent = playing ? "Ⅱ" : "▶";
    $("state").textContent = playing ? "Walking" : "Paused";
  }
  function bindSpeed(change) {
    document.querySelectorAll("[data-speed]").forEach(
      (b) =>
        (b.onclick = () => {
          change(+b.dataset.speed);
          document.querySelectorAll("[data-speed]").forEach((d) => {
            d.classList.toggle("active", d === b);
            d.setAttribute("aria-pressed", String(d === b));
          });
        }),
    );
  }
  let lastSecond = -1;
  function displayTime(time) {
    const s = Math.floor(time);
    if (s === lastSecond) return;
    lastSecond = s;
    $("timestamp").textContent =
      "T+ " +
      [Math.floor(s / 3600), Math.floor(s / 60) % 60, s % 60]
        .map((i) => String(i).padStart(2, "0"))
        .join(":");
  }
  // A local capture of this same scene keeps playback available on systems
  // whose browser has WebGL disabled. The interactive path below is primary.
  function recordedFeed() {
    const film = document.createElement("video");
    film.muted = true;
    film.loop = true;
    film.playsInline = true;
    film.poster = "assets/field-poster.webp";
    film.src = "assets/field-walk.mp4";
    film.setAttribute("aria-label", "Recorded walking giraffe");
    cv.replaceWith(film);
    $("loading").hidden = true;
    $("view").replaceChildren(new Option("Recorded view", "film"));
    $("view").disabled = true;
    $("resetCam").disabled = true;
    document.querySelector(".camid").textContent = "FILM — 01";
    document.querySelector(".bottom-right").textContent =
      "Local recording · WebGL unavailable";
    film.onplay = () => displayPlaying(true);
    film.onpause = () => displayPlaying(false);
    film.ontimeupdate = () => displayTime(film.currentTime);
    const play = () => film.play().catch(() => displayPlaying(false));
    const toggle = () => (film.paused ? play() : film.pause());
    $("play").onclick = toggle;
    bindSpeed((n) => (film.playbackRate = n));
    window.addEventListener("keydown", (e) => {
      if (
        !notes.open &&
        e.code === "Space" &&
        !/BUTTON|SELECT/.test(e.target.tagName)
      ) {
        e.preventDefault();
        toggle();
      }
    });
    play();
  }
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas: cv,
      antialias: true,
      powerPreference: "high-performance",
    });
  } catch {
    recordedFeed();
    return;
  }
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.8));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.94;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  let dirty = true;
  THREE.DefaultLoadingManager.onLoad = () => {
    $("loading").hidden = true;
    stage.classList.add("ready");
    dirty = true;
  };
  const scene = new THREE.Scene(),
    camera = new THREE.PerspectiveCamera(33, 1, 0.07, 225);
  let habitat = makeHabitat(scene, renderer),
    animal = makeGiraffe();
  scene.add(animal.root);
  let elapsed = 0,
    speed = 1,
    playing = true,
    last = 0;
  let yaw = 0.29,
    pitch = 0.014,
    radius = 12,
    cx = 0.4,
    cy = 2.88,
    wanted = {};
  const shots = {
    tracking: [0.29, 0.014, 11.95, 0.39, 2.89],
    portrait: [0.51, 0.035, 3.85, 1.53, 5.04],
    wide: [-0.29, 0.105, 18.7, 0.15, 2.5],
  };
  let station = null;
  function shot(name, instant = false) {
    let [y, p, r, x, h] = shots[name];
    // In the wide view, the tripod stays on the ground while the animal
    // crosses the frame. The next tripod takes over at the end of a pass.
    station =
      name === "wide"
        ? {
            start: elapsed * animal.speed,
            span: Math.min(13, Math.max(3.6, 5.6 * camera.aspect)),
            pass: 0,
          }
        : null;
    if (station) x += station.span / 2;
    y = yaw + Math.atan2(Math.sin(y - yaw), Math.cos(y - yaw));
    wanted = { y, p, r, x, h };
    if (instant) {
      yaw = y;
      pitch = p;
      radius = r;
      cx = x;
      cy = h;
    }
    document.querySelector(".camid").textContent =
      "CAM — 0" + { tracking: 1, portrait: 2, wide: 3 }[name];
  }
  shot("tracking", true);
  function resize() {
    let r = stage.getBoundingClientRect();
    renderer.setSize(r.width, r.height, false);
    camera.aspect = r.width / r.height;
    camera.fov = camera.aspect < 1 ? 38 : 33;
    camera.updateProjectionMatrix();
    dirty = true;
  }
  new ResizeObserver(resize).observe(stage);
  resize();
  function run(now) {
    requestAnimationFrame(run);
    let dt = last ? Math.min(0.5, (now - last) / 1000) : 0;
    last = now;
    if (playing) {
      elapsed += dt * speed;
      animal.update(elapsed);
    }
    if (station) {
      const distance = elapsed * animal.speed - station.start;
      const pass = Math.floor(distance / station.span);
      wanted.x = shots.wide[3] + station.span / 2 - (distance % station.span);
      if (pass !== station.pass) cx = wanted.x;
      station.pass = pass;
    }
    let moving =
      Math.abs(wanted.y - yaw) +
        Math.abs(wanted.p - pitch) +
        Math.abs(wanted.r - radius) +
        Math.abs(wanted.x - cx) +
        Math.abs(wanted.h - cy) >
      0.0001;
    if (!playing && !moving && !dirty) return;
    dirty = false;
    let k = 1 - Math.exp(-dt * 9);
    yaw += (wanted.y - yaw) * k;
    pitch += (wanted.p - pitch) * k;
    radius += (wanted.r - radius) * k;
    cx += (wanted.x - cx) * k;
    cy += (wanted.h - cy) * k;
    let r = radius * Math.max(1, 0.9 / camera.aspect);
    camera.position.set(
      cx + Math.sin(yaw) * Math.cos(pitch) * r,
      Math.max(0.32, cy + Math.sin(pitch) * r),
      r * Math.cos(yaw) * Math.cos(pitch),
    );
    camera.lookAt(cx, cy, 0);
    habitat.update(elapsed * animal.speed, camera, animal.hooves);
    renderer.render(scene, camera);
    displayTime(elapsed);
  }
  requestAnimationFrame(run);
  function toggle() {
    playing = !playing;
    displayPlaying(playing);
  }
  $("play").onclick = toggle;
  bindSpeed((n) => (speed = n));
  $("view").onchange = (e) => shot(e.target.value);
  $("resetCam").onclick = () => shot($("view").value);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v)),
    pointers = new Map();
  function distance() {
    let [a, b] = [...pointers.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  }
  cv.addEventListener("pointerdown", (e) => {
    cv.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  });
  cv.addEventListener("pointermove", (e) => {
    let o = pointers.get(e.pointerId);
    if (!o) return;
    let old = pointers.size === 2 ? distance() : 0;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (old) {
      wanted.r = clamp((wanted.r * old) / Math.max(1, distance()), 2.4, 25);
    } else {
      wanted.y -= (e.clientX - o.x) * 0.006;
      wanted.p = clamp(wanted.p + (e.clientY - o.y) * 0.004, -0.14, 0.65);
    }
  });
  cv.onlostpointercapture = (e) => pointers.delete(e.pointerId);
  cv.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      wanted.r = clamp(
        wanted.r * Math.exp(clamp(e.deltaY, -160, 160) * 0.0016),
        2.4,
        25,
      );
    },
    { passive: false },
  );
  window.addEventListener("keydown", (e) => {
    if (notes.open) return;
    if (/SELECT|BUTTON/.test(e.target.tagName)) return;
    if (e.code === "Space") {
      e.preventDefault();
      toggle();
    }
    if (e.key.toLowerCase() === "r") shot($("view").value);
    if (e.target === cv) {
      if (e.key.startsWith("Arrow")) e.preventDefault();
      if (e.key === "ArrowLeft") wanted.y -= 0.13;
      if (e.key === "ArrowRight") wanted.y += 0.13;
      if (e.key === "ArrowUp") wanted.p = clamp(wanted.p + 0.08, -0.14, 0.65);
      if (e.key === "ArrowDown") wanted.p = clamp(wanted.p - 0.08, -0.14, 0.65);
    }
  });
  document.addEventListener("visibilitychange", () => (last = 0));
})();
