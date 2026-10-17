import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';

const require=createRequire(import.meta.url);
let playwright;try{playwright=require('playwright');}catch{playwright=require('C:/Users/hyeon/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');}
const root=fileURLToPath(new URL('../',import.meta.url));
const bundle=()=>build({absWorkingDir:root,stdin:{contents:"import {openImageCropper} from './src/ui/image-crop.js';import {cropAssetRegions} from './src/model/image-crop.js';window.cropTest={openImageCropper,cropAssetRegions};",resolveDir:root},bundle:true,write:false,format:'iife',target:'es2022'});
async function start(){
 const code=(await bundle()).outputFiles[0].text;
 const browser=await playwright.chromium.launch({headless:true,executablePath:process.env.CARD_BROWSER_PATH||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
 try{
  const context=await browser.newContext({viewport:{width:1440,height:960}}),page=await context.newPage(),errors=[];
  page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));await context.route(/^https?:/,r=>r.abort());
  await page.setContent('<!doctype html><meta charset="utf-8"><title>Crop test</title><style>'+await readFile(new URL('../src/styles.css',import.meta.url),'utf8')+'</style>');await page.addScriptTag({content:code});
  return {browser,page,errors};
 }catch(error){await browser.close();throw error;}
}
async function open(page,width=1200,height=900){
 await page.evaluate(({width,height})=>{
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const ctx=canvas.getContext('2d');
  ctx.fillStyle='#ffffff';ctx.fillRect(0,0,1,1);ctx.fillStyle='#ff000080';ctx.fillRect(10,20,1,1);
  window.cropSource={id:'source',mime:'image/png',dataUrl:canvas.toDataURL(),width,height,paintingId:null};window.cropBefore=JSON.stringify(window.cropSource);window.cropResult='pending';
  window.cropTest.openImageCropper({asset:window.cropSource,name:'아이콘.png'}).then(result=>{window.cropResult=result;});
 },{width,height});await page.locator('#image-cropper').waitFor();
}
async function number(page,id,value){await page.locator('#'+id).fill(String(value));await page.locator('#'+id).press('Tab');}

test('extracted PNGs retain original dimensions, transparent and faint pixels without changing the source',async()=>{
 const e=await start();try{
  const output=await e.page.evaluate(async()=>{
   const canvas=document.createElement('canvas');canvas.width=6;canvas.height=4;const ctx=canvas.getContext('2d'),pixels=ctx.createImageData(3,2);
   pixels.data.set([255,0,0,128,0,255,0,1,255,255,255,255,0,0,0,0,0,0,255,255,0,0,0,0]);ctx.putImageData(pixels,1,1);
   const asset={id:'original',mime:'image/png',dataUrl:canvas.toDataURL(),width:6,height:4,paintingId:'kept'},before=JSON.stringify(asset);
   const results=await window.cropTest.cropAssetRegions(asset,[{rect:{x:1,y:1,width:3,height:2},name:'조각'}]);
   const result=results[0],image=new Image();image.src=result.asset.dataUrl;await image.decode();const target=document.createElement('canvas');target.width=image.width;target.height=image.height;target.getContext('2d').drawImage(image,0,0);
   return {unchanged:JSON.stringify(asset)===before,mime:result.asset.mime,paintingId:result.asset.paintingId,differentId:result.asset.id!==asset.id,size:[image.width,image.height],pixels:[...target.getContext('2d').getImageData(0,0,3,2).data],sourceRect:result.sourceRect};
  });
  assert.deepEqual(output,{unchanged:true,mime:'image/png',paintingId:null,differentId:true,size:[3,2],pixels:[255,0,0,128,0,255,0,1,255,255,255,255,0,0,0,0,0,0,255,255,0,0,0,0],sourceRect:{x:1,y:1,width:3,height:2}});assert.deepEqual(e.errors,[]);
 }finally{await e.browser.close();}
});

