import test from 'node:test';
import assert from 'node:assert/strict';
import {openApp,qa} from './helpers/browser.mjs';
import path from 'node:path';
import {saveProject} from './helpers/flows.mjs';

test('card six-second preview supports cancel, sharp playback, Escape and preserves saved data',async()=>{
 const app=await openApp();const {page}=app;try{
  page.setDefaultTimeout(12000);await page.locator('#card-name').fill('고화질 미리보기');await page.locator('#card-name').press('Tab');
  const before=await saveProject(page,'hq-before.json');
  assert.equal(await page.locator('#card-effect-prerender').count(),1,'card transport needs the six-second button');
  await page.locator('#card-effect-prerender').click();await page.locator('#effect-video-viewer').waitFor();await page.locator('#effect-video-close').click();
  assert.equal(await page.locator('#effect-video-viewer').count(),0);
  await page.locator('#card-effect-prerender').click();await page.waitForSelector('#effect-video-viewer[data-state=ready]',{timeout:120000});
  const info=await page.locator('#effect-video-player').evaluate(async video=>{
   video.pause();video.currentTime=4;await new Promise(r=>video.addEventListener('seeked',r,{once:true}));
   const r=video.getBoundingClientRect();return {width:video.videoWidth,height:video.videoHeight,duration:video.duration,current:video.currentTime,controls:video.controls,loop:video.loop,fits:r.width<=innerWidth&&r.height<=innerHeight};
  });assert.deepEqual([info.width,info.height],[744,1039]);assert.equal(info.duration,6);assert.equal(info.current,4);assert.equal(info.controls,true);assert.equal(info.loop,true);assert.equal(info.fits,true);
  assert.equal(await page.locator('#card-effect-play').getAttribute('aria-pressed'),'false');
  await page.keyboard.press('Escape');assert.equal(await page.locator('#effect-video-viewer').count(),0);
  assert.deepEqual(await saveProject(page,'hq-after.json'),before);assert.deepEqual(app.pageErrors,[]);assert.deepEqual(app.httpRequests,[]);
 }finally{await app.browser.close();}
});

test('effects editor previews its draft and closes only the video on Escape, including a phone viewport',async()=>{
 const app=await openApp();const {page}=app;try{
  await page.locator('#card-name').fill('별빛 시험');await page.locator('#card-name').press('Tab');const before=await saveProject(page,'hq-draft-before.json');
  await page.locator('#card-text-effects').click();await page.waitForFunction(()=>document.getElementById('effect-preview-status')?.dataset.busy==='false');
  assert.equal(await page.locator('#effect-prerender').count(),1,'effects transport needs the six-second button');
  await page.locator('#effect-start-preset').selectOption('fourPointStarlight');await page.waitForFunction(()=>document.getElementById('effect-preview-status')?.dataset.busy==='false');
  await page.locator('#effect-prerender').click();await page.waitForSelector('#effect-video-viewer[data-state=ready]',{timeout:120000});
  assert.equal(await page.locator('#effect-video-viewer').getAttribute('data-selected-only'),'true');
  await page.locator('#effect-video-player').evaluate(video=>video.pause());await page.locator('#effect-video-viewer').screenshot({path:path.join(qa,'high-quality-six-second-preview.png')});
  await page.setViewportSize({width:390,height:844});const fits=await page.locator('#effect-video-viewer').evaluate(v=>{const r=v.getBoundingClientRect(),video=v.querySelector('video').getBoundingClientRect();return r.x>=0&&r.right<=innerWidth+.5&&video.bottom<=innerHeight;});assert.equal(fits,true);
  await page.keyboard.press('Escape');assert.equal(await page.locator('#effect-video-viewer').count(),0);assert.equal(await page.locator('#effect-editor').getAttribute('open'),'');assert.equal(await page.locator('#effect-editor').getAttribute('data-effect-dirty'),'true');
  await page.setViewportSize({width:1440,height:960});await page.locator('#effect-undo').click();await page.locator('#effect-close').click();
  assert.deepEqual(await saveProject(page,'hq-draft-after.json'),before);assert.deepEqual(app.pageErrors,[]);assert.deepEqual(app.httpRequests,[]);
 }finally{await app.browser.close();}
});
