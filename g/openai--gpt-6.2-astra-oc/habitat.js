/* Photographic far field + world-space projected ground and near vegetation.
   The tracking camera stays with the animal; the ground moves at stance speed. */
window.makeHabitat = function (scene, renderer, ready) {
  const T = THREE,
    TAU = 2 * Math.PI;
  let seed = 793419;
  function rnd() {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  }
  const tex = new T.TextureLoader().load(window.PLAINS_IMAGE, ready);
  tex.wrapS = T.RepeatWrapping;
  tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  function soil(image) {
    let t = new T.TextureLoader().load(image);
    t.wrapS = t.wrapT = T.RepeatWrapping;
    t.anisotropy = tex.anisotropy;
    return t;
  }
  const veld = soil(VELD_FLOOR);
  veld.wrapS = veld.wrapT = T.MirroredRepeatWrapping;
  const uniforms = {
    pano: { value: tex },
    veld: { value: veld },
    straw: { value: soil(SAVANNA_SOIL) },
    earth: { value: soil(TRACK_SOIL) },
    travel: { value: 0 },
  };
  const sky = new T.Mesh(
    new T.SphereGeometry(145, 64, 32),
    new T.ShaderMaterial({
      side: T.BackSide,
      depthWrite: false,
      uniforms,
      vertexShader: `varying vec3 loc;void main(){vec4 w=modelMatrix*vec4(position,1.);loc=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}`,
      fragmentShader: `precision highp float;varying vec3 loc;uniform sampler2D pano,veld,straw,earth;uniform float travel;
  vec2 uvSphere(vec3 dir){return vec2(atan(dir.x,-dir.z)/6.2831853+.523,asin(clamp(dir.y,-1.,1.))/3.14159265+.5);}
  void main(){vec3 ray=normalize(loc-cameraPosition);vec3 c=texture2D(pano,uvSphere(ray)).rgb;
  if(ray.y<-.0001){float d=-cameraPosition.y/ray.y;vec2 p=cameraPosition.xz+ray.xz*d;
  vec2 tile=p+vec2(travel,0.);float variation=.5+.21*sin(tile.x*.41+tile.y*.74)+.16*sin(tile.x*1.71-tile.y*.85)+.13*cos(tile.x*.74-tile.y*1.32);
  vec3 stubble=texture2D(straw,tile*.45+vec2(.1*sin(tile.y*.49),.1*cos(tile.x*.29))).rgb*vec3(.89,.80,.68);
  vec3 dust=texture2D(earth,tile*.48).rgb*vec3(1.06,.98,.91);float trail=1.-smoothstep(.30,3.65,abs(tile.y+.7*sin(tile.x*.23))+.75*variation);
  vec2 fieldUV=tile*.244+vec2(.12*cos(tile.y*.44),.11*sin(tile.x*.40));
  vec3 meadow=texture2D(veld,fieldUV).rgb;meadow=mix(meadow,texture2D(veld,mat2(.78,.62,-.62,.78)*fieldUV*.79+vec2(8.1,4.7)).rgb,smoothstep(.24,.78,variation));
  vec3 nearCol=mix(meadow,mix(stubble,dust,.63+.25*variation),clamp(.18+.55*trail+.28*variation-.11*cos(tile.x*.77),0.,1.))*(.94+.13*variation);
  vec3 farCol=texture2D(pano,uvSphere(normalize(vec3(ray.x*d,-1.65,ray.z*d)))).rgb;
  c=mix(nearCol,farCol,smoothstep(15.,34.,d));c=mix(c,texture2D(pano,uvSphere(ray)).rgb,smoothstep(34.,88.,d));}
  c=mix(vec3(dot(c,vec3(.30,.59,.11))),c,.92);c*=vec3(1.035,1.006,.965);gl_FragColor=vec4(c,1.);}`,
    }),
  );
  sky.renderOrder = -10;
  scene.add(sky);
  // Real shadow map on a transparent receiver keeps the photographic soil visible.
  const ground = new T.Mesh(
    new T.PlaneGeometry(22, 20),
    new T.ShadowMaterial({ color: 0x302612, opacity: 0.3 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
  const hemi = new T.HemisphereLight(0xffe7c6, 0xe4c19f, 1.65);
  scene.add(hemi);
  const sun = new T.DirectionalLight(0xffdbaf, 2.1);
  sun.position.set(5.2, 6.8, -3.2);
  sun.target.position.set(0, 1.6, 0);
  scene.add(sun, sun.target);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, {
    left: -6,
    right: 6,
    bottom: -6,
    top: 6,
    near: 0.1,
    far: 24,
  });
  sun.shadow.bias = -0.0003;
  sun.shadow.normalBias = 0.011;
  sun.shadow.radius = 3;
  const rim = new T.DirectionalLight(0xffecd1, 1.28);
  rim.position.set(-2, 4, 5);
  scene.add(rim);
  function contactMap() {
    let c = document.createElement("canvas");
    c.width = c.height = 128;
    let g = c.getContext("2d"),
      a = g.createRadialGradient(64, 64, 1, 64, 64, 62);
    a.addColorStop(0, "rgba(40,29,16,.38)");
    a.addColorStop(0.38, "rgba(47,35,19,.23)");
    a.addColorStop(1, "rgba(52,39,19,0)");
    g.fillStyle = a;
    g.fillRect(0, 0, 128, 128);
    return new T.CanvasTexture(c);
  }
  const ao = contactMap(),
    shadow = new T.Mesh(
      new T.PlaneGeometry(3.8, 1.4),
      new T.MeshBasicMaterial({
        map: ao,
        transparent: true,
        depthWrite: false,
        toneMapped: false,
      }),
    );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.007;
  scene.add(shadow);
  const contacts = Array.from({ length: 4 }, () => {
    let o = new T.Mesh(
      new T.PlaneGeometry(0.56, 0.34),
      new T.MeshBasicMaterial({
        map: ao,
        color: 0x554838,
        transparent: true,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    o.rotation.x = -Math.PI / 2;
    scene.add(o);
    return o;
  });
  const treeMap = new T.TextureLoader().load(THORN_TREE);
  treeMap.colorSpace = T.SRGBColorSpace;
  treeMap.anisotropy = 4;
  const trees = [];
  function tree(x, z, h, w) {
    const m = new T.MeshBasicMaterial({
      map: treeMap,
      transparent: true,
      alphaTest: 0.09,
      depthWrite: false,
      side: T.DoubleSide,
      toneMapped: false,
    });
    m.onBeforeCompile = (s) => {
      s.fragmentShader = s.fragmentShader.replace(
        "#include <opaque_fragment>",
        "outgoingLight=mix(outgoingLight,vec3(.45,.335,.195),.095);\n#include <opaque_fragment>",
      );
    };
    const o = new T.Mesh(new T.PlaneGeometry(h * w, h), m);
    o.position.set(x, h / 2 - 0.08, z);
    scene.add(o);
    trees.push({ o, x, z });
  }
  tree(-15, -16, 6.3, 2.02);
  tree(25, -42, 4.3, -1.74);
  tree(-43, -48, 3.7, -2.3);
  tree(50, -17, 5, 1.8);
  tree(18, 37, 6, 1.94);
  tree(-28, 26, 5.4, -1.92);
  // Sprays of narrow, bent straw with a few branched seed heads. Each patch
  // has two intersecting cards so the meadow remains volumetric on orbit.
  let gt = new T.TextureLoader().load(DRY_GRASS);
  gt.anisotropy = 4;
  const verts = [],
    uv = [],
    colors = [];
  for (let i = 0; i < 3400; i++) {
    let x = rnd() * 48 - 24,
      z = rnd() * 42 - 21;
    let density =
      0.5 +
      0.21 * Math.sin(x * 0.41 + z * 0.74) +
      0.16 * Math.sin(x * 1.71 - z * 0.85) +
      0.13 * Math.cos(x * 0.74 - z * 1.32);
    let track = Math.min(1, Math.abs(z + 0.7 * Math.sin(x * 0.23)) / 2.7);
    if (rnd() > 0.22 + 0.8 * density * track) continue;
    let h =
        (0.13 + 0.58 * rnd() ** 1.5) *
        (0.42 + 0.58 * track) *
        (0.7 + 0.6 * density),
      w = h * (0.79 + rnd() * 0.65),
      a = rnd() * TAU,
      shade = 0.57 + rnd() * 0.28,
      offset = Math.floor(rnd() * 4) * 0.25;
    for (let k = 0; k < 2; k++) {
      let dx = (Math.cos(a) * w) / 2,
        dz = (Math.sin(a) * w) / 2;
      a += 1.57;
      verts.push(
        x - dx,
        -0.025,
        z - dz,
        x + dx,
        -0.025,
        z + dz,
        x + dx,
        h,
        z + dz,
        x - dx,
        -0.025,
        z - dz,
        x + dx,
        h,
        z + dz,
        x - dx,
        h,
        z - dz,
      );
      uv.push(
        offset,
        0,
        offset + 0.25,
        0,
        offset + 0.25,
        1,
        offset,
        0,
        offset + 0.25,
        1,
        offset,
        1,
      );
      for (let j = 0; j < 6; j++)
        colors.push(shade, shade * 0.95, shade * 0.86);
    }
  }
  const geom = new T.BufferGeometry();
  geom.setAttribute("position", new T.Float32BufferAttribute(verts, 3));
  geom.setAttribute("uv", new T.Float32BufferAttribute(uv, 2));
  geom.setAttribute("color", new T.Float32BufferAttribute(colors, 3));
  const grassMat = new T.MeshBasicMaterial({
    map: gt,
    vertexColors: true,
    transparent: true,
    alphaTest: 0.03,
    depthWrite: false,
    side: T.DoubleSide,
    toneMapped: false,
  });
  grassMat.onBeforeCompile = (s) => {
    s.fragmentShader = s.fragmentShader.replace(
      "#include <map_fragment>",
      `vec4 blade=texture2D(map,vMapUv);float h=smoothstep(0.,.9,vMapUv.y);diffuseColor.rgb*=mix(vec3(.154,.083,.040),vec3(.69,.469,.235),clamp((blade.g-.16)*1.7+h*.12,0.,1.));diffuseColor.a*=blade.r;`,
    );
  };
  let grass = [];
  for (let i = -1; i <= 1; i++) {
    let m = new T.Mesh(geom, grassMat);
    m.renderOrder = 2;
    scene.add(m);
    grass.push(m);
  }
  function update(dist, camera, hooves) {
    uniforms.travel.value = dist;
    trees.forEach(({ o, x, z }) => {
      o.position.x = ((((x - dist + 60) % 120) + 120) % 120) - 60;
      o.rotation.y = Math.atan2(
        camera.position.x - o.position.x,
        camera.position.z - z,
      );
    });
    grass.forEach(
      (m, i) => (m.position.x = (i - 1) * 48 - ((dist + 24) % 48) + 24),
    );
    contacts.forEach((o, i) => {
      let p = hooves[i].position;
      o.position.set(p.x + 0.025, 0.009, p.z);
      o.material.opacity = Math.max(0.04, 1.1 - 3.5 * p.y);
      o.scale.setScalar(1 + Math.max(0, p.y) * 2);
    });
  }
  return { update };
};
