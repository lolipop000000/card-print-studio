import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {cloudFixture,must,waitUntil} from './helpers.mjs';

let f;
before(async()=>{f=await cloudFixture();});
after(async()=>{await f?.dispose();});
const ids=rows=>rows.map(row=>row.id).sort();
const denied=(result,label)=>assert.ok(result.error?.code==='42501'||(!result.error&&result.data?.length===0),`${label}: expected permission denial or zero rows, got ${result.error?.code??result.data?.length}`);

test('new users start pending and public profiles disclose nickname only',async()=>{
 assert.equal(f.initialStatus,'pending');
 const rows=must(await f.anon.from('public_profiles').select('*').in('id',f.userIds),'public profiles');
 assert.equal(rows.length,f.userIds.length);
 assert.deepEqual(Object.keys(rows[0]).sort(),['id','nickname']);
 for(const role of f.roles){const rows=must(await role.client.from('profiles').select('*'),'self profile');assert.deepEqual(ids(rows),[role.id]);}
});

test('anon reads public works and feed but never private rows or drafts',async()=>{
 for(const role of [{name:'anon',client:f.anon},...f.roles]){
  const works=must(await role.client.from('works').select('*').in('id',[f.publicWork.id,f.privateWork.id]),`${role.name} works`);
  assert.deepEqual(ids(works),[f.publicWork.id]);
  const assets=must(await role.client.from('shared_assets').select('*').in('id',[f.publicAsset.id,f.privateAsset.id]),`${role.name} assets`);
  assert.deepEqual(ids(assets),[f.publicAsset.id]);
  for(const table of ['work_drafts','work_versions']){
   const rows=must(await role.client.from(table).select('*').eq('work_id',f.privateWork.id),`${role.name} ${table}`);
   assert.deepEqual(rows,[]);
  }
  const feed=must(await role.client.from('public_feed').select('*').in('item_id',[f.publicWork.id,f.privateWork.id,f.publicAsset.id,f.privateAsset.id]),`${role.name} feed`);
  assert.deepEqual(feed.map(row=>row.item_id).sort(),[f.publicWork.id,f.publicAsset.id].sort());
  for(const row of feed)for(const key of ['data','blob_refs','email','status'])assert.equal(Object.hasOwn(row,key),false);
 }
});

test('member reads own private work and own draft, not another member\'s',async()=>{
 for(const role of f.roles){
  const own=f.own[role.name];
  assert.deepEqual(ids(must(await role.client.from('works').select('*').eq('id',own.id),'own work')),[own.id]);
  for(const table of ['work_drafts','work_versions']){
   const rows=must(await role.client.from(table).select('*').in('work_id',[own.id,f.privateWork.id]),`own ${table}`);
   assert.equal(rows.length,1);assert.equal(rows[0].work_id,own.id);
  }
 }
});

test('every client role is denied insert, update and delete on every table',async()=>{
 const owner=f.roles[0].id,work=f.privateWork.id;
 const candidates={
  tier_limits:{insert:{tier:'trial',max_cards:1,max_blob_bytes:1},filter:['tier','trial'],patch:{max_cards:999}},
  profiles:{insert:{id:f.emptyProfileId,status:'member'},filter:['id',owner],patch:{status:'member'}},
  blobs:{insert:{sha256:'f'.repeat(64),mime:'image/png',bytes:70,uploader:owner},filter:['sha256',f.hashes[0]],patch:{bytes:99}},
  works:{insert:{owner,title:'금지된 직접 쓰기',data:{},card_count:1},filter:['id',f.publicWork.id],patch:{title:'바뀌면 안 됨'}},
  work_drafts:{insert:{work_id:f.emptyWork.id,owner,data:{},card_count:1},filter:['work_id',work],patch:{card_count:99}},
  work_versions:{insert:{work_id:work,version:99,data:{}},filter:['work_id',work],patch:{version:99}},
  shared_assets:{insert:{owner,kind:'keyword',title:'직접 에셋',data:{}},filter:['id',f.publicAsset.id],patch:{title:'바뀌면 안 됨'}},
  audit_log:{insert:{actor:owner,action:'direct',ok:true},filter:['id',f.auditId],patch:{ok:false}},
  import_runs:{insert:{owner,token:randomUUID(),expires_at:new Date(Date.now()+60000).toISOString()},filter:['id',f.importId],patch:{decks:99}},
  public_feed:{insert:{item_id:randomUUID(),kind:'work',owner,title:'직접 피드',version:1,updated_at:new Date().toISOString()},filter:['item_id',f.publicWork.id],patch:{title:'바뀌면 안 됨'}},
  public_profiles:{insert:{id:f.emptyProfileId,nickname:'직접 닉네임'},filter:['id',owner],patch:{nickname:'바뀌면 안 됨'}}
 };
 for(const role of [{name:'anon',client:f.anon},...f.roles])for(const [table,{insert,filter,patch}]of Object.entries(candidates)){
  denied(await role.client.from(table).insert(insert).select(),`${role.name} insert ${table}`);
  denied(await role.client.from(table).update(patch).eq(...filter).select(),`${role.name} update ${table}`);
  denied(await role.client.from(table).delete().eq(...filter).select(),`${role.name} delete ${table}`);
 }
 assert.equal(must(await f.admin.from('tier_limits').select('max_cards').eq('tier','trial').single(),'trial limit').max_cards,10);
 assert.equal(must(await f.admin.from('works').select('title').eq('id',f.publicWork.id).single(),'unchanged work').title,f.publicWork.title);
});

