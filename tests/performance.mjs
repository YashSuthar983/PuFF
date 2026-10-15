import assert from 'node:assert/strict';
import {CloudScene} from '../src/index.js';
let serial=0,available=true,disjoint=false,gpuMs=40,pending=0,reads=0,deleted=0;
const ext={TIME_ELAPSED_EXT:123,GPU_DISJOINT_EXT:456};
const gl=new Proxy({}, {get(_,key){
 if(key==='getExtension')return()=>ext;
 if(key==='getParameter')return name=>name===456?disjoint:8192;
 if(key==='getShaderParameter'||key==='getProgramParameter')return()=>true;
 if(key==='isContextLost')return()=>false;
 if(key==='getUniformLocation')return(_,name)=>name;
 if(key==='createQuery')return()=>{pending++;return{id:++serial};};
 if(key==='deleteQuery')return()=>{pending--;deleted++;};
 if(key==='getQueryParameter')return(_,name)=>{if(name==='QUERY_RESULT_AVAILABLE')return available;assert(available,'Never read a pending query');reads++;return gpuMs*1e6;};
 if(key.startsWith('create'))return()=>({});
 if(key.toUpperCase()===key)return key;
 return()=>{};
}});
const canvas={width:1,height:1,getContext:()=>gl,getBoundingClientRect:()=>({width:1000,height:600}),addEventListener(){}};
globalThis.requestAnimationFrame=()=>1;globalThis.cancelAnimationFrame=()=>{};
const scene=new CloudScene(canvas,{autoStart:false,interactive:false});
const buffers=scene.lightBuffers;
for(let i=0;i<70;i++)scene.render(i/24,1/24);
assert.equal(scene.getOptions().resolutionScale,1,'Automatic adaptation preserves authored settings');
assert.equal(scene.getPerformance().renderScale,.5,'Sustained expensive GPU work reaches the configured floor');
assert.equal(canvas.width,500);assert.equal(canvas.height,300);assert.equal(scene.lightBuffers,buffers,'Lighting upload buffers are reused');
scene.setSources([{x:500,y:300,strength:1}]);scene.render();assert.equal(buffers.positions[3],6);scene.setSources([]);scene.render();assert.equal(buffers.positions[3],0,'Removed lights do not leave stale uniform data');
gpuMs=2;for(let i=0;i<150;i++)scene.render(i/24,1/24);assert.equal(scene.getPerformance().renderScale,1,'Resolution gradually recovers when the GPU has headroom');
available=false;const readCount=reads;for(let i=0;i<40;i++)scene.render();assert.equal(reads,readCount);assert.equal(pending,3,'Query backlog stays bounded without waiting');
disjoint=true;scene.render();assert.equal(reads,readCount,'Disjoint results are discarded');assert.equal(pending,1);
scene.setOptions({adaptiveQuality:0});assert.equal(scene.getPerformance().renderScale,1);assert.equal(canvas.width,1000);scene.destroy();assert.equal(pending,0);assert(deleted>0);
const noTimer=new Proxy(gl,{get(target,key){if(key==='getExtension')return()=>null;return target[key];}});
const fallback=new CloudScene({...canvas,getContext:()=>noTimer},{autoStart:false});fallback.render();assert.equal(fallback.getPerformance().gpuTimingAvailable,false);assert.equal(fallback.getPerformance().gpuMs,null);assert.equal(fallback.getPerformance().renderScale,1);fallback.destroy();
console.log('PASS asynchronous GPU timing, bounded queries, disjoint rejection, automatic scale floor/recovery, manual override, buffer reuse, and unsupported-device fallback.');

// Automatic resolution without a GPU timer follows the frame cadence; adaptiveQuality:0 keeps it manual.
{
 const frames=[];globalThis.requestAnimationFrame=fn=>{frames.push(fn);return frames.length;};
 const step=(ms,count,scene)=>{let t=scene.__t??0;for(let i=0;i<count;i++){t+=ms;const fn=frames.shift();fn?.(t);}scene.__t=t;};
 const paced=new CloudScene({...canvas,getContext:()=>noTimer},{autoStart:false,interactive:false,quality:'medium',fps:24});
 paced.start();step(42,4,paced);assert.equal(paced.getPerformance().renderScale,1);
 step(125,40,paced);assert.equal(paced.getPerformance().renderScale,.5,'Frames arriving far behind their slot lower the render scale to the floor');
 assert.equal(paced.getOptions().resolutionScale,1,'Cadence adaptation preserves authored settings');
 step(50,400,paced);assert.equal(paced.getPerformance().renderScale,1,'An on-time cadence (frames on display refreshes) restores the resolution');
 paced.stop();paced.start();step(5000,1,paced);step(50,2,paced);assert.equal(paced.getPerformance().renderScale,1,'A pause or hidden tab is not a slow frame');
 paced.destroy();
 const manual=new CloudScene({...canvas,getContext:()=>noTimer},{autoStart:false,interactive:false,quality:'medium',fps:24,adaptiveQuality:0,resolutionScale:.75});
 manual.start();step(125,60,manual);assert.equal(manual.getPerformance().renderScale,1,'Manual resolution is never adapted');assert.equal(manual.canvas.width,750,'Manual resolutionScale holds');manual.destroy();
 // quality:'auto' resolves per device; an explicit quality always wins.
 const software=new Proxy(noTimer,{get(target,key){if(key==='getParameter')return name=>name==='RENDERER'?'Google SwiftShader':8192;return target[key];}});
 const cpu=new CloudScene({...canvas,getContext:()=>software},{autoStart:false,interactive:false});
 assert.deepEqual([cpu.getPerformance().software,cpu.getPerformance().profile,cpu.options.raySteps,cpu.options.fps],[true,'cpu',14,15],'Software WebGL gets the CPU profile');
 cpu.setOptions({quality:'high'});assert.deepEqual([cpu.getPerformance().profile,cpu.options.raySteps],['high',64],'An explicit quality overrides auto');
 cpu.setOptions({quality:'auto',raySteps:10});assert.deepEqual([cpu.getPerformance().profile,cpu.options.raySteps],['cpu',10],'Explicit overrides in the same patch win');
 cpu.destroy();
 console.log('PASS cadence-based automatic resolution without GPU timing, pause handling, manual resolution, and auto/cpu quality profiles.');
}
