import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {cloudFixture,must} from './helpers.mjs';
import {createProject,createCard} from '../../src/model/project.js';
import {createVisualEffects,makeVisualEffectLayer} from '../../src/model/visual-effects.js';

let f;
const project=(count=1)=>{const p=createProject();p.cards=Array.from({length:count},()=>createCard('monster',p));return p;};
const keyword=()=>({kind:'keyword',item:{id:'poison',name:'독',description:'피해',color:'#113355',iconAssetId:null},blobs:[]});
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
function uniquePng(base){
 const data=Buffer.from(`test\0${randomUUID()}`),chunk=Buffer.alloc(data.length+12);chunk.writeUInt32BE(data.length);chunk.write('tEXt',4);data.copy(chunk,8);
 let crc=0xffffffff;for(const byte of chunk.subarray(4,-4)){crc^=byte;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}
 chunk.writeUInt32BE((crc^0xffffffff)>>>0,chunk.length-4);return Buffer.concat([base.subarray(0,-12),chunk,base.subarray(-12)]);
}
before(async()=>{
 f=await cloudFixture();
 f.png=uniquePng(f.png);f.hashes.push(hash(f.png));
 must(await f.admin.from('work_drafts').delete().in('owner',f.userIds),'clear seeded drafts for API actions');
 must(await f.admin.from('import_runs').delete().in('owner',f.userIds),'clear seeded import run for API actions');
 for(const id of [f.publicWork.id,f.privateWork.id])must(await f.admin.from('works').update({data:project()}).eq('id',id),'valid API source work');
 must(await f.admin.from('shared_assets').update({kind:'keyword',data:keyword()}).in('id',[f.publicAsset.id,f.privateAsset.id]),'valid API source assets');
});
after(async()=>{if(f){await f.admin.storage.from('blobs').remove([hash(f.png)]);await f.dispose();}});
function member(){return f.roles.find(role=>role.name==='member');}
async function request(role,action,payload={},options={}){
 const url=new URL('/functions/v1/api',f.config.url),headers={apikey:f.config.anonKey,Origin:options.origin??'http://localhost:4173'};
 if(role)headers.Authorization=`Bearer ${role.session.access_token}`;
 if(options.token!==undefined)headers.Authorization=`Bearer ${options.token}`;
 let body;
 if(options.bytes){url.searchParams.set('action','blob.upload');url.searchParams.set('sha',options.sha??hash(options.bytes));headers['Content-Type']='image/png';body=options.bytes;}
 else{headers['Content-Type']='application/json';body=options.raw??JSON.stringify({action,payload});}
 const response=await fetch(url,{method:'POST',headers,body,redirect:'error',signal:AbortSignal.timeout(30000)});
 const json=await response.json();return {status:response.status,body:json,headers:response.headers};
}
function expect(result,status,code,label='HTTP API'){
 assert.equal(result.status,status,`${label}: ${result.body?.code??result.body?.message}`);
 if(status===200)assert.equal(result.body.ok,true,label);else{assert.equal(result.body.ok,false,label);assert.equal(result.body.code,code,label);}
 return result.body.result;
}
const ok=async(role,action,payload,options)=>expect(await request(role,action,payload,options),200);
test('keyword effect recipes and sprite dependencies survive sharing and invalid recipes are rejected',async()=>{
 const role=member(),sha=hash(f.png),recipe=createVisualEffects();recipe.layers=[makeVisualEffectLayer('heatHaze'),makeVisualEffectLayer('sprite',{params:{shape:'image',assetId:'spark'}})];
 await ok(role,'blob.upload',{}, {bytes:f.png});
 const data={...keyword(),item:{...keyword().item,visualEffects:recipe},assets:{spark:{id:'spark',mime:'image/png',width:1,height:1,paintingId:null,dataUrl:'blob:sha256:'+sha}},paintings:{},blobs:[sha]};
 const created=await ok(role,'asset.create',{title:'이글거리는 키워드',kind:'keyword',data});await ok(role,'asset.setVisibility',{id:created.id,visibility:'public'});
 const copy=await ok(f.source,'asset.copy',{sourceId:created.id}),copied=must(await f.source.client.from('shared_assets').select('data,blob_refs').eq('id',copy.id).single(),'copied keyword effects');
 assert.deepEqual(copied.data,data);assert.deepEqual(copied.blob_refs,[sha]);
 const invalid=structuredClone(data);invalid.item.visualEffects.layers[0].opacity=2;
 expect(await request(role,'asset.create',{title:'잘못된 이펙트',kind:'keyword',data:invalid}),400,'invalid');
 const deck=project();deck.keywords=[invalid.item];deck.assets=data.assets;
 expect(await request(role,'work.create',{title:'잘못된 키워드 포함',data:deck}),400,'invalid');
});
test('trial pending image uploads cannot bypass the cumulative 15 MiB quota',async()=>{
 const role=f.roles.find(role=>role.name==='trial'),images=[0,1].map(()=>Buffer.concat([uniquePng(f.png),Buffer.alloc(8*1024*1024)])),hashes=images.map(hash);f.hashes.push(...hashes);
 try{expect(await request(role,'blob.upload',{}, {bytes:images[0]}),200);expect(await request(role,'blob.upload',{}, {bytes:images[1]}),429,'limit-bytes');}
 finally{await f.admin.storage.from('blobs').remove(hashes);must(await f.admin.from('blobs').delete().in('sha256',hashes),'clean quota upload metadata');}
});

