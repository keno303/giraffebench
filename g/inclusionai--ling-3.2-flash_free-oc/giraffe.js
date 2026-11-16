/* ============================================================
   Walking Giraffe — Three.js r160 (inlined, zero dependencies)
   Runs from file:// — no server, no build step.
   ============================================================ */

// ---------- renderer ----------
const renderer = new WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = PCFSoftShadowMap;
renderer.toneMapping = ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
renderer.outputColorSpace = SRGBColorSpace;
document.body.appendChild(renderer.domElement);

// ---------- scene / camera ----------
const world = new Scene();
world.background = new Color(0x9fc4dd);
world.fog = new Fog(0xd8d2b2, 38, 100);

const cam = new PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 400);

// ---------- lights ----------
world.add(new HemisphereLight(0xcfe4f7, 0x9a8a60, 0.9));

const sunLight = new DirectionalLight(0xfff1d6, 2.6);
sunLight.position.set(9, 14, 7);
sunLight.castShadow = true;
sunLight.shadow.mapSize.set(2048, 2048);
sunLight.shadow.camera.left = -16;
sunLight.shadow.camera.right = 16;
sunLight.shadow.camera.top = 16;
sunLight.shadow.camera.bottom = -16;
sunLight.shadow.camera.near = 1;
sunLight.shadow.camera.far = 50;
sunLight.shadow.bias = -0.0004;
sunLight.shadow.normalBias = 0.03;
world.add(sunLight);

const rimLight = new DirectionalLight(0xbcd4ff, 0.7);
rimLight.position.set(-8, 6, -9);
world.add(rimLight);

// ---------- deterministic random ----------
let seed = 7;
function rnd() { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }

// ---------- procedural textures ----------
function makeSpotsTexture(opts) {
  const o = Object.assign({ base: '#c69a5b', spotA: '#7a4a1d', spotB: '#8a5526', line: '#e7d7ae', w: 512, h: 512, cols: 7, rows: 6 }, opts);
  const c = document.createElement('canvas'); c.width = o.w; c.height = o.h;
  const g = c.getContext('2d');
  g.fillStyle = o.base; g.fillRect(0, 0, o.w, o.h);
  const cw = o.w / o.cols, ch = o.h / o.rows;
  for (let iy = 0; iy < o.rows; iy++) {
    for (let ix = 0; ix < o.cols; ix++) {
      const cx = (ix + 0.5) * cw + (rnd() - 0.5) * cw * 0.5;
      const cy = (iy + 0.5) * ch + (rnd() - 0.5) * ch * 0.5;
      const r = Math.min(cw, ch) * (0.42 + rnd() * 0.22);
      const n = 8 + Math.floor(rnd() * 3);
      g.beginPath();
      for (let k = 0; k <= n; k++) {
        const a = (k / n) * Math.PI * 2;
        const rr = r * (0.72 + rnd() * 0.45);
        const x = cx + Math.cos(a) * rr * 1.18;
        const y = cy + Math.sin(a) * rr * 0.92;
        if (k === 0) g.moveTo(x, y); else g.lineTo(x, y);
      }
      g.closePath();
      g.fillStyle = rnd() > 0.5 ? o.spotA : o.spotB;
      g.fill();
      g.lineWidth = 7;
      g.strokeStyle = o.line;
      g.stroke();
    }
  }
  const t = new CanvasTexture(c);
  t.wrapS = t.wrapT = RepeatWrapping;
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function makeGroundTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 512;
  const g = c.getContext('2d');
  g.fillStyle = '#b39b62'; g.fillRect(0, 0, 512, 512);
  // soft dry patches
  for (let i = 0; i < 60; i++) {
    g.beginPath();
    g.ellipse(rnd() * 512, rnd() * 512, 20 + rnd() * 60, 14 + rnd() * 40, rnd() * 3, 0, 7);
    g.fillStyle = ['rgba(160,140,90,0.35)', 'rgba(190,170,110,0.35)', 'rgba(130,140,80,0.25)', 'rgba(120,100,60,0.25)'][Math.floor(rnd() * 4)];
    g.fill();
  }
  // grass speckles
  for (let i = 0; i < 4200; i++) {
    const x = rnd() * 512, y = rnd() * 512;
    g.fillStyle = ['rgba(90,110,50,0.5)', 'rgba(140,150,80,0.5)', 'rgba(110,95,55,0.5)', 'rgba(200,185,130,0.5)'][Math.floor(rnd() * 4)];
    g.fillRect(x, y, 1 + rnd() * 2, 1 + rnd() * 3);
  }
  const t = new CanvasTexture(c);
  t.wrapS = t.wrapT = RepeatWrapping;
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function makeSky() {
  const c = document.createElement('canvas'); c.width = 4; c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0.0, '#5f9fd4');
  grad.addColorStop(0.55, '#a8cbe4');
  grad.addColorStop(0.82, '#e9e0bd');
  grad.addColorStop(1.0, '#e9e0bd');
  g.fillStyle = grad; g.fillRect(0, 0, 4, 256);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  const dome = new Mesh(new SphereGeometry(150, 24, 16), new MeshBasicMaterial({ map: t, side: BackSide, fog: false }));
  world.add(dome);
}
makeSky();

