import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {openHarness} from './helpers/browser.mjs';
import {installCloud} from './helpers/cloud-fixture.mjs';

async function openEditor(){
 const app=await openHarness();
 await app.page.setViewportSize({width:390,height:844});
 await app.page.addStyleTag({content:await readFile(new URL('../src/styles.css',import.meta.url),'utf8')});
 await installCloud(app.page,{loggedIn:false});
 await app.page.evaluate(()=>{
  const ctx=window.__cloudTest.ctx;
  ctx.edit('입력 테스트 준비',p=>{
   p.cards[0].actives=[{id:crypto.randomUUID(),name:'불꽃',effect:'',dice:null,keywords:[]}];
   Object.assign(p.cards[0],window.testApi.syncSkillElements(p.cards[0],p.settings,p.keywords));
  });
 });
 await app.page.locator('#mobile-editor').click();
 await app.page.getByRole('button',{name:'액티브 펼치기',exact:true}).click();
 return app;
}

test('mobile title and description keep the same focused input across consecutive edits and idle refresh',async()=>{
 const {browser,page,pageErrors}=await openEditor();try{
  for(const selector of ['#card-name','#actives .skill-name','#actives .skill-effect']){
   const input=page.locator(selector);
   await input.evaluate(node=>{node.focus();window.__typingNode=node;window.__typingBlurs=0;node.addEventListener('blur',()=>window.__typingBlurs++);});
   await input.fill('연속');
   await page.waitForTimeout(220);
   await page.keyboard.insertText(' 입력');
   await page.waitForTimeout(220);
   const state=await input.evaluate(node=>({same:node===window.__typingNode,focused:node===document.activeElement,blurs:window.__typingBlurs,value:node.value}));
   assert.deepEqual(state,{same:true,focused:true,blurs:0,value:'연속 입력'},selector+' must keep the mobile keyboard attached');
  }
  await page.getByRole('button',{name:'액티브 접기',exact:true}).click();
  assert.equal(await page.locator('#actives .skill-effect').isVisible(),false,'a retained section still collapses');
  await page.getByRole('button',{name:'액티브 펼치기',exact:true}).click();
  assert.equal(await page.locator('#actives .skill-effect').isVisible(),true);
  assert.deepEqual(pageErrors,[]);
 }finally{await browser.close();}
});

test('pending text refresh respects undo, card changes, same-id document loads and editor teardown',async()=>{
 const {browser,page,pageErrors}=await openEditor();try{
  const input=page.locator('#card-name'),original=await input.inputValue();
  await input.fill('실행 취소할 이름');
  await page.evaluate(()=>window.__cloudTest.ctx.store.undo());
  await page.waitForTimeout(220);assert.equal(await input.inputValue(),original);
  await input.fill('첫 카드 입력');
  const secondName=await page.evaluate(()=>{
   const ctx=window.__cloudTest.ctx;let second;
   ctx.edit('두 번째 카드',p=>{second=window.testApi.createCard('monster',p);second.name='두 번째 카드';p.cards.push(second);});
   ctx.selectCard(second.id);return second.name;
  });
  await page.waitForTimeout(220);assert.equal(await input.inputValue(),secondName);
  await input.evaluate(node=>{node.focus();window.__previousDocumentInput=node;});
  await page.evaluate(()=>{const ctx=window.__cloudTest.ctx;ctx.store.load(structuredClone(ctx.store.getProject()));});
  await page.waitForTimeout(220);
  assert.equal(await input.evaluate(node=>node===window.__previousDocumentInput),false,'a different document must get fresh bindings even with identical ids and values');
  await input.fill('종료 전 마지막 입력');
  assert.equal(await page.evaluate(()=>window.__cloudTest.ctx.card().name),'종료 전 마지막 입력');
  await page.evaluate(()=>window.__cloudTest.ctx.destroy());await page.waitForTimeout(220);
  assert.deepEqual(pageErrors,[]);
 }finally{await browser.close();}
});

