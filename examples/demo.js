(() => {
 const $=id=>document.getElementById(id),kit=window.PuFF;
 let scene,volume,paused=false,textMode=false,frame=0,last=0,pointer={active:false,x:0,y:0,vx:0,vy:0,segments:[]};
 function resetPointer(){pointer={active:false,down:false,x:0,y:0,vx:0,vy:0,segments:[],effects:[]};}
 const mapped={power:'lightningPower',reach:'boltReach',glow:'cloudGlow'};
 const controls=[...Object.entries(kit.CloudControls.scene).map(([key,c])=>[key,c.label,c.min,c.max,c.step,c.default]),...Object.entries(kit.CloudControls.lightning).map(([key,c])=>[mapped[key]||key,c.label,c.min,c.max,c.step,c.default]),['puffiness','Text puffiness',.3,2,.05,1],['trail','Text sweep',0,2,.05,1]];
 for(const [key,label,min,max,step,value]of controls){
  const row=document.createElement('div');row.className='range';row.innerHTML=`<label for="${key}">${label}</label><output id="${key}Value" for="${key}">${value}</output><input id="${key}" type="range" min="${min}" max="${max}" step="${step}" value="${value}">`;$('ranges').append(row);
  $(key).addEventListener('input',()=>{const n=Number($(key).value);$(key+'Value').value=n;if(key==='puffiness')resizeText();else if(key==='trail'){if(volume)volume.trailStrength=n;}else{scene?.setOptions({[key]:n});scene?.render();}if(textMode&&paused)textTick(performance.now());});
 }
 try{scene=new kit.CloudScene($('sky'),{preset:'storm'});paused=scene.paused;$('pause').textContent=paused?'Resume':'Pause';$('pause').setAttribute('aria-pressed',paused);}catch(error){$('status').textContent=`Cloud rendering needs WebGL2: ${error.message}`;return;}
 function sync(){for(const [key]of controls)if(key in scene.options){$(key).value=scene.options[key];$(key+'Value').value=scene.options[key];}for(const key of ['cloudColor','background'])$(key).value=scene.options[key];}
 function resizeText(){
  if(!volume)return;const r=$('stage').getBoundingClientRect(),mask=document.createElement('canvas');mask.width=Math.max(1,Math.round(r.width));mask.height=Math.max(1,Math.round(r.height));
  const ctx=mask.getContext('2d'),size=Math.min(150,r.width*.17);ctx.font=`italic bold ${size}px Georgia`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle='#fff';ctx.fillText('Cloud',r.width*.6,r.height*.48);
  volume.setMask(mask,{scale:size,puffiness:Number($('puffiness').value)});volume.trailStrength=Number($('trail').value);resetPointer();
 }
 function textTick(now){frame=0;if(!textMode||document.hidden)return;const dt=last?Math.min(.05,(now-last)/1000):1/60;last=now;volume.render(dt,paused,pointer);pointer.segments=[];pointer.effects=[];pointer.vx=pointer.vy=0;if(!paused)frame=requestAnimationFrame(textTick);}
 $('shape').addEventListener('change',()=>{
  const shape=$('shape').value;textMode=shape==='text';$('textStage').hidden=!textMode;$('sky').hidden=textMode;
  for(const [key]of controls)$(key).parentElement.hidden=textMode?!['puffiness','trail'].includes(key):['puffiness','trail'].includes(key);
  for(const key of ['quality','color','cloudColor','background','strike','preset'])$(key).disabled=textMode;
  cancelAnimationFrame(frame);frame=0;last=0;resetPointer();
  if(textMode){scene.stop();if(!volume){volume=new kit.CloudVolume({gridSize:240,raySteps:24});$('textStage').append(volume.canvas);}resizeText();textTick(performance.now());}
  else{scene.clearDensityField();scene.setOptions({shape:shape==='sphere'?'sphere':'layer'});
   if(shape==='ring'){
    const field=kit.createDensityField((x,y,z)=>{const ring=Math.hypot(Math.hypot(x,y)-.58,z);const texture=.9+.1*Math.sin(x*28+Math.sin(z*17))*Math.sin(y*23);return Math.max(0,(.23-ring)/.08)*texture;});
    scene.setDensityField(field.data,{...field,extent:[2,2,2]});
   }
   scene.render();scene.start();
  }
  $('status').textContent=shape==='ring'?'This ring comes from a custom 3D density function.':textMode?'Sweep the letters. The same mask adapter can render logos and other 2D shapes.':'Move over the sky or tap. Pause lets you inspect a still cloud volume.';
 });
 $('preset').addEventListener('change',()=>{scene.setOptions({preset:$('preset').value});sync();scene.render();});
 $('quality').addEventListener('change',()=>{scene.setOptions({quality:$('quality').value});sync();});
 $('lightningMode').addEventListener('change',()=>scene.setOptions({lightningMode:$('lightningMode').value}));
 for(const key of ['color','cloudColor','background'])$(key).addEventListener('input',()=>{scene.setOptions({[key]:$(key).value});scene.render();});
 $('strike').addEventListener('click',()=>{scene.setOptions({lightning:true});const r=$('sky').getBoundingClientRect();scene.strike(r.width*.65,r.height*.45);$('status').textContent=paused?'Resume to send the flash.':'A flash lights the vapor from within.';});
 $('pause').addEventListener('click',()=>{paused=!paused;resetPointer();scene.setPaused(paused);$('pause').textContent=paused?'Resume':'Pause';$('pause').setAttribute('aria-pressed',paused);if(textMode){cancelAnimationFrame(frame);last=0;volume.dirty=true;textTick(performance.now());}});
 function movePointer(e){
  if(!textMode||paused||pointer.down&&e.pointerId!==pointer.id)return;
  const r=$('stage').getBoundingClientRect(),x=e.clientX-r.left,y=e.clientY-r.top,now=performance.now(),dt=pointer.at?Math.max(.008,(now-pointer.at)/1000):1/60;
  if(!Number.isFinite(x)||!Number.isFinite(y))return;
  const touch=e.pointerType==='touch'||e.pointerType==='pen';
  if(pointer.down&&Math.hypot(x-pointer.startX,y-pointer.startY)>9)pointer.moved=true;
  if(pointer.active&&!touch&&(x!==pointer.x||y!==pointer.y))pointer.segments.push({ax:pointer.x,ay:pointer.y,bx:x,by:y,down:pointer.down});
  if(pointer.segments.length>64)pointer.segments.shift();Object.assign(pointer,{x,y,vx:(x-pointer.x)/dt,vy:(y-pointer.y)/dt,at:now,active:!touch});
 }
 $('stage').addEventListener('pointermove',movePointer);
 $('stage').addEventListener('pointerdown',e=>{if(!textMode||paused||e.button>0||pointer.down||e.isPrimary===false)return;movePointer(e);Object.assign(pointer,{id:e.pointerId,down:true,downAt:performance.now(),startX:pointer.x,startY:pointer.y,moved:false});if(e.pointerType!=='touch')$('stage').setPointerCapture?.(e.pointerId);});
 $('stage').addEventListener('pointerup',e=>{if(!pointer.down||e.pointerId!==pointer.id)return;movePointer(e);if(!pointer.moved&&performance.now()-pointer.downAt<350){pointer.effects.push({kind:'puff',x:pointer.x,y:pointer.y,strength:1});if(pointer.effects.length>8)pointer.effects.shift();}pointer.down=false;});
 $('stage').addEventListener('pointercancel',e=>{if(!pointer.down||e.pointerId===pointer.id)resetPointer();});
 $('stage').addEventListener('pointerleave',()=>{if(!pointer.down)pointer.active=false;});
 window.addEventListener('blur',resetPointer);
 window.addEventListener('resize',()=>{if(textMode){resizeText();if(paused)textTick(performance.now());}});
 document.addEventListener('visibilitychange',()=>{cancelAnimationFrame(frame);frame=0;last=0;resetPointer();if(textMode&&!document.hidden){volume.dirty=true;textTick(performance.now());}});
 window.addEventListener('pagehide',event=>{cancelAnimationFrame(frame);frame=0;last=0;scene.stop();if(!event?.persisted){scene.destroy();volume?.destroy();}});
 window.addEventListener('pageshow',()=>{if(textMode){if(!frame)textTick(performance.now());}else scene.start();});
 for(const key of ['puffiness','trail'])$(key).parentElement.hidden=true;
 sync();
})();
