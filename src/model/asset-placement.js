import {clone,newId} from './types.js';

/** Copy a reusable raster into a captured destination, leaving its source independent. */
export function placeImageAsset(project,asset,{cardId,back=false,elementId=null,mode='art'}={}){
 const target=back?project.back:project.cards.find(c=>c.id===cardId);
 if(!target)throw Error('그림을 넣을 카드가 없어졌어요. 카드를 다시 선택하세요.');
 let element=elementId?target.elements.find(e=>e.id===elementId):null;
 if(mode==='replace'&&element?.type!=='image')throw Error('교체할 그림 요소가 없어졌어요. 그림을 다시 선택하세요.');
 if(!['art','replace','element'].includes(mode))throw Error('그림을 적용할 방식을 다시 선택하세요.');
 const copy={...clone(asset),id:newId(),paintingId:null},s=project.settings;
 const art=mode==='art'||mode==='replace'&&element.binding?.field==='art';
 if(art){target.artAssetId=copy.id;element=target.elements.find(e=>e.type==='image'&&e.binding?.field==='art');}
 if(!element||mode==='element'){
  const rect=art?{x:s.cardWidthMm*.06,y:s.cardHeightMm*.17,w:s.cardWidthMm*.88,h:s.cardHeightMm*.35}:{x:s.cardWidthMm*.1,y:s.cardHeightMm*.25,w:s.cardWidthMm*.8,h:s.cardHeightMm*.4};
  element={id:newId(),type:'image',rect,binding:art?{field:'art'}:null,style:{fit:'contain',cropX:.5,cropY:.5}};
  target.elements.push(element);if(target.kind)target.template='custom';
 }
 if(!art)element.assetId=copy.id;
 project.assets[copy.id]=copy;return element.id;
}
