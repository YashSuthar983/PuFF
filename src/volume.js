import { CloudControls } from './config.js';
/* Continuous vapor advection and sunlit volumetric cloud rendering. */
  const vertex = `#version 300 es
  in vec2 aPosition;
  void main() { gl_Position = vec4(aPosition, 0.0, 1.0); }`;
  const fragment = `#version 300 es
  precision highp float;
  uniform sampler2D uDensity;
  uniform sampler2D uFormation;
  uniform vec2 uSize;
  uniform vec2 uResolution;
  uniform float uRadius;
  uniform float uTime;
  uniform float uDetailScale;
  uniform float uMarchSteps;
  uniform float uShadowStride;
  uniform float uVaporDensity;
  uniform vec3 uLightDirection;
  uniform float uGlare;
  uniform vec3 uGlareTint;
  uniform vec3 uPointLight;
  uniform vec3 uPointColor;
  uniform float uPointPower;
  uniform float uPointReach;
  uniform float uElectricGlow;
  uniform vec2 uEdgeFade;
  uniform vec3 uLit;
  uniform vec3 uShade;
  out vec4 color;
  float hash(vec3 p) {
    p = fract(p * 0.1031);
    p += dot(p, p.yzx + 33.33);
    return fract((p.x + p.y) * p.z);
  }
  float noise(vec3 p) {
    vec3 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash(i), hash(i+vec3(1,0,0)), f.x),
                   mix(hash(i+vec3(0,1,0)), hash(i+vec3(1,1,0)), f.x), f.y),
               mix(mix(hash(i+vec3(0,0,1)), hash(i+vec3(1,0,1)), f.x),
                   mix(hash(i+vec3(0,1,1)), hash(i+vec3(1,1,1)), f.x), f.y), f.z);
  }
  // Analytic gradient of the same coarse noise that makes the cloud billows.
  // This reveals their rounded faces without extra volume marches.
  vec3 billowGradient(vec3 p) {
    vec3 i=floor(p),f=fract(p),w=f*f*(3.0-2.0*f),dw=6.0*f*(1.0-f);
    float a=hash(i),b=hash(i+vec3(1,0,0)),c=hash(i+vec3(0,1,0)),d=hash(i+vec3(1,1,0));
    float e=hash(i+vec3(0,0,1)),g=hash(i+vec3(1,0,1)),h=hash(i+vec3(0,1,1)),j=hash(i+vec3(1,1,1));
    float low=mix(mix(a,b,w.x),mix(c,d,w.x),w.y);
    float high=mix(mix(e,g,w.x),mix(h,j,w.x),w.y);
    float dx=mix(mix(b-a,d-c,w.y),mix(g-e,j-h,w.y),w.z)*dw.x;
    float dy=mix(mix(c-a,d-b,w.x),mix(h-e,j-g,w.x),w.z)*dw.y;
    return vec3(dx,dy,(high-low)*dw.z);
  }
  float normalMatter(vec2 uv) {
    vec3 m=texture(uDensity,uv).rgb;
    return max(m.r,(m.g+m.b)*1.1);
  }
  vec3 directionOf(vec3 v) { return v/max(length(v),.0001); }
  float vapor(vec3 p) {
    float r = uRadius;
    vec3 q = p / r;
    vec3 drift = vec3(uTime * 0.055, -uTime * 0.036, uTime * 0.048);
    float billow = noise(q * 1.35 + drift);
    float detail = noise(q * 4.1 + vec3(7.2,3.7,1.9) + drift);
    float fringe = noise(q * 10.8 + vec3(2.1,8.9,4.3) + drift*.7);
    // Long, overlapping waves let the vapor wander without bending the whole word.
    float phase = uTime*.38;
    vec2 breeze = vec2(sin(q.y*.28+phase)+sin(q.x*.19-phase*.7)*.5,
                       cos(q.x*.24+phase*.8)) * r*.1;
    vec2 warp = vec2(billow-.5, detail-.5) * r * .52 * uDetailScale + breeze;
    vec2 sampleUV = (p.xy + warp) / uSize;
    if (any(lessThan(sampleUV, vec2(0))) || any(greaterThan(sampleUV, vec2(1)))) return 0.0;
    vec3 matter = texture(uDensity, sampleUV).rgb;
    float gathering = texture(uFormation, sampleUV).r;
    // Billows condense at different times, so arriving text grows out of vapor.
    float condensed = smoothstep(billow*.28, .7 + billow*.28, gathering);
    float m = matter.r * condensed;
    float shape = (m - .40) * 2.6 - q.z * q.z * .72;
    float turbulence = (billow * .65 + detail * .27 + fringe * .08 - .5) * 1.55 * uDetailScale;
    float breath = .91 + .09*sin(phase + q.x*.18 + q.y*.22);
    float porosity = .66 + .34*smoothstep(.2,.8,detail);
    float attached = max(0.0, shape + turbulence) * smoothstep(.12, .38, m)*.72*porosity*breath;
    float veil = max(0.0,(m-.22)*.7-q.z*q.z*.22+turbulence*.14);
    veil *= smoothstep(.1,.4,m)*.12;
    // Detached vapor has thin, broken edges instead of the solid body of a letter.
    float loose = 0.0;
    if (matter.g > .005) {
      float wisps = noise(q * vec3(2.0, 3.8, 2.7) + drift*1.8 + vec3(12,4,9));
      loose = max(0.0, matter.g * (1.55 + turbulence*.35) - q.z*q.z*.65);
      loose *= smoothstep(.005,.11,matter.g)*(.24 + .24*wisps);
    }
    // Tap vapor is material lifted from the letters, rendered as a broad,
    // translucent wake. Its scale stays airy even on small body text.
    float lifted = 0.0;
    if (matter.b > .003) {
      vec3 air = p / max(12.0, r);
      float folds = noise(air*vec3(1.1,2.3,1.4)+drift+vec3(4,11,7));
      lifted = max(0.0, matter.b*2.4-q.z*q.z*.32);
      lifted *= smoothstep(.003,.045,matter.b)*(.45+.35*folds)*.6*uVaporDensity;
    }
    return max(attached,max(loose,lifted))+veil;
  }
  vec2 shadowAt(vec3 p,vec3 direction,float beam){
    float sun=vapor(p+direction*uRadius*.38)*.38+vapor(p+direction*uRadius*.83)*.45+vapor(p+direction*uRadius*1.4)*.52;
    float point=0.0;
    if(beam>.001){vec3 lampDirection=directionOf(uPointLight-p);point=vapor(p)*.35+vapor(p+lampDirection*uRadius*.95)*1.4;}
    return vec2(sun,point);
  }
  void main() {
    vec2 uv = vec2(gl_FragCoord.x/uResolution.x, 1.0-gl_FragCoord.y/uResolution.y);
    // Empty sky avoids all ray marching work.
    vec3 matter = texture(uDensity, uv).rgb;
    if (matter.r < .16 && matter.g < .015 && matter.b < .006) { color = vec4(0); return; }
    vec2 xy = uv * uSize;
    float r = uRadius;
    float stepSize = r * 4.4 / uMarchSteps;
    float transmittance = 1.0;
    vec3 lightDirection = directionOf(uLightDirection);
    float beam = 0.0;
    float reach = max(1.0,uPointReach);
    if (uPointPower > .001) {
      beam = (1.0-smoothstep(reach*.15,reach,length(xy-uPointLight.xy)))*uPointPower;
    }
    vec2 fieldGradient=vec2(0);
    if (beam > .001) {
      float offset=max(1.0,r*.2);
      vec2 du=vec2(offset/uSize.x,0),dv=vec2(0,offset/uSize.y);
      fieldGradient=vec2(normalMatter(uv+du)-normalMatter(uv-du),
        normalMatter(uv+dv)-normalMatter(uv-dv))/(2.0*offset);
    }
    vec3 radiance = vec3(0);
    vec2 shadowA=vec2(0),shadowB=vec2(0);int shadowBlock=-99;
    float stride=max(1.0,floor(uShadowStride));
    for (int i = 0; i < 36; i++) {
      if (float(i) >= uMarchSteps) break;
      vec3 p = vec3(xy, r*2.2 - (float(i)+.5)*stepSize);
      float density = vapor(p);
      if (density > .015) {
        vec3 direction = lightDirection;
        vec2 shadow;
        if(stride<=1.0)shadow=shadowAt(p,direction,beam);
        else{
          int block=int(floor(float(i)/stride));
          if(block!=shadowBlock){
            vec3 anchor=vec3(xy,r*2.2-(float(block)*stride+.5)*stepSize);
            shadowA=block==shadowBlock+1?shadowB:shadowAt(anchor,direction,beam);
            shadowB=shadowAt(anchor-vec3(0,0,stride*stepSize),direction,beam);shadowBlock=block;
          }
          shadow=mix(shadowA,shadowB,fract(float(i)/stride));
        }
        float sunlight=exp(-shadow.x*.95);
        float illumination = .45 + .55*sunlight;
        vec3 scattering = mix(uShade,uLit,illumination);
        // Highlights follow exposed cloud surfaces and their lighting direction.
        float glare = min(.85, pow(sunlight,3.0)*uGlare);
        scattering = mix(scattering,uGlareTint,glare);
        if (beam > .001) {
          vec3 drift=vec3(uTime*.055,-uTime*.036,uTime*.048);
          vec3 gradient=vec3(fieldGradient*2.6,-1.44*p.z/(r*r));
          gradient+=billowGradient(p/r*1.35+drift)*(1.36*uDetailScale/r);
          vec3 normal=normalize(-gradient+vec3(0,0,.001));
          vec3 toLight=uPointLight-p;
          vec3 lampDirection=directionOf(toLight);
          // Vapor scatters light around its billows instead of reflecting it
          // like a polished solid. Sample optical depth toward the actual lamp,
          // and let scattered light softly fill sheltered parts of the cloud.
          float diffuse=.5+.5*dot(normal,lampDirection);
          float visibility=exp(-shadow.y*.85);
          float falloff=1.0/(1.0+dot(toLight,toLight)/(reach*reach));
          float scatteredFill=.2*exp(-shadow.y*.45);
          float rim=pow(1.0-abs(normal.z),2.0)*visibility*.08;
          vec3 lamp=mix(uLit,uPointColor,.9);
          float localIllumination=clamp(.28+diffuse*visibility*.55+scatteredFill+rim,.35,1.0);
          vec3 localLight=mix(uShade*.92,lamp,localIllumination);
          scattering=mix(scattering,localLight,min(.95,beam*falloff));
          scattering+=lamp*min(2.0,uElectricGlow)*visibility*(.35+.65*diffuse)*min(1.0,beam*falloff)*.45;
        }
        float opacity = 1.0-exp(-density*stepSize/r*1.85);
        radiance += transmittance*opacity*scattering;
        transmittance *= 1.0-opacity;
        if (transmittance < .015) break;
      }
    }
    float edge = 1.0;
    if (uEdgeFade.x > 0.0) edge *= smoothstep(0.0, uEdgeFade.x, xy.y);
    if (uEdgeFade.y > 0.0) edge *= smoothstep(0.0, uEdgeFade.y, uSize.y-xy.y);
    color = vec4(radiance, 1.0-transmittance) * edge;
  }`;

