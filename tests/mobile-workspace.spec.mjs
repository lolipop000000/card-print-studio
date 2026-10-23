import {openMobileSection} from './helpers/flows.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {openApp,qa} from './helpers/browser.mjs';
import {createProject} from '../src/model/project.js';
import {createVisualEffects,makeVisualEffectLayer} from '../src/model/visual-effects.js';

async function openPhone(width=390,height=844,{unsupported=false}={}){
 const app=await openApp(),url=app.page.url();await app.context.close();
 app.context=await app.browser.newContext({viewport:{width,height},isMobile:true,hasTouch:true,deviceScaleFactor:2,acceptDownloads:true});
 await app.context.route(/^https?:/,route=>route.abort());
 if(unsupported)await app.context.addInitScript(()=>Object.defineProperty(window,'showDirectoryPicker',{value:undefined,configurable:true}));
 app.page=await app.context.newPage();app.page.setDefaultTimeout(10_000);app.page.on('pageerror',error=>app.pageErrors.push(error.message));
 await app.page.goto(url);await app.page.locator('[data-ready=true]').waitFor();return app;
}
async function menu(page){if(await page.locator('#mobile-menu-toggle').getAttribute('aria-expanded')==='false')await page.locator('#mobile-menu-toggle').tap();}
async function save(page,name){await menu(page);const waiting=page.waitForEvent('download');await page.getByRole('button',{name:'프로젝트 파일 내보내기',exact:true}).tap();const download=await waiting,file=path.join(qa,name);await download.saveAs(file);await page.locator('#mobile-menu-toggle').tap();return JSON.parse(await readFile(file,'utf8'));}
async function noOverflow(page){const size=await page.evaluate(()=>({page:document.documentElement.scrollWidth,screen:document.documentElement.clientWidth}));assert.ok(size.page<=size.screen+1,'phone workspace must not overflow horizontally: '+JSON.stringify(size));assert.equal(size.screen,page.viewportSize().width,'the phone must keep its natural layout viewport');}
const touchSessions=new WeakMap();
async function touchSession(page){
 if(touchSessions.has(page))return touchSessions.get(page);
 const session=await page.context().newCDPSession(page),send=(type,points)=>session.send('Input.dispatchTouchEvent',{type,touchPoints:points.map(([id,x,y])=>({id,x,y,radiusX:4,radiusY:4,force:1}))});
 const touch=async(type,points)=>{
  await send(type,points);
  if(type==='touchEnd'&&points.length===0){
   // Chromium raw CDP drags can suppress the next tap's click even on a blank page.
   // Reset that test-input state outside the app, only after every real contact lifts.
   await send('touchStart',[[99,-1,-1]]);await send('touchCancel',[]);
  }
 };
 touchSessions.set(page,touch);return touch;
}
async function pinch(page,selector){const box=await page.locator(selector).boundingBox(),x=box.x+box.width/2,y=box.y+Math.min(150,box.height/2),touch=await touchSession(page);await touch('touchStart',[[1,x-35,y]]);await touch('touchStart',[[1,x-35,y],[2,x+35,y]]);await touch('touchMove',[[1,x-55,y+20],[2,x+55,y+20]]);await touch('touchEnd',[[1,x-55,y+20]]);await touch('touchMove',[[1,x-65,y+30]]);await touch('touchEnd',[]);}
async function pan(page,selector){const box=await page.locator(selector).boundingBox(),x=box.x+box.width/2,y=box.y+Math.min(150,box.height/2),touch=await touchSession(page);await touch('touchStart',[[1,x-30,y]]);await touch('touchStart',[[1,x-30,y],[2,x+30,y]]);await touch('touchMove',[[1,x-50,y-15],[2,x+10,y-15]]);await touch('touchEnd',[]);}

