import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {openApp,qa} from './helpers/browser.mjs';
import {saveProject} from './helpers/flows.mjs';
const fill=async(page,id,value)=>{await page.locator(id).fill(String(value));await page.locator(id).press('Tab');};
const add=async(page,kind)=>{await page.locator('#effect-layer-kind').selectOption(kind);await page.locator('#effect-layer-add').click();};
async function image(page){return {name:'나만의 룬.png',mimeType:'image/png',buffer:Buffer.from(await page.evaluate(()=>{const c=document.createElement('canvas');c.width=64;c.height=32;const g=c.getContext('2d');g.strokeStyle='#90cfff';g.lineWidth=3;g.strokeRect(12,4,40,24);g.clearRect(25,10,14,12);return [...Uint8Array.from(atob(c.toDataURL().split(',')[1]),c=>c.charCodeAt(0))];}))};}
async function upload(page,file){
 assert.equal(await page.locator('#effect-sprite-file').count(),1,'Image import is isolated from card-art import');
 await page.locator('#effect-sprite-import').click();await page.locator('#effect-sprite-file').setInputFiles(file);
 await page.waitForFunction(()=>!!document.getElementById('effect-param-assetId')?.value);
 return page.locator('#effect-param-assetId').inputValue();
}
async function discard(page){await page.locator('#effect-close').click();await page.getByRole('button',{name:'변경 버리기',exact:true}).click();}

