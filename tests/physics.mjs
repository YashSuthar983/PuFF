import assert from 'node:assert/strict';
import {CloudVolume} from '../src/index.js';

let activeTexture='TEXTURE0';const bindings=new Map(),allocations=new Map();
const gl=new Proxy({}, {get(_,key){
 if(key==='getShaderParameter'||key==='getProgramParameter')return()=>true;
 if(key==='isContextLost')return()=>false;
 if(key==='activeTexture')return unit=>activeTexture=unit;
 if(key==='bindTexture')return(_,texture)=>bindings.set(activeTexture,texture);
 if(key==='texImage2D')return(_,level,format,width,height)=>allocations.set(bindings.get(activeTexture),{format,width,height});
 if(key.toUpperCase()===key)return key;
 return()=>({});
}});
const mask={width:240,height:120,getContext:()=>({getImageData(){
 const data=new Uint8Array(240*120*4);
 for(let y=20;y<100;y++)for(let x=20;x<220;x++)data[(y*240+x)*4+3]=255;
 return {data};
}})};
globalThis.document={createElement:()=>({width:1,height:1,getContext:()=>gl})};
const make=(physics={})=>{const v=new CloudVolume({gridSize:120,minCell:2,physics});v.setMask(mask,{scale:32});return v;};
const sum=array=>array.reduce((n,v)=>n+v,0);
const idle={active:false};
const check=v=>{
 for(const key of ['field','loose','tapVapor'])if(v[key])for(const n of v[key])assert(Number.isFinite(n)&&n>=0&&n<=1+1e-6,key+' stays finite and bounded');
 for(const key of ['vx','vy','recovery'])for(const n of v[key])assert(Number.isFinite(n),key+' stays finite');
};
for(const options of [{gridSize:0},{minCell:-1},{renderWidth:NaN}])assert.throws(()=>new CloudVolume(options));
{
 const v=make(),before=v.getOptions();assert.throws(()=>v.configure({recoveryRate:2,brushSize:NaN}));assert.deepEqual(v.getOptions(),before);
 assert.throws(()=>v.setMask(mask,{scale:NaN}));assert.throws(()=>v.setMask({...mask,width:0}));v.destroy();
}

// Setting a new mask must not overwrite a host-owned texture on another unit.
{
 const v=make(),external=gl.createTexture();gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,external);
 gl.texImage2D(gl.TEXTURE_2D,0,gl.R8,1,1,0,gl.RED,gl.UNSIGNED_BYTE,new Uint8Array([255]));
 v.setMask(mask,{scale:32});assert.deepEqual(allocations.get(external),{format:gl.R8,width:1,height:1},'Mask allocation binds its own density texture');
 assert.equal(allocations.get(v.texture).format,gl.RGB8);v.destroy();
}

// Re-enabling recovery wakes a weathered mask that settled while recovery was off.
for(const layered of [false,true]){
 const v=make({recoveryRate:0}),layer=layered?v.createLayer(mask,{scale:32}):null,state=layered?v.layers.get(layer).state:v;
 const render=()=>layered?v.renderLayer(layer,.25,false,idle):v.render(.25,false,idle);
 if(layered)v.gustLayer(layer,.7);else v.gust(.7);
 for(let i=0;i<120&&!state.settled;i++)render();
 assert(state.settled,'Weather without recovery can reach a stable resting state');const damaged=sum(state.field);assert(damaged<sum(state.target)*.5);
 v.configure({recoveryRate:1});render();assert(sum(state.field)>damaged,'Recovery resumes after changing the rate from zero');v.destroy();
}
{
 const v=new CloudVolume({sharedBuffer:true});v.setMask(mask);const frame=v.render(1/30,false,idle);
 assert(frame);assert(v.canvas.width>=v.outputWidth&&v.canvas.height>=v.outputHeight,'Shared staging also supports the direct mask API');
 const start=v.time;let physicsSteps=0;const simulate=v.simulate;v.simulate=function(...args){physicsSteps++;return simulate.apply(this,args);};
 for(let i=0;i<30;i++)v.render(1/30,false,idle);
 assert.equal(physicsSteps,0,'Settled direct masks skip CPU advection');assert(v.time>start,'Idle visual time still advances');v.destroy();
}

