import {openPreviewOptions} from './helpers/flows.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {openApp,qa} from './helpers/browser.mjs';
import {saveProject} from './helpers/flows.mjs';
const fill=async(page,id,value)=>{await page.locator(id).fill(String(value));await page.locator(id).press('Tab');};
const kinds=page=>page.locator('#effect-layer-list [data-kind]').evaluateAll(nodes=>nodes.map(n=>n.dataset.kind));
const add=async(page,kind)=>{await page.locator('#effect-layer-kind').selectOption(kind);await page.locator('#effect-layer-add').click();};
const undo=page=>page.locator('#effect-undo').click();
const redo=page=>page.locator('#effect-redo').click();

test('effect history restores layers, parameters and frozen time, branches correctly, and applies as one deck edit',async()=>{
 const {browser,page,pageErrors,httpRequests}=await openApp();page.setDefaultTimeout(7000);try{
  const before=await saveProject(page,'effect-history-before.json');await page.locator('#card-frame-effects').click();
  assert.equal(await page.locator('#effect-undo').count(),1,'The effect editor exposes its own undo action');
  assert.equal(await page.locator('#effect-undo').isDisabled(),true);assert.equal(await page.locator('#effect-redo').isDisabled(),true);
  await page.locator('#effect-start-preset').selectOption('flame');await fill(page,'#effect-param-height','.9');await add(page,'smoke');
  await undo(page);assert.deepEqual(await kinds(page),['flame']);assert.equal(await page.locator('#effect-param-height').inputValue(),'0.9');
  await undo(page);assert.equal(await page.locator('#effect-param-height').inputValue(),'0.68');
  await redo(page);assert.equal(await page.locator('#effect-param-height').inputValue(),'0.9');await redo(page);assert.deepEqual(await kinds(page),['flame','smoke']);
  await undo(page);await add(page,'outline');assert.equal(await page.locator('#effect-redo').isDisabled(),true);assert.deepEqual(await kinds(page),['flame','outline']);
  await page.locator('#effect-time').evaluate(node=>{node.value='2.35';node.dispatchEvent(new Event('input',{bubbles:true}));});await openPreviewOptions(page);await page.locator('#effect-freeze').click();
  await undo(page);assert.match(await page.locator('#effect-frame-label').innerText(),/1\.20/);await redo(page);assert.match(await page.locator('#effect-frame-label').innerText(),/2\.35/);
  await page.locator('#effect-apply').click();const applied=await saveProject(page,'effect-history-applied.json');
  assert.deepEqual(applied.cards[0].visualEffects.layers.map(l=>l.kind),['flame','outline']);assert.equal(applied.cards[0].visualEffects.layers[0].params.height,.9);assert.equal(applied.print.effectFrameSec,2.35);
  await page.locator('#undo').click();assert.deepEqual(await saveProject(page,'effect-history-deck-undo.json'),before);await page.locator('#redo').click();assert.deepEqual(await saveProject(page,'effect-history-deck-redo.json'),applied);
  assert.deepEqual(pageErrors,[]);assert.deepEqual(httpRequests,[]);
 }finally{await browser.close();}
});

test('history crosses effect targets and restores name color without changing the card until apply',async()=>{
 const {browser,page,pageErrors}=await openApp();page.setDefaultTimeout(7000);try{
  await page.locator('#add-passive').click();await fill(page,'#passives .skill-name','화염');const before=await saveProject(page,'effect-history-name-before.json');
  await page.locator('#passives .skill-name-effects').click();assert.equal(await page.locator('#effect-undo').count(),1,'Name effects expose the same history');
  const nameTarget=await page.locator('#effect-target').inputValue();
  await fill(page,'#effect-text-color','#e52d45');await page.locator('#effect-start-preset').selectOption('flame');
  await page.locator('#effect-target').selectOption('');await page.locator('#effect-start-preset').selectOption('smoke');
  await undo(page);assert.equal(await page.locator('#effect-target').inputValue(),'');assert.deepEqual(await kinds(page),[]);
  await undo(page);assert.equal(await page.locator('#effect-target').inputValue(),nameTarget);assert.deepEqual(await kinds(page),[]);assert.equal(await page.locator('#effect-text-color').inputValue(),'#e52d45');
  await undo(page);assert.equal(await page.locator('#effect-text-color-reset').isDisabled(),true);assert.equal(await page.locator('#effect-undo').isDisabled(),true);
  await redo(page);await redo(page);await redo(page);await page.locator('#effect-apply').click();const applied=await saveProject(page,'effect-history-name-applied.json');
  assert.equal(applied.cards[0].passives[0].nameStyle.color,'#e52d45');assert.equal(applied.cards[0].passives[0].nameStyle.visualEffects.layers[0].kind,'flame');assert.equal(applied.cards[0].visualEffects.layers[0].kind,'smoke');
  await page.locator('#undo').click();assert.deepEqual(await saveProject(page,'effect-history-name-undone.json'),before);assert.deepEqual(pageErrors,[]);
 }finally{await browser.close();}
});

