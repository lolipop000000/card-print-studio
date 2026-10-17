import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {openApp,qa} from './helpers/browser.mjs';

async function save(page,name){const pending=page.waitForEvent('download');await page.getByRole('button',{name:'프로젝트 파일 내보내기',exact:true}).click();const out=path.join(qa,name);await(await pending).saveAs(out);return JSON.parse(await readFile(out,'utf8'));}
async function wheel(page,selector,delta,ctrl=true){return page.locator(selector).evaluate((node,{delta,ctrl})=>{const area=node.getBoundingClientRect(),x=area.left+node.clientWidth*.55,y=area.top+node.clientHeight*.45,event=new WheelEvent('wheel',{bubbles:true,cancelable:true,ctrlKey:ctrl,deltaY:delta,clientX:x,clientY:y});node.dispatchEvent(event);return {prevented:event.defaultPrevented,x,y};},{delta,ctrl});}
const canvasSize=page=>page.locator('#card-canvas').evaluate(canvas=>({left:canvas.getBoundingClientRect().left,top:canvas.getBoundingClientRect().top,width:canvas.getBoundingClientRect().width,height:canvas.getBoundingClientRect().height,pixels:canvas.width,dpi:Number(canvas.dataset.previewDpi),rendering:canvas.style.imageRendering}));

test('main card Ctrl+wheel zooms at the pointer, remains sharp, and leaves the saved deck and history unchanged',async()=>{
 const {browser,page,httpRequests,pageErrors}=await openApp();try{
  page.setDefaultTimeout(10_000);
  await page.setViewportSize({width:1100,height:900});
  const before=await save(page,'view-zoom-before.json');
  await page.locator('#card-zoom').evaluate(input=>{input.value='12';input.dispatchEvent(new Event('input',{bubbles:true}));});
  await page.locator('.canvas-scroll').evaluate(node=>{node.scrollLeft=100;node.scrollTop=180;});
  const old=await canvasSize(page),anchor=await wheel(page,'.canvas-scroll',-120);
  await page.waitForFunction(width=>document.getElementById('card-canvas').getBoundingClientRect().width>width,old.width);
  const enlarged=await canvasSize(page);
  assert.equal(anchor.prevented,true);assert.ok(enlarged.pixels>old.pixels);
  assert.ok(Math.abs((anchor.x-old.left)/old.width-(anchor.x-enlarged.left)/enlarged.width)<.003);
  assert.ok(Math.abs((anchor.y-old.top)/old.height-(anchor.y-enlarged.top)/enlarged.height)<.003);
  assert.equal(await page.evaluate(()=>window.visualViewport.scale),1);
  const ordinary=await wheel(page,'.canvas-scroll',100,false);assert.equal(ordinary.prevented,false);assert.equal((await canvasSize(page)).width,enlarged.width);
  await wheel(page,'.canvas-scroll',120);assert.ok(Math.abs((await canvasSize(page)).width-old.width)<.1);
  const browserWidth=await page.evaluate(()=>innerWidth);await page.mouse.move(anchor.x,anchor.y);await page.keyboard.down('Control');try{await page.mouse.wheel(0,-100);}finally{await page.keyboard.up('Control');}
  await page.waitForFunction(width=>document.getElementById('card-canvas').getBoundingClientRect().width>width,old.width);assert.equal(await page.evaluate(()=>innerWidth),browserWidth);
  const scrollTop=await page.locator('.canvas-scroll').evaluate(node=>node.scrollTop),width=(await canvasSize(page)).width;await page.mouse.wheel(0,90);await page.waitForFunction(top=>document.querySelector('.canvas-scroll').scrollTop>top,scrollTop);assert.equal((await canvasSize(page)).width,width);
  assert.deepEqual(await save(page,'view-zoom-after.json'),before);assert.equal(await page.locator('#save-state').innerText(),'저장됨');assert.equal(await page.locator('#undo').isDisabled(),true);
  assert.deepEqual(httpRequests,[]);assert.deepEqual(pageErrors,[]);
 }finally{await browser.close();}
});

