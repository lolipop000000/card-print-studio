import test from 'node:test';
import assert from 'node:assert/strict';
import {openApp} from './helpers/browser.mjs';

test('offline effect editor shows CPU fallback honestly when GPU is unavailable',async()=>{
 const {browser,page,pageErrors,httpRequests}=await openApp();
 try{
  await page.evaluate(()=>{
   const get=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){return type==='webgl2'?null:get.call(this,type,...args);};
  });
  await page.locator('#card-frame-effects').click();
  for(const kind of ['flame','bloom']){await page.locator('#effect-layer-kind').selectOption(kind);await page.locator('#effect-layer-add').click();}
  await page.locator('#effect-param-threshold').fill('0');await page.locator('#effect-param-threshold').press('Tab');
  await page.waitForFunction(()=>document.getElementById('effect-preview-status')?.dataset.busy==='false'&&document.getElementById('effect-preview-status')?.dataset.bloomBackend==='cpu');
  assert.match(await page.locator('#effect-preview-status').innerText(),/블룸 CPU/);
  assert.equal(await page.locator('#effect-preview-status').getAttribute('data-effect-backend'),'cpu');
  assert.match(await page.locator('#effect-preview-status').innerText(),/이펙트 CPU/);
  assert.match(await page.locator('#effect-preview-status').getAttribute('title'),/기본 방식으로 처리/);
  assert.equal(await page.locator('#effect-apply').isEnabled(),true);
  assert.deepEqual(pageErrors,[]);assert.deepEqual(httpRequests,[]);
 }finally{await browser.close();}
});
