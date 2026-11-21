/* Interaction, camera, and simulation clock. Loaded as a classic offline script. */
(() => {
  'use strict';
  const $=(q)=>document.querySelector(q), all=(q)=>[...document.querySelectorAll(q)];
  const stage=$('#stage'), viewport=$('#viewport'), viewer=$('.viewer'), phase=$('#phase');
  const loading=$('#loading'), readout=$('#phase-readout'), play=$('#play');
  const expand=$('#expand'), notes=$('#notes'), sceneState=$('#scene-state');
  const speedButtons=all('[data-speed]'),viewButtons=all('[data-view]');
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  const small=matchMedia('(max-width: 760px) and (pointer: coarse)').matches;
  let playing=!reduced.matches,failed=false,loaded=false,pace=1;
  let renderer=null, renderID=0, needsFrame=true, lastMS=0;
  let step=0.209,seconds=0, chosen='profile';
  const showIcon=(el,name)=>el.querySelector('use').setAttribute('href',`#i-${name}`);
  function updatePlay(){
    showIcon(play,playing?'pause':'play');
    play.setAttribute('aria-label',playing?'Pause walk':'Play walk');
    play.title=playing?'Pause (Space)':'Play (Space)';
    if(loaded&&!failed){stage.dataset.state=playing?'live':'paused';sceneState.textContent=playing?'3D study':'Study paused';}
  }
  function setPlaying(value){
    if(failed)return;
    playing=Boolean(value);lastMS=0;updatePlay();invalidate();
  }
  function setDisabled(flag){
    for(const e of [play,phase,...speedButtons,...viewButtons])e.disabled=flag;
  }
  function staticStudy(err){
    if(failed)return;
    console.error('Field Atlas:',err);
    failed=true;playing=false;updatePlay();setDisabled(true);
    stage.dataset.state='fallback';sceneState.textContent='Still image';
    if(renderID)cancelAnimationFrame(renderID);renderID=0;
    viewport.hidden=true;$('#fallback-image').hidden=false;
    loading.dataset.error='';loading.lastElementChild.textContent='Interactive 3D is unavailable in this browser.';
    loading.hidden=false;
    $('#scene-help').hidden=true;
  }
  function fullscreen(){return document.fullscreenElement===viewer||viewer.classList.contains('pseudo-fullscreen');}
  function updateFullscreen(){
    const on=fullscreen();
    showIcon(expand,on?'shrink':'expand');
    expand.setAttribute('aria-label',on?'Exit fullscreen':'Enter fullscreen');
    expand.title=on?'Exit fullscreen':'Fullscreen';
    invalidate();
  }
  expand.addEventListener('click',async()=>{
    if(viewer.classList.contains('pseudo-fullscreen'))viewer.classList.remove('pseudo-fullscreen');
    else if(document.fullscreenElement===viewer)await document.exitFullscreen();
    else{
      try{if(viewer.requestFullscreen)await viewer.requestFullscreen();else viewer.classList.add('pseudo-fullscreen');}
      catch{viewer.classList.add('pseudo-fullscreen');}
    }
    updateFullscreen();
  });
  document.addEventListener('fullscreenchange',updateFullscreen);
  all('.notes-button').forEach(b=>b.addEventListener('click',()=>notes.showModal()));
  notes.addEventListener('click',e=>{if(e.target===notes)notes.close();});
  document.addEventListener('keydown',e=>{
    if(e.key==='Escape'&&viewer.classList.contains('pseudo-fullscreen')&&!notes.open){viewer.classList.remove('pseudo-fullscreen');updateFullscreen();}
    if(e.code==='Space'&&!e.repeat&&!notes.open&&!failed&&!e.target.closest?.('button,input,textarea,a,select,[contenteditable]')){
      e.preventDefault();setPlaying(!playing);
    }
  });
  play.addEventListener('click',()=>setPlaying(!playing));
  reduced.addEventListener?.('change',e=>{if(e.matches)setPlaying(false);});
  for(const b of speedButtons)b.addEventListener('click',()=>{
    pace=Number(b.dataset.speed);
    for(const o of speedButtons)o.setAttribute('aria-pressed',String(o===b));
    invalidate();
  });
  phase.addEventListener('input',()=>{
    setPlaying(false);
    const f=Math.min(Number(phase.value)/1000,.9999999);
    step=Math.floor(step)+f;
    if(giraffe)seconds=step*giraffe.period;
    updatePhase(true);invalidate();
  });
  let displayPct=-1,lastPhase=-1;
  function updatePhase(force=false){
    const v=Math.min(1000,Math.round((step-Math.floor(step))*1000));
    if(v===lastPhase&&!force)return;
    lastPhase=v;phase.value=v;
    phase.style.setProperty('--played',`${v/10}%`);
    const pct=Math.round(v/10);
    if(displayPct!==pct||force){
      displayPct=pct;readout.value=`${String(pct).padStart(2,'0')}%`;
      phase.setAttribute('aria-valuetext',`${pct} percent of a stride`);
    }
  }
  updatePlay();updatePhase();setDisabled(true);

  const presets={
    profile:{yaw:.258,elev:-.054,dist:10.9,x:.51,y:2.74,z:0},
    threeQuarter:{yaw:.87,elev:.007,dist:11.53,x:.51,y:2.78,z:.015},
    portrait:{yaw:.64,elev:-.04,dist:3.45,x:2.00,y:4.67,z:0}
  };
  const desired={...presets.profile}, observed={...presets.profile};
  const cameraKeys=Object.keys(desired);
  function choose(name){
    const p=presets[name];if(!p)return;
    const prev=desired.yaw;
    Object.assign(desired,p);desired.yaw+=Math.PI*2*Math.round((prev-desired.yaw)/(Math.PI*2));
    chosen=name;for(const b of viewButtons)b.setAttribute('aria-pressed',String(b.dataset.view===name));
    invalidate();
  }
  for(const b of viewButtons)b.addEventListener('click',()=>choose(b.dataset.view));
  function orbit(dx,dy){
    desired.yaw-=dx;desired.elev=clamp(desired.elev+dy,-.145,.79);invalidate();
  }
  function dolly(factor){
    desired.dist=clamp(desired.dist*factor,chosen==='portrait'?1.91:4.65,chosen==='portrait'?9.2:18);invalidate();
  }
  const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
  const pointers=new Map();
  const separation=()=>{const [a,b]=[...pointers.values()];return Math.hypot(a.x-b.x,a.y-b.y);};
  viewport.addEventListener('pointerdown',e=>{
    if(failed||e.button!==0||pointers.size>=2)return;
    viewport.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});viewport.classList.add('dragging');
  });
  viewport.addEventListener('pointermove',e=>{
    const prev=pointers.get(e.pointerId);if(!prev)return;
    const pinch=pointers.size===2,old=pinch?separation():1;
    pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(pinch){const now=separation();if(old>6&&now>6)dolly(old/now);}
    else{
      const scale=2.38/Math.max(290,viewport.clientHeight);
      orbit((e.clientX-prev.x)*scale,(e.clientY-prev.y)*scale*.73);
    }
  });
  function release(e){pointers.delete(e.pointerId);if(!pointers.size)viewport.classList.remove('dragging');}
  for(const type of ['pointerup','pointercancel','lostpointercapture'])viewport.addEventListener(type,release);
  viewport.addEventListener('wheel',e=>{
    if(failed)return;
    e.preventDefault();const unit=e.deltaMode===1?17:e.deltaMode===2?210:1;
    dolly(Math.exp(clamp(e.deltaY*unit,-300,300)*.00129));
  },{passive:false});
  viewport.addEventListener('dblclick',()=>choose(chosen));
  viewport.addEventListener('keydown',e=>{
    switch(e.key){
      case 'ArrowLeft':orbit(.14,0);break;
      case 'ArrowRight':orbit(-.14,0);break;
      case 'ArrowUp':orbit(0,.10);break;
      case 'ArrowDown':orbit(0,-.10);break;
      case '+':case '=':dolly(.88);break;
      case '-':dolly(1.14);break;
      case 'Home':choose(chosen);break;
      default:return;
    }
    e.preventDefault();
  });

  let scene,camera,giraffe,landscape,C;
  let previousW=0,previousH=0,aspect=1;
  let currentDPR=1,tuneFrameCount=0,tuneTime=0;
  function resize(){
    const w=Math.max(1,viewport.clientWidth),h=Math.max(1,viewport.clientHeight);
    if(w===previousW&&h===previousH)return false;
    previousW=w;previousH=h;aspect=w/h;
    renderer.setSize(w,h,false);camera.aspect=aspect;camera.updateProjectionMatrix();
    return true;
  }
  function cameraAt(){
    let dist=observed.dist;
    // Preserve the head and feet on narrow screens as well as film-wide screens.
    dist*=Math.max(1, .831/aspect + .025);
    const e=Math.max(observed.elev,Math.asin(clamp((.38-observed.y)/dist,-.97,.97)));
    const y=observed.y, sy=observed.yaw;
    const x=observed.x,z=observed.z;
    camera.position.set(x+dist*Math.cos(e)*Math.sin(sy),y+dist*Math.sin(e),z+dist*Math.cos(e)*Math.cos(sy));
    camera.lookAt(x,y,z);
  }
  function animate(ms){
    renderID=0;if(failed||!loaded||document.hidden)return;
    const wasInvalid=needsFrame;needsFrame=false;
    const raw=lastMS?(ms-lastMS)/1000:0,dt=clamp(raw,0,.125);lastMS=ms;
    if(playing){const d=dt*pace;seconds+=d;step+=d/giraffe.period;updatePhase();}
    const a=reduced.matches?1:1-Math.exp(-Math.max(dt,.012)*(pointers.size?20:8.8));
    let moving=false;
    for(const k of cameraKeys){
      const d=desired[k]-observed[k];
      if(Math.abs(d)>.0004){moving=true;observed[k]+=d*a;}
      else observed[k]=desired[k];
    }
    if(playing&&tuneFrameCount<121&&renderer.getPixelRatio()>.90&&raw>.009&&raw<.4){
      tuneFrameCount++;tuneTime+=raw;
      if(tuneFrameCount===120&&tuneTime/120>.035){
        currentDPR=Math.max(.90,currentDPR*.80);renderer.setPixelRatio(currentDPR);previousW=0;
      }
    }
    const changed=resize();
    if(playing||moving||changed||wasInvalid){
      cameraAt();
      const gaze=Math.max(0,1-Math.abs(observed.y-4.60)*1.9);
      const feet=giraffe.pose(step,seconds,gaze);
      landscape(step*giraffe.stride,seconds,feet,camera,renderer.domElement.height);
      renderer.render(scene,camera);
    }
    if(playing||moving||needsFrame)renderID=requestAnimationFrame(animate);
    else lastMS=0;
  }
  function invalidate(){
    needsFrame=true;
    if(!renderID&&loaded&&!failed&&!document.hidden)renderID=requestAnimationFrame(animate);
  }
  document.addEventListener('visibilitychange',()=>{
    lastMS=0;
    if(document.hidden&&renderID){cancelAnimationFrame(renderID);renderID=0;}
    if(!document.hidden)invalidate();
  });
  new ResizeObserver(invalidate).observe(stage);

  async function init(){
    C=window.THREE;if(!C||typeof GIRAFFE_ASSET==='undefined')throw new Error('A local scene file is missing.');
    renderer=new C.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance'});
    renderer.outputColorSpace=C.SRGBColorSpace;
    renderer.toneMapping=C.ACESFilmicToneMapping;renderer.toneMappingExposure=1.0;
    renderer.shadowMap.enabled=true;renderer.shadowMap.type=C.PCFSoftShadowMap;
    currentDPR=Math.min(window.devicePixelRatio||1,small?1.46:1.66);
    renderer.setPixelRatio(currentDPR);
    renderer.domElement.setAttribute('aria-hidden','true');
    renderer.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();staticStudy(new Error('The WebGL graphics context was lost.'));},false);
    viewport.append(renderer.domElement);
    scene=new C.Scene();camera=new C.PerspectiveCamera(34,1,.065,340);
    resize();cameraAt();
    giraffe=FieldGiraffe.make(scene,renderer,GIRAFFE_ASSET);
    landscape=FieldLandscape.make(scene,{coarse:small,gait:giraffe});
    await giraffe.ready;
    seconds=step*giraffe.period;
    const feet=giraffe.pose(step,seconds);
    landscape(step*giraffe.stride,seconds,feet,camera,renderer.domElement.height);
    renderer.render(scene,camera);
    loaded=true;updatePlay();setDisabled(false);loading.hidden=true;invalidate();
  }
  init().catch(staticStudy);
})();
