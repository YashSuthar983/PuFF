import assert from 'node:assert/strict';
import {CloudScene} from '../src/index.js';
let serial=0,available=true,disjoint=false,gpuMs=40,pending=0,reads=0,deleted=0,disjointReads=0;
const ext={TIME_ELAPSED_EXT:123,GPU_DISJOINT_EXT:456};
const gl=new Proxy({}, {get(_,key){
 if(key==='getExtension')return()=>ext;
 if(key==='getParameter')return name=>{if(name===456){disjointReads++;return disjoint;}return 8192;};
 if(key==='getShaderParameter'||key==='getProgramParameter')return()=>true;
 if(key==='isContextLost')return()=>false;
 if(key==='getUniformLocation')return(_,name)=>name;
 if(key==='scissor')return(_x,y,_width,height)=>assert(y>=0&&height>=0,'Rendering bands must have nonnegative bounds');
 if(key==='createQuery')return()=>{pending++;return{id:++serial};};
 if(key==='deleteQuery')return()=>{pending--;deleted++;};
 if(key==='getQueryParameter')return(_,name)=>{if(name==='QUERY_RESULT_AVAILABLE')return available;assert(available,'Never read a pending query');reads++;return gpuMs*1e6;};
 if(key.startsWith('create'))return()=>({});
 if(key.toUpperCase()===key)return key;
 return()=>{};
}});
const canvas={width:1,height:1,getContext:()=>gl,getBoundingClientRect:()=>({width:1000,height:600}),addEventListener(){}};
globalThis.requestAnimationFrame=()=>1;globalThis.cancelAnimationFrame=()=>{};
const scene=new CloudScene(canvas,{autoStart:false,interactive:false,quality:'medium'});
const buffers=scene.lightBuffers;
for(let i=0;i<70;i++)scene.render(i/24,1/24);
assert.equal(scene.getOptions().resolutionScale,1,'Automatic adaptation preserves authored settings');
assert.equal(scene.getPerformance().renderScale,.5,'Sustained expensive GPU work reaches the configured floor');
assert.equal(canvas.width,500);assert.equal(canvas.height,300);assert.equal(scene.lightBuffers,buffers,'Lighting upload buffers are reused');
scene.setSources([{x:500,y:300,strength:1}]);scene.render();assert.equal(buffers.positions[3],6);scene.setSources([]);scene.render();assert.equal(buffers.positions[3],0,'Removed lights do not leave stale uniform data');
gpuMs=2;for(let i=0;i<150;i++)scene.render(i/24,1/24);assert.equal(scene.getPerformance().renderScale,1,'Resolution gradually recovers when the GPU has headroom');
available=false;const readCount=reads;for(let i=0;i<40;i++)scene.render();assert.equal(reads,readCount);assert.equal(pending,3,'Query backlog stays bounded without waiting');
disjoint=true;scene.render();assert.equal(reads,readCount,'Disjoint results are discarded');assert.equal(pending,1);
scene.setOptions({adaptiveQuality:0});assert.equal(scene.getPerformance().renderScale,1);assert.equal(canvas.width,1000);
scene.render();const emptyPolls=disjointReads;for(let i=0;i<12;i++)scene.render();assert.equal(disjointReads,emptyPolls,'An empty timing queue makes no driver queries');
scene.destroy();assert.equal(pending,0);assert(deleted>0);
const noTimer=new Proxy(gl,{get(target,key){if(key==='getExtension')return()=>null;return target[key];}});
const fallback=new CloudScene({...canvas,getContext:()=>noTimer},{autoStart:false});fallback.render();assert.equal(fallback.getPerformance().gpuTimingAvailable,false);assert.equal(fallback.getPerformance().gpuMs,null);assert.equal(fallback.getPerformance().renderScale,1);fallback.destroy();
console.log('PASS asynchronous GPU timing, bounded queries, disjoint rejection, automatic scale floor/recovery, manual override, buffer reuse, and unsupported-device fallback.');