// ---------- ground ----------
const groundTex = makeGroundTexture();
groundTex.repeat.set(22, 22);
const ground = new Mesh(new CircleGeometry(60, 48), new MeshStandardMaterial({ map: groundTex, roughness: 1 }));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
world.add(ground);
const GROUND_TILE = 120 / 22; // world metres per texture tile

// ---------- scenery: acacia trees + bushes ----------
const trunkMat = new MeshStandardMaterial({ color: 0x6b4a2a, roughness: 1 });
const leafMat = new MeshStandardMaterial({ color: 0x5c6b33, roughness: 1 });
function acacia(x, z, s) {
  const g = new Group();
  const trunk = new Mesh(new CylinderGeometry(0.09 * s, 0.16 * s, 2.4 * s, 8), trunkMat);
  trunk.position.y = 1.2 * s;
  trunk.rotation.z = (rnd() - 0.5) * 0.25;
  trunk.castShadow = true;
  g.add(trunk);
  for (let i = 0; i < 4; i++) {
    const blob = new Mesh(new SphereGeometry(1, 10, 8), leafMat);
    blob.scale.set(1.3 * s * (0.7 + rnd() * 0.5), 0.30 * s, 1.3 * s * (0.7 + rnd() * 0.5));
    blob.position.set((rnd() - 0.5) * 1.7 * s, 2.5 * s + rnd() * 0.5 * s, (rnd() - 0.5) * 1.7 * s);
    blob.castShadow = true;
    g.add(blob);
  }
  g.position.set(x, 0, z);
  world.add(g);
}
acacia(-9, -14, 1.4); acacia(11, -9, 1.1); acacia(-14, 6, 1.7); acacia(9, 15, 1.0); acacia(20, 3, 1.3); acacia(-20, -6, 1.2);

const bushMat = new MeshStandardMaterial({ color: 0x6d7a3c, roughness: 1 });
for (let i = 0; i < 12; i++) {
  const b = new Mesh(new SphereGeometry(0.4 + rnd() * 0.5, 8, 6), bushMat);
  const a = rnd() * Math.PI * 2, r = 6 + rnd() * 22;
  b.position.set(Math.cos(a) * r, 0.14, Math.sin(a) * r);
  b.scale.y = 0.55;
  b.castShadow = true;
  world.add(b);
}

