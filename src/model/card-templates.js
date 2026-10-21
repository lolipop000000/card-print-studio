import {clone,newId,ELEMENT_TYPES} from './types.js';
import {validateVisualEffects,upgradeVisualEffects} from './visual-effects.js';
import {textStyleProblems,TEXT_STYLE_KEYS} from './text-style.js';
import {isBlendMode} from './blend-modes.js';
import {syncVariants} from './variants.js';
import {syncSkillElements} from '../render/templates.js';

const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const safe=k=>!['__proto__','constructor','prototype'].includes(k);
const id=v=>typeof v==='string'&&v.length>0&&v.length<200&&safe(v);
const finite=(v,min=-Infinity,max=Infinity)=>typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max;
const own=(value,key)=>object(value)&&Object.hasOwn(value,key);
const pick=(value,keys)=>Object.fromEntries(keys.filter(key=>own(value,key)).map(key=>[key,clone(value[key])]));
const STYLE_KEYS=[...TEXT_STYLE_KEYS,'color','fill','strokeWidthMm','fit','cropX','cropY','visualEffects'];
const NAME_STYLE_KEYS=[...TEXT_STYLE_KEYS,'color','visualEffects'];
const BINDINGS={name:'text',hp:'text',art:'image','item.effect':'text','item.keywords':'keywords','skill.name':'text','skill.effect':'text','skill.dice':'dice','skill.keywords':'keywords'};
const roles=card=>[['passive',card.passives||[]],['active',card.actives||[]]].flatMap(([kind,list])=>list.map((skill,index)=>({kind,index,skill})));
const roleKey=role=>role.kind+':'+role.index;
export const cardTemplateNameKey=name=>String(name??'').normalize('NFC').trim();
function checkedName(value){
 const name=cardTemplateNameKey(value);if(!name||name.length>120||/[\r\n]/.test(name))throw Error('서식 이름은 줄바꿈 없이 1~120자로 입력하세요.');return name;
}
const dataUrl=(value,mime)=>typeof value==='string'&&value.startsWith('data:'+mime+';base64,')&&/^[A-Za-z0-9+/]+=*$/.test(value.slice(value.indexOf(',')+1));
function recipes(recipe){return [recipe.visualEffects,...recipe.elements.map(e=>e.style.visualEffects),...recipe.skillStyles.map(s=>s.nameStyle?.visualEffects)].filter(Boolean);}
function usedAssets(recipe){
 return new Set([...recipe.elements.filter(e=>!e.binding).map(e=>e.assetId),...recipes(recipe).flatMap(r=>(r.layers||[]).map(layer=>layer.params?.assetId))].filter(Boolean));
}