test('full permission matrix over HTTP',async()=>{
 const expected={anon:[401,'unauthenticated'],pending:[403,'not-member'],revoked:[403,'not-member'],trial:[200],memberA:[200],memberB:[200]};
 const roles={anon:null,pending:f.roles[0],revoked:f.roles[1],trial:f.roles[2],memberA:member(),memberB:f.source};
 for(const [name,role]of Object.entries(roles)){
  const own=role===f.source?f.privateWork:f.own[role?.name],id=own?.id??randomUUID();let assetId=randomUUID();
  const calls=[
   ['profile.setNickname',()=>({nickname:`친구${name}${randomUUID().slice(0,4)}`})],
   ['work.create',()=>({title:'행렬 새 작업',data:project()})],
   ['work.saveDraft',()=>({id,data:project(),baseSavedAt:null})],
   ['work.save',()=>({id,data:project(),baseVersion:1})],
   ['work.setVisibility',()=>({id,visibility:'public'})],
   ['work.copy',()=>({sourceId:f.publicWork.id})],
   ['work.delete',()=>({id})],['work.restore',()=>({id})],
   ['blob.missing',()=>({hashes:[]})],
   ['asset.create',()=>({title:'행렬 키워드',kind:'keyword',data:keyword()})],
   ['asset.save',()=>({id:assetId,data:keyword(),baseVersion:1})],
   ['asset.setVisibility',()=>({id:assetId,visibility:'public'})],
   ['asset.copy',()=>({sourceId:f.publicAsset.id})],
   ['asset.delete',()=>({id:assetId})],['asset.restore',()=>({id:assetId})],
   ['import.begin',()=>({})]
  ];
  for(const [action,payload]of calls){
   const result=expect(await request(role,action,payload()),expected[name][0],expected[name][1],`${name} ${action}`);
   if(action==='asset.create'&&result)assetId=result.id;
  }
  expect(await request(role,'blob.upload',{}, {bytes:f.png}),expected[name][0],expected[name][1],`${name} blob.upload`);
 }
 // Appendix B distinguishes another person's hidden row (404) from public mutation (403).
 for(const role of [f.roles[2],member()])for(const [visibility,status,code]of [['private',404,'not-found'],['public',403,'forbidden']]){
  must(await f.admin.from('works').update({visibility}).eq('id',f.privateWork.id),'foreign fixture visibility');
  for(const action of ['work.save','work.saveDraft','work.setVisibility','work.delete','work.restore'])expect(await request(role,action,{id:f.privateWork.id,data:project(),baseVersion:2,baseSavedAt:null,visibility:'public'}),status,code,action);
  must(await f.admin.from('shared_assets').update({visibility}).eq('id',f.privateAsset.id),'foreign asset visibility');
  for(const action of ['asset.save','asset.setVisibility','asset.delete','asset.restore'])expect(await request(role,action,{id:f.privateAsset.id,data:keyword(),baseVersion:1,visibility:'public'}),status,code,action);
  if(visibility==='private'){expect(await request(role,'work.copy',{sourceId:f.privateWork.id}),404,'not-found');expect(await request(role,'asset.copy',{sourceId:f.privateAsset.id}),404,'not-found');}
 }
});

test('malicious inputs over HTTP',async()=>{
 const role=member();
 expect(await request(role,'work.create',{title:'위조 인증',data:project()},{token:'not-a-valid-user-token'}),401,'unauthenticated');
 for(const bytes of [Buffer.from('<svg onload="alert(1)"/>'),Buffer.concat([f.png.subarray(0,8),Buffer.from('<html>fake PNG</html>')])])expect(await request(role,'blob.upload',{}, {bytes}),400,'invalid');
 expect(await request(role,'work.create',{}, {raw:JSON.stringify({action:'work.create',payload:{title:'너무 큼',data:'x'.repeat(9*1024*1024)}})}),400,'invalid');
 expect(await request(role,'work.create',{}, {raw:'{"action":"work.create","payload":{"title":"금지","data":{"__proto__":{"polluted":true}}}}'}),400,'invalid');
 const bad=project();bad.cards[0].baseHp=-1;expect(await request(role,'work.create',{title:'잘못된 HP',data:bad}),400,'invalid');
 expect(await request(role,'work.delete',{id:'not-a-uuid'}),404,'not-found');
 expect(await request(role,'work.delete',{id:randomUUID()}),404,'not-found');
 expect(await request(role,'work.create',{title:'출처 위장',data:project(121),owner:f.source.id,card_count:0,status:'member'}),429,'limit-cards');
 expect(await request(role,'work.create',{title:'출처 위장',data:project()},{origin:'https://attacker.example'}),403,'forbidden');
 assert.equal({}.polluted,undefined);
});

