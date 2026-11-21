/* The rest surface is skinned with an analytic, ground-locked walking rig. */
(function (root, T) {
  'use strict';
  const V = (x=0,y=0,z=0) => new T.Vector3(x,y,z);
  const TAU=2*Math.PI, clamp=T.MathUtils.clamp, mix=T.MathUtils.lerp;
  const smooth=(a,b,x)=>{const u=clamp((x-a)/(b-a),0,1);return u*u*(3-2*u);};
  const frac=x=>x-Math.floor(x);
  const Y=V(0,1), Z=V(0,0,1), X=V(1);
  const color=(hex)=>new T.Color(hex);
  function rng(seed) {return ()=>{seed=Math.imul(seed,1664525)+1013904223|0;return (seed>>>0)/4294967296;};}
  function material(hex,roughness=.82){return new T.MeshStandardMaterial({color:hex,roughness});}
  function mesh(geo,mat,parent,shadow=true){
    const m=new T.Mesh(geo,mat);
    m.castShadow=shadow; m.receiveShadow=shadow;
    parent?.add(m); return m;
  }
  function decode(value,Type){
    const raw=atob(value); const a=new Uint8Array(raw.length);
    for(let i=0;i<raw.length;i++) a[i]=raw.charCodeAt(i);
    return new Type(a.buffer);
  }
  function scaled(src,s){return Float32Array.from(src,v=>v*s);}
  function geometry(p,indices,cols){
    const g=new T.BufferGeometry();
    g.setAttribute('position',new T.Float32BufferAttribute(p,3));
    if(cols) g.setAttribute('color',new T.Float32BufferAttribute(cols,3));
    if(indices) g.setIndex(indices);
    g.computeVertexNormals(); return g;
  }
  function surfaceLoad(asset){
    const geo=new T.BufferGeometry();
    geo.setAttribute('position',new T.BufferAttribute(scaled(decode(asset.position,Int16Array),1/5300),3));
    geo.setAttribute('normal',new T.BufferAttribute(scaled(decode(asset.normal,Int16Array),1/32767),3));
    geo.setAttribute('uv',new T.BufferAttribute(scaled(decode(asset.uv,Uint16Array),1/65535),2));
    geo.setAttribute('skinIndex',new T.BufferAttribute(decode(asset.skinIndex,Uint8Array),4));
    geo.setAttribute('skinWeight',new T.BufferAttribute(scaled(decode(asset.skinWeight,Uint8Array),1/255),4));
    geo.setIndex(new T.BufferAttribute(decode(asset.index,asset.index32?Uint32Array:Uint16Array),1));
    return geo;
  }
  function furShader(mat,bump=.024){
    mat.onBeforeCompile=s=>{
      s.vertexShader=s.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 coatP;')
        .replace('#include <begin_vertex>','#include <begin_vertex>\ncoatP=position;');
      s.fragmentShader=s.fragmentShader.replace('#include <common>','#include <common>\nvarying vec3 coatP;')
        .replace('#include <roughnessmap_fragment>',`#include <roughnessmap_fragment>
          float hair=sin(dot(coatP, vec3(278.0, 55.0, 211.0))+1.9*sin(dot(coatP,vec3(37.0,62.0,-59.0))));
          float thread=sin(dot(coatP,vec3(-177.0,123.0,241.0))+1.5*sin(dot(coatP,vec3(100.0,22.0,40.0))));
          float fiber=(hair + thread*0.5)*.6667;
          float nDry=1.0-smoothstep(0.005,0.017,max(length(dFdx(coatP)),length(dFdy(coatP))));
          diffuseColor.rgb*=1.0+fiber*nDry*.042;
          roughnessFactor=clamp(roughnessFactor+fiber*nDry*.05,.25,1.0);
        `).replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
          normal=normalize(normal+vec3(dFdx(fiber),dFdy(fiber),0.0)*nDry*${bump.toFixed(4)});
        `);
    };
    mat.customProgramCacheKey=()=>`coat-${bump}`;
    return mat;
  }
  // Thin curves and swept sections share one triangle builder for small details.
  function appendTube(buf,points,rad,col,sides=8,aspect=1){
    const i0=buf.p.length/3;
    for(let i=0;i<points.length;i++){
      const t=i/(points.length-1);
      const tang=points[Math.min(i+1,points.length-1)].clone().sub(points[Math.max(0,i-1)]).normalize();
      const a=V().crossVectors(tang,Math.abs(tang.z)<.95?Z:Y).normalize();
      const b=V().crossVectors(tang,a).normalize();
      const rr=typeof rad==='function'?rad(t,i):rad, c=typeof col==='function'?col(t,i):col;
      for(let j=0;j<sides;j++){
        const ang=TAU*j/sides;
        const p=points[i].clone().addScaledVector(a,Math.cos(ang)*rr).addScaledVector(b,Math.sin(ang)*rr*aspect);
        buf.p.push(p.x,p.y,p.z); if(c)buf.c.push(c.r,c.g,c.b);
        if(i>0){
          const x=i0+(i-1)*sides+j, y=i0+(i-1)*sides+(j+1)%sides;
          buf.i.push(x,y,x+sides,y,y+sides,x+sides);
        }
      }
    }
  }
  const empty=()=>({p:[],i:[],c:[]});
  const colorMat=(roughness=.9,side=T.FrontSide)=>new T.MeshStandardMaterial({vertexColors:true,roughness,side});
  function fromBuf(b,mat,parent,shadow=true){return mesh(geometry(b.p,b.i,b.c.length?b.c:null),mat,parent,shadow);}
  function ellipsoid(parent,mat,pos,scale,segments=28){
    const m=mesh(new T.SphereGeometry(1,segments,Math.round(segments*.62)),mat,parent);
    m.position.copy(pos);m.scale.set(...scale);return m;
  }
  function cat(points,count){return new T.CatmullRomCurve3(points).getPoints(count);}

  function hoofGeometry(side){
    const p=[],cols=[], ix=[];
    const layers=[[-.233,.018,.121,.063],[-.223,.019,.128,.067],[-.196,.015,.123,.066],[-.142,-.001,.104,.060],[-.090,-.016,.072,.046],[-.056,-.027,.040,.032],[-.051,-.027,.019,.020]];
    const S=36;
    const base=color(0x262522), mid=color(0x373432), crown=color(0x64543e);
    for(let i=0;i<layers.length;i++){
      const [yy,x,rx,rz]=layers[i];
      for(let j=0;j<S;j++){
        const a=TAU*j/S,c=Math.cos(a),s=Math.sin(a);
        const flatten=u=>Math.sign(u)*Math.pow(Math.abs(u),.72);
        const xp=x+flatten(c)*rx, v=flatten(s), zp=side*(.038+(v>0?rz:rz*.49)*v);
        const y=yy+.007*smooth(.079,.13,xp)*(i<3?1:0)+.007*smooth(-.015,-.10,xp);
        p.push(xp,y,zp);
        const col=i<2?base.clone().lerp(mid,i*.39):mid.clone().lerp(crown,Math.pow((i-1)/5,1.65));
        col.multiplyScalar(1+.032*Math.cos(j*5.3)+.097*c+.068*Math.sin(j*1.88)+.038*Math.cos(j*2.3+i*.74));
        cols.push(col.r,col.g,col.b);
        if(i>0){const b=(i-1)*S+j,d=(i-1)*S+(j+1)%S;ix.push(b,b+S,d,d,b+S,d+S);}
      }
    }
    p.push(.017,-.232,side*.039,-.026,-.05,side*.037);
    cols.push(base.r,base.g,base.b,crown.r,crown.g,crown.b);
    for(let j=0;j<S;j++){
      ix.push(layers.length*S,j,(j+1)%S,layers.length*S+1,(layers.length-1)*S+(j+1)%S,(layers.length-1)*S+j);
    }
    if(side<0)for(let i=0;i<ix.length;i+=3)[ix[i+1],ix[i+2]]=[ix[i+2],ix[i+1]];
    return geometry(p,ix,cols);
  }
  function createHoof(parent){
    const joint=new T.Group();parent.add(joint);
    const mat=furShader(colorMat(.73,T.DoubleSide),.013);
    for(const side of [-1,1])mesh(hoofGeometry(side),mat,joint);
    return joint;
  }

  function createEar(side,parent){
    const pivot=new T.Group();pivot.position.set(2.007,5.186,.142*side);parent.add(pivot);
    const axis=V(-.486,.229,.849*side).normalize(), n=V(.81,.52,.153*side).normalize();
    const across=V().crossVectors(axis,n).normalize();n.crossVectors(across,axis).normalize();
    const rim=color(0xa47a55), inside=color(0x84615b), pale=color(0xc1a783), back=color(0xb59165);
    const section=(s,j,inner)=>{
      const w=(.019*(1-s)+.114*Math.pow(Math.max(0,Math.sin(Math.PI*s)),.78))*(1-.13*s);
      const p=axis.clone().multiplyScalar(s*.455).addScaledVector(across,j*w-.015*Math.sin(Math.PI*s));
      const cup=.011*Math.exp(-Math.pow((j-.28)*5,2))*Math.sin(Math.PI*Math.pow(s,.57));
      const curl=.022*Math.sin(s*Math.PI*1.35)+.024*s*s+.052*j*j*Math.sin(Math.PI*s)+cup;
      p.addScaledVector(n,curl+(inner?0:-.018*Math.sin(Math.PI*s)*(1-.72*j*j)));
      return p;
    };
    const sweep=empty(), N=23,M=14;
    for(let face=0;face<2;face++)for(let is=0;is<=N;is++)for(let ij=0;ij<=M;ij++){
      const s=is/N,j=2*ij/M-1,p=section(s,j,face===0);
      sweep.p.push(p.x,p.y,p.z);
      const col=face===0?pale.clone().lerp(inside,(1-smooth(.24,.94,Math.abs(j)))*smooth(0,.25,s)*(1-.31*s)):back.clone().lerp(pale,.27*s);
      col.lerp(rim,smooth(.65,1,Math.abs(j))*.84);
      col.multiplyScalar(1-.21*smooth(.69,1,s)+.045*Math.sin(s*140+j*37)+.061*Math.sin(j*20+s*.34)*(1-s));
      sweep.c.push(col.r,col.g,col.b);
      if(is&&ij){const b=sweep.p.length/3-1; sweep.i.push(b,b-M-1,b-1,b-1,b-M-1,b-M-2);}
    }
    // The junction at the curved lip has its own fine, dark guard hairs.
    fromBuf(sweep,furShader(colorMat(.87,T.DoubleSide),.018),pivot);
    const fibers=empty(), r=rng(513);
    for(let i=0;i<225;i++){
      const edge=i<130;
      const s=.12+r()*.833, j=(r()<.5?-1:1)*(edge?.87+.111*r():.13+.76*r());
      const k=.48+r()*.72;
      const p=section(s,j,true), a=p.clone().addScaledVector(n,.0045*k).addScaledVector(across,.005*j).addScaledVector(axis,.007*k);
      const b=a.clone().addScaledVector(across,.011*j*k).addScaledVector(axis,.011*k);
      const c=color(edge?0x765a42:0x997b66).lerp(pale,r()*.75);
      appendTube(fibers,[p,a,b],t=>mix(.00086,.00010,t)*k,c,3);
    }
    fromBuf(fibers,colorMat(),pivot,false);
    return pivot;
  }
  function makeCrown(parent){
    const rng1=rng(4418);
    const buf=empty(), strands=empty();
    for(const side of [-1,1]){
      const points=cat([V(2.110,5.253,side*.102),V(2.067,5.362,side*.137),V(2.036,5.475,side*.156),V(2.014,5.553,side*.173),V(2.011,5.586,side*.177)],29);
      const c1=color(0xaa855a),c2=color(0x806248),c3=color(0x493629),c4=color(0x332a22);
      const rad=(s)=>.066-.026*smooth(.03,.53,s)+.016*Math.exp(-((s-.84)**2)/.009)-.043*smooth(.87,1,s);
      appendTube(buf,points,rad,(s)=>c1.clone().lerp(c2,smooth(.18,.73,s)).lerp(c3,smooth(.58,.91,s)).lerp(c4,smooth(.83,1,s)),26,.94);
      for(let i=0;i<205;i++){
        const theta=rng1()*TAU,r=Math.sqrt(rng1()), h=rng1();
        const p=V(2.014+Math.cos(theta)*r*.044,5.546-.014*r+h*.036,side*.175+Math.sin(theta)*r*.045);
        const q=p.clone().add(V(-.006+Math.cos(theta)*r*.015,.013+h*.023,Math.sin(theta)*r*.012));
        const mid=p.clone().lerp(q,.59).add(V(.002,.001,0));
        appendTube(strands,[p,mid,q],t=>mix(.0017,.00008,t),c4.clone().lerp(c2,h*.57),3);
      }
    }
    fromBuf(buf,furShader(colorMat(.86),.018),parent);
    fromBuf(strands,colorMat(.9),parent,false);
  }

  function faceDetails(parent,asset){
    const eyes=[];
    const skin=color(0x9c7a54), contour=color(0x6d5140), crease=color(0x372c25);
    const cornea=new T.MeshPhysicalMaterial({vertexColors:true,side:T.DoubleSide,roughness:.27,clearcoat:.78,clearcoatRoughness:.19});
    for(const side of [1,-1]){
      const p0=asset.face[0];
      const p=V(p0[0],p0[1],(p0[2]+.001)*side);
      const n=V(.33,.22,side*.916).normalize(), ax=V(.965,-.222,-.293*side).normalize();
      const up=V().crossVectors(n,ax).normalize().multiplyScalar(side);
      ax.crossVectors(up,n).normalize().multiplyScalar(side);
      const span=(x,y,d)=>ax.clone().multiplyScalar(x).addScaledVector(up,y).addScaledVector(n,d);
      const open=new T.Group();open.position.copy(p);parent.add(open);
      const close=new T.Group();close.position.copy(p);parent.add(close);
      const S=44, layer=empty(), outline=[];
      for(let ring=0;ring<5;ring++)for(let i=0;i<S;i++){
        const a=TAU*i/S, x=Math.cos(a), y=Math.sin(a)*Math.pow(Math.abs(Math.sin(a)),.32);
        const r=[1.40,1.19,1.022,.92,.82][ring], depths=[-.015,.001,.009,.011,.006];
        const v=span(.060*x*r,.0335*y*r,depths[ring]-.0064*Math.abs(x));
        layer.p.push(v.x,v.y,v.z);
        const c=[skin,contour,color(0x4b3327),color(0x2b211c),crease][ring].clone();
        c.lerp(color(0xa88b65),smooth(-.1,.8,y)*[.15,.32,.25,.14,0][ring]);
        layer.c.push(c.r,c.g,c.b);
        if(ring===3)outline.push(v);
        if(ring){const b=(ring-1)*S+i, j=(ring-1)*S+(i+1)%S;layer.i.push(b,b+S,j,j,b+S,j+S);}
      }
      fromBuf(layer,colorMat(.68,T.DoubleSide),open,false);
      const align=new T.Matrix4().makeBasis(ax,up,n);
      if(side<0)align.makeBasis(ax,up,n.clone().negate());
      const ball=empty(), U2=59, R=29;
      const coca=color(0x412c20), honey=color(0x5a3a27), pupil=color(0x0b0907), brown=color(0x2b221c);
      for(let j=0;j<=R;j++)for(let i=0;i<U2;i++){
        const r=Math.max(j/R,.0011),a=TAU*i/U2;
        const xx=.0565*r*Math.cos(a),yy=.0304*r*Math.sin(a)*Math.pow(Math.abs(Math.sin(a)),.22);
        const d=.0044+.0238*Math.sqrt(Math.max(0,1-r*r))-.0041*Math.abs(xx)/.057;
        const q=span(xx,yy,d);
        ball.p.push(q.x,q.y,q.z);
        const h=Math.atan2(yy+.001,xx-.015);
        const radius=Math.hypot((xx-.014)/.034,(yy+.001)/.0260);
        const pupilR=Math.hypot((xx-.016)/.025,(yy+.001)/.0139);
        const striation=(.50+.26*Math.cos(h*27+2.2*radius)+.18*Math.sin(h*52-4*radius));
        const pigment=coca.clone().lerp(honey,striation).lerp(brown,smooth(.71,1.10,radius));
        pigment.lerp(pupil,1-smooth(.86,1.09,pupilR));
        if(yy>0)pigment.lerp(color(0x91a1a7),smooth(0,.029,yy)*.12);
        ball.c.push(pigment.r,pigment.g,pigment.b);
        if(j>0){const k=(j-1)*U2+i,o=(j-1)*U2+(i+1)%U2;ball.i.push(k,k+U2,o,o,k+U2,o+U2);}
      }
      fromBuf(ball,cornea,open,false);
      const glintMat=new T.MeshBasicMaterial({color:0xeae4d2});
      const glint=ellipsoid(open,glintMat,span(.0107,.0105,.027),[.0055,.0030,.0016],14);
      glint.castShadow=glint.receiveShadow=false;glint.quaternion.setFromRotationMatrix(align);glint.rotateZ(.28);
      const glint2=ellipsoid(open,new T.MeshBasicMaterial({color:0x96948b}),span(.019,-.002,.02787),[.0025,.0015,.0009],10);
      glint2.castShadow=glint2.receiveShadow=false;glint2.quaternion.copy(glint.quaternion);
      const lashes=empty(), r=rng(29);
      for(let i=3;i<20;i++){
        const p=outline[i],a=i/S*TAU;
        const ll=(.010+.010*Math.sin(a*.86)+.010*r())*(.79+.21*Math.sin((i-3)*.52));
        const q=p.clone().addScaledVector(n,ll*.66).addScaledVector(up,ll*.26).addScaledVector(ax,ll*(Math.cos(a)*.64-.31));
        const end=q.clone().addScaledVector(n,ll*.29).addScaledVector(up,ll*.31).addScaledVector(ax,ll*-.23);
        appendTube(lashes,[p,q,end],t=>mix(.0015+r()*.00030,.00012,t),color(0x322821),4);
      }
      fromBuf(lashes,colorMat(.82,T.DoubleSide),open,false);
      const lid=empty();
      appendTube(lid,Array.from({length:15},(_,i)=>{const t=i/14;return span(mix(-.058,.061,t),-.002-.010*Math.sin(Math.PI*t),.015*Math.sin(Math.PI*t));}),t=>.0014+.0024*Math.sin(Math.PI*t),crease,6);
      fromBuf(lid,colorMat(.77),close,false);
      close.visible=false;eyes.push({open,close});

      const nostril=V(2.738,5.004,side*.1121);
      const arch=empty(), U=32;
      const shade1=color(0x877252), shade2=color(0x5c4c3f), shade3=color(0x382e28),shade4=color(0x1d1916);
      for(let i=0;i<6;i++)for(let j=0;j<U;j++){
        const a=TAU*j/U,r=[1.24,1.08,.93,.78,.56,.01][i], xx=Math.cos(a)*r, yy=Math.sin(a)*r;
        const x=.040*xx, y=.0186*yy*(1-.27*xx)+.011*xx+.005*(xx*xx-.32);
        const z=([.000,.0046,.0072,.0095,.0093,.010][i]-.132*x-.37*y-4.4*x*x)*side;
        arch.p.push(nostril.x+x,nostril.y+y,nostril.z+z);
        const col=[shade1,shade1,shade2,shade3,shade4,shade4][i].clone().multiplyScalar(1+.15*Math.max(0,yy));
        arch.c.push(col.r,col.g,col.b);
        if(i>0){const b=i*U+j,q=i*U+(j+1)%U;arch.i.push(b,b-U,q,q,b-U,q-U);}
      }
      fromBuf(arch,colorMat(.77,T.DoubleSide),parent,false);
      // Closed lower lip and the little crease at the corner of the mouth.
      const lip=empty(), wax=color(0x513b30);
      const lipPts=asset.face.slice(6,8);
      const line=cat([asset.face[8],...lipPts,asset.face[9],asset.face[10],[2.834,4.941,.048],[2.843,4.944,.023],[2.846,4.946,0]].map(([x,y,z],i)=>V(x,y,(z+(i<5?.001:0))*side)),30);
      appendTube(lip,line,t=>mix(.0010,.0036,smooth(0,.6,t)),t=>wax.clone().multiplyScalar(.89+.17*t),7);
      fromBuf(lip,colorMat(.86),parent,false);
      const brow=empty();
      for(let i=0;i<2;i++){
        const pts=[V(2.149+i*.015,5.132-i*.011,.189*side),V(2.197,5.120-i*.009,.193*side),V(2.241,5.122-i*.011,.181*side),V(2.27-i*.008,5.131-i*.013,.169*side)];
        appendTube(brow,cat(pts,10),t=>Math.sin(Math.PI*t)*.0018+.0004,color(0x9e6a47),5);
      }
      fromBuf(brow,colorMat(.89),parent,false);
      const whiskers=empty();
      for(let i=0;i<28;i++){
        const p=V(2.665+r()*.128,4.939+r()*.044,(.108+r()*.008)*side);
        const q=p.clone().add(V(.008+r()*.016,-.004-r()*.012,(.004+r()*.027)*side));
        const mid=p.clone().lerp(q,.52).add(V(.001,.002,.001*side));
        appendTube(whiskers,[p,mid,q],t=>mix(.00077,.00012,t),color(0xb79a76).lerp(crease,r()*.73),3);
      }
      fromBuf(whiskers,colorMat(.93),parent,false);
    }
    return eyes;
  }

  function maneShape(y){
    const table=[[3.316,.725],[3.52,.925],[3.77,1.117],[4.02,1.298],[4.28,1.467],[4.54,1.612],[4.76,1.733],[4.94,1.816],[5.064,1.864],[5.18,1.944],[5.305,2.001]];
    let i=1;while(i<table.length-1&&table[i][0]<y)i++;
    return mix(table[i-1][1],table[i][1],(y-table[i-1][0])/(table[i][0]-table[i-1][0]));
  }
  function maneWeights(geo){
    const p=geo.attributes.position, wi=[],we=[];
    for(let i=0;i<p.count;i++){
      const y=p.getY(i);
      const k0=smooth(3.39,3.83,y),k1=smooth(3.95,4.40,y),k2=smooth(4.59,4.95,y),k3=smooth(4.97,5.19,y);
      if(k3>0){wi.push(3,4,5,0);we.push(0,1-k3,k3,0);}
      else{wi.push(1,2,3,4);we.push(1-k0,k0*(1-k1),k1*(1-k2),k2);}
    }
    geo.setAttribute('skinIndex',new T.Uint16BufferAttribute(wi,4));
    geo.setAttribute('skinWeight',new T.Float32BufferAttribute(we,4));
  }
  function makeMane(skeleton,parent){
    const b=empty(), strands=empty();const r=rng(7019);
    const lo=3.316,hi=5.28, N=207,M=14;
    const brown=color(0x51321e), base=color(0x7b5029), umber=color(0x39281b), blond=color(0xb68148);
    const thickness=(s)=>.016+.064*Math.pow(Math.max(0,Math.sin(Math.PI*s)),.55)+.020*smooth(.8,.94,s)-.039*smooth(.96,1,s);
    const attach=(s,v)=>{
      const y=mix(lo,hi,s), h=thickness(s)*(.92+.09*Math.sin(389*s)+.10*Math.sin(113*s));
      return V(maneShape(y)+.026-h*Math.pow(Math.max(0,1-v*v),.59), y-.018*(1-v*v), v*mix(.112,.052,s)*(1-.37*smooth(.92,1,s)));
    };
    for(let i=0;i<=N;i++)for(let j=0;j<=M;j++){
      const s=i/N, v=j/M*2-1, p=attach(s,v);
      b.p.push(p.x,p.y,p.z);
      const c=umber.clone().lerp(brown,r()*.56).lerp(base,Math.pow(Math.abs(v),2.3));
      c.multiplyScalar(1+.115*Math.sin(369*s+v*3)); b.c.push(c.r,c.g,c.b);
      if(i&&j){const x=b.p.length/3-1;b.i.push(x,x-1,x-M-1,x-1,x-M-2,x-M-1);}
    }
    for(let i=0;i<1640;i++){
      const s=r(),v=mix(-1,1,r()), p=attach(s,v);
      const ll=mix(.005,.052,Math.pow(r(),2))*(.48+.52*Math.sin(Math.PI*s));
      const d=p.clone().add(V(-ll*.95,-ll*.35+r()*.011,ll*.14*v));
      const mid=p.clone().lerp(d,.56).add(V(-.003,.004,0));
      const c=umber.clone().lerp(r()>.83?blond:base,r()*.84);
      appendTube(strands,[p,mid,d],t=>mix(.0016+r()*.0011,.00012,t),c,3);
    }
    for(const buf of [b,strands]){
      const g=geometry(buf.p,buf.i,buf.c);maneWeights(g);
      const m=new T.SkinnedMesh(g,colorMat(.91,T.DoubleSide));m.frustumCulled=false;
      parent.add(m);m.bind(skeleton);m.castShadow=buf===b;
    }
  }
  function makeTail(parent){
    const p=[], ix=[], cols=[];
    const N=38,S=12;
    const start=color(0xab6d3e), middle=color(0xa3724b),end=color(0x563725);
    for(let i=0;i<=N;i++)for(let j=0;j<S;j++){
      const s=i/N;
      const c=start.clone().lerp(middle,smooth(0,.34,s)).lerp(end,smooth(.35,.93,s));
      c.multiplyScalar(.95+.09*Math.sin(s*59+j*.41));
      p.push(0,0,0);cols.push(c.r,c.g,c.b);
      if(i>0){const k=(i-1)*S+j,z=(i-1)*S+(j+1)%S;ix.push(k,z,k+S,z,z+S,k+S);}
    }
    const g=geometry(p,ix,cols);
    const cord=mesh(g,furShader(colorMat(.92),.014),parent);cord.frustumCulled=false;
    const tuft=new T.Group();parent.add(tuft);
    const b=empty(), r=rng(5792);
    appendTube(b,[V(0,.02),V(0,-.052),V(.01,-.128),V(.031,-.205),V(.045,-.294),V(.018,-.34)],(s,i)=>[.028,.044,.057,.049,.018,.004][i],t=>color(0x402b21).lerp(color(0x59402a),t),15,.79);
    for(let i=0;i<430;i++){
      const theta=r()*TAU, rr=r(), h=r();
      const dir=V(Math.cos(theta),0,Math.sin(theta));
      const p=dir.clone().multiplyScalar(.023*rr).add(V(0,.015-.105*h));
      const m=p.clone().addScaledVector(dir,.022+rr*.024).add(V(.012,-.097-.05*h));
      const q=m.clone().addScaledVector(dir,-.003+rr*.010).add(V(.026,-.039-r()*.111));
      const end=q.clone().add(V(.035*(r()-.24),-.038*r(),.009));
      appendTube(b,[p,m,q,end],t=>mix(.0026,.00015,t),color(0x3e2b20).lerp(color(0x90643b),Math.pow(r(),2)*.72),3);
    }
    fromBuf(b,colorMat(.84),tuft);
    const attr=g.attributes.position;
    return (time,cycle,bodyQ,bodyPos,bind)=>{
      const swing=Math.sin(time*2.26-1)*.155+Math.sin(cycle*TAU+.2)*.075;
      const swish=.46*Math.pow(Math.max(0,Math.sin(time*.72-.8)),21)*Math.sin(10.3*time);
      const z=swing+swish;
      const transform=p=>p.sub(bind).applyQuaternion(bodyQ).add(bodyPos);
      const cp=[V(-1.443,2.891,.022),V(-1.551,2.806,.007),V(-1.579,2.586,z*.21),V(-1.629,2.298,z*.58),V(-1.72-.31*Math.abs(z),2.03,.78*z),V(-1.74-.72*Math.abs(z),1.825+Math.abs(z)*.34,z)];
      const curve=new T.CatmullRomCurve3(cp.map(transform)), points=curve.getPoints(N);
      const a=V(),bb=V(),tan=V();
      for(let i=0;i<=N;i++){
        const u=i/N;
        tan.copy(points[Math.min(i+1,N)]).sub(points[Math.max(i-1,0)]).normalize();
        a.crossVectors(tan,Z).normalize();bb.crossVectors(tan,a).normalize();
        const rad=.019+.044*Math.pow(1-u,3)+.006*smooth(.81,1,u);
        for(let j=0;j<S;j++){
          const q=TAU*j/S; const p=points[i]; const f=Math.cos(q)*rad, k=Math.sin(q)*rad;
          attr.setXYZ(i*S+j,p.x+a.x*f+bb.x*k,p.y+a.y*f+bb.y*k,p.z+a.z*f+bb.z*k);
        }
      }
      attr.needsUpdate=true;g.computeVertexNormals();
      tuft.position.copy(points[N]);
      tuft.quaternion.setFromUnitVectors(V(0,-1),tan);
      tuft.rotateY(-.15+.28*Math.sin(time*3));
    };
  }

  function make(scene,renderer,asset){
    const group=new T.Group();group.name='Reticulated giraffe';scene.add(group);
    const rest={body:V(0,2.78), neck:asset.neck.map(a=>V(...a)),legs:[]};
    for(const proto of [asset.fore,asset.hind])for(const side of [1,-1])rest.legs.push(proto.map(([x,y,z])=>V(x,y,z*side)));
    const bones=[rest.body,...rest.neck,...rest.legs.flatMap(l=>l.slice(0,3))].map(v=>{
      const b=new T.Bone();b.position.copy(v);group.add(b);return b;
    });
    group.updateMatrixWorld(true);
    const skeleton=new T.Skeleton(bones);
    const coat=furShader(material(0xffffff,.84));
    const coatMap=new T.Texture(); coatMap.colorSpace=T.SRGBColorSpace;
    coatMap.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());
    coat.map=coatMap;
    const ready=new Promise((resolve,reject)=>{
      const image=new Image();
      image.onload=()=>{coatMap.image=image;coatMap.needsUpdate=true;resolve();};
      image.onerror=()=>reject(new Error('The embedded coat texture could not be decoded.'));
      image.src=asset.coat;
    });
    const giraffe=new T.SkinnedMesh(surfaceLoad(asset),coat);
    giraffe.castShadow=true;giraffe.receiveShadow=true;giraffe.frustumCulled=false;
    group.add(giraffe);giraffe.bind(skeleton);
    makeMane(skeleton,group);
    const head=new T.Group();head.position.copy(rest.neck[4]).negate();bones[5].add(head);
    const ears=[1,-1].map(s=>createEar(s,head));
    makeCrown(head);
    ellipsoid(head,furShader(material(0xa38960,.87),.016),V(2.252,5.257,0),[.107,.054,.067],24).rotateZ(-.35);
    const eyes=faceDetails(head,asset);
    const tail=makeTail(group);
    const hooves=rest.legs.map(()=>createHoof(group));
    const limbLengths=rest.legs.map(points=>points.slice(0,3).map((p,i)=>Math.hypot(points[i+1].x-p.x,points[i+1].y-p.y)));
    const bodyQ=new T.Quaternion(), bodyPos=V(), bodyEuler=new T.Euler(0,0,0,'ZYX');
    const transform=p=>p.clone().sub(rest.body).applyQuaternion(bodyQ).add(bodyPos);
    const axisQ=(axis,angle)=>new T.Quaternion().setFromAxisAngle(axis,angle);
    const forwardQ=(ref,next)=>new T.Quaternion().setFromUnitVectors(ref.clone().normalize(),next.clone().normalize());
    const stride=1.68, period=1.90, duty=.654;
    // A near hind print leads the near fore, then the opposite pair repeats.
    const offsets=[-.151,.349,0,.5];
    const samples=[];
    function footPose(i,walk){
      const p=frac(walk+offsets[i]), isFore=i<2, ref=rest.legs[i];
      const side=i%2===0?1:-1;
      const anchor=transform(ref[0]);
      const tip=V(ref[3].x+(isFore?-.04:.015),0,ref[3].z);
      const groundX=tip.x+stride*(duty*.5-p), groundZ=tip.z;
      let lift,angle,out;
      if(p<duty){
        const u=p/duty;
        tip.x+=stride*(duty*.5-p);
        angle=.115*(1-smooth(0,.18,u))-.20*smooth(.83,1,u);
        lift=0;out=0;
      } else {
        const s=(p-duty)/(1-duty);
        const q=s*s*s*(s*(s*6-15)+10);
        tip.x+=stride*(-duty*.5+q-(p-duty));
        lift=(isFore?.284:.306)*Math.pow(Math.sin(Math.PI*Math.pow(s,.875)),1.59);
        const roll=-.20*(1-smooth(0,.22,s))+.115*smooth(.61,1,s);
        angle=roll-(isFore?.57:.44)*Math.pow(Math.sin(Math.PI*s),2.15)*(1.17-.48*s);
        out=side*(isFore?.016:.030)*Math.sin(Math.PI*s);
      }
      tip.z+=out;
      const x=angle<0?.147:-.103;
      tip.y=.2345*Math.cos(angle)-x*Math.sin(angle)+lift;
      const [l0,l1,l2]=limbLengths[i];
      const dx=tip.x-anchor.x,dy=anchor.y-tip.y;
      const dist=Math.min(Math.hypot(dx,dy),l0+l1+l2-.0011);
      const sign=isFore?-1:1;
      const maxBend=Math.acos(clamp(((dist-l0+.0008)**2-l1*l1-l2*l2)/(2*l1*l2),-1,1));
      const active=p<duty?0:Math.pow(Math.sin(Math.PI*(p-duty)/(1-duty)),1.19);
      // Flexion direction differs at the fore carpus and hind hock.
      const desired=(isFore?.265:.555)+1.04*active+.09*Math.sin(TAU*p);
      const bend=sign*Math.min(maxBend*.985,desired);
      const blendLen=Math.hypot(l1+l2*Math.cos(bend),l2*Math.sin(bend));
      const theta=Math.atan2(dx,dy);
      const alpha=Math.acos(clamp((dist*dist+l0*l0-blendLen*blendLen)/(2*dist*l0),-1,1));
      const a0=theta+sign*alpha;
      const elbow=anchor.clone().add(V(Math.sin(a0)*l0,-Math.cos(a0)*l0,(tip.z-anchor.z)*.31));
      const segmentTheta=Math.atan2(tip.x-elbow.x,elbow.y-tip.y);
      const a1=segmentTheta-Math.atan2(l2*Math.sin(bend),l1+l2*Math.cos(bend));
      const knee=elbow.clone().add(V(l1*Math.sin(a1),-l1*Math.cos(a1),(tip.z-anchor.z)*.34));
      const pts=[anchor,elbow,knee,tip];
      for(let j=0;j<3;j++){
        const b=bones[6+i*3+j];b.position.copy(pts[j]);
        b.quaternion.copy(forwardQ(ref[j+1].clone().sub(ref[j]),pts[j+1].clone().sub(pts[j])));
      }
      hooves[i].position.copy(tip);hooves[i].rotation.set(0,side*-.038*Math.sin(TAU*p),angle);
      return {phase:p,planted:p<duty,tip,side,lift,groundX,groundZ};
    }
    function pose(walk,seconds,even=0){
      const a=TAU*walk;
      bodyEuler.set(.021*Math.sin(a+.1),.008*Math.sin(a-.3),.014*Math.cos(2*a-.64)+.004*Math.cos(a));
      bodyQ.setFromEuler(bodyEuler);
      bodyPos.set(.013*Math.sin(a*2),rest.body.y-.081+.021*Math.cos(a*2-1.73),.027*Math.sin(a-.65));
      bones[0].position.copy(bodyPos);bones[0].quaternion.copy(bodyQ);
      for(let i=0;i<5;i++){
        const anchor=rest.neck[i];
        const swingZ=-.043*Math.sin(a*2-.53-i*.42)-.014*Math.cos(a-i*.67);
        const attention=-.118-.117*Math.pow(.5+.5*Math.sin(seconds*.57-.51),2)+.064*Math.sin(seconds*.37);
        const yaw=.018*Math.cos(a-1.4)+attention*Math.pow(i/4,3)-.027*even;
        const w=i/4;
        const prev=i>0?rest.neck[i-1]:anchor;
        const point=i>0?anchor.clone().sub(prev).applyQuaternion(bones[i].quaternion).add(bones[i].position):transform(anchor);
        const b=bones[i+1];b.position.copy(point);
        b.quaternion.copy(bodyQ)
          .multiply(axisQ(Z,swingZ*(.49+.56*w)))
          .multiply(axisQ(Y,yaw*w-.017*Math.sin(a+.6)*w))
          .multiply(axisQ(X,.019*Math.sin(a-i*.51)*w));
      }
      for(let i=0;i<4;i++)samples[i]=footPose(i,walk);
      tail(seconds,walk,bodyQ,bodyPos,rest.body);
      const blinkPulse=(t,center,w)=>Math.max(0,1-Math.abs(t-center)/w)**1.4;
      const blink=clamp(Math.max(blinkPulse(seconds%5.49,2.86,.151),blinkPulse((seconds+.847)%13.36,7.845,.127))*.998,0,1);
      for(let i=0;i<2;i++){
        const eye=eyes[i];eye.open.visible=blink<.87;eye.close.visible=blink>.86;
        eye.open.scale.y=1-blink*.95;
        const twitch=Math.pow(Math.max(0,Math.sin(seconds*(i?.92:1.13)+(i?3.1:1.4))),44);
        ears[i].rotation.set(.045*Math.sin(a+i*.9)-twitch*.15,
          (i?-1:1)*(.09*Math.sin(seconds*1.84+i*2.6)+twitch*.43),.037*Math.sin(a-i*1.2));
      }
      return samples;
    }
    return {group,ready,pose,stride,period,duty,offsets,headBone:bones[5]};
  }
  root.FieldGiraffe={make,math:{V,TAU,smooth,frac,rng,mix,clamp},detail:{geometry,empty,appendTube,fromBuf,colorMat,mesh}};
})(window,THREE);
