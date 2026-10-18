import {readFile,stat} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';

const root=new URL('../',import.meta.url);
const manifest=JSON.parse(await readFile(new URL('package.json',root),'utf8'));
const missing=[];
if(manifest.private)missing.push('Set private:false for the intended public release.');
if(!manifest.license||manifest.license==='UNLICENSED')missing.push('Choose license terms and set package.json license.');
try{if(!(await stat(new URL('LICENSE',root))).isFile())throw new Error();}
catch{missing.push('Add the chosen license terms in LICENSE.');}
if(!(typeof manifest.repository==='string'?manifest.repository:manifest.repository?.url))missing.push('Set repository to the actual public source URL.');
if(missing.length){console.error('Release metadata is incomplete:\n'+missing.map(message=>' - '+message).join('\n')+'\nSee RELEASING.md.');process.exit(1);}
const cli=process.env.npm_execpath;
if(!cli)throw new Error('Run this guard through npm run prepublishOnly or npm publish.');
const result=spawnSync(process.execPath,[cli,'--offline','--no-update-notifier','run','check'],{cwd:root,stdio:'inherit',env:{...process.env,PUFF_REQUIRE_GL:'1',npm_config_offline:'true',npm_config_update_notifier:'false'}});
if(result.error)throw result.error;
process.exit(result.status??1);
