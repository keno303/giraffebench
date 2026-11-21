/* Seeded tuft stations in metric world coordinates. Nearby grasses use curved, textured
   leaf meshes; the thin seed stalks in the middle distance use crossed alpha cards. */
"use strict";
function detailedGrass(scene) {
  let groups = [],
    seed = rng(922063),
    mat = new THREE.MeshBasicMaterial({
      map: atlasTexture("leaves"),
      color: 0xf1d5af,
      vertexColors: true,
      alphaTest: 0.18,
      alphaToCoverage: true,
      side: THREE.DoubleSide,
    });
  let wind = { value: 0 };
  mat.onBeforeCompile = (s) => {
    s.uniforms.meadowTime = wind;
    s.vertexShader =
      "uniform float meadowTime;\n" +
      s.vertexShader.replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>\ntransformed.x+=position.y*position.y*(.41*sin(meadowTime+instanceMatrix[3].x*.86+instanceMatrix[3].z*.38)+.15*sin(meadowTime*2.14+instanceMatrix[3].z));`,
      );
  };
  for (let i = 0; i < GRASS_MESHES.length; i++) {
    let [pb, ub, ib] = GRASS_MESHES[i],
      g = new THREE.BufferGeometry(),
      p = Float32Array.from(unpack(pb, Int16Array), (q) => q / 30000),
      uv = Float32Array.from(unpack(ub, Uint16Array), (q) => q / 65535);
    for (let j = 1; j < uv.length; j += 2) uv[j] = 1 - uv[j];
    g.setAttribute("position", new THREE.BufferAttribute(p, 3));
    g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    g.setIndex(new THREE.BufferAttribute(unpack(ib, Uint16Array), 1));
    let colors = [];
    for (let j = 0; j < p.length; j += 3) {
      let f = sat((p[j + 1] + 0.003) * 6),
        c = 0.54 + 0.42 * smooth(f);
      colors.push(c, c * 0.98, c * 0.925);
    }
    g.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    let n = [390, 282, 247, 175][i];
    let inst = new THREE.InstancedMesh(g, mat, n);
    inst.frustumCulled = false;
    inst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(inst);
    let sites = [];
    for (let j = 0; j < 2650; j++) {
      let x = (seed() - 0.5) * 96,
        z = (seed() - 0.5) * 39;
      let patch = 0.5 + 0.25 * Math.sin(x * 0.63 + z * 0.51) + 0.25 * Math.sin(z * 0.93 - x * 0.28);
      if (seed() > patch * 0.86 + 0.07) continue;
      let trail = Math.abs(z + 0.3 * Math.sin(x * 0.4) + 0.35 * Math.sin(x * 0.126));
      if ((trail < 0.65 && seed() < 0.95) || (trail < 1.1 && seed() < 0.64)) continue;
      let v = seed(),
        s = (0.5 + 1.04 * patch + 1.68 * v * v) * (trail < 1.05 ? 0.5 : 1),
        shade = 0.81 + 0.21 * seed();
      sites.push([x, z, s, 0.78 + seed() * 0.71, seed() * TAU, shade]);
    }
    groups.push({ inst, n, sites });
  }
  let obj = new THREE.Object3D(),
    c = new THREE.Color();
  const wrap = (x) => ((((x + 48) % 96) + 96) % 96) - 48;
  return (dist, time, cam) => {
    wind.value = time;
    for (let q of groups) {
      let n = 0;
      for (let a of q.sites) {
        let x = wrap(a[0] - dist),
          z = a[1];
        let d2 = (x - cam.position.x) ** 2 + (z - cam.position.z) ** 2;
        if (d2 > 245 || x * x + z * z > 363) continue;
        let s = a[2] * (1 - 0.7 * smooth(sat((d2 - 137) / 108)));
        obj.position.set(x, -0.023, z);
        obj.rotation.y = a[4];
        obj.scale.set(s * a[3], s, s * a[3]);
        obj.updateMatrix();
        q.inst.setMatrixAt(n, obj.matrix);
        c.setRGB(a[5], a[5] * 0.98, a[5] * 0.946);
        q.inst.setColorAt(n, c);
        if (++n >= q.n) break;
      }
      q.inst.count = n;
      q.inst.instanceMatrix.needsUpdate = true;
      if (q.inst.instanceColor) q.inst.instanceColor.needsUpdate = true;
    }
  };
}
