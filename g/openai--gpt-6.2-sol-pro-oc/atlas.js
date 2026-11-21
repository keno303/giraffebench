(() => {
  'use strict';
  const stage=document.getElementById('stage');
  const notice=document.getElementById('notice');
  const play=document.getElementById('play'), speed=document.getElementById('speed');
  const phase=document.getElementById('phase'), percent=document.getElementById('percent');
  const reset=document.getElementById('reset');

  function unavailable(message) {
    notice.textContent=message;
    notice.hidden=false;
    for(const node of [play,speed,phase,reset])node.disabled=true;
  }
  if(!window.THREE || !window.makeGiraffe || !window.makeSavanna){
    unavailable('The scene files could not load. Keep index.html in the same folder as the scripts and the vendor folder.');
    return;
  }
  const T=THREE, mobile=matchMedia('(pointer: coarse)');
  let renderer;
  try {
    renderer=new T.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance'});
  } catch(error) {
    unavailable('This scene needs WebGL. Try opening it in a browser with hardware acceleration enabled.');
    return;
  }
  renderer.outputColorSpace=T.SRGBColorSpace;
  renderer.toneMapping=T.ACESFilmicToneMapping;
  renderer.toneMappingExposure=1.02;
  const useShadowMaps=renderer.capabilities.maxTextureSize>=2048;
  renderer.shadowMap.enabled=useShadowMaps;
  renderer.shadowMap.type=T.PCFShadowMap;
  stage.appendChild(renderer.domElement);
  renderer.domElement.addEventListener('webglcontextlost',event=>{
    event.preventDefault();
    unavailable('The browser lost the 3D graphics context. Reload this page to restart the scene.');
    contextLost=true;
  });
  renderer.domElement.addEventListener('webglcontextrestored',()=>{
    contextLost=false;
    notice.hidden=true;
    for(const node of [play,speed,phase,reset])node.disabled=false;
    invalidate();
  });

  const scene=new T.Scene();
  const giraffe=makeGiraffe();
  scene.add(giraffe.root);
  const camera=new T.PerspectiveCamera(35,1,.10,250);
  const target=new T.Vector3(.43,2.71,0);
  const savanna=makeSavanna(scene,useShadowMaps,target);
  const defaults={yaw:.397,pitch:-.024,zoom:1};
  const view={...defaults}, desired={...defaults};
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  const rates=[1,.5,.25,1.5];
  const clamp=T.MathUtils.clamp;
  const wholeTurn=2*Math.PI;
  let rateIndex=0, paused=reduced.matches, contextLost=false, dragging=null;
  let playhead=.79, lastPose=NaN, scrubValue=null, frameId=0, previous=0, dirty=true;
  let width=0,height=0,distance=12;

  function layout(){
    width=stage.clientWidth;height=stage.clientHeight;
    if(!width||!height)return;
    const ratio=Math.min(window.devicePixelRatio||1,mobile.matches?1.6:1.75,Math.sqrt(3100000/(width*height)));
    renderer.setPixelRatio(ratio);renderer.setSize(width,height,false);
    const aspect=width/height, compact=width<=600&&aspect<=1.2;
    const short=!compact&&height<=470;
    const verticalSpan=Math.max(compact?8.1:short?9.15:7.91,(compact?5.18:5.55)/aspect);
    distance=verticalSpan/(2*Math.tan(T.MathUtils.degToRad(camera.fov*.5)));
    const horizontal=compact?-.005:T.MathUtils.lerp(.050,.174,clamp((aspect-.81)/.71,0,1));
    const vertical=compact?(height<711?-.057:-.083):short?.027:-.003;
    camera.setViewOffset(width,height,-width*horizontal,height*vertical,width,height);
    invalidate();
  }
  function updateCamera(dt){
    const factor=reduced.matches?1:1-Math.exp(-dt*15);
    for(const name of ['yaw','pitch','zoom']){
      const gap=desired[name]-view[name];
      view[name]+=Math.abs(gap)<.0001?gap:gap*factor;
    }
    const r=distance*view.zoom, level=r*Math.cos(view.pitch);
    camera.position.copy(target).add(new T.Vector3(level*Math.sin(view.yaw),r*Math.sin(view.pitch),level*Math.cos(view.yaw)));
    camera.lookAt(target);
    return Math.abs(desired.yaw-view.yaw)+Math.abs(desired.pitch-view.pitch)+Math.abs(desired.zoom-view.zoom)>.0001;
  }
  function updateControls(){
    const value=scrubValue??playhead-Math.floor(playhead);
    phase.value=Math.round(value*1000);
    const text=`${Math.floor(value*100)}%`;
    if(percent.value!==text)percent.value=text;
    if(paused&&phase.getAttribute('aria-valuetext')!==text)phase.setAttribute('aria-valuetext',text);
    phase.style.setProperty('--phase',`${value*100}%`);
  }
  function frame(now){
    frameId=0;
    if(contextLost || document.hidden){previous=0;return;}
    const dt=previous?Math.min(.05,(now-previous)*.001):1/60;
    previous=now;
    const movingCamera=updateCamera(dt);
    if(!paused){
      playhead+=dt*rates[rateIndex]/giraffe.period;
      scrubValue=null;
    }
    if(dirty||!paused||movingCamera){
      dirty=false;
      const time=playhead*giraffe.period;
      if(playhead!==lastPose){giraffe.update(playhead,time);lastPose=playhead;}
      savanna.update(time,playhead*giraffe.strideLength,giraffe.feet,camera);
      renderer.render(scene,camera);
      updateControls();
    }
    if(!paused||movingCamera)frameId=requestAnimationFrame(frame);
    else previous=0;
  }
  function invalidate(){
    dirty=true;
    if(!frameId&&!contextLost)frameId=requestAnimationFrame(frame);
  }
  function setPaused(state){
    paused=state;
    play.classList.toggle('paused',paused);
    play.setAttribute('aria-label',paused?'Play animation':'Pause animation');
    if(!paused)phase.removeAttribute('aria-valuetext');
    invalidate();
  }
  function recenter(){
    const turns=Math.round((desired.yaw-defaults.yaw)/wholeTurn);
    view.yaw-=turns*wholeTurn;
    Object.assign(desired,defaults);
    invalidate();
  }
  play.addEventListener('click',()=>setPaused(!paused));
  speed.addEventListener('click',()=>{
    rateIndex=(rateIndex+1)%rates.length;
    speed.textContent=`${rates[rateIndex]}×`;
    speed.setAttribute('aria-label',`Playback speed: ${rates[rateIndex]} times`);
  });
  phase.addEventListener('input',()=>{
    const oldScrub=scrubValue;
    scrubValue=Number(phase.value)/1000;
    const base=Math.floor(playhead-(oldScrub===1?1e-8:0));
    playhead=base+scrubValue;
    setPaused(true);
  });
  reset.addEventListener('click',recenter);

  stage.addEventListener('pointerdown',event=>{
    if(!event.isPrimary||event.button!==0||dragging)return;
    dragging={id:event.pointerId,x:event.clientX,y:event.clientY};
    stage.setPointerCapture(event.pointerId);
    stage.classList.add('dragging');
  });
  stage.addEventListener('pointermove',event=>{
    if(dragging?.id!==event.pointerId)return;
    desired.yaw-=(event.clientX-dragging.x)*.008;
    desired.pitch=clamp(desired.pitch+(event.clientY-dragging.y)*.005,-.15,.77);
    dragging.x=event.clientX;dragging.y=event.clientY;
    invalidate();
  });
  for(const name of ['pointerup','pointercancel','lostpointercapture'])stage.addEventListener(name,event=>{
    if(dragging?.id!==event.pointerId)return;
    dragging=null;
    stage.classList.remove('dragging');
  });
  stage.addEventListener('wheel',event=>{
    if(event.ctrlKey||event.metaKey)return; // Preserve browser-level pinch and zoom.
    event.preventDefault();
    const multiplier=event.deltaMode===1?16:event.deltaMode===2?height:1;
    desired.zoom=clamp(desired.zoom*Math.exp(event.deltaY*multiplier*.0012),.62,1.6);
    invalidate();
  },{passive:false});
  window.addEventListener('keydown',event=>{
    if(event.altKey||event.ctrlKey||event.metaKey||event.target.closest?.('input,button'))return;
    if(event.code==='Space'){event.preventDefault();setPaused(!paused);}
    else if(event.key.toLowerCase()==='r')recenter();
    else if(event.key==='ArrowLeft'||event.key==='ArrowRight'){
      event.preventDefault();desired.yaw+=(event.key==='ArrowLeft'?.21:-.21);invalidate();
    }
  });
  reduced.addEventListener('change',event=>setPaused(event.matches));
  document.addEventListener('visibilitychange',()=>{previous=0;if(!document.hidden)invalidate();});
  window.addEventListener('resize',layout);
  setPaused(paused);
  layout();
})();
