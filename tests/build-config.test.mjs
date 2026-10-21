import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
test('isolated cloud QA build leaves the release configuration and output unchanged',async()=>{
 const directory=await mkdtemp(path.join(tmpdir(),'studio-cloud-build-')),config=path.join(directory,'cloud.json'),output=path.join(directory,'dist'),before=await readFile('dist/index.html'),release=await readFile('cloud.json');
 try{
  await writeFile(config,JSON.stringify({url:'http://127.0.0.1:54321',anonKey:'sb_publishable_local-qa-only',pagesOrigin:'http://localhost:4173'}));
  await promisify(execFile)(process.execPath,['scripts/build.mjs'],{env:{...process.env,STUDIO_CLOUD_CONFIG_FILE:config,STUDIO_DIST_DIR:output}});
  const built=await readFile(path.join(output,'index.html'),'utf8');assert.ok(built.includes('sb_publishable_local-qa-only'));assert.ok(built.includes('ws://127.0.0.1:54321'));
  assert.deepEqual(await readFile('dist/index.html'),before);assert.deepEqual(await readFile('cloud.json'),release);
 }finally{await rm(directory,{recursive:true,force:true,maxRetries:5,retryDelay:100});}
});
