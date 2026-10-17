import {el,button} from './dom.js';
import {clone} from '../model/types.js';
import {renderCard} from '../render/card.js';
import {getEffectFrameSec} from '../model/visual-effects.js';
import {createEffectCache} from '../render/effects/composite.js';
import {createEffectTimeline,syncEffectTimeInput} from './effect-timeline.js';
import {setElementSelection,selectedElements,pointerElements,selectionBounds,groupDelta,marqueeElements} from './element-selection.js';
import {effectPreviewDpi} from './effect-preview.js';
import {CSS_MM,wheelZoomFactor,captureViewAnchor,restoreViewAnchor} from './view-zoom.js';
export function mountCardCanvas(host,ctx){
 const stage=el('div',{class:'card-stage',tabIndex:0,role:'group','aria-label':'카드 요소 선택 영역'}),canvas=el('canvas',{id:'card-canvas'}),members=el('div',{class:'selection-members'}),selection=el('div',{id:'selection-box',hidden:true}),marquee=el('div',{id:'selection-marquee',hidden:true});stage.append(canvas,members,selection,marquee);host.append(stage);
 const area=host.closest('.canvas-scroll')||host;
 let gesture=null,preview=null,report={problems:[]},projectRef=ctx.store.getProject(),lastRatio=window.devicePixelRatio||1;
 const effectCache=createEffectCache(),timeline=createEffectTimeline({initialSec:getEffectFrameSec(projectRef),onFrame:()=>{drawCanvas();updateTransport();}});
 const transport=document.getElementById('card-effect-play'),timeInput=document.getElementById('card-effect-time');
 function updateTransport(){
  transport.textContent=timeline.isPlaying()?'일시정지':'재생';transport.setAttribute('aria-pressed',timeline.isPlaying());
  syncEffectTimeInput(timeInput,timeline.getTime());document.getElementById('card-effect-seconds').textContent=timeline.getTime().toFixed(2)+'초';
  document.getElementById('card-effect-print-frame').textContent='인쇄 장면 '+getEffectFrameSec(ctx.store.getProject()).toFixed(2)+'초 보기';
 }
 function drawCanvas(){
  const p=ctx.store.getProject(),target=preview||ctx.target();if(!target)return;
  const width=stage.getBoundingClientRect().width;lastRatio=window.devicePixelRatio||1;
  const dpi=effectPreviewDpi({widthMm:p.settings.cardWidthMm,heightMm:p.settings.cardHeightMm,displayWidth:width,pixelRatio:lastRatio});
  report=renderCard(canvas.getContext('2d',{willReadFrequently:true}),p,target,ctx.assets,dpi,{timeSec:timeline.getTime(),effectCache});
  canvas.dataset.previewDpi=String(dpi);canvas.style.imageRendering=canvas.width+.5<width*lastRatio?'pixelated':'auto';
 }
 function setActive(value){timeline.setActive(value&&!document.hidden);updateTransport();}
 function visibility(){setActive(ctx.state.mode==='card'&&!ctx.state.paintOpen&&!ctx.state.effectOpen&&!document.querySelector('dialog[open]'));}
 transport.addEventListener('click',()=>{timeline.isPlaying()?timeline.pause():timeline.play();updateTransport();});
 timeInput.addEventListener('input',()=>{timeline.pause();timeline.seek(Number(timeInput.value));updateTransport();});
 document.getElementById('card-effect-freeze').addEventListener('click',()=>{timeline.pause();const frame=Math.round(timeline.getTime()*100)/100;ctx.edit('인쇄 장면 지정',p=>p.print.effectFrameSec=frame);timeline.seek(frame);updateTransport();});
 document.getElementById('card-effect-print-frame').addEventListener('click',()=>{timeline.pause();timeline.seek(getEffectFrameSec(ctx.store.getProject()));updateTransport();});
 const dialogs=new MutationObserver(records=>{if(records.some(r=>r.type==='attributes'&&r.target.tagName==='DIALOG'||[...r.addedNodes,...r.removedNodes].some(n=>n.nodeType===1&&(n.tagName==='DIALOG'||n.querySelector?.('dialog')))))visibility();});
 dialogs.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['open']});document.addEventListener('visibilitychange',visibility);
 for(const handle of ['nw','ne','sw','se']){const b=button('',event=>event.stopPropagation(),{class:'resize-handle '+handle,'aria-label':'요소 '+handle+' 크기 조절'});b.addEventListener('pointerdown',e=>begin(e,handle));selection.append(b);}
 const point=event=>{const r=canvas.getBoundingClientRect(),s=ctx.store.getProject().settings;return{x:(event.clientX-r.left)/r.width*s.cardWidthMm,y:(event.clientY-r.top)/r.height*s.cardHeightMm};};
 function place(node,rect){for(const [name,v] of Object.entries({left:rect.x,top:rect.y,width:rect.w,height:rect.h}))node.style[name]=v*ctx.state.cardScale+'px';}
 function refreshSelection(){
  const target=preview||ctx.target();setElementSelection(ctx.state,ctx.state.selectedElementIds??[ctx.state.selectedElementId],target);
  const selected=selectedElements(ctx.state,target),bounds=selectionBounds(selected);selection.hidden=!bounds;selection.dataset.count=selected.length;selection.classList.toggle('multi',selected.length>1);selection.setAttribute('aria-label',selected.length+'개 요소 선택');members.replaceChildren();
  selection.dataset.locked=String(selected.some(e=>e.locked===true));for(const handle of selection.querySelectorAll('.resize-handle'))handle.hidden=selected.length!==1||selected[0].locked===true;
  if(bounds)place(selection,bounds);
  if(selected.length>1)for(const element of selected){const node=el('div',{class:'selection-member','data-element-id':element.id});place(node,element.rect);members.append(node);}
  marquee.hidden=gesture?.kind!=='marquee'||!gesture.moved;if(!marquee.hidden)place(marquee,gesture.rect);
 }
 function refresh(){
  const p=ctx.store.getProject();if(gesture&&(gesture.project!==p||gesture.targetId!==ctx.target()?.id)){release(gesture);gesture=null;preview=null;}
  const target=preview||ctx.target();if(!target){canvas.hidden=true;selection.hidden=true;members.replaceChildren();marquee.hidden=true;return;}canvas.hidden=false;
  const scale=ctx.state.cardScale;stage.style.width=p.settings.cardWidthMm*scale+'px';stage.style.height=p.settings.cardHeightMm*scale+'px';
  document.getElementById('card-zoom').value=scale;document.getElementById('card-zoom-value').textContent=Math.round(scale/CSS_MM*100)+'%';
  if(projectRef!==p){timeline.pause();effectCache.clear();projectRef=p;}drawCanvas();updateTransport();refreshSelection();
  const warnings=document.getElementById('card-warnings');warnings.replaceChildren();warnings.hidden=!!ctx.state.ignoreOutputWarnings;if(!warnings.hidden)for(const p of report.problems.slice(0,3))warnings.append(el('div',{},'⚠ '+p.message));
  document.getElementById('canvas-size').textContent=p.settings.cardWidthMm+' × '+p.settings.cardHeightMm+' mm';
 }
 function select(ids){setElementSelection(ctx.state,ids,ctx.target());refreshSelection();}
 function begin(event,handle){
  if(event.button!==0||ctx.state.mode!=='card'||!ctx.target())return;
  refreshSelection();
  if(handle){const chosen=selectedElements(ctx.state,ctx.target());if(chosen.length!==1||chosen[0].locked===true)return;}
  timeline.pause();updateTransport();event.preventDefault();event.stopPropagation();stage.focus({preventScroll:true});
  const start=point(event),target=ctx.target(),initialIds=[...ctx.state.selectedElementIds],p=ctx.store.getProject();let collapseId=null;
  if(!handle){
   const hit=pointerElements(target.elements).reverse().find(e=>start.x>=e.rect.x&&start.x<=e.rect.x+e.rect.w&&start.y>=e.rect.y&&start.y<=e.rect.y+e.rect.h);
   if(hit&&event.shiftKey){select(initialIds.includes(hit.id)?initialIds.filter(id=>id!==hit.id):[...initialIds,hit.id]);ctx.renderInspector();return;}
   if(hit){if(initialIds.includes(hit.id)){select([...initialIds.filter(id=>id!==hit.id),hit.id]);if(initialIds.length>1)collapseId=hit.id;}else select([hit.id]);}
   else {const baseIds=event.shiftKey?initialIds:[];select(baseIds);gesture={kind:'marquee',start,initialIds,baseIds,rect:{...start,w:0,h:0},moved:false,pointer:event.pointerId,project:p,targetId:target.id};stage.setPointerCapture(event.pointerId);ctx.renderInspector();return;}
  }
  const chosen=pointerElements(selectedElements(ctx.state,target));if(!chosen.length)return;
  gesture={kind:handle?'resize':'move',handle,start,initialIds,collapseId,original:target,elements:chosen,moved:false,pointer:event.pointerId,project:p,targetId:target.id};stage.setPointerCapture(event.pointerId);ctx.renderInspector();
 }
 function move(event){
  if(!gesture||event.pointerId!==gesture.pointer)return;const p=ctx.store.getProject(),pos=point(event),dx=pos.x-gesture.start.x,dy=pos.y-gesture.start.y;
  if(gesture.project!==p||gesture.targetId!==ctx.target()?.id){cancelGesture();return;}
  if(!gesture.moved&&Math.hypot(dx,dy)*ctx.state.cardScale<3)return;gesture.moved=true;
  if(gesture.kind==='marquee'){
   gesture.rect={x:Math.min(pos.x,gesture.start.x),y:Math.min(pos.y,gesture.start.y),w:Math.abs(dx),h:Math.abs(dy)};
   select([...gesture.baseIds,...marqueeElements(ctx.target().elements,gesture.rect).map(e=>e.id)]);return;
  }
  preview=clone(gesture.original);
  if(gesture.kind==='move'){
   const delta=groupDelta(gesture.elements,dx,dy,p.settings);
   for(const element of gesture.elements)Object.assign(preview.elements.find(e=>e.id===element.id).rect,{x:element.rect.x+delta.dx,y:element.rect.y+delta.dy});
  }else{
   const original=gesture.elements[0],r={...original.rect},h=gesture.handle;
   if(h.includes('e'))r.w=Math.max(1,Math.min(p.settings.cardWidthMm-r.x,r.w+dx));if(h.includes('s'))r.h=Math.max(1,Math.min(p.settings.cardHeightMm-r.y,r.h+dy));
   if(h.includes('w')){r.x=Math.max(0,Math.min(r.x+r.w-1,r.x+dx));r.w=original.rect.x+original.rect.w-r.x;}if(h.includes('n')){r.y=Math.max(0,Math.min(r.y+r.h-1,r.y+dy));r.h=original.rect.y+original.rect.h-r.y;}
   preview.elements.find(e=>e.id===original.id).rect=r;
  }
  refresh();
 }
 function release(g){try{if(stage.hasPointerCapture(g.pointer))stage.releasePointerCapture(g.pointer);}catch{}}
 function end(event){
  if(!gesture||event.pointerId!==gesture.pointer)return;const done=gesture,result=preview;gesture=null;preview=null;release(done);
  if(done.kind==='marquee'){ctx.renderInspector();refreshSelection();return;}
  if(!done.moved&&done.collapseId)select([done.collapseId]);
  const changed=result?.elements.filter(e=>done.elements.some(original=>original.id===e.id&&JSON.stringify(original.rect)!==JSON.stringify(e.rect)))??[];
  if(changed.length)ctx.editTarget(changed.length>1?'요소 묶음 이동':'요소 이동/크기',target=>{
   for(const changedElement of changed)target.elements.find(e=>e.id===changedElement.id).rect=changedElement.rect;
   if(target.kind){target.template='custom';if(changed.some(e=>e.binding?.skillId||e.binding?.field?.startsWith('item.')))target.autoSkillLayout=false;}
  });else refresh();ctx.renderInspector();
 }
 function cancelGesture(){
  if(!gesture)return false;const previous=gesture;gesture=null;preview=null;release(previous);
  if(previous.project===ctx.store.getProject()&&previous.targetId===ctx.target()?.id)select(previous.initialIds);
  refresh();ctx.renderInspector();return true;
 }
 function setZoom(value,point){
  if(gesture||!ctx.target()||!Number.isFinite(value))return false;
  const next=Math.max(CSS_MM*.25,Math.min(CSS_MM*8,value));if(next===ctx.state.cardScale)return false;
  const anchor=captureViewAnchor(area,stage,point);ctx.state.cardScale=next;refresh();restoreViewAnchor(area,stage,anchor);return true;
 }
 function fit(){
  const s=ctx.store.getProject().settings,padding=getComputedStyle(area);
  const width=area.clientWidth-parseFloat(padding.paddingLeft)-parseFloat(padding.paddingRight)-2,height=area.clientHeight-parseFloat(padding.paddingTop)-parseFloat(padding.paddingBottom)-2;
  setZoom(Math.min(width/s.cardWidthMm,height/s.cardHeightMm));
 }
 function wheel(event){
  if(!event.ctrlKey&&!event.metaKey||ctx.state.mode!=='card'||document.querySelector('dialog[open]'))return;
  event.preventDefault();if(!Number.isFinite(event.deltaY))return;
  setZoom(ctx.state.cardScale*wheelZoomFactor(event,area),{x:event.clientX,y:event.clientY});
 }
 function resized(){if(lastRatio!==(window.devicePixelRatio||1))drawCanvas();}
 const down=event=>{if([canvas,stage,host,area].includes(event.target))begin(event,null);};
 area.addEventListener('pointerdown',down);area.addEventListener('wheel',wheel,{passive:false});window.addEventListener('resize',resized);stage.addEventListener('pointermove',move);stage.addEventListener('pointerup',end);stage.addEventListener('pointercancel',cancelGesture);
 return {refresh,setZoom,fit,setActive,cancelGesture,resetTime(){timeline.pause();effectCache.clear();timeline.seek(getEffectFrameSec(ctx.store.getProject()));updateTransport();},report:()=>report,destroy(){if(gesture)release(gesture);timeline.destroy();effectCache.clear();dialogs.disconnect();document.removeEventListener('visibilitychange',visibility);area.removeEventListener('pointerdown',down);area.removeEventListener('wheel',wheel);window.removeEventListener('resize',resized);host.replaceChildren();}};
}
