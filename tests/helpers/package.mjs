import {execFile} from 'node:child_process';
import {mkdtemp,writeFile,readFile,readdir,rm,mkdir,cp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {promisify} from 'node:util';

export const run=promisify(execFile);
export const root=fileURLToPath(new URL('../../',import.meta.url));
// npm_execpath lets Node invoke npm's JS CLI without a Windows shell/batch file.
async function runNpm(args,options){
 if(process.env.npm_execpath)return run(process.execPath,[process.env.npm_execpath,...args],options);
 if(process.platform==='win32')throw new Error('Run this test through npm run test:package or npm run test:browser.');
 return run('npm',args,options);
}

// Exercise npm's actual lifecycle and installed exports, outside the checkout.
export async function withPackage(check,{staleBundle=false}={}){
 const directory=await mkdtemp(join(tmpdir(),'puff-consumer-'));
 try{
  const options={maxBuffer:4*1024*1024,env:{...process.env,npm_config_cache:join(directory,'cache'),npm_config_offline:'true',npm_config_update_notifier:'false'}};
  let source=root;
  if(staleBundle){
   source=join(directory,'source');await mkdir(source);
   const manifest=JSON.parse(await readFile(join(root,'package.json'),'utf8'));
   for(const file of [...manifest.files,'package.json','build.mjs','LICENSE']){
    try{await cp(join(root,file),join(source,file),{recursive:true});}
    catch(error){if(file!=='LICENSE'||error.code!=='ENOENT')throw error;}
   }
   await writeFile(join(source,'dist/puff.js'),'/* intentionally stale package test */');
  }
  await runNpm(['pack','--ignore-scripts=false','--pack-destination',directory],{...options,cwd:source});
  const tarball=(await readdir(directory)).find(name=>name.endsWith('.tgz'));
  await writeFile(join(directory,'package.json'),JSON.stringify({private:true,type:'module'}));
  await runNpm(['install',join(directory,tarball),'--ignore-scripts','--offline','--no-audit','--no-fund','--package-lock=false'],{...options,cwd:directory});
  return await check({directory,packageRoot:join(directory,'node_modules/@chartara/puff')});
 }finally{await rm(directory,{recursive:true,force:true});}
}
