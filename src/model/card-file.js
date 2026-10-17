import {parseProject,serializeProject} from './project.js';
import {clone,newId} from './types.js';
import {remapSkillReferences} from './skill-references.js';
import {DEFAULT_BLEND_MODE} from './blend-modes.js';
import {syncVariants} from './variants.js';

export const cardNameKey=name=>String(name??'').normalize('NFC').trim();

const FORMAT='card-print-studio-card';
const skills=card=>[...(card.passives||[]),...(card.actives||[])];
const keywordRefs=card=>[...(card.keywords||[]),...skills(card).flatMap(skill=>skill.keywords||[])];
function assetIds(card,keywords){
 const recipes=[card.visualEffects,card.nameStyle?.visualEffects,...card.elements.map(element=>element.style?.visualEffects),...skills(card).map(skill=>skill.nameStyle?.visualEffects)];
 const effectAssets=recipes.flatMap(recipe=>(recipe?.layers||[]).map(layer=>layer.params?.assetId));
 return new Set([card.artAssetId,...card.elements.map(element=>element.assetId),...keywords.map(keyword=>keyword.iconAssetId),...effectAssets].filter(Boolean));
}
function oneCardProject(project,original){
 const card=clone(original);delete card.variant;
 const usedKeywords=new Set(keywordRefs(card).map(ref=>ref.keywordId)),keywords=(project.keywords||[]).filter(keyword=>usedKeywords.has(keyword.id)).map(clone);
 const assets=Object.fromEntries([...assetIds(card,keywords)].map(id=>[id,clone(project.assets[id])]));
 const usedPaintings=new Set(Object.values(assets).map(asset=>asset.paintingId).filter(Boolean));
 return {format:'card-print-studio',version:1,name:card.name,settings:clone(project.settings),keywords,visualEffectPresets:[],cards:[card],back:{elements:[]},assets,
  paintings:Object.fromEntries([...usedPaintings].map(id=>[id,clone(project.paintings[id])])),print:clone(project.print)};
}

/** A portable, standalone card with its physical settings and used dependencies. */
export function exportCardFile(project,cardId){
 const source=parseProject(serializeProject(project)),card=source.cards.find(card=>card.id===cardId);
 if(!card)throw Error('저장할 카드를 찾을 수 없어요.');
 const payload=oneCardProject(source,card);serializeProject(payload);
 return JSON.stringify({format:FORMAT,version:1,project:payload},null,2);
}

/** Return a validated one-card project, without changing any open project. */
export function parseCardFile(text){
 let file;try{file=JSON.parse(text);}catch{throw Error('JSON 파일을 읽을 수 없어요. 카드 한 장 파일을 선택하세요.');}
 if(!file||file.format!==FORMAT||file.version!==1||!file.project||typeof file.project!=='object')throw Error('지원하는 카드 한 장 파일(버전 1)이 아니에요.');
 const project=parseProject(JSON.stringify(file.project));
 if(project.cards.length!==1||project.cards[0].variant)throw Error('원본 연결이 없는 카드 한 장 파일을 선택하세요.');
 return oneCardProject(project,project.cards[0]);
}

function collectIds(value,used){
 if(!value||typeof value!=='object')return;
 for(const [key,item] of Object.entries(value)){
  if((key==='id'||key.endsWith('Id'))&&typeof item==='string')used.add(item);
  else if(item&&typeof item==='object')collectIds(item,used);
 }
}
function originalSignature(project,assetId){
 if(!assetId)return null;
 const asset=project.assets[assetId],original=project.paintings[asset.paintingId];
 return {mime:asset.mime,dataUrl:asset.dataUrl,width:asset.width,height:asset.height,painting:original?{
  width:original.width,height:original.height,active:original.layers.findIndex(layer=>layer.id===original.activeLayerId),
  layers:original.layers.map(layer=>({name:layer.name,visible:layer.visible,locked:layer.locked,opacity:layer.opacity,blendMode:layer.blendMode??DEFAULT_BLEND_MODE,png:layer.png}))
 }:null};
}
function compatibleKeyword(existing,incoming,project,source){
 return existing.name===incoming.name&&existing.description===incoming.description&&existing.color.toLowerCase()===incoming.color.toLowerCase()
  &&JSON.stringify(originalSignature(project,existing.iconAssetId))===JSON.stringify(originalSignature(source,incoming.iconAssetId));
}

