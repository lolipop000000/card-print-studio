import test from 'node:test';
import assert from 'node:assert/strict';
import {openApp} from './helpers/browser.mjs';
import {saveProject} from './helpers/flows.mjs';

const number=async(page,id,value)=>{await page.locator('#'+id).fill(String(value));await page.locator('#'+id).press('Tab');};
test('emitter timing, bursts, lifetime curves and overlap order persist as one undoable edit',async()=>{
 const {browser,page,pageErrors}=await openApp();try{
  const before=await saveProject(page,'timing-before.json');await page.locator('#card-text-effects').click();await page.locator('#effect-particle-add').click();
  assert.equal(await page.locator('#effect-emission-rate').count(),1,'a particle exposes time-based generation controls');
  await number(page,'effect-emission-rate',8);await number(page,'effect-emission-duration',4);
  await page.locator('#effect-emission-loop-mode').selectOption('finite');await number(page,'effect-emission-loops',2);
  await number(page,'effect-emission-lifeMin',.5);await number(page,'effect-emission-lifeMax',1.5);
  await page.locator('#effect-burst-add').click();await number(page,'effect-burst-0-countMin',3);await number(page,'effect-burst-0-countMax',5);
  const timeline=await page.locator('#effect-burst-timeline').boundingBox(),marker=await page.locator('[data-burst="0"]').boundingBox();
  await page.mouse.move(marker.x+marker.width/2,marker.y+marker.height/2);await page.mouse.down();await page.mouse.move(timeline.x+timeline.width*.5,marker.y+marker.height/2,{steps:5});await page.mouse.up();
  const time=Number(await page.locator('#effect-burst-0-time').inputValue());assert.ok(time>1.8&&time<2.2,time);
  await page.locator('#effect-size-curve-enabled').check();await number(page,'effect-size-curve-start',.25);await number(page,'effect-size-curve-end',2);
  await page.locator('#effect-size-curve-add').click();await number(page,'effect-size-curve-1-value',3);
  await page.locator('#effect-alpha-curve-enabled').check();await number(page,'effect-alpha-curve-start',1);await number(page,'effect-alpha-curve-end',0);
  await page.locator('#effect-emission-drawOrder').selectOption('olderFront');await page.locator('#effect-over-text').check();assert.equal(await page.locator('#effect-placement').inputValue(),'front');
  await page.locator('#effect-apply').click();const saved=await saveProject(page,'timing-after.json'),layer=saved.cards[0].elements.find(e=>e.binding?.field==='name').style.visualEffects.layers.find(l=>l.kind==='sprite');
  assert.equal(layer.emission.rate,8);assert.equal(layer.emission.loops,2);assert.equal(layer.emission.lifeMin,.5);assert.equal(layer.emission.lifeMax,1.5);assert.equal(layer.emission.bursts[0].countMax,5);assert.ok(Math.abs(layer.emission.bursts[0].time-2)<.2);
  assert.deepEqual(layer.emission.sizeCurve,[{at:0,value:.25},{at:.5,value:3},{at:1,value:2}]);assert.deepEqual(layer.emission.alphaCurve,[{at:0,value:1},{at:1,value:0}]);assert.equal(layer.emission.drawOrder,'olderFront');
  await page.locator('#undo').click();assert.deepEqual(await saveProject(page,'timing-undo.json'),before);assert.deepEqual(pageErrors,[]);
 }finally{await browser.close();}
});

test('choosing the same particle image across layers and reopening does not duplicate deck assets',async()=>{
 const {browser,page,pageErrors}=await openApp();try{
  await page.locator('#card-text-effects').click();await page.locator('#effect-particle-add').click();await page.locator('[data-particle-image="sparkle"]').click();await page.waitForFunction(()=>document.querySelector('#effect-param-assetId')?.value);
  const first=await page.locator('#effect-param-assetId').inputValue();await page.locator('#effect-particle-add').click();await page.locator('[data-particle-image="sparkle"]').click();await page.waitForFunction(()=>document.querySelector('#effect-param-assetId')?.value);
  assert.equal(await page.locator('#effect-param-assetId').inputValue(),first);await page.locator('#effect-apply').click();const saved=await saveProject(page,'shared-pixels.json');assert.equal(Object.keys(saved.assets).length,1);
  await page.locator('#card-text-effects').click();await page.locator('#effect-particle-add').click();await page.locator('[data-particle-image="sparkle"]').click();await page.waitForFunction(()=>document.querySelector('#effect-param-assetId')?.value);assert.equal(await page.locator('#effect-param-assetId').inputValue(),first);await page.locator('#effect-apply').click();assert.equal(Object.keys((await saveProject(page,'shared-again.json')).assets).length,1);assert.deepEqual(pageErrors,[]);
 }finally{await browser.close();}
});
