import {newId,clone} from './types.js';
import {VISUAL_EFFECT_CATALOG,validateVisualEffects,upgradeVisualEffects} from './visual-effects.js';
import {createAssetLibrary,parseAssetLibrary,ASSET_LIBRARY_LIMITS} from './asset-library.js';

const FORMAT='pp-monster-particles',LIMIT=128,MAX_TEXT=96*1024*1024;
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const validId=value=>typeof value==='string'&&/^[\w][\w.:-]{0,127}$/.test(value)&&!['__proto__','constructor','prototype'].includes(value);
function checkedEntry(value){
 if(!object(value)||!validId(value.id))throw Error('파티클 보관함: 올바른 자료 ID가 필요해요.');
 const name=typeof value.name==='string'?value.name.normalize('NFC').trim():'';
 if(!name||Array.from(name).length>120||/[\x00-\x1f\x7f]/.test(name))throw Error('파티클 이름은 줄바꿈 없이 1~120자로 입력하세요.');
 const problems=validateVisualEffects(value.recipe);if(problems.length)throw Error(problems[0].message);
 const recipe=upgradeVisualEffects(value.recipe);
 if(!recipe.layers.some(layer=>VISUAL_EFFECT_CATALOG[layer.kind]?.generative))throw Error('파티클을 하나 이상 추가한 뒤 보관하세요.');
 if(!object(value.assets))throw Error('파티클 보관함의 그림 목록이 없어요.');
 const needed=new Set(recipe.layers.map(layer=>layer.params?.assetId).filter(Boolean)),entries=[];
 for(const id of needed){
  if(!Object.hasOwn(value.assets,id)||value.assets[id]?.id!==id)throw Error('파티클에서 사용하는 그림이 없어요. 원본 그림과 함께 저장하세요.');
  let entryId='particle-image-'+entries.length;while(needed.has(entryId))entryId+='x';
  entries.push({id:entryId,name:'입자 이미지',asset:{...value.assets[id],paintingId:null},createdAt:0});
 }
 const images=parseAssetLibrary(JSON.stringify({...createAssetLibrary(),entries})).entries;
 return {id:value.id,name,recipe,assets:Object.fromEntries(images.map(entry=>[entry.asset.id,entry.asset]))};
}
export function createParticleLibrary(){return {format:FORMAT,version:1,entries:[]};}
export function parseParticleLibrary(text){
 if(typeof text!=='string'||text.length>MAX_TEXT)throw Error('파티클 JSON은 96 MB 이하의 파일을 선택하세요.');
 let value;try{value=JSON.parse(text);}catch{throw Error('파티클 보관함 JSON을 읽을 수 없어요.');}
 if(!object(value)||value.format!==FORMAT||value.version!==1||!Array.isArray(value.entries)||value.entries.length>LIMIT)throw Error('파티클 보관함 버전 1 형식이 필요해요. 최대 128개를 보관할 수 있어요.');
 const ids=new Set();let bytes=0;
 const entries=value.entries.map(item=>{const entry=checkedEntry(item);if(ids.has(entry.id))throw Error('파티클 자료 ID가 중복됐어요.');ids.add(entry.id);
  for(const asset of Object.values(entry.assets))bytes+=asset.dataUrl.length*.75;
  if(bytes>ASSET_LIBRARY_LIMITS.totalBytes)throw Error('파티클 보관함 그림의 전체 크기는 최대 64 MB예요.');return entry;
 });
 return {...createParticleLibrary(),entries};
}
export const serializeParticleLibrary=library=>JSON.stringify(parseParticleLibrary(JSON.stringify(library)),null,2);
export function createParticleEntry(name,recipe,assets={}){return checkedEntry({id:'particle-'+newId(),name,recipe:clone(recipe),assets});}
export function instantiateParticle(value){
 const entry=checkedEntry(value),map=new Map(Object.keys(entry.assets).map(id=>[id,newId()])),assets={};
 for(const [id,asset] of Object.entries(entry.assets)){const next=map.get(id);assets[next]={...clone(asset),id:next};}
 const recipe=clone(entry.recipe);for(const layer of recipe.layers){layer.id=newId();if(layer.params?.assetId)layer.params.assetId=map.get(layer.params.assetId);}
 return {recipe,assets};
}
/** Preserve the source recipe while adapting frame-only placement to another target. */
export function particleRecipeTarget(recipe){
 return recipe.layers.some(layer=>VISUAL_EFFECT_CATALOG[layer.kind]?.textOnly)?'text':recipe.frame?'frame':'effect';
}
export function particleRecipeForTarget(recipe,target){
 const copy=clone(recipe);if(target!=='frame')delete copy.frame;
 if(target!=='text'&&particleRecipeTarget(copy)==='text')throw Error('글자 형태 왜곡이 포함된 파티클은 글자에 적용하세요.');
 const problems=validateVisualEffects(copy,target);if(problems.length)throw Error(problems[0].message);
 return copy;
}