test('client cannot upload to blobs bucket',async()=>{
 for(const role of [{name:'anon',client:f.anon},...f.roles]){
  const hash=randomUUID().replaceAll('-','').repeat(2),result=await role.client.storage.from('blobs').upload(hash,f.png,{contentType:'image/png'});
  assert.ok(result.error,`${role.name} upload must fail`);
  assert.ok(['401','403'].includes(String(result.error.statusCode)),`${role.name}: ${result.error.statusCode}`);
 }
});

test('feed row appears on publish and disappears on unpublish and soft delete',async()=>{
 for(const [table,entry]of [['works',f.feedWork],['shared_assets',f.feedAsset]]){
  const read=async()=>must(await f.anon.from('public_feed').select('*').eq('item_id',entry.id),'feed');
  assert.deepEqual(await read(),[]);
  must(await f.admin.from(table).update({visibility:'public'}).eq('id',entry.id),'publish');
  assert.equal((await read()).length,1);
  must(await f.admin.from(table).update({visibility:'private'}).eq('id',entry.id),'unpublish');
  assert.deepEqual(await read(),[]);
  must(await f.admin.from(table).update({visibility:'public'}).eq('id',entry.id),'republish');
  must(await f.admin.from(table).update({deleted_at:new Date().toISOString()}).eq('id',entry.id),'trash');
  assert.deepEqual(await read(),[]);
  assert.deepEqual(must(await f.anon.from(table).select('id').eq('id',entry.id),'hidden trash'),[]);
 }
});

test('owner_usage counts max of saved and draft cards and unique blob bytes',async()=>{
 const usage=must(await f.admin.rpc('owner_usage',{uid:f.source.id}),'owner usage');
 // Source owns saved 2/draft 4 + saved 1/draft 3 + empty 0 + feed 0 cards.
 assert.deepEqual(usage,[{cards:7,blob_bytes:150}]);
 for(const role of [{name:'anon',client:f.anon},...f.roles])denied(await role.client.rpc('owner_usage',{uid:f.source.id}),`${role.name} cannot inspect another owner's usage`);
 const own=must(await f.roles[0].client.rpc('my_usage'),'my usage');assert.deepEqual(own,[{cards:1,blob_bytes:0}]);
});

test('realtime delivers feed changes only',{timeout:45000},async()=>{
 const events=[],sensitive=[],diagnostics=[],client=f.anon;
 const subscribe=table=>new Promise((resolve,reject)=>{
  const channel=client.channel(`rls-${table}-${randomUUID()}`).on('system',{},event=>diagnostics.push({status:event.status,message:event.message})).on('postgres_changes',{event:'*',schema:'public',table},event=>{if(table==='public_feed'){if((event.new.item_id??event.old.item_id)===f.realtimeWork.id)events.push(event);}else sensitive.push(event);}).subscribe(status=>{diagnostics.push({table,status});if(status==='SUBSCRIBED')resolve(channel);else if(status==='CHANNEL_ERROR'||status==='TIMED_OUT')reject(Error(`${table} subscription ${status}`));});
 });
 const channel=await subscribe('public_feed');
 // These tables are deliberately absent from the publication. Their subscriptions may be rejected.
 const privateChannels=['works','work_drafts','shared_assets'].map(table=>client.channel(`private-${table}-${randomUUID()}`).on('postgres_changes',{event:'*',schema:'public',table},event=>sensitive.push(event)).subscribe());
 try{
  must(await f.admin.from('works').update({title:'숨겨진 초안 내용'}).eq('id',f.realtimeWork.id),'private update');
  must(await f.admin.from('work_drafts').update({data:{secret:'초안은 보내지 않기'}}).eq('work_id',f.privateWork.id),'private draft update');
  must(await f.admin.from('shared_assets').update({title:'숨겨진 에셋'}).eq('id',f.privateAsset.id),'private asset update');
  await new Promise(resolve=>setTimeout(resolve,1000));assert.deepEqual(events,[]);assert.deepEqual(sensitive,[]);
  must(await f.admin.from('works').update({visibility:'public'}).eq('id',f.realtimeWork.id),'realtime publish');
  await waitUntil(()=>events.some(event=>event.eventType==='INSERT'&&event.new.item_id===f.realtimeWork.id),'public feed INSERT').catch(error=>{throw Error(`${error.message} ${JSON.stringify(diagnostics)}`);});
  must(await f.admin.from('works').update({visibility:'private'}).eq('id',f.realtimeWork.id),'realtime unpublish');
  await waitUntil(()=>events.some(event=>event.eventType==='DELETE'&&event.old.item_id===f.realtimeWork.id),'public feed DELETE');
  assert.deepEqual(events.map(event=>event.eventType),['INSERT','DELETE']);assert.deepEqual(sensitive,[]);
  assert.equal(JSON.stringify(events).includes('초안은 보내지 않기'),false);
  assert.equal(Object.hasOwn(events[0].new,'data'),false);
 }finally{await Promise.all([channel,...privateChannels].map(channel=>client.removeChannel(channel)));}
});
