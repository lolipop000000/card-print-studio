import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {openApp,qa} from './helpers/browser.mjs';
import {saveProject} from './helpers/flows.mjs';
import {createVisualEffects} from '../src/model/visual-effects.js';

const root=fileURLToPath(new URL('../',import.meta.url));
const reference=build({absWorkingDir:root,stdin:{contents:"import {renderCard} from './src/render/card.js';import {loadAssets} from './src/model/assets.js';window.zoomReference={renderCard,loadAssets};",resolveDir:root},bundle:true,write:false,format:'iife',target:'es2022',loader:{'.woff2':'base64'}});
async function start(dpr=1){
 const app=await openApp();if(dpr!==1){await app.context.close();app.context=await app.browser.newContext({viewport:{width:1440,height:960},deviceScaleFactor:dpr,acceptDownloads:true});await app.context.route(/^https?:/,r=>r.abort());app.page=await app.context.newPage();app.page.on('pageerror',e=>app.pageErrors.push(e.message));app.page.on('request',r=>{if(/^https?:/.test(r.url()))app.httpRequests.push(r.url());});await app.page.goto(new URL('../dist/card-print-studio.html',import.meta.url).href);await app.page.waitForSelector('[data-ready=true]');}
 const {page}=app;page.setDefaultTimeout(12000);await page.locator('#card-name').fill('선명한 이펙트');await page.locator('#card-name').press('Tab');
 const project=await saveProject(page,'zoom-fixture-'+dpr+'.json');project.cards[0].elements.find(e=>e.binding?.field==='name').style.visualEffects=createVisualEffects('neonText');
 await page.locator('#project-file').setInputFiles({name:'zoom.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(project))});await page.waitForFunction(()=>document.getElementById('save-state').textContent==='저장됨');
 await page.locator('#card-text-effects').click();await settled(page);return {...app,project};
}
async function settled(page){await page.waitForFunction(()=>document.getElementById('effect-preview-status')?.dataset.busy==='false');}
async function geometry(page){return page.locator('#effect-preview').evaluate(c=>{const r=c.getBoundingClientRect();return {width:r.width,height:r.height,pixels:c.width,dpi:Number(c.dataset.previewDpi),dpr:devicePixelRatio};});}
async function wheelAt(page,delta,ctrl=true){
 const box=await page.locator('.effect-preview-scroll').boundingBox(),point={x:box.x+box.width*.55,y:box.y+box.height*.45};await page.mouse.move(point.x,point.y);if(ctrl)await page.keyboard.down('Control');try{await page.mouse.wheel(0,delta);}finally{if(ctrl)await page.keyboard.up('Control');}return point;
}
async function pointOnCard(page,point){return page.locator('#effect-preview').evaluate((c,p)=>{const b=c.getBoundingClientRect();return {x:(p.x-b.left)*63/b.width,y:(p.y-b.top)*88/b.height};},point);}

test('Ctrl+wheel zooms at the cursor, keeps browser scale, and does not edit the card',async()=>{
 const e=await start();try{const {page,project}=e;
  await page.locator('#effect-preview-zoom').selectOption('3');await settled(page);await page.locator('.effect-preview-scroll').evaluate(v=>{v.scrollLeft=140;v.scrollTop=270;});
  const area=await page.locator('.effect-preview-scroll').boundingBox(),point={x:area.x+area.width*.55,y:area.y+area.height*.45},beforePoint=await pointOnCard(page,point),before=await geometry(page),browserWidth=await page.evaluate(()=>innerWidth);
  await wheelAt(page,-120);await page.waitForTimeout(250);await settled(page);const after=await geometry(page);
  assert.ok(after.width>before.width+40,'Ctrl+wheel must enlarge the effect canvas');assert.ok(Number(await page.locator('#effect-preview-zoom').inputValue())>3);
  const afterPoint=await pointOnCard(page,point);assert.ok(Math.abs(afterPoint.x-beforePoint.x)<.15,'horizontal cursor anchor');assert.ok(Math.abs(afterPoint.y-beforePoint.y)<.15,'vertical cursor anchor');assert.equal(await page.evaluate(()=>innerWidth),browserWidth);assert.equal(await page.evaluate(()=>visualViewport.scale),1);
  const width=after.width,top=await page.locator('.effect-preview-scroll').evaluate(v=>v.scrollTop);await wheelAt(page,95,false);await page.waitForTimeout(120);assert.equal((await geometry(page)).width,width);assert.ok(await page.locator('.effect-preview-scroll').evaluate((v,t)=>v.scrollTop>t,top),'plain wheel scrolls');
  await wheelAt(page,120);await page.waitForTimeout(180);assert.ok((await geometry(page)).width<width);
  assert.equal(await page.locator('#effect-editor').getAttribute('data-effect-dirty'),'false');await page.locator('#effect-close').click();assert.deepEqual(await saveProject(page,'zoom-preserved.json'),project);assert.deepEqual(e.pageErrors,[]);assert.deepEqual(e.httpRequests,[]);
 }finally{await e.browser.close();}
});

for(const [dpr,zoom] of [[1,'3'],[2,'2']])test('zoomed preview rerenders real effect pixels for '+dpr+'x display density',async()=>{
 const e=await start(dpr);try{const {page,project}=e;await page.locator('#effect-preview-zoom').selectOption(zoom);await settled(page);const g=await geometry(page);
  assert.ok(g.pixels>=g.width*dpr-.6,'preview backing pixels must cover the display, instead of stretching the old bitmap');
  await page.addScriptTag({content:(await reference).outputFiles[0].text});
  const pixels=await page.evaluate(async p=>{
   const canvas=document.getElementById('effect-preview'),dpi=Number(canvas.dataset.previewDpi),actual=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data,ref=document.createElement('canvas'),assets=await window.zoomReference.loadAssets(p);window.zoomReference.renderCard(ref.getContext('2d',{willReadFrequently:true}),p,p.cards[0],assets,dpi,{timeSec:p.print.effectFrameSec});
   const expected=ref.getContext('2d').getImageData(0,0,ref.width,ref.height).data;let changed=0;for(let i=0;i<actual.length;i++)if(actual[i]!==expected[i])changed++;return {changed,width:ref.width,height:ref.height,actualWidth:canvas.width,actualHeight:canvas.height};
  },project);assert.equal(pixels.actualWidth,pixels.width);assert.equal(pixels.actualHeight,pixels.height);assert.equal(pixels.changed,0,'same frozen frame must be rendered afresh at the zoom resolution');
  if(dpr===1){await page.locator('.effect-preview-scroll').evaluate(v=>{v.scrollTop=0;v.scrollLeft=0;});await page.locator('.effect-preview-scroll').screenshot({path:path.join(qa,'effect-preview-crisp-300.png')});}
  await page.locator('#effect-preview-zoom').selectOption('1');await page.locator('#effect-print-quality').check();await settled(page);assert.equal((await geometry(page)).pixels,744,'300dpi print inspection stays available at 100%');
  await page.locator('#effect-close').click();assert.deepEqual(await saveProject(page,'zoom-density-preserved-'+dpr+'.json'),project);assert.deepEqual(e.pageErrors,[]);assert.deepEqual(e.httpRequests,[]);
 }finally{await e.browser.close();}
});

test('wheel limits stay bounded, fallback pixels stay crisp, and zoom survives playback without changing print time',async()=>{
 const e=await start();try{const {page,project}=e;
  const rejected=await page.locator('.effect-preview-scroll').evaluate(v=>{
   const fire=(deltaY,deltaMode=0)=>{const r=v.getBoundingClientRect(),event=new WheelEvent('wheel',{deltaY,deltaMode,ctrlKey:true,clientX:r.x+r.width/2,clientY:r.y+r.height/2,bubbles:true,cancelable:true});v.dispatchEvent(event);return event.defaultPrevented;};return [fire(-1e6),fire(-1e6,1),fire(-1e6,2),fire(-1e6)];
  });assert.deepEqual(rejected,[true,true,true,true]);await settled(page);assert.equal(await page.locator('#effect-preview-zoom').inputValue(),'8');const maximum=await geometry(page);assert.ok(maximum.dpi<=600);assert.ok(maximum.pixels>0&&maximum.pixels<1600);assert.equal(await page.locator('#effect-preview').evaluate(c=>getComputedStyle(c).imageRendering),'pixelated');
  await page.locator('#effect-play').click();await page.waitForFunction(()=>Number(document.getElementById('effect-time').value)>1.25);await wheelAt(page,100);assert.equal(await page.locator('#effect-play').getAttribute('aria-pressed'),'true');await page.locator('#effect-play').click();assert.equal(await page.locator('#effect-frame-label').innerText(),'인쇄 1.20초');
  await page.locator('#effect-preview-zoom').selectOption('0.5');await wheelAt(page,300);await settled(page);assert.equal(await page.locator('#effect-preview-zoom').inputValue(),'0.5');
  await page.locator('#effect-close').click();await page.locator('#card-text-effects').click();await settled(page);await wheelAt(page,-120);await page.waitForTimeout(200);assert.ok(Number(await page.locator('#effect-preview-zoom').inputValue())<1.3,'reopening must not accumulate old wheel handlers');
  await page.locator('#effect-close').click();assert.deepEqual(await saveProject(page,'zoom-limit-preserved.json'),project);assert.deepEqual(e.pageErrors,[]);
 }finally{await e.browser.close();}
});
