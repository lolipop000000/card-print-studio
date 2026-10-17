import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {readFile} from 'node:fs/promises';
import {openApp,qa} from './helpers/browser.mjs';
async function save(page,file){const wait=page.waitForEvent('download');await page.getByRole('button',{name:'프로젝트 파일 내보내기',exact:true}).click();const d=await wait;const target=path.join(qa,file);await d.saveAs(target);return JSON.parse(await readFile(target));}
test('paper view shows physical dimensions, duplex pages and screen-only ruler calibration',async()=>{const {browser,page}=await openApp();try{
 await page.locator('#card-quantity').fill('10');await page.locator('#card-quantity').press('Tab');await page.locator('#paper-tab').click();
 await page.locator('#print-duplex').check();await page.locator('.paper-sheet').nth(3).waitFor();assert.equal(await page.locator('.paper-sheet').count(),4);
 assert.equal(await page.locator('.paper-sheet').first().getAttribute('data-width-mm'),'210');assert.equal(await page.locator('.paper-sheet').first().getAttribute('data-height-mm'),'297');
 assert.equal(await page.locator('.paper-sheet').last().locator('[data-card-id]').count(),1);
 assert.match(await page.locator('#paper-summary').innerText(),/3 × 3.*9/);
 const before=await save(page,'paper-before-calibration.json');
 await page.locator('#paper-calibration').click();await page.locator('#ruler-measured').fill('80');await page.locator('#apply-calibration').click();
 const after=await save(page,'paper-after-calibration.json');assert.deepEqual(after,before);
 await page.locator('#paper-zoom').fill('75');await page.locator('#paper-zoom').press('Tab');
 assert.match(await page.locator('#paper-scale-label').innerText(),/75/);
 await page.screenshot({path:path.join(qa,'paper-preview.png'),fullPage:true});
 await page.locator('#print-orientation').selectOption('landscape');await page.waitForFunction(()=>document.querySelector('.paper-sheet')?.dataset.widthMm==='297');
 assert.equal(await page.locator('.paper-sheet').first().getAttribute('data-width-mm'),'297');
 }finally{await browser.close();}});
