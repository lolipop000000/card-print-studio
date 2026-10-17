import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {openApp,qa} from './helpers/browser.mjs';
import {saveProject} from './helpers/flows.mjs';

async function imageFile(page){
 const data=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=16;c.height=8;const g=c.getContext('2d');g.fillStyle='#e23456';g.fillRect(4,2,8,4);return c.toDataURL();});
 return {name:'내 조각.png',mimeType:'image/png',buffer:Buffer.from(data.split(',')[1],'base64')};
}
test('shared library works across decks and copied card art stays portable',async()=>{
 const {browser,page,pageErrors}=await openApp();try{
  assert.equal(await page.locator('#asset-library').count(),1);
  await page.locator('#asset-library').click();await page.locator('#asset-files').setInputFiles(await imageFile(page));
  await page.waitForFunction(()=>document.querySelectorAll('.asset-entry').length===1);await page.locator('.asset-entry').first().click();await page.locator('#asset-use-art').click();
  await page.locator('#asset-library-dialog').waitFor({state:'detached'});const before=await saveProject(page,'asset-applied.json');const first=before.cards[0].artAssetId;
  assert.ok(first);assert.equal(before.assets[first].width,16);assert.equal(before.assets[first].height,8);assert.equal(before.assets[first].paintingId,null);
  await page.getByRole('button',{name:'새 덱',exact:true}).click();await page.locator('#art-library').click();await page.locator('.asset-entry').first().click();await page.locator('#asset-choose').click();
  await page.locator('#asset-library-dialog').waitFor({state:'detached'});const reused=await saveProject(page,'asset-reused.json');assert.equal(reused.assets[reused.cards[0].artAssetId].dataUrl,before.assets[first].dataUrl);assert.notEqual(reused.cards[0].artAssetId,first);
  await page.locator('#asset-library').click();await page.locator('.asset-entry').first().click();await page.getByRole('button',{name:'삭제',exact:true}).click();await page.locator('.confirm-dialog').getByRole('button',{name:'에셋 삭제',exact:true}).click();
  await page.waitForFunction(()=>document.querySelectorAll('.asset-entry').length===0);await page.locator('#asset-library-close').click();assert.deepEqual(await saveProject(page,'asset-independent.json'),reused);
  await page.screenshot({path:path.join(qa,'asset-library-card.png'),fullPage:true});assert.deepEqual(pageErrors,[]);
 }finally{await browser.close();}
});
test('cropping current card art saves a reusable piece without modifying its source',async()=>{
 const {browser,page,pageErrors}=await openApp();try{
  await page.locator('#asset-library').click();await page.locator('#asset-files').setInputFiles(await imageFile(page));await page.waitForFunction(()=>document.querySelectorAll('.asset-entry').length===1);
  await page.locator('.asset-entry').first().click();await page.locator('#asset-use-art').click();await page.locator('#asset-library-dialog').waitFor({state:'detached'});
  const before=await saveProject(page,'crop-source.json'),source=before.assets[before.cards[0].artAssetId];
  await page.locator('#art-crop').click();for(const [id,value] of [['crop-x',4],['crop-y',2],['crop-width',8],['crop-height',4]])await page.locator('#'+id).fill(String(value));
  await page.locator('#crop-width').blur();await page.locator('#crop-save').click();await page.locator('#image-cropper').waitFor({state:'detached'});
  await page.waitForFunction(()=>!document.querySelector('#message')?.textContent.includes('처리 중'));
  const after=await saveProject(page,'crop-result.json'),cropped=after.assets[after.cards[0].artAssetId];assert.equal(cropped.width,8);assert.equal(cropped.height,4);assert.deepEqual(after.assets[source.id],source);
  await page.locator('#asset-library').click();await page.waitForFunction(()=>document.querySelectorAll('.asset-entry').length===2);await page.screenshot({path:path.join(qa,'asset-library-pieces.png'),fullPage:true});await page.locator('#asset-library-close').click();assert.deepEqual(pageErrors,[]);
 }finally{await browser.close();}
});
