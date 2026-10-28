import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {CloudScene,StormClouds,CloudVolume,Lightning,CloudPresets,createDensityField} from '../src/index.js';
const calls=[],uniforms={};let id=0,failShader=false;
const gl=new Proxy({}, {get(_,key){
 if(key==='getShaderParameter')return shader=>!failShader||shader.type!=='FRAGMENT_SHADER';
 if(key==='getProgramParameter')return()=>!failShader;
 if(key==='createShader')return type=>({id:++id,type});
 if(key==='isContextLost')return()=>false;
 if(key==='getParameter')return name=>name==='MAX_3D_TEXTURE_SIZE'?256:8192;
 if(key==='getUniformLocation')return(_,name)=>name;
 if(key==='getAttribLocation')return()=>0;
 if(key.startsWith('uniform'))return(name,...values)=>uniforms[name]=values.map(v=>ArrayBuffer.isView(v)?Array.from(v):v);
 if(key.startsWith('create'))return()=>({id:++id});
 if(key.startsWith('delete')||key==='texImage3D'||key==='drawArrays')return(...args)=>calls.push([key,...args]);
 if(key.toUpperCase()===key)return key;
 return()=>{};
}});
const canvas={width:1,height:1,getContext:()=>gl,getBoundingClientRect:()=>({width:1000,height:600,left:10,top:20}),addEventListener(){}};
let next=0;const frames=new Map();
globalThis.requestAnimationFrame=fn=>{frames.set(++next,fn);return next;};globalThis.cancelAnimationFrame=n=>frames.delete(n);
globalThis.matchMedia=()=>({matches:false,addEventListener(){}});
const scene=new CloudScene(canvas,{preset:'storm',autoStart:false,interactive:false,quality:'medium'});
assert(scene.options.lightning);assert.equal(scene.options.cloudColor,CloudPresets.storm.cloudColor);
assert.equal(canvas.width,1000);assert.equal(canvas.height,600);
const dimensions=[canvas.width,canvas.height],uploads=calls.filter(c=>c[0]==='texImage3D').length;
scene.setOptions({ambient:.8,color:'#ff90d4'});assert.deepEqual([canvas.width,canvas.height],dimensions);
for(const patch of [{interactive:true},{autoStart:true},{powerPreference:'high-performance'},{failIfMajorPerformanceCaveat:true}]){
 const before=scene.getOptions();assert.throws(()=>scene.setOptions({...patch,coverage:.01}),/requires a new CloudScene/);assert.deepEqual(scene.getOptions(),before,'Creation-only changes reject the entire patch');
}
assert.throws(()=>scene.setTimeOfDay('night',{interactive:true}),/requires a new CloudScene/);
scene.setOptions(scene.getOptions());
assert.equal(calls.filter(c=>c[0]==='texImage3D').length,uploads,'Lighting reuses density');
assert.throws(()=>scene.setOptions({preset:'rainbow'}),RangeError);
assert.throws(()=>scene.setOptions({quality:'ultra'}),RangeError);
assert.throws(()=>scene.setOptions({quality:'toString'}),RangeError);
assert.throws(()=>scene.setOptions({preset:'constructor'}),RangeError);
assert.throws(()=>scene.setOptions({shape:'letters'}),RangeError);
for(const patch of [{quality:''},{preset:null},{shape:''},{lightningMode:null},{lightning:'false'},{scale:new Array(3)}])assert.throws(()=>scene.setOptions(patch));
const authored=scene.getOptions();assert.throws(()=>scene.setOptions({preset:'fog',coverage:NaN}));assert.deepEqual(scene.getOptions(),authored,'Rejected settings are atomic');
assert.throws(()=>scene.setUniforms({toString:1}),/Unknown/);assert.throws(()=>scene.setSources([{x:NaN,y:0,strength:1}]));assert.throws(()=>scene.render(NaN));
scene.setOptions({preset:'fog',coverage:2});assert.equal(scene.options.coverage,1);assert.equal(scene.options.lightning,false);
const field=createDensityField((x,y,z)=>x===-1&&y===-1&&z===-1?1:.25,{width:3,height:4,depth:5});
assert.equal(field.data.length,60);assert.equal(field.data[0],255);assert.equal(field.data[1],64);
assert.throws(()=>createDensityField(()=>1,{width:1}),RangeError);assert.throws(()=>createDensityField(null),TypeError);
scene.setDensityField(field.data,{...field,extent:[3,2,1]});assert(scene.hasField);
const densityUploads=calls.filter(c=>c[0]==='texImage3D').length;
scene.setSources([{x:500,y:300,strength:1,color:'#ff90d4'}],[{a:{x:400,y:300},b:{x:500,y:300},strength:1,color:'#ff90d4'}]);
scene.render(1,1/60);assert.equal(uniforms.uHasField[0],1);assert.deepEqual(uniforms.uExtent[0],[3,2,1]);
assert.equal(uniforms['uLights[0]'][0][0],0);assert.equal(uniforms['uLights[0]'][0][3],6);
assert(Math.abs(uniforms['uBoltColors[0]'][0][1]-144/255)<1e-6);
assert.equal(calls.filter(c=>c[0]==='texImage3D').length,densityUploads,'Rendering reuses custom texture');
assert.throws(()=>scene.setDensityField(new Uint8Array(2),{width:3,height:4,depth:5}),RangeError);
assert.throws(()=>scene.setDensityField(field.data,{...field,extent:[0,2,2]}),RangeError);
scene.clearDensityField();scene.render();assert.equal(uniforms.uHasField[0],0);
scene.start();assert.equal(frames.size,1);scene.start();assert.equal(frames.size,1);
scene.setPaused(true);assert.equal(frames.size,0);scene.setPaused(false);assert.equal(frames.size,1);
scene.stop();assert.equal(frames.size,0);scene.destroy();const deleted=calls.filter(c=>c[0].startsWith('delete')).length;scene.destroy();assert.equal(calls.filter(c=>c[0].startsWith('delete')).length,deleted);assert.equal(scene.render(),false);assert.throws(()=>scene.start());
const reentrant=new CloudScene(canvas,{autoStart:false,onFrame:()=>reentrant.setPaused(true)});reentrant.render();assert(reentrant.paused,'Pausing from onFrame is idempotent and does not recurse');reentrant.destroy();
let strikeDisposal,strikeFrames=0;strikeDisposal=new CloudScene(canvas,{autoStart:false,preset:'storm',lightningMode:'manual',onStrike:()=>strikeDisposal.destroy(),onFrame:()=>strikeFrames++});
strikeDisposal.strike(500,300);const strikeCalls=calls.length;assert.equal(strikeDisposal.render(0,.03),false);
assert.equal(calls.slice(strikeCalls).filter(c=>c[0]==='drawArrays').length,0,'Destroying from onStrike prevents drawing with deleted GPU resources');assert.equal(strikeFrames,0);
const storm=new StormClouds(canvas,{autoStart:false});assert.equal(storm.options.preset,'storm');storm.destroy();
const failedCalls=calls.length;failShader=true;assert.throws(()=>new CloudScene(canvas,{autoStart:false}));failShader=false;
assert.equal(calls.slice(failedCalls).filter(c=>c[0]==='deleteShader').length,2,'A failed fragment shader releases both shaders');assert.equal(calls.slice(failedCalls).filter(c=>c[0]==='deleteProgram').length,1,'A failed shader releases its program');
const failedVolumeCalls=calls.length;globalThis.document={createElement:()=>canvas};failShader=true;assert.throws(()=>new CloudVolume());failShader=false;delete globalThis.document;
assert.equal(calls.slice(failedVolumeCalls).filter(c=>c[0]==='deleteShader').length,2);assert.equal(calls.slice(failedVolumeCalls).filter(c=>c[0]==='deleteProgram').length,1,'A failed mask shader releases its program');
const invalidCalls=calls.length;assert.throws(()=>new CloudScene(canvas,{autoStart:false,coverage:NaN}));
assert.equal(calls.slice(invalidCalls).filter(c=>c[0]==='compileShader'||c[0]==='createBuffer'||c[0]==='createTexture').length,0,'Invalid constructor settings fail before allocating GPU resources');
const actor=new Lightning(null);actor.configure('interval',600);actor.configure('branches',8);actor.trigger();
for(let i=0;i<600;i++){actor.update(1/60,{x:100,y:100,color:[.5,.8,1],enabled:true},()=>[{x:140,y:120}]);assert(actor.getSegments().length<=32);assert(actor.getLights().length<=3);assert(actor.getState().flash<=3);}
actor.clear();assert.equal(actor.getLights().length,0);

