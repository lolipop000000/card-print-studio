import test from 'node:test';
import assert from 'node:assert/strict';
import {openApp} from './helpers/browser.mjs';
import {openPainter,drawStroke} from './helpers/flows.mjs';
test('native painting dialog close releases the reopen guard',async()=>{
 const {browser,page,pageErrors}=await openApp();try{
 await openPainter(page);await page.locator('#painting-editor').evaluate(d=>d.close());await page.waitForTimeout(100);
 await openPainter(page);assert.equal(await page.locator('#painting-editor[open]').count(),1);assert.deepEqual(pageErrors,[]);
 }finally{await browser.close();}
});
test('Escape and continue keep painted pixels; unexpected native close also protects dirty art',async()=>{
 const {browser,page,pageErrors}=await openApp();try{
 await openPainter(page);await drawStroke(page);const pixels=await page.locator('#paint-canvas').evaluate(c=>c.toDataURL());
 await page.keyboard.press('Escape');await page.getByRole('button',{name:'계속 그리기',exact:true}).waitFor();
 await page.locator('#painting-editor').evaluate(d=>d.close());await page.waitForTimeout(100);
 const reachable=await page.getByRole('button',{name:'계속 그리기',exact:true}).evaluate(b=>{const r=b.getBoundingClientRect();return b.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));});
 assert.equal(reachable,true,'Native close must leave the pending confirmation accessible');
 await page.getByRole('button',{name:'계속 그리기',exact:true}).click();
 assert.equal(await page.locator('#paint-canvas').evaluate(c=>c.toDataURL()),pixels);
 await page.keyboard.press('Escape');await page.locator('.confirm-dialog[open]').waitFor();await page.keyboard.press('Escape');assert.equal(await page.locator('#painting-editor[open]').count(),1);
 await page.locator('#painting-editor').evaluate(d=>d.close());await page.getByRole('button',{name:'계속 그리기',exact:true}).waitFor({timeout:3000});await page.getByRole('button',{name:'계속 그리기',exact:true}).click();
 assert.equal(await page.locator('#paint-canvas').evaluate(c=>c.toDataURL()),pixels);
 await page.locator('#paint-apply').click();await page.locator('#painting-editor').waitFor({state:'detached'});await openPainter(page);
 assert.deepEqual(pageErrors,[]);
 }finally{await browser.close();}
});
