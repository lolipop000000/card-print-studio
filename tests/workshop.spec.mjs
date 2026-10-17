import test from 'node:test';
import assert from 'node:assert/strict';
import {openApp,qa} from './helpers/browser.mjs';
import {saveProject,downloadClick} from './helpers/flows.mjs';
import path from 'node:path';
const fill=async(page,selector,value)=>{await page.locator(selector).fill(value);await page.locator(selector).press('Tab');};

test('keyword authoring, both display styles, rename, save, reopen, delete and undo work offline',async()=>{
 const {browser,page,httpRequests,pageErrors}=await openApp();try{
 await page.locator('#keyword-manager').click({timeout:5000});
 await page.locator('#keyword-add').click();
 await fill(page,'#keyword-name','비');
 await page.locator('#keyword-description').fill('비의 규칙은 사용자가 직접 정한다.');
 await fill(page,'#keyword-color','#e02030');
 const icon=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=8;c.height=8;const x=c.getContext('2d');x.fillStyle='#c000d0';x.fillRect(2,2,4,4);return c.toDataURL();});
 await page.locator('#keyword-icon-file').setInputFiles({name:'my-icon.png',mimeType:'image/png',buffer:Buffer.from(icon.split(',')[1],'base64')});
 await page.locator('#keyword-icon-preview').waitFor();
 await page.locator('#keyword-close').click();
 await page.locator('#add-passive').click();
 await page.locator('#passives .skill-effect').fill('시작에 비 2를 얻는다.');
 const picker=page.locator('#passives .skill-keyword-picker');await picker.selectOption({label:'비'});
 await page.locator('#passives .keyword-add-badge').click();
 await page.locator('#passives .keyword-display').selectOption('both');
 await page.locator('#actives').count();
 await page.locator('#card-quantity').fill('10');await page.locator('#card-quantity').press('Tab');
 const saved=await saveProject(page,'workshop-keywords.json');
 assert.equal(saved.keywords.length,1);assert.equal(saved.keywords[0].name,'비');
 assert.equal(saved.assets[saved.keywords[0].iconAssetId].width,8,'External icons preserve transparent padding');
 assert.deepEqual(saved.cards[0].passives[0].keywords,[{keywordId:saved.keywords[0].id,display:'both'}]);
 assert.equal(saved.cards[0].hpReduction,0);
 await page.locator('#duplicate-card').click();
 await page.locator('#keyword-manager').click();await fill(page,'#keyword-name','빗방울');await page.locator('#keyword-close').click();
 const renamed=await saveProject(page,'workshop-renamed.json');
 assert.ok(renamed.cards.every(c=>c.passives[0].effect==='시작에 빗방울 2를 얻는다.'));
 assert.ok(renamed.cards.every(c=>c.passives[0].keywords[0].keywordId===saved.keywords[0].id));
 await page.locator('#undo').click();
 assert.equal(await page.locator('#passives .skill-effect').inputValue(),'시작에 비 2를 얻는다.');
 await page.locator('#redo').click();
 const wait=page.waitForEvent('download',{timeout:10000});await page.locator('#export-pdf').click();const pdf=await wait;await pdf.saveAs(path.join(qa,'workshop-keywords.pdf'));
 await page.screenshot({path:path.join(qa,'workshop-editor.png'),fullPage:true});
 const fresh=await openApp();try{
  await fresh.page.locator('#project-file').setInputFiles(path.join(qa,'workshop-renamed.json'));
  await fresh.page.locator('#message[data-kind="success"]').waitFor();
  await fresh.page.locator('#keyword-manager').click();
  assert.equal(await fresh.page.locator('#keyword-name').inputValue(),'빗방울');
  assert.equal(await fresh.page.locator('#keyword-description').inputValue(),'비의 규칙은 사용자가 직접 정한다.');
  await fresh.page.locator('#keyword-icon-preview').waitFor();
  await fresh.page.locator('#keyword-delete').click();
  await fresh.page.getByRole('button',{name:'키워드 삭제',exact:true}).click();
  await fresh.page.locator('#keyword-close').click();
  const removed=await saveProject(fresh.page,'workshop-removed.json');
  assert.equal(removed.keywords.length,0);assert.ok(removed.cards.every(c=>c.passives[0].keywords.length===0));
  assert.ok(removed.cards.every(c=>c.passives[0].effect==='시작에 빗방울 2를 얻는다.'));
  await fresh.page.locator('#undo').click();
  const restored=await saveProject(fresh.page,'workshop-restored.json');
  assert.equal(restored.keywords.length,1);assert.ok(restored.cards.every(c=>c.passives[0].keywords[0].display==='both'));
 }finally{await fresh.browser.close();}
 assert.deepEqual(httpRequests,[]);assert.deepEqual(pageErrors,[]);
 }finally{await browser.close();}
});