// ---------- giraffe ----------
const coatBase = makeSpotsTexture({ cols: 7, rows: 6, seed: 42 });
function coatVariant(rx, ry) {
  const t = coatBase.clone();
  t.needsUpdate = true;
  t.repeat.set(rx, ry);
  return t;
}
const matCoat = new MeshStandardMaterial({ map: coatBase, roughness: 0.9 });
const matCoatNeck = new MeshStandardMaterial({ map: coatVariant(1.5, 3), roughness: 0.9 });
const matCoatLeg = new MeshStandardMaterial({ map: coatVariant(0.6, 2.5), roughness: 0.9 });
const matCoatHead = new MeshStandardMaterial({ map: coatVariant(1, 1), roughness: 0.9 });
const matDark = new MeshStandardMaterial({ color: 0x33241a, roughness: 0.85 });
const matMane = new MeshStandardMaterial({ color: 0x4a3520, roughness: 0.95 });
const matMuzzle = new MeshStandardMaterial({ color: 0x6a5138, roughness: 0.9 });
const matEye = new MeshStandardMaterial({ color: 0x14100c, roughness: 0.15 });
const matHorn = new MeshStandardMaterial({ color: 0x8a6a42, roughness: 0.8 });
const matLegLower = new MeshStandardMaterial({ color: 0xc9b48c, roughness: 0.9 });

function part(geo, mat, x, y, z, parent) {
  const m = new Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  parent.add(m);
  return m;
}

const giraffe = new Group();
world.add(giraffe);
const bodyGroup = new Group();
const BODY_Y = 2.55;
bodyGroup.position.y = BODY_Y;
giraffe.add(bodyGroup);

// torso (barrel + shoulder hump + rump)
const torso = part(new SphereGeometry(1, 36, 24), matCoat, 0, 0, 0, bodyGroup);
torso.scale.set(0.47, 0.56, 1.06);
const chest = part(new SphereGeometry(0.5, 24, 18), matCoat, 0, 0.20, 0.72, bodyGroup);
chest.scale.set(0.82, 0.95, 1.0);
const rump = part(new SphereGeometry(0.5, 24, 18), matCoat, 0, 0.14, -0.74, bodyGroup);
rump.scale.set(0.88, 0.92, 1.02);

// neck
const neckBaseX = 0.60;
const neckGroup = new Group();
neckGroup.position.set(0, 0.40, 0.92);
neckGroup.rotation.x = neckBaseX;
bodyGroup.add(neckGroup);
part(new CylinderGeometry(0.13, 0.24, 1.75, 20, 1), matCoatNeck, 0, 0.875, 0, neckGroup);
// mane ridge along the back of the neck (follows the taper)
const mane = part(new BoxGeometry(0.05, 1.72, 0.10), matMane, 0, 0.875, -0.205, neckGroup);
mane.rotation.x = 0.063;

// head
let earL = null, earR = null;
const headGroup = new Group();
headGroup.position.set(0, 1.72, 0.03);
headGroup.rotation.x = -0.50; // muzzle slightly down
neckGroup.add(headGroup);
const skull = part(new SphereGeometry(0.20, 24, 18), matCoatHead, 0, 0.03, 0.02, headGroup);
skull.scale.set(0.92, 1.0, 1.2);
const muzzle = part(new CylinderGeometry(0.09, 0.13, 0.30, 14), matMuzzle, 0, -0.03, 0.26, headGroup);
muzzle.rotation.x = Math.PI / 2 + 0.12;
// nostrils
part(new SphereGeometry(0.016, 8, 6), matDark, 0.045, -0.005, 0.44, headGroup);
part(new SphereGeometry(0.016, 8, 6), matDark, -0.045, -0.005, 0.44, headGroup);
// eyes
part(new SphereGeometry(0.033, 12, 10), matEye, 0.125, 0.075, 0.13, headGroup);
part(new SphereGeometry(0.033, 12, 10), matEye, -0.125, 0.075, 0.13, headGroup);
// ossicones (skin-covered bone horns with dark tips)
for (const s of [1, -1]) {
  const horn = part(new CylinderGeometry(0.022, 0.030, 0.15, 8), matCoatHead, s * 0.075, 0.24, -0.03, headGroup);
  horn.rotation.z = -s * 0.12;
  part(new SphereGeometry(0.038, 10, 8), matDark, s * 0.088, 0.32, -0.03, headGroup);
  // ears
  const ear = part(new SphereGeometry(0.085, 12, 10), matCoatHead, s * 0.19, 0.10, -0.02, headGroup);
  ear.scale.set(1.3, 0.65, 0.4);
  ear.rotation.y = -s * 0.5;
  ear.rotation.z = s * 0.25;
  if (s > 0) earL = ear; else earR = ear;
}

