import {openPreviewOptions} from './helpers/flows.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {openApp,qa} from './helpers/browser.mjs';
import {saveProject,openPainter,drawStroke} from './helpers/flows.mjs';
const fill=async(page,id,value)=>{const input=page.locator(id);if(await input.getAttribute('type')==='range')await input.evaluate((n,v)=>{n.value=String(v);n.dispatchEvent(new Event('input',{bubbles:true}));},value);else{await input.fill(String(value));await input.press('Tab');}};
async function layer(page,kind){await page.locator('#effect-layer-list [data-kind="'+kind+'"] .effect-layer-select').first().click();}
async function chooseElement(page,p,match){const e=p.cards[0].elements.find(match),b=await page.locator('#card-canvas').boundingBox();await page.mouse.click(b.x+(e.rect.x+e.rect.w/2)/p.settings.cardWidthMm*b.width,b.y+(e.rect.y+e.rect.h/2)/p.settings.cardHeightMm*b.height);}
async function addLayer(page,kind){await page.locator('#effect-layer-kind').selectOption(kind);await page.locator('#effect-layer-add').click();}
test('composer combines real effects, saves independent recipes and preserves editable painting originals',async()=>{
 const {browser,page,pageErrors,httpRequests}=await openApp();page.setDefaultTimeout(5000);try{
  await openPainter(page);await drawStroke(page);await page.locator('#paint-apply').click();await page.locator('#painting-editor').waitFor({state:'detached'});
  const before=await saveProject(page,'effects-original.json');
  await page.locator('#card-frame-effects').click();await page.locator('#effect-start-preset').selectOption('flame');
  await page.locator('#effect-combine-preset').selectOption('smoke');await page.locator('#effect-merge-preset').click();await addLayer(page,'ember');
  await layer(page,'smoke');await fill(page,'#effect-param-color','#7953a6');await fill(page,'#effect-param-density','.7');await page.locator('#effect-advanced summary').click();await fill(page,'#effect-origin-x','.1');
  await fill(page,'#effect-time','2.35');await openPreviewOptions(page);await page.locator('#effect-freeze').click();await fill(page,'#effect-preset-name','보라 연기 불꽃');await page.locator('#effect-save-preset').click();
  await page.locator('#effect-apply').click();await page.locator('#effect-editor').waitFor({state:'detached'});
  const applied=await saveProject(page,'effects-applied.json'),recipe=applied.cards[0].visualEffects;
  assert.deepEqual(recipe.layers.map(l=>l.kind).sort(),['ember','flame','smoke']);assert.equal(applied.print.effectFrameSec,2.35);
  assert.deepEqual(applied.assets,before.assets);assert.deepEqual(applied.paintings,before.paintings);
  await page.locator('#card-frame-effects').click();await page.locator('[data-effect-preset]').first().click();await layer(page,'smoke');await fill(page,'#effect-param-density','.2');
  await page.locator('#effect-update-preset').click();await page.locator('#effect-delete-preset').click();await page.locator('#effect-close').click();await page.getByRole('button',{name:'변경 버리기',exact:true}).click();
  const after=await saveProject(page,'effects-library-deleted.json');assert.equal(after.visualEffectPresets.length,0);assert.deepEqual(after.cards[0].visualEffects,recipe);
  await page.locator('#undo').click();assert.equal(await page.locator('#save-state').innerText(),'미저장');await page.locator('#redo').click();
  assert.deepEqual(pageErrors,[]);assert.deepEqual(httpRequests,[]);
 }finally{await browser.close();}
});
test('text warp and fire change shapes without rewriting skill text, and incompatible recipes explain the target',async()=>{
 const {browser,page,pageErrors}=await openApp();page.setDefaultTimeout(5000);try{
  await page.locator('#add-passive').click();await fill(page,'#passives .skill-name','불의 가호');await fill(page,'#passives .skill-effect','피해를 받으면 체력 10 회복. 🙂');
  const before=await saveProject(page,'effects-text-original.json');await chooseElement(page,before,e=>e.binding?.field==='skill.effect');await page.locator('#element-effects').click();
  await addLayer(page,'textWarp');await fill(page,'#effect-param-arc','.15');await fill(page,'#effect-param-wave','.1');await fill(page,'#effect-param-skewDeg','8');await fill(page,'#effect-param-scaleX','1.1');await fill(page,'#effect-param-scaleY','1.2');
  await page.locator('#effect-start-preset').selectOption('burningText');await addLayer(page,'textWarp');await fill(page,'#effect-param-arc','.15');await fill(page,'#effect-param-wave','.1');await fill(page,'#effect-param-skewDeg','8');await fill(page,'#effect-param-scaleX','1.1');await fill(page,'#effect-param-scaleY','1.2');
  assert.equal(await page.locator('#effect-layer-duplicate').isDisabled(),true);await fill(page,'#effect-preset-name','휘어진 화염 글자');await page.locator('#effect-save-preset').click();await page.screenshot({path:path.join(qa,'visual-effects-editor-text.png'),fullPage:true});
  await page.locator('#effect-apply').click();const after=await saveProject(page,'effects-text-applied.json');
  assert.equal(after.cards[0].passives[0].effect,before.cards[0].passives[0].effect);assert.equal(after.cards[0].elements.find(e=>e.binding?.field==='skill.effect').style.visualEffects.layers[0].kind,'textWarp');
  await chooseElement(page,after,e=>e.type==='image');await page.locator('#element-effects').click();await page.locator('[data-effect-preset]').first().click();assert.match(await page.locator('#effect-feedback').innerText(),/글자|텍스트/);
  await page.locator('#effect-close').click();assert.deepEqual(pageErrors,[]);
 }finally{await browser.close();}
});
test('draft time and layers cancel safely through Escape, native close and repeated entry',async()=>{
 const {browser,page,pageErrors}=await openApp();page.setDefaultTimeout(5000);try{
  const before=await saveProject(page,'effects-cancel-before.json');await page.locator('#card-frame-effects').click();await page.locator('#effect-start-preset').selectOption('burning');await fill(page,'#effect-time','4.2');await openPreviewOptions(page);await page.locator('#effect-freeze').click();
  await page.keyboard.press('Escape');await page.getByRole('button',{name:'계속 편집',exact:true}).click();assert.equal(await page.locator('#effect-editor').isVisible(),true);
  await page.keyboard.press('Escape');await page.getByRole('button',{name:'변경 버리기',exact:true}).click();const after=await saveProject(page,'effects-cancel-after.json');assert.deepEqual(after,before);
  await page.locator('#card-frame-effects').click();assert.equal(await page.locator('#effect-layer-list [data-kind]').count(),0);assert.match(await page.locator('#effect-empty').innerText(),/추가/);
  await page.evaluate(()=>document.getElementById('effect-editor').close());await page.locator('#effect-editor').waitFor({state:'detached'});await page.locator('#card-frame-effects').click();await page.locator('#effect-close').click();
  await page.locator('#add-effect').click();assert.match(await page.locator('#effect-feedback').innerText(),/불꽃|연기|효과/);await page.locator('#effect-start-preset').selectOption('smoke');await page.locator('#effect-apply').click();
  const stand=await saveProject(page,'effects-standalone.json');assert.equal(stand.cards[0].elements.filter(e=>e.type==='effect').length,1);
  await page.locator('#duplicate-element').click();let copies=await saveProject(page,'effects-duplicated.json');assert.equal(copies.cards[0].elements.filter(e=>e.type==='effect').length,2);
  await fill(page,'#element-x',12);await page.locator('#delete-element').click();await page.locator('#undo').click();copies=await saveProject(page,'effects-undo.json');assert.equal(copies.cards[0].elements.filter(e=>e.type==='effect').length,2);
  await page.locator('#project-file').setInputFiles({name:'effects-reload.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(stand))});await page.waitForFunction(()=>document.getElementById('save-state').textContent==='저장됨');const loaded=await saveProject(page,'effects-reloaded.json');assert.deepEqual(loaded,stand);assert.deepEqual(pageErrors,[]);
 }finally{await browser.close();}
});
test('main preview playback stays local, pauses for A4 and does not rebuild the inspector',async()=>{
 const {browser,page,pageErrors}=await openApp();page.setDefaultTimeout(5000);try{
  await page.locator('#card-frame-effects').click();await page.locator('#effect-start-preset').selectOption('burning');await page.locator('#effect-apply').click();await saveProject(page,'effects-playback-base.json');
  const node=await page.locator('#card-name').elementHandle(),before=await page.locator('#card-effect-time').inputValue();await page.locator('#card-effect-play').click();await page.waitForFunction(v=>Math.abs(Number(document.getElementById('card-effect-time').value)-Number(v))>.8,before);
  assert.equal(await page.locator('#save-state').innerText(),'저장됨');assert.equal(await node.evaluate(n=>n.isConnected),true);
  await page.locator('#card-effect-play').click();await fill(page,'#card-effect-time','2.35');await openPreviewOptions(page,'card');await page.locator('#card-effect-freeze').click();assert.equal(await page.locator('#save-state').innerText(),'미저장');
  await page.locator('#card-effect-play').click();await page.locator('#paper-tab').click();assert.equal(await page.locator('#card-effect-play').getAttribute('aria-pressed'),'false');assert.equal(await page.locator('#print-effect-frame').inputValue(),'2.35');
  await page.setViewportSize({width:720,height:760});await page.locator('#card-tab').click();await page.locator('#card-frame-effects').click();assert.equal(await page.locator('#effect-apply').isVisible(),true);await page.locator('#effect-layer-list').evaluate(n=>n.scrollIntoView());await page.screenshot({path:path.join(qa,'visual-effects-editor-small.png'),fullPage:true});await page.keyboard.press('Escape');assert.deepEqual(pageErrors,[]);
 }finally{await browser.close();}
});
test('Variant effect edits retain shared untouched source layer values',async()=>{
 const {browser,page}=await openApp();page.setDefaultTimeout(5000);try{
  await page.locator('#card-frame-effects').click();await page.locator('#effect-start-preset').selectOption('burning');await page.locator('#effect-apply').click();await page.locator('#add-variant').click();
  await page.locator('#card-frame-effects').click();await layer(page,'smoke');await fill(page,'#effect-param-color','#7953a6');await page.locator('#effect-apply').click();
  await page.locator('.card-select').first().click();await page.locator('#card-frame-effects').click();await layer(page,'flame');await fill(page,'#effect-param-height','.9');await page.locator('#effect-apply').click();
  const p=await saveProject(page,'effects-variant.json');assert.equal(p.cards[1].visualEffects.layers.find(l=>l.kind==='smoke').params.color,'#7953a6');assert.equal(p.cards[1].visualEffects.layers.find(l=>l.kind==='flame').params.height,.9);
 }finally{await browser.close();}
});

test('layer duplication ordering bounds and apply undo keep a whole recipe and print frame together',async()=>{
 const {browser,page}=await openApp();page.setDefaultTimeout(5000);try{
  await page.emulateMedia({reducedMotion:'reduce'});const before=await saveProject(page,'effects-layer-before.json');await page.locator('#card-frame-effects').click();await page.locator('#effect-start-preset').selectOption('flame');
  assert.equal(await page.locator('#effect-play').getAttribute('aria-pressed'),'false');await layer(page,'flame');await page.locator('#effect-layer-duplicate').click();assert.equal(await page.locator('#effect-layer-list [data-kind="flame"]').count(),2);
  await page.locator('#effect-layer-up').click();await fill(page,'#effect-param-height','.95');await page.locator('#effect-layer-reset').click();assert.equal(await page.locator('#effect-param-height').inputValue(),'0.68');
  await page.locator('#effect-layer-list [data-kind="flame"] input').first().uncheck();assert.equal(await page.locator('#effect-reroll').count(),0);
  for(let i=0;i<10;i++)await addLayer(page,'outline');assert.equal(await page.locator('#effect-layer-add').isDisabled(),true);assert.equal(await page.locator('#effect-layer-duplicate').isDisabled(),true);
  await fill(page,'#effect-time','3.25');await openPreviewOptions(page);await page.locator('#effect-freeze').click();await page.locator('#effect-apply').click();const applied=await saveProject(page,'effects-layer-after.json');
  assert.equal(applied.cards[0].visualEffects.layers.length,12);assert.equal(new Set(applied.cards[0].visualEffects.layers.map(l=>l.id)).size,12);assert.equal(applied.print.effectFrameSec,3.25);
  await page.locator('#undo').click();const undone=await saveProject(page,'effects-layer-undo.json');assert.deepEqual(undone,before);await page.locator('#redo').click();const redone=await saveProject(page,'effects-layer-redo.json');assert.deepEqual(redone,applied);
 }finally{await browser.close();}
});
test('forced native closure removes the owned discard dialog and project reload resets the editor guard',async()=>{
 const {browser,page,pageErrors}=await openApp();page.setDefaultTimeout(5000);try{
  const p=await saveProject(page,'effects-native-base.json');await page.locator('#card-frame-effects').click();await page.locator('#effect-start-preset').selectOption('burning');await page.keyboard.press('Escape');await page.locator('.confirm-dialog').waitFor();
  await page.evaluate(()=>document.getElementById('effect-editor').close());await page.locator('#effect-editor').waitFor({state:'detached'});assert.equal(await page.locator('dialog[open]').count(),0);
  await page.locator('#card-frame-effects').click();await page.locator('#effect-start-preset').selectOption('smoke');await page.locator('#project-file').setInputFiles({name:'replace-effects.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(p))});await page.locator('#effect-editor').waitFor({state:'detached'});
  await page.locator('#card-frame-effects').click();assert.equal(await page.locator('#effect-layer-list [data-kind]').count(),0);await page.locator('#effect-close').click();assert.deepEqual(pageErrors,[]);
 }finally{await browser.close();}
});
