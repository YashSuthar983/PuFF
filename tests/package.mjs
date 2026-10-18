import assert from 'node:assert/strict';
import {readFile,writeFile,readdir} from 'node:fs/promises';
import {join,relative} from 'node:path';
import {build} from 'esbuild';
import ts from 'typescript';
import {withPackage,run,root} from './helpers/package.mjs';

await withPackage(async({directory,packageRoot})=>{
 const manifest=JSON.parse(await readFile(join(packageRoot,'package.json'),'utf8'));
 for(const entry of Object.values(manifest.exports))for(const target of typeof entry==='string'?[entry]:Object.values(entry))await readFile(join(packageRoot,target));
 const files=await readdir(packageRoot,{recursive:true});
 assert(!files.some(path=>/^(tests|examples|node_modules|\.git)(\/|\\|$)/.test(path)),'Only library files are distributed');
 assert.equal(await readFile(join(packageRoot,'dist/puff.js'),'utf8'),await readFile(join(root,'dist/puff.js'),'utf8'),'prepack generated the current bundle');
 for(const filename of ['README.md','DESIGN.md','RELEASING.md','CHANGELOG.md'])await readFile(join(packageRoot,filename));
 const smoke=`
  import assert from 'node:assert/strict';
  import * as kit from '@chartara/puff';
  assert.deepEqual(Object.keys(kit).sort(),['CloudText','CloudTimes','CloudControls','CloudPresets','CloudScene','CloudVolume','Lightning','StormClouds','createDensityField'].sort());
  assert.equal(typeof globalThis.document,'undefined');
  assert.equal(kit.createDensityField(()=>.5,{width:2,height:2,depth:2}).data.length,8);
  await import('@chartara/puff/dist/puff.js');
  assert.equal(typeof globalThis.PuFF.CloudText,'function');
  const {createRequire}=await import('node:module');
  assert(createRequire(import.meta.url).resolve('@chartara/puff/text.css').endsWith('text.css'));
 `;
 await writeFile(join(directory,'smoke.mjs'),smoke);
 await run(process.execPath,['smoke.mjs'],{cwd:directory});

 const fixture=join(directory,'consumer.ts');
 await writeFile(fixture,await readFile(new URL('./fixtures/consumer.ts',import.meta.url)));
 for(const [module,moduleResolution]of [[ts.ModuleKind.NodeNext,ts.ModuleResolutionKind.NodeNext],[ts.ModuleKind.ESNext,ts.ModuleResolutionKind.Bundler],[ts.ModuleKind.ESNext,ts.ModuleResolutionKind.Node10]]){
  const program=ts.createProgram([fixture],{strict:true,noEmit:true,target:ts.ScriptTarget.ES2022,module,moduleResolution});
  const errors=ts.getPreEmitDiagnostics(program);
  assert.equal(errors.length,0,ts.formatDiagnosticsWithColorAndContext(errors,{getCanonicalFileName:p=>p,getCurrentDirectory:()=>directory,getNewLine:()=> '\n'}));
 }

 const sizes={};
 for(const [name,limit]of [['createDensityField',1500],['CloudScene',50000],['CloudText',70000]]){
  const result=await build({absWorkingDir:directory,stdin:{contents:`export {${name}} from '@chartara/puff';`,resolveDir:directory},bundle:true,minify:true,format:'esm',platform:'browser',write:false,metafile:true});
  sizes[name]=result.outputFiles[0].contents.length;
  assert(sizes[name]<limit,`${name} grew to ${sizes[name]} bytes (limit ${limit})`);
  if(name==='createDensityField')for(const path of Object.keys(result.metafile.inputs)){
   if(!/[/\\](scene|text|volume|lightning)\.js$/.test(path))continue;
   const used=Object.values(result.metafile.outputs).some(output=>output.inputs[path]?.bytesInOutput>0);
   assert(!used,`Pure helper retained ${relative(directory,path)}`);
  }
 }
 const classic=await build({absWorkingDir:directory,stdin:{contents:"import '@chartara/puff/dist/puff.js';",resolveDir:directory},bundle:true,minify:true,write:false});
 assert(classic.outputFiles[0].text.includes('PuFF'),'Global bundle side effects are retained');
 const css=await build({absWorkingDir:directory,stdin:{contents:"import '@chartara/puff/text.css';",resolveDir:directory},bundle:true,write:false,outfile:'consumer.js'});
 assert(css.outputFiles.some(file=>file.path.endsWith('.css')&&file.text.includes('puff-text-ready')),'CSS import survives tree shaking');
 console.log('PASS stale-bundle rebuild, packed installation, public exports, server import, TypeScript composition/rejections, classic/CSS side effects, and bundle sizes:',sizes);
},{staleBundle:true});