/** Append atomically to a draft; all new card/art identities are independent. */
export function importCardFile(project,text,{replaceCardId=null}={}){
 const replaceIndex=replaceCardId===null?-1:project.cards.findIndex(c=>c.id===replaceCardId);
 if(replaceCardId!==null&&replaceIndex<0)throw Error('덮어쓸 카드가 없어졌어요. 현재 카드 목록에서 다시 선택하세요.');
 const source=parseCardFile(text),card=source.cards[0],used=new Set();collectIds(project,used);collectIds(source,used);
 const fresh=()=>{let id;do{id=newId();}while(used.has(id));used.add(id);return id;};
 const skillIds=new Map(skills(card).map(skill=>[skill.id,fresh()])),keywordIds=new Map(),assetMap=new Map(),paintingIds=new Map();
 const mapSkill=id=>{if(!skillIds.has(id))skillIds.set(id,fresh());return skillIds.get(id);};
 const newKeywords=[];
 for(const keyword of source.keywords){
  const existing=(project.keywords||[]).find(item=>item.name.normalize('NFC')===keyword.name.normalize('NFC'));
  if(existing){
   if(!compatibleKeyword(existing,keyword,project,source))throw Error('키워드 “'+keyword.name+'”의 기존 색·설명·아이콘 또는 그림 원본이 달라요. 키워드 이름을 구분한 뒤 다시 불러오세요.');
   keywordIds.set(keyword.id,existing.id);
  }else {const id=fresh();keywordIds.set(keyword.id,id);newKeywords.push({...keyword,id});}
 }
 const importedAssets={},importedPaintings={};
 for(const id of assetIds(card,newKeywords))assetMap.set(id,fresh());
 for(const id of assetMap.keys()){
  const asset=source.assets[id];
  if(asset.paintingId&&!paintingIds.has(asset.paintingId)){
   const original=clone(source.paintings[asset.paintingId]),layerIds=new Map(original.layers.map(layer=>[layer.id,fresh()]));
   original.id=fresh();paintingIds.set(asset.paintingId,original.id);original.activeLayerId=layerIds.get(original.activeLayerId);
   for(const layer of original.layers)layer.id=layerIds.get(layer.id);
   importedPaintings[original.id]=original;
  }
  const copy={...asset,id:assetMap.get(id),paintingId:asset.paintingId?paintingIds.get(asset.paintingId):null};importedAssets[copy.id]=copy;
 }
 for(const keyword of newKeywords)if(keyword.iconAssetId)keyword.iconAssetId=assetMap.get(keyword.iconAssetId);
 const mapKeywords=target=>{for(const ref of target.keywords||[])ref.keywordId=keywordIds.get(ref.keywordId);};
 const mapEffects=recipe=>{for(const layer of recipe?.layers||[]){layer.id=fresh();if(layer.params?.assetId)layer.params.assetId=assetMap.get(layer.params.assetId);}};
 card.id=fresh();if(card.artAssetId)card.artAssetId=assetMap.get(card.artAssetId);mapKeywords(card);mapEffects(card.visualEffects);mapEffects(card.nameStyle?.visualEffects);
 for(const skill of skills(card)){
  skill.id=mapSkill(skill.id);remapSkillReferences(skill,mapSkill,()=>fresh());mapKeywords(skill);mapEffects(skill.nameStyle?.visualEffects);
 }
 const sx=project.settings.cardWidthMm/source.settings.cardWidthMm,sy=project.settings.cardHeightMm/source.settings.cardHeightMm;
 for(const element of card.elements){
  element.id=fresh();if(element.binding?.skillId)element.binding.skillId=mapSkill(element.binding.skillId);
  if(element.assetId)element.assetId=assetMap.get(element.assetId);mapEffects(element.style?.visualEffects);
  for(const key of ['x','w'])element.rect[key]*=sx;
  for(const key of ['y','h'])element.rect[key]*=sy;
 }
 const cards=replaceIndex<0?[...project.cards,card]:project.cards.map(clone);
 if(replaceIndex>=0){card.id=replaceCardId;cards[replaceIndex]=card;}
 const next={...project,cards,keywords:[...(project.keywords||[]),...newKeywords],assets:{...project.assets,...importedAssets},paintings:{...project.paintings,...importedPaintings}};
 // Refresh children on detached copies before publishing an overwrite.
 if(replaceIndex>=0)syncVariants(next,project);
 // Validate before publishing any new resource or card to the caller's draft.
 serializeProject(next);
 Object.assign(project,{cards:next.cards,keywords:next.keywords,assets:next.assets,paintings:next.paintings});
 return card;
}
