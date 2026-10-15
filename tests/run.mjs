import {spawnSync} from 'node:child_process';
import {existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const libraryRoot=new URL('../',import.meta.url),projectRoot=new URL('../../',import.meta.url);
const tests=['tests/library.mjs','tests/shaders.mjs','tests/configurable.mjs','tests/performance.mjs','tests/device-performance.cjs','tests/modularity.mjs','tests/text.mjs','tests/demo.cjs','tests/showcase.cjs','tests/emerald.cjs','tests/emerald-3d.cjs'].map(p=>new URL(p,libraryRoot));
for(const name of ['cloud-puff','cloud-light','sky-lightning','sky-time','portfolio','controls','cloud-lab']){
 const test=new URL(`port_v2/tests/${name}.cjs`,projectRoot);if(existsSync(test))tests.push(test);
}
for(const test of tests){const result=spawnSync(process.execPath,[fileURLToPath(test)],{cwd:fileURLToPath(projectRoot),stdio:'inherit'});if(result.status!==0)process.exit(result.status||1);}
