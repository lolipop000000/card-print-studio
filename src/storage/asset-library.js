import {createAssetLibrary,parseAssetLibrary,serializeAssetLibrary} from '../model/asset-library.js';
const defaultCodec={create:createAssetLibrary,parse:parseAssetLibrary,serialize:serializeAssetLibrary};

const CACHE_LOCATION='브라우저 임시 보관함';
const CACHE_FORMAT='card-print-studio-asset-library-cache';
const withCode=(code,message,cause)=>Object.assign(new Error(message,{cause}),{code});
function cacheError(error){
 return withCode('asset-cache-failed',error?.name==='QuotaExceededError'?'브라우저 저장 공간이 부족해서 에셋 보관함을 임시 보관하지 못했어요. 보관함 JSON을 내보내거나 저장 폴더를 연결하세요.':'브라우저 저장소에서 에셋 보관함을 읽거나 보관하지 못했어요. 저장소 사용을 허용하거나 보관함 JSON과 저장 폴더를 이용하세요.',error);
}
/** Separate from deck recovery and folder-handle databases: shared by all decks. */
export function createAssetLibraryPersistence({indexedDB=globalThis.indexedDB}={}){
 async function run(mode,key,value){
  if(!indexedDB)throw cacheError();let database;
  try{
   database=await new Promise((resolve,reject)=>{
    const request=indexedDB.open('card-print-studio-asset-library',1);
    request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains('libraries'))request.result.createObjectStore('libraries');};
    request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
    request.onblocked=()=>reject(Error('다른 창에서 에셋 저장소를 사용하고 있어요.'));
   });
   return await new Promise((resolve,reject)=>{
    const transaction=database.transaction('libraries',mode),store=transaction.objectStore('libraries'),request=mode==='readonly'?store.get(key):store.put(value,key);
    transaction.oncomplete=()=>resolve(request.result);
    transaction.onabort=()=>reject(transaction.error||request.error||Error('에셋 저장이 취소되었어요.'));
    transaction.onerror=()=>reject(transaction.error||request.error);
   });
  }catch(error){throw error?.code==='asset-cache-failed'?error:cacheError(error);}finally{database?.close();}
 }
 return {get:key=>run('readonly',key),set:(key,text)=>run('readwrite',key,text)};
}

