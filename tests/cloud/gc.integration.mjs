import test from 'node:test';
import assert from 'node:assert/strict';
import postgres from 'postgres';
import {createHash,randomUUID} from 'node:crypto';
import {localClients,createTestUser,must} from './helpers.mjs';
import {createProject} from '../../src/model/project.js';
import {runMaintenance} from '../../supabase/functions/_shared/maintenance.js';
import {createMaintenanceRepo,GC_PENDING} from '../../supabase/functions/_shared/maintenance-repo.js';
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
test('partial GC failure leaves missing images unavailable and reupload cancels durable deletion',async()=>{
 const clients=localClients(),user=await createTestUser(clients,'member'),sql=postgres(clients.config.dbUrl,{max:1,prepare:false}),objects=[];
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO5EE2cAAAAASUVORK5CYII=','base64');
 const images=[0,1].map(i=>Buffer.concat([png,Buffer.from(randomUUID()+i)])),hashes=images.map(digest);
 async function api(action,payload,bytes){
  const url=new URL('/functions/v1/api',clients.config.url),headers={Authorization:'Bearer '+user.session.access_token,apikey:clients.config.anonKey,'Content-Type':bytes?'image/png':'application/json'};
  if(bytes){url.searchParams.set('action','blob.upload');url.searchParams.set('sha',digest(bytes));}
  const response=await fetch(url,{method:'POST',headers,body:bytes??JSON.stringify({action,payload}),signal:AbortSignal.timeout(30000)});return {status:response.status,...await response.json()};
 }
 try{
  for(let i=0;i<2;i++){
   must(await clients.admin.storage.from('blobs').upload(hashes[i],images[i],{contentType:'image/png'}),'seed GC object');objects.push(hashes[i]);
   must(await clients.admin.from('blobs').insert({sha256:hashes[i],bytes:images[i].length,mime:'image/png',uploader:user.id,created_at:new Date(Date.now()-172800000).toISOString()}),'seed GC metadata');
  }
  const repo=createMaintenanceRepo(sql),find=repo.orphanBlobs;
  repo.orphanBlobs=async before=>(await find(before)).filter(hash=>hashes.includes(hash));repo.purgeTrash=async()=>0;repo.purgeAudit=async()=>0;
  let calls=0;
  await assert.rejects(runMaintenance({repo,storage:{async remove(hash){if(++calls===2)throw Error('second deletion failed');must(await clients.admin.storage.from('blobs').remove([hash]),'delete GC object');}}}),/second deletion failed/);
  const missing=await api('blob.missing',{hashes});assert.equal(missing.status,200);assert.deepEqual(missing.result.missing.sort(),[...hashes].sort());
  const project=createProject();project.assets.art={id:'art',mime:'image/png',width:1,height:1,paintingId:null,dataUrl:'blob:sha256:'+hashes[0]};
  const rejected=await api('work.create',{title:'GC missing image',data:project});assert.equal(rejected.status,400);assert.equal(rejected.code,'unknown-blob');
  for(const bytes of images)assert.equal((await api(null,null,bytes)).status,200);
  const retried=await runMaintenance({repo,storage:{async remove(){throw Error('newly uploaded object must not be deleted');}}});assert.equal(retried.blobs,0);
  for(let i=0;i<2;i++){const bytes=must(await clients.admin.storage.from('blobs').download(hashes[i]),'download repaired image');assert.equal(digest(Buffer.from(await bytes.arrayBuffer())),hashes[i]);}
  assert.equal((await api('work.create',{title:'GC repaired image',data:project})).status,200);
 }finally{
  await clients.admin.storage.from('blobs').remove(objects);await clients.admin.from('blobs').delete().in('sha256',hashes);
  for(const sha256 of hashes)await clients.admin.from('audit_log').delete().eq('action',GC_PENDING).contains('detail',{sha256});
  await clients.admin.from('audit_log').delete().eq('actor',user.id);await clients.admin.auth.admin.deleteUser(user.id);await sql.end();
 }
});