// legs (front / hind, left / right) — hip pivot + knee pivot
const legs = [];
function makeLeg(sideSign, isFront) {
  const hip = new Group();
  hip.position.set(sideSign * 0.30, -0.39, isFront ? 0.70 : -0.70);
  bodyGroup.add(hip);
  const shoulder = part(new SphereGeometry(0.17, 14, 10), matCoat, 0, -0.05, 0, hip);
  shoulder.scale.set(0.75, 1.15, 1.25);
  part(new CylinderGeometry(0.095, 0.10, 1.02, 14), matCoatLeg, 0, -0.51, 0, hip);
  const knee = new Group();
  knee.position.set(0, -1.02, 0);
  hip.add(knee);
  part(new SphereGeometry(0.072, 10, 8), matLegLower, 0, 0, 0, knee);
  part(new CylinderGeometry(0.055, 0.045, 0.98, 12), matLegLower, 0, -0.49, 0, knee);
  part(new CylinderGeometry(0.062, 0.075, 0.17, 12), matDark, 0, -1.045, 0.015, knee);
  return { hip, knee, isFront, sideSign };
}
legs.push(makeLeg(1, true));
legs.push(makeLeg(-1, true));
legs.push(makeLeg(1, false));
legs.push(makeLeg(-1, false));

// tail
const tailGroup = new Group();
tailGroup.position.set(0, 0.30, -1.02);
bodyGroup.add(tailGroup);
part(new CylinderGeometry(0.028, 0.018, 0.55, 8), matCoatLeg, 0, -0.26, 0, tailGroup);
const tailEnd = new Group();
tailEnd.position.set(0, -0.53, 0);
tailGroup.add(tailEnd);
part(new CylinderGeometry(0.014, 0.010, 0.30, 6), matCoatLeg, 0, -0.15, 0, tailEnd);
const tuft = part(new ConeGeometry(0.05, 0.24, 8), matDark, 0, -0.40, 0, tailEnd);
tuft.rotation.x = Math.PI;

// ---------- animation ----------
const clock = new Clock();
let phase = 0;
let dist = 0;
let paused = false;
let speedMul = 1;
const CYCLE = 1.15;      // seconds per gait cycle at 1x
const STRIDE = 1.15;     // metres covered per cycle

