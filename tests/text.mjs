import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {CloudText,CloudVolume} from '../src/index.js';
let contexts=0,draws=0,id=0,now=0,gpu=true,lost=false,submitCost=0,software=false;const contextAttributes=[];
const frames=new Map(),uniforms={},textureOps=[];
const gl=new Proxy({}, {get(_,key){
 if(key==='getShaderParameter'||key==='getProgramParameter')return()=>true;
 if(key==='isContextLost')return()=>lost;
 if(key==='getUniformLocation')return(_,name)=>name;
 if(key==='getAttribLocation')return()=>0;
 if(key.startsWith('uniform'))return(name,...values)=>uniforms[name]=values;
 if(key.startsWith('create'))return()=>({id:++id});
 if(key==='drawArrays')return()=>draws++;
 if(key==='deleteTexture'||key==='texSubImage2D')return(...args)=>textureOps.push([key,...args]);
 if(key.toUpperCase()===key)return key;
 return()=>{};
}});
class Style {
 constructor(){this.values=new Map();}
 setProperty(key,value,priority=''){this.values.set(key,{value:String(value),priority});}
 getPropertyValue(key){return this.values.get(key)?.value||'';}getPropertyPriority(key){return this.values.get(key)?.priority||'';}
 removeProperty(key){this.values.delete(key);}get cssText(){return [...this.values].map(([k,v])=>k+':'+v.value+(v.priority?'!important':'')).join(';');}
}
class Element {
 constructor(tag='div',rect={left:20,top:30,width:360,height:100}){this.nodeType=1;this.tagName=tag.toUpperCase();this.rect=rect;this.childNodes=[];this.style=new Style();this.attributes={};this.className='';this.width=300;this.height=150;this.listeners={};this.isConnected=true;this.fontSize='48px';this.classList={add:name=>{if(!this.classList.contains(name))this.className=(this.className+' '+name).trim();},remove:name=>{this.className=this.className.split(/\s+/).filter(n=>n!==name).join(' ');},contains:name=>this.className.split(/\s+/).includes(name)};}
 append(...nodes){for(const node of nodes){node.parentElement=this;node.ownerDocument=this.ownerDocument;this.childNodes.push(node);}}
 replaceChildren(...nodes){for(const node of this.childNodes)node.parentElement=null;this.childNodes=[];this.append(...nodes);}
 contains(node){return node===this||this.childNodes.some(c=>c.nodeType===1&&c.contains(node));}
 closest(selector){for(let node=this;node;node=node.parentElement){if(selector.includes(node.tagName.toLowerCase())&&['A','BUTTON','INPUT','TEXTAREA','SELECT','SCRIPT','STYLE'].includes(node.tagName))return node;if(selector.includes('[aria-hidden')&&node.attributes['aria-hidden']==='true')return node;}return null;}
 setAttribute(key,value){this.attributes[key]=value;}getBoundingClientRect(){const r=this.rect;return {...r,right:r.left+r.width,bottom:r.top+r.height};}
 addEventListener(key,fn){(this.listeners[key]??=[]).push(fn);}remove(){if(this.parentElement)this.parentElement.childNodes=this.parentElement.childNodes.filter(n=>n!==this);this.isConnected=false;}
 getContext(type,attributes){if(type==='webgl2'){contexts++;contextAttributes.push(attributes);return gpu&&!(software&&attributes.failIfMajorPerformanceCaveat)?gl:null;}return this.ctx??=( {calls:[],scale(){},clearRect(){},drawImage(...args){this.calls.push(['image',...args]);now+=submitCost;},fillText(...args){this.calls.push(['text',this.font,...args]);},measureText(){return{fontBoundingBoxAscent:38,fontBoundingBoxDescent:10};},getImageData(x,y,w,h){const data=new Uint8Array(w*h*4);for(let yy=Math.floor(h*.25);yy<h*.65;yy++)for(let xx=Math.floor(w*.2);xx<w*.8;xx++)data[(yy*w+xx)*4+3]=255;return{data};} });}
}
const observers=[];
class Intersection {constructor(callback){this.callback=callback;observers.push(this);}observe(){}unobserve(){}disconnect(){}emit(target,visible){this.callback([{target,isIntersecting:visible}]);}}
const mutations=[];class Mutation {constructor(callback){this.callback=callback;mutations.push(this);}observe(){}disconnect(){this.dead=true;}}
const view={innerWidth:1200,innerHeight:800,scrollY:0,listeners:{},IntersectionObserver:Intersection,MutationObserver:Mutation,
 getComputedStyle:element=>({display:'block',position:element.style.getPropertyValue('position')||'static',visibility:'visible',color:'#ffffff',fontSize:element.fontSize,fontWeight:'700',fontStyle:'italic',fontFamily:'Georgia',direction:'ltr',textTransform:'none'}),matchMedia:()=>({matches:false,addEventListener(){}}),addEventListener(key,fn){(this.listeners[key]??=[]).push(fn);}};
