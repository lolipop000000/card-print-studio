import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {openApp,qa} from './helpers/browser.mjs';
export async function saved(page,name='editor-project.json'){const pending=page.waitForEvent('download');await page.getByRole('button',{name:'프로젝트 파일 내보내기',exact:true}).click();const d=await pending;const file=path.join(qa,name);await d.saveAs(file);return JSON.parse(await readFile(file,'utf8'));}
async function fill(page,selector,value){await page.locator(selector).fill(value);await page.locator(selector).press('Tab');}
test('editor preserves manual HP while editing multiple skills and changing rank',async()=>{const {browser,page}=await openApp();try{
 await fill(page,'#card-name','눈꽃 정령');await fill(page,'#hp-reduction','25');assert.equal(await page.locator('#final-hp').innerText(),'75');
 await page.locator('#add-passive').click();await page.locator('#add-passive').click();await page.locator('#add-active').click();
 await fill(page,'#passives .skill-name >> nth=0','회복');await fill(page,'#passives .skill-effect >> nth=0','체력을 10 회복한다.');
 await fill(page,'#actives .skill-name >> nth=0','눈보라');await fill(page,'#actives .skill-effect >> nth=0','대미지 30.');
 await page.locator('#rank').selectOption('S');assert.equal(await page.locator('#base-hp').inputValue(),'100');assert.equal(await page.locator('#hp-reduction').inputValue(),'25');
 await page.locator('#apply-rank').click();assert.equal(await page.locator('#base-hp').inputValue(),'460');
 const p=await saved(page);assert.equal(p.cards[0].hpReduction,25);assert.equal(p.cards[0].passives.length,2);assert.equal(p.cards[0].actives[0].name,'눈보라');
 await page.locator('#add-item').click();await fill(page,'#card-name','작은 물약');await fill(page,'#item-effect','HP 20 회복.');
 await page.getByRole('button',{name:'공통 뒷면',exact:true}).click();await page.getByRole('button',{name:'텍스트 추가',exact:true}).click();await fill(page,'#element-content','우리의 카드게임');
 const withBack=await saved(page,'item-and-back.json');assert.equal(withBack.cards[1].effect,'HP 20 회복.');assert.equal(withBack.back.elements[0].content,'우리의 카드게임');
 await page.screenshot({path:path.join(qa,'card-editor.png'),fullPage:true});
 }finally{await browser.close();}});
test('failed import keeps current unsaved card and free layout drag can be undone',async()=>{const {browser,page}=await openApp();try{
 await fill(page,'#card-name','보존할 카드');const beforeDirty=await page.locator('#save-state').innerText();
 await page.locator('#project-file').setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({format:'card-print-studio',version:1}))});
 await page.locator('#message').waitFor({state:'visible'});assert.equal(await page.locator('#card-name').inputValue(),'보존할 카드');assert.equal(await page.locator('#save-state').innerText(),beforeDirty);
 const canvas=page.locator('#card-canvas');const box=await canvas.boundingBox();const x=box.x+box.width*8/63,y=box.y+box.height*7/88;
 await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+15,y+15,{steps:4});await page.mouse.up();
 const dragged=await saved(page,'dragged.json');assert.ok(dragged.cards[0].elements.find(e=>e.binding?.field==='name').rect.x>4);
 await page.getByRole('button',{name:'실행 취소',exact:true}).click();const undone=await saved(page,'undone.json');assert.equal(undone.cards[0].elements.find(e=>e.binding?.field==='name').rect.x,4);
 const damaged=structuredClone(undone);damaged.assets.damaged={id:'damaged',mime:'image/png',dataUrl:'data:image/png;base64,YmFk',width:1,height:1,paintingId:null};damaged.cards[0].artAssetId='damaged';
 await fill(page,'#card-name','디코딩 실패 후에도 보존');
 await page.locator('#project-file').setInputFiles({name:'damaged.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(damaged))});
 await page.locator('#message').waitFor({state:'visible'});assert.equal(await page.locator('#card-name').inputValue(),'디코딩 실패 후에도 보존');assert.equal(await page.locator('#save-state').innerText(),'미저장');
 }finally{await browser.close();}});
test('deck size and font settings remain open while edited and resize the common back',async()=>{const {browser,page}=await openApp();try{
 await page.locator('#back-tab').click();await page.getByRole('button',{name:'텍스트 추가',exact:true}).click();
 await page.locator('.settings summary').click();await fill(page,'#setting-minFontPt','8');
 assert.equal(await page.locator('.settings').evaluate(e=>e.open),true);
 await fill(page,'#setting-maxWidthMm','60');await page.getByRole('button',{name:'함께 줄이기',exact:true}).click();
 const p=await saved(page,'resized-deck.json');assert.equal(p.settings.cardWidthMm,60);assert.equal(p.settings.maxWidthMm,60);
 assert.ok(Math.abs(p.back.elements[0].rect.x-4*60/63)<1e-9);assert.ok(p.cards[0].elements.filter(e=>e.style.fontPt).every(e=>e.style.fontPt>=8));
 assert.equal(await page.locator('.settings').evaluate(e=>e.open),true);
 }finally{await browser.close();}});

test('regression: Korean IME composition keeps one syllable and one undo action in effect fields',async()=>{const {browser,page}=await openApp();try{
 const cdp=await page.context().newCDPSession(page);
 async function compose(selector){const input=page.locator(selector);await input.focus();const original=await input.elementHandle();for(const text of ['ㅎ','하','한'])await cdp.send('Input.imeSetComposition',{text,selectionStart:text.length,selectionEnd:text.length});assert.equal(await input.inputValue(),'한');assert.equal(await original.evaluate(e=>e.isConnected),true,'An active composition must keep its input node');await cdp.send('Input.insertText',{text:'한'});await input.press('Tab');}
 await page.locator('#add-item').click();await compose('#item-effect');const item=await saved(page,'ime-item.json');assert.equal(item.cards[1].effect,'한');await page.locator('#undo').click();assert.equal(await page.locator('#item-effect').inputValue(),'');await page.locator('#redo').click();
 await page.locator('.card-select').first().click();await page.locator('#add-active').click();await compose('#actives .skill-effect');const skills=await saved(page,'ime-skills.json');assert.equal(skills.cards[0].actives[0].effect,'한');await page.locator('#undo').click();assert.equal(await page.locator('#actives .skill-effect').inputValue(),'');await page.locator('#redo').click();assert.equal(await page.locator('#actives .skill-effect').inputValue(),'한');
 }finally{await browser.close();}});
