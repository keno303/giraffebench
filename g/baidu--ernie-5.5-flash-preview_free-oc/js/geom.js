/* =============================================================================
   geom.js — procedural geometry helpers (lofting, limbs, leaves)
   ========================================================================== */
(function () {
  'use strict';
  const NS = (window.GIRAFFE = window.GIRAFFE || {});
  const V3 = THREE.Vector3;

  /* smooth interpolation through keyframes [{t, ...}] */
  NS.sampleKeys = function (keys, t) {
    if (t <= keys[0].t) return Object.assign({}, keys[0]);
    const n = keys.length;
    if (t >= keys[n - 1].t) return Object.assign({}, keys[n - 1]);
    for (let i = 0; i < n - 1; i++) {
      const a = keys[i], b = keys[i + 1];
      if (t >= a.t && t <= b.t) {
        let u = (t - a.t) / (b.t - a.t);
        u = u * u * (3 - 2 * u);
        const out = {};
        for (const k in a) {
          if (k === 't') continue;
          const av = a[k], bv = b[k] == null ? av : b[k];
          out[k] = av + (bv - av) * u;
        }
        return out;
      }
    }
    return Object.assign({}, keys[n - 1]);
  };

  /* -------------------------------------------------------------------------
     loft(curve, opts)

     Sweeps an elliptical cross-section along a Catmull-Rom curve.
     opts.profile(t) -> {rx, ry}   (radii)
     opts.segments, opts.radial
     opts.roundStart / opts.roundEnd : hemispherical caps
     opts.shade(pos, normal) -> 0..1  (vertex colour multiplier)
     opts.uvScale -> {u, v} multiplier for the UVs
     Returns { geometry, frames, curve }
     ------------------------------------------------------------------------- */
  NS.loft = function (curve, opts) {
    opts = opts || {};
    const segments = opts.segments || 40;
    const radial = opts.radial || 22;
    const profile = opts.profile;
    const frames = curve.computeFrenetFrames(segments, false);
    const capSeg = opts.roundStart || opts.roundEnd ? (opts.capSegments || 5) : 0;

    /* Stable frame for our planar (YZ) spine curves:
       lateral = world X, "up" = tangent x X (in the sagittal plane).
       This keeps rx = half-width and ry = half-depth as authored. */
    const rings = [];   // {c, bx (lateral), by (in-plane up), rx, ry}
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const c = curve.getPoint(t);
      const T = frames.tangents[i];
      const bx = new V3(1, 0, 0);
      const by = new V3().crossVectors(T, bx);
      if (by.lengthSq() < 1e-8) by.set(0, 1, 0); else by.normalize();
      const p = profile(t);
      rings.push({ c: c, bx: bx, by: by, rx: p.rx, ry: p.ry, t: t });
    }

    /* rounded caps: extra rings marching along the tangent */
    const all = [];
    const tan0 = frames.tangents[0], tan1 = frames.tangents[segments];
    if (opts.roundStart) {
      for (let k = capSeg; k >= 1; k--) {
        const a = (k / capSeg) * Math.PI * 0.5;
        const s = Math.sin(a), co = Math.cos(a);
        const r0 = rings[0];
        all.push({
          c: r0.c.clone().addScaledVector(tan0, -r0.ry * s * (opts.capScale || 1)),
          bx: r0.bx.clone(), by: r0.by.clone(),
          rx: r0.rx * co, ry: r0.ry * co, t: 0
        });
      }
    }
    for (let i = 0; i < rings.length; i++) all.push(rings[i]);
    if (opts.roundEnd) {
      const rN = rings[rings.length - 1];
      for (let k = 1; k <= capSeg; k++) {
        const a = (k / capSeg) * Math.PI * 0.5;
        const s = Math.sin(a), co = Math.cos(a);
        all.push({
          c: rN.c.clone().addScaledVector(tan1, rN.ry * s * (opts.capScale || 1)),
          bx: rN.bx.clone(), by: rN.by.clone(),
          rx: rN.rx * co, ry: rN.ry * co, t: 1
        });
      }
    }

    const verts = [], norms = [], uvs = [], cols = [], idx = [];
    const vCount = all.length;
    const shadeFn = opts.shade;
    const uvScale = opts.uvScale || { u: 1, v: 1 };

    for (let i = 0; i < vCount; i++) {
      const R = all[i];
      for (let j = 0; j <= radial; j++) {
        const a = (j / radial) * Math.PI * 2;
        const ca = Math.cos(a), sa = Math.sin(a);
        const px = R.c.x + R.bx.x * ca * R.rx + R.by.x * sa * R.ry;
        const py = R.c.y + R.bx.y * ca * R.rx + R.by.y * sa * R.ry;
        const pz = R.c.z + R.bx.z * ca * R.rx + R.by.z * sa * R.ry;
        verts.push(px, py, pz);
        // approximate normal (ellipse gradient)
        let nx = R.bx.x * (ca / Math.max(R.rx, 1e-4)) + R.by.x * (sa / Math.max(R.ry, 1e-4));
        let ny = R.bx.y * (ca / Math.max(R.rx, 1e-4)) + R.by.y * (sa / Math.max(R.ry, 1e-4));
        let nz = R.bx.z * (ca / Math.max(R.rx, 1e-4)) + R.by.z * (sa / Math.max(R.ry, 1e-4));
        const l = Math.hypot(nx, ny, nz) || 1;
        nx /= l; ny /= l; nz /= l;
        norms.push(nx, ny, nz);
        uvs.push((j / radial) * uvScale.u, R.t * uvScale.v);
        if (shadeFn) {
          const s = shadeFn(px, py, pz, nx, ny, nz, R.t, j / radial);
          cols.push(s, s, s);
        }
      }
    }
    for (let i = 0; i < vCount - 1; i++) {
      for (let j = 0; j < radial; j++) {
        const a = i * (radial + 1) + j;
        const b = a + radial + 1;
        // CCW seen from outside -> outward normals
        idx.push(a, a + 1, b, b, a + 1, b + 1);
      }
    }

    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(norms, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    if (shadeFn) g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    g.computeBoundingSphere();
    return { geometry: g, frames: frames, curve: curve };
  };

  /* frame on a planar (YZ) curve: tangent + dorsal (up/back) + lateral */
  NS.curveFrame = function (curve, t) {
    const T = curve.getTangent(t).normalize();
    const X = new V3(1, 0, 0);
    const dorsal = new V3().crossVectors(T, X).normalize(); // up/back for a rising neck
    const lateral = new V3().crossVectors(T, dorsal).normalize();
    return { p: curve.getPoint(t), t: T, dorsal: dorsal, lateral: lateral };
  };

  /* ---------- unit cylinder with taper, oriented between two points ------ */
  const cylCache = {};
  NS.limbGeometry = function (topRatio, radial) {
    const key = topRatio.toFixed(3) + '_' + (radial || 10);
    if (!cylCache[key]) {
      cylCache[key] = new THREE.CylinderGeometry(topRatio, 1, 1, radial || 10, 1, false);
    }
    return cylCache[key];
  };

  const _up = new V3(0, 1, 0);
  const _dir = new V3();
  const _mid = new V3();
  /* place a unit-height mesh (origin centre, +Y axis) between a and b */
  NS.placeBetween = function (mesh, a, b, radius) {
    _dir.subVectors(b, a);
    const len = _dir.length();
    if (len < 1e-6) { mesh.visible = false; return; }
    mesh.visible = true;
    _dir.multiplyScalar(1 / len);
    _mid.addVectors(a, b).multiplyScalar(0.5);
    mesh.position.copy(_mid);
    mesh.quaternion.setFromUnitVectors(_up, _dir);
    mesh.scale.set(radius, len, radius);
  };

  /* ---------- ear / leaf shape ------------------------------------------- */
  NS.leafGeometry = function (len, width, thick) {
    const s = new THREE.Shape();
    s.moveTo(0, 0);
    s.bezierCurveTo(width * 0.55, len * 0.12, width * 0.62, len * 0.62, 0, len);
    s.bezierCurveTo(-width * 0.62, len * 0.62, -width * 0.55, len * 0.12, 0, 0);
    const g = new THREE.ExtrudeGeometry(s, {
      depth: thick, bevelEnabled: true, bevelThickness: thick * 0.5,
      bevelSize: thick * 0.6, bevelSegments: 2, curveSegments: 10
    });
    g.translate(0, 0, -thick * 0.5);
    g.computeVertexNormals();
    return g;
  };

  /* ---------- tapered tube along a polyline (tail, ossicones) ------------ */
  NS.chain = function (parent, pts, radii, mat, radial) {
    const meshes = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const m = new THREE.Mesh(NS.limbGeometry(1, radial || 8), mat);
      m.castShadow = true; m.receiveShadow = true;
      parent.add(m);
      meshes.push(m);
    }
    return meshes;
  };

  /* ---------- misc ------------------------------------------------------- */
  NS.clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  NS.smoothstep = (a, b, x) => {
    const t = NS.clamp((x - a) / (b - a), 0, 1);
    return t * t * (3 - 2 * t);
  };
  NS.lerp = (a, b, t) => a + (b - a) * t;
})();