export function createAssetLibraryStorage({workspace,indexedDB=globalThis.indexedDB,persistence=createAssetLibraryPersistence({indexedDB}),key='shared-library:v1',codec}={}){
 const createAssetLibrary=codec?.create??defaultCodec.create,parseAssetLibrary=codec?.parse??defaultCodec.parse,serializeAssetLibrary=codec?.serialize??defaultCodec.serialize;
 let state={mode:'temporary',location:CACHE_LOCATION,message:'브라우저에 임시 보관해요. 폴더를 연결하면 에셋 보관함을 별도로 저장할 수 있어요.',pending:false};
 let queue=Promise.resolve(),disposed=false,epoch=0,baseline=null,recovery=null,recoveryBlock=null,cacheChecked=false,cacheUnknown=false;
 const listeners=new Set(),getState=()=>({...state});
 const workspaceState=()=>workspace?.getState?.()??{connected:false};
 const identity=()=>{const value=workspaceState();return JSON.stringify([value.connected===true,value.connectionId??null,value.folderName??null,value.assetsPath??null]);};
 let lastIdentity=identity();
 function publish(patch){if(disposed)return;state={...state,...patch};for(const fn of listeners){try{fn(getState());}catch{/* Rendering cannot change persistence outcomes. */}}}
 function check(attempt,signature){
  if(disposed)throw withCode('destroyed','에셋 보관함이 닫혔어요. 다시 열어 주세요.');
  if(attempt!==epoch||identity()!==signature)throw withCode('stale-binding','에셋 보관함을 읽거나 저장하는 동안 연결한 폴더가 바뀌었어요. 보관함을 다시 불러오세요.');
 }
 function enqueue(operation){const result=queue.then(operation);queue=result.catch(()=>{});return result;}
 const rootHandle=()=>workspace?.getAssetLibraryRoot?.()??null;
 function readCache(value){
  if(value===undefined||value===null)return {library:createAssetLibrary(),pending:null};
  if(typeof value==='string')return {library:parseAssetLibrary(value),pending:null};
  if(value.format!==CACHE_FORMAT||value.version!==1||typeof value.text!=='string'||!value.pending||!Object.hasOwn(value.pending,'expectedText')||!(value.pending.expectedText===null||typeof value.pending.expectedText==='string')||!(value.pending.location===null||typeof value.pending.location==='string'))throw cacheError();
  if(value.pending.expectedText!==null)parseAssetLibrary(value.pending.expectedText);
  return {library:parseAssetLibrary(value.text),text:value.text,pending:{expectedText:value.pending.expectedText,location:value.pending.location,root:value.pending.root??null}};
 }
 async function writeCache(text,pending){
  if(!pending)return persistence.set(key,text);
  const record={format:CACHE_FORMAT,version:1,text,pending};
  try{await persistence.set(key,record);}catch(error){
   // Native handles are structured-cloneable in IndexedDB. A blocked handle clone
   // must still retain the draft; a later session will refuse an unproven target.
   if((error?.name!=='DataCloneError'&&error?.cause?.name!=='DataCloneError')||!pending.root)throw error;
   await persistence.set(key,{...record,pending:{...pending,root:null}});
  }
 }
 async function sameRecoveryFolder(pending,result){
  const root=rootHandle();if(!pending.root||!root||typeof root.isSameEntry!=='function'||result.location!==pending.location)return false;
  try{return await root.isSameEntry(pending.root);}catch{return false;}
 }
 const pendingDestination=()=>withCode('pending-destination','복구한 에셋 초안의 원래 저장 폴더를 확인할 수 없어요. 원래 폴더를 연결해 다시 열거나, JSON으로 내보낸 뒤 다시 불러오세요.');
 const unsubscribe=workspace?.subscribe?.(()=>{
  const next=identity();if(next===lastIdentity)return;lastIdentity=next;epoch++;baseline=null;
  if(recovery)recoveryBlock=pendingDestination();
  publish({mode:'temporary',location:CACHE_LOCATION,pending:!!recovery,message:workspaceState().connected?'연결한 폴더가 바뀌었어요. 에셋 보관함을 다시 불러온 뒤 저장하세요.':'폴더가 연결되지 않았어요. 현재 에셋은 브라우저에 임시 보관해요.'});
 });
 const current=(attempt,signature)=>!disposed&&attempt===epoch&&identity()===signature;
 function markFailure(error,attempt,signature,{cached=false}={}){
  if(current(attempt,signature))publish({mode:cached&&!['conflict','wrong-folder','library-not-loaded','invalid-asset-library','pending-destination'].includes(error.code)?'temporary':'error',location:cached?CACHE_LOCATION:(workspaceState().assetsPath||CACHE_LOCATION),pending:!!recovery||cacheUnknown,message:error.message});
 }
 return {
  getState,
  subscribe(fn){listeners.add(fn);return ()=>listeners.delete(fn);},
  load({discardPending=false}={}){
   const attempt=epoch,signature=identity();
   return enqueue(async()=>{
    try{
     check(attempt,signature);baseline=null;let cached,cacheFailure;
     try{const value=await persistence.get(key);check(attempt,signature);cached=readCache(value);cacheChecked=true;cacheUnknown=false;recovery=cached.pending;recoveryBlock=recovery?pendingDestination():null;}
     catch(error){check(attempt,signature);cacheUnknown=true;cacheFailure=error?.code==='asset-cache-failed'?error:cacheError(error);}
     if(cacheFailure&&!discardPending)throw cacheFailure;
     if(workspaceState().connected&&typeof workspace?.readAssetLibrary==='function'){
      let result;
      try{result=await workspace.readAssetLibrary();check(attempt,signature);}
      catch(error){
       check(attempt,signature);
       if(cached?.pending&&!discardPending){recoveryBlock=error;publish({mode:'error',pending:true,location:CACHE_LOCATION,message:'폴더에 저장하지 못한 에셋 초안을 복구했어요. '+error.message});return cached.library;}
       if(['permission-denied','not-connected'].includes(error.code)&&cached&&!discardPending){publish({mode:'temporary',pending:false,location:CACHE_LOCATION,message:'브라우저에 임시 보관된 에셋을 열었어요. '+error.message});return cached.library;}
       throw error;
      }
      const diskRoot=rootHandle();
      // Recovery keeps its original compare-and-swap text. Reading a newer file
      // must never silently adopt that file as permission to overwrite it.
      if(cached?.pending&&!discardPending){
       const same=await sameRecoveryFolder(cached.pending,result);check(attempt,signature);
       if(same&&result.text===cached.text){
        let warning=null;try{await writeCache(cached.text,null);}catch(error){warning=cacheError(error).message;}check(attempt,signature);
        recovery=null;recoveryBlock=null;baseline={text:result.text,signature,root:diskRoot};publish({mode:'disk',pending:false,location:result.location,message:warning});return cached.library;
       }
       if(same&&result.text===cached.pending.expectedText){baseline={text:cached.pending.expectedText,signature,root:diskRoot};recoveryBlock=null;}
       else if(same)recoveryBlock=withCode('conflict','복구할 초안을 보관했어요. 다른 곳에서 폴더의 에셋 보관함이 바뀌어 덮어쓸 수 없어요. JSON으로 내보내거나 다시 불러오세요.');
       publish({mode:recoveryBlock?'error':'temporary',pending:true,location:CACHE_LOCATION,message:recoveryBlock?.message||'폴더에 저장하지 못한 에셋 초안을 복구했어요. 저장 재시도로 원래 폴더에 저장하거나, 다시 불러오기에서 초안을 버릴 수 있어요.'});return cached.library;
      }
      if(result.text!==null||discardPending){
       const library=parseAssetLibrary(serializeAssetLibrary(result.library));let warning=null;
       try{await writeCache(serializeAssetLibrary(library),null);}catch(error){if(cached?.pending||recovery||cacheUnknown)throw cacheError(error);warning=cacheError(error).message;}check(attempt,signature);
       recovery=null;recoveryBlock=null;cacheChecked=true;cacheUnknown=false;baseline={text:result.text,signature,root:diskRoot};publish({mode:result.text===null?'temporary':'disk',pending:false,location:result.location,message:warning});return library;
      }
      if(cacheFailure)throw cacheFailure;
      baseline={text:null,signature,root:diskRoot};publish({mode:'temporary',pending:false,location:CACHE_LOCATION,message:'연결한 폴더에 에셋 보관함이 없어요. 저장하면 '+result.location+'에 보관해요.'});return cached.library;
     }
     if(cacheFailure)throw cacheFailure;
     if(cached.pending){if(discardPending)throw pendingDestination();publish({mode:'temporary',pending:true,location:CACHE_LOCATION,message:'폴더에 저장하지 못한 에셋 초안을 복구했어요. 원래 폴더를 연결한 뒤 저장 재시도하거나 JSON으로 내보내세요.'});return cached.library;}
     const value=workspaceState();publish({mode:'temporary',pending:false,location:CACHE_LOCATION,message:value.permission&&value.permission!=='granted'&&value.folderName?'기억한 폴더의 읽기·쓰기 권한이 없어요. 폴더를 다시 연결하세요.':'브라우저에 임시 보관해요. 폴더를 연결하면 에셋 보관함을 별도로 저장할 수 있어요.'});return cached.library;
    }catch(error){markFailure(error,attempt,signature);throw error;}
   });
  },
  save(library){
   let text;try{text=serializeAssetLibrary(library);}catch(error){publish({mode:'error',message:error.message});return Promise.reject(error);}
   const attempt=epoch,signature=identity();
   return enqueue(async()=>{
    let cached=false;
    try{
     check(attempt,signature);const disk=workspaceState().connected&&typeof workspace?.writeAssetLibrary==='function';
     if(!cacheChecked){
      let previous;try{previous=readCache(await persistence.get(key));check(attempt,signature);cacheChecked=true;cacheUnknown=false;}catch(error){check(attempt,signature);cacheUnknown=true;throw error?.code==='asset-cache-failed'?error:cacheError(error);}
      if(previous.pending){cacheChecked=false;recovery=previous.pending;recoveryBlock=pendingDestination();throw withCode('recovery-not-loaded','저장 전에 브라우저에 남은 복구 초안을 먼저 불러오세요.');}
     }
     if(cacheUnknown)throw cacheError();
     if(disk&&!recovery&&(!baseline||baseline.signature!==signature))throw withCode('library-not-loaded','저장하기 전에 연결한 폴더의 에셋 보관함을 다시 불러오세요.');
     if(disk&&!recovery)recovery={expectedText:baseline.text,location:workspaceState().assetsPath??null,root:baseline.root};
     let cacheFailure;try{await writeCache(text,recovery);cached=true;}catch(error){cacheFailure=error?.code==='asset-cache-failed'?error:cacheError(error);}check(attempt,signature);
     const captured=parseAssetLibrary(text);
     if(disk){
      if(!baseline||baseline.signature!==signature)throw recoveryBlock||pendingDestination();
      let result;
      try{result=await workspace.writeAssetLibrary(captured,{expectedText:baseline.text});check(attempt,signature);}
      catch(error){check(attempt,signature);throw withCode(error.code||'write-failed',(cached?'브라우저에는 임시 보관했지만 폴더 저장에 실패했어요. ':'')+error.message,error);}
      baseline={text:result.text,signature,root:baseline.root};recovery=null;recoveryBlock=null;
      try{await writeCache(text,null);}catch(error){cacheFailure=cacheError(error);}check(attempt,signature);
      publish({mode:'disk',pending:false,location:result.location,message:cacheFailure?.message??null});return captured;
     }
     if(cacheFailure)throw cacheFailure;
     publish({mode:'temporary',pending:!!recovery,location:CACHE_LOCATION,message:recovery?'복구한 에셋 초안을 브라우저에 보관했어요. 원래 폴더를 연결해 저장 재시도하세요.':'브라우저에 임시 보관했어요. 폴더를 연결하면 별도 파일로 저장할 수 있어요.'});return captured;
    }catch(error){markFailure(error,attempt,signature,{cached});throw error;}
   });
  },
  destroy(){if(disposed)return;disposed=true;epoch++;unsubscribe?.();listeners.clear();}
 };
}
