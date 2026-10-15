const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const root=path.resolve(__dirname,'..'),policySource=fs.readFileSync(path.join(root,'demo-performance.js'),'utf8');
function loadPolicy(){const window={};vm.runInNewContext(policySource,{window});return window.CloudPerformance;}
const P=loadPolicy();let probed=0,lost=0,attributes;
const hardware={getExtension:()=>null},canvas={getContext(type,attrs){probed++;attributes=attrs;return hardware;}};
assert.equal(P.choose(canvas,{navigator:{hardwareConcurrency:2,deviceMemory:2}}).profile.mode,'low');assert(attributes.failIfMajorPerformanceCaveat);assert.equal(attributes.antialias,false);
assert.equal(P.choose(canvas,{navigator:{hardwareConcurrency:8,deviceMemory:8}}).profile.mode,'balanced');
assert.equal(P.choose(canvas,{navigator:{},requested:'high'}).profile.mode,'high');
const before=probed;assert.equal(P.choose(canvas,{requested:'static'}).profile.mode,'static');assert.equal(P.choose(canvas,{navigator:{connection:{saveData:true}}}).profile.mode,'static');assert.equal(P.choose(canvas,{reducedMotion:true}).profile.mode,'static');assert.equal(probed,before,'Static preferences must skip GL entirely');
assert.equal(P.choose({getContext:()=>null}).profile.mode,'static');
const software={getExtension:name=>name==='WEBGL_debug_renderer_info'?{UNMASKED_RENDERER_WEBGL:1}:name==='WEBGL_lose_context'?{loseContext(){lost++;}}:null,getParameter:()=> 'ANGLE SwiftShader software device'};
assert.equal(P.choose({getContext:()=>software}).profile.mode,'static');assert.equal(lost,1,'Discard a software context instead of running the scene on CPU');
let low=0,staticCount=0,t=1;const watchdog=new P.Watchdog({warmup:0,windowSize:5,onLow:()=>low++,onStatic:()=>staticCount++});for(let i=0;i<14;i++)watchdog.sample(t+=150,1000/30);assert.equal(low,1);assert.equal(staticCount,1);
const healthy=new P.Watchdog({warmup:0,windowSize:5,onLow:()=>assert.fail('Healthy cadence must retain detail')});for(let i=0;i<100;i++)healthy.sample(i*34+1,1000/30);healthy.reset();healthy.sample(99999,1000/30);assert.equal(healthy.count,0,'Resuming is not a slow-frame sample');
let rapid=0;const severe=new P.Watchdog({onLow:()=>rapid++});for(let i=0;i<5;i++)severe.sample(1+i*500,1000/30);assert.equal(rapid,1,'Severe stalls downgrade without waiting for a long sample window');
assert.equal(P.mistOptions(P.profiles.balanced,'low').raySteps,12);assert.equal(P.mistOptions(P.profiles.low,'high').raySteps,12);
console.log('PASS device policy: static/no-GPU/software/reduced-data paths, low-spec hints, conservative probing, and sustained-frame downgrade.');