test('revoking a member blocks the very next write',async()=>{
 const role=member();await ok(role,'work.create',{title:'승인 중',data:project()});
 must(await f.admin.from('profiles').update({status:'revoked'}).eq('id',role.id),'revoke member');
 expect(await request(role,'work.create',{title:'해제 후',data:project()}),403,'not-member');
 must(await f.admin.from('profiles').update({status:'member'}).eq('id',role.id),'restore member role');
});

test('end to end: create → upload blobs → save → publish → anon reads feed and work → copy by memberB',async()=>{
 const a=member(),b=f.source,p=project(),created=await ok(a,'work.create',{title:'왕복 작업',data:p}),sha=hash(f.png);
 await ok(a,'blob.upload',{}, {bytes:f.png});
 p.assets.art={id:'art',mime:'image/png',width:1,height:1,paintingId:null,dataUrl:'blob:sha256:'+sha};p.cards[0].artAssetId='art';
 const saved=await ok(a,'work.save',{id:created.id,data:p,baseVersion:1});assert.equal(saved.version,2);
 await ok(a,'work.setVisibility',{id:created.id,visibility:'public'});
 const rows=must(await f.anon.from('works').select('*').eq('id',created.id),'anon public work');assert.deepEqual(rows[0].data,p);assert.deepEqual(rows[0].blob_refs,[sha]);
 assert.equal(must(await f.anon.from('public_feed').select('item_id').eq('item_id',created.id),'anon public feed').length,1);
 const copy=await ok(b,'work.copy',{sourceId:created.id}),row=must(await b.client.from('works').select('*').eq('id',copy.id).single(),'private copy');
 assert.equal(row.visibility,'private');assert.equal(row.owner,b.id);assert.equal(row.source_work_id,created.id);assert.deepEqual(row.data,p);
 const blob=await fetch(`${f.config.url}/storage/v1/object/public/blobs/${sha}`);assert.equal(blob.status,200);assert.equal(hash(new Uint8Array(await blob.arrayBuffer())),sha);
});

test('concurrent HTTP saves preserve one winner and atomic quota checks',async()=>{
 const role=member(),created=await ok(role,'work.create',{title:'동시 저장',data:project()});
 const saves=await Promise.all([request(role,'work.save',{id:created.id,data:project(2),baseVersion:1}),request(role,'work.save',{id:created.id,data:project(3),baseVersion:1})]);
 assert.deepEqual(saves.map(result=>result.status).sort(),[200,409]);
 const trial=f.roles[2],used=must(await trial.client.rpc('my_usage'),'trial usage')[0].cards;
 const count=10-used;assert.ok(count>=0);
 if(count)await ok(trial,'work.create',{title:'한도 직전',data:project(count-1)});
 const concurrent=await Promise.all([request(trial,'work.create',{title:'동시 A',data:project()}),request(trial,'work.create',{title:'동시 B',data:project()})]);
 assert.deepEqual(concurrent.map(result=>result.status).sort(),[200,429]);
 assert.equal(must(await trial.client.rpc('my_usage'),'final trial usage')[0].cards,10);
});

test('draft timestamps from REST and API compare as the same instant',async()=>{
 const role=member(),created=await ok(role,'work.create',{title:'초안 시간',data:project()});
 await ok(role,'work.saveDraft',{id:created.id,data:project(),baseSavedAt:null});
 const first=must(await role.client.from('work_drafts').select('saved_at').eq('work_id',created.id).single(),'REST draft');
 // Move the existing stamp back so this checks its spelling, independently of the 30-second rate rule.
 const base=new Date(Date.now()-31000).toISOString();must(await f.admin.from('work_drafts').update({saved_at:base}).eq('work_id',created.id),'older draft');
 const row=must(await role.client.from('work_drafts').select('saved_at').eq('work_id',created.id).single(),'REST draft stamp');
 assert.ok(first.saved_at);await ok(role,'work.saveDraft',{id:created.id,data:project(2),baseSavedAt:row.saved_at});
});

test('rejected HTTP writes leave exactly one audit entry without request data',async()=>{
 const role=f.roles[0],before=must(await f.admin.from('audit_log').select('id').eq('actor',role.id),'audit before').length;
 expect(await request(role,'work.create',{title:'감사 기록에 넣지 않을 내용',data:project()}),403,'not-member');
 const rows=must(await f.admin.from('audit_log').select('*').eq('actor',role.id),'audit after');
 assert.equal(rows.length,before+1);assert.equal(rows.at(-1).ok,false);
 assert.equal(JSON.stringify(rows).includes('감사 기록에 넣지 않을 내용'),false);
});
