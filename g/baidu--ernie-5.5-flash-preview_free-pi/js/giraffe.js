/* A procedurally modelled, walking giraffe.
   No external assets: all geometry and textures are generated at load time. */
(function () {
  'use strict';
  var T = THREE;
  var TX = window.GiraffeTextures;

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function smoothstep(t) { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); }

  function catmull(p0, p1, p2, p3, t) {
    var t2 = t * t, t3 = t2 * t;
    return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
  }

  // Resample a list of rings with a Catmull-Rom spline so silhouettes stay smooth.
  function resampleRings(control, count) {
    var out = [];
    var n = control.length;
    for (var i = 0; i < count; i++) {
      var u = (i / (count - 1)) * (n - 1);
      var i1 = Math.floor(u);
      var f = u - i1;
      var i0 = Math.max(0, i1 - 1);
      var i2 = Math.min(n - 1, i1 + 1);
      var i3 = Math.min(n - 1, i1 + 2);
      out.push({
        z: catmull(control[i0].z, control[i1].z, control[i2].z, control[i3].z, f),
        rx: Math.max(0.001, catmull(control[i0].rx, control[i1].rx, control[i2].rx, control[i3].rx, f)),
        ry: Math.max(0.001, catmull(control[i0].ry, control[i1].ry, control[i2].ry, control[i3].ry, f)),
        cy: catmull(control[i0].cy, control[i1].cy, control[i2].cy, control[i3].cy, f)
      });
    }
    return out;
  }

  // Loft a closed tube through elliptical cross sections (superellipse exponent keeps it organic).
  function loftGeometry(rings, radial, opt) {
    opt = opt || {};
    var exp = opt.exponent == null ? 1.0 : opt.exponent;
    var uOff = opt.uOffset || 0;
    var pos = [], uv = [], idx = [];
    var signPow = function (v, e) { return Math.sign(v) * Math.pow(Math.abs(v), e); };
    for (var i = 0; i < rings.length; i++) {
      var r = rings[i];
      for (var j = 0; j <= radial; j++) {
        var a = (j / radial) * Math.PI * 2;
        var x = r.rx * signPow(Math.cos(a), exp);
        var y = r.cy + r.ry * signPow(Math.sin(a), exp);
        pos.push(x, y, r.z);
        uv.push(j / radial + uOff, i / (rings.length - 1));
      }
    }
    var row = radial + 1;
    for (var i2 = 0; i2 < rings.length - 1; i2++) {
      for (var j2 = 0; j2 < radial; j2++) {
        var a0 = i2 * row + j2, b0 = a0 + 1, c0 = a0 + row, d0 = c0 + 1;
        idx.push(a0, b0, c0, b0, d0, c0);
      }
    }
    // caps
    if (opt.capStart !== false) {
      var sCenter = pos.length / 3;
      pos.push(0, rings[0].cy, rings[0].z); uv.push(0.5, 0);
      for (var j3 = 0; j3 < radial; j3++) {
        idx.push(sCenter, j3 + 1, j3);
      }
    }
    if (opt.capEnd !== false) {
      var eCenter = pos.length / 3;
      var last = rings[rings.length - 1];
      pos.push(0, last.cy, last.z); uv.push(0.5, 1);
      var base = (rings.length - 1) * row;
      for (var j4 = 0; j4 < radial; j4++) {
        idx.push(eCenter, base + j4, base + j4 + 1);
      }
    }
    var geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    // stitch normals across the uv seam
    var nrm = geo.attributes.normal;
    for (var i3 = 0; i3 < rings.length; i3++) {
      var a1 = i3 * row, b1 = a1 + radial;
      var nx = nrm.getX(a1) + nrm.getX(b1), ny = nrm.getY(a1) + nrm.getY(b1), nz = nrm.getZ(a1) + nrm.getZ(b1);
      var len = Math.hypot(nx, ny, nz) || 1;
      nrm.setXYZ(a1, nx / len, ny / len, nz / len);
      nrm.setXYZ(b1, nx / len, ny / len, nz / len);
    }
    return geo;
  }

  function texRepeat(tex, x, y) {
    var t = tex.clone();
    t.needsUpdate = true;
    t.wrapS = t.wrapT = T.RepeatWrapping;
    t.repeat.set(x, y);
    t.anisotropy = 8;
    t.encoding = T.sRGBEncoding;
    return t;
  }

  function addSkin(geo, tOfVertex, boneTs, boneIndex, weight) {
    var n = geo.attributes.position.count;
    var si = new Uint16Array(n * 4);
    var sw = new Float32Array(n * 4);
    for (var i = 0; i < n; i++) {
      var t = tOfVertex(i);
      var k = 0;
      while (k < boneTs.length - 2 && t > boneTs[k + 1]) k++;
      var f = clamp((t - boneTs[k]) / (boneTs[k + 1] - boneTs[k]), 0, 1);
      si[i * 4] = boneIndex[k];
      si[i * 4 + 1] = boneIndex[k + 1];
      sw[i * 4] = 1 - f;
      sw[i * 4 + 1] = f;
    }
    geo.setAttribute('skinIndex', new T.Uint16BufferAttribute(si, 4));
    geo.setAttribute('skinWeight', new T.Float32BufferAttribute(sw, 4));
  }

  // ---------- Leg ----------
  function Leg(parent, o) {
    this.L1 = o.L1; this.L2 = o.L2;
    this.bend = o.bend;           // +1 knee forward (fore), -1 hock back (hind)
    this.hipHeight = o.hipHeight;
    this.stride = o.stride;
    this.lift = o.lift;
    this.phaseOffset = o.phaseOffset;
    this.legLen = o.hipHeight - 0.15;
    this.hoofTilt = 0;

    this.root = new T.Group();
    this.root.position.set(o.x, o.hipHeight, o.z);
    parent.add(this.root);

    var coat = o.coatMat, hide = o.hideMat;
    var thigh = new T.Mesh(new T.SphereGeometry(o.thighR, 16, 12), coat);
    thigh.scale.set(1.0, 1.15, 1.05);
    thigh.castShadow = true;
    this.root.add(thigh);

    this.hip = new T.Group();
    this.root.add(this.hip);

    var upper = new T.Mesh(new T.CylinderGeometry(o.upperRTop, o.upperRBot, this.L1, 12, 4), coat);
    upper.position.y = -this.L1 / 2;
    upper.castShadow = true;
    upper.receiveShadow = true;
    this.hip.add(upper);

    this.knee = new T.Group();
    this.knee.position.y = -this.L1;
    this.hip.add(this.knee);

    var kneeBall = new T.Mesh(new T.SphereGeometry(o.kneeR, 12, 10), coat);
    kneeBall.castShadow = true;
    this.knee.add(kneeBall);

    var lower = new T.Mesh(new T.CylinderGeometry(o.lowerRTop, o.lowerRBot, this.L2, 12, 4), o.lowerMat || hide);
    lower.position.y = -this.L2 / 2;
    lower.castShadow = true;
    lower.receiveShadow = true;
    this.knee.add(lower);

    // fetlock + cloven hoof
    var fet = new T.Mesh(new T.SphereGeometry(o.lowerRBot * 1.25, 10, 8), hide);
    fet.position.y = -this.L2;
    fet.scale.y = 0.9;
    fet.castShadow = true;
    this.knee.add(fet);

    this.hoof = new T.Group();
    this.hoof.position.y = -this.L2;
    this.knee.add(this.hoof);
    var hoofMat = o.hoofMat;
    for (var s = -1; s <= 1; s += 2) {
      var hoof = new T.Mesh(new T.BoxGeometry(0.058, 0.15, 0.125), hoofMat);
      hoof.position.set(s * 0.032, -0.075, 0.014);
      hoof.castShadow = true;
      hoof.receiveShadow = true;
      this.hoof.add(hoof);
    }

    this.upper = upper; this.lower = lower;
  }

  Leg.prototype.solve = function (targetY, targetZ) {
    var h = -targetY, z = targetZ;
    var d = Math.sqrt(h * h + z * z);
    d = clamp(d, Math.abs(this.L1 - this.L2) + 0.01, this.L1 + this.L2 - 0.006);
    var phi = Math.atan2(z, h);
    var cosA = (d * d + this.L1 * this.L1 - this.L2 * this.L2) / (2 * d * this.L1);
    var A = Math.acos(clamp(cosA, -1, 1));
    var a1 = phi + this.bend * A;
    var kx = this.L1 * Math.sin(a1);
    var ky = -this.L1 * Math.cos(a1);
    var a2 = Math.atan2(z - kx, -(targetY - ky));
    this.hip.rotation.x = -a1;
    this.knee.rotation.x = a1 - a2;
    this.hoof.rotation.x = a2 + this.hoofTilt;
  };

  Leg.prototype.animate = function (phase, time) {
    var p = (phase + this.phaseOffset) % 1;
    var duty = 0.64;
    var z, y;
    if (p < duty) {
      var u = p / duty;
      z = this.stride * 0.5 - this.stride * u;
      y = -this.legLen;
      this.hoofTilt = 0.0;
    } else {
      var u2 = (p - duty) / (1 - duty);
      var e = smoothstep(u2);
      z = -this.stride * 0.5 + this.stride * e;
      y = -this.legLen + this.lift * Math.sin(Math.PI * u2);
      this.hoofTilt = 0.16 * Math.sin(Math.PI * u2);
    }
    this.solve(y, z);
  };

  // ---------- Giraffe ----------
  function Giraffe() {
    this.group = new T.Group();
    this.body = new T.Group();
    this.body.position.y = 2.5;
    this.group.add(this.body);

    this.phase = 0;
    this.time = 0;
    this.cycle = 1.75;
    this.stride = 1.25;
    this.speed = 0; // set by update

    this.coatTex = TX.makeCoatTexture(512, 30, 1337);
    this.hideTex = TX.makeHideTexture(256, 5);
    this.lowerLegTex = TX.makeLowerLegTexture(256, 13);
    this.maneTex = null;

    this.coat = new T.MeshStandardMaterial({ map: texRepeat(this.coatTex, 1.5, 1.0), roughness: 0.88, metalness: 0.0 });
    this.coatNeck = new T.MeshStandardMaterial({ map: texRepeat(this.coatTex, 1.3, 1.6), roughness: 0.88, metalness: 0.0, skinning: true });
    this.coatHead = new T.MeshStandardMaterial({ map: texRepeat(this.coatTex, 0.9, 0.9), roughness: 0.85, metalness: 0.0 });
    this.coatLeg = new T.MeshStandardMaterial({ map: texRepeat(this.coatTex, 0.8, 1.2), roughness: 0.9, metalness: 0.0 });
    this.hideMat = new T.MeshStandardMaterial({ map: texRepeat(this.hideTex, 1, 2), roughness: 0.92, metalness: 0.0 });
    this.lowerLegMat = new T.MeshStandardMaterial({ map: texRepeat(this.lowerLegTex, 1, 1), roughness: 0.92, metalness: 0.0 });
    this.hideMatPlain = new T.MeshStandardMaterial({ color: 0xe8d3ab, roughness: 0.9 });
    this.maneMat = new T.MeshStandardMaterial({ color: 0x3b2a1c, roughness: 1.0, side: T.DoubleSide, skinning: true });
    this.hoofMat = new T.MeshStandardMaterial({ color: 0x2b241d, roughness: 0.55, metalness: 0.05 });
    this.darkMat = new T.MeshStandardMaterial({ color: 0x1d1510, roughness: 0.45 });
    this.irisMat = new T.MeshStandardMaterial({ color: 0x2a1a0e, roughness: 0.35 });
    this.earInnerMat = new T.MeshStandardMaterial({ color: 0xb98a7a, roughness: 0.9, side: T.DoubleSide });
    this.ossMat = new T.MeshStandardMaterial({ color: 0x6d4a33, roughness: 0.95 });
    this.ossTipMat = new T.MeshStandardMaterial({ color: 0x3a2a1e, roughness: 1.0 });

    this.blinkTimer = 2.8;
    this.blinkPhase = 0;
    this.blinkDuration = 0.17;
    this.eyelids = [];
    this.lidMat = new T.MeshStandardMaterial({ color: 0xe6d0a6, roughness: 0.92, side: T.DoubleSide });

    this.buildBody();
    this.buildNeck();
    this.buildHead();
    this.buildTail();
    this.buildLegs();
    this.group.traverse(function (o) {
      if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; }
    });
  }

  Giraffe.prototype.buildBody = function () {
    var ctrl = [
      { z: -1.28, rx: 0.02, ry: 0.03, cy: 0.02 },
      { z: -1.22, rx: 0.24, ry: 0.28, cy: 0.02 },
      { z: -1.10, rx: 0.34, ry: 0.38, cy: 0.02 },
      { z: -0.90, rx: 0.395, ry: 0.48, cy: 0.00 },
      { z: -0.60, rx: 0.385, ry: 0.48, cy: -0.02 },
      { z: -0.25, rx: 0.375, ry: 0.46, cy: -0.03 },
      { z: 0.10, rx: 0.385, ry: 0.48, cy: -0.01 },
      { z: 0.45, rx: 0.41, ry: 0.53, cy: 0.03 },
      { z: 0.72, rx: 0.425, ry: 0.55, cy: 0.06 },
      { z: 0.95, rx: 0.405, ry: 0.51, cy: 0.05 },
      { z: 1.10, rx: 0.34, ry: 0.44, cy: 0.03 },
      { z: 1.22, rx: 0.22, ry: 0.30, cy: 0.02 },
      { z: 1.30, rx: 0.03, ry: 0.05, cy: 0.02 }
    ];
    var rings = resampleRings(ctrl, 46);
    var geo = loftGeometry(rings, 40, { uOffset: 0.75, exponent: 0.94 });
    var mesh = new T.Mesh(geo, this.coat);
    this.body.add(mesh);

    // shoulder / withers blend into the neck
    var shoulder = new T.Mesh(new T.SphereGeometry(1, 24, 18), this.coat);
    shoulder.scale.set(0.42, 0.42, 0.55);
    shoulder.position.set(0, 0.18, 0.82);
    this.body.add(shoulder);

    // subtle chest
    var chest = new T.Mesh(new T.SphereGeometry(1, 20, 16), this.coat);
    chest.scale.set(0.33, 0.36, 0.36);
    chest.position.set(0, -0.10, 1.02);
    this.body.add(chest);

    // rump
    var rump = new T.Mesh(new T.SphereGeometry(1, 20, 16), this.coat);
    rump.scale.set(0.34, 0.36, 0.34);
    rump.position.set(0, 0.0, -1.06);
    this.body.add(rump);
  };

  Giraffe.prototype.buildNeck = function () {
    var neckGroup = new T.Group();
    neckGroup.position.set(0, 0.28, 0.98);
    this.body.add(neckGroup);
    this.neckGroup = neckGroup;

    var curve = new T.CatmullRomCurve3([
      new T.Vector3(0, 0, 0),
      new T.Vector3(0, 0.55, 0.30),
      new T.Vector3(0, 1.15, 0.70),
      new T.Vector3(0, 1.75, 1.05),
      new T.Vector3(0, 2.18, 1.28)
    ]);
    this.neckCurve = curve;

    var radii = [0.34, 0.315, 0.285, 0.25, 0.205];
    var boneTs = [0, 0.28, 0.55, 0.8, 1.0];
    var boneIndex = [0, 1, 2, 3, 4];
    var radial = 22, rings = 40;
    var pos = [], uv = [], idx = [];
    var ringPts = [];
    var X = new T.Vector3(1, 0, 0);
    for (var i = 0; i < rings; i++) {
      var t = i / (rings - 1);
      var p = curve.getPointAt(t);
      var tan = curve.getTangentAt(t).normalize();
      var N = new T.Vector3().crossVectors(tan, X).normalize();
      var r = 0;
      // radius from the control list
      for (var k = 0; k < boneTs.length - 1; k++) {
        if (t >= boneTs[k] && t <= boneTs[k + 1]) {
          var f = (t - boneTs[k]) / (boneTs[k + 1] - boneTs[k]);
          r = lerp(radii[k], radii[k + 1], f);
          break;
        }
      }
      ringPts.push({ p: p, N: N, r: r, t: t, tan: tan });
      for (var j = 0; j <= radial; j++) {
        var a = (j / radial) * Math.PI * 2;
        var off = X.clone().multiplyScalar(r * 1.02 * Math.cos(a))
          .add(N.clone().multiplyScalar(r * 0.94 * Math.sin(a)));
        pos.push(p.x + off.x, p.y + off.y, p.z + off.z);
        uv.push(j / radial + 0.25, t);
      }
    }
    var row = radial + 1;
    for (var i2 = 0; i2 < rings - 1; i2++) {
      for (var j2 = 0; j2 < radial; j2++) {
        var a0 = i2 * row + j2, b0 = a0 + 1, c0 = a0 + row, d0 = c0 + 1;
        idx.push(a0, b0, c0, b0, d0, c0);
      }
    }
    var geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    var nrm = geo.attributes.normal;
    for (var i3 = 0; i3 < rings; i3++) {
      var a1 = i3 * row, b1 = a1 + radial;
      var nx = nrm.getX(a1) + nrm.getX(b1), ny = nrm.getY(a1) + nrm.getY(b1), nz = nrm.getZ(a1) + nrm.getZ(b1);
      var len = Math.hypot(nx, ny, nz) || 1;
      nrm.setXYZ(a1, nx / len, ny / len, nz / len);
      nrm.setXYZ(b1, nx / len, ny / len, nz / len);
    }
    // skin weights from the ring t
    var si = new Uint16Array(rings * row * 4);
    var sw = new Float32Array(rings * row * 4);
    for (var i4 = 0; i4 < rings; i4++) {
      var tt = i4 / (rings - 1);
      var kk = 0;
      while (kk < boneTs.length - 2 && tt > boneTs[kk + 1]) kk++;
      var ff = clamp((tt - boneTs[kk]) / (boneTs[kk + 1] - boneTs[kk]), 0, 1);
      for (var j5 = 0; j5 < row; j5++) {
        var o = (i4 * row + j5) * 4;
        si[o] = boneIndex[kk]; si[o + 1] = boneIndex[kk + 1];
        sw[o] = 1 - ff; sw[o + 1] = ff;
      }
    }
    geo.setAttribute('skinIndex', new T.Uint16BufferAttribute(si, 4));
    geo.setAttribute('skinWeight', new T.Float32BufferAttribute(sw, 4));

    // bones along the neck
    var bones = [];
    for (var bi = 0; bi < boneTs.length; bi++) {
      var bp = curve.getPointAt(boneTs[bi]);
      var bone = new T.Bone();
      if (bi === 0) {
        bone.position.copy(bp);
        neckGroup.add(bone);
      } else {
        bone.position.copy(bp).sub(curve.getPointAt(boneTs[bi - 1]));
        bones[bi - 1].add(bone);
      }
      bones.push(bone);
    }
    this.neckBones = bones;
    this.skeleton = new T.Skeleton(bones);

    var neckMesh = new T.SkinnedMesh(geo, this.coatNeck);
    neckMesh.frustumCulled = false;
    neckGroup.add(neckMesh);
    neckMesh.bind(this.skeleton);
    this.neckMesh = neckMesh;

    // ---- mane (shares the neck skeleton) ----
    var rnd = TX.mulberry32(77);
    var mpos = [], muv = [], midx = [], msi = [], msw = [];
    var maneRings = 46;
    var mbase = [], mtip = [];
    for (var mi = 0; mi < maneRings; mi++) {
      var mt = mi / (maneRings - 1);
      // sample ring data by nearest ring
      var ri = Math.min(rings - 1, Math.round(mt * (rings - 1)));
      var rp = ringPts[ri];
      var back = rp.p.clone().add(rp.N.clone().multiplyScalar(rp.r * 0.93));
      var h = 0.08 + rnd() * 0.10;
      // taper the mane at both ends
      h *= Math.sin(Math.PI * clamp(mt * 1.06, 0, 1)) * 0.7 + 0.3;
      var tip = back.clone().add(rp.N.clone().multiplyScalar(h));
      tip.x += (rnd() - 0.5) * 0.03;
      mbase.push(back); mtip.push(tip);
    }
    for (var mi2 = 0; mi2 < maneRings - 1; mi2++) {
      var t0 = mi2 / (maneRings - 1), t1 = (mi2 + 1) / (maneRings - 1);
      var base0 = mbase[mi2], tip0 = mtip[mi2], base1 = mbase[mi2 + 1], tip1 = mtip[mi2 + 1];
      var verts = [base0, base1, tip0, base1, tip1, tip0];
      var ts = [t0, t1, t0, t1, t1, t0];
      for (var v = 0; v < 6; v++) {
        mpos.push(verts[v].x, verts[v].y, verts[v].z);
        muv.push(v, ts[v]);
        var kk2 = 0;
        while (kk2 < boneTs.length - 2 && ts[v] > boneTs[kk2 + 1]) kk2++;
        var ff2 = clamp((ts[v] - boneTs[kk2]) / (boneTs[kk2 + 1] - boneTs[kk2]), 0, 1);
        msi.push(boneIndex[kk2], boneIndex[kk2 + 1], 0, 0);
        msw.push(1 - ff2, ff2, 0, 0);
      }
    }
    var mgeo = new T.BufferGeometry();
    mgeo.setAttribute('position', new T.Float32BufferAttribute(mpos, 3));
    mgeo.setAttribute('uv', new T.Float32BufferAttribute(muv, 2));
    mgeo.setAttribute('skinIndex', new T.Uint16BufferAttribute(msi, 4));
    mgeo.setAttribute('skinWeight', new T.Float32BufferAttribute(msw, 4));
    mgeo.computeVertexNormals();
    var maneMesh = new T.SkinnedMesh(mgeo, this.maneMat);
    maneMesh.frustumCulled = false;
    neckGroup.add(maneMesh);
    maneMesh.bind(this.skeleton);

    this.maneMesh = maneMesh;
  };

  Giraffe.prototype.buildHead = function () {
    var head = new T.Group();
    head.rotation.x = 0.18;
    this.neckBones[4].add(head);
    this.head = head;

    // neck-to-head collar
    var collar = new T.Mesh(new T.SphereGeometry(1, 20, 16), this.coatHead);
    collar.scale.set(0.17, 0.17, 0.19);
    collar.position.set(0, 0.0, 0.02);
    head.add(collar);

    var ctrl = [
      { z: -0.04, rx: 0.06, ry: 0.07, cy: 0.015 },
      { z: 0.03, rx: 0.115, ry: 0.145, cy: 0.02 },
      { z: 0.11, rx: 0.142, ry: 0.165, cy: 0.015 },
      { z: 0.23, rx: 0.145, ry: 0.155, cy: 0.0 },
      { z: 0.35, rx: 0.128, ry: 0.13, cy: -0.005 },
      { z: 0.47, rx: 0.108, ry: 0.105, cy: -0.015 },
      { z: 0.57, rx: 0.092, ry: 0.088, cy: -0.022 },
      { z: 0.64, rx: 0.075, ry: 0.07, cy: -0.026 },
      { z: 0.675, rx: 0.03, ry: 0.03, cy: -0.028 }
    ];
    var rings = resampleRings(ctrl, 30);
    var geo = loftGeometry(rings, 28, { uOffset: 0.75, exponent: 0.95 });
    var skull = new T.Mesh(geo, this.coatHead);
    head.add(skull);

    // cheeks
    for (var s = -1; s <= 1; s += 2) {
      var cheek = new T.Mesh(new T.SphereGeometry(1, 14, 12), this.coatHead);
      cheek.scale.set(0.05, 0.065, 0.10);
      cheek.position.set(s * 0.095, -0.045, 0.19);
      head.add(cheek);
    }

    // muzzle / nose
    var muzzle = new T.Mesh(new T.SphereGeometry(1, 16, 12), this.hideMatPlain);
    muzzle.scale.set(0.082, 0.072, 0.075);
    muzzle.position.set(0, -0.026, 0.655);
    head.add(muzzle);

    // nostrils
    for (var ns = -1; ns <= 1; ns += 2) {
      var nos = new T.Mesh(new T.SphereGeometry(1, 10, 8), this.darkMat);
      nos.scale.set(0.018, 0.014, 0.012);
      nos.position.set(ns * 0.042, -0.018, 0.700);
      head.add(nos);
    }

    // mouth line
    for (var ms = -1; ms <= 1; ms += 2) {
      var mouth = new T.Mesh(new T.BoxGeometry(0.006, 0.011, 0.22), this.darkMat);
      mouth.position.set(ms * 0.098, -0.062, 0.47);
      mouth.rotation.y = ms * 0.05;
      head.add(mouth);
    }
    var lip = new T.Mesh(new T.SphereGeometry(1, 12, 8), this.hideMatPlain);
    lip.scale.set(0.07, 0.03, 0.075);
    lip.position.set(0, -0.075, 0.60);
    head.add(lip);

    // eyes
    this.eyes = [];
    for (var es = -1; es <= 1; es += 2) {
      var eye = new T.Group();
      eye.position.set(es * 0.128, 0.062, 0.205);
      eye.rotation.y = es * 1.1;
      head.add(eye);
      var ball = new T.Mesh(new T.SphereGeometry(0.044, 18, 14), this.darkMat);
      eye.add(ball);
      var iris = new T.Mesh(new T.CircleGeometry(0.029, 18), this.irisMat);
      iris.position.z = 0.0445;
      eye.add(iris);
      var pupil = new T.Mesh(new T.CircleGeometry(0.016, 16), this.darkMat);
      pupil.position.z = 0.0455;
      eye.add(pupil);
      var glint = new T.Mesh(new T.SphereGeometry(0.0065, 8, 6), new T.MeshBasicMaterial({ color: 0xffffff }));
      glint.position.set(-0.010, 0.012, 0.047);
      eye.add(glint);
      // eyelid rim
      var lid = new T.Mesh(new T.TorusGeometry(0.049, 0.008, 8, 24), this.ossMat);
      eye.add(lid);
      var lidGeo = new T.SphereGeometry(0.0465, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2);
      var eyelid = new T.Mesh(lidGeo, this.lidMat);
      eye.add(eyelid);
      this.eyelids.push(eyelid);
      this.eyes.push(eye);
    }

    // ossicones
    this.ossicones = [];
    for (var os = -1; os <= 1; os += 2) {
      var og = new T.Group();
      og.position.set(os * 0.072, 0.148, 0.10);
      og.rotation.z = -os * 0.16;
      og.rotation.x = -0.12;
      head.add(og);
      var stalk = new T.Mesh(new T.CylinderGeometry(0.024, 0.032, 0.15, 10, 3), this.ossMat);
      stalk.position.y = 0.075;
      og.add(stalk);
      var knob = new T.Mesh(new T.SphereGeometry(0.044, 12, 10), this.ossTipMat);
      knob.position.y = 0.155;
      og.add(knob);
      this.ossicones.push(og);
    }

    // ears
    this.ears = [];
    var earShape = new T.Shape();
    earShape.moveTo(0, 0);
    earShape.bezierCurveTo(0.055, 0.03, 0.065, 0.105, 0.0, 0.17);
    earShape.bezierCurveTo(-0.065, 0.105, -0.055, 0.03, 0, 0);
    var earGeo = new T.ExtrudeGeometry(earShape, { depth: 0.016, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.006, bevelSegments: 2, curveSegments: 8 });
    earGeo.translate(0, 0, -0.008);
    for (var es2 = -1; es2 <= 1; es2 += 2) {
      var ear = new T.Group();
      ear.position.set(es2 * 0.115, 0.115, 0.035);
      ear.rotation.z = -es2 * 0.95;
      ear.rotation.y = es2 * 0.45;
      head.add(ear);
      var outer = new T.Mesh(earGeo, this.hideMatPlain);
      ear.add(outer);
      var inner = new T.Mesh(earGeo, this.earInnerMat);
      inner.scale.set(0.62, 0.62, 0.5);
      inner.position.set(0, 0.035, 0.012);
      ear.add(inner);
      this.ears.push(ear);
    }

    // small forelock
    var rnd = TX.mulberry32(31);
    var tuftMat = this.maneMat;
    for (var fi = 0; fi < 9; fi++) {
      var tuft = new T.Mesh(new T.ConeGeometry(0.014, 0.06 + rnd() * 0.05, 5), tuftMat);
      tuft.position.set((rnd() - 0.5) * 0.05, 0.17 + rnd() * 0.02, 0.05 + rnd() * 0.06);
      tuft.rotation.x = 0.5 + rnd() * 0.5;
      tuft.rotation.z = (rnd() - 0.5) * 0.8;
      head.add(tuft);
    }

    this.headBaseRot = 0.18;
  };

  Giraffe.prototype.buildTail = function () {
    var tail = new T.Group();
    tail.position.set(0, 0.02, -1.17);
    this.body.add(tail);
    this.tail = tail;

    var curve = new T.CatmullRomCurve3([
      new T.Vector3(0, 0, 0),
      new T.Vector3(0, -0.22, -0.12),
      new T.Vector3(0, -0.5, -0.19),
      new T.Vector3(0, -0.76, -0.16),
      new T.Vector3(0, -0.93, -0.07)
    ]);
    var radial = 10, rings = 24, pos = [], uv = [], idx = [];
    for (var i = 0; i < rings; i++) {
      var t = i / (rings - 1);
      var p = curve.getPointAt(t);
      var r = lerp(0.045, 0.017, Math.pow(t, 0.7));
      for (var j = 0; j <= radial; j++) {
        var a = (j / radial) * Math.PI * 2;
        pos.push(p.x + Math.cos(a) * r, p.y + Math.sin(a) * r * 0.85, p.z);
        uv.push(j / radial, t);
      }
    }
    var row = radial + 1;
    for (var i2 = 0; i2 < rings - 1; i2++) {
      for (var j2 = 0; j2 < radial; j2++) {
        var a0 = i2 * row + j2, b0 = a0 + 1, c0 = a0 + row, d0 = c0 + 1;
        idx.push(a0, b0, c0, b0, d0, c0);
      }
    }
    var geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    var tm = new T.Mesh(geo, this.hideMat);
    tail.add(tm);

    // tuft
    var rnd = TX.mulberry32(5);
    for (var k = 0; k < 22; k++) {
      var len = 0.12 + rnd() * 0.18;
      var strand = new T.Mesh(new T.ConeGeometry(0.012 + rnd() * 0.012, len, 5), this.maneMat);
      var ang = rnd() * Math.PI * 2;
      strand.position.set(Math.cos(ang) * 0.02, -0.95 - len * 0.4, -0.06 + Math.sin(ang) * 0.02);
      strand.rotation.x = Math.PI + (rnd() - 0.5) * 0.5;
      strand.rotation.z = (rnd() - 0.5) * 0.4;
      tail.add(strand);
    }
  };

  Giraffe.prototype.buildLegs = function () {
    var coat = this.coatLeg, hide = this.hideMat, hoof = this.hoofMat;
    var legOpts = [
      { x: -0.285, z: 0.74, front: true, phase: 0.0 },
      { x: 0.285, z: 0.74, front: true, phase: 0.5 },
      { x: -0.30, z: -0.84, front: false, phase: 0.06 },
      { x: 0.30, z: -0.84, front: false, phase: 0.56 }
    ];
    this.legs = [];
    for (var i = 0; i < legOpts.length; i++) {
      var o = legOpts[i];
      var opts = o.front ? {
        L1: 1.20, L2: 1.13, bend: 1, hipHeight: 2.38, stride: this.stride, lift: 0.22,
        phaseOffset: o.phase, x: o.x, z: o.z, coatMat: coat, hideMat: hide, lowerMat: this.lowerLegMat, hoofMat: hoof,
        thighR: 0.15, upperRTop: 0.12, upperRBot: 0.072, kneeR: 0.084,
        lowerRTop: 0.065, lowerRBot: 0.048
      } : {
        L1: 1.24, L2: 1.20, bend: -1, hipHeight: 2.42, stride: this.stride, lift: 0.20,
        phaseOffset: o.phase, x: o.x, z: o.z, coatMat: coat, hideMat: hide, lowerMat: this.lowerLegMat, hoofMat: hoof,
        thighR: 0.175, upperRTop: 0.15, upperRBot: 0.088, kneeR: 0.092,
        lowerRTop: 0.07, lowerRBot: 0.052
      };
      this.legs.push(new Leg(this.group, opts));
    }
  };

  Giraffe.prototype.update = function (dt, elapsed) {
    this.time = elapsed;
    var prevPhase = this.phase;
    this.phase = (this.phase + dt / this.cycle) % 1;
    this.speed = this.stride / (0.64 * this.cycle);

    var ph = this.phase * Math.PI * 2;
    var bob = 0.026 * Math.cos(ph * 2 + 0.5);
    this.body.position.y = 2.5 + bob;
    this.body.rotation.z = 0.028 * Math.sin(ph + 0.2);
    this.body.position.x = 0.022 * Math.sin(ph);
    this.body.rotation.x = 0.007 * Math.sin(ph * 2 + 1.1);
    this.body.rotation.y = 0.012 * Math.sin(ph);

    // neck sway (counter to the body) and head stabilisation
    var sway = Math.sin(ph + 0.4);
    this.neckGroup.rotation.x = 0.012 * Math.sin(ph * 2 + 0.2);
    this.neckGroup.rotation.y = 0.035 * sway;
    for (var i = 1; i < this.neckBones.length; i++) {
      var b = this.neckBones[i];
      b.rotation.x = 0.012 * Math.sin(ph + i * 0.55) * (i / 4);
      b.rotation.z = 0.012 * Math.sin(ph * 0.5 + i * 0.9) * (i / 4);
    }
    var headPitch = this.headBaseRot + 0.025 * Math.sin(ph * 2 + 0.9) - 0.03 * sway;
    this.head.rotation.x = headPitch;
    this.head.rotation.y = -0.05 * sway;
    this.head.rotation.z = 0.02 * Math.sin(ph + 1.2);

    // tail
    this.tail.rotation.y = 0.28 * Math.sin(elapsed * 1.35 + 0.4) + 0.09 * Math.sin(elapsed * 2.9);
    this.tail.rotation.x = 0.08 + 0.05 * Math.sin(elapsed * 1.1);
    this.tail.rotation.z = 0.06 * Math.sin(elapsed * 1.7);

    // blink
    if (dt > 0) {
      this.blinkTimer -= dt;
      if (this.blinkTimer <= 0) {
        this.blinkPhase = this.blinkDuration;
        this.blinkTimer = 2.8 + Math.random() * 4.2;
      }
    }
    if (this.blinkPhase > 0) {
      this.blinkPhase = Math.max(0, this.blinkPhase - dt);
      var bt = 1 - this.blinkPhase / this.blinkDuration;
      var bang = Math.sin(Math.PI * bt) * Math.PI * 0.5;
      for (var bl = 0; bl < this.eyelids.length; bl++) this.eyelids[bl].rotation.x = bang;
    } else {
      for (var bl2 = 0; bl2 < this.eyelids.length; bl2++) this.eyelids[bl2].rotation.x = 0;
    }

    // ears flick occasionally
    for (var e = 0; e < this.ears.length; e++) {
      var ear = this.ears[e];
      var dir = e === 0 ? -1 : 1;
      var tw = Math.max(0, Math.sin(elapsed * 0.9 + e * 2.3) - 0.82) / 0.18;
      ear.rotation.z = -dir * (0.95 + 0.10 * tw);
      ear.rotation.y = dir * (0.45 - 0.12 * tw);
    }

    for (var l = 0; l < this.legs.length; l++) {
      this.legs[l].animate(this.phase, elapsed);
    }
  };

  Giraffe.prototype.getSpeed = function () {
    return this.stride / (0.64 * this.cycle);
  };

  window.Giraffe = Giraffe;
})();