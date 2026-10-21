import test from 'node:test';
import assert from 'node:assert/strict';
import {runMaintenance} from '../supabase/functions/_shared/maintenance.js';
const now=Date.parse('2026-10-21T00:00:00Z'),day=86400000,ago=days=>new Date(now-days*day).toISOString();
function fixture(){
 const state={works:[{id:'old',deleted_at:ago(31),blob_refs:['trash']},{id:'recent',deleted_at:ago(29),blob_refs:[]},{id:'live',deleted_at:null,blob_refs:['live']}],assets:[{id:'old-asset',deleted_at:ago(31),blob_refs:[]},{id:'asset',deleted_at:null,blob_refs:['asset']}],drafts:[{work_id:'live',blob_refs:['draft']}],versions:[{work_id:'live',blob_refs:['version']}],blobs:[...['trash','orphan','live','asset','draft','version'].map(sha256=>({sha256,created_at:ago(2)})),{sha256:'young',created_at:ago(.5)}],audits:[{created_at:ago(91)},{created_at:ago(90)},{created_at:ago(1)}],removed:[]};
 const repo={async runExclusive(fn){return fn();},async purgeTrash(before){let count=0;for(const key of ['works','assets']){const removed=state[key].filter(row=>row.deleted_at&&Date.parse(row.deleted_at)<Date.parse(before));count+=removed.length;state[key]=state[key].filter(row=>!removed.includes(row));if(key==='works')for(const sub of ['drafts','versions'])state[sub]=state[sub].filter(row=>!removed.some(work=>work.id===row.work_id));}return count;},async orphanBlobs(before){const refs=new Set(['works','assets','drafts','versions'].flatMap(key=>state[key].flatMap(row=>row.blob_refs)));return state.blobs.filter(row=>Date.parse(row.created_at)<Date.parse(before)&&!refs.has(row.sha256)).map(row=>row.sha256);},async deleteBlob(hash){state.blobs=state.blobs.filter(row=>row.sha256!==hash);},async purgeAudit(before){const old=state.audits.length;state.audits=state.audits.filter(row=>Date.parse(row.created_at)>=Date.parse(before));return old-state.audits.length;}};
 const pending=new Set();repo.prepareBlobDeletion=async hash=>{pending.add(hash);await repo.deleteBlob(hash);};repo.finishBlobDeletion=async hash=>pending.delete(hash);
 const orphans=repo.orphanBlobs;repo.orphanBlobs=async before=>[...new Set([...pending,...await orphans(before)])];
 const storage={async remove(hash){state.removed.push(hash);}};return {state,repo,storage,pending};
}
test('purges trash older than 30 days only',async()=>{
 const f=fixture(),result=await runMaintenance({...f,now:()=>now});assert.equal(result.trashed,2);assert.deepEqual(f.state.works.map(row=>row.id),['recent','live']);assert.equal(f.state.audits.length,2);
});
test('deletes orphan blobs older than 24h but keeps any referenced by versions',async()=>{
 const f=fixture(),result=await runMaintenance({...f,now:()=>now});assert.equal(result.blobs,2);assert.deepEqual(f.state.removed.sort(),['orphan','trash']);for(const hash of ['live','asset','draft','version','young'])assert.ok(f.state.blobs.some(row=>row.sha256===hash));
});
test('storage failure keeps a durable deletion journal for a safe retry',async()=>{
 const f=fixture();f.storage.remove=async()=>{throw Error('offline');};await assert.rejects(runMaintenance({...f,now:()=>now}),/offline/);assert.equal(f.pending.size,1);for(const hash of f.pending)assert.ok(!f.state.blobs.some(row=>row.sha256===hash));
});
test('partial storage deletion cannot roll back availability and journals allow safe retries',async()=>{
 const f=fixture(),pending=new Set(),deleted=new Set();
 f.repo.prepareBlobDeletion=async hash=>{pending.add(hash);await f.repo.deleteBlob(hash);};
 f.repo.finishBlobDeletion=async hash=>{pending.delete(hash);};
 const orphans=f.repo.orphanBlobs;f.repo.orphanBlobs=async before=>[...new Set([...pending,...await orphans(before)])];
 let calls=0;f.storage.remove=async hash=>{assert.ok(!f.state.blobs.some(row=>row.sha256===hash),'metadata must be durably unavailable before storage deletion');if(++calls===2)throw Error('second delete failed');deleted.add(hash);};
 await assert.rejects(runMaintenance({...f,now:()=>now}),/second delete failed/);
 assert.equal(deleted.size,1);assert.equal(pending.size,1);
 for(const hash of deleted)assert.ok(!f.state.blobs.some(row=>row.sha256===hash));
 f.storage.remove=async hash=>deleted.add(hash);await runMaintenance({...f,now:()=>now});
 assert.deepEqual([...deleted].sort(),['orphan','trash']);assert.equal(pending.size,0);
});
