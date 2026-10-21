import test from 'node:test';
import assert from 'node:assert/strict';
import {cloudFixture,must} from './helpers.mjs';
test('private and trashed works never appear',async()=>{
 const f=await cloudFixture();
 try{
  const trashed=must(await f.admin.from('works').insert({owner:f.source.id,title:'공개했지만 삭제함',visibility:'public',data:{},card_count:0,deleted_at:new Date().toISOString()}).select('id').single(),'seed trashed public');
  const get=async()=>{const response=await fetch(`${f.config.url}/functions/v1/export-manifest`,{redirect:'error',signal:AbortSignal.timeout(30000)});assert.equal(response.status,200);return response.json();};
  const result=await get();assert.equal(result.format,'card-print-studio-manifest');
  assert.ok(result.works.some(row=>row.id===f.publicWork.id));assert.ok(result.assets.some(row=>row.id===f.publicAsset.id));
  for(const id of [f.privateWork.id,trashed.id])assert.equal(result.works.some(row=>row.id===id),false);
  assert.equal(result.assets.some(row=>row.id===f.privateAsset.id),false);
  assert.equal(result.blobBaseUrl,`${f.config.url}/storage/v1/object/public/blobs/`);
  must(await f.admin.from('works').update({visibility:'private'}).eq('id',f.publicWork.id),'unpublish manifest entry');
  assert.equal((await get()).works.some(row=>row.id===f.publicWork.id),false);
 }finally{await f.dispose();}
});
