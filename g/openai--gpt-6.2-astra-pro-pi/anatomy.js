/* Analytic rest anatomy & the four-beat, lateral-sequence gait. Units are metres. */
"use strict";
const TAU = 2 * Math.PI,
  clamp = (x, a, b) => Math.max(a, Math.min(b, x)),
  mix = (a, b, t) => a + (b - a) * t,
  smooth = (t) => t * t * (3 - 2 * t),
  sat = (x) => clamp(x, 0, 1),
  V = (x, y, z) => new THREE.Vector3(x, y, z);
function rng(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function material(color, roughness = 0.9) {
  return new THREE.MeshStandardMaterial({ color, roughness });
}
function mesh(g, m, parent) {
  let o = new THREE.Mesh(g, m);
  o.castShadow = o.receiveShadow = true;
  parent.add(o);
  return o;
}
let texCache = {};
function atlasTexture(key) {
  if (!texCache[key]) {
    let t = new THREE.TextureLoader().load(ATLAS_IMAGES[key]);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    texCache[key] = t;
  }
  return texCache[key];
}
const sphere = new THREE.SphereGeometry(1, 30, 22);
function oval(gr, mat, x, y, z, a, b, c, rot = 0) {
  let o = mesh(sphere, mat, gr);
  o.position.set(x, y, z);
  o.scale.set(a, b, c);
  o.rotation.z = rot;
  return o;
}
function stroke(gr, mat, points, r, rad = 6) {
  return mesh(
    new THREE.TubeGeometry(
      new THREE.CatmullRomCurve3(points.map((p) => V(...p))),
      Math.max(6, points.length * 4),
      r,
      rad,
      false,
    ),
    mat,
    gr,
  );
}
function spline(rows, u, out) {
  const x = sat(u) * (rows.length - 1),
    i = Math.min(rows.length - 2, Math.floor(x)),
    t = x - i,
    a = rows[Math.max(0, i - 1)],
    b = rows[i],
    c = rows[i + 1],
    d = rows[Math.min(rows.length - 1, i + 2)];
  out ??= new Array(b.length);
  for (let k = 0; k < b.length; k++) {
    const v = b[k];
    out[k] =
      v +
      0.5 *
        t *
        (c[k] -
          a[k] +
          t * (2 * a[k] - 5 * v + 4 * c[k] - d[k] + t * (3 * (v - c[k]) + d[k] - a[k])));
  }
  return out;
}
function surface(rows, shape, n = 48, m = 40) {
  let p = [],
    uv = [],
    ix = [];
  for (let i = 0; i <= n; i++) {
    let a = spline(rows, i / n);
    for (let j = 0; j < m; j++) {
      p.push(...shape(a, (j * TAU) / m, i / n));
      uv.push(j / m, i / n);
    }
  }
  for (let i = 0; i < n; i++)
    for (let j = 0; j < m; j++) {
      let a = i * m + j,
        b = i * m + ((j + 1) % m);
      ix.push(a, b, a + m, b, b + m, a + m);
    }
  for (let j = 1; j < m - 1; j++) {
    ix.push(0, j + 1, j, n * m, n * m + j, n * m + j + 1);
  }
  let g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(p, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(ix);
  g.computeVertexNormals();
  return g;
}
// Dorsal & ventral contour landmarks, then the half-width of the cross section.
const outline = [
  [-1.22, 2.55, -1.22, 2.53, 0.012],
  [-1.23, 2.66, -1.17, 2.3, 0.247],
  [-1.11, 2.84, -1.01, 2.13, 0.36],
  [-0.87, 2.953, -0.79, 2.1, 0.409],
  [-0.62, 2.971, -0.61, 2.11, 0.401],
  [-0.4, 2.978, -0.41, 2.07, 0.421],
  [-0.17, 3.026, -0.18, 2.005, 0.461],
  [0.086, 3.125, 0.067, 1.956, 0.478],
  [0.261, 3.233, 0.311, 1.942, 0.463],
  [0.406, 3.324, 0.558, 2.028, 0.422],
  [0.516, 3.355, 0.738, 2.218, 0.375],
  [0.643, 3.433, 0.879, 2.54, 0.315],
  [0.753, 3.572, 1.009, 2.916, 0.273],
  [0.868, 3.773, 1.137, 3.245, 0.237],
  [1.033, 4.077, 1.3, 3.667, 0.206],
  [1.195, 4.417, 1.457, 4.048, 0.181],
  [1.354, 4.73, 1.611, 4.47, 0.149],
  [1.446, 4.917, 1.705, 4.704, 0.152],
  [1.534, 4.984, 1.742, 4.844, 0.137],
  [1.631, 4.972, 1.706, 4.913, 0.044],
];
function torsoShape(r, a, u) {
  let c = Math.cos(a),
    s = Math.sin(a),
    x = (r[0] + r[2] + (r[0] - r[2]) * c) * 0.5,
    y = (r[1] + r[3] + (r[1] - r[3]) * c) * 0.5;
  let z = r[4] * s * (1 + 0.063 * c);
  const gauss = (q, w) => Math.exp((-q * q) / w);
  let cheek = sat((y - 3.05) * 1.3);
  z *=
    1 +
    cheek *
      (0.07 * gauss(c - 0.42, 0.043) -
        0.068 * gauss(c + 0.06, 0.039) +
        0.045 * gauss(c + 0.49, 0.019));
  z +=
    Math.sign(s) *
    Math.pow(Math.abs(s), 2) *
    (0.022 * gauss(x + 0.04, 0.12) * gauss(y - 2.61, 0.25) * Math.cos((x + 0.18 * y) * 20) +
      0.014 * gauss(x + 0.89, 0.061) * gauss(y - 2.67, 0.08));
  return [x, y, z];
}
const cycle = 1.88,
  stride = 1.54,
  stance = 0.646;
function legPose(front, s, phase = 0, bob = 0, neutral = false) {
  let p = (phase + (s < 0 ? 0.5 : 0) + (front ? 0.87 : 0)) % 1;
  let home = front ? 0.53 : -0.845,
    x,
    y = 0.103,
    tilt = 0,
    h = 0;
  if (neutral) {
    x = home;
  } else if (p < stance) {
    let u = p / stance;
    x = home + stride * (stance * 0.5 - p);
    tilt = -0.22 * smooth(sat((u - 0.82) / 0.18));
    y += 0.104 * Math.sin(-tilt);
  } else {
    let u = (p - stance) / (1 - stance);
    h = Math.sin(Math.PI * u);
    x =
      home -
      stride * stance * 0.5 +
      stride * stance * smooth(u) -
      stride * (1 - stance) * u * (1 - u) * (1 - 2 * u);
    tilt = -0.22 * (1 - u) - 0.55 * h + 0.12 * Math.sin(TAU * u);
    y += (front ? 0.27 : 0.303) * h * h + 0.104 * Math.sin(-tilt);
  }
  let ax = x - 0.062 * Math.cos(tilt) - 0.124 * Math.sin(tilt),
    ay = y - 0.062 * Math.sin(tilt) + 0.124 * Math.cos(tilt);
  let sway = neutral ? 0 : Math.sin(p * TAU);
  let ox = (front ? 0.407 : -0.8) + sway * (front ? 0.039 : 0.027),
    oy = (front ? 2.977 : 2.827) + bob;
  let jx = front ? 0.605 : -0.725,
    jy = (front ? 2.405 : 2.428) + bob;
  jx += 0.08 * (ax - home);
  let ex = (front ? 0.352 : -0.471) + (front ? 0.29 : 0.22) * (ax - home),
    ey = (front ? 2.033 : 1.907) + bob + (neutral ? 0 : 0.017 * Math.cos(p * TAU));
  let dx = ex - ax,
    dy = ey - ay,
    dist = Math.hypot(dx, dy);
  let ang = Math.atan2(dx, dy),
    length = front ? 0.908 : 0.868,
    fold = front ? 0.055 + 0.25 * h : -0.19 - 0.31 * h;
  let kx = ax + Math.sin(ang + fold) * length,
    ky = ay + Math.cos(ang + fold) * length;
  let z = s * (front ? 0.258 : 0.27),
    out = s * 0.03 * h;
  let top = [ox, oy, z * 0.69, 0.028, 0.029],
    joint = [jx, jy, z * 0.91, front ? 0.208 : 0.232, front ? 0.193 : 0.205],
    el = [ex, ey, z, front ? 0.131 : 0.169, front ? 0.114 : 0.144],
    knee = [kx, ky, z + out, front ? 0.077 : 0.091, front ? 0.071 : 0.075],
    fet = [ax, ay, z + out, 0.062, 0.057],
    toe = [x, y + 0.026, z + out, 0.061, 0.056];
  let mid = (a, b, u, rx, rz) => [
    mix(a[0], b[0], u),
    mix(a[1], b[1], u),
    mix(a[2], b[2], u),
    rx,
    rz,
  ];
  let rows = [
    top,
    mid(top, joint, 0.37, front ? 0.218 : 0.279, front ? 0.169 : 0.208),
    mid(top, joint, 0.69, front ? 0.23 : 0.287, front ? 0.184 : 0.221),
    joint,
    mid(joint, el, 0.53, front ? 0.174 : 0.227, front ? 0.147 : 0.183),
    el,
    mid(el, knee, 0.22, front ? 0.112 : 0.139, front ? 0.098 : 0.119),
    mid(el, knee, 0.51, front ? 0.077 : 0.094, 0.077),
    mid(el, knee, 0.83, 0.054, 0.055),
    knee,
    mid(knee, fet, 0.12, 0.055, 0.055),
    mid(knee, fet, 0.41, 0.045, 0.049),
    mid(knee, fet, 0.74, 0.042, 0.043),
    mid(knee, fet, 0.91, 0.046, 0.047),
    fet,
    mid(fet, toe, 0.58, 0.048, 0.047),
    toe,
    [x, y - 0.033, z + out, 0.049, 0.047],
  ];
  return { x, y, z: z + out, tilt, rows };
}
function legShape(r, t) {
  return [r[0] + Math.cos(t) * r[3], r[1], r[2] + Math.sin(t) * r[4]];
}
