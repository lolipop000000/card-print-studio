import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {openApp,qa} from './helpers/browser.mjs';
import {saveProject,openPainter,drawStroke} from './helpers/flows.mjs';
async function edit(page,value){await page.locator('#card-name').fill(value);await page.locator('#card-name').press('Tab');}
async function saved(page){await page.waitForFunction(()=>document.getElementById('recovery-status')?.dataset.state==='saved',null,{timeout:12_000});}
async function reload(page){page.once('dialog',dialog=>dialog.accept());await page.reload();await page.waitForSelector('[data-ready="true"]');await page.locator('#recovery-notice').waitFor({state:'visible'});}

test('automatic recovery survives reload with applied original artwork and restores as unsaved without a file download',async()=>{
 const {browser,page,pageErrors}=await openApp();try{page.setDefaultTimeout(12_000);let downloads=0;page.on('download',()=>downloads++);
  await edit(page,'복구할 손그림 카드');await openPainter(page);await drawStroke(page);await page.locator('#paint-apply').click();await page.locator('#painting-editor').waitFor({state:'detached'});await saved(page);
  assert.equal(downloads,0);assert.equal(await page.locator('#save-state').innerText(),'미저장');await reload(page);
  await page.locator('#work-recovery').click();await page.locator('.recovery-file').filter({hasText:'나의 카드 덱'}).click();await page.locator('#recovery-library').waitFor({state:'detached'});
  assert.equal(await page.locator('#card-name').inputValue(),'복구할 손그림 카드');assert.equal(await page.locator('#save-state').innerText(),'미저장');assert.equal(downloads,0);
  const restored=await saveProject(page,'recovered-painting.json');assert.ok(restored.cards[0].artAssetId);assert.ok(Object.keys(restored.paintings).length);assert.ok(restored.paintings[restored.assets[restored.cards[0].artAssetId].paintingId].layers.length);
  await openPainter(page);assert.equal(await page.locator('.paint-layer').count(),1);await page.locator('#paint-close').click();await page.screenshot({path:path.join(qa,'work-recovery-restored.png'),fullPage:true});assert.deepEqual(pageErrors,[]);
 }finally{await browser.close();}
});
test('canceling replacement preserves current work and recovering another deck clears old filters',async()=>{
 const {browser,page,pageErrors}=await openApp();try{page.setDefaultTimeout(12_000);await edit(page,'이전 덱의 카드');await saved(page);await reload(page);await edit(page,'지금 지켜야 할 카드');await saved(page);
  await page.locator('#card-search').fill('안 맞는 검색');await page.locator('#work-recovery').click();await page.locator('.recovery-file').first().click();await page.getByRole('button',{name:'취소',exact:true}).last().click();assert.equal(await page.locator('#card-name').inputValue(),'지금 지켜야 할 카드');assert.equal(await page.locator('#save-state').innerText(),'미저장');
  await page.locator('.recovery-file').first().click();await page.getByRole('button',{name:'저장하지 않고 계속',exact:true}).click();await page.locator('#recovery-library').waitFor({state:'detached'});assert.equal(await page.locator('#card-search').inputValue(),'');assert.equal(await page.locator('#card-name').inputValue(),'이전 덱의 카드');assert.equal(await page.locator('#save-state').innerText(),'미저장');assert.deepEqual(pageErrors,[]);
 }finally{await browser.close();}
});
test('new decks and concurrent tabs keep independent temporary work',async()=>{
 const {browser,page,context,pageErrors}=await openApp();try{page.setDefaultTimeout(12_000);await edit(page,'첫 번째 덱');await saved(page);await saveProject(page,'first-tab-before-new.json');await page.getByRole('button',{name:'새 덱',exact:true}).click();await edit(page,'두 번째 덱');await saved(page);
  const other=await context.newPage();other.setDefaultTimeout(12_000);await other.goto(page.url());await other.waitForSelector('[data-ready="true"]');await edit(other,'다른 창의 덱');await saved(other);await saveProject(page,'second-tab-before-reload.json');await page.reload();await page.waitForSelector('[data-ready="true"]');await page.locator('#work-recovery').click();await page.waitForFunction(()=>document.querySelectorAll('.recovery-file').length===3,null,{timeout:12_000});
  const entries=await page.evaluate(async()=>{const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('card-print-studio-recovery',1);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});try{return await new Promise((resolve,reject)=>{const r=db.transaction('snapshots').objectStore('snapshots').getAll();r.onsuccess=()=>resolve(r.result.map(s=>JSON.parse(s.text).cards[0].name));r.onerror=()=>reject(r.error);});}finally{db.close();}});assert.deepEqual(entries.sort(),['첫 번째 덱','두 번째 덱','다른 창의 덱'].sort());assert.deepEqual(pageErrors,[]);
 }finally{await browser.close();}
});