test('desktop typing batches preview updates while retaining the focused title',async()=>{
 const {browser,page,pageErrors}=await openEditor();try{
  await page.setViewportSize({width:1280,height:960});await page.waitForTimeout(220);
  await page.locator('#card-name').fill('');await page.waitForTimeout(220);
  await page.evaluate(()=>{
   window.__thumbChanges=0;window.__thumbObserver=new MutationObserver(changes=>window.__thumbChanges+=changes.length);
   window.__thumbObserver.observe(document.querySelector('#card-list'),{childList:true,subtree:true});
   window.__typingNode=document.activeElement;
  });
  const text='continuous desktop text entry';await page.keyboard.type(text);await page.waitForTimeout(220);
  assert.equal(await page.locator('#card-name').inputValue(),text);
  assert.equal(await page.evaluate(()=>document.activeElement===window.__typingNode),true);
  assert.ok(await page.evaluate(()=>window.__thumbChanges)<text.length,'a burst must not redraw every card for every letter');
  assert.deepEqual(pageErrors,[]);
 }finally{await browser.close();}
});

test('mobile text saves immediately while hidden card thumbnails are left alone',async()=>{
 const {browser,page,pageErrors}=await openEditor();try{
  await page.locator('#actives .skill-effect').focus();
  await page.evaluate(()=>{
   window.__thumbChanges=0;window.__thumbObserver=new MutationObserver(changes=>window.__thumbChanges+=changes.length);
   window.__thumbObserver.observe(document.querySelector('#card-list'),{childList:true,subtree:true});
   window.__paperChanges=0;window.__paperObserver=new MutationObserver(changes=>window.__paperChanges+=changes.length);
   window.__paperObserver.observe(document.querySelector('.paper-scroll'),{childList:true,subtree:true});
  });
  await page.keyboard.type('continuous typing');
  assert.equal(await page.evaluate(()=>window.__cloudTest.ctx.card().actives[0].effect),'continuous typing','saving must not wait for a repaint timer');
  await page.waitForTimeout(220);
  assert.equal(await page.evaluate(()=>window.__thumbChanges),0,'hidden cards must not be redrawn for each keystroke');
  assert.equal(await page.evaluate(()=>window.__paperChanges),0,'hidden A4 sheets must not be redrawn for each keystroke');
  await page.locator('#mobile-cards').click();
  assert.ok(await page.evaluate(()=>window.__thumbChanges)>0,'the list catches up when opened');
  assert.deepEqual(pageErrors,[]);
 }finally{await browser.close();}
});

test('a pending title repaint keeps uncommitted text in the next field',async()=>{
 const {browser,page,pageErrors}=await openEditor();try{
  await page.evaluate(()=>window.__cloudTest.ctx.addVariant());
  await page.getByRole('button',{name:'Variant 펼치기',exact:true}).click();
  await page.locator('#card-name').fill('입력 중인 이름');
  await page.locator('#variant-label').fill('아직 입력 중인 구분명');
  await page.locator('#variant-label').evaluate(node=>window.__typingNode=node);
  await page.waitForTimeout(220);
  const label=page.locator('#variant-label');assert.equal(await label.inputValue(),'아직 입력 중인 구분명');
  assert.equal(await label.evaluate(node=>node===window.__typingNode&&node===document.activeElement),true);
  await label.press('Tab');assert.equal(await page.evaluate(()=>window.__cloudTest.ctx.card().variant.label),'아직 입력 중인 구분명');
  assert.deepEqual(pageErrors,[]);
 }finally{await browser.close();}
});

test('Korean composition survives a background save notification and starts the next syllable in place',async()=>{
 const {browser,page,pageErrors}=await openEditor();try{
  const input=page.locator('#actives .skill-effect');
  await input.evaluate(node=>{
   node.focus();window.__typingNode=node;
   node.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}));
   node.value='ㅎ';node.dispatchEvent(new InputEvent('input',{bubbles:true,isComposing:true,inputType:'insertCompositionText',data:'ㅎ'}));
   window.__cloudTest.ctx.store.markSaved();
  });
  await page.waitForTimeout(220);
  assert.equal(await input.evaluate(node=>node===window.__typingNode),true,'a status update must not replace the composing input');
  assert.equal(await page.evaluate(()=>window.__cloudTest.ctx.card().actives[0].effect),'','partial syllables stay out of saved text');
  await input.evaluate(node=>{
   node.value='한';node.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true,data:'한'}));
   node.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:'한'}));
  });
  await page.waitForTimeout(220);
  await input.evaluate(node=>{
   node.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}));
   node.value='한글';node.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true,data:'글'}));
   node.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:'글'}));
  });
  assert.equal(await page.evaluate(()=>window.__cloudTest.ctx.card().actives[0].effect),'한글');
  assert.equal(await input.evaluate(node=>node===window.__typingNode&&node===document.activeElement),true);
  assert.deepEqual(pageErrors,[]);
 }finally{await browser.close();}
});
