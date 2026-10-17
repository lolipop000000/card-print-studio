import test from 'node:test';
import assert from 'node:assert/strict';
import {createProject} from '../src/model/project.js';
import {createStore} from '../src/model/store.js';
let placeImageAsset;try{({placeImageAsset}=await import('../src/model/asset-placement.js'));}catch(e){if(e.code!=='ERR_MODULE_NOT_FOUND')throw e;}
const image={id:'shared-image',mime:'image/png',dataUrl:'data:image/png;base64,copy',width:100,height:80,paintingId:'source-painting'};
test('reusable assets apply as detached card art and survive library mutation and undo',()=>{
 const p=createProject(),store=createStore(p),id=p.cards[0].id;let elementId;
 store.edit('공용 그림',draft=>{elementId=placeImageAsset(draft,image,{cardId:id,mode:'art'});});
 const card=store.getProject().cards[0],copy=store.getProject().assets[card.artAssetId];
 assert.notEqual(copy.id,image.id);assert.equal(copy.paintingId,null);assert.equal(card.elements.find(e=>e.id===elementId).binding.field,'art');
 assert.equal(image.paintingId,'source-painting');store.undo();assert.equal(store.getProject().cards[0].artAssetId,null);store.redo();assert.equal(store.getProject().assets[copy.id].dataUrl,image.dataUrl);
});
test('free image and bound/unbound replacements use the captured target only',()=>{
 const p=createProject(),card=p.cards[0],id=placeImageAsset(p,image,{cardId:card.id,mode:'element'}),element=card.elements.find(e=>e.id===id);
 assert.equal(element.binding,null);assert.ok(element.rect.x+element.rect.w<=p.settings.cardWidthMm);assert.ok(element.rect.y+element.rect.h<=p.settings.cardHeightMm);
 const old=element.assetId;placeImageAsset(p,image,{cardId:card.id,elementId:id,mode:'replace'});assert.notEqual(element.assetId,old);assert.equal(card.artAssetId,null);
 placeImageAsset(p,image,{back:true,mode:'element'});assert.equal(p.back.elements.length,1);
 const before=JSON.stringify(p);assert.throws(()=>placeImageAsset(p,image,{cardId:'gone',mode:'art'}),/카드/);assert.equal(JSON.stringify(p),before);
 assert.throws(()=>placeImageAsset(p,image,{cardId:card.id,elementId:'gone',mode:'replace'}),/그림 요소/);assert.equal(JSON.stringify(p),before);
});
