import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {openApp,qa} from './helpers/browser.mjs';
import {saveProject} from './helpers/flows.mjs';
import {exportCardFile} from '../src/model/card-file.js';

async function prepare(page,{unsupported=false,denied=false}={}){
 page.setDefaultTimeout(10_000);
 await page.addInitScript(({unsupported,denied})=>{
  window.__folderPickerCalls=0;
  window.showDirectoryPicker=unsupported?undefined:async()=>{
   window.__folderPickerCalls++;
   throw new DOMException(denied?'denied':'cancelled',denied?'NotAllowedError':'AbortError');
  };
 },{unsupported,denied});
 await page.reload();await page.waitForSelector('[data-ready="true"]');
}
function jsonFile(name,value){return {name,mimeType:'application/json',buffer:Buffer.from(JSON.stringify(value))};}
async function chooseFile(page,selector,file){
 const chosen=page.waitForEvent('filechooser');await page.locator(selector).click();await (await chosen).setFiles(file);
}

test('deck load selects an ordinary JSON file without opening a folder chooser',async()=>{
 const {browser,page,pageErrors}=await openApp();try{
  await prepare(page);
  const incoming=await saveProject(page,'picker-deck-before.json');incoming.name='파일에서 고른 덱';incoming.cards[0].name='직접 불러온 카드';
  await page.getByRole('button',{name:'프로젝트 불러오기',exact:true}).click();
  await page.locator('#workspace-library').waitFor();assert.equal(await page.evaluate(()=>window.__folderPickerCalls),0);
  await page.screenshot({path:path.join(qa,'json-deck-file-choice.png'),fullPage:true});
  await chooseFile(page,'#project-import-file',jsonFile('친구가 준 덱.json',incoming));
  await page.waitForFunction(()=>document.querySelector('#deck-name').value==='파일에서 고른 덱',null,{timeout:10_000});
  assert.equal(await page.locator('#card-name').inputValue(),'직접 불러온 카드');
  assert.equal(await page.locator('#workspace-library').count(),0);assert.equal(await page.evaluate(()=>window.__folderPickerCalls),0);
  assert.deepEqual(pageErrors,[]);
 }finally{await browser.close();}
});

test('card load selects JSON directly and keeps append and undo behavior',async()=>{
 const {browser,page,pageErrors}=await openApp();try{
  await prepare(page);
  const original=await saveProject(page,'picker-card-before.json'),incoming=structuredClone(original);incoming.cards[0].name='친구가 준 한 장';
  await page.locator('#load-card').click();await page.locator('#card-library').waitFor();
  assert.equal(await page.evaluate(()=>window.__folderPickerCalls),0);
  await chooseFile(page,'#card-import-file',jsonFile('이름만 있는 카드.json',JSON.parse(exportCardFile(incoming,incoming.cards[0].id))));
  await page.waitForFunction(()=>document.querySelectorAll('.card-row').length===2,null,{timeout:10_000});
  assert.equal(await page.locator('#card-name').inputValue(),'친구가 준 한 장');
  await page.locator('#undo').click();assert.deepEqual(await saveProject(page,'picker-card-undo.json'),original);
  assert.equal(await page.evaluate(()=>window.__folderPickerCalls),0);assert.deepEqual(pageErrors,[]);
 }finally{await browser.close();}
});

test('deck file selection remains usable without folder support and preserves unsaved work on cancel',async()=>{
 const {browser,page,pageErrors}=await openApp();try{
  await prepare(page,{unsupported:true});
  const incoming=await saveProject(page,'picker-no-folder-before.json'),originalName=incoming.name;incoming.name='취소할 덱';
  await page.locator('#card-name').fill('남겨 둘 수정');await page.locator('#card-name').press('Tab');
  await page.getByRole('button',{name:'프로젝트 불러오기',exact:true}).click();
  await chooseFile(page,'#project-import-file',jsonFile('덱.json',incoming));
  await page.locator('dialog').getByRole('button',{name:'취소',exact:true}).click();
  assert.equal(await page.locator('#card-name').inputValue(),'남겨 둘 수정');
  assert.equal(await page.locator('#deck-name').inputValue(),originalName);
  await page.locator('#undo').click();assert.notEqual(await page.locator('#card-name').inputValue(),'남겨 둘 수정');assert.deepEqual(pageErrors,[]);
 }finally{await browser.close();}
});

test('cancelled or denied folder connection leaves both direct JSON choices available',async()=>{
 const {browser,page,pageErrors}=await openApp();try{
  for(const denied of [false,true]){
   await prepare(page,{denied});
   const original=await saveProject(page,'picker-folder-'+denied+'-before.json'),incoming=structuredClone(original);incoming.name='폴더 없이 연 덱';incoming.cards[0].name='폴더 없이 연 카드';
   await page.getByRole('button',{name:'프로젝트 불러오기',exact:true}).click();
   await page.locator('#project-import-folder').click();
   await page.waitForFunction(()=>window.__folderPickerCalls===1,null,{timeout:10_000});
   await chooseFile(page,'#project-import-file',jsonFile('일반 덱.json',incoming));
   await page.waitForFunction(()=>document.querySelector('#deck-name').value==='폴더 없이 연 덱',null,{timeout:10_000});
   await page.locator('#load-card').click();await page.locator('#card-import-folder').click();
   await page.waitForFunction(()=>window.__folderPickerCalls===2,null,{timeout:10_000});
   await chooseFile(page,'#card-import-file',jsonFile('일반 카드.json',JSON.parse(exportCardFile(original,original.cards[0].id))));
   await page.waitForFunction(()=>document.querySelectorAll('.card-row').length===2,null,{timeout:10_000});
   assert.equal(await page.evaluate(()=>window.__folderPickerCalls),2);
  }
  assert.deepEqual(pageErrors,[]);
 }finally{await browser.close();}
});
