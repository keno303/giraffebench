/* Savanna environment: sky, ground, grass, acacias, rocks, lighting. */
(function () {
  'use strict';
  var T = THREE;
  var TX = window.GiraffeTextures;

  function World(scene, renderer) {
    this.scene = scene;
    this.renderer = renderer;
    this.env = new T.Group();
    scene.add(this.env);
    this.sunOffset = new T.Vector3(19, 21, 14);
    this.buildSky();
    this.buildLights();
    this.buildGround();
    this.buildGrass();
    this.buildTrees();
    this.buildRocks();
    this.buildHills();
    this.buildDust();
  }

  World.prototype.buildSky = function () {
    var geo = new T.SphereGeometry(400, 32, 20);
    var mat = new T.ShaderMaterial({
      side: T.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        topColor: { value: new T.Color(0x2f6fb5) },
        midColor: { value: new T.Color(0x8db6d8) },
        horizonColor: { value: new T.Color(0xf0e2c6) },
        sunColor: { value: new T.Color(0xfff3d0) },
        sunDir: { value: this.sunOffset.clone().normalize() }
      },
      vertexShader: [
        'varying vec3 vDir;',
        'void main() {',
        '  vDir = normalize(position);',
        '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
        '}'
      ].join('\n'),
      fragmentShader: [
        'varying vec3 vDir;',
        'uniform vec3 topColor; uniform vec3 midColor; uniform vec3 horizonColor;',
        'uniform vec3 sunColor; uniform vec3 sunDir;',
        'void main() {',
        '  float h = clamp(vDir.y, -0.1, 1.0);',
        '  vec3 col = mix(horizonColor, midColor, smoothstep(0.0, 0.12, h));',
        '  col = mix(col, topColor, smoothstep(0.10, 0.65, h));',
        '  col = mix(col, horizonColor * 1.02, exp(-max(h, 0.0) * 14.0) * 0.5);',
        '  float sd = max(dot(normalize(vDir), normalize(sunDir)), 0.0);',
        '  col += sunColor * pow(sd, 420.0) * 2.2;',
        '  col += sunColor * pow(sd, 9.0) * 0.16;',
        '  gl_FragColor = vec4(col, 1.0);',
        '}'
      ].join('\n')
    });
    this.sky = new T.Mesh(geo, mat);
    this.sky.frustumCulled = false;
    this.env.add(this.sky);

    // sun glow sprite
    var tex = TX.makeSoftCircle(128, 'rgba(255,246,214,0.95)', 'rgba(255,238,190,0)');
    var spr = new T.Sprite(new T.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, blending: T.AdditiveBlending, fog: false }));
    spr.scale.set(46, 46, 1);
    spr.position.copy(this.sunOffset).normalize().multiplyScalar(330);
    this.env.add(spr);
  };

  World.prototype.buildLights = function () {
    this.hemi = new T.HemisphereLight(0xbcd8f2, 0x8b7048, 0.5);
    this.scene.add(this.hemi);

    this.ambient = new T.AmbientLight(0xffffff, 0.09);
    this.scene.add(this.ambient);

    // warm rim light from behind, to separate the animal from the background
    this.rim = new T.DirectionalLight(0xffe6c2, 0.32);
    this.rim.position.set(-16, 12, -14);
    this.scene.add(this.rim);

    var sun = new T.DirectionalLight(0xfff1d4, 1.15);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -9.5;
    sun.shadow.camera.right = 9.5;
    sun.shadow.camera.top = 9.5;
    sun.shadow.camera.bottom = -9.5;
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 95;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.02;
    sun.shadow.radius = 2;
    this.sun = sun;
    this.sunTarget = new T.Object3D();
    this.scene.add(this.sunTarget);
    sun.target = this.sunTarget;
    this.scene.add(sun);
  };

  World.prototype.buildGround = function () {
    var tex = TX.makeGroundTexture(512, 21);
    tex.repeat.set(70, 70);
    tex.anisotropy = 8;
    var mat = new T.MeshStandardMaterial({ map: tex, color: 0xd6c6a6, roughness: 1.0, metalness: 0.0 });
    var geo = new T.PlaneGeometry(420, 420, 1, 1);
    var ground = new T.Mesh(geo, mat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.env.add(ground);
    this.ground = ground;
  };

  World.prototype.buildGrass = function () {
    var w = 0.55, h = 0.42;
    var geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.Float32BufferAttribute([
      -w / 2, 0, 0, w / 2, 0, 0, w / 2, h, 0, -w / 2, h, 0,
      0, 0, -w / 2, 0, 0, w / 2, 0, h, w / 2, 0, h, -w / 2
    ], 3));
    geo.setAttribute('uv', new T.Float32BufferAttribute([
      0, 0, 1, 0, 1, 1, 0, 1,
      0, 0, 1, 0, 1, 1, 0, 1
    ], 2));
    geo.setIndex([0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7]);
    geo.computeVertexNormals();

    var tex = TX.makeGrassTexture(128);
    var mat = new T.MeshStandardMaterial({
      map: tex, alphaTest: 0.42, side: T.DoubleSide, roughness: 1.0, metalness: 0.0,
      color: 0xffffff
    });
    // gentle wind: sway the tips of each tuft in the vertex shader
    mat.onBeforeCompile = function (shader) {
      shader.uniforms.uTime = { value: 0 };
      mat.userData.shader = shader;
      shader.vertexShader = 'uniform float uTime;\n' + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', [
        '#include <begin_vertex>',
        'float wPhase = instanceMatrix[3].x * 0.33 + instanceMatrix[3].z * 0.27;',
        'float wAmt = uv.y * uv.y;',
        'transformed.x += sin(uTime * 1.6 + wPhase) * 0.09 * wAmt;',
        'transformed.z += cos(uTime * 1.25 + wPhase * 1.3) * 0.06 * wAmt;'
      ].join('\n'));
    };
    var count = 3200;
    var mesh = new T.InstancedMesh(geo, mat, count);
    mesh.receiveShadow = true;
    var rnd = TX.mulberry32(2024);
    var dummy = new T.Object3D();
    var col = new T.Color();
    for (var i = 0; i < count; i++) {
      var a = rnd() * Math.PI * 2;
      var r = Math.sqrt(rnd()) * 62 + 1.2;
      var x = Math.cos(a) * r;
      var z = Math.sin(a) * r;
      dummy.position.set(x, 0, z);
      dummy.rotation.set(0, rnd() * Math.PI * 2, 0);
      var s = 0.55 + rnd() * 1.1;
      dummy.scale.set(s, s * (0.7 + rnd() * 0.7), s);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      var v = 0.78 + rnd() * 0.42;
      col.setRGB(v, v * (0.96 + rnd() * 0.1), v * 0.88);
      mesh.setColorAt(i, col);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    this.env.add(mesh);
    this.grass = mesh;
  };

  World.prototype.buildTrees = function () {
    var rnd = TX.mulberry32(808);
    var barkTex = TX.makeBarkTexture(256);
    barkTex.repeat.set(2, 1);
    var barkMat = new T.MeshStandardMaterial({ map: barkTex, color: 0x8a7a62, roughness: 1.0 });
    var leafMat = new T.MeshStandardMaterial({ color: 0x4a5730, roughness: 1.0, flatShading: true });
    var leafMat2 = new T.MeshStandardMaterial({ color: 0x5d6b3a, roughness: 1.0, flatShading: true });
    var group = new T.Group();
    for (var i = 0; i < 14; i++) {
      var a = rnd() * Math.PI * 2;
      var r = 22 + rnd() * 55;
      var tree = new T.Group();
      tree.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
      var s = 0.8 + rnd() * 1.2;
      tree.scale.setScalar(s);
      var h = 2.6 + rnd() * 1.8;

      var trunk = new T.Mesh(new T.CylinderGeometry(0.10, 0.22, h, 7, 2), barkMat);
      trunk.position.y = h / 2;
      trunk.rotation.z = (rnd() - 0.5) * 0.12;
      trunk.castShadow = true;
      tree.add(trunk);

      var branches = 3 + ((rnd() * 2) | 0);
      for (var b = 0; b < branches; b++) {
        var ba = rnd() * Math.PI * 2;
        var bl = 1.4 + rnd() * 1.6;
        var br = new T.Mesh(new T.CylinderGeometry(0.035, 0.09, bl, 6), barkMat);
        br.position.set(Math.cos(ba) * bl * 0.3, h + bl * 0.35, Math.sin(ba) * bl * 0.3);
        br.rotation.z = Math.cos(ba) * 0.9;
        br.rotation.x = -Math.sin(ba) * 0.9;
        br.castShadow = true;
        tree.add(br);
      }

      var pads = 4 + ((rnd() * 3) | 0);
      for (var p = 0; p < pads; p++) {
        var pa = rnd() * Math.PI * 2;
        var pr = rnd() * 1.7;
        var pad = new T.Mesh(new T.SphereGeometry(1, 9, 7), rnd() < 0.5 ? leafMat : leafMat2);
        pad.scale.set(1.3 + rnd() * 0.9, 0.32 + rnd() * 0.16, 1.1 + rnd() * 0.8);
        pad.position.set(Math.cos(pa) * pr, h + 0.55 + rnd() * 0.7, Math.sin(pa) * pr);
        pad.castShadow = true;
        pad.receiveShadow = true;
        tree.add(pad);
      }
      tree.rotation.y = rnd() * Math.PI * 2;
      group.add(tree);
    }
    this.env.add(group);
    this.trees = group;
  };

  World.prototype.buildRocks = function () {
    var rnd = TX.mulberry32(55);
    var mat = new T.MeshStandardMaterial({ color: 0x8b8172, roughness: 1.0, flatShading: true });
    var group = new T.Group();
    for (var i = 0; i < 18; i++) {
      var a = rnd() * Math.PI * 2;
      var r = 8 + rnd() * 55;
      var rock = new T.Mesh(new T.DodecahedronGeometry(1, 0), mat);
      var s = 0.18 + rnd() * 0.55;
      rock.scale.set(s * (1 + rnd() * 0.6), s * (0.6 + rnd() * 0.5), s * (1 + rnd() * 0.6));
      rock.position.set(Math.cos(a) * r, s * 0.35, Math.sin(a) * r);
      rock.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3);
      rock.castShadow = true;
      rock.receiveShadow = true;
      group.add(rock);
    }
    this.env.add(group);
  };

  World.prototype.buildHills = function () {
    var rnd = TX.mulberry32(9);
    var mat = new T.MeshStandardMaterial({ color: 0x9aa37c, roughness: 1.0, flatShading: true });
    var group = new T.Group();
    for (var i = 0; i < 9; i++) {
      var a = (i / 9) * Math.PI * 2 + rnd() * 0.4;
      var r = 120 + rnd() * 45;
      var hill = new T.Mesh(new T.SphereGeometry(1, 12, 8), mat);
      hill.scale.set(30 + rnd() * 35, 6 + rnd() * 9, 25 + rnd() * 30);
      hill.position.set(Math.cos(a) * r, -2, Math.sin(a) * r);
      group.add(hill);
    }
    this.env.add(group);
  };

  // simple dust puff pool for hooffalls
  World.prototype.buildDust = function () {
    var tex = TX.makeSoftCircle(64, 'rgba(206,184,143,0.55)', 'rgba(206,184,143,0)');
    this.dustTex = tex;
    this.dustPool = [];
    this.dustGroup = new T.Group();
    this.env.add(this.dustGroup);
    for (var i = 0; i < 26; i++) {
      var spr = new T.Sprite(new T.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0, color: 0xd8c39a }));
      spr.scale.set(0.6, 0.6, 1);
      spr.visible = false;
      this.dustGroup.add(spr);
      this.dustPool.push({ sprite: spr, life: 0, max: 1, vel: new T.Vector3() });
    }
    this.dustIndex = 0;
  };

  World.prototype.spawnDust = function (pos) {
    var d = this.dustPool[this.dustIndex];
    this.dustIndex = (this.dustIndex + 1) % this.dustPool.length;
    d.life = 0.9 + Math.random() * 0.4;
    d.max = d.life;
    d.sprite.position.copy(pos);
    d.sprite.position.y = 0.08 + Math.random() * 0.08;
    d.sprite.scale.setScalar(0.45 + Math.random() * 0.3);
    d.sprite.material.opacity = 0.5;
    d.sprite.visible = true;
    d.vel.set((Math.random() - 0.5) * 0.35, 0.12 + Math.random() * 0.15, (Math.random() - 0.5) * 0.35);
  };

  World.prototype.update = function (giraffePos, dt) {
    this.sunTarget.position.set(giraffePos.x, giraffePos.y + 2.2, giraffePos.z);
    this.sun.position.copy(this.sunTarget.position).add(this.sunOffset);
    this.sunTarget.updateMatrixWorld();

    if (this.grass && this.grass.material.userData.shader) {
      this.grass.material.userData.shader.uniforms.uTime.value += dt;
    }

    for (var i = 0; i < this.dustPool.length; i++) {
      var d = this.dustPool[i];
      if (d.life <= 0) continue;
      d.life -= dt;
      if (d.life <= 0) { d.sprite.visible = false; continue; }
      var t = 1 - d.life / d.max;
      d.sprite.position.addScaledVector(d.vel, dt);
      d.vel.multiplyScalar(0.96);
      d.sprite.scale.setScalar(0.45 + t * 1.3);
      d.sprite.material.opacity = 0.45 * (1 - t);
    }
  };

  window.World = World;
})();