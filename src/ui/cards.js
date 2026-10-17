import {el,button} from './dom.js';
import {renderCard} from '../render/card.js';
import {orderedCards} from '../model/variants.js';
export function renderCards(host,ctx){
 host.replaceChildren();const p=ctx.store.getProject(),library=ctx.cardLibrary,cards=library?library.visibleCards(p):orderedCards(p);
 for(const card of cards){
  const thumb=el('canvas',{class:'card-thumb'});renderCard(thumb.getContext('2d',{willReadFrequently:true}),p,card,ctx.assets,55);
  const select=button('',()=>ctx.selectCard(card.id),{class:'card-select','aria-label':card.name+' 카드 선택'});
  select.append(thumb,el('div',{class:'card-meta'},el('strong',{},card.name||'이름 없는 카드'),el('small',{},card.variant?card.variant.label+' · Variant':card.kind==='monster'?card.rank+' · 몬스터':'아이템')));
  const qty=el('input',{type:'number',min:1,step:1,value:card.quantity,class:'card-qty','aria-label':card.name+' 인쇄 수량',onchange:()=>ctx.edit('카드 수량',d=>{d.cards.find(c=>c.id===card.id).quantity=Number(qty.value);})});
  const batch=library?el('input',{type:'checkbox',class:'card-batch-select',checked:library.isSelected(card.id),'aria-label':(card.name||'이름 없는 카드')+' 일괄 변경 선택',title:'Shift 클릭으로 범위 선택',onclick:event=>library.toggleSelection(card.id,{checked:event.currentTarget.checked,shiftKey:event.shiftKey})}):null;
  host.append(el('div',{'data-card-id':card.id,class:'card-row'+(card.variant?' variant':'')+(card.id===ctx.state.activeCardId&&!ctx.state.back?' active':'')+(library?.isSelected(card.id)?' batch-selected':'')},batch,select,qty));
 }
 if(!cards.length&&library)host.append(el('p',{class:'card-library-empty'},'조건에 맞는 카드가 없어요.'));
 const count=document.getElementById('card-count');if(count)count.textContent=p.cards.length+'종 · '+p.cards.reduce((sum,card)=>sum+card.quantity,0)+'장';
}