/** Standalone validation keeps saved visual recipes out of the project/card parser cycle. */
export function validateCardTemplates(list){
 if(list===undefined)return [];
 const problems=[],bad=(path,message)=>problems.push({code:'card-template',message:path+': '+message});
 const shape=(value,keys,path)=>{
  if(!object(value)){bad(path,'객체여야 합니다.');return false;}
  for(const key of Object.keys(value))if(!keys.includes(key))bad(path,'지원하지 않는 항목 “'+key+'”이 있습니다.');
  return true;
 };
 if(!Array.isArray(list)){bad('내 카드 서식 목록','배열이어야 합니다.');return problems;}
 const ids=new Set();
 for(const [index,saved] of list.entries()){
  const path='내 카드 서식 '+(index+1)+'번';
  if(!shape(saved,['id','name','kind','recipe','assets','paintings'],path))continue;
  if(!id(saved.id)||ids.has(saved.id))bad(path,'서로 다른 유효한 서식 ID가 필요합니다.');ids.add(saved.id);
  if(typeof saved.name!=='string'||!saved.name.trim()||saved.name!==saved.name.trim()||saved.name.length>120||/[\r\n]/.test(saved.name))bad(path,'이름은 앞뒤 공백과 줄바꿈 없이 1~120자여야 합니다.');
  if(!['monster','item'].includes(saved.kind))bad(path,'카드 종류는 monster 또는 item이어야 합니다.');
  const recipe=saved.recipe;
  if(!shape(recipe,['widthMm','heightMm','autoSkillLayout','elements','skillStyles','visualEffects'],path+' 디자인'))continue;
  for(const field of ['widthMm','heightMm'])if(!finite(recipe[field],.01))bad(path,'카드 크기는 0.01 mm 이상의 유한한 숫자여야 합니다.');
  if(typeof recipe.autoSkillLayout!=='boolean')bad(path,'기술 자동 맞춤은 true 또는 false여야 합니다.');
  const assets=object(saved.assets)?saved.assets:{},paintings=object(saved.paintings)?saved.paintings:{};
  if(!object(saved.assets))bad(path,'그림 자료는 객체여야 합니다.');if(!object(saved.paintings))bad(path,'그림 원본은 객체여야 합니다.');
  const referenced=new Set(),effect=(value,target,location)=>{
   for(const problem of validateVisualEffects(value,target))bad(location,problem.message);
   for(const layer of Array.isArray(value?.layers)?value.layers:[])if(layer?.params?.assetId!==null&&layer?.params?.assetId!==undefined){
    const assetId=layer.params.assetId;referenced.add(assetId);if(!id(assetId)||!Object.hasOwn(assets,assetId))bad(location,'이펙트 그림이 서식 자료에 없습니다.');
   }
  };
  const style=(value,location,target='text',name=false)=>{
   if(!shape(value,name?NAME_STYLE_KEYS:STYLE_KEYS,location))return;
   for(const problem of textStyleProblems(value))bad(location,problem.label+' '+problem.rule+'.');
   for(const key of ['color','fill'])if(value[key]!==undefined&&(typeof value[key]!=='string'||value[key].length>120))bad(location,'색은 120자 이내 문자열이어야 합니다.');
   if(name&&value.color!==undefined&&!/^#[0-9a-f]{6}$/i.test(value.color))bad(location,'이름 색은 #RRGGBB 형식이어야 합니다.');
   if(value.strokeWidthMm!==undefined&&!finite(value.strokeWidthMm,0))bad(location,'선 굵기는 0 이상의 유한한 숫자여야 합니다.');
   if(value.fit!==undefined&&!['contain','cover'].includes(value.fit))bad(location,'그림 맞춤은 contain 또는 cover여야 합니다.');
   for(const key of ['cropX','cropY'])if(value[key]!==undefined&&!finite(value[key],0,1))bad(location,'그림 자르기 위치는 0~1이어야 합니다.');
   if(value.visualEffects!==undefined){if(!['text','image','effect'].includes(target))bad(location,'이 요소에는 이펙트를 적용할 수 없습니다.');else effect(value.visualEffects,target,location+' 이펙트');}
  };
  const role=(value,location)=>{
   if(!shape(value,['kind','index'],location))return;
   if(!['passive','active'].includes(value.kind)||!Number.isSafeInteger(value.index)||value.index<0)bad(location,'기술 연결에는 passive 또는 active 종류와 0 이상의 순서가 필요합니다.');
  };
  if(recipe.visualEffects!==undefined)effect(recipe.visualEffects,'frame',path+' 프레임');
  if(!Array.isArray(recipe.elements))bad(path,'요소 목록은 배열이어야 합니다.');
  else for(const [i,e] of recipe.elements.entries()){
   const location=path+' 요소 '+(i+1)+'번';if(!shape(e,['type','rect','style','binding','content','assetId','dice'],location))continue;
   if(!ELEMENT_TYPES.includes(e.type))bad(location,'지원하는 요소 종류가 필요합니다.');
   if(shape(e.rect,['x','y','w','h'],location+' 위치·크기'))for(const key of ['x','y','w','h'])if(!finite(e.rect[key],['w','h'].includes(key)?.01:-Infinity))bad(location,'위치와 크기는 유한한 mm 값이며 폭과 높이는 0.01 이상이어야 합니다.');
   style(e.style,location+' 스타일',e.type);
   if(e.binding!==null){
    if(shape(e.binding,['field','skill'],location+' 연결')){
     const field=e.binding.field;if(BINDINGS[field]!==e.type)bad(location,'연결 필드와 요소 종류가 일치해야 합니다.');
     if(typeof field==='string'&&field.startsWith('skill.')){role(e.binding.skill,location+' 기술 연결');if(saved.kind!=='monster')bad(location,'몬스터만 기술에 연결할 수 있습니다.');}
     else if(e.binding.skill!==undefined)bad(location,'기술 이외의 연결에는 기술 순서를 넣을 수 없습니다.');
     if(field==='hp'&&saved.kind!=='monster'||typeof field==='string'&&field.startsWith('item.')&&saved.kind!=='item')bad(location,'연결 필드가 서식의 카드 종류와 다릅니다.');
    }
    if(['content','assetId','dice'].some(key=>own(e,key)))bad(location,'카드 정보에 연결된 요소에는 원본 카드 내용을 저장할 수 없습니다.');
   }else {
    if(e.content!==undefined&&(e.type!=='text'||typeof e.content!=='string'))bad(location,'장식 문구는 자유 글자의 문자열이어야 합니다.');
    if(e.assetId!==undefined){if(e.type!=='image')bad(location,'장식 그림은 자유 이미지에만 연결할 수 있습니다.');else if(e.assetId!==null){referenced.add(e.assetId);if(!id(e.assetId)||!Object.hasOwn(assets,e.assetId))bad(location,'장식 그림이 서식 자료에 없습니다.');}}
    if(e.dice!==undefined){
     if(e.type!=='dice')bad(location,'자유 주사위만 조건을 담을 수 있습니다.');
     else if(e.dice===null)continue;
     else if(!shape(e.dice,['faces','text','color'],location+' 장식 주사위'))bad(location,'자유 주사위만 조건을 담을 수 있습니다.');
     else if(!Array.isArray(e.dice.faces)||!e.dice.faces.every(v=>Number.isInteger(v)&&v>=1&&v<=6)||new Set(e.dice.faces).size!==e.dice.faces.length||typeof e.dice.text!=='string'||typeof e.dice.color!=='string')bad(location,'장식 주사위에는 중복 없는 1~6 눈과 문자열 문구·색이 필요합니다.');
    }
   }
   if(e.type==='rank'&&saved.kind!=='monster')bad(location,'등급 표시는 몬스터 서식에만 저장할 수 있습니다.');
  }
  const skillRoles=new Set();
  if(!Array.isArray(recipe.skillStyles))bad(path,'기술 이름 스타일은 배열이어야 합니다.');
  else for(const [i,entry] of recipe.skillStyles.entries()){
   const location=path+' 기술 이름 스타일 '+(i+1)+'번';if(!shape(entry,['kind','index','nameStyle'],location))continue;
   role(pick(entry,['kind','index']),location);const key=roleKey(entry);if(skillRoles.has(key))bad(location,'같은 기술 순서를 두 번 저장할 수 없습니다.');skillRoles.add(key);
   if(entry.nameStyle!==undefined)style(entry.nameStyle,location,'text',true);
  }
  const originals=new Set();
  for(const [key,a] of Object.entries(assets)){
   const location=path+' 그림 '+key;if(!shape(a,['id','mime','dataUrl','width','height','paintingId'],location))continue;
   if(!id(key)||a.id!==key)bad(location,'그림 자료 키와 유효한 ID가 같아야 합니다.');
   if(!referenced.has(key))bad(location,'서식에서 사용하지 않는 그림 자료입니다.');
   if(!['image/png','image/jpeg','image/webp'].includes(a.mime)||!dataUrl(a.dataUrl,a.mime))bad(location,'PNG/JPEG/WebP 형식과 일치하는 base64 그림이 필요합니다.');
   if(!Number.isSafeInteger(a.width)||a.width<1||!Number.isSafeInteger(a.height)||a.height<1)bad(location,'그림 크기는 1 px 이상의 안전한 정수여야 합니다.');
   if(a.paintingId!==null){originals.add(a.paintingId);if(!id(a.paintingId)||!Object.hasOwn(paintings,a.paintingId))bad(location,'편집 가능한 그림 원본을 찾을 수 없습니다.');}
  }
  for(const [key,d] of Object.entries(paintings)){
   const location=path+' 그림 원본 '+key;if(!shape(d,['id','width','height','activeLayerId','layers'],location))continue;
   if(!id(key)||d.id!==key||!originals.has(key))bad(location,'사용하는 그림 원본의 자료 키와 ID가 같아야 합니다.');
   if(!Number.isInteger(d.width)||d.width<64||d.width>4096||!Number.isInteger(d.height)||d.height<64||d.height>4096)bad(location,'원본 크기는 64~4096 px의 정수여야 합니다.');
   if(!Array.isArray(d.layers)||!d.layers.length){bad(location,'그림 레이어가 1장 이상 필요합니다.');continue;}
   const layers=new Set();
   for(const layer of d.layers){
    if(!shape(layer,['id','name','visible','locked','opacity','blendMode','png'],location+' 레이어'))continue;
    if(!id(layer.id)||layers.has(layer.id))bad(location,'레이어 ID는 유효하고 서로 달라야 합니다.');layers.add(layer.id);
    if(typeof layer.name!=='string'||typeof layer.visible!=='boolean'||typeof layer.locked!=='boolean'||!finite(layer.opacity,0,1)||layer.blendMode!==undefined&&!isBlendMode(layer.blendMode)||!dataUrl(layer.png,'image/png'))bad(location,'그림 레이어의 이름·표시·잠금·불투명도·혼합 모드·PNG를 확인하세요.');
   }
   if(!layers.has(d.activeLayerId))bad(location,'선택 레이어가 그림 원본에 없습니다.');
  }
 }
 return problems;
}
function assertTemplates(list){const problems=validateCardTemplates(list);if(problems.length)throw Object.assign(Error(problems[0].message),{problems});}
function findCard(project,cardId){const card=project.cards.find(c=>c.id===cardId);if(!card)throw Error('서식을 사용할 카드를 찾을 수 없어요.');return card;}
function findTemplate(project,templateId){const saved=project.cardTemplates?.find(t=>t.id===templateId);if(!saved)throw Error('저장한 카드 서식을 찾을 수 없어요.');return saved;}
function resourceSnapshot(project,recipe){
 const assets={},paintings={};
 for(const assetId of usedAssets(recipe)){
  const source=project.assets[assetId];if(!source)throw Error('서식 장식에 사용한 그림을 찾을 수 없어요.');
  assets[assetId]=pick(source,['id','mime','dataUrl','width','height','paintingId']);
  if(source.paintingId&&!Object.hasOwn(paintings,source.paintingId)){
   const original=project.paintings[source.paintingId];if(!original)throw Error('서식 그림의 편집 원본을 찾을 수 없어요.');
   paintings[source.paintingId]={...pick(original,['id','width','height','activeLayerId']),layers:original.layers.map(layer=>pick(layer,['id','name','visible','locked','opacity','blendMode','png']))};
  }
 }
 return {assets,paintings};
}
/** Capture only reusable visual data; gameplay and the card's own illustration never enter a recipe. */
export function saveCardTemplate(project,cardId,name,{replaceTemplateId=null,allowDuplicate=false}={}){
 assertTemplates(project.cardTemplates);name=checkedName(name);const card=findCard(project,cardId),list=project.cardTemplates||[];
 if(replaceTemplateId!==null&&!list.some(t=>t.id===replaceTemplateId))throw Error('덮어쓸 카드 서식이 없어졌어요.');
 if(!allowDuplicate&&replaceTemplateId===null&&list.some(t=>cardTemplateNameKey(t.name)===name))throw Error('같은 이름의 카드 서식이 있어요. 덮어쓰기 또는 추가를 선택하세요.');
 const sourceRoles=new Map(roles(card).map(({skill,...role})=>[skill.id,role]));
 const recipe={widthMm:project.settings.cardWidthMm,heightMm:project.settings.cardHeightMm,autoSkillLayout:card.autoSkillLayout??card.template!=='custom',
  elements:card.elements.map(e=>{
   const value={type:e.type,rect:clone(e.rect),style:pick(e.style,STYLE_KEYS),binding:e.binding?{field:e.binding.field,...(e.binding.skillId?{skill:clone(sourceRoles.get(e.binding.skillId))}:{})}:null};
   if(!e.binding)Object.assign(value,pick(e,['content','assetId','dice']));return value;
  }),skillStyles:roles(card).map(({skill,...role})=>({...role,...(skill.nameStyle?{nameStyle:pick(skill.nameStyle,NAME_STYLE_KEYS)}:{})})),
  ...(card.visualEffects?{visualEffects:clone(card.visualEffects)}:{})};
 const saved={id:replaceTemplateId??newId(),name,kind:card.kind,recipe,...resourceSnapshot(project,recipe)};assertTemplates([saved]);
 project.cardTemplates=replaceTemplateId===null?[...list,saved]:list.map(t=>t.id===replaceTemplateId?saved:t);return saved;
}
export function renameCardTemplate(project,templateId,name,{replaceTemplateId=null,allowDuplicate=false}={}){
 assertTemplates(project.cardTemplates);const saved=findTemplate(project,templateId);name=checkedName(name);
 if(replaceTemplateId!==null&&replaceTemplateId!==templateId)findTemplate(project,replaceTemplateId);
 if(!allowDuplicate&&replaceTemplateId===null&&project.cardTemplates.some(t=>t.id!==templateId&&cardTemplateNameKey(t.name)===name))throw Error('같은 이름의 카드 서식이 있어요. 덮어쓰기 또는 추가를 선택하세요.');
 project.cardTemplates=project.cardTemplates.filter(t=>t.id!==replaceTemplateId||t.id===templateId).map(t=>t.id===templateId?{...t,name}:t);return findTemplate(project,templateId);
}
export function removeCardTemplate(project,templateId){assertTemplates(project.cardTemplates);findTemplate(project,templateId);project.cardTemplates=project.cardTemplates.filter(t=>t.id!==templateId);}
function collectIds(value,used){
 if(!value||typeof value!=='object')return;
 for(const [key,item] of Object.entries(value)){if((key==='id'||key.endsWith('Id'))&&typeof item==='string')used.add(item);else if(item&&typeof item==='object')collectIds(item,used);}
}
/** Shared by template application and independent cloud-asset copies. */
export function remapTemplateResources(saved,fresh){
 const assetMap=new Map(),paintingMap=new Map(),assets={},paintings={};
 for(const [key,source] of Object.entries(saved.paintings)){
  const drawing=clone(source),layers=new Map(drawing.layers.map(layer=>[layer.id,fresh()]));drawing.id=fresh();paintingMap.set(key,drawing.id);drawing.activeLayerId=layers.get(drawing.activeLayerId);for(const layer of drawing.layers)layer.id=layers.get(layer.id);paintings[drawing.id]=drawing;
 }
 for(const [key,source] of Object.entries(saved.assets)){
  const a={...clone(source),id:fresh(),paintingId:source.paintingId?paintingMap.get(source.paintingId):null};assetMap.set(key,a.id);assets[a.id]=a;
 }
 const mapEffect=(value,target)=>{
  if(!value)return value;const result=upgradeVisualEffects(value,target);for(const layer of result.layers){layer.id=fresh();if(layer.params?.assetId)layer.params.assetId=assetMap.get(layer.params.assetId);}return result;
 };
 return {assets,paintings,assetMap,mapEffect};
}
/** Apply atomically to a draft. Call once inside store.edit for one undo/redo step. */
export function applyCardTemplate(project,cardId,templateId){
 assertTemplates(project.cardTemplates);const saved=findTemplate(project,templateId),original=findCard(project,cardId);
 if(original.kind!==saved.kind)throw Error('카드와 서식의 종류가 달라요. 같은 종류의 서식을 선택하세요.');
 const recipe=clone(saved.recipe),used=new Set();collectIds(project,used);
 const fresh=()=>{let value;do{value=newId();}while(used.has(value));used.add(value);return value;};
 const {assets,paintings,assetMap,mapEffect}=remapTemplateResources(saved,fresh);
 const target=clone(original),targetRoles=new Map(roles(target).map(({skill,...role})=>[roleKey(role),skill])),mappedSkills=new Set();
 const sx=project.settings.cardWidthMm/recipe.widthMm,sy=project.settings.cardHeightMm/recipe.heightMm;
 target.elements=[];target.template='custom';target.autoSkillLayout=recipe.autoSkillLayout;
 for(const e of recipe.elements){
  const copy={...e,id:fresh()};
  if(e.binding?.skill){const skill=targetRoles.get(roleKey(e.binding.skill));if(!skill)continue;mappedSkills.add(skill.id);copy.binding={field:e.binding.field,skillId:skill.id};}
  if(copy.assetId)copy.assetId=assetMap.get(copy.assetId);
  if(copy.style.visualEffects)copy.style.visualEffects=mapEffect(copy.style.visualEffects,copy.type);
  for(const key of ['x','w'])copy.rect[key]*=sx;for(const key of ['y','h'])copy.rect[key]*=sy;target.elements.push(copy);
 }
 // A smaller source design must not discard manually authored rows of extra target skills.
 for(const e of original.elements)if(e.binding?.skillId&&!mappedSkills.has(e.binding.skillId))target.elements.push(clone(e));
 for(const entry of recipe.skillStyles){const skill=targetRoles.get(roleKey(entry));if(!skill)continue;if(entry.nameStyle){skill.nameStyle=clone(entry.nameStyle);if(skill.nameStyle.visualEffects)skill.nameStyle.visualEffects=mapEffect(skill.nameStyle.visualEffects,'text');}else delete skill.nameStyle;}
 if(recipe.visualEffects)target.visualEffects=mapEffect(recipe.visualEffects,'frame');else delete target.visualEffects;
 let applied=syncSkillElements(target,project.settings,project.keywords||[]);
 let cards=project.cards.map(c=>c.id===cardId?applied:c);
 if(applied.variant){
  // Variant synchronization normally treats automatic row changes as derived. Record the
  // deliberate design replacement before that rule can discard authored global elements.
  const desiredElements=clone(applied.elements),staged={...project,cards:cards.map(clone),assets:{...project.assets,...assets},paintings:{...project.paintings,...paintings}};
  syncVariants(staged,project);applied=staged.cards.find(c=>c.id===cardId);applied.variant.overrides.elements={value:desiredElements};
  syncVariants(staged);cards=staged.cards;applied=cards.find(c=>c.id===cardId);
 }
 // Publish only after all resources and layout work succeeds.
 project.assets={...project.assets,...assets};project.paintings={...project.paintings,...paintings};project.cards=cards;return applied;
}
