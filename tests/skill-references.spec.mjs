import test from 'node:test';
import assert from 'node:assert/strict';
import {openApp,openHarness,qa} from './helpers/browser.mjs';
import {saveProject} from './helpers/flows.mjs';
import path from 'node:path';
const fill=async(page,selector,value)=>{await page.locator(selector).fill(value);await page.locator(selector).press('Tab');};
async function skills(page){await page.locator('#add-passive').click();await fill(page,'#passives .skill-name','강타');await page.locator('#add-active').click();await fill(page,'#actives .skill-name','연계');await page.locator('#actives .skill-effect').fill('다시  발동');}
async function insert(page){const input=page.locator('#actives .skill-effect');await input.evaluate(el=>{el.focus();el.setSelectionRange(3,3);});assert.equal(await page.locator('#actives .skill-reference-picker').count(),1,'Each skill can insert a readable current-card skill reference');await page.locator('#actives .skill-reference-picker').selectOption({label:'패시브 1 · 강타'});await page.locator('#actives .skill-reference-insert').click();}

test('skill reference insertion rename editing save reload duplicate and undo stay readable',async()=>{
 const {browser,page,pageErrors,httpRequests}=await openApp();try{
 await skills(page);await insert(page);assert.equal(await page.locator('#actives .skill-effect').inputValue(),'다시 강타 발동');
 await fill(page,'#passives .skill-name','폭풍 강타🙂');await page.waitForFunction(()=>document.querySelector('#actives .skill-effect').value==='다시 폭풍 강타🙂 발동');
 const saved=await saveProject(page,'skill-references.json');assert.equal(saved.cards[0].actives[0].effect,'다시 강타 발동');assert.equal(saved.cards[0].actives[0].skillReferences[0].skillId,saved.cards[0].passives[0].id);
 const input=page.locator('#actives .skill-effect');await input.evaluate(el=>{el.focus();el.setSelectionRange(0,0);});await page.keyboard.insertText('즉시 ');
 let p=await saveProject(page,'skill-references-edited.json');assert.equal(p.cards[0].actives[0].effect,'즉시 다시 폭풍 강타🙂 발동');assert.deepEqual(p.cards[0].actives[0].skillReferences.map(r=>[r.start,r.end]),[[6,13]]);
 await page.locator('#duplicate-card').click();p=await saveProject(page,'skill-references-duplicate.json');const copied=p.cards[1];assert.equal(copied.actives[0].skillReferences[0].skillId,copied.passives[0].id);assert.notEqual(copied.actives[0].skillReferences[0].id,p.cards[0].actives[0].skillReferences[0].id);
 await page.locator('#undo').click();p=await saveProject(page,'skill-references-undone.json');assert.equal(p.cards.length,1);
 await input.evaluate(el=>{el.focus();el.setSelectionRange(6,13);});await page.keyboard.insertText('일반 문장');p=await saveProject(page,'skill-references-unlinked.json');assert.equal(p.cards[0].actives[0].skillReferences.length,0);
 const fresh=await openApp();try{await fresh.page.locator('#project-file').setInputFiles(path.join(qa,'skill-references.json'));await fresh.page.locator('#message[data-kind="success"]').waitFor();assert.equal(await fresh.page.locator('#actives .skill-effect').inputValue(),'다시 폭풍 강타🙂 발동');}finally{await fresh.browser.close();}
 assert.deepEqual(pageErrors,[]);assert.deepEqual(httpRequests,[]);
 }finally{await browser.close();}
});

test('skill deletion keeps the displayed reference name and warns while remaining saveable',async()=>{
 const {browser,page}=await openApp();try{
 await skills(page);await insert(page);await fill(page,'#passives .skill-name','번개 강타');await page.locator('#passives button[aria-label="기술 삭제"]').click();
 assert.equal(await page.locator('#actives .skill-effect').inputValue(),'다시 번개 강타 발동');
 const p=await saveProject(page,'skill-references-missing.json');assert.equal(p.cards[0].actives[0].effect,'다시 번개 강타 발동');assert.match(await page.locator('#card-warnings').innerText(),/참조.*스킬|스킬.*참조/);
 await page.locator('#undo').click();assert.equal(await page.locator('#passives .skill-name').inputValue(),'번개 강타');
 }finally{await browser.close();}
});

