/* Orthographic tracking stage. No network, file fetches, or module loader. */
(() => {
  'use strict';
  const $ = (s) => document.querySelector(s),
    T = THREE,
    canvas = $('#viewport'),
    stage = $('#stage'),
    notice = $('#notice');
  let renderer;
  try {
    renderer = new T.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
  } catch (err) {
    notice.textContent = 'A WebGL-capable browser is needed for this study.';
    $('.online').textContent = 'ENGINE OFFLINE';
    return;
  }
  if (
    !renderer.capabilities.isWebGL2 &&
    (!renderer.capabilities.maxVertexTextures || !renderer.extensions.has('OES_texture_float'))
  ) {
    notice.textContent = 'This study needs WebGL 2 or floating-point vertex textures.';
    $('.online').textContent = 'ENGINE OFFLINE';
    return;
  }
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFSoftShadowMap;
  renderer.outputColorSpace = T.SRGBColorSpace;
  renderer.setClearColor(0x000000, 0);
  const scene = new T.Scene(),
    ortho = new T.OrthographicCamera(-5, 5, 3.3, -3.3, 0.1, 120),
    fieldLens = new T.PerspectiveCamera(28, 1, 0.12, 310),
    V = (x, y, z) => new T.Vector3(x, y, z);
  let camera = ortho,
    field = false,
    habitat = null;
  const sky = new T.HemisphereLight(0xfff5e3, 0xccbba4, 1.53);
  scene.add(sky);
  function lamp(c, i, x, y, z) {
    let l = new T.DirectionalLight(c, i);
    l.position.set(x, y, z);
    scene.add(l);
    return l;
  }
  let sun = lamp(0xffebcc, 2.25, 3.8, 8, 5.2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -5, right: 5, top: 7, bottom: -4, near: 0.1, far: 25 });
  sun.shadow.normalBias = 0.009;
  sun.shadow.bias = -0.00025;
  lamp(0xffddb3, 1.85, -4, 6, -3);
  lamp(0xd7e9ff, 0.46, 3, 2, -4);
  const grid = new T.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    extensions: { derivatives: true },
    uniforms: { travel: { value: 0 } },
    vertexShader: `varying vec3 v;void main(){vec4 p=modelMatrix*vec4(position,1.);v=p.xyz;gl_Position=projectionMatrix*viewMatrix*p;}`,
    fragmentShader: `varying vec3 v;uniform float travel;float lines(vec2 p){vec2 d=max(fwidth(p),vec2(.0001));vec2 a=abs(fract(p-.5)-.5)/d;return 1.-min(min(a.x,a.y),1.);}void main(){vec2 p=v.xz+vec2(travel,0.);float fade=exp(-dot(v.xz,v.xz)*.007);float a=lines(p*2.)*.095+lines(p*.5)*.125;vec2 d=abs(fract(p*.5+.5)-.5);float crossMark=max((1.-smoothstep(.019,.026,d.x))*(1.-smoothstep(.002,.004,d.y)),(1.-smoothstep(.019,.026,d.y))*(1.-smoothstep(.002,.004,d.x)));gl_FragColor=vec4(.62,.70,.69,fade*(a+crossMark*.23));}`,
  });
  function floor(mat, y, sz = 150) {
    let o = new T.Mesh(new T.PlaneGeometry(sz, sz), mat);
    o.rotation.x = -Math.PI / 2;
    o.position.y = y;
    scene.add(o);
    return o;
  }
  let floorGrid = floor(grid, -0.009);
  floorGrid.renderOrder = -2;
  let shadow = floor(new T.ShadowMaterial({ opacity: 0.34, depthWrite: false }), -0.005);
  shadow.receiveShadow = true;
  shadow.renderOrder = -1;
  // Soft contact occlusion supports the sharp, directional projected shadow.
  function shade(x, z, w, d, opacity) {
    let c = document.createElement('canvas');
    c.width = c.height = 96;
    let ctx = c.getContext('2d'),
      g = ctx.createRadialGradient(48, 48, 0, 48, 48, 48);
    g.addColorStop(0, 'rgba(4,8,9,1)');
    g.addColorStop(0.43, 'rgba(4,8,9,.65)');
    g.addColorStop(1, 'rgba(4,8,9,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 96, 96);
    let o = floor(
      new T.MeshBasicMaterial({
        map: new T.CanvasTexture(c),
        transparent: true,
        opacity,
        depthWrite: false,
      }),
      -0.002,
      1,
    );
    o.scale.set(w, d, 1);
    o.position.x = x;
    o.position.z = z;
    return o;
  }
  const occlusion = shade(0, 0, 3.7, 1.4, 0.34);
  let animal;
  try {
    animal = makeGiraffe();
    if (!renderer.capabilities.isWebGL2) {
      // r160 fetches bone texels by integer coordinates. On WebGL 1, sample a
      // common-sized nearest-filtered palette at texel centers instead. This
      // also supplies the correct skinning transform to the shadow depth pass.
      const rigs = new Set();
      animal.group.traverse((o) => {
        if (o.isSkinnedMesh) rigs.add(o.skeleton);
      });
      const maxBones = Math.max(...Array.from(rigs, (s) => s.bones.length));
      const width = Math.max(4, T.MathUtils.ceilPowerOfTwo(Math.sqrt(4 * maxBones)));
      for (const s of rigs) {
        const data = new Float32Array(width * width * 4);
        data.set(s.boneMatrices);
        s.boneMatrices = data;
        s.boneTexture = new T.DataTexture(data, width, width, T.RGBAFormat, T.FloatType);
        s.boneTexture.needsUpdate = true;
      }
      T.ShaderChunk.skinning_pars_vertex = `#ifdef USE_SKINNING
        uniform mat4 bindMatrix, bindMatrixInverse;
        uniform highp sampler2D boneTexture;
        mat4 getBoneMatrix(const in float i){
          const float size=${width.toFixed(1)};
          vec2 uv=(vec2(mod(4.0*i,size),floor(4.0*i/size))+0.5)/size;
          vec2 dx=vec2(1.0/size,0.0);
          return mat4(texture2D(boneTexture,uv),texture2D(boneTexture,uv+dx),
                      texture2D(boneTexture,uv+2.0*dx),texture2D(boneTexture,uv+3.0*dx));
        }
      #endif`;
    }
    scene.add(animal.group);
  } catch (e) {
    notice.textContent = 'Unable to prepare the specimen.';
    throw e;
  }
  notice.hidden = true;
  const guides = gaitGuides(animal);
  scene.add(guides.group);
  $('#guides').onclick = () => {
    let on = (guides.group.visible = !guides.group.visible);
    $('#guides').setAttribute('aria-pressed', on);
    $('#guides').setAttribute('aria-label', (on ? 'Hide' : 'Show') + ' gait guides');
    $('.plate').innerHTML = on
      ? '<strong>FIG. 04B</strong><span></span>JOINT CENTERS &amp; SOLE PATHS'
      : '<strong>FIG. 04</strong><span></span>KINEMATIC RECONSTRUCTION';
  };
  function setScene(useField) {
    if (useField && !habitat) {
      habitat = makeHabitat(animal);
      scene.add(habitat.group);
    }
    field = useField;
    if (habitat) habitat.group.visible = field;
    floorGrid.visible = shadow.visible = !field;
    camera = field ? fieldLens : ortho;
    occlusion.position.y = field ? -0.013 : -0.002;
    occlusion.material.opacity = field ? 0.24 : 0.34;
    scene.fog = field ? new T.Fog(0xd8d3c5, 17, 105) : null;
    sky.color.setHex(field ? 0xffedcf : 0xfff5e3);
    sky.groundColor.setHex(field ? 0xc5b599 : 0xccbba4);
    sky.intensity = field ? 1.39 : 1.53;
    sun.intensity = field ? 2.02 : 2.25;
    document.body.classList.toggle('field', field);
    $('#fieldBtn').setAttribute('aria-pressed', field);
    $('#studioBtn').setAttribute('aria-pressed', !field);
    $('.projection').innerHTML = field
      ? 'HABITAT STUDY <span>/</span> EAST AFRICA'
      : 'ORTHOGRAPHIC <span>/</span> 3D';
  }
  $('#studioBtn').onclick = () => setScene(false);
  $('#fieldBtn').onclick = () => setScene(true);
  const names = ['RF', 'LF', 'RH', 'LH'];
  let pads = names.map((n, i) => {
    let el = document.createElement('div');
    el.innerHTML = '<b></b><span>' + n + '</span>';
    el.title = ['Right fore', 'Left fore', 'Right hind', 'Left hind'][i];
    $('#feet').appendChild(el);
    return el;
  });
  const ruler = $('#ruler');
  for (let j = 0; j <= 25; j++) {
    let i = document.createElement('i');
    i.style.bottom = j * 4 + '%';
    if (j % 5 === 0) {
      i.className = 'major';
      i.innerHTML = '<span>' + j / 5 + ' m</span>';
    }
    ruler.appendChild(i);
  }
  let az = 0.332,
    el = 0.094,
    zoom = 1,
    toAz = az,
    toEl = el,
    toZoom = zoom,
    cycles = 0.235,
    focus = 'full',
    focusY = 2.76,
    focusX = 0.38,
    focusScale = 1,
    rate = 1,
    playing = !matchMedia('(prefers-reduced-motion: reduce)').matches,
    scrubbing = false,
    prev = performance.now(),
    w = 0,
    h = 0,
    paintUntil = 0,
    slow = 0,
    mustDraw = true;
  function wake() {
    mustDraw = true;
    paintUntil = performance.now() + 1300;
  }
  for (const e of ['input', 'change', 'click', 'wheel', 'keydown'])
    window.addEventListener(e, wake, { passive: true, capture: true });
  document.addEventListener('visibilitychange', () => {
    prev = performance.now();
    wake();
  });
  function resize() {
    wake();
    w = stage.clientWidth;
    h = stage.clientHeight;
    renderer.setSize(w, h, false);
  }
  new ResizeObserver(resize).observe(stage);
  resize();
  function projection(dt) {
    const blend = 1 - Math.exp(-10 * Math.min(0.28, dt));
    az += (toAz - az) * blend;
    el += (toEl - el) * blend;
    zoom += (toZoom - zoom) * blend;
    let aspect = w / h,
      compact = w < 650;
    const head = focus === 'portrait',
      feet = focus === 'feet';
    let destX = head ? animal.head.position.x + 0.25 : feet ? -0.04 : 0.38,
      destY = head ? animal.head.position.y + 0.06 : feet ? 1.22 : compact ? 3.07 : 2.76;
    focusX += (destX - focusX) * blend;
    focusY += (destY - focusY) * blend;
    focusScale += ((head ? 0.238 : feet ? 0.51 : 1) - focusScale) * blend;
    let span =
        (Math.max(compact ? 7.65 : 6.67, (compact ? 5.3 : 5.45) / aspect) * focusScale) / zoom,
      cx = w > 800 ? 0.54 : w < 450 ? 0.485 : 0.5;
    let distance = 17;
    if (field) {
      distance = (span * 0.5) / Math.tan((fieldLens.fov * Math.PI) / 360);
      fieldLens.aspect = aspect;
      fieldLens.setViewOffset(w, h, -w * (cx - 0.5), 0, w, h);
    } else {
      Object.assign(camera, {
        left: -span * aspect * cx,
        right: span * aspect * (1 - cx),
        top: span / 2,
        bottom: -span / 2,
      });
    }
    camera.updateProjectionMatrix();
    let target = V(focusX, focusY, 0);
    camera.position
      .set(
        Math.sin(az) * Math.cos(el) * distance,
        Math.sin(el) * distance,
        Math.cos(az) * Math.cos(el) * distance,
      )
      .add(target);
    camera.lookAt(target);
    camera.updateMatrixWorld();
    let a = V(0.38, 0, 0).project(camera),
      b = V(0.38, 5, 0).project(camera);
    ruler.style.bottom = 50 * (1 + a.y) + '%';
    ruler.style.height = 50 * (b.y - a.y) + '%';
  }
  function play(on) {
    playing = on;
    $('#toggle').setAttribute('aria-label', on ? 'Pause walking' : 'Play walking');
    $('#playicon').setAttribute('href', on ? '#pause' : '#play');
    $('#state').textContent = on ? 'SIMULATION ACTIVE' : 'SIMULATION PAUSED';
    $('.live').style.background = on ? '' : '#8d9898';
  }
  play(playing);
  $('#toggle').onclick = () => play(!playing);
  $('#resetBtn').onclick = () => {
    cycles = 0;
  };
  $('#speed').onchange = (e) => (rate = +e.target.value);
  $('#phase').onpointerdown = () => (scrubbing = true);
  window.addEventListener('pointerup', () => (scrubbing = false));
  window.addEventListener('pointercancel', () => (scrubbing = false));
  $('#phase').oninput = (e) => {
    cycles = Math.floor(cycles) + (+e.target.value === 1000 ? 0.99999999 : +e.target.value / 1000);
    play(false);
  };
  $('#view').onchange = (e) => {
    let a = {
      profile: [0.332, 0.094],
      angle: [0.768, 0.146],
      front: [Math.PI / 2, 0.101],
      portrait: [0.64, 0.062],
      feet: [0.29, 0.13],
    }[e.target.value];
    if (a) {
      focus = ['portrait', 'feet'].includes(e.target.value) ? e.target.value : 'full';
      ruler.hidden = focus !== 'full';
      ruler.style.visibility = ruler.hidden ? 'hidden' : '';
      toAz = az + Math.atan2(Math.sin(a[0] - az), Math.cos(a[0] - az));
      toEl = a[1];
      toZoom = 1;
    }
  };
  let pointers = new Map(),
    dist = 0;
  const limit = (v, a, b) => Math.max(a, Math.min(v, b));
  function separation() {
    let p = [...pointers.values()];
    return Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
  }
  canvas.onpointerdown = (e) => {
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) dist = separation();
  };
  canvas.onpointermove = (e) => {
    let p = pointers.get(e.pointerId);
    if (!p) return;
    wake();
    let dx = e.clientX - p.x,
      dy = e.clientY - p.y;
    p.x = e.clientX;
    p.y = e.clientY;
    if (pointers.size === 2) {
      let d = separation();
      if (dist > 0) toZoom = limit((toZoom * d) / dist, 0.7, 1.9);
      dist = d;
    } else {
      toAz -= dx * 0.008;
      toEl = limit(toEl + dy * 0.005, 0.025, 0.69);
      $('#view').value = 'free';
    }
  };
  canvas.onlostpointercapture = (e) => pointers.delete(e.pointerId);
  canvas.onwheel = (e) => {
    e.preventDefault();
    toZoom = limit(toZoom * Math.exp(-0.0014 * e.deltaY), 0.7, 1.9);
  };
  window.addEventListener('keydown', (e) => {
    if (
      e.code === 'Space' &&
      !['INPUT', 'SELECT', 'BUTTON'].includes(document.activeElement.tagName)
    ) {
      e.preventDefault();
      play(!playing);
    }
  });
  function tick(now) {
    let elapsed = Math.max(0, (now - prev) / 1000),
      dt = Math.min(0.12, elapsed);
    prev = now;
    if (!playing && !mustDraw && now > paintUntil) {
      requestAnimationFrame(tick);
      return;
    }
    mustDraw = false;
    if (playing && document.visibilityState === 'visible' && renderer.getPixelRatio() > 1) {
      slow = elapsed > 0.052 ? slow + 1 : Math.max(0, slow - 2);
      if (slow > 24) {
        renderer.setPixelRatio(Math.max(1, renderer.getPixelRatio() - 0.25));
        slow = 0;
      }
    }
    if (playing && !scrubbing) cycles += dt * 0.556 * rate;
    let u = cycles % 1;
    grid.uniforms.travel.value = (animal.stride * cycles) % 2;
    let contacts = animal.animate(cycles);
    pads.forEach((p, i) => p.classList.toggle('on', contacts[i]));
    if (!scrubbing) $('#phase').value = Math.round(u * 1000);
    $('#readout').value = String(Math.floor(u * 100 + 0.00001)).padStart(3, '0') + ' %';
    $('#fill').style.width = u * 100 + '%';
    projection(elapsed);
    if (guides.group.visible) guides.update(cycles, camera);
    if (field) habitat.update(animal.stride * cycles, cycles * 1.8, camera);
    renderer.render(scene, camera);
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
})();
