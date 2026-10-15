(() => {
 const $=id=>document.getElementById(id),kit=window.CloudKit;
 let scene,volume,paused=false,textMode=false,frame=0,last=0,pointer={active:false,x:0,y:0,vx:0,vy:0,segments:[]};
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
  volume.setFormation(mask,size,Number($('puffiness').value),true);volume.trailStrength=Number($('trail').value);
 }
 function textTick(now){frame=0;if(!textMode)return;const dt=last?Math.min(.05,(now-last)/1000):1/60;last=now;volume.render(dt,paused,pointer);pointer.segments=[];pointer.vx=pointer.vy=0;if(!paused)frame=requestAnimationFrame(textTick);}
 $('shape').addEventListener('change',()=>{
  const shape=$('shape').value;textMode=shape==='text';$('textStage').hidden=!textMode;$('sky').hidden=textMode;
  for(const [key]of controls)$(key).parentElement.hidden=textMode?!['puffiness','trail'].includes(key):['puffiness','trail'].includes(key);
  for(const key of ['quality','color','cloudColor','background','strike','preset'])$(key).disabled=textMode;
  cancelAnimationFrame(frame);frame=0;last=0;
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
 $('pause').addEventListener('click',()=>{paused=!paused;scene.setPaused(paused);$('pause').textContent=paused?'Resume':'Pause';$('pause').setAttribute('aria-pressed',paused);if(textMode&&!paused&&!frame)frame=requestAnimationFrame(textTick);});
 $('stage').addEventListener('pointermove',e=>{if(!textMode)return;const r=$('stage').getBoundingClientRect(),x=e.clientX-r.left,y=e.clientY-r.top;if(pointer.active)pointer.segments.push({ax:pointer.x,ay:pointer.y,bx:x,by:y});pointer={...pointer,x,y,vx:(x-pointer.x)*60,vy:(y-pointer.y)*60,active:true};});
 $('stage').addEventListener('pointerleave',()=>{pointer.active=false;pointer.segments=[];});
 window.addEventListener('resize',()=>{if(textMode)resizeText();});
 window.addEventListener('pagehide',()=>{cancelAnimationFrame(frame);scene.destroy();volume?.destroy();});
 for(const key of ['puffiness','trail'])$(key).parentElement.hidden=true;
 sync();
})();
