import {el,button} from './dom.js';
import {renderCard} from '../render/card.js';
import {orderedCards} from '../model/variants.js';
export function renderCards(host,ctx){
 host.replaceChildren();const p=ctx.store.getProject();let count=0;
 for(const card of orderedCards(p)){
  count+=card.quantity;const thumb=el('canvas',{class:'card-thumb'});renderCard(thumb.getContext('2d',{willReadFrequently:true}),p,card,ctx.assets,55);
  const select=button('',()=>ctx.selectCard(card.id),{class:'card-select','aria-label':card.name+' 카드 선택'});
  select.append(thumb,el('div',{class:'card-meta'},el('strong',{},card.name||'이름 없는 카드'),el('small',{},card.variant?card.variant.label+' · Variant':card.kind==='monster'?card.rank+' · 몬스터':'아이템')));
  const qty=el('input',{type:'number',min:1,step:1,value:card.quantity,class:'card-qty','aria-label':card.name+' 인쇄 수량',onchange:()=>ctx.edit('카드 수량',d=>{d.cards.find(c=>c.id===card.id).quantity=Number(qty.value);})});
  host.append(el('div',{'data-card-id':card.id,class:'card-row'+(card.variant?' variant':'')+(card.id===ctx.state.activeCardId&&!ctx.state.back?' active':'')},select,qty));
 }
 document.getElementById('card-count').textContent=p.cards.length+'종 · '+count+'장';
}
