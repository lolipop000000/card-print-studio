import {VISUAL_EFFECT_PRESETS} from '../src/model/visual-effects.js';
const presetCount=Object.keys(VISUAL_EFFECT_PRESETS).length;
import test from 'node:test';
import assert from 'node:assert/strict';
import {openApp} from './helpers/browser.mjs';
import {saveProject} from './helpers/flows.mjs';
async function begin(capture=false){const result=await openApp();result.page.setDefaultTimeout(5000);const original=capture?await saveProject(result.page,'expansion-before.json'):null;await result.page.locator('#card-text-effects').click();return {...result,original};}
const add=async(page,kind)=>{await page.locator('#effect-layer-kind').selectOption(kind);await page.locator('#effect-layer-add').click();};

test('preset search and categories expose actual rendered samples and apply a chosen material to named text',async()=>{
 const {browser,page,pageErrors,httpRequests}=await begin();try{
  assert.equal(await page.locator('[data-builtin-effect]').count(),presetCount);
  await page.locator('#effect-preset-search').fill('장미');assert.equal(await page.locator('[data-builtin-effect]').count(),1);
  const sample=page.locator('[data-builtin-effect="roseGold"] canvas');await page.waitForFunction(()=>document.querySelector('[data-builtin-effect="roseGold"] canvas')?.dataset.ready==='true');
  assert.ok(await sample.evaluate(c=>c.getContext('2d').getImageData(0,0,c.width,c.height).data.some((v,i)=>i%4===3&&v)));
  await page.locator('[data-builtin-effect="roseGold"]').click();await page.locator('#effect-apply').click();const result=await saveProject(page,'expansion-material.json');
  const applied=result.cards[0].elements.find(e=>e.style.visualEffects?.layers.some(l=>l.kind==='foil'));assert.ok(applied);assert.equal(applied.binding.field,'name');
  await page.locator('#card-text-effects').click();await page.locator('#effect-preset-category').selectOption('디지털·인쇄');const names=await page.locator('[data-builtin-effect]').allTextContents();assert.ok(names.some(s=>s.includes('글리치')));assert.ok(names.every(s=>!s.includes('장미')));assert.deepEqual(pageErrors,[]);assert.deepEqual(httpRequests,[]);
 }finally{await browser.close();}
});

test('holding original comparison changes only preview and releasing restores the exact frozen effect frame',async()=>{
 const {browser,page,original:projectBefore}=await begin(true);try{
  await page.locator('#effect-start-preset').selectOption('roseGold');await page.waitForFunction(()=>document.getElementById('effect-preview-status').dataset.busy==='false');
  const before=await page.locator('#effect-preview').evaluate(c=>c.toDataURL());
  await page.locator('#effect-compare').dispatchEvent('pointerdown',{pointerId:1});assert.equal(await page.locator('#effect-compare').getAttribute('aria-pressed'),'true');
  const original=await page.locator('#effect-preview').evaluate(c=>c.toDataURL());assert.notEqual(original,before);
  await page.locator('#effect-compare').dispatchEvent('pointerup',{pointerId:1});assert.equal(await page.locator('#effect-compare').getAttribute('aria-pressed'),'false');assert.equal(await page.locator('#effect-preview').evaluate(c=>c.toDataURL()),before);
  await page.locator('#effect-close').click();await page.getByRole('button',{name:'변경 버리기',exact:true}).click();assert.deepEqual(await saveProject(page,'expansion-compare-after.json'),projectBefore);
 }finally{await browser.close();}
});

test('Korean preset search keeps the composing input until composition finishes',async()=>{
 const {browser,page}=await begin();try{
  const search=page.locator('#effect-preset-search');await search.dispatchEvent('compositionstart');await search.evaluate(input=>{input.value='장미';input.dataset.composingProbe='retained';});await search.dispatchEvent('input',{isComposing:true,inputType:'insertCompositionText',data:'미'});
  assert.equal(await search.getAttribute('data-composing-probe'),'retained');assert.equal(await page.locator('[data-builtin-effect]').count(),presetCount);
  await search.dispatchEvent('compositionend',{data:'장미'});assert.equal(await page.locator('[data-builtin-effect]').count(),1);assert.equal(await search.inputValue(),'장미');
 }finally{await browser.close();}
});

test('preview zoom and target focus enlarge without touching the saved card geometry',async()=>{
 const {browser,page,original}=await begin(true);try{
  await page.locator('#effect-preview-zoom').selectOption('3');
  assert.ok(await page.locator('#effect-preview').evaluate(c=>c.getBoundingClientRect().width>900));
  await page.locator('#effect-focus-target').click();assert.equal(await page.locator('#effect-preview-zoom').inputValue(),'2');
  await page.locator('#effect-close').click();assert.deepEqual(await saveProject(page,'expansion-zoom-after.json'),original);
 }finally{await browser.close();}
});

test('only meaningful controls are exposed and optional old chromatic values display defaults',async()=>{
 const {browser,page}=await begin();try{
  await add(page,'textWarp');assert.equal(await page.locator('#effect-over-text').count(),0);
  await add(page,'flame');await page.locator('#effect-advanced summary').click();assert.equal(await page.locator('#effect-origin-w').getAttribute('min'),'0.05');assert.equal(await page.locator('#effect-origin-h').getAttribute('min'),'0.005');
  await add(page,'chromatic');assert.equal(await page.locator('#effect-param-mode').inputValue(),'auto');assert.equal(await page.locator('#effect-param-color').inputValue(),'#ec3868');assert.match(await page.locator('#effect-layer-hint').innerText(),/黒|검정|짙은|자동/);
  await page.locator('#effect-param-mode').selectOption('fringe');await page.locator('#effect-apply').click();const saved=await saveProject(page,'expansion-chromatic-mode.json');assert.equal(saved.cards[0].elements.find(e=>e.style.visualEffects?.layers.some(l=>l.kind==='chromatic')).style.visualEffects.layers.find(l=>l.kind==='chromatic').params.mode,'fringe');
 }finally{await browser.close();}
});
