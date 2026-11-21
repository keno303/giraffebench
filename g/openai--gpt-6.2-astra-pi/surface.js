/* A uniform dual grid (surface nets) yields one shared vertex per intersected cell.
   Gradients of the trilinear distance field provide continuous hide normals independently
   of tessellation; nearby primitives contribute smooth, normalized bone weights. */
function buildSurface(shapes, count) {
  const T = THREE,
    step = 0.027,
    x0 = -1.65,
    y0 = -0.045,
    z0 = -0.61,
    nx = 162,
    ny = 206,
    nz = 47,
    plane = nx * ny,
    size = plane * nz;
  const f = new Float32Array(size).fill(0.35),
    cell = new Int32Array(size),
    pos = [],
    nor = [],
    idx = [],
    skin = [],
    weights = [];
  for (const s of shapes) {
    let b = s.box,
      lo = (v, o) => Math.max(0, Math.floor((v - o - 0.21) / step)),
      hi = (v, o, n) => Math.min(n - 1, Math.ceil((v - o + 0.21) / step));
    let minx = lo(b[0], x0),
      maxx = hi(b[1], x0, nx),
      miny = lo(b[2], y0),
      maxy = hi(b[3], y0, ny),
      minz = lo(b[4], z0),
      maxz = hi(b[5], z0, nz);
    for (let z = minz; z <= maxz; z++)
      for (let y = miny; y <= maxy; y++) {
        let Y = y0 + y * step,
          Z = z0 + z * step,
          i = z * plane + y * nx + minx;
        for (let x = minx; x <= maxx; x++, i++) {
          let d = s.d(x0 + x * step, Y, Z),
            a = f[i],
            h = Math.max(s.k - Math.abs(a - d), 0);
          f[i] = Math.min(a, d) - (h * h) / (4 * s.k);
        }
      }
  }
  const totals = new Float32Array(count);
  function bind(x, y, z) {
    totals.fill(0);
    for (const s of shapes) {
      let b = s.box;
      if (
        x < b[0] - 0.23 ||
        x > b[1] + 0.23 ||
        y < b[2] - 0.23 ||
        y > b[3] + 0.23 ||
        z < b[4] - 0.23 ||
        z > b[5] + 0.23
      )
        continue;
      let d = s.d(x, y, z);
      if (d < 0.23) totals[s.id] += Math.exp(-d / (s.id < 3 ? 0.045 : 0.035));
    }
    let sum = 0;
    for (let k = 0; k < 4; k++) {
      let best = 0;
      for (let q = 1; q < count; q++) if (totals[q] > totals[best]) best = q;
      weights.push(totals[best]);
      skin.push(best);
      sum += totals[best];
      totals[best] = 0;
    }
    for (let k = 1; k <= 4; k++) weights[weights.length - k] /= sum || 1;
  }
  const corners = [0, 1, nx, nx + 1, plane, plane + 1, plane + nx, plane + nx + 1],
    axes = [1, nx, plane],
    dist = new Float32Array(8),
    cent = [0, 0, 0],
    grad = [0, 0, 0];
  for (let z = 1; z < nz - 2; z++)
    for (let y = 1; y < ny - 2; y++)
      for (let x = 1; x < nx - 2; x++) {
        let i = x + y * nx + z * plane;
        if (Math.abs(f[i]) > 0.062) continue;
        let mask = 0;
        for (let k = 0; k < 8; k++) {
          dist[k] = f[i + corners[k]];
          if (dist[k] < 0) mask |= 1 << k;
        }
        if (!mask || mask === 255) continue;
        cent.fill(0);
        grad.fill(0);
        let n = 0;
        for (let k = 0; k < 8; k++)
          for (let a = 0; a < 3; a++) {
            let flag = 1 << a,
              j = k | flag;
            if (k & flag || ((mask >> j) & 1) === ((mask >> k) & 1)) continue;
            let t = dist[k] / (dist[k] - dist[j]),
              v = i + corners[k],
              w = i + corners[j];
            for (let h = 0; h < 3; h++) {
              cent[h] += ((k >> h) & 1) + (h === a ? t : 0);
              let stride = axes[h];
              grad[h] +=
                (1 - t) * (f[v + stride] - f[v - stride]) + t * (f[w + stride] - f[w - stride]);
            }
            n++;
          }
        let X = x0 + step * (x + cent[0] / n),
          Y = y0 + step * (y + cent[1] / n),
          Z = z0 + step * (z + cent[2] / n);
        cell[i] = pos.length / 3 + 1;
        pos.push(X, Y, Z);
        nor.push(...grad);
        bind(X, Y, Z);
        for (let a = 0; a < 3; a++) {
          if (dist[0] < 0 === dist[1 << a] < 0) continue;
          let s = axes[(a + 1) % 3],
            t = axes[(a + 2) % 3];
          let A = cell[i] - 1,
            B = cell[i - s] - 1,
            C = cell[i - s - t] - 1,
            D = cell[i - t] - 1;
          if (Math.min(B, C, D) < 0) continue;
          if (dist[0] < 0) idx.push(A, B, C, A, C, D);
          else idx.push(A, C, B, A, D, C);
        }
      }
  const g = new T.BufferGeometry();
  g.setIndex(idx);
  g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new T.Float32BufferAttribute(nor, 3));
  g.normalizeNormals();
  // Bake short-range ambient visibility from the same field. This preserves the
  // soft shadow under the jaw, in the axillae, and between the thighs on orbit.
  const directions = [],
    radius = [0.059, 0.103, 0.172, 0.271, 0.41, 0.61, 0.83];
  for (let j = 0; j < 38; j++) {
    const y = 1 - (2 * (j + 0.5)) / 38,
      r = Math.sqrt(1 - y * y),
      phi = j * 2.39996323;
    directions.push([r * Math.cos(phi), y, r * Math.sin(phi)]);
  }
  function fieldAt(x, y, z) {
    let i = Math.floor(x),
      j = Math.floor(y),
      k = Math.floor(z);
    if (i < 0 || j < 0 || k < 0 || i >= nx - 1 || j >= ny - 1 || k >= nz - 1) return 0.35;
    x -= i;
    y -= j;
    z -= k;
    const n = i + j * nx + k * plane,
      a = n + nx,
      b = n + plane,
      c = b + nx;
    return (
      (1 - z) * ((1 - y) * (f[n] + x * (f[n + 1] - f[n])) + y * (f[a] + x * (f[a + 1] - f[a]))) +
      z * ((1 - y) * (f[b] + x * (f[b + 1] - f[b])) + y * (f[c] + x * (f[c + 1] - f[c])))
    );
  }
  const normals = g.attributes.normal.array,
    ao = new Float32Array(pos.length / 3);
  for (let i = 0; i < ao.length; i++) {
    const j = 3 * i,
      a = normals[j],
      b = normals[j + 1],
      c = normals[j + 2];
    const X = (pos[j] - x0 + 0.014 * a) / step,
      Y = (pos[j + 1] - y0 + 0.014 * b) / step,
      Z = (pos[j + 2] - z0 + 0.014 * c) / step;
    let blocked = 0,
      total = 0;
    for (const d of directions) {
      const w = a * d[0] + b * d[1] + c * d[2];
      if (w <= 0) continue;
      total += w;
      let occ = 0;
      for (const r of radius) {
        let h = r / step,
          v = fieldAt(X + h * d[0], Y + h * d[1], Z + h * d[2]);
        occ = Math.max(occ, (1 - 0.42 * r) * Math.min(1, (0.009 - v) / 0.042));
        if (v < -0.035) break;
      }
      blocked += occ * w;
    }
    ao[i] = 1 - (0.91 * blocked) / (total || 1);
  }
  g.setAttribute('ambientVisibility', new T.BufferAttribute(ao, 1));
  g.setAttribute('skinIndex', new T.Uint16BufferAttribute(skin, 4));
  g.setAttribute('skinWeight', new T.Float32BufferAttribute(weights, 4));
  return g;
}