function animate() {
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;
  if (!paused) {
    const dPhase = dt * (Math.PI * 2) / CYCLE * speedMul;
    phase += dPhase;
    dist += STRIDE * (dPhase / (Math.PI * 2));
    const p = phase;

    // pacing gait: both legs on one side move together (real giraffe walk)
    for (const leg of legs) {
      const lp = leg.sideSign > 0 ? p : p + Math.PI;
      leg.hip.rotation.x = 0.22 * Math.sin(lp);
      const bend = Math.max(0, -Math.cos(lp)); // fold only during swing phase
      leg.knee.rotation.x = leg.isFront ? 0.10 + 0.65 * bend : -0.16 - 0.45 * bend;
    }

    // body sway / bob
    bodyGroup.rotation.z = 0.05 * Math.sin(p);
    bodyGroup.rotation.y = 0.025 * Math.sin(p);
    bodyGroup.position.y = BODY_Y + 0.045 * Math.sin(2 * p + 1.1);

    // neck + head counter-sway (head stays level)
    neckGroup.rotation.z = -0.09 * Math.sin(p);
    neckGroup.rotation.x = neckBaseX + 0.035 * Math.sin(2 * p + 0.4);
    headGroup.rotation.z = 0.05 * Math.sin(p + 0.6);
    headGroup.rotation.x = -0.50 + 0.045 * Math.sin(2 * p + 1.3);

    // tail swish
    tailGroup.rotation.z = 0.20 * Math.sin(p * 0.5 + 1.0) + 0.05 * Math.sin(t * 2.1);
    tailGroup.rotation.x = 0.30 + 0.08 * Math.sin(t * 1.3);

    // ear twitches
    earL.rotation.y = 0.5 + 0.18 * Math.sin(t * 3.1) * Math.max(0, Math.sin(t * 0.7));
    earR.rotation.y = -0.5 - 0.18 * Math.sin(t * 2.7 + 1.0) * Math.max(0, Math.sin(t * 0.9 + 2.0));

    // treadmill ground
    groundTex.offset.y = -((dist % GROUND_TILE) / GROUND_TILE);
  }

  if (autoOrbit) camTheta += dt * 0.18;
  updateCamera();
  renderer.render(world, cam);
}

// ---------- simple orbit controls (drag + wheel) ----------
let camTheta = 0.85, camPhi = 1.18, camRadius = 9.5, autoOrbit = false;
const camTarget = new Vector3(0, 2.45, 0);
function updateCamera() {
  cam.position.set(
    camTarget.x + camRadius * Math.sin(camPhi) * Math.sin(camTheta),
    camTarget.y + camRadius * Math.cos(camPhi),
    camTarget.z + camRadius * Math.sin(camPhi) * Math.cos(camTheta)
  );
  cam.lookAt(camTarget);
}
let dragging = false, lastX = 0, lastY = 0;
renderer.domElement.addEventListener('pointerdown', e => { dragging = true; lastX = e.clientX; lastY = e.clientY; });
window.addEventListener('pointermove', e => {
  if (!dragging) return;
  camTheta -= (e.clientX - lastX) * 0.005;
  camPhi = Math.min(1.52, Math.max(0.15, camPhi - (e.clientY - lastY) * 0.005));
  lastX = e.clientX; lastY = e.clientY;
});
window.addEventListener('pointerup', () => { dragging = false; });
renderer.domElement.addEventListener('wheel', e => {
  e.preventDefault();
  camRadius = Math.min(28, Math.max(4, camRadius + e.deltaY * 0.01));
}, { passive: false });

// ---------- UI ----------
const ui = document.getElementById('ui');
const speedEl = document.getElementById('speed');
const pauseBtn = document.getElementById('pauseBtn');
const spinEl = document.getElementById('spin');
speedEl.addEventListener('input', () => {
  speedMul = parseFloat(speedEl.value);
  document.getElementById('speedVal').textContent = speedMul.toFixed(2) + 'x';
});
function togglePause() {
  paused = !paused;
  pauseBtn.textContent = paused ? 'Resume' : 'Pause';
}
pauseBtn.addEventListener('click', togglePause);
spinEl.addEventListener('change', () => { autoOrbit = spinEl.checked; });
window.addEventListener('keydown', e => { if (e.code === 'Space') { e.preventDefault(); togglePause(); } });

window.addEventListener('resize', () => {
  cam.aspect = window.innerWidth / window.innerHeight;
  cam.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

updateCamera();
renderer.setAnimationLoop(animate);

// debug handle (harmless, useful for automated checks)
window.__debug = {
  groundTex, legs, bodyGroup,
  get phase() { return phase; },
  setCam(th, ph, r, ty = 2.45) { camTheta = th; camPhi = ph; camRadius = r; camTarget.y = ty; updateCamera(); }
};
