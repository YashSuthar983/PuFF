const fs=require('fs'),vm=require('vm'),assert=require('assert/strict'),path=require('path');
const ids=new Map(),frames=new Map(),uniforms={};let next=0,time=0,contexts=0;
const gl=new Proxy({}, {get(_,key){if(key==='getShaderParameter'||key==='getProgramParameter')return()=>true;if(key==='isContextLost')return()=>false;if(key==='getParameter')return name=>name==='MAX_3D_TEXTURE_SIZE'?256:8192;if(key==='getUniformLocation')return(_,name)=>name;if(key.startsWith('uniform'))return(name,...args)=>uniforms[name]=args;if(key.toUpperCase()===key)return key;return()=>({});}});
const ctx={beginPath(){},arc(){},fill(){},fillRect(){},fillText(){},clearRect(){},drawImage(){},getImageData(x,y,w,h){const data=new Uint8Array(w*h*4);for(let y=Math.floor(h*.4);y<h*.6;y++)for(let x=Math.floor(w*.25);x<w*.75;x++)data[(y*w+x)*4+3]=255;return{data};}};
class Node{
 constructor(tag='div'){this.tag=tag;this.children=[];this.attrs={};this.dataset={};this.listeners={};this.value='';this.width=300;this.height=150;this.classes=new Set();this.classList={add:c=>this.classes.add(c),remove:c=>this.classes.delete(c)};}
 setAttribute(key,value){this.attrs[key]=String(value);if(key==='id'){this.id=String(value);ids.set(this.id,this);}if(key==='value')this.value=String(value);if(key.startsWith('data-'))this.dataset[key.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]=String(value);}
 addEventListener(key,fn){(this.listeners[key]??=[]).push(fn);}fire(key,event={}){for(const fn of this.listeners[key]||[])fn({target:this,...event});}
 append(node){this.children.push(node);node.parentElement=this;}
 getBoundingClientRect(){return{left:0,top:0,width:400,height:250,right:400,bottom:250};}
 getContext(type){if(type==='webgl2'){contexts++;return gl;}return ctx;}
 set innerHTML(html){this.children=[];const stack=[this];for(const match of html.matchAll(/<\/?[^>]+>|[^<]+/g)){const token=match[0];if(token.startsWith('</')){if(stack.length>1)stack.pop();}else if(token.startsWith('<')){const tag=token.match(/^<([\w-]+)/)?.[1];if(!tag)continue;const node=new Node(tag);for(const attr of token.matchAll(/([\w-]+)="([^"]*)"/g))node.setAttribute(attr[1],attr[2]);stack.at(-1).append(node);if(!['input','br'].includes(tag))stack.push(node);}else stack.at(-1).textContent=(stack.at(-1).textContent||'')+token;}}
 querySelectorAll(selector){const matches=node=>{if(selector.startsWith('[')){const m=selector.match(/^\[([^=\]]+)(?:="([^"]+)")?\]$/);return m&&m[1] in node.attrs&&(m[2]===undefined||node.attrs[m[1]]===m[2]);}if(selector.startsWith('.'))return (node.attrs.class||'').split(' ').includes(selector.slice(1));return node.tag===selector;};const result=[];const visit=node=>{for(const c of node.children){if(matches(c))result.push(c);visit(c);}};visit(this);return result;}
 querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
}
for(const id of ['gallery','status','inspector','selectedTitle','selectedDescription','snippet','quality','lightningMode','cloudColor','skyColor','lightColor','timeOfDay','transparent','controls','pauseAll','export','configuration','apply','configStatus']){const node=new Node();node.setAttribute('id',id);}
ids.get('lightColor').value='#8edaff';const document={getElementById:id=>ids.get(id),createElement:tag=>new Node(tag),hidden:false,listeners:{},addEventListener(key,fn){this.listeners[key]=fn;}};
const window={devicePixelRatio:1.5,listeners:{},addEventListener(key,fn){this.listeners[key]=fn;}},sandbox={window,document,console,AbortController,Math,Number,JSON,Map,Set,Float32Array,Uint8Array,performance:{now:()=>time},matchMedia:()=>({matches:false,addEventListener(){}}),requestAnimationFrame:fn=>{frames.set(++next,fn);return next;},cancelAnimationFrame:id=>frames.delete(id)};
vm.createContext(sandbox);const root=path.join(__dirname,'..');vm.runInContext(fs.readFileSync(path.join(root,'dist/cloud-kit.js'),'utf8'),sandbox);vm.runInContext(fs.readFileSync(path.join(root,'showcase/gallery.js'),'utf8'),sandbox);
const pump=t=>{time=t;const callbacks=[...frames.values()];frames.clear();callbacks.forEach(fn=>fn(t));};for(let i=0;i<18;i++)pump(50+i*50);
assert.equal(ids.get('gallery').children.length,14);assert.equal(contexts,2,'All frames share one scene renderer and one mask renderer');assert.equal(frames.size,0,'Static gallery is quiet');
const card=id=>ids.get('gallery').children.find(node=>node.id==='frame-'+id);card('shader').querySelector('[data-action="settings"]').fire('click');pump(1000);assert.equal(uniforms.uCustom[0],1);
card('overlay').querySelector('[data-action="settings"]').fire('click');pump(1010);assert.equal(uniforms.uBackgroundOpacity[0],0,'Overlay frame has real transparent output');
ids.get('transparent').checked=false;ids.get('transparent').fire('change');pump(1020);assert.equal(uniforms.uBackgroundOpacity[0],1);
card('time').querySelector('[data-action="settings"]').fire('click');pump(1030);ids.get('timeOfDay').value='night';ids.get('timeOfDay').fire('change');pump(1040);assert.equal(uniforms.uAmbient[0],window.CloudKit.CloudTimes.night.ambient);
card('shader').querySelector('[data-action="settings"]').fire('click');pump(1045);
const frequency=ids.get('control-uniform-uFrequency');frequency.value=11;frequency.fire('input');pump(1050);assert.equal(uniforms.uFrequency[0],11);assert.equal(uniforms.uCustom[0],1,'Live settings preserve the custom density hook');
ids.get('quality').value='high';ids.get('quality').fire('change');pump(1100);assert.equal(uniforms.uSteps[0],64);
ids.get('export').fire('click');assert.equal(JSON.parse(ids.get('configuration').value).feature,'shader');ids.get('configuration').value='bad JSON';ids.get('apply').fire('click');assert(ids.get('configStatus').textContent);
card('storm').querySelector('[data-action="flash"]').fire('click');pump(1150);pump(1200);assert(uniforms['uLights[0]'][0][3]>0,'Manual lightning illuminates a frame');
card('text').querySelector('input').value='Vapor';card('text').querySelector('input').fire('input');pump(1250);card('weather').querySelector('[data-action="puff"]').fire('click');pump(1300);pump(1350);
ids.get('pauseAll').fire('click');pump(1400);assert.equal(frames.size,0);window.listeners.pagehide({persisted:true});window.listeners.pageshow();card('soft').querySelector('[data-action="play"]').fire('click');pump(1450);pump(1500);assert(uniforms.uTime[0]>=0,'Cached navigation retains usable renderers');window.listeners.pagehide();assert.equal(frames.size,0);
console.log('PASS fourteen feature frames, shared renderers, quiet previews, custom uniform controls, quality, configuration, lightning, lettering/weather, and cleanup.');

// Build the portfolio editor against real markup and the shared control schema.
const portfolio=new Node('body');portfolio.innerHTML=fs.readFileSync(path.join(root,'../port_v2/index.html'),'utf8');
document.querySelectorAll=selector=>portfolio.querySelectorAll(selector);
vm.runInContext(fs.readFileSync(path.join(root,'../port_v2/cloud-lab.js'),'utf8'),sandbox);
const kit=window.CloudKit,state={...Object.fromEntries(Object.entries(kit.CloudControls.scene).map(([k,v])=>[k,v.default])),preset:'storm',shape:'layer',quality:'medium',available:true,enabled:true,cloudColor:'#5275bb',background:'#02040b',offset:[0,0,0],scale:[1,1,1],windDirection:[.025,-.012,.008],lightDirection:[-.35,.45,.3]},lightning={mode:'random',...Object.fromEntries(Object.entries(kit.CloudControls.lightning).map(([k,v])=>[k,v.default]))},physics={};
const sky={textOnly:true,getTextOptions:()=>({quality:"medium",timeOfDay:"day"}),setTextOptions(){},getCloudState:()=>state,getLightningState:()=>lightning,getTextPhysics:()=>physics,setCloudOptions:p=>Object.assign(state,p),setLightning:(k,v)=>lightning[k]=v,setTextPhysics:p=>Object.assign(physics,p),refresh(){},getConfiguration:()=>({scene:state}),applyConfiguration:p=>Object.assign(state,p.scene)};
new window.CloudLab(sky);
assert.equal(document.querySelectorAll('[data-cloud-option]').length,0,'Text-only portfolio has no scene controls');
assert.equal(document.querySelectorAll('[data-cloud-physics]').length,Object.keys(kit.CloudControls.volume).length);
assert.equal(document.querySelectorAll('[data-cloud-vector]').length,0);
assert.equal(ids.get('effectSettings').querySelectorAll('.cloud-text').length,0,'Effects uses normal readable text');
const nativeTextControls=document.querySelectorAll('[data-cloud-text-option]');assert(nativeTextControls.length>=8,'Portfolio exposes native text rendering controls');
const randomized=document.querySelectorAll('[data-lightning]').find(n=>n.dataset.lightning==='randomness');randomized.value=.3;randomized.fire('input');assert.equal(lightning.randomness,.3);
const manual=document.querySelectorAll('[data-lightning-mode]').find(n=>n.dataset.lightningMode==='manual');manual.fire('click');assert.equal(lightning.mode,'manual');
ids.get('cloudExportBtn').fire('click');assert(JSON.parse(ids.get('cloudConfigInput').value).scene);ids.get('cloudConfigInput').value=JSON.stringify({scene:{density:1.5}});ids.get('cloudImportBtn').fire('click');assert.equal(state.density,1.5);
console.log('PASS schema-generated Effects controls, vectors, readable fonts, random/manual lightning settings, and configuration export/import.');