// Auto quality follows the supplied device, not the machine running the test.
{
 const originalNavigator=Object.getOwnPropertyDescriptor(globalThis,'navigator');
 try{
  for(const [device,profile] of [
   [undefined,'medium'],
   [{hardwareConcurrency:2},'low'],
   [{hardwareConcurrency:4},'low'],
   [{hardwareConcurrency:8},'medium'],
   [{hardwareConcurrency:8,deviceMemory:4},'low'],
   [{hardwareConcurrency:8,userAgentData:{mobile:true}},'low'],
  ]){
   Object.defineProperty(globalThis,'navigator',{configurable:true,value:device});
   const automatic=new CloudScene({...canvas,getContext:()=>noTimer},{autoStart:false,interactive:false});
   assert.equal(automatic.getPerformance().profile,profile);
   assert.deepEqual([automatic.canvas.width,automatic.canvas.height],profile==='low'?[800,480]:[1000,600]);
   automatic.setOptions({quality:'medium'});
   assert.deepEqual([automatic.canvas.width,automatic.canvas.height],[1000,600],'Explicit quality overrides device hints');
   automatic.destroy();
  }
 }finally{
  if(originalNavigator)Object.defineProperty(globalThis,'navigator',originalNavigator);
  else delete globalThis.navigator;
 }
 console.log('PASS automatic quality for low-core, desktop, low-memory, mobile, and missing device hints, plus explicit overrides.');
}

