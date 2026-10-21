const FORMAT='card-print-studio-update',MAX_BYTES=256*1024;
class UpdateError extends Error{}
const fail=message=>new UpdateError(message);

function versionParts(value){
 const match=typeof value==='string'&&value.length<=150&&value.match(/^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([\da-zA-Z-]+(?:\.[\da-zA-Z-]+)*))?(?:\+([\da-zA-Z-]+(?:\.[\da-zA-Z-]+)*))?$/);
 if(!match||match[4]?.split('.').some(s=>/^\d+$/.test(s)&&s.length>1&&s[0]==='0'))throw fail('버전 형식이 올바르지 않아요. 1.2.3 또는 1.2.3-beta.1처럼 적어야 해요.');
 return {numbers:match.slice(1,4).map(BigInt),pre:match[4]?.split('.')||[]};
}
export function compareVersions(left,right){
 const a=versionParts(left),b=versionParts(right);
 for(let i=0;i<3;i++)if(a.numbers[i]!==b.numbers[i])return a.numbers[i]>b.numbers[i]?1:-1;
 if(!a.pre.length||!b.pre.length)return a.pre.length===b.pre.length?0:a.pre.length?-1:1;
 for(let i=0;i<Math.max(a.pre.length,b.pre.length);i++){
  const x=a.pre[i],y=b.pre[i];if(x===y)continue;if(x===undefined||y===undefined)return x===undefined?-1:1;
  const nx=/^\d+$/.test(x),ny=/^\d+$/.test(y);if(nx&&ny)return BigInt(x)>BigInt(y)?1:-1;if(nx!==ny)return nx?-1:1;return x>y?1:-1;
 }
 return 0;
}
function httpsUrl(value,label,base){
 if(typeof value!=='string'||!value.trim()||value.length>2048)throw fail(label+'가 비어 있거나 너무 길어요. HTTPS 주소를 입력해 주세요.');
 let url;try{url=new URL(value.trim(),base);}catch{throw fail(label+' 형식이 올바르지 않아요. https://로 시작하는 주소를 입력해 주세요.');}
 if(url.protocol!=='https:'||url.username||url.password||url.hash)throw fail(label+'는 로그인 정보와 # 부분이 없는 HTTPS 주소여야 해요.');
 return url.href;
}
export const normalizeSource=value=>httpsUrl(value,'배포 주소');

export function parseRelease(value,source){
 if(!value||typeof value!=='object'||Array.isArray(value)||value.format!==FORMAT)throw fail('PP Monster의 새 버전 정보 파일이 아니에요. 작업실용 update.json 주소가 필요해요.');
 versionParts(value.version);
 if(value.releasedAt!==undefined){
  const date=value.releasedAt;
  if(typeof date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(date)||Number.isNaN(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date)throw fail('배포 날짜가 올바르지 않아요. 실제 날짜를 YYYY-MM-DD로 적어야 해요.');
 }
 let notes=value.notes??[];if(typeof notes==='string')notes=notes.split(/\r?\n/).filter(line=>line.trim());
 if(!Array.isArray(notes)||notes.length>100||notes.some(note=>typeof note!=='string'||note.length>4000))throw fail('변경사항은 100개 이하의 글 목록이어야 하며 한 항목은 4,000자 이하여야 해요.');
 return {version:value.version.replace(/^v/,''),releasedAt:value.releasedAt||'',notes:[...notes],downloadUrl:httpsUrl(value.downloadUrl,'다운로드 주소',normalizeSource(source))};
}

async function limitedBytes(response,signal,maxBytes,tooLarge){
 const declared=Number(response.headers.get('content-length'));if(declared>maxBytes){await response.body?.cancel().catch(()=>{});throw fail(tooLarge);}
 const reader=response.body?.getReader();if(!reader){const bytes=new Uint8Array(await response.arrayBuffer());if(bytes.byteLength>maxBytes)throw fail(tooLarge);return bytes;}
 let total=0;const chunks=[],abort=()=>{reader.cancel().catch(()=>{});};signal.addEventListener('abort',abort,{once:true});
 try{
  while(true){if(signal.aborted)throw new DOMException('Aborted','AbortError');const {value,done}=await reader.read();if(done)break;total+=value.byteLength;if(total>maxBytes){await reader.cancel();throw fail(tooLarge);}chunks.push(value);}
  const bytes=new Uint8Array(total);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}return bytes;
 }finally{signal.removeEventListener('abort',abort);reader.releaseLock();}
}

