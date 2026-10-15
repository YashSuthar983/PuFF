import assert from 'node:assert/strict';
import {CloudScene,CloudTimes,Lightning} from '../src/index.js';
const uniforms={};let contextOptions;
const gl=new Proxy({}, {get(_,key){
 if(key==='getExtension')return()=>null;
 if(key==='getParameter')return()=>8192;
 if(key==='getShaderParameter'||key==='getProgramParameter')return()=>true;
 if(key==='isContextLost')return()=>false;
 if(key==='getUniformLocation')return(_,name)=>name;
 if(key.startsWith('uniform'))return(name,...args)=>uniforms[name]=args;
 if(key.toUpperCase()===key)return key;
 return()=>({});
}});
const canvas={width:1,height:1,getContext:(_,options)=>{contextOptions=options;return gl;},getBoundingClientRect:()=>({width:800,height:500}),addEventListener(){}};
globalThis.requestAnimationFrame=()=>1;globalThis.cancelAnimationFrame=()=>{};
const scene=new CloudScene(canvas,{autoStart:false,transparent:true,preset:'storm',timeOfDay:'dawn',coverage:.4});assert(contextOptions.alpha);scene.render();assert.equal(uniforms.uBackgroundOpacity[0],0);
for(const time of ['dawn','day','noon','dusk','night']){scene.setTimeOfDay(time);assert.equal(scene.options.timeOfDay,time);assert.deepEqual(scene.options.cloudColor,CloudTimes[time].lit);assert.equal(scene.options.coverage,.4);assert.equal(scene.options.backgroundOpacity,0);assert.equal(scene.options.preset,'storm');assert(scene.options.lightning);}
scene.setTimeOfDay('noon',{ambient:.3});assert.equal(scene.options.ambient,.3);scene.setOptions({transparent:false,backgroundOpacity:.25});assert.equal(scene.options.backgroundOpacity,.25);assert.equal(scene.options.transparent,false);assert.throws(()=>scene.setTimeOfDay('toString'));assert.throws(()=>scene.setOptions({transparent:'yes'}));scene.destroy();
assert(Object.isFrozen(CloudTimes.day.lit));
const source={x:100,y:100,color:[.6,.8,1],enabled:true},targets=()=>[{x:240,y:100},{x:200,y:180},{x:150,y:30}];
const actor=new Lightning(null,{seed:42,mode:'manual',propagation:300,pulseCount:3,pulseSpacing:220,glowDecay:100,afterglow:180});actor.trigger();actor.update(0,source,targets);
const traces=[],brightness=[];let previous=0,peaks=0;
for(let i=0;i<180;i++){
 actor.update(.01,source,targets);const lights=actor.getLights();assert(lights.length<=3);assert(actor.getSegments().length<=32);
 traces.push(lights.map(l=>[l.x,l.y,l.depth]));const energy=lights.reduce((n,l)=>n+l.strength,0);brightness.push(energy);if(i>1&&brightness[i-1]>brightness[i-2]&&brightness[i-1]>energy)peaks++;
 for(const light of lights)assert([light.x,light.y,light.depth,light.strength,light.radius].every(Number.isFinite));previous=energy;
}
assert(new Set(traces.slice(1,35).map(p=>JSON.stringify(p))).size>20,'Light reservoirs move as discharge branches grow');assert(peaks>=2,'Repeated pulses brighten and fade independently');assert.equal(actor.getState().strikeCount,0);assert.equal(previous,0,'Glow disappears after the discharge');
console.log('PASS independent transparency/time palettes, alpha context and uniforms, growing discharge regions, repeated pulse peaks, finite bounded lights, and complete glow fade.');
