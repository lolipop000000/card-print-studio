import {el,button} from './dom.js';
import {resolveSkillEffect,editSkillEffect,insertSkillReference,materializeSkillEffect} from '../model/skill-references.js';

// Store transient controls separately from project data. The owner survives
// inspector renders; card and skill ids keep different descriptions independent.
const editorStates=new WeakMap();
function referenceState(owner,card,skill,text){
 let cards=editorStates.get(owner);if(!cards)editorStates.set(owner,cards=new Map());
 let skills=cards.get(card.id);if(!skills)cards.set(card.id,skills=new Map());
 let state=skills.get(skill.id);if(!state)skills.set(skill.id,state={range:null,referenceId:''});
 // Undo, loading, and external name changes must not reuse offsets into old text.
 if(state.range?.text!==text)state.range=null;
 return state;
}

export function skillEffectField(card,skill,change,id,owner=card){
 let view=resolveSkillEffect(card,skill);const state=referenceState(owner,card,skill,view.text);let editRange=null,composing=false,timer,lastValue=view.text;
 const capture=event=>{editRange={start:input.selectionStart,end:input.selectionEnd,inputType:event?.inputType};};
 const remember=()=>{if(input.isConnected&&!composing)state.range={start:input.selectionStart,end:input.selectionEnd,direction:input.selectionDirection,text:input.value};};
 const commit=()=>{
  clearTimeout(timer);if(composing||!input.isConnected)return;
  // Replacing a selected name with identical letters still unlinks that reference.
  const overlaps=editRange&&editRange.end>editRange.start&&view.skillReferences.some(ref=>ref.start<editRange.end&&ref.end>editRange.start);
  remember();if(input.value===lastValue&&!overlaps){editRange=null;return;}
  lastValue=input.value;const edit=editRange;editRange=null;change((target,current)=>{editSkillEffect(current,target,lastValue,edit);view=resolveSkillEffect(current,target);});
 };
 const input=el('textarea',{id,value:view.text,rows:3,class:'skill-effect',
  onfocus:remember,onblur:remember,onselect:remember,onkeyup:remember,onpointerup:remember,
  onbeforeinput:event=>{if(!composing)capture(event);},
  oncompositionstart:event=>{composing=true;input.dataset.composing='true';clearTimeout(timer);capture(event);},
  oncompositionend:event=>{composing=false;delete input.dataset.composing;if(!event.data&&input.value===lastValue){editRange=null;remember();return;}timer=setTimeout(commit,0);},
  oninput:event=>{if(!event.isComposing)commit();},onchange:commit});
 if(state.range)input.setSelectionRange(state.range.start,state.range.end,state.range.direction);
 return el('label',{class:'field',htmlFor:id},el('span',{},'효과 · 대미지'),input);
}
export function skillReferenceControls(card,skill,change,effectInputId,owner=card){
 const view=resolveSkillEffect(card,skill),state=referenceState(owner,card,skill,view.text);
 const candidates=[...card.passives.map((s,i)=>({skill:s,label:'패시브 '+(i+1)})),...card.actives.map((s,i)=>({skill:s,label:'액티브 '+(i+1)}))].filter(item=>item.skill.id!==skill.id);
 const host=el('div',{class:'skill-keywords skill-references'},el('p',{class:'keyword-label'},'스킬 참조'));
 if(candidates.length){
  if(!candidates.some(item=>item.skill.id===state.referenceId))state.referenceId='';
  const picker=el('select',{id:effectInputId+'-reference',class:'skill-reference-picker','aria-label':'본문에 넣을 스킬'},el('option',{value:''},'이 카드의 다른 스킬 선택'),...candidates.map(item=>el('option',{value:item.skill.id},item.label+' · '+(item.skill.name||'이름 없는 스킬'))));
  picker.value=state.referenceId;
  const insert=button('스킬 이름 넣기',()=>{
   const input=document.getElementById(effectInputId),view=resolveSkillEffect(card,skill),start=input?.selectionStart??state.range?.start??view.text.length,end=input?.selectionEnd??state.range?.end??start;let caret;
   change((target,current)=>{caret=insertSkillReference(current,target,picker.value,start,end);state.range={start:caret,end:caret,direction:'none',text:resolveSkillEffect(current,target).text};});
   const next=document.getElementById(effectInputId);next?.focus({preventScroll:true});if(caret!==undefined)next?.setSelectionRange(caret,caret);
  },{class:'wide subtle skill-reference-insert',disabled:!picker.value});
  picker.addEventListener('change',()=>{state.referenceId=picker.value;insert.disabled=!picker.value;});host.append(picker,insert);
 }else host.append(el('p',{class:'hint'},'같은 카드에 다른 스킬을 추가하면 그 이름을 본문에 넣을 수 있어요.'));
 const targets=new Map([...card.passives,...card.actives].map(s=>[s.id,s]));
 for(const ref of view.skillReferences){
  const name=view.text.slice(ref.start,ref.end),missing=!targets.has(ref.skillId);
  host.append(el('div',{class:'keyword-reference'},el('div',{class:'keyword-reference-top'},el('span',{class:'keyword-mark',style:'--keyword-color:#286fa8'},name+(missing?' · 참조한 스킬 없음':'')),button('×',()=>change((target,current)=>{materializeSkillEffect(current,target);target.skillReferences=target.skillReferences.filter(r=>r.id!==ref.id);}),{'aria-label':name+' 스킬 참조 해제',title:'참조 해제 · 표시된 이름은 본문에 유지'}))));
 }
 return host;
}