class Element{
 constructor(id){this.id=id;this.events={};this.style={};this.dataset={};this.disabled=false;this.classList={toggle(){return true;}};this.width=0;this.height=0;this.rect={left:0,top:0,width:1600,height:900};}
 addEventListener(name,fn){(this.events[name]??=[]).push(fn);}fire(name,event={}){for(const fn of this.events[name]||[])fn({target:this,...event});}setAttribute(){}getBoundingClientRect(){return this.rect;}
}
for(const scenario of ['no-webgl','software','save-data','reduced','low','balanced','preview-static','preview-low','preview-balanced','preview-high','preview-blocked']){
 const html=fs.readFileSync(path.join(root,'emerald-3d/index.html'),'utf8'),ids=new Map([...html.matchAll(/\bid="([^"]+)"/g)].map(m=>[m[1],new Element(m[1])])),queue=new Map();let serial=0,now=0,observer,world,worlds=0,gpuProbes=0;
 const layers=[];const ctx=new Proxy({},{get:(o,k)=>()=>{}});
 for(const el of ids.values())el.getContext=kind=>{if(kind==='2d')return ctx;gpuProbes++;return ['no-webgl','preview-blocked'].includes(scenario)?null:scenario==='software'?software:hardware;};
 const preview=scenario.startsWith('preview-')?(scenario==='preview-blocked'?'high':scenario.slice(8)):'auto';
 const expected=['no-webgl','software','save-data','reduced','preview-static','preview-blocked'].includes(scenario)?'static':preview!=='auto'?preview:scenario;
 const query=new URLSearchParams('cliff=3d&award=3d&maps=scan');if(preview!=='auto')query.set('render',preview);
 const window=new Element('window');let destination;window.location={href:'http://localhost/?'+query+'#main',search:'?'+query,assign(url){destination=new URL(url);}};
 window.IntersectionObserver=class{constructor(fn){this.fn=fn;observer=this;}observe(){}disconnect(){this.disconnected=true;}};
 const document=new Element('document');document.getElementById=id=>ids.get(id);document.documentElement={dataset:{},style:{setProperty(){}}};document.querySelectorAll=()=>['quality','mistDensity','pulse','pause','renderMode'].map(id=>ids.get(id));document.hidden=false;
 class World{constructor(c,opts){world=this;worlds++;this.options=opts;this.wave={strength:0,radius:0};this.time=0;this.draws=0;this.gl=hardware;}render(dt){this.draws++;this.time+=dt;}setLayout(){}setLimits(limits){this.options.limits=limits;}setAnchor(){}setCubes(){}anchors(){return{base:{x:.27,y:.7}};}isBaked(){return true;}setPointer(){}setQuality(v){this.quality=v;}setInscription(){}setAccent(){}pulse(){this.wave.strength=1;}destroy(){this.destroyed=true;}}
 class Scene{constructor(c,opts){layers.push(this);this.options={drift:1,...opts};this.time=0;this.starts=0;this.draws=0;this.gl=hardware;}start(){this.starts++;}setSources(){}setPaused(v){this.paused=v;}render(){this.draws++;}setOptions(opts){Object.assign(this.options,opts);}strike(){}destroy(){this.destroyed=true;}}
 const navigator=scenario==='save-data'?{connection:{saveData:true}}:['low','preview-balanced','preview-high'].includes(scenario)?{hardwareConcurrency:2,deviceMemory:2}:{hardwareConcurrency:8,deviceMemory:8};
 const media=new Element('media');media.matches=scenario==='reduced';
 class Image{constructor(){this.naturalWidth=0;}}
 const sandbox={window,document,location:window.location,navigator,matchMedia:()=>media,URL,URLSearchParams,AbortController,Image,EmeraldWorld:World,CloudKit:{CloudScene:Scene},IntersectionObserver:window.IntersectionObserver,performance:{now:()=>now},console:{warn(){}},setTimeout(){return 1;},requestAnimationFrame:fn=>{queue.set(++serial,fn);return serial;},cancelAnimationFrame:id=>queue.delete(id)};
 vm.createContext(sandbox);vm.runInContext(policySource,sandbox);vm.runInContext(fs.readFileSync(path.join(root,'emerald-3d/mist.js'),'utf8'),sandbox);vm.runInContext(fs.readFileSync(path.join(root,'emerald-3d/demo.js'),'utf8'),sandbox);
 const pump=frames=>{for(let i=0;i<frames;i++){now+=1000/60;const pending=[...queue.values()];queue.clear();pending.forEach(fn=>fn(now));}};
 assert.equal(ids.get('renderMode').value,preview);assert.equal(document.documentElement.dataset.renderTier,expected);
 assert(ids.get('deviceDescription').textContent.length>20,'Device preview explains the active appearance');
 if(preview!=='auto')assert(ids.get('scenePanel').open,'An explicit device preset opens its controls');
 if(scenario==='preview-blocked'){assert.equal(ids.get('deviceBadge').textContent,'Static fallback');assert(ids.get('deviceDescription').textContent.includes('Hardware acceleration unavailable'));}
 // The selector works even on the static fallback and preserves the 3D cliff / award / maps / fragment.
 const original=new URL(window.location.href);original.searchParams.set('quality','high');window.location.href=original.href;
 ids.get('renderMode').value='low';ids.get('renderMode').fire('change');
 assert.equal(destination.searchParams.get('render'),'low');assert.equal(destination.searchParams.get('cliff'),'3d');assert.equal(destination.searchParams.get('award'),'3d');assert.equal(destination.searchParams.get('maps'),'scan');assert(!destination.searchParams.has('quality'));assert.equal(destination.hash,original.hash);
 ids.get('renderMode').value='auto';ids.get('renderMode').fire('change');assert(!destination.searchParams.has('render'),'Auto restores hardware detection');
 if(expected==='static'){
  assert.equal(worlds,0);assert.equal(layers.length,0);assert.equal(queue.size,0,'Static has no animation loop');assert.equal(ids.get('stage').dataset.cliff,'plate');assert.equal(ids.get('stage').dataset.award,'image');assert(!ids.get('renderMode').disabled);if(['save-data','reduced','preview-static'].includes(scenario))assert.equal(gpuProbes,0);
 }else{
  const budget=P.profiles[expected];assert.equal(worlds,1);assert.equal(layers.length,budget.mistLayers);assert.equal(world.options.quality,budget.quality);assert(layers.every(l=>l.starts===0),'Mist uses the host clock, not independent RAF loops');assert.equal(queue.size,1);pump(60);assert(world.draws<=budget.fps+1);assert.equal(world.options.limits.maxPixels,budget.world.maxPixels);
  const count=world.draws;observer.fn([{isIntersecting:false}]);pump(30);assert.equal(world.draws,count);assert.equal(queue.size,0);observer.fn([{isIntersecting:true}]);pump(3);assert(world.draws>count);document.hidden=true;document.fire('visibilitychange');assert.equal(queue.size,0);
  window.fire('pagehide',{persisted:false});assert(world.destroyed);assert(layers.every(l=>l.destroyed));
 }
 console.log('PASS Emerald 3D '+scenario+': startup budget, fallback plate, one capped clock, offscreen/hidden stop, and release.');
}
