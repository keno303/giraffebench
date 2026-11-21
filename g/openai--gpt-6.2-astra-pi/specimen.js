/* Kinetic Atlas — procedural specimen. The hide is a single smooth isosurface
   bound to a rest-pose skeleton; the coat is evaluated in rest coordinates. */
function makeGiraffe() {
  const T = THREE,
    V = (x = 0, y = 0, z = 0) => new T.Vector3(x, y, z),
    clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v)),
    tau = 2 * Math.PI;
  const group = new T.Group(),
    bones = [],
    rest = [],
    shapes = [];
  function bone(x, y, z) {
    const b = new T.Bone();
    b.position.set(x, y, z);
    group.add(b);
    bones.push(b);
    rest.push(b.position.clone());
    return bones.length - 1;
  }
  const trunk = bone(0, 2.7, 0),
    neck = bone(0.56, 3.08, 0),
    poll = bone(1.71, 5.04, 0),
    cervical = bone(1.204, 4.186, 0);
  function form(type, a, b, r, s, t, rot, id, k) {
    const c = Math.cos(rot),
      n = Math.sin(rot);
    let box;
    if (type === 0) {
      box = [
        a.x - Math.abs(c * r) - Math.abs(n * s),
        a.x + Math.abs(c * r) + Math.abs(n * s),
        a.y - Math.abs(n * r) - Math.abs(c * s),
        a.y + Math.abs(n * r) + Math.abs(c * s),
        a.z - t,
        a.z + t,
      ];
    } else {
      let m = Math.max(r, s);
      box = [
        Math.min(a.x, b.x) - m,
        Math.max(a.x, b.x) + m,
        Math.min(a.y, b.y) - m,
        Math.max(a.y, b.y) + m,
        Math.min(a.z, b.z) - m * t,
        Math.max(a.z, b.z) + m * t,
      ];
    }
    const dx = b.x - a.x,
      dy = b.y - a.y,
      dz = (b.z - a.z) / t,
      len = dx * dx + dy * dy + dz * dz;
    const d =
      type === 0
        ? (x, y, z) => {
            let u = c * (x - a.x) + n * (y - a.y),
              v = -n * (x - a.x) + c * (y - a.y),
              w = z - a.z;
            u /= r;
            v /= s;
            w /= t;
            let q = u * u + v * v + w * w;
            return (
              (q - Math.sqrt(q)) /
              (Math.sqrt((u * u) / (r * r) + (v * v) / (s * s) + (w * w) / (t * t)) + 1e-9)
            );
          }
        : (x, y, z) => {
            let u = x - a.x,
              v = y - a.y,
              w = (z - a.z) / t;
            let h = clamp((u * dx + v * dy + w * dz) / len);
            let perp = Math.sqrt((u - h * dx) ** 2 + (v - h * dy) ** 2 + (w - h * dz) ** 2);
            h = clamp(h + ((s - r) * perp) / (len + 1e-6));
            return (
              (Math.sqrt((u - h * dx) ** 2 + (v - h * dy) ** 2 + (w - h * dz) ** 2) -
                r -
                h * (s - r)) *
              Math.min(1, t)
            );
          };
    shapes.push({ box, d, id, k });
  }
  function ell(x, y, z, rx, ry, rz, angle, id = trunk, k = 0.13) {
    form(0, V(x, y, z), V(x, y, z), rx, ry, rz, angle, id, k);
  }
  function seg(a, b, r, s, zratio, id, k = 0.09) {
    form(1, a, b, r, s, zratio, 0, id, k);
  }
  // Deep thorax, tucked flank, powerful sloped withers, and sacrum.
  ell(-0.03, 2.765, 0, 1.15, 0.547, 0.411, 0.135);
  ell(-0.82, 2.74, 0, 0.588, 0.498, 0.365, -0.07);
  ell(0.54, 2.9, 0, 0.562, 0.61, 0.395, 0.17);
  ell(0.55, 3.18, 0, 0.48, 0.31, 0.275, 0.5);
  seg(V(0.62, 3.19), V(1.02, 3.85), 0.376, 0.259, 0.75, neck, 0.17);
  seg(V(1.02, 3.85), rest[cervical], 0.26, 0.227, 0.77, neck, 0.046);
  seg(rest[cervical], V(1.43, 4.6), 0.227, 0.186, 0.77, cervical, 0.03);
  seg(V(1.43, 4.6), V(1.68, 5.055), 0.186, 0.169, 0.85, cervical, 0.042);
  // Skull, ramus, sloping nasal bridge, padded muzzle, and lower lip.
  ell(1.795, 5.09, 0, 0.281, 0.226, 0.182, 0.12, poll, 0.074);
  ell(1.99, 5.035, 0, 0.305, 0.174, 0.1515, -0.28, poll, 0.068);
  ell(2.166, 5.015, 0, 0.312, 0.133, 0.13, -0.31, poll, 0.055);
  ell(2.368, 4.938, 0, 0.155, 0.104, 0.143, -0.18, poll, 0.045);
  ell(2.255, 4.866, 0, 0.208, 0.067, 0.117, -0.15, poll, 0.031);
  for (const s of [-1, 1]) {
    ell(1.8, 5.24, s * 0.096, 0.088, 0.102, 0.074, 0.12, poll, 0.045);
    ell(1.929, 5.163, s * 0.119, 0.123, 0.075, 0.068, -0.12, poll, 0.05);
  }
  const legs = [];
  for (const front of [true, false])
    for (const side of [1, -1]) {
      let z = side * (front ? 0.254 : 0.248);
      let pts = (
        front
          ? [
              [0.68, 2.91],
              [0.516, 2.16],
              [0.623, 1.124],
              [0.623, 0.218],
              [0.697, 0.105],
            ]
          : [
              [-0.94, 2.78],
              [-0.704, 2.008],
              [-1.124, 1.182],
              [-1.069, 0.214],
              [-1.001, 0.103],
            ]
      ).map(([x, y]) => V(x, y, z));
      let ids = pts.map((p) => bone(p.x, p.y, p.z));
      let [a, b, c, d, e] = pts,
        [i, j, k, l] = ids;
      if (front) {
        ell(0.539, 3.053, z * 0.99, 0.153, 0.374, 0.146, 0.31, i, 0.085);
        ell(0.654, 2.81, z * 0.91, 0.249, 0.46, 0.174, -0.15, i, 0.17);
        seg(a, b, 0.205, 0.133, 0.85, i, 0.1);
        seg(b, c, 0.129, 0.081, 0.88, j, 0.047);
        seg(b.clone().lerp(c, 0.37), c, 0.094, 0.079, 0.87, j, 0.024);
      } else {
        ell(-0.98, 2.67, z * 0.9, 0.353, 0.473, 0.207, -0.12, i, 0.15);
        seg(a, b, 0.244, 0.151, 0.95, i, 0.1);
        seg(b, c, 0.139, 0.079, 0.96, j, 0.046);
        ell(-1.12, 1.206, z, 0.099, 0.125, 0.082, -0.22, j, 0.04);
      }
      ell(c.x, c.y, c.z, 0.091, 0.109, 0.081, 0, k, 0.029);
      seg(c, d, 0.072, 0.052, 0.92, k, 0.029);
      ell(d.x, d.y, d.z, 0.069, 0.082, 0.061, 0.14, l, 0.025);
      seg(d, e, 0.059, 0.046, 0.95, l, 0.018);
      legs.push({ front, side, pts, ids, off: (side === 1 ? 0 : 0.5) + (front ? 0.14 : 0) });
    }
  const nap = coatNap(),
    geo = buildSurface(shapes, bones.length);
  const hide = new T.MeshStandardMaterial({ color: 0xffffff, roughness: 0.93 });
  hide.onBeforeCompile = (s) => {
    s.uniforms.hairNap = { value: nap };
    s.vertexShader =
      'attribute float ambientVisibility; varying float vVisibility; varying vec3 vHide;\n' +
      s.vertexShader.replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nvHide=position; vVisibility=ambientVisibility;',
      );
    s.fragmentShader =
      `varying float vVisibility; varying vec3 vHide; uniform sampler2D hairNap;
 vec2 grainUV(vec3 p){float neck=smoothstep(3.06,3.62,p.y)*(1.-smoothstep(4.88,5.15,p.y));float angle=1.05*neck+1.41*(1.-smoothstep(1.96,2.61,p.y))-.24*smoothstep(1.74,2.19,p.x);vec2 axis=vec2(cos(angle),sin(angle));vec2 uv=vec2(dot(axis,p.xy),dot(vec2(-axis.y,axis.x),p.xy));uv+=p.z*vec2(.22,.82);return uv*5.8;} float napAt(vec3 p){return texture2D(hairNap,grainUV(p)).r-.5;}
 vec3 rh(vec3 p){p=fract(p*vec3(.1031,.11369,.13787));p+=dot(p,p.yxz+19.19);return fract((p.xxy+p.yxx)*p.zyx);}
 float hn(vec3 p){return rh(p).x;} float coatNoise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(mix(hn(i),hn(i+vec3(1,0,0)),f.x),mix(hn(i+vec3(0,1,0)),hn(i+vec3(1,1,0)),f.x),f.y),mix(mix(hn(i+vec3(0,0,1)),hn(i+vec3(1,0,1)),f.x),mix(hn(i+vec3(0,1,1)),hn(i+1.),f.x),f.y),f.z);}
 vec3 coat(vec3 p){float face=smoothstep(4.80,5.12,p.y)*smoothstep(1.42,1.81,p.x);float leg=1.-smoothstep(1.4,2.50,p.y);
 vec3 q=p*vec3(3.43,3.56,3.27);q+=vec3(.43*coatNoise(p*3.8),.42*coatNoise(p*4.3+9.),.38*coatNoise(p*4.6-7.));q+=.08*sin(q.zxy*4.2)+.035*sin(q.yzx*9.8);q.xz+=leg*vec2(p.x-(p.x<0.?-.93:.64),p.z)*1.85;q.y-=1.75*max(0.,2.52-p.y)*leg;q+=face*(p-vec3(1.7,5.,0))*4.;
 vec3 b=floor(q),f=fract(q);float m=8.,m2=9.,seed=0.;for(int i=-1;i<=1;i++)for(int j=-1;j<=1;j++)for(int k=-1;k<=1;k++){vec3 g=vec3(float(i),float(j),float(k)),h=rh(b+g);vec3 d=g+.16+.68*h-f;float v=dot(d,d);if(v<m){m2=m;m=v;seed=h.y;}else m2=min(m2,v);}
 float border=sqrt(m2)-sqrt(m);float edge=smoothstep(.040,.083,border);float grain=coatNoise(p*145.)-.5;float mott=coatNoise(p*17.);vec3 cream=mix(vec3(.84,.71,.49),vec3(.98,.89,.72),.22+.58*mott);vec3 marking=mix(vec3(.46,.255,.129),vec3(.69,.425,.211),seed*.78+.16*mott);marking*=1.065-.205*smoothstep(.08,.41,border);vec3 col=mix(cream,marking,edge);
 float bib=(1.-smoothstep(2.245,2.52,p.y))*(1.-smoothstep(.08,.77,abs(p.x)));float sock=1.-smoothstep(.61,1.59,p.y+.17*coatNoise(p*11.));col=mix(col,cream*.95,max(.78*bib,sock));float mask=smoothstep(1.66,2.32,p.x)*smoothstep(4.70,4.96,p.y);col=mix(col,mix(vec3(.76,.54,.33),cream,mott*.75),max(.75*face,mask));col=mix(col,vec3(.52,.37,.25)*(1.+.13*mott),smoothstep(2.29,2.47,p.x)*.82);float eye=length((p.xy-vec2(1.944,5.129))*vec2(.81,1.12));float temple=1.-smoothstep(.086,.165,eye);col=mix(col,vec3(.71,.50,.31)*(.90+.23*mott),.84*temple);float jaw=(p.y-4.972+.26*(p.x-2.03))/.043;float cheek=exp(-jaw*jaw)*smoothstep(1.85,2.04,p.x)*(1.-smoothstep(2.27,2.46,p.x));col=mix(col,vec3(.84,.68,.48),cheek*.52);float velvet=napAt(p);float muzzle=smoothstep(2.25,2.50,p.x);col=mix(col,vec3(.50,.393,.306)*(1.+.15*mott),muzzle*.54);col*=1.+.046*grain+.088*(mott-.5)+velvet*.24;return pow(col,vec3(2.2));}
 ` +
      s.fragmentShader
        .replace(
          '#include <aomap_fragment>',
          '#include <aomap_fragment>\nreflectedLight.indirectDiffuse*=vVisibility;',
        )
        .replace(
          '#include <color_fragment>',
          '#include <color_fragment>\ndiffuseColor.rgb*=coat(vHide);',
        )
        .replace(
          '#include <normal_fragment_maps>',
          `#include <normal_fragment_maps>
 vec3 ex=dFdx(-vViewPosition),ey=dFdy(-vViewPosition),sx=cross(ey,normal),sy=cross(normal,ex);float det=dot(ex,sx),height=.00054*napAt(vHide);normal=normalize(abs(det)*normal-sign(det)*(dFdx(height)*sx+dFdy(height)*sy));`,
        );
  };
  const mesh = new T.SkinnedMesh(geo, hide);
  group.add(mesh);
  group.updateMatrixWorld(true);
  mesh.bind(new T.Skeleton(bones));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  function mat(c, r = 0.85) {
    return new T.MeshStandardMaterial({ color: c, roughness: r });
  }
  const sand = mat(0xbb8956);
  function detail(g, m, id) {
    let o = new T.Mesh(g, m);
    o.castShadow = true;
    group.add(o);
    if (id !== null) {
      g.translate(-rest[id].x, -rest[id].y, -rest[id].z);
      bones[id].add(o);
    }
    return o;
  }
  // Tapered sweep used for soft tissue edges and the tail shaft.
  function sweep(points, radii, m, id, sides = 12) {
    let path = new T.CatmullRomCurve3(points),
      n = Math.max(8, points.length * 4),
      frame = path.computeFrenetFrames(n, false),
      ps = [],
      idx = [];
    for (let i = 0; i <= n; i++) {
      let u = i / n,
        pt = path.getPointAt(u),
        f = u * (radii.length - 1),
        j = Math.min(radii.length - 2, Math.floor(f)),
        r = T.MathUtils.lerp(radii[j], radii[j + 1], f - j);
      for (let k = 0; k < sides; k++) {
        let a = (k / sides) * tau,
          v = pt
            .clone()
            .addScaledVector(frame.normals[i], r * Math.cos(a))
            .addScaledVector(frame.binormals[i], r * Math.sin(a));
        ps.push(v.x, v.y, v.z);
        if (i) {
          let b = i * sides + k,
            c = i * sides + ((k + 1) % sides);
          idx.push(b - sides, c - sides, b, b, c - sides, c);
        }
      }
    }
    let g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(ps, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return detail(g, m, id);
  }
  const ears = [];
  for (const side of [1, -1]) {
    let ear = pinnaMesh(side, nap);
    bones[poll].add(ear);
    ear.position.set(1.665, 5.155, side * 0.127).sub(rest[poll]);
    ears.push(ear);
  }
  const blink = modelFace({ T, V, shapes, poll, detail, sweep, mat });
  // A brush of short, upright hairs follows the nuchal crest.
  const hairMats = [0x483326, 0x5c402e, 0x694b35, 0x80583c].map((c) => mat(c));
  let seed = 797;
  function rnd() {
    seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
    return seed / 4294967296;
  }
  // Sample the actual dorsal surface so no strip of mane floats off the curved neck.
  function dorsal(y, z) {
    let lo = -0.71,
      hi = 0.66 + (y - 3.21) * 0.558;
    for (let j = 0; j < 14; j++) {
      let x = (lo + hi) * 0.5,
        d = 1;
      for (let s of shapes) {
        if (s.id !== trunk && s.id !== neck && s.id !== cervical) continue;
        let v = s.d(x, y, z),
          h = Math.max(s.k - Math.abs(d - v), 0);
        d = Math.min(d, v) - (h * h) / (4 * s.k);
      }
      if (d > 0) lo = x;
      else hi = x;
    }
    return hi;
  }
  const maneGeo = [],
    maneCol = [],
    maneIdx = [];
  // A close, continuous undercoat supports a softer silhouette of individual guard hairs.
  for (let i = 0; i <= 76; i++)
    for (let j = 0; j <= 14; j++) {
      let u = i / 76,
        w = j / 7 - 1,
        y = 3.47 + 1.67 * u,
        z = w * (0.057 - 0.018 * u),
        x = dorsal(y, z),
        f = Math.sqrt(Math.max(0, 1 - w * w)) * Math.min(1, u * 22, (1 - u) * 24);
      maneGeo.push(x + 0.012 - 0.073 * f, y + 0.038 * f, z);
      let col = hairMats[(i + j) % 3].color;
      maneCol.push(col.r, col.g, col.b);
      if (i && j) {
        let k = i * 15 + j;
        maneIdx.push(k - 16, k - 15, k, k - 16, k, k - 1);
      }
    }
  for (let i = 0; i < 2300; i++) {
    let u = rnd(),
      w = rnd() - 0.5;
    let y = 3.47 + 1.67 * u,
      z = w * (0.107 - 0.039 * u),
      x = dorsal(y, z) + 0.015;
    let a = V(x, y - 0.014, z),
      b = V(x - 0.069 - 0.035 * rnd(), y + 0.041 + rnd() * 0.029, z + w * 0.014);
    let r = 0.004 + rnd() * 0.0065;
    let col = hairMats[Math.floor(rnd() * 4)].color,
      k = maneGeo.length / 3;
    for (let j = 0; j < 4; j++) {
      let h = (j * Math.PI) / 2;
      maneGeo.push(a.x + Math.cos(h) * r, a.y, z + Math.sin(h) * r);
      maneCol.push(col.r, col.g, col.b);
      maneIdx.push(k + j, k + ((j + 1) % 4), k + 4);
    }
    maneGeo.push(b.x, b.y, b.z);
    maneCol.push(col.r * 0.9, col.g * 0.9, col.b * 0.9);
  }
  let mg = new T.BufferGeometry();
  mg.setAttribute('position', new T.Float32BufferAttribute(maneGeo, 3));
  mg.setAttribute('color', new T.Float32BufferAttribute(maneCol, 3));
  mg.setIndex(maneIdx);
  mg.computeVertexNormals();
  // Weight the nuchal brush to both cervical regions. The crest then follows the
  // bend of the hide instead of pivoting as a rigid strip at the withers.
  const maneBones = [],
    maneWeights = [];
  for (let j = 0; j < mg.attributes.position.count; j++) {
    const y = mg.attributes.position.getY(j);
    const w = T.MathUtils.smoothstep(y, 3.98, 4.36);
    const base = 0.48 * (1 - T.MathUtils.smoothstep(y, 3.47, 3.59));
    maneBones.push(trunk, neck, cervical, poll);
    maneWeights.push(base, 1 - w - base, w, 0);
  }
  mg.setAttribute('skinIndex', new T.Uint16BufferAttribute(maneBones, 4));
  mg.setAttribute('skinWeight', new T.Float32BufferAttribute(maneWeights, 4));
  const mane = new T.SkinnedMesh(
    mg,
    new T.MeshStandardMaterial({ vertexColors: true, side: T.DoubleSide }),
  );
  group.add(mane);
  mane.bind(mesh.skeleton);
  mane.frustumCulled = false;
  mane.castShadow = true;
  const hoofMat = new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.78 });
  for (const leg of legs) {
    let p = leg.pts[4];
    for (let s of [-1, 1]) {
      let ps = [],
        cs = [],
        idx = [];
      let rings = [
        [0.001, 0.118, 0.04, 0.034],
        [0.019, 0.119, 0.041, 0.037],
        [0.074, 0.099, 0.039, 0.017],
        [0.132, 0.07, 0.036, -0.013],
        [0.146, 0.051, 0.03, -0.022],
      ];
      for (let j = 0; j < rings.length; j++) {
        let [y, rx, rz, dx] = rings[j];
        for (let i = 0; i < 24; i++) {
          let a = (tau * i) / 24;
          ps.push(
            p.x + dx + rx * Math.cos(a),
            y,
            p.z + s * (0.031 + 0.014 * Math.cos(a)) + rz * Math.sin(a),
          );
          let tint = new T.Color(
            [0x38332e, 0x4d443a, 0x675c4d, 0x786957, 0x927454][j],
          ).multiplyScalar(0.96 + 0.05 * Math.sin(9 * a) + 0.025 * Math.sin(3 * a));
          cs.push(tint.r, tint.g, tint.b);
          let k = j * 24 + i,
            l = j * 24 + ((i + 1) % 24);
          if (j) idx.push(k - 24, k, l - 24, l - 24, k, l);
        }
      }
      for (let i = 1; i < 23; i++) idx.push(0, i, i + 1, 96, 96 + i + 1, 96 + i);
      let g = new T.BufferGeometry();
      g.setAttribute('position', new T.Float32BufferAttribute(ps, 3));
      g.setIndex(idx);
      g.setAttribute('color', new T.Float32BufferAttribute(cs, 3));
      g.computeVertexNormals();
      detail(g, hoofMat, leg.ids[4]);
    }
  }
  const tailPath = [
    V(-1.321, 2.862, 0),
    V(-1.454, 2.65, 0.025),
    V(-1.5, 2.29, 0.031),
    V(-1.56, 1.98, 0.044),
    V(-1.592, 1.81, 0.054),
  ];
  const tailJ = tailPath.map((p) => bone(p.x, p.y, p.z));
  let shaft = sweep(tailPath, [0.065, 0.046, 0.031, 0.023, 0.02], sand, null, 16),
    tg = shaft.geometry,
    ti = [],
    tw = [];
  for (let j = 0; j < tg.attributes.position.count; j++) {
    let y = tg.attributes.position.getY(j),
      i = 0;
    while (i < 3 && y < tailPath[i + 1].y) i++;
    let f = clamp((y - tailPath[i].y) / (tailPath[i + 1].y - tailPath[i].y));
    f = f * f * (3 - 2 * f);
    ti.push(i, i + 1, 0, 0);
    tw.push(1 - f, f, 0, 0);
  }
  tg.setAttribute('skinIndex', new T.Uint16BufferAttribute(ti, 4));
  tg.setAttribute('skinWeight', new T.Float32BufferAttribute(tw, 4));
  group.remove(shaft);
  shaft = new T.SkinnedMesh(tg, sand);
  group.add(shaft);
  group.updateMatrixWorld(true);
  shaft.bind(new T.Skeleton(tailJ.map((id) => bones[id])));
  shaft.castShadow = true;
  shaft.frustumCulled = false;
  {
    let ps = [],
      cs = [],
      idx = [];
    for (let j = 0; j < 235; j++) {
      let root = tailPath[4],
        a = tau * rnd(),
        rad = Math.sqrt(rnd()),
        len = 0.215 + 0.119 * rnd(),
        col = hairMats[j % 3].color,
        dx = Math.cos(a) * rad,
        dz = Math.sin(a) * rad,
        k = ps.length / 3;
      for (let ring = 0; ring < 6; ring++) {
        let u = ring / 5,
          spread = 0.017 + u * 0.043 + 0.019 * Math.sin(Math.PI * u),
          r = 0.0044 * (1 - u * u) + 0.0004;
        let x = root.x + dx * spread - 0.072 * u - 0.018 * Math.sin(Math.PI * u),
          y = root.y + 0.046 - len * u,
          z = root.z + dz * spread + 0.011 * u;
        for (let h = 0; h < 4; h++) {
          let q = (h * Math.PI) / 2;
          ps.push(x + r * Math.cos(q), y, z + r * Math.sin(q));
          cs.push(col.r * 0.82, col.g * 0.83, col.b * 0.84);
          if (ring) {
            let n = k + 4 * ring + h,
              o = k + 4 * ring + ((h + 1) % 4);
            idx.push(n - 4, o - 4, n, n, o - 4, o);
          }
        }
      }
    }
    let g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(ps, 3));
    g.setAttribute('color', new T.Float32BufferAttribute(cs, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    detail(
      g,
      new T.MeshStandardMaterial({ vertexColors: true, side: T.DoubleSide, roughness: 1 }),
      tailJ[4],
    );
  }
  // Analytic sagittal-plane IK. Stance feet advance exactly opposite the tracking floor.
  const stride = 1.96,
    duty = 0.644;
  function pose(id, p, az = 0, ay = 0, ax = 0) {
    bones[id].position.copy(p);
    bones[id].rotation.set(ax, ay, az, 'ZYX');
  }
  function sole(leg, cycles) {
    let u = (((cycles - leg.off) % 1) + 1) % 1,
      stance = u < duty,
      v = stance ? u / duty : (u - duty) / (1 - duty),
      lift = stance ? 0 : Math.sin(v * Math.PI) ** 1.5,
      half = (stride * duty) / 2;
    let x = stance
      ? half - v * 2 * half
      : -half +
        2 * half * (v - Math.sin(tau * v) / tau) -
        (stride * (1 - duty) * Math.sin(tau * v)) / tau;
    let toeRot = stance ? 0 : -0.44 * Math.sin(v * tau) * Math.sin(Math.PI * v);
    let E = leg.pts[4].clone();
    E.x += x;
    E.y += lift * (leg.front ? 0.21 : 0.245);
    return { E, x, lift, toeRot, stance };
  }
  function animate(cycles) {
    blink(cycles);
    let t = cycles * tau,
      bob = 0.026 * Math.cos(2 * t - 0.4),
      roll = 0.027 * Math.sin(t + 0.3),
      tilt = 0.019 * Math.sin(2 * t + 0.6),
      dx = 0.029 * Math.sin(t * 2);
    let origin = V(dx, 2.7 + bob, 0.023 * Math.sin(t - 0.18));
    pose(trunk, origin, tilt, 0, roll);
    const breath = Math.sin(t * 0.476 + 0.4);
    bones[trunk].scale.set(1, 1 + 0.0035 * breath, 1 + 0.011 * breath);
    function bodyPoint(p) {
      return p
        .clone()
        .sub(rest[trunk])
        .multiply(bones[trunk].scale)
        .applyQuaternion(bones[trunk].quaternion)
        .add(origin);
    }
    let n = bodyPoint(rest[neck]),
      na = tilt * 0.54 + 0.064 * Math.cos(2 * t + 0.29) - 0.021 * Math.sin(t);
    pose(neck, n, na, 0.018 * Math.sin(t + 0.6), roll * 0.56);
    const mid = rest[cervical]
      .clone()
      .sub(rest[neck])
      .applyQuaternion(bones[neck].quaternion)
      .add(n);
    const upperAngle = 0.51 * na + 0.014 * Math.sin(2 * t - 0.72);
    pose(cervical, mid, upperAngle, 0.025 * Math.sin(t + 0.24), roll * 0.37);
    let h = rest[poll]
      .clone()
      .sub(rest[cervical])
      .applyQuaternion(bones[cervical].quaternion)
      .add(mid);
    pose(
      poll,
      h,
      na * 0.38 + 0.021 * Math.sin(2 * t - 0.6),
      0.047 * Math.sin(t * 0.31) + 0.025 * Math.cos(t + 0.2),
      roll * 0.22,
    );
    ears.forEach((e, i) => {
      e.rotation.z = (i === 0 ? 0.09 : -0.115) + 0.028 * Math.sin(t * 0.5 + i);
      e.rotation.x =
        0.054 * Math.sin(t + i * 2.7) +
        0.15 * Math.pow(Math.max(0, Math.cos(t * 0.33 + i * 2.4)), 17) * Math.sin(t * 3.1);
    });
    for (let j = 0; j < tailJ.length; j++) {
      let id = tailJ[j],
        u = j / 4,
        p = j
          ? tailPath[j]
              .clone()
              .sub(tailPath[j - 1])
              .applyQuaternion(bones[tailJ[j - 1]].quaternion)
              .add(bones[tailJ[j - 1]].position)
          : bodyPoint(rest[id]);
      let swish = Math.pow(Math.max(0, Math.cos(t * 0.24)), 5) * Math.sin(2 * t - u * 1.9);
      pose(
        id,
        p,
        -0.05 - 0.06 * u + (0.045 + 0.104 * u) * Math.sin(t - u * 1.28) - 0.075 * u * swish,
        0.04 * Math.cos(t - u),
        (0.085 + 0.17 * u) * Math.sin(t - 0.45 - u * 0.89) + (0.065 + 0.21 * u) * swish,
      );
    }
    const contacts = [];
    for (const leg of legs) {
      const { pts, ids, front, off } = leg;
      let { E, x, lift, toeRot, stance } = sole(leg, cycles);
      contacts.push(stance);
      let A = bodyPoint(pts[0]);
      A.x += (front ? 0.077 : 0.039) * Math.cos(t - off * tau - 0.43);
      A.y += (front ? 0.017 : 0.01) * Math.sin(t - off * tau + 0.25);
      let upper = 0.3 * x + (front ? -0.125 : 0.105) * lift;
      let B = pts[1]
        .clone()
        .sub(pts[0])
        .applyAxisAngle(V(0, 0, 1), upper)
        .add(A);
      let D = pts[3]
        .clone()
        .sub(pts[4])
        .applyAxisAngle(V(0, 0, 1), toeRot)
        .add(E);
      let vx = D.x - B.x,
        vy = D.y - B.y,
        len = Math.hypot(vx, vy);
      let l1 = pts[1].distanceTo(pts[2]),
        l2 = pts[2].distanceTo(pts[3]);
      let a = clamp((l1 * l1 - l2 * l2 + len * len) / (2 * len), 0, len),
        b = Math.sqrt(Math.max(0, l1 * l1 - a * a)) * (front ? 1 : -1);
      let C = V(B.x + (vx * a - vy * b) / len, B.y + (vy * a + vx * b) / len, D.z);
      let arr = [A, B, C, D, E];
      for (let i = 0; i < 4; i++) {
        let p = arr[i],
          q = arr[i + 1],
          d = pts[i],
          e = pts[i + 1];
        let ang = Math.atan2(q.y - p.y, q.x - p.x) - Math.atan2(e.y - d.y, e.x - d.x);
        pose(ids[i], p, ang);
        let ratio = q.distanceTo(p) / e.distanceTo(d);
        bones[ids[i]].scale.y = ratio;
      }
      pose(ids[4], E, toeRot);
    }
    return contacts;
  }
  return {
    group,
    animate,
    stride,
    duty,
    tracks: legs.map((l) => ({
      side: l.side,
      foot: l.pts[4],
      offset: l.off,
      joints: l.ids.map((i) => bones[i]),
      soleAt: (t) => {
        let { E, toeRot } = sole(l, t);
        return V(0.032, 0.006 - l.pts[4].y, 0)
          .applyAxisAngle(V(0, 0, 1), toeRot)
          .add(E);
      },
    })),
    head: bones[poll],
  };
}
