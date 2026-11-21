/* Seamless, mipmapped nap: fine strokes are filtered away at walking distance,
   but are visible on the ears, cheek and neck in the portrait lens. */
function coatNap() {
  const T = THREE,
    c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  let seed = 9123;
  const r = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
  g.fillStyle = '#808080';
  g.fillRect(0, 0, 256, 256);
  g.lineCap = 'round';
  for (let k = 0; k < 25000; k++) {
    let x = r() * 256,
      y = r() * 256,
      n = r(),
      len = 2 + 11 * r(),
      dy = (r() - 0.42) * 2.8 + len * 0.11 * Math.sin((y * Math.PI) / 128);
    g.strokeStyle = `rgba(${n < 0.52 ? '34,34,34' : '227,227,227'},${0.07 + 0.35 * r()})`;
    g.lineWidth = 0.55 + 1.1 * r();
    for (let u of [0, ...(x + len > 255 ? [-256] : [])])
      for (let v of [0, ...(y < 3 ? [256] : y > 253 ? [-256] : [])]) {
        g.beginPath();
        g.moveTo(x + u, y + v);
        g.quadraticCurveTo(x + u + len * 0.45, y + v + dy * 0.15, x + u + len, y + v + dy);
        g.stroke();
      }
  }
  let tex = new T.CanvasTexture(c);
  tex.wrapS = tex.wrapT = T.RepeatWrapping;
  tex.anisotropy = 4;
  return tex;
}

function pinnaMesh(side, nap) {
  const T = THREE,
    V = (x, y, z) => new T.Vector3(x, y, z),
    G = new T.Group(),
    pi = Math.PI,
    clamp = (x) => Math.max(0, Math.min(1, x));
  let seed = 87;
  const r = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
  const W = V(0.29, 0.944, -0.176 * side).normalize(),
    N = V(0.82, -0.15, 0.56 * side).normalize();
  function point(t, w, front) {
    let f = Math.max(0, Math.sin(pi * t)) ** 0.79,
      mid = Math.max(0, 1 - w * w),
      width = f * (0.109 + 0.032 * t);
    let v = V(
      -0.247 * t - 0.019 * Math.sin(2 * pi * t),
      0.157 * t + 0.06 * t * t + 0.038 * Math.sin(pi * t),
      side * (0.421 * t + 0.039 * Math.sin(pi * t)),
    );
    v.addScaledVector(W, w * width);
    let recess = f * (-0.044 * mid + 0.008 * w * w + 0.009 * w * Math.sin(t * pi));
    if (!front) recess -= f * (0.019 * Math.sqrt(mid) + 0.007 * mid);
    v.addScaledVector(N, recess);
    return v;
  }
  function dye(t, w, front) {
    let f = Math.sin(pi * t),
      mid = 1 - w * w,
      rim = Math.exp(-(((1 - Math.abs(w)) / 0.18) ** 2));
    let c = new T.Color(front ? 0xd7ba8e : 0xb98955);
    let inner = Math.exp(-(((t - 0.394) / 0.284) ** 2 + ((w + 0.08) / 0.66) ** 2) * 1.18);
    c.lerp(new T.Color(front ? 0x705646 : 0xb38861), front ? inner * 0.89 : 0.56 * f * mid);
    let tip = clamp((t - 0.87) / 0.13);
    c.lerp(new T.Color(0xd0bb99), tip * 0.87);
    c.lerp(new T.Color(0xe0c9a2), rim * 0.82 * f);
    return c;
  }
  let p = [],
    idx = [],
    colors = [],
    uv = [],
    Ncol = 26,
    Nrow = 44;
  for (let sideface = 0; sideface < 2; sideface++) {
    let front = sideface === 0;
    for (let i = 0; i <= Nrow; i++)
      for (let j = 0; j <= Ncol; j++) {
        let t = i / Nrow,
          w = (2 * j) / Ncol - 1,
          v = point(t, w, front),
          col = dye(t, w, front);
        p.push(v.x, v.y, v.z);
        colors.push(col.r, col.g, col.b);
        uv.push(t * 2.4, w * 0.55 + t * 0.32);
        if (i && j) {
          let k = p.length / 3 - 1,
            a = k - Ncol - 2,
            b = k - Ncol - 1,
            c = k - 1;
          if (front === (side === 1)) idx.push(a, b, k, a, k, c);
          else idx.push(a, k, b, a, c, k);
        }
      }
  }
  let geo = new T.BufferGeometry();
  geo.setAttribute('position', new T.Float32BufferAttribute(p, 3));
  geo.setAttribute('color', new T.Float32BufferAttribute(colors, 3));
  geo.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  let shell = new T.Mesh(
    geo,
    new T.MeshStandardMaterial({
      vertexColors: true,
      side: T.DoubleSide,
      bumpMap: nap,
      bumpScale: 0.0008,
      roughness: 0.96,
    }),
  );
  G.add(shell);
  shell.castShadow = true;
  // Short guard hairs are swept out of the hollow, becoming longer and paler at the margin.
  p = [];
  colors = [];
  idx = [];
  for (let i = 0; i < 2900; i++) {
    let t = 0.025 + 0.957 * r(),
      w = 2 * r() - 1,
      near = Math.abs(w),
      v = point(t, w, true),
      col = dye(t, w, true).multiplyScalar(0.8 + 0.42 * r());
    let d = point(
      clamp(t + 0.009 + 0.022 * r()),
      Math.max(-1, Math.min(1, w + w * 0.05)),
      true,
    ).sub(v);
    let a = v.clone().addScaledVector(N, 0.0007),
      b = a
        .clone()
        .add(d)
        .addScaledVector(N, 0.002 + 0.006 * r() + 0.002 * near);
    let k = p.length / 3,
      wd = 0.00065 + 0.0008 * r();
    p.push(
      a.x - W.x * wd,
      a.y - W.y * wd,
      a.z - W.z * wd,
      a.x + W.x * wd,
      a.y + W.y * wd,
      a.z + W.z * wd,
      b.x,
      b.y,
      b.z,
    );
    for (let j = 0; j < 3; j++) colors.push(col.r, col.g, col.b);
    idx.push(k, k + 1, k + 2);
  }
  geo = new T.BufferGeometry();
  geo.setAttribute('position', new T.Float32BufferAttribute(p, 3));
  geo.setAttribute('color', new T.Float32BufferAttribute(colors, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  G.add(new T.Mesh(geo, new T.MeshLambertMaterial({ vertexColors: true, side: T.DoubleSide })));
  return G;
}
