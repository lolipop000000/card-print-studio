const RELEASE='u2netp-ort-1.17.3-v1';
export const BACKGROUND_MODEL_RESOURCES=Object.freeze([
 Object.freeze({name:'runtime',url:'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.17.3/dist/ort.min.js',size:542655,type:'application/javascript',sha256:'88490a46ffcbdb497d7c11402f6b6d39a97f00185f641f0d0a946556ce931752'}),
 Object.freeze({name:'wasm',url:'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.17.3/dist/ort-wasm-simd.wasm',size:10551547,type:'application/wasm',sha256:'6783fcd6647ce1b426a527c31412a9c40894552faa609e9c931b3239a3438071'}),
 // Verbatim mirror, pinned to a commit and the digest of rembg's upstream release.
 Object.freeze({name:'model',url:'https://huggingface.co/edgetools/u2netp/resolve/25dee37ab19c5b6ad64ba6578eba63f1ae07720c/u2netp.onnx',size:4574861,type:'application/octet-stream',sha256:'309c8469258dda742793dce0ebea8e6dd393174f89934733ecc8b14c76f4ddd8'})
]);
const failure=(code,message,cause)=>Object.assign(new Error(message,{cause}),{code});
export function checkBackgroundAbort(signal){if(signal?.aborted)throw new DOMException('배경 제거를 취소했어요.','AbortError');}
function storageFailure(error){return failure('background-cache-failed',error?.name==='QuotaExceededError'?'배경 제거 모델을 보관할 브라우저 공간이 부족해요. 저장 공간을 확보한 뒤 다시 시도하세요.':'배경 제거 모델의 브라우저 저장소를 열거나 저장하지 못했어요. 브라우저 저장소를 허용하고 일반 창에서 다시 시도하세요.',error);}

/** A separate, atomic bundle: no photo bytes or project data are stored here. */
export function createBackgroundModelStorage({indexedDB=globalThis.indexedDB}={}){
 async function run(mode,value){
  if(!indexedDB)throw storageFailure();let database;
  try{
   database=await new Promise((resolve,reject)=>{
    const request=indexedDB.open('card-print-studio-background-model',1);let settled=false;
    const fail=error=>{if(!settled){settled=true;clearTimeout(timer);reject(error);}};
    const timer=setTimeout(()=>fail(Error('Model storage timed out')),10000);
    request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains('bundles'))request.result.createObjectStore('bundles');};
    request.onsuccess=()=>{if(settled){request.result.close();return;}settled=true;clearTimeout(timer);resolve(request.result);};
    request.onerror=()=>fail(request.error);request.onblocked=()=>fail(Error('Model storage is blocked'));
   });
   return await new Promise((resolve,reject)=>{
    const transaction=database.transaction('bundles',mode==='get'?'readonly':'readwrite'),store=transaction.objectStore('bundles');
    const request=mode==='get'?store.get(RELEASE):mode==='clear'?store.delete(RELEASE):store.put(value,RELEASE);
    transaction.oncomplete=()=>resolve(request.result);
    transaction.onabort=()=>reject(transaction.error||request.error||Error('Model cache transaction aborted'));
    transaction.onerror=()=>reject(transaction.error||request.error);
   });
  }catch(error){throw storageFailure(error);}finally{database?.close();}
 }
 return {get:()=>run('get'),set:value=>run('set',value),clear:()=>run('clear')};
}

