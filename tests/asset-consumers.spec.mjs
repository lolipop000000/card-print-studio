import {addVisualLayer} from './helpers/effects.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url);
let playwright;try{playwright=require('playwright');}catch{playwright=require('C:/Users/hyeon/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');}
const root=fileURLToPath(new URL('../',import.meta.url));
const code=build({absWorkingDir:root,stdin:{contents:"import {openVisualEffectsEditor} from './src/ui/visual-effects.js';import {openKeywordManager} from './src/ui/keywords.js';import {createProject} from './src/model/project.js';import {createStore} from './src/model/store.js';import {createVisualEffects,makeVisualEffectLayer} from './src/model/visual-effects.js';window.consumerTest={openVisualEffectsEditor,openKeywordManager,createProject,createStore,createVisualEffects,makeVisualEffectLayer};",resolveDir:root},bundle:true,write:false,format:'iife',target:'es2022',loader:{'.woff2':'base64'}});
async function start(){
 const browser=await playwright.chromium.launch({headless:true,executablePath:process.env.CARD_BROWSER_PATH||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
 try{
  const context=await browser.newContext({viewport:{width:1600,height:1000}}),page=await context.newPage(),errors=[];page.setDefaultTimeout(6000);page.on('pageerror',error=>errors.push(error.message));await context.route(/^https?:/,route=>route.abort());
  await page.setContent('<!doctype html><meta charset="utf-8"><style>'+await readFile(new URL('../src/styles.css',import.meta.url),'utf8')+'</style>');await page.addScriptTag({content:(await code).outputFiles[0].text});
  await page.evaluate(()=>{
   const api=window.consumerTest,p=api.createProject(),sprite=()=>({...api.createVisualEffects(),layers:[api.makeVisualEffectLayer('sprite',{params:{shape:'image'},emit:{face:'up'}})]});
   p.cards[0].template='custom';p.cards[0].autoSkillLayout=false;
   p.cards[0].elements=[
    {id:'effect-a',type:'effect',rect:{x:8,y:15,w:20,h:15},binding:null,style:{visualEffects:sprite()}},
    {id:'effect-b',type:'effect',rect:{x:28,y:35,w:20,h:15},binding:null,style:{visualEffects:sprite()}},
    {id:'text-a',type:'text',rect:{x:4,y:5,w:45,h:8},binding:null,content:'보관함',style:{fontPt:12}},
    {id:'image-a',type:'image',rect:{x:4,y:60,w:20,h:20},binding:null,assetId:null,style:{}}
   ];
   p.keywords=[{id:'keyword-a',name:'비',description:'',color:'#178fba',iconAssetId:null},{id:'keyword-b',name:'눈',description:'',color:'#8899aa',iconAssetId:null}];
   const saved=api.createVisualEffects('flame');saved.layers[0].emit.face='inside';p.visualEffectPresets=[{id:'saved-emission',name:'저장한 안쪽',recipe:saved}];
   window.consumerStore=api.createStore(p);window.consumerBefore=JSON.stringify(window.consumerStore.getProject());
   const canvas=document.createElement('canvas');canvas.width=5;canvas.height=3;canvas.getContext('2d').fillStyle='#ff000080';canvas.getContext('2d').fillRect(1,1,2,1);
   window.libraryAsset={id:'shared-library-image',mime:'image/png',dataUrl:canvas.toDataURL(),width:5,height:3,paintingId:'foreign-painting'};
   window.libraryMode='asset';window.libraryCalls=[];
   window.consumerCtx={store:window.consumerStore,assets:new Map(),state:{ignoreOutputWarnings:true},openAssetLibrary:options=>{
    window.libraryCalls.push(options);if(window.libraryMode==='defer')return new Promise(resolve=>window.resolveLibrary=resolve);return Promise.resolve(window.libraryMode==='cancel'?null:window.libraryAsset);
   }};
   window.openEffect=(id='effect-a')=>{window.closeEffect=api.openVisualEffectsEditor(window.consumerCtx,{cardId:window.consumerStore.getProject().cards[0].id,elementId:id});};
   window.openKeywords=()=>{window.closeKeywords=api.openKeywordManager(window.consumerCtx);};
  });return {browser,page,errors};
 }catch(error){await browser.close();throw error;}
}
async function effect(page,id='effect-a'){await page.evaluate(id=>window.openEffect(id),id);await page.locator('#effect-editor').waitFor();}
async function settled(page){await page.waitForFunction(()=>!document.getElementById('effect-apply')?.disabled);}

test('effect library cancellation keeps the draft and deck untouched',async()=>{
 const e=await start();try{const {page}=e;await page.evaluate(()=>window.libraryMode='cancel');await effect(page);await page.locator('#effect-sprite-library').click();await settled(page);
  assert.equal(await page.locator('#effect-param-assetId').inputValue(),'');assert.equal(await page.locator('#effect-undo').isDisabled(),true);assert.equal(await page.evaluate(()=>JSON.stringify(window.consumerStore.getProject())===window.consumerBefore),true);
  await page.locator('#effect-close').click();assert.deepEqual(e.errors,[]);
 }finally{await e.browser.close();}
});

test('library sprite selection stays staged, has local undo, and commits as one portable deck edit',async()=>{
 const e=await start();try{const {page}=e;await effect(page);await page.locator('#effect-sprite-library').click();await settled(page);const assetId=await page.locator('#effect-param-assetId').inputValue();assert.ok(assetId);assert.notEqual(assetId,'shared-library-image');
  assert.equal(await page.evaluate(()=>JSON.stringify(window.consumerStore.getProject())===window.consumerBefore),true);
  await page.locator('#effect-undo').click();assert.equal(await page.locator('#effect-param-assetId').inputValue(),'');await page.locator('#effect-redo').click();assert.equal(await page.locator('#effect-param-assetId').inputValue(),assetId);
  await page.locator('#effect-apply').click();
  const result=await page.evaluate(id=>{const p=window.consumerStore.getProject(),asset=p.assets[id];window.libraryAsset.dataUrl='removed from shared library';return {asset,attached:p.cards[0].elements[0].style.visualEffects.layers[0].params.assetId,assetCount:Object.keys(p.assets).length};},assetId);
  assert.equal(result.attached,assetId);assert.equal(result.assetCount,1);assert.equal(result.asset.paintingId,null);assert.match(result.asset.dataUrl,/^data:image\/png;base64,/);assert.deepEqual([result.asset.width,result.asset.height],[5,3]);
  await page.evaluate(()=>window.consumerStore.undo());assert.equal(await page.evaluate(()=>JSON.stringify(window.consumerStore.getProject())===window.consumerBefore),true);assert.deepEqual(e.errors,[]);
 }finally{await e.browser.close();}
});

test('a pending effect pick uses its captured draft and drops results after close or document replacement',async()=>{
 const e=await start();try{const {page}=e;await page.evaluate(()=>window.libraryMode='defer');await effect(page);await page.locator('#effect-sprite-library').click();assert.equal(await page.locator('#effect-apply').isDisabled(),true);
  await page.locator('#effect-target').selectOption('effect-b');await page.evaluate(()=>window.resolveLibrary(window.libraryAsset));await settled(page);assert.equal(await page.locator('#effect-param-assetId').inputValue(),'');
  await page.locator('#effect-target').selectOption('effect-a');assert.ok(await page.locator('#effect-param-assetId').inputValue());await page.evaluate(()=>window.closeEffect({force:true}));assert.equal(await page.evaluate(()=>JSON.stringify(window.consumerStore.getProject())===window.consumerBefore),true);
  await effect(page);await page.locator('#effect-sprite-library').click();await page.evaluate(()=>{window.consumerStore.load(window.consumerStore.getProject());window.resolveLibrary(window.libraryAsset);});await settled(page);assert.equal(await page.locator('#effect-param-assetId').inputValue(),'');assert.deepEqual(await page.evaluate(()=>Object.keys(window.consumerStore.getProject().assets)),[]);await page.evaluate(()=>window.closeEffect({force:true}));
  await effect(page);await page.locator('#effect-sprite-library').click();await page.evaluate(async()=>{await window.closeEffect({force:true});window.resolveLibrary(window.libraryAsset);});await page.waitForTimeout(100);assert.equal(await page.locator('#effect-editor').count(),0);assert.deepEqual(await page.evaluate(()=>Object.keys(window.consumerStore.getProject().assets)),[]);assert.deepEqual(e.errors,[]);
 }finally{await e.browser.close();}
});

test('a removed sprite layer cannot receive a delayed library image',async()=>{
 const e=await start();try{const {page}=e;await page.evaluate(()=>window.libraryMode='defer');await effect(page);await page.locator('#effect-sprite-library').click();await page.locator('#effect-layer-delete').click();await page.evaluate(()=>window.resolveLibrary(window.libraryAsset));await settled(page);
  assert.match(await page.locator('#effect-feedback').innerText(),/레이어|삭제/);await page.locator('#effect-apply').click();assert.deepEqual(await page.evaluate(()=>Object.keys(window.consumerStore.getProject().assets)),[]);assert.deepEqual(e.errors,[]);
 }finally{await e.browser.close();}
});

test('keyword library icons are detached portable copies with undo',async()=>{
 const e=await start();try{const {page}=e;await page.evaluate(()=>window.openKeywords());await page.locator('#keyword-icon-library').click();await page.locator('#keyword-icon-preview').waitFor();
  const result=await page.evaluate(()=>{const p=window.consumerStore.getProject(),id=p.keywords[0].iconAssetId,asset=p.assets[id];window.libraryAsset.dataUrl='deleted';return {id,asset};});
  assert.notEqual(result.id,'shared-library-image');assert.equal(result.asset.paintingId,null);assert.match(result.asset.dataUrl,/^data:image\/png;base64,/);await page.evaluate(()=>window.consumerStore.undo());assert.equal(await page.evaluate(()=>JSON.stringify(window.consumerStore.getProject())===window.consumerBefore),true);assert.deepEqual(e.errors,[]);
 }finally{await e.browser.close();}
});

test('keyword picks retain their original keyword and ignore deleted targets, replaced decks, or a closed manager',async()=>{
 const e=await start();try{const {page}=e;await page.evaluate(()=>{window.libraryMode='defer';window.openKeywords();});await page.locator('#keyword-icon-library').click();await page.getByRole('button',{name:'눈 키워드 선택',exact:true}).click();await page.evaluate(()=>window.resolveLibrary(window.libraryAsset));
  await page.waitForFunction(()=>!!window.consumerStore.getProject().keywords[0].iconAssetId);assert.equal(await page.evaluate(()=>window.consumerStore.getProject().keywords[1].iconAssetId),null);
  await page.evaluate(()=>{window.consumerStore.undo();window.closeKeywords();window.openKeywords();});await page.locator('#keyword-icon-library').click();await page.evaluate(()=>{window.consumerStore.edit('remove',p=>p.keywords=p.keywords.filter(k=>k.id!=='keyword-a'));window.resolveLibrary(window.libraryAsset);});await page.waitForTimeout(100);assert.deepEqual(await page.evaluate(()=>Object.keys(window.consumerStore.getProject().assets)),[]);
  await page.evaluate(()=>{window.closeKeywords();window.openKeywords();});await page.locator('#keyword-icon-library').click();await page.evaluate(()=>{window.consumerStore.load(window.consumerStore.getProject());window.resolveLibrary(window.libraryAsset);});await page.waitForTimeout(100);assert.deepEqual(await page.evaluate(()=>Object.keys(window.consumerStore.getProject().assets)),[]);
  await page.locator('#keyword-icon-library').click();await page.evaluate(()=>{window.closeKeywords();window.resolveLibrary(window.libraryAsset);});await page.waitForTimeout(100);assert.equal(await page.locator('#keyword-editor').count(),0);assert.deepEqual(await page.evaluate(()=>Object.keys(window.consumerStore.getProject().assets)),[]);assert.deepEqual(e.errors,[]);
 }finally{await e.browser.close();}
});

test('new standalone effects use the full region while saved faces and attached text defaults retain their meaning',async()=>{
 const e=await start();try{const {page}=e;await effect(page);assert.equal(await page.locator('#effect-face').inputValue(),'up');
  await page.locator('#effect-layer-reset').click();assert.equal(await page.locator('#effect-face').inputValue(),'area');assert.equal(await page.locator('label[for="effect-face"]>span').innerText(),'발생 위치');assert.equal(await page.locator('#effect-face option[value="area"]').innerText(),'영역 전체');
  await page.locator('#effect-start-preset').selectOption('flame');assert.equal(await page.locator('#effect-face').inputValue(),'area');
  await page.locator('[data-effect-preset="saved-emission"]').click();assert.equal(await page.locator('#effect-face').inputValue(),'inside');
  await page.locator('[data-builtin-effect="flame"]').click();assert.equal(await page.locator('#effect-face').inputValue(),'area');
  await page.locator('#effect-combine-preset').selectOption('smoke');await page.locator('#effect-merge-preset').click();await page.locator('#effect-layer-list [data-kind="smoke"] .effect-layer-select').click();assert.equal(await page.locator('#effect-face').inputValue(),'area');
  await page.locator('#effect-start-preset').selectOption('empty');await addVisualLayer(page,'sprite');assert.equal(await page.locator('#effect-face').inputValue(),'area');
  await page.locator('#effect-target').selectOption('text-a');await page.locator('#effect-start-preset').selectOption('flame');assert.equal(await page.locator('#effect-face').inputValue(),'up');assert.equal(await page.locator('label[for="effect-face"]>span').innerText(),'모양에서 피어나는 면');assert.equal(await page.locator('#effect-face option[value="area"]').innerText(),'직접 정한 영역');
  await page.locator('#effect-target').selectOption('image-a');await page.locator('#effect-start-preset').selectOption('flame');assert.equal(await page.locator('#effect-face').inputValue(),'up');await page.evaluate(()=>window.closeEffect({force:true}));assert.deepEqual(e.errors,[]);
 }finally{await e.browser.close();}
});

test('selected playback starts on and its view-only toggle never changes the deck or effect history',async()=>{
 const e=await start();try{const {page}=e;await effect(page);assert.equal(await page.locator('#effect-selected-playback').isChecked(),true);
  await page.locator('#effect-selected-playback').uncheck();assert.equal(await page.locator('#effect-undo').isDisabled(),true);assert.equal(await page.locator('#effect-editor').getAttribute('data-effect-dirty'),'false');
  await page.locator('#effect-play').click();await page.waitForFunction(()=>Number(document.getElementById('effect-time').value)>1.3);await page.locator('#effect-selected-playback').check();assert.equal(await page.locator('#effect-play').getAttribute('aria-pressed'),'true');
  await page.locator('#effect-target').selectOption('effect-b');assert.equal(await page.locator('#effect-selected-playback').isChecked(),true);assert.equal(await page.locator('#effect-undo').isDisabled(),true);assert.equal(await page.locator('#effect-editor').getAttribute('data-effect-dirty'),'false');
  await page.locator('#effect-close').click();assert.equal(await page.locator('#effect-editor').count(),0);assert.equal(await page.locator('.confirm-dialog').count(),0);assert.equal(await page.evaluate(()=>JSON.stringify(window.consumerStore.getProject())===window.consumerBefore),true);assert.deepEqual(e.errors,[]);
 }finally{await e.browser.close();}
});
