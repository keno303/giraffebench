/* Model space is in metres: +X forward, +Y up, +Z the animal's left. */
window.makeGiraffe = function makeGiraffe() {
  'use strict';
  const T = THREE, TAU = Math.PI * 2;
  const V = (x, y, z) => new T.Vector3(x, y, z);
  const mix = T.MathUtils.lerp, clamp = T.MathUtils.clamp;
  const fract = x => x - Math.floor(x);
  const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t*t*(3-2*t); };
  let seed = 328982;
  const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  const material = (color, roughness = .8) => new T.MeshStandardMaterial({color, roughness});
  const root = new T.Group();
  const core = new T.Group();
  root.add(core);

  // A solid 3-D coat pattern, sampled in bind space so it follows the skin and has no UV seam.
  const coat = material(0xffffff, .86);
  coat.onBeforeCompile = shader => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 coatPosition; varying vec3 vCoat;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvCoat = coatPosition;');
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>
      varying vec3 vCoat;
      vec3 hash33(vec3 p) {
        p = fract(p * vec3(.1031,.1030,.0973));
        p += dot(p,p.yxz+33.33);
        return fract((p.xxy+p.yxx)*p.zyx);
      }
      float fleck(vec3 p) { return hash33(floor(p)).x; }
      vec2 reticulation(vec3 p) {
        vec3 n=floor(p), f=fract(p), nearV=vec3(0.), nextV=vec3(0.);
        float d1=10., d2=10., tint=0.;
        for (int k=-1;k<=1;k++) for (int j=-1;j<=1;j++) for (int i=-1;i<=1;i++) {
          vec3 g=vec3(float(i),float(j),float(k));
          vec3 h=hash33(n+g);
          vec3 r=g+.19+.62*h-f;
          float d=dot(r,r);
          if(d<d1){d2=d1;nextV=nearV;d1=d;nearV=r;tint=h.y;}
          else if(d<d2){d2=d;nextV=r;}
        }
        return vec2((d2-d1)/max(2.*length(nextV-nearV),.01),tint);
      }`).replace('#include <color_fragment>', `#include <color_fragment>
      vec3 p=vCoat;
      float fine=sin(p.x*46.+cos(p.y*21.))*sin(p.z*36.+sin(p.y*32.));
      vec3 q=p*vec3(3.42,3.16,3.57);
      q+=.087*sin(q.yzx*2.9+1.3)+.035*sin(q.zxy*7.8)+.012*fine;
      vec2 cells=reticulation(q);
      float patchMask= smoothstep(.038,.070,cells.x);
      float creaminess=1.-smoothstep(.39,1.44,p.y);
      float belly=(1.-smoothstep(1.95,2.33,p.y))*(1.-smoothstep(.34,.62,abs(p.z)))*smoothstep(-.96,-.57,p.x)*(1.-smoothstep(.27,.63,p.x));
      float nose=smoothstep(2.34,2.65,p.x)*smoothstep(4.53,4.73,p.y);
      float brow=smoothstep(4.69,4.88,p.y)*smoothstep(1.75,2.13,p.x);
      float fur= (fleck(p*vec3(580.,222.,580.))-.5)*(1.-smoothstep(.003,.012,length(fwidth(p))));
      float waves=sin(p.x*14.+cos(p.y*18.))*sin(p.z*13.+p.y*23.);
      vec3 pale=mix(vec3(.75,.51,.266),vec3(.79,.652,.432),clamp(creaminess*.76+belly*.64,0.,1.));
      vec3 russet=mix(vec3(.198,.065,.031),vec3(.445,.196,.075),cells.y*.83+.08);
      float coatAmount=patchMask*(1.-smoothstep(.11,.98,creaminess))*(1.-belly*.92)*(1.-nose*.96)*(1.-brow*.66);
      vec3 skin=mix(pale,russet,coatAmount);
      skin=mix(skin,vec3(.34,.226,.125),nose*.80);
      skin*=1.+.085*waves+.12*fur+.029*fine;
      diffuseColor.rgb *= skin;`);
  };
  const hide = material(0xb39064), rim = material(0x6e452d), innerEar = material(0x9a6e54);
  const hornBase = material(0xb38a58), hornDark = material(0x43271b);
  const mouthDark = material(0x422b21), nostrilDark = material(0x271a16);
  const gloss = material(0x241711,.24), irisMat = material(0x50301a,.32), pupilMat = material(0x0a0806,.2);
  const lip = material(0x755543), eyeRim = material(0x6c4427), tear = material(0xa68255);
  const hoofMat = material(0x45372e, .68), hoofBand = material(0x72604b, .84);
  const maneMat = material(0x53311e);
  const hairMat = material(0xffffff, .94);
  hairMat.vertexColors = true;
  hairMat.side = T.DoubleSide;
  const tailHide = material(0xa27349);
  const sphere = new T.SphereGeometry(1, 22, 15);

  function addMesh(parent, geometry, mat, cast = true) {
    const mesh = new T.Mesh(geometry, mat);
    mesh.castShadow = cast;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }
  function oval(parent, mat, at, size, zAngle = 0, cast = true) {
    const m = addMesh(parent, sphere, mat, cast);
    m.position.set(...at); m.scale.set(...size); m.rotation.z = zAngle;
    return m;
  }
  function curveMesh(parent, mat, coords, radius, segments = 18, sides = 7, cast = false) {
    const path = new T.CatmullRomCurve3(coords.map(a => V(...a)));
    return addMesh(parent, new T.TubeGeometry(path, segments, radius, sides, false), mat, cast);
  }

  const neck = [
    [2.42,.623,.52,.367], [2.72,.675,.469,.343], [2.98,.789,.434,.300],
    [3.24,.933,.364,.255], [3.60,1.102,.294,.203], [3.97,1.281,.250,.172],
    [4.31,1.451,.214,.151], [4.61,1.607,.195,.137], [4.84,1.743,.207,.157],
    [5.03,1.862,.220,.171], [5.13,1.913,.169,.145]
  ];
  function neckSection(y) {
    let i = 0;
    while (i < neck.length - 2 && y > neck[i+1][0]) i++;
    const a = neck[i], b = neck[i+1], l = neck[Math.max(0,i-1)], r = neck[Math.min(neck.length-1,i+2)];
    const t = clamp((y-a[0])/(b[0]-a[0]),0,1), t2 = t*t, t3 = t2*t, d = b[0]-a[0];
    const val = j => (2*t3-3*t2+1)*a[j]+(t3-2*t2+t)*d*(b[j]-l[j])/(b[0]-l[0])+
      (-2*t3+3*t2)*b[j]+(t3-t2)*d*(r[j]-a[j])/(r[0]-a[0]);
    return [val(1), val(2), val(3)];
  }
  function ellipsoid(cx, cy, cz, a, b, c, tilt = 0) {
    const co = Math.cos(tilt), si = Math.sin(tilt);
    return (x,y,z) => {
      const ox=x-cx, oy=y-cy, u=(co*ox+si*oy)/a, v=(co*oy-si*ox)/b, w=(z-cz)/c;
      const k = Math.sqrt(u*u+v*v+w*w);
      return k > .0001 ? k*(k-1)/Math.hypot(u/a,v/b,w/c) : -Math.min(a,b,c);
    };
  }
  function union(a,b,k) {
    const h=Math.max(k-Math.abs(a-b),0)/k;
    return Math.min(a,b)-h*h*k*.25;
  }
  const barrel = ellipsoid(-.31,2.356,0,1.04,.467,.418,.07);
  const back = ellipsoid(-.20,2.565,0,1.032,.305,.354,.142);
  const chest = ellipsoid(.587,2.422,0,.557,.511,.395,.23);
  const rump = ellipsoid(-1.008,2.364,0,.489,.335,.331,-.25);
  const cheek = ellipsoid(1.962,4.989,0,.29,.223,.201,-.26);
  const browBase = ellipsoid(2.094,5.015,0,.324,.193,.194,-.40);
  const bridge = ellipsoid(2.295,4.918,0,.311,.146,.151,-.37);
  const muzzle = ellipsoid(2.507,4.817,0,.221,.115,.144,-.20);
  const jaw = ellipsoid(2.157,4.834,0,.318,.108,.152,-.26);
  const lowerLip = ellipsoid(2.498,4.762,0,.199,.063,.125,-.125);
  function trunkField(x,y,z) {
    let a = 10;
    if (y < 3.16) {
      a=union(barrel(x,y,z),back(x,y,z),.16);
      a=union(a,chest(x,y,z),.15); a=union(a,rump(x,y,z),.114);
    }
    if (y > 2.28 && y < 5.34) {
      const py=clamp(y,neck[0][0],neck[neck.length-1][0]);
      const [cx,rx,rz]=neckSection(py);
      const qx=(x-cx)/rx, qz=z/rz, qy=(y-py)/.145;
      const k=Math.sqrt(qx*qx+qz*qz+qy*qy);
      const d=k>.0001 ? k*(k-1)/Math.hypot(qx/rx,qz/rz,qy/.145) : -rz;
      a=union(a,d,.158);
    }
    if(y>4.39){
      let h=union(cheek(x,y,z),browBase(x,y,z),.078);
      h=union(h,bridge(x,y,z),.070); h=union(h,muzzle(x,y,z),.048);
      h=union(h,jaw(x,y,z),.057); h=union(h,lowerLip(x,y,z),.032);
      a=union(a,h,.095);
    }
    return a;
  }

  // Polygonize the blended anatomical volumes. Cached edge vertices and field-gradient
  // normals keep the joins between shoulder, throat and jaw smooth at every view angle.
  function polygonize(field, origin, limit, step) {
    const [minX,minY,minZ]=origin;
    const nx=Math.ceil((limit[0]-minX)/step)+1, ny=Math.ceil((limit[1]-minY)/step)+1, nz=Math.ceil((limit[2]-minZ)/step)+1;
    const plane=nx*ny, count=plane*nz, values=new Float32Array(count);
    for(let z=0,i=0;z<nz;z++) for(let y=0;y<ny;y++) for(let x=0;x<nx;x++,i++) {
      values[i]=field(minX+x*step,minY+y*step,minZ+z*step);
    }
    const corners=[0,1,1+nx,nx,plane,plane+1,plane+nx+1,plane+nx];
    const tets=[[0,5,1,6],[0,1,2,6],[0,2,3,6],[0,3,7,6],[0,7,4,6],[0,4,5,6]];
    const positions=[], normals=[], indices=[], edges=new Map();
    function edge(a,b){
      if(a>b) [a,b]=[b,a];
      const key=a*count+b;
      if(edges.has(key))return edges.get(key);
      const t=values[a]/(values[a]-values[b]);
      const x=minX+step*mix(a%nx,b%nx,t);
      const y=minY+step*mix(Math.floor(a/nx)%ny,Math.floor(b/nx)%ny,t);
      const z=minZ+step*mix(Math.floor(a/plane),Math.floor(b/plane),t);
      const e=.001;
      const gx=field(x+e,y,z)-field(x-e,y,z), gy=field(x,y+e,z)-field(x,y-e,z), gz=field(x,y,z+e)-field(x,y,z-e);
      const mag=Math.hypot(gx,gy,gz)||1;
      const index=positions.length/3;
      positions.push(x,y,z); normals.push(gx/mag,gy/mag,gz/mag); edges.set(key,index);
      return index;
    }
    function triangle(a,b,c){
      const i=a*3,j=b*3,k=c*3;
      const x=positions[j]-positions[i], y=positions[j+1]-positions[i+1], z=positions[j+2]-positions[i+2];
      const u=positions[k]-positions[i], v=positions[k+1]-positions[i+1], w=positions[k+2]-positions[i+2];
      if((y*w-z*v)*normals[i]+(z*u-x*w)*normals[i+1]+(x*v-y*u)*normals[i+2]>=0)indices.push(a,b,c);
      else indices.push(a,c,b);
    }
    for(let z=0;z<nz-1;z++) for(let y=0;y<ny-1;y++) for(let x=0;x<nx-1;x++){
      const base=z*plane+y*nx+x;
      let inside=0;
      for(const c of corners) if(values[base+c]<0) inside++;
      if(inside===0||inside===8)continue;
      for(const tet of tets){
        const a=[],b=[];
        for(const c of tet){const i=base+corners[c]; (values[i]<0?a:b).push(i);}
        if(a.length===1)triangle(edge(a[0],b[0]),edge(a[0],b[1]),edge(a[0],b[2]));
        if(a.length===3)triangle(edge(b[0],a[0]),edge(b[0],a[1]),edge(b[0],a[2]));
        if(a.length===2){
          const u=edge(a[0],b[0]), v=edge(a[0],b[1]), w=edge(a[1],b[0]), q=edge(a[1],b[1]);
          triangle(u,v,w); triangle(v,q,w);
        }
      }
    }
    const geometry=new T.BufferGeometry();
    geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));
    geometry.setAttribute('normal',new T.Float32BufferAttribute(normals,3));
    geometry.setIndex(indices);
    return geometry;
  }

  const baseBone=new T.Bone(), n1=new T.Bone(), n2=new T.Bone(), skull=new T.Bone();
  n1.position.set(.79,2.91,0); n2.position.set(.395, .855,0); skull.position.set(.664,1.16,0);
  baseBone.add(n1); n1.add(n2); n2.add(skull); core.add(baseBone);
  root.updateMatrixWorld(true);
  const skeleton = new T.Skeleton([baseBone,n1,n2,skull]);
  const headOffset=skull.getWorldPosition(V(0,0,0));
  function skinMesh(g,m,cast=true) {
    const p=g.getAttribute('position'), idx=[], w=[];
    for(let i=0;i<p.count;i++){
      const x=p.getX(i), y=p.getY(i);
      const a=smooth(2.59,3.35,y), b=smooth(3.42,4.29,y);
      const c=Math.max(smooth(4.54,4.935,y),smooth(1.89,2.20,x)*smooth(4.39,4.72,y));
      idx.push(0,1,2,3); w.push(1-a,a*(1-b),a*b*(1-c),a*b*c);
    }
    g.setAttribute('skinIndex',new T.Uint16BufferAttribute(idx,4));
    g.setAttribute('skinWeight',new T.Float32BufferAttribute(w,4));
    const m0=new T.SkinnedMesh(g,m); core.add(m0); m0.bind(skeleton);
    m0.castShadow=cast; m0.receiveShadow=true; m0.frustumCulled=false;
    return m0;
  }
  const body=polygonize(trunkField,[-1.53,1.86,-.49],[2.79,5.28,.50],.026);
  body.setAttribute('coatPosition',body.getAttribute('position'));
  skinMesh(body,coat);

  // Hair ribbons are individually tapered and shaded, with the neck's bind weights.
  function hairBuilder() {
    const positions=[], colors=[];
    const tint=new T.Color();
    return {
      strand(points,side,startWidth,color) {
        tint.set(color);
        for(let i=0;i<points.length-1;i++){
          const a=points[i], b=points[i+1];
          const h=startWidth*(1-i/(points.length-1)), j=startWidth*(1-(i+1)/(points.length-1));
          const v0=a.clone().addScaledVector(side,h), v1=a.clone().addScaledVector(side,-h);
          const v2=b.clone().addScaledVector(side,j), v3=b.clone().addScaledVector(side,-j);
          for(const p of [v0,v1,v2,v1,v3,v2]){positions.push(p.x,p.y,p.z); colors.push(tint.r,tint.g,tint.b);}
        }
      },
      geometry() {
        const g=new T.BufferGeometry();
        g.setAttribute('position',new T.Float32BufferAttribute(positions,3));
        g.setAttribute('color',new T.Float32BufferAttribute(colors,3)); g.computeVertexNormals();
        return g;
      }
    };
  }
  const maneHair=hairBuilder();
  const manePos=[], maneFaces=[];
  for(let i=0;i<=95;i++){
    const y=mix(2.85,5.12,i/95), [nx,nr]=neckSection(y);
    let x=nx-nr;
    while(trunkField(x,y,0)<-.001 && x>-.5)x-=.008;
    const width=.038*Math.sin(Math.PI*i/95)**.42;
    const height=(.078+.014*Math.sin(i*.8)+.012*random())*smooth(0,8,i)*(1-smooth(84,96,i));
    manePos.push(x+.036,y,-width,x-height,y+.028,0,x+.036,y,width,x+.028,y,0);
    if(i>0) for(let j=0;j<4;j++){
      const a=(i-1)*4+j,b=(i-1)*4+(j+1)%4; maneFaces.push(a,b,a+4,b,b+4,a+4);
    }
    for(let j=0;j<5;j++){
      const z=(random()-.5)*width*1.7, d=(random()-.34)*.027;
      maneHair.strand([V(x+.020,y+d,z),V(x-height*.68,y+d+.022,z*.68),V(x-height*(.8+random()*.54),y+d+.044+random()*.024,z*.36)],V(0,.77,.64),.0025+random()*.002, [0x68402a,0x8b5738,0x492a1d,0x583421][Math.floor(random()*4)]);
    }
  }
  const mane=new T.BufferGeometry(); mane.setAttribute('position',new T.Float32BufferAttribute(manePos,3)); mane.setIndex(maneFaces); mane.computeVertexNormals();
  maneMat.side=T.DoubleSide;
  skinMesh(mane,maneMat); skinMesh(maneHair.geometry(),hairMat,false);

  const face=new T.Group(); skull.add(face); face.position.copy(headOffset).negate();
  const ears=[], eyes=[];
  for(const side of [-1,1]) {
    const eye=new T.Group(); eye.position.set(2.077,5.009,side*.183);
    // Align the local Z axis with the surface of the eye socket; X is the eye's long axis.
    eye.quaternion.setFromUnitVectors(V(0,0,1),V(.24,.12,side*.963).normalize());
    face.add(eye);
    oval(eye,tear,[0,0,-.003],[.091,.063,.033],-.15*side,false);
    oval(eye,eyeRim,[0,0,.013],[.075,.044,.029],-.14*side,false);
    const eyeLid=new T.Group(); eye.add(eyeLid); eyes.push(eyeLid);
    oval(eyeLid,gloss,[0,0,.031],[.060,.029,.022],-.16*side,false);
    oval(eyeLid,irisMat,[side*.009,-.002,.049],[.032,.024,.009],0,false);
    oval(eyeLid,pupilMat,[side*.011,-.002,.055],[.020,.021,.005],0,false);
    const gleam=new T.MeshBasicMaterial({color:0xe5ceb0});
    oval(eyeLid,gleam,[side*-.005,.011,.060],[.006,.004,.0015],0,false);
    curveMesh(eye,eyeRim,[[-.071,.005,.019],[-.042,.027,.044],[.005,.037,.045],[.05,.027,.037],[.068,.002,.025]],.006,15,5);
    const lash=hairBuilder();
    for(let i=0;i<12;i++){
      const u=(i/11)*2-1, x=u*.057, y=.013+.020*(1-u*u), len=.008+random()*.012;
      lash.strand([V(x,y,.040),V(x+u*len*.32,y+len*.55,.052),V(x+u*len*.55,y+len,.053)],V(1,0,0),.0014,0x362119);
    }
    addMesh(eye,lash.geometry(),hairMat,false);

    oval(face,lip,[2.602,4.822,side*.121],[.086,.042,.013],-.41,false);
    oval(face,nostrilDark,[2.614,4.826,side*.130],[.058,.024,.010],-.39,false);
    curveMesh(face,mouthDark,[[2.309,4.767,side*.134],[2.424,4.756,side*.144],[2.52,4.743,side*.128],[2.627,4.747,side*.102],[2.684,4.761,side*.054],[2.697,4.773,0]],.0061,21,6);
    curveMesh(face,lip,[[2.417,4.746,side*.135],[2.522,4.731,side*.122],[2.631,4.738,side*.086],[2.680,4.750,side*.031]],.007,15,6);

    const ear=new T.Group(); ear.position.set(1.893,4.977,side*.149); face.add(ear); ears.push({ear,side});
    const ep=(u,v,inside)=>{
      const w=(.020+.113*Math.pow(Math.sin(Math.PI*u),.81))*(1-smooth(.82,1.001,u)*.95);
      return V(-.131*u-.110*v*w, .194*u+v*w*.94, side*(.445*u+.012*Math.sin(u*Math.PI)+v*w*.32))
        .addScaledVector(V(.94,-.33,side*.13), (inside ? .019 : -.017)*Math.sin(Math.PI*u)-.058*(1-v*v)*Math.sin(Math.PI*u));
    };
    const epos=[], eidx=[];
    for(const inside of [false,true])for(let i=0;i<=16;i++)for(let j=0;j<=12;j++){
      const p=ep(i/16,j/6-1,inside); epos.push(p.x,p.y,p.z);
    }
    const row=13, layer=17*row;
    for(let l=0;l<2;l++)for(let i=0;i<16;i++)for(let j=0;j<12;j++){
      const a=l*layer+i*row+j,b=a+1,c=a+row,d=c+1;
      const flip=(side===1)!==(l===1);
      if(flip)eidx.push(a,c,b,b,c,d); else eidx.push(a,b,c,b,d,c);
    }
    for(let i=0;i<16;i++)for(const j of [0,12]){
      const a=i*row+j,b=a+row; eidx.push(a,b,a+layer,b,b+layer,a+layer);
    }
    const eg=new T.BufferGeometry(); eg.setAttribute('position',new T.Float32BufferAttribute(epos,3)); eg.setIndex(eidx); eg.computeVertexNormals();
    hide.side=T.DoubleSide;
    addMesh(ear,eg,hide);
    const ip=[], ii=[], front=V(.94,-.33,side*.13);
    for(let i=0;i<=12;i++)for(let j=0;j<=10;j++){
      const u=mix(.148,.91,i/12), v=(j/5-1)*.76*Math.sin(Math.PI*i/12)**.43;
      const p=ep(u,v,true).addScaledVector(front,.0024);ip.push(p.x,p.y,p.z);
      if(i<12&&j<10){const a=i*11+j; ii.push(a,a+1,a+11,a+1,a+12,a+11);}
    }
    const ig=new T.BufferGeometry(); ig.setAttribute('position',new T.Float32BufferAttribute(ip,3));ig.setIndex(ii);ig.computeVertexNormals();
    innerEar.side=T.DoubleSide; addMesh(ear,ig,innerEar,false);
    for(const v of [-1,1]) {
      const coords=[];
      for(let i=1;i<=14;i++)coords.push(ep(i/14,v,true).toArray());
      curveMesh(ear,rim,coords,.006,19,5);
    }

    const horn=new T.Group(); horn.position.set(1.98,5.141,side*.112); face.add(horn);
    horn.rotation.set(side*.22,0,.24);
    const profile=[[0,-.04],[.076,-.037],[.068,.023],[.049,.101],[.044,.204],[.053,.268],[.062,.299],[.048,.323],[0,.331]].map(p=>new T.Vector2(...p));
    addMesh(horn,new T.LatheGeometry(profile,18),hornBase);
    oval(horn,hornDark,[0,.300,0],[.063,.052,.060]);
    const tuft=hairBuilder();
    for(let i=0;i<105;i++){
      const a=random()*TAU, r=Math.sqrt(random())*.058, x=Math.cos(a)*r,z=Math.sin(a)*r;
      const y=.308+Math.sqrt(Math.max(0,1-r*r/.0036))*.036, h=.009+random()*.029;
      tuft.strand([V(x,y,z),V(x-.008,y+h*.6,z),V(x-.019-r*.15,y+h,z+Math.sin(a)*.008)],V(Math.cos(a),0,Math.sin(a)),.0025,[0x3b2319,0x533122,0x713f29][i%3]);
    }
    addMesh(horn,tuft.geometry(),hairMat,false);
  }

  // Swept limb geometry: fixed bind-space coat samples, moving cross sections. The
  // limb envelope stays continuous through joints rather than exposing ball hinges.
  function makeTube(parent, mat, rings, sides, useCoat) {
    const pos=new Float32Array((rings+1)*sides*3), idx=[];
    const attr=new T.BufferAttribute(pos,3).setUsage(T.DynamicDrawUsage);
    const g=new T.BufferGeometry();g.setAttribute('position',attr);
    for(let i=0;i<rings;i++)for(let j=0;j<sides;j++){
      const a=i*sides+j,b=i*sides+(j+1)%sides,c=a+sides,d=b+sides;
      idx.push(a,c,b,b,c,d);
    }
    g.setIndex(idx);
    const mesh=addMesh(parent,g,mat); mesh.frustumCulled=false;
    const axis=V(0,0,1), cross=V(0,0,0), direction=V(0,0,0);
    return {
      update(nodes,bind=false) {
        // Cubic Hermite interpolation with endpoint tangents scaled to their spans.
        const n=nodes.length;
        function sample(i,t,k){
          const a=nodes[i][k], b=nodes[i+1][k], l=nodes[Math.max(0,i-1)][k], r=nodes[Math.min(n-1,i+2)][k];
          if(k>=3)return mix(a,b,t*t*(3-2*t));
          const t2=t*t,t3=t2*t;
          return (2*t3-3*t2+1)*a+(t3-2*t2+t)*(b-l)*.43+(-2*t3+3*t2)*b+(t3-t2)*(r-a)*.43;
        }
        const centres=[];
        for(let j=0;j<=rings;j++){
          const q=j/rings*(n-1), i=Math.min(n-2,Math.floor(q)), t=q-i;
          centres.push([V(sample(i,t,0),sample(i,t,1),sample(i,t,2)),sample(i,t,3),sample(i,t,4)]);
        }
        for(let i=0;i<=rings;i++){
          const [p,rx,rz]=centres[i];
          direction.subVectors(centres[Math.min(rings,i+1)][0],centres[Math.max(0,i-1)][0]).normalize();
          cross.crossVectors(direction,axis).normalize();
          const lateral=V(0,0,0).crossVectors(cross,direction).normalize();
          for(let j=0;j<sides;j++){
            const angle=TAU*j/sides, a=Math.cos(angle)*rx,b=Math.sin(angle)*rz;
            const k=(i*sides+j)*3;
            pos[k]=p.x+cross.x*a+lateral.x*b; pos[k+1]=p.y+cross.y*a+lateral.y*b; pos[k+2]=p.z+cross.z*a+lateral.z*b;
          }
        }
        attr.needsUpdate=true; g.computeVertexNormals();
        if(bind&&useCoat)g.setAttribute('coatPosition',new T.BufferAttribute(pos.slice(),3));
      }
    };
  }
  function kneeBetween(a,b,l1,l2,forward) {
    const dx=b.x-a.x, dy=b.y-a.y, d=Math.hypot(dx,dy)||.0001;
    const along=clamp((l1*l1-l2*l2+d*d)/(2*d),0,d);
    const height=Math.sqrt(Math.max(0,l1*l1-along*along));
    return V(a.x+(dx*along-dy*height*forward)/d,a.y+(dy*along+dx*height*forward)/d,mix(a.z,b.z,.52));
  }
  function makeHoof(parent) {
    const group=new T.Group(); parent.add(group);
    for(const side of [-1,1]){
      const rings=[[.001,.078,.055,.035],[.014,.101,.058,.039],[.056,.096,.052,.035],[.111,.076,.047,.016],[.135,.052,.037,.003]];
      const p=[],indices=[], n=24;
      for(const [y,xr,zr,off] of rings)for(let j=0;j<n;j++){
        const t=TAU*j/n, c=Math.cos(t),s=Math.sin(t),sg=v=>Math.sign(v)*Math.abs(v)**.68;
        p.push(off+xr*sg(c),y,side*(zr+.006)+zr*sg(s));
      }
      for(let i=0;i<rings.length-1;i++)for(let j=0;j<n;j++){
        const a=i*n+j,b=i*n+(j+1)%n;indices.push(a,a+n,b,b,a+n,b+n);
      }
      for(let j=1;j<n-1;j++){indices.push(0,j,j+1);const i=(rings.length-1)*n;indices.push(i,i+j+1,i+j);}
      const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(p,3));g.setIndex(indices);
      g.addGroup(0,n*6*3,0);g.addGroup(n*6*3,n*6,1);g.addGroup(n*6*4,(n-2)*6,0);
      g.computeVertexNormals();addMesh(group,g,[hoofMat,hoofBand]);
    }
    return group;
  }
  const feet=[];
  for(const side of [1,-1])for(const front of [false,true]){
    const x=front?.706:-1.04, z=side*(front?.294:.277), phase=(side===1?0:.5)+(front?.137:0);
    feet.push({front,side,x,z,phase,tube:makeTube(root,coat,44,16,true),hoof:makeHoof(root),point:V(x,0,z)});
  }
  const strideLength=1.53, period=1.76, duty=.65;
  function step(leg,cycle,bind=false){
    const p=fract(cycle-leg.phase), swing=p>=duty, t=swing?(p-duty)/(1-duty):0;
    // Match the derivatives of swing and stance, then add a smooth turnover at toe-off.
    const u = t*t*(3-2*t), v=(t-3*t*t+2*t*t*t);
    const stride=duty*strideLength;
    const dx=bind?0:swing?-stride*.5+stride*u-(1-duty)*strideLength*v:strideLength*(duty*.5-p);
    const lift=(bind||!swing)?0:(leg.front?.251:.230)*Math.sin(Math.PI*t)**1.7;
    const lateral=leg.z+(swing&&!bind?leg.side*.033*Math.sin(Math.PI*t)**2:0);
    const pitch=(!swing||bind)?0:-.39*Math.sin(TAU*t)*Math.sin(Math.PI*t);
    leg.point.set(leg.x+dx,lift-.013,lateral);
    leg.hoof.position.copy(leg.point); leg.hoof.rotation.z=pitch;
    const toe=leg.point.clone().add(V(-.045*Math.cos(pitch)-.148*Math.sin(pitch),-.045*Math.sin(pitch)+.148*Math.cos(pitch),0));
    const fet=toe.clone().add(V(-.044,.094,0));
    const x=leg.x, z=leg.z;
    const anchor=V(x+(leg.front?-.031:.062),leg.front?2.566:2.410,z*.68);
    if(!bind){anchor.applyEuler(core.rotation);anchor.add(core.position);}
    const N=(p,a,b)=>[p.x,p.y,p.z,a,b];
    let nodes;
    if(leg.front){
      const elbow=anchor.clone().add(V(-.121+.268*dx+.17*lift,-.649+.080*Math.min(0,dx),z*.30));
      const k=kneeBetween(elbow,fet,.770,.956,1);
      const upper=anchor.clone().lerp(elbow,.43).add(V(.035,0,z*.03));
      const forearm=elbow.clone().lerp(k,.43).add(V(.013,0,0));
      const cannon=k.clone().lerp(fet,.65);
      nodes=[N(anchor,.123,.100),N(upper,.193,.137),N(elbow,.127,.101),N(forearm,.093,.075),N(k,.071,.065),N(cannon,.042,.048),N(fet,.057,.053),N(toe,.060,.054),N(toe.clone().add(V(.022,-.047,0)),.045,.046)];
    }else{
      const thigh=anchor.clone().add(V(.099+.132*dx,-.229,z*.24));
      const stifle=anchor.clone().add(V(.273+.405*dx+.14*lift,-.573+.189*Math.min(0,dx)+.10*lift,z*.30));
      const hock=kneeBetween(stifle,fet,.893,.763,-1);
      const gaskin=stifle.clone().lerp(hock,.49).add(V(.031,0,0));
      const cannon=hock.clone().lerp(fet,.62);
      nodes=[N(anchor,.145,.100),N(thigh,.227,.148),N(stifle,.133,.097),N(gaskin,.088,.073),N(hock,.078,.063),N(cannon,.044,.047),N(fet,.059,.052),N(toe,.060,.053),N(toe.clone().add(V(.021,-.047,0)),.044,.045)];
    }
    leg.tube.update(nodes,bind);
  }
  for(const leg of feet)step(leg,0,true);

  const tail=makeTube(core,tailHide,30,12,false);
  const tailTip=new T.Group(); core.add(tailTip);
  oval(tailTip,hornDark,[0,-.09,0],[.046,.166,.046],-.12,false);
  const tailHair=hairBuilder();
  for(let i=0;i<235;i++){
    const a=random()*TAU, r=.012+random()*.036, x=Math.cos(a)*r,z=Math.sin(a)*r, h=.17+random()*.145;
    tailHair.strand([V(x*.36,.024-random()*.119,z*.36),V(x-.014,-h*.50,z),V(x*1.22-.041,-h,z*1.17)],V(Math.cos(a),.06,Math.sin(a)),.0022+random()*.0028,[0x3a241a,0x583925,0x483022,0x6b4831][i%4]);
  }
  addMesh(tailTip,tailHair.geometry(),hairMat,false);
  function update(cycle,time) {
    const beat=cycle*TAU;
    core.position.set(.029*Math.sin(2*beat+.4),.026*Math.sin(2*beat-.6),.035*Math.sin(beat+.3));
    core.rotation.set(.022*Math.sin(beat+.4),.016*Math.sin(beat-1),.023*Math.sin(2*beat-.18));
    n1.rotation.set(.018*Math.sin(beat-.35),.019*Math.sin(beat-.8),.046*Math.sin(2*beat-.84));
    n2.rotation.set(.025*Math.sin(beat-.99),.020*Math.sin(beat-.35),-.029*Math.sin(2*beat-.73));
    skull.rotation.set(-.029*Math.sin(beat-.7),.026*Math.sin(beat+.8)+.035*Math.sin(time*.63),-.034*Math.sin(2*beat-.22));
    for(const leg of feet)step(leg,cycle);
    for(const {ear,side} of ears){
      const twitch=Math.exp(-Math.pow((fract(time*.31+side*.26)-.69)*22,2));
      ear.rotation.set(side*(.065*Math.sin(beat-.65)+.13*twitch),side*(.11*Math.sin(time*1.12+side)-.30*twitch),.071*Math.sin(beat+.12*side));
    }
    const blink=Math.exp(-Math.pow((fract(time*.27+.11)-.81)*42,2));
    for(const eye of eyes)eye.scale.y=1-.94*blink;
    const wag=.20*Math.sin(beat*.5-.1)+.07*Math.sin(beat+.91)+.095*Math.sin(time*2.02);
    const tailNodes=[[-1.345,2.499,0,.064,.056],[-1.475,2.34,wag*.16,.049,.044],[-1.485,2.066,wag*.52,.028,.025],[-1.505,1.794,wag*.87,.022,.020],[-1.591+.076*Math.sin(beat-.49),1.56+.065*Math.cos(beat+.7),wag*1.17,.024,.020]];
    tail.update(tailNodes);
    const tip=V(...tailNodes[4]), prev=V(...tailNodes[3]);
    tailTip.position.copy(tip);
    tailTip.quaternion.setFromUnitVectors(V(0,-1,0),tip.sub(prev).normalize());
  }
  update(0,0);
  return {root,feet,update,period,strideLength};
};
