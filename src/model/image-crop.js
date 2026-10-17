import {newId} from './types.js';
import {decodeImage} from './assets.js';

export const IMAGE_CROP_LIMITS=Object.freeze({maxDimension:16384,maxPixels:32_000_000,maxCells:256,maxBatchPixels:32_000_000});
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const integer=(value,min=0)=>Number.isSafeInteger(value)&&value>=min;

export function validateImageSize(size){
 const width=size?.width,height=size?.height;
 if(!integer(width,1)||!integer(height,1))throw new Error('그림 크기는 1픽셀 이상의 정수여야 합니다.');
 if(width>IMAGE_CROP_LIMITS.maxDimension||height>IMAGE_CROP_LIMITS.maxDimension||width*height>IMAGE_CROP_LIMITS.maxPixels)throw new Error('그림 크기가 너무 큽니다. 가로·세로 16,384픽셀 이하, 전체 3,200만 픽셀 이하로 줄여 주세요.');
 return {width,height};
}

export function validateCropRect(rect,size){
 const image=validateImageSize(size),{x,y,width,height}=rect||{};
 if(!integer(x)||!integer(y)||!integer(width,1)||!integer(height,1))throw new Error('영역의 X·Y는 0 이상, 너비·높이는 1 이상의 정수 픽셀로 입력하세요.');
 if(x+width>image.width||y+height>image.height)throw new Error('영역이 그림 범위를 벗어납니다. 시작 위치와 너비·높이를 줄여 주세요.');
 return {x,y,width,height};
}

/** Display bounds already contain the current zoom and scroll displacement. */
export function sourcePointFromClient(point,bounds,size){
 const image=validateImageSize(size);
 if(![point?.x,point?.y,bounds?.left,bounds?.top,bounds?.width,bounds?.height].every(Number.isFinite)||bounds.width<=0||bounds.height<=0)throw new Error('그림 표시 크기를 확인할 수 없습니다. 창을 다시 열어 주세요.');
 return {x:clamp((point.x-bounds.left)*image.width/bounds.width,0,image.width),y:clamp((point.y-bounds.top)*image.height/bounds.height,0,image.height)};
}

export function cropRectFromPoints(start,end,size){
 const image=validateImageSize(size);
 if(![start?.x,start?.y,end?.x,end?.y].every(Number.isFinite))throw new Error('영역 좌표를 확인하세요.');
 // CSS layout arithmetic can put an exact pixel edge a few ulps past an integer.
 const edge=value=>Math.abs(value-Math.round(value))<1e-7?Math.round(value):value;
 const x1=edge(clamp(Math.min(start.x,end.x),0,image.width)),x2=edge(clamp(Math.max(start.x,end.x),0,image.width));
 const y1=edge(clamp(Math.min(start.y,end.y),0,image.height)),y2=edge(clamp(Math.max(start.y,end.y),0,image.height));
 if(x1===x2||y1===y2)return null;
 const x=Math.floor(x1),y=Math.floor(y1);
 return {x,y,width:Math.ceil(x2)-x,height:Math.ceil(y2)-y};
}

/** Missing cell dimensions mean fit this many whole cells inside the image. */
export function createSpriteGrid(size,options={}){
 const image=validateImageSize(size),{rows,columns,offsetX=0,offsetY=0,gapX=0,gapY=0}=options;
 if(!integer(rows,1)||!integer(columns,1))throw new Error('행과 열은 1 이상의 정수로 입력하세요.');
 if(rows*columns>IMAGE_CROP_LIMITS.maxCells)throw new Error('한 번에 최대 256개 셀까지 나눌 수 있습니다. 행이나 열을 줄여 주세요.');
 if(![offsetX,offsetY,gapX,gapY].every(v=>integer(v)))throw new Error('시작 위치와 셀 간격은 0 이상의 정수 픽셀로 입력하세요.');
 const width=options.cellWidth??Math.floor((image.width-offsetX-gapX*(columns-1))/columns);
 const height=options.cellHeight??Math.floor((image.height-offsetY-gapY*(rows-1))/rows);
 if(!integer(width,1)||!integer(height,1))throw new Error('셀 크기는 1픽셀 이상이어야 합니다. 행·열 또는 간격을 줄여 주세요.');
 validateCropRect({x:offsetX,y:offsetY,width:columns*width+(columns-1)*gapX,height:rows*height+(rows-1)*gapY},image);
 return Array.from({length:rows*columns},(_,index)=>{
  const row=Math.floor(index/columns),column=index%columns;
  return {row,column,rect:{x:offsetX+column*(width+gapX),y:offsetY+row*(height+gapY),width,height}};
 });
}

export function validateCropBatch(size,regions){
 validateImageSize(size);
 if(!Array.isArray(regions)||regions.length===0)throw new Error('저장할 영역이나 셀을 하나 이상 선택하세요.');
 if(regions.length>IMAGE_CROP_LIMITS.maxCells)throw new Error('한 번에 최대 256개 영역을 저장할 수 있습니다. 나누어 저장하세요.');
 let pixels=0;
 const normalized=regions.map(region=>{
  const rect=validateCropRect(region?.rect,size);pixels+=rect.width*rect.height;
  return {rect,name:typeof region.name==='string'?region.name.trim().slice(0,120):''};
 });
 if(pixels>IMAGE_CROP_LIMITS.maxBatchPixels)throw new Error('선택한 영역의 합이 3,200만 픽셀을 넘습니다. 영역을 줄이거나 나누어 저장하세요.');
 return normalized;
}

/** Integer source/destination rectangles never resize or alter the source asset. */
export async function cropAssetRegions(asset,regions){
 const normalized=validateCropBatch(asset,regions);
 if(typeof asset?.dataUrl!=='string'||!/^data:image\/(png|jpeg|webp);base64,/.test(asset.dataUrl))throw new Error('PNG, JPEG, WebP 그림 데이터를 선택하세요.');
 const image=await decodeImage(asset.dataUrl);
 if(image.naturalWidth!==asset.width||image.naturalHeight!==asset.height)throw new Error('그림의 실제 크기와 저장된 크기가 다릅니다. 원본을 다시 가져오세요.');
 const used=new Set(),results=[];
 for(const [index,region] of normalized.entries()){
  const {x,y,width,height}=region.rect,canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
  try{
   const ctx=canvas.getContext('2d');if(!ctx)throw new Error('그림 작업 공간을 만들지 못했습니다. 더 작은 영역으로 나누어 저장하세요.');
   ctx.imageSmoothingEnabled=false;ctx.drawImage(image,x,y,width,height,0,0,width,height);
   const dataUrl=canvas.toDataURL('image/png');if(!dataUrl.startsWith('data:image/png;base64,'))throw new Error('PNG를 만들지 못했습니다. 더 작은 영역으로 나누어 저장하세요.');
   const base=region.name||'영역-'+String(index+1).padStart(3,'0');let name=base,suffix=2;while(used.has(name))name=base+'-'+suffix++;used.add(name);
   results.push({asset:{id:newId(),mime:'image/png',dataUrl,width,height,paintingId:null},name,sourceRect:{...region.rect}});
  }finally{canvas.width=canvas.height=1;}
 }
 return results;
}
