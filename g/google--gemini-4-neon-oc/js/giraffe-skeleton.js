// Anatomical Giraffe Skeleton & Rest-Pose Joint Proportions
(function (global) {
  'use strict';

  const GiraffeSkeleton = {};

  /**
   * All anatomical rest-pose coordinates in meters (Y-up, facing +Z, ground Y = 0).
   * Left = +X (side = +1), Right = -X (side = -1).
   */
  GiraffeSkeleton.REST = {
    // Torso / Spine
    pelvis: new THREE.Vector3(0, 2.34, -0.72),
    spine:  new THREE.Vector3(0, 2.48, -0.06),
    chest:  new THREE.Vector3(0, 2.62,  0.58),

    // Neck (arising at ~60 deg forward from horizontal, gentle S-curve)
    neck0:  new THREE.Vector3(0, 2.76,  0.88),
    neck1:  new THREE.Vector3(0, 3.20,  1.17),
    neck2:  new THREE.Vector3(0, 3.66,  1.43),
    neck3:  new THREE.Vector3(0, 4.12,  1.66),
    neck4:  new THREE.Vector3(0, 4.56,  1.86),

    // Head (atlanto-occipital joint -> skull -> muzzle)
    head:   new THREE.Vector3(0, 4.74,  1.92),
    muzzle: new THREE.Vector3(0, 4.52,  2.55),

    // Ears (base pivots nestled cleanly into skull side)
    earL:   new THREE.Vector3( 0.068, 4.77, 1.93),
    earR:   new THREE.Vector3(-0.068, 4.77, 1.93),

    // Tail chain (tucked cleanly into smooth sloping croup)
    tail0:  new THREE.Vector3(0, 2.30, -1.07),
    tail1:  new THREE.Vector3(0, 2.04, -1.21),
    tail2:  new THREE.Vector3(0, 1.74, -1.26),
    tail3:  new THREE.Vector3(0, 1.42, -1.27),
    tailTip:new THREE.Vector3(0, 1.10, -1.27),
  };

  /**
   * Returns rest-pose joint world positions for a leg.
   * isFront: true for front legs, false for hind legs
   * side: +1 for Left, -1 for Right
   */
  GiraffeSkeleton.getLegRestJoints = function (isFront, side) {
    if (isFront) {
      return {
        top:     new THREE.Vector3(side * 0.245, 2.30,  0.68), // shoulder (glenoid)
        upper:   new THREE.Vector3(side * 0.230, 1.86,  0.54), // elbow
        mid:     new THREE.Vector3(side * 0.210, 1.06,  0.62), // carpus ("front knee")
        fetlock: new THREE.Vector3(side * 0.200, 0.28,  0.60), // fetlock
        coronet: new THREE.Vector3(side * 0.200, 0.11,  0.69), // hoof coronet band
        hoof:    new THREE.Vector3(side * 0.200, 0.00,  0.72), // sole ground contact
      };
    } else {
      return {
        top:     new THREE.Vector3(side * 0.240, 2.26, -0.72), // hip (coxofemoral)
        upper:   new THREE.Vector3(side * 0.230, 1.76, -0.48), // stifle
        mid:     new THREE.Vector3(side * 0.200, 1.08, -0.88), // hock (tarsus)
        fetlock: new THREE.Vector3(side * 0.192, 0.28, -0.84), // fetlock
        coronet: new THREE.Vector3(side * 0.192, 0.11, -0.75), // hoof coronet band
        hoof:    new THREE.Vector3(side * 0.192, 0.00, -0.72), // sole ground contact
      };
    }
  };

  /**
   * Builds the complete Three.js Bone hierarchy and Skeleton.
   * Every bone has identity rotation in rest pose, so local positions are simply
   * (childRestWorld - parentRestWorld).
   */
  GiraffeSkeleton.createRig = function () {
    const R = GiraffeSkeleton.REST;
    const bones = [];
    const byName = {};

    function makeBone(name, worldPos, parentBone, parentWorldPos) {
      const b = new THREE.Bone();
      b.name = name;
      if (parentBone && parentWorldPos) {
        b.position.subVectors(worldPos, parentWorldPos);
        parentBone.add(b);
      } else {
        b.position.copy(worldPos);
      }
      b.userData.restWorld = worldPos.clone();
      b.userData.index = bones.length;
      bones.push(b);
      byName[name] = b;
      return b;
    }

    // Root -> Spine -> Neck -> Head
    const pelvis = makeBone('pelvis', R.pelvis, null, null);
    const spine  = makeBone('spine',  R.spine,  pelvis, R.pelvis);
    const chest  = makeBone('chest',  R.chest,  spine,  R.spine);

    const neck0  = makeBone('neck0',  R.neck0,  chest,  R.chest);
    const neck1  = makeBone('neck1',  R.neck1,  neck0,  R.neck0);
    const neck2  = makeBone('neck2',  R.neck2,  neck1,  R.neck1);
    const neck3  = makeBone('neck3',  R.neck3,  neck2,  R.neck2);
    const neck4  = makeBone('neck4',  R.neck4,  neck3,  R.neck3);
    const head   = makeBone('head',   R.head,   neck4,  R.neck4);

    // Ears (children of head)
    const earL   = makeBone('earL',   R.earL,   head,   R.head);
    const earR   = makeBone('earR',   R.earR,   head,   R.head);

    // Tail (children of pelvis)
    const tail0  = makeBone('tail0',  R.tail0,  pelvis, R.pelvis);
    const tail1  = makeBone('tail1',  R.tail1,  tail0,  R.tail0);
    const tail2  = makeBone('tail2',  R.tail2,  tail1,  R.tail1);
    const tail3  = makeBone('tail3',  R.tail3,  tail2,  R.tail2);

    // Four articulated legs
    const legSpecs = [
      { key: 'LF', isFront: true,  side:  1, parent: chest,  parentPos: R.chest },
      { key: 'RF', isFront: true,  side: -1, parent: chest,  parentPos: R.chest },
      { key: 'LH', isFront: false, side:  1, parent: pelvis, parentPos: R.pelvis },
      { key: 'RH', isFront: false, side: -1, parent: pelvis, parentPos: R.pelvis },
    ];

    const legs = {};

    for (const spec of legSpecs) {
      const j = GiraffeSkeleton.getLegRestJoints(spec.isFront, spec.side);
      const bTop     = makeBone(`${spec.key}_top`,     j.top,     spec.parent, spec.parentPos);
      const bUpper   = makeBone(`${spec.key}_upper`,   j.upper,   bTop,        j.top);
      const bMid     = makeBone(`${spec.key}_mid`,     j.mid,     bUpper,      j.upper);
      const bFetlock = makeBone(`${spec.key}_fetlock`, j.fetlock, bMid,        j.mid);
      const bHoof    = makeBone(`${spec.key}_hoof`,    j.coronet, bFetlock,    j.fetlock);

      // Compute exact rest segment lengths and rest directions for IK
      const lenUpper  = j.top.distanceTo(j.upper);
      const lenMid    = j.upper.distanceTo(j.mid);
      const lenCannon = j.mid.distanceTo(j.fetlock);
      const lenPastern = j.fetlock.distanceTo(j.coronet);
      const lenHoof   = j.coronet.distanceTo(j.hoof);

      legs[spec.key] = {
        key: spec.key,
        isFront: spec.isFront,
        side: spec.side,
        parentBone: spec.parent,
        joints: j,
        bones: {
          top: bTop,
          upper: bUpper,
          mid: bMid,
          fetlock: bFetlock,
          hoof: bHoof,
        },
        lengths: {
          upper: lenUpper,
          mid: lenMid,
          cannon: lenCannon,
          pastern: lenPastern,
          hoof: lenHoof,
        },
        restDirs: {
          upper:   new THREE.Vector3().subVectors(j.upper,   j.top).normalize(),
          mid:     new THREE.Vector3().subVectors(j.mid,     j.upper).normalize(),
          cannon:  new THREE.Vector3().subVectors(j.fetlock, j.mid).normalize(),
          pastern: new THREE.Vector3().subVectors(j.coronet, j.fetlock).normalize(),
        },
      };
    }

    // Root container group
    const rootGroup = new THREE.Group();
    rootGroup.name = 'GiraffeRoot';
    rootGroup.add(pelvis);
    rootGroup.updateMatrixWorld(true);

    const skeleton = new THREE.Skeleton(bones);

    return {
      rootGroup,
      bones,
      byName,
      legs,
      skeleton,
      rest: R,
    };
  };

  global.GiraffeSkeleton = GiraffeSkeleton;
})(window);