test('skill references share measured styling and keyword precedence with print rendering',async()=>{
 const {browser,page}=await openHarness();try{
 const result=await page.evaluate(async()=>{const a=window.testApi;await a.ensureFont();const p=a.createProject(),c=p.cards[0];p.keywords=[{id:'kw',name:'강타',description:'',color:'#ee3344',iconAssetId:null}];c.passives=[{id:'target',name:'길어진 폭풍 강타🙂',effect:'',dice:null,keywords:[]}];c.actives=[{id:'owner',name:'연계',effect:'강타 후 강타',dice:null,keywords:[{keywordId:'kw',display:'inline'}],skillReferences:[{id:'ref',skillId:'target',start:0,end:2}]}];p.cards[0]=a.applyTemplate(c,p.settings,'monster-standard',p.keywords);const card=p.cards[0],e=card.elements.find(e=>e.binding?.field==='skill.effect'&&e.binding.skillId==='owner'),value=a.resolveElement(p,card,e);const canvas=document.createElement('canvas');document.body.append(canvas);const report=a.renderCard(canvas.getContext('2d'),p,card,new Map(),300),problems=await a.preflightProject(p,new Map()),pixels=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;let blue=0,red=0;for(let i=0;i<pixels.length;i+=4){if(pixels[i+2]>pixels[i]*1.4&&pixels[i+2]>pixels[i+1]*1.05)blue++;if(pixels[i]>pixels[i+1]*1.7&&pixels[i]>pixels[i+2]*1.3)red++;}const pdf=await a.createPdf(p);return {value,report,problems,blue,red,pdfLength:pdf.length};});
 assert.equal(result.value,'길어진 폭풍 강타🙂 후 강타');assert.deepEqual(result.report.problems,[]);assert.deepEqual(result.problems,[]);assert.ok(result.blue>30,'Explicit skill reference uses its accent color');assert.ok(result.red>5,'Plain text keeps the selected keyword color');assert.ok(result.pdfLength>1000);
 await page.screenshot({path:path.join(qa,'skill-reference-render.png'),fullPage:true});
 }finally{await browser.close();}
});


test('Korean composition keeps references until a committed edit intersects the displayed name',async()=>{
 const {browser,page,pageErrors}=await openApp();try{
 await skills(page);await insert(page);
 const input=page.locator('#actives .skill-effect');
 const composing=await input.evaluate(el=>{el.focus();el.setSelectionRange(0,0);el.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}));el.value='ㅎ'+el.value;el.dispatchEvent(new InputEvent('input',{bubbles:true,isComposing:true,inputType:'insertCompositionText',data:'ㅎ'}));return el.isConnected;});
 assert.equal(composing,true,'An unfinished Korean composition does not rerender the textarea');
 await input.evaluate(el=>{el.value='한'+el.value.slice(1);el.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true,data:'한'}));el.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertCompositionText',data:'한'}));});
 let p=await saveProject(page,'skill-references-ime-prefix.json');assert.equal(p.cards[0].actives[0].effect,'한다시 강타 발동');assert.deepEqual(p.cards[0].actives[0].skillReferences.map(r=>[r.start,r.end]),[[4,6]]);
 await input.evaluate(el=>{el.focus();el.setSelectionRange(4,6);el.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}));el.value='한다시 강력 발동';el.dispatchEvent(new InputEvent('input',{bubbles:true,isComposing:true,inputType:'insertCompositionText',data:'강력'}));el.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true,data:'강력'}));el.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertCompositionText',data:'강력'}));});
 p=await saveProject(page,'skill-references-ime-unlinked.json');assert.equal(p.cards[0].actives[0].effect,'한다시 강력 발동');assert.deepEqual(p.cards[0].actives[0].skillReferences,[]);assert.deepEqual(pageErrors,[]);
 }finally{await browser.close();}
});


