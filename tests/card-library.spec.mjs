import test from 'node:test';
import assert from 'node:assert/strict';
import {openApp} from './helpers/browser.mjs';
import {saveProject} from './helpers/flows.mjs';
import {createProject,createCard} from '../src/model/project.js';
import {applyTemplate} from '../src/render/templates.js';

function fixture(){
 const project=createProject();project.name='목록 편의 기능';project.cards=[];
 const add=(kind,id,name,extra={})=>{const card=Object.assign(createCard(kind,project),{id,name},extra);project.cards.push(applyTemplate(card,project.settings,kind==='monster'?'monster-standard':'item'));};
 add('monster','library-river','물의 수호자',{attribute:'water',attributes:['water','fire'],rank:'A',quantity:2});
 add('monster','library-cat','흰 고양이',{quantity:3});
 add('item','library-candle','속성 없는 양초',{quantity:4});
 add('item','library-neutral','무속성 양초',{attributes:['neutral'],quantity:5});
 add('item','library-potion','WATER Potion',{attributes:['water','light'],quantity:6});
 return project;
}
async function loadFixture(page,project=fixture()){
 page.setDefaultTimeout(12000);page.setDefaultNavigationTimeout(12000);
 await page.locator('#project-file').setInputFiles({name:'library.card-project.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(project))});
 await page.waitForFunction(name=>document.getElementById('deck-name').value===name,project.name);
 await page.locator('#card-search').waitFor({timeout:5000});
}
const rowIds=page=>page.locator('.card-row').evaluateAll(rows=>rows.map(row=>row.dataset.cardId));
const row=(page,id)=>page.locator('.card-row[data-card-id="'+id+'"]');

test('library filters preserve editor selection, project data, and print totals',async()=>{
 const {browser,page,pageErrors}=await openApp();try{
  await loadFixture(page);const before=await saveProject(page,'library-before.json');
  await page.locator('#card-search').fill('양초');assert.deepEqual(await rowIds(page),['library-candle','library-neutral']);
  assert.equal(await page.locator('#card-name').inputValue(),'물의 수호자');assert.equal(await page.locator('#card-count').innerText(),'5종 · 20장');
  await page.locator('#card-search').fill('');await page.locator('#card-filter-attribute').selectOption('fire');assert.deepEqual(await rowIds(page),['library-river']);
  await page.locator('#card-filter-attribute').selectOption('neutral');assert.deepEqual(await rowIds(page),['library-cat','library-neutral']);
  await page.locator('#card-filter-attribute').selectOption('none');assert.deepEqual(await rowIds(page),['library-candle']);
  await page.locator('#card-reset-filters').click();await page.locator('#card-filter-rank').selectOption('A');assert.deepEqual(await rowIds(page),['library-river']);
  await page.locator('#card-filter-kind').selectOption('item');assert.equal(await page.locator('.card-row').count(),0);assert.equal(await page.locator('.card-library-empty').count(),1);
  assert.deepEqual(await saveProject(page,'library-after-filters.json'),before);assert.equal(await page.locator('#save-state').innerText(),'저장됨');assert.deepEqual(pageErrors,[]);
 }finally{await browser.close();}
});

test('Korean composition keeps the search input mounted and commits after composition ends',async()=>{
 const {browser,page,pageErrors}=await openApp();try{
  await loadFixture(page);await page.locator('#card-search').focus();
  const during=await page.evaluate(()=>{
   const input=document.getElementById('card-search');window.__librarySearchInput=input;input.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}));
   input.value='물';input.dispatchEvent(new InputEvent('input',{bubbles:true,isComposing:true}));return document.querySelectorAll('.card-row').length;
  });assert.equal(during,5);
  await page.evaluate(()=>{const input=window.__librarySearchInput;input.value='물의';input.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true,data:'의'}));input.dispatchEvent(new InputEvent('input',{bubbles:true}));});
  assert.deepEqual(await rowIds(page),['library-river']);assert.equal(await page.evaluate(()=>document.getElementById('card-search')===window.__librarySearchInput&&document.activeElement===window.__librarySearchInput),true);
  assert.deepEqual(pageErrors,[]);
 }finally{await browser.close();}
});

