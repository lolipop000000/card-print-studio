import {newId} from '../model/types.js';
import {decodeImage} from '../model/assets.js';
import {createPaintHistory} from './history.js';
import {DEFAULT_PAINT_BLEND_MODE,normalizePaintBlendMode,isPaintBlendMode,paintBlendModeLabel} from './blend-modes.js';
export function newCanvas(width,height){const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;return canvas;}
export function copyCanvas(source){const c=newCanvas(source.width,source.height);c.getContext('2d').drawImage(source,0,0);return c;}
export function activeLayer(s){return s.layers.find(l=>l.id===s.activeLayerId);}
function dimensions(w,h){if(!Number.isSafeInteger(w)||!Number.isSafeInteger(h)||w<64||h<64||w>4096||h>4096)throw Error('캔버스는 각 변 64~4096 px로 설정하세요.');}
function layer(w,h,name='레이어 1'){return {id:newId(),name,visible:true,locked:false,opacity:1,blendMode:DEFAULT_PAINT_BLEND_MODE,canvas:newCanvas(w,h)};}
export async function openPainting(source,options={}){
 const s={id:newId(),width:1200,height:1200,layers:[],activeLayerId:null,history:createPaintHistory(),busy:false};
 if(source?.layers){
  dimensions(source.width,source.height);if(!source.layers.length)throw Error('레이어가 하나 이상 필요해요.');
  s.id=source.id;s.width=source.width;s.height=source.height;
  for(const saved of source.layers){const image=await decodeImage(saved.png);if(image.width!==s.width||image.height!==s.height)throw Error('레이어 PNG의 크기가 원본과 달라요.');const c=newCanvas(s.width,s.height);c.getContext('2d').drawImage(image,0,0);s.layers.push({id:saved.id,name:saved.name,visible:saved.visible,locked:saved.locked,opacity:saved.opacity,blendMode:normalizePaintBlendMode(saved.blendMode),canvas:c});}
  s.activeLayerId=source.activeLayerId;
 }else if(source?.dataUrl){
  const image=await decodeImage(source.dataUrl);if((image.width>4096||image.height>4096)&&!options.fitToLimits)throw Object.assign(new Error('원본이 4096 px를 넘어요. 그리기용 레이어를 축소할지 선택하세요.'),{code:'painting-size-limit'});
  const scale=Math.min(1,4096/image.width,4096/image.height),w=Math.round(image.width*scale),h=Math.round(image.height*scale);
  s.width=Math.max(64,w);s.height=Math.max(64,h);const l=layer(s.width,s.height,'가져온 그림');l.canvas.getContext('2d').drawImage(image,(s.width-w)/2,(s.height-h)/2,w,h);s.layers.push(l);
 }else s.layers.push(layer(s.width,s.height));
 if(!s.layers.some(l=>l.id===s.activeLayerId))s.activeLayerId=s.layers.at(-1).id;
 return s;
}
export async function serializePainting(s){return {id:s.id,width:s.width,height:s.height,activeLayerId:s.activeLayerId,layers:s.layers.map(l=>({id:l.id,name:l.name,visible:l.visible,locked:l.locked,opacity:l.opacity,blendMode:normalizePaintBlendMode(l.blendMode),png:l.canvas.toDataURL('image/png')}))};}
export function compositePainting(s,whiteBackground=false,{preview=null,layerId=null}={}){
 const canvas=newCanvas(s.width,s.height),ctx=canvas.getContext('2d');
 for(const l of s.layers)if(l.visible){ctx.globalAlpha=l.opacity;ctx.globalCompositeOperation=normalizePaintBlendMode(l.blendMode);ctx.drawImage(preview&&l.id===layerId?preview:l.canvas,0,0);}
 ctx.globalAlpha=1;
 if(whiteBackground){ctx.globalCompositeOperation='destination-over';ctx.fillStyle='#ffffff';ctx.fillRect(0,0,s.width,s.height);}
 ctx.globalCompositeOperation='source-over';return canvas;
}
/** Crop the display composite without touching editable layer canvases. */
export function trimTransparentCanvas(source){
 const {width,height}=source,pixels=source.getContext('2d').getImageData(0,0,width,height).data;
 let left=width,top=height,right=-1,bottom=-1,i=3;
 for(let y=0;y<height;y++)for(let x=0;x<width;x++,i+=4)if(pixels[i]){
  left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x);bottom=Math.max(bottom,y);
 }
 if(right<left)return newCanvas(1,1);
 if(left===0&&top===0&&right===width-1&&bottom===height-1)return source;
 const w=right-left+1,h=bottom-top+1,canvas=newCanvas(w,h);
 canvas.getContext('2d').drawImage(source,left,top,w,h,0,0,w,h);return canvas;
}
export async function compressCanvas(c){const blob=await new Promise((resolve,reject)=>c.toBlob(b=>b?resolve(b):reject(Error('PNG를 저장하지 못했어요.')),'image/png'));return new Uint8Array(await blob.arrayBuffer());}
async function drawBytes(canvas,png,x=0,y=0,clear=true){
 const image=await createImageBitmap(new Blob([png],{type:'image/png'}));const ctx=canvas.getContext('2d');if(clear)ctx.clearRect(x,y,image.width,image.height);ctx.drawImage(image,x,y);image.close();
}
async function snapshot(s){
 const layers=[];for(const l of s.layers)layers.push({id:l.id,name:l.name,visible:l.visible,locked:l.locked,opacity:l.opacity,blendMode:normalizePaintBlendMode(l.blendMode),png:await compressCanvas(l.canvas)});
 return {width:s.width,height:s.height,activeLayerId:s.activeLayerId,layers};
}
function snapshotBytes(v){return v.layers.reduce((n,l)=>n+l.png.byteLength,0)+new TextEncoder().encode(JSON.stringify({...v,layers:v.layers.map(({png,...meta})=>meta)})).byteLength;}
async function restore(s,v){
 const layers=[];for(const l of v.layers){const c=newCanvas(v.width,v.height);await drawBytes(c,l.png);const {png,...meta}=l;layers.push({...meta,canvas:c});}
 s.width=v.width;s.height=v.height;s.activeLayerId=v.activeLayerId;s.layers=layers;
}
export async function transactPainting(s,change){
 if(s.busy||s.history.isBusy())throw Error('이전 그림 작업을 마친 뒤 다시 시도하세요.');
 s.busy=true;let before;
 try{before=await snapshot(s);await change();const after=await snapshot(s);
  if(!s.history.push({byteLength:snapshotBytes(before)+snapshotBytes(after),undo:()=>restore(s,before),redo:()=>restore(s,after)}))throw Error('이 작업이 그림 기록의 용량 한도를 넘어서 적용하지 못했어요.');
 }catch(e){if(before)await restore(s,before);throw e;}finally{s.busy=false;}
}
/** Keep only the changed rectangle as lossless PNGs; a stroke is one complete action. */
export async function commitPixels(s,layerId,rect,beforeCanvas,afterCanvas){
 if(s.busy||s.history.isBusy())throw Error('이전 그림 작업을 마친 뒤 다시 시도하세요.');
 const target=s.layers.find(l=>l.id===layerId);if(!target||target.locked)throw Error('잠긴 레이어에는 그릴 수 없어요.');
 s.busy=true;
 try{
  const before=await compressCanvas(beforeCanvas),after=await compressCanvas(afterCanvas),apply=png=>{const l=s.layers.find(l=>l.id===layerId);if(!l)throw Error('그림 레이어가 없어요.');return drawBytes(l.canvas,png,rect.x,rect.y);};
  await apply(after);
  if(!s.history.push({byteLength:before.byteLength+after.byteLength+64,undo:()=>apply(before),redo:()=>apply(after)})){await apply(before);throw Error('이 획이 그림 기록의 용량 한도를 넘어서 적용하지 못했어요.');}
 }finally{s.busy=false;}
}
function sameCanvasPixels(a,b){
 const ac=a.getContext('2d'),bc=b.getContext('2d');
 for(let y=0;y<a.height;y+=64){const h=Math.min(64,a.height-y),left=ac.getImageData(0,y,a.width,h).data,right=bc.getImageData(0,y,b.width,h).data;if(left.some((v,i)=>v!==right[i]))return false;}
 return true;
}
export async function editLayers(s,op){
 if(s.busy||s.history.isBusy())throw Error('이전 그림 작업을 마친 뒤 다시 시도하세요.');
 const id=op.layerId??s.activeLayerId,index=s.layers.findIndex(l=>l.id===id),target=s.layers[index];
 if(!target)throw Error('선택한 레이어가 없어요.');
 if(op.type==='delete'&&s.layers.length===1)throw Error('레이어는 최소 한 장이 필요해요.');
 if(op.type==='mergeDown'&&(index===0||target.locked||s.layers[index-1].locked))throw Error('아래 레이어가 없거나 잠겨 있어 합칠 수 없어요.');
 if(['resizeCanvas','resample'].includes(op.type))dimensions(op.width,op.height);
 if(op.type==='opacity'&&(!Number.isFinite(op.value)||op.value<0||op.value>1))throw Error('레이어 불투명도는 0~100%예요.');
 if(op.type==='blendMode'&&!isPaintBlendMode(op.value))throw Error('지원하지 않는 레이어 혼합 모드예요.');
 if(op.type==='reorder'&&(!Number.isInteger(op.index)||op.index<0||op.index>=s.layers.length))throw Error('잘못된 레이어 순서예요.');
 let merged;
 if(op.type==='mergeDown'){
  const below=s.layers[index-1],canvas=compositePainting({...s,layers:[below,target]});
  merged={...below,canvas,visible:true,opacity:1,blendMode:DEFAULT_PAINT_BLEND_MODE};
  const candidate={...s,layers:s.layers.flatMap((l,i)=>i===index?[]:i===index-1?[merged]:[l])};
  if(!sameCanvasPixels(compositePainting(s),compositePainting(candidate)))throw Error('현재 레이어의 '+paintBlendModeLabel(target.blendMode)+' / 아래 레이어의 '+paintBlendModeLabel(below.blendMode)+' 혼합 결과가 더 아래 배경에 의존해요. 합치면 그림이 달라져 레이어를 유지했어요.');
 }
 await transactPainting(s,()=>{
  switch(op.type){
   case 'add':{const l=layer(s.width,s.height,'레이어 '+(s.layers.length+1));s.layers.splice(index+1,0,l);s.activeLayerId=l.id;break;}
   case 'duplicate':{const l={...target,id:newId(),name:target.name+' 복사',canvas:copyCanvas(target.canvas)};s.layers.splice(index+1,0,l);s.activeLayerId=l.id;break;}
   case 'delete':s.layers.splice(index,1);s.activeLayerId=s.layers[Math.max(0,index-1)].id;break;
   case 'rename':target.name=String(op.name??'');break;
   case 'reorder':s.layers.splice(index,1);s.layers.splice(op.index,0,target);break;
   case 'visibility':target.visible=!!op.value;break;
   case 'lock':target.locked=!!op.value;break;
   case 'opacity':target.opacity=op.value;break;
   case 'blendMode':target.blendMode=op.value;break;
   case 'mergeDown':s.layers.splice(index-1,2,merged);s.activeLayerId=merged.id;break;
   case 'resizeCanvas':case 'resample':{
    const factors={'top-left':[0,0],top:[.5,0],'top-right':[1,0],left:[0,.5],center:[.5,.5],right:[1,.5],'bottom-left':[0,1],bottom:[.5,1],'bottom-right':[1,1]},anchor=factors[op.anchor??'center'];if(!anchor)throw Error('크기 변경 기준점을 선택하세요.');
    for(const l of s.layers){const c=newCanvas(op.width,op.height),ctx=c.getContext('2d');if(op.type==='resample'){ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.drawImage(l.canvas,0,0,op.width,op.height);}else ctx.drawImage(l.canvas,Math.round((op.width-s.width)*anchor[0]),Math.round((op.height-s.height)*anchor[1]));l.canvas=c;}
    s.width=op.width;s.height=op.height;break;
   }
   default:throw Error('지원하지 않는 레이어 작업이에요.');
  }
 });
}
