import {activeLayer,copyCanvas,newCanvas,commitPixels,compositePainting} from './document.js';
import {clipRect,region,unionRect,transformedImage,rotateImage} from './selection.js';
import {createStroke} from './strokes.js';
export const PAINT_BRUSH_MIN=.1,PAINT_BRUSH_MAX=4096;
const DEFAULTS={tool:'brush',size:8,opacity:1,color:'#233d33',hardness:1,smoothing:.2,pixelSnap:false,pressureSize:false,tolerance:16,shapeFill:false,brushTip:'round',mirrorX:false,mirrorY:false,preserveAlpha:false,gradientColor:'#ffffff',gradientType:'linear',sampleMerged:false};
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
export function createPaintTools(session){
 let options={...DEFAULTS},gesture=null,selection=null,floating=null,clipboard=null;
 const writable=()=>{const l=activeLayer(session);if(session.busy||session.history.isBusy())throw Error('이전 그림 작업을 마친 뒤 다시 시도하세요.');if(!l||l.locked)throw Error('잠긴 레이어에는 그릴 수 없어요.');return l;};
 function shape(g){
  const c=copyCanvas(g.original),ctx=c.getContext('2d');if(g.selection){ctx.beginPath();ctx.rect(g.selection.x,g.selection.y,g.selection.w,g.selection.h);ctx.clip();}
  if(g.options.preserveAlpha)ctx.globalCompositeOperation='source-atop';
  ctx.globalAlpha=g.options.opacity;ctx.fillStyle=g.options.color;ctx.strokeStyle=g.options.color;ctx.lineWidth=g.options.size;ctx.lineCap='round';ctx.lineJoin='round';
  const x=Math.min(g.start.x,g.end.x),y=Math.min(g.start.y,g.end.y),w=Math.max(1,Math.abs(g.end.x-g.start.x)),h=Math.max(1,Math.abs(g.end.y-g.start.y));
  ctx.beginPath();if(g.tool==='line'){ctx.moveTo(g.start.x,g.start.y);ctx.lineTo(g.end.x,g.end.y);}else if(g.tool==='rect')ctx.rect(x,y,w,h);else ctx.ellipse(x+w/2,y+h/2,w/2,h/2,0,0,Math.PI*2);
  if(g.options.shapeFill&&g.tool!=='line')ctx.fill();else ctx.stroke();return c;
 }
 function gradient(g){
  const c=copyCanvas(g.original),ctx=c.getContext('2d'),distance=Math.hypot(g.end.x-g.start.x,g.end.y-g.start.y);
  if(distance<1e-9)return c;
  if(g.selection){ctx.beginPath();ctx.rect(g.selection.x,g.selection.y,g.selection.w,g.selection.h);ctx.clip();}
  ctx.globalAlpha=g.options.opacity;if(g.options.preserveAlpha)ctx.globalCompositeOperation='source-atop';
  const paint=g.options.gradientType==='radial'?ctx.createRadialGradient(g.start.x,g.start.y,0,g.start.x,g.start.y,distance):ctx.createLinearGradient(g.start.x,g.start.y,g.end.x,g.end.y);
  paint.addColorStop(0,g.options.color);paint.addColorStop(1,g.options.gradientColor);ctx.fillStyle=paint;ctx.fillRect(0,0,c.width,c.height);return c;
 }
 function floatPreview(){
  const layer=session.layers.find(l=>l.id===floating.layerId),c=copyCanvas(layer.canvas),ctx=c.getContext('2d');
  if(floating.source)ctx.clearRect(floating.source.x,floating.source.y,floating.source.w,floating.source.h);
  ctx.imageSmoothingEnabled=!options.pixelSnap;ctx.imageSmoothingQuality='high';const img=transformedImage(floating.image,floating.flipX,floating.flipY);ctx.drawImage(img,floating.rect.x,floating.rect.y,floating.rect.w,floating.rect.h);return c;
 }
 async function commit(layerId,rect,preview){
  if(!rect)return;const l=session.layers.find(l=>l.id===layerId);if(!l||l.locked)throw Error('잠긴 레이어에는 그릴 수 없어요.');
  const before=region(l.canvas,rect),after=region(preview,rect),a=before.getContext('2d').getImageData(0,0,rect.w,rect.h).data,b=after.getContext('2d').getImageData(0,0,rect.w,rect.h).data;
  if(a.every((v,i)=>v===b[i]))return;await commitPixels(session,layerId,rect,before,after);
 }
 function fill(g){
  const c=copyCanvas(g.original),ctx=c.getContext('2d'),data=ctx.getImageData(0,0,c.width,c.height),pixels=data.data,rect=g.selection??{x:0,y:0,w:c.width,h:c.height},x=Math.floor(g.start.x),y=Math.floor(g.start.y);
  if(x<rect.x||y<rect.y||x>=rect.x+rect.w||y>=rect.y+rect.h)return {canvas:c,rect:null};
  const sampled=g.sample?g.sample.getContext('2d').getImageData(0,0,c.width,c.height).data:pixels;
  const seed=(y*c.width+x)*4,target=sampled.slice(seed,seed+4),probe=newCanvas(1,1),pc=probe.getContext('2d');pc.fillStyle=g.options.color;pc.fillRect(0,0,1,1);const color=pc.getImageData(0,0,1,1).data;
  const visited=new Uint8Array(c.width*c.height),stack=[y*c.width+x];let minX=c.width,minY=c.height,maxX=-1,maxY=-1;
  const matches=(xx,yy)=>{if(xx<rect.x||xx>=rect.x+rect.w||yy<rect.y||yy>=rect.y+rect.h)return false;const id=yy*c.width+xx;if(visited[id])return false;const i=id*4;return [0,1,2,3].every(k=>Math.abs(sampled[i+k]-target[k])<=g.options.tolerance);};
  while(stack.length){
   const id=stack.pop(),cy=Math.floor(id/c.width),sx=id%c.width;if(!matches(sx,cy))continue;
   let lo=sx,hi=sx;while(matches(lo-1,cy))lo--;while(matches(hi+1,cy))hi++;
   for(let xx=lo;xx<=hi;xx++){const index=cy*c.width+xx,i=index*4;visited[index]=1;
    const sa=g.options.opacity,da=pixels[i+3]/255;
    if(g.options.preserveAlpha){if(da)for(let k=0;k<3;k++)pixels[i+k]=Math.round(color[k]*sa+pixels[i+k]*(1-sa));}
    else{const oa=sa+da*(1-sa);for(let k=0;k<3;k++)pixels[i+k]=oa?Math.round((color[k]*sa+pixels[i+k]*da*(1-sa))/oa):0;pixels[i+3]=Math.round(oa*255);}
   }
   minX=Math.min(minX,lo);maxX=Math.max(maxX,hi);minY=Math.min(minY,cy);maxY=Math.max(maxY,cy);
   for(const ny of [cy-1,cy+1]){let inRun=false;for(let xx=lo;xx<=hi;xx++){const hit=matches(xx,ny);if(hit&&!inRun)stack.push(ny*c.width+xx);inRun=hit;}}
  }
  ctx.putImageData(data,0,0);return {canvas:c,rect:maxX>=minX?{x:minX,y:minY,w:maxX-minX+1,h:maxY-minY+1}:null};
 }
 const api={
  setOptions(change){if(change.tool&&change.tool!==options.tool)api.cancel();options={...options,...change};for(const [key,min,max] of [['size',PAINT_BRUSH_MIN,PAINT_BRUSH_MAX],['opacity',0,1],['hardness',0,1],['smoothing',0,1],['tolerance',0,255]])options[key]=clamp(Number.isFinite(options[key])?options[key]:DEFAULTS[key],min,max);
   if(!['round','square'].includes(options.brushTip))options.brushTip=DEFAULTS.brushTip;if(!['linear','radial'].includes(options.gradientType))options.gradientType=DEFAULTS.gradientType;
   for(const key of ['mirrorX','mirrorY','preserveAlpha','sampleMerged'])options[key]=options[key]===true;
   if(typeof options.gradientColor!=='string'||!CSS.supports('color',options.gradientColor))options.gradientColor=DEFAULTS.gradientColor;
  },
  getOptions:()=>({...options}),getSelection:()=>floating?{...floating.rect}:selection?{...selection}:null,isFloating:()=>!!floating,isGesture:()=>!!gesture,
  getPreview:()=>floating?floatPreview():gesture?.stroke?gesture.stroke.preview():gesture&&['line','rect','ellipse'].includes(gesture.tool)?shape(gesture):gesture?.tool==='gradient'?gradient(gesture):null,
  previewLayerId:()=>floating?.layerId??gesture?.layerId??session.activeLayerId,
  begin(point,pressure=1){
   if(floating)throw Error('선택 변형을 먼저 확정하거나 취소하세요.');
   const tool=options.tool;
   if(tool==='eyedropper'){const c=compositePainting(session),x=Math.floor(point.x),y=Math.floor(point.y);if(x>=0&&y>=0&&x<c.width&&y<c.height){const rgba=c.getContext('2d').getImageData(x,y,1,1).data;options.color='#'+[...rgba.slice(0,3)].map(v=>v.toString(16).padStart(2,'0')).join('');}return;}
   if(tool==='pan')return;
   if(tool==='select'){gesture={tool,start:{...point},end:{...point},previous:selection};return;}
   const l=writable();gesture={tool,layerId:l.id,original:copyCanvas(l.canvas),selection:selection?{...selection}:null,start:{...point},end:{...point},options:{...options}};
   if(tool==='fill'&&options.sampleMerged)gesture.sample=compositePainting(session);
   if(tool==='brush'||tool==='eraser')gesture.stroke=createStroke(gesture.original,gesture.options,gesture.selection,point,pressure);
  },
  move(point,pressure=1){if(!gesture)return;gesture.end={...point};if(gesture.stroke)gesture.stroke.move(point,pressure);if(gesture.tool==='select')selection=clipRect({x:gesture.start.x,y:gesture.start.y,w:point.x-gesture.start.x,h:point.y-gesture.start.y},session.width,session.height);},
  async end(){
   const g=gesture;if(!g)return;gesture=null;
   if(g.tool==='select'){selection=clipRect({x:g.start.x,y:g.start.y,w:g.end.x-g.start.x,h:g.end.y-g.start.y},session.width,session.height);return;}
   if(g.stroke){g.stroke.finish();await commit(g.layerId,g.stroke.bounds(),g.stroke.preview());}
   else if(g.tool==='fill'){const out=fill(g);await commit(g.layerId,out.rect,out.canvas);}
   else if(g.tool==='gradient')await commit(g.layerId,g.selection??{x:0,y:0,w:session.width,h:session.height},gradient(g));
   else{const pad=g.options.size/2+2,x=Math.min(g.start.x,g.end.x)-pad,y=Math.min(g.start.y,g.end.y)-pad,rect=clipRect({x,y,w:Math.abs(g.end.x-g.start.x)+2*pad,h:Math.abs(g.end.y-g.start.y)+2*pad},session.width,session.height);await commit(g.layerId,rect,shape(g));}
  },
  cancel(){if(gesture?.tool==='select')selection=gesture.previous;gesture=null;},
  select(rect){api.cancel();floating=null;selection=clipRect(rect,session.width,session.height);},
  copy(){if(floating)throw Error('선택 변형을 먼저 확정하거나 취소한 뒤 복사하세요.');const l=activeLayer(session);if(selection&&l)clipboard=region(l.canvas,selection);},
  async cut(){if(floating)throw Error('선택 변형을 먼저 확정하거나 취소한 뒤 잘라내세요.');if(!selection)return;const l=writable();api.copy();const preview=copyCanvas(l.canvas);preview.getContext('2d').clearRect(selection.x,selection.y,selection.w,selection.h);await commit(l.id,selection,preview);},
  paste(){if(!clipboard)return;const l=writable();api.cancel();floating={layerId:l.id,image:copyCanvas(clipboard),source:null,rect:{x:selection?.x??Math.round((session.width-clipboard.width)/2),y:selection?.y??Math.round((session.height-clipboard.height)/2),w:clipboard.width,h:clipboard.height},flipX:false,flipY:false};},
  transform(change){
   if(!floating){if(!selection)return;const l=writable();floating={layerId:l.id,image:region(l.canvas,selection),source:{...selection},rect:{...selection},flipX:false,flipY:false};}
   if(change.flipX)floating.flipX=!floating.flipX;if(change.flipY)floating.flipY=!floating.flipY;
   if(change.rotate90){floating.image=rotateImage(transformedImage(floating.image,floating.flipX,floating.flipY));floating.flipX=false;floating.flipY=false;const old=floating.rect.w;floating.rect.w=floating.rect.h;floating.rect.h=old;}
   for(const key of ['x','y','w','h'])if(change[key]!==undefined){if(!Number.isFinite(change[key])||(['w','h'].includes(key)&&change[key]<1))throw Error('선택 영역 크기는 1 px 이상이어야 해요.');floating.rect[key]=Math.round(clamp(change[key],['w','h'].includes(key)?1:-4096,4096));}
  },
  async commitSelection(){if(!floating)return;const f=floating;await commit(f.layerId,unionRect(f.source,f.rect,session.width,session.height),floatPreview());selection=clipRect(f.rect,session.width,session.height);floating=null;},
  cancelSelection(){floating=null;},
 };
 return api;
}
