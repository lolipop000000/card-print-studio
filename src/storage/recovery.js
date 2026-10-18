import {parseProject,serializeProject} from '../model/project.js';
import {newId} from '../model/types.js';

const FORMAT='card-print-studio-recovery';
function storageError(error){return new Error(error?.name==='QuotaExceededError'?'브라우저 저장 공간이 부족해서 자동 복구본을 갱신하지 못했어요. JSON으로 저장한 뒤 불필요한 복구본을 삭제하세요.':'자동 복구본을 보관하지 못했어요. 브라우저 저장소 접근이 차단되었을 수 있어요. JSON으로 현재 덱을 저장하세요.',{cause:error});}
export function readRecoveryRecord(record){
 if(!record||record.format!==FORMAT||record.version!==1||typeof record.id!=='string'||!record.id||!Number.isFinite(record.updatedAt)||typeof record.text!=='string'||typeof record.dirty!=='boolean')throw Error('복구본의 형식 또는 저장 시간이 올바르지 않아요.');
 return {...record,project:parseProject(record.text)};
}
export function createRecoveryStorage({indexedDB=globalThis.indexedDB}={}){
 async function run(mode,action){
  if(!indexedDB)throw storageError();
  let database;
  try{
   database=await new Promise((resolve,reject)=>{const request=indexedDB.open('card-print-studio-recovery',1);request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains('snapshots'))request.result.createObjectStore('snapshots',{keyPath:'id'});};request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);request.onblocked=()=>reject(Error('복구 저장소가 다른 창에서 사용 중이에요.'));});
   return await new Promise((resolve,reject)=>{const transaction=database.transaction('snapshots',mode),request=action(transaction.objectStore('snapshots'));transaction.oncomplete=()=>resolve(request.result);transaction.onabort=()=>reject(transaction.error||request.error);transaction.onerror=()=>reject(transaction.error||request.error);});
  }catch(error){throw storageError(error);}finally{database?.close();}
 }
 return {list:()=>run('readonly',store=>store.getAll()),put:record=>{readRecoveryRecord(record);return run('readwrite',store=>store.put(record));},remove:id=>run('readwrite',store=>store.delete(id))};
}

// Every tab and every replacement deck owns a separate record. A delayed write
// can only update its own slot; it cannot replace another tab's newer work.
export function createRecoverySession(store,{storage=createRecoveryStorage(),delay=750,id=newId,now=()=>Date.now(),onChange=()=>{}}={}){
 let slot=id(),documentId=store.getDocumentId?.()??0,previous=store.getProject(),pending=null,timer=null,queue=Promise.resolve(),disposed=false,revision=0;
 let state={status:'idle',updatedAt:null,error:null,candidateCount:0};
 const publish=patch=>{state={...state,...patch};if(!disposed)onChange({...state});};
 function capture(){return {format:FORMAT,version:1,id:slot,updatedAt:now(),dirty:store.isDirty(),text:serializeProject(store.getProject())};}
 async function list(){await queue;const records=await storage.list();return records.filter(record=>record?.id!==slot).map(record=>{try{return readRecoveryRecord(record);}catch(error){return {id:record?.id,updatedAt:record?.updatedAt||0,error:error.message};}}).sort((a,b)=>b.updatedAt-a.updatedAt);}
 const ready=list().then(entries=>{publish({candidateCount:entries.length});return entries;},error=>{publish({status:'error',error:error.message});return [];});
 function flush(){
  clearTimeout(timer);timer=null;if(!pending&&state.status==='error')pending=capture();if(!pending)return queue;
  const record=pending,attempt=++revision;pending=null;publish({status:'saving',error:null});
  const result=queue.then(()=>storage.put(record)).then(()=>{if(attempt===revision)publish({status:'saved',updatedAt:record.updatedAt,error:null});return record;},error=>{const next=error.message?.includes('복구')?error:storageError(error);if(attempt===revision){if(!pending&&record.id===slot)pending=record;publish({status:'error',error:next.message});}throw next;});queue=result.catch(()=>{});return result;
 }
 const unsubscribe=store.subscribe(()=>{
  const current=store.getProject();if(current===previous)return;previous=current;
  const nextDocument=store.getDocumentId?.()??documentId;if(nextDocument!==documentId){
   // The pending record still contains the previous document, even though the
   // store already points at its replacement. Enqueue it before changing slots.
   if(pending)flush().catch(()=>{});documentId=nextDocument;slot=id();
   list().then(entries=>publish({candidateCount:entries.length})).catch(error=>publish({status:'error',error:error.message}));
  }
  // A previous write may finish while this revision is still debouncing.
  // Only a write of the latest snapshot can announce that recovery is saved.
  revision++;
  try{pending=capture();clearTimeout(timer);timer=setTimeout(()=>{flush().catch(()=>{});},delay);publish({status:'pending',error:null});}catch(error){publish({status:'error',error:error.message});}
 });
 return {ready,list,flush,getState:()=>({...state}),async read(id){const record=(await storage.list()).find(r=>r.id===id);if(!record)throw Error('선택한 복구본이 삭제되었어요. 목록을 다시 열어 주세요.');return readRecoveryRecord(record);},async remove(id){if(id===slot)throw Error('현재 편집 중인 복구본은 삭제할 수 없어요.');await queue;await storage.remove(id);const entries=await list();publish({candidateCount:entries.length});},destroy(){if(disposed)return;unsubscribe();clearTimeout(timer);flush().catch(()=>{});disposed=true;}};
}
