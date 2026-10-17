import {el,button,field,showMessage} from './dom.js';
import {selectionBounds} from './element-selection.js';

const references=new WeakMap();
const actions=[['left','왼쪽 맞춤'],['hcenter','가로 가운데'],['right','오른쪽 맞춤'],['top','위쪽 맞춤'],['vcenter','세로 가운데'],['bottom','아래쪽 맞춤']];
const sameCoordinate=(a,b)=>Math.abs(a-b)<=Number.EPSILON*Math.max(1,Math.abs(a),Math.abs(b))*8;

/** Return only changed positions in mm; source elements and their other fields are untouched. */
export function elementAlignmentPositions(elements,action,reference,settings){
 if(!elements.length)return [];
 const positions=new Map(elements.map(e=>[e.id,{id:e.id,x:e.rect.x,y:e.rect.y}]));
 if(action==='distribute-horizontal'||action==='distribute-vertical'){
  if(elements.length<3)return [];
  const axis=action==='distribute-horizontal'?'x':'y',size=axis==='x'?'w':'h';
  const sorted=elements.map((element,index)=>({element,index})).sort((a,b)=>a.element.rect[axis]-b.element.rect[axis]||a.index-b.index).map(e=>e.element);
  const first=sorted[0],last=sorted.at(-1),gap=(last.rect[axis]-first.rect[axis]-sorted.slice(0,-1).reduce((sum,e)=>sum+e.rect[size],0))/(sorted.length-1);
  let occupied=0;
  for(let i=0;i<sorted.length-1;i++){const e=sorted[i];if(i)positions.get(e.id)[axis]=first.rect[axis]+occupied+i*gap;occupied+=e.rect[size];}
  if(sorted.some((e,i)=>i&&positions.get(e.id)[axis]<positions.get(sorted[i-1].id)[axis]&&!sameCoordinate(positions.get(e.id)[axis],positions.get(sorted[i-1].id)[axis])))throw Error('요소가 너무 많이 겹쳐 순서를 유지하며 균등 배치할 수 없어요. 요소를 조금 벌린 뒤 다시 시도하세요.');
 }else{
  if(!actions.some(([key])=>key===action))return [];
  const bounds=reference==='card'?{x:0,y:0,w:settings.cardWidthMm,h:settings.cardHeightMm}:selectionBounds(elements);
  for(const e of elements){const p=positions.get(e.id),r=e.rect;
   if(action==='left')p.x=bounds.x;if(action==='hcenter')p.x=bounds.x+(bounds.w-r.w)/2;if(action==='right')p.x=bounds.x+bounds.w-r.w;
   if(action==='top')p.y=bounds.y;if(action==='vcenter')p.y=bounds.y+(bounds.h-r.h)/2;if(action==='bottom')p.y=bounds.y+bounds.h-r.h;
  }
 }
 return elements.flatMap(e=>{const p=positions.get(e.id),sameX=sameCoordinate(p.x,e.rect.x),sameY=sameCoordinate(p.y,e.rect.y);return sameX&&sameY?[]:[{id:e.id,x:sameX?e.rect.x:p.x,y:sameY?e.rect.y:p.y}];});
}

export function renderElementAlignmentControls(ctx,selected){
 if(!selected.length)return null;
 const ids=selected.map(e=>e.id),key=JSON.stringify([ctx.state.back?'back':ctx.target()?.id,ids]);
 let session=references.get(ctx);if(!session||session.key!==key){session={key,reference:selected.length>1?'selection':'card'};references.set(ctx,session);}
 const run=action=>{
  const chosen=new Set(ids),current=ctx.target()?.elements.filter(e=>chosen.has(e.id))??[];let changes;
  try{changes=elementAlignmentPositions(current,action,session.reference,ctx.store.getProject().settings);}catch(error){showMessage(error.message);return;}
  if(!changes.length)return;
  const byId=new Map(changes.map(e=>[e.id,e]));ctx.editTarget(action.startsWith('distribute')?'요소 균등 배치':'요소 정렬',target=>{
   for(const e of target.elements){const p=byId.get(e.id);if(p){e.rect.x=p.x;e.rect.y=p.y;}}
   if(target.kind){target.template='custom';if(current.some(e=>byId.has(e.id)&&(e.binding?.skillId||e.binding?.field?.startsWith('item.'))))target.autoSkillLayout=false;}
  });
 };
 return el('div',{class:'element-alignment',role:'group','aria-label':'요소 정렬'},
  field('정렬 기준','element-alignment-reference',session.reference,value=>{session.reference=value;},{options:[['selection','선택한 요소 범위'],['card','카드 전체']]}),
  el('div',{class:'two-fields'},actions.map(([action,label])=>button(label,()=>run(action),{id:'element-align-'+action}))),
  el('div',{class:'two-fields'},button('가로 간격 균등',()=>run('distribute-horizontal'),{id:'element-distribute-horizontal',disabled:selected.length<3}),button('세로 간격 균등',()=>run('distribute-vertical'),{id:'element-distribute-vertical',disabled:selected.length<3})),
  el('p',{class:'hint'},'간격 균등 배치는 3개 이상을 선택하고 사용해요. 양 끝 요소를 고정하며, 겹친 요소는 겹치는 간격을 균등하게 맞춰요.'));
}
