/* Optional measurement layer. All five joint samples come directly from the posed
   rig; the sole trace samples the very same IK target used for planted footsteps. */
function gaitGuides(animal) {
  const T = THREE,
    group = new T.Group(),
    items = [];
  group.visible = false;
  function dotImage() {
    let c = document.createElement('canvas');
    c.width = c.height = 48;
    let g = c.getContext('2d');
    g.beginPath();
    g.arc(24, 24, 20, 0, Math.PI * 2);
    g.fillStyle = '#343a39';
    g.fill();
    g.lineWidth = 5;
    g.strokeStyle = '#fff';
    g.stroke();
    g.beginPath();
    g.arc(24, 24, 5, 0, Math.PI * 2);
    g.fillStyle = 'white';
    g.fill();
    return new T.CanvasTexture(c);
  }
  let dot = dotImage();
  for (let t of animal.tracks) {
    let tint = t.side === 1 ? 0xb4eeeb : 0xffcf8c;
    let geo = new T.BufferGeometry();
    let link = new T.BufferAttribute(new Float32Array(18), 3).setUsage(T.DynamicDrawUsage);
    geo.setAttribute('position', link);
    let lineMat = new T.LineBasicMaterial({
      color: tint,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
    let chain = new T.Line(geo, lineMat);
    chain.frustumCulled = false;
    chain.renderOrder = 7;
    let dotMat = new T.PointsMaterial({
      color: tint,
      map: dot,
      size: 7.6,
      sizeAttenuation: false,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
    let markers = new T.Points(geo, dotMat);
    markers.frustumCulled = false;
    markers.renderOrder = 8;
    let path = [];
    for (let j = 0; j <= 128; j++) path.push(t.soleAt(j / 128));
    let pathGeo = new T.BufferGeometry().setFromPoints(path);
    let traceMat = new T.LineDashedMaterial({
      color: tint,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      dashSize: 0.037,
      gapSize: 0.024,
    });
    let trace = new T.Line(pathGeo, traceMat);
    trace.computeLineDistances();
    trace.renderOrder = 6;
    group.add(trace, chain, markers);
    items.push({ t, lineMat, dotMat, trace, traceMat, link });
  }
  return {
    group,
    update(cycles, camera) {
      for (let { t, lineMat, dotMat, trace, traceMat, link } of items) {
        let near = camera.position.z * t.side >= 0;
        lineMat.opacity = near ? 0.87 : 0.39;
        dotMat.opacity = near ? 0.97 : 0.57;
        trace.visible = near;
        traceMat.opacity = 0.74;
        for (let i = 0; i < 5; i++) {
          let p = t.joints[i].position;
          link.setXYZ(i, p.x, p.y, p.z);
        }
        let p = t.soleAt(cycles);
        link.setXYZ(5, p.x, p.y, p.z);
        link.needsUpdate = true;
      }
    },
  };
}
