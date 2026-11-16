(() => {
  'use strict';

  if (!window.THREE) return;

  const THREE = window.THREE;

  const canvas = document.getElementById('scene');
  const fallback = document.getElementById('fallback');
  const speedInput = document.getElementById('speed');
  const followInput = document.getElementById('follow');
  const resetButton = document.getElementById('reset');
  const pauseButton = document.getElementById('pause');

  const state = {
    speed: Number(speedInput.value),
    follow: followInput.checked,
    paused: false,
    time: 0,
    phase: 0,
    pathAngle: 0,
    pathRadius: 3.05,
  };

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
    });
  } catch (error) {
    fallback.hidden = false;
    return;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x9fc7df);
  scene.fog = new THREE.Fog(0xb9d4df, 20, 58);

  const camera = new THREE.PerspectiveCamera(
    42,
    window.innerWidth / window.innerHeight,
    0.1,
    180
  );
  camera.position.set(5.8, 3.25, 8.2);

  const maxAnisotropy = renderer.capabilities.getMaxAnisotropy();

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function random() {
      a |= 0;
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function makeCanvas(size) {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    return canvas;
  }

  function createCoatCanvas(seed, size = 1024) {
    const rng = mulberry32(seed);
    const canvas = makeCanvas(size);
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#d8a052';
    ctx.fillRect(0, 0, size, size);

    for (let i = 0; i < 2600; i++) {
      const value = rng();
      ctx.fillStyle = value < 0.5
        ? 'rgba(255, 238, 190, 0.035)'
        : 'rgba(92, 48, 20, 0.025)';
      ctx.fillRect(rng() * size, rng() * size, 1 + rng() * 2, 1 + rng() * 2);
    }

    const cells = 7;
    const cell = size / cells;

    function patch(cx, cy, radius, sides) {
      const points = [];
      for (let i = 0; i < sides; i++) {
        const angle = (i / sides) * Math.PI * 2 + (rng() - 0.5) * 0.35;
        const r = radius * (0.68 + rng() * 0.48);
        points.push([
          cx + Math.cos(angle) * r,
          cy + Math.sin(angle) * r,
        ]);
      }

      ctx.beginPath();
      ctx.moveTo(points[0][0], points[0][1]);
      for (let i = 0; i < points.length; i++) {
        const p = points[i];
        const q = points[(i + 1) % points.length];
        const mx = (p[0] + q[0]) * 0.5;
        const my = (p[1] + q[1]) * 0.5;
        ctx.quadraticCurveTo(p[0], p[1], mx, my);
      }
      ctx.closePath();

      const hue = 19 + rng() * 9;
      const saturation = 60 + rng() * 18;
      const lightness = 25 + rng() * 11;
      ctx.fillStyle = `hsl(${hue}, ${saturation}%, ${lightness}%)`;
      ctx.fill();
      ctx.lineJoin = 'round';
      ctx.lineWidth = cell * 0.085;
      ctx.strokeStyle = 'rgba(248, 219, 154, 0.96)';
      ctx.stroke();
    }

    for (let y = 0; y < cells; y++) {
      for (let x = 0; x < cells; x++) {
        const cx = (x + 0.5) * cell + (rng() - 0.5) * cell * 0.38;
        const cy = (y + 0.5) * cell + (rng() - 0.5) * cell * 0.38;
        patch(cx, cy, cell * (0.46 + rng() * 0.14), 7 + Math.floor(rng() * 3));
      }
    }

    for (let i = 0; i < 30; i++) {
      patch(
        rng() * size,
        rng() * size,
        cell * (0.12 + rng() * 0.13),
        5 + Math.floor(rng() * 3)
      );
    }

    for (let i = 0; i < 1800; i++) {
      const x = rng() * size;
      const y = rng() * size;
      const length = 2 + rng() * 5;
      ctx.strokeStyle = rng() < 0.5
        ? 'rgba(255, 236, 185, 0.055)'
        : 'rgba(70, 34, 15, 0.045)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + length, y + (rng() - 0.5) * length);
      ctx.stroke();
    }

    return canvas;
  }

  function createGroundCanvas(seed, size = 1024) {
    const rng = mulberry32(seed);
    const canvas = makeCanvas(size);
    const ctx = canvas.getContext('2d');

    const gradient = ctx.createRadialGradient(
      size * 0.5, size * 0.5, size * 0.05,
      size * 0.5, size * 0.5, size * 0.72
    );
    gradient.addColorStop(0, '#b99b5f');
    gradient.addColorStop(0.55, '#a7894f');
    gradient.addColorStop(1, '#8f7442');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);

    for (let i = 0; i < 5200; i++) {
      const x = rng() * size;
      const y = rng() * size;
      const r = 0.5 + rng() * 2.2;
      ctx.fillStyle = rng() < 0.5
        ? `rgba(255, 232, 165, ${0.025 + rng() * 0.05})`
        : `rgba(65, 48, 25, ${0.025 + rng() * 0.05})`;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    const grassColors = ['#6f7d34', '#8d8b3e', '#5c6b2d', '#b0a04e', '#75843a'];
    for (let i = 0; i < 1700; i++) {
      const x = rng() * size;
      const y = rng() * size;
      const length = 5 + rng() * 15;
      const angle = -Math.PI * 0.5 + (rng() - 0.5) * 0.9;
      ctx.strokeStyle = grassColors[Math.floor(rng() * grassColors.length)];
      ctx.globalAlpha = 0.16 + rng() * 0.22;
      ctx.lineWidth = 1 + rng() * 1.2;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(angle) * length, y + Math.sin(angle) * length);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    for (let i = 0; i < 90; i++) {
      const x = rng() * size;
      const y = rng() * size;
      const r = 1 + rng() * 3;
      ctx.fillStyle = `rgba(95, 78, 52, ${0.18 + rng() * 0.22})`;
      ctx.beginPath();
      ctx.ellipse(x, y, r, r * (0.45 + rng() * 0.5), rng() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }

    return canvas;
  }

  function createCloudCanvas(size = 256) {
    const canvas = makeCanvas(size);
    const ctx = canvas.getContext('2d');
    const gradient = ctx.createRadialGradient(
      size * 0.5, size * 0.5, 0,
      size * 0.5, size * 0.5, size * 0.5
    );
    gradient.addColorStop(0, 'rgba(255,255,255,0.95)');
    gradient.addColorStop(0.45, 'rgba(255,255,255,0.48)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
    return canvas;
  }

  function createContactShadowCanvas(size = 256) {
    const canvas = makeCanvas(size);
    const ctx = canvas.getContext('2d');
    const gradient = ctx.createRadialGradient(
      size * 0.5, size * 0.5, 0,
      size * 0.5, size * 0.5, size * 0.5
    );
    gradient.addColorStop(0, 'rgba(20, 14, 8, 0.42)');
    gradient.addColorStop(0.55, 'rgba(20, 14, 8, 0.16)');
    gradient.addColorStop(1, 'rgba(20, 14, 8, 0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
    return canvas;
  }

  function canvasTexture(canvas, repeatX = 1, repeatY = 1) {
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(repeatX, repeatY);
    texture.anisotropy = maxAnisotropy;
    texture.needsUpdate = true;
    return texture;
  }

  const coatCanvas = createCoatCanvas(91357);
  const groundCanvas = createGroundCanvas(41771);
  const cloudCanvas = createCloudCanvas();
  const contactShadowCanvas = createContactShadowCanvas();

  function coatMaterial(repeatX, repeatY, roughness = 0.76) {
    const texture = canvasTexture(coatCanvas, repeatX, repeatY);
    return new THREE.MeshPhysicalMaterial({
      map: texture,
      bumpMap: texture,
      bumpScale: 0.018,
      color: 0xffffff,
      roughness,
      metalness: 0,
      sheen: 0.22,
      sheenColor: new THREE.Color(0xffd69a),
      sheenRoughness: 0.82,
    });
  }

  const materials = {
    body: coatMaterial(1.25, 0.95, 0.74),
    neck: coatMaterial(1.10, 1.70, 0.76),
    leg: coatMaterial(0.85, 1.35, 0.78),
    head: coatMaterial(0.85, 0.85, 0.76),
    tail: coatMaterial(0.80, 0.80, 0.8),
    muzzle: new THREE.MeshStandardMaterial({
      color: 0x8a6545,
      roughness: 0.86,
      metalness: 0,
    }),
    nose: new THREE.MeshStandardMaterial({
      color: 0x241a15,
      roughness: 0.72,
      metalness: 0,
    }),
    hoof: new THREE.MeshStandardMaterial({
      color: 0x2b211b,
      roughness: 0.58,
      metalness: 0.04,
    }),
    mane: new THREE.MeshStandardMaterial({
      color: 0x3f2414,
      roughness: 0.94,
      metalness: 0,
    }),
    eye: new THREE.MeshPhysicalMaterial({
      color: 0x080503,
      roughness: 0.12,
      metalness: 0,
      clearcoat: 1,
      clearcoatRoughness: 0.08,
    }),
    eyeHighlight: new THREE.MeshBasicMaterial({ color: 0xffffff }),
    bone: new THREE.MeshStandardMaterial({
      color: 0x8a5a32,
      roughness: 0.88,
      metalness: 0,
    }),
    ground: new THREE.MeshStandardMaterial({
      map: canvasTexture(groundCanvas, 11, 11),
      color: 0xffffff,
      roughness: 1,
      metalness: 0,
    }),
    trunk: new THREE.MeshStandardMaterial({
      color: 0x5b3d25,
      roughness: 0.95,
      metalness: 0,
    }),
    leaf: new THREE.MeshStandardMaterial({
      color: 0x5f7431,
      roughness: 0.96,
      metalness: 0,
    }),
    leafAlt: new THREE.MeshStandardMaterial({
      color: 0x74813a,
      roughness: 0.96,
      metalness: 0,
    }),
    rock: new THREE.MeshStandardMaterial({
      color: 0x777066,
      roughness: 0.92,
      metalness: 0,
    }),
    grass: new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.98,
      metalness: 0,
    }),
    contact: new THREE.MeshBasicMaterial({
      map: canvasTexture(contactShadowCanvas, 1, 1),
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
    }),
  };

  function addMesh(parent, geometry, material, position, rotation, scale) {
    const mesh = new THREE.Mesh(geometry, material);
    if (position) mesh.position.set(position[0], position[1], position[2]);
    if (rotation) mesh.rotation.set(rotation[0], rotation[1], rotation[2]);
    if (scale) mesh.scale.set(scale[0], scale[1], scale[2]);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }

  // Lighting and sky.
  const hemisphere = new THREE.HemisphereLight(0xd8ecff, 0x8a6b45, 1.35);
  scene.add(hemisphere);

  const sun = new THREE.DirectionalLight(0xffdfad, 3.25);
  sun.position.set(6.5, 10.5, 4.5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -10;
  sun.shadow.camera.right = 10;
  sun.shadow.camera.top = 10;
  sun.shadow.camera.bottom = -10;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 32;
  sun.shadow.bias = -0.00018;
  sun.shadow.normalBias = 0.025;
  scene.add(sun);
  scene.add(sun.target);

  const rimLight = new THREE.DirectionalLight(0x9fc8ff, 0.75);
  rimLight.position.set(-6, 4.5, -7);
  scene.add(rimLight);

  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(75, 40, 20),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        topColor: { value: new THREE.Color(0x4f9fd8) },
        horizonColor: { value: new THREE.Color(0xe4d4a8) },
        bottomColor: { value: new THREE.Color(0x8b9b8a) },
        sunDirection: { value: new THREE.Vector3(6.5, 10.5, 4.5).normalize() },
      },
      vertexShader: `
        varying vec3 vWorld;
        void main() {
          vec4 world = modelMatrix * vec4(position, 1.0);
          vWorld = normalize(world.xyz);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec3 vWorld;
        uniform vec3 topColor;
        uniform vec3 horizonColor;
        uniform vec3 bottomColor;
        uniform vec3 sunDirection;
        void main() {
          float h = clamp(vWorld.y * 1.25 + 0.08, -1.0, 1.0);
          vec3 color = mix(horizonColor, topColor, pow(max(h, 0.0), 0.62));
          color = mix(bottomColor, color, smoothstep(-0.18, 0.02, h));
          float sun = pow(max(dot(normalize(vWorld), normalize(sunDirection)), 0.0), 42.0);
          color += vec3(1.0, 0.72, 0.38) * sun * 0.32;
          gl_FragColor = vec4(color, 1.0);
        }
      `,
    })
  );
  sky.frustumCulled = false;
  scene.add(sky);

  // Ground.
  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(42, 128),
    materials.ground
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const contactShadow = new THREE.Mesh(
    new THREE.PlaneGeometry(3.0, 4.0),
    materials.contact
  );
  contactShadow.rotation.x = -Math.PI / 2;
  contactShadow.position.y = 0.012;
  contactShadow.renderOrder = 1;
  scene.add(contactShadow);

  function createTree(x, z, scale, seed) {
    const rng = mulberry32(seed);
    const tree = new THREE.Group();
    tree.position.set(x, 0, z);
    tree.rotation.y = rng() * Math.PI * 2;
    tree.rotation.z = (rng() - 0.5) * 0.12;

    addMesh(tree, new THREE.CylinderGeometry(0.10 * scale, 0.17 * scale, 1.65 * scale, 12), materials.trunk, [0, 0.82 * scale, 0], [0, 0, (rng() - 0.5) * 0.12]);

    const branchCount = 3;
    for (let i = 0; i < branchCount; i++) {
      const angle = (i / branchCount) * Math.PI * 2 + rng() * 0.7;
      const branch = addMesh(
        tree,
        new THREE.CylinderGeometry(0.035 * scale, 0.065 * scale, 0.95 * scale, 8),
        materials.trunk,
        [Math.cos(angle) * 0.28 * scale, 1.55 * scale, Math.sin(angle) * 0.28 * scale],
        [Math.sin(angle) * 0.65, 0, -Math.cos(angle) * 0.65]
      );
      branch.castShadow = true;
    }

    const canopyPositions = [
      [0, 2.05, 0, 1.55],
      [-0.72, 1.92, 0.18, 1.05],
      [0.72, 1.96, -0.16, 1.12],
      [0.12, 1.98, -0.72, 0.96],
      [-0.12, 1.94, 0.72, 0.92],
    ];

    canopyPositions.forEach((item, index) => {
      const canopy = addMesh(
        tree,
        new THREE.SphereGeometry(item[3] * scale, 18, 10),
        index % 2 ? materials.leafAlt : materials.leaf,
        [item[0] * scale, item[1] * scale, item[2] * scale],
        [0, rng() * Math.PI, 0],
        [1.25, 0.30, 1.12]
      );
      canopy.castShadow = true;
      canopy.receiveShadow = true;
    });

    scene.add(tree);
    return tree;
  }

  createTree(-7.2, -5.4, 1.18, 101);
  createTree(6.8, -7.2, 0.95, 202);
  createTree(-8.4, 4.6, 0.86, 303);
  createTree(8.2, 5.2, 1.08, 404);
  createTree(-3.8, -9.2, 0.72, 505);

  const rockGeometry = new THREE.DodecahedronGeometry(1, 0);
  const rockData = [
    [-4.8, 2.2, 0.34, 0.22, 0.42],
    [4.6, 3.8, 0.28, 0.18, 0.36],
    [-6.2, -1.8, 0.48, 0.30, 0.55],
    [5.8, -2.6, 0.38, 0.24, 0.46],
    [1.8, 7.4, 0.30, 0.20, 0.38],
  ];
  rockData.forEach((rock, index) => {
    const mesh = addMesh(
      scene,
      rockGeometry,
      materials.rock,
      [rock[0], rock[3] * 0.45, rock[1]],
      [index * 0.7, index * 1.3, index * 0.4],
      [rock[2], rock[3], rock[4]]
    );
    mesh.rotation.y = index * 1.7;
  });

  const bushData = [
    [-5.4, 0.8, 0.55],
    [5.2, 0.4, 0.48],
    [-2.8, -6.0, 0.72],
    [3.4, -5.6, 0.52],
    [7.4, 1.8, 0.62],
    [-7.6, -2.8, 0.58],
  ];
  bushData.forEach((bush, index) => {
    const mesh = addMesh(
      scene,
      new THREE.IcosahedronGeometry(bush[2], 1),
      index % 2 ? materials.leafAlt : materials.leaf,
      [bush[0], bush[2] * 0.34, bush[1]],
      [0, index, 0],
      [1.25, 0.58, 1.05]
    );
    mesh.castShadow = true;
  });

  // Instanced grass blades.
  const grassCount = 720;
  const grass = new THREE.InstancedMesh(
    new THREE.ConeGeometry(0.026, 0.30, 5, 1),
    materials.grass,
    grassCount
  );
  grass.castShadow = true;
  grass.receiveShadow = true;
  const grassRng = mulberry32(808);
  const grassDummy = new THREE.Object3D();
  const grassColor = new THREE.Color();
  for (let i = 0; i < grassCount; i++) {
    const radius = 2.1 + Math.sqrt(grassRng()) * 18.5;
    const angle = grassRng() * Math.PI * 2;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    const scale = 0.55 + grassRng() * 1.25;
    grassDummy.position.set(x, 0.12 * scale, z);
    grassDummy.rotation.set((grassRng() - 0.5) * 0.28, grassRng() * Math.PI, (grassRng() - 0.5) * 0.28);
    grassDummy.scale.set(scale * (0.75 + grassRng() * 0.5), scale, scale * (0.75 + grassRng() * 0.5));
    grassDummy.updateMatrix();
    grass.setMatrixAt(i, grassDummy.matrix);
    grassColor.setHSL(0.17 + grassRng() * 0.08, 0.34 + grassRng() * 0.22, 0.28 + grassRng() * 0.16);
    grass.setColorAt(i, grassColor);
  }
  grass.instanceMatrix.needsUpdate = true;
  if (grass.instanceColor) grass.instanceColor.needsUpdate = true;
  scene.add(grass);

  // Soft clouds.
  const cloudTexture = new THREE.CanvasTexture(cloudCanvas);
  cloudTexture.colorSpace = THREE.SRGBColorSpace;
  const cloudRng = mulberry32(991);
  for (let i = 0; i < 8; i++) {
    const cloud = new THREE.Sprite(new THREE.SpriteMaterial({
      map: cloudTexture,
      transparent: true,
      opacity: 0.42 + cloudRng() * 0.22,
      depthWrite: false,
      fog: true,
    }));
    const angle = cloudRng() * Math.PI * 2;
    const radius = 22 + cloudRng() * 24;
    cloud.position.set(
      Math.cos(angle) * radius,
      12 + cloudRng() * 8,
      Math.sin(angle) * radius
    );
    cloud.scale.set(7 + cloudRng() * 7, 2.0 + cloudRng() * 1.8, 1);
    scene.add(cloud);
  }

  // Giraffe construction. Forward is +Z, up is +Y.
  const giraffe = new THREE.Group();
  scene.add(giraffe);

  const torsoGroup = new THREE.Group();
  torsoGroup.position.set(0, 2.62, 0);
  giraffe.add(torsoGroup);

  // Body masses.
  addMesh(torsoGroup, new THREE.SphereGeometry(0.60, 40, 28), materials.body, [0, 0, 0], [0, 0, 0], [0.80, 0.84, 1.58]);
  addMesh(torsoGroup, new THREE.SphereGeometry(0.55, 28, 18), materials.body, [0, -0.03, 0.50], [0, 0, 0], [0.76, 0.74, 0.66]);
  addMesh(torsoGroup, new THREE.SphereGeometry(0.55, 28, 18), materials.body, [0, 0.02, -0.50], [0, 0, 0], [0.80, 0.78, 0.70]);
  addMesh(torsoGroup, new THREE.SphereGeometry(0.52, 24, 16), materials.body, [0, -0.16, 0.02], [0, 0, 0], [0.72, 0.54, 0.98]);
  addMesh(torsoGroup, new THREE.SphereGeometry(0.43, 24, 16), materials.body, [0, 0.38, 0.36], [0.08, 0, 0], [0.72, 0.46, 0.62]);
  addMesh(torsoGroup, new THREE.SphereGeometry(0.34, 20, 14), materials.body, [0, 0.25, -0.64], [0, 0, 0], [0.78, 0.54, 0.62]);

  // Neck with a slight S-curve.
  const neckBase = new THREE.Group();
  neckBase.position.set(0, 0.30, 0.60);
  neckBase.rotation.x = 0.68;
  torsoGroup.add(neckBase);

  addMesh(neckBase, new THREE.SphereGeometry(0.25, 24, 16), materials.neck, [0, 0.02, 0], [0, 0, 0], [0.88, 0.9, 0.92]);
  addMesh(neckBase, new THREE.CylinderGeometry(0.16, 0.24, 1.05, 28, 8, false), materials.neck, [0, 0.53, 0]);

  const neckTop = new THREE.Group();
  neckTop.position.set(0, 1.05, 0);
  neckTop.rotation.x = -0.15;
  neckBase.add(neckTop);

  addMesh(neckTop, new THREE.CylinderGeometry(0.13, 0.17, 0.56, 24, 6, false), materials.neck, [0, 0.28, 0]);
  addMesh(neckTop, new THREE.SphereGeometry(0.15, 20, 14), materials.neck, [0, 0.55, 0], [0, 0, 0], [0.9, 0.8, 0.9]);

  // Erect mane along the dorsal edge of the neck.
  const maneRng = mulberry32(661);
  for (let i = 0; i < 11; i++) {
    const t = i / 10;
    const y = 0.08 + t * 0.90;
    const radius = 0.24 - t * 0.075;
    const height = 0.085 + maneRng() * 0.040;
    const manePiece = addMesh(
      neckBase,
      new THREE.BoxGeometry(0.022, height * 0.82, 0.055),
      materials.mane,
      [0, y, -(radius + 0.008)],
      [-0.10 - maneRng() * 0.08, 0, (maneRng() - 0.5) * 0.10]
    );
    manePiece.castShadow = true;
  }
  for (let i = 0; i < 5; i++) {
    const t = i / 4;
    const y = 0.07 + t * 0.46;
    const radius = 0.16 - t * 0.025;
    addMesh(
      neckTop,
      new THREE.BoxGeometry(0.020, 0.075 + maneRng() * 0.030, 0.052),
      materials.mane,
      [0, y, -(radius + 0.007)],
      [-0.10, 0, (maneRng() - 0.5) * 0.08]
    );
  }

  // Head.
  const head = new THREE.Group();
  head.position.set(0, 0.60, 0.02);
  head.rotation.x = -0.53;
  neckTop.add(head);

  addMesh(head, new THREE.SphereGeometry(0.21, 28, 18), materials.head, [0, 0.02, -0.02], [0, 0, 0], [0.84, 0.90, 1.08]);
  addMesh(head, new THREE.SphereGeometry(0.16, 22, 14), materials.head, [0, 0.095, 0.025], [0, 0, 0], [0.88, 0.68, 0.92]);
  addMesh(head, new THREE.CapsuleGeometry(0.095, 0.14, 12, 22), materials.muzzle, [0, -0.035, 0.165], [Math.PI / 2, 0, 0], [0.90, 0.85, 0.62]);
  addMesh(head, new THREE.SphereGeometry(0.10, 20, 12), materials.head, [0, 0.015, 0.10], [0, 0, 0], [0.92, 0.68, 0.78]);

  // Nostrils, mouth, eyes, highlights.
  [-1, 1].forEach((side) => {
    addMesh(head, new THREE.SphereGeometry(0.018, 12, 8), materials.nose, [side * 0.038, -0.052, 0.275], [0, 0, 0], [1.15, 0.62, 0.55]);
    addMesh(head, new THREE.SphereGeometry(0.035, 16, 10), materials.eye, [side * 0.142, 0.040, 0.125]);
    const highlight = addMesh(head, new THREE.SphereGeometry(0.008, 8, 6), materials.eyeHighlight, [side * 0.158, 0.055, 0.151]);
    highlight.castShadow = false;
    highlight.receiveShadow = false;

    const ear = addMesh(head, new THREE.SphereGeometry(0.125, 18, 12), materials.head, [side * 0.215, 0.070, -0.065], [0.12, side * -0.58, side * 0.22], [1.05, 0.50, 0.18]);
    ear.name = side > 0 ? 'earRight' : 'earLeft';
    addMesh(head, new THREE.SphereGeometry(0.078, 14, 8), materials.muzzle, [side * 0.225, 0.065, -0.048], [0.12, side * -0.58, side * 0.22], [0.85, 0.40, 0.10]);
  });

  addMesh(head, new THREE.BoxGeometry(0.082, 0.006, 0.010), materials.nose, [0, -0.095, 0.265], [0.12, 0, 0]);

  [-1, 1].forEach((side) => {
    const ossicone = new THREE.Group();
    ossicone.position.set(side * 0.072, 0.155, -0.045);
    ossicone.rotation.z = side * -0.08;
    head.add(ossicone);
    addMesh(ossicone, new THREE.CylinderGeometry(0.030, 0.038, 0.200, 12), materials.head, [0, 0.090, 0]);
    addMesh(ossicone, new THREE.SphereGeometry(0.056, 14, 10), materials.mane, [0, 0.195, 0], [0, 0, 0], [0.9, 0.72, 0.9]);
  });

  addMesh(head, new THREE.SphereGeometry(0.045, 12, 8), materials.head, [0, 0.135, -0.005], [0, 0, 0], [0.75, 1.0, 0.75]);

  // Legs.
  const legs = [];
  const legDefs = [
    { name: 'frontLeft', x: 0.29, z: 0.50, front: true, side: 1, offset: 0 },
    { name: 'frontRight', x: -0.29, z: 0.50, front: true, side: -1, offset: Math.PI },
    { name: 'rearLeft', x: 0.31, z: -0.50, front: false, side: 1, offset: Math.PI },
    { name: 'rearRight', x: -0.31, z: -0.50, front: false, side: -1, offset: 0 },
  ];

  function createLeg(def) {
    const upperLen = def.front ? 0.94 : 0.96;
    const lowerLen = def.front ? 0.88 : 0.86;
    const hoofHeight = 0.18;
    const rootY = upperLen + lowerLen + hoofHeight;

    const root = new THREE.Group();
    root.position.set(def.x, rootY, def.z);
    root.rotation.z = def.side * 0.018;
    giraffe.add(root);

    const upper = addMesh(root, new THREE.CylinderGeometry(def.front ? 0.160 : 0.170, 0.105, upperLen, 18, 4, false), materials.leg, [0, -upperLen * 0.5, 0]);
    if (def.front) {
      addMesh(root, new THREE.SphereGeometry(0.130, 18, 12), materials.leg, [0, -0.03, 0.015], [0, 0, 0], [0.9, 1.05, 0.9]);
    } else {
      addMesh(root, new THREE.SphereGeometry(0.140, 18, 12), materials.leg, [0, -0.02, 0], [0, 0, 0], [0.9, 1.0, 0.95]);
    }

    const knee = new THREE.Group();
    knee.position.set(0, -upperLen, 0);
    root.add(knee);
    addMesh(knee, new THREE.SphereGeometry(0.060, 16, 10), materials.leg, [0, 0, 0], [0, 0, 0], [0.9, 0.85, 0.95]);
    addMesh(knee, new THREE.CylinderGeometry(0.090, 0.062, lowerLen, 16, 4, false), materials.leg, [0, -lowerLen * 0.5, 0]);

    const hock = new THREE.Group();
    hock.position.set(0, -lowerLen, 0);
    knee.add(hock);
    addMesh(hock, new THREE.SphereGeometry(0.045, 14, 8), materials.leg, [0, 0, 0]);

    const hoof = addMesh(hock, new THREE.CylinderGeometry(0.064, 0.084, hoofHeight, 20, 1, false), materials.hoof, [0, -hoofHeight * 0.5, 0.005]);
    hoof.scale.set(1.0, 1.0, 1.08);
    addMesh(hock, new THREE.CylinderGeometry(0.045, 0.052, 0.028, 18), materials.nose, [0, -0.012, 0.006]);

    return {
      def,
      root,
      knee,
      hock,
      upper,
      baseY: rootY,
    };
  }

  legDefs.forEach((def) => legs.push(createLeg(def)));

  // Tail.
  const tail = new THREE.Group();
  tail.position.set(0, 0.24, -0.94);
  tail.rotation.x = 0.42;
  torsoGroup.add(tail);

  addMesh(tail, new THREE.SphereGeometry(0.075, 14, 10), materials.tail, [0, 0, 0], [0, 0, 0], [0.8, 0.9, 0.9]);
  addMesh(tail, new THREE.CylinderGeometry(0.028, 0.038, 0.74, 12, 4, false), materials.tail, [0, -0.38, 0]);

  const tailTip = new THREE.Group();
  tailTip.position.set(0, -0.76, 0);
  tail.add(tailTip);
  addMesh(tailTip, new THREE.CylinderGeometry(0.018, 0.026, 0.30, 10), materials.tail, [0, -0.14, 0]);
  addMesh(tailTip, new THREE.SphereGeometry(0.070, 14, 10), materials.mane, [0, -0.32, 0], [0, 0, 0], [0.68, 1.55, 0.68]);

  // Subtle chest and jaw details.
  addMesh(torsoGroup, new THREE.SphereGeometry(0.18, 18, 12), materials.body, [0, -0.18, 0.78], [0, 0, 0], [0.75, 0.55, 0.55]);
  addMesh(head, new THREE.SphereGeometry(0.042, 12, 8), materials.muzzle, [0, -0.105, 0.175], [0, 0, 0], [0.85, 0.45, 0.75]);

  // Animated dust emitted near the hooves.
  const dustCount = 180;
  const dustPositions = new Float32Array(dustCount * 3);
  const dustVelocities = new Float32Array(dustCount * 3);
  const dustLife = new Float32Array(dustCount);
  for (let i = 0; i < dustCount; i++) {
    dustPositions[i * 3 + 1] = -100;
    dustVelocities[i * 3 + 1] = 0;
  }
  const dustGeometry = new THREE.BufferGeometry();
  dustGeometry.setAttribute('position', new THREE.BufferAttribute(dustPositions, 3));
  const dustMaterial = new THREE.PointsMaterial({
    color: 0xd8c28a,
    size: 0.065,
    transparent: true,
    opacity: 0.30,
    depthWrite: false,
    sizeAttenuation: true,
  });
  const dust = new THREE.Points(dustGeometry, dustMaterial);
  dust.frustumCulled = false;
  scene.add(dust);
  let dustSpawnTimer = 0;

  const footWorld = new THREE.Vector3();
  const dustVelocity = new THREE.Vector3();
  const forward = new THREE.Vector3();

  function spawnDust() {
    for (let attempt = 0; attempt < dustCount; attempt++) {
      if (dustLife[attempt] <= 0) {
        const leg = legs[attempt % legs.length];
        leg.root.getWorldPosition(footWorld);
        const index = attempt;
        dustPositions[index * 3] = footWorld.x + (Math.random() - 0.5) * 0.16;
        dustPositions[index * 3 + 1] = 0.045 + Math.random() * 0.05;
        dustPositions[index * 3 + 2] = footWorld.z + (Math.random() - 0.5) * 0.16;

        giraffe.getWorldDirection(forward);
        dustVelocity.set(
          -forward.x * (0.25 + Math.random() * 0.35) + (Math.random() - 0.5) * 0.25,
          0.22 + Math.random() * 0.34,
          -forward.z * (0.25 + Math.random() * 0.35) + (Math.random() - 0.5) * 0.25
        );
        dustVelocities[index * 3] = dustVelocity.x;
        dustVelocities[index * 3 + 1] = dustVelocity.y;
        dustVelocities[index * 3 + 2] = dustVelocity.z;
        dustLife[index] = 0.65 + Math.random() * 0.55;
        return;
      }
    }
  }

  function updateDust(dt) {
    dustSpawnTimer -= dt;
    if (dustSpawnTimer <= 0 && !state.paused) {
      spawnDust();
      spawnDust();
      dustSpawnTimer = 0.035 / Math.max(0.25, state.speed);
    }

    for (let i = 0; i < dustCount; i++) {
      if (dustLife[i] > 0) {
        dustLife[i] -= dt * 0.72;
        dustVelocities[i * 3 + 1] -= 0.55 * dt;
        dustPositions[i * 3] += dustVelocities[i * 3] * dt;
        dustPositions[i * 3 + 1] += dustVelocities[i * 3 + 1] * dt;
        dustPositions[i * 3 + 2] += dustVelocities[i * 3 + 2] * dt;
        if (dustPositions[i * 3 + 1] < 0.02) dustPositions[i * 3 + 1] = 0.02;
        if (dustLife[i] <= 0) dustPositions[i * 3 + 1] = -100;
      }
    }
    dustGeometry.attributes.position.needsUpdate = true;
  }

  function updateGiraffe(dt) {
    state.pathAngle += dt * 0.145 * state.speed;
    state.phase += dt * Math.PI * 2 * (0.72 + state.speed * 0.34);

    const a = state.pathAngle;
    const r = state.pathRadius;
    giraffe.position.set(Math.sin(a) * r, 0, Math.cos(a) * r);
    giraffe.rotation.y = a + Math.PI / 2;

    const phase = state.phase;
    const bodyBob = Math.sin(phase * 2 + 0.35) * 0.032;
    const breathe = Math.sin(state.time * 1.35) * 0.006;

    torsoGroup.position.y = 2.62 + bodyBob;
    torsoGroup.rotation.x = -0.035 + Math.sin(phase * 2 + 1.0) * 0.010;
    torsoGroup.rotation.z = Math.sin(phase + 0.7) * 0.018;
    torsoGroup.scale.set(1 + breathe * 0.25, 1 + breathe, 1 + breathe * 0.2);

    neckBase.rotation.x = 0.68 + Math.sin(phase * 2 + 0.45) * 0.025;
    neckBase.rotation.z = Math.sin(phase + 0.9) * 0.035;
    neckTop.rotation.x = -0.15 + Math.sin(phase * 2 + 0.75) * 0.030;

    head.rotation.x = -0.53 + Math.sin(phase * 2 + 1.15) * 0.040;
    head.rotation.z = Math.sin(phase + 0.35) * 0.022;

    const earL = head.getObjectByName('earLeft');
    const earR = head.getObjectByName('earRight');
    if (earL) earL.rotation.y = 0.38 + Math.sin(state.time * 2.7) * 0.035 + Math.max(0, Math.sin(state.time * 0.7)) * 0.05;
    if (earR) earR.rotation.y = -0.38 - Math.sin(state.time * 3.1 + 1.2) * 0.035 - Math.max(0, Math.sin(state.time * 0.9 + 2.0)) * 0.05;

    tail.rotation.x = 0.24 + Math.sin(phase * 2 + 0.2) * 0.045;
    tail.rotation.z = Math.sin(state.time * 1.15 + phase * 0.35) * 0.24;
    tailTip.rotation.z = Math.sin(state.time * 1.7 + 0.7) * 0.22;

    for (let i = 0; i < legs.length; i++) {
      const leg = legs[i];
      const p = phase + leg.def.offset;
      const swing = Math.sin(p);
      const lift = Math.max(0, Math.sin(p + 0.72));
      const pushOff = Math.max(0, Math.cos(p + 0.25));

      leg.root.rotation.x = 0.12 * swing;
      leg.root.rotation.z = leg.def.side * (0.014 + 0.009 * Math.sin(p * 0.5));
      leg.root.position.y = leg.baseY + bodyBob * 0.28 + lift * 0.028;

      leg.knee.rotation.x = 0.04 + 0.26 * lift;
      leg.hock.rotation.x = -0.06 - 0.09 * pushOff + 0.04 * lift;
      leg.upper.rotation.z = leg.def.side * 0.012 * Math.sin(p + 0.4);
    }
  }

  // Lightweight orbit controls that work from file:// without ES modules.
  class OrbitCamera {
    constructor(camera, dom, target) {
      this.camera = camera;
      this.dom = dom;
      this.target = target.clone();
      this.homeTarget = target.clone();
      this.theta = Math.atan2(camera.position.x - target.x, camera.position.z - target.z);
      this.phi = Math.acos(clamp((camera.position.y - target.y) / camera.position.distanceTo(target), -1, 1));
      this.radius = camera.position.distanceTo(target);
      this.targetTheta = this.theta;
      this.targetPhi = this.phi;
      this.targetRadius = this.radius;
      this.dragging = false;
      this.panning = false;
      this.lastX = 0;
      this.lastY = 0;
      this.pointers = new Map();
      this.pinchDistance = 0;

      dom.addEventListener('contextmenu', (event) => event.preventDefault());
      dom.addEventListener('pointerdown', this.onPointerDown.bind(this));
      window.addEventListener('pointermove', this.onPointerMove.bind(this));
      window.addEventListener('pointerup', this.onPointerUp.bind(this));
      window.addEventListener('pointercancel', this.onPointerUp.bind(this));
      dom.addEventListener('wheel', this.onWheel.bind(this), { passive: false });
    }

    onPointerDown(event) {
      this.dom.setPointerCapture(event.pointerId);
      this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      this.dragging = true;
      this.panning = event.button === 2 || event.shiftKey;
      this.lastX = event.clientX;
      this.lastY = event.clientY;
      if (this.pointers.size === 2) {
        const points = [...this.pointers.values()];
        this.pinchDistance = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
      }
    }

    onPointerMove(event) {
      if (!this.pointers.has(event.pointerId)) return;
      this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

      if (this.pointers.size === 2) {
        const points = [...this.pointers.values()];
        const distance = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
        if (this.pinchDistance > 0) {
          this.targetRadius = clamp(this.targetRadius * (this.pinchDistance / distance), 3.2, 22);
        }
        this.pinchDistance = distance;
        return;
      }

      if (!this.dragging) return;
      const dx = event.clientX - this.lastX;
      const dy = event.clientY - this.lastY;
      this.lastX = event.clientX;
      this.lastY = event.clientY;

      if (this.panning) {
        const right = new THREE.Vector3().setFromMatrixColumn(this.camera.matrix, 0);
        const up = new THREE.Vector3().setFromMatrixColumn(this.camera.matrix, 1);
        const pan = right.multiplyScalar(-dx * 0.0032).add(up.multiplyScalar(dy * 0.0032));
        this.target.add(pan);
        this.camera.position.add(pan);
      } else {
        this.targetTheta -= dx * 0.0052;
        this.targetPhi = clamp(this.targetPhi - dy * 0.0048, 0.12, Math.PI - 0.12);
      }
    }

    onPointerUp(event) {
      this.pointers.delete(event.pointerId);
      if (this.pointers.size < 2) this.pinchDistance = 0;
      if (this.pointers.size === 0) {
        this.dragging = false;
        this.panning = false;
      }
    }

    onWheel(event) {
      event.preventDefault();
      this.targetRadius = clamp(this.targetRadius * Math.exp(event.deltaY * 0.0011), 3.2, 24);
    }

    followTo(desiredTarget, dt) {
      if (!state.follow) return;
      const oldTarget = this.target.clone();
      const alpha = 1 - Math.pow(0.001, dt);
      this.target.lerp(desiredTarget, alpha);
      const moved = this.target.clone().sub(oldTarget);
      this.camera.position.add(moved);
    }

    reset(focus) {
      this.target.copy(focus);
      this.homeTarget.copy(focus);
      this.targetTheta = Math.atan2(5.8, 5.2);
      this.targetPhi = 1.28;
      this.targetRadius = 8.2;
    }

    update(dt, focus) {
      this.followTo(focus, dt);
      const damping = 1 - Math.pow(0.0001, dt);
      this.theta += (this.targetTheta - this.theta) * damping;
      this.phi += (this.targetPhi - this.phi) * damping;
      this.radius += (this.targetRadius - this.radius) * damping;

      const offset = new THREE.Vector3().setFromSphericalCoords(this.radius, this.phi, this.theta);
      this.camera.position.copy(this.target).add(offset);
      this.camera.lookAt(this.target);
      this.camera.updateMatrixWorld();
    }
  }

  const initialFocus = new THREE.Vector3(0, 2.15, state.pathRadius);
  const orbit = new OrbitCamera(camera, canvas, initialFocus);
  orbit.reset(initialFocus);

  function getFocus() {
    return new THREE.Vector3(giraffe.position.x, 2.18, giraffe.position.z);
  }

  // UI wiring.
  speedInput.addEventListener('input', () => {
    state.speed = clamp(Number(speedInput.value), 0.35, 2);
  });

  followInput.addEventListener('change', () => {
    state.follow = followInput.checked;
  });

  resetButton.addEventListener('click', () => {
    orbit.reset(getFocus());
  });

  function setPaused(value) {
    state.paused = value;
    pauseButton.textContent = state.paused ? 'Resume' : 'Pause';
  }

  pauseButton.addEventListener('click', () => setPaused(!state.paused));

  // Optional deep-link helpers are handy for inspecting a pose or angle.
  const params = new URLSearchParams(window.location.search);
  function paramNumber(name, fallback) {
    const value = Number(params.get(name));
    return Number.isFinite(value) ? value : fallback;
  }
  state.pathAngle = paramNumber('angle', state.pathAngle);
  state.speed = clamp(paramNumber('speed', state.speed), 0.35, 2);
  speedInput.value = String(state.speed);
  orbit.targetTheta = paramNumber('theta', orbit.targetTheta);
  orbit.targetPhi = clamp(paramNumber('phi', orbit.targetPhi), 0.12, Math.PI - 0.12);
  orbit.targetRadius = clamp(paramNumber('radius', orbit.targetRadius), 3.2, 24);
  if (params.get('pause') === '1') setPaused(true);

  window.addEventListener('keydown', (event) => {
    if (event.code === 'Space' && event.target === document.body) {
      event.preventDefault();
      setPaused(!state.paused);
    }
    if (event.key.toLowerCase() === 'r') {
      orbit.reset(getFocus());
    }
  });

  function resize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
  }
  window.addEventListener('resize', resize);
  resize();

  fallback.hidden = true;

  let previousTime = performance.now();
  function animate(now) {
    const dt = clamp((now - previousTime) / 1000, 0, 0.05);
    previousTime = now;

    if (!state.paused) {
      state.time += dt;
      updateGiraffe(dt);
      updateDust(dt);
    }

    contactShadow.position.set(giraffe.position.x, 0.012, giraffe.position.z);
    contactShadow.rotation.z = -giraffe.rotation.y;

    orbit.update(dt, getFocus());
    renderer.render(scene, camera);
    requestAnimationFrame(animate);
  }

  updateGiraffe(0);
  requestAnimationFrame(animate);
})();
