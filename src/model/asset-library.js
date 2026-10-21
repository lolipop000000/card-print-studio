import {newId} from './types.js';
import {imageSize} from './image-header.js';

const FORMAT='card-print-studio-assets',VERSION=1;
export const ASSET_LIBRARY_LIMITS=Object.freeze({entries:512,dimension:8192,pixels:16777216,assetBytes:20*1024*1024,totalBytes:64*1024*1024,nameLength:120});
const MAX_TEXT=96*1024*1024;
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const identifier=value=>typeof value==='string'&&/^[\w][\w.:-]{0,127}$/.test(value);
const invalid=message=>{throw new Error('에셋 보관함: '+message);};
function raster(value){
 if(!object(value))invalid('그림 자료가 올바르지 않아요.');
 if(!identifier(value.id))invalid('그림 ID가 올바르지 않아요.');
 if(!['image/png','image/jpeg','image/webp'].includes(value.mime))invalid('PNG, JPEG, WebP 그림만 보관할 수 있어요.');
 for(const key of ['width','height'])if(!Number.isSafeInteger(value[key])||value[key]<1||value[key]>ASSET_LIBRARY_LIMITS.dimension)invalid('그림 폭과 높이는 1~8192 px의 정수여야 해요.');
 if(value.width*value.height>ASSET_LIBRARY_LIMITS.pixels)invalid('그림은 최대 16,777,216픽셀까지 보관할 수 있어요.');
 const prefix='data:'+value.mime+';base64,';
 if(typeof value.dataUrl!=='string'||!value.dataUrl.startsWith(prefix))invalid('그림 형식과 일치하는 base64 픽셀 데이터가 필요해요.');
 const payload=value.dataUrl.slice(prefix.length);
 if(!payload||payload.length>Math.ceil(ASSET_LIBRARY_LIMITS.assetBytes/3)*4||payload.length%4!==0||!/^[A-Za-z0-9+/]+={0,2}$/.test(payload))invalid('그림 base64 데이터가 올바르지 않거나 그림당 20 MB 제한을 넘었어요.');
 const byteLength=payload.length/4*3-(payload.endsWith('==')?2:payload.endsWith('=')?1:0);
 if(byteLength>ASSET_LIBRARY_LIMITS.assetBytes)invalid('그림당 최대 20 MB까지 보관할 수 있어요.');
 let bytes;try{bytes=Uint8Array.from(atob(payload),character=>character.charCodeAt(0));}catch{invalid('그림 base64 데이터를 읽을 수 없어요.');}
 const size=imageSize(bytes,value.mime);
 if(!size||size[0]!==value.width||size[1]!==value.height)invalid('실제 PNG/JPEG/WebP 그림의 형식과 픽셀 크기를 확인하세요.');
 return {asset:{id:value.id,mime:value.mime,dataUrl:value.dataUrl,width:value.width,height:value.height,paintingId:null},byteLength};
}
function normalizeLibrary(value){
 if(!object(value)||value.format!==FORMAT||value.version!==VERSION)invalid('지원하는 보관함 JSON 형식(버전 1)이 아니에요.');
 if(!Array.isArray(value.entries)||value.entries.length>ASSET_LIBRARY_LIMITS.entries)invalid('그림 목록은 최대 512개여야 해요.');
 const ids=new Set();let total=0;
 const claim=id=>{if(!identifier(id))invalid('에셋 ID가 올바르지 않아요.');if(ids.has(id))invalid('중복 ID가 있어요. 각 에셋과 그림은 서로 다른 ID가 필요해요.');ids.add(id);};
 const entries=value.entries.map(entry=>{
  if(!object(entry))invalid('에셋 정보가 올바르지 않아요.');claim(entry.id);
  if(typeof entry.name!=='string'||!entry.name.trim()||entry.name!==entry.name.trim()||Array.from(entry.name).length>ASSET_LIBRARY_LIMITS.nameLength||/[\x00-\x1f\x7f]/.test(entry.name))invalid('그림 이름은 줄바꿈 없는 1~120자여야 해요.');
  if(!Number.isSafeInteger(entry.createdAt)||entry.createdAt<0||entry.createdAt>8640000000000000)invalid('그림 저장 시간이 올바르지 않아요.');
  if(entry.asset?.paintingId!==null)invalid('공용 그림에는 프로젝트의 편집 원본을 연결할 수 없어요.');
  claim(entry.asset?.id);const {asset,byteLength}=raster(entry.asset);total+=byteLength;
  if(total>ASSET_LIBRARY_LIMITS.totalBytes)invalid('보관함 그림의 전체 크기는 최대 64 MB예요.');
  return {id:entry.id,name:entry.name,asset,createdAt:entry.createdAt};
 });
 return {format:FORMAT,version:VERSION,entries};
}
export function createAssetLibrary(){return {format:FORMAT,version:VERSION,entries:[]};}
export function parseAssetLibrary(text){
 if(typeof text!=='string'||text.length>MAX_TEXT)invalid('JSON 파일이 너무 크거나 텍스트가 아니에요. 최대 96 MB까지 열 수 있어요.');
 let value;try{value=JSON.parse(text);}catch{invalid('JSON 파일을 읽을 수 없어요. 에셋 보관함 JSON을 선택하세요.');}
 return normalizeLibrary(value);
}
export function serializeAssetLibrary(library){return JSON.stringify(normalizeLibrary(library),null,2);}
/** A library entry always owns a fresh flattened raster; editable drawings stay in their deck. */
export function createLibraryEntry(asset,name='그림'){
 const detached=raster({...asset,id:'asset-'+newId()}).asset;
 const entry={id:'entry-'+newId(),name:typeof name==='string'?name.normalize('NFC').trim():name,asset:detached,createdAt:Date.now()};
 return normalizeLibrary({...createAssetLibrary(),entries:[entry]}).entries[0];
}
