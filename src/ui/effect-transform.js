import {clone} from '../model/types.js';
import {VISUAL_EFFECT_CATALOG} from '../model/visual-effects.js';
import {getSpriteDecorationGeometry} from '../render/effects/sprite-emitter.js';
import {el,button,typing} from './dom.js';

export const EFFECT_NUDGE_MM=25.4/300;
const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
const radians=degrees=>degrees*Math.PI/180;
const angle=degrees=>((degrees+180)%360+360)%360-180;
const sameValue=(value,before)=>Math.abs(value-before)<1e-12?before:value;
const rotate=(p,degrees)=>{const a=radians(degrees),c=Math.cos(a),s=Math.sin(a);return {x:p.x*c-p.y*s,y:p.x*s+p.y*c};};
const corners=(center,w,h,degrees)=>[[-w/2,-h/2],[w/2,-h/2],[w/2,h/2],[-w/2,h/2]].map(([x,y])=>{const p=rotate({x,y},degrees);return {x:center.x+p.x,y:center.y+p.y};});
const unsupported=reason=>({supported:false,reason});

/** Geometry is in card millimetres; the renderer supplies its exact target and size basis. */
export function effectTransformGeometry(layer,context={}){
 if(!layer)return unsupported('효과 레이어를 선택하면 마우스로 변형할 수 있어요.');
 if(!VISUAL_EFFECT_CATALOG[layer.kind]?.generative)return unsupported(layer.kind==='textWarp'?'글자 형태 왜곡은 오른쪽 숫자로 조절하세요. 이동할 발생 영역이 없는 효과예요.':'이 필터는 쌓인 그림 전체에 적용돼요. 이동할 발생 영역이 있는 레이어를 선택하세요.');
 if(!layer.enabled||layer.opacity<=0)return unsupported('선택한 효과를 켜고 불투명도를 높이면 변형할 수 있어요.');
 const rect=context.rect;if(!rect||!(rect.w>0)||!(rect.h>0))return unsupported('미리보기에서 선택한 대상의 크기를 계산하고 있어요.');
 if(layer.kind==='sprite'&&layer.params?.renderMode==='single'){
  const sprite=getSpriteDecorationGeometry(layer,context);
  return sprite?{supported:true,kind:'sprite',rect,...sprite}:unsupported(layer.params.shape==='image'&&!context.image?'그림을 선택하거나 가져온 뒤 변형하세요.':'장식 크기를 0보다 크게 하고 자르기 범위를 확인하세요.');
 }
 const o=layer.origin,center={x:rect.x+(o.x+o.w/2)*rect.w,y:rect.y+(o.y+o.h/2)*rect.h},w=o.w*rect.w,h=o.h*rect.h,degrees=layer.rotationDeg||0;
 return {supported:true,kind:'origin',rect,center,width:w,height:h,rotationDeg:degrees,anchorX:.5,anchorY:.5,mirrorX:1,mirrorY:1,corners:corners(center,w,h,degrees)};
}
function moveCentre(layer,geometry,center){
 const next=clone(layer),o=next.origin,r=geometry.rect;
 o.x=sameValue(clamp((center.x-r.x)/r.w-o.w/2,-1,2),o.x);o.y=sameValue(clamp((center.y-r.y)/r.h-o.h/2,-1,5),o.y);return next;
}
const axes={nw:[-1,-1],n:[0,-1],ne:[1,-1],e:[1,0],se:[1,1],s:[0,1],sw:[-1,1],w:[-1,0]};

