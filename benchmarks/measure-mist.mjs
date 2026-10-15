import {mkdtempSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';import {join} from 'node:path';import {spawnSync} from 'node:child_process';import vm from 'node:vm';import {fileURLToPath} from 'node:url';
import {CloudScene} from '../src/index.js';
const dir=mkdtempSync(join(tmpdir(),'cloud-cpu-bench-'));
try{
 const binary=join(dir,'bench'),compile=spawnSync('cc',[fileURLToPath(new URL('mist-cpu.c',import.meta.url)),'-O2','-o',binary,'-lEGL','-lGLESv2'],{encoding:'utf8'});
 if(compile.status!==0)throw Error('A C compiler and EGL/GLES development libraries are required.');
 const window={};vm.runInNewContext(readFileSync(new URL('../emerald-3d/mist.js',import.meta.url),'utf8'),{window});
 const files=['vertex.glsl','back.glsl','front.glsl'].map(name=>join(dir,name));
 [CloudScene.vertexShader,CloudScene.createFragmentShader(window.EmeraldMist.back),CloudScene.createFragmentShader(window.EmeraldMist.front)].forEach((source,i)=>writeFileSync(files[i],source));
 const result=spawnSync(binary,files,{encoding:'utf8',env:{...process.env,LIBGL_ALWAYS_SOFTWARE:'1',LP_NUM_THREADS:'1'},timeout:180000});
 if(result.status!==0)throw Error(result.stderr||'Software GL benchmark unavailable or timed out.');
 const data=JSON.parse(result.stdout);data.scope='Mist passes only; excludes world bake, composite, DOM, image decode, and compositor. Not browser or device FPS.';
 console.log(JSON.stringify(data,null,2));
}finally{rmSync(dir,{recursive:true,force:true});}
