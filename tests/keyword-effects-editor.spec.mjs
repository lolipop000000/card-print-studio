import {addVisualLayer} from './helpers/effects.mjs';
import {setPreviewDpi} from './helpers/flows.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {openApp,qa} from './helpers/browser.mjs';
import {saveProject} from './helpers/flows.mjs';

test('unused keywords have a visible effect sample and preview, comparison and cancel never change the saved deck',async()=>{
 const {browser,page,pageErrors,httpRequests}=await openApp();page.setDefaultTimeout(8000);
 try{
  await page.locator('#keyword-manager').click();await page.locator('#keyword-add').click();
  assert.equal(await page.locator('#keyword-effects').count(),1,'Keyword manager must offer dedicated effects');
  await page.locator('#keyword-name').fill('불꽃');await page.locator('#keyword-name').press('Tab');await page.locator('#keyword-close').click();
  const before=await saveProject(page,'keyword-editor-before.json');await page.locator('#keyword-manager').click();await page.locator('#keyword-effects').click();
  assert.match(await page.locator('#effect-target option:checked').innerText(),/키워드.*불꽃/);
  assert.equal(await page.locator('#effect-text-fontPt').count(),0,'Keyword editing must not offer unsupported font writes');
  assert.equal(await page.locator('#effect-focus-target').isDisabled(),false,'Even an unused keyword needs a visible sample');
  await page.locator('#effect-text-color-reset').click();assert.equal(await page.locator('#effect-text-color').inputValue(),'#427963','Reset must display the actual default keyword color');
  await page.locator('#effect-focus-target').click();assert.equal(await page.locator('#effect-preview-zoom').inputValue(),'2');
  await addVisualLayer(page,'heatHaze');
  await page.locator('#effect-param-amount').fill('0.6');await page.locator('#effect-param-amount').press('Tab');
  await page.locator('#effect-undo').click();assert.equal(await page.locator('#effect-param-amount').inputValue(),'0.22');await page.locator('#effect-redo').click();
  await page.locator('#effect-compare').dispatchEvent('pointerdown');await page.locator('#effect-compare').dispatchEvent('pointerup');
  await page.locator('#effect-close').click();await page.getByRole('button',{name:'변경 버리기',exact:true}).click();await page.locator('#keyword-close').click();
  assert.deepEqual(await saveProject(page,'keyword-editor-cancelled.json'),before);
  await page.locator('#keyword-manager').click();await page.locator('#keyword-effects').click();await addVisualLayer(page,'heatHaze');
  await setPreviewDpi(page,300);await page.waitForFunction(()=>document.getElementById('effect-preview-status')?.dataset.busy==='false');
  assert.equal(await page.locator('#effect-preview-status').getAttribute('data-effect-backend'),'gpu');
  await page.screenshot({path:qa+'/keyword-heat-editor.png',fullPage:true});await page.locator('#effect-apply').click();await page.locator('#keyword-close').click();
  const applied=await saveProject(page,'keyword-editor-applied.json');assert.equal(applied.keywords[0].visualEffects.layers[0].kind,'heatHaze');assert.deepEqual(applied.cards,before.cards);
  await page.locator('#undo').click();assert.equal((await saveProject(page,'keyword-editor-undone.json')).keywords[0].visualEffects,undefined);
  assert.deepEqual(pageErrors,[]);assert.deepEqual(httpRequests,[]);
 }finally{await browser.close();}
});