for(const [width,height] of [[360,800],[390,844]])test('phone '+width+' switches cards, editing and preview with readable controls and JSON fallback',async()=>{
 const app=await openPhone(width,height,{unsupported:true});try{const {page}=app;
  await noOverflow(page);
  assert.equal(await page.getByRole('tablist',{name:'모바일 작업 영역'}).count(),1,'phone workspace needs reachable pane navigation');
  for(const id of ['mobile-cards','mobile-editor','mobile-preview']){const box=await page.locator('#'+id).boundingBox();assert.ok(box.height>=44&&box.width>=44,'phone tabs must be touch targets');}
  await page.locator('#mobile-cards').tap();await page.locator('#add-item').tap();assert.equal(await page.locator('.card-row').count(),2);await noOverflow(page);
  await page.locator('#mobile-editor').tap();await page.locator('#card-name').fill('휴대폰의 카드');await page.locator('#card-name').press('Tab');
  // A smaller viewport represents the available content area above a virtual keyboard.
  await page.setViewportSize({width,height:440});await page.locator('#card-name').focus();await page.locator('#card-name').scrollIntoViewIfNeeded();const field=await page.locator('#card-name').boundingBox();assert.ok(field.y>=0&&field.y+field.height<=440);await noOverflow(page);await page.setViewportSize({width,height});
  await page.locator('#mobile-preview').tap();assert.equal(await page.locator('#card-canvas').isVisible(),true);assert.equal(await page.locator('#inspector').isVisible(),false);await page.locator('#paper-tab').tap();await page.locator('.paper-sheet').first().waitFor();await noOverflow(page);
  await menu(page);assert.match(await page.locator('#workspace-status').innerText(),/JSON/);const pending=page.waitForEvent('download');await page.getByRole('button',{name:'프로젝트 저장',exact:true}).tap();const downloaded=await pending;assert.equal(JSON.parse(await readFile(await downloaded.path(),'utf8')).cards.at(-1).name,'휴대폰의 카드');
  await page.getByRole('button',{name:'프로젝트 불러오기',exact:true}).tap();assert.equal(await page.locator('#project-import-folder').isDisabled(),true);const picker=page.waitForEvent('filechooser');await page.locator('#project-import-file').tap();await(await picker).setFiles({name:'phone.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(createProject()))});await page.locator('#mobile-cards').tap();await page.waitForFunction(()=>document.querySelectorAll('.card-row').length===1);await page.locator('#mobile-preview').tap();
  if(await page.locator('#mobile-menu-toggle').getAttribute('aria-expanded')==='true')await page.locator('#mobile-menu-toggle').tap();await noOverflow(page);const paper=await page.locator('.paper-scroll').boundingBox();assert.ok(paper.height>=160&&paper.y+paper.height<=height,'the A4 preview needs usable space below its scrollable controls: '+JSON.stringify(paper));
  await page.screenshot({path:path.join(qa,'mobile-workspace-'+width+'.png')});await page.locator('#card-tab').tap();await page.locator('#card-zoom-fit').tap();await page.screenshot({path:path.join(qa,'mobile-card-'+width+'.png')});assert.deepEqual(app.pageErrors,[]);
 }finally{await app.browser.close();}
});

test('two fingers zoom and pan the card without committing the first finger edit, and a fresh finger still moves an element',async()=>{
 const app=await openPhone();try{const {page}=app;
  assert.equal(await page.locator('#mobile-preview').count(),1,'phone preview navigation must exist');
  const before=await save(page,'mobile-gesture-before.json');await page.locator('#card-zoom-fit').tap();
  const initial=await page.locator('#card-canvas').boundingBox();await pinch(page,'.canvas-scroll');const enlarged=await page.locator('#card-canvas').boundingBox();assert.ok(enlarged.width>initial.width*1.35,'two fingers must zoom the card');
  await page.locator('.canvas-scroll').evaluate(node=>node.scrollLeft=(node.scrollWidth-node.clientWidth)/2);const centered=await page.locator('#card-canvas').boundingBox();await pan(page,'.canvas-scroll');const panned=await page.locator('#card-canvas').boundingBox();assert.ok(panned.x<centered.x-10,'two fingers moving together must pan the enlarged card');
  assert.equal(await page.locator('#undo').isDisabled(),true);assert.deepEqual(await save(page,'mobile-gesture-after.json'),before);
  await page.locator('#card-zoom-fit').tap();const box=await page.locator('#card-canvas').boundingBox(),element=before.cards[0].elements.find(e=>e.binding?.field==='name'),r=element.rect,x=box.x+(r.x+r.w*.25)/63*box.width,y=box.y+(r.y+r.h/2)/88*box.height,touch=await touchSession(page);
  await touch('touchStart',[[1,x,y]]);await touch('touchMove',[[1,x+10,y+10]]);await touch('touchEnd',[]);
  const moved=await save(page,'mobile-single-edit.json');assert.notDeepEqual(moved.cards[0].elements.find(e=>e.id===element.id).rect,element.rect,'a fresh single finger must still edit');assert.deepEqual(app.pageErrors,[]);
 }finally{await app.browser.close();}
});

test('phone card playback uses a bounded raster budget and restores the paused frame without saving view state',async()=>{
 const app=await openPhone();try{const {page}=app;
  assert.equal(await page.locator('#mobile-preview').count(),1);const before=await save(page,'mobile-playback-before.json');
  const full=Number(await page.locator('#card-canvas').getAttribute('data-preview-dpi'));await page.locator('#card-effect-play').tap();
  await page.waitForFunction(()=>document.getElementById('card-canvas').dataset.previewActive==='true');assert.ok(Number(await page.locator('#card-canvas').getAttribute('data-preview-dpi'))<=150,'animation must keep a local raster budget');
  await page.locator('#card-effect-play').tap();await page.waitForFunction(()=>document.getElementById('card-canvas').dataset.previewActive==='false');assert.equal(Number(await page.locator('#card-canvas').getAttribute('data-preview-dpi')),full);
  assert.deepEqual(await save(page,'mobile-playback-after.json'),before);assert.deepEqual(app.pageErrors,[]);
 }finally{await app.browser.close();}
});

test('effect and painting dialogs fit the phone and two-finger navigation leaves drafts and paint pixels clean',async()=>{
 const app=await openPhone(360,800);try{const {page}=app;
  assert.equal(await page.locator('#mobile-editor').count(),1,'phone editor navigation must exist');await page.locator('#mobile-editor').tap();
  const fixture=createProject();fixture.cards[0].template='custom';fixture.cards[0].autoSkillLayout=false;const recipe=createVisualEffects();recipe.layers=[makeVisualEffectLayer('flame',{origin:{x:.2,y:.25,w:.35,h:.3},motion:{enabled:false,speed:1}})];fixture.cards[0].visualEffects=recipe;
  await page.locator('#project-file').setInputFiles({name:'phone-effect.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(fixture))});await openMobileSection(page,'시각 이펙트');await page.locator('#card-frame-effects').tap();await page.locator('#effect-editor').waitFor();
  const effectBox=await page.locator('#effect-editor').boundingBox();assert.ok(effectBox.width<=360&&effectBox.x>=0);await page.getByRole('tab',{name:'미리보기',exact:true}).last().tap();
  await page.locator('#effect-transform-toggle').tap();const width=await page.locator('#effect-preview').evaluate(c=>c.getBoundingClientRect().width);await pinch(page,'.effect-preview-scroll');assert.ok(await page.locator('#effect-preview').evaluate((c,w)=>c.getBoundingClientRect().width>w,width));
  assert.equal(await page.locator('#effect-editor').getAttribute('data-effect-dirty'),'false');assert.equal(await page.locator('#effect-undo').isDisabled(),true);await page.locator('#effect-close').tap();
  await openMobileSection(page,'사용자 그림');await page.locator('#open-painting').tap();await page.locator('#painting-editor').waitFor();const paintBox=await page.locator('#painting-editor').boundingBox();assert.ok(paintBox.width<=360&&paintBox.x>=0);
  const before=await page.locator('#paint-canvas').evaluate(c=>c.toDataURL()),zoom=Number(await page.locator('#paint-zoom').inputValue());await pinch(page,'#paint-viewport');assert.ok(Number(await page.locator('#paint-zoom').inputValue())>zoom);assert.equal(await page.locator('#paint-canvas').evaluate(c=>c.toDataURL()),before);assert.equal(await page.locator('#painting-editor').getAttribute('data-paint-dirty'),'false');assert.equal(await page.locator('#paint-undo').isDisabled(),true);
  await page.getByRole('tab',{name:'설정 · 레이어',exact:true}).tap();await page.locator('#brush-size').fill('24');await page.locator('#brush-size').press('Tab');await page.getByRole('tab',{name:'그리기',exact:true}).tap();
  await page.screenshot({path:path.join(qa,'mobile-painting-360.png')});const surface=await page.locator('#paint-canvas').boundingBox(),viewport=await page.locator('#paint-viewport').boundingBox(),x=(Math.max(surface.x,viewport.x)+Math.min(surface.x+surface.width,viewport.x+viewport.width))/2,y=(Math.max(surface.y,viewport.y)+Math.min(surface.y+surface.height,viewport.y+viewport.height))/2,touch=await touchSession(page);
  await touch('touchStart',[[1,x,y]]);await touch('touchMove',[[1,x+15,y+10]]);await touch('touchEnd',[]);await page.waitForFunction(()=>!document.getElementById('paint-undo').disabled);assert.notEqual(await page.locator('#paint-canvas').evaluate(c=>c.toDataURL()),before,'a fresh single finger must still paint');
  await page.locator('#paint-undo').tap();await page.waitForFunction(()=>document.getElementById('painting-editor').dataset.busy==='false'&&document.getElementById('paint-undo').disabled&&!document.getElementById('paint-redo').disabled&&document.getElementById('painting-editor').dataset.paintDirty==='false');const restored=await page.locator('#paint-canvas').evaluate(c=>c.toDataURL());assert.ok(restored===before,'undo must restore the exact starting PNG');await page.locator('#paint-close').tap();assert.deepEqual(app.pageErrors,[]);
 }finally{await app.browser.close();}
});

test('starting a pinch over an existing floating paint selection preserves its earlier uncommitted transform',async()=>{
 const app=await openPhone();try{const {page}=app;
  await page.locator('#mobile-editor').tap();await openMobileSection(page,'사용자 그림');await page.locator('#open-painting').tap();await page.locator('#painting-editor').waitFor();
  await page.getByRole('tab',{name:'설정 · 레이어',exact:true}).tap();await page.locator('#select-all').tap();await page.locator('#select-x').fill('24');await page.locator('#select-x').press('Tab');
  await page.getByRole('tab',{name:'그리기',exact:true}).tap();assert.equal(await page.locator('#paint-selection').evaluate(node=>node.style.left),'24px');
  await pinch(page,'#paint-viewport');assert.equal(await page.locator('#paint-selection').evaluate(node=>node.style.left),'24px','pinch must restore the selection as it was before its first finger');
  await page.getByRole('tab',{name:'설정 · 레이어',exact:true}).tap();assert.equal(await page.locator('#select-commit').isEnabled(),true,'the existing floating transform must remain available');await page.locator('#select-cancel').tap();await page.locator('#paint-close').tap();assert.deepEqual(app.pageErrors,[]);
 }finally{await app.browser.close();}
});
