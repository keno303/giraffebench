(function (global) {
  'use strict';

  const App = (global.GiraffeApp = global.GiraffeApp || {});

  // Refined adult giraffe anatomical rest-pose joints in meters (Y-up, +Z forward, +X left).
  const JOINT_DEFS = [
    // Spine, Neck & Head (0..9)
    { name: 'pelvis',      parent: -1, pos: [0.00, 2.06, -0.58] },
    { name: 'spineMid',    parent: 0,  pos: [0.00, 2.22, -0.04] },
    { name: 'chest',       parent: 1,  pos: [0.00, 2.40,  0.50] },
    { name: 'neck0',       parent: 2,  pos: [0.00, 2.58,  0.72] },
    { name: 'neck1',       parent: 3,  pos: [0.00, 2.88,  0.91] },
    { name: 'neck2',       parent: 4,  pos: [0.00, 3.20,  1.09] },
    { name: 'neck3',       parent: 5,  pos: [0.00, 3.53,  1.27] },
    { name: 'neck4',       parent: 6,  pos: [0.00, 3.85,  1.45] },
    { name: 'neck5',       parent: 7,  pos: [0.00, 4.17,  1.63] },
    { name: 'head',        parent: 8,  pos: [0.00, 4.46,  1.80] },

    // Tail (10..14)
    { name: 'tail0',       parent: 0,  pos: [0.00, 2.02, -0.92] },
    { name: 'tail1',       parent: 10, pos: [0.00, 1.75, -1.00] },
    { name: 'tail2',       parent: 11, pos: [0.00, 1.47, -1.03] },
    { name: 'tail3',       parent: 12, pos: [0.00, 1.19, -1.04] },
    { name: 'tail4',       parent: 13, pos: [0.00, 0.91, -1.04] },

    // Front Left Leg (15..19) — tall, stately, columnar foreleg!
    { name: 'fl_shoulder', parent: 2,  pos: [ 0.24, 2.18,  0.58] },
    { name: 'fl_elbow',    parent: 15, pos: [ 0.22, 1.66,  0.44] },
    { name: 'fl_carpus',   parent: 16, pos: [ 0.20, 1.04,  0.50] },
    { name: 'fl_fetlock',  parent: 17, pos: [ 0.18, 0.28,  0.49] },
    { name: 'fl_hoof',     parent: 18, pos: [ 0.18, 0.00,  0.57] },

    // Front Right Leg (20..24)
    { name: 'fr_shoulder', parent: 2,  pos: [-0.24, 2.18,  0.58] },
    { name: 'fr_elbow',    parent: 20, pos: [-0.22, 1.66,  0.44] },
    { name: 'fr_carpus',   parent: 21, pos: [-0.20, 1.04,  0.50] },
    { name: 'fr_fetlock',  parent: 22, pos: [-0.18, 0.28,  0.49] },
    { name: 'fr_hoof',     parent: 23, pos: [-0.18, 0.00,  0.57] },

    // Hind Left Leg (25..29) — tall, poised ungulate stifle & hock!
    { name: 'hl_hip',      parent: 0,  pos: [ 0.25, 2.06, -0.64] },
    { name: 'hl_stifle',   parent: 25, pos: [ 0.24, 1.54, -0.49] },
    { name: 'hl_hock',     parent: 26, pos: [ 0.20, 1.02, -0.76] },
    { name: 'hl_fetlock',  parent: 27, pos: [ 0.18, 0.28, -0.68] },
    { name: 'hl_hoof',     parent: 28, pos: [ 0.18, 0.00, -0.60] },

    // Hind Right Leg (30..34)
    { name: 'hr_hip',      parent: 0,  pos: [-0.25, 2.06, -0.64] },
    { name: 'hr_stifle',   parent: 30, pos: [-0.24, 1.54, -0.49] },
    { name: 'hr_hock',     parent: 31, pos: [-0.20, 1.02, -0.76] },
    { name: 'hr_fetlock',  parent: 32, pos: [-0.18, 0.28, -0.68] },
    { name: 'hr_hoof',     parent: 33, pos: [-0.18, 0.00, -0.60] },
  ];

  const BONE_INDEX = {};
  JOINT_DEFS.forEach((d, i) => {
    BONE_INDEX[d.name] = i;
  });

  function createGiraffeSkeleton() {
    const bones = [];
    const restPositions = [];

    for (let i = 0; i < JOINT_DEFS.length; i++) {
      const def = JOINT_DEFS[i];
      const bone = new THREE.Bone();
      bone.name = def.name;
      const p = new THREE.Vector3(def.pos[0], def.pos[1], def.pos[2]);
      restPositions.push(p);

      if (def.parent === -1) {
        bone.position.copy(p);
      } else {
        const parentPos = restPositions[def.parent];
        bone.position.subVectors(p, parentPos);
        bones[def.parent].add(bone);
      }
      bones.push(bone);
    }

    const legSpecs = {
      fl: buildLegSpec('fl', true, +1, [15, 16, 17, 18, 19], restPositions),
      fr: buildLegSpec('fr', true, -1, [20, 21, 22, 23, 24], restPositions),
      hl: buildLegSpec('hl', false, +1, [25, 26, 27, 28, 29], restPositions),
      hr: buildLegSpec('hr', false, -1, [30, 31, 32, 33, 34], restPositions),
    };

    const skeleton = new THREE.Skeleton(bones);

    return {
      bones,
      rootBone: bones[0],
      skeleton,
      restPositions,
      legSpecs,
      index: BONE_INDEX,
    };
  }

  function buildLegSpec(id, isFront, sideSign, indices, restPositions) {
    const pts = indices.map((idx) => restPositions[idx].clone());
    const segLengths = [];
    const segRestDirs = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const v = new THREE.Vector3().subVectors(pts[i + 1], pts[i]);
      segLengths.push(v.length());
      segRestDirs.push(v.clone().normalize());
    }
    return {
      id,
      isFront,
      sideSign,
      indices,
      restPoints: pts,
      segLengths,
      segRestDirs,
      restHoofX: pts[4].x,
      restHoofZ: pts[4].z,
      restHipToHoofZ: pts[4].z - pts[0].z,
    };
  }

  App.Skeleton = {
    JOINT_DEFS,
    BONE_INDEX,
    createGiraffeSkeleton,
  };
})(window);
