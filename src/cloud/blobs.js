import {sha256Hex} from './cloud-format.js';
const valid=hash=>typeof hash==='string'&&/^[0-9a-f]{64}$/.test(hash);
async function verified(hash,bytes){
 if(!valid(hash)||!(bytes instanceof Uint8Array)||await sha256Hex(bytes)!==hash)throw new Error('그림 데이터가 손상되었어요. 다시 불러오세요.');
 return bytes;
}
export function createBlobStore({client,publicBaseUrl,cache=new Map(),fetchImpl=globalThis.fetch}){
 return {
  async ensureUploaded(blobs,{onProgress=()=>{},importToken}={}){
   const hashes=[...blobs.keys()];let missing=[];
   for(let offset=0;offset<hashes.length;offset+=2000){const result=await client.call('blob.missing',{hashes:hashes.slice(offset,offset+2000)});missing.push(...result.missing);}
   const requested=new Set(hashes);if(missing.some(hash=>!requested.has(hash)))throw new Error('서버의 그림 업로드 목록이 올바르지 않아요.');
   missing=[...new Set(missing)];let done=hashes.length-missing.length;onProgress({done,total:hashes.length,hash:null});
   for(const hash of missing){const {mime,bytes}=blobs.get(hash);await verified(hash,bytes);await client.uploadBlob(hash,bytes,mime,{importToken});cache.set(hash,new Uint8Array(bytes));onProgress({done:++done,total:hashes.length,hash});}
  },
  async fetch(hash){
   if(!valid(hash))throw new Error('그림 참조의 해시가 올바르지 않아요.');
   let bytes=cache.get(hash);
   if(!bytes){const response=await fetchImpl(publicBaseUrl.replace(/\/$/,'')+'/'+hash);if(!response.ok)throw new Error('그림을 받지 못했어요. 다시 불러오세요.');bytes=new Uint8Array(await response.arrayBuffer());}
   await verified(hash,bytes);cache.set(hash,new Uint8Array(bytes));return new Uint8Array(bytes);
  }
 };
}
