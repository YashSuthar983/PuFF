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
vm.createContext(sandbox);const root=path.join(__dirname,'..');vm.runInContext(fs.readFileSync(path.join(root,'dist/puff.js'),'utf8'),sandbox);
let maskRenderer;const BaseVolume=window.PuFF.CloudVolume;window.PuFF.CloudVolume=class extends BaseVolume{constructor(options){super(options);maskRenderer=this;}};
vm.runInContext(fs.readFileSync(path.join(root,'examples/gallery.js'),'utf8'),sandbox);
const pump=t=>{time=t;const callbacks=[...frames.values()];frames.clear();callbacks.forEach(fn=>fn(t));};for(let i=0;i<18;i++)pump(50+i*50);
assert.equal(ids.get('gallery').children.length,14);assert.equal(contexts,2,'All frames share one scene renderer and one mask renderer');assert.equal(frames.size,0,'Static gallery is quiet');
assert.equal(maskRenderer.layers.size,3,'Mask cards retain independent layers');const weatherLayer=[...maskRenderer.layers.keys()][2],weatherState=maskRenderer.layers.get(weatherLayer).state,weatherBefore=weatherState.field.reduce((n,v)=>n+v,0);
const card=id=>ids.get('gallery').children.find(node=>node.id==='frame-'+id);card('shader').querySelector('[data-action="settings"]').fire('click');pump(1000);assert.equal(uniforms.uCustom[0],1);
card('overlay').querySelector('[data-action="settings"]').fire('click');pump(1010);assert.equal(uniforms.uBackgroundOpacity[0],0,'Overlay frame has real transparent output');
ids.get('transparent').checked=false;ids.get('transparent').fire('change');pump(1020);assert.equal(uniforms.uBackgroundOpacity[0],1);
card('time').querySelector('[data-action="settings"]').fire('click');pump(1030);ids.get('timeOfDay').value='night';ids.get('timeOfDay').fire('change');pump(1040);assert.equal(uniforms.uAmbient[0],window.PuFF.CloudTimes.night.ambient);
card('shader').querySelector('[data-action="settings"]').fire('click');pump(1045);
const frequency=ids.get('control-uniform-uFrequency');frequency.value=11;frequency.fire('input');pump(1050);assert.equal(uniforms.uFrequency[0],11);assert.equal(uniforms.uCustom[0],1,'Live settings preserve the custom density hook');
ids.get('quality').value='high';ids.get('quality').fire('change');pump(1100);assert.equal(uniforms.uSteps[0],64);
ids.get('export').fire('click');assert.equal(JSON.parse(ids.get('configuration').value).feature,'shader');ids.get('configuration').value='bad JSON';ids.get('apply').fire('click');assert(ids.get('configStatus').textContent);
card('storm').querySelector('[data-action="flash"]').fire('click');pump(1150);pump(1200);assert(uniforms['uLights[0]'][0][3]>0,'Manual lightning illuminates a frame');
card('text').querySelector('input').value='Vapor';card('text').querySelector('input').fire('input');pump(1250);card('weather').querySelector('[data-action="puff"]').fire('click');pump(1300);pump(1350);
const weatherAfter=weatherState.field.reduce((n,v)=>n+v,0);assert(weatherAfter<weatherBefore,'Tap puff reaches the physics instead of being consumed by a static preview');
card('soft').querySelector('[data-action="settings"]').fire('click');pump(1370);card('weather').querySelector('[data-action="settings"]').fire('click');pump(1380);assert.equal(weatherState.field.reduce((n,v)=>n+v,0),weatherAfter,'Switching previews preserves weathered masks');
ids.get('configuration').value=JSON.stringify({feature:'weather',options:{puffiness:'bad'}});ids.get('apply').fire('click');assert.match(ids.get('configStatus').textContent,/finite/);assert.equal(frames.size,0,'Invalid mask configuration is rejected before scheduling a broken preview');
ids.get('pauseAll').fire('click');pump(1400);assert.equal(frames.size,0);window.listeners.pagehide({persisted:true});window.listeners.pageshow();card('soft').querySelector('[data-action="play"]').fire('click');pump(1450);pump(1500);assert(uniforms.uTime[0]>=0,'Cached navigation retains usable renderers');window.listeners.pagehide();assert.equal(frames.size,0);
console.log('PASS fourteen feature frames, shared renderers, quiet previews, custom uniform controls, quality, configuration, lightning, lettering/weather, and cleanup.');