test('card zoom buttons, 100 percent and fit work on both faces with bounded crisp rendering',async()=>{
 const {browser,page,pageErrors}=await openApp();try{
  page.setDefaultTimeout(10_000);
  await page.locator('#card-zoom-reset').click();let size=await canvasSize(page);assert.ok(Math.abs(size.width-63*96/25.4)<.1);assert.equal(await page.locator('#card-zoom-value').innerText(),'100%');
  await page.locator('#card-zoom-in').click();assert.ok((await canvasSize(page)).width>size.width);
  await page.locator('#card-zoom-out').click();assert.ok(Math.abs((await canvasSize(page)).width-size.width)<.1);
  for(let i=0;i<12;i++)await wheel(page,'.canvas-scroll',-400);
  size=await canvasSize(page);assert.ok(size.width<=63*96/25.4*8+.1);assert.ok(size.dpi<=600);assert.ok((63+24)*(88+24)*(size.dpi/25.4)**2<=4_000_000);assert.equal(size.rendering,'pixelated');
  await page.locator('#back-tab').click();assert.ok(Math.abs((await canvasSize(page)).width-size.width)<.1);
  await page.locator('#card-zoom-fit').click();
  const area=await page.locator('.canvas-scroll').boundingBox();size=await canvasSize(page);assert.ok(size.width<area.width);assert.ok(size.height<area.height);
  await page.screenshot({path:path.join(qa,'main-view-zoom-fit.png')});
  assert.deepEqual(pageErrors,[]);
 }finally{await browser.close();}
});

test('A4 Ctrl+wheel anchors the sheet and renders sharp images at high screen density without changing print dimensions',async()=>{
 const opened=await openApp();const {browser}=opened;let context;try{
  const url=opened.page.url();await opened.context.close();context=await browser.newContext({viewport:{width:1440,height:1000},deviceScaleFactor:2,acceptDownloads:true});await context.route(/^https?:/,route=>route.abort());
  const page=await context.newPage(),errors=[];page.setDefaultTimeout(10_000);page.on('pageerror',error=>errors.push(error.message));await page.goto(url);await page.locator('[data-ready=true]').waitFor();
  const before=await save(page,'paper-wheel-before.json');await page.locator('#paper-tab').click();await page.locator('.paper-cell img').first().waitFor();
  await page.locator('#paper-zoom').fill('150');await page.locator('#paper-zoom').press('Tab');
  await page.waitForFunction(()=>Number(document.querySelector('.paper-sheet')?.style.width.replace('px',''))>1100);
  await page.waitForFunction(()=>document.querySelector('.paper-cell img')?.naturalWidth>0);
  await page.locator('.paper-scroll').evaluate(node=>{node.scrollLeft=140;node.scrollTop=100;});
  const read=()=>page.locator('.paper-sheet').first().evaluate(sheet=>({left:sheet.getBoundingClientRect().left,top:sheet.getBoundingClientRect().top,width:sheet.getBoundingClientRect().width,height:sheet.getBoundingClientRect().height,naturalWidth:sheet.querySelector('img').naturalWidth,widthMm:sheet.dataset.widthMm,heightMm:sheet.dataset.heightMm}));
  const old=await read(),anchor=await wheel(page,'.paper-scroll',-120);
  await page.waitForFunction(width=>document.querySelector('.paper-sheet').getBoundingClientRect().width>width,old.width);
  await page.waitForFunction(pixels=>document.querySelector('.paper-cell img').naturalWidth>pixels,old.naturalWidth);
  const enlarged=await read();assert.equal(anchor.prevented,true);assert.equal(enlarged.widthMm,'210');assert.equal(enlarged.heightMm,'297');
  assert.ok(Math.abs((anchor.x-old.left)/old.width-(anchor.x-enlarged.left)/enlarged.width)<.003);
  assert.ok(Math.abs((anchor.y-old.top)/old.height-(anchor.y-enlarged.top)/enlarged.height)<.003);
  const ordinary=await wheel(page,'.paper-scroll',100,false);assert.equal(ordinary.prevented,false);assert.equal((await read()).width,enlarged.width);
  assert.deepEqual(await save(page,'paper-wheel-after.json'),before);assert.equal(await page.locator('#undo').isDisabled(),true);assert.deepEqual(errors,[]);
  await page.locator('#paper-fit').click();await page.waitForFunction(()=>document.querySelector('.paper-sheet').getBoundingClientRect().width<800);await page.screenshot({path:path.join(qa,'paper-view-zoom-fit.png')});
 }finally{await browser.close();}
});
