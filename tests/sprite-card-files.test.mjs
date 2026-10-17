import test from 'node:test';
import assert from 'node:assert/strict';
import {createProject,createCard,serializeProject,validateProject} from '../src/model/project.js';
import {createVariant} from '../src/model/variants.js';
import {createVisualEffects,makeVisualEffectLayer} from '../src/model/visual-effects.js';
import {exportCardFile,parseCardFile,importCardFile} from '../src/model/card-file.js';

const pixel='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j7xkAAAAASUVORK5CYII=';
const spriteAssetIds=['fx-frame','fx-stored','fx-text','fx-image','fx-effect','fx-passive','fx-active'];
const asset=(id,paintingId=null)=>({id,mime:'image/png',dataUrl:pixel,width:1,height:1,paintingId});
function painting(id){
 return {id,width:64,height:64,activeLayerId:'upper',layers:[
  {id:'lower',name:id+' 바탕',visible:true,locked:true,opacity:.75,png:pixel},
  {id:'upper',name:id+' 원본',visible:false,locked:false,opacity:.4,png:pixel}
 ]};
}
function recipe(assetId,id='sprite-layer',shape='image'){
 const value=createVisualEffects();value.layers.push(makeVisualEffectLayer('sprite',{id,params:{assetId,shape,count:7,spin:.25}}));return value;
}
function fixture(){
 const p=createProject(),card=p.cards[0];card.id='source-card';card.name='이미지 입자 카드';card.template='custom';card.autoSkillLayout=false;card.artAssetId='art';
 card.visualEffects=recipe('fx-frame');
 card.visualEffects.layers.push(makeVisualEffectLayer('sprite',{id:'stored-shape',enabled:false,params:{assetId:'fx-stored',shape:'star'}}));
 card.elements=[
  {id:'text',type:'text',content:'제목',rect:{x:2,y:3,w:30,h:8},binding:null,style:{fontPt:10,visualEffects:recipe('fx-text')}},
  {id:'image',type:'image',assetId:'art',rect:{x:2,y:12,w:30,h:25},binding:null,style:{fit:'contain',visualEffects:recipe('fx-image')}},
  {id:'effect',type:'effect',rect:{x:2,y:40,w:30,h:15},binding:null,style:{visualEffects:recipe('fx-effect')}}
 ];
 card.passives=[{id:'passive',name:'지속 기술',effect:'효과',dice:null,keywords:[],nameStyle:{visualEffects:recipe('fx-passive')}}];
 card.actives=[{id:'active',name:'사용 기술',effect:'효과',dice:null,keywords:[],nameStyle:{visualEffects:recipe('fx-active')}}];
 for(const id of [...spriteAssetIds,'art','other-card','back-only','preset-only','unrelated']){
  const paintingId='painting-'+id;p.assets[id]=asset(id,paintingId);p.paintings[paintingId]=painting(paintingId);
 }
 const other=createCard('item',p);other.visualEffects=recipe('other-card');p.cards.push(other);
 p.back.elements=[{id:'back-effect',type:'effect',rect:{x:0,y:0,w:20,h:20},binding:null,style:{visualEffects:recipe('back-only')}}];
 p.visualEffectPresets=[{id:'preset',name:'보관한 이미지 입자',recipe:recipe('preset-only')}];
 return p;
}
function references(card){
 return [card.visualEffects.layers[0],card.visualEffects.layers[1],card.elements[0].style.visualEffects.layers[0],card.elements[1].style.visualEffects.layers[0],card.elements[2].style.visualEffects.layers[0],card.passives[0].nameStyle.visualEffects.layers[0],card.actives[0].nameStyle.visualEffects.layers[0]];
}
function paintingContent(value){
 return {width:value.width,height:value.height,active:value.layers.findIndex(layer=>layer.id===value.activeLayerId),layers:value.layers.map(({id,...layer})=>layer)};
}

test('card-only export retains every sprite image and original while omitting unrelated deck resources',()=>{
 const source=fixture(),before=serializeProject(source),one=parseCardFile(exportCardFile(source,'source-card'));
 assert.deepEqual(Object.keys(one.assets).sort(),['art',...spriteAssetIds].sort());
 assert.deepEqual(Object.keys(one.paintings).sort(),['painting-art',...spriteAssetIds.map(id=>'painting-'+id)].sort());
 assert.deepEqual(references(one.cards[0]).map(layer=>layer.params.assetId),spriteAssetIds);
 assert.equal(one.cards[0].visualEffects.layers[1].params.shape,'star');
 assert.equal(one.cards[0].visualEffects.layers[1].enabled,false);
 assert.deepEqual(one.paintings['painting-fx-frame'],source.paintings['painting-fx-frame']);
 assert.deepEqual(one.back,{elements:[]});assert.deepEqual(one.visualEffectPresets,[]);
 assert.deepEqual(validateProject(one),[]);assert.equal(serializeProject(source),before);
});

