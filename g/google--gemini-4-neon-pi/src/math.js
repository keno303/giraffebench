(function (global) {
  'use strict';

  const App = (global.GiraffeApp = global.GiraffeApp || {});

  function clamp(v, min, max) {
    return v < min ? min : v > max ? max : v;
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function smoothstep(edge0, edge1, x) {
    const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
    return t * t * (3 - 2 * t);
  }

  function smootherstep(edge0, edge1, x) {
    const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
    return t * t * t * (t * (t * 6 - 15) + 10);
  }

  function fract(x) {
    return x - Math.floor(x);
  }

  // Deterministic pseudo-random generator (Mulberry32)
  function createRNG(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Fast hash-based 2D value noise for terrain & flora placement
  function hash2(ix, iz) {
    let n = Math.imul(ix, 374761393) + Math.imul(iz, 668265263);
    n = (n ^ (n >>> 13)) >>> 0;
    n = Math.imul(n, 1274126177) >>> 0;
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
  }

  function noise2D(x, z) {
    const ix = Math.floor(x);
    const iz = Math.floor(z);
    const fx = x - ix;
    const fz = z - iz;
    const ux = fx * fx * (3 - 2 * fx);
    const uz = fz * fz * (3 - 2 * fz);
    const a = hash2(ix, iz);
    const b = hash2(ix + 1, iz);
    const c = hash2(ix, iz + 1);
    const d = hash2(ix + 1, iz + 1);
    return lerp(lerp(a, b, ux), lerp(c, d, ux), uz);
  }

  function fbm2D(x, z, octaves) {
    let value = 0;
    let amp = 0.5;
    let freq = 1;
    const n = octaves || 4;
    for (let i = 0; i < n; i++) {
      value += amp * (noise2D(x * freq, z * freq) * 2 - 1);
      freq *= 2.03;
      amp *= 0.5;
    }
    return value;
  }

  // Continuous, gentle savanna ground height query.
  // Kept very smooth near the giraffe's path (x ~ 0) with gentle rolling hills further out.
  function groundHeight(x, z) {
    const distFromTrack = Math.abs(x);
    const trackFlatten = smoothstep(2.5, 16.0, distFromTrack);
    const gentleRoll =
      Math.sin(z * 0.032) * 0.08 +
      Math.cos(x * 0.041 + z * 0.025) * 0.06;
    const hills =
      fbm2D(x * 0.018 + 11.3, z * 0.018 - 4.7, 3) * 2.4 * trackFlatten +
      fbm2D(x * 0.06, z * 0.06, 2) * 0.14 * (0.2 + 0.8 * trackFlatten);
    return gentleRoll * 0.5 + hills;
  }

  // Analytical 2-bone Inverse Kinematics solver in 3D.
  // Finds midPos given rootPos, targetPos, upper length L1, lower length L2,
  // and poleDir (direction toward which the middle joint should bend).
  const _ikDiff = new THREE.Vector3();
  const _ikDir = new THREE.Vector3();
  const _ikBend = new THREE.Vector3();

  function solveTwoBoneIK(rootPos, targetPos, L1, L2, poleDir, outMid, outEnd) {
    _ikDiff.subVectors(targetPos, rootPos);
    const rawDist = _ikDiff.length();
    const minDist = Math.abs(L1 - L2) + 0.004;
    const maxDist = (L1 + L2) * 0.996;
    const d = clamp(rawDist, minDist, maxDist);

    if (rawDist > 1e-6) {
      _ikDir.copy(_ikDiff).divideScalar(rawDist);
    } else {
      _ikDir.set(0, -1, 0);
    }

    // Law of cosines for distance along root->target and perpendicular height
    const along = (L1 * L1 - L2 * L2 + d * d) / (2 * d);
    const hSq = Math.max(0, L1 * L1 - along * along);
    const h = Math.sqrt(hSq);

    // Project poleDir perpendicular to _ikDir
    const dotPole = poleDir.dot(_ikDir);
    _ikBend.copy(poleDir).addScaledVector(_ikDir, -dotPole);
    const bendLen = _ikBend.length();
    if (bendLen > 1e-5) {
      _ikBend.divideScalar(bendLen);
    } else {
      _ikBend.set(0, 0, 1);
    }

    outMid
      .copy(rootPos)
      .addScaledVector(_ikDir, along)
      .addScaledVector(_ikBend, h);

    if (outEnd) {
      outEnd.copy(rootPos).addScaledVector(_ikDir, d);
    }
  }

  // Helper to build a quaternion aligning local +Y axis along a target direction,
  // keeping local +X as close as possible to a reference right/left axis.
  const _yAxis = new THREE.Vector3();
  const _xAxis = new THREE.Vector3();
  const _zAxis = new THREE.Vector3();
  const _rotMat = new THREE.Matrix4();

  function quatFromYAndHintX(yDir, hintX, outQuat) {
    _yAxis.copy(yDir).normalize();
    _zAxis.crossVectors(hintX, _yAxis);
    if (_zAxis.lengthSq() < 1e-8) {
      _zAxis.set(0, 0, 1);
    } else {
      _zAxis.normalize();
    }
    _xAxis.crossVectors(_yAxis, _zAxis).normalize();
    _rotMat.makeBasis(_xAxis, _yAxis, _zAxis);
    outQuat.setFromRotationMatrix(_rotMat);
    return outQuat;
  }

  App.Math = {
    clamp,
    lerp,
    smoothstep,
    smootherstep,
    fract,
    createRNG,
    noise2D,
    fbm2D,
    groundHeight,
    solveTwoBoneIK,
    quatFromYAndHintX,
  };
})(window);
