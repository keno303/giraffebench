/* One manifold hide, four influences per vertex. The sculpted bind mesh and
   UV texture are embedded as ordinary script data to support local files. */
window.makeSkinRig = function (root, rest) {
  const T = THREE,
    data = window.GIRAFFE_SKIN,
    g = new T.BufferGeometry();
  function buffer(key, Type, size, norm = false) {
    let raw = atob(data[key]),
      u = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) u[i] = raw.charCodeAt(i);
    return new T.BufferAttribute(new Type(u.buffer), size, norm);
  }
  g.setAttribute("position", buffer("position", Float32Array, 3));
  g.setAttribute("normal", buffer("normal", Int16Array, 3, true));
  g.setAttribute("uv", buffer("uv", Uint16Array, 2, true));
  g.setAttribute("skinWeight", buffer("weight", Uint8Array, 4, true));
  g.setAttribute("skinIndex", buffer("joint", Uint8Array, 4));
  g.setIndex(buffer("index", Uint16Array, 1));
  const coat = new T.TextureLoader().load(data.coat);
  coat.colorSpace = T.SRGBColorSpace;
  coat.anisotropy = 8;
  const hide = new T.SkinnedMesh(
    g,
    new T.MeshStandardMaterial({ map: coat, roughness: 0.94 }),
  );
  hide.frustumCulled = false;
  hide.castShadow = hide.receiveShadow = true;
  root.add(hide);
  const bones = [],
    groups = rest.map((rows) =>
      rows.map(() => {
        let b = new T.Bone();
        b.matrixAutoUpdate = false;
        bones.push(b);
        hide.add(b);
        return b;
      }),
    );
  const x = new T.Vector3(),
    y = new T.Vector3(),
    z = new T.Vector3(),
    p = new T.Vector3();
  function pose(part, rows, parent) {
    for (let i = 0; i < rows.length; i++) {
      let a = rows[Math.max(0, i - 1)],
        b = rows[Math.min(rows.length - 1, i + 1)],
        q = rows[i],
        bone = groups[part][i];
      x.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]).normalize();
      y.set(-x.y, x.x, 0).normalize();
      z.crossVectors(x, y);
      bone.matrix.makeBasis(x, y, z).setPosition(p.set(q[0], q[1], q[2]));
      if (parent) bone.matrix.premultiply(parent);
      bone.matrixWorldNeedsUpdate = true;
    }
  }
  rest.forEach((rows, i) => pose(i, rows));
  root.updateMatrixWorld(true);
  hide.bind(new T.Skeleton(bones));
  return pose;
};
