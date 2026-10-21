import {newId} from './types.js';
import {decodeImage} from './assets.js';
import {IMAGE_CROP_LIMITS,validateImageSize} from './image-crop.js';

/** Pack row-major cells without scaling; unused cell pixels remain transparent. */
export async function packSpriteSheet(results,{columns}={}){
 if(!Array.isArray(results)||results.length===0)throw new Error('시트로 묶을 그림 프레임을 하나 이상 선택하세요.');
 if(results.length>IMAGE_CROP_LIMITS.maxCells)throw new Error('스프라이트 시트에는 최대 256개 프레임을 넣을 수 있습니다.');
 if(columns!==undefined&&(!Number.isInteger(columns)||columns<1||columns>16))throw new Error('시트 열 수는 1~16 사이의 정수로 입력하세요.');
 const frames=results.map(result=>{
  const asset=result?.asset,size=validateImageSize(asset);
  if(typeof asset.dataUrl!=='string'||!/^data:image\/(png|jpeg|webp);base64,/.test(asset.dataUrl))throw new Error('PNG, JPEG, WebP 그림 데이터를 선택하세요.');
  return {asset,...size};
 });
 const frameCount=frames.length;
 if(frameCount===1)return {asset:frames[0].asset,sheetColumns:1,sheetRows:1,frameCount:1};
 const sheetColumns=Math.max(columns??Math.ceil(Math.sqrt(frameCount)),Math.ceil(frameCount/16)),sheetRows=Math.ceil(frameCount/sheetColumns);
 const cellWidth=Math.max(...frames.map(frame=>frame.width)),cellHeight=Math.max(...frames.map(frame=>frame.height));
 const {width,height}=validateImageSize({width:sheetColumns*cellWidth,height:sheetRows*cellHeight});
 const images=[];
 for(const frame of frames){
  const image=await decodeImage(frame.asset.dataUrl);
  if(image.naturalWidth!==frame.width||image.naturalHeight!==frame.height)throw new Error('그림의 실제 크기와 저장된 크기가 다릅니다. 원본을 다시 가져오세요.');
  images.push(image);
 }
 const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
 try{
  const context=canvas.getContext('2d');if(!context)throw new Error('스프라이트 시트를 만들 작업 공간이 부족합니다. 그림 크기나 프레임 수를 줄여 주세요.');
  context.imageSmoothingEnabled=false;
  for(const [index,image] of images.entries())context.drawImage(image,index%sheetColumns*cellWidth,Math.floor(index/sheetColumns)*cellHeight);
  const dataUrl=canvas.toDataURL('image/png');if(!dataUrl.startsWith('data:image/png;base64,'))throw new Error('스프라이트 시트를 PNG로 만들지 못했습니다. 그림 크기나 프레임 수를 줄여 주세요.');
  return {asset:{id:newId(),mime:'image/png',dataUrl,width,height,paintingId:null},sheetColumns,sheetRows,frameCount};
 }finally{canvas.width=canvas.height=1;}
}
