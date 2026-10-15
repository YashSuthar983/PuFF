/* Shared, conservative performance policy for the standalone demos. No render loop. */
(() => {
 'use strict';
 const profiles=Object.freeze({
  static:Object.freeze({mode:'static',fps:0,mistLayers:0,quality:'low'}),
  low:Object.freeze({mode:'low',fps:15,mistLayers:1,quality:'low',world:{maxDimension:800,maxPixels:360000,maxDpr:1,stripPixels:18000},mist:{quality:'low',resolutionLimit:480,resolutionScale:.5,pixelRatio:1,raySteps:12,shadowStride:6,fps:15},rock:{quality:'low',maxDimension:600,maxPixels:220000,textureLimit:256,antialias:false}}),
  balanced:Object.freeze({mode:'balanced',fps:30,mistLayers:2,quality:'medium',world:{maxDimension:1440,maxPixels:1200000,maxDpr:1,stripPixels:64000},mist:{quality:'medium',resolutionLimit:720,resolutionScale:.6,pixelRatio:1,raySteps:20,shadowStride:4,fps:30},rock:{quality:'medium',maxDimension:1100,maxPixels:700000,textureLimit:512,antialias:false}}),
  high:Object.freeze({mode:'high',fps:30,mistLayers:2,quality:'high',world:{maxDimension:1920,maxPixels:2100000,maxDpr:1.5,stripPixels:100000},mist:{quality:'high',resolutionLimit:1100,resolutionScale:.75,pixelRatio:1,raySteps:32,shadowStride:4,fps:30},rock:{quality:'high',maxDimension:1600,maxPixels:1500000,textureLimit:1024,antialias:false}})
 });
 function choose(canvas,{requested='auto',navigator:nav=globalThis.navigator||{},reducedMotion=false,attributes={}}={}){
  if(!['auto','static','low','balanced','high'].includes(requested))requested='auto';
  const hint=nav.connection?.saveData?'Data saver':reducedMotion?'Reduced motion':'';
  if(requested==='static'||requested==='auto'&&hint)return {profile:profiles.static,requested,reason:hint||'Static selected'};
  let gl;
  try{
   gl=canvas.getContext('webgl2',{alpha:true,antialias:false,powerPreference:requested==='high'?'high-performance':'low-power',...attributes,failIfMajorPerformanceCaveat:true});
   if(!gl)return {profile:profiles.static,requested,reason:'Hardware acceleration unavailable'};
   const ext=gl.getExtension('WEBGL_debug_renderer_info'),name=ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):'';
   if(typeof name==='string'&&/swiftshader|llvmpipe|softpipe|software|lavapipe|microsoft basic render/i.test(name)){
    gl.getExtension('WEBGL_lose_context')?.loseContext?.();return {profile:profiles.static,requested,reason:'Software graphics renderer'};
   }
  }catch(error){return {profile:profiles.static,requested,reason:'Graphics context unavailable'};}
  const memory=Number(nav.deviceMemory)||0,cores=Number(nav.hardwareConcurrency)||0;
  const weak=memory>0&&memory<=4||cores>0&&cores<=4;
  const mode=requested==='low'?'low':requested==='high'?'high':requested==='balanced'?'balanced':weak?'low':'balanced';
  return {profile:profiles[mode],requested,reason:mode==='low'?'Power saver':'Live effects'};
 }
 function bind(select,requested='auto'){
  if(!select)return;select.value=requested;
  select.addEventListener('change',()=>{const url=new URL(window.location.href);if(select.value==='auto')url.searchParams.delete('render');else url.searchParams.set('render',select.value);window.location.assign(url.href);});
 }
 // Frame cadence includes GPU/browser back-pressure. It is not GPU timing or an FPS benchmark.
 class Watchdog{
  constructor({mode='balanced',automatic=true,onLow,onStatic,warmup=2000,windowSize=45}={}){Object.assign(this,{mode,automatic,onLow,onStatic,warmup,windowSize});this.reset();}
  reset(){this.last=0;this.started=0;this.count=0;this.slow=0;this.sum=0;this.severe=0;}
  lower(){if(this.mode==='low'){this.mode='static';this.onStatic?.();}else{this.mode='low';this.onLow?.();}this.reset();}
  sample(now,targetMs){
   if(!this.automatic||this.mode==='static')return;
   if(!this.last){this.last=now;this.started=now;return;}
   const elapsed=now-this.last;this.last=now;this.severe=elapsed>Math.max(200,targetMs*3)?this.severe+1:0;
   if(this.severe>=3){this.lower();return;}if(now-this.started<this.warmup)return;
   this.count++;this.sum+=elapsed;if(elapsed>Math.max(targetMs*1.8,65))this.slow++;
   if(this.count<this.windowSize)return;
   const overloaded=this.slow/this.count>.4&&this.sum/this.count>Math.max(targetMs*1.6,65);
   if(overloaded)this.lower();
   else{this.count=0;this.sum=0;this.slow=0;}
  }
 }
 function mistOptions(profile,quality){const rank={low:0,medium:1,high:2},name=rank[quality]<rank[profile.quality]?quality:profile.quality;return profiles[{low:'low',medium:'balanced',high:'high'}[name]].mist;}
 function release(renderer){if(!renderer)return;renderer.destroy();try{renderer.gl?.getExtension('WEBGL_lose_context')?.loseContext?.();}catch(error){}}
 window.CloudPerformance={profiles,choose,bind,mistOptions,Watchdog,release};
})();