/** A gesture always derives from its starting layer, so successive events cannot accumulate error. */
export function transformEffectLayer(layer,g,handle,start,point,{shiftKey=false}={}){
 if(!g?.supported)return clone(layer);
 if(handle==='move')return moveCentre(layer,g,{x:g.center.x+point.x-start.x,y:g.center.y+point.y-start.y});
 const next=clone(layer);
 if(handle==='rotate'){
  const direction=p=>Math.atan2(p.y-g.center.y,p.x-g.center.x)*180/Math.PI;
  let degrees=layer.rotationDeg+angle(direction(point)-direction(start));if(shiftKey)degrees=Math.round(degrees/15)*15;const rotated=angle(degrees);next.rotationDeg=Math.abs(angle(rotated-layer.rotationDeg))<1e-10?layer.rotationDeg:rotated;return next;
 }
 const side=axes[handle];if(!side)return next;
 const [sx,sy]=side,mx=g.mirrorX??1,my=g.mirrorY??1,ax=g.anchorX??.5,ay=g.anchorY??.5;
 const local=p=>{const v=rotate({x:p.x-g.center.x,y:p.y-g.center.y},-g.rotationDeg);return {x:v.x*mx,y:v.y*my};};
 const a=local(start),b=local(point);
 let ratioX=sx?Math.max(.000001,1+sx*(b.x-a.x)/g.width):1,ratioY=sy?Math.max(.000001,1+sy*(b.y-a.y)/g.height):1;
 if(shiftKey&&sx&&sy){const ratio=Math.abs(ratioX-1)>=Math.abs(ratioY-1)?ratioX:ratioY;ratioX=ratioY=ratio;}
 if(g.kind==='sprite'){
  if(shiftKey&&sx&&sy){const value=layer.params.sizeStart;next.params.sizeStart=clamp(value*ratioX,.000001,8);ratioX=ratioY=next.params.sizeStart/value;}
  else{
   if(sx){const value=layer.params.scaleX??1;next.params.scaleX=clamp(value*ratioX,.05,8);ratioX=next.params.scaleX/value;}
   if(sy){const value=layer.params.scaleY??1;next.params.scaleY=clamp(value*ratioY,.05,8);ratioY=next.params.scaleY/value;}
  }
 }else{
  if(shiftKey&&sx&&sy){const ratio=clamp(ratioX,Math.max(.05/layer.origin.w,.005/layer.origin.h),Math.min(3/layer.origin.w,3/layer.origin.h));ratioX=ratioY=ratio;}
  next.origin.w=clamp(layer.origin.w*ratioX,.05,3);next.origin.h=clamp(layer.origin.h*ratioY,.005,3);ratioX=next.origin.w/layer.origin.w;ratioY=next.origin.h/layer.origin.h;
 }
 // Hold the opposite visible edge/corner still, even for mirrored off-centre anchors.
 const fx=sx===-1?1-ax:sx===1?-ax:0,fy=sy===-1?1-ay:sy===1?-ay:0;
 const displacement=rotate({x:fx*g.width*(1-ratioX)*mx,y:fy*g.height*(1-ratioY)*my},g.rotationDeg);
 return moveCentre(next,{...g,rect:g.rect},{x:g.center.x+displacement.x,y:g.center.y+displacement.y});
}
export function nudgeEffectLayer(layer,g,dx,dy){return transformEffectLayer(layer,g,'move',{x:0,y:0},{x:dx*EFFECT_NUDGE_MM,y:dy*EFFECT_NUDGE_MM});}
export function alignEffectLayer(layer,g,alignment){
 if(!g?.supported)return clone(layer);
 const xs=g.corners.map(p=>p.x),ys=g.corners.map(p=>p.y),left=Math.min(...xs),right=Math.max(...xs),top=Math.min(...ys),bottom=Math.max(...ys),r=g.rect;
 const dx=({left:r.x-left,center:r.x+r.w/2-(left+right)/2,right:r.x+r.w-right})[alignment]??0;
 const dy=({top:r.y-top,middle:r.y+r.h/2-(top+bottom)/2,bottom:r.y+r.h-bottom})[alignment]??0;
 return transformEffectLayer(layer,g,'move',{x:0,y:0},{x:dx,y:dy});
}
const svgNode=(tag,attributes)=>{const node=document.createElementNS('http://www.w3.org/2000/svg',tag);for(const [key,value] of Object.entries(attributes))node.setAttribute(key,value);return node;};
const midpoint=(a,b)=>({x:(a.x+b.x)/2,y:(a.y+b.y)/2});

