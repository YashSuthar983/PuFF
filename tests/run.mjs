import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=new URL('../',import.meta.url);
const tests=['build.mjs','tests/library.mjs','tests/shaders.mjs','tests/configurable.mjs','tests/performance.mjs','tests/modularity.mjs','tests/physics.mjs','tests/text.mjs','tests/demo.cjs','tests/showcase.cjs'].map(p=>new URL(p,root));
for(const test of tests){const result=spawnSync(process.execPath,[fileURLToPath(test)],{cwd:fileURLToPath(root),stdio:'inherit'});if(result.status!==0)process.exit(result.status||1);}
