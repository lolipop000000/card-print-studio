import test from 'node:test';
import assert from 'node:assert/strict';
import {openApp} from './helpers/browser.mjs';
import {saveProject} from './helpers/flows.mjs';
const fill=async(page,id,value)=>{await page.locator(id).fill(value);await page.locator(id).press('Tab');};

test('particle category exposes twelve rendered choices and petal controls survive apply and undo',async()=>{
 const {browser,page,pageErrors,httpRequests}=await openApp();try{
  const before=await saveProject(page,'particle-ui-before.json');await page.locator('#card-text-effects').click();
  assert.ok((await page.locator('#effect-preset-category option').allTextContents()).includes('흩날림·입자'),'new particles have a searchable category');
  await page.locator('#effect-preset-category').selectOption('흩날림·입자');assert.equal(await page.locator('[data-builtin-effect]').count(),12);
  await page.locator('#effect-preset-search').fill('벚꽃');assert.equal(await page.locator('[data-builtin-effect]').count(),1);
  await page.waitForFunction(()=>document.querySelector('[data-builtin-effect="sakuraBreeze"] canvas')?.dataset.ready==='true');await page.locator('[data-builtin-effect="sakuraBreeze"]').click();
  await page.locator('.effect-layer[data-kind="petal"] .effect-layer-select').click();await fill(page,'#effect-param-count','36');await fill(page,'#effect-param-size','0.08');await fill(page,'#effect-param-fade','2');await fill(page,'#effect-param-color','#b3499c');
  await page.locator('#effect-apply').click();const saved=await saveProject(page,'particle-ui-after.json'),text=saved.cards[0].elements.find(e=>e.binding?.field==='name'),petal=text.style.visualEffects.layers.find(l=>l.kind==='petal');
  assert.equal(petal.params.count,36);assert.equal(petal.params.size,.08);assert.equal(petal.params.fade,2);assert.equal(petal.params.color,'#b3499c');assert.deepEqual(saved.assets,before.assets);assert.deepEqual(saved.paintings,before.paintings);
  await page.locator('#undo').click();assert.deepEqual(await saveProject(page,'particle-ui-undo.json'),before);assert.deepEqual(pageErrors,[]);assert.deepEqual(httpRequests,[]);
 }finally{await browser.close();}
});

test('ripple end fading remains editable alongside an alpha-following outline',async()=>{
 const {browser,page,pageErrors}=await openApp();try{
  await page.locator('#card-text-effects').click();await page.locator('#effect-layer-kind').selectOption('ripple');await page.locator('#effect-layer-add').click();
  assert.equal(await page.locator('#effect-param-fade').count(),1,'ripple offers its fade curve');await fill(page,'#effect-param-fade','2.5');
  await page.locator('#effect-layer-kind').selectOption('outline');await page.locator('#effect-layer-add').click();assert.ok((await page.locator('#effect-layer-hint').textContent()).includes('투명도'));
  await fill(page,'#effect-param-width','0.2');await page.locator('#effect-apply').click();const saved=await saveProject(page,'ripple-outline-ui.json'),layers=saved.cards[0].elements.find(e=>e.binding?.field==='name').style.visualEffects.layers;
  assert.equal(layers.find(l=>l.kind==='ripple').params.fade,2.5);assert.equal(layers.at(-1).kind,'outline');assert.equal(layers.at(-1).params.width,.2);assert.deepEqual(pageErrors,[]);
 }finally{await browser.close();}
});