const document={defaultView:view,hidden:false,listeners:{},createElement:tag=>{const e=new Element(tag);e.ownerDocument=document;return e;},createTextNode:nodeValue=>({nodeType:3,nodeValue,parentElement:null,ownerDocument:document}),addEventListener(key,fn){(this.listeners[key]??=[]).push(fn);},createTreeWalker(element){const nodes=[];function walk(e){for(const n of e.childNodes)if(n.nodeType===3)nodes.push(n);else walk(n);}walk(element);let i=0;return{nextNode:()=>nodes[i++]||null};},createRange(){return{setStart(node,index){this.node=node;this.start=index;},setEnd(_,index){this.end=index;},getBoundingClientRect(){const r=this.node.parentElement.getBoundingClientRect();return{left:r.left+this.start*24,right:r.left+this.end*24,top:r.top,bottom:r.top+48,width:(this.end-this.start)*24,height:48};}};}};
document.head=document.createElement('head');
globalThis.document=document;globalThis.requestAnimationFrame=fn=>{const n=++id;frames.set(n,fn);return n;};globalThis.cancelAnimationFrame=n=>frames.delete(n);Object.defineProperty(globalThis,'performance',{value:{now:()=>now},configurable:true});
const pump=t=>{now=t;const callbacks=[...frames.values()];frames.clear();for(const fn of callbacks)fn(t);};
function text(word,top=30){const e=document.createElement('h2');e.rect.top=top;e.append(document.createTextNode(word));return e;}
const first=text('One cloud'),second=text('Another cloud',240),below=text('Below the fold',1500),original=first.childNodes[0];
first.style.setProperty('touch-action','pan-y');
const a=new CloudText([first,below],{formationDuration:.4,idleFps:0}),b=new CloudText(second,{formationDuration:.4,idleFps:0});
assert.throws(()=>new CloudText(first),/already/);assert.throws(()=>a.setOptions({fps:NaN}));assert.throws(()=>a.setOptions({timeOfDay:'invalid'}));assert.throws(()=>a.setOptions({physics:{madeUp:1}}));
for(let t=16;t<1000;t+=16)pump(t);
assert.equal(contextAttributes[0].depth,false);assert.equal(contextAttributes[0].failIfMajorPerformanceCaveat,true);assert.equal(contexts,1,'Separate CloudText instances share a single WebGL context');assert.equal(a.getPerformance().cachedLayers,2,'Offscreen text does not allocate a GPU layer');assert.equal(first.childNodes[0],original,'The semantic text node is retained');assert(first.classList.contains('cloud-kit-text-ready'));assert.equal(first.childNodes[1].attributes['aria-hidden'],'true');assert.equal(frames.size,0,'Idle rate zero stops the animation loop after formation');
const beforeDraws=draws;observers[0].emit(first,false);a.puff(undefined,undefined,1,first);for(let t=1000;t<1100;t+=16)pump(t);assert.equal(draws,beforeDraws,'Offscreen interaction queues without rendering');observers[0].emit(first,true);pump(1120);assert(draws>beforeDraws);
a.setPlayMode(true);assert.equal(first.style.getPropertyValue('touch-action'),'none');a.setPaused(true);assert.equal(first.style.getPropertyValue('touch-action'),'pan-y','Pause restores native scrolling');a.setPaused(false);a.setPlayMode(true);a.setOptions({interactive:false});assert.equal(a.playMode,false);assert.equal(first.style.getPropertyValue('touch-action'),'pan-y');a.setOptions({interactive:true});
const entry=a.entries[0],node=first.childNodes[0];node.nodeValue='New cloud';mutations[0].callback([{type:'characterData',target:node}]);assert(entry.maskDirty);pump(1200);assert.equal(first.childNodes[0],node);
first.replaceChildren(document.createTextNode('Changed with textContent'));mutations[0].callback([{type:'childList',target:first,addedNodes:first.childNodes,removedNodes:[node]}]);pump(1210);assert.equal(first.childNodes[1],entry.canvas,'Direct text replacement reattaches the decorative canvas');
a.setLighting({glare:.7,direction:[1,-.5,.6]});a.setLights([{x:120,y:55,strength:1.2,reach:200,color:'#ff88aa',glow:.8}]);pump(1220);assert.equal(uniforms.uGlare[0],.7);assert.equal(uniforms.uPointPower[0],1.2);assert.equal(uniforms.uElectricGlow[0],.8);assert.throws(()=>a.setLights([{x:NaN,y:0,strength:1}]));a.setLights([]);a.setWind({x:20,y:-30,strength:.5});assert.equal(a.wind.strength,.5);assert.throws(()=>a.setWind({x:0,y:NaN,strength:1}));a.setWind(null);
const nativeCalls=entry.pointer.segments.length;a.setOptions({pointerEvents:false});now=1221;for(const fn of document.listeners.pointermove||[])fn({clientX:80,clientY:60,pointerType:'touch',target:first});assert.equal(entry.pointer.segments.length,nativeCalls,'Host-owned pointer handling skips native delivery');a.handlePointer('pointermove',{clientX:80,clientY:60,pointerType:'touch',target:first});a.handlePointer('pointermove',{clientX:110,clientY:60,pointerType:'touch',target:first});assert(entry.pointer.segments.length>nativeCalls);a.handlePointer('pointercancel',{clientX:110,clientY:60,pointerType:'touch',target:first});a.setOptions({pointerEvents:true});
a.setText('Changed with the API');pump(1230);assert.equal(first.childNodes[0].nodeValue,'Changed with the API');
for(let t=1240;t<1300;t+=16)pump(t);
const pointer=(type,extra={})=>{now+=20;for(const fn of document.listeners[type]||[])fn({clientX:100,clientY:55,pointerType:'touch',pointerId:5,button:0,target:first,preventDefault(){this.prevented=true;},...extra});};
a.entries[0].effects=[];pointer('pointerdown');pointer('pointerup');assert.equal(entry.effects.length,1,'A quick touch queues a soft puff');pointer('pointerdown');pointer('pointermove',{clientX:145});pointer('pointerup',{clientX:145});assert.equal(entry.effects.length,1,'A swipe used for scrolling does not also tap');
observers[0].emit(below,true);pump(1350);assert.equal(a.getPerformance().cachedLayers,3,'Entering the viewport allocates the new layer lazily');
b.destroy();assert.equal(a.getPerformance().rendererCount,1,'Destroying one owner keeps another owner alive');a.destroy();assert.equal(frames.size,0);assert(!first.classList.contains('cloud-kit-text-ready'));assert.equal(first.style.getPropertyValue('position'),'');assert.equal(first.style.getPropertyValue('touch-action'),'pan-y');assert.equal(first.childNodes.length,1,'Destroy removes only the decorative canvas');assert.equal(document.head.childNodes.length,0);assert(mutations.every(m=>m.dead));
// Public shared layers retain independent fields and time, even after gusts.
const volume=new CloudVolume({sharedBuffer:true}),mask=document.createElement('canvas');mask.width=140;mask.height=70;
const l1=volume.createLayer(mask,{scale:32}),l2=volume.createLayer(mask,{scale:32});const pristine=volume.layers.get(l2).state.field.slice();volume.gustLayer(l1,1);volume.renderLayer(l1,.02,false,{active:false,segments:[]},{formation:.5});assert.deepEqual(volume.layers.get(l2).state.field,pristine,'Weathering one layer does not change another');volume.renderLayer(l2,1,false,{active:false,segments:[]},{simulate:false});assert.equal(volume.layers.get(l2).state.time,1,'Idle noise advances without a CPU physics step');const damaged=volume.layers.get(l1).state.field.reduce((sum,v)=>sum+v,0);volume.recoverLayer(l1,8);assert(volume.layers.get(l1).state.field.reduce((sum,v)=>sum+v,0)>damaged,'Offscreen relaxation restores disturbed text without replaying hidden frames');assert.deepEqual(volume.layers.get(l2).state.field,pristine);const scaled=volume.renderLayer(l2,0,true,{active:false},{renderScale:.5});assert.equal(scaled.width,70);assert.equal(scaled.height,35);const full=volume.renderLayer(l2,0,true,{active:false});assert.equal(full.width,140,'Resolution overrides never compound or reset physics');assert.deepEqual(volume.layers.get(l2).state.field,pristine);volume.releaseLayer(l1);assert.throws(()=>volume.renderLayer(l1,0,true,{active:false}),/released/);volume.destroy();assert.equal(volume.layers.size,0);
gpu=false;const native=text('Native fallback');let error;const fallback=new CloudText(native,{onError:e=>error=e});pump(1400);assert(error);assert(!native.classList.contains('cloud-kit-text-ready'));assert.equal(native.childNodes[1].style.getPropertyPriority('display'),'important');assert.equal(frames.size,0);fallback.destroy();
gpu=true;software=true;let softwareError;const beforeSoftware=contexts,cpuFallback=new CloudText(text('CPU-only text stays native'),{onError:e=>softwareError=e}),anotherCpuFallback=new CloudText(text('Another native heading'));pump(1410);pump(1420);assert(softwareError);assert.equal(contexts,beforeSoftware+1,'An unavailable accelerated renderer is probed only once per document');assert.equal(frames.size,0,'CPU-only text has no repeated animation loop');cpuFallback.destroy();anotherCpuFallback.destroy();software=false;
gpu=true;submitCost=50;const slow=new CloudText(text('Adaptive clouds'),{formationDuration:0,idleFps:30,minRenderScale:.6,renderBudgetMs:12});
for(let t=1500;t<11000;t+=100)pump(t);assert.equal(slow.getPerformance().renderScale,.6,'Sustained expensive submission reaches the configured scale floor');
submitCost=1;for(let t=11000;t<28000;t+=100)pump(t);assert.equal(slow.getPerformance().renderScale,1,'Scale recovers when draw submission has headroom');
slow.setOptions({adaptiveQuality:0});assert.equal(slow.getPerformance().renderScale,1);slow.destroy();assert.equal(frames.size,0);
const scope={window:{},document,AbortController,performance:globalThis.performance,requestAnimationFrame:globalThis.requestAnimationFrame,cancelAnimationFrame:globalThis.cancelAnimationFrame};
vm.runInNewContext(readFileSync(new URL('../dist/cloud-kit.js',import.meta.url),'utf8'),scope);
const bundled=new scope.window.CloudKit.CloudText(text('Classic script works'),{formationDuration:0,idleFps:0});pump(28016);assert.equal(bundled.getPerformance().rendererCount,1);assert.equal(bundled.getPerformance().cachedLayers,1);bundled.puff();pump(28050);bundled.destroy();assert.equal(frames.size,0);
console.log('PASS semantic HTML, one shared GPU renderer, lazy visibility, paused/native touch scroll, tap/swipe distinction, dynamic text, isolated layer physics, idle CPU skipping, cleanup, and native fallback.');
