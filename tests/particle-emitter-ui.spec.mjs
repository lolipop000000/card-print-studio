import test from 'node:test';
import assert from 'node:assert/strict';
import {openApp} from './helpers/browser.mjs';
import {saveProject} from './helpers/flows.mjs';
import {readFile} from 'node:fs/promises';
import {addVisualLayer} from './helpers/effects.mjs';

test('unified emitter offers offline built-in images and motion, preserves apply/undo and library reuse',async()=>{
 const {browser,page,pageErrors,httpRequests}=await openApp();try{
  const before=await saveProject(page,'emitter-before.json');await page.locator('#card-text-effects').click();
  assert.equal(await page.locator('#effect-layer-kind option[value=flame]').count(),0,'spawning effects use the particle picker');
  await page.locator('#effect-emitter-preset').selectOption('sprite');await page.locator('#effect-particle-add').click();
  assert.ok(await page.locator('[data-particle-image]').count()>=8);
  await page.locator('[data-particle-image="sparkle"]').click();
  await page.waitForFunction(()=>document.querySelector('#effect-param-assetId')?.value);
  await page.locator('#effect-param-motionPattern').selectOption('spiral');
  await page.locator('#effect-param-pathTurns').fill('3');await page.locator('#effect-param-pathTurns').press('Tab');
  await page.locator('#effect-preset-name').fill('내 별빛 나선');await page.locator('#effect-save-library').click();
  await page.waitForFunction(()=>document.querySelector('#effect-feedback')?.textContent.includes('보관함에 저장'));
  await page.locator('#effect-apply').click();const saved=await saveProject(page,'emitter-after.json');
  const effect=saved.cards[0].elements.find(e=>e.binding?.field==='name').style.visualEffects.layers.find(l=>l.kind==='sprite');
  assert.equal(effect.params.motionPattern,'spiral');assert.equal(effect.params.pathTurns,3);assert.equal(saved.assets[effect.params.assetId].width,128);
  await page.locator('#undo').click();assert.deepEqual(await saveProject(page,'emitter-undo.json'),before);
  await page.locator('#asset-library').click();await page.locator('#library-tab-particles').click();
  await page.locator('[data-particle-entry]').filter({hasText:'내 별빛 나선'}).click();
  await page.waitForFunction(()=>document.querySelector('#particle-preview')?.dataset.ready==='true');
  assert.ok(await page.locator('#particle-preview').evaluate(canvas=>{const d=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;let changed=0;for(let i=0;i<d.length;i+=4)if(d[i]!==16||d[i+1]!==29||d[i+2]!==45)changed++;return changed;}),'a ready preview contains visible particles');
  assert.equal(await page.locator('#particle-use').isEnabled(),true);
  await page.locator('#particle-use').click();const reused=await saveProject(page,'emitter-reused.json');
  const decoration=reused.cards[0].elements.find(e=>e.type==='effect');assert.ok(decoration);
  const layer=decoration.style.visualEffects.layers.find(l=>l.kind==='sprite');assert.equal(layer.params.motionPattern,'spiral');assert.ok(reused.assets[layer.params.assetId]);
  assert.deepEqual(pageErrors,[]);assert.deepEqual(httpRequests,[]);
 }finally{await browser.close();}
});

test('particle library is usable on a narrow screen without login and exposes built-in starting recipes',async()=>{
 const {browser,page,pageErrors}=await openApp();try{
  await page.setViewportSize({width:390,height:844});await page.locator('#mobile-library').click();
  await page.locator('#library-tab-particles').click();assert.equal(await page.locator('#library-particles').isVisible(),true);
  assert.ok(await page.locator('[data-particle-builtin]').count()>=8);
  const contained=await page.locator('[data-particle-builtin]').evaluateAll(nodes=>nodes.every(node=>{const r=node.getBoundingClientRect();return [...node.children].every(child=>child.getBoundingClientRect().bottom<=r.bottom+1);}));assert.equal(contained,true,'each touch card contains its label and thumbnail');
  await page.locator('[data-particle-builtin="starlight"]').click();await page.waitForFunction(()=>document.querySelector('#particle-preview')?.dataset.ready==='true');
  await page.locator('[data-particle-builtin="smoke"]').click();await page.locator('#particle-edit').click();
  assert.equal(await page.locator('#effect-editor').isVisible(),true);
  await page.locator('#effect-close').click();
  const overflow=await page.locator('#asset-library-dialog').evaluate(node=>node.scrollWidth>node.clientWidth+2);assert.equal(overflow,false);
  assert.deepEqual(pageErrors,[]);
 }finally{await browser.close();}
});

