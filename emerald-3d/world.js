(() => {
 'use strict';
 // A computed glass-award scene. One expensive ray-traced pass bakes the glass,
 // rock, and engraving into a small G-buffer (progressively, in strips); a cheap
 // per-frame pass adds the floating cubes, crack pulses, and the pointer light.
 const vertex=`#version 300 es
 in vec2 aPosition;void main(){gl_Position=vec4(aPosition,0.,1.);}`;

 const common=`
 uniform vec2 uResolution;uniform vec3 uRo;uniform mat3 uCam;uniform float uTanHalf;
 uniform vec3 uAccent;uniform mat3 uTrophyRot;uniform vec3 uTrophyPos;
 uniform vec3 uTB;uniform float uTaper;   // award half extents; taper is 0 for a loaded model
 #define TB uTB
 float hash13(vec3 p){p=fract(p*.1031);p+=dot(p,p.zyx+31.32);return fract((p.x+p.y)*p.z);}
 vec3 hash33(vec3 p){p=fract(p*vec3(.1031,.103,.0973));p+=dot(p,p.yxz+33.33);return fract((p.xxy+p.yxx)*p.zyx);}
 vec2 hash22(vec2 p){vec3 q=fract(p.xyx*vec3(.1031,.103,.0973));q+=dot(q,q.yzx+33.33);return fract((q.xx+q.yz)*q.zy);}
 vec3 cameraRay(vec2 frag){vec2 ndc=frag/uResolution*2.-1.;return normalize(uCam*vec3(ndc.x*uResolution.x/uResolution.y*uTanHalf,ndc.y*uTanHalf,1.));}
 `;

 const scene=`#version 300 es
 precision highp float;
 ${common}
 uniform sampler2D uInscription;uniform float uSeed;uniform float uCracks;uniform float uRock;
 // Loaded model (uMesh=1): face planes for the refraction exit, and the faceplate rectangle for the engraving.
 uniform float uMesh;uniform highp sampler2D uPlanes;uniform int uPlaneCount;uniform vec4 uPlate;
 uniform float uAward;   // 0: no award in the 3D scene (an image layer shows it instead)
 uniform sampler2D uAlbedo;uniform sampler2D uNormalMap;uniform sampler2D uRoughMap;uniform sampler2D uHeightMap;uniform float uHasMaps;
 layout(location=0) out vec4 oColor;layout(location=1) out vec4 oGeom;layout(location=2) out vec4 oFx;
 const float PI=3.14159265;
 float noise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
  return mix(mix(mix(hash13(i),hash13(i+vec3(1,0,0)),f.x),mix(hash13(i+vec3(0,1,0)),hash13(i+vec3(1,1,0)),f.x),f.y),
   mix(mix(hash13(i+vec3(0,0,1)),hash13(i+vec3(1,0,1)),f.x),mix(hash13(i+vec3(0,1,1)),hash13(i+vec3(1,1,1)),f.x),f.y),f.z);}
 float ridged(vec3 p){return 1.-abs(noise(p)*2.-1.);}
 // Trilinear (unsmoothed) noise leaves creases at cell walls: angular, broken-stone facets.
 float facet(vec3 p){vec3 i=floor(p),f=fract(p);
  return mix(mix(mix(hash13(i),hash13(i+vec3(1,0,0)),f.x),mix(hash13(i+vec3(0,1,0)),hash13(i+vec3(1,1,0)),f.x),f.y),
   mix(mix(hash13(i+vec3(0,0,1)),hash13(i+vec3(1,0,1)),f.x),mix(hash13(i+vec3(0,1,1)),hash13(i+vec3(1,1,1)),f.x),f.y),f.z);}
 float sharp(vec3 p){return 1.-abs(facet(p)*2.-1.);}

 // ---- Glass award: tapered slab, chamfered on every edge ----
 vec3 toLocal(vec3 p){return transpose(uTrophyRot)*(p-uTrophyPos);}
 float taperAt(float y){return 1.-uTaper*(clamp(y,-TB.y,TB.y)/TB.y*.5+.5);}
 float sdTrophyLocal(vec3 p){
  float k=taperAt(p.y);p.x/=k;vec3 a=abs(p),q=a-TB;
  float box=length(max(q,0.))+min(max(q.x,max(q.y,q.z)),0.);
  float c1=(a.x+a.z-(TB.x+TB.z)+.085)*.7071,c2=(a.y+a.z-(TB.y+TB.z)+.11)*.7071,c3=(a.x+a.y-(TB.x+TB.y)+.08)*.7071;
  return max(box,max(c1,max(c2,c3)))*k;
 }
 float sdTrophy(vec3 p){return sdTrophyLocal(toLocal(p));}
 vec3 trophyNormal(vec3 p){vec2 e=vec2(.0012,0);return normalize(vec3(sdTrophy(p+e.xyy)-sdTrophy(p-e.xyy),sdTrophy(p+e.yxy)-sdTrophy(p-e.yxy),sdTrophy(p+e.yyx)-sdTrophy(p-e.yyx)));}

 // ---- Volcanic ridge: crest profile, fall-off toward and away from camera, ridged displacement ----
 const float PX[20]=float[](-9.,-4.8,-4.3,-3.8,-3.45,-3.15,-2.9,-2.1,-1.15,-.86,-.55,-.19,.19,.58,.96,1.34,1.73,2.11,2.45,9.);
 const float PY[20]=float[](-1.85,-1.72,-1.5,-1.25,-1.1,-1.26,-1.1,-1.45,-1.36,-1.26,-1.55,-1.7,-1.85,-1.97,-2.1,-2.2,-2.33,-2.45,-2.55,-4.5);
 float profile(float x){
  float y=PY[19];
  for(int i=0;i<19;i++)if(x>=PX[i]&&x<PX[i+1]){float t=(x-PX[i])/(PX[i+1]-PX[i]);y=mix(PY[i],PY[i+1],t);}
  return x<PX[0]?PY[0]:y;
 }
 float rockHeight(vec2 xz){float z=xz.y;return profile(xz.x+.12*z)-.3*pow(max(z-.4,0.),1.5)-.6*max(-z-1.2,0.);}
 // Scanned dark-rock maps, projected on two planes (front and top) for displacement and shading.
 const float TEX=.45;
 float scanHeight(vec3 p,float lod){
  if(uHasMaps<.5)return .5;
  return .65*textureLod(uHeightMap,p.xy*TEX,lod).r+.35*textureLod(uHeightMap,p.xz*TEX+.37,lod).r;
 }
 float sdRock(vec3 p){
  float base=p.y-rockHeight(p.xz);
  if(base>1.3)return (base-.55)*.7;
  vec3 q=p*vec3(1.,1.25,1.)+uSeed;
  // A broken seat around the award: the rock rises to swallow its lower edge.
  vec3 s=p-uTrophyPos;float seat=exp(-pow(s.x/1.1,4.)-pow((s.z-.1)/.9,4.));
  base=mix(base,p.y-(uTrophyPos.y-TB.y+.16),seat*.85);
  // Large sharp facets first (broken slabs), then finer chips.
  float n=.42*sharp(q*vec3(.42,.75,.42)+2.3)+.3*sharp(q*vec3(.7,1.1,.7))+.24*sharp(q*1.6+1.7)+.17*sharp(q*3.4+3.1)+.1*sharp(q*7.2+7.3)+.045*sharp(q*15.+2.2);
  float scan=scanHeight(p,1.)-.5;
  return (base-((n-.62)*.95+scan*.3)*(1.-seat*.3))*.32;
 }
 float rockDistance(vec3 p){return sdRock(p)*2.;}
 vec3 rockNormal(vec3 p,float eps){vec2 e=vec2(eps,0);vec3 n=vec3(sdRock(p+e.xyy)-sdRock(p-e.xyy),sdRock(p+e.yxy)-sdRock(p-e.yxy),sdRock(p+e.yyx)-sdRock(p-e.yyx));
  vec3 q=p*26.;vec3 g=vec3(noise(q+vec3(.5,0,0))-noise(q-vec3(.5,0,0)),noise(q+vec3(0,.5,0))-noise(q-vec3(0,.5,0)),noise(q+vec3(0,0,.5))-noise(q-vec3(0,0,.5)));
  return normalize(normalize(n)-g*.1);
 }
 float occlusion(vec3 p,vec3 n){float o=0.,w=1.;for(int i=1;i<=5;i++){float h=.05+.11*float(i);o+=w*max(0.,h-min(rockDistance(p+n*h),sdTrophy(p+n*h)));w*=.7;}return clamp(1.-o*1.9,0.,1.);}
 vec3 voronoi3(vec3 x){vec3 n=floor(x),f=fract(x);float f1=8.,f2=8.;vec3 id=n;
  for(int k=-1;k<=1;k++)for(int j=-1;j<=1;j++)for(int i=-1;i<=1;i++){vec3 g=vec3(i,j,k),r=g+hash33(n+g)-f;float d=dot(r,r);if(d<f1){f2=f1;f1=d;id=n+g;}else if(d<f2)f2=d;}
  return vec3(sqrt(f2)-sqrt(f1),hash13(id*1.7+3.),0.);
 }
 vec3 basePoint(){return uTrophyPos+uTrophyRot*vec3(0.,-TB.y,.1);}
 // Emissive fissures: thin cell borders, brightest beside the award, sparse further away.
 // lum: scanned albedo brightness; its dark lines are the rock's real crevices.
 float crackField(vec3 p,float occ,float h,float lum){
  vec3 w=p+(vec3(noise(p*1.7),noise(p*1.7+5.2),noise(p*1.7+9.1))-.5)*.55;
  vec3 a=voronoi3(w*vec3(1.25,1.7,1.25)),b=voronoi3(w*3.1+11.);
  float near=exp(-length((p-basePoint())*vec3(.5,1.,.75))*1.15);
  float veins=smoothstep(.55,.72,noise(p*.45+vec3(2.,7.,1.)));
  float width=.012+.03*near,main=((1.-smoothstep(0.,width,a.x))+.1*exp(-a.x/(width*1.6)))*step(.72-.5*near,a.y);
  float fine=(1.-smoothstep(0.,.03,b.x))*step(.7-.3*near,b.y)*near;
  float cav=smoothstep(.25,.85,1.-occ+.45);
  float crevice=smoothstep(.1,.035,lum*(.4+h*.6))*smoothstep(.5,.78,noise(p*1.3+vec3(4.,1.,8.)))*(.07+2.6*near);
  return (main*(veins*.07+2.4*near*near+.6*near)*mix(1.,smoothstep(.55,.25,h),uHasMaps)+fine*.9+crevice*uHasMaps)*cav*uCracks;
 }
 vec3 brdf(vec3 N,vec3 V,vec3 L,vec3 alb,float rough){
  vec3 H=normalize(L+V);float nl=max(dot(N,L),0.),nv=max(dot(N,V),.001),nh=max(dot(N,H),0.),vh=max(dot(V,H),0.);
  float a=rough*rough,a2=a*a,dd=nh*nh*(a2-1.)+1.,D=a2/(PI*dd*dd),k=(rough+1.)*(rough+1.)/8.,G=nv/(nv*(1.-k)+k)*nl/(nl*(1.-k)+k),F=.04+.96*pow(1.-vh,5.);
  return (alb*(1.-F)/PI+vec3(D*G*F/max(4.*nv*nl,.001)))*nl;
 }
 vec3 tri(sampler2D map,vec3 p,vec3 w,float lod){return textureLod(map,p.zy*TEX+.71,lod).rgb*w.x+textureLod(map,p.xz*TEX+.37,lod).rgb*w.y+textureLod(map,p.xy*TEX,lod).rgb*w.z;}
 vec3 shadeRock(vec3 p,vec3 rd,vec3 n,float dist,out float crack){
  float lod=log2(max(1.,dist*2.*uTanHalf/uResolution.y*TEX*1024.));
  vec3 w=pow(abs(n),vec3(4.));w/=w.x+w.y+w.z;
  float lum=.5,tone=noise(p*2.6)*.6+noise(p*8.)*.4,rough=mix(.3,.8,facet(p*3.3+2.)),h=.5;vec3 alb=vec3(.016,.017,.018)*(.45+tone);
  if(uHasMaps>.5){
   vec3 raw=tri(uAlbedo,p,w,lod-1.);lum=dot(raw,vec3(.3,.55,.15));alb=vec3(pow(lum,2.6))*vec3(.1,.105,.11);rough=clamp(tri(uRoughMap,p,w,lod).r*.9,.18,.95);h=tri(uHeightMap,p,w,lod).r;
   // Whiteout-style blend of the three projected tangent-space normals.
   vec3 nx=textureLod(uNormalMap,p.zy*TEX+.71,lod).rgb*2.-1.,ny=textureLod(uNormalMap,p.xz*TEX+.37,lod).rgb*2.-1.,nz=textureLod(uNormalMap,p.xy*TEX,lod).rgb*2.-1.;
   vec3 bump=w.x*vec3(0.,nx.y,nx.x)*sign(n.x)+w.y*vec3(ny.x,0.,ny.y)*sign(n.y)+w.z*vec3(nz.x,nz.y,0.)*sign(n.z);
   n=normalize(n+bump*1.1);
  }
  float occ=occlusion(p,n)*mix(.5,1.,h);vec3 V=-rd;
  // Wet black stone: almost no diffuse, bright glancing highlights on the top facets.
  vec3 c=brdf(n,V,normalize(vec3(-.35,.85,-.5)),alb,rough)*vec3(.8,.86,.92)*2.2;      // cool rim from above, behind
  c+=brdf(n,V,normalize(vec3(.7,.5,.4)),alb,rough)*vec3(.8,.85,.9)*.6;                // key from the right (bright mist)
  c+=brdf(n,V,normalize(vec3(-.2,.3,1.)),alb,rough*.9)*vec3(.5,.56,.62)*.18;          // camera fill
  vec3 lp=basePoint()+vec3(0.,.12,.35),dl=lp-p;float d2=dot(dl,dl);
  c+=brdf(n,V,normalize(dl),alb,rough*.8)*uAccent*7./(1.+d2*3.5)+alb*uAccent*2.5/(1.+d2*4.);                    // award base glow
  c+=alb*vec3(.32,.38,.42)*.15;
  c*=mix(.15,1.,occ);
  crack=crackField(p,occ,h,lum);
  c+=uAccent*crack*.6;
  vec3 R=reflect(rd,n);
  float wet=pow(max(dot(R,normalize(vec3(-.25,.8,-.55))),0.),120.)*smoothstep(.45,.85,h)+pow(max(dot(R,normalize(vec3(.75,.45,.3))),0.),90.)*.5*smoothstep(.45,.85,h);
  c+=vec3(.8,.86,.9)*wet*.6*occ;
  c=mix(c,vec3(.006,.008,.009),1.-exp(-max(dist-9.5,0.)*.11));
  return c;
 }
 vec3 sky(vec3 r){return vec3(.002,.003,.0032)+vec3(.028,.032,.032)*smoothstep(.1,-.3,r.y);}   // distant mist below the horizon
 vec3 env(vec3 r){
  vec3 c=sky(r);
  c+=vec3(.92,.96,1.)*pow(max(dot(r,normalize(vec3(.55,.78,.3))),0.),55.)*3.;
  c+=vec3(.95,.98,1.)*smoothstep(.9,.985,dot(r,normalize(vec3(.95,.15,.25))))*2.4;   // tall strip on the right: white right-hand bevels
  c+=vec3(.85,.92,1.)*smoothstep(.955,.995,dot(r,normalize(vec3(-.82,.42,.38))))*1.6;
  c+=vec3(.9,.95,1.)*smoothstep(.97,.998,dot(r,normalize(vec3(.1,.98,.15))))*1.3;
  c+=uAccent*smoothstep(-.05,-.75,r.y)*.3;
  return c;
 }
 vec3 traceBehind(vec3 ro,vec3 rd,out float miss){
  float t=0.;miss=1.;if(uRock<.5)return sky(rd);
  for(int i=0;i<150;i++){vec3 p=ro+rd*t;float d=p.y>-.2?p.y+.35:sdRock(p);if(d<.0015*t+.001){float c;miss=0.;return shadeRock(p,rd,rockNormal(p,.004),distance(uRo,p),c);}t+=d;if(t>32.)break;}
  return sky(rd);
 }
 // Crystal facets for the chamfered rims: per-cell random value and distance to the cell border.
 vec2 facets(vec2 x){
  vec2 n=floor(x),f=fract(x),id=n;float d1=8.,d2=8.;
  for(int j=-1;j<=1;j++)for(int i=-1;i<=1;i++){vec2 g=vec2(i,j),r=g+hash22(n+g)-f;float d=dot(r,r);if(d<d1){d2=d1;d1=d;id=n+g;}else if(d<d2)d2=d;}
  return vec2(hash22(id*1.7+3.).x,sqrt(d2)-sqrt(d1));
 }
 // Where a ray inside the award leaves it. Loaded model: nearest face plane ahead (exact for convex bodies,
 // close for nearly convex ones). Built-in slab: march the signed distance.
 vec3 glassExit(vec3 p,vec3 r1,out vec3 no){
  if(uMesh>.5){
   mat3 inv=transpose(uTrophyRot);vec3 lp=toLocal(p),lr=inv*r1;float best=8.;vec3 bn=-lr;
   for(int i=0;i<256;i++){if(i>=uPlaneCount)break;vec4 q=texelFetch(uPlanes,ivec2(i,0),0);float dn=dot(q.xyz,lr);
    if(dn>1e-4){float t=(q.w-dot(q.xyz,lp))/dn;if(t>1e-3&&t<best){best=t;bn=q.xyz;}}}
   no=uTrophyRot*bn;return p+r1*min(best,4.);
  }
  vec3 q=p;for(int i=0;i<56;i++){float d=-sdTrophy(q);if(d<.0012)break;q+=r1*max(d,.005);}
  no=trophyNormal(q);return q;
 }
 vec3 shadeGlass(vec3 p,vec3 rd,vec3 n,out float glow,out float alpha){
  mat3 inv=transpose(uTrophyRot);
  vec3 lp=toLocal(p),ln=inv*n,lrd=inv*rd;
  float cosi=max(dot(-rd,n),0.),fres=.04+.96*pow(1.-cosi,5.);
  vec3 R=reflect(rd,n),refl=env(R);
  float axis=max(abs(ln.x),max(abs(ln.y),abs(ln.z))),bevel=smoothstep(.985,.9,axis);
  vec3 spec=vec3(1.)*(pow(max(dot(R,normalize(vec3(.5,.8,.35))),0.),240.)*7.+pow(max(dot(R,normalize(vec3(-.75,.5,.45))),0.),160.)*3.5);
  // Refract in, cross the slab, refract out (or reflect internally).
  vec3 r1=refract(rd,n,1./1.5),no,q=glassExit(p-n*.003,r1,no);
  vec3 r2=refract(r1,-no,1.5);float miss=0.;
  bool tir=dot(r2,r2)<1e-4;vec3 behind;
  // Total internal reflection reads as the frosted grey-green of the side faces.
  if(tir)behind=env(reflect(r1,-no))*vec3(.55,.72,.62)*.5+vec3(.035,.05,.045);else behind=traceBehind(q+r2*.01,r2,miss);
  vec3 lq=toLocal(q);float len=distance(p,q);
  vec3 absorb=exp(-len*vec3(.45,.12,.32));
  float k1=taperAt(lp.y),k2=taperAt(lq.y);
  float e1=min(TB.x*k1-abs(lp.x),TB.y-abs(lp.y)),e2=min(TB.x*k2-abs(lq.x),TB.y-abs(lq.y));
  float edge=exp(-max(e1,0.)*22.)+exp(-max(e2,0.)*18.)*.5;
  float base=exp(-(lp.y+TB.y)*3.)*.5+exp(-(lq.y+TB.y)*5.)*.35;
  float side=exp(-(lp.x+TB.x*k1)*5.)*.25;
  float ins=0.;
  if(ln.z>.9){vec3 at=lp+lrd*(.012/max(-lrd.z,.3));
   if(uMesh>.5){
    // The model's faceplate image: crisp white lettering inside a soft glow. Keep only the letters, sampled sharp.
    vec2 uv=(at.xy-uPlate.xy)/(uPlate.zw-uPlate.xy);float v=texture(uInscription,uv,-.7).r;
    ins=smoothstep(.6,.85,v)*.75*step(0.,uv.x)*step(uv.x,1.)*step(0.,uv.y)*step(uv.y,1.);
   }else ins=texture(uInscription,vec2(at.x/(TB.x*taperAt(at.y))*.5+.5,at.y/TB.y*.5+.5)).r;
  }
  float left=smoothstep(.2,-.6,ln.x),low=smoothstep(.2,-.6,ln.y),sideFace=smoothstep(.9,.985,abs(ln.x))*(1.-bevel),topFace=smoothstep(.9,.985,ln.y)*(1.-bevel);
  vec3 c=behind*absorb*(1.-fres)*1.15+refl*fres*mix(1.4,.5,sideFace)+spec*(.35+bevel*2.2);
  c+=uAccent*vec3(.6,1.,.7)*.004*(1.-fres);                                            // faint tint inside the slab
  c+=uAccent*(edge*.3+base*1.2+side*.15)*.3;
  c+=uAccent*bevel*(.04+left*.45+low*.5)*.7+vec3(.9,.97,.94)*bevel*smoothstep(-.1,.6,ln.y+ln.x*.6)*.8;
  c+=vec3(.62,.7,.68)*sideFace*.03+vec3(.8,.9,.86)*topFace*.35;                         // frosted side and top faces
  c+=vec3(.9,.97,.93)*ins*2.4+uAccent*ins*.06;
  // Wide chamfered rims around the front face, as on the reference award: crystal facets reflecting the
  // studio light, white along the top and upper right, green from the base and up the left side.
  float rim=0.;
  if(uMesh>.5&&ln.z>.9){
   float ex=TB.x-abs(lp.x),ey=TB.y-abs(lp.y);rim=1.-smoothstep(.125,.14,min(ex,ey));
   vec3 out_=ex<ey?vec3(sign(lp.x),0,0):vec3(0,sign(lp.y),0),nb=normalize(n+uTrophyRot*out_*.85),Rb=reflect(rd,nb);
   vec2 fc=facets(lp.xy*vec2(7.,4.)+out_.xy*3.1);
   float green=clamp(.15+.55*step(out_.x,-.5)+.9*step(out_.y,-.5)+.9*smoothstep(-.2,-1.5,lp.y),0.,1.6);
   float white=step(.5,out_.y)*.9+step(.5,out_.x)*smoothstep(-.6,1.3,lp.y)*.8+.12;
   vec3 rc=env(Rb)*(.35+.8*fc.x)+uAccent*green*(.3+.6*fc.x)+vec3(.92,.98,.95)*white*(.2+.5*fc.x)+vec3(.85,1.,.9)*(1.-smoothstep(0.,.05,fc.y))*.18;
   rc+=vec3(1.)*pow(max(dot(Rb,normalize(vec3(.5,.8,.35))),0.),60.)*1.5;
   c=mix(c,rc,rim);
  }
  bevel=max(bevel,rim);
  glow=clamp((edge*.3+base+side*.3+bevel*.4)*.3,0.,1.);
  // Over the artwork plate (no traced rock) the clear face lets the plate show through; rims and engraving stay opaque.
  float clear=uRock<.5?.92*(1.-bevel)*(1.-ins):.1;
  alpha=clamp(1.-miss*(1.-fres)*clear*(1.-edge*.5),0.,1.);
  return c;
 }
 vec2 octEncode(vec3 n){n/=abs(n.x)+abs(n.y)+abs(n.z);vec2 e=n.z>=0.?n.xy:(1.-abs(n.yx))*vec2(n.x>=0.?1.:-1.,n.y>=0.?1.:-1.);return e*.5+.5;}
 vec3 tone(vec3 c){return pow(1.-exp(-max(c,0.)*1.35),vec3(1./2.2));}
 #ifdef MESH_PASS
 // Loaded model, rasterized: same glass shading, depth-tested against the traced rock.
 in vec3 vWorld;in vec3 vNormal;
 void main(){
  vec3 rd=normalize(vWorld-uRo),n=normalize(vNormal);if(dot(n,rd)>0.)discard;
  float glow,alpha;vec3 c=tone(shadeGlass(vWorld,rd,n,glow,alpha));
  oColor=vec4(c*alpha,alpha);oGeom=vec4(0);oFx=vec4(0.,glow,0.,1.);gl_FragDepth=clamp(distance(uRo,vWorld)/48.,0.,1.);
 }
 #else
 void main(){
  vec3 rd=cameraRay(gl_FragCoord.xy),ro=uRo;
  float t=0.,hit=-1.,minG=1e3;bool glass=false;
  for(int i=0;i<300;i++){
   vec3 p=ro+rd*t;float s=uAward>.5?sdTrophy(p):1e3,g=uMesh>.5?1e3:s,r=uRock<.5?1e3:p.y>-.15?p.y+.3:sdRock(p);minG=min(minG,s);
   if(min(g,r)<.0009*t){hit=t;glass=g<r;break;}
   t+=uMesh>.5?min(r,abs(s)+.02):min(g,r);if(t>42.)break;   // with a model the slab only feeds the halo, so step through it
  }
  oGeom=vec4(0);oFx=vec4(0);gl_FragDepth=hit<0.?1.:clamp(hit/48.,0.,1.);
  if(hit<0.){
   float halo=exp(-max(minG,0.)*5.)*.006+exp(-max(minG,0.)*40.)*.02;
   vec3 c=tone(uAccent*halo);float a=max(c.r,max(c.g,c.b));
   oColor=vec4(c,a);oFx.g=halo;return;
  }
  vec3 p=ro+rd*hit;
  if(glass){
   float glow,alpha;vec3 c=tone(shadeGlass(p,rd,trophyNormal(p),glow,alpha));
   oColor=vec4(c*alpha,alpha);oFx=vec4(0.,glow,0.,1.);
  }else{
   vec3 n=rockNormal(p,.0018*hit);float crack;vec3 c=tone(shadeRock(p,rd,n,hit,crack));
   float depth=clamp(hit/48.,0.,1.)*255.;
   oColor=vec4(c,1.);oGeom=vec4(octEncode(n),floor(depth)/255.,fract(depth));oFx=vec4(clamp(crack*.5,0.,1.),0.,1.,0.);
  }
 }
 #endif
`;
 // Vertex stage for the loaded model: the same pinhole camera as cameraRay(), as a projection.
 const meshVertex=`#version 300 es
 in vec3 aPos;in vec3 aNormal;
 uniform vec2 uResolution;uniform vec3 uRo;uniform mat3 uCam;uniform float uTanHalf;uniform mat3 uTrophyRot;uniform vec3 uTrophyPos;
 out vec3 vWorld;out vec3 vNormal;
 void main(){
  vec3 w=uTrophyRot*aPos+uTrophyPos,v=w-uRo;float z=dot(v,uCam[2]),aspect=uResolution.x/uResolution.y;
  gl_Position=vec4(dot(v,uCam[0])/(uTanHalf*aspect),dot(v,uCam[1])/uTanHalf,z*.5,z);vWorld=w;vNormal=uTrophyRot*aNormal;
 }`;
 const meshFragment=scene.replace('#version 300 es','#version 300 es\n #define MESH_PASS');

 const composite=`#version 300 es
 precision highp float;
 ${common}
 uniform sampler2D uColor;uniform sampler2D uGeom;uniform sampler2D uFx;uniform vec2 uSource;
 uniform float uTime;uniform vec4 uPointer;uniform vec3 uPointerColor;uniform vec4 uWave;uniform float uWaveStrength;uniform float uBreath;
 uniform vec4 uCubes[2];uniform mat3 uCubeRot[2];uniform float uCubeBlur[2];
 out vec4 o;
 vec3 octDecode(vec2 e){e=e*2.-1.;vec3 n=vec3(e,1.-abs(e.x)-abs(e.y));if(n.z<0.)n.xy=(1.-abs(n.yx))*vec2(n.x>=0.?1.:-1.,n.y>=0.?1.:-1.);return normalize(n);}
 float sdBox(vec3 p,vec3 b){vec3 q=abs(p)-b;return length(max(q,0.))+min(max(q.x,max(q.y,q.z)),0.);}
 vec2 boxHit(vec3 ro,vec3 rd,vec3 b){vec3 m=1./rd,n=m*ro,k=abs(m)*b,t1=-n-k,t2=-n+k;float tn=max(max(t1.x,t1.y),t1.z),tf=min(min(t2.x,t2.y),t2.z);return tn>tf||tf<0.?vec2(-1):vec2(tn,tf);}
 float edgeDistance(vec3 p,vec3 b){vec3 d=max(b-abs(p),0.);return d.x+d.y+d.z-min(d.x,min(d.y,d.z))-max(d.x,max(d.y,d.z));}
 vec4 cube(vec3 ro,vec3 rd,int i){
  vec3 c=uCubes[i].xyz,b=vec3(uCubes[i].w);mat3 R=uCubeRot[i];float s=uCubes[i].w,blur=uCubeBlur[i];
  vec3 lo=transpose(R)*(ro-c),ld=transpose(R)*rd;vec2 h=boxHit(lo,ld,b);
  float tc=max(dot(-lo,ld),0.),miss=sdBox(lo+ld*tc,b)/s,width=.025+blur*.3;
  vec3 col=h.x>0.?vec3(0):mix(vec3(.08,.1,.09),uAccent*.25,.3)*exp(-max(miss,0.)/(blur+.02))*.5;float a=0.;
  if(h.x>0.){
   vec3 p1=lo+ld*h.x,p2=lo+ld*h.y,ap=abs(p1)/b;
   vec3 n=ap.x>ap.y&&ap.x>ap.z?vec3(sign(p1.x),0,0):ap.y>ap.z?vec3(0,sign(p1.y),0):vec3(0,0,sign(p1.z));
   float g1=exp(-edgeDistance(p1,b)/s/width),g2=exp(-edgeDistance(p2,b)/s/(width*1.3))*.55;
   float fres=pow(1.-abs(dot(n,ld)),3.),top=max(dot(R*n,normalize(vec3(.3,.9,.4))),0.);
   float thick=clamp((h.y-h.x)/(s*2.),0.,1.5);
   vec3 frost=mix(vec3(.05,.06,.06),uAccent*.1,.1)*(.55+.9*top)+vec3(.5,.56,.55)*fres*.2;
   col+=frost*(.6+.4*thick)+mix(uAccent,vec3(1),.45)*(g1*.45+g2*.25)+vec3(.9,.97,.94)*pow(g1,5.)*.3;
   a=clamp(.12+.08*thick+g1*.35+g2*.12+fres*.12,0.,.7);
  }
  a=max(a,max(col.r,max(col.g,col.b))*.8);
  return vec4(col,min(a,1.));
 }
 // Add emissive light in linear space: invert the bake's tone curve, add, re-apply.
 vec3 screen(vec3 base,vec3 light){vec3 lin=-log(max(1.-pow(max(base,0.),vec3(2.2)),.002))/1.35;return pow(1.-exp(-(lin+max(light,0.))*1.35),vec3(1./2.2));}
 void main(){
  vec2 uv=gl_FragCoord.xy/uResolution;vec3 rd=cameraRay(gl_FragCoord.xy);
  vec4 base=texture(uColor,uv),fx=texture(uFx,uv),g=texelFetch(uGeom,ivec2(uv*uSource),0);
  vec3 col=base.a>0.?base.rgb/base.a:vec3(0);float alpha=base.a;vec3 add=vec3(0);
  if(fx.b>.5){
   vec3 P=uRo+rd*(g.z+g.w/255.)*48.,N=octDecode(g.xy),V=-rd;
   float d=length(P-uWave.xyz),ring=exp(-pow((d-uWave.w)*2.,2.))*uWaveStrength;
   add+=uAccent*fx.r*2.*(uBreath*.35+ring*3.2+uWaveStrength*.4*exp(-d*.5));
   vec3 L=uPointer.xyz-P;float d2=dot(L,L);L=normalize(L);vec3 H=normalize(L+V);
   float light=uPointer.w/(1.+d2*4.5);
   add+=uPointerColor*light*(max(dot(N,L),0.)*.012+pow(max(dot(N,H),0.),64.)*(.04+.96*pow(1.-max(dot(V,H),0.),5.))*9.);
   add+=uAccent*fx.r*light*1.2;
  }
  add+=uAccent*fx.g*(uBreath*.18+uWaveStrength*.55);
  if(fx.a>.5){float l=uPointer.w/(1.+dot(uPointer.xyz-uTrophyPos,uPointer.xyz-uTrophyPos)*.5);add+=uPointerColor*fx.g*l*.6;}
  col=screen(col,add);alpha=max(alpha,min(1.,max(add.r,max(add.g,add.b))));
  for(int i=0;i<2;i++){vec4 c=cube(uRo,rd,i);col=col*(1.-c.a)+c.rgb;alpha=alpha+c.a*(1.-alpha);}
  o=vec4(clamp(col,0.,1.)*alpha,alpha);
 }`;

 const QUALITY={low:{scale:.6,cap:1280,strip:140000},medium:{scale:1,cap:1920,strip:240000},high:{scale:1.5,cap:2880,strip:360000}};   // medium: native resolution, so the glass stays crisp
 const clamp=(n,min=0,max=1)=>Math.max(min,Math.min(max,n));
 const sub=(a,b)=>a.map((v,i)=>v-b[i]),dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
 const norm=v=>{const d=Math.hypot(...v)||1;return v.map(x=>x/d);};
 const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
 const rgb=hex=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255);
 // Column-major 3×3 rotations.
 const rotation=(yaw,pitch,roll)=>{
  const cy=Math.cos(yaw),sy=Math.sin(yaw),cp=Math.cos(pitch),sp=Math.sin(pitch),cr=Math.cos(roll),sr=Math.sin(roll);
  const Y=[cy,0,-sy,0,1,0,sy,0,cy],X=[1,0,0,0,cp,sp,0,-sp,cp],Z=[cr,sr,0,-sr,cr,0,0,0,1];
  const mul=(a,b)=>Array.from({length:9},(_,k)=>{const c=Math.floor(k/3),r=k%3;return a[r]*b[c*3]+a[3+r]*b[c*3+1]+a[6+r]*b[c*3+2];});
  return mul(Z,mul(Y,X));
 };
 const TROPHY=[-2.1,.24,0],TROPHY_ROT=rotation(.45,-.06,-.1);   // as in the reference: left side face showing, tilted clockwise, leaning back

 const defaultCubes=[{at:[.07,.29],depth:2.4,size:.05,blur:.12,spin:[.5,.7,.35]},{at:[.975,.74],depth:3.2,size:.055,blur:.16,spin:[-.4,.3,.6]}];
 const defaultInscription={logo:['FOSS','UNITED'],title:'FOSS AWARDS',year:'2026',award:['Student Community','of the Year'],mark:'<. >',name:'Point Blank',footer:'INDIAFOSS 2026'};
 function drawInscription(canvas,text){
  const w=canvas.width=512,h=canvas.height=1024,c=canvas.getContext('2d');
  c.fillStyle='#000';c.fillRect(0,0,w,h);c.fillStyle=c.strokeStyle='#fff';c.textAlign='center';c.textBaseline='middle';
  const condensed='"Oswald","Bebas Neue","Arial Narrow",sans-serif',sans='"Lexend","Segoe UI",sans-serif',mono='"JetBrains Mono","Space Mono","DejaVu Sans Mono",monospace';
  c.globalAlpha=.32;c.lineWidth=2;c.strokeRect(84,52,w-168,h-104);c.globalAlpha=1;           // inset bevel frame
  c.lineWidth=5;c.strokeRect(w/2-78,128,156,118);
  c.font=`700 56px ${condensed}`;c.fillText(text.logo[0],w/2,174);c.font=`700 38px ${condensed}`;c.fillText(text.logo[1],w/2,222);
  c.font=`600 60px ${condensed}`;c.fillText(text.title,w/2,322);
  c.font=`400 32px ${sans}`;c.fillText(text.year,w/2,396);c.lineWidth=2;
  c.beginPath();c.moveTo(150,396);c.lineTo(205,396);c.moveTo(w-205,396);c.lineTo(w-150,396);c.stroke();
  c.font=`400 25px ${sans}`;c.fillText(text.award[0],w/2,458);c.fillText(text.award[1],w/2,500);
  for(const side of [-1,1]){c.save();c.translate(w/2+side*150,478);c.scale(side,1);c.lineWidth=3;
   c.scale(.8,.8);c.beginPath();c.arc(30,-6,48,Math.PI*.6,Math.PI*1.25);c.stroke();
   for(let i=0;i<6;i++){const a=Math.PI*(.62+i*.11),x=30+Math.cos(a)*48,y=-6+Math.sin(a)*48;c.save();c.translate(x,y);c.rotate(a+Math.PI*.35);c.beginPath();c.ellipse(0,-9,4.5,11,0,0,Math.PI*2);c.fill();c.restore();}
   c.restore();}
  c.font=`300 84px ${sans}`;c.fillText(text.mark,w/2,606);
  c.font=`400 45px ${mono}`;c.fillText(text.name,w/2,700);
  c.font=`600 28px ${sans}`;c.fillText(text.footer,w/2,850);
  for(let i=0;i<6;i++){c.beginPath();c.arc(w/2-62+i*25,898,3.5,0,Math.PI*2);c.fill();}
  return canvas;
 }

 class EmeraldWorld{
  constructor(canvas,{quality='medium',accent='#3dff3a',inscription=defaultInscription,seed=7.3,cracks=1,rockMaps=['assets/rock/','assets/rock-generated/'],rock=true,anchor=null,cubes=defaultCubes,model=window.EmeraldTrophyModel,award=true,limits={},onReady,onError,onMaps}={}){
   this.limits={...limits};this.award=Boolean(award);if(!this.award)model=null;this.rock=Boolean(rock);this.anchor=anchor;this.cubeSpec=cubes;
   this.canvas=canvas;this.quality=QUALITY[quality]?quality:'medium';this.accent=accent;this.seed=seed;this.cracks=cracks;this.inscription={...defaultInscription,...inscription};
   this.onReady=onReady;this.onError=onError;this.onMaps=onMaps;this.destroyed=false;this.job=null;this.display=null;this.preview=null;this.time=0;
   this.pointer={x:.3,y:.6,strength:0,color:accent};this.wave={origin:[...TROPHY],radius:0,strength:0};this.events=new AbortController();
   const gl=this.gl=canvas.getContext('webgl2',{alpha:true,depth:false,premultipliedAlpha:true,antialias:false,failIfMajorPerformanceCaveat:true,powerPreference:'low-power'});
   if(!gl)throw Error('WebGL2 is unavailable.');
   const compile=(type,source)=>{const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s;};
   const program=(fs,vs=vertex,attributes=['aPosition'])=>{const p=gl.createProgram(),v=compile(gl.VERTEX_SHADER,vs),f=compile(gl.FRAGMENT_SHADER,fs);gl.attachShader(p,v);gl.attachShader(p,f);attributes.forEach((name,i)=>gl.bindAttribLocation(p,i,name));gl.linkProgram(p);gl.deleteShader(v);gl.deleteShader(f);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(p));return p;};
   this.sceneProgram=program(scene);this.compositeProgram=program(composite);
   if(model)this.loadModel(model,program);
   this.buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),gl.STATIC_DRAW);
   this.vao=gl.createVertexArray();gl.bindVertexArray(this.vao);gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,2,gl.FLOAT,false,0,0);
   this.inscriptionCanvas=document.createElement('canvas');this.inscriptionTexture=gl.createTexture();this.uploadInscription();
   canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();this.lost=true;onError?.(Error('The 3D graphics context was lost.'));},{signal:this.events.signal});
   this.maps=[];this.resize();if(rockMaps&&this.rock)this.loadRockMaps([].concat(rockMaps));
   // Re-measure only after a size change; without ResizeObserver, render() measures every frame.
   if(globalThis.ResizeObserver){this.observer=new globalThis.ResizeObserver(()=>{this.sizeDirty=true;});this.observer.observe(canvas);globalThis.addEventListener?.('resize',()=>{this.sizeDirty=true;},{signal:this.events.signal});}
  }
  // Surface maps, tried in order: the Poly Haven 'Rock Face 03' scan (CC0), then our generated set; without
  // either the shader keeps its procedural stone. From file:// the embedded data-URL copies keep WebGL origin-clean.
  loadRockMaps([base,...fallbacks]){
   if(!base||typeof Image==='undefined'||!globalThis.document?.head)return;
   const key=base.replace(/\/$/,'').split('/').pop(),sets=()=>window.EmeraldMapSets?.[key];
   const names=['albedo.webp','normal.webp','roughness.webp','height.webp'];
   const sources=globalThis.location?.protocol!=='file:'?Promise.resolve(null):sets()?Promise.resolve(sets()):new Promise((resolve,reject)=>{const script=document.createElement('script');(this.mapScripts??=[]).push(script);script.src=base+'embedded-maps.js';script.onload=()=>sets()?resolve(sets()):reject(Error('Embedded maps missing for '+key));script.onerror=()=>reject(Error('Could not load embedded rock maps.'));document.head.append(script);});
   const load=(name,map)=>new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>reject(Error('Could not load rock map '+name));image.src=map?.[name]||base+name;});
   sources.then(map=>Promise.all(names.map(name=>load(name,map)))).then(images=>{
    if(this.destroyed)return;const gl=this.gl;
    this.maps=images.map(image=>{const tex=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,tex);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,image);gl.generateMipmap(gl.TEXTURE_2D);
     gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.REPEAT);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.REPEAT);return tex;});
    this.mapSource=key;this.invalidate();this.onMaps?.(key);
   }).catch(error=>{if(this.destroyed)return;console.warn('Rock maps '+key+' unavailable:',error.message);if(fallbacks.length)this.loadRockMaps(fallbacks);});
  }
  uniforms(program){return this.locations?.get(program)||(this.locations??=new Map()).set(program,new Proxy({},{get:(cache,key)=>key in cache?cache[key]:(cache[key]=this.gl.getUniformLocation(program,key))})).get(program);}
  // A converted model (tools/convert-trophy.py): rasterized glass body, face planes for refraction, faceplate engraving.
  loadModel(model,program){
   const gl=this.gl,count=model.planes.length,planes=new Float32Array(count*4);model.planes.forEach((q,i)=>planes.set(q,i*4));
   this.meshProgram=program(meshFragment,meshVertex,['aPos','aNormal']);
   this.meshVao=gl.createVertexArray();gl.bindVertexArray(this.meshVao);this.meshBuffers=[];
   [model.positions,model.normals].forEach((data,i)=>{const b=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,b);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(data),gl.STATIC_DRAW);gl.enableVertexAttribArray(i);gl.vertexAttribPointer(i,3,gl.FLOAT,false,0,0);this.meshBuffers.push(b);});
   const index=gl.createBuffer();gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,index);gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,new Uint16Array(model.indices),gl.STATIC_DRAW);this.meshBuffers.push(index);gl.bindVertexArray(null);
   this.planeTexture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,this.planeTexture);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA32F,count,1,0,gl.RGBA,gl.FLOAT,planes);
   gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
   this.model={count:model.indices.length,planes:count,half:model.half,plate:model.plate?.rect||[-model.half[0],-model.half[1],model.half[0],model.half[1]]};
   if(model.plate?.src&&typeof Image!=='undefined'){const image=new Image();image.onload=()=>{if(this.destroyed)return;this.plateImage=image;this.uploadInscription();this.invalidate();};image.src=model.plate.src;}
  }
  uploadInscription(){
   const gl=this.gl,source=this.plateImage||drawInscription(this.inscriptionCanvas,this.inscription);gl.bindTexture(gl.TEXTURE_2D,this.inscriptionTexture);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);
   gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,source);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);gl.generateMipmap(gl.TEXTURE_2D);
   gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
  }
  targets(width,height){
   const gl=this.gl,fb=gl.createFramebuffer(),textures=[];gl.bindFramebuffer(gl.FRAMEBUFFER,fb);
   for(let i=0;i<3;i++){const tex=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,tex);gl.texStorage2D(gl.TEXTURE_2D,1,gl.RGBA8,width,height);const filter=i===1?gl.NEAREST:gl.LINEAR;
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,filter);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,filter);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0+i,gl.TEXTURE_2D,tex,0);textures.push(tex);}
   // Depth: the traced pass writes ray distance, so the rasterized model hides behind rock correctly.
   const depth=gl.createRenderbuffer();gl.bindRenderbuffer(gl.RENDERBUFFER,depth);gl.renderbufferStorage(gl.RENDERBUFFER,gl.DEPTH_COMPONENT24,width,height);gl.framebufferRenderbuffer(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.RENDERBUFFER,depth);
   gl.drawBuffers([gl.COLOR_ATTACHMENT0,gl.COLOR_ATTACHMENT1,gl.COLOR_ATTACHMENT2]);
   if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw Error('The 3D G-buffer is unsupported.');
   gl.clearBufferfv(gl.COLOR,0,[0,0,0,0]);gl.clearBufferfv(gl.COLOR,1,[0,0,0,0]);gl.clearBufferfv(gl.COLOR,2,[0,0,0,0]);gl.clearBufferfv(gl.DEPTH,0,[1]);
   gl.bindFramebuffer(gl.FRAMEBUFFER,null);return {fb,textures,depth,width,height};
  }
  release(target){if(!target)return;const gl=this.gl;gl.deleteFramebuffer(target.fb);gl.deleteRenderbuffer(target.depth);target.textures.forEach(t=>gl.deleteTexture(t));}
  // Camera keeps the award on the left third of wide screens and centred on narrow ones.
  view(target,ro,tanHalf,aspect){const f=norm(sub(target,ro)),r=norm(cross(f,[0,1,0])),u=cross(r,f);return {ro,tanHalf,aspect,r,u,f,matrix:new Float32Array([...r,...u,...f])};}
  camera(aspect){
   const tanHalf=.3;
   if(this.anchor){
    // Anchored: the award's base lands on a given screen point and its height spans a given screen fraction
    // (used to align it with the artwork plate). The camera sits a little above, looking slightly down.
    const {x:sx,y:sy,height}=this.anchor,dist=3.1/(Math.max(.05,height)*2*tanHalf),base=[TROPHY[0],TROPHY[1]-1.5,.2];
    const target=[TROPHY[0],TROPHY[1]-1.5,0];let cam;
    for(let i=0;i<5;i++){
     cam=this.view(target,[target[0],target[1]+dist*.2,dist],tanHalf,aspect);const p=this.project(base,cam);
     target[0]+=(p.x-sx)*2*dist*tanHalf*aspect;target[1]-=(p.y-sy)*2*dist*tanHalf;
    }
    return this.view(target,[target[0],target[1]+dist*.2,dist],tanHalf,aspect);
   }
   const lean=clamp((aspect-.8)/(1.55-.8)),screenX=.5-.22*lean,dist=9+(1-lean)*6.5;
   // Portrait: lift the award into the upper third so the copy can sit beneath it.
   // Slightly above the award, so its top face shows as a thin bright sliver and the ridge tops catch light.
   const lift=(1-lean)*1.75,x=TROPHY[0]-(screenX-.5)*2*dist*tanHalf*aspect;
   return this.view([x,-.05-lift,0],[x,1.5+(1-lean)*.35-lift,dist],tanHalf,aspect);
  }
  project(p,c=this.cam){const v=sub(p,c.ro),z=dot(v,c.f);return{x:.5+dot(v,c.r)/(z*c.tanHalf*c.aspect)*.5,y:.5-dot(v,c.u)/(z*c.tanHalf)*.5};}
  unproject(x,y,planeZ){const c=this.cam,nx=(x*2-1)*c.aspect*c.tanHalf,ny=(1-y*2)*c.tanHalf,d=norm([0,1,2].map(i=>c.r[i]*nx+c.u[i]*ny+c.f[i])),t=(planeZ-c.ro[2])/d[2];return c.ro.map((v,i)=>v+d[i]*t);}
  anchors(){const base=[TROPHY[0],TROPHY[1]-1.5,.2];return{base:this.project(base),top:this.project([TROPHY[0],TROPHY[1]+1.6,0]),center:this.project(TROPHY)};}
  resize(){
   const r=this.canvas.getBoundingClientRect(),q=QUALITY[this.quality],dpr=Math.min(globalThis.devicePixelRatio||1,this.limits.maxDpr||2);
   const scale=Math.min(q.scale*dpr,q.cap/Math.max(1,r.width),(this.limits.maxDimension||Infinity)/Math.max(r.width,r.height,1),Math.sqrt((this.limits.maxPixels||Infinity)/Math.max(1,r.width*r.height))),width=Math.max(2,Math.floor(r.width*scale)),height=Math.max(2,Math.floor(r.height*scale));
   const key=width+'x'+height;if(key===this.sizeKey)return;this.sizeKey=key;
   this.canvas.width=width;this.canvas.height=height;this.cam=this.camera(width/height);
   const dist=this.cam.ro[2],tanHalf=this.cam.tanHalf,unit=this.anchor?this.anchor.height/.51:.5+.5*clamp((this.cam.aspect-.8)/.75);
   // Defocused glass cubes placed in screen space; `size` is a half-extent as a fraction of the screen height.
   this.cubes=this.cubeSpec.map(c=>({...c,center:this.unproject(c.at[0],c.at[1],c.depth),size:c.size*2*(dist-c.depth)*tanHalf*unit}));
   this.invalidate();
  }
  invalidate(){
   if(this.destroyed)return;
   this.release(this.job?.target);
   const {width,height}=this.canvas,previewScale=Math.min(.25,Math.sqrt((this.limits.stripPixels||Infinity)/(width*height))),small=this.targets(Math.max(2,Math.floor(width*previewScale)),Math.max(2,Math.floor(height*previewScale)));
   this.drawScene(small,0,small.height);this.release(this.preview);this.preview=small;
   if(!this.display||this.display.width!==width||this.display.height!==height){this.release(this.display);this.display=null;}
   this.job={target:this.targets(width,height),row:0};
  }
  drawScene(target,row,rows){
   const gl=this.gl;
   gl.bindFramebuffer(gl.FRAMEBUFFER,target.fb);gl.viewport(0,0,target.width,target.height);gl.enable(gl.SCISSOR_TEST);gl.scissor(0,row,target.width,rows);gl.disable(gl.BLEND);
   gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.ALWAYS);gl.depthMask(true);
   this.sceneUniforms(this.sceneProgram,target);gl.bindVertexArray(this.vao);gl.drawArrays(gl.TRIANGLES,0,3);
   if(this.model){gl.depthFunc(gl.LESS);this.sceneUniforms(this.meshProgram,target);gl.bindVertexArray(this.meshVao);gl.drawElements(gl.TRIANGLES,this.model.count,gl.UNSIGNED_SHORT,0);}
   gl.disable(gl.DEPTH_TEST);gl.disable(gl.SCISSOR_TEST);gl.bindFramebuffer(gl.FRAMEBUFFER,null);
  }
  sceneUniforms(program,target){
   const gl=this.gl,u=this.uniforms(program);gl.useProgram(program);this.setCommon(u,target.width,target.height);
   gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,this.inscriptionTexture);gl.uniform1i(u.uInscription,0);gl.uniform1f(u.uSeed,this.seed);gl.uniform1f(u.uCracks,this.cracks);gl.uniform1f(u.uHasMaps,this.maps.length===4?1:0);gl.uniform1f(u.uRock,this.rock?1:0);
   ['uAlbedo','uNormalMap','uRoughMap','uHeightMap'].forEach((name,i)=>{gl.activeTexture(gl.TEXTURE1+i);gl.bindTexture(gl.TEXTURE_2D,this.maps[i]||this.inscriptionTexture);gl.uniform1i(u[name],1+i);});
   gl.uniform1f(u.uMesh,this.model?1:0);gl.uniform1f(u.uAward,this.award?1:0);gl.uniform1i(u.uPlaneCount,this.model?.planes||0);gl.uniform4fv(u.uPlate,this.model?.plate||[0,0,1,1]);
   gl.activeTexture(gl.TEXTURE5);gl.bindTexture(gl.TEXTURE_2D,this.planeTexture||null);gl.uniform1i(u.uPlanes,5);
  }
  setCommon(u,width,height){
   const gl=this.gl;gl.uniform2f(u.uResolution,width,height);gl.uniform3fv(u.uRo,this.cam.ro);gl.uniformMatrix3fv(u.uCam,false,this.cam.matrix);gl.uniform1f(u.uTanHalf,this.cam.tanHalf);
   if(this.accentHex!==this.accent){this.accentHex=this.accent;this.accentRgb=rgb(this.accent);}gl.uniform3fv(u.uAccent,this.accentRgb);gl.uniformMatrix3fv(u.uTrophyRot,false,TROPHY_ROT);gl.uniform3fv(u.uTrophyPos,TROPHY);
   gl.uniform3fv(u.uTB,this.model?.half||[.9,1.5,.3]);gl.uniform1f(u.uTaper,this.model?0:.13);
  }
  /** Advance progressive baking; returns true when the full-resolution scene is ready. */
  bake(){
   if(!this.job)return true;
   const job=this.job,rows=Math.min(job.target.height-job.row,Math.max(1,Math.floor((this.limits.stripPixels||QUALITY[this.quality].strip)/job.target.width)));
   this.drawScene(job.target,job.row,rows);job.row+=rows;
   if(job.row>=job.target.height){this.release(this.display);this.display=job.target;this.job=null;this.release(this.preview);this.preview=null;this.onReady?.();return true;}
   return false;
  }
  finish(){while(!this.bake());}
  setAccent(hex){if(!/^#[0-9a-f]{6}$/i.test(hex))throw TypeError('Accent must be a #rrggbb color.');this.accent=hex;this.invalidate();}
  setLimits(limits){this.limits={...limits};this.sizeKey='';this.resize();}
  setQuality(name){if(!QUALITY[name])throw TypeError('Unknown quality '+name);this.quality=name;this.release(this.display);this.display=null;this.sizeKey='';this.resize();}
  /** Align the award to a screen point: {x,y} of its base and its screen height fraction; null restores the responsive camera. */
  setLayout(anchor,cubes){if(anchor&&![anchor.x,anchor.y,anchor.height].every(Number.isFinite))throw TypeError('Anchor needs numeric x, y, and height.');this.anchor=anchor;this.cubeSpec=cubes;this.sizeKey='';this.resize();}
  setAnchor(anchor){if(anchor&&![anchor.x,anchor.y,anchor.height].every(Number.isFinite))throw TypeError('Anchor needs numeric x, y, and height.');this.anchor=anchor;this.sizeKey='';this.resize();}
  setCubes(cubes){this.cubeSpec=cubes;this.sizeKey='';this.resize();}
  setInscription(text){this.inscription={...this.inscription,...text};this.uploadInscription();this.invalidate();}
  setPointer(x,y,strength,color=this.accent){Object.assign(this.pointer,{x,y,strength,color});}
  pulse(origin){this.wave={origin:origin||[TROPHY[0],TROPHY[1]-1.45,.15],radius:0,strength:1};}
  render(dt=0){
   if(this.destroyed||this.lost||this.gl.isContextLost())return false;
   if(!this.observer||this.sizeDirty){this.sizeDirty=false;this.resize();}this.bake();this.time+=dt;
   if(this.wave.strength>0){this.wave.radius+=dt*3.4;this.wave.strength=Math.max(0,this.wave.strength-dt*.5);}
   const gl=this.gl,u=this.uniforms(this.compositeProgram),source=this.display||this.preview;
   gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.viewport(0,0,this.canvas.width,this.canvas.height);gl.useProgram(this.compositeProgram);gl.bindVertexArray(this.vao);
   this.setCommon(u,this.canvas.width,this.canvas.height);
   source.textures.forEach((tex,i)=>{gl.activeTexture(gl.TEXTURE0+i);gl.bindTexture(gl.TEXTURE_2D,tex);gl.uniform1i(u[['uColor','uGeom','uFx'][i]],i);});
   gl.uniform2f(u.uSource,source.width,source.height);gl.uniform1f(u.uTime,this.time);
   const p=this.unproject(this.pointer.x,this.pointer.y,1.1);gl.uniform4f(u.uPointer,p[0],p[1],p[2],this.pointer.strength);
   if(this.pointerHex!==this.pointer.color){this.pointerHex=this.pointer.color;this.pointerRgb=rgb(this.pointer.color).map(v=>v*.7+.3);}gl.uniform3fv(u.uPointerColor,this.pointerRgb);
   const o=this.wave.origin;gl.uniform4f(u.uWave,o[0],o[1],o[2],this.wave.radius);gl.uniform1f(u.uWaveStrength,this.wave.strength);gl.uniform1f(u.uBreath,.5+.5*Math.sin(this.time*.9));
   // Cube uniform arrays are reused across frames; they are reallocated only when resize() replaces the cubes.
   const t=this.time,cubes=this.cubes;
   if(this.cubeArrays?.cubes!==cubes)this.cubeArrays={cubes,centers:new Float32Array(cubes.length*4),rots:new Float32Array(cubes.length*9),blur:new Float32Array(cubes.map(c=>c.blur))};
   const {centers,rots,blur}=this.cubeArrays;
   cubes.forEach((c,i)=>{centers[i*4]=c.center[0];centers[i*4+1]=c.center[1]+Math.sin(t*.6+i*2)*.06;centers[i*4+2]=c.center[2];centers[i*4+3]=c.size;rots.set(rotation(c.spin[0]+t*.12*(i?-1:1),c.spin[1]+Math.sin(t*.25+i)*.15,c.spin[2]+t*.05),i*9);});
   gl.uniform4fv(u['uCubes[0]'],centers);gl.uniformMatrix3fv(u['uCubeRot[0]'],false,rots);gl.uniform1fv(u['uCubeBlur[0]'],blur);
   gl.disable(gl.BLEND);gl.drawArrays(gl.TRIANGLES,0,3);return true;
  }
  isBaked(){return Boolean(this.display&&!this.job);}
  destroy(){
   if(this.destroyed)return;this.destroyed=true;this.events.abort();this.observer?.disconnect();const gl=this.gl;
   this.release(this.display);this.release(this.preview);this.release(this.job?.target);this.job=null;
   gl.deleteTexture(this.inscriptionTexture);this.maps.forEach(t=>gl.deleteTexture(t));this.mapScripts?.forEach(s=>s.remove());gl.deleteBuffer(this.buffer);gl.deleteVertexArray(this.vao);gl.deleteProgram(this.sceneProgram);gl.deleteProgram(this.compositeProgram);
   if(this.model){gl.deleteProgram(this.meshProgram);gl.deleteVertexArray(this.meshVao);this.meshBuffers.forEach(b=>gl.deleteBuffer(b));gl.deleteTexture(this.planeTexture);}
  }
 }
 EmeraldWorld.shaders={vertex,scene,composite,meshVertex,meshFragment};EmeraldWorld.drawInscription=drawInscription;EmeraldWorld.defaultInscription=defaultInscription;
 window.EmeraldWorld=EmeraldWorld;
})();
