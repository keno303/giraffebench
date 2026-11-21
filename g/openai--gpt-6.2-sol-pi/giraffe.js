/* Reticulated giraffe: anatomical sculpt, skinned hide, and planted-foot gait. */
window.Giraffe = (() => {
  'use strict';
  const {T,v,clamp,mix,smooth,fract,TAU,random,geometry,mesh,material,ellipsoid,Sweeps,spline,swept,Sculpture}=Field;
  const STEP=2.12, PERIOD=1.91;
  const Z=v(0,0,1), Y=v(0,1,0);
  const headAt=v(1.72,4.875,0);
  const neckRows=[
    [.68,2.77,0,.515,.391], [.83,3.09,0,.423,.335],
    [.992,3.34,0,.365,.276], [1.128,3.61,0,.298,.225],
    [1.262,3.91,0,.240,.174], [1.393,4.22,0,.203,.144],
    [1.527,4.51,0,.172,.128], [1.641,4.735,0,.151,.121],
    [1.710,4.861,0,.130,.109], [1.765,4.932,0,.096,.103]
  ];
  const neckP=[v(.77,2.96,0),v(1.12,3.60,0),v(1.405,4.25,0),v(1.62,4.69,0),headAt];
  const neckBlend=[3.04,3.61,4.23,4.67];
  const neckWidth=[.23,.31,.27,.23];
  const tailAt=v(-1.405,2.731,0);
  const color=X=>new T.Color(X);
  const mixColor=(a,b,t)=>a.clone().lerp(b,t);
  function makeSkin(g, mat, weightFn, parent, rig, budget=0) {
    const p=g.attributes.position, indices=[], weights=[];
    for(let i=0;i<p.count;i++) {
      const w=weightFn(p.getX(i),p.getY(i),p.getZ(i));
      for(let j=0;j<4;j++) { indices.push(w[j]?.[0]||0); weights.push(w[j]?.[1]||0); }
    }
    g.setAttribute('skinIndex', new T.Uint16BufferAttribute(indices,4));
    g.setAttribute('skinWeight', new T.Float32BufferAttribute(weights,4));
    if(budget&&window.Meshopt?.supported) {
      const opt=window.Meshopt, index=Uint32Array.from(g.index.array), normal=g.attributes.normal.array;
      // Preserve curvature and hinge weights, not only the static silhouette.
      // This avoids large triangles spanning two bones when the leg folds.
      const stride=rig.bones.length+3, signature=new Float32Array(p.count*stride);
      for(let i=0;i<p.count;i++) {
        signature.set(normal.subarray(i*3,i*3+3),i*stride);
        for(let j=0;j<4;j++) signature[i*stride+3+indices[i*4+j]]+=weights[i*4+j];
      }
      const factors=Array.from({length:stride},(_,i)=>i<3?.024:.071);
      const target=Math.min(budget*3,index.length);
      const [reduced]=opt.simplifyWithAttributes(index,p.array,3,signature,stride,factors,null,target,budget<10000?.010:.0042,['ErrorAbsolute','RegularizeLight']);
      const [remap,count]=opt.compactMesh(reduced);
      for(const [name,a] of Object.entries(g.attributes)) {
        const b=new a.array.constructor(count*a.itemSize);
        for(let i=0;i<a.count;i++) {
          const j=remap[i]; if(!(j<count))continue;
          const src=i*a.itemSize,to=j*a.itemSize;
          for(let k=0;k<a.itemSize;k++) b[to+k]=a.array[src+k];
        }
        g.setAttribute(name,new T.BufferAttribute(b,a.itemSize,a.normalized));
      }
      g.setIndex(new T.BufferAttribute(count<65536?Uint16Array.from(reduced):reduced,1));
    }
    const o=new T.SkinnedMesh(g,mat);
    o.castShadow=true; o.receiveShadow=true; o.frustumCulled=false;
    parent.add(o);
    o.bind(rig,new T.Matrix4());
    return o;
  }
  function makeLeg(front, side, phase, start) {
    const z=(front ? .322 : .298)*side;
    const a=front?v(.873,2.806,z):v(-1.014,2.735,z);
    const b=front?v(.720,2.041,z*.996):v(-.765,1.910,z*1.032);
    const zFoot=(front ? .337 : .338)*side;
    const foot=v(front?.853:-1.084,.169,zFoot);
    const long=front?.944:.963, short=front?.961:1.000;
    const rig={front,side,phase,start,a,b,foot,long,short,stance:front?.666:.644};
    rig.rest=solve(rig,foot,false);
    return rig;
  }
  const qz=angle=>new T.Quaternion().setFromAxisAngle(Z,angle);
  const qy=angle=>new T.Quaternion().setFromAxisAngle(Y,angle);
  const rx=angle=>new T.Quaternion().setFromAxisAngle(v(1,0,0),angle);
  function solve(leg, ankle, animate=true) {
    const {a,b,foot,front,long,short}=leg;
    const dx=ankle.x-foot.x, dy=ankle.y-foot.y;
    const up=b.clone().sub(a), anchor=a.clone();
    if(animate) {
      // The scapula moves on the ribcage; the hind hip is attached much more rigidly.
      anchor.x+=clamp(dx,-.65,.65)*(front?.081:.022);
      anchor.y+=smooth(.016,.27,dy)*(front?.037:.014)+(front?.013:.007)*dx;
      up.applyAxisAngle(Z,dx*(front?.435:.52)+dy*(front?.35:.48));
      up.z+=.12*(ankle.z-foot.z);
    }
    const elbow=anchor.clone().add(up);
    const k=ankle.clone().sub(elbow), d=k.length();
    if (animate && d>long+short-.017) elbow.addScaledVector(k,(d-long-short+.017)/d);
    k.subVectors(ankle,elbow);
    const D=clamp(k.length(),Math.abs(long-short)+.01,long+short-.001);
    k.normalize();
    const pole=v(-k.y,k.x,0).normalize().multiplyScalar(front?1:-1);
    const along=(long*long-short*short+D*D)/(2*D);
    const joint=elbow.clone().addScaledVector(k,along).addScaledVector(pole,Math.sqrt(Math.max(0,long*long-along*along)));
    return [anchor,elbow,joint,ankle];
  }
  function limbSculpt(sculpt,l) {
    const [A,B,C,D]=l.rest, F=l.front;
    const row=(i,t,r,w)=>{
      const p=l.rest[i].clone().lerp(l.rest[i+1],t); return [p.x,p.y,p.z,r,w];
    };
    if(F) {
      sculpt.ell(A.x-.01,A.y-.14,A.z*.77,.274,.586,.232,-.24,.150);
      sculpt.ell(B.x+.10,B.y+.31,B.z*.94,.204,.356,.180,-.09,.120);
      sculpt.sweep([row(0,.05,.218,.169),row(0,.39,.203,.156),row(0,.72,.160,.138),
        row(0,1,.129,.115),row(1,.24,.105,.091),row(1,.57,.070,.070),row(1,.82,.064,.064),
        row(1,1,.076,.071),row(2,.13,.056,.057),row(2,.30,.051,.052),row(2,.70,.047,.045),
        row(2,.89,.055,.051),row(2,.966,.074,.065),row(2,1,.070,.064),[D.x+.034,D.y-.067,D.z,.067,.067]],.098);
    } else {
      sculpt.ell(A.x-.045,A.y-.12,A.z*.68,.312,.542,.271,.42,.169);
      sculpt.ell(B.x-.15,B.y+.375,B.z*.91,.275,.404,.192,.45,.119);
      sculpt.sweep([row(0,.03,.263,.216),row(0,.38,.226,.185),row(0,.68,.178,.142),row(0,1,.129,.109),
        row(1,.23,.112,.093),row(1,.53,.085,.074),row(1,.78,.060,.059),row(1,1,.073,.064),
        [C.x-.023,C.y+.039,C.z,.057,.055],row(2,.19,.052,.049),row(2,.59,.046,.044),
        row(2,.87,.051,.048),row(2,.965,.065,.060),row(2,1,.066,.061),[D.x+.029,D.y-.065,D.z,.064,.066]],.087);
    }
  }
  function makeSculpt(legs,lite) {
    const s=new Sculpture([[-1.83,.026,-.715],[2.05,5.10,.715]],lite?.0325:.0165);
    // Thorax, shoulder, hollow flank, pelvis: the top line falls behind the withers.
    s.ell(-.27,2.609,0,.973,.497,.453,.073,.173);
    s.ell(.196,2.577,0,.664,.625,.468,.19,.156);
    s.ell(.714,2.637,0,.518,.624,.401,-.16,.178);
    s.ell(.873,2.485,0,.324,.419,.330,.31,.112);
    s.ell(-1.055,2.572,0,.514,.424,.403,-.19,.164);
    s.ell(-.974,2.833,0,.425,.205,.294,.12,.124);
    s.ell(-.26,2.966,0,.723,.114,.284,.108,.112);
    s.sweep(neckRows,.158);
    for(const l of legs) limbSculpt(s,l);
    return s.make();
  }
  function axial(p, a, b) {
    const x=b.x-a.x,y=b.y-a.y,z=b.z-a.z;
    return ((p.x-a.x)*x+(p.y-a.y)*y+(p.z-a.z)*z)/(x*x+y*y+z*z);
  }
  function neckWeights(y) {
    const out=[]; let prev=1;
    for(let j=0;j<4;j++) {
      const mid=neckBlend[j], w=neckWidth[j], t=smooth(mid-w,mid+w,y);
      if(prev-t>.0001) out.push([j,prev-t]);
      prev=t;
    }
    if(prev>.0001) out.push([4,prev]);
    return out;
  }
  function bodyWeights(x,y,z,legs) {
    if(y>2.88 && x>.10) {
      const w=neckWeights(y);
      const shoulder=smooth(.16,.65,x);
      for(const a of w) if(a[0]!==0) a[1]*=shoulder;
      const other=1-w.reduce((sum,a)=>a[0]===0?sum:sum+a[1],0);
      if(w[0]?.[0]===0) w[0][1]=other; else if(other>.0001) w.unshift([0,other]);
      return w;
    }
    const l=legs.find(l=>(l.front===(x>-.06)) && l.side*z>0);
    if(!l) return [[0,1]];
    const [A,B,C,D]=l.rest, P={x,y,z};
    const t0=axial(P,A,B), t1=axial(P,B,C), t2=axial(P,C,D);
    const base=(1-smooth(l.front?2.10:2.13,l.front?2.78:2.75,y)) * smooth(.035,.235,Math.abs(z)) * smooth(.18,.60,l.front?x:-x);
    const shoulder=y<1.85?1:base;
    const elbow=smooth(-.185,.205,t1), knee=smooth(-.145,.163,t2), fetlock=smooth(.89,1.032,t2);
    if(t1<.205 && t2<0) return [[0,1-shoulder],[l.start,shoulder*(1-elbow)],[l.start+1,shoulder*elbow]];
    if(t2<.163) return [[l.start+1,1-knee],[l.start+2,knee]];
    return [[l.start+2,1-fetlock],[l.start+3,fetlock]];
  }
  function maneGroom(lite) {
    const s=new Sweeps(), rng=random(484), root=color('#41281b'), tip=color('#7e5031');
    const n=neckRows.map(row=>v(row[0],row[1],row[2]));
    const path=new T.CatmullRomCurve3(n), widths=new T.CatmullRomCurve3(neckRows.map(row=>v(row[3],row[4],0)));
    const base=(t,f)=>{
      const p=path.getPoint(t), d=path.getTangent(t), r=widths.getPoint(t).x;
      return p.addScaledVector(v(-d.y,d.x,0),r*f);
    };
    const p=[], ix=[], c=[];
    // A narrow, warm dark strip under the individual bristles.
    for(let k=0;k<=92;k++) {
      const t=mix(.195,.958,k/92), width=mix(.049,.024,k/92)*smooth(0,.17,k/92);
      for(let j=0;j<7;j++) {
        const a=(j-3)/3, B=base(t,1.032-.058*a*a);
        p.push(B.x,B.y,a*width); const C=mixColor(root,tip,.12+.11*Math.abs(a)); c.push(C.r,C.g,C.b);
        if(k<92&&j<6){const i=k*7+j;ix.push(i,i+1,i+7,i+1,i+8,i+7);}
      }
    }
    for(let i=0;i<(lite?280:1450);i++) {
      const t=mix(.187,.971, rng()), u=(t-.187)/.784;
      const off=(rng()+rng()-1)*mix(.068,.028,u), B=base(t,1.025-off*off*19);
      B.z=off;
      const d=path.getTangent(t), back=v(-d.y,d.x,0), len=mix(.028,.091,rng()) * mix(.53,1,smooth(.02,.24,u)*(1-smooth(.9,1,u)));
      const K=B.clone().addScaledVector(back,len*.66).addScaledVector(d,len*-.06), C=K.clone().addScaledVector(back,len*.40).addScaledVector(d,-len*.46);
      C.z+=.016*(rng()-.5)+off*.18; K.z+=off*.12;
      const tone=rng(), start=mixColor(root,tip,tone*.32), end=mixColor(start,tip,.20+rng()*.60);
      s.tube([B,K,C],[mix(.0019,.004,rng()),.0013,.00014],3,t=>mixColor(start,end,t));
    }
    return [geometry(p,ix,c),s.make()];
  }
  // Skull cross-sections are shared by the loft, eyelids, lips and nostrils.
  // Dimensions are in metres; the aft stations model the poll and heavy jowl.
  const profile=[[-.276,.011,.007,.009],[-.254,-.009,.084,.099],[-.205,-.019,.136,.153],
    [-.130,-.034,.170,.189],[-.065,-.043,.187,.191],[.028,-.051,.193,.190],
    [.104,-.059,.180,.175],[.186,-.075,.164,.145],[.262,-.095,.145,.127],
    [.351,-.117,.118,.116],[.446,-.136,.102,.106],[.531,-.149,.100,.103],
    [.598,-.150,.102,.096],[.637,-.147,.082,.072],[.662,-.143,.051,.052],[.674,-.141,.028,.037],[.682,-.139,.001,.002]];
  const gaussian=(x,w)=>Math.exp(-(x*x)/(w*w));
  function crossSection(x) {
    let i=1;
    while(i<profile.length-1&&profile[i][0]<x) i++;
    const l=profile[i-1],r=profile[i],a=profile[Math.max(0,i-2)],b=profile[Math.min(profile.length-1,i+1)];
    const d=r[0]-l[0],t=clamp((x-l[0])/d),t2=t*t,t3=t2*t;
    return [1,2,3].map(j=>l[j]*(2*t3-3*t2+1)+r[j]*(-2*t3+3*t2)
      +(t3-2*t2+t)*d*(r[j]-a[j])/(r[0]-a[0])+(t3-t2)*d*(b[j]-l[j])/(b[0]-l[0]));
  }
  function lipY(x) { return -.159-.038*smooth(.33,.53,x)+.049*smooth(.558,.685,x); }
  function face(x, theta, section=crossSection(x)) {
    const [center,h,w]=section, a=Math.cos(theta), b=Math.sin(theta), cheek=Math.abs(b);
    // Blended bony brow and the shallow groove enclosing the eye.
    const brow=.058*gaussian(x-.09,.123)*Math.max(0,a)**5;
    const y=center+h*a+brow;
    const orbit=gaussian(x-.079,.087);
    const lidBrow=.025*orbit*gaussian(y-.104,.034);
    const orbitSink=.011*orbit*gaussian(y-.055,.026);
    const cheekMass=.023*gaussian(x-.026,.201)*gaussian(y+.136,.082);
    const lips=.0062*gaussian(y-lipY(x),.007)*smooth(.350,.460,x);
    const nose=gaussian(x-.596,.062)*gaussian(a-.70,.28);
    const z=b*(w+cheek*(lidBrow-orbitSink+cheekMass-lips)-.006*nose);
    return v(x,y,z);
  }
  function faceSide(x,y,S,push=0) {
    const cs=crossSection(x);
    let a=0,b=Math.PI;
    for(let i=0;i<13;i++) { const mid=(a+b)/2; if(face(x,mid,cs).y>y) a=mid; else b=mid; }
    const p=face(x,(a+b)*.5*S,cs);
    p.z+=S*push;
    return p;
  }
  function skull(lite) {
    const p=[], i=[], n=lite?42:96, m=lite?74:172;
    for(let k=0;k<=m;k++) {
      const x=mix(profile[0][0],profile[profile.length-1][0],k/m), C=crossSection(x);
      for(let j=0;j<n;j++) {
        const P=face(x,TAU*j/n,C); p.push(P.x,P.y,P.z);
        if(k<m) {const A=k*n+j,B=k*n+(j+1)%n; i.push(A,B,A+n,B,B+n,A+n);}
      }
    }
    for(let j=1;j<n-1;j++) i.push(0,j+1,j,m*n,m*n+j,m*n+j+1);
    return geometry(p,i);
  }
  function makeEar(parent,S,lite) {
    const group=new T.Group(); group.position.set(-.154,.093,S*.153); parent.add(group);
    const d=v(-.161,.39,S*.911).normalize(), target=v(.84,.19,S*.53);
    const cup=target.addScaledVector(d,-target.dot(d)).normalize();
    const u=v().crossVectors(cup,d).normalize().multiplyScalar(S);
    const at=(t,a,inside)=>{
      const w=.118*Math.pow(Math.sin(Math.PI*t),.71)*(.55+.67*t)+.027*(1-t)**4;
      const p=d.clone().multiplyScalar(.405*t).addScaledVector(u,w*a+.014*Math.sin(t*3));
      const bend=-.024*t*t + .009*Math.sin(t*Math.PI) + .042*a*a*Math.sin(Math.PI*t);
      return p.addScaledVector(cup,bend+(inside?.005:-.020*Math.sin(Math.PI*t)));
    };
    const p=[], ix=[], c=[]; const N=lite?16:24, M=lite?12:20;
    const light=color('#d0b89c'), umber=color('#5b3728'), peach=color('#a39084'), dark=color('#3b2b25'), edge=color('#956146');
    for(let layer=0;layer<2;layer++) for(let k=0;k<=N;k++) for(let j=0;j<=M;j++) {
      const t=k/N,a=j/M*2-1; const P=at(t,a,layer===0); p.push(P.x,P.y,P.z);
      const rim=smooth(.63,.95,Math.abs(a)), grain=.06*Math.sin(t*62+a*17)*Math.sin(a*19-t*22);
      const folds=.55*smooth(0,.25,t)*(1-smooth(.36,.82,t))*(.6+.4*Math.sin(t*27+a*5));
      const interior=clamp(smooth(.23,.89,t)+grain-folds);
      const C=layer===0 ? mixColor(mixColor(dark,peach,interior), light, rim*.77) : mixColor(mixColor(umber,edge,.62+grain),light,rim*.44);
      c.push(C.r,C.g,C.b);
      if(k<N && j<M) {const A=layer*(N+1)*(M+1)+k*(M+1)+j; ix.push(A,A+1,A+M+1,A+1,A+M+2,A+M+1);}
    }
    const outer=(N+1)*(M+1);
    for(let k=0;k<N;k++) for(const j of [0,M]) {
      const A=k*(M+1)+j,B=A+M+1;
      ix.push(A,B,A+outer,B,B+outer,A+outer);
    }
    mesh(group,geometry(p,ix,c),material(0xffffff,.88,{side:T.DoubleSide,vertexColors:true}),true,false);
    const edgeHair=new Sweeps(), rng=random(500+S);
    for(let j=0;j<2;j++) {
      const pts=Array.from({length:28},(_,k)=>at(k/27,j?-1:1,true));
      edgeHair.tube(pts,(t)=>.003+.003*Math.sin(t*Math.PI),5,light);
    }
    for(let k=0;k<(lite?72:230);k++) {
      const t=.095+rng()*.87,a=(rng()<.5?-1:1)*(.48+rng()*.52), P=at(t,a,true), Q=P.clone().addScaledVector(u, a*(.003+rng()*.009)).addScaledVector(cup,.002+rng()*.009).addScaledVector(d,.004+rng()*.01);
      edgeHair.tube([P,Q],[.0012,.0001],3,mixColor(light,peach,rng()*.63));
    }
    for(let j=0;j<(lite?83:242);j++) {
      const t=.12+.61*rng(), a=(rng()-.50)*1.2, A=at(t,a,true);
      const w=(.007+rng()*.027)*(1-smooth(.52,.77,t)*.50);
      const B=A.clone().addScaledVector(d,w*.85).addScaledVector(u,w*.18).addScaledVector(cup,w*.54);
      edgeHair.tube([A,B],[.0011,.0002],3,mixColor(dark,peach,rng()*.42));
    }
    mesh(group,edgeHair.make(),material(0xffffff,.91,{vertexColors:true}),false);
    return group;
  }
  function radialPoint(r,theta,center,w,h) {
    const x=r*Math.cos(theta), y=r*Math.sin(theta);
    return [center[0]+x*w,center[1]+y*h];
  }
  // A surface patch, not a ball stuck to the cheek. The lid and its wet
  // waterline trace the same almond; the iris sits only millimetres above it.
  function makeEye(parent,S) {
    const cy=.059, cx=.082, center=[cx,cy];
    const root=new T.Group(); root.position.y=cy; parent.add(root);
    function sample(r,theta,raised=0) {
      const [x,y]=radialPoint(r,theta,center,.059,.034), X=(x-cx)/.059;
      const Y=cy+(y-cy)*(1-.27*Math.abs(X))-.010*X+.006*(1-X*X);
      const p=faceSide(x,Y,S,raised);
      p.y-=cy; return p;
    }
    const p=[], i=[], c=[], n=64, m=10, black=color('#140d0c'), chestnut=color('#67442e'), shadow=color('#221714');
    for(let k=0;k<=m;k++) for(let j=0;j<n;j++) {
      const r=k/m,a=j*TAU/n, P=sample(r,a,.0023+.016*(1-r*r)); p.push(P.x,P.y,P.z);
      const iris=Math.exp(-(((r-.65)/.24)**2))*(.24+.55*smooth(-.23,-.95,Math.sin(a)));
      const grain=.75+.17*Math.sin(a*40)+.086*Math.cos(a*63);
      const C=black.clone().lerp(chestnut,iris*grain).lerp(shadow,smooth(.86,1,r)*.61); c.push(C.r,C.g,C.b);
      if(k<m){const A=k*n+j,B=k*n+(j+1)%n;i.push(A,A+n,B,A+n,B+n,B);}
    }
    mesh(root,geometry(p,i,c),new T.MeshPhysicalMaterial({vertexColors:true,roughness:.21,clearcoat:.92,clearcoatRoughness:.10,side:T.DoubleSide}));
    const lids=new Sweeps(), lashes=new Sweeps(), rng=random(331+S), line=color('#513325'), tear=color('#9d7050');
    for(let j=0;j<2;j++) {
      const pts=Array.from({length:33},(_,i)=>sample(1,TAU*(j*.5+i/64),.0044));
      lids.tube(pts,t=>(j?.002:.0040)+(j?.0025:.0037)*Math.sin(t*Math.PI),7,t=>mixColor(line,tear,j?.24+.19*t:.09+.15*t));
      if(!j) for(let k=0;k<28;k++) {
        const t=.12+k*.025, A=sample(1,Math.PI*t,.0064);
        const w=(.65+rng()*.52)*(.013+.022*Math.sin(Math.PI*t));
        const B=A.clone().add(v(-w*.31,.28*w,S*.66*w)), C=B.clone().add(v(-w*.26,-.19*w,S*.35*w));
        lashes.tube([A,B,C],[.00154,.00104,.00012],4,mixColor(black,line,rng()*.52));
      }
    }
    mesh(root,lids.make(),material(0xffffff,.73,{vertexColors:true}));
    mesh(root,lashes.make(),material(0xffffff,.88,{vertexColors:true}),true);
    const A=sample(.40,1.87,.0183);
    ellipsoid(root,new T.MeshBasicMaterial({color:0xc3baa2}),A.x,A.y,A.z,.0035,.0022,.0012,.22);
    return root;
  }
  function makeHead(lite) {
    const root=new T.Group();
    mesh(root,skull(lite),Coat.make('head',lite));
    const horn=Coat.make('ossicone',lite);
    const fibers=new Sweeps(), rng=random(95), black=color('#402c22'), seal=color('#795139');
    for(const S of [-1,1]) {
      const P=v(-.100,.108,S*.106), Q=v(-.128,.210,S*.124), R=v(-.135,.330,S*.138), U=v(-.119,.382,S*.140);
      const N=25, path=spline([P,Q,R,U],N);
      const hornR=t=>mix(.068,.034,smooth(0,.65,t))+.007*smooth(.56,.87,t)-.040*smooth(.838,1,t);
      swept(root,path,hornR,horn,21);
      for(let j=0;j<(lite?135:360);j++) {
        const a=rng()*TAU, t=.58+.419*rng(), k=Math.min(N,Math.round(t*N));
        const d=path[Math.min(k+1,N)].clone().sub(path[Math.max(k-1,0)]).normalize();
        const radial=v(Math.cos(a),0,Math.sin(a)), r=hornR(t);
        const A=path[k].clone().addScaledVector(radial,r*.88), L=.007+rng()*.013;
        const B=A.clone().addScaledVector(d,L*.52).addScaledVector(radial,L*.50), C=B.clone().addScaledVector(d,L*.49).addScaledVector(radial,L*.16);
        fibers.tube([A,B,C],[.0017,.00091,.00009],4,mixColor(black,seal,.65*rng()+.28*(1-t)));
      }
    }
    mesh(root,fibers.make(),material(0xffffff,.84,{vertexColors:true}));
    const whiskers=new Sweeps(), wDark=color('#725443'), wLight=color('#ceb88f');
    for(const S of [-1,1]) {
      // Tapered nasal slit laid onto the curved muzzle, with a shaded lower wall.
      const p=[],i=[],c=[],n=38,m=8;
      const cavity=color('#211610'), throat=color('#39281f'), lip=color('#9c7657');
      for(let k=0;k<=m;k++) for(let j=0;j<n;j++) {
        const r=k/m,a=TAU*j/n,sx=r*Math.cos(a), sy=r*Math.sin(a);
        const q=.607+.046*sx+.009*sy, th=(.716+.47*sy+.207*sx+.081*sx*sx)*S;
        const P=face(q,th); P.z+=S*(.0013+.0014*r);P.y+=.0026;
        p.push(P.x,P.y,P.z);
        const tone=(.37+.36*Math.sin(a))*smooth(0,1,r);
        const C=cavity.clone().lerp(throat,clamp(tone)).lerp(lip,smooth(.65,1,r)*smooth(-.40,.78,Math.sin(a))*.76); c.push(C.r,C.g,C.b);
        if(k<m){const A=k*n+j,B=k*n+(j+1)%n;i.push(A,A+n,B,A+n,B+n,B);}
      }
      mesh(root,geometry(p,i,c),material(0xffffff,.91,{side:T.DoubleSide,vertexColors:true}),false);
      for(let j=0;j<40;j++) {
        const x=.450+rng()*.215,y=lipY(x)+(rng()-.62)*.047;
        const A=faceSide(x,y,S), len=.013+rng()*.027;
        whiskers.tube([A,A.clone().add(v(len*.20,-len*.28,len*.45*S)),A.clone().add(v(len*.55,-len*.57,len*.81*S))],[.001,.00058,.0001],3,mixColor(wDark,wLight,rng()));
      }
    }
    mesh(root,whiskers.make(),material(0xffffff,.86,{vertexColors:true}),false);
    const ears=[makeEar(root,-1,lite),makeEar(root,1,lite)];
    const eyes=[makeEye(root,-1),makeEye(root,1)];
    return {root,ears,eyes};
  }
  function hoof(mat,band,lite) {
    const o=new T.Group();
    for(const half of [-1,1]) {
      const p=[],ix=[],N=lite?14:28;
      const rings=[[-.152,.035,.101,.043],[-.139,.036,.108,.043],[-.095,.016,.093,.036],[-.042,-.000,.070,.034],[-.017,-.010,.052,.028]];
      for(let k=0;k<rings.length;k++) for(let j=0;j<N;j++) {
        const [y,x,r,w]=rings[k],a=j*TAU/N,X=Math.cos(a),W=Math.sin(a);
        const z=half*(w+.004)+W*w;
        p.push(x+r*X,y+(k>1?.011*X:0),z*(1-.04*X));
        if(k<rings.length-1){const A=k*N+j,B=k*N+(j+1)%N;ix.push(A,A+N,B,B,A+N,B+N);}
      }
      for(let j=1;j<N-1;j++) ix.push(0,j,j+1,(rings.length-1)*N,(rings.length-1)*N+j+1,(rings.length-1)*N+j);
      mesh(o,geometry(p,ix),mat);
    }
    ellipsoid(o,band,-.016,-.034,0,.075,.036,.066,-.13,true);
    for(const S of [-1,1]) ellipsoid(o,mat,-.064,-.045,.053*S,.019,.027,.013,.28,true);
    return o;
  }
  function tail(parent,lite) {
    const group=new T.Group(); group.position.copy(tailAt); parent.add(group);
    const rs=[.061,.047,.032,.025,.020,.017,.015,.014];
    const n=29, N=10;
    const shape=t=>v(-.160*Math.sin(Math.PI*t*.76)-.098*t,-1.225*t,.025*Math.sin(t*4));
    const rest=Array.from({length:n},(_,k)=>shape(k/(n-1)));
    const body=new Sweeps().tube(rest,t=>{
      const f=t*(rs.length-1), j=Math.floor(f); return mix(rs[j],rs[Math.min(rs.length-1,j+1)],f-j);
    },N).make();
    const base=body.attributes.position.array.slice();
    const shaft=mesh(group,body,Coat.make('warm',lite));
    shaft.frustumCulled=false;
    const tassel=new T.Group(); group.add(tassel);
    const fiber=new Sweeps(), rng=random(544), P=color('#2c1f18'), Q=color('#79573c');
    for(let j=0;j<(lite?139:405);j++) {
      const a=rng()*TAU,w=Math.sqrt(rng()), x=Math.cos(a)*w,z=Math.sin(a)*w, len=.138+.225*rng();
      const A=v(x*.024,.049*rng(),z*.024),B=v(x*.048,-len*.27,z*.041),C=v(x*.057-.015,-len*.69,z*.055),D=v(x*.052-.026,-len,z*.049);
      fiber.tube([A,B,C,D],[.004,.0034,.0019,.00018],4,t=>mixColor(P,Q,rng()*(.34+.35*t)));
    }
    mesh(tassel,fiber.make(),material(0xffffff,.91,{vertexColors:true}));
    return (sec,gait)=>{
      const phase=sec*.91+gait*.93;
      const bend=t=>{
        const flick=Math.pow(.5+.5*Math.sin(sec*.39-1.1),14);
        return v(t*t*(-.042*Math.sin(phase*1.33-t*2)+flick*.15),t*t*(.026+flick*.129),t**1.7*(.135*Math.sin(phase*2.02-t*2.7)+flick*.31*Math.sin(phase*3.3-t*4.5)));
      };
      for(let k=0;k<n;k++) {
        const b=bend(k/(n-1));
        for(let j=0;j<N;j++) { const id=(k*N+j)*3; body.attributes.position.setXYZ(k*N+j,base[id]+b.x,base[id+1]+b.y,base[id+2]+b.z); }
      }
      body.attributes.position.needsUpdate=true; body.computeVertexNormals();
      tassel.position.copy(shape(1).add(bend(1)));
      const d=tassel.position.clone().sub(shape(.965).add(bend(.965))).normalize();
      tassel.quaternion.setFromUnitVectors(v(0,-1,0),d);
    };
  }
  function ribBreath(skin) {
    const g=skin.geometry,p=g.attributes.position,delta=new Float32Array(3*p.count);
    for(let j=0;j<p.count;j++) {
      const x=p.getX(j),y=p.getY(j),z=p.getZ(j);
      const cage=smooth(-1.11,-.59,x)*(1-smooth(.25,.93,x))*smooth(1.93,2.26,y)*(1-smooth(2.65,3.09,y));
      delta[j*3]=.006*cage*(x+.21);
      delta[j*3+1]=-.014*cage*(1-smooth(2.31,2.66,y));
      delta[j*3+2]=.048*z*cage;
    }
    g.morphTargetsRelative=true;
    g.morphAttributes.position=[new T.BufferAttribute(delta,3)];
    skin.updateMorphTargets();
  }
  function create({lite=false}={}) {
    Coat.bake();
    const root=new T.Group(), trunk=new T.Group(), boneRoot=new T.Group();
    root.add(trunk); trunk.add(boneRoot);
    const legs=[makeLeg(false,1,0,5),makeLeg(true,1,.176,9),makeLeg(false,-1,.5,13),makeLeg(true,-1,.676,17)];
    const bones=Array.from({length:21},()=>{const b=new T.Bone(); boneRoot.add(b); return b;});
    const rig=new T.Skeleton(bones,bones.map(()=>new T.Matrix4()));
    const skin=makeSkin(makeSculpt(legs,lite),Coat.make('hide',lite),(x,y,z)=>bodyWeights(x,y,z,legs),trunk,rig,lite?9200:41000);
    if(!lite) ribBreath(skin);
    const hairMat=material(0xffffff,.87,{vertexColors:true,side:T.DoubleSide});
    for(const g of maneGroom(lite)) makeSkin(g,hairMat,(x,y,z)=>neckWeights(y),trunk,rig);
    const skull=makeHead(lite); trunk.add(skull.root);
    const hoofMat=Coat.make('hoof',lite), coronal=material(0x7d6850,.85);
    for(const l of legs) { l.hoof=hoof(hoofMat,coronal,lite); root.add(l.hoof); }
    const swingTail=tail(trunk,lite);
    const hoofHits=legs.map(()=>({point:v(),actual:v(),place:0,lateral:0,lift:0,phase:0,grounded:false}));
    const qInv=new T.Quaternion();
    function update(sec, path, terrain) {
      const gait=sec/PERIOD, dist=gait*STEP, here=path(dist);
      root.position.set(here.x,terrain(here.x,here.z),here.z);
      root.rotation.y=here.yaw;
      const phase=gait*TAU;
      if(!lite) skin.morphTargetInfluences[0]=.49+.44*Math.sin(sec*1.83-.63)+.066*Math.sin(sec*3.46);
      // Longitudinal rocking and weight shift of the trunk; the hoof targets do not inherit them.
      trunk.position.set(.021*Math.sin(phase*2-.65),.030*Math.cos(phase*2-1.2)+.010*Math.cos(phase*4),.036*Math.sin(phase+.8));
      trunk.rotation.set(.024*Math.sin(phase+.4),.012*Math.sin(phase-.4),.022*Math.cos(phase*2-2.05));
      root.updateWorldMatrix(true,true);
      qInv.copy(trunk.getWorldQuaternion(new T.Quaternion())).invert();
      const neckZ=Math.sin(phase*2-1.4), neckY=Math.sin(phase-.8);
      const liveN=neckP[0].clone(); let q=new T.Quaternion();
      for(let j=0;j<4;j++) {
        const angle=(.024+j*.006)*neckZ - .015*Math.sin(sec*.43+j*.66);
        const next=qz(angle).multiply(rx((.009+j*.004)*neckY+ .010*Math.sin(sec*.67-j*.51)));
        const B=bones[j+1]; B.quaternion.copy(next); B.position.copy(liveN).sub(neckP[j].clone().applyQuaternion(next));
        liveN.add(neckP[j+1].clone().sub(neckP[j]).applyQuaternion(next)); q=next;
      }
      skull.root.position.copy(liveN);
      const glance=.165*Math.sin(sec*.52)*smooth(.1,3.2,sec);
      skull.root.quaternion.copy(q).multiply(qz(-.104-.022*neckZ+.050*Math.sin(sec*.47-.8))).multiply(qy(glance-.045));
      for(let i=0;i<2;i++) {
        const S=i===0?-1:1;
        const flick=Math.pow(Math.max(0,Math.sin(sec*(i?.93:.71)+i*2.3-.2)),32);
        skull.ears[i].rotation.set(.042*S*Math.sin(phase-.8)+S*flick*.20,S*(.057*Math.sin(sec*1.2+i*1.7) +flick*.39),.05*Math.sin(phase*2+i*2)-.10*flick);
        const blinkPhase=fract((sec+.65)/4.14 + .058*Math.sin(sec*.43));
        const blink=Math.exp(-(((blinkPhase-.67)/.014)**2));
        skull.eyes[i].scale.y=1-.95*blink;
      }
      swingTail(sec,gait);
      for(let i=0;i<legs.length;i++) {
        const l=legs[i], t=fract(gait-l.phase), contact=l.stance;
        const touch=gait-t, place=touch*STEP+l.foot.x+contact*STEP*.46;
        const start=path(place), end=path(place+STEP);
        const startX=start.x+Math.sin(start.yaw)*l.foot.z, startZ=start.z+Math.cos(start.yaw)*l.foot.z;
        const endX=end.x+Math.sin(end.yaw)*l.foot.z, endZ=end.z+Math.cos(end.yaw)*l.foot.z;
        const u=clamp((t-contact)/(1-contact));
        const s=u*u*(3-2*u);
        const swing=Math.sin(Math.PI*u);
        const ax=mix(startX,endX,s), az=mix(startZ,endZ,s)+l.side*.038*swing;
        const height=terrain(ax,az);
        const lift=(l.front?.303:.226)*swing**1.46*(1.15-.28*u);
        const hoofAngle=-(l.front?.82:.64)*Math.sin(TAU*u)*swing**.5+.085*Math.sin(Math.PI*u)-.18*smooth(.81,.99,t/contact)*(1-smooth(0,.04,u));
        const shoeRaise=.152*Math.cos(hoofAngle)+(hoofAngle<0?.136:.066)*Math.abs(Math.sin(hoofAngle));
        const toePivot=(.136*(1-Math.cos(hoofAngle))-.152*Math.sin(hoofAngle))*(1-smooth(0,.10,u));
        const yaw=mix(start.yaw,end.yaw,s);
        const world=v(ax+toePivot*Math.cos(yaw),height+.002+lift+shoeRaise,az-toePivot*Math.sin(yaw));
        const ankle=trunk.worldToLocal(world.clone());
        const points=solve(l,ankle);
        const footQ=qInv.clone().multiply(qy(yaw)).multiply(qz(hoofAngle));
        for(let j=0;j<4;j++) {
          const bone=bones[l.start+j], R=l.rest[j], P=points[j];
          if(j===3) bone.quaternion.copy(footQ);
          else bone.quaternion.setFromUnitVectors(l.rest[j+1].clone().sub(R).normalize(),points[j+1].clone().sub(P).normalize());
          bone.position.copy(P).sub(R.clone().applyQuaternion(bone.quaternion));
        }
        l.hoof.position.copy(root.worldToLocal(world.clone())); l.hoof.quaternion.copy(qy(yaw-here.yaw).multiply(qz(hoofAngle)));
        hoofHits[i].point.set(startX,terrain(startX,startZ),startZ);
        hoofHits[i].actual.copy(world);
        hoofHits[i].place=place; hoofHits[i].lateral=l.foot.z;
        hoofHits[i].lift=lift; hoofHits[i].phase=t; hoofHits[i].grounded=t<contact;
      }
    }
    return {root,update,hoofHits,period:PERIOD,step:STEP,skin};
  }
  return {create};
})();