test('card import remaps sprite image and painting identities on frame elements and skill names',()=>{
 const source=fixture(),before=serializeProject(source),target=createProject();
 target.assets['fx-frame']=asset('fx-frame','painting-fx-frame');target.paintings['painting-fx-frame']=painting('painting-fx-frame');
 const existing=structuredClone(target),added=importCardFile(target,exportCardFile(source,'source-card'));
 const incoming=references(added);assert.equal(new Set(incoming.map(layer=>layer.id)).size,7);
 for(const [index,layer] of incoming.entries()){
  const oldId=spriteAssetIds[index],newId=layer.params.assetId;assert.notEqual(newId,oldId);assert.ok(target.assets[newId]);
  const saved=target.paintings[target.assets[newId].paintingId],original=source.paintings['painting-'+oldId];
  assert.notEqual(saved.id,original.id);assert.ok(saved.layers.every(value=>!['lower','upper'].includes(value.id)));
  assert.equal(saved.activeLayerId,saved.layers[1].id);assert.deepEqual(paintingContent(saved),paintingContent(original));
  assert.notEqual(layer.id,references(source.cards[0])[index].id);
 }
 assert.equal(incoming[0].params.count,7);assert.equal(incoming[0].params.spin,.25);
 assert.equal(incoming[1].params.shape,'star');assert.equal(incoming[1].enabled,false);
 assert.deepEqual(target.cards[0],existing.cards[0]);assert.deepEqual(target.assets['fx-frame'],existing.assets['fx-frame']);
 assert.deepEqual(target.paintings['painting-fx-frame'],existing.paintings['painting-fx-frame']);
 assert.deepEqual(validateProject(target),[]);assert.equal(serializeProject(source),before);
});

test('one shared sprite resource is exported once and imported once across all card references',()=>{
 const source=createProject(),card=source.cards[0];card.id='source-card';card.artAssetId='shared';card.visualEffects=recipe('shared');
 card.elements=[{id:'image',type:'image',assetId:'shared',rect:{x:2,y:2,w:20,h:20},binding:null,style:{visualEffects:recipe('shared')}}];
 card.passives=[{id:'passive',name:'기술',effect:'효과',dice:null,keywords:[{keywordId:'keyword',display:'both'}],nameStyle:{visualEffects:recipe('shared')}}];
 source.keywords=[{id:'keyword',name:'상태',description:'설명',color:'#286fa8',iconAssetId:'shared'}];
 source.assets.shared=asset('shared','original');source.paintings.original=painting('original');
 const text=exportCardFile(source,card.id),one=parseCardFile(text);assert.deepEqual(Object.keys(one.assets),['shared']);assert.deepEqual(Object.keys(one.paintings),['original']);
 const target=createProject(),added=importCardFile(target,text),mapped=added.visualEffects.layers[0].params.assetId;
 assert.notEqual(mapped,'shared');assert.deepEqual(Object.keys(target.assets),[mapped]);assert.equal(Object.keys(target.paintings).length,1);
 assert.equal(added.artAssetId,mapped);assert.equal(added.elements[0].assetId,mapped);assert.equal(added.elements[0].style.visualEffects.layers[0].params.assetId,mapped);
 assert.equal(added.passives[0].nameStyle.visualEffects.layers[0].params.assetId,mapped);assert.equal(target.keywords[0].iconAssetId,mapped);
 assert.deepEqual(validateProject(target),[]);
});

test('separate imports of the same sprite card keep their resources and painting edits independent',()=>{
 const source=fixture(),before=serializeProject(source),text=exportCardFile(source,'source-card'),target=createProject();
 const first=importCardFile(target,text),second=importCardFile(target,text),firstLayers=references(first),secondLayers=references(second);
 assert.equal(Object.keys(target.assets).length,16);assert.equal(Object.keys(target.paintings).length,16);
 for(const [index,layer] of firstLayers.entries()){
  assert.notEqual(layer.id,secondLayers[index].id);assert.notEqual(layer.params.assetId,secondLayers[index].params.assetId);
  assert.notEqual(target.assets[layer.params.assetId].paintingId,target.assets[secondLayers[index].params.assetId].paintingId);
 }
 const firstOriginal=target.paintings[target.assets[firstLayers[0].params.assetId].paintingId],secondOriginal=target.paintings[target.assets[secondLayers[0].params.assetId].paintingId];
 firstOriginal.layers[0].name='첫 카드에서 수정';firstLayers[0].params.count=11;
 assert.equal(secondOriginal.layers[0].name,'painting-fx-frame 바탕');assert.equal(secondLayers[0].params.count,7);
 assert.equal(serializeProject(source),before);assert.deepEqual(validateProject(target),[]);
});

