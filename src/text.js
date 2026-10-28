import { CloudVolume } from './volume.js';
import { CloudTimes } from './time.js';
import { CloudControls } from './config.js';

const managers=new WeakMap();
const readyClass='puff-text-ready';
const physicsDefaults=Object.fromEntries(Object.entries(CloudControls.volume).map(([key,c])=>[key,c.default]));
const defaults={injectStyles:true,adaptiveQuality:1,renderBudgetMs:12,minRenderScale:.5,quality:'medium',fps:30,idleFps:8,puffiness:1,trailStrength:1,vaporDensity:1,airStrength:1,formationDuration:1.6,padding:28,maskLimit:2048,interactive:true,pointerEvents:true,reformOnEnter:false,scrollWind:.35,tapStrength:1,stirStrength:1,timeOfDay:'day',lightColor:'#8edaff',lightPower:1,lightReach:180,lightHeight:70,physics:{}};
const ranges=Object.fromEntries(Object.entries(CloudControls.text).map(([key,c])=>[key,[c.min,c.max]]));
const profiles={low:{gridSize:220,raySteps:16,renderWidth:640,renderHeight:480},medium:{gridSize:360,raySteps:24,renderWidth:1000,renderHeight:700},high:{gridSize:520,raySteps:36,renderWidth:1600,renderHeight:1000}};
const clock=()=>globalThis.performance?.now?.()??Date.now();
const rgb=hex=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255);
function settings(previous,patch){
 const next={...previous,physics:{...previous.physics}};
 for(const [key,value]of Object.entries(patch)){
  if(!Object.hasOwn(defaults,key)&&!['cloudColor','shadowStride','onError','onFrame'].includes(key))throw new TypeError('Unknown cloud text option: '+key);
  if(Object.hasOwn(ranges,key)){if(!Number.isFinite(value))throw new TypeError(key+' must be finite.');next[key]=Math.max(ranges[key][0],Math.min(ranges[key][1],value));}
  else if(key==='physics'){for(const [name,n]of Object.entries(value)){const c=Object.hasOwn(CloudControls.volume,name)?CloudControls.volume[name]:null;if(!c||!Number.isFinite(n))throw new TypeError('Invalid cloud physics: '+name);next.physics[name]=Math.max(c.min,Math.min(c.max,n));}}
  else if(key==='quality'){if(!Object.hasOwn(profiles,value))throw new RangeError('Unknown text quality.');next[key]=value;}
  else if(key==='timeOfDay'){if(!Object.hasOwn(CloudTimes,value))throw new RangeError('Unknown time palette.');next[key]=value;}
  else if(key==='lightColor'||key==='cloudColor'){if(typeof value!=='string'||!/^#[\da-f]{6}$/i.test(value))throw new TypeError(key+' must be a hex color.');next[key]=value;}
  else if(key==='shadowStride'){if(!Number.isFinite(value))throw new TypeError('shadowStride must be finite.');next[key]=Math.max(1,Math.min(8,Math.round(value)));}
  else if(key==='onError'||key==='onFrame'){if(value!=null&&typeof value!=='function')throw new TypeError(key+' must be a function.');next[key]=value;}
  else{if(typeof value!=='boolean')throw new TypeError(key+' must be boolean.');next[key]=value;}
 }
 return next;
}
function rootClass(element){return element.className.split(/\s+/).filter(name=>name!==readyClass).join(' ');}
function saveStyle(element,key){return{key,value:element.style.getPropertyValue(key),priority:element.style.getPropertyPriority(key)};}
function restoreStyle(element,saved){if(saved.value)element.style.setProperty(saved.key,saved.value,saved.priority);else element.style.removeProperty(saved.key);}
function resetPointer(entry){
 const p=entry.pointer;if(p.active)entry.dirty=true;
 if(p.id!==undefined&&entry.element.hasPointerCapture?.(p.id))entry.element.releasePointerCapture(p.id);
 p.active=p.down=false;p.segments=[];p.vx=p.vy=p.at=0;
}
function queueEffect(owner,kind,x,y,strength,target){
 if(owner.destroyed)throw new Error('CloudText was destroyed.');
 if(x!==undefined&&!Number.isFinite(x)||y!==undefined&&!Number.isFinite(y)||!Number.isFinite(strength))throw new TypeError('Effect coordinates and strength must be finite.');
 for(const e of owner.entries){
  if(target&&e.element!==target)continue;
  const r=e.element.getBoundingClientRect();
  e.effects.push({kind,x:x??r.width/2,y:y??r.height/2,strength:Math.max(0,Math.min(2,strength))});
  if(e.effects.length>8)e.effects.shift();e.simulating=true;e.dirty=true;
 }
 owner.manager.wake();return owner;
}
function font(style){return `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;}
function paintMask(entry){
 const {element,owner}=entry,doc=element.ownerDocument,view=doc.defaultView,rect=element.getBoundingClientRect(),pad=owner.options.padding;
 if(rect.width<1||rect.height<1)return null;
 const width=rect.width+pad*2,height=rect.height+pad*2,scale=Math.min(1,owner.options.maskLimit/Math.max(width,height));
 const canvas=doc.createElement('canvas');canvas.width=Math.max(1,Math.ceil(width*scale));canvas.height=Math.max(1,Math.ceil(height*scale));
 const ctx=canvas.getContext('2d');if(!ctx)throw new Error('Canvas2D unavailable.');ctx.scale(scale,scale);ctx.fillStyle='#fff';ctx.textBaseline='alphabetic';
 const walker=doc.createTreeWalker(element,4),segmenter=globalThis.Intl?.Segmenter?new Intl.Segmenter(undefined,{granularity:'grapheme'}):null;let node,maxFont=0,hasGlyph=false;
 while((node=walker.nextNode())){
  if(node.parentElement===entry.canvas||node.parentElement.closest('script,style,[aria-hidden="true"]'))continue;
  const style=view.getComputedStyle(node.parentElement);if(style.display==='none'||style.visibility==='hidden')continue;
  const size=parseFloat(style.fontSize)||16;maxFont=Math.max(maxFont,size);ctx.font=font(style);ctx.direction=style.direction;
  const metrics=ctx.measureText('Mg'),ascent=metrics.fontBoundingBoxAscent??size*.8,descent=metrics.fontBoundingBoxDescent??size*.2,range=doc.createRange();
  let offset=0;
  const segments=segmenter?segmenter.segment(node.nodeValue):Array.from(node.nodeValue,segment=>{const index=offset;offset+=segment.length;return {segment,index};});
  for(const {segment,index}of segments){
   if(!/\S/.test(segment))continue;
   range.setStart(node,index);range.setEnd(node,index+segment.length);const r=range.getBoundingClientRect();if(!r.width||!r.height)continue;
   const text=style.textTransform==='uppercase'?segment.toLocaleUpperCase():style.textTransform==='lowercase'?segment.toLocaleLowerCase():style.textTransform==='capitalize'&&(index===0||/\s/.test(node.nodeValue[index-1]))?segment.toLocaleUpperCase():segment;
   const y=r.top-rect.top+pad+(r.height-ascent-descent)/2+ascent;
   ctx.textAlign=style.direction==='rtl'?'right':'left';ctx.fillText(text,(style.direction==='rtl'?r.right:r.left)-rect.left+pad,y);hasGlyph=true;
  }
 }
 if(!hasGlyph)return null;
 entry.rect=rect;entry.pad=pad;entry.scale=scale;entry.displayWidth=width;entry.displayHeight=height;entry.fontSize=maxFont||16;return canvas;
}
class TextManager{
 constructor(doc){
  this.doc=doc;this.view=doc.defaultView;this.entries=new Set();this.owners=new Set();this.byElement=new WeakMap();this.frame=0;this.cursor=0;this.draws=0;this.lastCpuMs=0;this.lastScroll=this.view.scrollY;this.scrollAt=0;this.scrollSpeed=0;this.events=new AbortController();
  this.motion=this.view.matchMedia?.('(prefers-reduced-motion: reduce)');
  this.reducedMotion=Boolean(this.motion?.matches);
  this.style=null;
  const listen=(target,type,fn)=>target?.addEventListener?.(type,fn,{signal:this.events.signal,passive:type!=='pointerdown'});
  for(const type of ['pointermove','pointerdown','pointerup','pointercancel'])listen(doc,type,e=>this.pointer(type,e));
  listen(this.view,'scroll',()=>{const now=clock();this.scrollSpeed=Math.max(-1800,Math.min(1800,(this.view.scrollY-this.lastScroll)/Math.max(.016,(now-this.scrollAt)/1000)));this.lastScroll=this.view.scrollY;this.scrollAt=now;for(const e of this.entries){resetPointer(e);if(!this.observer)this.setVisibility(e,this.inView(e));}this.wake();});
  listen(this.view,'blur',()=>{for(const e of this.entries)resetPointer(e);this.wake();});
  listen(doc,'visibilitychange',()=>{if(doc.hidden){cancelAnimationFrame(this.frame);this.frame=0;for(const e of this.entries)resetPointer(e);}else{for(const e of this.entries)e.lastDraw=0;this.wake();}});
  listen(this.motion,'change',event=>{this.reducedMotion=event.matches;if(this.reducedMotion)for(const owner of this.owners)owner.setPlayMode(false);for(const e of this.entries){resetPointer(e);e.dirty=true;e.lastDraw=0;}this.wake();});
  listen(doc.fonts,'loadingdone',()=>this.refresh());doc.fonts?.ready?.then(()=>{if(this.owners.size)this.refresh();});
  listen(this.view,'resize',()=>this.refresh());
  if(this.view.IntersectionObserver)this.observer=new this.view.IntersectionObserver(events=>{for(const event of events){const e=this.byElement.get(event.target);if(e)this.setVisibility(e,event.isIntersecting);}this.wake();},{rootMargin:'60px'});
 }
 ensureStyle(){
  if(this.style)return;
  this.style=this.doc.createElement('style');this.style.textContent=`.${readyClass},.${readyClass} *{color:transparent!important;-webkit-text-fill-color:transparent!important;text-shadow:none!important}.${readyClass}::selection,.${readyClass} *::selection{color:var(--puff-original-color,#fff)!important;-webkit-text-fill-color:var(--puff-original-color,#fff)!important}.puff-text-canvas{position:absolute!important;pointer-events:none!important;user-select:none!important;display:block!important;max-width:none!important;max-height:none!important}`;this.doc.head.append(this.style);
 }
 setVisibility(entry,visible){
  if(entry.visible===visible)return;
  if(!visible){entry.hiddenAt=clock();resetPointer(entry);}
  else{
   if(entry.layer&&entry.hiddenAt!==undefined)entry.hiddenElapsed=Math.max(0,(clock()-entry.hiddenAt)/1000);
   if(entry.lastDraw&&entry.owner.options.reformOnEnter)entry.formation=0;
   entry.lastDraw=0;entry.dirty=true;
  }
  entry.visible=visible;
 }
 inView(entry){const r=entry.element.getBoundingClientRect();return r.width>0&&r.height>0&&r.bottom>-60&&r.top<this.view.innerHeight+60&&r.right>0&&r.left<this.view.innerWidth;}
 refresh(){for(const entry of this.entries){entry.maskDirty=true;this.setVisibility(entry,this.inView(entry));}this.wake();}
 wake(){if(this.owners.size&&!this.frame&&!this.doc.hidden)this.frame=requestAnimationFrame(now=>this.tick(now));}
 pointer(type,event,owner=null){
  const now=clock(),touch=event.pointerType==='touch'||event.pointerType==='pen';
  for(const e of this.entries){
   const o=e.owner.options,p=e.pointer;
   if(owner&&e.owner!==owner||!owner&&!o.pointerEvents||!o.interactive||e.owner.paused||this.reducedMotion||!e.visible)continue;
   if(p.down&&event.pointerId!==p.id||event.isPrimary===false)continue;
   if(type==='pointercancel'){resetPointer(e);e.inputDirty=true;this.wake();continue;}
   if(type==='pointerup'&&!p.down)continue;
   if(!Number.isFinite(event.clientX)||!Number.isFinite(event.clientY))continue;
   if(!owner&&touch&&type==='pointermove'&&!p.down)continue;
   const rect=e.element.getBoundingClientRect(),s=e.scale||1;
   const cssX=event.clientX-rect.left+e.pad,cssY=event.clientY-rect.top+e.pad,x=cssX*s,y=cssY*s;
   const inside=cssX>=0&&cssY>=0&&cssX<=rect.width+e.pad*2&&cssY<=rect.height+e.pad*2;
   const blocked=event.target?.closest?.(owner?'input,textarea,select,[contenteditable="true"]':'a,button,input,textarea,select,[contenteditable="true"]');
   if(type!=='pointerup'&&!inside&&!p.active&&!p.down)continue;
   if(blocked&&type!=='pointerup'){resetPointer(e);this.wake();continue;}
   if(type==='pointerdown'){
    if(!inside||event.button>0)continue;
    p.id=event.pointerId;p.down=true;p.downAt=now;p.startX=x;p.startY=y;p.moved=false;
    if(touch&&e.owner.playMode){event.preventDefault?.();e.element.setPointerCapture?.(event.pointerId);}
   }
   if(p.down&&Math.hypot(x-p.startX,y-p.startY)>9*s)p.moved=true;
   const sweep=Boolean(owner)||!touch||e.owner.playMode;
   if(sweep&&p.active&&type!=='pointerdown'&&(x!==p.x||y!==p.y)){
    const dt=Math.max(.008,(now-p.at)/1000);
    p.segments.push({ax:p.x,ay:p.y,bx:x,by:y,down:p.down});if(p.segments.length>64)p.segments.shift();
    p.vx=(x-p.x)/dt;p.vy=(y-p.y)/dt;e.simulating=true;
   }
   if(type==='pointerup'){
    if(!owner&&touch&&inside&&!blocked&&!p.moved&&now-p.downAt<350)e.owner.puff(cssX-e.pad,cssY-e.pad,undefined,e.element);
    p.down=false;
   }
   p.x=x;p.y=y;p.at=now;p.active=sweep&&inside&&!(touch&&type==='pointerup');e.inputDirty=true;this.wake();
  }
 }
 ensureVolume(){if(this.volumeError)throw this.volumeError;if(!this.volume)try{this.volume=new CloudVolume({sharedBuffer:true,failIfMajorPerformanceCaveat:true,powerPreference:'low-power',onReady:()=>this.wake(),onError:error=>{this.volumeError=error;for(const owner of this.owners)owner.fail(error);},onContextLost:()=>{for(const owner of this.owners)owner.setPlayMode(false);for(const e of this.entries){resetPointer(e);e.layer=null;e.maskDirty=true;e.element.classList.remove(readyClass);e.canvas.getContext('2d')?.clearRect(0,0,e.canvas.width,e.canvas.height);}},onContextRestored:()=>{for(const owner of this.owners)if(owner.contextError){owner.error=null;owner.contextError=false;owner.paused=owner.userPaused||false;for(const e of owner.entries){e.canvas.style.removeProperty('display');e.maskDirty=e.dirty=true;}}for(const e of this.entries){e.layer=null;e.maskDirty=e.dirty=true;e.lastDraw=0;}this.wake();}});this.generation=this.volume.generation;}catch(error){this.volumeError=error;throw error;}if(this.volume.generation!==this.generation){this.generation=this.volume.generation;for(const e of this.entries){e.layer=null;e.maskDirty=e.dirty=true;}}return this.volume;}
 evict(){const cached=[...this.entries].filter(e=>e.layer);if(cached.length<32)return;const oldest=cached.filter(e=>!e.visible).sort((a,b)=>a.lastDraw-b.lastDraw)[0];if(oldest){this.volume.releaseLayer(oldest.layer);oldest.layer=null;oldest.maskDirty=true;}}
 tick(now){
  this.frame=0;if(this.doc.hidden)return;
  const list=[...this.entries];let chosen=null;
  try{
  for(let i=0;i<list.length;i++){
   const index=(this.cursor+i)%list.length,e=list[index],o=e.owner.options;
   if(e.owner.error||e.owner.destroyed||!e.visible||!e.element.isConnected)continue;
   const resting=e.owner.paused||this.reducedMotion;
   const moving=Boolean(e.owner.wind?.strength)||e.simulating||e.inputDirty||e.formation<1||e.pointer.down&&e.owner.playMode||now-this.scrollAt<160&&o.scrollWind>0;
   const rate=moving?o.fps:o.idleFps;
   if(e.maskDirty||e.dirty||e.inputDirty&&(resting||!e.lastDraw||now-e.lastDraw>=1000/o.fps)||!resting&&rate>0&&now-e.lastDraw>=1000/rate){chosen=e;this.cursor=index+1;break;}
  }
  if(chosen){const started=clock(),building=chosen.maskDirty,compiling=Boolean(this.volume?.compileJob);try{this.draw(chosen,now);}catch(error){chosen.owner.fail(error,Boolean(this.volume?.gl.isContextLost()));}this.lastCpuMs=clock()-started;
   if(!building&&!compiling&&!this.volume?.compileJob&&!chosen.owner.error){
    const o=chosen.owner.options;chosen.cpuAverage=chosen.cpuAverage===undefined?this.lastCpuMs:chosen.cpuAverage*.8+this.lastCpuMs*.2;chosen.samples++;
    if(o.adaptiveQuality&&chosen.samples>=4&&chosen.samples-chosen.adjustAt>=8){
     let scale=chosen.renderScale;
     if(chosen.cpuAverage>o.renderBudgetMs*1.15)scale*=.8;else if(chosen.cpuAverage<o.renderBudgetMs*.6)scale+=.05;
     scale=Math.max(o.minRenderScale,Math.min(1,scale));
     if(Math.abs(scale-chosen.renderScale)>.01){chosen.renderScale=scale;chosen.adjustAt=chosen.samples;}
    }
   }
  }
  }finally{
   if(!this.volume?.compileJob&&list.some(e=>!e.owner.error&&!e.owner.destroyed&&e.visible&&e.element.isConnected&&(e.maskDirty||e.dirty||e.inputDirty||!e.owner.paused&&!this.reducedMotion&&(e.owner.options.idleFps>0||e.owner.wind?.strength>0||e.simulating||e.formation<1||e.pointer.down&&e.owner.playMode||now-this.scrollAt<160&&e.owner.options.scrollWind>0))))this.wake();
  }
 }
 draw(e,now){
  const o=e.owner.options;let mask;
  if(e.canvas.parentElement!==e.element)e.element.append(e.canvas);
  if(e.maskDirty){
   resetPointer(e);mask=paintMask(e);
   if(!mask){
    if(e.layer){this.volume?.releaseLayer(e.layer);e.layer=null;}
    e.canvas.getContext('2d')?.clearRect(0,0,e.canvas.width,e.canvas.height);e.element.classList.remove(readyClass);
    e.maskDirty=e.dirty=e.inputDirty=e.visible=e.simulating=false;e.effects=[];e.gustPending=e.hiddenElapsed=0;return;
   }
  }
  const volume=this.ensureVolume();
  if(!volume.program&&!volume.gl.isContextLost())return;
  if(mask){
   if(e.layer){volume.releaseLayer(e.layer);e.layer=null;}
   this.evict();e.layer=volume.createLayer(mask,{...profiles[o.quality],scale:e.fontSize*e.scale,puffiness:o.puffiness,shadowStride:o.shadowStride??3,minCell:1.2,minRadius:2,radiusFactor:.075});
   const resolution=Math.min(1,profiles[o.quality].renderWidth/mask.width,profiles[o.quality].renderHeight/mask.height);
   e.canvas.width=Math.max(1,Math.round(mask.width*resolution));e.canvas.height=Math.max(1,Math.round(mask.height*resolution));
   Object.assign(e.canvas.style,{left:`${-e.pad}px`,top:`${-e.pad}px`,width:`${e.displayWidth}px`,height:`${e.displayHeight}px`});e.maskDirty=false;e.hiddenElapsed=0;
  }
  const resting=e.owner.paused||this.reducedMotion,dt=e.lastDraw?(now-e.lastDraw)/1000:1/o.fps;
  if(!resting)e.formation=o.formationDuration===0?1:Math.min(1,e.formation+(e.lastDraw?(now-e.lastDraw)/1000:dt)/o.formationDuration);else e.formation=1;
  const time=CloudTimes[o.timeOfDay],p=e.pointer;
  volume.lighting={...time,...e.owner.lighting,lit:o.cloudColor?rgb(o.cloudColor):e.owner.lighting?.lit??time.lit};volume.pointLight=p.active&&o.lightPower>0?{x:p.x,y:p.y,power:o.lightPower,height:o.lightHeight*e.scale,reach:o.lightReach*e.scale,color:rgb(o.lightColor)}:null;
  let strongest=null,weight=0;
  const rect=e.owner.lights.length?e.element.getBoundingClientRect():null;
  for(const light of e.owner.lights){
   const reach=light.reach??(light.radius??1)*this.view.innerHeight/4;
   const distance=Math.hypot(Math.max(rect.left-light.x,0,light.x-rect.right),Math.max(rect.top-light.y,0,light.y-rect.bottom));
   const score=light.strength*Math.max(0,1-distance/reach);
   if(score>weight){weight=score;strongest={x:(light.x-rect.left+e.pad)*e.scale,y:(light.y-rect.top+e.pad)*e.scale,height:(light.height??o.lightHeight)*e.scale,power:light.strength,reach:reach*e.scale,color:Array.isArray(light.color)?light.color:rgb(light.color||o.lightColor),glow:light.glow??0};}
  }
  if(strongest)volume.pointLight=strongest;
  e.hadExternalLamp=Boolean(strongest);
  volume.configure({...physicsDefaults,...o.physics});volume.trailStrength=o.trailStrength;volume.vaporDensity=o.vaporDensity;volume.airStrength=o.airStrength;
  if(e.hiddenElapsed){
   if(!resting){volume.recoverLayer(e.layer,e.hiddenElapsed);if(!o.reformOnEnter)e.formation=o.formationDuration?Math.min(1,e.formation+e.hiddenElapsed/o.formationDuration):1;}
   e.hiddenElapsed=0;
  }
  const wind=now-this.scrollAt<160?this.scrollSpeed*o.scrollWind:0,breeze=e.owner.wind||{x:wind*.035,y:-wind*.055,strength:Math.min(2,Math.abs(wind)/1000)};
  volume.environmentWind={...breeze,x:breeze.x*e.scale,y:breeze.y*e.scale};
  const effects=e.effects.splice(0);
  for(const effect of effects){effect.x=(effect.x+e.pad)*e.scale;effect.y=(effect.y+e.pad)*e.scale;}
  if(p.down&&e.owner.playMode&&!p.moved&&now-p.downAt>420)effects.push({kind:'stir',x:p.x,y:p.y,strength:o.stirStrength});
  if(e.gustPending){volume.gustLayer(e.layer,e.gustPending);e.gustPending=0;}
  const result=volume.renderLayer(e.layer,resting?0:dt,resting,{...p,effects},{formation:e.formation,simulate:e.simulating||effects.length>0||Math.abs(wind)>.01||Boolean(e.owner.wind?.strength),renderScale:e.renderScale});
  if(!result.rendered)throw new Error('Cloud GPU context is unavailable.');
  const ctx=e.canvas.getContext('2d');ctx.clearRect(0,0,e.canvas.width,e.canvas.height);ctx.drawImage(result.canvas,result.x,result.y,result.width,result.height,0,0,e.canvas.width,e.canvas.height);
  e.element.classList.add(readyClass);e.dirty=e.inputDirty=false;e.lastDraw=now;e.simulating=!result.settled;p.segments=[];p.vx=p.vy=0;
  this.draws++;o.onFrame?.({element:e.element,formation:e.formation,draws:this.draws});
 }
 remove(owner){
  for(const e of owner.entries){resetPointer(e);e.observer?.disconnect();e.resizeObserver?.disconnect();this.observer?.unobserve(e.element);if(e.layer)this.volume?.releaseLayer(e.layer);e.canvas.remove();e.element.classList.remove(readyClass);for(const saved of e.savedStyles)if(e.ownedStyles.get(saved.key)===e.element.style.getPropertyValue(saved.key)&&!e.element.style.getPropertyPriority(saved.key))restoreStyle(e.element,saved);if(e.playStyle&&e.element.style.getPropertyValue('touch-action')==='none'&&!e.element.style.getPropertyPriority('touch-action'))restoreStyle(e.element,e.playStyle);this.entries.delete(e);this.byElement.delete(e.element);}
  this.owners.delete(owner);
  if(!this.owners.size){cancelAnimationFrame(this.frame);this.frame=0;this.events.abort();this.observer?.disconnect();this.volume?.destroy();this.style?.remove();managers.delete(this.doc);}
 }
}
/** Attach cloud lettering to semantic HTML; all instances in a document share one renderer. */
export class CloudText{
 constructor(target,options={}){
  this.options=settings(defaults,options);this.entries=[];this.paused=false;this.userPaused=false;this.playMode=false;this.destroyed=false;this.error=null;this.contextError=false;this.lights=[];this.lighting=null;this.wind=null;
  const elements=typeof target==='string'?Array.from(document.querySelectorAll(target)):target?.nodeType===1?[target]:Array.from(target||[]);
  if(!elements.length)throw new TypeError('CloudText needs at least one HTML element.');
  const doc=elements[0].ownerDocument;
  if(elements.some(e=>e.nodeType!==1||e.ownerDocument!==doc||!['block','inline-block','flex','grid','flow-root','list-item','none'].includes(doc.defaultView.getComputedStyle(e).display)))throw new TypeError('CloudText targets must be block or inline-block HTML elements in one document.');
  if(elements.some(e=>e.getRootNode?.()?.host))throw new TypeError('CloudText currently supports light DOM; Shadow DOM requires its own adapter.');
  const existing=managers.get(doc);
  if(new Set(elements).size!==elements.length||elements.some(e=>existing?.byElement.has(e)))throw new Error('An element already has cloud text.');
  if(elements.some(e=>elements.some(other=>other!==e&&other.contains(e)))||elements.some(e=>[...(existing?.entries||[])].some(other=>other.element.contains(e)||e.contains(other.element))))throw new Error('Cloud text targets must not overlap.');
  this.manager=existing||new TextManager(doc);managers.set(doc,this.manager);
  if(this.options.injectStyles)this.manager.ensureStyle();
  this.manager.owners.add(this);
  for(const element of elements){
   const view=doc.defaultView,canvas=doc.createElement('canvas');canvas.className='puff-text-canvas';canvas.setAttribute('aria-hidden','true');canvas.setAttribute('role','presentation');
   const savedStyles=['position','touch-action','--puff-original-color'].map(key=>saveStyle(element,key));
   const computed=view.getComputedStyle(element),ownedStyles=new Map();if(computed.position==='static'){element.style.setProperty('position','relative');ownedStyles.set('position','relative');}element.style.setProperty('--puff-original-color',computed.color);ownedStyles.set('--puff-original-color',computed.color);
   element.append(canvas);
   const entry={element,canvas,owner:this,savedStyles,ownedStyles,pad:this.options.padding,visible:true,renderScale:1,samples:0,adjustAt:0,maskDirty:true,dirty:true,inputDirty:false,formation:0,lastDraw:0,simulating:false,effects:[],pointer:{active:false,down:false,x:0,y:0,vx:0,vy:0,at:0,segments:[]},lastClass:rootClass(element),lastStyle:element.style.cssText};
   entry.visible=this.manager.inView(entry);this.entries.push(entry);this.manager.entries.add(entry);this.manager.byElement.set(element,entry);this.manager.observer?.observe(element);
   if(view.ResizeObserver){entry.resizeObserver=new view.ResizeObserver(()=>{entry.maskDirty=true;this.manager.setVisibility(entry,this.manager.inView(entry));this.manager.wake();});entry.resizeObserver.observe(element);}
   if(view.MutationObserver){entry.observer=new view.MutationObserver(records=>{if(records.some(r=>r.target!==canvas&&(r.type==='characterData'||r.type==='childList'&&[...r.addedNodes,...r.removedNodes].some(n=>n!==canvas)||r.type==='attributes'&&(r.target!==element||r.attributeName==='class'&&rootClass(element)!==entry.lastClass||r.attributeName==='style'&&element.style.cssText!==entry.lastStyle)))){entry.lastClass=rootClass(element);entry.lastStyle=element.style.cssText;entry.maskDirty=true;this.manager.setVisibility(entry,this.manager.inView(entry));this.manager.wake();}});entry.observer.observe(element,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['class','style']});}
  }
  this.manager.wake();
 }
 fail(error,fromContextLoss=false){this.error=error;this.contextError=fromContextLoss;this.setPlayMode(false);for(const entry of this.entries){resetPointer(entry);entry.effects=[];entry.gustPending=0;if(entry.layer){this.manager.volume?.releaseLayer(entry.layer);entry.layer=null;}entry.element.classList.remove(readyClass);entry.canvas.style.setProperty('display','none','important');entry.maskDirty=entry.dirty=false;}this.paused=true;this.options.onError?.(error);}
 handlePointer(type,event){if(!['pointerdown','pointermove','pointerup','pointercancel'].includes(type))throw new RangeError('Unknown pointer event.');if(!this.destroyed)this.manager.pointer(type,event,this);return this;}
 setLighting(value){
  for(const key of ['lit','shade','direction','glareTint'])if(key in value&&(!Array.isArray(value[key])||value[key].length!==3||!Array.from(value[key]).every(Number.isFinite)))throw new TypeError('Invalid lighting vector: '+key);
  if('glare' in value&&!Number.isFinite(value.glare))throw new TypeError('Glare must be finite.');
  this.lighting=Object.fromEntries(['lit','shade','direction','glareTint','glare'].filter(k=>k in value).map(k=>[k,Array.isArray(value[k])?value[k].slice():value[k]]));for(const e of this.entries)e.dirty=true;this.manager.wake();return this;
 }
 setWind(value){
  if(value!=null&&(!['x','y','strength'].every(k=>Number.isFinite(value[k]))||value.strength<0||value.strength>2))throw new TypeError('Wind requires finite x/y velocity and strength between 0 and 2.');
  const next=value?{x:value.x,y:value.y,strength:value.strength}:null;if(JSON.stringify(next)===JSON.stringify(this.wind))return this;this.wind=next;
  for(const e of this.entries)if(e.visible){e.simulating=true;e.dirty=true;}this.manager.wake();return this;
 }
 setLights(lights=[]){
  if(!Array.isArray(lights)||Array.from(lights).some(l=>!l||!['x','y','strength'].every(k=>Number.isFinite(l[k]))||l.strength<0||['height','reach','radius','glow'].some(k=>k in l&&(!Number.isFinite(l[k])||l[k]<0))||l.color!=null&&!(Array.isArray(l.color)&&l.color.length===3&&Array.from(l.color).every(Number.isFinite)||typeof l.color==='string'&&/^#[\da-f]{6}$/i.test(l.color))))throw new TypeError('Invalid cloud text light.');
  const next=lights.slice(0,4).map(l=>({...l,...(Array.isArray(l.color)?{color:l.color.slice()}: {})}));if(JSON.stringify(next)===JSON.stringify(this.lights))return this;this.lights=next;
  for(const e of this.entries){if(!e.visible)continue;const r=e.element.getBoundingClientRect();if(e.hadExternalLamp||next.some(l=>Math.hypot(Math.max(r.left-l.x,0,l.x-r.right),Math.max(r.top-l.y,0,l.y-r.bottom))<=(l.reach??(l.radius??1)*this.manager.view.innerHeight/4)))e.dirty=true;}
  this.manager.wake();return this;
 }
 stir(x,y,strength=this.options.stirStrength,target){return queueEffect(this,'stir',x,y,strength,target);}
 setOptions(patch){
  if(this.destroyed)throw new Error('CloudText was destroyed.');
  if('injectStyles' in patch&&patch.injectStyles!==this.options.injectStyles)throw new TypeError('Changing injectStyles requires a new CloudText.');
  const next=settings(this.options,patch),rebuild=['puffiness','padding','maskLimit','quality','shadowStride'].some(key=>next[key]!==this.options[key]),inputChanged=next.pointerEvents!==this.options.pointerEvents||next.interactive!==this.options.interactive;
  this.options=next;if(!next.interactive)this.setPlayMode(false);
  for(const e of this.entries){if(inputChanged)resetPointer(e);if(rebuild)e.maskDirty=true;if(!next.adaptiveQuality)e.renderScale=1;e.renderScale=Math.max(next.minRenderScale,e.renderScale);e.dirty=true;}
  this.manager.wake();return this;
 }
 getOptions(){return JSON.parse(JSON.stringify(this.options));}
 refresh(){if(this.destroyed)return this;for(const e of this.entries){e.maskDirty=true;this.manager.setVisibility(e,this.manager.inView(e));}this.manager.wake();return this;}
 setText(text,index=0){const e=this.entries[index];if(!e)throw new RangeError('Unknown cloud text element.');e.element.replaceChildren(e.element.ownerDocument.createTextNode(String(text)),e.canvas);e.maskDirty=true;this.manager.setVisibility(e,this.manager.inView(e));this.manager.wake();return this;}
 puff(x,y,strength=this.options.tapStrength,target){return queueEffect(this,'puff',x,y,strength,target);}
 gust(strength=1){if(!Number.isFinite(strength))throw new TypeError('Gust strength must be finite.');for(const e of this.entries){e.gustPending=Math.max(0,Math.min(2,strength));e.simulating=true;e.dirty=true;}this.manager.wake();return this;}
 setPlayMode(value){
  const next=Boolean(value)&&!this.paused&&this.options.interactive&&!this.manager.reducedMotion&&!this.error&&!this.destroyed;
  if(next===this.playMode)return this;
  for(const e of this.entries){
   if(next&&!this.playMode){e.playStyle=saveStyle(e.element,'touch-action');e.element.style.setProperty('touch-action','none');}
   else if(!next&&this.playMode){if(e.element.style.getPropertyValue('touch-action')==='none'&&!e.element.style.getPropertyPriority('touch-action'))restoreStyle(e.element,e.playStyle);e.playStyle=null;}
   e.lastStyle=e.element.style.cssText;resetPointer(e);
  }
  this.playMode=next;if(!this.error&&!this.destroyed&&this.entries.some(e=>e.dirty))this.manager.wake();return this;
 }
 setPaused(value){if(this.destroyed||this.error)return this;const next=Boolean(value);this.userPaused=next;if(next===this.paused)return this;this.paused=next;if(this.paused)this.setPlayMode(false);for(const e of this.entries){resetPointer(e);e.dirty=true;e.lastDraw=0;e.effects=[];e.gustPending=0;}this.manager.wake();return this;}
 getPerformance(){return {rendererCount:this.manager.volume&&!this.manager.volume.destroyed?1:0,elements:this.entries.length,visibleElements:this.entries.filter(e=>e.visible).length,renderScale:Math.min(1,...this.entries.map(e=>e.renderScale)),cachedLayers:[...this.manager.entries].filter(e=>e.layer).length,draws:this.manager.draws,cpuSubmitMs:this.manager.lastCpuMs,error:this.error?.message??null};}
 destroy(){if(this.destroyed)return;this.destroyed=true;this.setPlayMode(false);this.manager.remove(this);this.entries=[];}
}
