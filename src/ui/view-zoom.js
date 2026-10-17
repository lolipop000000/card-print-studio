export const CSS_MM=96/25.4;

export function wheelZoomFactor(event,viewport){
 const unit=event.deltaMode===1?16:event.deltaMode===2?viewport.clientHeight:1;
 return Math.exp(-Math.max(-400,Math.min(400,event.deltaY*unit))*.0015);
}

export function captureViewAnchor(viewport,node,point){
 const before=node.getBoundingClientRect(),area=viewport.getBoundingClientRect();
 if(!before.width||!before.height)return null;
 point=point||{x:area.left+viewport.clientWidth/2,y:area.top+viewport.clientHeight/2};
 return {point,x:(point.x-before.left)/before.width,y:(point.y-before.top)/before.height};
}

export function restoreViewAnchor(viewport,node,anchor){
 if(!anchor)return;
 const after=node.getBoundingClientRect();
 viewport.scrollLeft+=after.left+anchor.x*after.width-anchor.point.x;
 viewport.scrollTop+=after.top+anchor.y*after.height-anchor.point.y;
}
