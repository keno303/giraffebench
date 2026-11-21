/* A photographic horizon behind a moving 3D foreground with reprojected soil.
   Color plates are bundled as data URLs so WebGL does not need file:// image permissions. */
"use strict";
function makeHabitat(scene, renderer) {
  const R = rng(3284994),
    span = 96,
    haze = 0xdac7a8;
  scene.fog = new THREE.FogExp2(haze, 0.023);
  const hemi = new THREE.HemisphereLight(0xfff5ec, 0xc5aa8e, 1.67);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffe6c4, 2.05);
  sun.position.set(-6.5, 5.9, 3.2);
  sun.target.position.set(0.2, 1.5, 0);
  scene.add(sun, sun.target);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, {
    left: -4.8,
    right: 5.4,
    top: 5.3,
    bottom: -4.8,
    near: 0.05,
    far: 22,
  });
  sun.shadow.bias = -0.00028;
  sun.shadow.normalBias = 0.007;
  const rim = new THREE.DirectionalLight(0xffddb1, 0.87);
  rim.position.set(-4.2, 3.6, -6);
  scene.add(rim);
  let skyMaterial = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: { plate: { value: atlasTexture("plains") } },
    vertexShader: `varying vec3 dir;void main(){dir=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader: `varying vec3 dir;uniform sampler2D plate;void main(){vec3 d=normalize(dir);vec2 uv=vec2(.976+atan(d.x,-d.z)/6.283185,.5+asin(d.y)/3.14159265);vec3 c=texture2D(plate,uv).rgb;gl_FragColor=vec4(mix(c,vec3(.73,.635,.516),.075*exp(-abs(d.y)*9.)),1.);\n#include <colorspace_fragment>\n}`,
  });
  skyMaterial.uniforms.plate.value.wrapS = THREE.RepeatWrapping;
  let sky = mesh(new THREE.SphereGeometry(120, 40, 22), skyMaterial, scene);
  sky.castShadow = sky.receiveShadow = false;
  sky.renderOrder = -15;
  let scroll = { value: 0 },
    walk = { value: 0 },
    loam = atlasTexture("loam"),
    straw = atlasTexture("understory");
  loam.wrapS = loam.wrapT = straw.wrapS = straw.wrapT = THREE.RepeatWrapping;
  let land = material(0xffffff);
  land.transparent = true;
  land.depthWrite = false;
  land.onBeforeCompile = (s) => {
    s.uniforms.loam = { value: loam };
    s.uniforms.straw = { value: straw };
    s.uniforms.travel = scroll;
    s.vertexShader =
      "varying vec2 landSite;\n" +
      s.vertexShader.replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\nlandSite=(modelMatrix*vec4(position,1.)).xz;",
      );
    s.fragmentShader = s.fragmentShader
      .replace(
        "void main() {",
        `uniform sampler2D loam;uniform sampler2D straw;uniform float travel;varying vec2 landSite;
float hh(vec2 p){p=fract(p*.31831+vec2(.33,.75));p+=dot(p,p+19.19);return fract(p.x*p.y);}float nn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hh(i),hh(i+vec2(1,0)),f.x),mix(hh(i+vec2(0,1)),hh(i+1.),f.x),f.y);}void main(){`,
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
vec2 p=landSite+vec2(travel,0.);float m=nn(p*.59)*.62+nn(p*1.87+8.)*.25+nn(p*5.)*.13;float path=1.-smoothstep(.24,1.46,abs(p.y+.30*sin(p.x*.40)+.35*sin(p.x*.126))+.64*(m-.5));vec2 pc=p*.55+.066*vec2(nn(p*.24),nn(p*.26+7.));vec3 dirt=texture2D(loam,pc).rgb;vec2 tile=p*.26;vec2 ii=floor(tile),f=fract(tile),t=f*f*(3.-2.*f);vec3 h0=texture2D(straw,tile+vec2(hh(ii),hh(ii+13.))).rgb,h1=texture2D(straw,tile+vec2(hh(ii+vec2(1,0)),hh(ii+vec2(14,13)))).rgb,h2=texture2D(straw,tile+vec2(hh(ii+vec2(0,1)),hh(ii+vec2(13,14)))).rgb,h3=texture2D(straw,tile+vec2(hh(ii+1.),hh(ii+14.))).rgb;vec3 hay=mix(mix(h0,h1,t.x),mix(h2,h3,t.x),t.y);float dry=clamp(.07+.67*path+.24*smoothstep(.47,.69,m),0.,.92);vec3 ground=mix(hay*vec3(1.18,1.21,1.16),dirt*vec3(.79,.78,.76),dry);ground*=.91+.12*nn(p*.7)+.12*nn(p*.24+4.);diffuseColor.rgb*=ground;diffuseColor.a*=1.-smoothstep(10.+m*3.,23.+m*2.,length(landSite));`,
      );
  };
  let ground = new THREE.Mesh(new THREE.PlaneGeometry(65, 65), land);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.008;
  ground.receiveShadow = true;
  ground.renderOrder = -4;
  scene.add(ground);
  let ac = document.createElement("canvas");
  ac.width = ac.height = 128;
  let ctx = ac.getContext("2d"),
    gradient = ctx.createRadialGradient(64, 64, 1, 64, 64, 64);
  gradient.addColorStop(0, "rgba(54,40,27,.74)");
  gradient.addColorStop(0.4, "rgba(54,40,27,.40)");
  gradient.addColorStop(1, "rgba(60,45,27,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 128, 128);
  let shadeMap = new THREE.CanvasTexture(ac);
  shadeMap.colorSpace = THREE.SRGBColorSpace;
  function shade(x, z, w, h, opacity) {
    let o = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ map: shadeMap, transparent: true, depthWrite: false, opacity }),
    );
    o.rotation.x = -Math.PI / 2;
    o.position.set(x, -0.003, z);
    scene.add(o);
    o.renderOrder = 1;
    return o;
  }
  shade(-0.07, 0, 3.26, 1.54, 0.48);
  let contacts = Array.from({ length: 4 }, () => shade(0, 0, 0.4, 0.25, 0.69));
  // Slender photographed blades in non-uniform stands. An upturned normal simulates transmission through the straw.
  let grassMat = new THREE.MeshBasicMaterial({
    map: atlasTexture("grasses"),
    transparent: true,
    depthWrite: false,
    alphaTest: 0.012,
    side: THREE.FrontSide,
    vertexColors: true,
  });
  grassMat.onBeforeCompile = (s) => {
    s.uniforms.windTime = walk;
    s.vertexShader =
      "uniform float windTime;\n" +
      s.vertexShader.replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>\ntransformed.x+=position.y*position.y*(.16*sin(windTime+position.x*.84+position.z*.55)+.089*sin(windTime*2.31+position.z*1.72));`,
      );
    s.fragmentShader = s.fragmentShader.replace(
      "#include <color_fragment>",
      `#include <color_fragment>\ndiffuseColor.rgb*=vec3(1.13,1.098,1.025);`,
    );
  };
  const detail = detailedGrass(scene),
    footfalls = makeTracks(scene),
    tiles = [],
    tileLen = 12;
  for (let id = 0; id < 8; id++) {
    let p = [],
      uv = [],
      col = [],
      normal = [],
      idx = [];
    for (let j = 0; j < 4850; j++) {
      let x = R() * tileLen,
        z = (R() - 0.5) * 41.0;
      let wx = id * tileLen + x,
        trail = Math.abs(z + 0.3 * Math.sin(wx * 0.4) + 0.35 * Math.sin(wx * 0.126));
      let region =
        0.48 +
        0.21 * Math.sin(wx * 1.04 + z * 0.77) +
        0.17 * Math.sin(z * 1.73 - wx * 0.66) +
        0.14 * Math.cos(wx * 0.32 + z * 0.57);
      if (
        R() > region * 0.92 + 0.04 ||
        (trail < 0.63 && R() < 0.96) ||
        (trail < 1.38 && R() < 0.65)
      )
        continue;
      let a = R() * TAU,
        v = Math.floor(R() * 4),
        r = R(),
        h = (0.097 + 0.245 * region + 0.38 * r * r * r) * (trail < 1.05 ? 0.49 : 1);
      let w = h * (0.82 + 0.51 * R());
      let cs = 0.81 + 0.23 * R(),
        base = 0.58 + 0.17 * R();
      for (let k = 0; k < 2; k++) {
        let b = a + k * 1.49,
          dx = Math.cos(b) * w * 0.5,
          dz = Math.sin(b) * w * 0.5,
          n = p.length / 3,
          lean = 0.03 * (R() - 0.5);
        p.push(
          x - dx,
          -0.021,
          z - dz,
          x + dx,
          -0.021,
          z + dz,
          x + dx + lean,
          h,
          z + dz,
          x - dx + lean,
          h,
          z - dz,
        );
        uv.push(
          v / 4 + 0.00025,
          0,
          (v + 1) / 4 - 0.00025,
          0,
          (v + 1) / 4 - 0.00025,
          1,
          v / 4 + 0.00025,
          1,
        );
        for (let l = 0; l < 4; l++) {
          let lum = l < 2 ? base : cs;
          col.push(lum, lum * 0.99, lum * 0.95);
          normal.push(0.15 * Math.cos(b), 0.98, 0.15 * Math.sin(b));
        }
        idx.push(n, n + 1, n + 2, n, n + 2, n + 3, n, n + 2, n + 1, n, n + 3, n + 2);
      }
    }
    let g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(p, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(normal, 3));
    g.setIndex(idx);
    let o = new THREE.Mesh(g, grassMat);
    o.renderOrder = 2;
    scene.add(o);
    tiles.push(o);
  }
  // Wind-trained acacia: forked trunk, fine ramification, irregular pads of leaflets.
  function acacia(seed) {
    const r = rng(seed),
      P = [],
      C = [],
      I = [];
    function emit(v, c) {
      let n = P.length / 3;
      P.push(v.x, v.y, v.z);
      C.push(c.r, c.g, c.b);
      return n;
    }
    function limb(a, b, r0, r1) {
      let d = b.clone().sub(a).normalize(),
        u = V(0, 0, 1).cross(d).normalize(),
        v = d.clone().cross(u);
      let n = P.length / 3,
        K = 7;
      for (let j = 0; j < 2; j++)
        for (let k = 0; k < K; k++) {
          let t = (TAU * k) / K,
            rr = j ? r1 : r0;
          emit(
            (j ? b : a)
              .clone()
              .addScaledVector(u, Math.cos(t) * rr)
              .addScaledVector(v, Math.sin(t) * rr),
            new THREE.Color(0x625144).multiplyScalar(0.67 + r() * 0.28),
          );
        }
      for (let k = 0; k < K; k++) {
        let k1 = (k + 1) % K;
        I.push(n + k, n + k1, n + K + k, n + k1, n + K + k1, n + K + k);
      }
    }
    function canopy(p, rad) {
      let c = new THREE.Color().setHSL(
        0.174 + r() * 0.042,
        0.21 + r() * 0.096,
        0.173 + r() * 0.108,
        THREE.SRGBColorSpace,
      );
      for (let j = 0; j < 179; j++) {
        let t = r() * TAU,
          s = Math.sqrt(r()),
          x = p.x + rad * s * Math.cos(t),
          z = p.z + rad * 0.87 * s * Math.sin(t),
          y = p.y + rad * (0.24 * (1 - s * s) + r() * 0.15);
        let rr = rad * (0.071 + r() * 0.135),
          n = P.length / 3,
          h = rr * (0.28 + r() * 0.35),
          cl = c.clone().multiplyScalar(0.73 + 0.51 * r());
        emit(V(x, y + h, z), cl.clone().multiplyScalar(1.17));
        for (let k = 0; k < 6; k++) {
          let a = (k / 6) * TAU;
          emit(
            V(x + Math.cos(a) * rr * (0.65 + r() * 0.6), y - r() * 0.049, z + Math.sin(a) * rr),
            cl,
          );
        }
        for (let k = 0; k < 6; k++) I.push(n, n + 1 + ((k + 1) % 6), n + 1 + k);
      }
    }
    let a = V(0, 0, 0),
      b = V(-0.16 + r() * 0.32, 0.86 + r() * 0.49, -0.05),
      middle = a
        .clone()
        .lerp(b, 0.59)
        .add(V(-0.14 + r() * 0.22, 0, 0.06));
    limb(a, middle, 0.13, 0.101);
    limb(middle, b, 0.107, 0.084);
    for (let j = 0; j < 5; j++) {
      let t = (j * TAU) / 5 + r() * 0.56,
        f = 0.52 + r() * 0.77,
        start = b.clone().add(V(0, -r() * 0.21, 0)),
        end = start.clone().add(V(Math.cos(t) * f, 0.61 + r() * 0.58, Math.sin(t) * f));
      let m = start
        .clone()
        .lerp(end, 0.54)
        .add(V(-0.13 * r(), -0.101, 0.08));
      limb(start, m, 0.078, 0.055);
      limb(m, end, 0.059, 0.039);
      for (let k = 0; k < 3; k++) {
        let tt = t + (r() - 0.5) * 2.6,
          ll = 0.34 + r() * 0.72,
          tip = end.clone().add(V(Math.cos(tt) * ll, 0.28 + r() * 0.39, Math.sin(tt) * ll));
        let joint = end
          .clone()
          .lerp(tip, 0.5)
          .add(V(0.07, -0.09, -0.04));
        limb(end, joint, 0.039, 0.025);
        limb(joint, tip, 0.024, 0.015);
        for (let q = 0; q < 3; q++) {
          let dt = tt + (r() - 0.5) * 2.9,
            ll = r() * 0.48 + 0.12,
            twig = tip.clone().add(V(Math.cos(dt) * ll, 0.09 + r() * 0.28, Math.sin(dt) * ll));
          limb(tip, twig, 0.014, 0.004);
          canopy(twig, 0.24 + r() * 0.31);
        }
      }
    }
    let g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(P, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(C, 3));
    g.setIndex(I);
    g.computeVertexNormals();
    return g;
  }
  let trees = [],
    wood = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  let shapes = Array.from({ length: 3 }, (_, i) => acacia(122 + 528 * i));
  function tree(x, z, size, i) {
    let o = new THREE.Mesh(shapes[i % 3], wood);
    o.position.set(x, 0, z);
    o.rotation.y = R() * TAU;
    o.scale.setScalar(size);
    scene.add(o);
    trees.push({ o, x });
  }
  tree(-10.5, -14.4, 1.11, 0);
  tree(14.8, -27, 0.6, 2);
  tree(-19, 16, 0.93, 0);
  tree(9.7, 23, 0.73, 2);
  for (let i = 0; i < 9; i++) {
    let x = (R() - 0.5) * span,
      z = (R() > 0.5 ? 1 : -1) * (18 + R() * 17);
    if (Math.abs(x) < 14) continue;
    tree(x, z, 0.49 + R() * 0.52, i);
  }
  // Small, partially buried nodules (the surrounding ground plate supplies the finer gravel).
  let geo = new THREE.DodecahedronGeometry(1, 0),
    mat = material(0x9e8c77);
  let stones = new THREE.InstancedMesh(geo, mat, 720),
    dummy = new THREE.Object3D(),
    rocks = [];
  for (let j = 0; j < 720; j++) {
    let x = (R() - 0.5) * span,
      z = (R() - 0.5) * 36,
      r = 0.018 + 0.076 * Math.pow(R(), 3);
    rocks.push([x, z, r, R() * TAU]);
    stones.setColorAt(j, new THREE.Color().setScalar(0.56 + R() * 0.38));
  }
  scene.add(stones);
  stones.frustumCulled = false;
  const wrap = (x) => ((((x + span / 2) % span) + span) % span) - span / 2;
  function update(distance, time, camera, legs) {
    sky.position.copy(camera.position);
    detail(distance, time, camera);
    footfalls(time);
    scroll.value = distance;
    walk.value = time;
    for (let i = 0; i < tiles.length; i++)
      tiles[i].position.x = wrap(i * tileLen - distance + 0.5 * tileLen) - 0.5 * tileLen;
    for (let t of trees) t.o.position.x = wrap(t.x - distance);
    for (let j = 0; j < rocks.length; j++) {
      let [x, z, r, a] = rocks[j];
      dummy.position.set(wrap(x - distance), -0.017, z);
      dummy.scale.set(r * 1.65, r * 0.48, r * 0.91);
      dummy.rotation.set(0.18, a, 0.14 * Math.cos(a));
      dummy.updateMatrix();
      stones.setMatrixAt(j, dummy.matrix);
    }
    stones.instanceMatrix.needsUpdate = true;
    legs.forEach((l, i) => {
      let f = l.foot.position;
      contacts[i].position.x = f.x;
      contacts[i].position.z = f.z;
      contacts[i].material.opacity = clamp(0.79 - (f.y - 0.103) * 2.4, 0.09, 0.79);
    });
  }
  return { update };
}
