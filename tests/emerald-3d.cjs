(async()=>{
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const root=path.resolve(__dirname,'../emerald-3d'),html=fs.readFileSync(path.join(root,'index.html'),'utf8');

// Every local reference resolves, and every element the controller looks up exists.
for(const match of html.matchAll(/(?:src|href)="([^"]+)"/g)){const ref=match[1].split('?')[0];if(ref.startsWith('#')||/^[a-z]+:/.test(ref))continue;assert(fs.existsSync(path.resolve(root,ref)),'Missing '+ref);}
const ids=new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]));
for(const match of fs.readFileSync(path.join(root,'demo.js'),'utf8').matchAll(/\$\('([^']+)'\)/g))assert(ids.has(match[1]),'demo.js needs #'+match[1]);

// Renderer lifecycle against a recording WebGL2 stub.
const calls={draw:0,scissor:[],deleted:0,textures:0};
const gl=new Proxy({
 COMPILE_STATUS:1,LINK_STATUS:2,FRAMEBUFFER_COMPLETE:3,
 getShaderParameter:()=>true,getProgramParameter:()=>true,checkFramebufferStatus:()=>3,isContextLost:()=>false,
 drawArrays(){calls.draw++;},scissor(x,y,w,h){calls.scissor.push([y,h]);},createTexture(){calls.textures++;return{};},
 deleteTexture(){calls.deleted++;},getUniformLocation:(p,name)=>({name})
},{get:(o,key)=>key in o?o[key]:key.startsWith('create')?()=>({}):key.toUpperCase()===key?1:()=>{}});
class Canvas{constructor(w=1600,h=900){this.width=0;this.height=0;this.rect={width:w,height:h};}getBoundingClientRect(){return this.rect;}getContext(type){return type==='webgl2'?gl:type==='2d'?ctx:null;}addEventListener(){}}
const ctx=new Proxy({},{get:(o,key)=>key in o?o[key]:()=>{},set:(o,key,value)=>{o[key]=value;return true;}});
const window={devicePixelRatio:1},document={createElement:()=>new Canvas()};
vm.runInNewContext(fs.readFileSync(path.join(root,'world.js'),'utf8'),{window,document,AbortController,globalThis:window});
vm.runInNewContext(fs.readFileSync(path.join(root,'mist.js'),'utf8'),{window});
const {EmeraldWorld}=window;
assert(EmeraldWorld&&window.EmeraldMist.back.includes('cloudBase(p)')&&window.EmeraldMist.front.includes('cloudBase(p)'));

let ready=0;const canvas=new Canvas();
const world=new EmeraldWorld(canvas,{quality:'medium',onReady:()=>ready++});
assert.equal(canvas.width,1600);assert.equal(canvas.height,900,'Medium quality renders at native resolution');
assert(world.preview&&!world.display&&!world.isBaked(),'A low-resolution preview shows while the full scene bakes');
let steps=0;while(!world.bake())steps++;
assert(steps>1&&steps<40,'Baking is split into bounded strips: '+steps);assert(world.isBaked());assert.equal(ready,1);
const strips=calls.scissor.slice(1);for(let i=1;i<strips.length;i++)assert.equal(strips[i][0],strips[i-1][0]+strips[i-1][1],'Strips are contiguous');
assert(strips.at(-1)[0]+strips.at(-1)[1]>=900);
assert.equal(world.render(1/60),true);
const anchors=world.anchors();assert(anchors.center.x>.2&&anchors.center.x<.36,'Award stays in the left third on wide screens');assert(anchors.base.y>anchors.top.y);

// Relighting keeps the current image until the new bake is complete.
const shown=world.display;world.setAccent('#4fc8ff');assert.equal(world.display,shown);world.finish();assert.notEqual(world.display,shown);assert.equal(ready,2);
assert.throws(()=>world.setAccent('green'),{name:'TypeError'});assert.throws(()=>world.setQuality('ultra'),{name:'TypeError'});

// Pulses expand and fade; the frame loop does not leak them.
world.pulse();for(let i=0;i<200;i++)world.render(1/30);assert.equal(world.wave.strength,0);

// Resizing re-bakes once, not every frame.
canvas.rect={width:600,height:900};world.render(0);const job=world.job,target=job.target;world.render(0);assert(world.job===job||world.display===target,'A pending bake is continued, not restarted, by later frames');
world.finish();const portrait=world.anchors();assert(Math.abs(portrait.center.x-.5)<.02,'Award is centred on portrait screens');

// 2.5D mode: no traced rock, and the award lands on the artwork plate's anchor point.
const layered=new EmeraldWorld(new Canvas(),{rock:false,anchor:{x:.27,y:.7,height:.5},cubes:[{at:[.07,.3],depth:2.4,size:.05,blur:.1,spin:[0,0,0]}]});
const fitBase=layered.anchors().base;assert(Math.abs(fitBase.x-.27)<.01&&Math.abs(fitBase.y-.7)<.01,'Anchored award base lands on the plate: '+JSON.stringify(fitBase));
assert(Math.abs(layered.anchors().base.y-layered.anchors().top.y-.5)<.06,'Anchored award spans the requested height');assert.equal(layered.cubes.length,1);
layered.setAnchor({x:.5,y:.6,height:.4});assert(Math.abs(layered.anchors().base.x-.5)<.01);assert.throws(()=>layered.setAnchor({x:'a'}),{name:'TypeError'});
const awardOff=new EmeraldWorld(new Canvas(),{rock:false,award:false,model:{positions:[],normals:[],indices:[],planes:[],half:[1,1,1]}});assert(!awardOff.model&&!awardOff.award,'award:false skips the 3D award');awardOff.destroy();
for(const f of ['plate.webp','back-1.webp','back-2.webp','award.webp','cliff.webp','layers.json'])assert(fs.existsSync(path.join(root,'assets/plate',f)),'Missing plate/'+f);
const plateJs=JSON.parse(fs.readFileSync(path.join(root,'assets/plate/layers.json'),'utf8')),demoSrc=fs.readFileSync(path.join(root,'demo.js'),'utf8');
assert(demoSrc.includes('base:['+plateJs.base.map(v=>v.toFixed(4).replace(/^0/,'')).join(',')+']'),'demo.js PLATE anchors match layers.json');
layered.destroy();

// The converted FBX award: rasterized after the traced pass, depth-tested, with plane-based refraction.
const modelWindow={devicePixelRatio:1};vm.runInNewContext(fs.readFileSync(path.join(root,'assets/trophy/trophy.js'),'utf8'),{window:modelWindow});
const model=modelWindow.EmeraldTrophyModel;assert(model&&model.indices.length%3===0&&model.positions.length===model.normals.length&&model.planes.length>5,'Converted trophy model is complete');
assert(Math.abs(model.half[1]-1.5)<1e-3&&model.plate?.src?.startsWith('data:image/webp;base64,'),'Model is 3 units tall and embeds its faceplate');
assert(Math.max(...model.indices)<model.positions.length/3&&model.positions.length/3<65536,'Indices fit the vertex buffer (Uint16)');
const drawn=[];gl.drawElements=(mode,count)=>drawn.push(count);
const meshWorld=new EmeraldWorld(new Canvas(),{rock:false,model});meshWorld.finish();
assert(meshWorld.model&&drawn.length>0&&drawn.every(c=>c===model.indices.length),'The model is drawn in every bake strip');
meshWorld.destroy();delete gl.drawElements;
const html2=fs.readFileSync(path.join(root,'index.html'),'utf8');assert(html2.indexOf('assets/trophy/trophy.js')<html2.indexOf('world.js'),'Model script loads before world.js');
assert(fs.existsSync(path.join(root,'assets/plate/cracks.webp')),'Crack mask for pulses on the artwork cliff');

// Map fallback: the scan fails, our generated set loads, and the bake restarts with it.
await (async()=>{
 const loaded=[],head={append(){}};
 class Img{set src(v){loaded.push(v);queueMicrotask(()=>v.includes('assets/rock/')?this.onerror():this.onload());}}
 const sandbox={window:{devicePixelRatio:1},document:{createElement:()=>new Canvas(),head},AbortController,Image:Img,location:{protocol:'http:'},console:{warn(){}}};sandbox.globalThis=sandbox;
 vm.runInNewContext(fs.readFileSync(path.join(root,'world.js'),'utf8'),sandbox);
 let source;const mapped=new sandbox.window.EmeraldWorld(new Canvas(),{onMaps:key=>source=key});
 for(let i=0;i<20&&!source;i++)await new Promise(r=>setTimeout(r,1));
 assert.equal(source,'rock-generated');assert.equal(mapped.maps.length,4);assert(loaded.some(v=>v.includes('rock-generated/height.webp')));assert(mapped.job,'New maps trigger a re-bake');
 for(const dir of ['rock','rock-generated'])for(const name of ['albedo.webp','normal.webp','roughness.webp','height.webp','embedded-maps.js'])assert(fs.existsSync(path.join(root,'assets',dir,name)),'Missing '+dir+'/'+name);
 mapped.destroy();
})();
// A tall high-DPI viewport obeys both total-pixel and long-edge limits; strip work is bounded.
const budgetCanvas=new Canvas(2000,4000),budget=new EmeraldWorld(budgetCanvas,{quality:'high',rock:false,limits:{maxDimension:800,maxPixels:360000,maxDpr:1,stripPixels:18000}});
assert(budgetCanvas.width*budgetCanvas.height<=360000&&Math.max(budgetCanvas.width,budgetCanvas.height)<=800);
assert(budget.preview.width*budget.preview.height<=18000,'Startup preview fits the strip budget');
const size=budget.job.target;budget.bake();assert(calls.scissor.at(-1)[1]*size.width<=18000,'A bake strip fits the pixel budget');budget.finish();assert.equal(budget.preview,null,'Completed bake frees the startup preview');budget.destroy();
const before=calls.deleted;world.destroy();assert(calls.deleted>before);world.destroy();assert.equal(world.render(0),false);
console.log('PASS Emerald 3D: references, FBX model pass, 2.5D plate anchoring, scan→generated map fallback, progressive strip bake, relight without flashing, pulses, responsive camera, and cleanup.');
})();
