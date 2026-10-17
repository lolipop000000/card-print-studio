import test from 'node:test';
import assert from 'node:assert/strict';
import {openApp,qa} from './helpers/browser.mjs';
import {saveProject} from './helpers/flows.mjs';
import path from 'node:path';
const fill=async(p,s,v)=>{await p.locator(s).fill(v);await p.locator(s).press('Tab');};
test('name-only editor combines color with effects, follows references and plain names, and cancels exactly',async()=>{
 const {browser,page,pageErrors,httpRequests}=await openApp();try{
  await page.locator('#add-passive').click();await fill(page,'#passives .skill-name','불꽃');await page.locator('#add-active').click();await page.locator('#actives .skill-effect').fill('불꽃 뒤 다시 불꽃');
  assert.equal(await page.locator('#passives .skill-name-effects').count(),1,'A skill exposes name-only effect editing');
  await page.locator('#passives .skill-name-effects').click();assert.match(await page.locator('#effect-target option:checked').innerText(),/이름만.*불꽃/);
  await page.locator('#effect-start-preset').selectOption('flame');await page.locator('#effect-text-color').fill('#e52d45');await page.locator('#effect-text-color').dispatchEvent('change');await page.locator('#effect-apply').click();
  const applied=await saveProject(page,'name-only-applied.json');assert.equal(applied.cards[0].passives[0].nameStyle.color,'#e52d45');assert.equal(applied.cards[0].passives[0].nameStyle.visualEffects.layers[0].kind,'flame');
  assert.ok(!applied.cards[0].visualEffects);await page.locator('#passives .skill-name-effects').click();await page.locator('#effect-text-color').fill('#2233ee');await page.locator('#effect-text-color').dispatchEvent('change');await page.keyboard.press('Escape');await page.getByRole('button',{name:'변경 버리기',exact:true}).click();
  assert.deepEqual(await saveProject(page,'name-only-cancel.json'),applied);
  await page.screenshot({path:path.join(qa,'skill-name-editor.png'),fullPage:true});assert.deepEqual(pageErrors,[]);assert.deepEqual(httpRequests,[]);
 }finally{await browser.close();}
});
test('selected-target effect action opens the selected picture rather than a text target',async()=>{
 const {browser,page}=await openApp();try{
  const art=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=100;c.height=100;const g=c.getContext('2d');g.fillStyle='#426fcb';g.fillRect(25,25,50,50);return c.toDataURL().split(',')[1];});
  const chooser=page.waitForEvent('filechooser');await page.getByRole('button',{name:'그림 가져오기',exact:true}).click();await (await chooser).setFiles({name:'art.png',mimeType:'image/png',buffer:Buffer.from(art,'base64')});
  await page.waitForFunction(()=>document.getElementById('save-state').textContent==='미저장');
  const canvas=await page.locator('#card-canvas').boundingBox();await page.mouse.click(canvas.x+canvas.width*.45,canvas.y+canvas.height*.30);
  assert.equal(await page.getByRole('button',{name:'선택한 대상 이펙트 만들기',exact:true}).count()>0,true,'Image and text share the selected-target action');
  await page.locator('#card-text-effects').click();assert.equal(await page.locator('#effect-target option:checked').innerText(),'카드 그림');await page.locator('#effect-start-preset').selectOption('neonText');await page.locator('#effect-apply').click();
  const project=await saveProject(page,'image-target-effects.json'),image=project.cards[0].elements.find(e=>e.binding?.field==='art');assert.ok(image.style.visualEffects.layers.length);assert.ok(project.cards[0].artAssetId);assert.ok(!project.cards[0].elements.find(e=>e.binding?.field==='name').style.visualEffects);
 }finally{await browser.close();}
});
