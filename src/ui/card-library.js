import {el,button,field} from './dom.js';
import {ATTRIBUTES,RANKS} from '../model/types.js';
import {createCardLibrary,parseCardQuantity,setCardQuantities} from '../model/card-library.js';

export function createCardLibraryControls(ctx){
 const library=createCardLibrary();let composing=false,destroyed=false;
 const project=()=>ctx.store.getProject();
 const message=el('p',{id:'card-library-message',class:'card-library-message',role:'status',hidden:true});
 const clearMessage=()=>{message.hidden=true;message.textContent='';quantity.removeAttribute('aria-invalid');};
 function update(){if(destroyed)return;refresh();ctx.refresh?.();}
 function setFilters(patch){library.setFilters(project(),patch);clearMessage();update();}
 function commitSearch(){if(!composing&&query.value!==library.filters.query)setFilters({query:query.value});}
 const query=el('input',{id:'card-search',type:'search',placeholder:'카드 이름 검색','aria-label':'카드 이름 검색','aria-controls':'card-list',
  oncompositionstart:()=>{composing=true;},oncompositionend:()=>{composing=false;commitSearch();},oninput:event=>{if(!event.isComposing)commitSearch();}});
 const kind=field('종류','card-filter-kind','',value=>setFilters({kind:value}),{options:[['','모든 종류'],['monster','몬스터'],['item','아이템']],'aria-controls':'card-list'});
 const rank=field('등급','card-filter-rank','',value=>setFilters({rank:value}),{options:[['','모든 등급'],...RANKS.map(value=>[value,value])],'aria-controls':'card-list'});
 const attribute=field('속성','card-filter-attribute','',value=>setFilters({attribute:value}),{options:[['','모든 속성'],...Object.entries(ATTRIBUTES).map(([value,info])=>[value,info.name]),['none','속성 없는 아이템']],'aria-controls':'card-list'});
 const status=el('p',{id:'card-library-status',class:'card-library-status',role:'status','aria-live':'polite'});
 const resetFilters=button('필터 초기화',()=>setFilters({query:'',kind:'',rank:'',attribute:''}),{id:'card-reset-filters'});
 const selectVisible=button('보이는 카드 선택',()=>{library.selectVisible(project());clearMessage();update();},{id:'card-select-visible'});
 const clearSelection=button('선택 해제',()=>{library.clearSelection();clearMessage();update();},{id:'card-clear-selection'});
 const quantity=el('input',{id:'card-bulk-quantity',type:'number',min:1,step:1,value:1,'aria-label':'선택한 카드 인쇄 수량',oninput:clearMessage,onkeydown:event=>{if(event.key==='Enter'){event.preventDefault();applyQuantity();}}});
 const apply=button('일괄 적용',applyQuantity,{id:'card-apply-quantity'});
 const node=el('section',{id:'card-library-controls',class:'card-library-controls','aria-label':'카드 목록 검색과 일괄 수량 변경'},
  query,el('div',{class:'card-library-filters'},kind,rank),attribute,
  el('div',{class:'card-library-filter-actions'},resetFilters),status,
  el('div',{class:'card-library-selection-actions'},selectVisible,clearSelection),
  el('div',{class:'card-library-bulk'},el('label',{htmlFor:'card-bulk-quantity'},'선택 카드 수량'),quantity,apply),message);
 function applyQuantity(){
  const ids=library.selectedIds(project());if(!ids.length||destroyed)return;
  let value;try{value=parseCardQuantity(quantity.value);}catch(error){message.textContent=error.message;message.hidden=false;quantity.setAttribute('aria-invalid','true');return;}
  clearMessage();ctx.edit('선택 카드 인쇄 수량',draft=>setCardQuantities(draft,ids,value));refresh();
 }
 function refresh(){
  if(destroyed)return;
  const current=project(),visible=library.reconcile(current),selected=library.selectedIds(current),filters=library.filters;
  if(!composing&&query.value!==filters.query)query.value=filters.query;
  kind.querySelector('select').value=filters.kind;rank.querySelector('select').value=filters.rank;attribute.querySelector('select').value=filters.attribute;
  status.textContent='표시 '+visible.length+' / '+current.cards.length+'종 · 선택 '+selected.length+'종';
  selectVisible.disabled=!visible.length;clearSelection.disabled=!selected.length;quantity.disabled=!selected.length;apply.disabled=!selected.length;
  resetFilters.disabled=!Object.values(filters).some(Boolean);
 }
 const controls={
  node,refresh,
  visibleCards:(current=project())=>library.visibleCards(current),
  selectedIds:()=>library.selectedIds(project()),
  isSelected:id=>library.isSelected(id),
  toggleSelection(id,options){if(destroyed)return;library.toggleSelection(project(),id,options);clearMessage();update();},
  clearSelection(){library.clearSelection();clearMessage();update();},
  reset(){if(destroyed)return;composing=false;library.reset();quantity.value=1;clearMessage();update();},
  destroy(){destroyed=true;library.reset();if(ctx.cardLibrary===controls)delete ctx.cardLibrary;node.remove();}
 };
 ctx.cardLibrary=controls;refresh();return controls;
}
