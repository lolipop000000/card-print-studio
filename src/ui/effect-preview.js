import {mountTouchViewport} from './touch-viewport.js';
const BASE_WIDTH=315,MIN_ZOOM=.5,MAX_ZOOM=8,MAX_DPI=600,MAX_PIXELS=4_000_000;
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));

/** Match display pixels while bounding the full-card buffers used by effects. */
export function effectPreviewDpi({widthMm,heightMm,displayWidth=0,pixelRatio=1,printQuality=false,dpi=null}){
 if(Number.isFinite(dpi)&&dpi>0){
  const budget=Math.floor(Math.min(25.4*Math.sqrt(16_000_000/((widthMm+24)*(heightMm+24))),8192*25.4/(widthMm+24),8192*25.4/(heightMm+24)));
  return Math.max(1,Math.min(Math.round(dpi),MAX_DPI,budget));
 }
 const base=printQuality?300:200,ratio=Number.isFinite(pixelRatio)&&pixelRatio>0?pixelRatio:1;
 const needed=Math.max(base,Math.max(0,displayWidth)*ratio*25.4/widthMm);
 // Effects render into a surface extending 12mm beyond each card edge.
 const budget=Math.min(MAX_DPI,Math.floor(25.4*Math.sqrt(MAX_PIXELS/((widthMm+24)*(heightMm+24)))));
 return Math.max(1,Math.min(Math.ceil(needed/25)*25,budget));
}

/** Playback has a local raster budget; saved frames always use full quality. */
export function createEffectPreviewQuality(){
 let activeDpi=100,fastFrames=0,slowFrames=0;const frameBudget=1000/24;
 return {
  dpi(options){const full=effectPreviewDpi(options);return options.active&&!(Number.isFinite(options.dpi)&&options.dpi>0)?Math.min(full,activeDpi):full;},
  record(durationMs,dpi,{active=false,manual=false}={}){
   if(manual||!active||!Number.isFinite(durationMs)||durationMs<=0||!Number.isFinite(dpi)||dpi<=0)return;
   if(durationMs>frameBudget*1.2){
    fastFrames=0;
    // Texture allocation and shader compilation can make a single frame slow.
    // Reduce immediately for a severe stall, otherwise require a second frame.
    if(durationMs>frameBudget*4||++slowFrames>=2){activeDpi=Math.max(50,Math.min(dpi-10,Math.floor(dpi*Math.sqrt(frameBudget/durationMs)/10)*10));slowFrames=0;}
   }else if(durationMs<frameBudget*.6){slowFrames=0;if(++fastFrames>=12){activeDpi=Math.min(150,dpi+10);fastFrames=0;}}
   else fastFrames=slowFrames=0;
  }
 };
}

/** Viewing state stays outside effect drafts, project history, and print settings. */
export function mountEffectPreview({canvas,viewport,select,widthMm,heightMm,getPrintQuality=()=>false,getDpi=()=>null,canZoom=()=>true,onChange,onLayout=()=>{}}){
 let zoom=1,disposed=false,lastWidth=0,lastRatio=window.devicePixelRatio||1,active=false;const quality=createEffectPreviewQuality();
 function synchronize(){
  const value=String(zoom);select.querySelector('[data-custom-zoom]')?.remove();
  if(![...select.options].some(option=>option.value===value)){
   const option=document.createElement('option');option.value=value;option.textContent=(Math.round(zoom*1000)/10)+'%';option.dataset.customZoom='true';select.append(option);
  }
  select.value=value;canvas.dataset.previewZoom=value;
 }
 function crisp(){
  const width=canvas.getBoundingClientRect().width*(window.devicePixelRatio||1);
  // At the work limit, retain the computed pixels instead of blurring a small bitmap.
  canvas.style.imageRendering=!active&&canvas.width+.5<width?'pixelated':'auto';
 }
 function sizeDisplay(){
  const width=BASE_WIDTH*zoom;
  // Raster dimensions are rounded at each quality level; gestures use the logical card ratio.
  canvas.style.width=width+'px';canvas.style.height=width*heightMm/widthMm+'px';
 }
 function setZoom(value,anchor){
  if(disposed||!canZoom())return false;
  value=Number(value);if(!Number.isFinite(value))return false;
  const next=clamp(Math.round(value*1000)/1000,MIN_ZOOM,MAX_ZOOM);
  if(next===zoom){synchronize();return false;}
  const before=canvas.getBoundingClientRect(),area=viewport.getBoundingClientRect();
  const point=anchor||{x:area.left+viewport.clientWidth/2,y:area.top+viewport.clientHeight/2};
  const x=before.width?(point.x-before.left)/before.width:.5,y=before.height?(point.y-before.top)/before.height:.5;
  zoom=next;synchronize();sizeDisplay();
  const after=canvas.getBoundingClientRect();
  viewport.scrollLeft+=after.left+x*after.width-point.x;viewport.scrollTop+=after.top+y*after.height-point.y;
  lastWidth=after.width;lastRatio=window.devicePixelRatio||1;crisp();onLayout();onChange();return true;
 }
 function wheel(event){
  if(disposed||!event.ctrlKey&&!event.metaKey)return;
  event.preventDefault();if(!canZoom()||!Number.isFinite(event.deltaY))return;
  const unit=event.deltaMode===1?16:event.deltaMode===2?viewport.clientHeight:1;
  const delta=clamp(event.deltaY*unit,-400,400);
  setZoom(zoom*Math.exp(-delta*.0015),{x:event.clientX,y:event.clientY});
 }
 function resized(){
  if(disposed)return;const width=canvas.getBoundingClientRect().width,ratio=window.devicePixelRatio||1;
  crisp();onLayout();if(Math.abs(width-lastWidth)<.1&&ratio===lastRatio)return;
  lastWidth=width;lastRatio=ratio;onChange();
 }
 const observer=new ResizeObserver(resized);observer.observe(viewport);observer.observe(canvas);
 const touchView=mountTouchViewport({viewport,onStart:canZoom,onChange:({factor,from,to})=>{setZoom(zoom*factor,from);viewport.scrollLeft-=to.x-from.x;viewport.scrollTop-=to.y-from.y;onLayout();}});
 viewport.addEventListener('wheel',wheel,{passive:false});window.addEventListener('resize',resized);
 sizeDisplay();synchronize();lastWidth=canvas.getBoundingClientRect().width;crisp();onChange();
 return {
  setZoom,
  dpi:({active:nextActive=false}={})=>quality.dpi({widthMm,heightMm,displayWidth:canvas.getBoundingClientRect().width,pixelRatio:window.devicePixelRatio||1,printQuality:getPrintQuality(),dpi:getDpi(),active:nextActive}),
  afterDraw(dpi,{durationMs=0,active:nextActive=false}={}){active=nextActive;quality.record(durationMs,dpi,{active,manual:getDpi()!==null});canvas.dataset.previewDpi=String(dpi);canvas.dataset.previewActive=String(active);crisp();},
  destroy(){if(disposed)return;disposed=true;touchView.destroy();observer.disconnect();viewport.removeEventListener('wheel',wheel);window.removeEventListener('resize',resized);}
 };
}
