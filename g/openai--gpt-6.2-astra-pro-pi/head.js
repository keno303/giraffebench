/* Skull geometry follows the poll, brow, jaw and lips of the reference animal.
   The photographed hide is projected from both flanks; all features have real depth. See CREDITS.txt. */
"use strict";
function makeHead() {
  const head = new THREE.Group(),
    R = rng(84601),
    scale = 0.00137,
    X = (p) => 0.095 + (505 - p) * scale,
    Y = (p) => 0.053 + (310 - p) * scale;
  const skull = [
    [707, 260, 409, 0.018],
    [696, 223, 438, 0.085],
    [669, 201, 462, 0.147],
    [636, 190, 472, 0.175],
    [602, 172, 467, 0.185],
    [570, 169, 467, 0.188],
    [549, 178, 470, 0.181],
    [520, 184, 469, 0.176],
    [498, 173, 470, 0.169],
    [476, 158, 471, 0.164],
    [454, 162, 470, 0.149],
    [426, 191, 468, 0.145],
    [399, 222, 465, 0.137],
    [369, 253, 461, 0.128],
    [335, 277, 458, 0.12],
    [298, 297, 454, 0.113],
    [271, 312, 451, 0.105],
    [249, 324, 451, 0.096],
    [222, 337, 463, 0.097],
    [199, 348, 474, 0.109],
    [173, 355, 476, 0.116],
    [151, 366, 469, 0.109],
    [137, 380, 457, 0.102],
    [121, 400, 461, 0.083],
    [109, 421, 463, 0.061],
    [103, 436, 461, 0.043],
    [101, 447, 456, 0.019],
    [101, 451, 453, 0.004],
  ];
  const gauss = (x, s) => Math.exp((-x * x) / (2 * s * s));
  function skullPoint(r, t) {
    let c = Math.cos(t),
      s = Math.sin(t),
      px = r[0],
      py = (r[1] + r[2] + (r[1] - r[2]) * c) * 0.5;
    let relief =
      0.023 * gauss(px - 508, 48) * gauss(py - 280, 15) +
      0.027 * gauss(px - 506, 40) * gauss(py - 309, 23) +
      0.019 * gauss(px - 549, 59) * gauss(py - 394, 35) -
      0.013 * gauss(px - 384, 61) * gauss(py - 384, 38) +
      0.018 * gauss(px - 187, 37) * gauss(py - 368, 19) -
      0.009 * gauss(px - 178, 19) * gauss(py - 379, 8);
    return [
      X(px),
      Y(py),
      Math.sign(s) * (r[3] * Math.pow(Math.abs(s), 0.86) + relief * Math.abs(s)),
    ];
  }
  let g = surface(skull, skullPoint, 114, 84),
    p = g.attributes.position,
    uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    let px = 505 - (p.getX(i) - 0.095) / scale,
      py = 310 - (p.getY(i) - 0.053) / scale;
    uv.setXY(i, (px - 90) / 630, 1 - (py - 140) / 355);
  }
  let face = material(0xffffff, 0.91);
  face.map = atlasTexture("face");
  let blink = { value: 0 };
  face.onBeforeCompile = (s) => {
    s.uniforms.faceFront = { value: atlasTexture("frontal") };
    s.uniforms.closeLid = blink;
    s.vertexShader =
      "varying vec3 vSkullP;varying float vFrontal;\n" +
      s.vertexShader.replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\nvSkullP=position;vFrontal=1.-smoothstep(.29,.81,abs(normal.z));",
      );
    s.fragmentShader =
      "uniform sampler2D faceFront;uniform float closeLid;varying vec3 vSkullP;varying float vFrontal;\n" +
      s.fragmentShader.replace(
        "#include <map_fragment>",
        `vec2 fc=vMapUv;vec2 px=vec2(fc.x*630.+90.,(1.-fc.y)*355.+140.);float t=clamp((px.x-452.)/96.,0.,1.);float eyeLine=294.+20.*sin(3.14159*t)+4.*t;float region=smoothstep(450.,465.,px.x)*(1.-smoothstep(527.,551.,px.x))*exp(-pow((px.y-eyeLine)/12.,2.));fc.y+=closeLid*.025*region;vec4 texel=texture2D(map,fc);float bridge=smoothstep(.115,.295,vSkullP.x);float sy=386.-590.*(vSkullP.y-.045)+bridge*(40.+41.*smoothstep(.48,.64,vSkullP.x));float sx=284.-vSkullP.z*mix(650.,590.,bridge);vec2 fuv=vec2((sx-105.333)/346.667,1.-(sy-60.)/578.);vec3 forward=texture2D(faceFront,fuv).rgb;float frontMix=vFrontal*smoothstep(-.07,.12,vSkullP.x)*(.4+.6*smoothstep(-.13,.015,vSkullP.y+bridge*.17));texel.rgb=mix(texel.rgb,forward,frontMix);diffuseColor*=texel;`,
      );
  };
  mesh(g, face, head);
  let jawRest = g.attributes.position.array.slice(),
    jawWeight = new Float32Array(p.count);
  for (let i = 0; i < p.count; i++) {
    let py = 310 - (p.getY(i) - 0.053) / scale,
      px = 505 - (p.getX(i) - 0.095) / scale;
    jawWeight[i] = smooth(sat((py - 399) / 61)) * smooth(sat((610 - px) / 290));
  }
  meshWhiskers();
  function meshWhiskers() {
    let pp = [],
      cc = [];
    for (let s of [-1, 1])
      for (let j = 0; j < 61; j++) {
        let px = 125 + R() * 124,
          py = 407 + R() * 23,
          x = X(px),
          y = Y(py),
          z = outerZ(px, py);
        let l = 0.007 + R() * 0.025;
        pp.push(
          x,
          y,
          s * z,
          x + 0.001,
          y + 0.0014,
          s * (z - 0.0004),
          x + 0.01 + l * 0.4,
          y - 0.006 - l * 0.2,
          s * (z + l),
        );
        let c = new THREE.Color(R() > 0.54 ? 0x826540 : 0xb79a76);
        for (let k = 0; k < 3; k++) cc.push(c.r, c.g, c.b);
      }
    let h = new THREE.BufferGeometry();
    h.setAttribute("position", new THREE.Float32BufferAttribute(pp, 3));
    h.setAttribute("color", new THREE.Float32BufferAttribute(cc, 3));
    h.computeVertexNormals();
    mesh(h, new THREE.MeshLambertMaterial({ side: THREE.DoubleSide, vertexColors: true }), head);
  }
  function outerZ(px, py) {
    let u = 0;
    for (let it = 0; it < 18; it++) {
      let step = 0.5 ** (it + 1);
      if (spline(skull, u + step)[0] > px) u += step;
    }
    let r = spline(skull, u),
      c = clamp((2 * py - r[1] - r[2]) / (r[1] - r[2]), -0.999, 0.999);
    return skullPoint(r, Math.acos(c))[2];
  }
  const lashes = material(0x3c2e23),
    glint = new THREE.MeshBasicMaterial({ color: 0xd3c4aa }),
    iris = material(0x38251b, 0.17);
  let pupils = [];
  for (let s of [-1, 1]) {
    let z = outerZ(504, 313);
    let e = new THREE.Group();
    e.position.set(X(504), Y(313), s * z);
    head.add(e);
    pupils.push(e);
    oval(e, iris, 0, 0, s * 0.001, 0.021, 0.008, 0.004, 0.01);
    oval(e, glint, -0.005, 0.003, s * 0.0048, 0.0023, 0.0014, 0.0007);
    for (let k = 0; k < 27; k++) {
      let px = 464 + R() * 75,
        t = (px - 452) / 96,
        py = 291 + 14 * Math.sin(t * Math.PI) + 6 * t,
        z = outerZ(px, py);
      let x = X(px),
        y = Y(py),
        l = 0.008 + 0.009 * R();
      stroke(
        head,
        lashes,
        [
          [x, y, s * (z - 0.0006)],
          [x - 0.001, y + 0.002, s * (z + 0.006)],
          [x - 0.004, y - 0.002, s * (z + l)],
        ],
        0.00071,
        3,
      );
    }
  }
  // Ossicones are fur-covered bone, not antlers. Slight backward cant and asymmetric apices.
  let vel = material(0xffffff);
  vel.map = atlasTexture("velvet");
  vel.side = THREE.DoubleSide;
  for (let s of [-1, 1]) {
    let hornRows = [
      [555, 224, 96],
      [566, 201, 94],
      [583, 181, 85],
      [596, 159, 74],
      [611, 135, 75],
      [628, 110, 81],
      [642, 88, 74],
      [651, 72, 58],
      [652, 61, 38],
      [654, 55, 12],
      [654, 54, 2],
    ];
    let gg = surface(
      hornRows,
      (r, t, u) => [
        X(r[0]) + Math.cos(t) * r[2] * scale * 0.5,
        Y(r[1]) + (s > 0 ? 0 : 0.008 * u),
        s * (0.094 + 0.035 * u) + Math.sin(t) * r[2] * scale * 0.48,
      ],
      46,
      32,
    );
    let a = gg.attributes.position,
      uv = gg.attributes.uv;
    for (let i = 0; i < a.count; i++) {
      let t = ((i % 32) * TAU) / 32;
      let py = 310 - (a.getY(i) - 0.053) / scale;
      uv.setXY(i, 0.5 - 0.48 * Math.cos(t), 1 - clamp((py - 55) / 159, 0, 0.999));
    }
    let hornMat = vel.clone();
    hornMat.onBeforeCompile = (sh) => {
      sh.uniforms.crown = { value: atlasTexture("frontal") };
      sh.vertexShader =
        "varying vec3 shaft;varying float direct;\n" +
        sh.vertexShader.replace(
          "#include <begin_vertex>",
          "#include <begin_vertex>\nshaft=position;direct=smoothstep(.37,.84,abs(normal.x));",
        );
      sh.fragmentShader = sh.fragmentShader
        .replace(
          "void main() {",
          "uniform sampler2D crown;varying vec3 shaft;varying float direct;void main(){",
        )
        .replace(
          "#include <map_fragment>",
          `float sy=320.-(shaft.y-.20)*1082.;float sx=290.-shaft.z*685.;vec3 frontHair=texture2D(crown,vec2((sx-105.333)/346.667,1.-(sy-60.)/578.)).rgb;diffuseColor.rgb*=mix(texture2D(map,vMapUv).rgb,frontHair,direct);`,
        );
    };
    mesh(gg, hornMat, head);
  }
  // The ears have a bowl, tragus, rolled rim and a fine lining of pale hair.
  let ears = [];
  const pinnaTex = atlasTexture("pinna");
  const earMat = material(0xffffff);
  earMat.side = THREE.DoubleSide;
  earMat.vertexColors = true;
  for (let sign of [-1, 1]) {
    let ear = new THREE.Group();
    head.add(ear);
    ear.position.set(X(642), Y(274), sign * 0.143);
    ears.push(ear);
    let pos = [],
      color = [],
      ix = [],
      euv = [],
      faceMix = [],
      N = 37,
      M = 52;
    function point(u, t) {
      let v = Math.cos(t),
        b = Math.sin(t),
        w = Math.pow(Math.max(0.00001, Math.sin(Math.PI * u)), 0.78) * (0.086 + 0.046 * u);
      let z = 0.317 * u - 0.018 * v * Math.sin(Math.PI * u),
        y = 0.183 * u + w * v - 0.025 * u * u;
      let x =
        -0.132 * u +
        0.043 * v * v * Math.sin(Math.PI * u) +
        (b > 0 ? 0.012 * b : -0.065 * Math.abs(b)) * Math.sin(Math.PI * u) +
        0.018 * Math.sin(u * Math.PI * 2);
      return [x, y, sign * z];
    }
    for (let j = 0; j <= N; j++) {
      let u = j / N;
      for (let k = 0; k < M; k++) {
        let t = (k / M) * TAU,
          v = Math.cos(t),
          b = Math.sin(t);
        pos.push(...point(u, t));
        euv.push(u, (1 - v) * 0.5);
        faceMix.push(smooth(sat((b + 0.03) * 4.9)));
        let shade = 0.95 + 0.043 * Math.sin(u * 55 + v * 9) + 0.028 * R();
        let outer = new THREE.Color(0xc0a887),
          inner = new THREE.Color(0x715f4f);
        let hollow = Math.exp(-((u - 0.33) ** 2 / 0.034 + (v + 0.16) ** 2 / 0.47));
        inner.lerp(new THREE.Color(0x403d38), hollow);
        inner.lerp(new THREE.Color(0xe5d9bd), smooth(sat((Math.abs(v) - 0.48) * 1.87)) + 0.17 * u);
        let c = b > 0 ? inner : outer.clone().multiplyScalar(0.88 + 0.14 * u + 0.05 * v);
        c.multiplyScalar(shade);
        color.push(c.r, c.g, c.b);
      }
    }
    for (let j = 0; j < N; j++)
      for (let k = 0; k < M; k++) {
        let a = j * M + k,
          b = j * M + ((k + 1) % M);
        ix.push(a, b, a + M, b, b + M, a + M);
      }
    let eg = new THREE.BufferGeometry();
    eg.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    eg.setAttribute("color", new THREE.Float32BufferAttribute(color, 3));
    eg.setAttribute("uv", new THREE.Float32BufferAttribute(euv, 2));
    eg.setAttribute("inside", new THREE.Float32BufferAttribute(faceMix, 1));
    eg.setIndex(ix);
    eg.computeVertexNormals();
    let pinnaMat = earMat.clone();
    pinnaMat.map = pinnaTex;
    pinnaMat.onBeforeCompile = (sh) => {
      sh.vertexShader =
        "attribute float inside;varying float vInside;\n" +
        sh.vertexShader.replace(
          "#include <begin_vertex>",
          "#include <begin_vertex>\nvInside=inside;",
        );
      sh.fragmentShader =
        "varying float vInside;\n" +
        sh.fragmentShader
          .replace("#include <map_fragment>", "vec3 lining=texture2D(map,vMapUv).rgb;")
          .replace(
            "#include <color_fragment>",
            "#include <color_fragment>\ndiffuseColor.rgb=mix(diffuseColor.rgb,lining,vInside*.94);",
          );
    };
    mesh(eg, pinnaMat, ear);
    let hp = [],
      hc = [];
    for (let j = 0; j < 840; j++) {
      let u = Math.pow(R(), 0.91),
        t = R() * Math.PI,
        [x, y, z] = point(u, t),
        l = 0.0015 + R() * 0.008,
        w = 0.00032 + 0.00042 * R();
      hp.push(
        x + 0.001,
        y - w,
        z,
        x + 0.002,
        y + w,
        z,
        x + 0.002 + l * 0.55,
        y + 0.004 + l * 0.6,
        z + l * sign,
      );
      let cc = new THREE.Color().setHSL(
        0.087,
        0.13 + R() * 0.1,
        0.39 + 0.36 * R(),
        THREE.SRGBColorSpace,
      );
      for (let k = 0; k < 3; k++) hc.push(cc.r, cc.g, cc.b);
    }
    let hg = new THREE.BufferGeometry();
    hg.setAttribute("position", new THREE.Float32BufferAttribute(hp, 3));
    hg.setAttribute("color", new THREE.Float32BufferAttribute(hc, 3));
    hg.computeVertexNormals();
    mesh(hg, earMat, ear);
  }
  function update(t, phaseAngle) {
    let b = Math.pow(Math.max(0, Math.cos(t * 1.02 + 1)), 420);
    blink.value = b;
    let chew = 0.5 + 0.5 * Math.sin(3.8 * t + 0.18 * Math.sin(t * 0.63));
    for (let i = 0; i < jawWeight.length; i++) {
      let j = i * 3,
        w = jawWeight[i];
      p.array[j + 1] = jawRest[j + 1] - 0.0085 * w * chew;
      p.array[j + 2] = jawRest[j + 2] + 0.004 * w * Math.sin(3.8 * t);
    }
    g.attributes.position.needsUpdate = true;
    pupils.forEach((e) => (e.scale.y = 1 - 0.95 * b));
    ears.forEach((e, i) => {
      e.rotation.x =
        0.062 * Math.sin(phaseAngle + i * 1.91) +
        0.18 * Math.pow(Math.max(0, Math.cos(1.26 * t + i * 2.7)), 21);
      e.rotation.y = 0.105 * Math.sin(0.82 * t + i * 1.69);
    });
  }
  return { head, update };
}
