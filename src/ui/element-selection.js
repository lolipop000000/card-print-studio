/** Selection belongs to the editor session, never to a saved card. */
export function setElementSelection(state,ids,target){
 const allowed=target?new Set(target.elements.map(e=>e.id)):null;
 state.selectedElementIds=[...new Set(ids)].filter(id=>id&&(!allowed||allowed.has(id)));
 state.selectedElementId=state.selectedElementIds.at(-1)??null;
}
export function selectedElements(state,target){
 const ids=new Set(state.selectedElementIds??[state.selectedElementId]);
 return target?.elements.filter(e=>ids.has(e.id))??[];
}
export function selectionBounds(elements){
 if(!elements.length)return null;
 const x=Math.min(...elements.map(e=>e.rect.x)),y=Math.min(...elements.map(e=>e.rect.y));
 return {x,y,w:Math.max(...elements.map(e=>e.rect.x+e.rect.w))-x,h:Math.max(...elements.map(e=>e.rect.y+e.rect.h))-y};
}
export function groupDelta(elements,dx,dy,settings){
 const b=selectionBounds(elements);if(!b)return {dx:0,dy:0};
 const clamp=(n,lo,hi)=>lo>hi?0:Math.max(lo,Math.min(hi,n));
 return {dx:clamp(dx,-b.x,settings.cardWidthMm-b.x-b.w),dy:clamp(dy,-b.y,settings.cardHeightMm-b.y-b.h)};
}
export function marqueeElements(elements,rect){
 return elements.filter(e=>e.rect.x<rect.x+rect.w&&e.rect.x+e.rect.w>rect.x&&e.rect.y<rect.y+rect.h&&e.rect.y+e.rect.h>rect.y);
}