/** Every executable/model byte is hash checked before use, including cache hits. */
export function createBackgroundModelLoader({resources=BACKGROUND_MODEL_RESOURCES,persistence=createBackgroundModelStorage(),fetch=globalThis.fetch,crypto=globalThis.crypto}={}){
 async function verify(buffer,resource){
  if(!(buffer instanceof ArrayBuffer)||buffer.byteLength!==resource.size)throw failure('background-integrity','배경 제거 파일의 크기를 확인하지 못했어요. 인터넷에 연결한 뒤 다시 시도하세요.');
  if(!crypto?.subtle)throw failure('background-unsupported','이 브라우저에서 배경 제거 파일을 검증할 수 없어요. 최신 Chrome 또는 Edge에서 다시 시도하세요.');
  const digest=await crypto.subtle.digest('SHA-256',buffer),hex=[...new Uint8Array(digest)].map(value=>value.toString(16).padStart(2,'0')).join('');
  if(hex!==resource.sha256)throw failure('background-integrity','배경 제거 파일의 무결성 검증에 실패했어요. 인터넷에 연결한 뒤 다시 시도하세요.');
 }
 return async function load({signal,onProgress=()=>{}}={}){
  checkBackgroundAbort(signal);
  const cached=await persistence.get();checkBackgroundAbort(signal);
  if(cached){
   try{
    if(cached.release!==RELEASE||!cached.assets)throw failure('background-integrity','저장된 배경 제거 모델을 다시 준비해야 해요.');
    for(const resource of resources){await verify(cached.assets[resource.name],resource);checkBackgroundAbort(signal);}
    onProgress({stage:'load',progress:.65,message:'보관된 모델을 사용해요. 사진은 이 기기 안에서 처리해요.'});return cached.assets;
   }catch(error){if(error?.name==='AbortError'||error?.code==='background-unsupported')throw error;await persistence.clear();}
  }
  const assets={},total=resources.reduce((sum,resource)=>sum+resource.size,0);let loaded=0;
  onProgress({stage:'download',progress:0,message:'첫 사용에 필요한 모델을 내려받아요 (약 16MB). 사진은 전송하지 않아요.'});
  for(const resource of resources){
   checkBackgroundAbort(signal);
   try{
    const response=await fetch(resource.url,{signal,mode:'cors',credentials:'omit',cache:'no-store',referrerPolicy:'no-referrer'});
    if(!response.ok)throw Error('HTTP '+response.status);
    const type=(response.headers.get('content-type')||'').split(';')[0].trim().toLowerCase();
    const allowed=resource.type==='application/javascript'?['application/javascript','text/javascript','application/x-javascript']:resource.type==='application/wasm'?['application/wasm','application/octet-stream']:['application/octet-stream'];
    if(!allowed.includes(type))throw failure('background-integrity','배경 제거 파일 형식이 올바르지 않아요. 인터넷 연결을 확인한 뒤 다시 시도하세요.');
    const declared=Number(response.headers.get('content-length'));if(declared>resource.size)throw failure('background-integrity','배경 제거 파일 크기가 올바르지 않아요. 다시 시도하세요.');
    const reader=response.body.getReader(),chunks=[];let length=0;
    try{
     while(true){
      checkBackgroundAbort(signal);const {done,value}=await reader.read();if(done)break;length+=value.byteLength;
      if(length>resource.size)throw failure('background-integrity','배경 제거 파일 크기가 올바르지 않아요. 다시 시도하세요.');
      chunks.push(value);onProgress({stage:'download',progress:(loaded+length)/total*.6,message:'배경 제거 모델 준비 '+Math.round((loaded+length)/total*100)+'% · 사진은 전송하지 않아요.'});
     }
    }catch(error){await reader.cancel().catch(()=>{});throw error;}finally{reader.releaseLock();}
    const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
    await verify(bytes.buffer,resource);checkBackgroundAbort(signal);assets[resource.name]=bytes.buffer;loaded+=length;
   }catch(error){
    checkBackgroundAbort(signal);if(error?.code||error?.name==='AbortError')throw error;
    throw failure('background-download-failed','배경 제거 모델을 내려받지 못했어요. 첫 사용에는 인터넷이 필요해요. 연결한 뒤 다시 시도하세요.',error);
   }
  }
  checkBackgroundAbort(signal);
  try{await persistence.set({release:RELEASE,assets});}catch(error){throw error?.code==='background-cache-failed'?error:storageFailure(error);}
  checkBackgroundAbort(signal);onProgress({stage:'load',progress:.65,message:'모델을 보관했어요. 다음에는 이 브라우저에서 오프라인으로 사용할 수 있어요.'});return assets;
 };
}
