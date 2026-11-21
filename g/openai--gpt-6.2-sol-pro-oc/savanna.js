window.makeSavanna = function makeSavanna(scene, accentShadows, subject) {
  'use strict';
  const T=THREE, TAU=2*Math.PI;
  const V=(x,y,z)=>new T.Vector3(x,y,z);
  const mix=T.MathUtils.lerp, clamp=T.MathUtils.clamp;
  let seed=871153;
  const rng=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
  const between=(a,b)=>mix(a,b,rng());
  const wrap=(x,n)=>{const r=x%n;return r<0?r+n:r;};
  const distance={value:0}, clock={value:0};
  const fogColor=new T.Color(0xd9c6a3);
  scene.fog=new T.FogExp2(fogColor,.023);

  const noiseGLSL=`
    float hash21(vec2 p){p=fract(p*vec2(.1031,.11369));p+=dot(p,p.yx+23.19);return fract((p.x+p.y)*p.x);}
    float noise2(vec2 p){vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
      return mix(mix(hash21(i),hash21(i+vec2(1,0)),f.x),mix(hash21(i+vec2(0,1)),hash21(i+1.),f.x),f.y);}
    float fbm(vec2 p){return .57*noise2(p)+.27*noise2(p*2.13)+.108*noise2(p*4.49)+.042*noise2(p*8.21);}
  `;
  const sky=new T.Mesh(new T.SphereGeometry(190,40,24), new T.ShaderMaterial({
    side:T.BackSide, depthWrite:false, uniforms:{haze:{value:fogColor}},
    vertexShader:`varying vec3 vRay; void main(){vRay=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader:`varying vec3 vRay; uniform vec3 haze; ${noiseGLSL}
      void main(){
        vec3 d=normalize(vRay);
        vec3 sun=normalize(vec3(-.59,.256,-.763));
        float elevation=max(d.y,0.);
        float hot=max(dot(d,sun),0.);
        vec3 zenith=vec3(.179,.336,.394);
        vec3 sky=mix(haze,zenith,smoothstep(-.035,.415,pow(elevation,.83)));
        sky+=vec3(.083,.053,.023)*pow(hot,5.)+vec3(.139,.081,.034)*pow(hot,17.);
        sky+=vec3(.17,.105,.033)*pow(hot,85.);
        vec2 p=d.xz/max(.099,d.y+.143);
        float cloud=fbm(p*vec2(2.1,3.65)+vec2(13.1,-3.0))+.10*noise2(p*vec2(4.,11.));
        float wisps=smoothstep(.53,.738,cloud)*smoothstep(.023,.13,d.y)*(1.-smoothstep(.45,.74,d.y));
        sky=mix(sky,vec3(.81,.733,.578)+vec3(.11,.073,.034)*pow(hot,4.),wisps*.54);
        float disc=smoothstep(.99950,.99972,hot);
        sky+=disc*vec3(.7,.51,.28);
        gl_FragColor=vec4(sky,1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`
  }));
  sky.renderOrder=-100; sky.frustumCulled=false; scene.add(sky);

  const hemi=new T.HemisphereLight(0xffecd4,0xaf9876,1.73);
  const key=new T.DirectionalLight(0xffddb1,2.35);
  key.position.set(-5.8,7.8,-5.5);
  key.target.position.set(.25,1.55,0);
  key.castShadow=accentShadows;
  key.shadow.mapSize.set(2048,2048);
  Object.assign(key.shadow.camera,{left:-5.9,right:5.9,top:5.9,bottom:-5.9,near:.4,far:22});
  key.shadow.normalBias=.031;
  key.shadow.bias=-.00018;
  key.shadow.radius=3.1;
  const edge=new T.DirectionalLight(0xffd4a8,.73);
  edge.position.set(-5,3.4,6);
  const fill=new T.DirectionalLight(0xd5ebfa,1.19);
  fill.position.set(5,6,8);
  scene.add(hemi,key,key.target,edge,fill);

  const ground=new T.Mesh(new T.PlaneGeometry(340,340,1,1),new T.MeshStandardMaterial({color:0xffffff,roughness:1}));
  ground.rotation.x=-Math.PI*.5; ground.position.y=-.015; ground.receiveShadow=true; scene.add(ground);
  ground.material.onBeforeCompile=s=>{
    s.uniforms.travel=distance;
    s.vertexShader=s.vertexShader.replace('#include <common>','#include <common>\nvarying vec2 terrain;')
      .replace('#include <begin_vertex>','#include <begin_vertex>\nterrain = position.xy * vec2(1.,-1.);');
    s.fragmentShader=s.fragmentShader.replace('#include <common>',`#include <common>\nvarying vec2 terrain; uniform float travel; ${noiseGLSL}`)
      .replace('#include <color_fragment>',`#include <color_fragment>
        vec2 p=terrain+vec2(travel,0.);
        float field=fbm(p*vec2(.37,.48));
        float track=abs(terrain.y-.45*sin(p.x*.27)-.18*cos(p.x*.61));
        float lane=1.-smoothstep(.50,2.55,track+(field-.5)*1.5);
        float grit=noise2(p*13.0)*.45+noise2(p*38.0)*.34+noise2(p*3.1)*.21;
        float speck= smoothstep(.66,.89,hash21(floor(p*51.))) * (1.-smoothstep(.019,.067,length(fwidth(p))));
        vec3 scrub=mix(vec3(.156,.139,.063),vec3(.361,.276,.127),smoothstep(.22,.77,field));
        vec3 clay=mix(vec3(.268,.187,.100),vec3(.42,.311,.176),smoothstep(.19,.83,field*.7+grit*.3));
        vec3 soil=mix(scrub,clay, lane*.86);
        soil*=.83+grit*.31+speck*.17;
        diffuseColor.rgb*=soil;`);
  };

  // A soft occlusion layer stays under the animal even on devices without shadow maps.
  const mask=document.createElement('canvas'); mask.width=mask.height=96;
  const ctx=mask.getContext('2d'), gradient=ctx.createRadialGradient(48,48,0,48,48,47.5);
  gradient.addColorStop(0,'rgba(255,255,255,.88)'); gradient.addColorStop(.28,'rgba(255,255,255,.72)');
  gradient.addColorStop(.59,'rgba(255,255,255,.33)'); gradient.addColorStop(1,'rgba(255,255,255,0)');
  ctx.fillStyle=gradient; ctx.fillRect(0,0,96,96);
  const shadowTexture=new T.CanvasTexture(mask);
  const shadowPlane=new T.PlaneGeometry(1,1);
  function groundShadow(x,y,z,w,l,opacity){
    const mat=new T.MeshBasicMaterial({color:0x473421,map:shadowTexture,transparent:true,opacity,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1});
    const m=new T.Mesh(shadowPlane,mat);
    m.position.set(x,y,z);m.scale.set(w,l,1);m.rotation.x=-Math.PI*.5;
    m.renderOrder=2;scene.add(m);return m;
  }
  groundShadow(-.04,-.010,-.10,4.20,2.09,accentShadows?.32:.44);
  const contacts=Array.from({length:4},()=>groundShadow(0,-.007,0,.39,.35,.54));

  // Open woodland and loose grass, with the foreground translating at walking speed.
  const trackSpan=86;
  const moving=[];
  function moveWithTrack(object,x,z,shadowOpacity){object.position.x=x;object.position.z=z; moving.push({object,x,shadowOpacity});}
  // Keep the camera clear of nearby foliage at any orbit angle and on the longer
  // portrait framing. Fade with screen-space dithering to retain correct depth.
  function clearSight(shader){
    shader.uniforms.subjectCenter={value:subject};
    shader.vertexShader=shader.vertexShader.replace('#include <common>',`#include <common>\n varying float treePresence; uniform vec3 subjectCenter;`)
      .replace('#include <project_vertex>',`#include <project_vertex>
        vec2 eye=cameraPosition.xz-subjectCenter.xz;
        float span=max(length(eye),.001);
        vec2 dir=eye/span;
        vec2 tree=modelMatrix[3].xz-subjectCenter.xz;
        float along=dot(tree,dir), across=length(tree-dir*along);
        float r=2.38*length(modelMatrix[0].xyz);
        float block=(1.-smoothstep(r*.91,r*1.38,across))*smoothstep(3.,6.,along)*(1.-smoothstep(span+1.,span+3.,along));
        float close=1.-smoothstep(r*.95,r*1.48,length(tree-eye));
        float trackFade=1.-smoothstep(34.,42.9,abs(modelMatrix[3].x));
        treePresence=trackFade*(1.-max(block,close));`);
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>\n varying float treePresence;`)
      .replace('#include <alphatest_fragment>',`#include <alphatest_fragment>
        if(treePresence<.999 && treePresence <= fract(52.9829189*fract(dot(floor(gl_FragCoord.xy),vec2(.06711056,.00583715)))))discard;`);
  }
  const leafGeo=new T.IcosahedronGeometry(1,1);
  const lp=leafGeo.getAttribute('position');
  for(let i=0;i<lp.count;i++){
    const [x,y,z]=[lp.getX(i),lp.getY(i),lp.getZ(i)];
    const f=1+.11*Math.sin(x*29.+y*16.+z*11.);
    lp.setXYZ(i,x*f,y*f,z*f);
  }
  leafGeo.computeVertexNormals();
  const crowns=new T.MeshStandardMaterial({color:0xffffff,roughness:1});
  crowns.onBeforeCompile=s=>{
    clearSight(s);
    s.vertexShader=s.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 foliage;')
      .replace('#include <begin_vertex>','#include <begin_vertex>\nfoliage=(instanceMatrix*vec4(position,1.)).xyz;');
    s.fragmentShader=s.fragmentShader.replace('#include <common>',`#include <common>\nvarying vec3 foliage; ${noiseGLSL}`)
      .replace('#include <color_fragment>',`#include <color_fragment>
        vec2 s=foliage.xz+foliage.y*vec2(.71,1.37);
        float leaves=fbm(s*43.);
        diffuseColor.rgb *= .71+.62*leaves+.20*noise2(s*13.);`);
  };
  const bark=new T.MeshStandardMaterial({color:0x584b37,roughness:1});
  bark.onBeforeCompile=s=>{
    clearSight(s);
    s.vertexShader=s.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 branch;')
      .replace('#include <begin_vertex>','#include <begin_vertex>\nbranch=position;');
    s.fragmentShader=s.fragmentShader.replace('#include <common>','#include <common>\nvarying vec3 branch;')
      .replace('#include <color_fragment>','#include <color_fragment>\n diffuseColor.rgb *= .83+.12*sin(branch.x*290. + sin(branch.y*23.))+ .07*cos(branch.z*188.);');
  };
  const stemGeo=new T.CylinderGeometry(.68,1,1,7,1);
  const sprig=document.createElement('canvas'); sprig.width=sprig.height=128;
  const sc=sprig.getContext('2d'); sc.fillStyle='#ffffff';
  for(let i=0;i<780;i++){
    const a=rng()*TAU, r=Math.sqrt(rng())*61;
    const x=64+Math.cos(a)*r,y=64+Math.sin(a)*r;
    const cut=.52+.28*Math.sin(a*3.2)+.10*Math.sin(a*7);
    if(r>31 && rng()>cut)continue;
    sc.beginPath();sc.ellipse(x,y,between(1.0,4.0),between(.7,2.1),between(0,Math.PI),0,TAU);sc.fill();
  }
  const leafTexture=new T.CanvasTexture(sprig);
  leafTexture.anisotropy=4;
  const leafCards=new T.MeshStandardMaterial({ color:0xffffff,map:leafTexture,alphaTest:.45,side:T.DoubleSide,roughness:1 });
  leafCards.onBeforeCompile=clearSight;
  const cardGeo=new T.PlaneGeometry(1,1);
  const leafColors=[0x5f613e,0x6f6e42,0x56613e,0x727549,0x7f8051,0x656b46,0x76794d].map(x=>new T.Color(x));
  const dummy=new T.Object3D(), up=V(0,1,0);
  function acacia(x,z,height,spin) {
    const tree=new T.Group(); scene.add(tree); moveWithTrack(tree,x,z);
    tree.scale.setScalar(height/3.25);tree.rotation.y=spin; tree.position.y=-.035;
    const soft=groundShadow(x+height*.54,-.012,z+height*.47,height*1.91,height*1.18,.25);
    soft.rotation.z=.54;
    moveWithTrack(soft,soft.position.x,soft.position.z,soft.material.opacity);
    const branches=[], blobs=[], cards=[];
    function stem(a,b,r){branches.push({a,b,r});}
    const crown=V(between(-.30,-.03),2.32,between(-.14,.11));
    stem(V(0,-.01,0),V(-.19,1.02,.035),.145);
    stem(V(-.19,1.02,.035),V(-.01,1.77,-.02),.105);
    stem(V(-.01,1.77,-.02),crown,.085);
    const broad=between(.90,1.28), turn=between(0,TAU);
    function pad(p,r){
      for(let i=0;i<6;i++){
        const a=i*TAU/6+between(-.5,.5), d=between(.13,.65)*r;
        const q=p.clone().add(V(Math.cos(a)*d,between(-.11,.100)*r,Math.sin(a)*d*.74));
        blobs.push({p:q,x:between(.26,.46)*r,y:between(.085,.165)*r,z:between(.20,.39)*r,spin:a});
        cards.push({p:q.clone().add(V(between(-.13,.13),between(.02,.15),between(-.16,.16))),size:between(.43,.77)*r});
      }
      blobs.push({p:p.clone(),x:.45*r,y:.131*r,z:.33*r,spin:between(0,TAU)});
      for(let i=0;i<4;i++)cards.push({p:p.clone().add(V(between(-.69,.69)*r,between(.08,.24)*r,between(-.51,.51)*r)),size:between(.37,.62)*r});
    }
    for(let i=0;i<8;i++){
      const a=i*.7854+turn+between(-.27,.27), r=between(1.14,2.12)*broad, co=Math.cos(a),si=Math.sin(a);
      const end=V(co*r,between(2.73,3.33)-r*.089,si*r*.75);
      const from=i%3===0?V(-.14,1.14,0):i%3===1?V(-.01,1.77,-.02):crown;
      const elbow=from.clone().lerp(end,between(.39,.58));elbow.y-=between(.13,.30);
      const fork=elbow.clone().lerp(end,.54);
      stem(from,elbow,between(.049,.074)); stem(elbow,fork,between(.036,.046)); stem(fork,end,.022);
      for(let j=0;j<3;j++){
        const tip=end.clone().add(V(between(-.69,.69),between(-.065,.18),between(-.59,.59)));
        if(j!==0)stem(fork,tip,.014);
        pad(tip,between(.73,1.08));
      }
    }
    for(let i=0;i<6;i++){
      const p=V(between(-.96,.96),between(3.03,3.25),between(-.72,.72));
      stem(crown,p,.024); pad(p,between(.82,1.17));
    }
    const twigs=new T.InstancedMesh(stemGeo,bark,branches.length), leaves=new T.InstancedMesh(leafGeo,crowns,blobs.length);
    const lace=new T.InstancedMesh(cardGeo,leafCards,cards.length);
    branches.forEach(({a,b,r},i)=>{
      const d=b.clone().sub(a);dummy.position.copy(a).lerp(b,.5); dummy.quaternion.setFromUnitVectors(up,d.clone().normalize());
      dummy.scale.set(r,d.length()+r*.32,r);dummy.updateMatrix();twigs.setMatrixAt(i,dummy.matrix);
    });
    blobs.forEach(({p,x,y,z,spin},i)=>{
      dummy.position.copy(p);dummy.rotation.set(between(-.18,.18),spin,between(-.18,.18));dummy.scale.set(x,y,z);dummy.updateMatrix();
      leaves.setMatrixAt(i,dummy.matrix); leaves.setColorAt(i,leafColors[i%leafColors.length]);
    });
    cards.forEach(({p,size},i)=>{
      dummy.position.copy(p);dummy.rotation.set(between(-1.4,1.4),between(0,TAU),between(-2,2));dummy.scale.set(size,size*.68,1);
      dummy.updateMatrix();lace.setMatrixAt(i,dummy.matrix);lace.setColorAt(i,leafColors[(i+2)%leafColors.length]);
    });
    tree.add(twigs,leaves,lace);
  }
  const trees=[[-9,-9,4.05],[-18,-24,3.67],[10,-12,2.43],[-2,-23,2.77],[-28,-13,3.32],[25,-27,3.58],[32,-19,3.00],[-35,-28,3.22],
    [-23,12,3.55],[-33,22,4.4],[9,15,2.97],[26,25,4.10],[31,17,2.63],[1,28,3.30],[-12,24,3.02]];
  for(const [x,z,h] of trees)acacia(x,z,h,between(0,TAU));

  // Long, low ridges remain in the far distance. Distances and fog provide depth
  // without locking the mountains to the initial camera heading.
  function ridge(radius,high,color,phase){
    const p=[],c=[],faces=[], n=144, shade=new T.Color(color);
    for(let i=0;i<=n;i++){
      const t=i/n*TAU, shape=(.59+.26*Math.sin(t*3+phase)+.14*Math.cos(t*5-phase)+.078*Math.cos(t*15+phase)+.045*Math.sin(t*23));
      const h=.19+shape*high, r=radius+2.1*Math.sin(t*6+phase);
      for(const [rr,y,br] of [[r-11,-.115,.97],[r-2,h*.54,1.03],[r,h,.96]]){
        p.push(Math.cos(t)*rr,y,Math.sin(t)*rr); c.push(shade.r*br,shade.g*br,shade.b*br);
      }
      if(i>0)for(let j=0;j<2;j++){const a=(i-1)*3+j,b=i*3+j;faces.push(a,b,a+1,a+1,b,b+1);}
    }
    const geom=new T.BufferGeometry(); geom.setAttribute('position',new T.Float32BufferAttribute(p,3));geom.setAttribute('color',new T.Float32BufferAttribute(c,3));geom.setIndex(faces);
    const mesh=new T.Mesh(geom,new T.MeshBasicMaterial({vertexColors:true,side:T.DoubleSide})); scene.add(mesh);
  }
  ridge(86,8.7,0x8a8a73,1.4);ridge(67,5.4,0x81836a,4.7);ridge(53,2.6,0x777654,6.1);

  function grasses(){
    const pos=[], col=[], origins=[], bends=[], ids=[];
    const palette=[0xc4a165,0x9b8344,0xa59859,0xbfa76c,0x7a7e43,0xd8b785,0x929455].map(x=>new T.Color(x));
    function appendBlade(ox,oz,h,a,w,arch,k,stalk=false){
      const st=Math.sin(a),ct=Math.cos(a),p=pos.length/3;
      const tint=palette[k], phase=between(0,TAU);
      for(let j=0;j<4;j++){
        const t=j/3, wd=w*(1-t)**.77*(j===0?.67:1), base=arch*(t*t)*h;
        const edge=j===3?[0]:[-wd,wd];
        for(const off of edge){
          pos.push(ct*base-st*off,h*t,st*base+ct*off);
          const tintScale=(stalk?1.16:1)*(.63+.43*t);
          col.push(tint.r*tintScale,tint.g*tintScale,tint.b*tintScale);
          origins.push(ox,oz);bends.push(t*t*h,phase);
        }
      }
      ids.push(p,p+2,p+1,p+1,p+2,p+3,p+2,p+4,p+3,p+3,p+4,p+5,p+4,p+6,p+5);
      if(stalk){
        // Fine seeds on an above-foliage spike.
        const d=pos.length/3, s=between(.025,.045), wy=h*.83, b=arch*.7*h;
        for(const [dx,dy] of [[0,-.075],[-s,.0],[.003,.092],[s,.015]]){
          pos.push(ct*b-st*dx,wy+dy,st*b+ct*dx);col.push(tint.r*1.28,tint.g*1.25,tint.b*1.15);
          origins.push(ox,oz);bends.push(h*.67,phase);
        }
        ids.push(d,d+1,d+2,d,d+2,d+3);
      }
    }
    for(let i=0;i<2750;i++){
      const foreground=i>=2080;
      const x=between(-trackSpan*.5,trackSpan*.5), z=(foreground?between(3.1,8.8):between(2.0,36))*(rng()<.5?-1:1);
      const density=.43+.35*Math.sin(x*.83+z*.69)*Math.sin(z*.79-x*.53);
      if(Math.abs(z)<3.0&&rng()>.27||rng()>density+.24)continue;
      const h=between(.12,foreground?.63:.56)*(Math.abs(z)<4.1?.70:1), n=Math.floor(between(4,10));
      for(let j=0;j<n;j++){
        appendBlade(x+between(-.085,.085),z+between(-.085,.085),h*between(.47,1.31),between(0,TAU),between(.009,.029),between(.17,1.28),Math.floor(between(0,palette.length)));
      }
      if(rng()<.47)appendBlade(x,z,h*between(1.05,1.55),between(0,TAU),.009,between(.1,.45),rng()<.5?3:5,true);
    }
    const g=new T.BufferGeometry();
    g.setAttribute('position',new T.Float32BufferAttribute(pos,3));g.setAttribute('color',new T.Float32BufferAttribute(col,3));
    g.setAttribute('origin',new T.Float32BufferAttribute(origins,2));g.setAttribute('bend',new T.Float32BufferAttribute(bends,2));g.setIndex(ids);
    const m=new T.MeshBasicMaterial({vertexColors:true,side:T.DoubleSide});
    m.onBeforeCompile=s=>{
      s.uniforms.travel=distance;s.uniforms.elapsed=clock;
      s.vertexShader=s.vertexShader.replace('#include <common>',`#include <common>\nattribute vec2 origin, bend; uniform float travel, elapsed;`)
        .replace('#include <begin_vertex>',`#include <begin_vertex>
          float wave=.23+.34*sin(elapsed*1.72+origin.x*.43+origin.y*.31)+.12*sin(elapsed*3.41+bend.y);
          float along=mod(origin.x-travel+${trackSpan/2}.,${trackSpan}.)-${trackSpan/2}.;
          transformed.x += along+bend.x*wave*.42;
          transformed.z += origin.y+bend.x*wave*.22;
          transformed.y = transformed.y*(1.-smoothstep(36.,42.9,abs(along)))-.014;`);
    };
    const mesh=new T.Mesh(g,m); mesh.frustumCulled=false; scene.add(mesh);
  }
  grasses();

  const stoneGeom=new T.IcosahedronGeometry(1,1);
  const stoneCount=395, stones=new T.InstancedMesh(stoneGeom,new T.MeshStandardMaterial({roughness:1}),stoneCount);
  const pebbles=[];
  for(let i=0;i<stoneCount;i++){
    const z=between(-22,22), x=between(-trackSpan*.5,trackSpan*.5);
    const s=rng()**3*(Math.abs(z)<2.1?.073:.24)+.021;
    pebbles.push({x,z,y:s*.07,s,sx:between(.73,1.6),sy:between(.35,.68),sz:between(.58,1.26),spin:between(0,TAU)});
    stones.setColorAt(i,new T.Color([0x92785b,0x8f8065,0xb39d75,0xa08962,0x6c6250][i%5]));
  }
  stones.frustumCulled=false;scene.add(stones);

  let lastTravel=NaN;
  function update(time,travel,feet,camera){
    sky.position.copy(camera.position);
    if(travel===lastTravel)return;
    lastTravel=travel;
    distance.value=travel;clock.value=time;
    for(const {object,x,shadowOpacity} of moving){
      object.position.x=wrap(x-travel+trackSpan*.5,trackSpan)-trackSpan*.5;
      if(shadowOpacity!==undefined)object.material.opacity=shadowOpacity*(1-T.MathUtils.smoothstep(Math.abs(object.position.x),34,42.9));
    }
    for(let i=0;i<pebbles.length;i++){
      const {x,z,y,s,sx,sy,sz,spin}=pebbles[i];
      const along=wrap(x-travel+trackSpan*.5,trackSpan)-trackSpan*.5;
      const size=s*(1-T.MathUtils.smoothstep(Math.abs(along),37,43));
      dummy.position.set(along,y,z);
      dummy.rotation.set(.18,spin,.19);dummy.scale.set(size*sx,size*sy,size*sz);dummy.updateMatrix();stones.setMatrixAt(i,dummy.matrix);
    }
    stones.instanceMatrix.needsUpdate=true;
    feet.forEach(({point},i)=>{
      const m=contacts[i], h=clamp(point.y*3.5,0,1);
      m.position.x=point.x+.054+point.y*.16; m.position.z=point.z-point.y*.15;
      m.scale.set(mix(.34,.54,h),mix(.31,.49,h),1);m.material.opacity=mix(.53,.13,h);
    });
  }
  return {update};
};
