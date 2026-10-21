import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createBackup} from '../scripts/backup.mjs';
const bytes=Buffer.from('verified picture'),sha=createHash('sha256').update(bytes).digest('hex');
function fixture(){
 let downloads=0;
 const query={select(){return this;},order(){return this;},async range(){return {data:[{sha256:sha,mime:'image/png',bytes:bytes.length}],error:null};}};
 const client={from(){return query;},storage:{from(){return {async download(){downloads++;return {data:new Blob([bytes]),error:null};}};}}};
 return {client,downloads:()=>downloads};
}
test('backup reuses verified blobs across daily snapshots and keeps retained dependencies',async()=>{
 const directory=await mkdtemp(path.join(tmpdir(),'cloud-backup-')),f=fixture(),dump=file=>writeFile(file,'-- test database snapshot');try{
  await createBackup({directory,client:f.client,dump,now:new Date('2026-09-01T00:00:00Z')});
  const result=await createBackup({directory,client:f.client,dump,now:new Date('2026-10-21T00:00:00Z')});
  assert.equal(f.downloads(),1);assert.equal(result.blobs,1);assert.equal((await readFile(path.join(directory,'blobs',sha))).toString(),bytes.toString());assert.deepEqual((await readdir(directory)).sort(),['2026-10-21','blobs']);
  const manifest=JSON.parse(await readFile(path.join(directory,'2026-10-21','snapshot.json')));assert.equal(manifest.blobs[0].sha256,sha);assert.equal(manifest.restoreKind,'app-data-with-migrations');assert.equal(manifest.migrations.length,3);
 }finally{await rm(directory,{recursive:true,force:true});}
});
test('corrupt blob never produces a completed backup',async()=>{
 const directory=await mkdtemp(path.join(tmpdir(),'cloud-backup-')),f=fixture();f.client.storage.from=()=>({download:async()=>({data:new Blob(['wrong'])})});try{
  await assert.rejects(createBackup({directory,client:f.client,dump:file=>writeFile(file,'sql'),now:new Date('2026-10-21T00:00:00Z')}),/hash|integrity/i);assert.ok(!(await readdir(directory)).includes('2026-10-21'));
 }finally{await rm(directory,{recursive:true,force:true});}
});
