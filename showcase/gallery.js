(() => {
 'use strict';
 const kit=window.CloudKit,$=id=>document.getElementById(id);
 const authoredDensity='if(uCustom < .5) return cloudBase(p); vec3 q=(p-uOffset)/uScale; float d=length(vec2(length(q.xy)-1.,q.z)); return (1.-smoothstep(.18,.32,d))*(.65+.35*noise(q*uFrequency+uTime*uWindDirection));';
 let scene,volume,bound=null,selected=null,playing=false,frame=0,last=0;const queued=new Set(),fields=new Map();
 const cards=[
  {id:'soft',title:'Soft clouds',tag:'PROCEDURAL ATMOSPHERE',description:'Sunlit billows with configurable density, softness, size, and drift.',options:{preset:'clouds'}},
  {id:'storm',title:'A storm from within',tag:'INTERNAL LIGHTNING',description:'Vapor hides parts of each discharge and scatters its light. Send a flash or choose Random.',options:{preset:'storm',lightning:true,lightningMode:'manual'}},
  {id:'fog',title:'A little mist',tag:'FOG',description:'A soft atmosphere. Change its coverage, absorption, tint, and motion.',options:{preset:'fog',coverage:.35}},
  {id:'smoke',title:'Smoke in motion',tag:'SMOKE',description:'Dark, drifting vapor with its own lighting and color palette.',options:{preset:'smoke',cloudColor:'#ab87a7',ambient:.45}},
  {id:'puff',title:'One floating puff',tag:'ISOLATED VOLUME',description:'A rounded cloud body. Its radius, position, scale, and surface can be changed.',options:{preset:'clouds',shape:'sphere'}},
  {id:'ring',title:'A cloud ring',tag:'CUSTOM 3D FIELD',description:'A density function makes a ring. Any voxel shape can use this same renderer.',field:'ring',options:{preset:'clouds',detail:1.25}},
  {id:'heart',title:'Made of vapor',tag:'CUSTOM 3D FIELD',description:'A second authored shape. It shares the same light transport and cloud material.',field:'heart',options:{preset:'clouds',cloudColor:'#ffe2ed'}},
  {id:'text',title:'Write in the sky',tag:'TEXT MASK',description:'Change the word, sweep its letters, or lift a small puff. Text is a canvas mask.',type:'mask',word:'Cloud',options:{puffiness:1,trailStrength:1,physics:{}}},
  {id:'logo',title:'Beyond lettering',tag:'ANY ALPHA MASK',description:'A painted symbol becomes puffy vapor. Logos and silhouettes use the same mask adapter.',type:'mask',word:null,options:{puffiness:1,trailStrength:1,physics:{}}},
  {id:'light',title:'Move the light',tag:'3D SCATTERING',description:'Move over this frame to illuminate its volume. Change color and absorption to inspect its depth.',lamp:true,options:{preset:'storm',lightning:false,ambient:.25}},
  {id:'weather',title:'Wind through words',tag:'TAP / STIR / GUST / RECOVERY',description:'Tap releases vapor; a hold stirs it. Sweep or send a gust, then watch the letters gather back.',type:'mask',word:'Wind',options:{puffiness:1,trailStrength:1,physics:{}}},
  {id:'overlay',title:'Clouds over anything',tag:'TRANSPARENT OVERLAY',description:'The checkerboard shows the alpha channel. Put this cloud layer over your own page, image, or scene.',options:{preset:'clouds',shape:'sphere',backgroundOpacity:0}},
  {id:'time',title:'Choose the hour',tag:'DAWN / DAY / NOON / DUSK / NIGHT',description:'Time is a lighting palette, independent of shape and atmosphere. Choose an hour in Settings; no sun or moon objects are added.',options:{preset:'clouds',timeOfDay:'dawn'}},
  {id:'shader',title:'Your own cloud material',tag:'CUSTOM GLSL DENSITY',description:'This ring comes from a GPU density function. Change its frequency or write your own shader body.',custom:true,options:{preset:'clouds',cloudColor:'#c1ebff',detail:1}}
 ];
 try{
  scene=new kit.CloudScene(document.createElement('canvas'),{quality:'medium',interactive:false,autoStart:false,densityShader:authoredDensity,uniforms:{uCustom:0,uFrequency:5}});
  volume=new kit.CloudVolume({gridSize:260,raySteps:32,renderWidth:1100,renderHeight:700});
 }catch(error){$('status').textContent='Cloud rendering needs WebGL2: '+error.message;return;}
 const defaults=scene.getOptions();
 function field(name){
  if(!fields.has(name))fields.set(name,kit.createDensityField((x,y,z)=>{if(name==='ring')return Math.max(0,(.23-Math.hypot(Math.hypot(x,y)-.58,z))/.08);x*=1.25;y*=1.25;z*=1.25;const q=x*x+y*y+2*z*z-.64;return Math.max(0,-(q*q*q-x*x*y*y*y-.12*z*z*y*y*y)*35);}));
  return fields.get(name);
 }
 function wake(){if(!frame&&!document.hidden)frame=requestAnimationFrame(tick);}
 function queue(card){queued.add(card);wake();}
 function dimensions(card){const r=card.canvas.getBoundingClientRect(),scale=Math.min(window.devicePixelRatio||1,card.options.quality==='high'?1.5:1);return{width:Math.max(320,Math.min(1000,Math.round((r.width||500)*scale))),height:Math.max(200,Math.min(625,Math.round((r.width||500)*scale*.625)))};}
 function mask(card){
  const canvas=document.createElement('canvas');canvas.width=card.canvas.width;canvas.height=card.canvas.height;const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';
  if(card.word!==null){const size=Math.min(canvas.height*.45,canvas.width/Math.max(3,card.word.length)*1.2);ctx.font=`italic bold ${size}px Georgia`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(card.word,canvas.width/2,canvas.height/2);card.fontSize=size;}
  else{const x=canvas.width/2,y=canvas.height/2,r=canvas.height*.24;ctx.beginPath();ctx.arc(x-r*.7,y,r*.65,0,Math.PI*2);ctx.arc(x+r*.7,y,r*.65,0,Math.PI*2);ctx.arc(x,y-r*.55,r*.8,0,Math.PI*2);ctx.fill();ctx.fillRect(x-r*.7,y-r*.2,r*1.4,r*.8);card.fontSize=canvas.height*.35;}
  return canvas;
 }
 function bind(card){
  const size=dimensions(card);if(card.canvas.width!==size.width||card.canvas.height!==size.height){card.canvas.width=size.width;card.canvas.height=size.height;card.maskDirty=true;card.pointer.active=false;bound=null;}
  if(bound!==card){
   if(card.type==='mask')card.maskDirty=true;
   else{scene.setOptions({...defaults,...kit.CloudPresets[card.options.preset],...card.options,lightning:card.options.lightning??false});scene.resize(card.canvas.width,card.canvas.height);scene.clearDensityField();if(card.field){const density=field(card.field);scene.setDensityField(density.data,{...density,extent:[2,2,2]});}scene.setUniforms(card.options.uniforms);scene.clearLightning();scene.clearPointer();}
   bound=card;
  }
  if(card.type==='mask'&&card.maskDirty){volume.setMask(mask(card),{scale:card.fontSize,puffiness:card.options.puffiness});card.maskDirty=false;}
 }
 function draw(card,dt=0,now=0){
  bind(card);if(card.type!=='mask'&&card.options.backgroundOpacity<1)card.canvas.classList.add('transparent');else card.canvas.classList.remove('transparent');const ctx=card.canvas.getContext('2d');
  if(card.type==='mask'){
   volume.configure({...Object.fromEntries(Object.entries(kit.CloudControls.volume).map(([k,c])=>[k,c.default])),...card.options.physics});volume.options.shadowStride=card.options.shadowStride??3;volume.trailStrength=card.options.trailStrength;volume.vaporDensity=card.options.vaporDensity??1;volume.airStrength=card.options.airStrength??1;
   const p=card.pointer,holding=p.down&&!p.moved&&now-p.downAt>420;
   const effects=[...card.effects,...(holding||card.stirUntil>now?[{kind:'stir',x:p.down?p.x:card.canvas.width/2,y:p.down?p.y:card.canvas.height/2,strength:1}]:[])];
   volume.pointLight=p.active?{x:p.x,y:p.y,height:70,power:1,reach:200,color:hexRGB($('lightColor').value)}:null;volume.dirty=true;
   volume.render(dt,dt===0,{...p,effects});card.effects=[];p.segments=[];p.vx=p.vy=0;
   ctx.clearRect(0,0,card.canvas.width,card.canvas.height);ctx.drawImage(volume.canvas,0,0,card.canvas.width,card.canvas.height);
  }else{
   const p=card.pointer;if(p.active)scene.setPointer(p.x,p.y);else scene.clearPointer();scene.setSources(card.lamp?[{x:p.active?p.x:card.canvas.width*.55,y:p.active?p.y:card.canvas.height*.45,depth:.3,strength:1,color:$('lightColor').value}]:[]);
   scene.render(card.time,dt);ctx.clearRect(0,0,card.canvas.width,card.canvas.height);ctx.drawImage(scene.canvas,0,0,card.canvas.width,card.canvas.height);
  }
 }
 function tick(now){
  frame=0;last=now;
  const preview=queued.values().next().value;
  if(preview){queued.delete(preview);draw(preview,0,now);}
  else if(selected&&playing&&selected.visible!==false&&now-selected.lastDraw>=1000/(selected.options.fps||24)){const dt=selected.lastDraw?Math.min(.25,(now-selected.lastDraw)/1000):1/24;selected.time+=dt*(selected.options.drift??1);draw(selected,dt,now);selected.lastDraw=now;}
  if(queued.size||playing&&selected?.visible!==false)wake();else last=0;
 }
 function hexRGB(hex){return[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255);}
 function pause(){playing=false;last=0;for(const card of cards){card.playButton.textContent='Play';card.playButton.setAttribute('aria-pressed',false);}}
 function select(card,play=false){
  if(selected!==card){pause();selected?.article.classList.remove('selected');selected=card;card.article.classList.add('selected');}
  playing=play;card.playButton.textContent=playing?'Pause':'Play';card.playButton.setAttribute('aria-pressed',playing);$('selectedTitle').textContent=card.title;$('selectedDescription').textContent=card.description;syncControls();queue(card);
  $('snippet').textContent=card.type==='mask'?`const cloud = new CloudKit.CloudVolume();\ncloud.setMask(yourCanvasMask, {puffiness:1});\ncloud.render(dt, false, pointer);`:card.custom?`new CloudKit.CloudScene(canvas, {\n  densityShader: 'vec3 q=p; float d=length(vec2(length(q.xy)-1.,q.z)); return (1.-smoothstep(.18,.32,d))*(.65+.35*noise(q*uFrequency));',\n  uniforms: {uFrequency:5}\n});\n// Replace the density body with your own GLSL.`:card.field?`const field = CloudKit.createDensityField(sample);\nsky.setDensityField(field.data, field);`:`const sky = new CloudKit.CloudScene(canvas, {\n  preset: '${card.options.preset}'\n});`;
 }
 function action(card,kind){select(card,true);if(kind==='flash'){bind(card);scene.strike(card.canvas.width*.5,card.canvas.height*.4);}if(kind==='puff')card.effects.push({kind:'puff',x:card.canvas.width/2,y:card.canvas.height/2,strength:1});if(kind==='stir')card.stirUntil=performance.now()+1200;if(kind==='gust'){bind(card);volume.gust(1);}wake();}
 for(const card of cards){
  card.options=card.type==='mask'?{...card.options}:{...defaults,...kit.CloudPresets[card.options.preset],lightning:false,...card.options};if(card.type!=='mask'&&card.options.timeOfDay!=='custom'){const t=kit.CloudTimes[card.options.timeOfDay];Object.assign(card.options,{cloudColor:t.lit.slice(),background:t.background.slice(),ambient:t.ambient,lightDirection:[t.direction[0],-t.direction[1],t.direction[2]]});}if(card.type!=='mask')card.options.uniforms={uCustom:card.custom?1:0,uFrequency:5};card.time=0;card.lastDraw=0;card.effects=[];card.pointer={x:0,y:0,vx:0,vy:0,active:false,down:false,segments:[]};
  const article=document.createElement('article');article.className='frame';article.id='frame-'+card.id;article.innerHTML=`<canvas aria-label="${card.title} interactive preview"></canvas><div class="frame-content"><span class="tag">${card.tag}</span><h2>${card.title}</h2><p>${card.description}</p>${card.word?`<input type="text" value="${card.word}" maxlength="20" aria-label="Cloud word for ${card.title}">`:''}<div class="actions"><button type="button" data-action="play" aria-pressed="false">Play</button><button type="button" data-action="settings">Settings</button>${card.id==='storm'?'<button type="button" data-action="flash">Send lightning</button>':''}${card.type==='mask'?'<button type="button" data-action="puff">Tap puff</button><button type="button" data-action="stir">Stir</button><button type="button" data-action="gust">Gust</button>':''}</div></div>`;
  $('gallery').append(article);card.article=article;card.canvas=article.querySelector('canvas');card.playButton=article.querySelector('[data-action="play"]');card.playButton.addEventListener('click',()=>select(card,selected===card?!playing:true));article.querySelector('[data-action="settings"]').addEventListener('click',()=>{select(card,selected===card&&playing);if(window.matchMedia?.('(max-width:700px)').matches)$('inspector').scrollIntoView({block:'start',behavior:'auto'});});
  for(const kind of ['flash','puff','stir','gust'])article.querySelector(`[data-action="${kind}"]`)?.addEventListener('click',()=>action(card,kind));
  article.querySelector('input')?.addEventListener('input',e=>{card.word=e.target.value.trim().slice(0,20)||'Cloud';card.maskDirty=true;select(card,playing);});
  const move=e=>{const r=card.canvas.getBoundingClientRect(),x=(e.clientX-r.left)*card.canvas.width/r.width,y=(e.clientY-r.top)*card.canvas.height/r.height,p=card.pointer;if(p.active&&e.pointerType!=='touch')p.segments.push({ax:p.x,ay:p.y,bx:x,by:y});if(p.segments.length>64)p.segments.splice(0,p.segments.length-64);if(p.down&&Math.hypot(x-p.downX,y-p.downY)>9)p.moved=true;p.vx=(x-p.x)*60;p.vy=(y-p.y)*60;p.x=x;p.y=y;p.active=e.pointerType!=='touch'||card.type!=='mask';if(selected===card&&playing)wake();};
  card.canvas.addEventListener('pointermove',move);card.canvas.addEventListener('pointerdown',e=>{select(card,true);move(e);card.pointer.down=true;card.pointer.downAt=performance.now();card.pointer.downX=card.pointer.x;card.pointer.downY=card.pointer.y;card.pointer.moved=false;});card.canvas.addEventListener('pointerup',()=>{if(card.type==='mask'&&!card.pointer.moved&&performance.now()-card.pointer.downAt<350)card.effects.push({kind:'puff',x:card.pointer.x,y:card.pointer.y,strength:1});card.pointer.down=false;});card.canvas.addEventListener('pointerleave',()=>{card.pointer.active=false;card.pointer.down=false;});card.canvas.addEventListener('pointercancel',()=>{card.pointer.active=false;card.pointer.down=false;});
 }
 const controls=[];
 for(const [type,schema]of [['scene',kit.CloudControls.scene],['lightning',kit.CloudControls.lightning],['physics',kit.CloudControls.volume],['uniform',{uFrequency:{label:'GPU noise frequency',min:1,max:20,step:.1,default:5,group:'Custom density'}}],['mask',{shadowStride:{label:'Shadow sample spacing',min:1,max:8,step:1,default:3,group:'Mask clouds'},puffiness:{label:'Puffiness',min:.3,max:2,step:.05,default:1,group:'Mask clouds'},trailStrength:{label:'Sweep strength',min:0,max:2,step:.05,default:1,group:'Mask clouds'},vaporDensity:{label:'Vapor density',min:0,max:2,step:.05,default:1,group:'Mask clouds'},airStrength:{label:'Air strength',min:0,max:2,step:.05,default:1,group:'Mask clouds'}}]]){
  const group=document.createElement('details');group.className='controls-group';group.innerHTML=`<summary>${{scene:'Cloud structure & rendering',lightning:'Lightning',physics:'Recovery & weathering',mask:'Cloud lettering',uniform:'Authored density'}[type]}</summary>`;
  for(const [key,c]of Object.entries(schema)){const row=document.createElement('div');row.className='range';row.innerHTML=`<label for="control-${type}-${key}">${c.label}</label><output>${c.default}</output><input id="control-${type}-${key}" type="range" min="${c.min}" max="${c.max}" step="${c.step}" value="${c.default}">`;group.append(row);const input=row.querySelector('input'),output=row.querySelector('output');controls.push({type,key,input,output,group,c});input.addEventListener('input',()=>{if(!selected)return;const value=Number(input.value);if(type==='uniform')selected.options.uniforms={...selected.options.uniforms,[key]:value};else if(type==='physics')selected.options.physics={...selected.options.physics,[key]:value};else if(type==='lightning'){const name={power:'lightningPower',reach:'boltReach',glow:'cloudGlow'}[key]||key;selected.options[name]=value;}else selected.options[key]=value;if(key==='backgroundOpacity')selected.options.transparent=value===0;if(key==='puffiness')selected.maskDirty=true;if(bound===selected&&selected.type!=='mask')scene.setOptions(selected.options);output.value=String(value);queue(selected);});}
  $('controls').append(group);
 }
 function syncControls(){if(!selected)return;const maskMode=selected.type==='mask';for(const {type,key,input,output,group,c}of controls){group.hidden=type==='uniform'?!selected.custom:maskMode?type==='scene'||type==='lightning':type==='mask'||type==='physics';const name=type==='lightning'?({power:'lightningPower',reach:'boltReach',glow:'cloudGlow'}[key]||key):key;const value=type==='uniform'?selected.options.uniforms?.[key]??c.default:type==='physics'?selected.options.physics?.[key]??c.default:selected.options[name]??c.default;input.value=value;output.value=String(value);}for(const id of ['quality','lightningMode','cloudColor','skyColor','timeOfDay','transparent'])$(id).disabled=maskMode;if(maskMode)$('lightColor').value=selected.options.color||'#8edaff';if(!maskMode){$('timeOfDay').value=selected.options.timeOfDay||'custom';$('transparent').checked=selected.options.backgroundOpacity===0;$('quality').value=selected.options.quality;$('lightningMode').value=selected.options.lightningMode;const color=value=>Array.isArray(value)?'#'+value.map(n=>Math.round(Math.max(0,Math.min(1,n))*255).toString(16).padStart(2,'0')).join(''):value;$('cloudColor').value=color(selected.options.cloudColor);$('skyColor').value=color(selected.options.background);$('lightColor').value=color(selected.options.color);}}
 $('timeOfDay').addEventListener('change',()=>{if(!selected||selected.type==='mask')return;bind(selected);scene.setTimeOfDay($('timeOfDay').value);Object.assign(selected.options,scene.getOptions());syncControls();queue(selected);});
 $('transparent').addEventListener('change',()=>{if(!selected||selected.type==='mask')return;selected.options.backgroundOpacity=$('transparent').checked?0:1;selected.options.transparent=$('transparent').checked;if(bound===selected)scene.setOptions({transparent:selected.options.transparent});syncControls();queue(selected);});
 $('quality').addEventListener('change',()=>{if(!selected)return;Object.assign(selected.options,kit.CloudControls.quality[$('quality').value],{quality:$('quality').value});if(bound===selected)scene.setOptions(selected.options);syncControls();queue(selected);});
 $('lightningMode').addEventListener('change',()=>{if(!selected)return;selected.options.lightningMode=$('lightningMode').value;selected.options.lightning=selected.options.lightningMode!=='off';if(bound===selected)scene.setOptions(selected.options);queue(selected);});
 for(const [id,key]of [['lightColor','color'],['cloudColor','cloudColor'],['skyColor','background']])$(id).addEventListener('input',()=>{if(!selected)return;selected.options[key]=$(id).value;if(bound===selected&&selected.type!=='mask')scene.setOptions({[key]:$(id).value});queue(selected);});
 $('pauseAll').addEventListener('click',pause);
 $('export').addEventListener('click',()=>{if(selected)$('configuration').value=JSON.stringify({feature:selected.id,options:selected.options},null,2);});
 $('apply').addEventListener('click',()=>{try{const config=JSON.parse($('configuration').value);const card=cards.find(c=>c.id===config.feature)||selected;if(!card||!config.options||typeof config.options!=='object')throw new Error('Select a feature and provide options.');if(card.type!=='mask')scene.setOptions(config.options);card.options={...card.options,...config.options};card.maskDirty=true;bound=null;select(card,false);$('configStatus').textContent='Configuration applied.';}catch(error){$('configStatus').textContent=error.message;}});
 if(window.IntersectionObserver){const observer=new IntersectionObserver(entries=>{for(const entry of entries){const card=cards.find(c=>c.article===entry.target);card.visible=entry.isIntersecting;if(entry.isIntersecting)queue(card);}},{rootMargin:'100px'});for(const card of cards)observer.observe(card.article);}else cards.forEach(queue);
 window.addEventListener('resize',()=>{bound=null;for(const card of cards)if(card.visible!==false)queue(card);});document.addEventListener('visibilitychange',()=>{last=0;if(document.hidden){cancelAnimationFrame(frame);frame=0;}else wake();});window.addEventListener('pagehide',event=>{cancelAnimationFrame(frame);frame=0;last=0;if(!event?.persisted){scene.destroy();volume.destroy();}});window.addEventListener('pageshow',()=>{last=0;if(selected)selected.lastDraw=0;if(playing||queued.size)wake();});
 select(cards[0],false);
})();
