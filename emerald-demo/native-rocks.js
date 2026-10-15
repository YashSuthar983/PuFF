(() => {
 'use strict';
 const vertex=`#version 300 es
 in vec3 aPosition;in vec3 aNormal;in vec2 aUv;
 uniform float uAspect;uniform vec2 uCliffScale;uniform vec2 uViewAngles;out vec3 vPosition;out vec3 vNormal;out vec2 vUv;
 void main(){
  vec3 pivot=vec3(-3.6,-2.2,0.);vec3 p=aPosition-pivot;p.y*=uCliffScale.x;p.z*=uCliffScale.y;
  float cy=cos(uViewAngles.x),sy=sin(uViewAngles.x),cp=cos(uViewAngles.y),sp=sin(uViewAngles.y);
  mat3 yaw=mat3(cy,0.,-sy,0.,1.,0.,sy,0.,cy),pitch=mat3(1.,0.,0.,0.,cp,sp,0.,-sp,cp);
  p=pitch*yaw*p+pivot;vPosition=p;vNormal=normalize(pitch*yaw*(aNormal/vec3(1.,uCliffScale.x,uCliffScale.y)));vUv=aUv;
  float perspective=max(.3,(12.-p.z)/12.);gl_Position=vec4(p.x/(uAspect*5.),p.y/5.,-p.z/20.,perspective);
 }`;
 const fragment=`#version 300 es
 precision highp float;
 in vec3 vPosition;in vec3 vNormal;in vec2 vUv;out vec4 color;
 uniform sampler2D uAlbedo;uniform sampler2D uNormal;uniform sampler2D uRoughness;uniform sampler2D uHeight;
 uniform vec4 uLights[3];uniform vec3 uColors[3];uniform float uRadii[3];
 uniform float uAmbient;uniform float uExposure;uniform float uIntensity;uniform float uFalloff;
 uniform float uNormalStrength;uniform float uRoughnessScale;uniform float uAlbedoScale;
 const float PI=3.14159265;
 void main(){
  vec3 base=pow(texture(uAlbedo,vUv).rgb,vec3(2.2))*uAlbedoScale;
  vec3 N=normalize(vNormal),dp1=dFdx(vPosition),dp2=dFdy(vPosition);vec2 du1=dFdx(vUv),du2=dFdy(vUv);
  vec3 T=dp1*du2.y-dp2*du1.y,B=-dp1*du2.x+dp2*du1.x;
  T=length(T)>.0001?normalize(T):vec3(1,0,0);B=length(B)>.0001?normalize(B):vec3(0,1,0);
  vec3 mapN=texture(uNormal,vUv).xyz*2.-1.;mapN.xy*=uNormalStrength;N=normalize(mat3(T,B,N)*normalize(mapN));
  float rough=clamp(texture(uRoughness,vUv).r*uRoughnessScale,.18,.98),a=rough*rough,a2=a*a;
  float cavity=.35+.65*texture(uHeight,vUv).r;
  vec3 V=normalize(vec3(0,0,12)-vPosition),radiance=base*uAmbient*.25*cavity;
  float nV=max(.001,dot(N,V));
  for(int i=0;i<3;i++){
   vec3 delta=uLights[i].xyz-vPosition;float dist2=max(.02,dot(delta,delta));vec3 L=normalize(delta),H=normalize(L+V);
   float nL=max(0.,dot(N,L)),nH=max(.001,dot(N,H)),vH=max(.001,dot(V,H));
   float denom=nH*nH*(a2-1.)+1.,D=a2/(PI*denom*denom);
   float k=(rough+1.)*(rough+1.)/8.,G=(nV/(nV*(1.-k)+k))*(nL/(nL*(1.-k)+k));
   vec3 F=vec3(.04)+vec3(.96)*pow(1.-vH,5.);
   vec3 spec=D*G*F/max(.004,4.*nV*nL);
   vec3 incoming=uColors[i]*uLights[i].w*uIntensity/(uFalloff+dist2/max(.01,uRadii[i]*uRadii[i]));
   radiance+=((1.-F)*base/PI+spec)*incoming*nL*cavity;
  }
  vec3 mapped=1.-exp(-max(vec3(0),radiance)*uExposure);
  color=vec4(pow(mapped,vec3(1./2.2)),1.);
 }`;
 const normalize=v=>{const d=Math.hypot(...v)||1;return v.map(x=>x/d);};
 const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
 function geometry(height,{quality='medium'}={}){
  const {data,width,height:h}=height;
  const sample=(u,v)=>{const x=Math.floor(((u%1+1)%1)*width),y=Math.floor(((v%1+1)%1)*h);return data[(y*width+x)*4]/255;};
  const vertices=[],indices=[],columns=quality==='low'?64:128;
  const profile=[[-.09,.76],[0,.72],[.1,.7],[.18,.64],[.28,.735],[.35,.76],[.46,.88],[.62,1.05],[.76,1.17]];
  function edge(u){
   const screenX=-.09+u*.85,x=(screenX-.5)*10*16/9;let i=0;while(i<profile.length-2&&screenX>profile[i+1][0])i++;
   const [a,ya]=profile[i],[b,yb]=profile[i+1],t=Math.max(0,Math.min(1,(screenX-a)/(b-a)));
   const ridge=(1-(ya+(yb-ya)*t))*10-5+.08*Math.sin(x*4.2)+.05*Math.sin(x*11.1);
   return [x,ridge,1.05+.14*Math.sin(x*2.7)];
  }
  function face(u,v){const p=edge(u),y=p[1]-v*4.3;return [p[0]+.09*Math.sin(v*11+u*17)*Math.sin(v*Math.PI),y,p[2]+v*.7+.19*Math.sin(u*28+Math.floor(v*8)*.6)*Math.sin(v*Math.PI)+.22*(sample(p[0]/2.4,y/2.4)-.5)*Math.sin(v*Math.PI)];}
  function ledge(u,v){const p=edge(u);return [p[0],p[1]+v*.38+.14*Math.sin(u*34+v*8)*Math.sin(v*Math.PI),p[2]-v*3];}
  function patch(surface,rows,isTop){
   const start=vertices.length/8;
   for(let j=0;j<=rows;j++)for(let i=0;i<=columns;i++){
    const u=i/columns,v=j/rows,p=surface(u,v),a=surface(Math.max(0,u-.0001),v),b=surface(Math.min(1,u+.0001),v),c=surface(u,Math.max(0,v-.0001)),d=surface(u,Math.min(1,v+.0001));
    const normal=normalize(cross(d.map((n,k)=>n-c[k]),b.map((n,k)=>n-a[k])));
    vertices.push(...p,...normal,p[0]/2.4,(isTop?p[2]:p[1])/2.4);
   }
   for(let j=0;j<rows;j++)for(let i=0;i<columns;i++){const a=start+j*(columns+1)+i,b=a+columns+1;indices.push(a,b,a+1,a+1,b,b+1);}
  }
  patch(face,quality==='low'?16:32,false);patch(ledge,quality==='low'?8:16,true);
  return {vertices:new Float32Array(vertices),indices:new Uint16Array(indices)};
 }

 class NativeRockScene{
  constructor(canvas,{onReady,onError,limits={}}={}){
   this.limits={...limits};this.lightBuffers={positions:new Float32Array(12),colors:new Float32Array(9),radii:new Float32Array(3)};this.canvas=canvas;this.onError=onError;this.destroyed=false;this.ready=false;this.textures=[];this.events=new AbortController();
   try{
    const gl=this.gl=canvas.getContext('webgl2',{alpha:true,antialias:limits.antialias??false,premultipliedAlpha:false,powerPreference:'low-power',failIfMajorPerformanceCaveat:true});if(!gl)throw Error('WebGL2 is unavailable for rocks.');
    const compile=(type,source)=>{const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s;};
    const vs=compile(gl.VERTEX_SHADER,vertex),fs=compile(gl.FRAGMENT_SHADER,fragment);this.program=gl.createProgram();gl.attachShader(this.program,vs);gl.attachShader(this.program,fs);gl.linkProgram(this.program);gl.deleteShader(vs);gl.deleteShader(fs);if(!gl.getProgramParameter(this.program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(this.program));
    this.uniforms=Object.fromEntries(['uAspect','uCliffScale','uViewAngles','uAlbedo','uNormal','uRoughness','uHeight','uLights[0]','uColors[0]','uRadii[0]','uAmbient','uExposure','uIntensity','uFalloff','uNormalStrength','uRoughnessScale','uAlbedoScale'].map(k=>[k,gl.getUniformLocation(this.program,k)]));
    canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();this.ready=false;onError?.(Error('The rock graphics context was lost.'));},{signal:this.events.signal});
    const base=limits.quality==='low'?'assets/rocks/low/':'assets/rocks/',mapKey=limits.quality==='low'?'EmeraldRockMapsLow':'EmeraldRockMaps';
    const getSources=()=>{
     if(window.location?.protocol!=='file:')return Promise.resolve(null);
     if(window[mapKey])return Promise.resolve(window[mapKey]);
     return new Promise((resolve,reject)=>{const script=this.assetScript=document.createElement('script');script.src=base+'embedded-maps.js';script.onload=()=>resolve(window[mapKey]);script.onerror=()=>reject(Error('Could not load embedded cliff maps.'));document.head.append(script);});
    };
    const load=(name,sources)=>new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>reject(Error('Could not load rock '+name));image.src=sources?.[name]||base+name;});
    getSources().then(sources=>Promise.all(['albedo.webp','normal.png','roughness.png','height.png'].map(name=>load(name,sources)))).then(images=>{ 
     if(this.destroyed)return;
     const mask=document.createElement('canvas');mask.width=images[3].width;mask.height=images[3].height;const ctx=mask.getContext('2d');ctx.drawImage(images[3],0,0);const mesh=geometry(ctx.getImageData(0,0,mask.width,mask.height),{quality:limits.quality});this.count=mesh.indices.length;
     this.vao=gl.createVertexArray();gl.bindVertexArray(this.vao);this.buffer=gl.createBuffer();this.index=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer);gl.bufferData(gl.ARRAY_BUFFER,mesh.vertices,gl.STATIC_DRAW);gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,this.index);gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,mesh.indices,gl.STATIC_DRAW);
     for(const [key,size,offset]of [['aPosition',3,0],['aNormal',3,12],['aUv',2,24]]){const loc=gl.getAttribLocation(this.program,key);gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,size,gl.FLOAT,false,32,offset);}
     gl.useProgram(this.program);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);
     images.forEach((image,i)=>{let source=image;const cap=limits.textureLimit||1024;if(image.width>cap||image.height>cap){source=document.createElement('canvas');const scale=cap/Math.max(image.width,image.height);source.width=Math.max(1,Math.round(image.width*scale));source.height=Math.max(1,Math.round(image.height*scale));source.getContext('2d').drawImage(image,0,0,source.width,source.height);}const tex=gl.createTexture();this.textures.push(tex);gl.activeTexture(gl.TEXTURE0+i);gl.bindTexture(gl.TEXTURE_2D,tex);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,source);gl.generateMipmap(gl.TEXTURE_2D);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.REPEAT);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.REPEAT);gl.uniform1i(this.uniforms[['uAlbedo','uNormal','uRoughness','uHeight'][i]],i);});
     this.ready=true;onReady?.();
    }).catch(error=>{if(!this.destroyed){this.destroy();onError?.(error);}});
   }catch(error){this.destroy();onError?.(error);}
  }
  setLimits(limits){this.limits={...limits};}
  setLighting(lights,sourceRect,options={}){
   if(!this.ready||this.destroyed)return;
   const gl=this.gl,r=this.canvas.getBoundingClientRect(),aspect=r.width/r.height,scale=Math.min(1,({low:700,medium:1100,high:1600}[options.quality]||1100)/r.width,(this.limits.maxDimension||Infinity)/Math.max(1,r.width,r.height),Math.sqrt((this.limits.maxPixels||Infinity)/Math.max(1,r.width*r.height)));const width=Math.max(1,Math.floor(r.width*scale)),height=Math.max(1,Math.floor(r.height*scale));if(this.canvas.width!==width)this.canvas.width=width;if(this.canvas.height!==height)this.canvas.height=height;
   const {positions,colors,radii}=this.lightBuffers;positions.fill(0);colors.fill(0);radii.fill(0);
   lights.slice(0,3).forEach((l,i)=>{const x=(sourceRect.left+l.x-r.left)/r.width,y=(sourceRect.top+l.y-r.top)/r.height;positions.set([(x-.5)*aspect*10,(.5-y)*10,2.8+(l.depth||0),l.strength*40],i*4);colors.set(l.color,i*3);radii[i]=Math.max(.1,l.radius*(i===1?1.5:4));});
   gl.useProgram(this.program);gl.bindVertexArray(this.vao);gl.viewport(0,0,this.canvas.width,this.canvas.height);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.enable(gl.DEPTH_TEST);gl.disable(gl.BLEND);gl.uniform1f(this.uniforms.uAspect,aspect);gl.uniform2f(this.uniforms.uCliffScale,options.cliffHeight??1,options.cliffDepth??1);gl.uniform2f(this.uniforms.uViewAngles,(options.cliffTurn??0)*Math.PI/180,(options.cliffTilt??0)*Math.PI/180);gl.uniform4fv(this.uniforms['uLights[0]'],positions);gl.uniform3fv(this.uniforms['uColors[0]'],colors);gl.uniform1fv(this.uniforms['uRadii[0]'],radii);
   for(const [key,value]of Object.entries({uAmbient:options.ambient??.3,uExposure:options.exposure??1.7,uIntensity:options.intensity??1,uFalloff:options.falloff??.24,uNormalStrength:options.normalStrength??1,uRoughnessScale:options.roughness??.65,uAlbedoScale:options.albedo??.35}))gl.uniform1f(this.uniforms[key],value);
   gl.drawElements(gl.TRIANGLES,this.count,gl.UNSIGNED_SHORT,0);
  }
  destroy(){if(this.destroyed)return;this.destroyed=true;this.ready=false;this.events.abort();this.assetScript?.remove();const gl=this.gl;if(!gl)return;for(const tex of this.textures)gl.deleteTexture(tex);if(this.vao)gl.deleteVertexArray(this.vao);if(this.buffer)gl.deleteBuffer(this.buffer);if(this.index)gl.deleteBuffer(this.index);if(this.program)gl.deleteProgram(this.program);}
 }
 NativeRockScene.vertexShader=vertex;NativeRockScene.fragmentShader=fragment;NativeRockScene.buildGeometry=geometry;
 window.NativeRockScene=NativeRockScene;
})();
