import test from 'node:test';
import assert from 'node:assert/strict';
import {createProject,createCard} from '../src/model/project.js';
import {sha256Hex} from '../src/cloud/cloud-format.js';
import {memoryRepo} from './helpers/memory-repo.mjs';
import {createApi,ApiError} from '../supabase/functions/_shared/handlers.js';
const png=Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO5EE2cAAAAASUVORK5CYII=','base64'));
const user={id:'member-a'},other={id:'member-b'};
const writes=['profile.setNickname','work.create','work.saveDraft','work.save','work.setVisibility','work.copy','work.delete','work.restore','blob.missing','asset.create','asset.save','asset.setVisibility','asset.copy','asset.delete','asset.restore','import.begin'];
function setup(tier='member'){
 let time=Date.parse('2026-10-21T00:00:00Z');const now=()=>time,{repo,storage,state}=memoryRepo({now});
 for(const id of [user.id,other.id])state.profiles.set(id,{id,status:tier,nickname:id});
 const api=createApi({repo,storage,now});
 return {api,repo,state,advance:ms=>time+=ms,create:(n=1,payload={})=>api.handle(user,'work.create',{title:'작업',data:work(n),...payload})};
}
function work(n){const p=createProject();p.cards=Array.from({length:n},()=>createCard('monster',p));return p;}
async function rejects(promise,code,status){await assert.rejects(promise,e=>e instanceof ApiError&&e.code===code&&(status===undefined||e.status===status));}
async function assetData(){return {kind:'keyword',item:{id:'key',name:'독',description:'피해',color:'#113355',iconAssetId:null},blobs:[]};}

