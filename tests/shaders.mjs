import {mkdtempSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import vm from 'node:vm';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {CloudVolume,CloudScene} from '../src/index.js';
const dir=mkdtempSync(join(tmpdir(),'cloud-kit-glsl-'));
const skip=reason=>{if(process.env.CLOUD_KIT_REQUIRE_GL==='1')throw new Error(reason);console.log('SKIP real GLSL compiler: '+reason);};
try{
 const binary=join(dir,'compile-glsl'),compile=spawnSync('cc',[fileURLToPath(new URL('helpers/compile-glsl.c',import.meta.url)),'-o',binary,'-lEGL','-lGLESv2'],{encoding:'utf8'});
 if(compile.status!==0){skip('C compiler or EGL/GLES development libraries unavailable.');}
 else{
  const pairs=[['mask',CloudVolume.vertexShader,CloudVolume.fragmentShader],['scene',CloudScene.vertexShader,CloudScene.fragmentShader],['custom',CloudScene.vertexShader,CloudScene.createFragmentShader('return cloudBase(p)*uAmount;',{uAmount:.8})]];
  const window={};vm.runInNewContext(readFileSync(new URL('../emerald-demo/native-rocks.js',import.meta.url),'utf8'),{window});
  pairs.push(['rocks',window.NativeRockScene.vertexShader,window.NativeRockScene.fragmentShader]);
  const mist=readFileSync(new URL('../emerald-demo/demo.js',import.meta.url),'utf8').match(/densityShader:'([^']+)'/)[1];
  pairs.push(['emerald-mist',CloudScene.vertexShader,CloudScene.createFragmentShader(mist)]);
  const world={};vm.runInNewContext(readFileSync(new URL('../emerald-3d/world.js',import.meta.url),'utf8'),{window:world});
  pairs.push(['world-scene',world.EmeraldWorld.shaders.vertex,world.EmeraldWorld.shaders.scene],['world-composite',world.EmeraldWorld.shaders.vertex,world.EmeraldWorld.shaders.composite],['world-model',world.EmeraldWorld.shaders.meshVertex,world.EmeraldWorld.shaders.meshFragment]);
  vm.runInNewContext(readFileSync(new URL('../emerald-3d/mist.js',import.meta.url),'utf8'),{window:world});
  pairs.push(['world-back-mist',CloudScene.vertexShader,CloudScene.createFragmentShader(world.EmeraldMist.back)],['world-front-mist',CloudScene.vertexShader,CloudScene.createFragmentShader(world.EmeraldMist.front)]);
  const args=[];for(const [name,vertex,fragment]of pairs)for(const [ext,source]of [['vert',vertex],['frag',fragment]]){const path=join(dir,name+'.'+ext);writeFileSync(path,source);args.push(path);}
  const result=spawnSync(binary,args,{encoding:'utf8',env:{...process.env,LIBGL_ALWAYS_SOFTWARE:'1'}});
  if(result.status===77)skip('Surfaceless ES3 context unavailable.');
  else{assert.equal(result.status,0,result.stderr||result.stdout||'Shader compiler failed.');console.log('PASS real ES3 compilation/linking of text, general scene, custom density, scanned rocks, Emerald mist, and Emerald 3D glass/rock/mist shaders.');}
 }
}finally{rmSync(dir,{recursive:true,force:true});}
