/* The stance interval has an exact world-space hoof position. Store only completed
   footfalls as shallow, fading impressions and a short, low puff of disturbed dust. */
"use strict";
function makeTracks(scene) {
  const prints = document.createElement("canvas");
  prints.width = 128;
  prints.height = 192;
  let c = prints.getContext("2d");
  c.fillStyle = "#000";
  c.filter = "blur(1.8px)";
  for (let s of [-1, 1]) {
    c.save();
    c.translate(64 + s * 19, 93);
    c.rotate(s * 0.07);
    c.fillStyle = "rgba(69,50,32,.57)";
    c.beginPath();
    c.moveTo(-13, -64);
    c.bezierCurveTo(4, -80, 21, -37, 21, 13);
    c.bezierCurveTo(23, 50, 11, 63, -7, 62);
    c.bezierCurveTo(-18, 60, -20, 18, -16, -17);
    c.closePath();
    c.fill();
    c.strokeStyle = "rgba(155,130,90,.43)";
    c.lineWidth = 3;
    c.stroke();
    c.restore();
  }
  let map = new THREE.CanvasTexture(prints);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 4;
  let mat = new THREE.MeshBasicMaterial({
    map,
    transparent: true,
    opacity: 0.73,
    depthWrite: false,
  });
  let N = 48,
    stamps = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.145, 0.219), mat, N);
  stamps.renderOrder = 2;
  stamps.frustumCulled = false;
  scene.add(stamps);
  let dummy = new THREE.Object3D();
  let dust = document.createElement("canvas");
  dust.width = dust.height = 64;
  let d = dust.getContext("2d"),
    g = d.createRadialGradient(32, 32, 4, 32, 32, 31);
  g.addColorStop(0, "rgba(196,169,129,.91)");
  g.addColorStop(0.42, "rgba(185,161,126,.54)");
  g.addColorStop(1, "rgba(171,146,114,0)");
  d.fillStyle = g;
  d.fillRect(0, 0, 64, 64);
  let image = new THREE.CanvasTexture(dust);
  image.colorSpace = THREE.SRGBColorSpace;
  let clouds = Array.from({ length: 9 }, () => {
    let m = new THREE.SpriteMaterial({
      map: image,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    let o = new THREE.Sprite(m);
    o.renderOrder = 3;
    scene.add(o);
    return o;
  });
  return (time) => {
    let entries = [],
      plumes = [];
    for (let front of [false, true])
      for (let side of [-1, 1]) {
        let offset = (side < 0 ? 0.5 : 0) + (front ? 0.87 : 0),
          t = time / cycle + offset,
          latest = Math.floor(t),
          ff = t - latest;
        let home = front ? 0.53 : -0.845,
          anchor = home + stride * stance * 0.5 - ff * stride;
        for (let k = 0; k < 12; k++) {
          let age = ff + k;
          if (age > 9.2) continue;
          entries.push([anchor - k * stride, side * (front ? 0.258 : 0.27), age]);
        }
        let lift = ff - stance;
        if (lift < 0) lift += 1;
        if (lift < 0.39) {
          let u = lift / 0.39,
            x = home - stride * stance * 0.5 - stride * lift;
          plumes.push([
            x - 0.13 * u,
            0.021 + 0.115 * u,
            side * (front ? 0.258 : 0.27) + 0.055 * u,
            u,
          ]);
        }
      }
    for (let i = 0; i < entries.length; i++) {
      let [x, z, age] = entries[i],
        s = 1 - 0.37 * smooth(sat((age - 6) / 3.2));
      dummy.position.set(x, -0.001, z);
      dummy.rotation.set(-Math.PI / 2, 0, -Math.PI / 2 + (z > 0 ? 0.035 : -0.035));
      dummy.scale.set(s, s, 1);
      dummy.updateMatrix();
      stamps.setMatrixAt(i, dummy.matrix);
    }
    stamps.count = entries.length;
    stamps.instanceMatrix.needsUpdate = true;
    clouds.forEach((o, i) => {
      let q = plumes[i];
      o.visible = !!q;
      if (q) {
        let [x, y, z, u] = q;
        o.position.set(x, y, z);
        o.scale.set(0.12 + 0.3 * u, 0.076 + 0.17 * u, 1);
        o.material.opacity = 0.105 * Math.sin(Math.PI * u) * (1 - u);
      }
    });
  };
}
