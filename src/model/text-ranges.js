import {clone,newId} from './types.js';

const segmenter=new Intl.Segmenter(undefined,{granularity:'grapheme'});
export function textBoundaries(text){return [...new Set([0,...[...segmenter.segment(text)].map(s=>s.index),text.length])];}
export function snapTextSelection(text,start,end=start){
 const points=textBoundaries(text),clamp=n=>Math.max(0,Math.min(text.length,Number.isFinite(n)?n:0));start=clamp(start);end=Math.max(start,clamp(end));
 if(start===end){const at=start===text.length?Math.max(0,points.length-2):Math.max(0,points.findIndex(p=>p>start)-1);return {start:points[at],end:points[at+1]??points[at]};}
 return {start:points.findLast(p=>p<=start)??0,end:points.find(p=>p>=end)??text.length};
}
export const getTextRanges=(owner,field)=>owner?.textRanges?.[field]||[];
/** Offsets use the same UTF-16 coordinates as text inputs, but never split a visible character. */
export function setTextRange(owner,field,start,end,style={}){
 const text=owner[field]||'',selection=snapTextSelection(text,start,end);if(selection.start===selection.end)throw Error('효과를 줄 글자를 먼저 입력하세요.');
 const exact=getTextRanges(owner,field).find(r=>r.start===selection.start&&r.end===selection.end);
 if(exact){Object.assign(exact.style,clone(style));return exact;}
 const next=[];
 for(const r of getTextRanges(owner,field)){
  if(r.end<=selection.start||r.start>=selection.end)next.push(r);
  else {
   if(r.start<selection.start)next.push({...clone(r),end:selection.start});
   if(r.end>selection.end)next.push({...clone(r),id:r.start<selection.start?newId():r.id,start:selection.end});
  }
 }
 const range={id:newId(),...selection,style:clone(style)};next.push(range);next.sort((a,b)=>a.start-b.start);
 (owner.textRanges??={})[field]=next;return range;
}
export function removeTextRange(owner,field,id){if(owner.textRanges?.[field])owner.textRanges[field]=owner.textRanges[field].filter(r=>r.id!==id);}
export function rebaseTextRanges(ranges,start,end,text){
 const delta=text.length-(end-start);
 return ranges.flatMap(range=>{
  const r=clone(range);
  if(r.end<=start)return [r];
  if(r.start>=end)return [{...r,start:r.start+delta,end:r.end+delta}];
  if(r.start<=start&&r.end>=end){r.end+=delta;return r.end>r.start?[r]:[];}
  if(r.start<start)return [{...r,end:start}];
  if(r.end>end)return [{...r,start:start+text.length,end:r.end+delta}];
  return [];
 });
}
export function normalizeTextRanges(ranges,text){
 const points=textBoundaries(text);let previous=0;
 return ranges.flatMap(range=>{
  const r={...range,start:Math.max(previous,points.findLast(p=>p<=range.start)??0),end:points.find(p=>p>=range.end)??text.length};
  if(r.end<=r.start)return [];previous=r.end;return [r];
 });
}
export function replaceText(owner,field,start,end,text){
 const before=owner[field]||'';if(!Number.isInteger(start)||!Number.isInteger(end)||start<0||end<start||end>before.length)throw Error('글자 선택 위치가 현재 텍스트 범위를 벗어났어요. 다시 선택하세요.');
 const after=before.slice(0,start)+text+before.slice(end);owner[field]=after;
 if(owner.textRanges?.[field]){
  owner.textRanges[field]=normalizeTextRanges(rebaseTextRanges(owner.textRanges[field],start,end,text),after);
 }
 return start+text.length;
}
export function editedTextRange(before,after,selection){
 if(selection&&Number.isInteger(selection.start)&&Number.isInteger(selection.end)){
  let {start,end}=selection;const removed=before.length-after.length;
  if(start===end&&removed>0&&selection.inputType?.startsWith('delete')){if(selection.inputType.endsWith('Backward'))start-=removed;else if(selection.inputType.endsWith('Forward'))end+=removed;}
  const length=after.length-before.length+end-start;
  if(start>=0&&end>=start&&end<=before.length&&length>=0&&after.slice(0,start)===before.slice(0,start)&&after.slice(start+length)===before.slice(end))return {start,end,text:after.slice(start,start+length)};
 }
 let start=0;while(start<before.length&&start<after.length&&before[start]===after[start])start++;
 let end=before.length,nextEnd=after.length;while(end>start&&nextEnd>start&&before[end-1]===after[nextEnd-1]){end--;nextEnd--;}
 const points=textBoundaries(before),nextPoints=textBoundaries(after);start=Math.min(points.findLast(p=>p<=start)??0,nextPoints.findLast(p=>p<=start)??0);
 while(!points.includes(end)||!nextPoints.includes(nextEnd)){if(end<before.length)end++;if(nextEnd<after.length)nextEnd++;if(end===before.length&&nextEnd===after.length)break;}
 return {start,end,text:after.slice(start,nextEnd)};
}
export function editText(owner,field,text,selection){const edit=editedTextRange(owner[field]||'',text,selection);return replaceText(owner,field,edit.start,edit.end,edit.text);}
export function textRangeOwners(card){return [card,...(card.passives||[]),...(card.actives||[]),...(card.elements||[])];}
export function remapTextRanges(owner,mapId,mapRecipe=()=>{}){for(const ranges of Object.values(owner.textRanges||{}))for(const range of ranges){range.id=mapId(range.id);mapRecipe(range.style?.visualEffects);}}
export function textFieldForElement(card,element){
 if(element?.type!=='text')return null;
 const binding=element.binding;
 if(!binding)return {owner:element,field:'content',prefix:''};
 if(binding.field==='name')return {owner:card,field:'name',prefix:''};
 if(binding.field==='item.effect')return {owner:card,field:'effect',prefix:''};
 if(['skill.name','skill.effect'].includes(binding.field)){
  const skill=[...(card.passives||[]),...(card.actives||[])].find(s=>s.id===binding.skillId);if(!skill)return null;
  return {owner:skill,field:binding.field==='skill.name'?'name':'effect',prefix:binding.field==='skill.name'?((card.passives||[]).includes(skill)?'패시브 · ':'액티브 · '):''};
 }
 return null;
}
export function textRangeTarget(project,{cardId,back=false,elementId,textRangeId}){
 const card=back?project.back:project.cards.find(c=>c.id===cardId),element=card?.elements.find(e=>e.id===elementId),field=textFieldForElement(card,element);
 const range=field&&getTextRanges(field.owner,field.field).find(r=>r.id===textRangeId);
 if(!range)throw Error('효과를 줄 글자 구간이 없어졌어요. 글자를 다시 선택하세요.');
 return {card,element,...field,range};
}
/** Explicit character choices override shared skill-name styling only where selected. */
export function mergeTextSpans(text,shared=[],ranges=[],offset=0){
 const visible=ranges.filter(r=>Object.entries(r.style||{}).some(([key,value])=>key==='visualEffects'?value?.layers?.some(layer=>layer.enabled&&layer.opacity>0):value!==undefined));
 const explicit=visible.map(r=>({...r,start:r.start+offset,end:r.end+offset,rangeId:r.id})),all=[...shared,...explicit];if(!all.length)return [];
 const boundaries=[...new Set(all.flatMap(r=>[Math.max(0,r.start),Math.min(text.length,r.end)]))].sort((a,b)=>a-b),result=[];
 for(let i=0;i<boundaries.length-1;i++){
  const start=boundaries[i],end=boundaries[i+1];if(start>=end)continue;
  const base=shared.find(r=>r.start<=start&&r.end>=end),own=explicit.find(r=>r.start<=start&&r.end>=end);if(!base&&!own)continue;
  const source=own||base;result.push({...source,start,end,style:{...base?.style,...own?.style},id:source.id+':'+start});
 }
 return result;
}
