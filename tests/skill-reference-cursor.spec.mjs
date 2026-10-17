import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {openApp,qa} from './helpers/browser.mjs';

async function openCursorApp(){
 const app=await openApp();
 if(process.env.CARD_CURSOR_APP){await app.page.goto(pathToFileURL(path.resolve(process.env.CARD_CURSOR_APP)).href);await app.page.waitForSelector('[data-ready="true"]');}
 return app;
}
async function fill(page,selector,value){await page.locator(selector).fill(value);await page.locator(selector).press('Tab');}
async function fixture(page){
 await page.locator('#add-passive').click();await fill(page,'#passives .skill-name','강타');
 await page.locator('#add-active').click();await fill(page,'#actives .skill-name','연계');
 await page.locator('#actives .skill-effect').fill('AA old ZZ');
 await page.locator('#actives .skill-effect').press('Tab');
}
async function selectWord(input){
 await input.focus();await input.press('Control+Home');
 for(let i=0;i<3;i++)await input.press('ArrowRight');
 for(let i=0;i<3;i++)await input.press('Shift+ArrowRight');
}
const choose=page=>page.locator('#actives .skill-reference-picker').selectOption({label:'패시브 1 · 강타'});

test('description reference replaces the keyboard-selected range after another field rerenders the inspector',async()=>{
 const {browser,page,pageErrors}=await openCursorApp();try{
 await fixture(page);const input=page.locator('#actives .skill-effect');
 await selectWord(input);
 assert.deepEqual(await input.evaluate(el=>[el.selectionStart,el.selectionEnd]),[3,6]);
 await fill(page,'#card-name','커서 보존');
 await choose(page);await page.locator('#actives .skill-reference-insert').click();
 assert.equal(await input.inputValue(),'AA 강타 ZZ','A rerender must keep the authored insertion range, rather than silently append');
 assert.deepEqual(await input.evaluate(el=>[el.selectionStart,el.selectionEnd,document.activeElement===el]),[5,5,true]);
 await page.screenshot({path:path.join(qa,'cursor-range.png'),fullPage:true});assert.deepEqual(pageErrors,[]);
 }finally{await browser.close();}
});

test('description typing preserves the selected reference and returns focus for consecutive insertions',async()=>{
 const {browser,page,pageErrors}=await openCursorApp();try{
 await fixture(page);await choose(page);const input=page.locator('#actives .skill-effect');
 await input.focus();await input.press('Control+Home');await page.keyboard.insertText('X ');
 const picker=page.locator('#actives .skill-reference-picker');
 assert.notEqual(await picker.inputValue(),'','Typing must not reset the reference picker');
 await input.press('Tab');await page.locator('#actives .skill-reference-insert').click();
 assert.equal(await input.inputValue(),'X 강타AA old ZZ');
 assert.deepEqual(await input.evaluate(el=>[el.selectionStart,el.selectionEnd,document.activeElement===el]),[4,4,true]);
 await page.locator('#actives .skill-reference-insert').click();
 assert.equal(await input.inputValue(),'X 강타강타AA old ZZ');
 assert.deepEqual(await input.evaluate(el=>[el.selectionStart,el.selectionEnd,document.activeElement===el]),[6,6,true]);
 assert.deepEqual(pageErrors,[]);
 }finally{await browser.close();}
});

test('mouse caret and reference choice stay local to each skill and invalidate offsets after undo',async()=>{
 const {browser,page,pageErrors}=await openCursorApp();try{
 await fixture(page);const first=page.locator('#actives .skill-effect').first();
 const position=await first.evaluate(el=>{const style=getComputedStyle(el),ctx=document.createElement('canvas').getContext('2d');ctx.font=style.font;return {x:parseFloat(style.paddingLeft)+ctx.measureText('AA ').width+1,y:parseFloat(style.paddingTop)+parseFloat(style.fontSize)/2};});
 await first.click({position});
 assert.equal(await first.evaluate(el=>el.selectionStart),3,'Mouse click chooses a real position in the description');
 await choose(page);await page.locator('#add-active').click();
 assert.equal(await page.locator('#actives .skill-reference-picker').nth(1).inputValue(),'','A new skill has its own reference choice');
 await page.locator('#actives .skill-effect').nth(1).fill('short');
 await page.locator('#actives .skill-reference-insert').first().click();
 assert.equal(await first.inputValue(),'AA 강타old ZZ');
 assert.equal(await page.locator('#actives .skill-effect').nth(1).inputValue(),'short');
 await page.locator('#undo').click();
 assert.equal(await first.inputValue(),'AA old ZZ');
 assert.equal(await first.evaluate(el=>el.selectionStart),9,'Undo changes the text snapshot so an insertion cannot reuse offsets from the replaced text');
 await first.focus();await first.press('Control+Home');await page.locator('#actives .skill-reference-insert').first().click();
 assert.equal(await first.inputValue(),'강타AA old ZZ');
 await page.locator('#add-monster').click();
 await page.locator('#add-passive').click();await page.locator('#add-active').click();
 assert.equal(await page.locator('#actives .skill-reference-picker').inputValue(),'','Another card does not inherit the previous card\'s reference choice');
 assert.deepEqual(await page.locator('#actives .skill-effect').evaluate(el=>[el.selectionStart,el.selectionEnd]),[0,0]);
 assert.deepEqual(pageErrors,[]);
 }finally{await browser.close();}
});