// Per-mask simulation state is isolated; programs and staging buffers are shared.
const layerKeys=['width','height','cell','gw','gh','radius','target','field','loose','nextLoose','advected','tapVapor','nextTapVapor','advectedTapVapor','tapRemaining','windColumns','windRows','windDiagonals','recovery','brushDistances','brushIndices','vx','vy','bytes','gustSpeed','frameAverage','frames','quality','dirty','densityDirty','settled','lastRecoveryRate','texture','formationTexture','options','outputWidth','outputHeight','puffs','time'];
const lostExtensions=new WeakMap();
function validateTime(dt){if(!Number.isFinite(dt)||dt<0)throw new TypeError('dt must be a finite, nonnegative time in seconds.');}
function validateOptions(options){
 for(const key of ['gridSize','minCell','minRadius','radiusFactor','renderWidth','renderHeight','raySteps','shadowStride'])if(options[key]!==undefined&&(!Number.isFinite(options[key])||options[key]<=0))throw new TypeError(key+' must be finite and positive.');
 for(const key of ['detailScale','edgeFadeTop','edgeFadeBottom'])if(options[key]!==undefined&&(!Number.isFinite(options[key])||options[key]<0))throw new TypeError(key+' must be finite and nonnegative.');
}
function validatePointer(pointer){
 if(!pointer||typeof pointer!=='object')throw new TypeError('Expected a cloud pointer.');
 for(const key of ['x','y','vx','vy'])if(pointer[key]!==undefined&&!Number.isFinite(pointer[key]))throw new TypeError('Pointer '+key+' must be finite.');
 if(pointer.segments!==undefined){
  if(!Array.isArray(pointer.segments))throw new TypeError('Pointer segments must be an array.');
  for(const segment of pointer.segments)if(!segment||!['ax','ay','bx','by'].every(key=>Number.isFinite(segment[key])))throw new TypeError('Sweep endpoints must be finite.');
 }
 if(pointer.effects!==undefined){
  if(!Array.isArray(pointer.effects))throw new TypeError('Pointer effects must be an array.');
  for(const effect of pointer.effects)if(!effect||!['puff','stir'].includes(effect.kind)||!Number.isFinite(effect.x)||!Number.isFinite(effect.y)||effect.strength!==undefined&&!Number.isFinite(effect.strength))throw new TypeError('Expected a finite puff or stir effect.');
 }
}
export class CloudVolume {
    constructor(options = {}) {
      validateOptions(options);this.options = {...options};
      this.layers=new Map();this.generation=0;this.destroyed=false;this.failed=false;this.compileJob=null;
      this.ready=null;this.resolveReady=null;this.rejectReady=null;
      this.physics=Object.fromEntries(Object.entries(CloudControls.volume).map(([key,value])=>[key,value.default]));
      this.configure(options.physics||{});
      this.canvas = document.createElement('canvas');
      const gl = this.canvas.getContext('webgl2', { alpha: true, depth: false, antialias: false, premultipliedAlpha: true, preserveDrawingBuffer: true, failIfMajorPerformanceCaveat: options.failIfMajorPerformanceCaveat??false, powerPreference: options.powerPreference||'default' });
      if (!gl) throw new Error('WebGL2 unavailable');
      this.gl = gl;
      this.loseExtension=gl.isContextLost()?lostExtensions.get(this.canvas)||null:gl.getExtension('WEBGL_lose_context');
      if(this.loseExtension)lostExtensions.set(this.canvas,this.loseExtension);
      this.events=new AbortController();
      this.program=null;this.buffer=null;this.uniforms={};this.texture=null;this.fullFormationTexture=null;
      this.gustSpeed = 0; this.time = 0;
      this.trailStrength = 1;
      const listen=(name,fn)=>this.canvas.addEventListener?.(name,fn,{signal:this.events.signal});
      listen('webglcontextlost',e=>{
        e.preventDefault();this.cancelCompile(false);this.layers.clear();
        this.program=null;this.buffer=null;this.texture=null;this.fullFormationTexture=null;
        this.options.onContextLost?.();
      });
      listen('webglcontextrestored',()=>{
        if(this.destroyed||this.failed)return;
        this.generation++;this.layers.clear();this.initGpu();
        this.options.onContextRestored?.();
      });
      if(gl.isContextLost()){
        this.ready=new Promise((resolve,reject)=>{this.resolveReady=resolve;this.rejectReady=reject;});
        this.ready.catch(()=>{});
        this.loseExtension?.restoreContext?.();
      }else this.initGpu();
    }
    cancelCompile(deleteResources=false){
      const job=this.compileJob;if(!job)return;
      if(job.raf)cancelAnimationFrame(job.raf);if(job.timer)clearTimeout(job.timer);
      if(deleteResources&&!this.gl.isContextLost()){for(const s of job.shaders)this.gl.deleteShader(s);this.gl.deleteProgram(job.program);}
      this.compileJob=null;
    }
    finishProgram({program,shaders}){
      const gl=this.gl,ok=gl.getProgramParameter(program,gl.LINK_STATUS);
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
    activateProgram(program){
      const gl=this.gl;this.program=program;
      gl.useProgram(program);gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer);
      const position=gl.getAttribLocation(program,'aPosition');
      gl.enableVertexAttribArray(position);gl.vertexAttribPointer(position,2,gl.FLOAT,false,0,0);
      this.uniforms=Object.fromEntries(['uShadowStride','uDensity','uFormation','uSize','uResolution','uRadius','uTime','uDetailScale','uMarchSteps','uVaporDensity','uLightDirection','uGlare','uGlareTint','uPointLight','uPointColor','uPointPower','uPointReach','uElectricGlow','uEdgeFade','uLit','uShade'].map(key=>[key,gl.getUniformLocation(program,key)]));
      gl.uniform1i(this.uniforms.uDensity,0);
      gl.uniform1i(this.uniforms.uFormation,1);
    }
    pollCompile(ext){
      const job=this.compileJob;if(!job)return;
      if(this.destroyed||this.failed||this.gl.isContextLost()){this.cancelCompile(false);return;}
      if(this.gl.getProgramParameter(job.program,ext.COMPLETION_STATUS_KHR)){
        this.cancelCompile(false);
        try{
          this.activateProgram(this.finishProgram(job));
          this.resolveReady?.(this);this.resolveReady=this.rejectReady=null;
          this.options.onReady?.();
        }catch(error){
          this.failed=true;
          if(!this.gl.isContextLost()){
            if(this.texture)this.gl.deleteTexture(this.texture);
            if(this.fullFormationTexture)this.gl.deleteTexture(this.fullFormationTexture);
            if(this.buffer)this.gl.deleteBuffer(this.buffer);
            this.canvas.addEventListener?.('webglcontextlost',e=>e.preventDefault(),{once:true});
            this.loseExtension?.loseContext?.();
          }
          this.texture=this.fullFormationTexture=this.buffer=this.program=null;
          this.rejectReady?.(error);this.resolveReady=this.rejectReady=null;
          this.options.onError?.(error);
        }
        return;
      }
      const step=()=>{job.raf=0;if(job.timer){clearTimeout(job.timer);job.timer=0;}this.pollCompile(ext);};
      if(typeof requestAnimationFrame==='function')job.raf=requestAnimationFrame(step);
      job.timer=setTimeout(()=>{if(job.raf){cancelAnimationFrame(job.raf);job.raf=0;}job.timer=0;this.pollCompile(ext);},16);
    }
    initGpu(){
      const gl=this.gl;if(gl.isContextLost()||this.failed)return;
      if(!this.loseExtension){this.loseExtension=gl.getExtension('WEBGL_lose_context');if(this.loseExtension)lostExtensions.set(this.canvas,this.loseExtension);}
      this.cancelCompile(true);
      const buffer = this.buffer=gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, -1,1, 1,-1, 1,1]), gl.STATIC_DRAW);
      this.texture = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D,this.texture);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT,1);
      this.fullFormationTexture=gl.createTexture();
      gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,this.fullFormationTexture);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D,0,gl.R8,1,1,0,gl.RED,gl.UNSIGNED_BYTE,new Uint8Array([255]));
      gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,this.texture);
      if(this.field&&!this.options.sharedBuffer){
        gl.texImage2D(gl.TEXTURE_2D,0,gl.RGB8,this.gw,this.gh,0,gl.RGB,gl.UNSIGNED_BYTE,null);
        this.dirty=true;this.upload();
      }
      const program=gl.createProgram(),shaders=[];
      for(const [type,source]of [[gl.VERTEX_SHADER,vertex],[gl.FRAGMENT_SHADER,fragment]]){
        const s=gl.createShader(type);shaders.push(s);gl.shaderSource(s,source);gl.compileShader(s);gl.attachShader(program,s);
      }
      gl.bindAttribLocation(program,0,'aPosition');gl.linkProgram(program);
      const parallel=gl.getExtension('KHR_parallel_shader_compile');
      if(parallel&&typeof parallel.COMPLETION_STATUS_KHR==='number'){
        if(!this.ready){this.ready=new Promise((resolve,reject)=>{this.resolveReady=resolve;this.rejectReady=reject;});this.ready.catch(()=>{});}
        this.compileJob={program,shaders};
        this.pollCompile(parallel);
      }else{
        try{
          this.activateProgram(this.finishProgram({program,shaders}));
          if(!this.ready)this.ready=Promise.resolve(this);
          else{this.resolveReady?.(this);this.resolveReady=this.rejectReady=null;}
          this.options.onReady?.();
        }catch(error){
          gl.deleteTexture(this.texture);gl.deleteTexture(this.fullFormationTexture);gl.deleteBuffer(this.buffer);
          this.texture=this.fullFormationTexture=this.buffer=this.program=null;
          throw error;
        }
      }
    }
    configure(patch={}){
      for(const [key,value]of Object.entries(patch))if(!Object.hasOwn(CloudControls.volume,key)||!Number.isFinite(Number(value)))throw new TypeError('Unknown or invalid cloud physics: '+key);
      for(const [key,value]of Object.entries(patch)){
        const control=CloudControls.volume[key];
        this.physics[key]=Math.max(control.min,Math.min(control.max,Number(value)));
      }
      return this;
    }
    getOptions(){return JSON.parse(JSON.stringify({...this.options,physics:this.physics,trailStrength:this.trailStrength,vaporDensity:this.vaporDensity??1,airStrength:this.airStrength??1}));}
    captureLayerState(state={}){for(const key of layerKeys)state[key]=this[key];return state;}
    createLayer(mask,{scale=100,puffiness=1,...options}={}){
      validateOptions(options);
      if(this.destroyed)throw new Error('CloudVolume was destroyed.');
      if(!mask?.getContext||![mask.width,mask.height].every(n=>Number.isInteger(n)&&n>0)||!Number.isFinite(scale)||scale<=0||!Number.isFinite(puffiness)||puffiness<=0)throw new TypeError('Cloud layers require a non-empty canvas and positive scale/puffiness.');
      const saved=this.captureLayerState(),gl=this.gl;
      let texture,formationTexture;
      try{
        gl.activeTexture(gl.TEXTURE0);
        texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,texture);
        for(const key of [gl.TEXTURE_MIN_FILTER,gl.TEXTURE_MAG_FILTER])gl.texParameteri(gl.TEXTURE_2D,key,gl.LINEAR);
        for(const key of [gl.TEXTURE_WRAP_S,gl.TEXTURE_WRAP_T])gl.texParameteri(gl.TEXTURE_2D,key,gl.CLAMP_TO_EDGE);
        this.texture=texture;this.options={...saved.options,...options,sharedBuffer:true};
        this.setFormation(mask,scale,puffiness);
        formationTexture=gl.createTexture();gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,formationTexture);
        for(const key of [gl.TEXTURE_MIN_FILTER,gl.TEXTURE_MAG_FILTER])gl.texParameteri(gl.TEXTURE_2D,key,gl.LINEAR);
        for(const key of [gl.TEXTURE_WRAP_S,gl.TEXTURE_WRAP_T])gl.texParameteri(gl.TEXTURE_2D,key,gl.CLAMP_TO_EDGE);
        gl.texImage2D(gl.TEXTURE_2D,0,gl.R8,1,1,0,gl.RED,gl.UNSIGNED_BYTE,new Uint8Array([255]));
        this.formationTexture=formationTexture;
        const layer=Object.freeze({width:mask.width,height:mask.height});
        this.layers.set(layer,{state:this.captureLayerState(),formation:255,width:this.outputWidth,height:this.outputHeight,generation:this.generation});return layer;
      }catch(error){if(texture)gl.deleteTexture(texture);if(formationTexture)gl.deleteTexture(formationTexture);throw error;}
      finally{Object.assign(this,saved);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,this.texture);}
    }
    renderLayer(layer,dt,paused,pointer,{formation=1,simulate=true,renderScale=1}={}){
      validateTime(dt);
      if(!Number.isFinite(formation)||!Number.isFinite(renderScale))throw new TypeError('Formation and render scale must be finite.');
      const record=this.layers.get(layer);if(!record||record.generation!==this.generation||this.destroyed)throw new Error('Unknown or released cloud layer.');
      const saved=this.captureLayerState(),gl=this.gl;
      try{
        Object.assign(this,record.state);
        const scale=Math.max(.25,Math.min(1,renderScale));this.outputWidth=Math.max(1,Math.round(record.width*scale));this.outputHeight=Math.max(1,Math.round(record.height*scale));
        if(this.canvas.width<this.outputWidth)this.canvas.width=this.outputWidth;
        if(this.canvas.height<this.outputHeight)this.canvas.height=this.outputHeight;
        const value=Math.round(Math.max(0,Math.min(1,formation))*255);
        if(value!==record.formation){gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,this.formationTexture);gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,1,1,gl.RED,gl.UNSIGNED_BYTE,new Uint8Array([value]));record.formation=value;}
        gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,this.texture);this.dirty=true;
        if(!paused&&!simulate)this.time+=dt;
        const rendered=this.render(simulate?dt:0,paused||!simulate,pointer);
        this.captureLayerState(record.state);
        return {rendered,settled:this.settled,canvas:this.canvas,x:0,y:this.canvas.height-this.outputHeight,width:this.outputWidth,height:this.outputHeight};
      }finally{Object.assign(this,saved);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,this.texture);}
    }
    gustLayer(layer,strength=1){
      const record=this.layers.get(layer);if(!record||record.generation!==this.generation)throw new Error('Unknown or released cloud layer.');
      const saved=this.captureLayerState();try{Object.assign(this,record.state);this.gust(strength);this.captureLayerState(record.state);}finally{Object.assign(this,saved);}
    }
    recoverLayer(layer,elapsed){
      const record=this.layers.get(layer);if(!record||record.generation!==this.generation)throw new Error('Unknown or released cloud layer.');
      if(!Number.isFinite(elapsed)||elapsed<0)throw new TypeError('Recovery elapsed time must be finite and nonnegative.');
      const state=record.state,amount=1-Math.exp(-elapsed*this.physics.recoveryRate),fade=Math.exp(-elapsed*this.physics.vaporDissipation),velocityFade=Math.exp(-elapsed*1.35);
      // One relaxation pass, rather than replaying thousands of hidden frames.
      for(let i=0;i<state.field.length;i++){
        const recoveryTime=Math.max(0,elapsed-state.recovery[i]);
        const recoveryAmount=recoveryTime===elapsed?amount:recoveryTime>0?1-Math.exp(-recoveryTime*this.physics.recoveryRate):0;
        state.field[i]+=(state.target[i]-state.field[i])*recoveryAmount;state.loose[i]*=fade;
        if(state.tapVapor)state.tapVapor[i]*=fade;
        state.vx[i]*=velocityFade;state.vy[i]*=velocityFade;state.recovery[i]=Math.max(0,state.recovery[i]-elapsed);
      }
      state.gustSpeed*=Math.exp(-elapsed*1.1);state.time+=elapsed;
      state.tapRemaining=Math.max(0,state.tapRemaining-elapsed);if(!state.tapRemaining)state.tapVapor=state.nextTapVapor=state.advectedTapVapor=null;
      state.puffs=(state.puffs||[]).map(p=>({...p,age:p.age+elapsed,idle:p.idle+elapsed,remaining:p.remaining*Math.exp(-elapsed*5)})).filter(p=>p.idle<this.physics.puffDuration);
      state.densityDirty=state.dirty=true;state.settled=false;
    }
    releaseLayer(layer){
      const record=this.layers.get(layer);if(!record)return;
      if(!this.gl.isContextLost()&&record.generation===this.generation){this.gl.deleteTexture(record.state.texture);this.gl.deleteTexture(record.state.formationTexture);}
      this.layers.delete(layer);
    }
    setMask(mask,{scale=100,puffiness=1}={}) {
      this.setFormation(mask,scale,puffiness);return this;
    }
    setFormation(mask,fontSize,puffiness) {
      if(this.destroyed)throw new Error('CloudVolume was destroyed.');
      validateOptions(this.options);
      if(!mask?.getContext||![mask.width,mask.height].every(n=>Number.isInteger(n)&&n>0)||!Number.isFinite(fontSize)||fontSize<=0||!Number.isFinite(puffiness)||puffiness<=0)throw new TypeError('Cloud masks require a non-empty canvas and positive scale/puffiness.');
      this.width = mask.width; this.height = mask.height;
      const gridSize=this.options.gridSize || 360;
      this.cell = Math.max(this.options.minCell || 2.3,this.width/gridSize,this.height/gridSize);
      const gw = Math.ceil(this.width/this.cell), gh = Math.ceil(this.height/this.cell);
      this.gw=gw; this.gh=gh;
      const n=gw*gh, pixels=mask.getContext('2d').getImageData(0,0,this.width,this.height).data;
      const inside=new Uint8Array(n);
      for(let y=0;y<gh;y++) for(let x=0;x<gw;x++) {
        const px=Math.min(this.width-1,Math.round((x+.5)*this.cell));
        const py=Math.min(this.height-1,Math.round((y+.5)*this.cell));
        inside[y*gw+x]=pixels[(py*this.width+px)*4+3]>96 ? 1 : 0;
      }
      // Two chamfer transforms give a smooth signed distance around the script.
      const distance = value => {
        const d=new Float32Array(n);
        for(let i=0;i<n;i++) d[i]=inside[i]===value?0:10000;
        for(let y=0;y<gh;y++) for(let x=0;x<gw;x++) {
          const i=y*gw+x;
          if(x) d[i]=Math.min(d[i],d[i-1]+1);
          if(y) d[i]=Math.min(d[i],d[i-gw]+1);
          if(x&&y) d[i]=Math.min(d[i],d[i-gw-1]+1.4142);
          if(x+1<gw&&y) d[i]=Math.min(d[i],d[i-gw+1]+1.4142);
        }
        for(let y=gh-1;y>=0;y--) for(let x=gw-1;x>=0;x--) {
          const i=y*gw+x;
          if(x+1<gw) d[i]=Math.min(d[i],d[i+1]+1);
          if(y+1<gh) d[i]=Math.min(d[i],d[i+gw]+1);
          if(x+1<gw&&y+1<gh) d[i]=Math.min(d[i],d[i+gw+1]+1.4142);
          if(x&&y+1<gh) d[i]=Math.min(d[i],d[i+gw-1]+1.4142);
        }
        return d;
      };
      const outer=distance(1),inner=distance(0);
      this.radius=Math.max(this.options.minRadius || 7,fontSize*(this.options.radiusFactor || .105))*puffiness;
      this.target=new Float32Array(n);
      for(let i=0;i<n;i++) this.target[i]=Math.max(0,Math.min(1,.68-(outer[i]-inner[i])*this.cell/(this.radius*2.7)));
      this.field=this.target.slice();
      this.loose=new Float32Array(n);this.nextLoose=new Float32Array(n);this.advected=new Float32Array(n);
      this.tapVapor=this.nextTapVapor=this.advectedTapVapor=null;this.tapRemaining=0;
      this.windColumns=new Float32Array(gw);this.windRows=new Float32Array(gh);this.windDiagonals=new Float32Array(gw+gh);
      this.recovery=new Float32Array(n);this.brushDistances=this.brushIndices=null;
      this.vx=new Float32Array(n);this.vy=new Float32Array(n);this.bytes=new Uint8Array(n*3);
      this.puffs=[];
      this.gustSpeed=0;
      const resolution=Math.min(1,(this.options.renderWidth || 800)/this.width,(this.options.renderHeight || 650)/this.height);
      this.outputWidth=Math.max(1,Math.round(this.width*resolution));
      this.outputHeight=Math.max(1,Math.round(this.height*resolution));
      if(!this.options.sharedBuffer) {
        this.canvas.width=this.outputWidth;this.canvas.height=this.outputHeight;
      }
      const gl=this.gl;
      if(!gl.isContextLost()&&this.texture){
        gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,this.texture);
        gl.texImage2D(gl.TEXTURE_2D,0,gl.RGB8,gw,gh,0,gl.RGB,gl.UNSIGNED_BYTE,null);
        this.upload();
      }else this.densityDirty=true;
      this.frameAverage=16.667;this.frames=0;this.quality=resolution;this.dirty=true;this.settled=true;this.lastRecoveryRate=this.physics.recoveryRate;
    }
    upload() {
      if(this.gl.isContextLost()||!this.texture){this.densityDirty=true;return;}
      for(let i=0;i<this.field.length;i++) {
        this.bytes[i*3]=Math.round(Math.max(0,Math.min(1,this.field[i]))*255);
        this.bytes[i*3+1]=Math.round(Math.max(0,Math.min(1,this.loose[i]))*255);
        this.bytes[i*3+2]=this.tapVapor?Math.round(Math.max(0,Math.min(1,this.tapVapor[i]))*255):0;
      }
      this.gl.activeTexture(this.gl.TEXTURE0);this.gl.bindTexture(this.gl.TEXTURE_2D,this.texture);
      this.gl.texSubImage2D(this.gl.TEXTURE_2D,0,0,0,this.gw,this.gh,this.gl.RGB,this.gl.UNSIGNED_BYTE,this.bytes);this.densityDirty=false;
    }
    gust(strength=1) {
      if(!Number.isFinite(strength))throw new TypeError('Gust strength must be finite.');
      strength=Math.max(0,Math.min(2,strength));if(strength===0)return;
      if(!this.field)return;
      this.dirty=this.densityDirty=true;this.settled=false;
      this.gustSpeed=260*strength;
      for(let i=0;i<this.field.length;i++) {
        this.loose[i]=Math.min(1,this.loose[i]+this.field[i]*Math.min(.95,.82*strength));
        this.field[i]*=Math.max(.04,1-.92*strength);this.recovery[i]=1.8*strength;
      }
    }
    simulate(dt,pointer) {
      const inputs=pointer.effects?.slice(-8)||[],segments=pointer.segments?.slice(-64)||[];
      if(inputs.some(effect=>effect.kind==='puff'&&(effect.strength??1)>0)){
        if(!this.tapVapor){
          this.tapVapor=new Float32Array(this.gw*this.gh);
          this.nextTapVapor=new Float32Array(this.gw*this.gh);
          this.advectedTapVapor=new Float32Array(this.gw*this.gh);
        }
        this.tapRemaining=this.physics.vaporLifetime;
      }
      this.tapRemaining=Math.max(0,this.tapRemaining-dt);
      if(this.tapRemaining===0)this.tapVapor=this.nextTapVapor=this.advectedTapVapor=null;
      const {gw,gh,cell,vx,vy,field,loose,nextLoose,advected,tapVapor,nextTapVapor,advectedTapVapor,target,recovery}=this;
      this.gustSpeed*=Math.exp(-dt*1.1);
      let velocityX=pointer.vx||0,velocityY=pointer.vy||0,pathLength=0;
      for(const segment of segments)pathLength+=Math.hypot(segment.bx-segment.ax,segment.by-segment.ay);
      if(!Math.hypot(velocityX,velocityY))for(let i=segments.length-1;i>=0;i--){
        velocityX=(segments[i].bx-segments[i].ax)/dt;velocityY=(segments[i].by-segments[i].ay)/dt;
        if(Math.hypot(velocityX,velocityY))break;
      }
      const velocitySpeed=Math.hypot(velocityX,velocityY),speed=Math.max(velocitySpeed,pathLength/dt);
      const motion=Math.min(1,speed/420);
      const strength=Math.max(0,Math.min(2,this.trailStrength));
      const breeze=this.environmentWind?.strength>0?this.environmentWind:{x:0,y:0,strength:0};
      const windRelease=Math.min(.008,Math.max(0,breeze.strength)*dt*.075);
      // Each tap refills a bounded emission budget and refreshes the breeze.
      // Released material keeps its own motion and fade; taps never stack mass.
      const effects=[];
      for(const effect of inputs){
        const gain=Math.max(0,Math.min(2,effect.strength??1));if(gain===0)continue;
        if(effect.kind==='puff'){
          this.puffs??=[];
          const existing=this.puffs.find(p=>Math.hypot(p.x-effect.x,p.y-effect.y)<60);
          if(existing){
            existing.strength=Math.max(existing.strength,gain);
            existing.boost=Math.min(1.1,(existing.boost||0)+.3*gain);
            existing.remaining=Math.min(.4,existing.remaining+.26*gain);
            existing.idle=0;
          }
          else{if(this.puffs.length>=8)this.puffs.shift();this.puffs.push({kind:'puff',x:effect.x,y:effect.y,strength:gain,age:0,idle:0,remaining:.26*gain});}
        }else effects.push({kind:'stir',x:effect.x,y:effect.y,strength:gain});
      }
      const smooth=t=>t*t*(3-2*t);
      for(const puff of this.puffs||[]){
        puff.boost=(puff.boost||0)*Math.exp(-dt*3);
        puff.age+=dt;puff.idle+=dt;
        const arrival=smooth(Math.max(0,Math.min(1,(puff.age-.06)/.45)));
        const amount=puff.remaining*(1-Math.exp(-dt*5))*arrival;
        puff.remaining=Math.max(0,puff.remaining-amount);
        if(amount>0)effects.push({kind:'puff',x:puff.x,y:puff.y,strength:puff.strength,amount});
      }
      this.puffs=(this.puffs||[]).filter(puff=>puff.idle<this.physics.puffDuration);
      // Holds rotate the local flow; taps release a gradually growing air puff.
      for(const effect of effects){
        const gain=Math.max(0,Math.min(2,effect.strength??1));if(gain===0)continue;
        const reach=Math.max(36,Math.min(76,this.radius*2.8+30))*(.85+.15*gain);
        const swirl=effect.kind==='stir',amount=swirl?Math.min(.08,dt*.4*gain):effect.amount;
        const left=Math.max(0,Math.floor((effect.x-reach*1.7)/cell));
        const right=Math.min(gw-1,Math.ceil((effect.x+reach*1.7)/cell));
        const top=Math.max(0,Math.floor((effect.y-reach*1.7)/cell));
        const bottom=Math.min(gh-1,Math.ceil((effect.y+reach*1.7)/cell));
        for(let y=top;y<=bottom;y++)for(let x=left;x<=right;x++){
          const dx=(x+.5)*cell-effect.x,dy=(y+.5)*cell-effect.y;
          const weight=Math.exp(-(dx*dx+dy*dy)/(reach*reach*.42));
          if(weight<.004)continue;
          const i=y*gw+x,floor=target[i]*(swirl?.5:this.physics.tapRetention);
          const capacity=swirl?1:Math.max(0,this.physics.tapCapacity-tapVapor[i]);
          const removed=Math.max(0,Math.min(field[i]-floor,(swirl?field[i]:target[i])*amount*weight,capacity));
          field[i]-=removed;
          if(swirl){
            loose[i]=Math.min(1,loose[i]+removed*.75);
            vx[i]+=(-dy/reach*85)*weight*gain*dt*30;
            vy[i]+=(dx/reach*85-20)*weight*gain*dt*30;
            vx[i]=Math.max(-180,Math.min(180,vx[i]));vy[i]=Math.max(-180,Math.min(180,vy[i]));
          }else tapVapor[i]+=removed;
          // Tap weather can replenish while the finger keeps tapping. A hold
          // still delays recovery, as does the existing mouse weathering.
          if(removed>0&&swirl)recovery[i]=Math.max(recovery[i],.9);
        }
      }
      if(motion>.015&&strength>0&&segments.length) {
        const dragging=pointer.down||segments.some(segment=>segment.down);
        // Sweep the complete pointer path, so fast strokes do not skip over vapor.
        const reach=Math.max(27,Math.min(66,this.radius*1.4))*(dragging?1.35:1)*this.physics.brushSize;
        // Retain double-precision distances; round only after the Gaussian.
        if(!this.brushDistances){this.brushDistances=new Float64Array(gw*gh).fill(Infinity);this.brushIndices=new Uint32Array(gw*gh);}
        const distances=this.brushDistances,indices=this.brushIndices;let visited=0;
        const radiusSquared=reach*reach*.48,cutoff=-Math.log(.004)*radiusSquared;
        for(const segment of segments) {
          const {ax,ay,bx,by}=segment,sx=bx-ax,sy=by-ay,length2=sx*sx+sy*sy;
          const left=Math.max(0,Math.floor((Math.min(ax,bx)-reach*1.7)/cell));
          const right=Math.min(gw-1,Math.ceil((Math.max(ax,bx)+reach*1.7)/cell));
          const top=Math.max(0,Math.floor((Math.min(ay,by)-reach*1.7)/cell));
          const bottom=Math.min(gh-1,Math.ceil((Math.max(ay,by)+reach*1.7)/cell));
          for(let y=top;y<=bottom;y++){
           const py=(y+.5)*cell;
           // Restrict each row to the stroke's band instead of scanning a diagonal's entire bounding box.
           const ta=sy?Math.max(0,Math.min(1,(py-reach*1.7-ay)/sy)):0;
           const tb=sy?Math.max(0,Math.min(1,(py+reach*1.7-ay)/sy)):1;
           const xa=ax+sx*ta,xb=ax+sx*tb;
           const rowLeft=Math.max(left,Math.floor((Math.min(xa,xb)-reach*1.7)/cell));
           const rowRight=Math.min(right,Math.ceil((Math.max(xa,xb)+reach*1.7)/cell));
           for(let x=rowLeft;x<=rowRight;x++) {
            const px=(x+.5)*cell;
            const t=length2?Math.max(0,Math.min(1,((px-ax)*sx+(py-ay)*sy)/length2)):0;
            const dx=px-(ax+sx*t),dy=py-(ay+sy*t);
            const distanceSquared=dx*dx+dy*dy;
            if(distanceSquared>cutoff)continue;
            const i=y*gw+x;
            if(distanceSquared<distances[i]){
             if(distances[i]===Infinity)indices[visited++]=i;
             distances[i]=distanceSquared;
            }
           }
          }
        }
        const flow=Math.min(dragging?210:135,speed*(dragging?.23:.16))*Math.sqrt(strength);
        const weathering=.65+Math.min(2.35,speed/750);
        const windX=velocityX/Math.max(1,velocitySpeed)*flow+22,windY=velocityY/Math.max(1,velocitySpeed)*flow-18;
        // A Gaussian decreases with distance: find the nearest segment first,
        // then evaluate it once per touched cell. Reset only those cells.
        for(let j=0;j<visited;j++) {
          const i=indices[j],influence=Math.fround(Math.exp(-distances[i]/radiusSquared));distances[i]=Infinity;
          // Weather away attached cloud without transporting or compressing its letters.
          const removed=field[i]*(1-Math.exp(-influence*motion*weathering*this.physics.weathering*strength*dt*(dragging?9:6)));
          field[i]-=removed;loose[i]=Math.min(1,loose[i]+removed*.62);
          if(influence*motion>.08) recovery[i]=Math.max(recovery[i],1.35+influence*.65);
          const blend=1-Math.exp(-influence*motion*dt*22);
          vx[i]+=(windX-vx[i])*blend;vy[i]+=(windY-vy[i])*blend;
        }
      }
      const drag=Math.exp(-dt*1.35),fade=Math.exp(-dt*this.physics.vaporDissipation),recoveryAmount=1-Math.exp(-dt*this.physics.recoveryRate);
      const breaths=(this.puffs||[]).map(p=>{
        const x=p.x+65*p.idle,y=p.y-72*p.idle;
        const reach=Math.max(48,Math.min(92,this.radius*2.8+38))+p.idle*24;
        const speed=(.6+.4*Math.sin(Math.PI*Math.min(1,p.idle/this.physics.puffDuration)))*Math.sqrt(p.strength??1)*(1+(p.boost||0))*Math.max(0,Math.min(2,this.airStrength??1));
        p.airColumns??=new Float32Array(gw);p.airRows??=new Float32Array(gh);
        p.airXColumns??=new Float64Array(gw);p.airYRows??=new Float64Array(gh);
        // Cache separable Gaussian and airflow factors for the cell loop.
        for(let i=0;i<gw;i++){const dx=(i+.5)*cell-x;p.airColumns[i]=Math.exp(-Math.pow(dx/reach,2));p.airXColumns[i]=(95+dx/reach*38)*p.airColumns[i]*speed;}
        for(let i=0;i<gh;i++){const dy=(i+.5)*cell-y;p.airRows[i]=Math.exp(-Math.pow(dy/reach,2));p.airYRows[i]=(-110+dy/reach*38)*p.airRows[i]*speed;}
        return {columns:p.airColumns,rows:p.airRows,xFlow:p.airXColumns,yFlow:p.airYRows};
      });
      // Smooth, diverging directions fold the wake into wisps. The flow itself
      // is divergence-free, so it cannot squeeze released vapor into a ridge.
      const scale=Math.max(48,this.radius*1.7),phase=this.time*.42;
      for(let x=0;x<gw;x++) this.windColumns[x]=Math.sin(x*cell/scale-phase)*14;
      for(let y=0;y<gh;y++) this.windRows[y]=Math.sin(y*cell/scale+phase)*14;
      for(let d=0;d<gw+gh;d++) this.windDiagonals[d]=Math.sin(d*cell/(scale*.8)-phase*.7)*9;
      for(let y=0;y<gh;y++) for(let x=0;x<gw;x++) {
        const i=y*gw+x;
        vx[i]*=drag;vy[i]*=drag;
        const curl=this.windDiagonals[x+y];
        const sx=x-(vx[i]+this.gustSpeed+18+this.windRows[y]+curl+(breeze.x||0))*dt/cell;
        const sy=y-(vy[i]-10-this.windColumns[x]-curl+(breeze.y||0))*dt/cell;
        let density=0;
        if(sx>=0&&sx<gw-1&&sy>=0&&sy<gh-1) {
          const ix=Math.floor(sx),iy=Math.floor(sy),fx=sx-ix,fy=sy-iy,j=iy*gw+ix;
          density=(loose[j]*(1-fx)+loose[j+1]*fx)*(1-fy)+(loose[j+gw]*(1-fx)+loose[j+gw+1]*fx)*fy;
        }
        advected[i]=density;
        // A travelling, widening jet clears the source instead of collecting
        // detached material under the finger. Both sides of the wake fan out.
        if(tapVapor){
          let airX=0,airY=0;
          for(const breath of breaths){
            airX+=breath.xFlow[x]*breath.rows[y];
            airY+=breath.columns[x]*breath.yFlow[y];
          }
          const tx=x-(18+this.windRows[y]+curl+(breeze.x||0)+airX)*dt/cell;
          const ty=y-(-14-this.windColumns[x]-curl+(breeze.y||0)+airY)*dt/cell;
          let lifted=0;
          if(tx>=0&&tx<gw-1&&ty>=0&&ty<gh-1){
            const ix=Math.floor(tx),iy=Math.floor(ty),fx=tx-ix,fy=ty-iy,j=iy*gw+ix;
            lifted=(tapVapor[j]*(1-fx)+tapVapor[j+1]*fx)*(1-fy)
              +(tapVapor[j+gw]*(1-fx)+tapVapor[j+gw+1]*fx)*fy;
          }
          advectedTapVapor[i]=lifted;
        }
        if(windRelease>0){
          const removed=field[i]*windRelease;
          field[i]-=removed;advected[i]=Math.min(1,advected[i]+removed*.6);
        }
        const recoveryTime=Math.max(0,dt-recovery[i]);recovery[i]=Math.max(0,recovery[i]-dt);
        // Fresh cloud condenses in place after the wake clears; it never snaps back.
        if(recoveryTime>0)field[i]+=(target[i]-field[i])*(recoveryTime===dt?recoveryAmount:1-Math.exp(-recoveryTime*this.physics.recoveryRate));
      }
      // Spread the transported vapor, rather than mixing it back into the old
      // stroke. A wider stencil gives the wake room to unravel on every screen.
      const spread=Math.max(1,Math.round(8/cell)),diffusion=1-Math.exp(-dt*6);
      let settled=!this.puffs.length&&this.gustSpeed<.1;
      for(let y=0;y<gh;y++) for(let x=0;x<gw;x++) {
        const i=y*gw+x;
        const neighbors=((x>=spread?advected[i-spread]:0)+(x+spread<gw?advected[i+spread]:0)
          +(y>=spread?advected[i-spread*gw]:0)+(y+spread<gh?advected[i+spread*gw]:0))*.25;
        nextLoose[i]=(advected[i]+(neighbors-advected[i])*diffusion)*fade;
        if(tapVapor){
          const airNeighbors=((x>=spread?advectedTapVapor[i-spread]:0)+(x+spread<gw?advectedTapVapor[i+spread]:0)
            +(y>=spread?advectedTapVapor[i-spread*gw]:0)+(y+spread<gh?advectedTapVapor[i+spread*gw]:0))*.25;
          nextTapVapor[i]=(advectedTapVapor[i]+(airNeighbors-advectedTapVapor[i])*diffusion)*fade;
        }
        if(settled&&(nextLoose[i]>1/255||tapVapor&&nextTapVapor[i]>1/255||recovery[i]>0||Math.abs(vx[i])>.1||Math.abs(vy[i])>.1||this.physics.recoveryRate>0&&Math.abs(field[i]-target[i])>1/255))settled=false;
      }
      this.loose=nextLoose;this.nextLoose=loose;
      if(tapVapor){this.tapVapor=nextTapVapor;this.nextTapVapor=tapVapor;}
      this.settled=settled;
      if(settled){
        if(this.physics.recoveryRate>0)field.set(target);
        this.loose.fill(0);vx.fill(0);vy.fill(0);this.gustSpeed=0;
        this.tapVapor=this.nextTapVapor=this.advectedTapVapor=null;this.tapRemaining=0;
      }
    }
    render(dt,paused,pointer,frameMs=16.667) {
      validateTime(dt);
      const gl=this.gl;
      if(this.destroyed||gl.isContextLost()||!this.program) return false;
      if(!this.field) return true;
      if(!paused&&dt>0)validatePointer(pointer);
      // A stable, damaged mask can sleep while recovery is disabled. Wake only
      // that mask when healing resumes; shared owners can use different rates.
      if(this.lastRecoveryRate===0&&this.physics.recoveryRate>0)this.settled=false;
      this.lastRecoveryRate=this.physics.recoveryRate;
      if(paused&&!this.dirty&&!this.densityDirty) return true;
      this.dirty=false;
      if(!paused&&!this.options.sharedBuffer&&frameMs<120) {
        this.frameAverage=this.frameAverage*.96+frameMs*.04;
        this.frames++;
        if(this.frames>90&&this.frameAverage>34&&this.canvas.width>420) {
          this.quality*=.82;
          this.canvas.width=Math.round(this.width*this.quality);
          this.canvas.height=Math.round(this.height*this.quality);
          this.frames=0;this.frameAverage=16.667;
        }
      }
      if(!paused&&dt>0){
        this.time+=dt;
        if(!this.settled||pointer.segments?.length||pointer.effects?.length||this.environmentWind?.strength>0){this.simulate(Math.min(.25,dt),pointer);this.densityDirty=true;}
      }
      if(this.densityDirty)this.upload();
      gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,this.formationTexture||this.fullFormationTexture);
      gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,this.texture);
      const outputWidth=this.options.sharedBuffer?this.outputWidth:this.canvas.width;
      const outputHeight=this.options.sharedBuffer?this.outputHeight:this.canvas.height;
      if(this.canvas.width<outputWidth)this.canvas.width=outputWidth;
      if(this.canvas.height<outputHeight)this.canvas.height=outputHeight;
      gl.viewport(0,0,outputWidth,outputHeight);
      // The fixed fullscreen shader writes every output pixel, including transparent sky.
      gl.useProgram(this.program);
      gl.uniform2f(this.uniforms.uSize,this.width,this.height);
      gl.uniform2f(this.uniforms.uResolution,outputWidth,outputHeight);
      gl.uniform1f(this.uniforms.uRadius,this.radius);
      gl.uniform1f(this.uniforms.uTime,this.time);
      gl.uniform1f(this.uniforms.uDetailScale,this.options.detailScale ?? 1);
      gl.uniform1f(this.uniforms.uVaporDensity,Math.max(0,Math.min(2,this.vaporDensity??1)));
      gl.uniform1f(this.uniforms.uShadowStride,Math.max(1,Math.min(8,this.options.shadowStride??3)));
      gl.uniform1f(this.uniforms.uMarchSteps,Math.max(12,Math.min(36,this.options.raySteps ?? 36)));
      gl.uniform2f(this.uniforms.uEdgeFade,this.options.edgeFadeTop||0,this.options.edgeFadeBottom||0);
      const lit=this.lighting?.lit||[1,1,1];
      const shade=this.lighting?.shade||[.66,.76,.87];
      gl.uniform3fv(this.uniforms.uLightDirection,this.lighting?.direction||[.55,-.72,.62]);
      gl.uniform1f(this.uniforms.uGlare,this.lighting?.glare??0);
      gl.uniform3fv(this.uniforms.uGlareTint,this.lighting?.glareTint||lit);
      const point=this.pointLight;
      gl.uniform3fv(this.uniforms.uPointLight,point?[point.x,point.y,point.height]:[-9999,-9999,80]);
      gl.uniform3fv(this.uniforms.uPointColor,point?.color||[142/255,218/255,1]);
      gl.uniform1f(this.uniforms.uPointPower,point?.power??0);
      gl.uniform1f(this.uniforms.uPointReach,point?.reach??220);
      gl.uniform1f(this.uniforms.uElectricGlow,point?.glow??0);
      gl.uniform3fv(this.uniforms.uLit,lit);gl.uniform3fv(this.uniforms.uShade,shade);
      gl.drawArrays(gl.TRIANGLES,0,6);
      return true;
    }
    destroy(){
      if(this.destroyed)return;this.destroyed=true;this.events.abort();this.cancelCompile(true);
      for(const layer of this.layers.keys())this.releaseLayer(layer);
      if(!this.gl.isContextLost()){
        if(this.texture)this.gl.deleteTexture(this.texture);
        if(this.fullFormationTexture)this.gl.deleteTexture(this.fullFormationTexture);
        if(this.buffer)this.gl.deleteBuffer(this.buffer);
        if(this.program)this.gl.deleteProgram(this.program);
        this.canvas.addEventListener?.('webglcontextlost',e=>e.preventDefault(),{once:true});
        this.loseExtension?.loseContext?.();
      }
      this.texture=null;this.fullFormationTexture=null;this.buffer=null;this.program=null;
      for(const key of layerKeys)if(ArrayBuffer.isView(this[key])||Array.isArray(this[key]))this[key]=null;
    }
  }
  CloudVolume.vertexShader=vertex;CloudVolume.fragmentShader=fragment;