test('staged sprite images undo and redo without touching the project, and cancel discards imports',async()=>{
 const {browser,page,pageErrors,httpRequests}=await openApp();page.setDefaultTimeout(6000);try{
  const before=await saveProject(page,'sprite-import-before.json'),file=await image(page);await page.locator('#card-frame-effects').click();
  const options=await page.locator('#effect-layer-kind option').evaluateAll(ns=>ns.map(n=>n.value));
  for(const alias of ['rune','petal','leaf','snowflake','crystal','confetti','particle'])assert.equal(options.includes(alias),false,alias+' is covered by sprite');
  await add(page,'sprite');await page.locator('#effect-param-shape').selectOption('image');
  await page.locator('#effect-sprite-file').evaluate(n=>n.dispatchEvent(new Event('cancel',{bubbles:true})));assert.equal(await page.getByRole('button',{name:'변경 버리기',exact:true}).count(),0,'File picker cancellation must not close its parent editor');
  const id=await upload(page,file);
  await page.locator('#effect-undo').click();assert.equal(await page.locator('#effect-param-assetId').inputValue(),'');
  await page.locator('#effect-redo').click();assert.equal(await page.locator('#effect-param-assetId').inputValue(),id);
  await discard(page);assert.deepEqual(await saveProject(page,'sprite-import-discarded.json'),before);
  assert.deepEqual(pageErrors,[]);assert.deepEqual(httpRequests,[]);
 }finally{await browser.close();}
});
test('image preset saves its resource, survives cancel, applies without replacing card art, and reopens',async()=>{
 const {browser,page,pageErrors,httpRequests}=await openApp();page.setDefaultTimeout(6000);try{
  const before=await saveProject(page,'sprite-preset-before.json'),file=await image(page);await page.locator('#card-frame-effects').click();await add(page,'sprite');await page.locator('#effect-param-shape').selectOption('image');
  const id=await upload(page,file);await fill(page,'#effect-preset-name','나만의 룬 입자');await page.locator('#effect-save-preset').click();
  assert.equal(await page.locator('[data-effect-preset]').count(),1);await discard(page);
  const saved=await saveProject(page,'sprite-preset-saved.json');assert.equal(saved.cards[0].artAssetId,before.cards[0].artAssetId);assert.ok(saved.assets[id]);assert.deepEqual(saved.cards[0],before.cards[0]);
  await page.locator('#card-frame-effects').click();await page.locator('[data-effect-preset]').click();assert.equal(await page.locator('#effect-param-assetId').inputValue(),id);
  await page.locator('#effect-placement').selectOption('front');await fill(page,'#effect-param-sizeEnd',0);await add(page,'bloom');await fill(page,'#effect-param-threshold',.25);
  await page.locator('#effect-print-quality').check();await page.waitForFunction(()=>document.getElementById('effect-preview-status')?.dataset.busy==='false');
  assert.equal(await page.locator('#effect-preview-status').getAttribute('data-bloom-backend'),'gpu','Actual offline editor uses GPU bloom');
  assert.match(await page.locator('#effect-preview-status').innerText(),/블룸 GPU/);
  await page.screenshot({path:path.join(qa,'sprite-bloom-editor.png'),fullPage:true});await page.locator('#effect-apply').click();
  const applied=await saveProject(page,'sprite-preset-applied.json');assert.equal(applied.cards[0].artAssetId,before.cards[0].artAssetId);assert.equal(applied.cards[0].visualEffects.layers[0].params.assetId,id);assert.equal(applied.cards[0].visualEffects.layers[0].params.sizeEnd,0);assert.equal(applied.cards[0].visualEffects.layers[1].params.threshold,.25);
  await page.locator('#card-frame-effects').click();assert.equal(await page.locator('#effect-layer-list [data-kind="bloom"]').count(),1);await page.locator('#effect-close').click();
  assert.deepEqual(pageErrors,[]);assert.deepEqual(httpRequests,[]);
 }finally{await browser.close();}
});
test('new filter controls persist on text and exact invalid-field feedback keeps the previous value',async()=>{
 const {browser,page,pageErrors}=await openApp();page.setDefaultTimeout(6000);try{
  await page.locator('#card-frame-effects').click();await add(page,'directionalBlur');await fill(page,'#effect-param-angle',-35);await add(page,'displacement');await fill(page,'#effect-param-amount',.7);await page.locator('#effect-param-axis').selectOption('y');
  await fill(page,'#effect-param-amount',8);assert.match(await page.locator('#effect-feedback').innerText(),/흔들림 거리.*8.*0~3/);assert.equal(await page.locator('#effect-param-amount').inputValue(),'0.7');
  await page.locator('#effect-apply').click();const saved=await saveProject(page,'creative-controls.json');assert.deepEqual(saved.cards[0].visualEffects.layers.map(l=>l.kind),['directionalBlur','displacement']);assert.equal(saved.cards[0].visualEffects.layers[1].params.amount,.7);assert.equal(saved.cards[0].visualEffects.layers[1].params.axis,'y');assert.deepEqual(pageErrors,[]);
 }finally{await browser.close();}
});
test('Apply and preset Save wait for the selected sprite image to finish reading',async()=>{
 const {browser,page}=await openApp();page.setDefaultTimeout(6000);try{
  const file=await image(page);await page.locator('#card-frame-effects').click();await add(page,'sprite');await page.locator('#effect-param-shape').selectOption('image');
  await page.evaluate(()=>{const read=FileReader.prototype.readAsDataURL;FileReader.prototype.readAsDataURL=function(file){window.releaseSpriteRead=()=>read.call(this,file);};});
  await page.locator('#effect-sprite-import').click();await page.locator('#effect-sprite-file').setInputFiles(file);
  assert.equal(await page.locator('#effect-apply').isDisabled(),true,'Do not apply an incomplete image selection');assert.equal(await page.locator('#effect-save-preset').isDisabled(),true,'Do not save a preset that omits its pending image');
  await page.evaluate(()=>window.releaseSpriteRead());await page.waitForFunction(()=>!!document.getElementById('effect-param-assetId')?.value);
  assert.equal(await page.locator('#effect-apply').isDisabled(),false);assert.equal(await page.locator('#effect-save-preset').isDisabled(),false);
  await page.locator('#effect-apply').click();const p=await saveProject(page,'sprite-waited-import.json');const l=p.cards[0].visualEffects.layers[0];assert.ok(p.assets[l.params.assetId]);
 }finally{await browser.close();}
});

test('finishing an import while close confirmation is open preserves it when editing continues',async()=>{
 const {browser,page}=await openApp();page.setDefaultTimeout(6000);try{
  const file=await image(page);await page.locator('#card-frame-effects').click();await add(page,'sprite');await page.locator('#effect-param-shape').selectOption('image');
  await page.evaluate(()=>{const read=FileReader.prototype.readAsDataURL;FileReader.prototype.readAsDataURL=function(file){window.releaseSpriteRead=()=>read.call(this,file);};});
  await page.locator('#effect-sprite-import').click();await page.locator('#effect-sprite-file').setInputFiles(file);await page.locator('#effect-close').click();
  await page.evaluate(()=>window.releaseSpriteRead());await page.waitForFunction(()=>!document.getElementById('effect-apply')?.disabled);
  await page.getByRole('button',{name:'계속 편집',exact:true}).click();assert.notEqual(await page.locator('#effect-param-assetId').inputValue(),'','Continuing editing retains an image that finished during the confirmation');
  await page.locator('#effect-apply').click();const p=await saveProject(page,'sprite-continued-import.json');assert.ok(p.assets[p.cards[0].visualEffects.layers[0].params.assetId]);
 }finally{await browser.close();}
});