/** Owns only preview UI and gesture lifetime; the editor owns draft validation and history. */
export function mountEffectTransform({canvas,viewport,toolbar,scope,getState,onBegin,onPreview,onCommit,onCancel}){
 let enabled=false,gesture=null,destroyed=false;
 const toggle=button('드래그 변형',()=>{if(gesture)finish(false);enabled=!enabled;refresh();},{id:'effect-transform-toggle','aria-pressed':'false'});
 const hint=el('p',{id:'effect-transform-hint',class:'effect-transform-hint',role:'status'});
 const alignments=[['left','왼쪽'],['center','가로 중앙'],['right','오른쪽'],['top','위쪽'],['middle','세로 중앙'],['bottom','아래쪽']];
 const alignment=el('div',{class:'effect-transform-align','aria-label':'선택 효과를 대상에 정렬'},...alignments.map(([key,label])=>button(label,()=>changeOnce((layer,g)=>alignEffectLayer(layer,g,key)),{'data-effect-align':key,title:'선택 효과를 대상 영역의 '+label+'에 정렬'})));
 const style=el('style',{},'.effect-transform-hint{flex-basis:100%;font-size:10px;line-height:1.5;color:var(--muted);margin:0;text-align:center}.effect-transform-align{display:flex;justify-content:center;gap:4px;flex-wrap:wrap;flex-basis:100%}.effect-transform-align button{font-size:9px;padding:4px 6px}#effect-transform-toggle[aria-pressed=true]{background:var(--accent);color:white}#effect-transform-overlay{position:absolute;overflow:visible;pointer-events:none;touch-action:none;user-select:none;z-index:2}#effect-transform-overlay[hidden]{display:none}#effect-transform-overlay [data-effect-handle]{pointer-events:all;touch-action:none}#effect-transform-overlay:focus{outline:none}');
 const overlay=svgNode('svg',{id:'effect-transform-overlay',tabindex:'-1','aria-label':'선택 효과 변형 핸들',hidden:''});viewport.append(overlay);toolbar.append(style,toggle,alignment,hint);
 function state(){const value=getState()??{};return {...value,geometry:effectTransformGeometry(value.layer,value)};}
 function coordinates(event){const box=canvas.getBoundingClientRect(),value=getState();return {x:(event.clientX-box.left)*value.cardWidthMm/box.width,y:(event.clientY-box.top)*value.cardHeightMm/box.height};}
 function refresh(){
  if(destroyed)return;const value=state(),g=value.geometry,available=g.supported&&!value.hidden;
  toggle.disabled=!g.supported;toggle.setAttribute('aria-pressed',String(enabled));toggle.title=g.reason||'선택한 효과의 위치·크기·회전을 조절해요.';
  for(const b of alignment.querySelectorAll('button'))b.disabled=!enabled||!available||!!gesture;
  hint.textContent=!g.supported?g.reason:!enabled?'드래그 변형을 켜면 선택한 레이어를 드래그할 수 있어요.':g.kind==='sprite'?'안쪽 이동 · 변 크기 · 모서리 자유 변형 · Shift+모서리 비율 유지 · 원 회전 · 방향키 1px / Shift 10px (300dpi) · Esc 취소':'발생 영역 이동·크기와 원 회전 · Shift+모서리 비율 유지 · 방향키 1px / Shift 10px (300dpi). 모양 발생은 선택한 면을 따라가요.';
  const hidden=!enabled||!available;overlay.toggleAttribute('hidden',hidden);if(hidden)return;
  const box=canvas.getBoundingClientRect(),scaleX=box.width/value.cardWidthMm,scaleY=box.height/value.cardHeightMm;
  overlay.style.left=canvas.offsetLeft+'px';overlay.style.top=canvas.offsetTop+'px';overlay.style.width=box.width+'px';overlay.style.height=box.height+'px';overlay.setAttribute('viewBox','0 0 '+box.width+' '+box.height);
  const pts=g.corners.map(p=>({x:p.x*scaleX,y:p.y*scaleY})),pivot={x:g.center.x*scaleX,y:g.center.y*scaleY};
  const polygon=svgNode('polygon',{points:pts.map(p=>p.x+','+p.y).join(' '),fill:'#4c9d7920',stroke:'#236b52','stroke-width':1.5,'data-effect-handle':'move',cursor:'move'});
  const handles={nw:pts[0],n:midpoint(pts[0],pts[1]),ne:pts[1],e:midpoint(pts[1],pts[2]),se:pts[2],s:midpoint(pts[2],pts[3]),sw:pts[3],w:midpoint(pts[3],pts[0])};
  const mid=handles.n,visualCenter=midpoint(pts[0],pts[2]);let vx=mid.x-visualCenter.x,vy=mid.y-visualCenter.y,length=Math.hypot(vx,vy);if(length<.0001){vx=0;vy=-1;length=1;}const rotation={x:mid.x+vx/length*27,y:mid.y+vy/length*27};
  const nodes=[polygon,svgNode('line',{x1:mid.x,y1:mid.y,x2:rotation.x,y2:rotation.y,stroke:'#236b52','stroke-width':1.5}),svgNode('path',{d:'M '+(pivot.x-4)+' '+pivot.y+' h 8 M '+pivot.x+' '+(pivot.y-4)+' v 8',stroke:'#236b52','stroke-width':1.5,fill:'none'})];
  for(const [key,p] of Object.entries(handles))nodes.push(svgNode('rect',{x:p.x-5,y:p.y-5,width:10,height:10,fill:'#fffdf8',stroke:'#236b52','stroke-width':1.5,'data-effect-handle':key,cursor:({n:'ns-resize',s:'ns-resize',w:'ew-resize',e:'ew-resize',nw:'nwse-resize',se:'nwse-resize',ne:'nesw-resize',sw:'nesw-resize'})[key]}));
  nodes.push(svgNode('circle',{cx:rotation.x,cy:rotation.y,r:6,fill:'#fffdf8',stroke:'#236b52','stroke-width':1.5,'data-effect-handle':'rotate',cursor:'grab'}));overlay.replaceChildren(...nodes);
 }
 function down(event){
  const handle=event.target.closest?.('[data-effect-handle]')?.getAttribute('data-effect-handle');if(!enabled||!handle||gesture||event.button!==0)return;
  event.preventDefault();event.stopPropagation();const token=onBegin();if(token===false)return;const value=state();if(!value.geometry.supported||value.hidden)return;
  gesture={token,pointerId:event.pointerId,layer:clone(value.layer),geometry:value.geometry,handle,start:coordinates(event)};overlay.focus({preventScroll:true});overlay.setPointerCapture(event.pointerId);refresh();
 }
 function move(event){if(!gesture||event.pointerId!==gesture.pointerId)return;event.preventDefault();event.stopPropagation();const next=transformEffectLayer(gesture.layer,gesture.geometry,gesture.handle,gesture.start,coordinates(event),event);onPreview(next);refresh();}
 function finish(commit){
  if(!gesture)return false;const current=gesture;gesture=null;if(overlay.hasPointerCapture(current.pointerId))overlay.releasePointerCapture(current.pointerId);commit?onCommit(current.token):onCancel(current.token);refresh();return true;
 }
 function up(event){if(gesture&&event.pointerId===gesture.pointerId){event.preventDefault();event.stopPropagation();finish(true);}}
 function cancelled(event){if(gesture&&event.pointerId===gesture.pointerId)finish(false);}
 function changeOnce(change){if(gesture||!enabled)return;const token=onBegin();if(token===false)return;const value=state();if(!value.geometry.supported||value.hidden)return;onPreview(change(value.layer,value.geometry));onCommit(token);refresh();}
 function keydown(event){
  if(gesture&&(event.key==='Escape'||(event.ctrlKey||event.metaKey)&&['z','y'].includes(event.key.toLowerCase()))){event.preventDefault();event.stopImmediatePropagation();finish(false);return;}
  if(!enabled||gesture||event.defaultPrevented||event.isComposing||event.keyCode===229||event.altKey||event.ctrlKey||event.metaKey||typing(event.target)||event.target.closest?.('[contenteditable=true]'))return;
  const direction=({ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]})[event.key];const value=state();if(!direction||!value.geometry.supported||value.hidden)return;
  event.preventDefault();event.stopPropagation();const amount=event.shiftKey?10:1;changeOnce((layer,g)=>nudgeEffectLayer(layer,g,direction[0]*amount,direction[1]*amount));
 }
 const blur=()=>finish(false),observer=new ResizeObserver(refresh);observer.observe(canvas);observer.observe(viewport);
 overlay.addEventListener('pointerdown',down);overlay.addEventListener('pointermove',move);overlay.addEventListener('pointerup',up);overlay.addEventListener('pointercancel',cancelled);overlay.addEventListener('lostpointercapture',cancelled);scope.addEventListener('keydown',keydown,true);window.addEventListener('blur',blur);window.addEventListener('resize',refresh);
 return {refresh,cancel:()=>finish(false),isDragging:()=>!!gesture,destroy(){if(destroyed)return;finish(false);destroyed=true;observer.disconnect();scope.removeEventListener('keydown',keydown,true);window.removeEventListener('blur',blur);window.removeEventListener('resize',refresh);overlay.remove();toggle.remove();alignment.remove();hint.remove();style.remove();}};
}