// Automatic resolution without a GPU timer follows the frame cadence; adaptiveQuality:0 keeps it manual.
{
 const frames=[];const timers=new Map();let timerId=0,clockNow=0;
 const origSetTimeout=globalThis.setTimeout,origClearTimeout=globalThis.clearTimeout;
 globalThis.setTimeout=(fn,ms)=>{const id=++timerId;timers.set(id,{fn,at:clockNow+ms});return id;};
 globalThis.clearTimeout=id=>timers.delete(id);
 globalThis.requestAnimationFrame=fn=>{frames.push(fn);return frames.length;};
 const step=(ms,count,scene)=>{
  let t=scene.__t??0;
  for(let i=0;i<count;i++){
   t+=ms;clockNow=t;
   for(const [id,entry]of [...timers.entries()])if(entry.at<=t){timers.delete(id);entry.fn();}
   const fn=frames.shift();fn?.(t);
  }
  scene.__t=t;
 };
 try{
  const paced=new CloudScene({...canvas,getContext:()=>noTimer},{autoStart:false,interactive:false,quality:'medium',fps:24});
  paced.start();step(42,4,paced);assert.equal(paced.getPerformance().renderScale,1);
  step(125,40,paced);assert.equal(paced.getPerformance().renderScale,.5,'Frames arriving far behind their slot lower the render scale to the floor');
  assert.equal(paced.getOptions().resolutionScale,1,'Cadence adaptation preserves authored settings');
  step(50,400,paced);assert.equal(paced.getPerformance().renderScale,1,'An on-time cadence (frames on display refreshes) restores the resolution');
  paced.stop();paced.start();step(5000,1,paced);step(50,2,paced);assert.equal(paced.getPerformance().renderScale,1,'A pause or hidden tab is not a slow frame');
  paced.destroy();
  const manual=new CloudScene({...canvas,getContext:()=>noTimer},{autoStart:false,interactive:false,quality:'medium',fps:24,adaptiveQuality:0,resolutionScale:.75});
  manual.start();step(125,60,manual);assert.equal(manual.getPerformance().renderScale,1,'Manual resolution is never adapted');assert.equal(manual.canvas.width,750,'Manual resolutionScale holds');manual.destroy();
 }finally{globalThis.setTimeout=origSetTimeout;globalThis.clearTimeout=origClearTimeout;}
 // quality:'auto' resolves per device; an explicit quality always wins.
 const software=new Proxy(noTimer,{get(target,key){if(key==='getParameter')return name=>name==='RENDERER'?'Google SwiftShader':8192;return target[key];}});
 const cpu=new CloudScene({...canvas,getContext:()=>software},{autoStart:false,interactive:false});
 assert.deepEqual([cpu.getPerformance().software,cpu.getPerformance().profile,cpu.options.raySteps,cpu.options.fps,cpu.options.octaves,cpu.options.selfShadow,cpu.options.lightSamples,cpu.options.maxLights,cpu.options.amortize],[true,'cpu',10,30,2,0,0,1,8],'Software WebGL gets the CPU profile');
 // Amortized: the first frame is drawn whole, then each render draws one band; a finished frame becomes "next".
 cpu.setOptions({lightning:true,lightningMode:'manual'});let lightReads=0,segmentReads=0;
 const lights=cpu.lightning.getLights,segments=cpu.lightning.getSegments;
 cpu.lightning.getLights=()=>{lightReads++;return lights();};cpu.lightning.getSegments=()=>{segmentReads++;return segments();};
 cpu.render();const a=cpu.amortized;assert(a&&a.ready&&a.band===0,'The first amortized frame is drawn whole');const first=a.next;
 for(let i=1;i<8;i++){cpu.render();assert.equal(a.band,i,'One band per render');}
 cpu.render();assert.deepEqual([a.band,a.prev],[0,first],'A finished cloud frame becomes next; the last one is blended from');assert.notEqual(a.next,first);
 assert.deepEqual([lightReads,segmentReads],[2,2],'Lighting geometry is collected only when starting a cloud frame, not for every band');
 for(let i=0;i<7;i++)cpu.render();
 cpu.setOptions({amortize:2});cpu.render();assert.equal(cpu.amortized,a,'Band changes reuse the existing textures');assert.equal(a.band,0,'Changing band count restarts a complete frame');cpu.render();cpu.render();assert.equal(a.band,0);
 cpu.setOptions({amortize:1});cpu.render();assert.equal(cpu.amortized,null,'amortize:1 draws whole frames and frees the targets');
 cpu.setOptions({quality:'high'});assert.deepEqual([cpu.getPerformance().profile,cpu.options.raySteps],['high',64],'An explicit quality overrides auto');
 cpu.setOptions({quality:'auto',raySteps:10});assert.deepEqual([cpu.getPerformance().profile,cpu.options.raySteps],['cpu',10],'Explicit overrides in the same patch win');
 cpu.destroy();
 console.log('PASS cadence-based automatic resolution without GPU timing, pause handling, manual resolution, and auto/cpu quality profiles.');
}
{
 const frames=new Map(),timers=new Map();let serial=0,timerId=0,clockNow=0;
 const origSetTimeout=globalThis.setTimeout,origClearTimeout=globalThis.clearTimeout;
 globalThis.setTimeout=(fn,ms)=>{const id=++timerId;timers.set(id,{fn,at:clockNow+ms});return id;};
 globalThis.clearTimeout=id=>timers.delete(id);
 globalThis.requestAnimationFrame=fn=>{frames.set(++serial,fn);return serial;};globalThis.cancelAnimationFrame=id=>frames.delete(id);
 try{
  for(const fps of [15,24,30,60]){
   let draws=0;const scene=new CloudScene({...canvas,getContext:()=>noTimer},{autoStart:false,interactive:false,adaptiveQuality:0,fps,onFrame:()=>draws++});scene.start();
   for(let i=0;i<60;i++){
    clockNow=i*1000/60;
    for(const [id,entry]of [...timers.entries()])if(entry.at<=clockNow){timers.delete(id);entry.fn();}
    const pending=[...frames.values()];frames.clear();for(const fn of pending)fn(clockNow);
   }
   assert.equal(draws,fps,'A 60 Hz display delivers the requested '+fps+' FPS without interval drift');scene.destroy();assert.equal(frames.size,0);assert.equal(timers.size,0);
  }
  // At fps:12 on a 120 Hz display, rAF callbacks per second are at most ~2x fps, and beforeRender is called once per scheduler-drawn frame.
  let rafCallbacks=0,beforeCalls=0,frameCalls=0,lastDt=0,hookErrors=0;
  const origRaf=globalThis.requestAnimationFrame;
  globalThis.requestAnimationFrame=fn=>origRaf(t=>{rafCallbacks++;fn(t);});
  let obsCallback=null,obsDisconnected=false;
  const origIO=globalThis.IntersectionObserver;
  globalThis.IntersectionObserver=class{constructor(cb){obsCallback=cb;}observe(){}disconnect(){obsDisconnected=true;}};
  const lowFps=new CloudScene({...canvas,getContext:()=>noTimer},{
   autoStart:false,interactive:false,adaptiveQuality:0,fps:12,pauseWhenHidden:true,
   beforeRender:e=>{beforeCalls++;lastDt=e.dt;if(beforeCalls===2)throw new Error('Host beforeRender bug');},
   onFrame:()=>{frameCalls++;if(frameCalls===3)throw new Error('Host onFrame bug');},
   onError:()=>hookErrors++
  });
  lowFps.start();
  for(let i=0;i<120;i++){
   clockNow=i*1000/120;
   for(const [id,entry]of [...timers.entries()])if(entry.at<=clockNow){timers.delete(id);entry.fn();}
   const pending=[...frames.values()];frames.clear();for(const fn of pending)fn(clockNow);
  }
  assert.equal(frameCalls,12,'12 FPS renders 12 frames in 1 second on a 120 Hz display');
  assert.equal(beforeCalls,12,'beforeRender is called once per scheduler-drawn frame');
  assert(lastDt>0.05&&lastDt<0.12,'beforeRender receives a sensible dt');
  assert(rafCallbacks<=24,`rAF callbacks at 12 FPS on 120 Hz should be <= 24, got ${rafCallbacks}`);
  assert.equal(hookErrors,2,'Errors in beforeRender and onFrame are caught and routed to onError without killing the loop');
  lowFps.render(10,0.016);
  assert.equal(beforeCalls,12,'Direct host render() does not invoke beforeRender');
  // pauseWhenHidden suspends scheduling when offscreen without changing running, and resumes when visible.
  obsCallback([{isIntersecting:false}]);
  assert.equal(lowFps.running,true,'pauseWhenHidden preserves running state');
  assert.equal(frames.size,0);assert.equal(timers.size,0);
  const drawsWhileHidden=frameCalls;
  for(let i=120;i<180;i++){
   clockNow=i*1000/120;
   for(const [id,entry]of [...timers.entries()])if(entry.at<=clockNow){timers.delete(id);entry.fn();}
   const pending=[...frames.values()];frames.clear();for(const fn of pending)fn(clockNow);
  }
  assert.equal(frameCalls,drawsWhileHidden,'Offscreen scene does not render while pauseWhenHidden is active');
  obsCallback([{isIntersecting:true}]);
  for(let i=180;i<210;i++){
   clockNow=i*1000/120;
   for(const [id,entry]of [...timers.entries()])if(entry.at<=clockNow){timers.delete(id);entry.fn();}
   const pending=[...frames.values()];frames.clear();for(const fn of pending)fn(clockNow);
  }
  assert(frameCalls>drawsWhileHidden,'Scene resumes rendering when intersecting again');
  lowFps.destroy();assert(obsDisconnected,'destroy() disconnects pauseWhenHidden IntersectionObserver');
  globalThis.IntersectionObserver=origIO;
 }finally{globalThis.setTimeout=origSetTimeout;globalThis.clearTimeout=origClearTimeout;}
 console.log('PASS accurate 15/24/30/60 FPS cadence on a 60 Hz display, low-wakeup timer sleep at 12 FPS, beforeRender, and pauseWhenHidden.');
}