test('reversed dragging after zoom and scrolling uses source pixels and captures several named regions',async()=>{
 const e=await start();try{const {page}=e;await open(page);await page.locator('#crop-zoom').selectOption('2');
  await page.locator('#crop-viewport').evaluate(v=>{v.scrollLeft=340;v.scrollTop=250;});
  const box=await page.locator('#crop-stage').boundingBox();await page.mouse.move(box.x+320*2,box.y+250*2);await page.mouse.down();await page.mouse.move(box.x+230*2,box.y+190*2,{steps:5});await page.mouse.up();
  assert.deepEqual(await page.locator('#crop-rect-fields input').evaluateAll(inputs=>inputs.map(i=>Number(i.value))),[230,190,90,60]);
  for(const [id,value] of [['crop-x',10],['crop-y',20],['crop-width',3],['crop-height',2]])await number(page,id,value);
  await page.locator('#crop-region-add').click();
  for(const [id,value] of [['crop-x',12],['crop-y',22],['crop-width',2],['crop-height',3]])await number(page,id,value);
  await page.locator('#crop-region-add').click();await page.locator('#crop-save').click();await page.waitForFunction(()=>Array.isArray(window.cropResult));
  const actual=await page.evaluate(()=>({results:window.cropResult.map(({name,asset,sourceRect})=>({name,size:[asset.width,asset.height],sourceRect})),unchanged:JSON.stringify(window.cropSource)===window.cropBefore,dialogs:document.querySelectorAll('#image-cropper').length}));
  assert.deepEqual(actual.results.map(r=>r.sourceRect),[{x:10,y:20,width:3,height:2},{x:12,y:22,width:2,height:3}]);assert.deepEqual(actual.results.map(r=>r.size),[[3,2],[2,3]]);assert.equal(new Set(actual.results.map(r=>r.name)).size,2);assert.ok(actual.results.every(r=>r.name.includes('아이콘')));assert.equal(actual.unchanged,true);assert.equal(actual.dialogs,0);assert.deepEqual(e.errors,[]);
 }finally{await e.browser.close();}
});

test('sprite grids apply offsets and gaps, save selected cells, and explain empty selection',async()=>{
 const e=await start();try{const {page}=e;await open(page,14,13);await page.locator('#crop-mode-grid').click();
  for(const [id,value] of [['crop-grid-rows',2],['crop-grid-columns',3],['crop-grid-offset-x',2],['crop-grid-offset-y',3],['crop-grid-gap-x',1],['crop-grid-gap-y',2]])await number(page,id,value);
  await page.locator('#crop-grid-none').click();assert.equal(await page.locator('#crop-save').isDisabled(),true);assert.match(await page.locator('#crop-status').innerText(),/選択|선택/);
  await page.locator('#crop-cell-0-0').click();await page.locator('#crop-cell-1-2').click();await page.locator('#crop-save').click();await page.waitForFunction(()=>Array.isArray(window.cropResult));
  const results=await page.evaluate(()=>window.cropResult.map(({name,sourceRect})=>({name,sourceRect})));
  assert.deepEqual(results,[{name:'아이콘-행01-열01',sourceRect:{x:2,y:3,width:3,height:4}},{name:'아이콘-행02-열03',sourceRect:{x:10,y:9,width:3,height:4}}]);assert.deepEqual(e.errors,[]);
 }finally{await e.browser.close();}
});