test('replacing a selected skill name with identical Korean composition unlinks that reference',async()=>{
 const {browser,page,pageErrors}=await openApp();try{
 await skills(page);await insert(page);const input=page.locator('#actives .skill-effect');
 await input.evaluate(el=>{el.focus();el.setSelectionRange(3,5);el.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}));el.value='다시 ㄱ 발동';el.dispatchEvent(new InputEvent('input',{bubbles:true,isComposing:true,inputType:'insertCompositionText',data:'ㄱ'}));el.value='다시 강타 발동';el.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true,data:'강타'}));el.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertCompositionText',data:'강타'}));});
 let p=await saveProject(page,'skill-references-identical-ime.json');assert.deepEqual(p.cards[0].actives[0].skillReferences,[]);
 await fill(page,'#passives .skill-name','새 이름');assert.equal(await input.inputValue(),'다시 강타 발동');assert.deepEqual(pageErrors,[]);
 }finally{await browser.close();}
});


test('switching a keyword badge to inline inserts plain text outside skill reference labels',async()=>{
 const {browser,page,pageErrors}=await openApp();try{
 await skills(page);await insert(page);await page.locator('#keyword-manager').click();await page.locator('#keyword-add').click();await fill(page,'#keyword-name','강타');await page.locator('#keyword-close').click();
 assert.equal(await page.locator('#actives select[aria-label="추가할 키워드"]').count(),1,'the body picker remains distinct from the title picker');
 await page.locator('#actives select[aria-label="추가할 키워드"]').selectOption({label:'강타'});await page.locator('#actives .keyword-add-badge').click();assert.deepEqual(pageErrors,[]);await fill(page,'#passives .skill-name','회오리');
 await page.locator('#actives .keyword-display').selectOption('inline');assert.equal(await page.locator('#actives .skill-effect').inputValue(),'다시 회오리 발동 강타');
 let p=await saveProject(page,'skill-references-keyword-inline.json');assert.deepEqual(p.cards[0].actives[0].skillReferences.map(r=>[r.start,r.end]),[[3,6]]);assert.equal(p.cards[0].actives[0].keywords[0].display,'inline');
 await page.locator('#actives .keyword-display').selectOption('badge');await page.locator('#actives .keyword-display').selectOption('inline');assert.equal(await page.locator('#actives .skill-effect').inputValue(),'다시 회오리 발동 강타');
 assert.deepEqual(pageErrors,[]);
 }finally{await browser.close();}
});


test('Variant UI keeps an overridden description live through rename and preserves its displayed name on deletion',async()=>{
 const {browser,page,pageErrors}=await openApp();try{
 await skills(page);await insert(page);const root=(await saveProject(page,'skill-reference-variant-root.json')).cards[0];await page.locator('#add-variant').click();
 const input=page.locator('#actives .skill-effect');await input.evaluate(el=>{el.focus();el.setSelectionRange(5,5);});await page.keyboard.insertText(' 추가');
 let p=await saveProject(page,'skill-reference-variant-own.json');const child=p.cards[1];assert.notEqual(child.actives[0].skillReferences[0].skillId,root.passives[0].id);assert.equal(child.actives[0].skillReferences[0].skillId,child.passives[0].id);
 const select=id=>page.locator('.card-row[data-card-id="'+id+'"] .card-select').click();await select(root.id);await fill(page,'#passives .skill-name','폭풍 강타🙂');await select(child.id);assert.equal(await input.inputValue(),'다시 폭풍 강타🙂 추가 발동');
 await select(root.id);await page.locator('#passives button[aria-label="기술 삭제"]').click();await select(child.id);assert.equal(await input.inputValue(),'다시 폭풍 강타🙂 추가 발동');
 p=await saveProject(page,'skill-reference-variant-deleted.json');assert.equal(p.cards[1].actives[0].effect,'다시 폭풍 강타🙂 추가 발동');assert.match(await page.locator('#card-warnings').innerText(),/참조.*스킬|스킬.*참조/);
 await page.locator('#undo').click();assert.equal(await page.locator('#passives .skill-name').inputValue(),'폭풍 강타🙂');assert.equal(await input.inputValue(),'다시 폭풍 강타🙂 추가 발동');assert.deepEqual(pageErrors,[]);
 }finally{await browser.close();}
});
