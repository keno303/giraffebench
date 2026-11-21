/* An anatomical loft rig. The coat is evaluated in bind space, so its markings
   stay attached to the animal through every joint of the stride. */
window.makeGiraffe = function () {
  const T = THREE,
    V = (x = 0, y = 0, z = 0) => new T.Vector3(x, y, z),
    PI = Math.PI,
    TAU = PI * 2;
  const root = new T.Group(),
    body = new T.Group(),
    head = new T.Group();
  root.add(body);
  body.add(head);
  const mat = (c, r = 0.83) =>
    new T.MeshStandardMaterial({ color: c, roughness: r });
  const sand = mat(0xb9946d),
    toe = mat(0x534b40),
    black = mat(0x30241d);
  function photo(source, color = 0xffffff) {
    let m = mat(color),
      map = new T.TextureLoader().load(source);
    map.colorSpace = T.SRGBColorSpace;
    map.anisotropy = 4;
    m.map = map;
    m.bumpMap = map;
    m.bumpScale = 0.0014;
    return m;
  }
  const face = photo(FACE_HIDE, 0xfff6e3),
    hornHide = photo(HORN_HIDE),
    earHide = photo(EAR_HIDE, 0xffedce);
  // Close the lid along the photographed orbital rim, keeping both corners fixed.
  const eyelid = { value: 0 };
  face.onBeforeCompile = (shader) => {
    shader.uniforms.lid = eyelid;
    shader.fragmentShader =
      "uniform float lid;\n" +
      shader.fragmentShader.replace(
        "#include <map_fragment>",
        `vec2 fp=vec2(vMapUv.x*1024.,(1.-vMapUv.y)*440.);float u=clamp((fp.x-274.)/97.,0.,1.);float aperture=37.*pow(max(0.,sin(u*3.14159265)),.8);float mid=164.-.4*(fp.x-279.)+3.*sin(u*3.14159265);float top=mid-.36*aperture;float low=top+aperture;float moved=top+.97*aperture*lid;float yy=fp.y;if(fp.y>top-24.&&fp.y<low&&aperture>.01){if(fp.y<moved)yy=top-24.+24.*(fp.y-top+24.)/(moved-top+24.);else yy=top+aperture*(fp.y-moved)/max(.001,low-moved);}diffuseColor*=texture2D(map,vec2(vMapUv.x,1.-yy/440.));`,
      );
  };
  function mesh(g, m, parent) {
    const o = new T.Mesh(g, m);
    o.castShadow = true;
    o.receiveShadow = true;
    parent.add(o);
    return o;
  }
  // [x,y,z, radius in the sagittal plane, transverse radius], tail to nose.
  function loft(parent, rows, material, subs = 4, sides = 30) {
    let n = (rows.length - 1) * subs + 1;
    const g = new T.BufferGeometry(),
      pos = new Float32Array(n * sides * 3),
      idx = [];
    for (let i = 0; i < n - 1; i++)
      for (let j = 0; j < sides; j++) {
        let a = i * sides + j,
          b = i * sides + ((j + 1) % sides);
        idx.push(a, b, a + sides, b, b + sides, a + sides);
      }
    for (let j = 1; j < sides - 1; j++) {
      idx.push(
        0,
        j + 1,
        j,
        (n - 1) * sides,
        (n - 1) * sides + j,
        (n - 1) * sides + j + 1,
      );
    }
    g.setIndex(idx);
    g.setAttribute("position", new T.BufferAttribute(pos, 3));
    let angles = Array.from({ length: sides }, (_, i) => [
      Math.cos((TAU * i) / sides),
      Math.sin((TAU * i) / sides),
    ]);
    function fill(rows) {
      let pts = [];
      for (let i = 0; i < n; i++) {
        let k = Math.min(rows.length - 2, Math.floor(i / subs)),
          u = i / subs - k,
          A = rows[Math.max(0, k - 1)],
          B = rows[k],
          C = rows[k + 1],
          D = rows[Math.min(k + 2, rows.length - 1)];
        pts.push(
          B.map(
            (b, j) =>
              b +
              0.5 *
                u *
                (C[j] -
                  A[j] +
                  u *
                    (2 * A[j] -
                      5 * b +
                      4 * C[j] -
                      D[j] +
                      u * (3 * (b - C[j]) + D[j] - A[j]))),
          ),
        );
      }
      let p = 0;
      for (let i = 0; i < n; i++) {
        let a = pts[Math.max(0, i - 1)],
          b = pts[Math.min(n - 1, i + 1)],
          dx = b[0] - a[0],
          dy = b[1] - a[1],
          h = Math.hypot(dx, dy) || 1;
        for (let [c, s] of angles) {
          let v = pts[i];
          pos[p++] = v[0] - (dy / h) * c * Math.max(0.001, v[3]);
          pos[p++] = v[1] + (dx / h) * c * Math.max(0.001, v[3]);
          pos[p++] = v[2] + s * Math.max(0.001, v[4]);
        }
      }
      g.attributes.position.needsUpdate = true;
      g.computeVertexNormals();
    }
    fill(rows);
    let uv = [];
    for (let i = 0; i < n; i++)
      for (let j = 0; j < sides; j++)
        uv.push(i / (n - 1), 0.5 + 0.5 * angles[j][0]);
    g.setAttribute("uv", new T.Float32BufferAttribute(uv, 2));
    let o = mesh(g, material, parent);
    o.frustumCulled = false;
    fill.mesh = o;
    return fill;
  }
  const trunk = [
    [-1.57, 2.85, 0, 0.035, 0.025],
    [-1.51, 2.86, 0, 0.3, 0.25],
    [-1.34, 2.84, 0, 0.49, 0.39],
    [-1.08, 2.84, 0, 0.565, 0.445],
    [-0.68, 2.85, 0, 0.542, 0.471],
    [-0.25, 2.89, 0, 0.625, 0.51],
    [0.12, 2.978, 0, 0.731, 0.515],
    [0.41, 3.13, 0, 0.759, 0.46],
    [0.6, 3.38, 0, 0.6, 0.394],
    [0.78, 3.65, 0, 0.458, 0.315],
    [0.96, 3.96, 0, 0.347, 0.266],
    [1.17, 4.35, 0, 0.278, 0.213],
    [1.38, 4.78, 0, 0.218, 0.174],
    [1.56, 5.14, 0, 0.167, 0.147],
    [1.66, 5.37, 0, 0.146, 0.137],
    [1.71, 5.45, 0, 0.075, 0.09],
  ];
  const controls = [trunk];
  const skull = [
    [1.475, 5.39, 0, 0.045, 0.062],
    [1.53, 5.388, 0, 0.157, 0.15],
    [1.62, 5.385, 0, 0.231, 0.199],
    [1.735, 5.394, 0, 0.254, 0.218],
    [1.84, 5.396, 0, 0.224, 0.187],
    [1.97, 5.382, 0, 0.169, 0.151],
    [2.075, 5.355, 0, 0.126, 0.128],
    [2.165, 5.33, 0, 0.102, 0.116],
    [2.27, 5.31, 0, 0.107, 0.121],
    [2.36, 5.28, 0, 0.097, 0.131],
    [2.426, 5.262, 0, 0.064, 0.111],
    [2.456, 5.259, 0, 0.027, 0.047],
  ];
  let sk = loft(head, skull, face, 6, 48).mesh.geometry,
    sp = sk.attributes.position;
  for (let i = 0; i < sp.count; i++) {
    let x = sp.getX(i),
      y = sp.getY(i),
      z = sp.getZ(i),
      orb = Math.exp(-(((x - 1.78) / 0.092) ** 2 + ((y - 5.46) / 0.056) ** 2));
    sp.setZ(i, z + Math.sign(z) * 0.035 * orb);
  }
  sk.computeVertexNormals();
  for (let side of [-1, 1]) {
    let s = side;
    // Eyelids, nostrils and lips share a continuous photographic surface.
    let lash = [];
    for (let i = 0; i < 12; i++) {
      let x = 1.743 + i * 0.006,
        y = 5.463 + 0.017 * Math.sin((i / 12) * PI);
      lash.push(
        x - 0.0017,
        y,
        s * 0.223,
        x + 0.0017,
        y,
        s * 0.223,
        x - 0.011,
        y + 0.015,
        s * (0.249 + 0.004 * Math.sin(i)),
      );
    }
    let lashes = new T.BufferGeometry();
    lashes.setAttribute("position", new T.Float32BufferAttribute(lash, 3));
    mesh(
      lashes,
      new T.MeshBasicMaterial({ color: 0x2c2019, side: T.DoubleSide }),
      head,
    );
    let h = [
      [1.695, 5.56, s * 0.1, 0.096, 0.09],
      [1.675, 5.641, s * 0.12, 0.086, 0.073],
      [1.643, 5.704, s * 0.137, 0.064, 0.058],
      [1.62, 5.773, s * 0.145, 0.051, 0.049],
      [1.596, 5.823, s * 0.151, 0.053, 0.053],
      [1.583, 5.86, s * 0.155, 0.05, 0.049],
      [1.568, 5.889, s * 0.156, 0.033, 0.031],
      [1.557, 5.906, s * 0.157, 0.004, 0.006],
    ];
    loft(head, h, hornHide, 4, 32);
    let hv = [],
      hc = [];
    for (let i = 0; i < 170; i++) {
      let a = TAU * i * 0.61803399,
        b = Math.sin(i * 94.31) * 0.5 + 0.5,
        rr = 0.047 * Math.sqrt(b),
        x = 1.58 + rr * Math.cos(a),
        y = 5.856 + 0.026 * (1 - b),
        z = s * 0.155 + rr * Math.sin(a);
      hv.push(
        x - 0.0019,
        y,
        z,
        x + 0.0019,
        y,
        z,
        x - 0.021 - 0.013 * b,
        y + 0.034 + 0.018 * Math.sin(i * 91.351),
        z + rr * 0.13,
      );
      let c = 0.026 + 0.019 * b;
      for (let k = 0; k < 3; k++) hc.push(c, c * 0.72, c * 0.59);
    }
    let hg = new T.BufferGeometry();
    hg.setAttribute("position", new T.Float32BufferAttribute(hv, 3));
    hg.setAttribute("color", new T.Float32BufferAttribute(hc, 3));
    let hairMat = new T.MeshBasicMaterial({
      vertexColors: true,
      side: T.DoubleSide,
    });
    mesh(hg, hairMat, head);
    // Scooped, leaf-shaped pinnae: convex back, cupped front, rolled border.
    let E = new T.Group();
    head.add(E);
    E.position.set(1.586, 5.49, s * 0.12);
    let pts = [],
      inds = [],
      nr = 34,
      nt = 40;
    for (let i = 0; i <= nr; i++) {
      let u = i / nr,
        w =
          0.12 * Math.pow(Math.sin(PI * u), 0.84) * (0.66 + 0.51 * u) +
          0.012 * (1 - u);
      for (let j = 0; j <= nt; j++) {
        let v = (j / nt) * TAU,
          c = Math.cos(v),
          sn = Math.sin(v),
          sag = Math.sin(PI * u),
          fold = 0.039 * sag * (1 - c * c);
        pts.push(
          -0.31 * u + 0.038 * sag + w * c * 0.56 + 0.017 * sn * sag - fold,
          0.115 * u + 0.059 * sag + w * c * 0.92,
          s * (0.425 * u + 0.051 * sag + 0.015 * sn),
        );
        if (i < nr && j < nt) {
          let a = i * (nt + 1) + j;
          inds.push(a, a + 1, a + nt + 1, a + 1, a + nt + 2, a + nt + 1);
        }
      }
    }
    let eg = new T.BufferGeometry();
    eg.setAttribute("position", new T.Float32BufferAttribute(pts, 3));
    let uv = [];
    for (let i = 0; i <= nr; i++)
      for (let j = 0; j <= nt; j++)
        uv.push(i / nr, 0.5 + 0.5 * Math.cos((TAU * j) / nt));
    eg.setAttribute("uv", new T.Float32BufferAttribute(uv, 2));
    eg.setIndex(inds);
    eg.computeVertexNormals();
    earHide.side = T.DoubleSide;
    mesh(eg, earHide, E);
    E.userData.side = s;
    E.name = "ear";
  }
  // Mane follows the dorsal contour rather than intersecting the neck as a tube.
  const crest = [];
  for (let i = 5; i < trunk.length - 1; i++) {
    let p = trunk[i],
      a = trunk[i - 1],
      b = trunk[i + 1],
      dx = b[0] - a[0],
      dy = b[1] - a[1],
      l = Math.hypot(dx, dy);
    crest.push(V(p[0] - (dy / l) * p[3], p[1] + (dx / l) * p[3], 0));
  }
  const maneCurve = new T.CatmullRomCurve3(crest);
  let maneGrp = new T.Group();
  body.add(maneGrp);
  let mp = [],
    mi = [];
  let mcols = [];
  for (let i = 0; i < 1070; i++) {
    let u = (i + 0.25) / 1070,
      p = maneCurve.getPoint(u),
      t = maneCurve.getTangent(u),
      r = 0.5 + 0.5 * Math.sin(i * 437.421),
      z = Math.sin(i * 5.81) * 0.024,
      h = (0.032 + 0.047 * Math.sin(PI * u) ** 0.48) * (0.64 + 0.55 * r),
      w = 0.005 + 0.004 * r,
      dx = -t.y * h - t.x * h * 0.65,
      dy = t.x * h - t.y * h * 0.65,
      x = p.x + 0.012 * t.y,
      y = p.y - 0.012 * t.x;
    let start = mp.length / 3;
    mp.push(
      x - t.x * w,
      y - t.y * w,
      z,
      x + t.x * w,
      y + t.y * w,
      z,
      x + dx * 0.55 + t.x * w * 0.46,
      y + dy * 0.55 + t.y * w * 0.46,
      z * 1.14,
      x + dx,
      y + dy,
      z * 1.09,
    );
    mi.push(start, start + 1, start + 2, start, start + 2, start + 3);
    let c = 0.027 + 0.041 * r;
    for (let j = 0; j < 4; j++) {
      let f = j > 1 ? 1.37 : 1;
      mcols.push(c * f, c * 0.54 * f, c * 0.28 * f);
    }
  }
  let mg = new T.BufferGeometry();
  mg.setIndex(mi);
  mg.setAttribute("position", new T.Float32BufferAttribute(mp, 3));
  mg.setAttribute("color", new T.Float32BufferAttribute(mcols, 3));
  mg.computeVertexNormals();
  let mm = new T.MeshBasicMaterial({ vertexColors: true, side: T.DoubleSide });
  mesh(mg, mm, maneGrp);
  let maneRest = mp.slice();
  const tailRows = [
    [-1.39, 3.12, 0, 0.085, 0.066],
    [-1.52, 2.99, 0, 0.05, 0.048],
    [-1.59, 2.76, 0, 0.036, 0.034],
    [-1.62, 2.48, 0, 0.03, 0.028],
    [-1.65, 2.22, 0, 0.023, 0.022],
    [-1.68, 2.04, 0, 0.018, 0.017],
  ];
  let tail = loft(body, tailRows, sand, 4, 16),
    tuftRows = [
      [-1.66, 2.13, 0, 0.021, 0.019],
      [-1.69, 2.055, 0, 0.043, 0.038],
      [-1.71, 1.94, 0, 0.06, 0.044],
      [-1.74, 1.83, 0, 0.039, 0.03],
      [-1.79, 1.69, 0, 0.005, 0.004],
    ],
    tuft = loft(body, tuftRows, black, 4, 16);
  const fibers = [],
    fiberColor = [],
    fiberIndex = [];
  for (let i = 0; i < 165; i++) {
    let a = i * 2.39996,
      r = 0.5 + 0.5 * Math.sin(i * 74.355),
      h = 0.33 + r * 0.16,
      start = fibers.length / 3;
    for (let j = 0; j < 5; j++) {
      let u = j / 4,
        b = 0.019 + 0.041 * Math.sin(PI * u) + 0.007 * u,
        x =
          -1.671 -
          0.114 * u +
          0.87 * b * Math.cos(a) +
          0.017 * u * u * Math.sin(i * 8.74),
        y = 2.1 - u * h,
        z = b * Math.sin(a) + 0.023 * u * u * Math.cos(i * 5.3),
        w = 0.0026 * (1.03 - u);
      fibers.push(x - w, y, z, x + w, y, z);
      let c = 0.019 + r * 0.035 + 0.018 * u;
      fiberColor.push(c, c * 0.68, c * 0.46, c, c * 0.68, c * 0.46);
      if (j < 4) {
        let n = start + j * 2;
        fiberIndex.push(n, n + 1, n + 2, n + 1, n + 3, n + 2);
      }
    }
  }
  const fg = new T.BufferGeometry();
  fg.setIndex(fiberIndex);
  fg.setAttribute("position", new T.Float32BufferAttribute(fibers, 3));
  fg.setAttribute("color", new T.Float32BufferAttribute(fiberColor, 3));
  mesh(fg, mm, body).frustumCulled = false;
  const legs = [];
  function getRows(front, s, A, B, K, F, H) {
    let mix = (a, b, t) => a.clone().lerp(b, t),
      out = [];
    const add = (p, r, w) => out.push([p.x, p.y, p.z, r, w]);
    add(A, front ? 0.13 : 0.15, 0.125);
    add(mix(A, B, 0.3), front ? 0.227 : 0.272, front ? 0.174 : 0.195);
    add(mix(A, B, 0.67), front ? 0.192 : 0.224, 0.16);
    add(B, front ? 0.141 : 0.148, 0.114);
    add(mix(B, K, 0.29), front ? 0.111 : 0.125, 0.097);
    add(mix(B, K, 0.77), 0.067, 0.066);
    add(K, front ? 0.09 : 0.099, 0.08);
    add(mix(K, F, 0.15), 0.063, 0.063);
    add(mix(K, F, 0.6), 0.05, 0.053);
    add(mix(K, F, 0.87), 0.055, 0.057);
    add(F, 0.072, 0.069);
    add(mix(F, H, 0.63), 0.058, 0.063);
    add(H, 0.067, 0.066);
    return out;
  }
  for (let front of [false, true])
    for (let s of [-1, 1]) {
      let x = front ? 0.5 : -1.12,
        z = s * (front ? 0.314 : 0.31),
        A = V(x, front ? 3.3 : 3.04, z),
        B = V(front ? 0.39 : -0.855, front ? 2.31 : 2.24, z),
        K = V(front ? 0.53 : -1.24, 1.34, z),
        F = V(x - 0.035, 0.265, z),
        H = V(x + 0.035, 0.124, z),
        part = controls.length,
        hoof = new T.Group();
      root.add(hoof);
      controls.push(getRows(front, s, A, B, K, F, H));
      for (let d of [-1, 1]) {
        let rows = [
          [-0.073, 0.086, d * 0.034, 0.026, 0.027],
          [-0.049, 0.084, d * 0.037, 0.065, 0.034],
          [0.02, 0.078, d * 0.04, 0.065, 0.037],
          [0.093, 0.064, d * 0.042, 0.05, 0.035],
          [0.13, 0.05, d * 0.039, 0.03, 0.03],
          [0.147, 0.043, d * 0.036, 0.014, 0.017],
        ];
        loft(hoof, rows, toe, 3, 16);
      }
      legs.push({ front, s, x, z, A, B, part, hoof });
    }
  const pose = makeSkinRig(root, controls);
  const period = 2.5,
    speed = 0.9,
    duty = 0.63;
  function smooth(x) {
    x = Math.min(1, Math.max(0, x));
    return x * x * (3 - 2 * x);
  }
  function update(t) {
    const u = t / period + 0.46,
      phase = u * TAU,
      w = Math.sin(phase);
    let by = 0.033 * Math.cos(2 * phase + 0.5),
      tilt = 0.014 * Math.sin(2 * phase - 0.4);
    body.position.set(0, by, 0.025 * w);
    body.rotation.set(0.019 * w, 0, tilt);
    body.updateMatrix();
    let blink = t % 7.13;
    eyelid.value =
      blink > 3.02 && blink < 3.28
        ? blink < 3.105
          ? smooth((blink - 3.02) / 0.085)
          : 1 - smooth((blink - 3.105) / 0.175)
        : 0;
    let nod = 0.023 * Math.sin(2 * phase + 0.6),
      sw = 0.022 * Math.sin(phase + 0.4);
    const pivot = V(0.62, 3.49, 0);
    function bend(x, y, z) {
      let k = Math.max(0, Math.min(1, (y - 3.52) / 1.74));
      k = k * k * (3 - 2 * k);
      let a = k * nod,
        dx = x - pivot.x,
        dy = y - pivot.y;
      return [
        pivot.x + Math.cos(a) * dx - Math.sin(a) * dy,
        pivot.y + Math.sin(a) * dx + Math.cos(a) * dy,
        z + k * sw,
      ];
    }
    pose(
      0,
      trunk.map((p) => bend(...p)),
      body.matrix,
    );
    let coord = bend(1.68, 5.45, 0);
    head.rotation.z = nod - 0.016 * Math.sin(2 * phase + 0.9);
    head.rotation.y = 0.037 * Math.sin(phase * 0.5);
    let hp = V(1.68, 5.45, 0).applyEuler(head.rotation);
    head.position.set(...coord).sub(hp);
    head.children.forEach((e) => {
      if (e.name === "ear")
        e.rotation.x =
          0.035 * Math.sin(phase + e.userData.side) +
          e.userData.side *
            0.14 *
            Math.pow(
              Math.max(0, Math.sin(t * 1.8 + e.userData.side * 1.6)),
              16,
            );
    });
    let mp = mg.attributes.position;
    for (let i = 0; i < mp.count; i++)
      mp.setXYZ(
        i,
        ...bend(maneRest[i * 3], maneRest[i * 3 + 1], maneRest[i * 3 + 2]),
      );
    mp.needsUpdate = true;
    let wag = (p) => {
      let k = Math.max(0, (3.14 - p[1]) / 1.39);
      return [
        p[0] - 0.095 * k * Math.sin(phase - 0.6 * k),
        p[1] + 0.04 * k * k * (1 + Math.cos(phase)),
        p[2] +
          k *
            k *
            (0.31 * Math.sin(phase - 0.9 * k) + 0.09 * Math.sin(t * 0.83)),
        p[3],
        p[4],
      ];
    };
    tail(tailRows.map(wag));
    tuft(tuftRows.map(wag));
    let hairs = fg.attributes.position;
    for (let i = 0; i < hairs.count; i++) {
      let x = fibers[3 * i],
        y = fibers[3 * i + 1],
        z = fibers[3 * i + 2],
        k = (3.14 - y) / 1.39;
      hairs.setXYZ(
        i,
        x - 0.095 * k * Math.sin(phase - 0.6 * k),
        y + 0.04 * k * k * (1 + Math.cos(phase)),
        z +
          k *
            k *
            (0.31 * Math.sin(phase - 0.9 * k) + 0.09 * Math.sin(t * 0.83)),
      );
    }
    hairs.needsUpdate = true;
    for (let l of legs) {
      let { front, s, x, z } = l,
        f = (((u + (s > 0 ? 0.5 : 0) - (front ? 0.105 : 0)) % 1) + 1) % 1,
        span = speed * period * duty,
        dx,
        swing = 0,
        lift = 0,
        roll = 0;
      if (f < duty) {
        let stance = f / duty;
        dx = span * (0.5 - stance);
        roll =
          0.085 * (1 - smooth(stance / 0.14)) -
          0.23 * smooth((stance - 0.76) / 0.24);
      } else {
        let k = (f - duty) / (1 - duty);
        swing = Math.sin(PI * k);
        dx =
          span * (-0.5 + k - Math.sin(TAU * k) / TAU) -
          (speed * period * (1 - duty) * Math.sin(TAU * k)) / TAU;
        lift = (front ? 0.3 : 0.265) * swing * swing;
        roll = -0.23 + 0.315 * smooth(k) - 0.36 * Math.sin(TAU * k) * swing;
      }
      let A = l.A.clone().applyMatrix4(body.matrix),
        B = l.B.clone().applyMatrix4(body.matrix);
      B.x += dx * 0.28 + (front ? -0.052 : 0.095) * swing;
      B.y += 0.065 * swing;
      let fx = x + dx + (front ? 0.055 : 0.03),
        pivotX = roll < 0 ? 0.105 : -0.048,
        ox = fx + pivotX * (1 - Math.cos(roll)),
        oy = lift - 0.01 - pivotX * Math.sin(roll),
        F = V(fx - 0.052 - 0.055 * swing, 0.255 + lift + 0.04 * swing, z),
        H = V(ox - 0.13 * Math.sin(roll), oy + 0.13 * Math.cos(roll), z);
      // Solve elbow–carpus–fetlock (or stifle–hock–fetlock) in the stride plane.
      let a = front ? 1.032 : 1.03,
        b = front ? 1.019 : 1.014,
        bx = F.x - B.x;
      B.y = Math.min(B.y, F.y + Math.sqrt((a + b - 0.001) ** 2 - bx * bx));
      let by = F.y - B.y,
        d = Math.hypot(bx, by),
        along = (a * a - b * b + d * d) / (2 * d),
        height = Math.sqrt(Math.max(0.00012, a * a - along * along)),
        sign = front ? 1 : -1;
      let K = V(
        B.x + (bx * along) / d - (sign * by * height) / d,
        B.y + (by * along) / d + (sign * bx * height) / d,
        (B.z + F.z) / 2 + s * 0.036 * swing,
      );
      pose(l.part, getRows(front, s, A, B, K, F, H));
      l.hoof.position.set(ox, oy, z);
      l.hoof.rotation.z = roll;
    }
  }
  update(0);
  return { root, update, speed, period, head, hooves: legs.map((l) => l.hoof) };
};
