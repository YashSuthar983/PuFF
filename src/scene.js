import { CloudControls } from './config.js';
import { CloudTimes } from './time.js';
import { Lightning } from './lightning.js';

const vertex=`#version 300 es
in vec2 aPosition;
void main(){gl_Position=vec4(aPosition,0.,1.);}`;
const fragment=`#version 300 es
precision highp float;
#ifndef PUFF_MAX_STEPS
#define PUFF_MAX_STEPS 96
#endif
#ifndef PUFF_BOLTS
#define PUFF_BOLTS 32
#endif
uniform vec2 uResolution;
uniform float uTime;
uniform float uCoverage;
uniform float uAmbient;
uniform float uExposure;
uniform float uSteps;
uniform float uShadowStride;
uniform float uOctaves;
uniform float uSelfShadow;
uniform float uLightSamples;
uniform float uMaxLights;
uniform float uDensityScale;
uniform float uNoiseScale;
uniform float uSoftness;
uniform float uErosion;
uniform float uExtinction;
uniform float uShadowStrength;
uniform float uLightIntensity;
uniform float uLightFalloff;
uniform float uViewScale;
uniform float uVolumeDepth;
uniform float uShapeRadius;
uniform vec3 uWindDirection;
uniform vec3 uLightDirection;
uniform vec3 uOffset;
uniform vec3 uScale;
uniform int uPreset;
uniform int uShape;
uniform float uDetail;
uniform vec3 uCloudColor;
uniform vec3 uBackground;
uniform float uBackgroundOpacity;
uniform float uLightRadii[3];
uniform highp sampler3D uField;
uniform bool uHasField;
uniform vec3 uExtent;
uniform vec4 uLights[3];
uniform vec3 uLightColors[3];
uniform vec4 uBolts[32];
uniform vec4 uBoltEnds[32];
uniform vec3 uBoltColors[32];
uniform int uBoltCount;
out vec4 color;
float hash(vec3 p){p=fract(p*.1031);p+=dot(p,p.yzx+33.33);return fract((p.x+p.y)*p.z);}
float noise(vec3 p){
 vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
 return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),
 mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);
}
float cloud(vec3 p){
 p=(p-uOffset)/uScale;
 vec3 original=p;
 if(uCoverage<=0.)return 0.;
 if(uHasField){
  vec3 uv=p/uExtent*.5+.5;
  if(any(lessThan(uv,vec3(0)))||any(greaterThan(uv,vec3(1))))return 0.;
  float field=texture(uField,uv).r;
  if(field<=0.)return 0.;
  vec3 drift=p+uTime*uWindDirection;
  float wisps=uOctaves>=3.?noise(drift*9.4+vec3(8,3,1)):.5;
  float erosion=(1.-(uOctaves>=4.?noise(drift*19.4+vec3(7,5,2)):.5))*uDetail*uErosion;
  return max(0.,field*(1.-uDetail*.18*(1.-wisps))-erosion)*uCoverage*1.6;
 }
 float envelope=1.-smoothstep(uVolumeDepth*.365,uVolumeDepth*.5,abs(original.z));
 if(uShape==1)envelope*=1.-smoothstep(uShapeRadius*.61,uShapeRadius,length(original));
 if(envelope<=0.)return 0.;
 p=p*uNoiseScale+uTime*uWindDirection;
 // uOctaves (1-4) drops the finer octaves for their mean, .5: the same cloud with less detail, for less work.
 float large=noise(p*1.15+vec3(4,1,7));
 float billow=uOctaves>=2.?noise(p*2.6+vec3(2,9,3)):.5;
 float detail=uOctaves>=3.?noise(p*7.8+vec3(8,3,1)):.5;
 float fine=uOctaves>=4.?noise(p*19.4+vec3(7,5,2)):.5;
 float shape=large*.58+billow*.28+detail*.1+fine*.04;
 float threshold=.65-uCoverage*.26;
 float mass=smoothstep(threshold,threshold+uSoftness,shape);
 mass=max(0.,mass-(1.-detail)*uDetail*uErosion-(1.-fine)*uDetail*uErosion/3.);
 if(uPreset==2)mass=mix(.15,.65,shape)*uCoverage;
 if(uPreset==3)mass=pow(mass,.7)*(.6+.4*detail);
 return mass*envelope;
}
float segmentDistance(vec2 p,vec2 a,vec2 b){vec2 d=b-a;float t=clamp(dot(p-a,d)/max(.00001,dot(d,d)),0.,1.);return length(p-a-d*t);}
vec3 scatterAt(vec3 p){
 // Without self-shadowing (uSelfShadow 0) every sample is half shaded: flat, but a cloud sample cheaper.
 float ambientShade=uSelfShadow>.5?exp(-max(0.,cloud(p+uLightDirection*.6))*uDensityScale*uShadowStrength):.5;
 vec3 scattering=uCloudColor*(.035+uAmbient*(.35+.65*ambientShade));
 for(int l=0;l<3;l++){
  if(float(l)>=uMaxLights)break;
  if(uLights[l].w<=.001)continue;
  vec3 delta=uLights[l].xyz-p;float distance=max(.04,length(delta));vec3 direction=delta/distance;
  // Optical depth toward the light from uLightSamples samples (2, 1 at the midpoint, or 0: unshadowed).
  float optical=uLightSamples>=2.?cloud(p+direction*distance*.3)+cloud(p+direction*distance*.65):uLightSamples>=1.?cloud(p+direction*distance*.475)*2.:0.;
  optical*=distance*.9*uDensityScale;
  float light=uLights[l].w*exp(-optical*uExtinction)/(uLightFalloff+distance*distance/max(.01,uLightRadii[l]*uLightRadii[l]));
  scattering+=uLightColors[l]*light*.18*uLightIntensity;
 }
 return scattering;
}
void main(){
 vec2 uv=vec2(gl_FragCoord.x/uResolution.x,1.-gl_FragCoord.y/uResolution.y);
 float aspect=uResolution.x/uResolution.y;
 vec2 xy=vec2((uv.x-.5)*aspect*uViewScale,(.5-uv.y)*uViewScale);
 float stepSize=uVolumeDepth/uSteps,transmission=1.,boltVisibility=1.;vec3 radiance=vec3(0);
 bool passedBolt=false;
 vec3 scatterA=vec3(0),scatterB=vec3(0);int shadowBlock=-99;
 float stride=max(1.,floor(uShadowStride));
 for(int i=0;i<PUFF_MAX_STEPS;i++){
  if(float(i)>=uSteps)break;
  vec3 p=vec3(xy,uVolumeDepth*.5-(float(i)+.5)*stepSize);
  if(!passedBolt&&p.z<=0.){boltVisibility=transmission;passedBolt=true;}
  float density=max(0.,cloud(p))*uDensityScale;
  if(density>.005){
   vec3 scattering;
   if(stride<=1.)scattering=scatterAt(p);
   else{
    int block=int(floor(float(i)/stride));
    if(block!=shadowBlock){
     vec3 anchor=vec3(xy,uVolumeDepth*.5-(float(block)*stride+.5)*stepSize);
     scatterA=block==shadowBlock+1?scatterB:scatterAt(anchor);
     scatterB=scatterAt(anchor-vec3(0,0,stride*stepSize));shadowBlock=block;
    }
    scattering=mix(scatterA,scatterB,fract(float(i)/stride));
   }
   float opacity=1.-exp(-density*stepSize*uExtinction);
   radiance+=transmission*opacity*scattering;transmission*=1.-opacity;
  }
  if(transmission<.008){if(!passedBolt)boltVisibility=transmission;break;}
 }
 // Channels lie behind the foreground vapor. Its transmission hides parts of
 // the discharge, while embedded lights illuminate the surrounding billows.
 float boltAlpha=0.;
#if PUFF_BOLTS>0
 for(int i=0;i<PUFF_BOLTS;i++){
  if(i>=uBoltCount)break;
  float d=segmentDistance(xy,uBolts[i].xy,uBoltEnds[i].xy);
  float halo=exp(-d*d/.006)*.11;
  float core=exp(-d*d/.00009)*1.5;
  boltAlpha=max(boltAlpha,(1.-exp(-(halo+core)*uBolts[i].w))*boltVisibility);
  radiance+=(uBoltColors[i]*halo+mix(uBoltColors[i],vec3(1),.8)*core)*uBolts[i].w*boltVisibility;
 }
#endif
 radiance+=transmission*uBackground*uBackgroundOpacity;
 float alpha=max(1.-transmission*(1.-uBackgroundOpacity),boltAlpha);
 vec3 mapped=1.-exp(-radiance*uExposure);
 color=alpha>.00001?vec4(mapped/alpha,alpha):vec4(0);
}`;
// Amortized rendering (amortize > 1): shows the blend of the last two finished cloud frames, colour premultiplied so
// the blend has no dark fringes, back out to the canvas's straight alpha.
const presentFragment=`#version 300 es
precision mediump float;
uniform sampler2D uPrev;
uniform sampler2D uNext;
uniform float uMix;
out vec4 color;
void main(){
 ivec2 p=ivec2(gl_FragCoord.xy);vec4 a=texelFetch(uPrev,p,0),b=texelFetch(uNext,p,0);
 vec4 m=mix(vec4(a.rgb*a.a,a.a),vec4(b.rgb*b.a,b.a),uMix);
 color=m.a>.00001?vec4(m.rgb/m.a,m.a):vec4(0);
}`;
const profiles=CloudControls.quality;
const lightningSettings={propagation:'propagation',pulseCount:'pulseCount',pulseSpacing:'pulseSpacing',glowDecay:'glowDecay',glowSpread:'glowSpread',lightningPower:'power',boltReach:'reach',branches:'branches',interval:'interval',randomness:'randomness',variation:'variation',afterglow:'afterglow',cloudGlow:'glow'};
const ranges={...CloudControls.scene,...Object.fromEntries(Object.entries(lightningSettings).map(([key,kind])=>[key,CloudControls.lightning[kind]]))};
const U_FLOAT=[['octaves','uOctaves'],['selfShadow','uSelfShadow'],['lightSamples','uLightSamples'],['maxLights','uMaxLights'],['backgroundOpacity','uBackgroundOpacity'],['shadowStride','uShadowStride'],['density','uDensityScale'],['noiseScale','uNoiseScale'],['softness','uSoftness'],['erosion','uErosion'],['extinction','uExtinction'],['shadowStrength','uShadowStrength'],['lightIntensity','uLightIntensity'],['lightFalloff','uLightFalloff'],['viewScale','uViewScale'],['volumeDepth','uVolumeDepth'],['shapeRadius','uShapeRadius']];
const U_VEC3=['windDirection','lightDirection','offset','scale'];
const U_ALL=[...U_FLOAT.map(x=>x[1]),...U_VEC3.map(k=>'u'+k[0].toUpperCase()+k.slice(1)),'uLightRadii[0]','uResolution','uTime','uCoverage','uAmbient','uExposure','uSteps','uLights[0]','uLightColors[0]','uBolts[0]','uBoltEnds[0]','uBoltColors[0]','uBoltCount','uPreset','uShape','uDetail','uCloudColor','uBackground','uField','uHasField','uExtent'];
const CALLBACKS=['onFrame','onStrike','onError','beforeRender','onContextLost','onContextRestored'];
const lostExtensions=new WeakMap(),programCaches=new WeakMap(),stepBuckets=[8,16,24,32,48,64,96];
const stepBucket=n=>stepBuckets.find(b=>b>=n)||96;
const texParam=(gl,target,filter, keys=[gl.TEXTURE_WRAP_S,gl.TEXTURE_WRAP_T])=>{
 for(const k of [gl.TEXTURE_MIN_FILTER,gl.TEXTURE_MAG_FILTER])gl.texParameteri(target,k,filter);
 for(const k of keys)gl.texParameteri(target,k,gl.CLAMP_TO_EDGE);
};
// quality:'auto' picks a profile for the device: 'cpu' when WebGL is drawn in software (no usable GPU: SwiftShader,
// llvmpipe and the like run the shader on the CPU), 'low' on phones, tablets and low-memory / low-core machines,
// 'medium' otherwise.
const SOFTWARE=/swiftshader|llvmpipe|softpipe|lavapipe|software|microsoft basic render/i;
function deviceProfile(gl){
 let renderer='';
 try{const info=gl.getExtension('WEBGL_debug_renderer_info');renderer=String(gl.getParameter(info?.UNMASKED_RENDERER_WEBGL??gl.RENDERER)??'');}catch{}
 if(SOFTWARE.test(renderer))return {profile:'cpu',software:true,renderer};
 const nav=globalThis.navigator||{},memory=Number(nav.deviceMemory)||0,cores=Number(nav.hardwareConcurrency)||0;
 const mobile=nav.userAgentData?.mobile??(/Android|iPhone|iPad|iPod|Mobile/i.test(nav.userAgent||'')||/Mac/.test(nav.platform||'')&&nav.maxTouchPoints>1);
 return {profile:mobile||memory>0&&memory<=4||cores>0&&cores<=4?'low':'medium',software:false,renderer};
}
const clamp=(n,min,max)=>Math.max(min,Math.min(max,Number(n)||0));
function rgb(value){
 if(Array.isArray(value)&&value.length===3)return value.map(v=>clamp(v,0,1));
 if(/^#[0-9a-f]{6}$/i.test(value))return [1,3,5].map(i=>parseInt(value.slice(i,i+2),16)/255);
 return [142/255,218/255,1];
}

export const CloudPresets=Object.freeze({
 clouds:Object.freeze({coverage:.65,ambient:.85,exposure:1.5,cloudColor:'#f4f7ff',background:'#78b9eb',lightning:false}),
 storm:Object.freeze({coverage:.7,ambient:.13,exposure:1.7,cloudColor:'#5275bb',background:'#02040b',lightning:true}),
 fog:Object.freeze({coverage:.45,ambient:.7,exposure:1.5,cloudColor:'#d0dbe7',background:'#688695',lightning:false}),
 smoke:Object.freeze({coverage:.65,ambient:.28,exposure:1.6,cloudColor:'#7f7881',background:'#16131c',lightning:false})
});
function customFragment(body,uniforms={},defines={}){
 if(body!=null&&typeof body!=='string')throw new TypeError('densityShader must be a GLSL function body.');
 const declarations=Object.entries(uniforms).map(([name,value])=>{
  if(!/^u[A-Za-z0-9_]+$/.test(name)||new RegExp('\\b'+name+'\\b').test(fragment))throw new TypeError('Custom uniforms need unique u-prefixed identifiers.');
  const size=Array.isArray(value)?value.length:1;
  if(size<1||size>4||!Array.from(Array.isArray(value)?value:[value]).every(Number.isFinite))throw new TypeError('Custom uniforms must be a finite number or 1–4 component vector.');
  return 'uniform '+(size===1?'float':'vec'+size)+' '+name+';';
 }).join('\n');
 let source=fragment;
 if(defines.maxSteps!==undefined||defines.bolts!==undefined)source=source.replace('#version 300 es\n',`#version 300 es\n#define PUFF_MAX_STEPS ${defines.maxSteps??96}\n#define PUFF_BOLTS ${defines.bolts??32}\n`);
 if(body!=null){const start=source.indexOf('float cloud(vec3 p){'),end=source.indexOf('float segmentDistance',start);const base=source.slice(start,end).replace('float cloud(vec3 p)','float cloudBase(vec3 p)');source=source.slice(0,start)+base+'float cloud(vec3 p){'+body+'}\n'+source.slice(end);}
 return source.replace('out vec4 color;',declarations+'\nout vec4 color;');
}
function beginProgram(gl,fragmentSource,position){
 const program=gl.createProgram(),shaders=[];
 for(const [type,source]of [[gl.VERTEX_SHADER,vertex],[gl.FRAGMENT_SHADER,fragmentSource]]){
  const shader=gl.createShader(type);shaders.push(shader);
  gl.shaderSource(shader,source);gl.compileShader(shader);gl.attachShader(program,shader);
 }
 if(position!==undefined)gl.bindAttribLocation(program,position,'aPosition');
 gl.linkProgram(program);
 return {program,shaders};
}
function finishProgram(gl,{program,shaders}){
 const ok=gl.getProgramParameter(program,gl.LINK_STATUS);
 if(!ok){
  const logs=[];
  for(const s of shaders)if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))logs.push(gl.getShaderInfoLog(s));
  logs.push(gl.getProgramInfoLog(program));
  for(const s of shaders)gl.deleteShader(s);
  gl.deleteProgram(program);
  throw new Error(logs.filter(Boolean).join('\n')||'Shader program link failed.');
 }
 for(const s of shaders)gl.deleteShader(s);
 return program;
}
function compileProgram(gl,fragmentSource,position){
 return finishProgram(gl,beginProgram(gl,fragmentSource,position));
}
export class CloudScene {
 constructor(canvas,options={}){
  if(!canvas?.getContext)throw new TypeError('CloudScene needs a canvas.');
  this.canvas=canvas;this.gl=canvas.getContext('webgl2',{alpha:true,depth:false,antialias:false,premultipliedAlpha:false,failIfMajorPerformanceCaveat:options.failIfMajorPerformanceCaveat??false,powerPreference:options.powerPreference||'default'});
  if(!this.gl)throw new Error('CloudScene requires WebGL2.');
  this.options={...Object.fromEntries(Object.entries(CloudControls.scene).map(([k,v])=>[k,v.default])),timeOfDay:'custom',transparent:false,quality:'auto',preset:'clouds',shape:'layer',...CloudPresets.clouds,...Object.fromEntries(['propagation','pulseCount','pulseSpacing','glowDecay','glowSpread'].map(k=>[k,CloudControls.lightning[k].default])),lightningMode:'random',lightningPower:1,boltReach:140,branches:4,interval:7000,randomness:.7,variation:.35,afterglow:500,cloudGlow:1,color:'#8edaff',windDirection:[.025,-.012,.008],lightDirection:[-.35,.45,.3],offset:[0,0,0],scale:[1,1,1],interactive:true,pauseWhenHidden:false,...options};
  this.events=new AbortController();this.pointer={x:0,y:0,active:false};this.lightning=new Lightning(null,{...(options.seed!==undefined?{seed:options.seed}:{}),onStrike:event=>this.options.onStrike?.(event)});this.options.seed=this.lightning.getState().settings.seed;
  this.externalLights=[];this.externalSegments=[];this.time=this.nextRender=this.frame=this.sleepTimer=0;this.last=this.visibilityObserver=null;this.visible=true;this.running=this.paused=this.destroyed=false;
  const gl=this.gl;
  this.loseExtension=gl.isContextLost()?lostExtensions.get(canvas)||null:gl.getExtension('WEBGL_lose_context');
  if(this.loseExtension)lostExtensions.set(canvas,this.loseExtension);
  this.measurements=[];this.renderScale=1;this.gpuMs=this.frameMs=null;this.timingSamples=this.adjustAt=this.paceAt=this.paceSamples=this.paceAdjustAt=0;
  this.device=deviceProfile(gl);
  this.lightBuffers={positions:new Float32Array(12),colors:new Float32Array(9),starts:new Float32Array(128),ends:new Float32Array(128),boltColors:new Float32Array(96),radii:new Float32Array(3)};
  this.program=this.buffer=this.amortized=this.presentProgram=this.presentJob=this.compileJob=this.fieldTexture=this.timer=this.fieldData=this.ready=this.resolveReady=this.rejectReady=null;
  this.position=this.compiledSteps=this.compiledBolts=0;this.uniforms={};this.failed=this.hasField=false;this.extent=[2,2,2];
  this.customUniforms=Object.fromEntries(Object.entries(options.uniforms||{}).map(([key,value])=>[key,{value:Array.isArray(value)?value.slice():value,location:null}]));
  this.fragmentSource=customFragment(options.densityShader,options.uniforms);
  this.reduced=globalThis.matchMedia?.('(prefers-reduced-motion: reduce)');this.paused=this.reduced?.matches||false;
  const listen=(target,name,fn)=>target?.addEventListener?.(name,fn,{signal:this.events.signal});
  if(this.options.interactive){
   listen(canvas,'pointermove',e=>this.setPointer(e));listen(canvas,'pointerdown',e=>this.setPointer(e));
   listen(canvas,'pointerleave',e=>{if(e.pointerType!=='touch')this.pointer.active=false;});
   listen(canvas,'pointercancel',()=>{this.pointer.active=false;this.lightning.clear();});
  }
  listen(this.reduced,'change',e=>this.setPaused(e.matches));
  listen(globalThis.document,'visibilitychange',()=>{this.last=null;if(globalThis.document.hidden){this.cancelSchedule();this.lightning.clear();}else if(this.running)this.schedule();});
  listen(canvas,'webglcontextlost',e=>{
   e.preventDefault();this.cancelSchedule();this.last=null;
   this.cancelCompile('compileJob');this.cancelCompile('presentJob');
   programCaches.delete(gl);
   this.measurements.length=0;this.amortized=this.presentProgram=this.program=this.buffer=this.fieldTexture=this.timer=null;this.compiledSteps=this.compiledBolts=0;
   this.options.onContextLost?.();
  });
  listen(canvas,'webglcontextrestored',()=>{
   if(this.destroyed||this.failed)return;
   this.resize(this.width,this.height);this.initGpu();
   if(this.program){
    if(this.running&&!this.paused)this.schedule();
    else if(this.paused)this.render(this.time,0);
   }
   this.options.onContextRestored?.();
  });
  try{
   this.setOptions({quality:this.options.quality,...options});
   this.resize();
   if(gl.isContextLost()){
    this.ensureReady();
    this.loseExtension?.restoreContext?.();
   }else this.initGpu();
   if(globalThis.ResizeObserver){this.observer=new ResizeObserver(()=>this.resize());this.observer.observe(canvas);}
   if(options.autoStart!==false)this.start();
  }catch(error){this.destroy();throw error;}
 }
 ensureReady(){if(!this.ready){this.ready=new Promise((resolve,reject)=>{this.resolveReady=resolve;this.rejectReady=reject;});this.ready.catch(()=>{});}}
 settleReady(program,maxSteps,bolts,fromAsync=false){
  this.activateProgram(program,maxSteps,bolts);
  const first=Boolean(this.resolveReady);
  if(!this.ready)this.ready=Promise.resolve(this);
  else{this.resolveReady?.(this);this.resolveReady=this.rejectReady=null;}
  if(fromAsync){
   if(first){if(this.paused){if(this.running||this.reduced?.matches)this.render(this.time,0);}else if(this.running){this.render(this.time,0);this.schedule();}}
   else if(this.paused)this.render(this.time,0);
  }
 }
 cancelCompile(slot,deleteResources=false){
  const job=this[slot];if(!job)return;
  if(job.raf)cancelAnimationFrame(job.raf);if(job.timer)clearTimeout(job.timer);
  if(deleteResources&&!this.gl.isContextLost()){for(const s of job.shaders)this.gl.deleteShader(s);this.gl.deleteProgram(job.program);}
  this[slot]=null;
 }
 pollCompile(slot,ext,onLinked){
  const job=this[slot];if(!job)return;
  if(this.destroyed||this.failed||this.gl.isContextLost()){this.cancelCompile(slot);return;}
  if(this.gl.getProgramParameter(job.program,ext.COMPLETION_STATUS_KHR)){
   this.cancelCompile(slot);
   try{onLinked(finishProgram(this.gl,job));}catch(error){this.failAsync(error);}
   return;
  }
  const step=()=>{if(job.raf)cancelAnimationFrame(job.raf);if(job.timer)clearTimeout(job.timer);job.raf=job.timer=0;this.pollCompile(slot,ext,onLinked);};
  if(typeof requestAnimationFrame==='function')job.raf=requestAnimationFrame(step);
  job.timer=setTimeout(step,16);
 }
 activateProgram(program,maxSteps,bolts){
  const gl=this.gl;this.program=program;this.compiledSteps=maxSteps;this.compiledBolts=bolts;
  gl.useProgram(program);gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer);
  const position=gl.getAttribLocation(program,'aPosition');gl.enableVertexAttribArray(position);gl.vertexAttribPointer(position,2,gl.FLOAT,false,0,0);
  this.position=position;
  this.uniforms=Object.fromEntries(U_ALL.map(k=>[k,gl.getUniformLocation(program,k)]));
  for(const [key,entry]of Object.entries(this.customUniforms))entry.location=gl.getUniformLocation(program,key);
  gl.uniform1i(this.uniforms.uField,0);
 }
 ensureProgram(){
  const gl=this.gl;if(gl.isContextLost()||this.failed||this.destroyed||!this.buffer)return;
  const maxSteps=Math.max(this.compiledSteps,stepBucket(this.options.raySteps));
  const bolts=this.compiledBolts>0||this.options.lightning||this.externalSegments.length>0?32:0;
  if(this.program&&maxSteps<=this.compiledSteps&&bolts<=this.compiledBolts||this.compileJob&&this.compileJob.maxSteps>=maxSteps&&this.compileJob.bolts>=bolts)return;
  this.cancelCompile('compileJob',true);
  let cache=programCaches.get(gl);if(!cache){cache=new Map();programCaches.set(gl,cache);}
  const source=customFragment(this.options.densityShader,this.options.uniforms,{maxSteps,bolts});
  if(cache.has(source)){this.settleReady(cache.get(source),maxSteps,bolts);return;}
  const parallel=gl.getExtension('KHR_parallel_shader_compile'),job={...beginProgram(gl,source,0),maxSteps,bolts};
  if(parallel&&typeof parallel.COMPLETION_STATUS_KHR==='number'){
   this.ensureReady();this.compileJob=job;
   this.pollCompile('compileJob',parallel,program=>{cache.set(source,program);this.settleReady(program,maxSteps,bolts,true);});
  }else{
   const program=finishProgram(gl,job);cache.set(source,program);this.settleReady(program,maxSteps,bolts);
  }
 }
 failAsync(error){
  if(this.destroyed||this.failed)return;
  this.failed=true;this.releaseGpu();
  this.rejectReady?.(error);this.resolveReady=this.rejectReady=null;
  this.options.onError?.(error);
 }
 releaseGpu(){
  this.cancelSchedule();this.last=null;
  this.cancelCompile('compileJob',true);this.cancelCompile('presentJob',true);
  this.observer?.disconnect();this.visibilityObserver?.disconnect();this.visibilityObserver=null;this.lightning.clear();
  if(!this.gl.isContextLost()){
   for(const query of this.measurements)this.gl.deleteQuery(query);
   this.releaseAmortized();
   if(this.presentProgram)this.gl.deleteProgram(this.presentProgram);
   if(this.fieldTexture)this.gl.deleteTexture(this.fieldTexture);
   if(this.buffer)this.gl.deleteBuffer(this.buffer);
   const cache=programCaches.get(this.gl);
   if(cache){for(const p of cache.values())this.gl.deleteProgram(p);programCaches.delete(this.gl);}
   else if(this.program)this.gl.deleteProgram(this.program);
   this.canvas.addEventListener?.('webglcontextlost',e=>e.preventDefault(),{once:true});
   this.loseExtension?.loseContext?.();
  }
  this.measurements.length=0;this.amortized=this.presentProgram=this.fieldTexture=this.buffer=this.program=null;this.compiledSteps=this.compiledBolts=0;
 }
 initGpu(){
  const gl=this.gl;if(gl.isContextLost()||this.failed)return;
  if(!this.loseExtension){this.loseExtension=gl.getExtension('WEBGL_lose_context');if(this.loseExtension)lostExtensions.set(this.canvas,this.loseExtension);}
  const timer=gl.getExtension('EXT_disjoint_timer_query_webgl2');
  this.timer=timer&&typeof timer.TIME_ELAPSED_EXT==='number'?timer:null;
  this.measurements=[];this.amortized=this.presentProgram=null;
  this.cancelCompile('compileJob',true);this.cancelCompile('presentJob',true);
  this.buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);
  this.fieldTexture=gl.createTexture();gl.bindTexture(gl.TEXTURE_3D,this.fieldTexture);
  texParam(gl,gl.TEXTURE_3D,gl.LINEAR,[gl.TEXTURE_WRAP_S,gl.TEXTURE_WRAP_T,gl.TEXTURE_WRAP_R]);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT,1);
  if(this.hasField&&this.fieldData)gl.texImage3D(gl.TEXTURE_3D,0,gl.R8,this.fieldData.width,this.fieldData.height,this.fieldData.depth,0,gl.RED,gl.UNSIGNED_BYTE,this.fieldData.data);
  else gl.texImage3D(gl.TEXTURE_3D,0,gl.R8,1,1,1,0,gl.RED,gl.UNSIGNED_BYTE,new Uint8Array([0]));
  this.ensureProgram();
 }
 setOptions(patch={}){
  const previousFps=this.options.fps;
  for(const key of ['interactive','autoStart','powerPreference','failIfMajorPerformanceCaveat'])if(key in patch&&patch[key]!==this.options[key])throw new TypeError('Changing '+key+' requires a new CloudScene.');
  for(const key of CALLBACKS)if(key in patch&&patch[key]!=null&&typeof patch[key]!=='function')throw new TypeError(key+' must be a function.');
  for(const key of ['color','cloudColor','background'])if(key in patch&&!(typeof patch[key]==='string'&&/^#[0-9a-f]{6}$/i.test(patch[key])||Array.isArray(patch[key])&&patch[key].length===3&&Array.from(patch[key]).every(Number.isFinite)))throw new TypeError(key+' must be a hex color or RGB vector.');
  for(const key of ['lightning','transparent','interactive','autoStart','pauseWhenHidden'])if(key in patch&&typeof patch[key]!=='boolean')throw new TypeError(key+' must be boolean.');
  if('densityShader' in patch&&patch.densityShader!==this.options.densityShader)throw new TypeError('A new densityShader requires a new CloudScene.');
  if('quality' in patch&&patch.quality!=='auto'&&!Object.hasOwn(profiles,patch.quality))throw new RangeError('quality must be auto, cpu, low, medium, or high');
  if('preset' in patch&&!Object.hasOwn(CloudPresets,patch.preset))throw new RangeError('Unknown cloud preset.');
  if('timeOfDay' in patch&&patch.timeOfDay!=='custom'&&!Object.hasOwn(CloudTimes,patch.timeOfDay))throw new RangeError('Unknown time of day.');
  if('shape' in patch&&!['layer','sphere'].includes(patch.shape))throw new RangeError('shape must be layer or sphere; use setDensityField for other shapes.');
  if('lightningMode' in patch&&!CloudControls.lightningModes.includes(patch.lightningMode))throw new RangeError('Unknown lightning mode.');
  for(const key of Object.keys(ranges))if(key in patch&&!Number.isFinite(Number(patch[key])))throw new TypeError(key+' must be finite.');
  for(const key of U_VEC3)if(key in patch&&(!Array.isArray(patch[key])||patch[key].length!==3||!Array.from(patch[key]).every(Number.isFinite)||key==='scale'&&patch[key].some(n=>n<=0)))throw new TypeError(key+' must be a finite 3D vector (positive for scale).');
  if('seed' in patch&&!Number.isFinite(patch.seed))throw new TypeError('seed must be finite.');
  if(patch.uniforms)this.setUniforms(patch.uniforms);
  if(patch.preset)Object.assign(this.options,CloudPresets[patch.preset],{preset:patch.preset});
  if('timeOfDay' in patch){
   this.options.timeOfDay=patch.timeOfDay;
   if(patch.timeOfDay!=='custom'){const t=CloudTimes[patch.timeOfDay];Object.assign(this.options,{cloudColor:t.lit.slice(),background:t.background.slice(),ambient:t.ambient,lightDirection:[t.direction[0],-t.direction[1],t.direction[2]]});}
  }
  if('transparent' in patch)this.options.backgroundOpacity=patch.transparent?0:1;
  if(patch.quality)Object.assign(this.options,profiles[patch.quality==='auto'?this.device.profile:patch.quality]);
  for(const key of ['quality','color','lightning','lightningMode','shape','cloudColor','background','pauseWhenHidden',...U_VEC3,...CALLBACKS])if(key in patch)this.options[key]=Array.isArray(patch[key])?patch[key].slice():patch[key];
  for(const [key,{min,max}]of Object.entries(ranges))if(key in patch)this.options[key]=clamp(patch[key],min,max);
  if('seed' in patch){this.lightning.configure('seed',patch.seed);this.options.seed=this.lightning.getState().settings.seed;}
  for(const [key,kind]of Object.entries(lightningSettings))if(key in patch)this.lightning.configure(kind,this.options[key]);
  if('lightningMode' in patch)this.lightning.configure('mode',this.options.lightningMode);
  this.options.transparent=this.options.backgroundOpacity===0;
  if(this.options.fps!==previousFps)this.last=null;
  if('pauseWhenHidden' in patch){
   if(this.options.pauseWhenHidden){
    if(!this.visibilityObserver&&globalThis.IntersectionObserver){
     this.visibilityObserver=new IntersectionObserver(entries=>{
      const entry=entries.at(-1);if(!entry)return;
      const next=Boolean(entry.isIntersecting);if(next===this.visible)return;
      this.visible=next;this.last=null;
      if(!next)this.cancelSchedule();
      else if(this.running)this.schedule();
     });
     this.visibilityObserver.observe(this.canvas);
    }
   }else{
    this.visibilityObserver?.disconnect();this.visibilityObserver=null;
    if(!this.visible){this.visible=true;this.last=null;if(this.running)this.schedule();}
   }
  }
  if('adaptiveQuality' in patch&&!this.options.adaptiveQuality)this.renderScale=1;
  this.renderScale=Math.max(this.options.minRenderScale,this.renderScale);
  if(this.width&&['adaptiveQuality','minRenderScale','quality','resolutionScale','resolutionLimit','pixelRatio'].some(key=>key in patch))this.resize(this.width,this.height);
  if(this.buffer)this.ensureProgram();
  return this;
 }
 setTimeOfDay(preset,overrides={}){return this.setOptions({timeOfDay:preset,...overrides});}
 getOptions(){return JSON.parse(JSON.stringify({...this.options,uniforms:Object.fromEntries(Object.entries(this.customUniforms).map(([key,entry])=>[key,entry.value]))}));}
 setUniforms(patch){
  for(const [key,value]of Object.entries(patch)){
   const current=this.customUniforms[key],array=Array.isArray(value)?value:[value];
   if(!Object.hasOwn(this.customUniforms,key)||!Array.from(array).every(Number.isFinite)||array.length!==(Array.isArray(current.value)?current.value.length:1))throw new TypeError('Unknown or incompatible custom uniform: '+key);
  }
  for(const [key,value]of Object.entries(patch))this.customUniforms[key].value=Array.isArray(value)?value.slice():value;
  return this;
 }
 setDensityField(data,{width,height,depth,extent=[2,2,2]}={}){
  const max=this.gl.isContextLost()?256:this.gl.getParameter(this.gl.MAX_3D_TEXTURE_SIZE)||256;
  if(!(data instanceof Uint8Array)||![width,height,depth].every(n=>Number.isInteger(n)&&n>0&&n<=max)||data.length!==width*height*depth)throw new RangeError('Expected a Uint8Array matching valid width × height × depth.');
  if(!Array.isArray(extent)||extent.length!==3||!Array.from(extent).every(n=>Number.isFinite(n)&&n>0))throw new RangeError('extent must contain three positive half extents.');
  this.fieldData={data:data.slice(),width,height,depth};this.extent=extent.slice();this.hasField=true;
  const gl=this.gl;if(!gl.isContextLost()&&this.fieldTexture){gl.bindTexture(gl.TEXTURE_3D,this.fieldTexture);gl.pixelStorei(gl.UNPACK_ALIGNMENT,1);gl.texImage3D(gl.TEXTURE_3D,0,gl.R8,width,height,depth,0,gl.RED,gl.UNSIGNED_BYTE,this.fieldData.data);}
  return this;
 }
 clearDensityField(){this.hasField=false;this.fieldData=null;return this;}
 resize(width,height){
  if(width!==undefined&&(!Number.isFinite(width)||width<=0)||height!==undefined&&(!Number.isFinite(height)||height<=0))throw new RangeError('Canvas dimensions must be finite and positive.');
  const rect=this.canvas.getBoundingClientRect?.();this.width=Math.max(1,width||rect?.width||this.canvas.clientWidth||640);this.height=Math.max(1,height||rect?.height||this.canvas.clientHeight||480);
  const maximum=(!this.gl.isContextLost()&&this.gl.getParameter(this.gl.MAX_RENDERBUFFER_SIZE))||this.options.resolutionLimit;
  const scale=Math.min(this.options.pixelRatio*this.options.resolutionScale,this.options.resolutionLimit/Math.max(this.width,this.height),maximum/Math.max(this.width,this.height));
  const pixelsX=Math.max(1,Math.round(this.width*scale*this.renderScale)),pixelsY=Math.max(1,Math.round(this.height*scale*this.renderScale));
  if(this.canvas.width!==pixelsX)this.canvas.width=pixelsX;if(this.canvas.height!==pixelsY)this.canvas.height=pixelsY;
  this.lightning.resize(this.width,this.height,1);if(this.paused)this.render(this.time,0);
 }
 setPointer(event,y){const x=typeof event==='number'?event:event?.clientX,nextY=typeof event==='number'?y:event?.clientY;if(!Number.isFinite(x)||!Number.isFinite(nextY))throw new TypeError('Pointer coordinates must be finite.');if(typeof event==='number'){this.pointer={x,y:nextY,active:true};return;}const rect=this.canvas.getBoundingClientRect();this.pointer={x:x-rect.left,y:nextY-rect.top,active:true};}
 clearPointer(){this.pointer.active=false;}
 clearLightning(){this.lightning.clear();}
 setSources(lights=[],segments=[]){
  const color=value=>value===undefined||typeof value==='string'&&/^#[0-9a-f]{6}$/i.test(value)||Array.isArray(value)&&value.length===3&&Array.from(value).every(Number.isFinite);
  const point=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y);
  if(!Array.isArray(lights)||!Array.isArray(segments)||Array.from(lights).some(l=>!point(l)||!Number.isFinite(l.strength)||l.strength<0||l.depth!==undefined&&!Number.isFinite(l.depth)||l.radius!==undefined&&(!Number.isFinite(l.radius)||l.radius<0)||!color(l.color))||Array.from(segments).some(s=>!s||!point(s.a)||!point(s.b)||!Number.isFinite(s.strength)||s.strength<0||!color(s.color)))throw new TypeError('Expected finite light sources and bolt endpoints.');
  const copyColor=s=>({...s,...(Array.isArray(s.color)?{color:s.color.slice()}:{})});
  this.externalLights=lights.slice(0,3).map(copyColor);this.externalSegments=segments.slice(0,32).map(s=>({...copyColor(s),a:{...s.a},b:{...s.b}}));
  if(this.buffer&&this.externalSegments.length>0)this.ensureProgram();
 }
 reportError(error){
  if(this.options.onError)this.options.onError(error);
  else console.error(error);
 }
 cancelSchedule(){
  if(this.sleepTimer){clearTimeout(this.sleepTimer);this.sleepTimer=0;}
  if(this.frame){cancelAnimationFrame(this.frame);this.frame=0;}
 }
 setPaused(value){const next=Boolean(value);if(next===this.paused)return;this.paused=next;this.last=null;if(this.paused){this.cancelSchedule();this.lightning.clear();this.render(this.time,0);}else if(this.running)this.schedule();}
 strike(x=this.pointer.x,y=this.pointer.y){this.setPointer(x,y);this.lightning.trigger();}
 canSchedule(){return !this.destroyed&&!this.failed&&this.running&&!this.paused&&this.visible&&!globalThis.document?.hidden&&!this.gl.isContextLost();}
 schedule(now){
  if(!this.canSchedule()||this.frame||this.sleepTimer)return;
  if(now!==undefined&&this.last!==null){
   const wait=this.nextRender-now;
   if(wait>24){
    this.sleepTimer=setTimeout(()=>{this.sleepTimer=0;if(this.canSchedule()&&!this.frame)this.frame=requestAnimationFrame(t=>this.tick(t));},Math.max(1,Math.floor(wait-4)));
    return;
   }
  }
  this.frame=requestAnimationFrame(t=>this.tick(t));
 }
 tick(now){
  this.frame=0;if(!this.canSchedule())return;
  const fresh=this.last===null,interval=1000/this.options.fps;
  if(fresh||now+.5>=this.nextRender){
   const dt=fresh?interval/1000:Math.min(.5,(now-this.last)/1000);
   this.nextRender=fresh?now+interval:this.nextRender+(Math.floor(Math.max(0,now+.5-this.nextRender)/interval)+1)*interval;
   this.last=now;this.time+=dt*this.options.drift;
   if(this.options.beforeRender)try{this.options.beforeRender({time:this.time,dt,width:this.canvas.width,height:this.canvas.height});}catch(error){this.reportError(error);}
   if(!this.canSchedule())return;
   this.render(this.time,dt);if(!this.timer)this.pace(now,fresh);
  }
  this.schedule(now);
 }
 // Automatic resolution without a GPU timer (software WebGL, most phones): the frame cadence. A busy GPU or CPU
 // renderer delays the next animation frame, so frames arriving well after their slot lower the render scale and a
 // sustained on-time cadence slowly restores it. A frame waits for a display refresh, so ~17 ms late is on time.
 pace(now,fresh){
  if(!this.options.adaptiveQuality)return;
  const gap=now-this.paceAt;this.paceAt=now;
  if(fresh||gap>1000)return;
  this.frameMs=this.frameMs===null?gap:this.frameMs*.8+gap*.2;this.paceSamples++;
  if(this.paceSamples<12||this.paceSamples-this.paceAdjustAt<8)return;
  const budget=1000/this.options.fps;let scale=this.renderScale;
  if(this.frameMs>budget*1.3+17)scale*=Math.max(.8,Math.sqrt((budget+17)/this.frameMs));
  else if(this.frameMs<budget+17&&this.paceSamples-this.paceAdjustAt>=24)scale+=.05;
  scale=Math.max(this.options.minRenderScale,Math.min(1,scale));
  if(Math.abs(scale-this.renderScale)>.01){this.renderScale=scale;this.paceAdjustAt=this.paceSamples;this.resize(this.width,this.height);}
 }
 start(){if(this.destroyed)throw new Error('CloudScene was destroyed.');if(this.failed)return this;this.running=true;this.schedule();return this;}
 stop(){this.running=false;this.cancelSchedule();this.last=null;return this;}
 getPerformance(){return {gpuTimingAvailable:Boolean(this.timer),gpuMs:this.gpuMs,frameMs:this.frameMs,renderScale:this.renderScale,width:this.canvas.width,height:this.canvas.height,software:this.device.software,profile:this.options.quality==='auto'?this.device.profile:this.options.quality,contextLost:Boolean(this.gl.isContextLost())};}
 pollTiming(){
  if(!this.timer||!this.measurements.length)return;
  const gl=this.gl,disjoint=gl.getParameter(this.timer.GPU_DISJOINT_EXT);
  while(this.measurements.length){
   const query=this.measurements[0];
   if(!disjoint&&!gl.getQueryParameter(query,gl.QUERY_RESULT_AVAILABLE))break;
   this.measurements.shift();
   const ms=disjoint?null:gl.getQueryParameter(query,gl.QUERY_RESULT)/1e6;gl.deleteQuery(query);
   if(ms===null||!Number.isFinite(ms)||ms<=0)continue;
   this.gpuMs=this.gpuMs===null?ms:this.gpuMs*.8+ms*.2;this.timingSamples++;
   if(!this.options.adaptiveQuality||this.timingSamples<12||this.timingSamples-this.adjustAt<8)continue;
   let scale=this.renderScale;
   if(this.gpuMs>this.options.gpuBudgetMs*1.15)scale*=Math.max(.8,Math.sqrt(this.options.gpuBudgetMs/this.gpuMs));
   else if(this.gpuMs<this.options.gpuBudgetMs*.65)scale+=.05;
   scale=Math.max(this.options.minRenderScale,Math.min(1,scale));
   if(Math.abs(scale-this.renderScale)>.01){this.renderScale=scale;this.adjustAt=this.timingSamples;this.resize(this.width,this.height);}
  }
 }
 render(time=this.time,dt=0){
  if(!Number.isFinite(time)||!Number.isFinite(dt)||dt<0)throw new TypeError('Render time and dt must be finite; dt must be nonnegative.');
  const gl=this.gl;if(this.destroyed||this.failed||gl.isContextLost()||!this.program)return false;
  this.pollTiming();
  const color=rgb(this.options.color);
  const active=this.options.lightning&&!this.paused&&(this.options.lightningMode!=='hover'||this.pointer.active)&&!this.reduced?.matches;
  this.lightning.update(dt,{...this.pointer,color,enabled:active,bounds:{x:0,y:0,width:this.width,height:this.height}},(reach,origin)=>Array.from({length:12},(_,i)=>{const a=i*.618*6.283;return{x:origin.x+Math.cos(a)*reach*(.4+i/24),y:origin.y+Math.sin(a)*reach*(.4+i/24)};}));
  if(this.destroyed||gl.isContextLost())return false;
  const bands=Math.round(this.options.amortize),amortized=bands>1?this.amortizedTargets(bands):null;
  if(!amortized&&this.amortized)this.releaseAmortized();
  if(amortized&&this.paused)amortized.ready=false;   // a still frame is drawn whole
  // Amortized, one cloud frame keeps the uniforms (time, lights) it started with, so its bands match.
  if(amortized&&amortized.ready&&amortized.band>0)return this.drawFrame(amortized,bands,time);
  const lights=[...this.externalLights,...(this.options.lightning?this.lightning.getLights():[])];
  const segments=[...this.externalSegments,...(this.options.lightning?this.lightning.getSegments():[])];
  const {positions,colors,starts,ends,boltColors,radii}=this.lightBuffers;
  for(const buffer of Object.values(this.lightBuffers))buffer.fill(0);
  const aspect=this.canvas.width/this.canvas.height;
  const position=p=>[(p.x/this.width-.5)*aspect*this.options.viewScale,(.5-p.y/this.height)*this.options.viewScale];
  lights.slice(0,3).forEach((l,i)=>{const p=position(l);positions.set([p[0],p[1],l.depth||0,clamp(l.strength,0,3)*6],i*4);colors.set(rgb(l.color||color),i*3);radii[i]=l.radius??1;});
  segments.slice(0,32).forEach((s,i)=>{const a=position(s.a),b=position(s.b);starts.set([a[0],a[1],0,clamp(s.strength,0,3)],i*4);ends.set([b[0],b[1],0,0],i*4);boltColors.set(rgb(s.color||color),i*3);});
  gl.useProgram(this.program);gl.viewport(0,0,this.canvas.width,this.canvas.height);
  gl.uniform2f(this.uniforms.uResolution,this.canvas.width,this.canvas.height);gl.uniform1f(this.uniforms.uTime,time);
  gl.uniform1f(this.uniforms.uCoverage,this.options.coverage);gl.uniform1f(this.uniforms.uAmbient,this.options.ambient);gl.uniform1f(this.uniforms.uExposure,this.options.exposure);gl.uniform1f(this.uniforms.uSteps,Math.min(this.options.raySteps,this.compiledSteps||96));
  for(const [key,name]of U_FLOAT)gl.uniform1f(this.uniforms[name],this.options[key]);
  for(const key of U_VEC3)gl.uniform3fv(this.uniforms['u'+key[0].toUpperCase()+key.slice(1)],this.options[key]);
  for(const {value,location}of Object.values(this.customUniforms))if(Array.isArray(value))gl['uniform'+value.length+'fv'](location,value);else gl.uniform1f(location,value);
  gl.uniform1i(this.uniforms.uPreset,Object.keys(CloudPresets).indexOf(this.options.preset));
  gl.uniform1i(this.uniforms.uShape,this.options.shape==='sphere'?1:0);gl.uniform1f(this.uniforms.uDetail,this.options.detail);
  gl.uniform3fv(this.uniforms.uCloudColor,rgb(this.options.cloudColor));gl.uniform3fv(this.uniforms.uBackground,rgb(this.options.background));
  gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_3D,this.fieldTexture);gl.uniform1i(this.uniforms.uField,0);gl.uniform1i(this.uniforms.uHasField,this.hasField?1:0);gl.uniform3fv(this.uniforms.uExtent,this.extent);
  gl.uniform1fv(this.uniforms['uLightRadii[0]'],radii);gl.uniform4fv(this.uniforms['uLights[0]'],positions);gl.uniform3fv(this.uniforms['uLightColors[0]'],colors);
  if(this.compiledBolts>0){gl.uniform4fv(this.uniforms['uBolts[0]'],starts);gl.uniform4fv(this.uniforms['uBoltEnds[0]'],ends);gl.uniform3fv(this.uniforms['uBoltColors[0]'],boltColors);gl.uniform1i(this.uniforms.uBoltCount,Math.min(this.compiledBolts,segments.length));}
  return this.drawFrame(amortized,bands,time);
 }
 drawFrame(amortized,bands,time){
  const gl=this.gl;
  // Never wait for the GPU: read only completed queries on later frames.
  const query=this.timer&&this.options.adaptiveQuality&&this.measurements.length<3?gl.createQuery():null;
  if(query)gl.beginQuery(this.timer.TIME_ELAPSED_EXT,query);
  if(amortized)this.drawBand(amortized,bands);
  else{gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.drawArrays(gl.TRIANGLES,0,6);}
  if(query){gl.endQuery(this.timer.TIME_ELAPSED_EXT);this.measurements.push(query);}
  if(this.options.onFrame)try{this.options.onFrame({time,width:this.canvas.width,height:this.canvas.height,lightning:this.lightning.getState()});}catch(error){this.reportError(error);}
  return true;
 }
 // Three canvas-sized targets: the previous and next finished cloud frames, and the one being drawn.
 amortizedTargets(bands){
  const gl=this.gl,width=this.canvas.width,height=this.canvas.height;
  if(!this.presentProgram){
   if(!this.presentJob){
    const parallel=gl.getExtension('KHR_parallel_shader_compile');
    const job=beginProgram(gl,presentFragment,this.position);
    const setup=program=>{
     this.presentProgram=program;this.presentMix=gl.getUniformLocation(program,'uMix');
     gl.useProgram(program);gl.uniform1i(gl.getUniformLocation(program,'uPrev'),1);gl.uniform1i(gl.getUniformLocation(program,'uNext'),2);
     if(this.program)gl.useProgram(this.program);
    };
    if(parallel&&typeof parallel.COMPLETION_STATUS_KHR==='number'){
     this.presentJob=job;
     this.pollCompile('presentJob',parallel,setup);
     return null;
    }
    setup(finishProgram(gl,job));
   }else return null;
  }
  if(this.amortized?.width===width&&this.amortized.height===height){
   if(this.amortized.bands!==bands){this.amortized.bands=bands;this.amortized.band=0;this.amortized.ready=false;}
   return this.amortized;
  }
  this.releaseAmortized();
  const target=()=>{
   const texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,texture);
   texParam(gl,gl.TEXTURE_2D,gl.NEAREST);
   gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,width,height,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
   const framebuffer=gl.createFramebuffer();gl.bindFramebuffer(gl.FRAMEBUFFER,framebuffer);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,texture,0);
   return {texture,framebuffer};
  };
  gl.bindFramebuffer(gl.FRAMEBUFFER,null);
  this.amortized={width,height,bands,targets:[target(),target(),target()],prev:0,next:1,work:2,band:0,ready:false};
  gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.useProgram(this.program);
  return this.amortized;
 }
 drawBand(a,bands){
  const gl=this.gl,rows=Math.ceil(a.height/bands),count=Math.ceil(a.height/rows),fill=(target,from,to)=>{
   gl.bindFramebuffer(gl.FRAMEBUFFER,a.targets[target].framebuffer);gl.viewport(0,0,a.width,a.height);gl.enable(gl.SCISSOR_TEST);gl.scissor(0,from,a.width,to-from);
   gl.drawArrays(gl.TRIANGLES,0,6);gl.disable(gl.SCISSOR_TEST);
  };
  if(!a.ready){fill(a.next,0,a.height);a.prev=a.next;a.work=[0,1,2].find(i=>i!==a.next);a.band=0;a.ready=true;}
  else{
   const from=a.band*rows,to=Math.min(a.height,from+rows);
   fill(a.work,from,to);a.band++;
   if(to>=a.height){const done=a.work;a.prev=a.next;a.next=done;a.work=[0,1,2].find(i=>i!==a.prev&&i!==a.next);a.band=0;}
  }
  // Show prev → next by the share of the cloud frame in progress: when it finishes, the old next becomes prev at 0.
  gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.useProgram(this.presentProgram);
  gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,a.targets[a.prev].texture);
  gl.activeTexture(gl.TEXTURE2);gl.bindTexture(gl.TEXTURE_2D,a.targets[a.next].texture);
  gl.uniform1f(this.presentMix,a.band/count);gl.drawArrays(gl.TRIANGLES,0,6);
  gl.activeTexture(gl.TEXTURE0);gl.useProgram(this.program);
 }
 releaseAmortized(){
  if(!this.amortized)return;
  if(!this.gl.isContextLost())for(const {texture,framebuffer}of this.amortized.targets){this.gl.deleteFramebuffer(framebuffer);this.gl.deleteTexture(texture);}
  this.amortized=null;
 }
 destroy(){
  if(this.destroyed)return;this.stop();this.destroyed=true;this.events.abort();this.releaseGpu();
 }
}
CloudScene.createFragmentShader=customFragment;
CloudScene.vertexShader=vertex;CloudScene.fragmentShader=fragment;CloudScene.presentFragmentShader=presentFragment;
export class StormClouds extends CloudScene {
 constructor(canvas,options={}){super(canvas,{preset:'storm',...options});}
}
