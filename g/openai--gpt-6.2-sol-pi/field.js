/* Interaction and scene assembly. This file intentionally uses classic scripts for file://. */
(() => {
  'use strict';
  const $=id=>document.getElementById(id);
  const plate=$('plate'), viewport=$('viewport'), loading=$('loading'), journal=$('journal');
  function fail(message) {
    loading.hidden=false; loading.classList.add('fail');
    loading.querySelector('span').textContent=message;
  }
  async function start() {
    const {T,v,clamp,mix,smooth,fract,TAU,random,mesh}=Field;
    const motion=matchMedia('(prefers-reduced-motion: reduce)');
    let canvas=document.createElement('canvas'), renderer, lite=false;
    const options={antialias:true,alpha:false,powerPreference:'high-performance'};
    try {
      let gl=canvas.getContext('webgl2',options);
      if(!gl) throw new Error('WebGL 2 unavailable');
      const debugInfo=gl.getExtension('WEBGL_debug_renderer_info');
      const rendererName=debugInfo?gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL):'';
      // CPU GL drivers get lighter flora and soft contact patches instead of a shadow map.
      lite=/SwiftShader|llvmpipe|Software Rasterizer|Basic Render|softpipe/i.test(rendererName);
      if(lite&&gl.getContextAttributes().antialias) {
        gl.getExtension('WEBGL_lose_context')?.loseContext();
        canvas=document.createElement('canvas'); options.antialias=false;
        gl=canvas.getContext('webgl2',options);
        if(!gl) throw new Error('WebGL 2 unavailable');
      }
      renderer=new T.WebGLRenderer({canvas,context:gl,...options});
    } catch (error) {
      fail('This field plate needs WebGL 2. Try a current browser with hardware acceleration enabled.'); return;
    }
    canvas.setAttribute('aria-hidden','true');
    renderer.toneMapping=T.ACESFilmicToneMapping;
    renderer.toneMappingExposure=1.10;
    renderer.outputColorSpace=T.SRGBColorSpace;
    renderer.shadowMap.enabled=!lite;
    renderer.shadowMap.type=T.PCFShadowMap;
    viewport.append(canvas);
    const scene=new T.Scene(), camera=new T.PerspectiveCamera(35,1,.065,310);
    if(window.Meshopt?.supported) {
      try { await window.Meshopt.ready; } catch { window.Meshopt=null; }
    }
    const field=Savanna.create(scene,{lite}), giraffe=Giraffe.create({lite});
    scene.add(giraffe.root);
    const sun=new T.DirectionalLight('#ffe0a9',2.50);
    scene.add(sun,sun.target);
    sun.castShadow=!lite;
    sun.shadow.camera.left=sun.shadow.camera.bottom=-7.5;
    sun.shadow.camera.right=sun.shadow.camera.top=7.5;
    sun.shadow.camera.near=.3; sun.shadow.camera.far=28;
    sun.shadow.mapSize.set(2048,2048);
    sun.shadow.bias=-.00026; sun.shadow.normalBias=.024; sun.shadow.radius=2.15;
    scene.add(new T.HemisphereLight('#d8e5ea','#b09570',1.65));
    const bounce=new T.DirectionalLight('#fed1a2',.32);
    bounce.position.set(6,4,-9); scene.add(bounce);

    const shadowMat=new T.ShaderMaterial({
      transparent:true,depthWrite:false,uniforms:{fade:{value:lite?.34:.26}},
      vertexShader:`varying vec2 p; void main(){p=uv*2.-1.;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
      fragmentShader:`varying vec2 p;uniform float fade;void main(){float d=dot(p,p);gl_FragColor=vec4(.092,.063,.038,exp(-d*4.8)*(1.-smoothstep(.76,1.,d))*fade);\n#include <colorspace_fragment>\n}`
    });
    const contact=new T.PlaneGeometry(5.3,2.85,9,7); contact.rotateX(-Math.PI/2);
    const contactO=mesh(scene,contact,shadowMat,false,false);
    contactO.frustumCulled=false; contactO.renderOrder=1;
    const contactP=contact.attributes.position, contactRest=contactP.array.slice();
    const footShade=Array.from({length:4},()=>{
      const g=new T.PlaneGeometry(.55,.34,2,2); g.rotateX(-Math.PI/2);
      const m=shadowMat.clone(), o=mesh(scene,g,m,false,false);
      o.frustumCulled=false; o.renderOrder=2;
      return {g,m,rest:g.attributes.position.array.slice()};
    });
    function updateFootShade() {
      const a=giraffe.root.rotation.y, c=Math.cos(a), s=Math.sin(a);
      for(let j=0;j<4;j++) {
        const {actual,lift}=giraffe.hoofHits[j], {g,m,rest}=footShade[j], P=g.attributes.position;
        m.uniforms.fade.value=(lite?.56:.35)*Math.exp(-9*lift);
        for(let i=0;i<P.count;i++) {
          const dx=rest[i*3]+.034,dz=rest[i*3+2], x=actual.x+c*dx+s*dz,z=actual.z-s*dx+c*dz;
          P.setXYZ(i,x,field.height(x,z)+.005,z);
        }
        P.needsUpdate=true;
      }
    }
    // Translucent grains briefly disperse from each hoof strike. The sprites are created in-memory.
    const dirt=(()=>{
      const N=12, n=4*N, seed=random(504), attr=new Float32Array(3*n), alpha=new Float32Array(n), rad=new Float32Array(n); 
      const p=new T.BufferGeometry();
      p.setAttribute('position',new T.BufferAttribute(attr,3).setUsage(T.DynamicDrawUsage));
      p.setAttribute('visibility',new T.BufferAttribute(alpha,1).setUsage(T.DynamicDrawUsage));
      p.setAttribute('diameter',new T.BufferAttribute(rad,1).setUsage(T.DynamicDrawUsage));
      const proj={value:500};
      const mat=new T.ShaderMaterial({
        transparent:true,depthWrite:false,uniforms:{proj},
        vertexShader:`uniform float proj; attribute float visibility; attribute float diameter; varying float opacity;
          void main(){opacity=visibility;vec4 p=modelViewMatrix*vec4(position,1.);gl_PointSize=clamp(diameter*proj/(-p.z),1.,64.);gl_Position=projectionMatrix*p;}`,
        fragmentShader:`varying float opacity;void main(){vec2 p=(gl_PointCoord-.5)*2.;float d=dot(p,p);gl_FragColor=vec4(.42,.32,.19,exp(-d*4.8)*(1.-smoothstep(.70,1.,d))*opacity);\n#include <colorspace_fragment>\n}`
      });
      const o=new T.Points(p,mat); o.frustumCulled=false; o.renderOrder=3; scene.add(o);
      const seeds=Array.from({length:n},()=>[seed()*TAU,.23+seed()*.39,.07+seed()*.25,seed()]);
      return {proj,update(hits){
        for(let i=0;i<4;i++) {
          const {point,phase}=hits[i];
          for(let j=0;j<N;j++) {
            const k=i*N+j, [a,spread,lift,r]=seeds[k], f=clamp(phase/.28-r*.078), g=f**.76;
            attr[k*3]=point.x+Math.cos(a)*g*spread-.12*g;
            attr[k*3+1]=point.y+.125+g*lift;
            attr[k*3+2]=point.z+Math.sin(a)*g*spread+.07*g;
            alpha[k]=(.14+r*.16)*Math.sin(f*Math.PI)**1.37;
            rad[k]=.056+.22*g+r*.073;
          }
        }
        for(const name of Object.keys(p.attributes)) p.attributes[name].needsUpdate=true;
      }};
    })();

    // A short trail of split-hoof prints is derived from the same contacts as
    // the rig. Scrubbing backwards therefore never leaves stale decals behind.
    const prints=(()=>{
      const series=lite?2:4, count=4*series, n=3, P=[],idx=[],UV=[],strength=[];
      for(let k=0;k<count;k++) for(let j=0;j<=n;j++) for(let i=0;i<=n;i++) {
        P.push(0,0,0); UV.push(i/n*2-1,j/n*2-1); strength.push(0);
        if(i<n&&j<n) {const a=k*(n+1)**2+j*(n+1)+i,b=a+n+1;idx.push(a,b,a+1,a+1,b,b+1);}
      }
      const g=new T.BufferGeometry(); g.setIndex(idx);
      g.setAttribute('position',new T.Float32BufferAttribute(P,3).setUsage(T.DynamicDrawUsage));
      g.setAttribute('uv',new T.Float32BufferAttribute(UV,2));
      g.setAttribute('weight',new T.Float32BufferAttribute(strength,1).setUsage(T.DynamicDrawUsage));
      const m=new T.ShaderMaterial({transparent:true,depthWrite:false,
        vertexShader:`attribute float weight; varying vec2 printPos; varying float f;
          void main(){printPos=uv;f=weight;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
        fragmentShader:`varying vec2 printPos; varying float f;
          void main(){vec2 p=printPos;float side=abs(p.y), toe=(side-.32)*2.54;
            float r=pow(abs(p.x+.07*side)*1.29,2.8)+toe*toe;
            float grain=.5+.5*sin(p.x*111.+sin(p.y*70.)*3.)*cos(p.y*147.);
            float alpha=(1.-smoothstep(.62,1.,r))*(.37+.30*smoothstep(.46,.94,r)+.32*grain)*f;
            gl_FragColor=vec4(.14,.090,.048,alpha);
            #include <colorspace_fragment>
          }`});
      const o=mesh(scene,g,m,false,false); o.frustumCulled=false;
      const pos=g.attributes.position, wg=g.attributes.weight;
      return (hits,step)=>{
        for(let k=0;k<count;k++) {
          const h=hits[k%4], age=k>>2, target=field.course(h.place-step*age), a=target.yaw;
          const co=Math.cos(a), si=Math.sin(a), shade=.24*(1-smooth(.86,series,age+h.phase));
          for(let j=0;j<=n;j++) for(let i=0;i<=n;i++) {
            const u=(i/n*2-1)*.135+.032,w=h.lateral+(j/n*2-1)*.107;
            const x=target.x+co*u+si*w,z=target.z-si*u+co*w, q=k*(n+1)**2+j*(n+1)+i;
            pos.setXYZ(q,x,field.height(x,z)+.003,z); wg.setX(q,shade);
          }
        }
        pos.needsUpdate=wg.needsUpdate=true;
      };
    })();

    const stride=$('stride'), strideValue=$('stride-value'), rate=$('rate'), rates=$('rates'), rateValue=$('rate-value');
    const play=$('play'), playIcon=$('play-icon');
    const views=Array.from(document.querySelectorAll('[data-view]'));
    const speeds=Array.from(rates.querySelectorAll('[data-speed]'));
    const cameras=[
      {angle:.36,elev:-.036,dist:10.42,y:2.67,x:.32,z:0,framing:.235},
      {angle:.027,elev:-.002,dist:10.87,y:2.65,x:.34,z:0,framing:.220},
      {angle:.83,elev:.024,dist:4.09,y:4.43,x:1.65,z:0,framing:.224}
    ];
    const state={time:.238,speed:1,playing:!motion.matches,view:0,clean:false,seeking:false,yaw:0,elev:0,scale:1};
    const footfalls=$('footfalls'), labels=Array.from(footfalls.querySelectorAll('[data-leg]'));
    function updateContacts() {
      if(footfalls.hidden)return;
      for(let i=0;i<labels.length;i++) {
        const grounded=giraffe.hoofHits[i].grounded;
        if((labels[i].dataset.grounded==='true')===grounded && labels[i].dataset.grounded!==undefined)continue;
        labels[i].dataset.grounded=String(grounded);
        labels[i].setAttribute('aria-label',labels[i].title+(grounded?' in stance':' in swing'));
      }
    }
    $('footfall-toggle').addEventListener('change',e=>{footfalls.hidden=!e.target.checked;updateContacts();});
    let animateDirty=true, cameraDirty=true, first=true, rendererLost=false;
    const camNow={...cameras[0]}, aim=v(), desiredAim=v();
    const pointers=new Map();
    let cycleBase=0, oldPercent=-1;
    let width=0,height=0,pixelRatio=0, quality=lite?.72:1, perfClock=0, perfFrames=0, perfWait=3500;
    const shadowsCenter=v();
    function resolution() {
      width=plate.clientWidth; height=plate.clientHeight;
      if(!width||!height) return;
      pixelRatio=Math.min(devicePixelRatio||1,lite?1:1.65)*quality;
      renderer.setPixelRatio(pixelRatio);
      renderer.setSize(width,height,false);
      camera.aspect=width/height;
      camera.fov=35;
      camera.updateProjectionMatrix();
      cameraDirty=true;
    }
    function updateCamera(dt, immediate=false) {
      const base=cameras[state.view], ratio=width/height, portrait=ratio<.93;
      const compact=width<=700||(width<=900&&ratio<=1);
      const aspectScale=ratio<.85?clamp(.78/ratio,1,2.35):1;
      const margin=state.view!==2&&!portrait?1+.045*(1-smooth(530,760,height)):1;
      const w=immediate||motion.matches?1:1-Math.exp(-dt*7.5);
      const target={...base,dist:base.dist*state.scale*aspectScale*margin,angle:base.angle+state.yaw,elev:clamp(base.elev+state.elev,-.27,1.19),framing:state.clean||compact?0:base.framing*clamp((width-680)/285)};
      let stable=true;
      for(const key of Object.keys(camNow)) {
        if(Math.abs(camNow[key]-target[key])>.0005) {camNow[key]=mix(camNow[key],target[key],w); stable=false;}
        else camNow[key]=target[key];
      }
      const {angle,elev,dist,framing,x,y,z}=camNow;
      desiredAim.set(x,y,z).applyAxisAngle(v(0,1,0),giraffe.root.rotation.y).add(giraffe.root.position);
      if(immediate||!state.playing) aim.copy(desiredAim);
      else aim.lerp(desiredAim,1-Math.exp(-dt*12.5));
      const a=angle+giraffe.root.rotation.y, cos=Math.cos(elev);
      camera.position.set(aim.x+dist*cos*Math.sin(a), aim.y+dist*Math.sin(elev), aim.z+dist*cos*Math.cos(a));
      camera.position.y=Math.max(camera.position.y,field.height(camera.position.x,camera.position.z)+.45);
      camera.lookAt(aim);
      camera.updateProjectionMatrix();
      camera.projectionMatrix.elements[8]-=framing;
      camera.projectionMatrix.elements[9]-=(portrait&&!state.clean?-.088:.02);
      camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
      const root=giraffe.root.position, yaw=giraffe.root.rotation.y, cs=Math.cos(yaw), ss=Math.sin(yaw);
      for(let i=0;i<contactP.count;i++) {
        const x=contactRest[i*3],z=contactRest[i*3+2], X=root.x+cs*x+ss*z,Z=root.z-ss*x+cs*z;
        contactP.setXYZ(i,X,field.height(X,Z)+.021,Z);
      }
      contactP.needsUpdate=true;
      shadowsCenter.copy(root); shadowsCenter.y+=2.25;
      sun.target.position.copy(shadowsCenter);
      sun.position.copy(shadowsCenter).addScaledVector(field.sunDir,13.8);
      dirt.proj.value=.5*height*pixelRatio/Math.tan(camera.fov*Math.PI/360);
      return !stable;
    }
    function timeline(force=false) {
      const progress=fract(state.time/giraffe.period), n=Math.floor(progress*100);
      if(n!==oldPercent || force) {
        stride.style.setProperty('--p',`${(progress*100).toFixed(2)}%`);
        strideValue.textContent=`${String(n).padStart(2,'0')}%`;
        if(!state.seeking) stride.value=String(Math.round(progress*999));
        oldPercent=n;
      }
    }
    function playback(playing) {
      state.playing=playing;
      playIcon.setAttribute('href',playing?'#i-pause':'#i-play');
      const label=playing?'Pause':'Play'; play.setAttribute('aria-label',label); play.title=`${label} (Space)`;
    }
    function selectView(n, hard=false) {
      state.view=n; state.yaw=state.elev=0; state.scale=1; cameraDirty=true;
      plate.dataset.camera=String(n);
      for(const button of views) button.setAttribute('aria-pressed',String(Number(button.dataset.view)===n));
      if(hard) Object.assign(camNow,cameras[n]);
    }
    function changeSpeed(speed) {
      state.speed=speed; rateValue.textContent=`${speed}×`;
      for(const b of speeds) b.setAttribute('aria-pressed',String(+b.dataset.speed===speed));
    }
    function showSpeeds(show){rates.hidden=!show;rate.setAttribute('aria-expanded',String(show));}
    function restart() {
      state.time=0; state.seeking=false; cycleBase=0; selectView(0); animateDirty=cameraDirty=true;
      timeline(true);
    }
    function hideUI(clean) {
      state.clean=clean;
      $('interface').hidden=clean; plate.classList.toggle('clean',clean); $('restore').hidden=!clean;
      if(clean) viewport.focus({preventScroll:true});
      cameraDirty=true;
    }
    function zoom(by) {state.scale=clamp(state.scale*by,state.view===2?.57:.56,state.view===2?2.60:3.15);cameraDirty=true;}
    play.addEventListener('click',()=>playback(!state.playing));
    $('reset').addEventListener('click',restart);
    $('notes').addEventListener('click',()=>{ showSpeeds(false); journal.showModal(); });
    $('close').addEventListener('click',()=>journal.close());
    journal.addEventListener('click',e=>{
      if(e.target!==journal) return;
      const r=journal.getBoundingClientRect();
      if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom) journal.close();
    });
    $('restore').addEventListener('click',()=>{hideUI(false);$('notes').focus();});
    $('clean').addEventListener('click',()=>{journal.close();hideUI(true);});
    const full=$('full');
    if(!document.fullscreenEnabled || !document.documentElement.requestFullscreen) full.hidden=true;
    full.addEventListener('click',async()=>{
      try {
        if(document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen();
      } catch(e) { console.warn('Could not enter full screen:',e.message); }
    });
    document.addEventListener('fullscreenchange',()=>{
      const title=document.fullscreenElement?'Exit full screen':'Enter full screen'; full.title=title; full.setAttribute('aria-label',title); resolution();
    });
    rate.addEventListener('click',()=>showSpeeds(rates.hidden));
    speeds.forEach(b=>b.addEventListener('click',()=>{changeSpeed(+b.dataset.speed);showSpeeds(false);rate.focus();}));
    document.addEventListener('pointerdown',e=>{if(!e.target.closest('.rate'))showSpeeds(false);});
    views.forEach(b=>b.addEventListener('click',()=>selectView(+b.dataset.view)));
    stride.addEventListener('pointerdown',()=>{cycleBase=Math.floor(state.time/giraffe.period);state.seeking=true;playback(false);});
    const endSeek=()=>{if(state.seeking){state.seeking=false;timeline(true);}};
    window.addEventListener('pointerup',endSeek); window.addEventListener('pointercancel',endSeek);
    stride.addEventListener('input',()=>{
      if(!state.seeking) {cycleBase=Math.floor(state.time/giraffe.period); playback(false);}
      state.time=(cycleBase+Number(stride.value)/1000)*giraffe.period;
      animateDirty=cameraDirty=true; timeline(true);
    });
    viewport.addEventListener('pointerdown',e=>{
      if(e.button!==0&&e.pointerType==='mouse')return;
      viewport.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId,[e.clientX,e.clientY]);
    });
    viewport.addEventListener('pointermove',e=>{
      const last=pointers.get(e.pointerId);
      if(!last) return;
      if(pointers.size===1) {
        const dx=e.clientX-last[0],dy=e.clientY-last[1];
        state.yaw=(state.yaw-dx*.0075)%TAU; state.elev=clamp(state.elev+dy*.0053,-.24,1.14); cameraDirty=true;
      } else if(pointers.size===2) {
        const other=Array.from(pointers.entries()).find(([id])=>id!==e.pointerId)[1];
        const d1=Math.hypot(last[0]-other[0],last[1]-other[1]), d2=Math.hypot(e.clientX-other[0],e.clientY-other[1]);
        if(d1>4&&d2>4) zoom(d1/d2);
      }
      pointers.set(e.pointerId,[e.clientX,e.clientY]);
    });
    for(const name of ['pointerup','pointercancel','lostpointercapture']) viewport.addEventListener(name,e=>pointers.delete(e.pointerId));
    viewport.addEventListener('wheel',e=>{e.preventDefault();zoom(Math.exp(clamp(e.deltaY*(e.deltaMode===1?17:1),-190,190)*.00135));},{passive:false});
    viewport.addEventListener('dblclick',()=>selectView(state.view));
    document.addEventListener('keydown',e=>{
      if(journal.open||e.metaKey||e.ctrlKey||e.altKey||e.repeat) return;
      if(e.key==='Escape') {if(!rates.hidden){showSpeeds(false);rate.focus();}else if(state.clean)hideUI(false);return;}
      const tag=e.target.tagName;
      if(e.key===' '&&['BUTTON','INPUT'].includes(tag)) return;
      if(e.key.toLowerCase()==='h'){hideUI(!state.clean);return;}
      if(e.key.toLowerCase()==='r'){restart();return;}
      if(/^[123]$/.test(e.key)){selectView(+e.key-1);return;}
      if(e.key===' '){e.preventDefault();playback(!state.playing);return;}
      if(e.target!==viewport) return;
      switch(e.key){
        case 'ArrowLeft': state.yaw+=.16;break;
        case 'ArrowRight':state.yaw-=.16;break;
        case 'ArrowUp':state.elev=clamp(state.elev+.12,-.24,1.14);break;
        case 'ArrowDown':state.elev=clamp(state.elev-.12,-.24,1.14);break;
        case '+':case '=':zoom(.87);break;
        case '-':zoom(1.15);break;
        default:return;
      }
      e.preventDefault();cameraDirty=true;
    });
    motion.addEventListener('change',e=>{if(e.matches){playback(false); cameraDirty=true;}});
    new ResizeObserver(resolution).observe(plate);
    canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();rendererLost=true;fail('The graphics context was interrupted. Waiting for the browser to restore it…');});
    canvas.addEventListener('webglcontextrestored',()=>{rendererLost=false;loading.hidden=true;animateDirty=cameraDirty=true;});
    let last=performance.now();
    document.addEventListener('visibilitychange',()=>{last=performance.now();});
    function tick(now) {
      requestAnimationFrame(tick);
      const raw=now-last,dt=clamp(raw/1000,0,.20); last=now;
      if(rendererLost||document.hidden||!width||!height) return;
      if(state.playing) {if(!first)state.time+=clamp(raw/1000,0,.45)*state.speed;animateDirty=true;}
      if(!(animateDirty||cameraDirty||first)) return;
      if(animateDirty||first) {
        giraffe.update(state.time,field.course,field.height);
        timeline(); dirt.update(giraffe.hoofHits); prints(giraffe.hoofHits,giraffe.step);
        updateFootShade(); updateContacts(); animateDirty=false;
      }
      cameraDirty=updateCamera(dt,first);
      field.update(state.time,camera,giraffe.root.position);
      renderer.render(scene,camera);
      if(first) { first=false; loading.hidden=true; $('interface').inert=false; }
      if(state.playing&&raw>0&&raw<1500) {
        if(perfWait>0) perfWait-=raw;
        else {perfClock+=raw;perfFrames++;}
        if(perfClock>2000) {
          const minQuality=lite?.56:.64;
          if(perfClock/perfFrames>39&&quality>minQuality) {quality=Math.max(minQuality,quality*.84);resolution();}
          perfClock=perfFrames=0;perfWait=1300;
        }
      }
    }
    playback(state.playing); changeSpeed(1); selectView(0,true); resolution();
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(()=>requestAnimationFrame(()=>{
    start().catch(error=>{
      console.error(error);
      fail('The field plate could not start. Check that all of its files are beside index.html, then reload.');
    });
  }));
})();
