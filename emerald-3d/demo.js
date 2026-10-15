(() => {
 'use strict';
 const $=id=>document.getElementById(id),stage=$('stage'),hero=$('main');
 const media=matchMedia('(prefers-reduced-motion: reduce)'),events=new AbortController(),listen=(t,n,f,o={})=>t.addEventListener(n,f,{signal:events.signal,...o});
 const params=new URLSearchParams(location.search),clamp=(n,a=0,b=1)=>Math.max(a,Math.min(b,n));
 const perf=window.CloudPerformance,requested=params.get('render')||'auto';
 const plan=perf.choose($('world'),{requested,reducedMotion:media.matches,attributes:{premultipliedAlpha:true,depth:false}});let profile=plan.profile,staticMode=profile.mode==='static',visible=true;
 const deviceNames={static:'Static artwork',low:'Low-spec',balanced:'Balanced',high:'Full effects'};
 $('renderMode').value=plan.requested;document.documentElement.dataset.renderTier=profile.mode;
 // A category applies its real rendering budget, while the hardware-availability check still wins.
 // Keep the selected scene/maps in the URL; discard a previous inspection-quality override.
 listen($('renderMode'),'change',()=>{
  const url=new URL(location.href),mode=$('renderMode').value;
  if(mode==='auto')url.searchParams.delete('render');else url.searchParams.set('render',mode);
  url.searchParams.delete('quality');window.location.assign(url.href);
 });
 function describeDevice(reason=plan.reason){
  const name=deviceNames[profile.mode],fallback=profile.mode==='static'&&!['auto','static'].includes(plan.requested);
  const badge=profile.mode==='static'?'Static':profile.mode==='high'?'Full effects':name;
  $('deviceBadge').textContent=fallback?'Static fallback':plan.requested==='auto'?'Auto · '+badge:badge;
  const details={
   static:'Artwork only. No live lighting, moving mist or parallax.',
   low:'15 fps cap · 1 mist layer. Softer scene detail; parallax disabled.',
   balanced:'30 fps cap · 2 mist layers. Medium scene detail, live lighting and parallax.',
   high:'30 fps cap · 2 mist layers. Highest scene detail, live lighting and parallax.'
  };
  $('deviceDescription').textContent=fallback?`${deviceNames[plan.requested]} preview unavailable: ${reason}. Showing static artwork.`:
   `${plan.requested==='auto'?'Auto selected':'Preview'}: ${name}. ${details[profile.mode]}`+(plan.requested==='auto'&&profile.mode==='static'?' '+reason+'.':'');
 }
 describeDevice();
 if(plan.requested!=='auto')$('scenePanel').open=true;
 const status=text=>{$('sceneStatus').textContent=text;};
 // Where the award and cubes sit on the artwork plate (assets/plate/layers.json, from tools/extract-layers.py).
 const PLATE={width:1672,height:941,base:[.2721,.7088],top:[.2763,.1902],cubes:[[.0730,.2976],[.9569,.7566]]};
 // `?cliff=3d` swaps the artwork cliff for the fully computed one (ray-marched rock with scanned maps).
 const cliff3d=params.get('cliff')==='3d';stage.dataset.cliff=cliff3d?'3d':'plate';
 // The award: the reference's own award as an image layer by default; `?award=3d` renders the FBX model live.
 const award3d=cliff3d||params.get('award')==='3d';stage.dataset.award=award3d?'3d':'image';
 let world,back,front,frame=0,last=0,paused=media.matches||params.has('still'),accent='#3dff3a',nextPulse=6;
 const pointer={x:.3,y:.7,tx:.3,ty:.7,power:0,target:0};
 const drift={x:0,y:0,tx:0,ty:0};   // parallax offset, -1..1 from the stage centre

 const {back:backMist,front:frontMist,options:mist}=window.EmeraldMist;
 // Stage size is measured once per resize, not per frame: reading layout after the frame's style writes forces a reflow.
 // Only width/height are cached; pointer handlers still read the live rect, whose left/top move with scrolling.
 let stageRect=null;const stageSize=()=>stageRect??=stage.getBoundingClientRect();
 if(window.ResizeObserver){const observer=new window.ResizeObserver(()=>{stageRect=null;schedule();});observer.observe(stage);listen(window,'pagehide',event=>{if(!event.persisted)observer.disconnect();});}

 // Fit the plate to the stage (cover). Landscape centres it; portrait keeps the award centred and near the top,
 // with a slightly smaller plate so the copy fits beneath. Returns the award anchor and cube spots in stage space.
 function fit(){
  const r=stageSize(),W=r.width,H=r.height,portrait=W/H<1;
  const scale=portrait?H*.7/PLATE.height:Math.max(W/PLATE.width,H/PLATE.height),pw=PLATE.width*scale,ph=PLATE.height*scale;
  let left=(W-pw)/2,top=(H-ph)/2;
  if(portrait){left=clamp(W/2-PLATE.base[0]*pw,W-pw,0);top=H*.1-PLATE.top[1]*ph;}
  stage.dataset.portrait=String(portrait);
  for(const img of [$('plate'),$('backRidge'),$('backColumns'),$('awardImg'),$('cliff'),$('crackGlow')])Object.assign(img.style,{left:left+'px',top:top+'px',width:pw+'px',height:ph+'px'});
  const glow=$('crackGlow'),gw=Math.round(Math.min(pw,1100)),gh=Math.round(gw*PLATE.height/PLATE.width);if(glow.width!==gw){glow.width=gw;glow.height=gh;}
  box={left,top,pw,ph,W,H};
  const at=([x,y])=>[(left+x*pw)/W,(top+y*ph)/H];
  const [bx,by]=at(PLATE.base);
  return {anchor:{x:bx,y:by,height:(PLATE.base[1]-PLATE.top[1])*ph/H},
   cubes:PLATE.cubes.map((c,i)=>({at:at(c),depth:i?3.2:2.4,size:(i?.055:.05)*ph/H,blur:i?.16:.12,spin:i?[-.4,.3,.6]:[.5,.7,.35]})),key:W+'x'+H};
 }
 let fitted=null,box=null;
 function staticFallback(reason){
  staticMode=true;profile=perf.profiles.static;cancelAnimationFrame(frame);frame=0;last=0;
  for(const renderer of [back,front,world])perf.release(renderer);back=front=world=null;
  stage.dataset.cliff='plate';stage.dataset.award='image';document.documentElement.dataset.renderTier='static';fit();
  for(const id of Object.keys(SHIFT))if($(id))$(id).style.transform='none';
  for(const el of document.querySelectorAll('.panel-body button,.panel-body input,.panel-body select'))if(el.id!=='renderMode')el.disabled=true;
  status('Static artwork · '+reason);document.documentElement.dataset.ready='true';
  describeDevice(reason);
 }
 function powerSaver(){
  profile=perf.profiles.low;document.documentElement.dataset.renderTier='low';$('quality').value='low';
  world?.setLimits(profile.world);world?.setQuality('low');back?.setOptions(profile.mist);
  perf.release(front);front=null;last=0;
  describeDevice();
 }
 const watchdog=new perf.Watchdog({mode:profile.mode,automatic:plan.requested==='auto',onLow:powerSaver,onStatic:()=>staticFallback('lighter rendering for this device')});
 function layout(){
  if(cliff3d||!world)return;
  const r=stageSize();if(r.width+'x'+r.height===fitted)return;
  const f=fit();fitted=f.key;world.setLayout(f.anchor,f.cubes);
 }
 function lights(){
  if(!world)return[];
  const r=stageSize(),a=world.anchors();
  return [
   {x:a.base.x*r.width,y:a.base.y*r.height,depth:.25,strength:.55,radius:.45,color:accent},
   {x:pointer.x*r.width,y:pointer.y*r.height,depth:.5,strength:pointer.power*.9,radius:.35,color:accent},
   {x:a.base.x*r.width,y:a.base.y*r.height,depth:.1,strength:world.wave.strength*1.6,radius:.25+world.wave.radius*.12,color:accent}
  ];
 }
 // Each layer slides by a different amount: far plate least, front mist most. The award moves with the cliff
 // it stands on, so its base never separates from the rock.
 // Cliffs, far to near: backRidge (behind the main slope), backColumns (in the right fog), cliff (under the award).
 const SHIFT={plate:[4,3],backRidge:[6,4],backColumns:[8,6],mistBack:[9,6],awardImg:[11,8],world:[13,9],cliff:[15,10],crackGlow:[15,10],mistFront:[24,15]};
 const GROW=new Set(['plate','backRidge','backColumns','awardImg','cliff','crackGlow']);
 let shifted=null;   // [element, sx, sy, scale suffix], resolved on the first parallax frame
 function parallax(t){
  const x=drift.x+Math.sin(t*.23)*.08,y=drift.y+Math.cos(t*.17)*.06;
  shifted??=Object.entries(SHIFT).map(([id,[sx,sy]])=>[$(id),sx,sy,GROW.has(id)?' scale(1.03)':'']).filter(([el])=>el);
  for(const [el,sx,sy,grow] of shifted)el.style.transform=`translate3d(${(x*sx).toFixed(2)}px,${(y*sy).toFixed(2)}px,0)`+grow;
 }
 // A pulse runs out from the award base through the rock and sets off lightning inside the mist.
 // Thin edges of the fog banks, where a bolt is not swallowed by dense mist.
 const MIST_SPOTS=[[.1,.46],[.2,.52],[.04,.5],[.58,.66],[.72,.7]];
 function strike(x,y){
  if(!back||paused)return;const r=stageSize(),[sx,sy]=Number.isFinite(x)&&Number.isFinite(y)?[x,y]:MIST_SPOTS[Math.floor(Math.random()*MIST_SPOTS.length)];
  back.strike((sx+(Math.random()-.5)*.04)*r.width,(sy+(Math.random()-.5)*.04)*r.height);
 }
 function pulse(){world.pulse();strike();}
 const cracks=staticMode?{naturalWidth:0}:new Image();if(!staticMode)cracks.src='assets/plate/cracks.webp';
 const crackCtx=staticMode?null:$('crackGlow').getContext('2d');let crackLit=false;
 // The artwork's cliff is flat, so the pulse ring is drawn in 2D: an expanding ellipse around the award base,
 // cut to the fissure mask. The pointer adds a soft light to the cracks near it.
 function glowCracks(){
  if(cliff3d||!box||!cracks.naturalWidth)return;
  const c=$('crackGlow'),w=c.width,h=c.height,s=world.wave.strength,lit=s>.002||pointer.power>.02;
  if(!lit){if(crackLit){crackCtx.clearRect(0,0,w,h);crackLit=false;}return;}
  crackLit=true;crackCtx.clearRect(0,0,w,h);crackCtx.globalCompositeOperation='source-over';
  const unit=(PLATE.base[1]-PLATE.top[1])*h/3,bx=PLATE.base[0]*w,by=PLATE.base[1]*h,r=world.wave.radius*unit,band=unit*.55,hex=accent;
  if(s>.002){
   crackCtx.save();crackCtx.translate(bx,by);crackCtx.scale(1,.55);
   const g=crackCtx.createRadialGradient(0,0,Math.max(0,r-band),0,0,r+band);g.addColorStop(0,hex+'00');g.addColorStop(.5,hex+Math.round(clamp(s*1.3)*255).toString(16).padStart(2,'0'));g.addColorStop(1,hex+'00');
   crackCtx.fillStyle=g;crackCtx.fillRect(-w*2,-h*4,w*4,h*8);
   const core=crackCtx.createRadialGradient(0,0,0,0,0,unit*1.2);core.addColorStop(0,hex+Math.round(clamp(s*.8)*255).toString(16).padStart(2,'0'));core.addColorStop(1,hex+'00');
   crackCtx.fillStyle=core;crackCtx.fillRect(-w*2,-h*4,w*4,h*8);crackCtx.restore();
  }
  if(pointer.power>.02){
   const px=(pointer.x*box.W-box.left)/box.pw*w,py=(pointer.y*box.H-box.top)/box.ph*h,g=crackCtx.createRadialGradient(px,py,0,px,py,unit*.9);
   g.addColorStop(0,hex+Math.round(clamp(pointer.power*.7)*255).toString(16).padStart(2,'0'));g.addColorStop(1,hex+'00');crackCtx.fillStyle=g;crackCtx.fillRect(0,0,w,h);
  }
  crackCtx.globalCompositeOperation='destination-in';crackCtx.drawImage(cracks,0,0,w,h);
 }
 function loop(now){
  frame=0;if(staticMode||!world||!visible||document.hidden)return;
  if(last&&now-last<1000/profile.fps-.5){schedule();return;}
  const dt=last?Math.min(.1,(now-last)/1000):1/profile.fps;last=now;
  layout();
  if(!paused){
   const a=1-Math.exp(-dt/.18);pointer.x+=(pointer.tx-pointer.x)*a;pointer.y+=(pointer.ty-pointer.y)*a;pointer.power+=(pointer.target-pointer.power)*a;
   const b=1-Math.exp(-dt/.6);drift.x+=(drift.tx-drift.x)*b;drift.y+=(drift.ty-drift.y)*b;
   nextPulse-=dt;if(nextPulse<=0){pulse();nextPulse=7+Math.random()*6;}
  }
  world.setPointer(pointer.x,pointer.y,pointer.power*2.2);
  if(params.has('still'))world.finish();
  world.render(paused?0:dt);
  if(!media.matches&&profile.mode!=='low')parallax(world.time);
  glowCracks();
  // The image award breathes with the scene and flares with each pulse.
  if(!award3d&&profile.mode!=='low'){const glow=1+.05*Math.sin(world.time*.9)+world.wave.strength*.45;const f=`brightness(${glow.toFixed(3)})`;if($('awardImg').style.filter!==f)$('awardImg').style.filter=f;}
  // The back mist keeps light slots free for its own lightning glow.
  const sources=lights();back?.setSources(sources.slice(0,1),[]);front?.setSources(sources,[]);
  for(const layer of [back,front])if(layer){if(!paused)layer.time+=dt*layer.options.drift;layer.render(layer.time,paused?0:dt);}
  // Label from current state each frame: a re-bake (new maps, accent, quality) can finish within one frame.
  const cliffLabel=cliff3d?({rock:'scanned cliff','rock-generated':'generated cliff'}[world.mapSource]||'procedural cliff'):'artwork cliff';
  const label=world.isBaked()?(award3d?'Live 3D award · ':'Award art · live cubes · ')+cliffLabel+' · Cloud Kit mist'+(profile.mode==='low'?' · power saver':''):'Rendering 3D scene…';
  if($('sceneStatus').textContent!==label){status(label);document.documentElement.dataset.ready=String(world.isBaked());}
  if(!paused)watchdog.sample(now,1000/profile.fps);if(staticMode)return;
  if(!paused||!world.isBaked())schedule();
 }
 const schedule=()=>{if(!staticMode&&visible&&!frame&&!document.hidden)frame=requestAnimationFrame(loop);};
 function setPaused(value){
  if(staticMode)return;paused=value;last=0;watchdog.reset();back?.setPaused(paused);front?.setPaused(paused);$('pause').setAttribute('aria-pressed',String(paused));$('pause').textContent=paused?'Play':'Pause';
  $('pulse').disabled=paused;schedule();
 }

 try{
  if(staticMode)throw Error(plan.reason);
  const maps={scan:['assets/rock/'],generated:['assets/rock-generated/'],none:false}[params.get('maps')];
  const f=cliff3d?null:fit();
  world=new EmeraldWorld($('world'),{quality:params.get('quality')||profile.quality,limits:profile.world,accent,rock:cliff3d,award:award3d,...(f&&{anchor:f.anchor,cubes:f.cubes}),...(maps!==undefined&&{rockMaps:maps}),onMaps:()=>schedule(),onError:error=>status('3D unavailable: '+error.message)});
  fitted=f?.key??null;
  try{
   // The artwork already carries mist; the live layers add drift and the award's light. The computed cliff gets fuller mist.
   const density=cliff3d?[1.3,1]:[.75,.55];
   back=new CloudKit.CloudScene($('mistBack'),{...mist,...profile.mist,failIfMajorPerformanceCaveat:true,powerPreference:'low-power',density:density[0],densityShader:backMist,lightning:true,color:accent,boltReach:Math.round(clamp(stage.getBoundingClientRect().width*.15,40,500))});
   if(profile.mistLayers>1)front=new CloudKit.CloudScene($('mistFront'),{...mist,...profile.mist,failIfMajorPerformanceCaveat:true,powerPreference:'low-power',density:density[1],densityShader:frontMist});
   $('mistDensity').value=String(density[0]);
   // One host clock drives every renderer; mist layers do not start their own RAF loops.
  }catch(error){back?.destroy();front?.destroy();back=front=null;console.warn('Mist unavailable:',error.message);}
  if(params.has('still'))world.finish();
  // Inspection stills: ?still&pointer=.4,.8&wave=2 freezes a pointer light and a pulse ring (radius in scene units).
  const at=params.get('pointer')?.split(',').map(Number);
  if(at?.length===2&&at.every(Number.isFinite))Object.assign(pointer,{x:at[0],y:at[1],tx:at[0],ty:at[1],power:1,target:1});
  if(params.has('wave')){world.pulse();world.wave.radius=clamp(Number(params.get('wave'))||0,0,12);world.wave.strength=.8;}
  // ?strike=x,y fires a lightning strike in the mist after 1 s (live mode; paused mist has no lightning).
  if(params.has('strike'))setTimeout(()=>strike(...params.get('strike').split(',').map(Number)),1000);
  setPaused(paused);schedule();
  // Redraw the engraving once web fonts arrive.
  $('quality').value=params.get('quality')||profile.quality;
  document.fonts?.ready.then(()=>{if(!world||world.destroyed||staticMode)return;world.setInscription({});if(params.has('still'))world.finish();schedule();});
 }catch(error){
  staticFallback(plan.profile.mode==='static'?plan.reason:'Graphics initialization failed');if(plan.profile.mode!=='static')console.warn('Emerald 3D:',error.message);
 }

 function aim(event){
  if(staticMode)return;const r=stage.getBoundingClientRect();pointer.tx=clamp((event.clientX-r.left)/r.width);pointer.ty=clamp((event.clientY-r.top)/r.height);pointer.target=1;
  drift.tx=pointer.tx*2-1;drift.ty=pointer.ty*2-1;
  if(paused){pointer.x=pointer.tx;pointer.y=pointer.ty;pointer.power=1;drift.x=drift.tx;drift.y=drift.ty;schedule();}
 }
 listen(hero,'pointermove',event=>{if(event.pointerType!=='touch')aim(event);});
 listen(hero,'pointerleave',()=>{pointer.target=0;drift.tx=drift.ty=0;if(paused){pointer.power=0;schedule();}});
 let tap=null;
 listen(hero,'pointerdown',event=>{if(!event.target.closest('a,button,summary,input,select,nav'))tap={x:event.clientX,y:event.clientY,t:performance.now()};});
 listen(hero,'pointerup',event=>{if(tap&&Math.hypot(event.clientX-tap.x,event.clientY-tap.y)<10&&performance.now()-tap.t<400&&!paused&&world){aim(event);pulse();nextPulse=8;}tap=null;if(event.pointerType==='touch')pointer.target=0;});
 listen($('pulse'),'click',()=>{if(world&&!paused){pulse();nextPulse=8;}});
 listen($('pause'),'click',()=>setPaused(!paused));
 listen($('quality'),'change',()=>{world?.setQuality($('quality').value);for(const s of [back,front])s?.setOptions(perf.mistOptions(profile,$('quality').value));schedule();});
 listen($('mistDensity'),'input',()=>{const v=Number($('mistDensity').value);back?.setOptions({density:v});front?.setOptions({density:v*.75});if(paused){back?.render();front?.render();}});
 for(const button of document.querySelectorAll('[data-accent]'))listen(button,'click',()=>{
  accent=button.dataset.accent;world?.setAccent(accent);back?.setOptions({color:accent});document.documentElement.style.setProperty('--accent',accent);
  for(const b of document.querySelectorAll('[data-accent]'))b.setAttribute('aria-pressed',String(b===button));
  schedule();
 });
 listen($('menu'),'click',()=>{const open=$('links').classList.toggle('open');$('menu').setAttribute('aria-expanded',String(open));});
 listen(media,'change',event=>setPaused(event.matches));
 listen(window,'resize',()=>{stageRect=null;if(staticMode)fit();else schedule();});
 listen(document,'visibilitychange',()=>{last=0;watchdog.reset();if(document.hidden){cancelAnimationFrame(frame);frame=0;}else schedule();});
 if(window.IntersectionObserver){const observer=new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;last=0;watchdog.reset();if(visible)schedule();else{cancelAnimationFrame(frame);frame=0;}},{threshold:0});observer.observe(hero);listen(window,'pagehide',event=>{if(!event.persisted)observer.disconnect();});}
 listen(window,'pagehide',event=>{if(event.persisted)return;cancelAnimationFrame(frame);events.abort();for(const renderer of [back,front,world])perf.release(renderer);});
})();
