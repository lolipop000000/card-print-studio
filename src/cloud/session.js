import {toCloudProject,fromCloudProject} from './cloud-format.js';
import {CloudError} from './client.js';

export function createCloudSession({store,client,blobs,now=Date.now,setTimer=(fn,ms)=>setTimeout(fn,ms),draftIntervalMs=30000}){
 let current={workId:null,status:'idle',version:null,draftSavedAt:null,hasUnsavedDraft:false,error:null,viewing:false};
 let epoch=0,disposed=false,muted=false,cancelTimer=null,queue=Promise.resolve(),identity,accountBlocked=false;
 let documentId=store.getDocumentId(),observed=store.getProject(),lastDraftProject=observed,lastDraftTime=now();
 const listeners=new Set();
 const emit=patch=>{if(disposed)return;current={...current,...patch};for(const fn of listeners)fn({...current});};
 const cancel=()=>{cancelTimer?.();cancelTimer=null;};
 const enqueue=fn=>{const job=queue.catch(()=>{}).then(fn);queue=job;return job;};
 const stale=()=>new CloudError(0,'stale','다른 작업으로 바뀌어 이전 저장을 중단했어요.');
 const assertCurrent=token=>{if(disposed||epoch!==token||store.getDocumentId()!==documentId)throw stale();};
 function blockAccount(){
  epoch++;cancel();accountBlocked=true;
  emit({workId:null,version:null,draftSavedAt:null,status:'read-only',hasUnsavedDraft:store.isDirty(),error:new CloudError(0,'account-changed','계정이 바뀌어 이 덱의 저장을 중지했어요. 내 작업을 열거나 새 덱을 만들어 계속하세요. 편집 내용은 이 기기에 남아 있어요.')});
 }
 function setIdentity(next){
  if(disposed||identity===next)return;
  const previous=identity;identity=next;
  if(previous!==undefined&&previous!==null)blockAccount();
 }
 async function guard(token){const auth=await client.session();setIdentity(auth?.user.id??null);assertCurrent(token);return auth?.user.id??null;}
 const writable=()=>current.workId&&!['read-only','conflict'].includes(current.status)&&!disposed;
 function errorState(error,token){
  if(disposed||token!==epoch||error.code==='stale')return;
  if(error.code==='account-changed'){blockAccount();return;}
  const status=error.code==='not-member'?'read-only':error.code==='conflict'?'conflict':'error';
  emit({status,error,hasUnsavedDraft:store.isDirty()||current.hasUnsavedDraft});
  if(status==='error')schedule(draftIntervalMs);
 }
 function schedule(delay){
  if(!writable()||cancelTimer||observed===lastDraftProject&&current.status!=='error')return;
  const wait=delay??Math.max(0,lastDraftTime+draftIntervalMs-now());
  const handle=setTimer(()=>{cancelTimer=null;return enqueue(()=>writeDraft()).catch(()=>{});},wait);
  cancelTimer=typeof handle==='function'?handle:()=>clearTimeout(handle);
 }
 async function encoded(snapshot,token,owner){
  const result=await toCloudProject(snapshot);await guard(token);
  await blobs.ensureUploaded(result.blobs,{expectedUserId:owner});await guard(token);return result.data;
 }
 async function writeDraft(){
  if(!writable()||observed===lastDraftProject&&current.status!=='error')return;
  const remaining=lastDraftTime+draftIntervalMs-now();
  if(remaining>0){schedule(remaining);return;}
  const token=epoch,snapshot=store.getProject(),id=current.workId,baseSavedAt=current.draftSavedAt;
  emit({status:'draft-saving',error:null});
  try{
   const owner=await guard(token),data=await encoded(snapshot,token,owner),result=await client.call('work.saveDraft',{id,data,baseSavedAt},{expectedUserId:owner});await guard(token);
   lastDraftTime=now();lastDraftProject=snapshot;
   emit({status:'draft-saved',draftSavedAt:result.savedAt,hasUnsavedDraft:true,error:null});schedule();
  }catch(error){errorState(error,token);throw error;}
 }
 function markConfirmed(snapshot){
  muted=true;try{store.markSaved(snapshot);}finally{muted=false;}
  observed=store.getProject();lastDraftProject=snapshot;lastDraftTime=now();
  emit({status:'saved',draftSavedAt:null,hasUnsavedDraft:store.isDirty(),error:null});schedule();
 }
 async function create(title,token=epoch){
  assertCurrent(token);if(accountBlocked)throw current.error;
  const snapshot=store.getProject();cancel();emit({status:'saving',error:null});
  try{
   const owner=await guard(token),data=await encoded(snapshot,token,owner),result=await client.call('work.create',{title,data},{expectedUserId:owner});await guard(token);
   emit({workId:result.id,version:result.version,viewing:false});markConfirmed(snapshot);return result.id;
  }catch(error){errorState(error,token);throw error;}
 }
 async function open(id){
  if(disposed)throw stale();const token=++epoch,before=store.getProject(),beforeId=store.getDocumentId();cancel();
  return enqueue(async()=>{
   try{
    const owner=await guard(token);
    const work=await client.select('works',{eq:{id},single:true});
    if(!work||work.deleted_at)throw new CloudError(404,'not-found','찾을 수 없거나 볼 수 없는 항목이에요.');
    await guard(token);const own=work.owner===owner;
    const draft=own?await client.select('work_drafts',{eq:{work_id:id},single:true}):null;
    const project=await fromCloudProject(draft?.data??work.data,hash=>blobs.fetch(hash));
    await guard(token);
    if(disposed||token!==epoch||store.getProject()!==before||store.getDocumentId()!==beforeId)throw stale();
    muted=true;try{store.load(project,{dirty:!!draft});}finally{muted=false;}
    documentId=store.getDocumentId();accountBlocked=false;observed=store.getProject();lastDraftProject=observed;lastDraftTime=draft?Date.parse(draft.saved_at):now();
    emit({workId:id,version:work.version,draftSavedAt:draft?.saved_at??null,hasUnsavedDraft:!!draft,viewing:!own,status:!own?'read-only':draft?'draft-saved':'saved',error:null});
   }catch(error){errorState(error,token);throw error;}
  });
 }
 const unsubscribe=store.subscribe(()=>{
  if(muted||disposed)return;
  if(store.getDocumentId()!==documentId){
   epoch++;cancel();accountBlocked=false;documentId=store.getDocumentId();observed=store.getProject();lastDraftProject=observed;lastDraftTime=now();
   emit({workId:null,status:'idle',version:null,draftSavedAt:null,hasUnsavedDraft:false,error:null,viewing:false});return;
  }
  if(observed===store.getProject())return;
  observed=store.getProject();emit({hasUnsavedDraft:!!current.workId});
  if(current.status==='error'){cancel();schedule(0);}else schedule();
 });
 const stopAuth=client.onAuthChange?.(auth=>setIdentity(auth?.user.id??null));
 return {
  open,
  setIdentity,
  createFromCurrent(title){const token=epoch;return enqueue(()=>create(title,token));},
  save(){const token=epoch;cancel();return enqueue(async()=>{
   assertCurrent(token);await guard(token);
   if(current.status==='read-only')throw current.error??new CloudError(403,'not-member','이 작업은 클라우드에 저장할 수 없어요.');
   if(current.status==='conflict')throw current.error;
   if(!current.workId){await create(store.getProject().name,token);return {version:current.version};}
   const snapshot=store.getProject(),id=current.workId,baseVersion=current.version;emit({status:'saving',error:null});
   try{
    const data=await encoded(snapshot,token,identity),result=await client.call('work.save',{id,data,baseVersion},{expectedUserId:identity});await guard(token);
    emit({version:result.version});markConfirmed(snapshot);return result;
   }catch(error){errorState(error,token);throw error;}
  });},
  state:()=>({...current}),
  onChange(fn){listeners.add(fn);return ()=>listeners.delete(fn);},
  async resolveConflict(choice){
   if(current.status!=='conflict')return;
   const id=current.workId;
   try{
    if(choice==='load-server')return await open(id);
    if(choice==='save-as-copy')return await enqueue(()=>create(store.getProject().name));
    throw new CloudError(400,'invalid','서버 내용 불러오기 또는 사본 저장을 선택하세요.');
   }catch(error){if(current.workId===id&&current.status==='error'){cancel();emit({status:'conflict',error});}throw error;}
  },
  setReadOnly(error=new CloudError(403,'not-member','관리자 승인 후 저장과 공유를 쓸 수 있어요.')){epoch++;cancel();if(!accountBlocked)emit({status:'read-only',error});},
  resumeWrites(){if(!accountBlocked&&current.status==='read-only'&&current.error?.code==='not-member'){emit({status:current.workId?(current.draftSavedAt?'draft-saved':'saved'):'idle',error:null});schedule();}},
  dispose(){if(disposed)return;disposed=true;epoch++;cancel();unsubscribe();stopAuth?.();listeners.clear();}
 };
}