test('numeric crop and grid edits update valid geometry before the final field loses focus',async()=>{
 const e=await start();try{const {page}=e;await open(page,16,8);
  for(const [id,value] of [['crop-x',4],['crop-y',2],['crop-width',8],['crop-height',4]])await page.locator('#'+id).fill(String(value));
  await page.locator('#crop-width').blur();assert.equal(await page.locator('#crop-height').evaluate(input=>input===document.activeElement),true);
  assert.equal(await page.locator('#crop-save').isEnabled(),true,'The last valid number must enable saving without a separate blur');
  await page.locator('#crop-save').click();await page.waitForFunction(()=>Array.isArray(window.cropResult));
  assert.deepEqual(await page.evaluate(()=>window.cropResult[0].sourceRect),{x:4,y:2,width:8,height:4});
  await open(page,14,13);await page.locator('#crop-mode-grid').click();
  for(const [id,value] of [['crop-grid-rows',2],['crop-grid-columns',3],['crop-grid-offset-x',2],['crop-grid-offset-y',3],['crop-grid-gap-x',1],['crop-grid-gap-y',2]])await page.locator('#'+id).fill(String(value));
  assert.equal(await page.locator('#crop-grid-gap-y').evaluate(input=>input===document.activeElement),true);
  assert.equal(await page.locator('#crop-grid-cell-height').inputValue(),'4','The preview must use the active gap input immediately');
  await page.locator('#crop-cancel').click();assert.deepEqual(e.errors,[]);
 }finally{await e.browser.close();}
});

test('invalid geometry stays open with a useful error and native cancellation cleans up every opening',async()=>{
 const e=await start();try{const {page}=e;await open(page);await number(page,'crop-width',0);assert.equal(await page.locator('#crop-save').isDisabled(),true);assert.match(await page.locator('#crop-status').innerText(),/픽셀|영역/);
  await page.locator('#crop-mode-grid').click();await number(page,'crop-grid-rows',300);assert.equal(await page.locator('#crop-save').isDisabled(),true);assert.match(await page.locator('#crop-status').innerText(),/256|셀|행/);
  await page.keyboard.press('Escape');await page.waitForFunction(()=>window.cropResult===null);assert.equal(await page.locator('#image-cropper').count(),0);assert.equal(await page.evaluate(()=>JSON.stringify(window.cropSource)===window.cropBefore),true);
  await open(page,12,12);await page.locator('#crop-cancel').click();await page.waitForFunction(()=>window.cropResult===null);assert.equal(await page.locator('#image-cropper').count(),0);assert.deepEqual(e.errors,[]);
 }finally{await e.browser.close();}
});

test('pointer capture bounds a drag outside the image and pointer cancellation restores the previous region',async()=>{
 const e=await start();try{const {page}=e;await open(page,100,80);await page.locator('#crop-zoom').selectOption('4');
  let box=await page.locator('#crop-stage').boundingBox();await page.mouse.move(box.x+80,box.y+120);await page.mouse.down();await page.mouse.move(box.x+500,box.y+380,{steps:4});await page.mouse.up();
  assert.deepEqual(await page.locator('#crop-rect-fields input').evaluateAll(inputs=>inputs.map(i=>Number(i.value))),[20,30,80,50]);
  box=await page.locator('#crop-stage').boundingBox();await page.mouse.move(box.x+40,box.y+40);await page.mouse.down();await page.mouse.move(box.x+160,box.y+200,{steps:3});
  await page.locator('#crop-stage').dispatchEvent('pointercancel',{pointerId:1});await page.mouse.up();
  assert.deepEqual(await page.locator('#crop-rect-fields input').evaluateAll(inputs=>inputs.map(i=>Number(i.value))),[20,30,80,50]);
  await page.locator('#crop-cancel').click();assert.deepEqual(e.errors,[]);
 }finally{await e.browser.close();}
});

test('batch outputs have independent identities and unique names even when input names repeat',async()=>{
 const e=await start();try{const {page}=e;await open(page,12,12);await page.locator('#crop-cancel').click();
  const result=await page.evaluate(async()=>{
   const outputs=await window.cropTest.cropAssetRegions(window.cropSource,[{rect:{x:0,y:0,width:2,height:2},name:'같은 이름'},{rect:{x:0,y:0,width:1,height:1},name:'같은 이름'}]);
   return {names:outputs.map(o=>o.name),ids:outputs.map(o=>o.asset.id),sourceId:window.cropSource.id};
  });assert.deepEqual(result.names,['같은 이름','같은 이름-2']);assert.equal(new Set(result.ids).size,2);assert.ok(result.ids.every(id=>id!==result.sourceId));assert.deepEqual(e.errors,[]);
 }finally{await e.browser.close();}
});
