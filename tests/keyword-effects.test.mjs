import test from 'node:test';
import assert from 'node:assert/strict';
import {createProject,serializeProject,parseProject,validateProject} from '../src/model/project.js';
import {createStore} from '../src/model/store.js';
import * as keywords from '../src/model/keywords.js';
import {createVisualEffects,makeVisualEffectLayer,writeTargetEffects,readTargetEffects,writeTargetTextColor} from '../src/model/visual-effects.js';
import {mergeTextSpans} from '../src/model/text-ranges.js';
import {exportCardFile,importCardFile,parseCardFile} from '../src/model/card-file.js';
import {snapshotAsset,applySharedAsset} from '../src/cloud/shared-assets.js';
import {skillNameSpans} from '../src/model/skill-name-styles.js';
import {effectPlaybackTime} from '../src/model/effect-playback.js';

const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO5EE2cAAAAASUVORK5CYII=';
function fixture(){
 const p=createProject(),keyword={id:'fire-word',name:'불꽃',description:'뜨거운 힘',color:'#ef6b24',iconAssetId:null};p.keywords=[keyword];
 p.cards[0].name='불꽃의 기사';p.cards[0].nameKeywords=[{keywordId:keyword.id,display:'inline'}];
 return {p,keyword,target:{cardId:p.cards[0].id,keywordId:keyword.id}};
}
function spriteRecipe(p){
 p.assets.spark={id:'spark',mime:'image/png',dataUrl:png,width:1,height:1,paintingId:null};
 const recipe=createVisualEffects();recipe.layers.push(makeVisualEffectLayer('sprite',{id:'word-sparks',params:{shape:'image',assetId:'spark'}}));return recipe;
}

test('keyword effect target survives undo and JSON without changing the card frame',()=>{
 const {p,target}=fixture(),store=createStore(p),recipe=createVisualEffects('neonText');
 store.edit('키워드 전용 이펙트',draft=>{writeTargetEffects(draft,target,recipe);writeTargetTextColor(draft,target,'#f48120');});
 assert.deepEqual(store.getProject().keywords[0].visualEffects,recipe);
 assert.equal(store.getProject().keywords[0].color,'#f48120');assert.equal(store.getProject().cards[0].visualEffects,undefined);
 const restored=parseProject(serializeProject(store.getProject()));assert.deepEqual(readTargetEffects(restored,target),recipe);
 store.undo();assert.equal(store.getProject().keywords[0].visualEffects,undefined);store.redo();assert.deepEqual(store.getProject().keywords[0].visualEffects,recipe);
});

test('invalid keyword recipes and missing particle pictures are rejected before saving',()=>{
 const {p,keyword}=fixture();keyword.visualEffects=createVisualEffects('neonText');keyword.visualEffects.layers[0].opacity=2;
 assert.ok(validateProject(p).some(problem=>problem.message.includes('키워드')));
 keyword.visualEffects=spriteRecipe(p);delete p.assets.spark;
 assert.ok(validateProject(p).some(problem=>problem.message.includes('키워드')&&problem.message.includes('그림')));
});

test('keyword spans match whole literal names and explicit character effects keep priority',()=>{
 const {keyword}=fixture();keyword.visualEffects=createVisualEffects('neonText');
 const long={...keyword,id:'long-word',name:'큰 불꽃',visualEffects:createVisualEffects('goldTitle')};
 assert.equal(typeof keywords.keywordTextSpans,'function','dedicated keyword styling must resolve literal occurrences');
 const text='큰 불꽃 / 불꽃🙂 불꽃',spans=keywords.keywordTextSpans(text,[keyword,long]);
 assert.deepEqual(spans.map(s=>[s.start,s.end,s.keywordId]),[[0,4,'long-word'],[7,9,'fire-word'],[12,14,'fire-word']]);
 assert.equal(spans[1].style.visualEffects,keyword.visualEffects);
 const own=createVisualEffects('goldTitle'),merged=mergeTextSpans(text,spans,[{id:'single-letter',start:8,end:9,style:{color:'#2355cc',visualEffects:own}}]);
 assert.equal(merged.find(s=>s.start===8).style.visualEffects,own);assert.equal(merged.find(s=>s.start===7).style.visualEffects,keyword.visualEffects);
});

test('literal keyword matching preserves its original color even when its effect is cleared',()=>{
 const {keyword}=fixture(),long={...keyword,id:'long',name:'큰 불꽃'};
 assert.equal(typeof keywords.keywordsInText,'function');
 assert.deepEqual(keywords.keywordsInText('큰 불꽃 / 불꽃 불꽃',[keyword,long]).map(k=>k.id),['long','fire-word']);
 const {p}=fixture();delete p.cards[0].nameKeywords;
 assert.equal(parseCardFile(exportCardFile(p,p.cards[0].id)).keywords[0]?.id,'fire-word');
 for(const visualEffects of [undefined,createVisualEffects()]){
  keyword.visualEffects=visualEffects;
  const span=keywords.keywordTextSpans('불꽃',[keyword])[0];
  assert.equal(span?.style.color,keyword.color,'Clearing a recipe must preserve the keyword color inside explicit skill references');
 }
});