// Context lifecycle: release in destroy(), StrictMode same-canvas reuse, and loss/restore.
{
 let lost=false,loseCount=0,restoreCount=0;const listeners={};
 const loseExt={loseContext(){loseCount++;lost=true;for(const fn of [...(listeners.webglcontextlost||[])])fn({preventDefault(){this.prevented=true;}});},restoreContext(){restoreCount++;lost=false;for(const fn of [...(listeners.webglcontextrestored||[])])fn({});}};
 const lifecycleGl=new Proxy(gl,{get(target,key){
  if(key==='isContextLost')return()=>lost;
  if(key==='getExtension')return name=>name==='WEBGL_lose_context'&&(lost?null:loseExt)||null;
  return target[key];
 }});
 const lifecycleCanvas={width:1,height:1,getContext:()=>lifecycleGl,getBoundingClientRect:()=>({width:400,height:300}),addEventListener(type,fn,opts){
  const wrapper=e=>{if(opts?.once)listeners[type]=listeners[type].filter(f=>f!==wrapper);fn(e);};
  if(opts?.signal)opts.signal.addEventListener('abort',()=>{listeners[type]=(listeners[type]||[]).filter(f=>f!==wrapper);},{once:true});
  (listeners[type]??=[]).push(wrapper);
 }};
 const first=new CloudScene(lifecycleCanvas,{autoStart:false,interactive:false});
 assert.equal(first.getPerformance().contextLost,false);
 first.destroy();assert.equal(loseCount,1,'destroy() calls loseContext()');assert(lost);
 first.destroy();assert.equal(loseCount,1,'destroy() is idempotent');
 // StrictMode pattern: construct again on the same canvas whose context was lost by destroy().
 let restoredEvents=0,lostEvents=0,framesDrawn=0;
 const second=new CloudScene(lifecycleCanvas,{autoStart:true,interactive:false,onContextLost:()=>lostEvents++,onContextRestored:()=>restoredEvents++,onFrame:()=>framesDrawn++});
 assert.equal(restoreCount,1,'Constructing on a canvas lost by destroy() triggers restoreContext()');
 assert.equal(restoredEvents,1);assert.equal(second.getPerformance().contextLost,false);
 const customField=createDensityField(()=>.5,{width:2,height:2,depth:2});
 second.setDensityField(customField.data,{...customField,extent:[2,2,2]});
 const uploadsBeforeLoss=calls.filter(c=>c[0]==='texImage3D').length;
 // Trigger GPU reset while running.
 loseExt.loseContext();assert.equal(lostEvents,1);assert.equal(second.getPerformance().contextLost,true);
 assert.equal(frames.size,0,'Context loss cancels the scheduled frame');
 assert.equal(second.render(1,.016),false,'Rendering while lost returns false without throwing');
 loseExt.restoreContext();assert.equal(restoredEvents,2);assert.equal(second.getPerformance().contextLost,false);
 assert(calls.filter(c=>c[0]==='texImage3D').length>uploadsBeforeLoss,'Custom density field is re-uploaded on restore');
 assert.equal(frames.size,1,'Running scene resumes scheduling after restore');
 for(const fn of [...frames.values()]){frames.clear();fn(16);}
 assert(framesDrawn>0,'Running scene renders after restore');
 // Paused scene redraws once on restore; stopped scene stays stopped.
 second.setPaused(true);const pausedDraws=framesDrawn;
 loseExt.loseContext();loseExt.restoreContext();
 assert.equal(framesDrawn,pausedDraws+1,'Paused scene redraws its still frame on restore');
 second.setPaused(false);second.stop();const stoppedDraws=framesDrawn;
 loseExt.loseContext();loseExt.restoreContext();
 assert.equal(framesDrawn,stoppedDraws,'Stopped scene stays stopped on restore');assert.equal(frames.size,0);
 // Safe destroy when context is already lost.
 loseExt.loseContext();const deletesBeforeLostDestroy=calls.filter(c=>c[0].startsWith('delete')).length;
 second.destroy();assert.equal(calls.filter(c=>c[0].startsWith('delete')).length,deletesBeforeLostDestroy,'destroy() skips GL deletes when context is already lost');
 loseExt.restoreContext();
}

