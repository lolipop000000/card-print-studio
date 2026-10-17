import {newId} from './types.js';
import {valueLabel} from './problem-details.js';

export const cardSkills=card=>[...(card?.passives||[]),...(card?.actives||[])];
const id=value=>typeof value==='string'&&value.length>0&&value.length<200&&!['__proto__','constructor','prototype'].includes(value);
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const boundary=(text,at)=>!(at>0&&at<text.length&&/[\uD800-\uDBFF]/.test(text[at-1])&&/[\uDC00-\uDFFF]/.test(text[at]));

/** Stored ranges use UTF-16 offsets, just like a textarea's selectionStart/end. */
export function validateSkillReferences(skill,extra={}){
 if(skill.skillReferences===undefined)return [];
 const context='스킬 '+(typeof skill.name==='string'?valueLabel(skill.name):'이름 없음')+' (ID '+valueLabel(skill.id)+')';
 const idRule='ID는 1~199자의 문자열이어야 하며 예약 ID __proto__, constructor, prototype은 사용할 수 없습니다';
 const bad=(field,value,rule,index,ref)=>[{code:'skill-reference-range',message:context+(index===undefined?'':' · 참조 '+(index+1)+'번 (ID '+valueLabel(ref?.id)+')')+': '+field+' 값 '+valueLabel(value)+'. '+rule+'.',...extra}];
 if(!Array.isArray(skill.skillReferences))return bad('스킬 참조 목록',skill.skillReferences,'참조 객체의 배열이어야 합니다');
 if(typeof skill.effect!=='string')return bad('스킬 효과',skill.effect,'참조 위치를 계산할 수 있는 문자열이어야 합니다');
 const ids=new Set();let end=0;
 for(const [index,ref] of skill.skillReferences.entries()){
  const fail=(field,value,rule)=>bad(field,value,rule,index,ref);
  if(!object(ref))return fail('참조 정보',ref,'참조 ID, 대상 스킬 ID, 시작·끝 위치가 있는 객체여야 합니다');
  if(!id(ref.id))return fail('참조 ID',ref.id,idRule);
  if(ids.has(ref.id))return fail('참조 ID',ref.id,'이전 참조 '+(skill.skillReferences.findIndex(previous=>previous?.id===ref.id)+1)+'번과 중복된 ID입니다. 참조마다 서로 다른 ID가 필요합니다');
  if(!id(ref.skillId))return fail('대상 스킬 ID',ref.skillId,idRule);
  if(!Number.isInteger(ref.start))return fail('시작 위치',ref.start,'0 이상의 정수여야 합니다');
  if(!Number.isInteger(ref.end))return fail('끝 위치',ref.end,'시작 위치보다 큰 정수여야 합니다');
  if(ref.start<0)return fail('시작 위치',ref.start,'0 이상이어야 합니다');
  if(ref.start<end)return fail('시작 위치',ref.start,'이전 참조 '+index+'번의 끝 위치 '+valueLabel(end)+' 이상이어야 합니다. 참조는 위치 순서대로 배치하고 서로 겹치면 안 됩니다');
  if(ref.end<=ref.start)return fail('끝 위치',ref.end,'시작 위치 '+valueLabel(ref.start)+'보다 커야 합니다');
  if(ref.end>skill.effect.length)return fail('끝 위치',ref.end,'효과 텍스트 길이 '+skill.effect.length+' (UTF-16) 이하여야 합니다');
  if(!boundary(skill.effect,ref.start))return fail('시작 위치',ref.start,'문자 사이의 경계여야 합니다. 현재 위치는 이모지 등 UTF-16 문자 중간입니다');
  if(!boundary(skill.effect,ref.end))return fail('끝 위치',ref.end,'문자 사이의 경계여야 합니다. 현재 위치는 이모지 등 UTF-16 문자 중간입니다');
  ids.add(ref.id);end=ref.end;
 }
 return [];
}
/** Resolve names without changing the user's stored effect or unrelated prose. */
export function resolveSkillEffect(card,skill){
 const source=skill?.effect||'',refs=skill?.skillReferences||[];
 if(!refs.length)return {text:source,skillReferences:[],missing:[]};
 const skills=new Map(cardSkills(card).map(s=>[s.id,s])),resolved=[],missing=[];let text='',at=0;
 for(const ref of refs){
  text+=source.slice(at,ref.start);const target=skills.get(ref.skillId),label=target?.name||source.slice(ref.start,ref.end),start=text.length;
  text+=label;resolved.push({id:ref.id,skillId:ref.skillId,start,end:text.length});if(!target)missing.push(ref);at=ref.end;
 }
 return {text:text+source.slice(at),skillReferences:resolved,missing};
}

