import test from 'node:test';
import assert from 'node:assert/strict';
import {openApp} from './helpers/browser.mjs';
import {saveProject} from './helpers/flows.mjs';

async function setup(){
 const s=await openApp();await s.page.evaluate(()=>{window.nativePrintCalls=0;window.nativePrintHtml=[];new MutationObserver(records=>{for(const record of records)for(const frame of record.addedNodes)if(frame.tagName==='IFRAME'&&frame.hasAttribute('data-card-print'))frame.contentWindow.print=()=>{window.nativePrintCalls++;window.nativePrintHtml.push(frame.contentDocument.documentElement.outerHTML);frame.contentWindow.dispatchEvent(new Event('afterprint'));};}).observe(document.body,{childList:true});});return s;
}
test('the direct-print button and Ctrl+P print card pages without downloading or editing the project',async()=>{
 const s=await setup();try{const {page}=s;let downloads=0;page.on('download',()=>downloads++);await page.locator('#print-direct').waitFor({timeout:3000});const before=await saveProject(page,'native-app-before.json');downloads=0;
  await page.locator('#print-direct').click();await page.waitForFunction(()=>window.nativePrintCalls===1);await page.waitForFunction(()=>!document.getElementById('print-direct').disabled);assert.equal(downloads,0);assert.match(await page.locator('#message').textContent(),/100%/);
  const html=await page.evaluate(()=>window.nativePrintHtml[0]);assert.match(html,/print-sheet/);assert.doesNotMatch(html,/card-list|topbar|inspector/);assert.equal(await page.locator('iframe[data-card-print]').count(),0);assert.equal(await page.locator('#undo').isDisabled(),true);
  await page.locator('#deck-name').focus();await page.keyboard.press('Control+p');await page.waitForFunction(()=>window.nativePrintCalls===2);assert.equal(downloads,0);assert.deepEqual(await saveProject(page,'native-app-after.json'),before);assert.deepEqual(s.pageErrors,[]);assert.deepEqual(s.httpRequests,[]);
 }finally{await s.browser.close();}
});
test('direct printing retains overflow diagnostics and prints the visible card without changing it',async()=>{
 const s=await setup();try{const {page}=s;await page.locator('#print-direct').waitFor({timeout:3000});await page.locator('#add-passive').click();const effect=page.locator('textarea[id$="-effect"]').first();await effect.fill('지나치게 긴 설명 '.repeat(200));await effect.press('Tab');
  const before=await saveProject(page,'native-overflow-before.json');assert.match(await page.locator('#card-warnings').textContent(),/새 패시브.*효과: 영역.*아래쪽 [0-9.]+ mm 벗어납니다/);let downloads=0;page.on('download',()=>downloads++);
  await page.locator('#print-direct').click();await page.waitForFunction(()=>window.nativePrintCalls===1);await page.waitForFunction(()=>!document.getElementById('print-direct').disabled);assert.equal(downloads,0);assert.equal(await page.locator('iframe[data-card-print]').count(),0);assert.match(await page.locator('#message').textContent(),/100%/);assert.match(await page.locator('#card-warnings').textContent(),/새 패시브.*효과: 영역.*아래쪽 [0-9.]+ mm 벗어납니다/);assert.deepEqual(await saveProject(page,'native-overflow-after.json'),before);assert.deepEqual(s.pageErrors,[]);assert.deepEqual(s.httpRequests,[]);
 }finally{await s.browser.close();}
});

 test('Ctrl+P commits focused quantity and deck-name inputs before taking the print snapshot',async()=>{
 const s=await setup();try{const {page}=s;await page.locator('#card-quantity').fill('10');await page.keyboard.press('Control+p');await page.waitForFunction(()=>window.nativePrintCalls===1);await page.waitForFunction(()=>!document.getElementById('print-direct').disabled);
 const cells=await page.evaluate(()=>{const d=new DOMParser().parseFromString(window.nativePrintHtml[0],'text/html');return [...d.querySelectorAll('.print-sheet')].map(s=>s.querySelectorAll('img').length);});assert.deepEqual(cells,[9,1]);
 await page.locator('#deck-name').fill('입력 직후 인쇄');await page.keyboard.press('Control+p');await page.waitForFunction(()=>window.nativePrintCalls===2);assert.match(await page.evaluate(()=>window.nativePrintHtml[1]),/<title>입력 직후 인쇄<\/title>/);assert.equal((await saveProject(page,'native-app-committed.json')).cards[0].quantity,10);assert.deepEqual(s.pageErrors,[]);assert.deepEqual(s.httpRequests,[]);
 }finally{await s.browser.close();}
});
