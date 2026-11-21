/* Close-study details. Eyelids and lashes share blink morphs, while the iris stays still.
   Surface probes fit the lids, nostril wings, and lip seam to the sculpted skull. */
function modelFace({ T, V, shapes, poll, detail, sweep, mat }) {
  const tau = Math.PI * 2,
    lids = [],
    hairs = [];
  let random = 1987;
  const r = () => (random = (Math.imul(1664525, random) + 1013904223) >>> 0) / 4294967296,
    color = (c) => new T.Color(c);
  const forms = shapes.filter((s) => s.id === poll);
  function sideWall(x, y) {
    let a = 0,
      b = 0.3;
    for (let j = 0; j < 13; j++) {
      let z = (a + b) * 0.5,
        d = 0.8;
      for (let s of forms) {
        let v = s.d(x, y, z),
          h = Math.max(s.k - Math.abs(d - v), 0);
        d = Math.min(d, v) - (h * h) / (4 * s.k);
      }
      if (d > 0) b = z;
      else a = z;
    }
    return (a + b) * 0.5;
  }
  function hair(a, b, rad, c, delta = null) {
    hairs.push({ a, b, rad, c, delta });
  }
  function surface(nx, ny, fn, m, blink = false) {
    let p = [],
      uv = [],
      cs = [],
      morph = [],
      idx = [];
    for (let j = 0; j <= ny; j++)
      for (let i = 0; i <= nx; i++) {
        let { v, col, st, shift } = fn(i / nx, j / ny);
        p.push(v.x, v.y, v.z);
        uv.push(...(st || [i / nx, j / ny]));
        if (col) cs.push(col.r, col.g, col.b);
        if (blink) morph.push(shift.x, shift.y, shift.z);
        if (i && j) {
          let k = j * (nx + 1) + i;
          idx.push(k - nx - 2, k - nx - 1, k, k - nx - 2, k, k - 1);
        }
      }
    let g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(p, 3));
    g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
    if (cs.length) g.setAttribute('color', new T.Float32BufferAttribute(cs, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    if (blink) {
      g.morphTargetsRelative = true;
      g.morphAttributes.position = [new T.Float32BufferAttribute(morph, 3)];
    }
    let mesh = detail(g, m, poll);
    if (blink) lids.push(mesh);
    return mesh;
  }
  function paintedEye() {
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 256;
    let g = c.getContext('2d');
    g.scale(2, 2);
    g.fillStyle = '#67574a';
    g.fillRect(0, 0, 256, 128);
    let grad = g.createRadialGradient(132, 64, 3, 132, 64, 65);
    grad.addColorStop(0, '#2a241e');
    grad.addColorStop(0.38, '#443020');
    grad.addColorStop(0.77, '#68462b');
    grad.addColorStop(0.94, '#3b3025');
    grad.addColorStop(1, '#1e201b');
    g.fillStyle = grad;
    g.beginPath();
    g.ellipse(132, 64, 65, 64, 0, 0, tau);
    g.fill();
    for (let i = 0; i < 1200; i++) {
      let a = r() * tau,
        b = 22 + r() * 35,
        len = 3 + r() * 12;
      g.beginPath();
      g.moveTo(132 + Math.cos(a) * b, 64 + Math.sin(a) * b);
      g.lineTo(132 + Math.cos(a + 0.012) * (b + len), 64 + Math.sin(a + 0.012) * (b + len));
      g.lineWidth = 0.3 + r() * 0.5;
      g.strokeStyle = r() < 0.5 ? '#d8985140' : '#1a170b50';
      g.stroke();
    }
    g.fillStyle = '#171a17';
    g.beginPath();
    g.ellipse(132, 64, 43, 18, -0.025, 0, tau);
    g.fill();
    g.fillStyle = 'rgba(245,244,219,.68)';
    g.beginPath();
    g.ellipse(151, 40, 6, 3, -0.47, 0, tau);
    g.fill();
    g.fillStyle = 'rgba(250,250,249,.29)';
    g.fillRect(157, 36, 2, 2);
    let tex = new T.CanvasTexture(c);
    tex.colorSpace = T.SRGBColorSpace;
    return new T.MeshStandardMaterial({ map: tex, side: T.DoubleSide, roughness: 0.19 });
  }
  const eyeMat = paintedEye(),
    skin = new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.96, side: T.DoubleSide });
  for (let s of [-1, 1]) {
    function corner(u) {
      return Math.max(0, 1 - u * u) ** 0.81;
    }
    function eye(u, w, lift = 0) {
      let x = 1.948 + 0.064 * u,
        y = 5.142 - 0.01 * u + 0.039 * w,
        z = sideWall(x, y);
      return V(x, y, s * (z + 0.004 + Math.max(0, 1 - u * u - w * w) * 0.015 + lift));
    }
    surface(
      42,
      20,
      (i, j) => {
        let u = 2 * i - 1,
          w = (-0.75 + j * 1.66) * corner(u);
        return { v: eye(u, w), st: [i, 0.5 + w * 0.47] };
      },
      eyeMat,
    );
    for (let upper of [true, false]) {
      surface(
        36,
        9,
        (i, j) => {
          let u = 2 * i - 1,
            f = corner(u),
            a = (upper ? 0.91 : -0.75) * f,
            w = a + (upper ? 0.61 : -0.34) * f * j,
            v = eye(u, w, 0.003 + 0.007 * Math.sin(j * Math.PI) * f);
          v.z -= s * 0.009 * j;
          let closed = eye(
            u,
            w - (upper ? 1.665 : 0) * f * (1 - j),
            0.004 + 0.006 * Math.sin(Math.PI * j) * f,
          );
          closed.z -= s * 0.009 * j;
          let col = color(upper ? 0x372b25 : 0x614a37).lerp(
            color(upper ? 0xb5865a : 0xd1ab79),
            Math.min(1, j * 2.5),
          );
          return { v, col, shift: closed.sub(v) };
        },
        skin,
        upper,
      );
    }
    for (let j = 0; j < 27; j++) {
      let u = -0.94 + (1.88 * (j + r() * 0.42)) / 27,
        f = corner(u);
      let a = eye(u, 0.91 * f, 0.005),
        b = a
          .clone()
          .add(V(-0.005 + 0.009 * u, 0.009 + 0.014 * f + 0.006 * r(), s * (0.014 + 0.018 * r())));
      hair(a, b, 0.0014 + 0.0007 * r(), color(0x352820), eye(u, -0.747 * f, 0.006).sub(a));
    }
    // Velvety ossicones have a flared root and an irregular brush rather than a separate cap.
    const profile = [
      [0, 0.078, 0xc39964],
      [0.17, 0.063, 0xb38a5c],
      [0.48, 0.048, 0xa2784e],
      [0.7, 0.045, 0x93663e],
      [0.77, 0.05, 0x784f31],
      [0.86, 0.057, 0x5e402a],
      [0.93, 0.049, 0x583b27],
      [0.982, 0.029, 0x63432c],
      [1, 0.001, 0x64442b],
    ];
    function stalk(u) {
      return V(
        1.798 - 0.052 * u + (s < 0 ? 0.013 * u : 0),
        5.251 + (0.303 + (s < 0 ? 0.008 : 0)) * u,
        s * (0.096 + 0.057 * u),
      );
    }
    function radius(t) {
      let k = 1;
      while (k < profile.length - 1 && profile[k][0] < t) k++;
      let a = profile[k - 1],
        b = profile[k],
        u = (t - a[0]) / (b[0] - a[0]);
      return [a[1] + u * (b[1] - a[1]), color(a[2]).lerp(color(b[2]), u)];
    }
    surface(
      40,
      42,
      (i, j) => {
        let [rad, col] = radius(j),
          a = tau * i,
          pt = stalk(j);
        rad *= 1 + 0.032 * Math.sin(a * 3 + j * 5) + 0.018 * Math.sin(7 * a);
        pt.x += rad * Math.cos(a);
        pt.z += rad * Math.sin(a) * 0.95;
        col.multiplyScalar(0.965 + 0.053 * Math.sin(a * 8 + j * 2) + 0.05 * r());
        return { v: pt, col };
      },
      skin,
    );
    for (let i = 0; i < 440; i++) {
      let t = 0.76 + 0.24 * r(),
        a = tau * r(),
        rr = radius(t)[0],
        p = stalk(t);
      p.x += Math.cos(a) * rr * 0.97;
      p.z += Math.sin(a) * rr * 0.95;
      hair(
        p,
        p.clone().add(V(Math.cos(a) * 0.006 - 0.002, 0.004 + 0.01 * r(), Math.sin(a) * 0.006)),
        0.0019 + 0.001 * r(),
        color(r() < 0.52 ? 0x654931 : 0x513624),
      );
    }
    // Nostril alae are fitted to the sloped side of the muzzle, with a dark inset and a raised rim.
    const nostril = (u, v) => {
      let x = 2.428 + 0.047 * u,
        y = 4.967 - 0.014 * u + 0.017 * v;
      return V(x, y, s * (sideWall(x, y) + 0.0015));
    };
    surface(
      40,
      12,
      (a, k) => {
        let t = a * tau,
          u = Math.cos(t) * k,
          v = Math.sin(t) * k * (0.84 - 0.29 * u);
        let p = nostril(u, v);
        p.z += s * 0.006 * k * k;
        let c = color(0x29231f).lerp(color(0x6c5140), k * k * k);
        return { v: p, col: c };
      },
      skin,
    );
    let rim = [];
    for (let i = 0; i <= 16; i++) {
      let t = -0.41 + (Math.PI * 1.43 * i) / 16;
      let p = nostril(Math.cos(t), Math.sin(t) * (0.84 - 0.29 * Math.cos(t)));
      p.z += s * 0.004;
      rim.push(p);
    }
    sweep(rim, [0.001, 0.004, 0.005, 0.004, 0.001], mat(0xa8815e), poll, 9);
    let seam = [];
    for (let i = 0; i < 20; i++) {
      let u = i / 19,
        x = 2.116 + 0.389 * u,
        y = 4.902 - 0.024 * Math.sin(Math.PI * u) + 0.001 * u;
      seam.push(V(x, y, s * (sideWall(x, y) + 0.0008)));
    }
    sweep(seam, [0.0008, 0.0031, 0.004, 0.0044, 0.002], mat(0x553f32), poll, 8);
    for (let i = 0; i < 34; i++) {
      let x = 2.27 + r() * 0.219,
        y = 4.896 + r() * 0.049,
        wall = sideWall(x, y);
      if (wall < 0.045) continue;
      let p = V(x, y, s * (wall + 0.0006));
      hair(
        p,
        p.clone().add(V(0.004 + r() * 0.015, -0.004 - r() * 0.012, s * (0.009 + r() * 0.017))),
        0.00065 + 0.0004 * r(),
        color(r() < 0.5 ? 0x9c8162 : 0xc9ab83),
      );
    }
  }
  // Batch the fine hairs; eyelash deltas move with the upper lid without stretching the globe.
  let p = [],
    c = [],
    idx = [],
    m = [];
  for (let { a, b, rad, c: col, delta } of hairs) {
    let dir = b.clone().sub(a).normalize(),
      v = dir
        .clone()
        .cross(Math.abs(dir.y) > 0.9 ? V(1, 0, 0) : V(0, 1, 0))
        .normalize(),
      w = dir.clone().cross(v),
      n = p.length / 3;
    for (let i = 0; i < 4; i++) {
      let t = (tau * i) / 4,
        pt = a
          .clone()
          .addScaledVector(v, rad * Math.cos(t))
          .addScaledVector(w, rad * Math.sin(t));
      p.push(pt.x, pt.y, pt.z);
      c.push(col.r, col.g, col.b);
      m.push(delta?.x || 0, delta?.y || 0, delta?.z || 0);
      idx.push(n + i, n + ((i + 1) % 4), n + 4);
    }
    p.push(b.x, b.y, b.z);
    c.push(col.r, col.g, col.b);
    m.push(delta?.x || 0, delta?.y || 0, delta?.z || 0);
  }
  let g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(p, 3));
  g.setAttribute('color', new T.Float32BufferAttribute(c, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  g.morphTargetsRelative = true;
  g.morphAttributes.position = [new T.Float32BufferAttribute(m, 3)];
  lids.push(detail(g, skin, poll));
  return (cycles) => {
    let t = (cycles + 0.9) % 3.74;
    let u = t < 0.139 ? Math.sin((Math.PI * t) / 0.139) ** 1.56 : 0;
    for (let m of lids) m.morphTargetInfluences[0] = u;
  };
}
