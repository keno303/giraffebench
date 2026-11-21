/* Procedural field site: terrain, haze, cloud layers, acacias and wind. */
window.Savanna = (() => {
  'use strict';
  const {T,v,clamp,mix,smooth,fract,TAU,random,geometry,mesh,material,Sweeps}=Field;
  const R=42;
  const yawAt = (x,z) => Math.atan2(x,z+R);
  const track = (x,z) => Math.hypot(x,z+R)-R;
  const course = d => { const a=d/R; return {x:R*Math.sin(a),z:R*(Math.cos(a)-1),yaw:a}; };
  const height = (x,z) => {
    const lane=1-smooth(1.8,9.5,Math.abs(track(x,z)));
    const h=.26*Math.sin(x*.106+z*.066)+.20*Math.sin(z*.16-x*.036)+.095*Math.sin(x*.268+z*.22)+.061*Math.sin(z*.48+x*.52);
    const roll=.82*Math.sin(x*.033+1.5)*Math.sin(z*.052-.7)+.20*Math.sin(x*.071-z*.067);
    return (h*.12+roll*.29)*lane+(h+roll)*(1-lane);
  };
  const time = {value:0};
  const sunDir=v(-.67,.48,.59).normalize();
  const col = c => new T.Color(c);
  function rgb(hex) {const c=col(hex); return `vec3(${c.r.toFixed(6)},${c.g.toFixed(6)},${c.b.toFixed(6)})`;}
  const noise=`
    float hsh(vec2 p){vec3 q=fract(vec3(p.xyx)*vec3(.1031,.11369,.13787));q+=dot(q,q.yzx+19.19);return fract((q.x+q.y)*q.z);}
    float n2(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hsh(i),hsh(i+vec2(1,0)),f.x),mix(hsh(i+vec2(0,1)),hsh(i+vec2(1,1)),f.x),f.y);}
    float fbm(vec2 p){return n2(p)*.54+n2(mat2(.9,.44,-.44,.9)*p*2.02)*.26+n2(p*4.21+7.)*.14+n2(p*8.84-13.)*.06;}
  `;
  function sky(scene,lite) {
    const m=new T.ShaderMaterial({
      side:T.BackSide, depthWrite:false, fog:false, toneMapped:false,
      uniforms:{seconds:time,sun:{value:sunDir}},
      vertexShader:`varying vec3 ray;
        void main(){ray=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
      fragmentShader:`varying vec3 ray; uniform vec3 sun; uniform float seconds; ${noise}
        void main(){
          vec3 d=normalize(ray); float y=d.y;
          float facing = .5+.5*dot(d.xz,normalize(sun.xz));
          vec3 horizon=mix(${rgb('#d5c6a6')},${rgb('#f0d4a8')},pow(facing,1.4)*.85);
          vec3 above=mix(${rgb('#92aaa9')},${rgb('#7e9fac')},smoothstep(.04,.35,y));
          vec3 paint=mix(horizon,above,smoothstep(-.015,.34,y));
          paint=mix(paint,${rgb('#5a8094')},smoothstep(.37,1.,y));
          float s=max(0.,dot(d,sun));
          paint+=${rgb('#ffe0a0')} * (.125*pow(s,10.)+.235*pow(s,52.));
          float disc=smoothstep(.99974,.99986,s);
          paint=mix(paint,vec3(1.,.89,.59),disc*.95);
          if(y>.012){
            vec2 uv=d.xz/(y+.087); uv.x+=seconds*.0033;
            vec2 p=uv*vec2(.67,1.03)+vec2(6.8,19.3);
            ${lite?`float thickness=fbm(p+vec2(n2(p*.61)*1.5,.41));`:`
            float distortion=fbm(p*.45+13.);
            float clouds=fbm(p+vec2(distortion*2.1,distortion*1.23));
            float wisps=fbm(p*vec2(.62,2.15)-vec2(29.,10.));
            float thickness=mix(clouds,wisps,.24);`}
            float alpha=smoothstep(.482,.721,thickness)*smoothstep(.025,.142,y)*.88;
            vec3 cloud=mix(${rgb('#bcb6a7')},${rgb('#f7e8ce')},smoothstep(.46,.68,thickness));
            cloud=mix(cloud,${rgb('#ffebc6')},facing*.19);
            paint=mix(paint,cloud,alpha);
          }
          paint += (hsh(gl_FragCoord.xy)-.5)*.003;
          gl_FragColor=vec4(paint,1.);
          #include <colorspace_fragment>
        }`
    });
    const o=mesh(scene,new T.SphereGeometry(220,48,28),m,false,false); o.renderOrder=-50; o.frustumCulled=false;
    return o;
  }
  function terrainMat(lite) {
    const m=lite?new T.MeshLambertMaterial({color:0xffffff}):material(0xffffff, .99);
    m.onBeforeCompile=s=>{
      s.vertexShader=s.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 earth;').replace('#include <begin_vertex>','#include <begin_vertex>\nearth=position;');
      s.fragmentShader=s.fragmentShader.replace('#include <common>',`#include <common>\nvarying vec3 earth; ${noise}`).replace('#include <color_fragment>',`#include <color_fragment>
        vec2 W=earth.xz;
        float rim=abs(length(W+vec2(0.,${R}.))-${R}.-.13*sin(W.x*.53)-.11*sin(W.y*.60));
        float trail=1.-smoothstep(.68,1.40,rim+.53*${lite?'n2':'fbm'}(W*.89));
        float low=${lite?'n2':'fbm'}(W*.166+.5), dry=${lite?'n2':'fbm'}(W*.62+6.), clot=n2(W*5.6+11.), fine=n2(W*95.);
        float knurl=n2(W*29.+24.);
        vec3 duff=mix(${rgb('#887c51')},${rgb('#c6a270')},smoothstep(.22,.73,low));
        duff=mix(duff,${rgb('#827b4c')},smoothstep(.46,.73,dry)*.60);
        vec3 dust=mix(${rgb('#b0936d')},${rgb('#d2b384')},smoothstep(.35,.63,dry));
        vec3 ground=mix(duff,dust,trail*.77);
        ground*=.88+.13*clot+.074*fine;
        ground*=1.-.18*smoothstep(.70,.96,knurl)*smoothstep(.46,.67,dry);
        ${lite?'':`float stones=smoothstep(.79,.96,n2(W*15.5))*smoothstep(.42,.67,n2(W*2.9));
        ground=mix(ground,${rgb('#716049')},stones*.62);`}
        diffuseColor.rgb *= ground;
      `);
    };
    return m;
  }
  function terrain(scene,lite) {
    const N=lite?83:266;
    const ground=new T.PlaneGeometry(246,246,N,N); ground.rotateX(-Math.PI/2); ground.translate(0,0,-R);
    const P=ground.attributes.position;
    for(let i=0;i<P.count;i++) P.setY(i,height(P.getX(i),P.getZ(i)));
    ground.computeVertexNormals();
    mesh(scene,ground,terrainMat(lite),false,true);
    // Evaluate the exact triangle height the renderer used. Hoof contact should
    // not float even when the terrain uses the coarser software-renderer mesh.
    return (x,z)=>{
      const u0=(x+123)*N/246,v0=(z+123+R)*N/246;
      if(u0<0||u0>=N||v0<0||v0>=N) return height(x,z);
      const a=Math.floor(u0),b=Math.floor(v0),u=u0-a,w=v0-b,id=b*(N+1)+a;
      const A=P.getY(id), B=P.getY(id+1), C=P.getY(id+N+1), D=P.getY(id+N+2);
      return u+w<=1?A+(B-A)*u+(C-A)*w:D+(C-D)*(1-u)+(B-D)*(1-w);
    }; 
  }
  function ranges(scene,lite) {
    const rng=random(802);
    // Eroded ridges. A separate faint aerial veil keeps distant rock cooler
    // and the valleys lighter than the foreground canopy.
    for(let k=0;k<2;k++) {
      const n=lite?243:460,m=lite?6:12,p=[],c=[],ix=[];
      const light=col(k?'#b5aea0':'#b9a587'), shade=col(k?'#9b988d':'#8a8069');
      const phases=Array.from({length:6},()=>rng()*TAU);
      for(let j=0;j<=m;j++) for(let i=0;i<=n;i++) {
        const a=i/n*TAU, u=j/m;
        const line=Math.sin(a*4+phases[0])*.39+.23*Math.sin(a*9+phases[1])+.12*Math.sin(a*19+phases[2])+.068*Math.sin(a*41+phases[3])+.035*Math.sin(a*76+phases[4]);
        const plateau=.11*Math.sin(a*2+1.9) + .18*Math.max(0,Math.sin(a*3-.21))**3;
        const hills=Math.max(.04,line*.69+.28+plateau);
        const peak=(k?7.8:4.55)+hills*(k?29.:16.);
        const s=(k?111:75)+u*(k?40:36)+3*Math.sin(a*11+u*4)+2.2*Math.sin(a*29+u);
        const y=-.74+peak*(j===0?0:j===m?.12:Math.sin(u*Math.PI)**1.19) + .55*Math.sin(a*70+u*9)*Math.sin(u*Math.PI);
        p.push(Math.cos(a)*s,y,Math.sin(a)*s-R);
        const tint=.61+.19*Math.sin(a*16+u*4)+.10*Math.sin(a*37-u*9)+.16*(1-u);
        const C=shade.clone().lerp(light,clamp(tint)); c.push(C.r,C.g,C.b);
        if(j<m&&i<n){const a0=j*(n+1)+i,b=a0+n+1;ix.push(a0,a0+1,b,a0+1,b+1,b);}
      }
      const mat=new T.MeshBasicMaterial({vertexColors:true,side:T.DoubleSide,fog:false,toneMapped:false});
      const land=geometry(p,ix,c);
      const M=land.attributes.color, N=land.attributes.normal;
      for(let i=0;i<M.count;i++) {
        const e=.89+.19*Math.abs(N.getX(i)*sunDir.x+N.getY(i)*sunDir.y+N.getZ(i)*sunDir.z);
        M.setXYZ(i,M.getX(i)*e,M.getY(i)*e,M.getZ(i)*e);
      }
      mat.onBeforeCompile=s=>{
        s.vertexShader=s.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 ridge;').replace('#include <begin_vertex>','#include <begin_vertex>\nridge=position;');
        s.fragmentShader=s.fragmentShader.replace('#include <common>',`#include <common>\nvarying vec3 ridge; ${noise}`).replace('#include <color_fragment>',`#include <color_fragment>
          float h=max(0.,ridge.y), d=length(cameraPosition-ridge);
          float cloud=smoothstep(26.,180.,d)*.43 + (1.-smoothstep(1.,18.,h))*.40;
          float cut=${lite?'n2':'fbm'}(ridge.xz*vec2(.081,.117)+.30*h);
          float folds=${lite?'n2':'fbm'}(ridge.xz*.215+vec2(h*.19,h*.041));
          diffuseColor.rgb *= .81+.21*cut+.10*folds;
          diffuseColor.rgb = mix(diffuseColor.rgb,${rgb(k?'#c9c1aa':'#d4c39f')}, cloud);
        `);
      };
      mat.customProgramCacheKey=()=>`ridge-${k}-${lite}`;
      mesh(scene,land,mat,false,false);
    }
  }
  function windMaterial(kind, extra={}, lite=false) {
    const foliage=kind==='leaves', settings={side:T.DoubleSide,vertexColors:true,...extra};
    const m=lite?new T.MeshLambertMaterial(settings):material(0xffffff,.95,settings);
    m.onBeforeCompile = s => {
      s.uniforms.seconds=time;
      s.vertexShader=s.vertexShader.replace('#include <common>',`#include <common>\nuniform float seconds; attribute float flex;`)
      .replace('#include <begin_vertex>',`#include <begin_vertex>
        vec3 W=(modelMatrix*vec4(position,1.)).xyz;
        float gust=sin(W.x*.71+W.z*.35-seconds*1.77)*.55 + sin(W.z*1.71-W.x*.38+seconds*2.41)*.25 + sin(W.x*.13+W.z*.14-seconds*.66)*.73;
        transformed.x+=flex*(${foliage?'.027':'.058'}*gust + ${foliage?'.017':'.055'});
        transformed.z+=flex*${foliage?'.024':'.057'}*(gust*.55+.44*sin(seconds*1.12+W.z*.51));
      `);
      if(!foliage) s.fragmentShader=s.fragmentShader.replace('#include <color_fragment>','#include <color_fragment>\ndiffuseColor.rgb *= 1.03;');
    };
    m.customProgramCacheKey=()=>`field-wind.${kind}`;
    return m;
  }
  const palette=['#a4985d','#96915a','#85834c','#af9c64','#ba9d62','#806f40','#bbaa70','#a99953','#aa8956'].map(col);
  const tussock=windMaterial('grass');
  function blade(P,I,C,A, args) {
    const [x,y,z,H,W,a,bend,base,tip, detail,curl]=args;
    const dx=Math.cos(a), dz=Math.sin(a), ux=-dz, uz=dx, start=P.length/3;
    const rings=detail?4:3;
    for(let j=0;j<rings;j++) {
      const t=j/rings, s=1-t, w=W*(.70 + .30*t)*s**.62;
      const q=bend*t**1.65, sy=y+H*(t-.11*curl*t*t), sx=x+q*dx, sz=z+q*dz;
      const c=base.clone().lerp(tip,t*.82);
      for(let k=0;k<(detail?3:2);k++) {
        const l=detail?k-1:k*2-1, e=l*w + .03*curl*t*t;
        P.push(sx+ux*e+(k===1&&detail?dx*w*.29:0),sy,sz+uz*e+(k===1&&detail?dz*w*.29:0));
        const t1=k===1&&detail?1.07:1; C.push(c.r*t1,c.g*t1,c.b*t1); A.push(t*t*H*2.1);
        if(j<rings-1 && k<(detail?2:1)) { const at=start+(detail?3:2)*j+k, b=at+(detail?3:2); I.push(at,at+1,b,at+1,b+1,b); }
      }
    }
    const id=P.length/3;
    P.push(x+bend*dx+.03*curl*ux,y+H*(1-.11*curl),z+bend*dz+.03*curl*uz);
    C.push(tip.r,tip.g,tip.b); A.push(H*2.1);
    I.push(id-(detail?3:2),id-(detail?2:1),id);
    if(detail) I.push(id-2,id-1,id);
  }
  function grassTile(PX,PZ,step,detail,lite) {
    const rnd=random((PX+30)*48131+(PZ+49)*17988), p=[],ix=[],c=[],flex=[], grains=new Sweeps();
    const n=detail?218:lite?27:58;
    for(let i=0;i<n;i++) {
      const x=(PX+rnd())*step,z=(PZ+rnd())*step;
      const edge=Math.abs(track(x,z));
      const lane=smooth(.79,2.55,edge);
      const patch=.53+.21*Math.sin(x*.69+z*.50)+.10*Math.sin(x*1.71-z*1.43)+.15*Math.sin(z*.23-x*.35);
      if(rnd()>(.018+.97*lane)*(.47+patch)) continue;
      const tall=(.109+rnd()**1.5*(detail?.57:.75))*(.36+lane*.77);
      const spread=.047+tall*.31, b=palette[Math.floor(rnd()*palette.length)], tint=b.clone().multiplyScalar(.53+rnd()*.22);
      const count=detail?6+Math.floor(rnd()*12):lite?3+Math.floor(rnd()*4):4+Math.floor(rnd()*6);
      for(let j=0;j<count;j++) {
        const a=rnd()*TAU,d=spread*rnd(), X=x+Math.cos(a)*d,Z=z+Math.sin(a)*d;
        const H=tall*(.44+.67*rnd()), bend=tall*(.18+.65*rnd()), w=(detail?.0045:.0075)+tall*.023*rnd();
        blade(p,ix,c,flex,[X,height(X,Z)-.015,Z,H,w,a+.35*(rnd()-.5),bend,tint,b,detail,.1+rnd()*.9]);
      }
      if(detail&&rnd()>.66&&tall>.29) {
        const h=height(x,z)-.018, stem=col('#a58c54'), seed=col('#baa170');
        for(let j=0;j<2+(i%2);j++) {
          const a=rnd()*TAU, dx=Math.cos(a), dz=Math.sin(a), H=tall*(.87+rnd()*.37), w=.12*H;
          const A=v(x,h,z), B=v(x+w*dx,h+H*.68,z+w*dz), D=v(x+2*w*dx,h+H,z+2*w*dz);
          const E=B.clone().lerp(D,.66);
          grains.tube([A,B,E,D],[.0031,.00275,.002,.0007],3,stem);
          for(let k=0;k<5;k++) {
            const P=E.clone().lerp(D,k/5), direction=v(Math.cos(k*2.4+a),.82,Math.sin(k*2.4+a));
            const L=(.036-.004*k)*(rnd()*.48+.72);
            grains.tube([P,P.clone().addScaledVector(direction,L*.6),P.clone().addScaledVector(direction,L)],[.0008,.0043,.0002],3,seed);
          }
        }
      }
    }
    const g=geometry(p,ix,c); g.setAttribute('flex',new T.Float32BufferAttribute(flex,1));
    let heads=null;
    if(grains.p.length) {
      heads=grains.make(); const a=heads.attributes.position.array, f=[];
      for(let i=0;i<a.length;i+=3) f.push(Math.max(0,a[i+1]-height(a[i],a[i+2]))*1.73);
      heads.setAttribute('flex',new T.Float32BufferAttribute(f,1));
    }
    return [g,heads];
  }
  function meadow(scene,lite) {
    const cells=new Map(), step=8, farStep=12, near=new T.Group(); scene.add(near);
    const farMat=lite?windMaterial('grass',{},true):tussock;
    let ox=Infinity,oz=Infinity;
    const cameraRange = (x,z,initial=false) => {
      const ix=Math.floor(x/step), iz=Math.floor(z/step);
      if(lite||(ix===ox&&iz===oz)) return; ox=ix; oz=iz;
      const needed=new Set();
      for(let dz=-2;dz<=2;dz++) for(let dx=-2;dx<=2;dx++) {
        const a=ix+dx,b=iz+dz,key=`${a}/${b}`; needed.add(key);
        if(cells.has(key)) continue;
        const group=new T.Group();
        for(const g of grassTile(a,b,step,true)) if(g) mesh(group,g,tussock,false,true);
        cells.set(key,group); near.add(group);
      }
      for(const [key,group] of cells) if(!needed.has(key)) {for(const child of group.children) child.geometry.dispose(); group.removeFromParent(); cells.delete(key);}
    };
    const far=[];
    for(let z=-10;z<=3;z++) for(let x=-6;x<=5;x++) {
      const [g]=grassTile(x,z,farStep,false,lite);
      if(g.attributes.position.count===0) {g.dispose();continue;}
      const o=mesh(scene,g,farMat,false,true); far.push([x,z,o]);
    }
    return (x,z)=>{
      cameraRange(x,z);
      for(const [a,b,o] of far) {
        const d=Math.max(Math.abs((a+.5)*farStep-x),Math.abs((b+.5)*farStep-z));
        o.visible=lite?d<39:d>17;
      }
    };
  }
  // An alpha-cut compound leaf spray. It is rasterized locally; no billboard
  // points at the camera, and the holes between leaflets cast real shadows.
  function leafSpray() {
    const canvas=document.createElement('canvas'); canvas.width=128;canvas.height=128;
    const ctx=canvas.getContext('2d'), rng=random(639);
    function leaflet(x,y,angle,L,W,tone){
      ctx.save();ctx.translate(x,y);ctx.rotate(angle);ctx.fillStyle=`rgb(${tone},${tone},${tone})`;
      ctx.beginPath();ctx.moveTo(0,0);ctx.bezierCurveTo(L*.18,-W,L*.76,-W,L,0);
      ctx.bezierCurveTo(L*.74,W,L*.17,W*.81,0,0);ctx.fill();ctx.restore();
    }
    const arms=[[6,47,.6,49],[10,27,.41,57],[13,65,.29,69],[8,92,-.27,62],[33,93,-.49,66],
      [34,61,.038,80],[18,55,-.52,63],[21,68,.41,78],[18,81,.31,72],[45,58,-.29,74]];
    for(const [x,y,a,l] of arms) {
      ctx.strokeStyle='#a6997e';ctx.lineWidth=1.13;ctx.beginPath();ctx.moveTo(x,y);
      ctx.lineTo(x+Math.cos(a)*l,y+Math.sin(a)*l);ctx.stroke();
      for(let j=0;j<8;j++) for(const s of [-1,1]) {
        const f=.16+j*.11, w=3.8*(.73+.31*rng())*(1-f*.65), ll=15*(.72+.48*rng())*(1-f*.54);
        leaflet(x+Math.cos(a)*l*f,y+Math.sin(a)*l*f,a+s*(.47+.62*rng()),ll,w,188+Math.floor(rng()*67));
      }
    }
    const tex=new T.CanvasTexture(canvas); tex.colorSpace=T.SRGBColorSpace; tex.anisotropy=4;
    return tex;
  }
  function makeAcacia(seed, shape, bush=false) {
    const rnd=random(seed), bark=new Sweeps(), outline=new Sweeps(), sprigs=[], many=bush?4:7+(seed%3), canopyRadius=bush?.97:2.95*shape, tall=bush?.84:3.48, rootColor=col('#574731'), barkColor=col('#8d7858');
    const sway=.34+rnd()*.45;
    const trunk0=v(0,-.23,0), trunk1=v(.18*shape*sway,tall*.31,.098), trunk2=v(-.13*shape*sway,tall*.62,.254),top=v(-.42*shape*sway,tall,.106);
    const trunkLine=new T.CatmullRomCurve3([trunk0,trunk1,trunk2,top]);
    const stripes=(t,a)=>rootColor.clone().lerp(barkColor,.20+.47*Math.abs(Math.sin(a*4.1+t*3.3+seed))+.12*t);
    const B=(points,ra,N,primary=false)=>{
      bark.tube(points,ra,N,stripes); if(primary) outline.tube(points,ra,5,stripes);
    };
    B(trunkLine.getPoints(12),t=>(bush?.085:.24)*(1-t)**.92 + .009,bush?7:11,true);
    for(let k=0;k<(bush?3:7);k++) {
      const a=k*TAU/(bush?3:7)+rnd()*.55,d=.48+rnd()*.25;
      const r=v(Math.cos(a)*d,-.10,Math.sin(a)*d);
      B([v(0,.24,0),r.clone().multiplyScalar(.51).add(v(0,.08,0)),r],[bush?.035:.11,bush?.028:.082,.006],6);
    }
    const deg=rnd()*TAU;
    for(let j=0;j<many;j++) {
      const a=deg+j*TAU/many+.45*(rnd()-.5), d=canopyRadius*(.48+.48*rnd()), X=Math.cos(a),Z=Math.sin(a);
      const start=trunkLine.getPoint(.34+.43*rnd());
      const pitch=.18+.86*rnd(), lift=tall*(.75+.23*pitch+.10*Math.max(0,Math.sin(a+1.7)))-d*.09;
      const P2=v(X*d*.27+start.x+Z*.23,tall*.62+pitch*.18,Z*d*.27+start.z-X*.13);
      const P3=v(X*d*.69+Z*.17,tall*.71+pitch*.32,Z*d*.73-X*.13);
      const P4=v(X*d,lift,Z*d);
      const line=new T.CatmullRomCurve3([start,P2,P3,P4]);
      B(line.getPoints(8),t=>(bush?.045:.117)*(1-t)**.95+.006,8,true);
      sprigs.push([P4,.38+rnd()*.36]);
      for(let b=0;b<(bush?3:5);b++) {
        const frac=.28+.15*b, P=line.getPoint(frac), side=b%2===0?-1:1, angle=a+side*(.45+rnd()*1.33);
        const length=canopyRadius*(.23+.27*rnd());
        const end=P.clone().add(v(Math.cos(angle)*length,Math.max(tall*.11,lift-P.y+.19*(rnd()-.5)),Math.sin(angle)*length));
        const jerk=P.clone().lerp(end,.65).add(v(.09*(rnd()-.5),-.08*length,.09*(rnd()-.5)));
        B([P,jerk,end],[bush?.023:.048,.019,.004],6,b%2===0);
        sprigs.push([end,.32+rnd()*.32]);
        for(let f=0;f<4;f++) {
          const aa=angle+((f%2===0)?1:-1)*(.4+rnd()*1.2), low=jerk.clone().lerp(end,.17*f+.1), L=length*(.25+rnd()*.34);
          const tip=low.clone().add(v(Math.cos(aa)*L,L*(.28+rnd()*.33),Math.sin(aa)*L));
          B([low,low.clone().lerp(tip,.47).add(v(0,-.04,0)),tip],[.015,.011,.002],5);
          sprigs.push([tip,.25+rnd()*.27]);
        }
      }
    }
    const leafDark=col(bush?'#565b36':'#444d2a'), leafLit=col(bush?'#a19c58':'#989853'), pale=col('#bbad76');
    function canopy(lod) {
      const r0=random(seed+741), leafP=[], leafI=[], leafC=[], uv=[], fl=[];
      for (let idx=0;idx<sprigs.length;idx+=lod===4?3:1) {
        const [anchor,rad]=sprigs[idx];
        const cloud=rad*(bush?.62:1), shape=1.1+.45*r0();
        const count=bush?[25,14,6,2,2][lod]:[46,22,7,3,3][lod];
        const shade=r0();
        for(let j=0;j<count;j++) {
          const theta=r0()*TAU, rr=r0()**.77, y=(r0()-.48)*cloud*(bush?1.34:.82)*(1.35-rr*.63);
          const x=anchor.x+Math.cos(theta)*rr*cloud*shape,z=anchor.z+Math.sin(theta)*rr*cloud/shape;
          const a=r0()*TAU, A=(.085+r0()*(bush?.097:.117))*[1,1.34,1.80,2.8,3.81][lod], K=A*(.55+r0()*.38);
          const da=v(Math.cos(a),1.48*(r0()-.5),Math.sin(a)).normalize();
          const db=v(-da.z,(r0()-.5)*2.7,da.x).normalize();
          const P=v(x,anchor.y+y,z), hue=leafDark.clone().lerp(leafLit,.12+.49*r0()+.25*shade+.09*y/cloud);
          if(r0()<.12) hue.lerp(pale,.36);
          const id=leafP.length/3;
          for(const [u,w] of [[0,0],[1,0],[1,1],[0,1],[.5,.5]]) {
            const Q=P.clone().addScaledVector(da,(2*u-1)*A).addScaledVector(db,(2*w-1)*K);
            if(u===.5) Q.y+=.029;
            leafP.push(Q.x,Q.y,Q.z); leafC.push(hue.r,hue.g,hue.b); uv.push(u,w); fl.push(.46+rr*.55);
          }
          leafI.push(id,id+1,id+4,id+1,id+2,id+4,id+2,id+3,id+4,id+3,id,id+4);
        }
      }
      const g=geometry(leafP,leafI,leafC);
      g.setAttribute('flex',new T.Float32BufferAttribute(fl,1));
      g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));
      return g;
    }
    return [[bark.make(),outline.make()],[0,1,2,3,4].map(canopy)];
  }
  function trees(scene,lite) {
    const rng=random(4387), plant=[
      [8.58,-14.6,1.34,0],[ -10.8,-17.8,1.14,1],[15.6,-19.3,.91,2],[-22.9,-14.3,1.13,3],
      [24.5,-9.35,1.25,0],[-21.85,13.2,1.22,1],[-1.5,-24.2,.61,2],[15.1,12.5,.96,3],
      [ 1.6,-17.46,.41,4],[6.05,-6.05,.38,5],[-5.0,-7.65,.47,4],[-8.1,4.98,.45,5],
      [ 9.26,-11.2,.52,5],[4.80,8.92,.66,5],[-21,1.3,.54,4],[-2.8,-5.54,.50,5],
    ];
    const shape=[1.63,1.15,1.26,.94,1.20,1.42];
    const prototypes=shape.map((s,i)=>makeAcacia(368+i*532,s,i>=4));
    const bark=lite?new T.MeshLambertMaterial({vertexColors:true}):material(0xffffff,.97,{vertexColors:true});
    if(!lite) bark.onBeforeCompile=s=>{
      s.vertexShader=s.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 barkP;').replace('#include <begin_vertex>','#include <begin_vertex>\nbarkP=position;');
      s.fragmentShader=s.fragmentShader.replace('#include <common>',`#include <common>\nvarying vec3 barkP; ${noise}`).replace('#include <color_fragment>',`#include <color_fragment>
        vec2 a=barkP.xz*27.; a+=vec2(barkP.y*4.,sin(barkP.y*8.5)*1.6);
        float groove=smoothstep(.28,.70,fbm(a));
        float skin=.85+.32*groove+.18*n2(barkP.xy*83.);
        diffuseColor.rgb *= skin;
      `);
    };
    const leaves=windMaterial('leaves',{map:leafSpray(),alphaTest:.36,alphaToCoverage:!lite},lite);
    const lods=[];
    for(let i=0;i<167;i++) {
      const a=rng()*TAU,r=98*Math.sqrt(rng()), x=Math.cos(a)*r,z=Math.sin(a)*r-R;
      const edge=Math.abs(track(x,z)), bush=rng()<.38;
      const band=track(x,z);
      if(edge<3.0 || (!bush && (Math.hypot(x,z)<22 || (band>0&&band<15.1)))) continue;
      if(plant.some(([px,pz])=>Math.hypot(x-px,z-pz)<2.75)) continue;
      plant.push([x,z,.53+rng()*1.29,bush?4+Math.floor(rng()*2):Math.floor(rng()*4)]);
    }
    for(const [x,z,mag,type] of plant) {
      const group=new T.Group(); group.position.set(x,height(x,z)-.09,z); group.scale.set(mag,mag*(.82+rng()*.35),mag); group.rotation.y=rng()*TAU; scene.add(group);
      const [a,b]=prototypes[type];
      const trunk=mesh(group,a[0],bark,false,true);
      const crown=mesh(group,b[0],leaves,false,true);
      lods.push({x,z,mag,trunk,crown,a,b,group});
    }
    treeShade(scene,plant,lite);
    return (x,z,gx,gz)=>{
      for(const a of lods) {
        const d=Math.hypot(x-a.x,z-a.z) / Math.max(.81,Math.min(a.mag,1.4));
        a.group.visible=!lite||(d<70&&!(d>36&&a.mag<.72));
        const level=lite?(d<27?3:4):(d<25?0:d<50?1:d<78?2:3);
        a.crown.geometry=a.b[level];
        a.trunk.geometry=a.a[level<2?0:1];
        const nearby=!lite&&Math.hypot(gx-a.x,gz-a.z) < 11;
        a.trunk.castShadow=nearby; a.crown.castShadow=nearby;
      }
    };
  }
  function treeShade(scene,plant,lite) {
    const p=[],i=[],uv=[],a=[];
    function patch(x,z,sx,sz,density) {
      const off=p.length/3, N=lite?3:8;
      const along=v(-sunDir.x,0,-sunDir.z).normalize(), right=v(-along.z,0,along.x);
      for(let j=0;j<=N;j++) for(let k=0;k<=N;k++) {
        const w=k/N*2-1,t=j/N*2-1;
        const X=x+right.x*sx*w+along.x*sz*t, Z=z+right.z*sx*w+along.z*sz*t;
        p.push(X,height(X,Z)+.042,Z); uv.push(w,t); a.push(density);
        if(j<N&&k<N) {const A=off+j*(N+1)+k,B=A+N+1; i.push(A,B,A+1,A+1,B,B+1);}
      }
    }
    for(const [x,z,s,type] of plant) {
      const small=type>=4;
      if(lite&&small)continue;
      patch(x,z,(small?.75:1.85)*s,(small?1.0:2.1)*s,.25);
      patch(x-sunDir.x*1.64*s,z-sunDir.z*1.64*s,(small?1.4:3.7)*s,(small?1.8:5.)*s,small?.09:.16);
    }
    const g=geometry(p,i);g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));g.setAttribute('shade',new T.Float32BufferAttribute(a,1));
    const m=new T.ShaderMaterial({side:T.DoubleSide,depthWrite:false,transparent:true,
      vertexShader:`attribute float shade; varying vec2 q; varying float f; void main(){q=uv;f=shade*exp(-.0004*dot(position-cameraPosition,position-cameraPosition));gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
      fragmentShader:`varying vec2 q; varying float f; void main(){float d=dot(q,q);gl_FragColor=vec4(.083,.059,.039,exp(-d*3.8)*(1.-smoothstep(.57,1.,d))*f);\n#include <colorspace_fragment>\n}`});
    mesh(scene,g,m,false,false);
  }
  function outcrops(scene,lite) {
    const rng=random(825), rockMaterial=lite?new T.MeshLambertMaterial({vertexColors:true}):material(0xffffff,.96,{vertexColors:true});
    const brown=col('#786449'), olive=col('#968363'), gray=col('#77796b'), sand=col('#b59c7b');
    const shapes=Array.from({length:5},(_,k)=>{
      const g=new T.IcosahedronGeometry(1,lite?2:3),P=g.attributes.position,C=[];
      for(let i=0;i<P.count;i++) {
        const x=P.getX(i),y=P.getY(i),z=P.getZ(i);
        const s=.89+.14*Math.sin(x*5.4+y*8.1+z*7.5+k)+.09*Math.sin(x*12.1-y*9.5+z*9.)+.042*Math.sin(x*28-z*26);
        const Y=Math.max(-.57,y*s)*(.96+.07*Math.sin((y+.12*x-.18*z)*25));
        P.setXYZ(i,x*s+.11*Y,Y,z*s);
        const drift=.48+.32*Math.sin(z*12+y*4.7-x*8+k)+.14*Math.sin(x*33-z*24);
        const vein=.44+.33*Math.sin((Y+.11*x-.08*z)*27+k*.21)+.21*Math.sin((Y+.11*x-.08*z)*58);
        const c=brown.clone().lerp(olive,drift).lerp(gray,(1-drift)*vein*.80).lerp(sand,smooth(.55,.9,vein)*.62);
        C.push(c.r,c.g,c.b);
      }
      g.setAttribute('color',new T.Float32BufferAttribute(C,3));
      g.computeVertexNormals();return g;
    });
    const beds=[[-13.3,-6.85,1.12],[14.7,-24.5,1.31],[-22.6,-35.39,1.53],[27.8,-49.7,1.88],[9.1,-59.6,.99],[-.67,-80.7,1.40],[-35.5,-54.2,.89]];
    for(const [x,z,s] of beds) for(let j=0;j<(lite?4:10);j++) {
      const t=j/10,a=rng()*TAU,r=t*2.9*s, X=x+Math.cos(a)*r, Z=z+Math.sin(a)*r;
      const m=mesh(scene,shapes[j%shapes.length],rockMaterial,false,true), mag=(.7+.55*rng())*s*(1-t*.72);
      m.position.set(X,height(X,Z)+mag*.18,Z);m.rotation.set(.11*(rng()-.5),a,.22*(rng()-.5));m.scale.set(mag*(.78+.36*rng()),mag*(.41+.31*rng()),mag*(.65+.47*rng()));
    }
  }
  function rubble(scene,lite) {
    const rnd=random(56733), rock=new T.IcosahedronGeometry(1,lite?0:1), P=rock.attributes.position;
    for(let i=0;i<P.count;i++) {
      const x=P.getX(i),y=P.getY(i),z=P.getZ(i), q=.83+.18*Math.sin(x*8-y*7+z*9)+.09*Math.sin(x*11-y*14-z*12);
      P.setXYZ(i,x*q,Math.max(-.54,y*q),z*q);
    }
    rock.computeVertexNormals();
    const batches=[];
    const m=lite?new T.MeshLambertMaterial():material(0xffffff,.96), dummy=new T.Object3D(), r=col('#a2866b'), s=col('#6d6351');
    for(let j=0;j<14;j++) for(let i=0;i<14;i++) {
      const o=new T.InstancedMesh(rock,m,25); o.count=0; o.receiveShadow=true; scene.add(o);
      for(let k=0;k<25;k++) {
        const x=12*(i-7+rnd()), z=12*(j-10+rnd());
        const edge=Math.abs(track(x,z));
        if(edge<.72&&rnd()<.73) continue;
        const D=(.026+rnd()**2.30*.294)*(edge<1.7?.51:1);
        const H=D*(.38+.33*rnd());
        dummy.position.set(x,height(x,z)-H*.39,z); dummy.scale.set(D,H,D*(.48+.52*rnd()));
        dummy.rotation.set(rnd()*.20,rnd()*TAU,rnd()*.11);dummy.updateMatrix();
        o.setColorAt(o.count,r.clone().lerp(s,rnd()) ); o.setMatrixAt(o.count++,dummy.matrix);
      }
      if(!o.count) o.removeFromParent(); else batches.push(o);
    }
  }
  function wildlife(scene) {
    const rng=random(953), count=7, p=[], I=[];
    for(let i=0;i<count;i++) {
      const a=i*12; for(let k=0;k<12;k++) p.push(0,0,0);
      I.push(a,a+1,a+2,a+1,a+3,a+2,a+2,a+3,a+4,a+2,a+4,a+5,a+6,a+7,a+8,a+7,a+9,a+8,a+8,a+9,a+10,a+8,a+10,a+11);
    }
    const m=new T.MeshBasicMaterial({color:0x66675a,side:T.DoubleSide});
    const g=geometry(p,I), birds=mesh(scene,g,m,false,false); birds.frustumCulled=false;
    const scatter=Array.from({length:count},()=>[.18+rng()*.16,rng()*3.4,rng()*2.7,rng()*3.9]);
    return seconds=>{
      const a=.77+seconds*.014, x=29*Math.cos(a), z=-28+21*Math.sin(a), h=11+.85*Math.sin(a*2.);
      for(let k=0;k<count;k++) {
        const [S,ox,oy,oz]=scatter[k], t=seconds*5.4+k*2.55;
        const flapping=smooth(-.5,.45,Math.sin(seconds*.7+k*.81));
        const flap=Math.sin(t)*.84*flapping+.11;
        for(let side=0;side<2;side++) {
          const sign=side?1:-1;
          const points=[[0,0,.50],[0,0,-.42],[.60,Math.sin(flap)*.55,.17],[.62,Math.sin(flap)*.56,-.34],[1.53,Math.sin(flap)*.85-.16,-.35],[1.13,Math.sin(flap)*.78-.065,-.44]];
          for(let j=0;j<6;j++) {
            const [X,Y,Z]=points[j];
            const u=X*sign*S,w=Z*S;
            g.attributes.position.setXYZ(k*12+side*6+j,x+ox+u*Math.cos(a)-w*Math.sin(a),h+oy+Y*S+.37*Math.sin(a*6.+k),z+oz+u*Math.sin(a)+w*Math.cos(a));
          }
        }
      }
      g.attributes.position.needsUpdate=true;
    };
  }
  function create(scene,{lite=false}={}) {
    scene.fog=new T.FogExp2('#c7bca2',.0148);
    const dome=sky(scene,lite), terrainHeight=terrain(scene,lite); ranges(scene,lite);
    const grow=meadow(scene,lite), canopy=trees(scene,lite); outcrops(scene,lite);
    if(!lite)rubble(scene,lite);
    const avian=wildlife(scene);
    return {height:terrainHeight,course,sunDir,update(seconds,camera,animal){
      const {x,z}=camera.position;
      time.value=seconds; dome.position.copy(camera.position); avian(seconds); grow(x,z); canopy(x,z,animal.x,animal.z);
    }};
  }
  return {create,height,course};
})();