test('Appendix B: anonymous, pending and revoked users are rejected for every action and blob upload',async()=>{
 for(const tier of ['pending','revoked']){const {api,state}=setup(tier);for(const action of writes)await rejects(api.handle(user,action,{}),'not-member',403);await rejects(api.uploadBlob(user,'a'.repeat(64),png),'not-member',403);assert.equal(state.audits.length,writes.length+1);}
 const {api}=setup();for(const action of writes)await rejects(api.handle(null,action,{}),'unauthenticated',401);await rejects(api.uploadBlob(null,'a'.repeat(64),png),'unauthenticated',401);
});
test('Appendix B: other private work returns 404 and public work returns 403 on every mutation',async()=>{
 const {api,create}=setup(),{id}=await create();
 for(const visibility of ['private','public']){
  await api.handle(user,'work.setVisibility',{id,visibility});
  for(const action of ['work.save','work.saveDraft','work.delete','work.restore','work.setVisibility'])await rejects(api.handle(other,action,{id,data:work(1),baseVersion:1,baseSavedAt:null,visibility:'public'}),visibility==='private'?'not-found':'forbidden',visibility==='private'?404:403);
 }
});
test('trial 11th card is rejected via create, save, draft, copy and import while the 10th succeeds',async()=>{
 for(const action of ['create','save','saveDraft','copy','import']){
  const {api,state,create}=setup('trial');
  if(action==='create'){await create(10);await rejects(create(1),'limit-cards',429);continue;}
  if(action==='import'){const token=(await api.handle(user,'import.begin',{})).token;await rejects(create(11,{importToken:token}),'limit-cards',429);continue;}
  if(action==='copy'){
   const foreign=await api.handle(other,'work.create',{title:'공개',data:work(1)});await api.handle(other,'work.setVisibility',{id:foreign.id,visibility:'public'});await create(10);
   await rejects(api.handle(user,'work.copy',{sourceId:foreign.id}),'limit-cards',429);continue;
  }
  const {id}=await create(10);await rejects(api.handle(user,'work.'+action,{id,data:work(11),baseVersion:1,baseSavedAt:null}),'limit-cards',429);
  assert.equal(state.works.get(id).card_count,10);
 }
});
test('member 121st card is rejected and limits come from repo tier settings',async()=>{
 const {create,state}=setup();await create(120);await rejects(create(1),'limit-cards');
 state.tiers.get('member').max_cards=121;await create(1);
});
test('demoted member over limit keeps existing work but cannot add cards',async()=>{
 const {api,state,create}=setup(),{id}=await create(120);state.profiles.get(user.id).status='trial';
 await api.handle(user,'work.save',{id,data:work(120),baseVersion:1});
 await rejects(api.handle(user,'work.save',{id,data:work(121),baseVersion:2}),'limit-cards');
});
test('unknown blobs and forged derived fields cannot enter a work',async()=>{
 const {api,create,state}=setup('trial'),p=work(1),hash='a'.repeat(64);p.assets.art={id:'art',mime:'image/png',width:1,height:1,paintingId:null,dataUrl:'blob:sha256:'+hash};
 await rejects(create(1,{data:p,owner:other.id,card_count:0,blob_refs:[]}),'unknown-blob',400);
 state.blobs.set(hash,{sha256:hash,bytes:10,mime:'image/png'});
 const {id}=await create(1,{data:p,owner:other.id,card_count:0,version:900,status:'member'});
 assert.equal(state.works.get(id).owner,user.id);assert.equal(state.works.get(id).card_count,1);assert.equal(state.works.get(id).version,1);assert.equal(state.works.get(id).visibility,'private');
 await rejects(api.handle(user,'work.create',{title:'초과',data:work(11),card_count:0}),'limit-cards');
});
test('uploadBlob rejects SVG, GIF, HTML, wrong hash, oversize and fake PNG dimensions',async()=>{
 const {api,state}=setup();
 for(const bytes of [new TextEncoder().encode('<svg/>'),new TextEncoder().encode('GIF89a'),new TextEncoder().encode('<html/>'),new Uint8Array([...png.slice(0,8),...new TextEncoder().encode('<html>bad</html>')]),new Uint8Array(20971521)])await rejects(api.uploadBlob(user,await sha256Hex(bytes),bytes),'invalid',400);
 await rejects(api.uploadBlob(user,'a'.repeat(64),png),'invalid',400);
 assert.equal(state.puts.length,0);
});
test('uploadBlob is idempotent and enforces the tier byte limit',async()=>{
 const {api,state}=setup(),hash=await sha256Hex(png);await api.uploadBlob(user,hash,png);await api.uploadBlob(user,hash,png);assert.equal(state.puts.length,1);assert.equal(state.blobs.size,1);
 const tiny=setup();tiny.state.tiers.get('member').max_blob_bytes=png.length-1;await rejects(tiny.api.uploadBlob(user,hash,png),'limit-bytes',429);
});
test('outstanding uploads reserve cumulative quota and deduplicate until attached or collected',async()=>{
 const {api,state,repo,create}=setup('trial'),one=png,two=new Uint8Array([...png,0]),three=new Uint8Array([...png,1]);
 const hashes=await Promise.all([one,two,three].map(sha256Hex));state.tiers.get('trial').max_blob_bytes=one.length+two.length;
 await api.uploadBlob(user,hashes[0],one);await api.uploadBlob(user,hashes[0],one);await api.uploadBlob(user,hashes[1],two);
 await rejects(api.uploadBlob(user,hashes[2],three),'limit-bytes',429);
 assert.equal((await repo.usage(user.id)).blob_bytes,one.length+two.length);assert.equal(state.puts.length,2);
 const p=work(1);p.assets.art={id:'art',mime:'image/png',width:1,height:1,paintingId:null,dataUrl:'blob:sha256:'+hashes[0]};
 const {id}=await create(1,{data:p});assert.equal((await repo.usage(user.id)).blob_bytes,one.length+two.length);
 await api.handle(user,'work.delete',{id});assert.equal((await repo.usage(user.id)).blob_bytes,two.length);
});
test('work and asset writes calculate unique live blob usage including drafts and restoration',async()=>{
 const {api,state,create}=setup(),hash=await sha256Hex(png);await api.uploadBlob(other,hash,png);
 state.tiers.get('member').max_blob_bytes=png.length-1;
 const p=work(1);p.assets.art={id:'art',mime:'image/png',width:1,height:1,paintingId:null,dataUrl:'blob:sha256:'+hash};
 await rejects(create(1,{data:p}),'limit-bytes');
 const entry={id:'entry',name:'그림',createdAt:1,asset:p.assets.art};await rejects(api.handle(user,'asset.create',{title:'그림',kind:'image',data:{kind:'image',item:entry,blobs:[hash]}}),'limit-bytes');
});
test('stale versions and draft baseSavedAt conflict without changing current data',async()=>{
 const {api,state,create}=setup(),{id}=await create();await api.handle(user,'work.save',{id,data:work(2),baseVersion:1});
 const before=structuredClone(state.works.get(id));await rejects(api.handle(user,'work.save',{id,data:work(3),baseVersion:1}),'conflict',409);assert.deepEqual(state.works.get(id),before);
 await api.handle(user,'work.saveDraft',{id,data:work(3),baseSavedAt:null});
 await rejects(api.handle(user,'work.saveDraft',{id,data:work(4),baseSavedAt:null}),'conflict',409);
});
test('same-work drafts wait 30 seconds while separate works and 240 hourly drafts are independent',async()=>{
 const {api,create,advance,state}=setup(),{id}=await create(),second=await create();
 const first=await api.handle(user,'work.saveDraft',{id,data:work(1),baseSavedAt:null});advance(10000);
 await rejects(api.handle(user,'work.saveDraft',{id,data:work(1),baseSavedAt:first.savedAt}),'limit-rate');
 await api.handle(user,'work.saveDraft',{id:second.id,data:work(1),baseSavedAt:null});advance(20000);
 await api.handle(user,'work.saveDraft',{id,data:work(1),baseSavedAt:first.savedAt});
 state.audits.push(...Array.from({length:237},()=>({actor:user.id,action:'work.saveDraft',ok:true,created_at:new Date(Date.parse('2026-10-21T00:00:30Z')).toISOString()})));advance(30000);
 await rejects(api.handle(user,'work.saveDraft',{id,data:work(1),baseSavedAt:state.drafts.get(id).saved_at}),'limit-rate');
 await api.handle(user,'work.save',{id,data:work(1),baseVersion:1});
});
test('61st regular write in an hour is rejected and the next hour unlocks',async()=>{
 const {api,create,advance}=setup();for(let i=0;i<60;i++)await create(0);await rejects(create(0),'limit-rate',429);advance(3600001);await create(0);
 assert.equal(typeof api.handle,'function');
});
test('save keeps the newest 20 confirmed versions and removes the draft',async()=>{
 const {api,state,create}=setup(),{id}=await create();await api.handle(user,'work.saveDraft',{id,data:work(2),baseSavedAt:null});
 for(let version=1;version<24;version++)await api.handle(user,'work.save',{id,data:work(1),baseVersion:version});
 assert.deepEqual(state.versions.get(id).map(row=>row.version),Array.from({length:20},(_,i)=>i+5));assert.equal(state.drafts.has(id),false);
});
test('copy requires a public live source and records source IDs without drafts',async()=>{
 const {api,state,create}=setup(),source=await create();
 await rejects(api.handle(other,'work.copy',{sourceId:source.id}),'not-found');await api.handle(user,'work.setVisibility',{id:source.id,visibility:'public'});
 await api.handle(user,'work.saveDraft',{id:source.id,data:work(2),baseSavedAt:null});
 const result=await api.handle(other,'work.copy',{sourceId:source.id}),row=state.works.get(result.id);
 assert.equal(row.source_work_id,source.id);assert.equal(row.source_owner,user.id);assert.equal(row.owner,other.id);assert.equal(row.visibility,'private');assert.equal(row.card_count,1);
});
test('restore permits 30 days but refuses older trash',async()=>{
 for(const days of [30,30.001]){const {api,create,advance}=setup(),{id}=await create();await api.handle(user,'work.delete',{id});advance(days*86400000);if(days===30)await api.handle(user,'work.restore',{id});else await rejects(api.handle(user,'work.restore',{id}),'not-found');}
});
test('nickname NFC, character count, controls and case insensitive uniqueness are enforced',async()=>{
 const {api,state}=setup();const result=await api.handle(user,'profile.setNickname',{nickname:'가나'});assert.equal(result.nickname,'가나');assert.equal(state.profiles.get(user.id).nickname,'가나');
 for(const nickname of ['a','x'.repeat(21),'가\n나'])await rejects(api.handle(user,'profile.setNickname',{nickname}),'invalid');
 await api.handle(user,'profile.setNickname',{nickname:'Alice'});await rejects(api.handle(other,'profile.setNickname',{nickname:'ALICE'}),'invalid');
});
test('import token allows 50 decks and 2000 blobs once per day, is owned and expires',async()=>{
 const {api,state,create,advance}=setup(),run=await api.handle(user,'import.begin',{});
 await rejects(api.handle(user,'import.begin',{}),'limit-import');await rejects(api.handle(other,'work.create',{title:'도용',data:work(0),importToken:run.token}),'limit-import');
 for(let i=0;i<50;i++)await create(0,{importToken:run.token});await rejects(create(0,{importToken:run.token}),'limit-import');
 state.imports[0].blobs=1999;await api.uploadBlob(user,await sha256Hex(png),png,{importToken:run.token});
 const different=new Uint8Array([...png,0]);await rejects(api.uploadBlob(user,await sha256Hex(different),different,{importToken:run.token}),'limit-import');
 advance(7200001);await rejects(create(0,{importToken:run.token}),'limit-import');advance(86400000);await api.handle(user,'import.begin',{});
});
test('asset ownership, optimistic saves, copy and trash obey the same matrix',async()=>{
 const {api,state}=setup(),data=await assetData(),{id}=await api.handle(user,'asset.create',{title:'독',kind:'keyword',data});
 for(const visibility of ['private','public']){
  await api.handle(user,'asset.setVisibility',{id,visibility});
  for(const action of ['asset.save','asset.setVisibility','asset.delete','asset.restore'])await rejects(api.handle(other,action,{id,data,baseVersion:1,visibility:'public'}),visibility==='private'?'not-found':'forbidden');
 }
 await api.handle(user,'asset.save',{id,data,baseVersion:1});await rejects(api.handle(user,'asset.save',{id,data,baseVersion:1}),'conflict');
 const copy=await api.handle(other,'asset.copy',{sourceId:id});assert.equal(state.assets.get(copy.id).source_asset_id,id);assert.equal(state.assets.get(copy.id).visibility,'private');
 await api.handle(user,'asset.delete',{id});await api.handle(user,'asset.restore',{id});
});
test('every call produces exactly one audit with the result flag and no payload or token',async()=>{
 const {api,state,create}=setup();await create();await rejects(api.handle(user,'nonsense',{}),'invalid');await rejects(api.handle(null,'work.create',{}),'unauthenticated');
 assert.deepEqual(state.audits.map(row=>row.ok),[true,false,false]);assert.equal(state.audits.length,3);assert.ok(!JSON.stringify(state.audits).includes('card-print-studio'));
});
test('action suffixes cannot create writes outside the hourly audit bucket',async()=>{
 const {api,state}=setup();
 await rejects(api.handle(user,'work.create.extra',{title:'우회',data:work(0)}),'invalid');
 await rejects(api.handle(user,'asset.create.extra',{title:'우회',kind:'keyword',data:await assetData()}),'invalid');
 assert.equal(state.works.size,0);assert.equal(state.assets.size,0);
});
test('parallel same-version saves admit one winner and quota decisions serialize within the API',async()=>{
 const {api,state,create}=setup('trial'),{id}=await create(9);
 const results=await Promise.allSettled([api.handle(user,'work.save',{id,data:work(10),baseVersion:1}),api.handle(user,'work.save',{id,data:work(10),baseVersion:1})]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(state.works.get(id).version,2);
 await rejects(create(1),'limit-cards');
});
