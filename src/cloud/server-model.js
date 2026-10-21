import {createProject,validateProject} from '../model/project.js';
import {validateVisualEffects} from '../model/visual-effects.js';
import {validateCardTemplates} from '../model/card-templates.js';
import {ASSET_LIBRARY_LIMITS} from '../model/asset-library.js';
import {cloudProjectForValidation,collectBlobRefs} from './cloud-format.js';
export {sha256Hex,collectBlobRefs} from './cloud-format.js';
export {sniffImage,imageSize} from '../model/image-header.js';

const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const identifier=v=>typeof v==='string'&&v.length>0&&v.length<200;
const reject=message=>{throw Object.assign(new Error(message),{code:'invalid-work'});};
function boundedJson(data){
 const seen=new WeakSet(),pending=[[data,0]];
 while(pending.length){
  const [value,depth]=pending.pop();
  if(depth>64)reject('저장 데이터의 중첩은 최대 64단계예요.');
  if(value===null||typeof value==='string'||typeof value==='boolean'||typeof value==='number'&&Number.isFinite(value))continue;
  if(typeof value!=='object'||seen.has(value))reject('저장할 수 없는 JSON 데이터예요.');
  seen.add(value);
  if(!Array.isArray(value)&&Object.getPrototypeOf(value)!==Object.prototype&&Object.getPrototypeOf(value)!==null)reject('일반 JSON 객체만 저장할 수 있어요.');
  for(const [key,item] of Object.entries(value)){
   if(['__proto__','constructor','prototype'].includes(key))reject('저장할 수 없는 항목 이름이에요: '+key);
   pending.push([item,depth+1]);
  }
 }
 if(new TextEncoder().encode(JSON.stringify(data)).length>8*1024*1024)reject('작업 JSON은 최대 8 MB까지 저장할 수 있어요.');
}
function checkImages(assets={},paintings={}){
 if(!object(assets)||!object(paintings))reject('그림 자료와 원본은 객체여야 해요.');
 for(const asset of Object.values(assets))if(!/^blob:sha256:[0-9a-f]{64}$/.test(asset?.dataUrl))reject('그림은 업로드된 이미지 참조여야 해요.');
 for(const drawing of Object.values(paintings)){
  if(!object(drawing)||!Array.isArray(drawing.layers))reject('그림 원본의 레이어는 배열이어야 해요.');
  for(const layer of drawing.layers)if(!/^blob:sha256:[0-9a-f]{64}$/.test(layer?.png))reject('레이어는 업로드된 이미지 참조여야 해요.');
 }
}
function problems(list){if(list.length)reject(list[0].message);}
export function validateCloudWork(data){
 boundedJson(data);
 checkImages(data?.assets,data?.paintings);
 if(data?.cardTemplates!==undefined&&!Array.isArray(data.cardTemplates))reject('카드 서식 목록은 배열이어야 해요.');
 for(const template of data?.cardTemplates??[])checkImages(template?.assets,template?.paintings);
 const copy=cloudProjectForValidation(data);
 problems(validateProject(copy));
 return {cardCount:data.cards.length,blobRefs:collectBlobRefs(data)};
}
export function validateCloudAsset(kind,data){
 boundedJson(data);
 if(!object(data)||data.kind!==kind||!object(data.item)||!['effect_template','image','card_template','keyword'].includes(kind))reject('공유 에셋의 종류와 내용이 올바르지 않아요.');
 if(Object.keys(data).some(key=>!['kind','item','blobs','assets','paintings'].includes(key)))reject('공유 에셋에 지원하지 않는 항목이 있어요.');
 const refs=collectBlobRefs({...data,blobs:[]});
 if(!Array.isArray(data.blobs)||JSON.stringify(data.blobs)!==JSON.stringify(refs))reject('공유 에셋의 이미지 참조 목록이 일치하지 않아요.');
 checkImages(data.assets,data.paintings);
 const p=createProject();p.cards=[];p.assets=data.assets??{};p.paintings=data.paintings??{};
 if(kind==='card_template'){
  checkImages(data.item.assets,data.item.paintings);
  const copy=cloudProjectForValidation(data.item);problems(validateCardTemplates([copy]));
 }else if(kind==='image'){
  const {item}=data,{asset}=item;
  if(!identifier(item.id)||!/^[\w][\w.:-]{0,127}$/.test(item.id)||typeof item.name!=='string'||!item.name.trim()||item.name!==item.name.trim()||Array.from(item.name).length>120||/[\x00-\x1f\x7f]/.test(item.name)||!Number.isSafeInteger(item.createdAt)||item.createdAt<0||item.createdAt>8640000000000000||!asset||item.id===asset.id||asset.paintingId!==null)reject('이미지 보관함 항목의 이름·ID·저장 시간이 올바르지 않아요.');
  for(const key of ['width','height'])if(!Number.isSafeInteger(asset[key])||asset[key]<1||asset[key]>ASSET_LIBRARY_LIMITS.dimension)reject('이미지 크기는 1~8192 px여야 해요.');
  if(asset.width*asset.height>ASSET_LIBRARY_LIMITS.pixels)reject('이미지의 전체 픽셀 수가 너무 커요.');
  p.assets={...p.assets,[asset.id]:asset};checkImages(p.assets);problems(validateProject(cloudProjectForValidation(p)));
 }else{
  if(kind==='keyword')p.keywords=[data.item];
  else{problems(validateVisualEffects(data.item.recipe));p.visualEffectPresets=[data.item];}
  problems(validateProject(cloudProjectForValidation(p)));
 }
 return {blobRefs:refs};
}
