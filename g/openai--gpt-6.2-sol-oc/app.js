/* Scene assembly and accessible viewer controls. No requests at runtime. */
(() => {
  'use strict';
  const byId = (x) => document.getElementById(x);
  const viewport = byId('viewport'), plate = document.querySelector('.plate'), message = byId('loading');
  const play = byId('play'), reset = byId('reset'), fullscreen = byId('fullscreen'), stride=byId('stride');
  const speedButtons = [...document.querySelectorAll('[data-speed]')], viewButtons = [...document.querySelectorAll('[data-view]')];
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const everyControl = [play, reset, fullscreen, stride, ...speedButtons, ...viewButtons];
  function fail(text, error) {
    message.textContent = text; message.hidden = false;
    for (const button of everyControl) button.disabled = true;
    if (error) console.error(error);
  }

  function boot() {
    const T = THREE, { clamp, mix, vec } = Atlas;
    const renderer = new T.WebGLRenderer({ antialias:true, alpha:false, powerPreference:'high-performance' });
    renderer.outputColorSpace = T.SRGBColorSpace;
    renderer.toneMapping = T.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.setClearColor('#e6d8b8');
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = T.PCFSoftShadowMap;
    renderer.domElement.setAttribute('aria-hidden','true');
    viewport.appendChild(renderer.domElement);
    const scene = new T.Scene(), camera = new T.PerspectiveCamera(34,1,.075,370);
    const giraffe = Atlas.createGiraffe(); scene.add(giraffe.root);
    const landscape = Atlas.createLandscape(scene);
    const updateDust = Atlas.createDust(scene);

    const presets = {
      field: {az:.380,el:-.080,distance:10.75,target:vec(.43,2.59,0),offset:.292},
      profile: {az:0,el:-.044,distance:10.50,target:vec(.46,2.59,0),offset:.280},
      portrait: {az:.91,el:.011,distance:4.73,target:vec(1.68,4.49,0),offset:.266},
    };
    const state = {view:'field',playing:!reduce.matches,speed:1,time:.454,az:0,el:0,zoom:1};
    let dirty = true, aspect = 1, narrow = false, lost = false;
    let desired = null, current = null;
    let phaseEnd=false, displayedPhase=-1;
    const ta = vec();
    const azDistance = (a,b) => Math.atan2(Math.sin(a-b),Math.cos(a-b));
    const pointerClass = matchMedia('(pointer:coarse)');
    function hint() { byId('zoom-hint').textContent = pointerClass.matches ? 'Pinch to zoom' : 'Scroll to zoom'; }
    hint(); pointerClass.addEventListener?.('change',hint);

    function updateTarget() {
      const p = presets[state.view], portrait = state.view === 'portrait';
      const baseZoom = portrait ? (narrow ? Math.max(5.45,2.18/(Math.max(.4,aspect)*.58)) : p.distance)
        : Math.max(p.distance,5.24/(Math.max(.36,aspect)*.61));
      const target = p.target.clone();
      // Leave a band for the label on small screens, instead of moving the animal off-screen.
      if (narrow) target.y += portrait ? .28 : clamp(.89-(aspect-.56)*.65,.48,.99);
      const offset = narrow ? .020 : p.offset * clamp((aspect-.83)/.52,0,1);
      desired = {az:state.az,el:state.el,r:baseZoom*state.zoom,target,offset};
      if (!current) current = { ...desired, target:target.clone() };
      dirty = true;
    }

    function resize() {
      const w=viewport.clientWidth,h=viewport.clientHeight;
      if (!w || !h) return;
      aspect = w/h; narrow = w <= 660;
      // Bound the GPU cost on very dense and full-screen displays.
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1,1.75,Math.sqrt(2400000/(w*h))));
      renderer.setSize(w,h,false); camera.aspect=aspect;
      updateTarget();
    }

    function updateCamera(dt) {
      const t = reduce.matches ? 1 : 1-Math.pow(.0004,Math.max(dt,.007));
      const da=azDistance(desired.az,current.az);
      if (Math.abs(da)+Math.abs(current.el-desired.el)+Math.abs(current.r-desired.r)+current.target.distanceTo(desired.target)+Math.abs(current.offset-desired.offset)<.00075 && !dirty) return false;
      current.az += da*t; current.el=mix(current.el,desired.el,t);
      current.r=mix(current.r,desired.r,t); current.target.lerp(desired.target,t);
      current.offset=mix(current.offset,desired.offset,t);
      const cos=Math.cos(current.el);
      camera.position.set(current.r*Math.sin(current.az)*cos,current.r*Math.sin(current.el),current.r*Math.cos(current.az)*cos).add(current.target);
      camera.position.y=Math.max(.52,camera.position.y);
      camera.lookAt(ta.copy(current.target));
      camera.filmOffset = -current.offset*camera.getFilmWidth()*Math.tan(T.MathUtils.degToRad(camera.fov)*.5)*camera.aspect;
      camera.updateProjectionMatrix();
      return true;
    }

    function setPlay(playing) {
      state.playing = playing;
      if(playing) phaseEnd=false;
      displayedPhase=-1; dirty=true;
      play.querySelector('use').setAttribute('href',playing ? '#i-pause' : '#i-play');
      const title = playing ? 'Pause walk' : 'Resume walk';
      play.setAttribute('aria-label',title); play.title=title;
      byId('motion-label').textContent = playing ? 'Lateral walk' : 'Walk paused';
      byId('motion-dot').classList.toggle('paused',!playing);
    }
    function updatePhase() {
      const cycle=state.time/giraffe.period;
      const value=phaseEnd?1000:Math.floor((cycle-Math.floor(cycle))*1000+.00001);
      if(value===displayedPhase) return;
      displayedPhase=value; stride.value=String(value);
      const pct=`${Math.floor(value*.1)}%`;
      stride.style.setProperty('--progress',`${value*.1}%`);
      byId('stride-percent').textContent=pct;
      // Spell out the stationary value when someone is examining a phase of the walk.
      if (!state.playing) stride.setAttribute('aria-valuetext',`${pct} of a stride`);
      else stride.removeAttribute('aria-valuetext');
    }
    function setView(view, snap = false) {
      state.view=view;
      Object.assign(state,{az:presets[view].az,el:presets[view].el,zoom:1});
      for (const b of viewButtons) b.setAttribute('aria-pressed',String(b.dataset.view===view));
      if (snap) current=null;
      updateTarget();
    }
    function clearPreset() { for (const b of viewButtons) b.setAttribute('aria-pressed','false'); }
    function rotate(dx,dy) {
      state.az -= dx; state.el=clamp(state.el+dy,-.33,.67);
      clearPreset(); updateTarget();
    }
    function zoom(factor) {
      state.zoom=clamp(state.zoom*factor,.63,1.92);
      clearPreset(); updateTarget();
    }

    const contacts = new Map(), last = {x:0,y:0,d:0};
    const center = () => {
      const pts = [...contacts.values()];
      return pts.length<2 ? { ...pts[0], d:0 } : {x:(pts[0].x+pts[1].x)/2,y:(pts[0].y+pts[1].y)/2,d:Math.hypot(pts[0].x-pts[1].x,pts[0].y-pts[1].y)};
    };
    viewport.addEventListener('pointerdown',(e)=>{
      if (e.button!==0 || lost) return;
      contacts.set(e.pointerId,{x:e.clientX,y:e.clientY});
      viewport.setPointerCapture(e.pointerId); viewport.classList.add('dragging');
      Object.assign(last,center());
    });
    viewport.addEventListener('pointermove',(e)=>{
      if (!contacts.has(e.pointerId)) return;
      contacts.set(e.pointerId,{x:e.clientX,y:e.clientY});
      const c=center();
      if (c.d>3 && last.d>3) zoom(last.d/c.d);
      else rotate((c.x-last.x)*.007,(c.y-last.y)*.0057);
      Object.assign(last,c);
    });
    function endContact(e) {
      contacts.delete(e.pointerId);
      if (!contacts.size) viewport.classList.remove('dragging');
      else Object.assign(last,center());
    }
    for (const event of ['pointerup','pointercancel','lostpointercapture']) viewport.addEventListener(event,endContact);
    viewport.addEventListener('wheel',(e)=>{
      if (lost) return;
      e.preventDefault(); const d=e.deltaY*(e.deltaMode===1?18:e.deltaMode===2?viewport.clientHeight:1);
      zoom(Math.exp(clamp(d*.00115,-.44,.44)));
    },{passive:false});
    viewport.addEventListener('keydown',(e)=>{
      if (e.altKey || e.metaKey || e.ctrlKey || lost) return;
      switch(e.key) {
        case 'ArrowLeft': rotate(-.14,0); break;
        case 'ArrowRight': rotate(.14,0); break;
        case 'ArrowUp': rotate(0,.081); break;
        case 'ArrowDown': rotate(0,-.081); break;
        case '=': case '+': zoom(.88); break;
        case '-': zoom(1.14); break;
        case 'Home': setView('field'); break;
        case ' ': setPlay(!state.playing); break;
        default: return;
      }
      e.preventDefault();
    });

    play.addEventListener('click',()=>setPlay(!state.playing));
    stride.addEventListener('input',()=>{
      setPlay(false);
      const value=Number(stride.value), cycle=Math.floor(state.time/giraffe.period);
      phaseEnd=value===1000;
      state.time=(cycle+Math.min(value/1000,.999999))*giraffe.period;
      displayedPhase=-1; dirty=true;
    });
    reset.addEventListener('click',()=>setView('field'));
    speedButtons.forEach((button)=>button.addEventListener('click',()=>{
      state.speed = Number(button.dataset.speed);
      for (const b of speedButtons) b.setAttribute('aria-pressed',String(b===button));
    }));
    viewButtons.forEach((button)=>button.addEventListener('click',()=>setView(button.dataset.view)));
    reduce.addEventListener?.('change',(e)=>{ if (e.matches) setPlay(false); dirty=true; });
    const canFullscreen = Boolean(plate.requestFullscreen && document.fullscreenEnabled);
    let expanded=false;
    function syncFullScreen() {
      const full=document.fullscreenElement===plate || expanded, text=full?'Exit full screen':'Enter full screen';
      fullscreen.setAttribute('aria-label',text); fullscreen.title=text;
      fullscreen.querySelector('use').setAttribute('href',full?'#i-collapse':'#i-expand');
      resize();
    }
    function expand(value) {
      expanded=value; plate.classList.toggle('is-expanded',value);
      document.body.classList.toggle('viewer-expanded',value); syncFullScreen();
      fullscreen.focus({preventScroll:true});
    }
    fullscreen.addEventListener('click',async()=>{
      if(expanded) return expand(false);
      if(document.fullscreenElement===plate) return document.exitFullscreen().catch(()=>{});
      if(canFullscreen) {
        try { await plate.requestFullscreen(); return; }
        catch { /* Some browsers deny native full screen for local files or windowed viewers. */ }
      }
      expand(true);
    });
    document.addEventListener('keydown',e=>{
      if(e.key==='Escape' && expanded) { expand(false);e.preventDefault(); }
    });
    document.addEventListener('fullscreenchange',syncFullScreen);

    let lastTick=performance.now();
    function frame(now) {
      const dt=clamp((now-lastTick)*.001,0,.065); lastTick=now;
      if (lost) { requestAnimationFrame(frame); return; }
      const moved=updateCamera(dt);
      if (state.playing || moved || dirty) {
        if (state.playing) state.time += dt*state.speed;
        giraffe.step(state.time);
        landscape.update(state.time*giraffe.velocity,state.time,camera);
        updateDust(giraffe.contacts,renderer.domElement.height);
        renderer.render(scene,camera);
        updatePhase();
        dirty = false;
      }
      requestAnimationFrame(frame);
    }
    renderer.domElement.addEventListener('webglcontextlost',(e)=>{
      e.preventDefault(); lost=true;
      fail('The 3D graphics context was interrupted. Waiting for the browser to restore it…');
    });
    renderer.domElement.addEventListener('webglcontextrestored',()=>{
      lost=false; dirty=true; message.hidden=true;
      for (const button of everyControl) button.disabled=false;
    });
    document.addEventListener('visibilitychange',()=>{ lastTick=performance.now(); });
    const observer=new ResizeObserver(resize); observer.observe(viewport);
    resize(); setView('field',true); setPlay(state.playing);
    frame(performance.now());
    for (const button of everyControl) button.disabled=false;
    message.hidden = true;
  }

  // Let the loading state paint before the geometry and shaders are built.
  requestAnimationFrame(()=>requestAnimationFrame(()=>{
    try { boot(); }
    catch(err) { fail('The giraffe could not be displayed. Open this file in a browser with WebGL and hardware acceleration enabled.', err); }
  }));
})();
