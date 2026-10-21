import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {openApp,qa} from './helpers/browser.mjs';
import {saveProject} from './helpers/flows.mjs';

async function darkSurface(page,selector){
 const colors=await page.locator(selector).first().evaluate(node=>{
  const style=getComputedStyle(node),rgb=value=>(value.match(/[\d.]+/g)||[]).slice(0,3).map(Number);
  return {background:rgb(style.backgroundColor),text:rgb(style.color)};
 });
 assert.equal(colors.background.length,3,selector+' needs a background');
 assert.ok(Math.max(...colors.background)<85,selector+' must use a dark surface: '+JSON.stringify(colors));
 assert.ok(Math.min(...colors.text)>140,selector+' needs readable text: '+JSON.stringify(colors));
}

test('dark mode persists without changing card pixels, project data or undo history',async()=>{
 const app=await openApp();try{const {page}=app;page.setDefaultTimeout(5000);
  assert.equal(await page.locator('#theme-toggle').count(),1,'the header needs a theme switch');
  const before=await saveProject(page,'theme-before.json'),pixels=await page.locator('#card-canvas').evaluate(c=>c.toDataURL());
  await page.locator('#theme-toggle').click();
  assert.equal(await page.locator('#theme-toggle').getAttribute('aria-pressed'),'true');
  for(const selector of ['body','.library','#inspector','#card-name'])await darkSurface(page,selector);
  assert.equal(await page.locator('#card-canvas').evaluate(c=>c.toDataURL()),pixels,'theme must never recolor the artwork');
  assert.equal(await page.locator('#undo').isDisabled(),true);
  assert.deepEqual(await saveProject(page,'theme-after.json'),before);
  await page.screenshot({path:path.join(qa,'theme-dark-desktop.png'),animations:'disabled'});
  await page.reload();await page.locator('[data-ready=true]').waitFor();
  assert.equal(await page.locator('#theme-toggle').getAttribute('aria-pressed'),'true');await darkSurface(page,'body');
  await page.locator('#theme-toggle').click();
  assert.equal(await page.locator('#theme-toggle').getAttribute('aria-pressed'),'false');
  await page.reload();await page.locator('[data-ready=true]').waitFor();
  assert.equal(await page.locator('#theme-toggle').getAttribute('aria-pressed'),'false');
  assert.deepEqual(app.pageErrors,[]);assert.deepEqual(app.httpRequests,[]);
 }finally{await app.browser.close();}
});

test('dark mode covers painting, effects and dialogs while keeping A4 paper white',async()=>{
 const app=await openApp();try{const {page}=app;page.setDefaultTimeout(5000);
  assert.equal(await page.locator('#theme-toggle').count(),1,'the theme switch must exist');await page.locator('#theme-toggle').click();
  await page.locator('#open-painting').click();await page.locator('#painting-editor').waitFor();
  for(const selector of ['#painting-editor','.paint-panel','.paint-tools','#brush-size'])await darkSurface(page,selector);
  assert.equal(await page.locator('.paint-surface').evaluate(n=>getComputedStyle(n).backgroundColor),'rgb(255, 255, 255)','transparent paint needs its original checkerboard');
  await page.screenshot({path:path.join(qa,'theme-dark-painting.png'),animations:'disabled'});await page.locator('#paint-close').click();
  await page.locator('#card-frame-effects').click();await page.locator('#effect-editor').waitFor();
  for(const selector of ['#effect-editor','.effect-library','.effect-controls','.effect-target-bar'])await darkSurface(page,selector);
  await page.screenshot({path:path.join(qa,'theme-dark-effects.png'),animations:'disabled'});await page.locator('#effect-close').click();
  await page.locator('#keyword-manager').click();await page.locator('.keyword-dialog').waitFor();
  await darkSurface(page,'.keyword-dialog');await darkSurface(page,'.keyword-library');await page.keyboard.press('Escape');
  await page.locator('#paper-tab').click();await page.locator('.paper-sheet').first().waitFor();
  assert.equal(await page.locator('.paper-sheet').first().evaluate(n=>getComputedStyle(n).backgroundColor),'rgb(255, 255, 255)');
  await darkSurface(page,'.print-controls');
  assert.deepEqual(app.pageErrors,[]);
 }finally{await app.browser.close();}
});

test('theme switching stays usable when browser storage is unavailable',async()=>{
 const app=await openApp();try{const {page}=app;page.setDefaultTimeout(5000);
  await page.addInitScript(()=>{Object.defineProperty(Storage.prototype,'getItem',{value(){throw new DOMException('Storage unavailable','SecurityError');}});Object.defineProperty(Storage.prototype,'setItem',{value(){throw new DOMException('Storage unavailable','QuotaExceededError');}});});
  await page.reload();await page.locator('[data-ready=true]').waitFor();
  assert.equal(await page.locator('#theme-toggle').count(),1,'unavailable storage must not prevent mounting the switch');
  await page.locator('#theme-toggle').click();await darkSurface(page,'body');
  await page.locator('#theme-toggle').click();assert.equal(await page.locator('#theme-toggle').getAttribute('aria-pressed'),'false');
  assert.deepEqual(app.pageErrors,[]);
 }finally{await app.browser.close();}
});

test('the phone work menu exposes a touch-sized theme switch',async()=>{
 const app=await openApp();try{const {page}=app;page.setDefaultTimeout(5000);await page.setViewportSize({width:390,height:844});
  assert.equal(await page.locator('#theme-toggle').count(),1,'mobile needs the same switch');
  await page.locator('#mobile-menu-toggle').click();await page.locator('#theme-toggle').click();await darkSurface(page,'body');
  const box=await page.locator('#theme-toggle').boundingBox();assert.ok(box.width>=44&&box.height>=44);
  await page.screenshot({path:path.join(qa,'theme-dark-mobile.png'),animations:'disabled'});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+1));
  assert.deepEqual(app.pageErrors,[]);
 }finally{await app.browser.close();}
});

test('selected cloud, dice, crop and comparison controls keep readable dark-theme labels',async()=>{
 const app=await openApp();try{const {page}=app;await page.locator('#theme-toggle').click();
  // These styles are also used by dialogs that require a configured cloud or image.
  const contrast=await page.evaluate(()=>{
   const fixture=document.createElement('div');document.body.append(fixture);
   const luminance=color=>color.match(/[\d.]+/g).slice(0,3).map(Number).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
   const ratios=[];
   for(const [kind,classes,attrs] of [['cloud','cloud-tabs',{'aria-pressed':'true'}],['dice','dice-options',{class:'selected'}],['crop','image-crop-modes',{'aria-pressed':'true'}],['compare','effect-preview-tools',{id:'effect-compare','aria-pressed':'true'}]]){
    const host=document.createElement('div'),control=document.createElement('button');host.className=classes;
    for(const [key,value] of Object.entries(attrs))control.setAttribute(key,value);
    control.textContent=kind;control.style.transition='none';host.append(control);fixture.append(host);
    const style=getComputedStyle(control),a=luminance(style.color),b=luminance(style.backgroundColor);
    ratios.push({kind,ratio:(Math.max(a,b)+.05)/(Math.min(a,b)+.05)});
   }
   fixture.remove();return ratios;
  });
  assert.ok(contrast.every(({ratio})=>ratio>=4.5),'selected labels need readable contrast: '+JSON.stringify(contrast));
  assert.deepEqual(app.pageErrors,[]);
 }finally{await app.browser.close();}
});