test('effect shortcuts commit pending numeric input, respect native text editing, and reset after discard and reopen',async()=>{
 const {browser,page,pageErrors}=await openApp();page.setDefaultTimeout(7000);try{
  await page.locator('#card-frame-effects').click();await page.locator('#effect-start-preset').selectOption('flame');await page.locator('#effect-apply').click();const before=await saveProject(page,'effect-history-shortcut-before.json');
  await page.locator('#card-frame-effects').click();assert.equal(await page.locator('#effect-undo').count(),1,'The reopened editor has scoped undo controls');
  await page.locator('#effect-param-height').fill('.91');await page.locator('#effect-param-height').press('Control+z');
  assert.equal(await page.locator('#effect-param-height').inputValue(),'0.68');assert.equal(await page.locator('#effect-undo').isDisabled(),true);
  await page.keyboard.press('Control+y');assert.equal(await page.locator('#effect-param-height').inputValue(),'0.91');await page.keyboard.press('Control+z');await page.keyboard.press('Control+Shift+z');assert.equal(await page.locator('#effect-param-height').inputValue(),'0.91');
  await page.locator('#effect-preset-name').focus();await page.locator('#effect-preset-name').pressSequentially('test');await page.keyboard.press('Control+z');
  assert.notEqual(await page.locator('#effect-preset-name').inputValue(),'test');assert.equal(await page.locator('#effect-param-height').inputValue(),'0.91');
  await page.locator('#effect-close').click();await page.getByRole('button',{name:'변경 버리기',exact:true}).click();assert.deepEqual(await saveProject(page,'effect-history-discarded.json'),before);
  await page.locator('#card-frame-effects').click();assert.equal(await page.locator('#effect-undo').isDisabled(),true);assert.equal(await page.locator('#effect-redo').isDisabled(),true);
  await page.locator('#effect-param-height').fill('.82');const box=await page.locator('#effect-undo').boundingBox();await page.mouse.click(box.x+box.width/2,box.y+box.height/2);
  assert.equal(await page.locator('#effect-param-height').inputValue(),'0.68','Clicking undo also commits then undoes the pending first numeric edit');
  await page.setViewportSize({width:720,height:760});await page.screenshot({path:path.join(qa,'effect-history-small.png'),fullPage:true});await page.locator('#effect-close').click();assert.deepEqual(pageErrors,[]);
 }finally{await browser.close();}
});

test('layer deletion, reordering, toggling and resetting each restore the exact editable layer',async()=>{
 const {browser,page}=await openApp();page.setDefaultTimeout(7000);try{
  await page.locator('#card-frame-effects').click();assert.equal(await page.locator('#effect-undo').count(),1,'Structural layer changes can be undone inside the editor');
  await page.locator('#effect-start-preset').selectOption('flame');await page.locator('#effect-layer-duplicate').click();await fill(page,'#effect-param-height','.81');
  await page.locator('#effect-layer-up').click();await undo(page);assert.equal(await page.locator('#effect-layer-list .active').evaluate(n=>[...n.parentElement.children].filter(c=>c.dataset.kind).indexOf(n)),1);assert.equal(await page.locator('#effect-param-height').inputValue(),'0.81');
  await page.locator('#effect-layer-list .active input').uncheck();await undo(page);assert.equal(await page.locator('#effect-layer-list .active input').isChecked(),true);
  await page.locator('#effect-layer-reset').click();await undo(page);assert.equal(await page.locator('#effect-param-height').inputValue(),'0.81');
  await page.locator('#effect-layer-delete').click();assert.equal((await kinds(page)).length,1);await undo(page);assert.equal((await kinds(page)).length,2);assert.equal(await page.locator('#effect-param-height').inputValue(),'0.81');
  await page.locator('#effect-close').click();await page.getByRole('button',{name:'변경 버리기',exact:true}).click();
 }finally{await browser.close();}
});

test('undo of rejected pending input restores the field without consuming the previous effect edit',async()=>{
 const {browser,page,pageErrors}=await openApp();page.setDefaultTimeout(6000);try{
  await page.locator('#card-frame-effects').click();await page.locator('#effect-start-preset').selectOption('flame');
  await page.locator('#effect-param-height').fill('9');await page.locator('#effect-param-height').press('Control+z');
  assert.deepEqual(await kinds(page),['flame']);assert.equal(await page.locator('#effect-param-height').inputValue(),'0.68');
  await page.keyboard.press('Control+z');assert.deepEqual(await kinds(page),[]);assert.deepEqual(pageErrors,[]);
 }finally{await browser.close();}
});


test('mouse undo of rejected pending input preserves the previous edit before undoing it',async()=>{
 const {browser,page,pageErrors}=await openApp();page.setDefaultTimeout(6000);try{
  await page.locator('#card-frame-effects').click();await page.locator('#effect-start-preset').selectOption('flame');
  await page.locator('#effect-param-height').fill('9');const box=await page.locator('#effect-undo').boundingBox();
  await page.mouse.click(box.x+box.width/2,box.y+box.height/2);
  assert.deepEqual(await kinds(page),['flame']);assert.equal(await page.locator('#effect-param-height').inputValue(),'0.68');
  await undo(page);assert.deepEqual(await kinds(page),[]);assert.deepEqual(pageErrors,[]);
 }finally{await browser.close();}
});
