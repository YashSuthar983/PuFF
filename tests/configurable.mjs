import assert from 'node:assert/strict';
import {CloudControls,CloudScene,Lightning} from '../src/index.js';
const simulations=[];
for(let run=0;run<2;run++){
 const strikes=[];let time=0;const actor=new Lightning(null,{seed:77,mode:'random',interval:3000,randomness:1,onStrike:event=>strikes.push({time,...event})});actor.resize(400,300,1);
 const source={x:200,y:150,color:[.6,.8,1],enabled:true,bounds:{x:100,y:200,width:400,height:300}},targets=(reach,origin)=>[{x:origin.x+reach*.4,y:origin.y}];
 for(let i=0;i<900;i++){time=i*.05;actor.update(.05,source,targets);assert(actor.getState().strikeCount<=2);}
 assert(strikes.length>8);assert(strikes[0].time>=1.45,'Random storms wait before the first flash');
 assert(new Set(strikes.map(s=>Math.round(s.time*20))).size>1);assert(new Set(strikes.slice(1).map((s,i)=>Math.round((s.time-strikes[i].time)*20))).size>3,'Cadence varies');
 assert(new Set(strikes.map(s=>Math.round(s.source.x))).size>3,'Origins vary across the sky');assert(strikes.every(s=>s.source.x>=100&&s.source.x<=500&&s.source.y>=200&&s.source.y<=500));
 simulations.push(strikes);
 actor.configure('mode','manual');actor.clear();for(let i=0;i<500;i++)actor.update(.05,source,targets);assert.equal(actor.getState().strikeCount,0,'Manual never emits on its own');assert(actor.trigger());actor.update(.02,source,targets);assert.equal(actor.getState().strikeCount,1);
 actor.configure('mode','off');assert.equal(actor.trigger(),false);actor.update(.1,source,targets);assert.equal(actor.getState().strikeCount,0);
}
assert.deepEqual(simulations[0],simulations[1],'An explicit seed reproduces the storm');
const shader=CloudScene.createFragmentShader('return cloudBase(p) * uAmount;', {uAmount:.7});assert(shader.includes('uniform float uAmount;'));assert(shader.includes('float cloudBase(vec3 p)'));assert.throws(()=>CloudScene.createFragmentShader(null,{'bad-name':1}));
assert.equal(CloudControls.quality.medium.resolutionLimit,1280);assert.equal(CloudControls.quality.medium.raySteps,40);assert(CloudControls.scene.raySteps.max>=64);
console.log('PASS randomized delay/origins, reproducible seeds, manual/off modes, custom density shaders, and public control metadata.');
