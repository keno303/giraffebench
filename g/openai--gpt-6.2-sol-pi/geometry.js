/* Shared geometry and deterministic sampling helpers. */
window.Field = (() => {
  'use strict';
  const T = THREE;
  const v = (x = 0, y = 0, z = 0) => new T.Vector3(x, y, z);
  const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
  const mix = (a, b, t) => a + (b - a) * t;
  const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
  const fract = x => x - Math.floor(x);
  const TAU = Math.PI * 2;
  function random(seed) {
    return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0;
      let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t ^= t + Math.imul(t ^ t >>> 7, 61 | t);
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function geometry(pos, idx, colors) {
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    if (idx) g.setIndex(idx);
    if (colors) g.setAttribute('color', new T.Float32BufferAttribute(colors, 3));
    g.computeVertexNormals();
    return g;
  }
  function mesh(parent, g, m, cast = true, receive = true) {
    const o = new T.Mesh(g, m);
    o.castShadow = cast; o.receiveShadow = receive; parent.add(o); return o;
  }
  function material(color, roughness = .8, options = {}) {
    return new T.MeshStandardMaterial({color, roughness, ...options});
  }
  const sphere = new T.SphereGeometry(1, 28, 20), smallSphere=new T.SphereGeometry(1,12,8);
  function ellipsoid(parent, m, x, y, z, a, b, c, rz = 0, small = false) {
    const o = mesh(parent, small?smallSphere:sphere, m);
    o.position.set(x, y, z); o.scale.set(a, b, c); o.rotation.z = rz; return o;
  }
  // Build several small swept surfaces as one indexed, optionally colored mesh.
  class Sweeps {
    constructor() { this.p = []; this.i = []; this.c = []; }
    tube(points, radius, sides = 7, color = null, ref = null) {
      const off = this.p.length / 3;
      const n = points.length, nx = v(), ny = v(), t = v();
      for (let k = 0; k < n; k++) {
        const pt = points[k];
        t.subVectors(points[Math.min(n - 1, k + 1)], points[Math.max(0, k - 1)]).normalize();
        if (k === 0) nx.copy(ref || (Math.abs(t.z) > .89 ? v(1, 0, 0) : v(0, 0, 1)));
        nx.addScaledVector(t, -nx.dot(t)).normalize(); ny.crossVectors(t, nx).normalize();
        const rad = typeof radius === 'function' ? radius(k / (n - 1), k) : radius[k];
        const ra = Array.isArray(rad) ? rad[0] : rad, rb = Array.isArray(rad) ? rad[1] : rad;
        for (let j = 0; j < sides; j++) {
          const a = j * TAU / sides, u = ra * Math.cos(a), w = rb * Math.sin(a);
          this.p.push(pt.x + nx.x * u + ny.x * w, pt.y + nx.y * u + ny.y * w, pt.z + nx.z * u + ny.z * w);
          if (color) { const c = typeof color === 'function' ? color(k / (n - 1), a, j) : color; this.c.push(c.r, c.g, c.b); }
          if (k < n - 1) {
            const a0 = off + k * sides + j, b0 = off + k * sides + (j + 1) % sides;
            this.i.push(a0, b0, a0 + sides, b0, b0 + sides, a0 + sides);
          }
        }
      }
      for (let j = 1; j < sides - 1; j++) {
        const end = off + (n - 1) * sides;
        this.i.push(off, off + j + 1, off + j, end, end + j, end + j + 1);
      }
      return this;
    }
    make() { return geometry(this.p, this.i, this.c.length ? this.c : null); }
  }
  function spline(points, samples) {
    return new T.CatmullRomCurve3(points).getPoints(samples);
  }
  function swept(parent, points, radii, mat, sides = 12, color = null, ref = null) {
    return mesh(parent, new Sweeps().tube(points, radii, sides, color, ref).make(), mat);
  }
  // A compact, bounded scalar-field union, meshed by surface nets. The field is
  // sampled just once; the resulting hide is deformed by a conventional skin.
  class Sculpture {
    constructor(bounds, step) {
      this.o = bounds[0]; this.step = step;
      this.n = bounds[1].map((e, i) => Math.ceil((e - this.o[i]) / step) + 1);
      this.axis = [1, this.n[0], this.n[0] * this.n[1]];
      this.field = new Float32Array(this.n[0] * this.n[1] * this.n[2]).fill(.5);
    }
    add(lo, hi, softness, distance) {
      const [ox, oy, oz] = this.o, [nx, ny, nz] = this.n, s = this.step, m = softness + s * 2;
      const l = lo.map((e, i) => clamp(Math.floor((e - m - this.o[i]) / s), 0, this.n[i] - 1));
      const h = hi.map((e, i) => clamp(Math.ceil((e + m - this.o[i]) / s), 0, this.n[i] - 1));
      const f = this.field;
      for (let iz = l[2]; iz <= h[2]; iz++) {
        const z = oz + iz * s;
        for (let iy = l[1]; iy <= h[1]; iy++) {
          const y = oy + iy * s;
          let i = (iz * ny + iy) * nx + l[0];
          for (let ix = l[0]; ix <= h[0]; ix++, i++) {
            const d = distance(ox + ix * s, y, z), prev = f[i];
            const k = softness > 0 ? Math.max(0, softness - Math.abs(prev - d)) : 0;
            f[i] = Math.min(d, prev) - (k ? k * k / (4 * softness) : 0);
          }
        }
      }
      return this;
    }
    ell(cx, cy, cz, ax, ay, az, rot, k) {
      const c = Math.cos(rot), s = Math.sin(rot);
      const a = Math.hypot(ax * c, ay * s), b = Math.hypot(ax * s, ay * c);
      return this.add([cx-a, cy-b, cz-az], [cx+a, cy+b, cz+az], k, (x,y,z) => {
        const dx = x-cx, dy = y-cy, X = (dx*c + dy*s)/ax, Y = (dy*c - dx*s)/ay, Z = (z-cz)/az;
        const d = Math.sqrt(X*X + Y*Y + Z*Z), e = Math.sqrt((X/ax)**2 + (Y/ay)**2 + (Z/az)**2);
        return e > 1e-7 ? d * (d-1) / e : -Math.min(ax,ay,az);
      });
    }
    // An elliptical tapered sweep (sagittal silhouette, lateral width). The
    // smooth minimum is applied to the whole sweep, not to individual rings.
    sweep(rows, k) {
      const segs = [];
      const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
      for (let i = 0; i < rows.length; i++) {
        const [x,y,z,r,w] = rows[i];
        [x,y,z].forEach((a,j) => { lo[j] = Math.min(lo[j], a - (j === 2 ? w : r)); hi[j] = Math.max(hi[j], a + (j === 2 ? w : r)); });
        if (i === rows.length-1) break;
        const [X,Y,Z,R,W] = rows[i+1], dx = X-x, dy = Y-y, dz = Z-z;
        const il = 1/(dx*dx+dy*dy+dz*dz);
        segs.push({x,y,z,dx,dy,dz,il,r,w,dr:R-r,dw:W-w});
      }
      return this.add(lo,hi,k,(x,y,z) => {
        let d = .5;
        for (const s of segs) {
          const px = x-s.x, py = y-s.y, pz = z-s.z;
          const t = clamp((px*s.dx+py*s.dy+pz*s.dz)*s.il);
          const dx = px-s.dx*t, dy = py-s.dy*t, dz = pz-s.dz*t;
          const r = s.r+s.dr*t, w = s.w+s.dw*t;
          const u = (Math.sqrt((dx*dx+dy*dy)/(r*r)+dz*dz/(w*w))-1)*Math.min(r,w);
          if (u < d) d = u;
        }
        return d;
      });
    }
    make() {
      const [nx,ny,nz] = this.n, [ox,oy,oz] = this.o, [a,b,c] = this.axis;
      const f = this.field, lut = new Int32Array(f.length).fill(-1), pos = [], ix = [], s = this.step;
      const corners = [0,a,b,a+b,c,c+a,c+b,c+a+b], val = new Float32Array(8);
      for(let z = 0; z < nz-1; z++) for(let y = 0; y < ny-1; y++) for(let x = 0; x < nx-1; x++) {
        const i = x + y*b + z*c; let mask = 0;
        for(let j=0;j<8;j++) if((val[j]=f[i+corners[j]])<0) mask |= (1<<j);
        if (mask === 0 || mask === 255) continue;
        let px=0, py=0, pz=0, n=0;
        for (let j=0; j<8; j++) for (let d=0; d<3; d++) {
          const bit = 1<<d;
          if(j & bit) continue;
          const k = j | bit;
          if ((val[j] < 0) === (val[k] < 0)) continue;
          const h = val[j]/(val[j]-val[k]);
          px += (j & 1) + (d===0 ? h : 0);
          py += ((j>>1) & 1) + (d===1 ? h : 0);
          pz += ((j>>2) & 1) + (d===2 ? h : 0); n++;
        }
        const id = lut[i] = pos.length/3;
        pos.push(ox+(x+px/n)*s, oy+(y+py/n)*s, oz+(z+pz/n)*s);
        for (let d=0; d<3; d++) {
          if ((val[0]<0)===(val[1<<d]<0)) continue;
          const u = this.axis[(d+1)%3], v0 = this.axis[(d+2)%3];
          const A = lut[i-u], B = lut[i-u-v0], C = lut[i-v0];
          if (A<0||B<0||C<0||A===undefined||B===undefined||C===undefined) continue;
          if(val[0]<0) ix.push(id,A,B,id,B,C); else ix.push(id,B,A,id,C,B);
        }
      }
      return geometry(pos, ix);
    }
  }
  return { T, v, clamp, mix, smooth, fract, TAU, random, geometry, mesh, material, ellipsoid, Sweeps, spline, swept, Sculpture };
})();