async function fetchPayload(url,{signal,fetchImpl=globalThis.fetch,timeoutMs=10000,maxBytes=MAX_BYTES,file=false}={}){
 if(signal?.aborted)throw new DOMException('Aborted','AbortError');
 const control=new AbortController(),cancel=()=>control.abort();let timedOut=false;
 const aborted=new Promise((resolve,reject)=>control.signal.addEventListener('abort',()=>reject(timedOut?fail((file?'새 HTML 받기':'새 버전 확인')+' 시간이 초과됐어요. 배포 서버가 '+timeoutMs/1000+'초 안에 응답하지 않았어요.'):new DOMException('Aborted','AbortError')),{once:true}));
 signal?.addEventListener('abort',cancel,{once:true});const timer=setTimeout(()=>{timedOut=true;control.abort();},timeoutMs);
 async function request(){
  const response=await fetchImpl(url,{method:'GET',headers:{Accept:file?'text/html,application/octet-stream':'application/json'},mode:'cors',credentials:'omit',cache:'no-store',referrerPolicy:'no-referrer',signal:control.signal});
  if(!response.ok){await response.body?.cancel().catch(()=>{});throw fail('배포 서버가 HTTP '+response.status+'로 응답했어요.'+(response.status===404?' 이 주소에 '+(file?'새 HTML 파일':'새 버전 정보 파일')+'이 없어요.':''));}
  const finalUrl=response.url?httpsUrl(response.url,file?'다운로드 주소':'배포 주소'):url;
  const tooLarge=file?'새 HTML 파일이 64MB를 넘어요. 작업 자료가 빠진 작업실 배포 파일이 필요해요.':'새 버전 정보가 256KB를 넘어요. HTML 파일 대신 작은 update.json 주소가 필요해요.';
  return {url:finalUrl,bytes:await limitedBytes(response,control.signal,maxBytes,tooLarge)};
 }
 try{return await Promise.race([request(),aborted]);}
 catch(error){if(error instanceof UpdateError||error?.name==='AbortError')throw error;throw fail((file?'새 HTML 파일 서버':'배포 서버')+'에 연결하지 못했어요. 인터넷 연결이 끊겼거나 서버가 작업실의 외부 요청을 허용하지 않았어요.');}
 finally{clearTimeout(timer);signal?.removeEventListener('abort',cancel);control.abort();}
}

export async function checkForUpdate(source,{currentVersion,...options}={}){
 const url=normalizeSource(source);versionParts(currentVersion);const payload=await fetchPayload(url,options);let value;
 try{value=JSON.parse(new TextDecoder().decode(payload.bytes).replace(/^\uFEFF/,''));}catch{throw fail('배포 주소가 JSON 버전 정보를 보내지 않았어요. HTML 페이지 주소가 아닌 update.json 주소가 필요해요.');}
 const release=parseRelease(value,payload.url),comparison=compareVersions(release.version,currentVersion);
 return {source:url,release,relation:comparison>0?'available':comparison===0?'current':'ahead'};
}

export async function receiveUpdateFile(release,options={}){
 const url=httpsUrl(release?.downloadUrl,'다운로드 주소'),{bytes}=await fetchPayload(url,{...options,timeoutMs:options.timeoutMs??60000,maxBytes:64*1024*1024,file:true});
 const beginning=new TextDecoder().decode(bytes.subarray(0,4096));if(!/<!doctype\s+html\b|<html[\s>]/i.test(beginning))throw fail('다운로드 주소가 HTML 작업실 파일을 보내지 않았어요. 배포 파일의 주소가 필요해요.');
 return new Blob([bytes],{type:'text/html'});
}
