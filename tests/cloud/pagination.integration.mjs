import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {localClients,createTestUser,must} from './helpers.mjs';
import {createCloudClient} from '../../src/cloud/client.js';
test('stable paged reads include public and owned assets beyond the actual REST cap',async()=>{
 const clients=localClients(),owner=await createTestUser(clients,'member'),friend=await createTestUser(clients,'member');
 try{
  const rows=Array.from({length:2004},(_,index)=>({id:randomUUID(),owner:index<1002?owner.id:friend.id,kind:'keyword',title:'페이지 '+index,visibility:index<1002?'private':'public',data:{},blob_refs:[]}));
  for(let offset=0;offset<rows.length;offset+=250)must(await clients.admin.from('shared_assets').insert(rows.slice(offset,offset+250)),'seed paged collection');
  const raw=must(await owner.client.from('shared_assets').select('id'),'capped SDK read');assert.equal(raw.length,1000);
  const client=createCloudClient({config:{url:clients.config.url,anonKey:clients.config.anonKey},location:{protocol:'http:'},createSupabase:()=>owner.client});
  const assets=await client.select('shared_assets',{columns:'id,owner',is:{deleted_at:null}}),mine=await client.select('shared_assets',{columns:'id',eq:{owner:owner.id}}),feed=await client.select('public_feed',{eq:{owner:friend.id}});
  assert.deepEqual(new Set(assets.map(row=>row.id)),new Set(rows.map(row=>row.id)));assert.equal(mine.length,1002);assert.equal(feed.length,1002);
 }finally{await clients.admin.auth.admin.deleteUser(owner.id);await clients.admin.auth.admin.deleteUser(friend.id);}
});
