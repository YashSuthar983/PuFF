const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const root=path.resolve(__dirname,'../emerald-demo'),html=fs.readFileSync(path.join(root,'index.html'),'utf8');
class Element{
 constructor(tag='div'){this.tagName=tag;this.events={};this.attrs={};this.dataset={};this.children=[];this._value='';this.disabled=false;this.classList={add(){},remove(){}};}
 get value(){return this._value;}set value(value){this._value=String(value);}
 append(...children){this.children.push(...children);}addEventListener(key,fn){(this.events[key]??=[]).push(fn);}fire(key,event={}){for(const fn of this.events[key]||[])fn({target:this,...event});}
 setAttribute(key,value){this.attrs[key]=String(value);}closest(){return null;}scrollIntoView(){this.scrolled=true;}
 getBoundingClientRect(){return{left:0,top:500,bottom:960,width:1600,height:460};}
 querySelectorAll(tag){return this.children.flatMap(child=>[...(child.tagName===tag?[child]:[]),...child.querySelectorAll(tag)]);}
}
(async()=>{
 const kit=await import('../src/index.js');
 for(const [name,reduced,supported]of [['desktop',false,true],['reduced motion',true,true],['native fallback',false,false]]){
  const ids=new Map();for(const match of html.matchAll(/<([a-z][a-z0-9]*)\b([^>]*\bid="([^"]+)"[^>]*)>/g)){const el=new Element(match[1]);el.id=match[3];for(const key of ['value','min','max','step']){const value=match[2].match(new RegExp('\\b'+key+'="([^"]*)"'));if(value)el[key]=value[1];}ids.set(el.id,el);}
  ids.get('quality').value='medium';ids.get('lightingMode').value='random';
  const palettes=['emerald','ice','ember'].map(name=>{const el=new Element('button');el.dataset.palette=name;el.textContent=name;return el;});
  const lookup=id=>ids.get(id)||[...ids.values()].flatMap(el=>el.querySelectorAll('input').concat(el.querySelectorAll('output'))).find(el=>el.id===id);
  const document={documentElement:{dataset:{}},getElementById:lookup,createElement:tag=>new Element(tag),querySelectorAll:()=>palettes};
  let scene,actor,rocks,observer,now=100;
  class Actor extends kit.Lightning{constructor(...args){super(...args);actor=this;this.triggers=0;const original=this.trigger;this.trigger=()=>{if(this.getState().settings.mode==='off')return false;this.triggers++;return original();};}}
  class Scene{constructor(canvas,options){if(!supported)throw Error('No WebGL');scene=this;this.options={...options};this.starts=0;this.stops=0;}setOptions(patch){Object.assign(this.options,patch);}setSources(lights,segments){this.lights=lights;this.segments=segments;}render(){this.options.onFrame?.();}start(){this.starts++;}stop(){this.stops++;}setPaused(value){this.paused=value;this.render();}destroy(){this.destroyed=true;}}
  class Rocks{constructor(canvas,options){rocks=this;options.onReady();}setLighting(lights,rect,options){this.lights=lights;this.options=options;}destroy(){this.destroyed=true;}}
  class Observer{constructor(fn){this.fn=fn;observer=this;}observe(){}disconnect(){this.disconnected=true;}}
  const window=new Element('window');window.IntersectionObserver=Observer;window.NativeRockScene=Rocks;window.location={search:'?render=balanced',href:'http://localhost/?render=balanced'};ids.get('mist').getContext=()=>supported?{getExtension:()=>null}:null;const media=new Element();media.matches=reduced;
  const sandbox={window,document,CloudKit:{...kit,CloudScene:Scene,Lightning:Actor},NativeRockScene:Rocks,matchMedia:()=>media,IntersectionObserver:Observer,AbortController,performance:{now:()=>now},URLSearchParams,URL,console:{warn(){}}};vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(root,'../demo-performance.js'),'utf8'),sandbox);
  vm.runInContext(fs.readFileSync(path.join(root,'lighting-controls.js'),'utf8'),sandbox);sandbox.EmeraldControls=window.EmeraldControls;
  vm.runInContext(fs.readFileSync(path.join(root,'demo.js'),'utf8'),sandbox);
  const fire=(id,key,event={})=>lookup(id).fire(key,event),pump=frames=>{for(let i=0;i<frames;i++){now+=50;scene.render();}};
  const schema=window.EmeraldControls.schema;for(const key of Object.keys(kit.CloudControls.lightning))assert(schema['pulse_'+key],'Missing pulse option '+key);
  assert(Object.keys(schema).length>=40);assert.equal(ids.get('lightingControls').querySelectorAll('input').length,Object.keys(schema).length);
  if(!supported){assert(ids.get('mist').hidden);assert(ids.get('pulse').disabled);assert(ids.get('lightingControls').querySelectorAll('input').every(el=>el.disabled));console.log('PASS Emerald: native fallback retains artwork and disables unavailable lighting.');continue;}
  assert.equal(scene.options.transparent,true);assert.equal(scene.options.lightning,false);assert.equal(actor.getState().settings.mode,'random');assert.equal(scene.paused,reduced);assert.equal(actor.getState().settings.seed,74931);
  if(reduced)fire('pause','click');pump(2);assert.equal(rocks.lights,scene.lights);assert.equal(scene.segments.length,0);
  lookup('fx-pulse_interval').value=700;fire('fx-pulse_interval','input');assert.equal(actor.getState().settings.interval,700);
  lookup('fx-scene_extinction').value=4;fire('fx-scene_extinction','input');assert.equal(scene.options.extinction,4);
  lookup('fx-rimX').value=.8;fire('fx-rimX','input');assert.equal(scene.lights[0].x,1600*.8);
  lookup('fx-cliffTurn').value=20;fire('fx-cliffTurn','input');assert.equal(rocks.options.cliffTurn,20);
  lookup('fx-rockNormal').value=1.5;fire('fx-rockNormal','input');assert.equal(rocks.options.normalStrength,1.5);
  fire('export','click');const config=JSON.parse(ids.get('configuration').value);config.mode='manual';config.seed=123;config.lighting.pulse_power=.4;ids.get('configuration').value=JSON.stringify(config);fire('apply','click');assert.equal(actor.getState().settings.mode,'manual');assert.equal(actor.getState().settings.seed,123);assert.equal(actor.getState().settings.power,.4);
  const before=scene.options.extinction;config.lighting.scene_extinction=999;ids.get('configuration').value=JSON.stringify(config);fire('apply','click');assert.equal(scene.options.extinction,before,'Invalid JSON must not partially change the scene');assert(/Invalid/.test(ids.get('status').textContent));
  fire('pulse','click');assert.equal(actor.triggers,1);pump(10);assert(actor.getLights().length>0);assert(scene.lights[2].strength>0);
  ids.get('lightingMode').value='off';fire('lightingMode','change');assert(ids.get('pulse').disabled);assert.equal(actor.getState().strikeCount,0);fire('pulse','click');assert.equal(actor.triggers,1);
  ids.get('lightingMode').value='manual';fire('lightingMode','change');const origin=actor.triggers;fire('scene','pointerdown',{pointerType:'touch',pointerId:1,clientX:100,clientY:700});fire('scene','pointerup',{pointerType:'touch',pointerId:1,clientX:101,clientY:701});assert.equal(actor.triggers,origin+1);fire('scene','pointerdown',{pointerType:'touch',pointerId:2,clientX:100,clientY:700});fire('scene','pointerup',{pointerType:'touch',pointerId:2,clientX:100,clientY:850});assert.equal(actor.triggers,origin+1);
  fire('randomize','click');assert.equal(actor.getState().settings.mode,'random');pump(400);assert(actor.getState().strikeCount<=2);assert(scene.lights.length<=3);
  observer.fn([{isIntersecting:false}]);assert(scene.stops>0);fire('pulseAgain','click');assert(ids.get('scene').scrolled);observer.fn([{isIntersecting:true}]);assert(scene.starts>1);
  fire('pause','click');assert(scene.paused);assert.equal(actor.getState().strikeCount,0);assert(ids.get('pulse').disabled);window.fire('pagehide',{persisted:false});assert(scene.destroyed&&rocks.destroyed&&observer.disconnected);
  console.log('PASS Emerald '+name+': all lighting options, seeded modes, bounded pulses, rock light routing, atomic settings, touch, pause, and cleanup.');
 }
 const window={};vm.runInNewContext(fs.readFileSync(path.join(root,'native-rocks.js'),'utf8'),{window});const mesh=window.NativeRockScene.buildGeometry({width:8,height:8,data:new Uint8Array(256).fill(128)});assert(mesh.vertices.every(Number.isFinite));const points=Array.from({length:mesh.vertices.length/8},(_,i)=>Array.from(mesh.vertices.slice(i*8,i*8+3)));assert(Math.min(...points.map(p=>p[1]))<-6,'Cliff must have a substantial front drop');assert(Math.max(...points.map(p=>p[2]))-Math.min(...points.map(p=>p[2]))>3,'Cliff must include a deep ledge');assert(mesh.indices.length/3<15000,'Keep the cliff mesh bounded');assert(Math.max(...mesh.indices)<mesh.vertices.length/8);
 for(const match of html.matchAll(/(?:src|href)="([^"]+)"/g)){const ref=match[1].split('?')[0];if(ref.startsWith('#')||/^[a-z]+:/.test(ref))continue;assert(fs.existsSync(path.resolve(root,ref)),'Missing '+ref);}
 for(const name of ['albedo.webp','normal.png','roughness.png','height.png'])assert(fs.existsSync(path.join(root,'assets/rocks',name)));
 const embeddedWindow={};vm.runInNewContext(fs.readFileSync(path.join(root,'assets/rocks/embedded-maps.js'),'utf8'),{window:embeddedWindow});
 for(const [name,uri]of Object.entries(embeddedWindow.EmeraldRockMaps))assert(Buffer.from(uri.split(',')[1],'base64').equals(fs.readFileSync(path.join(root,'assets/rocks',name))),'Embedded map differs: '+name);
 let nativeReady=false,nativeError,draws=0;const imageSources=[];
 const gl=new Proxy({COMPILE_STATUS:1,LINK_STATUS:2,getShaderParameter:()=>true,getProgramParameter:()=>true,getAttribLocation:(p,name)=>({aPosition:0,aNormal:1,aUv:2})[name],drawElements(){draws++;}}, {get:(o,key)=>key in o?o[key]:key.startsWith('create')?()=>({}):key.toUpperCase()===key?1:()=>{}});
 const nativeWindow={location:{protocol:'file:'}};let context;
 const document={head:{append(script){vm.runInContext(fs.readFileSync(path.join(root,script.src),'utf8'),context);queueMicrotask(()=>script.onload());}},createElement(tag){const el=new Element(tag);el.remove=()=>{};if(tag==='canvas'){el.getContext=()=>({drawImage(){},getImageData:()=>({width:8,height:8,data:new Uint8Array(256).fill(128)})});}return el;}};
 class Image{constructor(){this.width=this.height=512;}set src(value){imageSources.push(value);queueMicrotask(()=>this.onload());}}
 context=vm.createContext({window:nativeWindow,document,Image,AbortController});vm.runInContext(fs.readFileSync(path.join(root,'native-rocks.js'),'utf8'),context);
 const canvas=new Element('canvas');canvas.getContext=()=>gl;
 const renderer=new nativeWindow.NativeRockScene(canvas,{onReady:()=>{nativeReady=true;},onError:error=>{nativeError=error;}});
 await new Promise(resolve=>setTimeout(resolve,0));assert(!nativeError,nativeError?.message);assert(nativeReady);assert.equal(imageSources.length,4);assert(imageSources.every(src=>src.startsWith('data:image/')),'File previews must use origin-clean embedded maps');
 renderer.setLighting([],canvas.getBoundingClientRect(),{cliffHeight:1,cliffDepth:1,cliffTurn:20});assert.equal(draws,1);renderer.destroy();assert(renderer.destroyed);
 console.log('PASS embedded-map integrity, origin-clean local-file loading, native cliff lifecycle, and draw submission.');
 console.log('PASS scanned rock geometry, packaged PBR maps, and local asset references.');
})().catch(error=>{console.error(error);process.exit(1);});
