/* A continuous voxel-fused hide is bound to the procedural torso & leg centre lines.
   The coat samples anatomical REST coordinates, so the markings never slide over the animal. */
"use strict";
const pelage = `varying vec3 vSkin; varying float vPale; varying float vOccl;
vec3 h33(vec3 p){p=vec3(dot(p,vec3(127.1,311.7,74.7)),dot(p,vec3(269.5,183.3,246.1)),dot(p,vec3(113.5,271.9,124.6)));return fract(sin(mod(p,6.283185))*4375.5453);}
float hf(vec3 p){p=fract(p*.31831+vec3(.11,.23,.41));p*=17.;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
float fuzz(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(mix(hf(i),hf(i+vec3(1,0,0)),f.x),mix(hf(i+vec3(0,1,0)),hf(i+vec3(1,1,0)),f.x),f.y),mix(mix(hf(i+vec3(0,0,1)),hf(i+vec3(1,0,1)),f.x),mix(hf(i+vec3(0,1,1)),hf(i+vec3(1,1,1)),f.x),f.y),f.z);}
vec3 furColor(vec3 p,float pale){vec3 q=p*vec3(4.10,3.88,4.02)+vec3(2.1,4.3,5.8);q+=.42*vec3(fuzz(q*.91),fuzz(q*.95+13.),fuzz(q+29.))+.115*vec3(fuzz(q*3.3+.2),fuzz(q*3.1+43.),fuzz(q*3.4+12.));vec3 id=floor(q),f=fract(q);float a=9.,b=9.;vec3 best=vec3(0),second=vec3(0),cell=vec3(0);
for(int i=-1;i<=1;i++)for(int j=-1;j<=1;j++)for(int k=-1;k<=1;k++){vec3 o=vec3(float(i),float(j),float(k));vec3 v=o+.13+.74*h33(id+o);float d=dot(v-f,v-f);if(d<a){b=a;second=best;a=d;best=v;cell=id+o;}else if(d<b){b=d;second=v;}}
float edge=(b-a)/max(.02,2.*length(best-second));float grain=fuzz(p*vec3(152.,93.,188.));float hair=fuzz(vec3(p.x+p.y*.45,p.y,p.z)*vec3(402.,79.,401.));float width=.027+.020*fuzz(q*1.14)+.013*grain;float spot=smoothstep(width-.010,width+.009+min(fwidth(edge),.026),edge);float f1=fuzz(q*1.5+.32),shade=.46*hf(cell)+.25*f1+.17*fuzz(q*4.)+.12*grain;vec3 dark=mix(vec3(.096,.037,.018),vec3(.31,.125,.043),shade);dark*=.87+.21*f1+.14*grain;dark=mix(dark,vec3(.47,.269,.121),.17*exp(-max(0.,edge-width)*19.));float flour=smoothstep(.70,.86,fuzz(q*5.3))*.14;dark+=vec3(.21,.14,.075)*flour;vec3 cream=mix(vec3(.58,.456,.303),vec3(.84,.728,.554),.25+.42*f1+.30*grain);vec3 color=mix(cream,dark,spot);color=mix(color,mix(vec3(.52,.37,.224),cream,.67),pale);color*=.882+.089*grain+.125*hair;return color;}`;
let fur = material(0xffffff, 0.96);
fur.onBeforeCompile = (s) => {
  s.vertexShader =
    "attribute vec3 skinSite;attribute float pale;attribute float ao;varying vec3 vSkin;varying float vPale;varying float vOccl;\n" +
    s.vertexShader.replace(
      "#include <begin_vertex>",
      "#include <begin_vertex>\nvSkin=skinSite;vPale=pale;vOccl=ao;",
    );
  s.fragmentShader = s.fragmentShader
    .replace("void main() {", pelage + "\nvoid main(){")
    .replace(
      "#include <color_fragment>",
      "#include <color_fragment>\ndiffuseColor.rgb*=furColor(vSkin,vPale)*vOccl;",
    );
};
function attributes(g, fn) {
  let p = g.attributes.position,
    sites = [],
    f = [],
    a = [];
  for (let i = 0; i < p.count; i++) {
    let o = fn(p.getX(i), p.getY(i), p.getZ(i));
    sites.push(...o.slice(0, 3));
    f.push(sat(o[3] || 0));
    a.push(o[4] === undefined ? 1 : o[4]);
  }
  g.setAttribute("skinSite", new THREE.Float32BufferAttribute(sites, 3));
  g.setAttribute("pale", new THREE.Float32BufferAttribute(f, 1));
  g.setAttribute("ao", new THREE.Float32BufferAttribute(a, 1));
  return g;
}
function unpack(s, T) {
  let raw = atob(s),
    b = new Uint8Array(raw.length);
  for (let i = 0; i < b.length; i++) b[i] = raw.charCodeAt(i);
  return new T(b.buffer);
}
function makeGiraffe() {
  let root = new THREE.Group(),
    upper = new THREE.Group();
  root.add(upper);
  let R = rng(37828);
  const { head, update: updateFace } = makeHead();
  upper.add(head);
  const skinGeometry = new THREE.BufferGeometry(),
    coords = Float32Array.from(unpack(ATLAS_SKIN[0], Int16Array), (n) => n / 5000);
  skinGeometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(coords, 3).setUsage(THREE.DynamicDrawUsage),
  );
  skinGeometry.setIndex(new THREE.BufferAttribute(unpack(ATLAS_SKIN[1], Uint16Array), 1));
  skinGeometry.computeVertexNormals();
  skinGeometry.attributes.normal.setUsage(THREE.DynamicDrawUsage);
  attributes(skinGeometry, (x, y, z) => {
    let leg = smooth(sat((2.01 - y) * 0.76)),
      f = 1 + 2.9 * leg,
      home = x < -0.22 ? -0.85 : 0.52;
    return [
      home + (x - home) * f,
      y - 1.4 * Math.max(0, 1.99 - y) ** 1.91,
      Math.sign(z) * 0.26 + (z - Math.sign(z) * 0.26) * f,
      0.97 * smooth(sat((1.2 - y) * 1.36)) +
        0.21 * smooth(sat((2.34 - y) * 3.4)) * smooth(sat((0.18 - Math.abs(z)) * 8)),
      1 - 0.2 * smooth(sat((2.34 - y) * 3.1)) * smooth(sat((0.3 - Math.abs(z)) * 5.2)),
    ];
  });
  skinGeometry.setAttribute(
    "uv",
    new THREE.BufferAttribute(unpack(ATLAS_UV, Uint16Array), 2, true),
  );
  skinGeometry.setAttribute("neutral", new THREE.BufferAttribute(coords, 3));
  let bodyMat = material(0xffffff, 0.95);
  bodyMat.map = atlasTexture("hide");
  bodyMat.onBeforeCompile = (sh) => {
    sh.vertexShader =
      "attribute float ao;attribute vec3 neutral;varying vec3 restP;varying float vOccl;\n" +
      sh.vertexShader.replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\nvOccl=ao;restP=neutral;",
      );
    sh.fragmentShader = sh.fragmentShader
      .replace(
        "void main() {",
        pelage.split("vec3 furColor")[0] + "\nvarying vec3 restP;void main(){",
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>\nfloat silk=fuzz(restP*vec3(287.,84.,324.));diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.49,.348,.219),.57*(1.-smoothstep(.22,.68,restP.y)));diffuseColor.rgb*=vOccl*(.952+.083*silk+.016*fuzz(restP*142.));`,
      );
  };
  mesh(skinGeometry, bodyMat, root);
  // Infer each vertex's longitudinal binding on a neutral, straight-legged animal.
  const segments = 168;
  let legs = [];
  let keratin = material(0x756556, 0.74);
  keratin.side = THREE.DoubleSide;
  keratin.vertexColors = true;
  keratin.onBeforeCompile = (sh) => {
    sh.vertexShader =
      "varying vec3 keratinSite;\n" +
      sh.vertexShader.replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\nkeratinSite=position;",
      );
    sh.fragmentShader = sh.fragmentShader
      .replace(
        "void main() {",
        pelage.split("vec3 furColor")[0] + "\nvarying vec3 keratinSite;void main(){",
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>\nfloat band=fuzz(keratinSite*vec3(102.,360.,73.));float groove=fuzz(keratinSite*vec3(314.,32.,293.));float dust=1.-smoothstep(-.104,-.077,keratinSite.y+.009*band);diffuseColor.rgb=mix(diffuseColor.rgb*(.83+.17*band+.13*groove),vec3(.25,.172,.108),.36*dust);`,
      );
  };
  const horn = material(0x786751);
  for (let front of [false, true])
    for (let s of [-1, 1]) {
      let foot = new THREE.Group();
      root.add(foot);
      for (let half of [-1, 1]) {
        let gg = surface(
          [
            [-0.012, -0.105, 0.081, 0.03],
            [0.005, -0.103, 0.099, 0.037],
            [0.013, -0.091, 0.1, 0.04],
            [0.001, -0.056, 0.094, 0.039],
            [-0.012, -0.01, 0.078, 0.032],
            [-0.019, 0.027, 0.06, 0.026],
            [-0.017, 0.037, 0.048, 0.023],
          ],
          (r, t) => [
            r[0] + r[2] * Math.cos(t),
            r[1],
            half * (0.032 + 0.006 * (1 + Math.cos(t))) + r[3] * Math.sin(t),
          ],
          20,
          28,
        );
        let cs = [],
          p = gg.attributes.position;
        for (let i = 0; i < p.count; i++) {
          let y = p.getY(i),
            g =
              0.78 +
              0.19 * smooth(sat((y + 0.11) / 0.15)) +
              0.09 * Math.sin((((i % 28) * TAU) / 28) * 11) +
              0.04 * R();
          cs.push(g, g * 0.97, g * 0.92);
        }
        gg.setAttribute("color", new THREE.Float32BufferAttribute(cs, 3));
        mesh(gg, keratin, foot);
      }
      oval(foot, horn, -0.076, 0.081, 0.04, 0.018, 0.027, 0.014, -0.37);
      oval(foot, horn, -0.076, 0.081, -0.04, 0.018, 0.027, 0.014, -0.37);
      let restRows = legPose(front, s, 0, 0, true).rows,
        ref = Array.from({ length: segments + 1 }, (_, i) => spline(restRows, i / segments));
      legs.push({
        s,
        front,
        foot,
        ref,
        pose: ref.map((r) => r.slice()),
        trans: new Float32Array((segments + 1) * 6),
      });
    }
  let count = coords.length / 3,
    bindings = new Uint8Array(count),
    ratio = new Float32Array(count),
    which = new Uint8Array(count),
    weight = new Float32Array(count),
    nodding = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    let x = coords[i * 3],
      y = coords[i * 3 + 1],
      z = coords[i * 3 + 2];
    nodding[i] = smooth(sat((y - 2.95) / 1.62));
    let li = (x > -0.17 ? 2 : 0) + (z > 0 ? 1 : 0),
      ref = legs[li].ref,
      j = 0;
    while (j < segments - 1 && ref[j + 1][1] > y) j++;
    let r = ref[j],
      r1 = ref[j + 1];
    ratio[i] = sat((r[1] - y) / Math.max(0.0001, r[1] - r1[1]));
    let w =
      smooth(sat((3.06 - y) / 1.12)) *
      smooth(sat((0.48 - Math.abs(x - r[0])) / 0.23)) *
      (0.27 + 0.73 * smooth(sat((Math.abs(z) - 0.075) / 0.25)));
    let inner = smooth(sat((2.05 - y) / 0.26));
    w = mix(w, 1, inner);
    weight[i] = w;
    which[i] = li;
    bindings[i] = j;
  }
  // A brush-like mane: a shaded undercoat and thousands of individually tapered guard hairs.
  const maneCurve = new THREE.CatmullRomCurve3(outline.slice(6, 19).map((r) => V(r[0], r[1], 0)));
  let hairs = [],
    hc = [];
  let maneMat = material(0xffffff, 0.97);
  maneMat.vertexColors = true;
  maneMat.side = THREE.DoubleSide;
  for (let j = 0; j < 6400; j++) {
    let u = R(),
      p = maneCurve.getPoint(u),
      t = maneCurve.getTangent(u),
      factor = Math.min(1, u * 11 + 0.03, (1 - u) * 11 + 0.08),
      h = (0.045 + 0.028 * R()) * factor,
      z = (R() - 0.5) * 0.04,
      w = 0.001 + 0.0039 * R(),
      lean = 0.014 + 0.018 * R();
    hairs.push(
      p.x - w,
      p.y - 0.013,
      z,
      p.x + w,
      p.y - 0.006,
      z + 0.002,
      p.x - h * t.y - lean,
      p.y + h * t.x + 0.006,
      z + (R() - 0.5) * 0.007,
    );
    let c = new THREE.Color().setHSL(
      0.06 + R() * 0.029,
      0.27 + R() * 0.15,
      0.141 + R() * 0.156,
      THREE.SRGBColorSpace,
    );
    for (let k = 0; k < 3; k++)
      hc.push(c.r * (k === 2 ? 1.29 : 1), c.g * (k === 2 ? 1.25 : 1), c.b * (k === 2 ? 1.22 : 1));
  }
  let maneG = new THREE.BufferGeometry();
  maneG.setAttribute("position", new THREE.Float32BufferAttribute(hairs, 3));
  maneG.setAttribute("color", new THREE.Float32BufferAttribute(hc, 3));
  maneG.computeVertexNormals();
  mesh(maneG, maneMat, upper);
  let maneRest = maneG.attributes.position.array.slice();
  // Tail switch is carried by a flexing shaft; its lower fibres lag the turn.
  let tail = new THREE.Group(),
    tassel = new THREE.Group();
  upper.add(tail);
  tail.add(tassel);
  tail.position.set(-1.126, 2.7, 0);
  let tailRows = [
    [0, 0, 0.059],
    [-0.101, -0.11, 0.052],
    [-0.158, -0.29, 0.041],
    [-0.167, -0.49, 0.03],
    [-0.202, -0.71, 0.024],
    [-0.248, -0.905, 0.023],
    [-0.28, -1.017, 0.019],
  ];
  let tailG = surface(
    tailRows,
    (r, t) => [r[0] + r[2] * Math.cos(t), r[1], r[2] * Math.sin(t)],
    32,
    18,
  );
  mesh(
    attributes(tailG, (x, y, z) => [x * 1.55 - 1.12, y * 1.5 + 2.7, z, 0.24]),
    fur,
    tail,
  );
  let tailRest = tailG.attributes.position.array.slice();
  let tp = [],
    tc = [];
  for (let j = 0; j < 760; j++) {
    let t = R() * TAU,
      r = 0.034 * Math.sqrt(R()),
      l = 0.215 + R() * 0.15,
      x = r * Math.cos(t),
      z = r * Math.sin(t),
      n = tp.length / 3;
    let c = new THREE.Color().setHSL(
      0.067 + R() * 0.025,
      0.23 + R() * 0.16,
      0.087 + R() * 0.095,
      THREE.SRGBColorSpace,
    );
    let w = 0.0013 + 0.003 * R();
    for (let k = 0; k < 5; k++) {
      let u = k / 5,
        v = (k + 1) / 5;
      function loc(a, ww) {
        return [
          x * (1 + 0.58 * Math.sin(a * Math.PI) - 0.44 * a) - 0.103 * Math.sin(a * 1.91) + ww,
          -l * a,
          z * (1 + 0.5 * Math.sin(a * Math.PI) - 0.38 * a),
        ];
      }
      let a = loc(u, w * (1 - u)),
        b = loc(u, -w * (1 - u)),
        d = loc(v, w * (1 - v)),
        e = loc(v, -w * (1 - v));
      tp.push(...a, ...b, ...d, ...b, ...e, ...d);
      for (let h = 0; h < 6; h++) tc.push(c.r, c.g, c.b);
    }
  }
  let tg = new THREE.BufferGeometry();
  tg.setAttribute("position", new THREE.Float32BufferAttribute(tp, 3));
  tg.setAttribute("color", new THREE.Float32BufferAttribute(tc, 3));
  tg.computeVertexNormals();
  mesh(tg, maneMat, tassel);
  function update(time) {
    let phase = (time / cycle) % 1,
      p = phase * TAU,
      bob = 0.028 * Math.sin(2 * p - 0.61),
      roll = 0.017 * Math.sin(p),
      nod = 0.02 * Math.sin(2 * p + 0.73) + 0.014 * Math.sin(p),
      sway = 0.019 * Math.sin(p + 0.38);
    upper.position.set(0, bob, sway);
    upper.rotation.x = roll;
    for (let l of legs) {
      let f = legPose(l.front, l.s, phase, bob),
        a = l.pose,
        ref = l.ref;
      for (let j = 0; j <= segments; j++) spline(f.rows, j / segments, a[j]);
      for (let j = 0; j <= segments; j++) {
        let k = Math.min(segments, j + 1),
          h = Math.max(0, j - 1),
          ang =
            Math.atan2(a[k][0] - a[h][0], a[h][1] - a[k][1]) -
            Math.atan2(ref[k][0] - ref[h][0], ref[h][1] - ref[k][1]);
        let o = j * 6;
        l.trans[o] = Math.cos(ang);
        l.trans[o + 1] = Math.sin(ang);
        l.trans[o + 2] = a[j][0] - ref[j][0];
        l.trans[o + 3] = a[j][1] - ref[j][1];
        l.trans[o + 4] = a[j][2] - ref[j][2];
      }
      l.foot.position.set(f.x, f.y, f.z);
      l.foot.rotation.z = f.tilt;
    }
    const pos = skinGeometry.attributes.position.array;
    let co = Math.cos(roll),
      si = Math.sin(roll);
    for (let i = 0; i < count; i++) {
      let j = i * 3,
        x = coords[j],
        y = coords[j + 1],
        z = coords[j + 2],
        a = nod * nodding[i],
        c = Math.cos(a),
        s = Math.sin(a),
        xx = 0.52 + (x - 0.52) * c - (y - 3.11) * s,
        yy = 3.11 + (x - 0.52) * s + (y - 3.11) * c;
      let by = yy * co - z * si + bob,
        bz = yy * si + z * co + sway,
        w = weight[i];
      if (w > 0.00001) {
        let l = legs[which[i]],
          k = bindings[i],
          r = l.ref[k],
          r1 = l.ref[k + 1],
          q = ratio[i],
          rx = mix(r[0], r1[0], q),
          ry = mix(r[1], r1[1], q),
          o = k * 6,
          cache = l.trans,
          dx = x - rx,
          dy = y - ry,
          ca = mix(cache[o], cache[o + 6], q),
          sa = mix(cache[o + 1], cache[o + 7], q);
        xx = mix(xx, rx + mix(cache[o + 2], cache[o + 8], q) + dx * ca - dy * sa, w);
        by = mix(by, ry + mix(cache[o + 3], cache[o + 9], q) + dy * ca + dx * sa, w);
        bz = mix(bz, z + mix(cache[o + 4], cache[o + 10], q), w);
      }
      pos[j] = xx;
      pos[j + 1] = by;
      pos[j + 2] = bz;
    }
    skinGeometry.attributes.position.needsUpdate = true;
    skinGeometry.computeVertexNormals();
    let mp = maneG.attributes.position.array;
    for (let j = 0; j < mp.length; j += 3) {
      let x = maneRest[j],
        y = maneRest[j + 1],
        a = nod * smooth(sat((y - 2.95) / 1.62));
      mp[j] = 0.52 + (x - 0.52) * Math.cos(a) - (y - 3.11) * Math.sin(a);
      mp[j + 1] = 3.11 + (x - 0.52) * Math.sin(a) + (y - 3.11) * Math.cos(a);
    }
    maneG.attributes.position.needsUpdate = true;
    let c = Math.cos(nod),
      s = Math.sin(nod);
    head.position.set(
      0.52 + (1.589 - 0.52) * c - (4.863 - 3.11) * s,
      3.11 + (1.589 - 0.52) * s + (4.863 - 3.11) * c,
      0,
    );
    head.rotation.set(
      0.016 * Math.sin(p),
      -0.074 + 0.055 * Math.sin(time * 0.66),
      nod + 0.016 * Math.sin(2 * p + 0.41) - 0.021,
      "YXZ",
    );
    updateFace(time, p);
    const tt = tailG.attributes.position.array;
    let sw = (u) =>
        u * u * (0.17 * Math.sin(1.69 * time - u * 1.05) + 0.135 * Math.sin(p + 0.45 - u * 0.86)),
      tx = (u) => u * u * (0.049 + 0.038 * Math.sin(p + 0.5 - u));
    for (let j = 0; j < tt.length; j += 3) {
      let u = sat(-tailRest[j + 1] / 1.017);
      tt[j] = tailRest[j] + tx(u);
      tt[j + 2] = tailRest[j + 2] + sw(u);
    }
    tailG.attributes.position.needsUpdate = true;
    tassel.position.set(-0.264 + tx(1), -0.971, sw(0.97));
    tassel.rotation.x = -0.21 * Math.sin(time * 1.69 - 1.15) - 0.095 * Math.sin(p - 0.4);
    tassel.rotation.z = 0.064 * Math.sin(p - 0.43);
  }
  update(0.66);
  return { root, legs, update, velocity: stride / cycle };
}