// Parallel shader compilation (KHR_parallel_shader_compile): non-blocking init, pre-ready calls, async failure, and sync fallback.
{
 let completed=false,linkOk=true,statusQueries=0;
 const khrExt={COMPLETION_STATUS_KHR:0x91B1};
 const parallelGl=new Proxy(gl,{get(target,key){
  if(key==='getExtension')return name=>name==='KHR_parallel_shader_compile'?khrExt:null;
  if(key==='getShaderParameter'){return(...args)=>{statusQueries++;return target.getShaderParameter(...args);};}
  if(key==='getProgramParameter')return(prog,pname)=>pname===0x91B1?completed:linkOk;
  if(key==='getShaderInfoLog'||key==='getProgramInfoLog')return()=>'Broken densityShader';
  return target[key];
 }});
 const parallelCanvas={...canvas,getContext:()=>parallelGl};
 const asyncScene=new CloudScene(parallelCanvas,{autoStart:false,interactive:false,quality:'low'});
 assert.equal(statusQueries,0,'Parallel compile does not query shader status before link completion');
 assert.equal(asyncScene.program,null,'Constructor returns before link completion');
 assert.equal(asyncScene.render(0,0),false,'render() returns false before ready');
 asyncScene.setOptions({raySteps:20,ambient:.6});
 asyncScene.setSources([{x:200,y:150,strength:1.5}]);
 asyncScene.start();
 completed=true;
 for(const fn of [...frames.values()]){frames.clear();fn(16);}
 const resolved=await asyncScene.ready;
 assert.equal(resolved,asyncScene,'ready resolves to the scene instance');
 assert(asyncScene.program,'Program is activated once KHR_parallel_shader_compile completes');
 assert.equal(uniforms.uSteps[0],20,'setOptions before ready takes effect');
 assert.equal(uniforms['uLights[0]'][0][3],9,'setSources before ready takes effect');
 asyncScene.destroy();

 // Async compile failure: ready rejects, onError is called, and start/stop/render/setOptions are inert without throwing.
 completed=false;linkOk=false;failShader=true;
 let reportedError=null,unhandled=false;
 const onUnhandled=()=>{unhandled=true;};
 process.on('unhandledRejection',onUnhandled);
 const broken=new CloudScene(parallelCanvas,{autoStart:false,interactive:false,densityShader:'return broken;',onError:err=>reportedError=err});
 completed=true;
 for(const fn of [...frames.values()]){frames.clear();fn(32);}
 let rejectedError=null;
 try{await broken.ready;}catch(err){rejectedError=err;}
 await new Promise(r=>setTimeout(r,20));
 process.off('unhandledRejection',onUnhandled);
 assert(reportedError instanceof Error,'onError receives the compile error');
 assert.equal(rejectedError,reportedError,'ready rejects with the same error');
 assert(!unhandled,'Unobserved ready rejection does not trigger unhandledRejection');
 assert.equal(broken.start(),broken,'start() after async failure returns this without throwing');
 assert.equal(broken.stop(),broken,'stop() after async failure returns this without throwing');
 assert.equal(broken.render(0,0),false,'render() after async failure returns false');
 assert.equal(broken.setOptions({coverage:.5}),broken,'setOptions() after async failure does not throw');
 broken.destroy();
 assert.throws(()=>broken.start(),/destroyed/,'Explicit destroy() still makes start() throw');
 failShader=false;linkOk=true;

 // With KHR_parallel_shader_compile mocked to null, broken shader throws synchronously from constructor as in 0.1.0.
 const syncGl=new Proxy(gl,{get(target,key){
  if(key==='getExtension')return name=>name==='KHR_parallel_shader_compile'?null:null;
  return target[key];
 }});
 failShader=true;
 assert.throws(()=>new CloudScene({...canvas,getContext:()=>syncGl},{autoStart:false,densityShader:'return broken;'}));
 failShader=false;
}


const context={window:{}};vm.runInNewContext(await readFile(new URL('../dist/puff.js',import.meta.url),'utf8'),context);
assert.deepEqual(Object.keys(context.window.PuFF).sort(),['CloudText','CloudTimes','CloudControls','CloudPresets','CloudScene','CloudVolume','Lightning','StormClouds','createDensityField'].sort());
assert.equal(context.window.PuFF.CloudScene.fragmentShader,CloudScene.fragmentShader,'Bundle matches module source');
assert.equal(context.window.PuFF.CloudVolume.fragmentShader,CloudVolume.fragmentShader);
console.log('PASS module/bundle parity, presets, arbitrary density fields, texture reuse, lighting colors, scheduling, cleanup, and bounded lightning.');
