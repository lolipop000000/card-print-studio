import test from 'node:test';
import assert from 'node:assert/strict';
import {openApp} from './helpers/browser.mjs';
import {saveProject} from './helpers/flows.mjs';

async function options(page,prefix){await page.locator('#'+prefix+'-preview-options > summary').click();}
async function change(page,id,value){await page.locator('#'+id).fill(value);await page.locator('#'+id).press('Tab');}

test('card playback obeys its duration and manual DPI, remembers settings and keeps project data unchanged',async()=>{
 const app=await openApp();try{const {page}=app;page.setDefaultTimeout(10000);
  assert.equal(await page.locator('#card-effect-prerender').count(),0,'the separate six-second renderer is replaced by normal preview settings');
  const before=await saveProject(page,'preview-settings-before.json');await options(page,'card');
  await change(page,'card-preview-duration','2');await page.locator('#card-preview-loop').uncheck();await page.locator('#card-preview-dpi').selectOption('300');
  await page.waitForFunction(()=>document.querySelector('#card-canvas')?.dataset.previewDpi==='300');
  await page.clock.install();await page.locator('#card-effect-time').evaluate(n=>{n.value='1.9';n.dispatchEvent(new Event('input',{bubbles:true}));});
  await page.locator('#card-effect-play').click();await page.clock.runFor(400);
  assert.equal(await page.locator('#card-effect-play').getAttribute('aria-pressed'),'false');assert.equal(Number(await page.locator('#card-effect-time').inputValue()),2);
  assert.equal(await page.locator('#card-canvas').getAttribute('data-preview-dpi'),'300');assert.deepEqual(await saveProject(page,'preview-settings-after.json'),before);
  await page.reload();await page.locator('[data-ready=true]').waitFor();await options(page,'card');assert.equal(await page.locator('#card-preview-duration').inputValue(),'2');assert.equal(await page.locator('#card-preview-loop').isChecked(),false);assert.equal(await page.locator('#card-preview-dpi').inputValue(),'300');assert.deepEqual(app.pageErrors,[]);
 }finally{await app.browser.close();}
});

test('composer loops inside a chosen range and custom DPI does not enter effect history',async()=>{
 const app=await openApp();try{const {page}=app;page.setDefaultTimeout(10000);const before=await saveProject(page,'composer-preview-before.json');
  await page.locator('#card-text-effects').click();assert.equal(await page.locator('#effect-prerender').count(),0);assert.equal(await page.locator('#effect-print-quality').count(),0);
  await options(page,'effect');await change(page,'effect-preview-duration','1');await page.locator('#effect-preview-loop').check();await page.locator('#effect-preview-dpi').selectOption('custom');await change(page,'effect-preview-custom-dpi','360');
  await page.waitForFunction(()=>document.querySelector('#effect-preview')?.dataset.previewDpi==='360');assert.equal(await page.locator('#effect-undo').isDisabled(),true);
  await page.clock.install();await page.locator('#effect-time').evaluate(n=>{n.value='.95';n.dispatchEvent(new Event('input',{bubbles:true}));});await page.locator('#effect-play').click();await page.clock.runFor(250);
  assert.equal(await page.locator('#effect-play').getAttribute('aria-pressed'),'true');assert.ok(Number(await page.locator('#effect-time').inputValue())<.3);assert.equal(await page.locator('#effect-time').getAttribute('max'),'1');assert.equal(await page.locator('#effect-preview').getAttribute('data-preview-dpi'),'360');
  await page.locator('#effect-play').click();await page.locator('#effect-close').click();assert.deepEqual(await saveProject(page,'composer-preview-after.json'),before);assert.deepEqual(app.pageErrors,[]);
 }finally{await app.browser.close();}
});

test('invalid preview inputs recover to the last valid values without changing playback or allocating a huge canvas',async()=>{
 const app=await openApp();try{const {page}=app;await options(page,'card');await change(page,'card-preview-duration','0');assert.equal(await page.locator('#card-preview-duration').inputValue(),'6');
  await page.locator('#card-preview-dpi').selectOption('custom');await change(page,'card-preview-custom-dpi','999999');assert.equal(await page.locator('#card-preview-custom-dpi').inputValue(),'600');
  await page.waitForFunction(()=>document.querySelector('#card-canvas')?.dataset.previewDpi==='600');assert.deepEqual(app.pageErrors,[]);
 }finally{await app.browser.close();}
});

test('card and composer preferences stay synchronized instead of overwriting each other on the next change',async()=>{
 const app=await openApp();try{const {page}=app;await page.locator('#card-text-effects').click();await options(page,'effect');await page.locator('#effect-preview-dpi').selectOption('300');await change(page,'effect-preview-duration','9');await page.locator('#effect-close').click();
  await options(page,'card');assert.equal(await page.locator('#card-preview-duration').inputValue(),'9');assert.equal(await page.locator('#card-preview-dpi').inputValue(),'300');await page.locator('#card-preview-loop').uncheck();
  await page.locator('#card-text-effects').click();await options(page,'effect');assert.equal(await page.locator('#effect-preview-loop').isChecked(),false);assert.equal(await page.locator('#effect-preview-dpi').inputValue(),'300');assert.equal(await page.locator('#effect-preview-duration').inputValue(),'9');assert.deepEqual(app.pageErrors,[]);
 }finally{await app.browser.close();}
});
