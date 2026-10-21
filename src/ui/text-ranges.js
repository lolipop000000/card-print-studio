import {el,button} from './dom.js';
import {editText,getTextRanges,setTextRange,removeTextRange} from '../model/text-ranges.js';
import {resolveSkillEffect,materializeSkillEffect} from '../model/skill-references.js';

/** Commit after composition, while selection positions still describe the edited string. */
export function rangeTextField(label,id,owner,field,change,{textarea=false,class:className}={}){
 let composing=false,selection=null,last=owner[field]||'',timer;
 const commit=()=>{
  clearTimeout(timer);if(composing||!input.isConnected||input.value===last)return;
  last=input.value;const before=selection;selection=null;change(target=>editText(target,field,last,before));
 };
 const input=el(textarea?'textarea':'input',{id,...(textarea?{rows:3}:{type:'text'}),value:last,class:className,
  onbeforeinput:event=>{if(!composing)selection={start:input.selectionStart,end:input.selectionEnd,inputType:event.inputType};},
  oncompositionstart:()=>{composing=true;input.dataset.composing='true';clearTimeout(timer);selection={start:input.selectionStart,end:input.selectionEnd};},
  oncompositionend:()=>{composing=false;delete input.dataset.composing;timer=setTimeout(commit,0);},oninput:event=>{if(!event.isComposing)commit();},onchange:commit});
 return el('label',{class:'field',htmlFor:id},el('span',{},label),input);
}

export function textRangeControls(ctx,{card,owner,field,inputId,elementId,change,back=false}){
 const host=el('div',{class:'text-range-controls','data-text-ranges-for':inputId});
 const visible=field==='effect'&&owner!==card?resolveSkillEffect(card,owner):null,text=visible?.text??owner[field]??'',ranges=visible?.textRanges?.[field]??getTextRanges(owner,field);
 const open=id=>ctx.openVisualEffects({cardId:card.id??ctx.state.activeCardId,back,elementId,textRangeId:id});
 const prepare=target=>{if(field==='effect'&&owner!==card)materializeSkillEffect(card,target);};
 const create=button('선택 글자 이펙트',()=>{
  const input=document.getElementById(inputId);if(input?.matches(':disabled')||input?.dataset.composing==='true')return;
  const start=input?.selectionStart??0,end=input?.selectionEnd??start;let rangeId;
  change(target=>{prepare(target);rangeId=setTextRange(target,field,start,end).id;});if(rangeId)open(rangeId);
 },{class:'wide subtle text-range-create',disabled:!text.length||!elementId,title:'글자를 선택한 뒤 누르세요. 선택이 없으면 커서의 한 글자를 꾸며요.'});
 host.append(create);
 if(!ranges.length)return host;
 const list=el('div',{class:'text-range-list'});
 for(const range of ranges){
  const label=text.slice(range.start,range.end);
  list.append(el('div',{class:'keyword-reference-top'},button('“'+label+'” · 이펙트',()=>open(range.id),{class:'text-range-edit',title:(range.start+1)+'~'+range.end+'번째 글자'}),
   button('×',()=>change(target=>{prepare(target);removeTextRange(target,field,range.id);}),{class:'text-range-remove','aria-label':label+' 글자 효과 해제'})));
 }
 host.append(list);return host;
}
