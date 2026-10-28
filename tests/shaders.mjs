import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {CloudVolume,CloudScene} from '../src/index.js';
const dir=mkdtempSync(join(tmpdir(),'puff-glsl-'));
const skip=reason=>{if(process.env.PUFF_REQUIRE_GL==='1')throw new Error(reason);console.log('SKIP real GLSL compiler: '+reason);};
try{
 const binary=join(dir,'compile-glsl'),compile=spawnSync('cc',[fileURLToPath(new URL('helpers/compile-glsl.c',import.meta.url)),'-o',binary,'-lEGL','-lGLESv2'],{encoding:'utf8'});
 if(compile.status!==0){skip('C compiler or EGL/GLES development libraries unavailable.');}
 else{
  const pairs=[['mask',CloudVolume.vertexShader,CloudVolume.fragmentShader],['scene',CloudScene.vertexShader,CloudScene.fragmentShader],['scene-present',CloudScene.vertexShader,CloudScene.presentFragmentShader],['custom',CloudScene.vertexShader,CloudScene.createFragmentShader('return cloudBase(p)*uAmount;',{uAmount:.8})]];
  for(const maxSteps of [8,16,24,32,48,64,96])for(const bolts of [0,32]){
   pairs.push([`scene-${maxSteps}-${bolts}`,CloudScene.vertexShader,CloudScene.createFragmentShader(null,{},{maxSteps,bolts})]);
  }
  pairs.push(['custom-specialized',CloudScene.vertexShader,CloudScene.createFragmentShader('return cloudBase(p)*uAmount;',{uAmount:.8},{maxSteps:16,bolts:0})]);
  const args=[];for(const [name,vertex,fragment]of pairs)for(const [ext,source]of [['vert',vertex],['frag',fragment]]){const path=join(dir,name+'.'+ext);writeFileSync(path,source);args.push(path);}
  const result=spawnSync(binary,args,{encoding:'utf8',env:{...process.env,LIBGL_ALWAYS_SOFTWARE:'1'}});
  if(result.status===77)skip('Surfaceless ES3 context unavailable.');
  else{assert.equal(result.status,0,result.stderr||result.stdout||'Shader compiler failed.');console.log('PASS real ES3 compilation/linking of text, general scene, amortized present, and custom density shaders.');}
 }
}finally{rmSync(dir,{recursive:true,force:true});}
