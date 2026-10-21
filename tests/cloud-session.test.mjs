import test from 'node:test';
import assert from 'node:assert/strict';
import {createProject} from '../src/model/project.js';
import {createStore} from '../src/model/store.js';
import {toCloudProject} from '../src/cloud/cloud-format.js';
import {createCloudClient,CloudError} from '../src/cloud/client.js';
import {createBlobStore} from '../src/cloud/blobs.js';
import {createCloudSession} from '../src/cloud/session.js';
function clock(){let time=Date.parse('2026-10-21T00:00:00Z'),next=0;const tasks=new Map();return {now:()=>time,setTimer(fn,ms){const id=++next;tasks.set(id,{fn,at:time+ms});return ()=>tasks.delete(id);},async advance(ms){const target=time+ms;for(;;){const due=[...tasks].filter(([,task])=>task.at<=target).sort((a,b)=>a[1].at-b[1].at)[0];if(!due)break;time=due[1].at;tasks.delete(due[0]);await due[1].fn();}time=target;},tasks};}
async function setup(){
 const timer=clock(),store=createStore(createProject()),calls=[],remote={work:{id:'w',owner:'u',version:1,data:(await toCloudProject(createProject())).data},draft:null,blobs:new Map()},faults=new Map();
 const client={async session(){return {user:{id:'u'},accessToken:'token'};},async select(table){return structuredClone(table==='works'?remote.work:remote.draft);},
  async call(action,payload){calls.push({action,payload:structuredClone(payload)});if(faults.has(action)){const error=faults.get(action);faults.delete(action);throw error;}
   if(action==='blob.missing')return {missing:payload.hashes.filter(hash=>!remote.blobs.has(hash))};
   if(action==='work.save'){if(payload.baseVersion!==remote.work.version)throw new CloudError(409,'conflict','다른 곳에서 먼저 저장했어요.');remote.work.data=structuredClone(payload.data);remote.work.version++;remote.draft=null;return {version:remote.work.version};}
   if(action==='work.saveDraft'){const savedAt=new Date(timer.now()).toISOString();remote.draft={data:structuredClone(payload.data),saved_at:savedAt};return {savedAt};}
   if(action==='work.create'){remote.work={id:'copy',owner:'u',version:1,data:structuredClone(payload.data)};remote.draft=null;return {id:'copy',version:1};}
   throw Error('unexpected '+action);
  },async uploadBlob(hash,bytes){calls.push({action:'upload',hash});if(faults.has('upload')){const fn=faults.get('upload');fn(hash);}remote.blobs.set(hash,new Uint8Array(bytes));}
 };
 const blobs=createBlobStore({client,publicBaseUrl:'https://example.test/blobs',fetchImpl:async url=>new Response(remote.blobs.get(url.split('/').at(-1)))});
 const session=createCloudSession({store,client,blobs,now:timer.now,setTimer:timer.setTimer});
 await session.open('w');
 return {timer,store,client,blobs,session,calls,remote,faults,edit:name=>store.edit('이름',p=>p.name=name)};
}
const count=(calls,action)=>calls.filter(call=>call.action===action).length;
test('account read-only cancels delayed writes and can resume after approval',async()=>{
 const x=await setup();try{
  let release;const gate=new Promise(resolve=>release=resolve);x.blobs.ensureUploaded=async()=>gate;x.edit('승인 전');const saving=x.session.save();await new Promise(setImmediate);x.session.setReadOnly();release();await saving.catch(()=>{});
  assert.equal(count(x.calls,'work.save'),0);assert.equal(x.session.state().status,'read-only');x.session.resumeWrites();await x.session.save();assert.equal(count(x.calls,'work.save'),1);assert.equal(x.store.isDirty(),false);
 }finally{x.session.dispose();}
});
test('edits produce at most one draft call per 30 seconds',async()=>{
 const x=await setup();try{x.edit('하나');await x.timer.advance(10000);x.edit('둘');await x.timer.advance(19999);assert.equal(count(x.calls,'work.saveDraft'),0);await x.timer.advance(1);assert.equal(count(x.calls,'work.saveDraft'),1);assert.equal(x.session.state().status,'draft-saved');x.edit('셋');await x.timer.advance(29999);assert.equal(count(x.calls,'work.saveDraft'),1);await x.timer.advance(1);assert.equal(count(x.calls,'work.saveDraft'),2);assert.equal(x.calls.at(-1).payload.baseSavedAt,x.calls.at(-2).payload.baseSavedAt===null?new Date(x.timer.now()-30000).toISOString():null);}finally{x.session.dispose();}
});
test('save uploads blobs before work.save with baseVersion and clears the unsaved flag',async()=>{
 const x=await setup();try{
  const events=[],ensure=x.blobs.ensureUploaded;x.blobs.ensureUploaded=async(...args)=>{events.push('upload');return ensure(...args);};const call=x.client.call;x.client.call=async(...args)=>{events.push(args[0]);return call(...args);};
  x.edit('확정');assert.equal(x.session.state().hasUnsavedDraft,true);assert.deepEqual(await x.session.save(),{version:2});assert.deepEqual(events,['upload','work.save']);assert.equal(x.calls.at(-1).payload.baseVersion,1);assert.equal(x.session.state().hasUnsavedDraft,false);assert.equal(x.store.isDirty(),false);await x.timer.advance(60000);assert.equal(count(x.calls,'work.saveDraft'),0);
 }finally{x.session.dispose();}
});
test('resumes missing blob uploads after a failed save',async()=>{
 const x=await setup();try{
  x.store.edit('그림',p=>{for(const [id,data] of [['a','AQ=='],['b','Ag==']])p.assets[id]={id,mime:'image/png',dataUrl:'data:image/png;base64,'+data,width:1,height:1,paintingId:null};});
  let uploads=0;x.faults.set('upload',()=>{if(++uploads===2){x.faults.delete('upload');throw new CloudError(0,'network','연결 끊김');}});
  await assert.rejects(x.session.save());assert.equal(x.session.state().status,'error');assert.equal(x.remote.blobs.size,1);assert.equal(x.store.isDirty(),true);
  await x.session.save();assert.equal(x.remote.blobs.size,2);assert.equal(count(x.calls,'upload'),3);assert.equal(count(x.calls,'work.save'),1);
 }finally{x.session.dispose();}
});
test('conflict offers load-server and save-as-copy while preserving the local edit until chosen',async()=>{
 const x=await setup();try{
  x.edit('로컬');x.remote.work.version=2;x.remote.work.data.name='서버';await assert.rejects(x.session.save(),e=>e.code==='conflict');assert.equal(x.session.state().status,'conflict');assert.equal(x.store.getProject().name,'로컬');
  await x.session.resolveConflict('load-server');assert.equal(x.store.getProject().name,'서버');assert.equal(x.session.state().version,2);
  x.edit('사본');x.remote.work.version=3;await assert.rejects(x.session.save());await x.session.resolveConflict('save-as-copy');assert.equal(x.session.state().workId,'copy');assert.equal(x.store.getProject().name,'사본');assert.equal(x.session.state().version,1);
 }finally{x.session.dispose();}
});
test('stops autosave and keeps editing and local recovery data after revocation',async()=>{
 const x=await setup();try{x.edit('보관');x.faults.set('work.saveDraft',new CloudError(403,'not-member','승인 해제'));await x.timer.advance(30000);assert.equal(x.session.state().status,'read-only');assert.equal(x.store.isDirty(),true);x.edit('계속 편집');await x.timer.advance(120000);assert.equal(count(x.calls,'work.saveDraft'),1);assert.equal(x.store.getProject().name,'계속 편집');assert.equal(x.store.isDirty(),true);}finally{x.session.dispose();}
});
test('network failure keeps editing and retries on the next edit or after 30 seconds',async()=>{
 const x=await setup();try{x.edit('연결 전');x.faults.set('work.saveDraft',new CloudError(0,'network','오프라인'));await x.timer.advance(30000);assert.equal(x.session.state().status,'error');assert.equal(x.store.isDirty(),true);x.edit('연결 후');await x.timer.advance(0);assert.equal(count(x.calls,'work.saveDraft'),2);assert.equal(x.session.state().status,'draft-saved');x.edit('재시도');x.faults.set('work.saveDraft',new CloudError(0,'network','오프라인'));await x.timer.advance(30000);assert.equal(x.session.state().status,'error');await x.timer.advance(30000);assert.equal(x.session.state().status,'draft-saved');}finally{x.session.dispose();}
});
test('open prefers the draft and marks it dirty until confirmed',async()=>{
 const x=await setup();try{x.remote.draft={data:{...x.remote.work.data,name:'복구 초안'},saved_at:new Date(x.timer.now()-30000).toISOString()};await x.session.open('w');assert.equal(x.store.getProject().name,'복구 초안');assert.equal(x.store.isDirty(),true);assert.equal(x.session.state().hasUnsavedDraft,true);await x.session.save();assert.equal(x.remote.work.data.name,'복구 초안');assert.equal(x.store.isDirty(),false);}finally{x.session.dispose();}
});
test('refreshes expired session once before surfacing a repeated 401',async()=>{
 const timer=clock(),store=createStore(createProject());let attempts=0,refreshes=0;
 const client=createCloudClient({config:{url:'https://example.supabase.co',anonKey:'public'},location:{protocol:'https:'},createSupabase:()=>({auth:{async getSession(){return {data:{session:{user:{id:'u'},access_token:'expired'}}};},async refreshSession(){refreshes++;return {data:{session:{user:{id:'u'},access_token:'new'}}};}}}),fetchImpl:async()=>{attempts++;return new Response(JSON.stringify({ok:false,code:'unauthenticated',message:'로그인 만료'}),{status:401});}});
 const session=createCloudSession({store,client,blobs:{async ensureUploaded(){}},now:timer.now,setTimer:timer.setTimer});try{store.edit('미저장',p=>p.name='유지');await assert.rejects(session.createFromCurrent('유지'));assert.equal(attempts,2);assert.equal(refreshes,1);assert.equal(session.state().status,'error');assert.equal(store.isDirty(),true);}finally{session.dispose();}
});
test('edits during an in-flight save remain dirty and schedule a later draft',async()=>{
 const x=await setup();try{
  let release;const gate=new Promise(resolve=>release=resolve),old=x.blobs.ensureUploaded;x.blobs.ensureUploaded=async(...args)=>{await gate;return old(...args);};
  x.edit('저장할 내용');const saving=x.session.save();await new Promise(setImmediate);x.edit('그 사이 새 내용');release();await saving;
  assert.equal(x.store.isDirty(),true);assert.equal(x.session.state().hasUnsavedDraft,true);assert.equal(x.remote.work.data.name,'저장할 내용');await x.timer.advance(30000);assert.equal(x.remote.draft.data.name,'그 사이 새 내용');
 }finally{x.session.dispose();}
});
test('external deck replacement or disposal prevents delayed writes to the old work',async()=>{
 for(const replacement of ['load','dispose']){const x=await setup();try{let release;const gate=new Promise(resolve=>release=resolve);x.blobs.ensureUploaded=async()=>gate;x.edit('이전 덱');const pending=x.session.save();await new Promise(setImmediate);if(replacement==='load')x.store.load(createProject());else x.session.dispose();release();await pending.catch(()=>{});assert.equal(count(x.calls,'work.save'),0);if(replacement==='load')assert.equal(x.session.state().workId,null);}finally{x.session.dispose();}}
});
test('editing during an in-flight draft still respects the successful-draft interval',async()=>{
 const x=await setup();try{
  let release;const gate=new Promise(resolve=>release=resolve),ensure=x.blobs.ensureUploaded;let first=true;
  x.blobs.ensureUploaded=async(...args)=>{if(first){first=false;await gate;}return ensure(...args);};
  x.edit('첫 초안');const ticking=x.timer.advance(30000);await new Promise(setImmediate);x.edit('다음 초안');release();await ticking;
  assert.equal(count(x.calls,'work.saveDraft'),1);await x.timer.advance(29999);assert.equal(count(x.calls,'work.saveDraft'),1);await x.timer.advance(1);assert.equal(count(x.calls,'work.saveDraft'),2);
 }finally{x.session.dispose();}
});
