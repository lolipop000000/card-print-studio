import {toCloudProject,fromCloudProject} from './cloud-format.js';
import {CloudError} from './client.js';

export function createCloudSession({store,client,blobs,now=Date.now,setTimer=(fn,ms)=>setTimeout(fn,ms),draftIntervalMs=30000}){
 let current={workId:null,status:'idle',version:null,draftSavedAt:null,hasUnsavedDraft:false,error:null,viewing:false};
 let epoch=0,disposed=false,muted=false,cancelTimer=null,queue=Promise.resolve();
 let documentId=store.getDocumentId(),observed=store.getProject(),lastDraftProject=observed,lastDraftTime=now();
 const listeners=new Set();
 const emit=patch=>{if(disposed)return;current={...current,...patch};for(const fn of listeners)fn({...current});};
 const cancel=()=>{cancelTimer?.();cancelTimer=null;};
 const enqueue=fn=>{const job=queue.catch(()=>{}).then(fn);queue=job;return job;};
 const stale=()=>new CloudError(0,'stale','다른 작업으로 바뀌어 이전 저장을 중단했어요.');
 const assertCurrent=token=>{if(disposed||epoch!==token||store.getDocumentId()!==documentId)throw stale();};
 const writable=()=>current.workId&&!['read-only','conflict'].includes(current.status)&&!disposed;
 function errorState(error,token){
  if(disposed||token!==epoch||error.code==='stale')return;
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
 async function encoded(snapshot,token){
  const result=await toCloudProject(snapshot);assertCurrent(token);
  await blobs.ensureUploaded(result.blobs);assertCurrent(token);return result.data;
 }
 async function writeDraft(){
  if(!writable()||observed===lastDraftProject&&current.status!=='error')return;
  const remaining=lastDraftTime+draftIntervalMs-now();
  if(remaining>0){schedule(remaining);return;}
  const token=epoch,snapshot=store.getProject(),id=current.workId,baseSavedAt=current.draftSavedAt;
  emit({status:'draft-saving',error:null});
  try{
   const data=await encoded(snapshot,token),result=await client.call('work.saveDraft',{id,data,baseSavedAt});assertCurrent(token);
   lastDraftTime=now();lastDraftProject=snapshot;
   emit({status:'draft-saved',draftSavedAt:result.savedAt,hasUnsavedDraft:true,error:null});schedule();
  }catch(error){errorState(error,token);throw error;}
 }
 function markConfirmed(snapshot){
  muted=true;try{store.markSaved(snapshot);}finally{muted=false;}
  observed=store.getProject();lastDraftProject=snapshot;lastDraftTime=now();
  emit({status:'saved',draftSavedAt:null,hasUnsavedDraft:store.isDirty(),error:null});schedule();
 }
 async function create(title){
  const token=epoch,snapshot=store.getProject();cancel();emit({status:'saving',error:null});
  try{
   const data=await encoded(snapshot,token),result=await client.call('work.create',{title,data});assertCurrent(token);
   emit({workId:result.id,version:result.version,viewing:false});markConfirmed(snapshot);return result.id;
  }catch(error){errorState(error,token);throw error;}
 }
 async function open(id){
  if(disposed)throw stale();const token=++epoch,before=store.getProject(),beforeId=store.getDocumentId();cancel();
  return enqueue(async()=>{
   try{
    const work=await client.select('works',{eq:{id},single:true});
    if(!work||work.deleted_at)throw new CloudError(404,'not-found','찾을 수 없거나 볼 수 없는 항목이에요.');
    const user=await client.session(),own=work.owner===user?.user.id;
    const draft=own?await client.select('work_drafts',{eq:{work_id:id},single:true}):null;
    const project=await fromCloudProject(draft?.data??work.data,hash=>blobs.fetch(hash));
    if(disposed||token!==epoch||store.getProject()!==before||store.getDocumentId()!==beforeId)throw stale();
    muted=true;try{store.load(project,{dirty:!!draft});}finally{muted=false;}
    documentId=store.getDocumentId();observed=store.getProject();lastDraftProject=observed;lastDraftTime=draft?Date.parse(draft.saved_at):now();
    emit({workId:id,version:work.version,draftSavedAt:draft?.saved_at??null,hasUnsavedDraft:!!draft,viewing:!own,status:!own?'read-only':draft?'draft-saved':'saved',error:null});
   }catch(error){errorState(error,token);throw error;}
  });
 }
 const unsubscribe=store.subscribe(()=>{
  if(muted||disposed)return;
  if(store.getDocumentId()!==documentId){
   epoch++;cancel();documentId=store.getDocumentId();observed=store.getProject();lastDraftProject=observed;lastDraftTime=now();
   emit({workId:null,status:'idle',version:null,draftSavedAt:null,hasUnsavedDraft:false,error:null,viewing:false});return;
  }
  if(observed===store.getProject())return;
  observed=store.getProject();emit({hasUnsavedDraft:!!current.workId});
  if(current.status==='error'){cancel();schedule(0);}else schedule();
 });
 return {
  open,
  createFromCurrent:title=>enqueue(()=>create(title)),
  save(){cancel();return enqueue(async()=>{
   if(disposed)throw stale();
   if(current.status==='read-only')throw current.error??new CloudError(403,'not-member','이 작업은 클라우드에 저장할 수 없어요.');
   if(current.status==='conflict')throw current.error;
   if(!current.workId){await create(store.getProject().name);return {version:current.version};}
   const token=epoch,snapshot=store.getProject(),id=current.workId,baseVersion=current.version;emit({status:'saving',error:null});
   try{
    const data=await encoded(snapshot,token),result=await client.call('work.save',{id,data,baseVersion});assertCurrent(token);
    emit({version:result.version});markConfirmed(snapshot);return result;
   }catch(error){errorState(error,token);throw error;}
  });},
  state:()=>({...current}),
  onChange(fn){listeners.add(fn);return ()=>listeners.delete(fn);},
  async resolveConflict(choice){
   if(current.status!=='conflict')return;
   if(choice==='load-server')return open(current.workId);
   if(choice==='save-as-copy')return enqueue(()=>create(store.getProject().name));
   throw new CloudError(400,'invalid','서버 내용 불러오기 또는 사본 저장을 선택하세요.');
  },
  setReadOnly(error=new CloudError(403,'not-member','관리자 승인 후 저장과 공유를 쓸 수 있어요.')){epoch++;cancel();emit({status:'read-only',error});},
  resumeWrites(){if(current.status==='read-only'&&current.error?.code==='not-member'){emit({status:current.workId?(current.draftSavedAt?'draft-saved':'saved'):'idle',error:null});schedule();}},
  dispose(){if(disposed)return;disposed=true;epoch++;cancel();unsubscribe();listeners.clear();}
 };
}
