import {cardAttributes,ATTRIBUTES,RANKS} from './types.js';
import {orderedCards} from './variants.js';

const emptyFilters=()=>({query:'',kind:'',rank:'',attribute:''});
const searchText=value=>String(value??'').normalize('NFC').trim().toLocaleLowerCase('ko');
function matches(card,filters){
 if(filters.query&&!searchText(card.name).includes(searchText(filters.query)))return false;
 if(filters.kind&&card.kind!==filters.kind)return false;
 if(filters.rank&&(card.kind!=='monster'||card.rank!==filters.rank))return false;
 if(filters.attribute){
  const attributes=cardAttributes(card);
  if(filters.attribute==='none')return card.kind==='item'&&attributes.length===0;
  if(!attributes.includes(filters.attribute))return false;
 }
 return true;
}

/** Search and batch selection belong to the current view, never to saved card data. */
export function createCardLibrary(){
 let filters=emptyFilters(),selected=new Set(),anchorId=null;
 const visibleCards=project=>orderedCards(project).filter(card=>matches(card,filters));
 function reconcile(project){
  const visible=visibleCards(project),ids=new Set(visible.map(card=>card.id));
  selected=new Set([...selected].filter(id=>ids.has(id)));
  if(!ids.has(anchorId))anchorId=null;
  return visible;
 }
 function clearSelection(){selected.clear();anchorId=null;}
 return {
  get filters(){return {...filters};},
  visibleCards,reconcile,
  setFilters(project,patch){
   if(Object.hasOwn(patch,'query'))filters.query=String(patch.query??'');
   if(Object.hasOwn(patch,'kind'))filters.kind=['monster','item'].includes(patch.kind)?patch.kind:'';
   if(Object.hasOwn(patch,'rank'))filters.rank=RANKS.includes(patch.rank)?patch.rank:'';
   if(Object.hasOwn(patch,'attribute'))filters.attribute=patch.attribute==='none'||Object.hasOwn(ATTRIBUTES,patch.attribute)?patch.attribute:'';
   reconcile(project);
  },
  selectedIds:project=>reconcile(project).filter(card=>selected.has(card.id)).map(card=>card.id),
  isSelected:id=>selected.has(id),
  toggleSelection(project,id,{shiftKey=false,checked}={}){
   const visible=reconcile(project),end=visible.findIndex(card=>card.id===id);if(end<0)return;
   const start=shiftKey?visible.findIndex(card=>card.id===anchorId):-1,choose=checked??!selected.has(id);
   const range=start<0?[visible[end]]:visible.slice(Math.min(start,end),Math.max(start,end)+1);
   for(const card of range)if(choose)selected.add(card.id);else selected.delete(card.id);
   anchorId=id;
  },
  selectVisible(project){const cards=reconcile(project);selected=new Set(cards.map(card=>card.id));anchorId=cards[0]?.id??null;},
  clearSelection,
  reset(){filters=emptyFilters();clearSelection();}
 };
}

export function parseCardQuantity(value){
 const quantity=typeof value==='number'||typeof value==='string'?Number(value):NaN;
 if(!Number.isSafeInteger(quantity)||quantity<1)throw new Error('인쇄 수량은 1 이상의 안전한 정수로 입력하세요.');
 return quantity;
}

/** Mutate one store draft so a complete batch is recorded as one undo operation. */
export function setCardQuantities(project,selectedIds,value){
 const quantity=parseCardQuantity(value),selected=new Set(selectedIds);let changed=0;
 for(const card of project.cards)if(selected.has(card.id)&&card.quantity!==quantity){card.quantity=quantity;changed++;}
 return changed;
}
