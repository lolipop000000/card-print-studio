import {newId,clone} from './types.js';
const decoded=new Map();
export function decodeImage(dataUrl){
 if(!decoded.has(dataUrl))decoded.set(dataUrl,(async()=>{const image=new Image();image.src=dataUrl;await image.decode();return image;})().catch(e=>{decoded.delete(dataUrl);throw new Error('그림 데이터를 읽을 수 없습니다. PNG/JPEG/WebP 원본을 확인하세요.');}));
 return decoded.get(dataUrl);
}
export async function loadAssets(project){
 const cache=new Map();
 for(const a of Object.values(project.assets)){const image=await decodeImage(a.dataUrl);if(image.naturalWidth!==a.width||image.naturalHeight!==a.height)throw new Error('그림 자료의 실제 치수와 저장된 치수가 다릅니다.');cache.set(a.id,image);}
 for(const doc of Object.values(project.paintings))for(const layer of doc.layers){const image=await decodeImage(layer.png);if(image.naturalWidth!==doc.width||image.naturalHeight!==doc.height)throw new Error('레이어 원본 치수가 올바르지 않습니다.');}
 return cache;
}
export async function importAsset(file){
 const mime=file.type||({'png':'image/png','jpg':'image/jpeg','jpeg':'image/jpeg','webp':'image/webp'}[file.name.split('.').pop().toLowerCase()]);
 if(!['image/png','image/jpeg','image/webp'].includes(mime))throw new Error('PNG, JPEG, WebP 그림을 선택하세요.');
 const dataUrl=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(new Error('그림 파일을 읽지 못했습니다.'));r.readAsDataURL(file);});
 const normalized='data:'+mime+';base64,'+dataUrl.split(',')[1];const img=await decodeImage(normalized);
 return {id:newId(),mime,dataUrl:normalized,width:img.naturalWidth,height:img.naturalHeight,paintingId:null};
}

/** Fork the editable original and composite; other cards keep their existing art. */
export function applyPaintingToCard(project,cardId,saved,png,size){
 const result=clone(project),card=result.cards.find(c=>c.id===cardId);if(!card)throw Error('그림을 적용할 카드가 없어요.');
 const painting=clone(saved),ids=new Map(painting.layers.map(l=>[l.id,newId()]));painting.id=newId();painting.activeLayerId=ids.get(painting.activeLayerId);for(const l of painting.layers)l.id=ids.get(l.id);
 const asset={id:newId(),mime:'image/png',width:size?.width??painting.width,height:size?.height??painting.height,dataUrl:png,paintingId:painting.id};
 result.paintings[painting.id]=painting;result.assets[asset.id]=asset;card.artAssetId=asset.id;
 if(!card.elements.some(e=>e.binding?.field==='art')){
  const s=result.settings;card.elements.push({id:newId(),type:'image',binding:{field:'art'},rect:{x:Math.min(4,s.cardWidthMm*.1),y:Math.min(15,s.cardHeightMm*.2),w:s.cardWidthMm*.85,h:s.cardHeightMm*.35},style:{fit:'contain',cropX:.5,cropY:.5}});card.template='custom';
 }
 return result;
}
