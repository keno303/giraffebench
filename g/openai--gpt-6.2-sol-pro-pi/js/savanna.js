/* A sunlit, procedural dry-season landscape. Everything is local and repeatable. */
(function(root,T,F){
  'use strict';
  const {V,TAU,rng,mix,smooth}=F.math;
  const {geometry,empty,appendTube,fromBuf,colorMat,mesh}=F.detail;
  const C=(x)=>new T.Color(x);
  const fract=x=>x-Math.floor(x);
  const wrap=(x,period)=>x-Math.floor(x/period+.5)*period;
  const glNoise=`
    float hashV(vec2 p) {
      vec3 p3=fract(vec3(p.xyx)*.1031);
      p3+=dot(p3,p3.yzx+33.33);
      return fract((p3.x+p3.y)*p3.z);
    }
    float noiseV(vec2 p){
      vec2 o=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
      return mix(mix(hashV(o),hashV(o+vec2(1,0)),f.x),mix(hashV(o+vec2(0,1)),hashV(o+vec2(1,1)),f.x),f.y);
    }
    float fieldNoise(vec2 p){
      mat2 m=mat2(.81,.59,-.59,.81);
      return .50*noiseV(p)+.255*noiseV(m*p*2.05+17.9)+.126*noiseV(m*p*4.14+6.7)+.066*noiseV(m*p*8.31+8.0)+.029*noiseV(m*p*17.27+10.1);
    }
  `;
  function sky(scene){
    const top=C(0x688f9d), blue=C(0xa9bec3), blush=C(0xe8d0a9), horizon=C(0xcdb796);
    const material=new T.ShaderMaterial({
      side:T.BackSide,depthWrite:false,fog:false,
      uniforms:{top:{value:top},blue:{value:blue},blush:{value:blush},horizon:{value:horizon}},
      vertexShader:`varying vec3 ray;
      void main(){ray=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
      fragmentShader:`
        varying vec3 ray;
        uniform vec3 top,blue,blush,horizon;
        ${glNoise}
        void main(){
          vec3 d=normalize(ray);
          float el=max(0.0,d.y);
          vec3 sun=normalize(vec3(-.63,.20,-.75));
          float glow=pow(max(dot(d,sun),0.0),5.0);
          vec3 groundHaze=horizon+vec3(.07,.045,.015)*glow;
          vec3 c=mix(groundHaze,blush,smoothstep(-.02,.060,el));
          c=mix(c,blue,smoothstep(.018,.293,el));
          c=mix(c,top,smoothstep(.15,.57,el));
          c+=vec3(.13,.091,.043)*glow*exp(-.60*el);
          // Illumination of stretched, optically thin high clouds.
          vec2 band=vec2(-d.x*6.7+d.z*2.3,d.y*26.0+d.z*.54);
          float tilt=fieldNoise(band*vec2(.70,.44)+vec2(11.4,32.3));
          float cloud=fieldNoise(band*vec2(1.22,1.67)+vec2(tilt*2.2,tilt*3.2));
          float streak=max(smoothstep(.535,.74,cloud)*(.25+.55*tilt),0.0);
          streak*=smoothstep(.036,.11,el)*(1.0-smoothstep(.32,.68,el));
          c=mix(c,vec3(.91,.785,.624),streak*(.56+.14*glow));
          gl_FragColor=vec4(c,1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `
    });
    const dome=mesh(new T.SphereGeometry(250,42,25),material,scene,false);
    dome.renderOrder=-100;return dome;
  }
  function escarpment(scene){
    const layers=[
      [173,.66,5.8,0xa4a1a0,0xb9ad99,23],
      [141,.58,4.65,0x9d9790,0xb4a592,35],
      [111,.40,3.30,0xa09182,0xb4a38b,891],
      [77,.25,1.80,0x968b6e,0xaa9d83,791]
    ];
    for(let l=0;l<layers.length;l++){
      const [r,base,height,hex1,hex0,seed]=layers[l];
      const top=C(hex1),bot=C(hex0), pts=[], c=[], ix=[];
      const noise=(a)=>.21*Math.sin(a*7+seed)+.16*Math.sin(a*11+seed*.61)+.080*Math.sin(a*18+seed*.19)+.032*Math.sin(a*71+seed);
      const N=456;
      for(let i=0;i<=N;i++){
        const a=TAU*i/N;
        const rr=r+Math.cos(a*6+seed)*5.1;
        const massif=Math.pow(.5+.5*Math.sin(a*(l===0?2:3)-1.18+seed*.077),2)*1.1;
        const h=base + height*Math.max(0,.34+massif+noise(a));
        const und=.84+.17*Math.cos(a*17+seed)+.083*Math.cos(a*39+seed)+.014*Math.cos(a*97+seed);
        for(const y of [-.11,h*.51,h*und]){
          pts.push(Math.cos(a)*rr,y,Math.sin(a)*rr);
          const v=bot.clone().lerp(top,smooth(-.2,h,y));
          c.push(v.r,v.g,v.b);
        }
        if(i){const a=(i-1)*3;ix.push(a,a+1,a+3,a+1,a+4,a+3,a+1,a+2,a+4,a+2,a+5,a+4);}
      }
      const mat=new T.MeshBasicMaterial({vertexColors:true,side:T.DoubleSide,fog:false});
      mesh(geometry(pts,ix,c),mat,scene,false);
    }
  }
  function terrain(scene,travel){
    const m=new T.MeshStandardMaterial({color:0xffffff,roughness:.99});
    const palette={sand:{value:C(0xb29674)},dark:{value:C(0x67634f)},pale:{value:C(0xc9aa7c)},grey:{value:C(0x8b8871)}};
    m.onBeforeCompile=s=>{
      s.uniforms.walkDist=travel;Object.assign(s.uniforms,palette);
      s.vertexShader=s.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 place;')
        .replace('#include <begin_vertex>','#include <begin_vertex>\nplace=(modelMatrix*vec4(position,1.0)).xyz;');
      s.fragmentShader=s.fragmentShader.replace('#include <common>',`#include <common>
        varying vec3 place; uniform float walkDist; uniform vec3 sand,dark,pale,grey;
        ${glNoise}
        `).replace('#include <color_fragment>',`#include <color_fragment>
        vec2 p=place.xz+vec2(walkDist,0.0);
        float path=1.0-smoothstep(.52,1.90,abs(place.z+.18*sin(p.x*.89)+.16*sin(p.x*.31)));
        vec2 fp=p*vec2(.83,1.16);
        float f=fieldNoise(fp*.30);
        float tint=fieldNoise(p*.17+80.0);
        float bry=fieldNoise(fp*1.9+15.4);
        vec3 soil=mix(sand,pale,smoothstep(.31,.68,f)*(.50+.23*path));
        float scab=(1.0-smoothstep(.18,.445,bry))*(.52-.33*path);
        soil=mix(soil,dark,(smoothstep(.44,.70,tint)*(.35-.21*path)+scab)*.71);
        soil=mix(soil,grey,smoothstep(.44,.76,bry)*(.29-.13*path));
        float filt=1.0-smoothstep(.013,.160,max(length(dFdx(p)),length(dFdy(p))));
        float aggregate=noiseV(p*43.)*.8+.2*noiseV(p*138.);
        soil*=1.0+filt*.34*(aggregate-.50);
        float grit=smoothstep(.65,.90,noiseV(p*36.0)+.28*noiseV(p*160.0))*filt;
        soil=mix(soil,pale*.90,grit*.55);
        diffuseColor.rgb*=soil;
        `).replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
        float gravel=(bry*.049+aggregate*filt*.006);
        float D=120.0/(1.0+length(vViewPosition)*.45);
        normal=normalize(normal+vec3(dFdx(gravel),dFdy(gravel),0.0)*D);
        `);
    };
    const floor=mesh(new T.PlaneGeometry(470,470),m,scene,false);
    floor.receiveShadow=true;floor.rotation.x=-Math.PI/2;
  }
  function grassGeometry(seed){
    const r=rng(seed), b=empty();
    const base=C(0x696c3e),dry=C(0xaa9460), straw=C(0xcbab72),olive=C(0x808047);
    for(let blade=0;blade<19;blade++){
      const angle=r()*TAU, h=.108+Math.pow(r(),1.16)*.40, spread=.060+r()*.24, off=r()*.064;
      const w=.0045+.0095*r();
      const rad=angle+(r()-.5)*.81;
      const x=Math.cos(angle), z=Math.sin(angle);
      const side=V(Math.cos(rad+1.57),0,Math.sin(rad+1.57));
      const rcol=base.clone().lerp(dry,r()*.66),tip=olive.clone().lerp(straw,.40+r()*.60);
      const n=b.p.length/3;
      const L=4;
      for(let i=0;i<L;i++){
        const t=i/(L-1), ww=w*Math.pow(1-t,.68)+.0004;
        const u=off+Math.pow(t,1.58)*spread;
        const y=h*(t-.27*t*t)-.015;
        const center=V(u*x,y,u*z);
        const tone=rcol.clone().lerp(tip,smooth(.06,1,t));
        for(let j=-1;j<=1;j++){
          const p=center.clone().addScaledVector(side,j*ww);
          if(j===0){p.y+=ww*.20;p.x-=ww*.055*x;}
          b.p.push(p.x,p.y,p.z);
          const c=tone.clone().multiplyScalar(j===0?1.13:1+.08*j);
          b.c.push(c.r,c.g,c.b);
        }
        if(i){const a=n+(i-1)*3;
          b.i.push(a,a+3,a+1,a+3,a+4,a+1,a+1,a+4,a+2,a+4,a+5,a+2);
        }
      }
    }
    // The oatmeal-coloured, branching seed heads on mature grass.
    for(let i=0;i<3;i++){
      const ang=r()*TAU, v=V(Math.cos(ang),0,Math.sin(ang));
      const h=.25+r()*.30,d=.034+r()*.122;
      const p=V(0,-.005).addScaledVector(v,r()*.048),a=p.clone().addScaledVector(v,d*.37).add(V(.0,h*.6)),e=p.clone().addScaledVector(v,d).add(V(0,h));
      appendTube(b,[p,a,e],t=>mix(.0059,.0015,t),t=>base.clone().lerp(dry,t*.87),4);
      for(let k=0;k<7;k++){
        const t=.62+k*.054, at=a.clone().lerp(e,(t-.60)/.40), ang2=k*2.4+i*.91;
        const u=V(Math.sin(ang2),0,Math.cos(ang2));
        const far=at.clone().addScaledVector(u,.022-k*.0026).add(V(0,.024-k*.0029));
        const c=at.clone().lerp(far,.59);
        const idx=b.p.length/3;
        for(const p of [at,c.clone().add(V(0,.0045,.004)),far,c.clone().add(V(.004,-.0045,-.004))]){
          b.p.push(p.x,p.y,p.z);b.c.push(straw.r,straw.g,straw.b);
        }
        b.i.push(idx,idx+1,idx+2,idx,idx+2,idx+3);
      }
    }
    return geometry(b.p,b.i,b.c);
  }
  function getTravelMat(uniforms,kind,period){
    const m=new T.MeshStandardMaterial({vertexColors:true,side:kind==='stone'?T.FrontSide:T.DoubleSide,roughness:1});
    m.onBeforeCompile=s=>{
      Object.assign(s.uniforms,uniforms);
      s.vertexShader=s.vertexShader.replace('#include <common>',`#include <common>
      uniform float advance;
      uniform float wind;
      `).replace('#include <project_vertex>',`
        vec4 mvPosition=vec4(transformed,1.0);
        #ifdef USE_INSTANCING
          mvPosition=instanceMatrix*mvPosition;
          vec3 plant=instanceMatrix[3].xyz;
          float localX=mod(plant.x-advance+${(period*.5).toFixed(1)},${period.toFixed(1)})-${(period*.5).toFixed(1)};
          mvPosition.x+=localX-plant.x;
          mvPosition.y=mix(plant.y-.05,mvPosition.y,1.0-smoothstep(${(period*.5-5).toFixed(1)},${(period*.5).toFixed(1)},abs(localX)));
          ${kind!=='stone'?`vec2 sway=vec2(sin(wind*1.72+plant.x*.58+plant.z*.33),cos(wind*1.94+plant.z*.76+plant.x*.24));
            mvPosition.xz+=sway*mvPosition.y*mvPosition.y*${kind==='grass'?'.24':'.068'};`:''}
        #endif
        mvPosition=modelViewMatrix*mvPosition;
        gl_Position=projectionMatrix*mvPosition;
      `);
    };
    m.customProgramCacheKey=()=>`${kind}-${period}`;
    return m;
  }
  function scrubGeometry(seed){
    const r=rng(seed),b=empty();
    const stem=C(0x6f6347), shoot=C(0x8c8164), green=C(0x777c54), dry=C(0xaa9d6d);
    for(let i=0;i<14;i++){
      const a=r()*TAU,dir=V(Math.cos(a),0,Math.sin(a));
      const spread=.13+r()*.32, high=.125+r()*.28;
      const base=dir.clone().multiplyScalar(.06*r());
      const joint=base.clone().addScaledVector(dir,spread*.42).add(V(0,high*.66));
      const end=base.clone().addScaledVector(dir,spread).add(V(0,high));
      appendTube(b,[base,joint,end],t=>.013*Math.pow(1-t,1.3)+.0022,t=>stem.clone().lerp(shoot,t),5);
      for(let j=0;j<6;j++){
        const f=j/6;
        const p=joint.clone().lerp(end,f), angle=a+(.7+r()*.7)*(j%2?1:-1);
        const d=V(Math.cos(angle),.26+r()*.71,Math.sin(angle));
        const leafEnd=p.clone().addScaledVector(d,(.13-r()*.039)*(1.06-f*.52));
        appendTube(b,[p,leafEnd],t=>mix(.0039,.0011,t),shoot,3);
        for(let k=0;k<6;k++){
          const q=p.clone().lerp(leafEnd,.21+k*.134);
          const theta=angle+(k%2?1:-1)*(1.0+.54*r());
          const w=(.006+.012*r())*(1-k*.07);
          const ll=(.034+.030*r())*(1-k*.074);
          const axis=V(Math.cos(theta),.18+.63*r(),Math.sin(theta));
          const cross=V(-Math.sin(theta),.17*(r()-.50),Math.cos(theta));
          const peak=q.clone().addScaledVector(axis,ll);
          const m=q.clone().lerp(peak,.47);
          const c=green.clone().lerp(dry,r()*.82).multiplyScalar(.77+.31*r());
          const idx=b.p.length/3;
          for(const p of [q,m.clone().addScaledVector(cross,w),peak,m.clone().addScaledVector(cross,-w),m.clone().add(V(0,.005))]){
            b.p.push(p.x,p.y,p.z);b.c.push(c.r,c.g,c.b);
          }
          b.i.push(idx,idx+1,idx+4,idx+1,idx+2,idx+4,idx+2,idx+3,idx+4,idx+3,idx,idx+4);
        }
      }
    }
    return geometry(b.p,b.i,b.c);
  }
  function vegetation(scene,uniforms,coarse=false){
    const r=rng(732), period=74;
    const geo=grassGeometry(8759);
    const m=getTravelMat(uniforms,'grass',period);
    const n=coarse?540:1250;
    const grass=new T.InstancedMesh(geo,m,n);
    grass.frustumCulled=false;scene.add(grass);
    const dummy=new T.Object3D();
    for(let i=0;i<n;i++){
      const side=r()>.665?1:-1; const xx=(r()-.5)*period;
      let zz=(side<0?1.33:2.87)+(side<0?1:1.08)*Math.pow(r(),1.53)*(side<0?51:24);
      const tall=(.48+.67*Math.pow(r(),1.43))*(.78+.41*(.5+.5*Math.sin(xx*.96+zz*.72)));
      zz+=.33*Math.sin(xx*.76+zz*.24);
      if(side===1&&zz<4.6)zz+=1.3*r();
      dummy.position.set(xx,side===1?-.011:-.014,side*zz);
      dummy.rotation.set(.08*(r()-.50),r()*TAU,.22*(r()-.5));
      const lim=side===1&&zz<6?.83:1;
      dummy.scale.set(tall*(1+r()*.65),tall*lim,tall*(1+r()*.45));dummy.updateMatrix();
      grass.setMatrixAt(i,dummy.matrix);
      grass.setColorAt(i,C(0xffffff).lerp(C(r()>.5?0xd4c19f:0xbfc08c),r()*.64));
    }
    const shrubs=new T.InstancedMesh(scrubGeometry(20165),getTravelMat(uniforms,'scrub',period),coarse?83:125);
    shrubs.frustumCulled=false;scene.add(shrubs);
    const shrubRandom=rng(85041);
    for(let i=0;i<shrubs.count;i++){
      const rx=shrubRandom, side=rx()>.70?1:-1;
      const x=(rx()-.5)*period, z=side*(3+Math.pow(rx(),1.25)*(side<0?56:34));
      const scale=.45+1.06*Math.pow(rx(),1.08);
      dummy.position.set(x,-.029,z);dummy.rotation.set(0,rx()*TAU,0);
      dummy.scale.set(scale,scale*(.69+.44*rx()),scale*(.82+.38*rx()));dummy.updateMatrix();
      shrubs.setMatrixAt(i,dummy.matrix);
      shrubs.setColorAt(i,C(0xffffff).lerp(C(rx()<.62?0xa7ad8b:0xc3a57b),rx()*.57));
    }
    // Weathered shards of stone along the dusty track.
    const stoneGeo=new T.IcosahedronGeometry(1,1);
    const a=stoneGeo.attributes.position, cols=[];
    for(let i=0;i<a.count;i++){
      const x=a.getX(i),y=a.getY(i),z=a.getZ(i);
      const w=1+.12*Math.sin(4*x+2*z)*Math.cos(5*y-2*z);
      a.setXYZ(i,x*w,y*w,z*w);
      const c=C(0x777365).lerp(C(0xbca283),.38+.40*y+.105*Math.sin(z*13+x*9));
      cols.push(c.r,c.g,c.b);
    }
    stoneGeo.setAttribute('color',new T.Float32BufferAttribute(cols,3));
    stoneGeo.computeVertexNormals();
    const stones=new T.InstancedMesh(stoneGeo,getTravelMat(uniforms,'stone',period),coarse?280:580);
    stones.frustumCulled=false;scene.add(stones);
    for(let i=0;i<stones.count;i++){
      const x=(r()-.5)*period, z=(r()-.55)*37;
      const rad=.018+.150*Math.pow(r(),4.4);
      dummy.position.set(x,-rad*(.05+.18*r()),z);
      dummy.rotation.set(r()*.30,r()*TAU,r()*.24);dummy.scale.set(rad*(.66+r()*.53),rad*(.27+r()*.35),rad*(.55+r()*.42));dummy.updateMatrix();
      stones.setMatrixAt(i,dummy.matrix);stones.setColorAt(i,C(0xdaccb8).lerp(C(0x916f50),r()*.63));
    }
  }
  function leafSheet(){
    const img=document.createElement('canvas');img.width=128;img.height=128;
    const ctx=img.getContext('2d');const random=rng(9094);
    const paint=(cx,cy,len,width,ang,light)=>{
      ctx.save();ctx.translate(cx,cy);ctx.rotate(ang);
      ctx.fillStyle=`rgb(${light},${light},${light-2})`;
      ctx.beginPath();ctx.moveTo(-len*.13,0);
      ctx.bezierCurveTo(len*.23,-width,len*.74,-width*.60,len,0);
      ctx.bezierCurveTo(len*.65,width*.71,len*.17,width,-len*.13,0);
      ctx.fill();ctx.restore();
    };
    for(let i=0;i<5;i++){
      const ox=36+i*12,oy=83-i*8,a=-1.54+random()*.50;
      const l=i===2?45:34+random()*15;
      ctx.save();ctx.translate(ox,oy);ctx.rotate(a);
      ctx.fillStyle='#999990';ctx.fillRect(0,-.95,l,1.9);
      for(let j=1;j<=6;j++){
        const f=j/7, len=(10+random()*7)*(1-f*.62),w=2.3+random()*1.9;
        paint(l*f,0,len,w,.74+random()*.41,180+Math.round(random()*50));
        paint(l*f+1.9,0,len,w,-.70-random()*.58,179+Math.round(random()*55));
      }
      paint(l-4,0,7,2.9,-.118,222);ctx.restore();
    }
    for(let i=0;i<19;i++){
      const a=random()*TAU,d=Math.sqrt(random())*35;
      paint(64+Math.cos(a)*d,51+Math.sin(a)*d,10+random()*18,2.4+random()*4.8,a,191+Math.round(random()*64));
    }
    const tex=new T.CanvasTexture(img);tex.colorSpace=T.SRGBColorSpace;tex.anisotropy=2;return tex;
  }
  function canopyPatch(b,r,center,w,h,d,base){
    const rims=[C(0x79714b),C(0x8b855b),C(0xa29a69),C(0x454832)];
    for(let i=0;i<156;i++){
      const a=TAU*r(), dist=Math.sqrt(r());
      const x=w*Math.cos(a)*dist, z=d*Math.sin(a)*dist;
      const y=(r()-.52)*h*2.3*Math.pow(1.05-dist*.65,.55)+h*(1-dist*dist)*.28;
      const pos=center.clone().add(V(x,y,z));
      const s=.083+r()*.146;
      const u=V((r()-.50)*2,(r()-.50)*1.06,(r()-.50)*2).normalize().multiplyScalar(s);
      const v=V((r()-.50)*1.53,.79+r()*.30,(r()-.50)*1.53).normalize().multiplyScalar(s*(.71+r()*.41));
      const c=base.clone().lerp(rims[Math.floor(r()*rims.length)],.28+r()*.40).multiplyScalar(.63+.33*r()+y*.66);
      const vertices=[pos.clone().add(u).add(v),pos.clone().sub(u).add(v),pos.clone().sub(u).sub(v),pos.clone().add(u).sub(v)];
      const n=b.p.length/3;
      for(const p of vertices){b.p.push(p.x,p.y,p.z);b.c.push(c.r,c.g,c.b);}
      b.uv.push(1,1,0,1,0,0,1,0);
      b.i.push(n,n+1,n+2,n,n+2,n+3);
    }
  }
  function treePrototype(scene,seed,width=1,leafy=1,leafMaterial){ 
    const r=rng(seed), wood=empty(), leaves=empty();
    const plant=new T.Group();scene.add(plant);leaves.uv=[];
    const bark=C(0x53493b), light=C(0x7d6f56), sage=C(0x767749);
    const h=2.0+r()*.54;
    const lean=(r()-.55)*.53;
    const foot=V(0,-.052,0), trunk=V(lean,h*.43,.096), crown=V(lean*.72+.11,h*.87,.17);
    appendTube(wood,[foot,V(-.013,.17,.008),trunk.clone().multiplyScalar(.62).add(V(.11,.00,-.03)),trunk,crown],(t,i)=>[.201,.143,.105,.096,.029][i],(t)=>bark.clone().lerp(light,t*.4),11,.87);
    const limb=(pts,thick,sides=6)=>appendTube(wood,pts,(t)=>thick*(1-.91*Math.pow(t,1.18))+.002,(t)=>bark.clone().lerp(light,t*.48),sides,.91);
    const branches=8;
    for(let i=0;i<branches;i++){
      const a=i/branches*TAU+(r()-.40)*.85;
      const d=(.76+r()*1.17)*width;
      const v=V(Math.cos(a),0,Math.sin(a));
      const cross=V(-v.z,0,v.x);
      const base=trunk.clone().lerp(crown,(i/branches)*.56+r()*.29-.08);
      const fork=base.clone().addScaledVector(v,d*.54).addScaledVector(cross,(r()-.45)*.38);
      fork.y=h*(.78+.13*r());
      const point=fork.clone().addScaledVector(v,d*.51).addScaledVector(cross,(r()-.47)*.37);
      point.y=h*(1.025+.19*r())-.12*d;
      const elbow=base.clone().lerp(fork,.42).addScaledVector(cross,(r()-.50)*.38).add(V(0,.12));
      limb([base,elbow,fork,point],.089-i*.005);
      for(let j=0;j<4;j++){
        const a2=a+(j%2===0?1:-1)*(.29+r()*1.05), v2=V(Math.cos(a2),0,Math.sin(a2));
        const fb=fork.clone().lerp(point,(j*.27+r()*.29)*1.04);
        const fp=fb.clone().addScaledVector(v2,(.20+r()*.68)*width).add(V(0,.16+r()*.25));
        limb([fb,fb.clone().lerp(fp,.45).add(V(0,.02)),fp],.020-j*.0018,5);
        for(let k=0;k<2;k++){
          const tw=fp.clone().addScaledVector(v2,k*.23).add(V((r()-.5)*.48,.095+r()*.108,(r()-.5)*.43));
          limb([fp,tw],.008,4);
          if(r()<leafy)canopyPatch(leaves,r,tw,(.29+r()*.40)*width,.139+r()*.112,.23+r()*.44,sage);
        }
      }
    }
    fromBuf(wood,colorMat(.94),plant,false);
    const leafGeo=geometry(leaves.p,leaves.i,leaves.c);
    leafGeo.setAttribute('uv',new T.Float32BufferAttribute(leaves.uv,2));
    mesh(leafGeo,leafMaterial,plant,false);
    return plant;
  }
  function trees(scene){
    const info=[
      [-14.25,-15.3,1.34,.95,1.39,8917],[7.30,-19.5,1.33,1.15,1.26,4103],[-18.9,-32.0,1.53,.90,1.49,62413],
      [20,-37.1,1.35,.87,1.29,817],[3.1,-46.6,1.91,.69,1.18,76],[-28.0,-49.1,1.52,.68,1.57,166],
      [-13.3,15.2,1.26,1.05,1.18,481], [16.8,19.8,1.23,.91,1.14,701],[1.6,34.9,1.52,.83,1.49,79],
      [35.7,9.2,1.52,.90,1.08,550],[-26.8,32.1,1.72,.78,1.08,5691]
    ];
    const leafMaterial=colorMat(.96,T.DoubleSide);
    leafMaterial.map=leafSheet();leafMaterial.alphaTest=.36;
    const all=info.map(([x,z,s,l,w,seed])=>{
      const t=treePrototype(scene,seed,w,l,leafMaterial); t.scale.setScalar(s);t.rotation.y=seed%31*.196;t.position.set(x,0,z);
      const shade=Math.abs(z)<38?halo(scene,x+2.6,z-2.17,9.9*s,5.6*s,.19,.004):null;
      if(shade)shade.rotation.z=-.57;
      return [t,x,shade];
    });
    // Small silhouettes turn the base of the haze into a continuous distant grassland.
    const r=rng(741), scrub=empty();
    for(let i=0;i<160;i++){
      const a=r()*TAU, rr=49+r()*32;const px=Math.cos(a)*rr,pz=Math.sin(a)*rr;
      const fw=.30+1.65*Math.pow(r(),1.6),fh=.16+r()*.58;
      for(let j=0;j<2;j++){
        const nx=Math.cos(j*Math.PI/2+a+.6),nz=Math.sin(j*Math.PI/2+a+.6);
        const n=scrub.p.length/3;
        const c=C(0x887b60).lerp(C(0xa39a76),r());
        for(let k=0;k<9;k++){
          const u=k*.25-1;const y=Math.pow(Math.max(0,1-u*u),.7)*fh*(.63+r()*.44);
          const x=px+nx*u*fw,z=pz+nz*u*fw;
          scrub.p.push(x,-.02,z,x,y,z);
          for(let f=0;f<2;f++)scrub.c.push(c.r,c.g,c.b);
          if(k){const b=n+(k-1)*2;scrub.i.push(b,b+2,b+1,b+1,b+2,b+3);}
        }
      }
    }
    const m=new T.MeshBasicMaterial({side:T.DoubleSide,vertexColors:true});
    fromBuf(scrub,m,scene,false);
    return distance=>{
      for(const [t,x,shade] of all){
        t.position.x=wrap(x-distance,112);
        if(shade)shade.position.x=t.position.x+2.6;
      }
    };
  }

  function halo(scene,x,z,w,h,alpha,depth=.008){
    const mat=new T.ShaderMaterial({
      transparent:true,depthWrite:false,
      uniforms:{alpha:{value:alpha},ink:{value:C(0x342a23)}},
      vertexShader:`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
      fragmentShader:`varying vec2 vUv;uniform float alpha;uniform vec3 ink;
        void main(){vec2 u=(vUv-.5)*2.0;
          float d=dot(u,u); float op=exp(-d*4.13)*(1.0-smoothstep(.53,1.0,d));
          gl_FragColor=vec4(ink,alpha*op);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`
    });
    const m=mesh(new T.PlaneGeometry(1,1),mat,scene,false);m.rotation.x=-Math.PI/2;m.position.set(x,depth,z);m.scale.set(w,h,1);return m;
  }
  function suspendedDust(scene,travel,dustTime){
    const r=rng(525), p=[], state=[];
    for(let i=0;i<97;i++){
      p.push((r()-.5)*25,.20+Math.pow(r(),2.4)*1.85,(r()-.50)*16);
      state.push(r(),r());
    }
    const g=new T.BufferGeometry();
    g.setAttribute('position',new T.Float32BufferAttribute(p,3));g.setAttribute('state',new T.Float32BufferAttribute(state,2));
    const mat=new T.ShaderMaterial({
      transparent:true,depthWrite:false,
      uniforms:{advance:travel,wind:dustTime},
      vertexShader:`attribute vec2 state;uniform float advance,wind;varying vec2 info;
        void main(){vec3 p=position; p.x=mod(p.x-advance+12.5+wind*.25,25.)-12.5;
          p.y+=.15*sin(wind*.85+state.y*17.0); p.z+=.32*cos(wind*.64+state.x*25.0);
          vec4 m=modelViewMatrix*vec4(p,1.0); gl_Position=projectionMatrix*m;
          info=vec2(state.y, (1.0-smoothstep(5.5,20.0,-m.z))*smoothstep(2.,4.,-m.z));
          gl_PointSize=clamp((18.0+state.x*28.0)/-m.z,1.0,6.0);
        }`,
      fragmentShader:`varying vec2 info;
        void main(){float r=length(gl_PointCoord-.5)*2.0;gl_FragColor=vec4(.89,.73,.52, (1.0-smoothstep(.11,1.0,r))*info.y*(.09+.13*info.x));
        #include <colorspace_fragment>
        }`
    });
    const obj=new T.Points(g,mat);obj.frustumCulled=false;scene.add(obj);
  }
  function hoofTraces(scene,{stride,period,duty},coarse){
    // Contacts are evaluated analytically from stride phase, so scrubbing and
    // continuous playback show the same tracks and ground-relative dust.
    const history=5, total=4*history;
    const pg=new T.PlaneGeometry(1,1);
    const depth=new T.InstancedBufferAttribute(new Float32Array(total),1);
    pg.setAttribute('press',depth);
    const tracks=new T.InstancedMesh(pg,new T.ShaderMaterial({
      transparent:true,depthWrite:false,
      vertexShader:`attribute float press;varying vec2 groundUv;varying float shade;
        void main(){groundUv=uv;vec4 p=modelViewMatrix*instanceMatrix*vec4(position,1.0);
          shade=press*(1.0-smoothstep(12.0,21.0,-p.z));gl_Position=projectionMatrix*p;}`,
      fragmentShader:`varying vec2 groundUv;varying float shade;${glNoise}
        void main(){vec2 p=groundUv-.5;p.y=abs(p.y)-.134;
          p.x-=.024;
          vec2 q=p*vec2(3.88,7.2);
          q.y+=.10*q.x*q.x-.062*q.x;
          float nois=noiseV(groundUv*59.0)-.5;
          float v=length(q)+.090*nois;
          float cut=1.0-smoothstep(.68,1.04,v);
          float crest=smoothstep(.69,1.05,v)*(1.0-smoothstep(1.03,1.23,v));
          vec3 tone=mix(vec3(.128,.092,.053),vec3(.55,.402,.234),.96*crest+.04*nois);
          gl_FragColor=vec4(tone,shade*(.72-.32*nois)*max(cut,.41*crest));
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`
    }),total);
    tracks.frustumCulled=false;tracks.renderOrder=1;scene.add(tracks);
    const dummy=new T.Object3D();dummy.rotation.x=-Math.PI*.5;
    dummy.scale.set(.468,.354,1);
    const count=coarse?13:22;
    const pos=new T.Float32BufferAttribute(new Float32Array(count*8*3),3);
    const spray=new T.Float32BufferAttribute(new Float32Array(count*8*2),2);
    const particles=new T.BufferGeometry();particles.setAttribute('position',pos);particles.setAttribute('spray',spray);
    particles.setAttribute('seed',new T.Float32BufferAttribute(Array.from({length:count*8},(_,i)=>fract(i*.282638)),1));
    const height={value:600};
    const cloud=new T.Points(particles,new T.ShaderMaterial({
      transparent:true,depthWrite:false,
      uniforms:{height},
      vertexShader:`attribute vec2 spray;attribute float seed;uniform float height;varying float opacity;varying float hash;
        void main(){vec4 p=modelViewMatrix*vec4(position,1.0);gl_Position=projectionMatrix*p;
          gl_PointSize=clamp(spray.x*.5*height*projectionMatrix[1][1]/max(.1,-p.z),1.0,90.0);
          opacity=spray.y;hash=seed;}`,
      fragmentShader:`varying float opacity;varying float hash;${glNoise}
        void main(){vec2 p=2.0*gl_PointCoord-1.0;float r=dot(p,p);
          float grain=noiseV(p*3.2+hash*48.0);
          float v=opacity*exp(-r*4.5)*(1.0-smoothstep(.59,1.0,r))*(.48+.89*grain);
          gl_FragColor=vec4(mix(vec3(.51,.375,.218),vec3(.67,.546,.354),hash),v);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`
    }));
    cloud.frustumCulled=false;cloud.renderOrder=2;scene.add(cloud);
    const r=rng(9121);
    const grains=Array.from({length:count*8},()=>Array.from({length:7},r));
    return (feet,bufferHeight)=>{
      height.value=bufferHeight||600;
      for(let i=0;i<4;i++){
        const f=feet[i];
        for(let j=0;j<history;j++){
          const k=i*history+j,a=f.phase+j;
          dummy.position.set(f.groundX+.017-j*stride,.0048,f.groundZ);
          dummy.rotation.z=f.side*.063;dummy.updateMatrix();tracks.setMatrixAt(k,dummy.matrix);
          depth.setX(k,smooth(.026,.21,a)*.32*Math.exp(-a*.45)*(1-smooth(3.65,4.92,a)));
        }
        for(let event=0;event<2;event++)for(let j=0;j<count;j++){
          const index=(i*2+event)*count+j;
          const [delay,drift,wide,size,tint,life,thrust]=grains[index];
          const elapsed=fract(f.phase+1-(event?duty:0))*period-delay*.054;
          const duration=.255+.43*life;
          if(elapsed<0||elapsed>duration){spray.setXY(index,1,0);continue;}
          const t=elapsed/duration,v=Math.sqrt(t);
          const contact=f.groundX-(event&&f.phase<duty?stride:0);
          const x=contact+(event?.118:.048)+(drift-.63)*(.12+t*.31)-t*thrust*(event?.25:.11);
          const y=.018+(.024+thrust*.071)*v+.075*drift*t;
          const z=f.groundZ+(wide-.5)*(.139+.37*t)+tint*.068*t;
          const scale=.030+.094*size+(.052+.09*thrust)*t;
          const strength=(event?.087:.111)*(.54+.49*tint)*smooth(0,.20,t)*(1-smooth(.35,1,t));
          pos.setXYZ(index,x,y,z);spray.setXY(index,scale,strength);
        }
      }
      tracks.instanceMatrix.needsUpdate=true;depth.needsUpdate=true;pos.needsUpdate=true;spray.needsUpdate=true;
    };
  }
  function make(scene,{coarse=false,gait}={}){
    scene.background=C(0xc6b29c);scene.fog=new T.FogExp2(0xc0ae92,.0245);
    const dome=sky(scene);
    escarpment(scene);
    const travel={value:0},wind={value:0};terrain(scene,travel);
    vegetation(scene,{advance:travel,wind},coarse);
    const treeMotion=trees(scene);
    const ambient=new T.HemisphereLight(0xe4edf6,0xa88d71,1.85);scene.add(ambient);
    const key=new T.DirectionalLight(0xffdfa9,2.66);
    key.position.set(-6.8,7.1,5.5); key.target.position.set(.25,1.96,0);scene.add(key,key.target);
    key.castShadow=true;
    key.shadow.mapSize.set(coarse?1024:2048,coarse?1024:2048);
    key.shadow.camera.left=-7.4;key.shadow.camera.right=7.4;key.shadow.camera.top=7.4;key.shadow.camera.bottom=-7.4;
    key.shadow.camera.near=.5;key.shadow.camera.far=29;
    key.shadow.bias=-.00029;key.shadow.normalBias=.0165;
    const rim=new T.DirectionalLight(0xffefd6,1.22);rim.position.set(2.1,4.7,-5.1);scene.add(rim);
    const surfaceHalo=halo(scene,.1,0,6.1,2.3,.24);
    const prints=Array.from({length:4},()=>halo(scene,0,0,.60,.45,.28,.012));
    suspendedDust(scene,travel,wind);
    const traces=hoofTraces(scene,gait,coarse);
    return (walkDistance,seconds,feet,camera,bufferHeight)=>{
      travel.value=walkDistance;wind.value=seconds;
      dome.position.copy(camera.position);treeMotion(walkDistance);traces(feet,bufferHeight);
      surfaceHalo.position.x=-.38+.057*Math.sin(seconds*4);
      for(let i=0;i<4;i++){
        const m=prints[i],s=feet[i];
        m.position.set(s.tip.x+.013,.012,s.tip.z);
        m.material.uniforms.alpha.value=.44*Math.exp(-s.lift*8.6);
        m.scale.set(.47+s.lift*.3,.36+s.lift*.21,1);
      }
    };
  }
  root.FieldLandscape={make};
})(window,THREE,FieldGiraffe);
