/* Shared procedural geometry. This is a classic script so file:// needs no module server. */
(() => {
  'use strict';
  const T = THREE;
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const mix = (a, b, t) => a + (b - a) * t;
  const mod = (x, n) => ((x % n) + n) % n;
  const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const vec = (x = 0, y = 0, z = 0) => new T.Vector3(x, y, z);
  const rng = (seed) => () => {
    let n = seed = (seed + 0x6D2B79F5) | 0;
    n = Math.imul(n ^ n >>> 15, n | 1);
    n ^= n + Math.imul(n ^ n >>> 7, n | 61);
    return ((n ^ n >>> 14) >>> 0) / 4294967296;
  };

  // A monotone cubic through cross-sections avoids radius overshoot at thin ends.
  function sections(rows, v) {
    let i = 0;
    while (i + 2 < rows.length && rows[i + 1][0] < v) i++;
    const a = rows[i], b = rows[i + 1], h = b[0] - a[0], t = clamp((v - a[0]) / h, 0, 1);
    const t2 = t * t, t3 = t2 * t;
    const left = rows[i - 1], right = rows[i + 2];
    const tangent = (u, v) => u * v <= 0 ? 0 : 2 * u * v / (u + v);
    return a.slice(1).map((x, j) => {
      j++;
      const d = (b[j] - x) / h;
      const m0 = left ? tangent((x - left[j]) / (a[0] - left[0]), d) : d;
      const m1 = right ? tangent(d, (right[j] - b[j]) / (right[0] - b[0])) : d;
      return x * (2 * t3 - 3 * t2 + 1) + b[j] * (-2 * t3 + 3 * t2) + h * (m0 * (t3 - 2 * t2 + t) + m1 * (t3 - t2));
    });
  }

  // Axis is x or y. A cross section gives centre on the other axis, z, and two radii.
  // Rasterize each loft only in its own bounds; blend the fields at anatomical junctions.
  function sculpture(parts, step) {
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (const part of parts) {
      const { axis, rows, blend } = part, across = 1 - axis;
      const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
      for (const [v, c, z, a, b] of rows) {
        min[axis] = Math.min(min[axis], v); max[axis] = Math.max(max[axis], v);
        min[across] = Math.min(min[across], c - a); max[across] = Math.max(max[across], c + a);
        min[2] = Math.min(min[2], z - b); max[2] = Math.max(max[2], z + b);
      }
      const pad = blend + step * 3;
      for (let j = 0; j < 3; j++) {
        min[j] -= pad; max[j] += pad;
        lo[j] = Math.min(lo[j], min[j]); hi[j] = Math.max(hi[j], max[j]);
      }
      part.min = min;
      part.max = max;
    }
    const [nx, ny, nz] = hi.map((v, j) => Math.ceil((v - lo[j]) / step) + 1);
    const plane = nx * ny, n = plane * nz;
    const value = new Float32Array(n).fill(1);
    for (const {axis, rows, blend, min, max, relief} of parts) {
      const start = min.map((v, j) => Math.max(0, Math.floor((v - lo[j]) / step)));
      const end = max.map((v, j) => Math.min([nx, ny, nz][j] - 1, Math.ceil((v - lo[j]) / step)));
      const axisStart = rows[0][0], axisEnd = rows[rows.length - 1][0], table = [];
      for (let i = start[axis]; i <= end[axis]; i++) {
        const v = lo[axis] + i * step;
        const [c, z, a, b] = sections(rows, v);
        table[i] = [c, z, 1 / a, 1 / b, Math.min(a, b), Math.max(axisStart - v, v - axisEnd)];
      }
      for (let k = start[2]; k <= end[2]; k++) {
        const z = lo[2] + k * step;
        for (let j = start[1]; j <= end[1]; j++) {
          const y = lo[1] + j * step, offset = k * plane + j * nx;
          for (let i = start[0]; i <= end[0]; i++) {
            const [c, centerZ, invA, invB, r, cap] = table[axis === 0 ? i : j];
            const across = axis === 0 ? y : lo[0] + i * step;
            const a = (across - c) * invA, b = (z - centerZ) * invB;
            const radial = (Math.sqrt(a * a + b * b) - 1) * r - (relief ? relief(lo[0] + i * step,y,z) : 0);
            const d = Math.max(radial, cap);
            const old = value[offset + i];
            const h = blend > 0 ? Math.max(blend - Math.abs(old - d), 0) / blend : 0;
            value[offset + i] = Math.min(old, d) - h * h * blend * .25;
          }
        }
      }
    }

    // Surface nets: one vertex per active voxel, at the mean of its edge crossings.
    const corner = [0, 1, nx, nx + 1, plane, plane + 1, plane + nx, plane + nx + 1];
    const cx = [0, 1, 0, 1, 0, 1, 0, 1], cy = [0, 0, 1, 1, 0, 0, 1, 1], cz = [0, 0, 0, 0, 1, 1, 1, 1];
    const edges = [[0,1],[2,3],[4,5],[6,7],[0,2],[1,3],[4,6],[5,7],[0,4],[1,5],[2,6],[3,7]];
    const cell = new Int32Array(n).fill(-1), p = [], faces = [], d = new Float32Array(8);
    const quad = (a, b, c, d, outward) => {
      if (b < 0 || c < 0 || d < 0) return;
      if (outward) faces.push(a,b,c,a,c,d); else faces.push(a,c,b,a,d,c);
    };
    for (let k = 0; k < nz - 1; k++) for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
      const at = k * plane + j * nx + i;
      let mask = 0;
      for (let q = 0; q < 8; q++) { d[q] = value[at + corner[q]]; if (d[q] < 0) mask |= 1 << q; }
      if (!mask || mask === 255) continue;
      let x = 0, y = 0, z = 0, count = 0;
      for (const [a,b] of edges) {
        if (((mask >> a) & 1) === ((mask >> b) & 1)) continue;
        const t = d[a] / (d[a] - d[b]);
        x += mix(cx[a], cx[b], t); y += mix(cy[a], cy[b], t); z += mix(cz[a], cz[b], t); count++;
      }
      const id = cell[at] = p.length / 3;
      p.push(lo[0] + (i + x / count) * step, lo[1] + (j + y / count) * step, lo[2] + (k + z / count) * step);
      const inside = (mask & 1) !== 0;
      if (j && k && inside !== Boolean(mask & 2)) quad(id, cell[at - nx], cell[at - nx - plane], cell[at - plane], inside);
      if (k && i && inside !== Boolean(mask & 4)) quad(id, cell[at - plane], cell[at - plane - 1], cell[at - 1], inside);
      if (i && j && inside !== Boolean(mask & 16)) quad(id, cell[at - 1], cell[at - 1 - nx], cell[at - nx], inside);
    }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(p, 3));
    g.setIndex(faces);
    g.computeVertexNormals();
    return g;
  }

  // Elliptic sweep. Each station is [centre, radius along reference, other radius].
  function sweep(stations, sides = 14, reference = vec(0, 0, 1), tint, fixedAxis = null) {
    const p = [], c = [], idx = [], uv = [], a = vec(), b = vec(), t = vec();
    for (let i = 0; i < stations.length; i++) {
      const [pt, rx, ry] = stations[i];
      if (fixedAxis) t.copy(fixedAxis);
      else t.subVectors(stations[Math.min(stations.length - 1, i + 1)][0], stations[Math.max(0, i - 1)][0]).normalize();
      a.copy(reference).addScaledVector(t, -reference.dot(t)).normalize();
      b.crossVectors(t, a);
      for (let j = 0; j < sides; j++) {
        const turn = j * Math.PI * 2 / sides, u = Math.cos(turn), v = Math.sin(turn);
        p.push(pt.x + a.x * rx * u + b.x * ry * v,
               pt.y + a.y * rx * u + b.y * ry * v,
               pt.z + a.z * rx * u + b.z * ry * v);
        uv.push(j / sides, i / (stations.length - 1));
        if (tint) { const col = tint(i / (stations.length - 1), u, v, i, j); c.push(col.r, col.g, col.b); }
        if (i < stations.length - 1) {
          const s = i * sides + j, next = i * sides + (j + 1) % sides;
          idx.push(s, next, s+sides, next, next+sides, s+sides);
        }
      }
    }
    for (let j = 1, end = (stations.length - 1) * sides; j < sides - 1; j++) idx.push(0,j+1,j,end,end+j,end+j+1);
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(p,3));
    if (tint) g.setAttribute('color', new T.Float32BufferAttribute(c,3));
    g.setAttribute('uv', new T.Float32BufferAttribute(uv,2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }

  function curveSweep(points, radii, count = 20, sides = 12, reference, tint) {
    const path = new T.CatmullRomCurve3(points);
    const profile = radii.map((r, i) => [i / (radii.length - 1), ...(Array.isArray(r) ? r : [r, r])]);
    return sweep(Array.from({length: count + 1}, (_, i) => {
      const t = i / count;
      return [path.getPoint(t), ...sections(profile, t)];
    }), sides, reference, tint);
  }

  const glNoise = `
    float hash31(vec3 p) {
      p = fract(p * .1031);
      p += dot(p, p.yzx + 33.33);
      return fract((p.x + p.y) * p.z);
    }
    vec3 hash33(vec3 p) {
      p = fract(p * vec3(.1031,.1030,.0973));
      p += dot(p, p.yxz + 33.33);
      return fract((p.xxy + p.yxx) * p.zyx);
    }
    float noise31(vec3 q) {
      vec3 i = floor(q), f = fract(q);
      vec3 u = f * f * (3.0 - 2.0 * f);
      return mix(mix(mix(hash31(i),hash31(i+vec3(1,0,0)),u.x),
                     mix(hash31(i+vec3(0,1,0)),hash31(i+vec3(1,1,0)),u.x),u.y),
                 mix(mix(hash31(i+vec3(0,0,1)),hash31(i+vec3(1,0,1)),u.x),
                     mix(hash31(i+vec3(0,1,1)),hash31(i+1.0),u.x),u.y),u.z);
    }
  `;

  window.Atlas = { clamp, mix, mod, smooth, vec, rng, sections, sculpture, sweep, curveSweep, glNoise };
})();