test('portable card carries keyword particle images and gives imported effects fresh identities',()=>{
 const {p,keyword}=fixture();keyword.visualEffects=spriteRecipe(p);
 const file=exportCardFile(p,p.cards[0].id),portable=parseCardFile(file);assert.equal(portable.assets.spark.dataUrl,png);
 const destination=createProject();importCardFile(destination,file);const copied=destination.keywords[0],layer=copied.visualEffects.layers[0];
 assert.notEqual(copied.id,keyword.id);assert.notEqual(layer.id,'word-sparks');assert.notEqual(layer.params.assetId,'spark');
 assert.equal(destination.assets[layer.params.assetId].dataUrl,png);assert.deepEqual(validateProject(destination),[]);
});

test('a literally typed keyword keeps its recipe and particle images in a standalone card',()=>{
 const {p,keyword}=fixture();delete p.cards[0].nameKeywords;keyword.visualEffects=spriteRecipe(p);
 const card=parseCardFile(exportCardFile(p,p.cards[0].id));
 assert.equal(card.keywords[0]?.id,keyword.id);assert.equal(card.assets.spark?.dataUrl,png);
});

test('card import never merges same-name keywords that have different effects',()=>{
 const {p,keyword}=fixture();keyword.visualEffects=createVisualEffects('neonText');const file=exportCardFile(p,p.cards[0].id),destination=createProject();
 destination.keywords=[{...keyword,visualEffects:createVisualEffects('goldTitle')}];const before=structuredClone(destination);
 assert.throws(()=>importCardFile(destination,file),/이펙트/);assert.deepEqual(destination,before);
});

test('cleared keyword recipes and keywords that never had effects can share a portable card',()=>{
 const {p,keyword}=fixture();keyword.visualEffects=createVisualEffects();
 const destination=createProject();destination.keywords=[{...keyword}];delete destination.keywords[0].visualEffects;
 assert.doesNotThrow(()=>importCardFile(destination,exportCardFile(p,p.cards[0].id)));
 assert.equal(destination.keywords.length,1);assert.deepEqual(validateProject(destination),[]);
});

test('a color-only or cleared keyword keeps the inherited skill recipe playback identity',()=>{
 const {p,keyword}=fixture(),card=p.cards[0],recipe=createVisualEffects();recipe.layers=[makeVisualEffectLayer('heatHaze')];
 card.passives=[{id:'hot',name:keyword.name,effect:'',dice:null,nameStyle:{fontPt:24,visualEffects:recipe}}];
 for(const visualEffects of [undefined,createVisualEffects()]){
  keyword.visualEffects=visualEffects;
  const span=keywords.keywordTextSpans(keyword.name,[keyword],skillNameSpans(card,keyword.name))[0];
  assert.equal(span.style.visualEffects,recipe);assert.equal(span.style.color,keyword.color);assert.equal(span.skillId,'hot');assert.equal(span.keywordId,undefined);
  assert.equal(effectPlaybackTime({timeSec:4,frozenTimeSec:1.2,playbackTarget:{skillId:'hot'}},span),4);
 }
 keyword.visualEffects=createVisualEffects('neonText');
 const span=keywords.keywordTextSpans(keyword.name,[keyword],skillNameSpans(card,keyword.name))[0];
 assert.equal(span.style.visualEffects,keyword.visualEffects);assert.equal(span.keywordId,keyword.id);assert.equal(span.skillId,undefined);
});

test('cloud keyword snapshot carries effect images and copies their layer and asset identities',async()=>{
 const {p,keyword}=fixture();keyword.visualEffects=spriteRecipe(p);const snapshot=await snapshotAsset(p,'keyword',keyword.id);
 assert.equal(snapshot.blobBytes.size,1);assert.ok(snapshot.data.assets.spark.dataUrl.startsWith('blob:sha256:'));
 const destination=createProject(),{newId}=await applySharedAsset(destination,snapshot.data,async hash=>snapshot.blobBytes.get(hash).bytes);
 const copied=destination.keywords.find(k=>k.id===newId),layer=copied.visualEffects.layers[0];
 assert.notEqual(layer.id,'word-sparks');assert.notEqual(layer.params.assetId,'spark');assert.equal(destination.assets[layer.params.assetId].dataUrl,png);
 assert.equal(keyword.visualEffects.layers[0].params.assetId,'spark');assert.deepEqual(validateProject(destination),[]);
});