// A completed stroke still applies when the pointer is released before the draw.
{
 const v=make(),before=sum(v.field);
 v.render(1/30,false,{active:false,vx:0,vy:0,segments:[{ax:35,ay:60,bx:205,by:60,down:true}]});
 assert(sum(v.field)<before*.98,'A queued path must work without a final nonzero pointer velocity');
 assert(sum(v.loose)>0);check(v);v.destroy();
}
// Time zero and rejected input cannot mutate the simulation.
{
 const v=make({recoveryRate:0}),segments=[{ax:-40,ay:-20,bx:300,by:160},{ax:250,ay:10,bx:-10,by:100},{ax:120,ay:-80,bx:120,by:200},{ax:-50,ay:60,bx:290,by:60},{ax:60,ay:40,bx:60,by:40}];
 const expected=v.field.slice(),reach=Math.max(27,Math.min(66,v.radius*1.4))*1.35;
 for(let y=0;y<v.gh;y++)for(let x=0;x<v.gw;x++){
  let weight=0;const px=(x+.5)*v.cell,py=(y+.5)*v.cell;
  for(const s of segments){const dx=s.bx-s.ax,dy=s.by-s.ay,n=dx*dx+dy*dy,t=n?Math.max(0,Math.min(1,((px-s.ax)*dx+(py-s.ay)*dy)/n)):0;
   const distance=(px-s.ax-dx*t)**2+(py-s.ay-dy*t)**2,influence=Math.exp(-distance/(reach*reach*.48));if(influence>=.004)weight=Math.max(weight,Math.fround(influence));
  }
  const i=y*v.gw+x;expected[i]*=Math.exp(-weight*3*.03*9);
 }
 v.render(.03,false,{active:true,down:true,vx:1e6,vy:0,segments});
 assert(v.field.every((n,i)=>Math.abs(n-expected[i])<1e-6),'Optimized sweep bands match an independent full-grid distance reference');v.destroy();
}
// Repeated path samples share the same brush envelope and Gaussian work.
{
 const segment={ax:20,ay:25,bx:220,by:95,down:true},single=make({recoveryRate:0}),repeated=make({recoveryRate:0});
 const exponential=Math.exp;
 const draw=(v,segments)=>{
  let count=0;Math.exp=value=>{count++;return exponential(value);};
  try{v.render(.03,false,{active:false,vx:1e6,vy:0,segments});return count;}finally{Math.exp=exponential;}
 };
 const once=draw(single,[segment]),many=draw(repeated,Array(64).fill(segment));
 assert.deepEqual(repeated.field,single.field,'Overlapping samples do not compound brush erosion');
 assert.equal(many,once,'Overlap does not multiply Gaussian evaluations');
 const next={ax:30,ay:100,bx:65,by:100,down:true};draw(single,[next]);draw(repeated,[next]);
 assert.deepEqual(repeated.field,single.field,'Reused brush scratch does not retain the previous path');single.destroy();repeated.destroy();
}
{
 const v=make();v.gust(.5);const before=v.loose.slice();
 v.render(0,false,idle);assert.deepEqual(v.loose,before,'A zero-time draw does not advect away edge cells');
 for(const dt of [NaN,Infinity,-1])assert.throws(()=>v.render(dt,false,idle),/time|dt/i);
 const field=v.field.slice();
 assert.throws(()=>v.render(.03,false,{active:true,segments:[{ax:NaN,ay:0,bx:20,by:20}]}));
 assert.throws(()=>v.render(.03,false,{active:false,effects:[{kind:'typo',x:50,y:50}]}));
 assert.deepEqual(v.field,field,'Invalid input is rejected before changing density');v.destroy();
}
// Recovery honors the remaining hold delay, both on and off screen.
{
 const v=make(),layer=v.createLayer(mask,{scale:32}),state=v.layers.get(layer).state;
 const i=state.target.findIndex(n=>n>.9);state.field[i]=.2;state.recovery[i]=2;
 const held=state.field[i];v.recoverLayer(layer,.5);assert.equal(state.field[i],held);assert.equal(state.recovery[i],1.5);
 v.recoverLayer(layer,2);assert(Math.abs(state.field[i]-(state.target[i]-(state.target[i]-.2)*Math.exp(-.5*v.physics.recoveryRate)))<1e-6);
 v.destroy();
}
// The exposed fade control also affects vapor released by sweeps and gusts.
{
 const still=make({vaporDissipation:0}),fast=make({vaporDissipation:4});
 for(const v of [still,fast]){v.loose[Math.floor(v.gh/2)*v.gw+Math.floor(v.gw/2)]=.8;v.settled=false;}
 still.render(.02,false,idle);fast.render(.02,false,idle);
 assert(Math.abs(sum(fast.loose)/sum(still.loose)-Math.exp(-.08))<1e-6);still.destroy();fast.destroy();
}
// Stirring applies acceleration per elapsed second, rather than per display frame.
{
 const a=make(),b=make(),pointer={active:false,effects:[{kind:'stir',x:120,y:60,strength:.1}]};
 a.render(1/30,false,pointer);b.render(1/60,false,pointer);b.render(1/60,false,pointer);
 const energy=v=>v.vx.reduce((n,x,i)=>n+Math.hypot(x,v.vy[i]),0);
 assert(Math.abs(energy(a)/energy(b)-1)<.1,'30 and 60 FPS apply comparable stirring');a.destroy();b.destroy();
}
// Different recovery rates keep simulating until the density has actually settled.
{
 const v=make({recoveryRate:.1}),layer=v.createLayer(mask,{scale:32});v.gustLayer(layer,.7);
 let frame;
 for(let i=0;i<400;i++)frame=v.renderLayer(layer,.03,false,idle);
 assert.equal(frame.settled,false,'Slow recovery must not stop at a fixed nine seconds');
 v.recoverLayer(layer,120);frame=v.renderLayer(layer,.03,false,idle);
 assert.equal(frame.settled,true);v.destroy();
}
// Repeated weather cannot accumulate unbounded mass or non-finite values.
{
 const v=make();v.render(.03,false,{active:false,effects:[{kind:'puff',x:120,y:60,strength:-1}]});assert.equal(v.puffs.length,0,'A negative puff cannot poison later vapor');
 for(let i=0;i<3;i++)v.render(.03,false,{active:false,effects:[{kind:'puff',x:120,y:60}]});
 for(let i=0;i<30;i++)v.render(.03,false,idle);
 check(v);assert(v.puffs.every(p=>Number.isFinite(p.strength)),'Repeated default-strength puffs remain finite');v.destroy();
}
{
 const v=make();
 for(let i=0;i<360;i++){
  const effects=i%12===0?[{kind:i%24===0?'puff':'stir',x:30+i%180,y:60,strength:2}]:[];
  v.render(1/30,false,{active:true,vx:600,vy:0,segments:[{ax:20,ay:60,bx:220,by:60,down:true}],effects});
  if(i%30===0)check(v);assert(v.puffs.length<=8);
 }
 check(v);v.destroy();
 assert.equal(Object.values(v).filter(ArrayBuffer.isView).length,0,'Destroy releases retained CPU simulation buffers');
}
console.log('PASS completed sweeps, numerical bounds, zero/invalid time, delayed recovery, vapor fade, frame-rate independent stirring, settlement, and CPU buffer cleanup.');
