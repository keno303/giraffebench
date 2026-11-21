// Math, Noise, Spline, and Analytical IK utilities
(function (global) {
  'use strict';

  const MathUtils = {};

  MathUtils.clamp = function (x, lo, hi) {
    return x < lo ? lo : x > hi ? hi : x;
  };

  MathUtils.lerp = function (a, b, t) {
    return a + (b - a) * t;
  };

  MathUtils.smoothstep = function (edge0, edge1, x) {
    const t = MathUtils.clamp((x - edge0) / (edge1 - edge0), 0, 1);
    return t * t * (3 - 2 * t);
  };

  MathUtils.smootherstep = function (edge0, edge1, x) {
    const t = MathUtils.clamp((x - edge0) / (edge1 - edge0), 0, 1);
    return t * t * t * (t * (t * 6 - 15) + 10);
  };

  MathUtils.remap = function (val, inMin, inMax, outMin, outMax) {
    const t = MathUtils.clamp((val - inMin) / (inMax - inMin), 0, 1);
    return outMin + (outMax - outMin) * t;
  };

  // Seeded PRNG (mulberry32)
  MathUtils.createRNG = function (seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0;
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  // Fast deterministic 3D hash -> [0, 1]
  function hash3(ix, iy, iz) {
    let n = Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(iz, 2147483647);
    n = (n ^ (n >>> 13)) | 0;
    n = Math.imul(n, 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
  }

  // Smooth 3D value noise -> [-1, 1]
  MathUtils.noise3D = function (x, y, z) {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const iz = Math.floor(z);
    const fx = x - ix;
    const fy = y - iy;
    const fz = z - iz;
    const ux = fx * fx * (3 - 2 * fx);
    const uy = fy * fy * (3 - 2 * fy);
    const uz = fz * fz * (3 - 2 * fz);

    const n000 = hash3(ix, iy, iz);
    const n100 = hash3(ix + 1, iy, iz);
    const n010 = hash3(ix, iy + 1, iz);
    const n110 = hash3(ix + 1, iy + 1, iz);
    const n001 = hash3(ix, iy, iz + 1);
    const n101 = hash3(ix + 1, iy, iz + 1);
    const n011 = hash3(ix, iy + 1, iz + 1);
    const n111 = hash3(ix + 1, iy + 1, iz + 1);

    const nx00 = n000 + (n100 - n000) * ux;
    const nx10 = n010 + (n110 - n010) * ux;
    const nx01 = n001 + (n101 - n001) * ux;
    const nx11 = n011 + (n111 - n011) * ux;
    const nxy0 = nx00 + (nx10 - nx00) * uy;
    const nxy1 = nx01 + (nx11 - nx01) * uy;
    return (nxy0 + (nxy1 - nxy0) * uz) * 2 - 1;
  };

  MathUtils.fbm3D = function (x, y, z, octaves) {
    let sum = 0;
    let amp = 0.5;
    let freq = 1;
    let norm = 0;
    const oct = octaves || 3;
    for (let i = 0; i < oct; i++) {
      sum += amp * MathUtils.noise3D(x * freq, y * freq, z * freq);
      norm += amp;
      amp *= 0.5;
      freq *= 2.03;
    }
    return sum / norm;
  };

  MathUtils.noise2D = function (x, z) {
    return MathUtils.noise3D(x, 13.37, z);
  };

  MathUtils.fbm2D = function (x, z, octaves) {
    return MathUtils.fbm3D(x, 13.37, z, octaves || 4);
  };

  /**
   * Analytical 2-bone IK solver in 3D.
   * Finds the exact mid-joint position given:
   * - rootPos: THREE.Vector3
   * - targetPos: THREE.Vector3
   * - L1: upper segment length
   * - L2: lower segment length
   * - bendDir: THREE.Vector3 (unit-ish preferred direction for the mid-joint to bend toward)
   * - outMid: THREE.Vector3 (written with mid-joint position)
   * - outEnd: THREE.Vector3 (optional, written with clamped reachable end position)
   */
  const _dir = new THREE.Vector3();
  const _perp = new THREE.Vector3();
  const _proj = new THREE.Vector3();

  MathUtils.solveTwoBoneIK = function (rootPos, targetPos, L1, L2, bendDir, outMid, outEnd) {
    _dir.subVectors(targetPos, rootPos);
    const rawDist = _dir.length();
    const minDist = Math.abs(L1 - L2) + 0.005;
    const maxDist = (L1 + L2) - 0.002;
    const d = MathUtils.clamp(rawDist, minDist, maxDist);

    if (rawDist > 1e-6) {
      _dir.multiplyScalar(1 / rawDist);
    } else {
      _dir.set(0, -1, 0);
    }

    // Law of cosines for projection distance along root->target
    const a = (L1 * L1 - L2 * L2 + d * d) / (2 * d);
    const hSq = Math.max(0, L1 * L1 - a * a);
    const h = Math.sqrt(hSq);

    // Orthogonalize bendDir against _dir
    const dot = bendDir.dot(_dir);
    _proj.copy(_dir).multiplyScalar(dot);
    _perp.subVectors(bendDir, _proj);
    const perpLen = _perp.length();
    if (perpLen > 1e-5) {
      _perp.multiplyScalar(1 / perpLen);
    } else {
      _perp.set(0, 0, 1);
    }

    outMid.copy(rootPos).addScaledVector(_dir, a).addScaledVector(_perp, h);
    if (outEnd) {
      outEnd.copy(rootPos).addScaledVector(_dir, d);
    }
    return d;
  };

  /**
   * Align a bone/object so its local -Y axis points along `dir` (with local +Z as close as possible to `forwardHint`).
   * Used to orient limb segments cleanly along solved IK joint positions.
   */
  const _yAxis = new THREE.Vector3();
  const _xAxis = new THREE.Vector3();
  const _zAxis = new THREE.Vector3();
  const _mat4 = new THREE.Matrix4();

  MathUtils.quaternionFromDownAndForward = function (downDir, forwardHint, outQuat) {
    // Local +Y = -downDir
    _yAxis.copy(downDir).negate().normalize();
    _xAxis.crossVectors(_yAxis, forwardHint);
    if (_xAxis.lengthSq() < 1e-6) {
      _xAxis.set(1, 0, 0);
    } else {
      _xAxis.normalize();
    }
    _zAxis.crossVectors(_xAxis, _yAxis).normalize();
    _mat4.makeBasis(_xAxis, _yAxis, _zAxis);
    outQuat.setFromRotationMatrix(_mat4);
    return outQuat;
  };

  global.GiraffeMath = MathUtils;
})(window);
