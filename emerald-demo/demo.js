(() => {
  'use strict';
  const $=id=>document.getElementById(id),hero=$('scene'),canvas=$('mist');
  const perf=window.CloudPerformance,requested=new URLSearchParams(window.location?.search||'').get('render')||'auto';
  const media=matchMedia('(prefers-reduced-motion: reduce)'),events=new AbortController();
  const plan=perf.choose(canvas,{requested,reducedMotion:media.matches,attributes:{premultipliedAlpha:false,depth:false}});let profile=plan.profile;
  perf.bind($('renderMode'),plan.requested);document.documentElement.dataset.renderTier=profile.mode;
  const palettes={emerald:'#6aff52',ice:'#9edaff',ember:'#ffc085'};
  const defaults={density:.6,drift:.25,glow:1.2,fill:.3,reach:.26,quality:'medium'};
  const lighting={...EmeraldControls.defaults};
  let scene,actor,rocks,observer,paused=media.matches,visible=true,pendingPulse=false,disposed=false,lastFrame=0;
  const pointer={x:.3,y:.5,targetX:.3,targetY:.5,power:0,targetPower:0};
  let pulseOrigin={x:.3,y:.5},rng=74931,pulseColor=[.416,1,.322];
  const random=()=>{rng=(Math.imul(rng,1664525)+1013904223)>>>0;return rng/4294967296;};
  function nextColor(){const rgb=color($('lightColor').value),v=lighting.hueVariation;pulseColor=rgb.map(c=>clamp(c+(random()-.5)*v));}
  function applyLighting(){
    if(!scene)return;
    const patch={lightDirection:[lighting.direction_x,lighting.direction_y,lighting.direction_z]};
    for(const [key,value]of Object.entries(lighting)){if(key.startsWith('scene_'))patch[key.slice(6)]=value;if(key.startsWith('pulse_'))actor.configure(key.slice(6),value);}
    scene.setOptions(patch);actor.configure('mode',$('lightingMode').value);actor.configure('seed',Number($('seed').value));rig();if(paused)scene.render();
  }
  const listen=(target,name,fn)=>target.addEventListener(name,fn,{signal:events.signal});
  const status=message=>{$('status').textContent=message;};
  const color=hex=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255);
  const clamp=(n,min=0,max=1)=>Math.max(min,Math.min(max,n));
  function staticFallback(reason){
    for(const renderer of [rocks,scene])perf.release(renderer);rocks=scene=null;actor?.clear();canvas.hidden=true;
    hero.classList.remove('live-rocks');document.documentElement.dataset.renderTier='static';profile=perf.profiles.static;
    $('rockStatus').textContent='Artwork preview';$('heroHint').textContent='Static artwork · '+reason;
    for(const input of $('lightingControls').querySelectorAll('input'))input.disabled=true;
    for(const id of ['pulse','pulseAgain','pause','density','drift','glow','fill','reach','lightColor','quality','reset','lightingMode','seed','fillColor','cloudColor','randomize','newSeed','export','apply'])$(id).disabled=true;
    document.querySelectorAll('[data-palette]').forEach(button=>button.disabled=true);status('Static artwork · '+reason);
  }
  function powerSaver(){profile=perf.profiles.low;document.documentElement.dataset.renderTier='low';$('quality').value='low';scene?.setOptions(profile.mist);rocks?.setLimits(profile.rock);}
  const watchdog=new perf.Watchdog({mode:profile.mode,automatic:plan.requested==='auto',onLow:powerSaver,onStatic:()=>staticFallback('lighter rendering for this device')});
  function rig(updateRocks=true){
    if(!scene)return;
    const r=canvas.getBoundingClientRect(),strength=Number($('glow').value),reach=Number($('reach').value),rgb=color($('lightColor').value);
    const travelling=actor.getLights().sort((a,b)=>b.strength-a.strength)[0];
    const local=travelling?{...travelling,strength:travelling.strength*strength*lighting.pulseGain,radius:lighting.pulse_glowSpread,color:travelling.color.map(v=>v*.78+.22)}:
      {x:pointer.x*r.width,y:pointer.y*r.height,depth:lighting.pointerHeight,strength:strength*pointer.power*lighting.pointerPower,radius:reach,color:rgb};
    const lights=[
      // Small green caustic at the glass base; cool, weak fill on the side banks.
      {x:r.width*lighting.rimX,y:r.height*lighting.rimY,depth:lighting.rimHeight,strength:strength*lighting.rimPower,radius:lighting.rimReach,color:rgb},
      {x:r.width*lighting.fillX,y:r.height*lighting.fillY,depth:lighting.fillHeight,strength:Number($('fill').value)*.55,radius:lighting.fillReach,color:color($('fillColor').value)},
      local
    ];
    scene.setSources(lights,[]); // Reservoir illumination only; no exposed lightning channels.
    if(updateRocks)rocks?.setLighting(lights,r,{ambient:lighting.scene_ambient,exposure:lighting.scene_exposure,intensity:lighting.scene_lightIntensity,falloff:lighting.scene_lightFalloff,normalStrength:lighting.rockNormal,roughness:lighting.rockRoughness,albedo:lighting.rockAlbedo,quality:$('quality').value,cliffHeight:lighting.cliffHeight,cliffDepth:lighting.cliffDepth,cliffTurn:lighting.cliffTurn,cliffTilt:lighting.cliffTilt});
  }
  function advance(){
    if(!scene)return;
    const now=performance.now(),dt=paused?0:Math.min(.1,lastFrame?(now-lastFrame)/1000:1/24);lastFrame=paused?0:now;
    const a=paused?1:lighting.pointerSmoothing?1-Math.exp(-dt/lighting.pointerSmoothing):1;
    for(const [key,target]of [['x','targetX'],['y','targetY'],['power','targetPower']])pointer[key]+=(pointer[target]-pointer[key])*a;
    const r=canvas.getBoundingClientRect();
    actor.update(dt,{x:pulseOrigin.x*r.width,y:pulseOrigin.y*r.height,color:pulseColor,enabled:!paused&&($('lightingMode').value!=='hover'||pointer.targetPower>0),bounds:{x:r.width*lighting.zoneX,y:r.height*lighting.zoneY,width:r.width*Math.min(lighting.zoneWidth,1-lighting.zoneX),height:r.height*Math.min(lighting.zoneHeight,1-lighting.zoneY)}},(reach,origin)=>Array.from({length:9},(_,i)=>({x:clamp(origin.x+Math.cos(i*2.4)*reach*.7,0,r.width),y:clamp(origin.y+Math.sin(i*2.4)*reach*.4,0,r.height)})));
    rig();if(!paused)watchdog.sample(now,1000/profile.mist.fps);
  }
  function renderStill(){rig(!paused);if(paused)scene?.render();}
  function updatePaused(){
    actor?.clear();lastFrame=0;scene?.setPaused(paused);
    $('pause').setAttribute('aria-pressed',String(paused));$('pause').textContent=paused?'Resume motion ▷':'Pause motion Ⅱ';
    $('pulse').disabled=$('pulseAgain').disabled=paused||!scene||$('lightingMode').value==='off';
    $('heroHint').textContent=paused?'Motion is paused. Inspect the mist with the lighting controls.':'Move over the low mist to reveal light. Tap for a soft pulse.';
  }
  function selectPalette(name){
    $('lightColor').value=palettes[name];document.querySelectorAll('[data-palette]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.palette===name)));nextColor();renderStill();
  }
  function pulse(){
    if(!scene||paused||$('lightingMode').value==='off')return;
    if(!visible){pendingPulse=true;hero.scrollIntoView({behavior:media.matches?'auto':'smooth',block:'start'});return;}
    pulseOrigin=pointer.targetPower?{x:pointer.targetX,y:pointer.targetY}:{x:lighting.pulseX,y:lighting.pulseY};if(!actor.trigger())return;
    status('A soft light reservoir travels through the mist and fades.');
  }
  function updateRange(key){const value=Number($(key).value);$(key+'Value').value=value.toFixed(2);if(key==='density'||key==='drift')scene?.setOptions({[key]:value});renderStill();}
  try{
    if(profile.mode==='static')throw Error(plan.reason);
    actor=new CloudKit.Lightning(null,{mode:'random',seed:74931,onStrike:()=>nextColor(),power:.65,reach:120,branches:2,propagation:520,pulseCount:2,pulseSpacing:220,glowDecay:650,afterglow:700,glow:.7,glowSpread:.26});
    scene=new CloudKit.CloudScene(canvas,{
      preset:'clouds',transparent:true,interactive:false,quality:profile.quality,autoStart:false,
      coverage:.67,density:defaults.density,drift:defaults.drift,cloudColor:'#bbc4cc',
      ambient:.3,exposure:1.7,extinction:2.1,detail:.36,erosion:.17,softness:.25,
      shadowStrength:2.6,lightFalloff:.24,viewScale:3.4,volumeDepth:3.2,noiseScale:1.1,windDirection:[.07,.014,.012],
      lightning:false,lightningMode:'off',resolutionLimit:1100,resolutionScale:.75,raySteps:32,fps:24,adaptiveQuality:1,shadowStride:4,...profile.mist,failIfMajorPerformanceCaveat:true,powerPreference:'low-power',
      // Break up the foreground and keep a clear channel toward the page copy.
      densityShader:'vec2 uv=vec2(p.x/(uViewScale*(uResolution.x/uResolution.y))+.5,.5-p.y/uViewScale); float sideBanks=1.-.8*exp(-pow((uv.x-.7)/.19,2.)); float wisps=.3+.7*noise(p*1.8+vec3(uTime*.08,0,2)); return cloudBase(p)*sideBanks*wisps;',
      onFrame:advance
    });
    applyLighting();scene.render();scene.start();updatePaused();
    if(window.NativeRockScene)rocks=new NativeRockScene($('rocks'),{limits:profile.rock,onReady:()=>{hero.classList.add('live-rocks');$('rockStatus').textContent='Live 3D cliff';rig();},onError:error=>{hero.classList.remove('live-rocks');$('rockStatus').textContent=error.name==='SecurityError'?'Open via HTTP for the live cliff':'Cliff unavailable · artwork preview';console.warn('Rock renderer:',error.message);}});
    status(paused?'Reduced motion: still mist, with adjustable lighting.':'Neutral mist · Focused green rim light · Gentle pointer illumination.');
  }catch(error){
    if(plan.profile.mode==='static'){staticFallback(plan.reason);}else{
    scene?.destroy();scene=null;actor?.clear();canvas.hidden=true;
    $('rockStatus').textContent='Artwork preview · 3D unavailable';status('Live mist is unavailable on this browser. The artwork remains visible.');$('heroHint').textContent='Static artwork preview · WebGL2 is needed for live mist.';
    for(const id of ['pulse','pulseAgain','pause','density','drift','glow','fill','reach','lightColor','quality','reset','lightingMode','seed','fillColor','cloudColor','randomize','newSeed','export','apply'])$(id).disabled=true;
    document.querySelectorAll('[data-palette]').forEach(button=>button.disabled=true);console.warn('Emerald demo:',error.message);}
  }
  EmeraldControls.mount($('lightingControls'),(key,value)=>{lighting[key]=value;applyLighting();});
  if(!scene)$('lightingControls').querySelectorAll('input').forEach(input=>input.disabled=true);
  for(const key of ['density','drift','glow','fill','reach'])listen($(key),'input',()=>updateRange(key));
  for(const id of ['pulse','pulseAgain'])listen($(id),'click',pulse);
  document.querySelectorAll('[data-palette]').forEach(button=>listen(button,'click',()=>{selectPalette(button.dataset.palette);status(`${button.textContent.trim()} accent lighting · The mist stays neutral.`);}));
  listen($('lightColor'),'input',()=>{nextColor();renderStill();document.querySelectorAll('[data-palette]').forEach(button=>button.setAttribute('aria-pressed','false'));});
  $('quality').value=profile.quality;
  listen($('quality'),'change',()=>{scene?.setOptions(perf.mistOptions(profile,$('quality').value));if(paused)scene?.render();});
  listen($('pause'),'click',()=>{paused=!paused;updatePaused();status(paused?'Motion paused. Lighting controls remain live.':'The mist is moving again.');});
  listen($('reset'),'click',()=>{
    for(const key of ['density','drift','glow','fill','reach']){$(key).value=defaults[key];updateRange(key);}
    Object.assign(lighting,EmeraldControls.defaults);EmeraldControls.sync(lighting);$('lightingMode').value='random';$('seed').value=74931;rng=74931;$('fillColor').value='#d6e6ff';$('cloudColor').value='#bbc4cc';scene?.setOptions({cloudColor:'#bbc4cc'});applyLighting();
    $('quality').value=defaults.quality;scene?.setOptions(profile.mist);paused=media.matches;selectPalette('emerald');updatePaused();status('Focused green accents and neutral mist restored.');
  });
  listen($('lightingMode'),'change',()=>{actor.clear();applyLighting();updatePaused();status($('lightingMode').value==='random'?'Randomized pulses: a quiet, irregular interval.':'Pulse mode: '+$('lightingMode').value);});
  listen($('seed'),'change',()=>{const n=Number($('seed').value);if(!Number.isInteger(n)||n<0||n>4294967295){$('seed').value=74931;}rng=Number($('seed').value);actor.clear();nextColor();applyLighting();});
  listen($('newSeed'),'click',()=>{$('seed').value=Math.floor(Math.random()*4294967296);rng=Number($('seed').value);actor.clear();nextColor();applyLighting();});
  listen($('fillColor'),'input',renderStill);
  listen($('cloudColor'),'input',()=>{scene?.setOptions({cloudColor:$('cloudColor').value});renderStill();});
  listen($('randomize'),'click',()=>{
    for(const [key,min,max]of [['rimPower',.05,.22],['rimReach',.2,.7],['rimX',.15,.42],['rimY',.3,.65],['fillReach',.6,1.8],['pulse_interval',6000,16000],['pulse_randomness',.3,1],['pulse_variation',.1,.6],['pulse_power',.3,.95],['pulse_glowSpread',.15,.5],['pulse_pulseCount',1,3],['pulse_glowDecay',350,900],['hueVariation',.05,.4]]){
      const d=EmeraldControls.schema[key];lighting[key]=Number((Math.round((min+random()*(max-min))/d.step)*d.step).toFixed(3));
    }
    $('lightingMode').value='random';EmeraldControls.sync(lighting);actor.clear();nextColor();applyLighting();status('A new lighting rig and randomized pulse rhythm are ready.');
  });
  const configuration=()=>({version:1,lighting:{...lighting},mode:$('lightingMode').value,seed:Number($('seed').value),colors:{accent:$('lightColor').value,fill:$('fillColor').value,cloud:$('cloudColor').value},atmosphere:Object.fromEntries(['density','drift','glow','fill','reach'].map(key=>[key,Number($(key).value)])),quality:$('quality').value});
  listen($('export'),'click',()=>{$('configuration').value=JSON.stringify(configuration(),null,2);status('Lighting settings are ready to copy.');});
  listen($('apply'),'click',()=>{
    try{
      const data=JSON.parse($('configuration').value),next={...lighting},atmosphere={};
      if(data.version!==1||!data.lighting||!['random','manual','hover','off'].includes(data.mode)||!['low','medium','high'].includes(data.quality)||!Number.isInteger(data.seed)||data.seed<0||data.seed>4294967295)throw Error('Invalid mode, quality, seed, or configuration version.');
      for(const [key,value]of Object.entries(data.lighting)){const d=EmeraldControls.schema[key];if(!d||!Number.isFinite(value)||value<d.min||value>d.max)throw Error('Invalid lighting setting: '+key);next[key]=value;}
      for(const key of ['accent','fill','cloud'])if(!/^#[0-9a-f]{6}$/i.test(data.colors?.[key]))throw Error('Invalid '+key+' color.');
      for(const key of ['density','drift','glow','fill','reach']){const value=data.atmosphere?.[key],input=$(key);if(!Number.isFinite(value)||value<Number(input.min)||value>Number(input.max))throw Error('Invalid '+key+' value.');atmosphere[key]=value;}
      Object.assign(lighting,next);$('lightingMode').value=data.mode;$('seed').value=data.seed;rng=data.seed;$('quality').value=data.quality;
      $('lightColor').value=data.colors.accent;$('fillColor').value=data.colors.fill;$('cloudColor').value=data.colors.cloud;
      for(const [key,value]of Object.entries(atmosphere)){$(key).value=value;updateRange(key);}EmeraldControls.sync(lighting);actor.clear();nextColor();scene.setOptions({...profile.mist,cloudColor:data.colors.cloud});applyLighting();status('Lighting configuration applied.');
    }catch(error){status(error.message);}
  });
  function aim(event){
    const r=canvas.getBoundingClientRect();pointer.targetX=clamp((event.clientX-r.left)/r.width);pointer.targetY=clamp((event.clientY-r.top)/r.height);
    const distance=Math.max(r.top-event.clientY,event.clientY-r.bottom,0);pointer.targetPower=lighting.pointerEnabled*clamp(1-distance/70);
    if(paused){pointer.x=pointer.targetX;pointer.y=pointer.targetY;pointer.power=pointer.targetPower;renderStill();}
  }
  listen(hero,'pointermove',event=>{if(event.pointerType!=='touch'&&scene)aim(event);});
  listen(hero,'pointerleave',()=>{pointer.targetPower=0;if(paused){pointer.power=0;renderStill();}});
  let tap=null;
  listen(hero,'pointerdown',event=>{if(event.pointerType==='touch'&&!event.target.closest('a,button')&&scene){tap={id:event.pointerId,x:event.clientX,y:event.clientY,time:performance.now()};aim(event);}});
  listen(hero,'pointerup',event=>{if(tap&&tap.id===event.pointerId&&Math.hypot(event.clientX-tap.x,event.clientY-tap.y)<10&&performance.now()-tap.time<350)pulse();tap=null;pointer.targetPower=0;});
  listen(hero,'pointercancel',()=>{tap=null;pointer.targetPower=0;});
  listen(media,'change',event=>{paused=event.matches;updatePaused();});
  listen(window,'resize',renderStill);
  if(scene&&window.IntersectionObserver){observer=new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;lastFrame=0;watchdog.reset();if(visible){scene.start();if(pendingPulse){pendingPulse=false;pulse();}}else{scene.stop();actor.clear();pointer.targetPower=0;}},{threshold:0});observer.observe(hero);}
  function destroy(){if(disposed)return;disposed=true;observer?.disconnect();events.abort();actor?.clear();perf.release(rocks);perf.release(scene);}
  listen(window,'pagehide',event=>{if(event.persisted){scene?.stop();actor?.clear();lastFrame=0;}else destroy();});
  listen(window,'pageshow',event=>{if(event.persisted&&visible)scene?.start();});
})();
