import {clone,newId} from './types.js';
import {remapSkillReferences} from './skill-references.js';
import {applyLegacyVisualEffectPatch} from './visual-effects.js';
import {valueLabel,cardProblemLabel} from './problem-details.js';

export const VARIANT_FIELDS=['name','attribute','attributes','rank','baseHp','hpReduction','artAssetId','passives','actives','effect','keywords','template','autoSkillLayout','elements','visualEffects'];
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const safe=k=>!['__proto__','constructor','prototype'].includes(k);
const id=k=>typeof k==='string'&&k.length>0&&k.length<200&&safe(k);
const ownValue=(value,key)=>value&&Object.hasOwn(value,key)?value[key]:undefined;
const keyed=a=>Array.isArray(a)&&a.every(v=>object(v)&&id(v.id));

/** Arrays of skills/elements inherit by ID, so editing one effect keeps other fields shared. */
function difference(base,value,before,previous){
 if(equal(before,value))return previous?clone(previous):null;
 if(equal(base,value))return null;
 if(value===undefined)return {remove:true};
 if(previous&&Object.hasOwn(previous,'value'))return {value:clone(value)};
 if(object(base)&&object(value)){
  const old=object(before)?before:{},fields={};
  // Effect text and its reference offsets must inherit as one content value.
  const atomic=typeof value.effect==='string'&&[base,value,old].some(v=>Object.hasOwn(v,'skillReferences'));
  for(const key of new Set([...Object.keys(base),...Object.keys(value),...Object.keys(old)])){
   if(atomic&&(key==='effect'||key==='skillReferences'))continue;
   const patch=difference(ownValue(base,key),ownValue(value,key),ownValue(old,key),ownValue(previous?.fields,key));if(patch)fields[key]=patch;
  }
  if(atomic){
   const content=v=>({effect:v.effect,...(Object.hasOwn(v,'skillReferences')?{skillReferences:v.skillReferences}:{})});
   if(!equal(content(base),content(value))){
    if(equal(content(old),content(value))){for(const key of ['effect','skillReferences'])if(previous?.fields?.[key])fields[key]=clone(previous.fields[key]);}
    else {fields.effect={value:value.effect};fields.skillReferences=Object.hasOwn(value,'skillReferences')?{value:clone(value.skillReferences)}:{remove:true};}
   }
  }
  return Object.keys(fields).length?{fields}:null;
 }
 if(keyed(base)&&keyed(value)){
  const old=new Map(base.map(v=>[v.id,v])),next=new Map(value.map(v=>[v.id,v]));
  const last=keyed(before)?before:[],prior=new Map(last.map(v=>[v.id,v])),saved=previous?.list,edits={};
  for(const [key,patch] of Object.entries(saved?.edits||{}))if(!old.has(key)&&(!prior.has(key)||next.has(key)))edits[key]=clone(patch);
  for(const item of value)if(old.has(item.id)){
   const previousEdit=saved?.edits&&Object.hasOwn(saved.edits,item.id)?saved.edits[item.id]:null;
   const patch=difference(old.get(item.id),item,prior.get(item.id),previousEdit);if(patch)edits[item.id]=patch;
  }
  const removed=[...new Set([...(saved?.removed||[]).filter(id=>!next.has(id)),...base.filter(v=>prior.has(v.id)&&!next.has(v.id)).map(v=>v.id)])];
  const own=new Set(saved?.added.map(v=>v.id)||[]),added=value.filter(v=>!old.has(v.id)&&(!prior.has(v.id)||own.has(v.id))).map(clone);
  const natural=[...last.filter(v=>next.has(v.id)).map(v=>v.id),...value.filter(v=>!prior.has(v.id)).map(v=>v.id)];
  const order=equal(natural,value.map(v=>v.id))?saved?.order??null:value.map(v=>v.id);
  return Object.keys(edits).length||removed.length||added.length||order?{list:{edits,removed,added,order}}:null;
 }
 return {value:clone(value)};
}
function applyDifference(base,patch){
 if(patch.legacyEffect)return applyLegacyVisualEffectPatch(base,patch.legacyEffect,applyDifference);
 if(Object.hasOwn(patch,'value'))return clone(patch.value);
 if(patch.remove)return undefined;
 if(patch.fields){if(!object(base))return base;const value=clone(base);for(const [key,change] of Object.entries(patch.fields)){const next=applyDifference(ownValue(value,key),change);if(next===undefined)delete value[key];else value[key]=next;}if(typeof base.effect==='string'&&patch.fields.effect&&!patch.fields.skillReferences&&Object.hasOwn(base,'skillReferences'))delete value.skillReferences;return value;}
 const change=patch.list,removed=new Set(change.removed),value=(Array.isArray(base)?base:[]).filter(v=>!removed.has(v.id)).map(v=>Object.hasOwn(change.edits,v.id)?applyDifference(v,change.edits[v.id]):clone(v));
 for(const item of change.added)if(!value.some(v=>v.id===item.id))value.push(clone(item));
 if(change.order){const order=new Map(change.order.map((id,i)=>[id,i]));value.sort((a,b)=>(order.get(a.id)??Infinity)-(order.get(b.id)??Infinity));}
 return value;
}
function inheritedCard(parent,card){
 const value=clone(parent),mapping=card.variant.ids;
 const mapId=source=>Object.hasOwn(mapping,source)?mapping[source]:(mapping[source]=newId());
 for(const skill of [...value.passives||[],...value.actives||[]]){skill.id=mapId(skill.id);remapSkillReferences(skill,mapId);}
 for(const element of value.elements){
  const source=element.id;
  if(!Object.hasOwn(mapping,source)&&source.startsWith(parent.id+':')){
   const suffix=source.slice(parent.id.length+1),skillId=element.binding?.skillId;
   const key=skillId&&suffix.startsWith(skillId+':')?mapId(skillId)+suffix.slice(skillId.length):suffix;
   const mapped=card.id+':'+key;mapping[source]=id(mapped)?mapped:newId();
  }
  element.id=mapId(source);if(element.binding?.skillId)element.binding.skillId=mapId(element.binding.skillId);
 }
 value.id=card.id;value.quantity=card.quantity;value.variant=card.variant;return value;
}
export function createVariant(project,parentId,{label='Variant',quantity=1}={}){
 const parent=project.cards.find(c=>c.id===parentId);if(!parent)throw Error('Variant의 원본 카드를 찾을 수 없어요.');
 const card={id:newId(),quantity,variant:{parentId,label,overrides:{},ids:{}}};return inheritedCard(parent,card);
}
export function resetVariantOverride(card,field){
 if(!card.variant)return;
 if(field==='attribute'||field==='attributes'){delete card.variant.overrides.attribute;delete card.variant.overrides.attributes;}
 else if(field)delete card.variant.overrides[field];else card.variant.overrides={};
}
export function orderedCards(project){
 const result=[],seen=new Set(),visit=card=>{if(seen.has(card.id))return;seen.add(card.id);result.push(card);for(const child of project.cards)if(child.variant?.parentId===card.id)visit(child);};
 for(const card of project.cards)if(!card.variant)visit(card);
 for(const card of project.cards)visit(card);return result;
}
function normalizeAttributes(card,old){
 if(!['monster','item'].includes(card.kind))return null;
 // A scalar-only edit from an older caller replaces the complete selection.
 if(old&&!equal(card.attribute,old.attribute)&&equal(card.attributes,old.attributes)){delete card.attributes;return 'scalar';}
 if(Array.isArray(card.attributes)){
  if(card.attributes.length)card.attribute=card.attributes[0];else if(card.kind==='item')delete card.attribute;
  return old&&!equal(card.attributes,old.attributes)?'array':null;
 }
 return null;
}
/** Capture only the user's edits, then refresh inherited values in parent-first order. */
export function syncVariants(project,before){
 const cards=new Map(project.cards.map(c=>[c.id,c])),previous=new Map((before?.cards||[]).map(c=>[c.id,c]));
 const attributeEdits=new Map(project.cards.map(card=>[card.id,normalizeAttributes(card,previous.get(card.id))]));
 for(const card of project.cards){
  if(!card.variant)continue;
  if(!cards.has(card.variant.parentId)&&previous.has(card.variant.parentId)){delete card.variant;continue;}
  const old=previous.get(card.id),parent=cards.get(card.variant.parentId);
  if(!old?.variant||!parent||old.variant.parentId!==card.variant.parentId||!equal(old.variant.overrides,card.variant.overrides))continue;
  const inherited=inheritedCard(parent,card),skillEdit=!equal(old.passives,card.passives)||!equal(old.actives,card.actives)||!equal(old.keywords,card.keywords);
  const attributeEdit=attributeEdits.get(card.id);
  for(const field of VARIANT_FIELDS){
   if(field==='attribute'&&attributeEdit==='array'||field==='attributes'&&attributeEdit==='scalar')continue;
   if(equal(old[field],card[field]))continue;
   if(field==='elements'&&(card.template!=='custom'||card.autoSkillLayout&&(skillEdit||!equal(before.settings,project.settings)&&!old.variant.overrides.elements)))continue;
   const patch=difference(inherited[field],card[field],old[field],old.variant.overrides[field]);if(patch)card.variant.overrides[field]=patch;else delete card.variant.overrides[field];
  }
  if(attributeEdit==='array')delete card.variant.overrides.attribute;
  if(attributeEdit==='scalar')delete card.variant.overrides.attributes;
 }
 const done=new Set(),active=new Set();
 function resolve(card){
  if(done.has(card.id))return;const meta=card.variant;
  if(!meta){done.add(card.id);return;}
  if(active.has(card.id))throw Error('Variant 원본 연결이 순환하고 있어요.');
  const parent=cards.get(meta.parentId);if(!parent)throw Error('Variant의 원본 카드가 없습니다.');
  active.add(card.id);resolve(parent);
  const value=inheritedCard(parent,card);
  for(const [field,patch] of Object.entries(meta.overrides)){const next=applyDifference(value[field],patch);if(next===undefined)delete value[field];else value[field]=next;}
  // Legacy scalar overrides must replace an inherited modern selection too.
  if(meta.overrides.attribute&&!meta.overrides.attributes)delete value.attributes;
  normalizeAttributes(value);
  const skills=new Set([...value.passives||[],...value.actives||[]].map(s=>s.id));
  value.elements=value.elements.filter(e=>!e.binding?.skillId||skills.has(e.binding.skillId));
  for(const field of VARIANT_FIELDS){if(value[field]===undefined)delete card[field];else card[field]=value[field];}
  card.kind=parent.kind;active.delete(card.id);done.add(card.id);
 }
 for(const card of project.cards)resolve(card);
 // Repair files saved while item badges were omitted, without rebuilding manual layouts.
 for(const card of project.cards)if(card.kind==='item'&&!card.elements.some(e=>e.type==='attribute')){
  const sx=project.settings.cardWidthMm/63,sy=project.settings.cardHeightMm/88;
  const id=card.variant?(card.variant.ids['item-candle-badge']??=newId()):newId();
  card.elements.push({id,type:'attribute',rect:{x:49*sx,y:3.5*sy,w:7.8*sx,h:9*sy},binding:null,style:{fontPt:Math.max(7,project.settings.minFontPt),color:'#253d32',align:'center'}});
 }
 return project;
}
function validJson(value,depth=0){
 if(depth>40)return false;if(value===null||['string','boolean'].includes(typeof value))return true;if(typeof value==='number')return Number.isFinite(value);
 if(Array.isArray(value))return value.every(v=>validJson(v,depth+1));
 return object(value)&&Object.entries(value).every(([k,v])=>safe(k)&&validJson(v,depth+1));
}
function validPatch(patch,depth=0){
 if(!object(patch)||depth>40)return false;
 if(patch.legacyEffect)return Object.keys(patch).length===1&&object(patch.legacyEffect.fields)&&validPatch(patch.legacyEffect,depth+1);
 if(Object.hasOwn(patch,'value'))return Object.keys(patch).length===1&&validJson(patch.value);
 if(patch.remove===true)return Object.keys(patch).length===1;
 if(object(patch.fields))return Object.keys(patch).length===1&&Object.entries(patch.fields).every(([k,v])=>safe(k)&&validPatch(v,depth+1));
 const l=patch.list;
 return Object.keys(patch).length===1&&object(l)&&Object.keys(l).every(k=>['edits','removed','added','order'].includes(k))&&object(l.edits)&&Object.entries(l.edits).every(([k,v])=>id(k)&&validPatch(v,depth+1))&&Array.isArray(l.removed)&&l.removed.every(id)&&keyed(l.added)&&validJson(l.added)&&(l.order===null||Array.isArray(l.order)&&l.order.every(id));
}
const diagnostic=(path,value,rule)=>path+' 값 '+valueLabel(value)+'. '+rule+'.';
const idRule='ID는 1~199자의 문자열이어야 하며 예약 ID __proto__, constructor, prototype은 사용할 수 없습니다';
function jsonDiagnostic(value,path,depth=0){
 if(depth>40)return diagnostic(path+' 중첩 깊이',depth,'40 이하여야 합니다');
 if(value===null||['string','boolean'].includes(typeof value))return null;
 if(typeof value==='number')return Number.isFinite(value)?null:diagnostic(path,value,'JSON 숫자는 유한한 숫자여야 합니다');
 if(Array.isArray(value)){
  for(let index=0;index<value.length;index++)if(index in value){const detail=jsonDiagnostic(value[index],path+' '+(index+1)+'번',depth+1);if(detail)return detail;}
  return null;
 }
 if(object(value)){
  for(const [key,item] of Object.entries(value)){
   if(!safe(key))return diagnostic(path+' 객체 키',key,'예약 키 __proto__, constructor, prototype은 사용할 수 없습니다');
   const detail=jsonDiagnostic(item,path+'.'+valueLabel(key),depth+1);if(detail)return detail;
  }
  return null;
 }
 return diagnostic(path,value,'null, 문자열, true/false, 유한한 숫자, 배열 또는 객체인 JSON 값이어야 합니다');
}
/** Explain a rejected patch while validPatch remains the acceptance gate. */
function patchDiagnostic(patch,path,depth=0){
 if(!object(patch))return diagnostic(path,patch,'변경 내용을 나타내는 객체여야 합니다');
 if(depth>40)return diagnostic(path+' 중첩 깊이',depth,'40 이하여야 합니다');
 const keys=Object.keys(patch);
 if(keys.length!==1)return diagnostic(path+' 변경 형태 수 ('+keys.map(valueLabel).join(', ')+')',keys.length,'value, remove, fields, list, legacyEffect 중 하나의 형태만 있어야 합니다 (필드 1개)');
 if(patch.legacyEffect){
  if(!object(patch.legacyEffect.fields))return diagnostic(path+'.legacyEffect.fields',patch.legacyEffect.fields,'이전 이펙트의 필드 변경 객체여야 합니다');
  return patchDiagnostic(patch.legacyEffect,path+'.legacyEffect',depth+1);
 }
 if(Object.hasOwn(patch,'value'))return jsonDiagnostic(patch.value,path+'.value');
 if(patch.remove===true)return null;
 if(object(patch.fields)){
  for(const [key,change] of Object.entries(patch.fields)){
   if(!safe(key))return diagnostic(path+'.fields 변경 키',key,'예약 키 __proto__, constructor, prototype은 사용할 수 없습니다');
   const detail=patchDiagnostic(change,path+'.fields.'+valueLabel(key),depth+1);if(detail)return detail;
  }
  return null;
 }
 if(Object.hasOwn(patch,'remove'))return diagnostic(path+'.remove',patch.remove,'삭제 변경은 true여야 합니다');
 if(Object.hasOwn(patch,'fields'))return diagnostic(path+'.fields',patch.fields,'필드별 변경 객체여야 합니다');
 if(!Object.hasOwn(patch,'list'))return diagnostic(path+' 변경 형태',keys[0],'value, remove, fields, list, legacyEffect 중 하나여야 합니다');
 const list=patch.list,location=path+'.list';
 if(!object(list))return diagnostic(location,list,'edits, removed, added, order가 있는 목록 변경 객체여야 합니다');
 for(const key of Object.keys(list))if(!['edits','removed','added','order'].includes(key))return diagnostic(location+' 필드',key,'edits, removed, added, order만 사용할 수 있습니다');
 if(!object(list.edits))return diagnostic(location+'.edits',list.edits,'수정할 항목 ID를 키로 하는 객체여야 합니다');
 for(const [index,[key,change]] of Object.entries(list.edits).entries()){
  const item=location+'.edits '+(index+1)+'번 (ID '+valueLabel(key)+')';
  if(!id(key))return diagnostic(item+' 수정 항목 ID',key,idRule);
  const detail=patchDiagnostic(change,item,depth+1);if(detail)return detail;
 }
 if(!Array.isArray(list.removed))return diagnostic(location+'.removed',list.removed,'삭제할 ID 문자열의 배열이어야 합니다');
 for(let index=0;index<list.removed.length;index++)if(index in list.removed&&!id(list.removed[index]))return diagnostic(location+'.removed '+(index+1)+'번 삭제 ID',list.removed[index],idRule);
 if(!Array.isArray(list.added))return diagnostic(location+'.added',list.added,'추가할 항목 객체의 배열이어야 합니다');
 for(let index=0;index<list.added.length;index++)if(index in list.added){
  const item=list.added[index],itemPath=location+'.added '+(index+1)+'번 (ID '+valueLabel(item?.id)+')';
  if(!object(item))return diagnostic(itemPath,item,'유효한 ID가 있는 추가 항목 객체여야 합니다');
  if(!id(item.id))return diagnostic(itemPath+' 추가 항목 ID',item.id,idRule);
 }
 const jsonProblem=jsonDiagnostic(list.added,location+'.added');if(jsonProblem)return jsonProblem;
 if(list.order!==null){
  if(!Array.isArray(list.order))return diagnostic(location+'.order',list.order,'기존 순서 유지는 null, 새 순서는 ID 문자열의 배열이어야 합니다');
  for(let index=0;index<list.order.length;index++)if(index in list.order&&!id(list.order[index]))return diagnostic(location+'.order '+(index+1)+'번 순서 ID',list.order[index],idRule);
 }
 return null;
}
function variantDiagnostic(card,cards){
 const variant=card.variant;
 if(!object(variant))return diagnostic('Variant 정보',variant,'원본 ID, 라벨, ID 대응표, 변경 내용을 가진 객체여야 합니다');
 if(!id(variant.parentId))return diagnostic('원본 카드 ID',variant.parentId,idRule);
 if(!cards.has(variant.parentId))return diagnostic('원본 카드 ID',variant.parentId,'이 프로젝트에 존재하는 카드 ID여야 합니다');
 if(cards.get(variant.parentId).kind!==card.kind)return diagnostic('카드 종류',card.kind,'원본 카드 ID '+valueLabel(variant.parentId)+'의 종류 '+valueLabel(cards.get(variant.parentId).kind)+'와 같아야 합니다');
 if(typeof variant.label!=='string')return diagnostic('Variant 라벨',variant.label,'문자열이어야 합니다');
 if(variant.label.length>120)return diagnostic('Variant 라벨 길이',variant.label.length,'120자 이하여야 합니다');
 if(!object(variant.ids))return diagnostic('ID 대응표',variant.ids,'원본 ID를 키로 하고 새 ID를 값으로 하는 객체여야 합니다');
 for(const [index,[key,value]] of Object.entries(variant.ids).entries()){
  const location='ID 대응 '+(index+1)+'번 (원본 ID '+valueLabel(key)+')';
  if(!id(key))return diagnostic(location+' 원본 ID',key,idRule);
  if(!id(value))return diagnostic(location+' 새 ID',value,idRule);
 }
 if(!object(variant.overrides))return diagnostic('변경 내용',variant.overrides,'변경할 카드 항목을 키로 하는 객체여야 합니다');
 for(const [index,[key,patch]] of Object.entries(variant.overrides).entries()){
  const path='변경 내용 '+(index+1)+'번 '+valueLabel(key);
  if(!VARIANT_FIELDS.includes(key))return diagnostic(path+' 변경 항목',key,VARIANT_FIELDS.join(', ')+' 중 하나여야 합니다');
  if(!validPatch(patch))return patchDiagnostic(patch,path);
 }
 return null;
}
export function validateVariants(project){
 const problems=[],cards=new Map(project.cards.filter(object).map(c=>[c.id,c]));
 const bad=(card,detail)=>problems.push({code:'variant',message:cardProblemLabel(card)+' (카드 '+(project.cards.indexOf(card)+1)+'번, ID '+valueLabel(card.id)+') · Variant: '+detail,cardId:card.id});
 for(const card of cards.values()){
  const v=card.variant;if(v===undefined)continue;
  if(!object(v)||!id(v.parentId)||!cards.has(v.parentId)||cards.get(v.parentId).kind!==card.kind||typeof v.label!=='string'||v.label.length>120||!object(v.ids)||!Object.entries(v.ids).every(([k,value])=>id(k)&&id(value))||!object(v.overrides)||!Object.entries(v.overrides).every(([k,patch])=>VARIANT_FIELDS.includes(k)&&validPatch(patch))){bad(card,variantDiagnostic(card,cards));continue;}
  const seen=new Set([card.id]),chain=[card.id];let parent=cards.get(v.parentId);
  while(parent){
   if(seen.has(parent.id)){
    const order=chain.length<=8?chain:[...chain.slice(0,4),'…',...chain.slice(-3)];
    bad(card,diagnostic('순환 연결의 반복 카드 ID',parent.id,'원본 연결은 순환할 수 없습니다. 현재 연결 순서: '+[...order,parent.id].map(valueLabel).join(' → ')));break;
   }
   seen.add(parent.id);chain.push(parent.id);parent=cards.get(parent.variant?.parentId);
  }
 }
 return problems;
}