test('batch checkboxes remain separate from the editor and apply quantities in one undo step',async()=>{
 const {browser,page,pageErrors}=await openApp();try{
  await loadFixture(page);const before=await saveProject(page,'library-batch-before.json');
  await row(page,'library-river').locator('.card-batch-select').check();await row(page,'library-candle').locator('.card-batch-select').check();
  assert.equal(await page.locator('#card-name').inputValue(),'물의 수호자');await row(page,'library-cat').locator('.card-select').click();
  assert.equal(await page.locator('#card-name').inputValue(),'흰 고양이');assert.equal(await page.locator('.card-batch-select:checked').count(),2);
  await page.locator('#card-bulk-quantity').fill('8');await page.locator('#card-apply-quantity').click();
  let result=await saveProject(page,'library-batch-after.json');assert.deepEqual(result.cards.map(card=>card.quantity),[8,3,8,5,6]);
  await page.locator('#undo').click();assert.deepEqual(await saveProject(page,'library-batch-undo.json'),before);assert.equal(await page.locator('#undo').isDisabled(),true);
  await page.locator('#redo').click();result=await saveProject(page,'library-batch-redo.json');assert.deepEqual(result.cards.map(card=>card.quantity),[8,3,8,5,6]);assert.deepEqual(pageErrors,[]);
 }finally{await browser.close();}
});

test('filter changes remove hidden batch selections and invalid quantities never edit the deck',async()=>{
 const {browser,page,pageErrors}=await openApp();try{
  await loadFixture(page);await row(page,'library-river').locator('.card-batch-select').check();
  await page.locator('#card-filter-kind').selectOption('item');assert.equal(await page.locator('#card-apply-quantity').isDisabled(),true);
  await page.locator('#card-select-visible').click();assert.equal(await page.locator('.card-batch-select:checked').count(),3);
  const before=await saveProject(page,'library-invalid-before.json');
  for(const value of ['0','2.5','']){await page.locator('#card-bulk-quantity').fill(value);await page.locator('#card-apply-quantity').click();assert.deepEqual(await saveProject(page,'library-invalid-after.json'),before);}
  await page.locator('#card-bulk-quantity').fill('9');await page.locator('#card-apply-quantity').click();assert.deepEqual((await saveProject(page,'library-visible-quantity.json')).cards.map(card=>card.quantity),[2,3,9,9,9]);
  await page.locator('#card-reset-filters').click();assert.equal(await row(page,'library-river').locator('.card-batch-select').isChecked(),false);
  await page.locator('#card-clear-selection').click();assert.equal(await page.locator('.card-batch-select:checked').count(),0);assert.deepEqual(pageErrors,[]);
 }finally{await browser.close();}
});

test('shift selection and deletion prune the batch, and another deck starts with clear filters',async()=>{
 const {browser,page,pageErrors}=await openApp();try{
  await loadFixture(page);await row(page,'library-cat').locator('.card-batch-select').check();await row(page,'library-neutral').locator('.card-batch-select').click({modifiers:['Shift']});
  assert.equal(await page.locator('.card-batch-select:checked').count(),3);await row(page,'library-candle').locator('.card-select').click();await page.locator('#delete-card').click();
  assert.equal(await page.locator('.card-batch-select:checked').count(),2);await page.locator('#card-filter-kind').selectOption('item');
  await saveProject(page,'library-before-replacement.json');const replacement=fixture();replacement.name='새로 불러온 목록';await loadFixture(page,replacement);
  assert.equal(await page.locator('#card-filter-kind').inputValue(),'');assert.equal(await page.locator('.card-row').count(),5);assert.equal(await page.locator('.card-batch-select:checked').count(),0);assert.deepEqual(pageErrors,[]);
 }finally{await browser.close();}
});