test('library editor picks user images without closing, preserves sprite-sheet playback, and exports/imports portable recipes',async()=>{
 const {browser,page,pageErrors}=await openApp();try{
  const png=Buffer.from(await page.evaluate(()=>{const c=document.createElement('canvas');c.width=c.height=32;const g=c.getContext('2d');g.fillStyle='#ff4839';g.fillRect(1,1,13,13);g.fillStyle='#78d4ff';g.fillRect(18,18,13,13);return [...Uint8Array.from(atob(c.toDataURL().split(',')[1]),v=>v.charCodeAt(0))];}));
  await page.locator('#asset-library').click();await page.locator('#asset-files').setInputFiles({name:'내 시트.png',mimeType:'image/png',buffer:png});
  await page.waitForFunction(()=>document.querySelector('[data-entry-id]')&&!document.querySelector('#asset-import').disabled);
  await page.locator('#library-tab-particles').click();await page.locator('#particle-new').click();
  await page.locator('#effect-param-shape').selectOption('image');await page.locator('#effect-sprite-library').click();
  const picker=page.locator('#asset-picker-dialog');await picker.locator('[data-entry-id]').first().click();await picker.locator('#asset-choose').click();
  assert.equal(await picker.count(),0);assert.equal(await page.locator('#effect-editor').isVisible(),true);
  await page.locator('#effect-sprite-sheet').locator('summary').click();
  for(const [key,value] of [['sheetColumns','2'],['sheetRows','2']]){await page.locator('#effect-param-'+key).fill(value);await page.locator('#effect-param-'+key).press('Tab');}
  await page.locator('#effect-param-frameMode').selectOption('loop');await page.locator('#effect-param-frameRate').fill('8');await page.locator('#effect-param-frameRate').press('Tab');await page.locator('#effect-param-motionPattern').selectOption('wave');
  await page.locator('#effect-preset-name').fill('직접 올린 시트');await page.locator('#effect-apply').click();await page.waitForSelector('#effect-editor',{state:'detached'});
  const entry=page.locator('[data-particle-entry]').filter({hasText:'직접 올린 시트'});await entry.click();await page.waitForFunction(()=>document.querySelector('#particle-preview')?.dataset.ready==='true');
  const pending=page.waitForEvent('download');await page.locator('#particle-export').click();const download=await pending,text=await readFile(await download.path(),'utf8'),data=JSON.parse(text),saved=data.entries[0],layer=saved.recipe.layers[0];
  assert.equal(layer.params.sheetColumns,2);assert.equal(layer.params.sheetRows,2);assert.equal(layer.params.frameMode,'loop');assert.equal(layer.params.frameRate,8);assert.equal(layer.params.motionPattern,'wave');assert.equal(saved.assets[layer.params.assetId].dataUrl,'data:image/png;base64,'+png.toString('base64'));
  await page.locator('#particle-duplicate').click();await page.waitForFunction(()=>document.querySelectorAll('[data-particle-entry]').length===2);
  await page.locator('#particle-library-file').setInputFiles({name:'particle.json',mimeType:'application/json',buffer:Buffer.from(text)});await page.waitForFunction(()=>document.querySelectorAll('[data-particle-entry]').length===3);
  await page.locator('#asset-library-close').click();await page.locator('#asset-library').click();await page.locator('#library-tab-particles').click();assert.equal(await page.locator('[data-particle-entry]').count(),3);
  await page.locator('[data-particle-entry]').last().click();await page.locator('#particle-delete').click();await page.getByRole('button',{name:'삭제',exact:true}).last().click();await page.waitForFunction(()=>document.querySelectorAll('[data-particle-entry]').length===2);
  assert.deepEqual(pageErrors,[]);
 }finally{await browser.close();}
});

test('library applies to the chosen title instead of creating a decoration, with one undo step',async()=>{
 const {browser,page,pageErrors}=await openApp();try{
  const before=await saveProject(page,'particle-target-before.json');await page.locator('#asset-library').click();await page.locator('#library-tab-particles').click();
  await page.locator('[data-particle-builtin="starlight"]').click();await page.locator('#particle-destination').selectOption('name');await page.locator('#particle-use').click();
  const after=await saveProject(page,'particle-target-after.json');assert.equal(after.cards[0].elements.filter(element=>element.type==='effect').length,0);
  assert.ok(after.cards[0].elements.find(element=>element.binding?.field==='name').style.visualEffects.layers.some(layer=>layer.kind==='starlight'));
  await page.locator('#undo').click();assert.deepEqual(await saveProject(page,'particle-target-undo.json'),before);assert.deepEqual(pageErrors,[]);
 }finally{await browser.close();}
});

test('text distortion and frame recipes remain editable in the particle library and adapt on reuse',async()=>{
 const {browser,page,pageErrors}=await openApp();try{
  await page.locator('#card-text-effects').click();await addVisualLayer(page,'textWarp');await addVisualLayer(page,'starlight');
  await page.locator('#effect-preset-name').fill('글자 파티클');await page.locator('#effect-save-library').click();await page.waitForFunction(()=>document.querySelector('#effect-feedback')?.textContent.includes('보관함에 저장'));
  await page.locator('#effect-apply').click();await page.locator('#card-frame-effects').click();await addVisualLayer(page,'flame');await page.locator('#effect-preset-name').fill('프레임 파티클');await page.locator('#effect-save-library').click();await page.waitForFunction(()=>document.querySelector('#effect-feedback')?.textContent.includes('보관함에 저장'));await page.locator('#effect-apply').click();
  await page.locator('#asset-library').click();await page.locator('#library-tab-particles').click();await page.locator('[data-particle-entry]').filter({hasText:'글자 파티클'}).click();await page.locator('#particle-edit').click();
  await page.waitForSelector('#effect-editor');assert.equal(await page.locator('.effect-layer[data-kind=textWarp]').count(),1);await page.locator('#effect-apply').click();await page.waitForSelector('#effect-editor',{state:'detached'});
  await page.locator('[data-particle-entry]').filter({hasText:'프레임 파티클'}).click();await page.locator('#particle-edit').click();await page.waitForSelector('#effect-editor');assert.equal(await page.locator('#effect-frame-scope').count(),1);await page.locator('#effect-apply').click();await page.waitForSelector('#effect-editor',{state:'detached'});
  await page.locator('#particle-destination').selectOption('name');await page.locator('#particle-use').click();const saved=await saveProject(page,'particle-compatible-target.json');const recipe=saved.cards[0].elements.find(e=>e.binding?.field==='name').style.visualEffects;assert.equal(recipe.frame,undefined);assert.ok(recipe.layers.some(layer=>layer.kind==='flame'));assert.deepEqual(pageErrors,[]);
 }finally{await browser.close();}
});
