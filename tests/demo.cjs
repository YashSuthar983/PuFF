const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const elements={},frames=new Map(),uniforms={};let next=0,uploads=0;
const gl=new Proxy({}, {get(_,key){
 if(key==='getShaderParameter'||key==='getProgramParameter')return()=>true;
 if(key==='isContextLost')return()=>false;if(key==='getParameter')return()=>256;
 if(key==='getUniformLocation')return(_,name)=>name;
 if(key.startsWith('uniform'))return(name,...args)=>uniforms[name]=args;
 if(key==='texImage3D')return()=>uploads++;
 if(key.toUpperCase()===key)return key;
 return()=>({});
}});
const ctx={fillText(){},getImageData(x,y,w,h){const data=new Uint8Array(w*h*4);for(let y=Math.floor(h*.4);y<h*.55;y++)for(let x=Math.floor(w*.4);x<w*.7;x++)data[(y*w+x)*4+3]=255;return{data};}};
class Element {
 constructor(id){this.id=id;this.listeners={};this.value='';this.hidden=false;this.disabled=false;this.parentElement={hidden:false};this.attrs={};}
 addEventListener(name,fn){(this.listeners[name]??=[]).push(fn);}
 fire(name){for(const fn of this.listeners[name]||[])fn({target:this});}
 setAttribute(k,v){this.attrs[k]=v;}append(node){node.parentElement=this;}
 getBoundingClientRect(){return{width:1000,height:600,left:0,top:0};}
 getContext(kind){return kind==='webgl2'?gl:ctx;}
 set innerHTML(html){for(const match of html.matchAll(/<(input|output)[^>]*id="([^"]+)"[^>]*>/g)){const node=new Element(match[2]);node.parentElement=this;node.value=match[0].match(/value="([^"]+)"/)?.[1]||'';elements[node.id]=node;}}
}
const document={getElementById:id=>elements[id]??=(new Element(id)),createElement:()=>new Element(),addEventListener(){},hidden:false};
for(const [id,value]of Object.entries({shape:'layer',preset:'storm',quality:'medium',color:'#8edaff',cloudColor:'#5275bb',background:'#02040b'}))document.getElementById(id).value=value;
const window={addEventListener(name,fn){(this.listeners??={})[name]=fn;}};
const sandbox={window,document,console,AbortController,Float32Array,Uint8Array,Math,Number,performance:{now:()=>100},matchMedia:()=>({matches:false,addEventListener(){}}),requestAnimationFrame:fn=>{frames.set(++next,fn);return next;},cancelAnimationFrame:id=>frames.delete(id)};
vm.createContext(sandbox);vm.runInContext(fs.readFileSync(require('path').join(__dirname,'../dist/cloud-kit.js'),'utf8'),sandbox);vm.runInContext(fs.readFileSync(require('path').join(__dirname,'../examples/demo.js'),'utf8'),sandbox);
const $=id=>document.getElementById(id);
assert.equal(frames.size,1);
for(const preset of ['clouds','fog','smoke','storm']){$('preset').value=preset;$('preset').fire('change');assert.equal(uniforms.uPreset[0],['clouds','storm','fog','smoke'].indexOf(preset));}
$('shape').value='sphere';$('shape').fire('change');assert.equal(uniforms.uShape[0],1);
$('shape').value='ring';$('shape').fire('change');assert.equal(uniforms.uHasField[0],1);assert(uploads>=2);
$('shape').value='text';$('shape').fire('change');assert($('sky').hidden);assert(!$('textStage').hidden);assert($('strike').disabled);assert(!$('puffiness').parentElement.hidden);
$('pause').fire('click');for(const [id,fn]of [...frames]){frames.delete(id);fn(150);}assert.equal(frames.size,0);
$('puffiness').value=1.4;$('puffiness').fire('input');assert.equal(frames.size,0);
$('shape').value='layer';$('shape').fire('change');assert(!$('sky').hidden);assert.equal(uniforms.uHasField[0],0);
$('pause').fire('click');assert.equal(frames.size,1);
$('coverage').value=.3;$('coverage').fire('input');assert.equal(uniforms.uCoverage[0],.3);
$('strike').fire('click');window.listeners.pagehide();assert.equal(frames.size,0);
console.log('PASS demo presets, isolated puff, custom ring, mask text, slider routing, pause, mode switches, and cleanup.');
