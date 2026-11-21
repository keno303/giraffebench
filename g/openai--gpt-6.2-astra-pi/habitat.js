/* An optional continuous semi-arid savanna transect. Periodic topography keeps roots,
   rocks, grass and the tracking ground locked together, even after many kilometres. */
function makeHabitat(animal) {
  const T = THREE,
    G = new T.Group(),
    V = (x, y, z) => new T.Vector3(x, y, z),
    TAU = Math.PI * 2,
    L = 128,
    unit = new T.Vector3(0, 1, 0);
  let seed = 78249;
  const rand = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296,
    between = (a, b) => a + (b - a) * rand(),
    wrap = (x, n) => ((x % n) + n) % n,
    clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x)),
    smooth = (a, b, x) => {
      let f = clamp((x - a) / (b - a));
      return f * f * (3 - 2 * f);
    };
  function relief(x, z) {
    let k = (x * TAU) / L,
      d = Math.abs(z);
    let hill =
      (0.22 * Math.sin(k * 3 + z * 0.22) +
        0.17 * Math.sin(k * 7 - z * 0.14) +
        0.31 * Math.cos(z * 0.23 + k)) *
      smooth(2, 14, d);
    let r = smooth(31, 62, d);
    let ridges =
      r *
      (1.9 +
        1.65 * Math.sin(2 * k + z * 0.043) +
        1.41 * Math.cos(k * 3.0 - z * 0.053) +
        0.8 * Math.sin(k * 6 + z * 0.087));
    ridges +=
      smooth(58, 92, d) * (4.3 + 3.7 * Math.sin(k + z * 0.065) + 1.5 * Math.sin(k * 4 - z * 0.05));
    let crest =
      smooth(27, 64, d) *
      (0.51 * Math.sin(8 * k + z * 0.1) +
        0.23 * Math.sin(15 * k - z * 0.12) +
        0.15 * Math.sin(23 * k + z * 0.14));
    return hill + 0.68 * ridges + crest - 0.016;
  }
  function geometry(p, c, idx) {
    let g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(p, 3));
    if (c) g.setAttribute('color', new T.Float32BufferAttribute(c, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }
  const dirt = new T.MeshStandardMaterial({ color: 0xffffff, roughness: 1 });
  dirt.onBeforeCompile = (s) => {
    s.vertexShader =
      'varying vec3 vLand;\n' +
      s.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvLand=position;');
    s.fragmentShader =
      `varying vec3 vLand;
 float dh(vec2 p){vec3 q=fract(p.xyx*.1031);q+=dot(q,q.yzx+33.33);return fract((q.x+q.y)*q.z);}float dn(vec2 uv,float cells){vec2 p=uv*(cells/128.),i=floor(p),f=fract(p);vec2 a=vec2(mod(i.x,cells),i.y),b=vec2(mod(i.x+1.,cells),i.y);f=f*f*(3.-2.*f);return mix(mix(dh(a),dh(b),f.x),mix(dh(a+vec2(0,1)),dh(b+vec2(0,1)),f.x),f.y);}\n` +
      s.fragmentShader.replace(
        '#include <color_fragment>',
        `#include <color_fragment>
 vec2 p=vLand.xz;float large=.62*dn(p,24.)+.26*dn(p,95.)+.12*dn(p,358.);float grains=dn(p,6080.);vec3 sand=mix(vec3(.42,.307,.214),vec3(.755,.623,.438),smoothstep(.12,.84,large));float pasture=smoothstep(.65,4.4,abs(p.y+.40*sin(p.x*.24544)))*.72+.22;sand=mix(sand,vec3(.565,.512,.324),pasture*smoothstep(.30,.68,large));sand*=.91+.12*dn(p,698.)+.12*(grains-.5);float farHill=smoothstep(28.,75.,abs(p.y));sand=mix(sand,mix(vec3(.374,.392,.366),vec3(.54,.48,.42),dn(p,23.)),farHill*.85);diffuseColor.rgb*=pow(sand,vec3(2.2));`,
      );
  };
  let p = [],
    idx = [];
  const nx = 112,
    nz = 160;
  for (let j = 0; j <= nz; j++)
    for (let i = 0; i <= nx; i++) {
      let x = (i / nx - 0.5) * L,
        z = (j / nz - 0.5) * 224;
      p.push(x, relief(x, z), z);
      if (i && j) {
        let n = j * (nx + 1) + i;
        idx.push(n - nx - 2, n - 1, n, n - nx - 2, n, n - nx - 1);
      }
    }
  const landGeo = geometry(p, null, idx),
    land = [];
  for (let i = -1; i <= 1; i++) {
    let o = new T.Mesh(landGeo, dirt);
    o.receiveShadow = true;
    G.add(o);
    land.push(o);
  }
  const sky = new T.Mesh(
    new T.SphereGeometry(195, 36, 24),
    new T.ShaderMaterial({
      side: T.BackSide,
      depthWrite: false,
      vertexShader: `varying vec3 dir;void main(){dir=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
      fragmentShader: `varying vec3 dir;float h(vec2 p){return fract(sin(dot(p,vec2(91.237,127.31)))*4387.219);}float ns(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+1.),f.x),f.y);}void main(){vec3 d=normalize(dir);float e=max(d.y,0.);vec3 c=mix(vec3(.886,.848,.744),vec3(.455,.648,.735),1.-exp(-e*3.8));vec2 uv=d.xz/max(.064,d.y+.04);float v=ns(uv*1.25)*.56+ns(uv*2.7)*.26+ns(uv*6.4)*.13+ns(uv*15.1)*.05;float clouds=smoothstep(.50,.82,v)*smoothstep(.005,.14,e)*.45;c=mix(c,vec3(.953,.925,.847),clouds);float s=max(dot(d,normalize(vec3(.38,.8,.52))),0.);c+=vec3(.11,.081,.038)*pow(s,16.);c=mix(c,vec3(1.,.96,.82),smoothstep(.99967,.9998,s));gl_FragColor=vec4(c,1.);}`,
    }),
  );
  sky.renderOrder = -10;
  G.add(sky);
  // A small mesh builder for tapered twigs, arched grass blades and compound leaves.
  class Batch {
    constructor() {
      this.p = [];
      this.c = [];
      this.i = [];
    }
    v(p, c) {
      this.p.push(p.x, p.y, p.z);
      this.c.push(c.r, c.g, c.b);
      return this.p.length / 3 - 1;
    }
    stem(a, b, r1, r2, c, n = 6) {
      let direction = b.clone().sub(a).normalize(),
        e = direction
          .clone()
          .cross(Math.abs(direction.y) < 0.88 ? unit : V(0, 0, 1))
          .normalize(),
        f = direction.clone().cross(e).normalize(),
        k = this.p.length / 3;
      for (let j = 0; j < 2; j++)
        for (let i = 0; i < n; i++) {
          let u = (i * TAU) / n,
            v = (j ? b : a)
              .clone()
              .addScaledVector(e, (j ? r2 : r1) * Math.cos(u))
              .addScaledVector(f, (j ? r2 : r1) * Math.sin(u));
          let col = c.clone().multiplyScalar(0.92 + 0.13 * Math.sin(u + 1));
          this.v(v, col);
          if (j) {
            let o = k + i,
              q = k + ((i + 1) % n);
            this.i.push(o, q, o + n, o + n, q, q + n);
          }
        }
    }
    mesh(m) {
      return new T.Mesh(geometry(this.p, this.c, this.i), m);
    }
  }
  const foliageM = new T.MeshLambertMaterial({ vertexColors: true, side: T.DoubleSide }),
    barkM = new T.MeshStandardMaterial({ vertexColors: true, roughness: 1, side: T.DoubleSide });
  function tree() {
    let wood = new Batch(),
      leaves = new Batch(),
      C = new T.Color(0x584533),
      leafA = new T.Color(0x515632),
      leafB = new T.Color(0x8c8952);
    let lean = V(between(-0.4, 0.4), 1.12, between(-0.32, 0.32)),
      elbow = lean.clone().add(V(between(-0.43, 0.43), 1.07, between(-0.4, 0.4)));
    wood.stem(V(0, -0.1, 0), lean, 0.226, 0.176, C, 10);
    wood.stem(lean, elbow, 0.175, 0.148, C, 9);
    function crown(center, rad) {
      let base = leafA.clone().lerp(leafB, rand() * 0.8);
      for (let k = 0; k < 103; k++) {
        let a = rand() * TAU,
          r = Math.sqrt(rand()),
          h = (1 - r * r) * 0.5;
        let v = center
          .clone()
          .add(V(Math.cos(a) * rad * r, rad * (h + between(-0.28, 0.12)), Math.sin(a) * rad * r));
        let tint = base.clone().multiplyScalar(0.72 + 0.46 * h + 0.31 * rand());
        let size = between(0.099, 0.225) * rad;
        for (let j = 0; j < 3; j++) {
          let b = rand() * TAU,
            dir = V(Math.cos(b), between(0.05, 0.58), Math.sin(b)),
            perp = V(-dir.z, 0, dir.x);
          let n = leaves.v(v, tint);
          leaves.v(
            v
              .clone()
              .addScaledVector(dir, size * 0.56)
              .addScaledVector(perp, size * 0.39),
            tint,
          );
          leaves.v(v.clone().addScaledVector(dir, size * 1.35), tint.clone().multiplyScalar(1.1));
          leaves.v(
            v
              .clone()
              .addScaledVector(dir, size * 0.46)
              .addScaledVector(perp, -size * 0.41),
            tint,
          );
          leaves.i.push(n, n + 1, n + 2, n, n + 2, n + 3);
        }
      }
    }
    let angle = rand() * TAU;
    for (let j = 0; j < 7; j++) {
      let a = angle + (j * TAU) / 7 + between(-0.22, 0.22),
        dir = V(Math.cos(a), 0, Math.sin(a)),
        start = j % 3 === 0 ? lean : elbow,
        length = between(1.45, 2.62);
      let b = start.clone().addScaledVector(dir, length * 0.7);
      b.y += between(0.51, 0.99);
      let c = b.clone().addScaledVector(dir, length * 0.43);
      c.y = between(3.21, 3.67);
      let fork = b
        .clone()
        .lerp(c, 0.53)
        .add(V(between(-0.18, 0.18), -0.156, between(-0.18, 0.18)));
      wood.stem(start, b, 0.122, 0.082, C, 8);
      wood.stem(b, fork, 0.083, 0.064, C, 7);
      wood.stem(fork, c, 0.065, 0.049, C, 6);
      for (let k = 0; k < 4; k++) {
        let t = a + between(-1.33, 1.33),
          d = V(Math.cos(t), 0, Math.sin(t)),
          s = c.clone().addScaledVector(d, between(0.52, 1.19));
        s.y += between(0.24, 0.56);
        wood.stem(c, s, 0.043, 0.02, C, 5);
        for (let n = 0; n < 2; n++) {
          let apex = s
            .clone()
            .add(V(between(-0.63, 0.63), between(0.2, 0.52), between(-0.61, 0.61)));
          wood.stem(s, apex, 0.02, 0.006, C, 4);
          crown(apex, between(0.78, 1.15));
        }
      }
    }
    let o = new T.Group(),
      tr = wood.mesh(barkM),
      lf = leaves.mesh(foliageM);
    o.add(tr, lf);
    return o;
  }
  // Shared tree geometries, and periodically repeated trunks whose local heights never pop.
  let variants = [tree(), tree()],
    trees = [];
  // Dappled canopy shadows are baked in the ground frame, so distant trees need no
  // expensive per-frame shadow-map draws. Sample the same triangles as the terrain.
  function groundAt(x, z) {
    let u = wrap(x / L + 0.5, 1) * nx,
      v = clamp(z / 224 + 0.5) * nz,
      i = Math.floor(u),
      j = Math.min(nz - 1, Math.floor(v)),
      a = (j * (nx + 1) + i) * 3 + 1;
    u -= i;
    v -= j;
    let b = p[a],
      right = p[a + 3],
      far = p[a + 3 * (nx + 1)],
      diag = p[a + 3 * (nx + 2)];
    return v > u
      ? (1 - v) * b + (v - u) * far + u * diag
      : (1 - u) * b + (u - v) * right + v * diag;
  }
  const stamp = document.createElement('canvas');
  stamp.width = stamp.height = 192;
  let brush = stamp.getContext('2d');
  brush.filter = 'blur(2px)';
  for (let j = 0; j < 340; j++) {
    let a = rand() * TAU,
      rr = Math.sqrt(rand()),
      x = 96 + rr * 73 * Math.cos(a),
      y = 96 + rr * 57 * Math.sin(a);
    brush.fillStyle = 'rgba(53,44,35,' + between(0.16, 0.48) + ')';
    brush.beginPath();
    brush.ellipse(x, y, between(3, 12), between(3, 9), rand() * TAU, 0, TAU);
    brush.fill();
  }
  let shadeM = new T.MeshBasicMaterial({
    map: new T.CanvasTexture(stamp),
    transparent: true,
    opacity: 0.38,
    depthWrite: false,
    side: T.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -1,
  });
  function treeShade(x, z, scale) {
    let ps = [],
      uv = [],
      ii = [];
    for (let j = 0; j <= 8; j++)
      for (let i = 0; i <= 8; i++) {
        let dx = ((i / 8 - 0.5) * 10 - 1.75) * scale,
          dz = ((j / 8 - 0.5) * 11 - 2.2) * scale;
        ps.push(dx, groundAt(x + dx, z + dz) + 0.041, dz);
        uv.push(i / 8, j / 8);
        if (i && j) {
          let n = j * 9 + i;
          ii.push(n - 10, n - 1, n, n - 10, n, n - 9);
        }
      }
    let g = geometry(ps, null, ii);
    g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
    let m = new T.Mesh(g, shadeM);
    G.add(m);
    return m;
  }
  function placeTree(x, z, s, i) {
    let o = variants[i % 2].clone();
    o.position.y = groundAt(x, z);
    o.scale.setScalar(s);
    o.rotation.y = rand() * TAU;
    G.add(o);
    trees.push({ o, x, z, shade: treeShade(x, z, s) });
  }
  placeTree(-16, -19, 0.94, 0);
  placeTree(16, -31, 0.81, 1);
  placeTree(38, -23, 1.08, 0);
  placeTree(-48, -29, 0.85, 1);
  for (let k = 0; k < 24; k++) {
    let z = k < 10 ? between(19, 54) : between(-70, -40);
    placeTree(between(-64, 64), z, between(0.55, 1.18), k);
  }
  // Ombre blades have a bent midrib; variation in tuft spacing leaves a lightly trodden strip.
  const chunks = new Map();
  let root = new T.Color(0x756946),
    pal = [0xc5a468, 0xc0af77, 0xa29b64, 0xb6a571, 0xb29960, 0xd2bd8b].map((c) => new T.Color(c));
  for (let i = 0; i < 27000; i++) {
    let x = between(-64, 64),
      z = rand() < 0.56 ? between(-9, 10) : between(-38, 36);
    let bare = smooth(0.68, 4.3, Math.abs(z + 0.38 * Math.sin(x * 0.26)));
    if (rand() > 0.19 + 0.81 * bare) continue;
    let y = groundAt(x, z),
      height =
        between(0.17, 0.52) * (0.25 + 0.75 * bare) * (0.85 + 0.25 * Math.sin(x * 0.45 + z * 0.62)),
      c = pal[Math.floor(rand() * pal.length)].clone().multiplyScalar(between(0.83, 1.15));
    let num = 4 + Math.floor(rand() * 6),
      key = Math.floor((x + 64) / 16) + ',' + Math.floor((z + 40) / 13);
    if (!chunks.has(key)) chunks.set(key, new Batch());
    let grass = chunks.get(key);
    for (let j = 0; j < num; j++) {
      let a = TAU * rand(),
        d = V(Math.cos(a), 0, Math.sin(a)),
        n = V(-d.z, 0, d.x),
        v = V(x + between(-0.066, 0.066), y - 0.008, z + between(-0.06, 0.06));
      let ht = height * between(0.6, 1.1),
        w = between(0.008, 0.02);
      let mid = v.clone().addScaledVector(d, ht * 0.22);
      mid.y += ht * 0.65;
      let tip = v.clone().addScaledVector(d, ht * between(0.43, 0.87));
      tip.y += ht;
      let k = grass.v(v.clone().addScaledVector(n, -w), root);
      grass.v(v.clone().addScaledVector(n, w), root);
      grass.v(mid.clone().addScaledVector(n, -0.58 * w), c);
      grass.v(mid.clone().addScaledVector(n, 0.58 * w), c);
      grass.v(tip, c.clone().multiplyScalar(1.14));
      grass.i.push(k, k + 1, k + 2, k + 2, k + 1, k + 3, k + 2, k + 3, k + 4);
      if (j === 0 && rand() < 0.24) {
        let m = tip.clone().addScaledVector(d, 0.047);
        m.y += 0.035;
        let s = grass.v(tip, c);
        grass.v(m.clone().addScaledVector(n, 0.009), c);
        grass.v(m.clone().addScaledVector(n, -0.009), c);
        grass.v(m.clone().addScaledVector(d, 0.039).addScaledVector(unit, 0.031), c);
        grass.i.push(s, s + 1, s + 2, s + 1, s + 3, s + 2);
      }
    }
  }
  const wind = { value: 0 };
  const grassMat = new T.MeshLambertMaterial({ vertexColors: true, side: T.DoubleSide });
  grassMat.onBeforeCompile = (s) => {
    s.uniforms.uWind = wind;
    s.vertexShader =
      'uniform float uWind;\n' +
      s.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>\nfloat sway=sin(position.x*1.02+position.z*.83+uWind)*.018+sin(position.x*2.8+uWind*1.6)*.008;transformed.x+=sway*smoothstep(.03,.30,position.y);`,
      );
  };
  let grassMesh = new T.Group();
  for (let chunk of chunks.values()) {
    let o = chunk.mesh(grassMat);
    o.receiveShadow = true;
    grassMesh.add(o);
  }
  let grassTiles = [grassMesh, grassMesh.clone(), grassMesh.clone()];
  grassTiles.forEach((o) => G.add(o));
  let rockG = new T.IcosahedronGeometry(1, 0),
    rockM = new T.MeshStandardMaterial({ color: 0x9b8865, roughness: 1 }),
    stones = new T.InstancedMesh(rockG, rockM, 240);
  let dummy = new T.Object3D();
  for (let i = 0; i < 240; i++) {
    let x = between(-64, 64),
      z = between(-15, 15),
      sc = between(0.023, 0.115) * (1 + 0.8 * smooth(2, 6, Math.abs(z)));
    dummy.position.set(x, relief(x, z), z);
    dummy.rotation.set(rand(), rand() * TAU, rand());
    dummy.scale.set(sc * 1.5, sc * 0.53, sc);
    dummy.updateMatrix();
    stones.setMatrixAt(i, dummy.matrix);
  }
  const rocks = [stones, stones.clone(), stones.clone()];
  rocks.forEach((o) => G.add(o));
  // The trackway is evaluated analytically from each landing, not accumulated frame by
  // frame. A scrubbed or slowed stride therefore leaves the same paired impressions.
  const tracks = [],
    print = document.createElement('canvas');
  print.width = 128;
  print.height = 96;
  const pen = print.getContext('2d');
  pen.filter = 'blur(1.5px)';
  for (let s of [-1, 1]) {
    pen.fillStyle = '#554533';
    pen.beginPath();
    pen.moveTo(13, 48 + s * 15);
    pen.bezierCurveTo(8, 48 + s * 39, 83, 48 + s * 35, 116, 48 + s * 8);
    pen.bezierCurveTo(91, 48 + s * 1, 28, 48 + s * 2, 13, 48 + s * 15);
    pen.fill();
  }
  let printTex = new T.CanvasTexture(print),
    puff = document.createElement('canvas');
  puff.width = puff.height = 96;
  const dctx = puff.getContext('2d');
  for (let j = 0; j < 19; j++) {
    let x = between(26, 68),
      y = between(27, 68),
      sz = between(10, 28),
      gr = dctx.createRadialGradient(x, y, 0, x, y, sz);
    gr.addColorStop(0, 'rgba(211,183,141,.30)');
    gr.addColorStop(1, 'rgba(211,183,141,0)');
    dctx.fillStyle = gr;
    dctx.fillRect(0, 0, 96, 96);
  }
  const dustTex = new T.CanvasTexture(puff);
  for (let { foot, offset } of animal.tracks) {
    let prints = [];
    for (let j = 0; j < 5; j++) {
      let mat = new T.MeshBasicMaterial({
        map: printTex,
        transparent: true,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -1,
      });
      let mesh = new T.Mesh(new T.PlaneGeometry(0.278, 0.145), mat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.y = -0.013;
      G.add(mesh);
      prints.push(mesh);
    }
    let dust = new T.Sprite(
      new T.SpriteMaterial({ map: dustTex, transparent: true, depthWrite: false, opacity: 0 }),
    );
    G.add(dust);
    tracks.push({ foot, offset, prints, dust });
  }
  return {
    group: G,
    update(distance, time, camera) {
      let cycles = distance / animal.stride;
      for (let { foot, offset, prints, dust } of tracks) {
        let u = wrap(cycles - offset, 1),
          landing = foot.x + animal.stride * animal.duty * 0.5;
        for (let j = 0; j < prints.length; j++) {
          let age = u + j,
            o = prints[j];
          o.position.set(landing - age * animal.stride + 0.025, -0.013, foot.z);
          o.material.opacity = 0.35 * Math.max(0, 1 - age / prints.length);
          o.visible = age > 0.045;
        }
        let age = wrap(u - animal.duty, 1);
        dust.visible = age < 0.32;
        if (dust.visible) {
          let f = age / 0.32;
          dust.position.set(
            landing - animal.stride * (animal.duty + age) - 0.08 * f,
            0.034 + 0.19 * f,
            foot.z + 0.05 * f,
          );
          dust.scale.set(0.14 + 0.34 * f, 0.1 + 0.24 * f, 1);
          dust.material.opacity = 0.21 * Math.sin(Math.PI * f) * (1 - f);
        }
      }
      let shift = wrap(distance + L * 0.5, L) - L * 0.5;
      wind.value = time;
      for (let i = 0; i < 3; i++) {
        let x = (i - 1) * L - shift;
        land[i].position.x = grassTiles[i].position.x = rocks[i].position.x = x;
        grassTiles[i].visible = Math.abs(x - camera.position.x) < 92;
        rocks[i].visible = grassTiles[i].visible;
      }
      for (let { o, x, z, shade } of trees) {
        shade.position.x = o.position.x = wrap(x - distance + 64, L) - 64;
        shade.position.z = o.position.z = z;
        let dx = o.position.x - camera.position.x,
          dz = z - camera.position.z;
        o.visible = dx * dx + dz * dz > 36 && dx * dx + dz * dz < 7000;
        shade.visible = o.visible && dx * dx + dz * dz < 3300;
      }
      sky.position.copy(camera.position);
    },
  };
}
