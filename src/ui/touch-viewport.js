/** Two fingers take ownership until every contact is lifted. A lone finger keeps editing. */
export function createTouchGesture({onStart=()=>{},onChange=()=>{},onEnd=()=>{}}={}){
 const points=new Map();let active=false,allowed=false,previous=null;
 const pair=()=>{const [a,b]=[...points.values()];return b?{center:{x:(a.x+b.x)/2,y:(a.y+b.y)/2},distance:Math.hypot(b.x-a.x,b.y-a.y)}:null;};
 const point=event=>({x:event.clientX,y:event.clientY});
 function clear(){const consumed=active;points.clear();active=false;allowed=false;previous=null;if(consumed)onEnd();return consumed;}
 return {
  down(event){
   if(event.pointerType!=='touch')return false;
   points.set(event.pointerId,point(event));
   if(points.size>=2&&!active){active=true;allowed=onStart()!==false;previous=pair();}
   return active;
  },
  move(event){
   if(event.pointerType!=='touch'||!points.has(event.pointerId))return false;
   points.set(event.pointerId,point(event));if(!active)return false;
   const next=pair();
   if(allowed&&previous&&next)onChange({factor:previous.distance>0&&next.distance>0?next.distance/previous.distance:1,from:previous.center,to:next.center});
   previous=next;return true;
  },
  up(event){
   if(event.pointerType!=='touch'||!points.has(event.pointerId))return false;
   const consumed=active;points.delete(event.pointerId);previous=pair();if(!points.size)clear();return consumed;
  },
  cancel:clear,
  isActive:()=>active
 };
}

/** Capture the handoff before a canvas tool receives the second touch. */
export function mountTouchViewport({viewport,onStart=()=>{},onChange,onEnd=()=>{}}){
 const captures=new Set();let disposed=false;
 const gesture=createTouchGesture({
  onStart(){viewport.dispatchEvent(new Event('touchviewportstart'));viewport.dataset.touchNavigating='true';return onStart();},
  onChange,
  onEnd(){delete viewport.dataset.touchNavigating;onEnd();}
 });
 const stop=event=>{event.preventDefault();event.stopImmediatePropagation();};
 function capture(id){try{viewport.setPointerCapture(id);captures.add(id);}catch{}}
 const contacts=new Set();
 function down(event){
  if(event.pointerType!=='touch')return;contacts.add(event.pointerId);
  if(gesture.down(event)){for(const id of contacts)capture(id);stop(event);}
 }
 function move(event){if(gesture.move(event))stop(event);}
 function up(event){
  if(gesture.up(event))stop(event);contacts.delete(event.pointerId);captures.delete(event.pointerId);
  try{if(viewport.hasPointerCapture(event.pointerId))viewport.releasePointerCapture(event.pointerId);}catch{}
 }
 function cancel(){gesture.cancel();contacts.clear();for(const id of captures){try{if(viewport.hasPointerCapture(id))viewport.releasePointerCapture(id);}catch{}}captures.clear();}
 const options={capture:true,passive:false};
 viewport.addEventListener('pointerdown',down,options);viewport.addEventListener('pointermove',move,options);viewport.addEventListener('pointerup',up,options);viewport.addEventListener('pointercancel',up,options);window.addEventListener('blur',cancel);
 return {isActive:gesture.isActive,destroy(){if(disposed)return;disposed=true;cancel();viewport.removeEventListener('pointerdown',down,true);viewport.removeEventListener('pointermove',move,true);viewport.removeEventListener('pointerup',up,true);viewport.removeEventListener('pointercancel',up,true);window.removeEventListener('blur',cancel);}};
}