test('a Variant card file snapshots its current inherited sprite assets as independent content',()=>{
 const source=fixture(),child=createVariant(source,'source-card');source.cards.push(child);
 source.assets.replacement=asset('replacement','replacement-original');source.paintings['replacement-original']=painting('replacement-original');
 source.cards[0].visualEffects.layers[0].params.assetId='replacement';
 const before=serializeProject(source),text=exportCardFile(source,child.id),one=parseCardFile(text),card=one.cards[0];
 assert.equal(card.variant,undefined);assert.equal(card.visualEffects.layers[0].params.assetId,'replacement');
 assert.ok(one.assets.replacement);assert.equal(one.assets['fx-frame'],undefined);
 assert.deepEqual(Object.keys(one.assets).sort(),['art','replacement','fx-stored','fx-text','fx-image','fx-effect','fx-passive','fx-active'].sort());
 assert.equal(one.paintings['replacement-original'].layers[0].name,'replacement-original 바탕');assert.equal(serializeProject(source),before);
 const target=createProject(),added=importCardFile(target,text);assert.equal(added.variant,undefined);
 assert.notEqual(added.visualEffects.layers[0].params.assetId,'replacement');assert.deepEqual(validateProject(target),[]);
});

test('unselected sprite images survive a card file round trip without adding resources',()=>{
 const source=createProject(),card=source.cards[0];card.visualEffects=recipe(null);
 const text=exportCardFile(source,card.id),one=parseCardFile(text);assert.deepEqual(one.assets,{});assert.deepEqual(one.paintings,{});
 const target=createProject(),added=importCardFile(target,text);assert.equal(added.visualEffects.layers[0].params.assetId,null);
 assert.equal(added.visualEffects.layers[0].params.shape,'image');assert.deepEqual(target.assets,{});assert.deepEqual(target.paintings,{});assert.deepEqual(validateProject(target),[]);
});

test('a card file with a missing selected sprite image rejects import atomically',()=>{
 const source=fixture(),file=JSON.parse(exportCardFile(source,'source-card')),target=createProject(),before=serializeProject(target);
 delete file.project.assets['fx-frame'];assert.throws(()=>importCardFile(target,JSON.stringify(file)));assert.equal(serializeProject(target),before);
});

test('reusing a compatible keyword keeps its icon while the sprite image receives independent resources',()=>{
 const source=createProject(),card=source.cards[0];card.id='source-card';card.visualEffects=recipe('shared');
 card.passives=[{id:'passive',name:'기술',effect:'효과',dice:null,keywords:[{keywordId:'keyword',display:'both'}]}];
 source.keywords=[{id:'keyword',name:'상태',description:'설명',color:'#286fa8',iconAssetId:'shared'}];
 source.assets.shared=asset('shared','original');source.paintings.original=painting('original');
 const target=createProject();target.keywords=[{...source.keywords[0],id:'existing-keyword',iconAssetId:'existing-icon'}];
 target.assets['existing-icon']=asset('existing-icon','existing-original');target.paintings['existing-original']=painting('existing-original');
 target.paintings['existing-original'].layers[0].name='original 바탕';target.paintings['existing-original'].layers[1].name='original 원본';
 const before=structuredClone(target),added=importCardFile(target,exportCardFile(source,card.id)),mapped=added.visualEffects.layers[0].params.assetId;
 assert.equal(target.keywords.length,1);assert.equal(added.passives[0].keywords[0].keywordId,'existing-keyword');
 assert.notEqual(mapped,'existing-icon');assert.notEqual(mapped,'shared');assert.equal(Object.keys(target.assets).length,2);
 assert.notEqual(target.assets[mapped].paintingId,'existing-original');assert.equal(Object.keys(target.paintings).length,2);
 assert.deepEqual(target.keywords[0],before.keywords[0]);assert.deepEqual(target.assets['existing-icon'],before.assets['existing-icon']);
 assert.deepEqual(target.paintings['existing-original'],before.paintings['existing-original']);assert.deepEqual(validateProject(target),[]);
});
