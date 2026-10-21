export const BLOB_REF_PREFIX='blob:sha256:';
const refPattern=/^blob:sha256:([0-9a-f]{64})$/;

export async function sha256Hex(bytes){
 const digest=await crypto.subtle.digest('SHA-256',bytes);
 return Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('');
}
function slots(data,library=false){
 const result=[];
 const asset=value=>{if(value&&typeof value==='object')result.push([value,'dataUrl',value.mime]);};
 if(library)asset(data?.asset);
 else{
  for(const value of Object.values(data?.assets??{}))asset(value);
  for(const drawing of Object.values(data?.paintings??{}))for(const layer of drawing?.layers??[])result.push([layer,'png','image/png']);
 }
 return result;
}
function base64(bytes){
 // Bound argument counts for large paintings; never re-encode the image itself.
 const chunks=[];
 for(let i=0;i<bytes.length;i+=32768)chunks.push(String.fromCharCode(...bytes.subarray(i,i+32768)));
 return btoa(chunks.join(''));
}
async function encode(value,library){
 const data=structuredClone(value),blobs=new Map();
 for(const [object,key,mime] of slots(data,library)){
  const url=object[key],prefix='data:'+mime+';base64,';
  if(typeof url!=='string'||!url.startsWith(prefix))throw new Error('그림의 base64 데이터가 올바르지 않아요.');
  const bytes=Uint8Array.from(atob(url.slice(prefix.length)),char=>char.charCodeAt(0)),hash=await sha256Hex(bytes);
  if(!blobs.has(hash))blobs.set(hash,{mime,bytes});
  object[key]=BLOB_REF_PREFIX+hash;
 }
 return {data,blobs};
}
async function decode(value,fetchBlob,library){
 const data=structuredClone(value),cache=new Map();
 for(const [object,key,mime] of slots(data,library)){
  const match=typeof object[key]==='string'&&refPattern.exec(object[key]);
  if(!match)continue;
  const hash=match[1];
  if(!cache.has(hash)){
   const bytes=await fetchBlob(hash);
   if(!(bytes instanceof Uint8Array)||await sha256Hex(bytes)!==hash)throw new Error('그림 데이터가 손상되었어요. 다시 불러오세요.');
   cache.set(hash,base64(bytes));
  }
  object[key]='data:'+mime+';base64,'+cache.get(hash);
 }
 return data;
}
export const toCloudProject=project=>encode(project,false);
export const fromCloudProject=(data,fetchBlob)=>decode(data,fetchBlob,false);
export const toCloudLibraryEntry=entry=>encode(entry,true);
export const fromCloudLibraryEntry=(data,fetchBlob)=>decode(data,fetchBlob,true);

export function collectBlobRefs(value){
 const refs=new Set(),seen=new WeakSet(),pending=[value];
 while(pending.length){
  const item=pending.pop();
  if(typeof item==='string'){const match=refPattern.exec(item);if(match)refs.add(match[1]);}
  else if(item&&typeof item==='object'&&!seen.has(item)){seen.add(item);pending.push(...Object.values(item));}
 }
 return [...refs].sort();
}
export function cloudProjectForValidation(value){
 const data=structuredClone(value);
 for(const [object,key,mime] of slots(data))if(typeof object[key]==='string'&&refPattern.test(object[key]))object[key]='data:'+mime+';base64,AAAA';
 return data;
}