export function materializeSkillEffect(card,skill){
 if(!skill.skillReferences?.length)return;
 const resolved=resolveSkillEffect(card,skill);skill.effect=resolved.text;skill.skillReferences=resolved.skillReferences;
}

/** One replacement handles typing, insertion and keyword changes consistently. */
export function replaceSkillText(skill,start,end,text){
 const delta=text.length-(end-start);
 if(skill.skillReferences!==undefined)skill.skillReferences=skill.skillReferences.flatMap(ref=>{
  if(ref.end<=start)return [{...ref}];
  if(ref.start>=end)return [{...ref,start:ref.start+delta,end:ref.end+delta}];
  return [];
 });
 skill.effect=skill.effect.slice(0,start)+text+skill.effect.slice(end);return start+text.length;
}
function editedRange(before,after,selection){
 if(selection&&Number.isInteger(selection.start)&&Number.isInteger(selection.end)){
  let {start,end}=selection;const removed=before.length-after.length;
  if(start===end&&removed>0&&selection.inputType?.startsWith('delete')){
   if(selection.inputType.endsWith('Backward'))start-=removed;else if(selection.inputType.endsWith('Forward'))end+=removed;
  }
  const length=after.length-before.length+end-start;
  if(start>=0&&end>=start&&end<=before.length&&length>=0&&after.slice(0,start)===before.slice(0,start)&&after.slice(start+length)===before.slice(end))return {start,end,text:after.slice(start,start+length)};
 }
 let start=0;while(start<before.length&&start<after.length&&before[start]===after[start])start++;
 let end=before.length,nextEnd=after.length;while(end>start&&nextEnd>start&&before[end-1]===after[nextEnd-1]){end--;nextEnd--;}
 if(!boundary(before,start)||!boundary(after,start))start--;
 if(!boundary(before,end)){end++;nextEnd++;}
 return {start,end,text:after.slice(start,nextEnd)};
}
export function editSkillEffect(card,skill,text,selection){
 materializeSkillEffect(card,skill);const edit=editedRange(skill.effect,text,selection);replaceSkillText(skill,edit.start,edit.end,edit.text);
}
export function insertSkillReference(card,skill,skillId,start,end){
 const target=cardSkills(card).find(s=>s.id===skillId);if(!target)throw Error('참조할 스킬이 없어요.');
 materializeSkillEffect(card,skill);start??=skill.effect.length;end??=start;const name=target.name||'이름 없는 스킬',caret=replaceSkillText(skill,start,end,name);
 (skill.skillReferences??=[]).push({id:newId(),skillId,start,end:caret});skill.skillReferences.sort((a,b)=>a.start-b.start);return caret;
}
/** Keyword matching applies only to authored prose outside explicit references. */
export function rewritePlainSkillText(skill,rewrite){
 if(!skill.skillReferences?.length){skill.effect=rewrite(skill.effect);return;}
 let text='',at=0;const refs=[];
 for(const ref of skill.skillReferences){
  text+=rewrite(skill.effect.slice(at,ref.start));const start=text.length;text+=skill.effect.slice(ref.start,ref.end);refs.push({...ref,start,end:text.length});at=ref.end;
 }
 skill.effect=text+rewrite(skill.effect.slice(at));skill.skillReferences=refs;
}
export function remapSkillReferences(skill,mapSkillId,mapReferenceId=mapSkillId){
 if(skill.skillReferences!==undefined)skill.skillReferences=skill.skillReferences.map(ref=>({...ref,id:mapReferenceId(ref.id),skillId:mapSkillId(ref.skillId)}));
}
/** Capture visible names before deletion, including mapped Variant targets and own prose. */
export function preserveSkillReferenceNames(card,skillId,project){
 const seen=new Set(),visit=(current,targetId)=>{
  if(seen.has(current.id))return;seen.add(current.id);
  for(const skill of cardSkills(current))if(skill.skillReferences?.some(ref=>ref.skillId===targetId))materializeSkillEffect(current,skill);
  for(const child of project?.cards||[])if(child.variant?.parentId===current.id&&Object.hasOwn(child.variant.ids,targetId))visit(child,child.variant.ids[targetId]);
 };
 visit(card,skillId);
}
/** A protected skill label never counts as a keyword occurrence in plain prose. */
export function hasPlainSkillText(skill,text){
 let start=0;
 for(const ref of skill.skillReferences||[]){if(skill.effect.slice(start,ref.start).includes(text))return true;start=ref.end;}
 return skill.effect.slice(start).includes(text);
}
