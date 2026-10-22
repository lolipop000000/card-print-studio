import test from 'node:test';
import assert from 'node:assert/strict';
import {openApp,qa} from './helpers/browser.mjs';
import path from 'node:path';

async function phone(width,height){const app=await openApp(),url=app.page.url();await app.context.close();app.context=await app.browser.newContext({viewport:{width,height},isMobile:true,hasTouch:true});await app.context.route(/^https?:/,route=>route.abort());app.page=await app.context.newPage();app.page.setDefaultTimeout(10000);app.page.on('pageerror',error=>app.pageErrors.push(error.message));await app.page.goto(url);await app.page.locator('[data-ready=true]').waitFor();return app;}

for(const [width,height] of [[390,844],[844,390]])test('phone '+width+' has one save action and a reachable bottom navigation without hiding the canvas',async()=>{
 const app=await phone(width,height);try{const {page}=app,nav=await page.locator('.mobile-bottom-bar').boundingBox();assert.ok(nav&&nav.y+nav.height<=height+1&&nav.y>=height-85,'primary navigation must sit at the bottom');
  await page.locator('#mobile-menu-toggle').tap();assert.equal(await page.getByRole('button',{name:'프로젝트 저장',exact:true}).count(),1);assert.equal(await page.getByRole('button',{name:'에셋 보관함',exact:true}).count(),0,'the library must not be repeated in More');assert.equal(await page.getByRole('button',{name:'프로젝트 불러오기',exact:true}).count(),1);assert.equal(await page.getByRole('button',{name:'프로젝트 파일 가져오기',exact:true}).count(),0,'Load already offers JSON import');await page.locator('#mobile-menu-toggle').tap();
  await page.locator('#mobile-editor').tap();await page.getByRole('button',{name:'사용자 그림 펼치기',exact:true}).tap();assert.equal(await page.locator('#open-painting').isVisible(),true);await page.getByRole('button',{name:'사용자 그림 접기',exact:true}).tap();assert.equal(await page.locator('#open-painting').isVisible(),false);
  await page.locator('#card-name').fill('모바일 배치');await page.locator('#card-name').press('Tab');assert.equal(await page.getByRole('button',{name:'사용자 그림 펼치기',exact:true}).count(),1,'editing a field must preserve collapsed sections');
  await page.locator('#mobile-preview').tap();const canvas=await page.locator('.canvas-scroll').boundingBox();assert.ok(canvas.height>=120,'the canvas needs usable height');
  await page.locator('#mobile-library').tap();const search=await page.locator('#asset-search').boundingBox();assert.ok(search.y<180,'search and materials should come before management');assert.equal(await page.locator('#asset-connect').isVisible(),false);await page.locator('#asset-library-tools > summary').tap();assert.equal(await page.locator('#asset-export-json').isVisible(),true);
  await page.locator('#asset-library-close').tap();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);await page.screenshot({path:path.join(qa,'mobile-layout-'+width+'.png')});
  await page.locator('#mobile-editor').tap();await page.getByRole('button',{name:'시각 이펙트 펼치기',exact:true}).tap();await page.locator('#card-frame-effects').tap();
  const transport=await page.locator('.effect-transport').boundingBox();assert.ok(transport.y+transport.height<=height,'effect playback controls must remain inside the phone screen');
  await page.locator('#effect-preview-options > summary').tap();const duration=page.locator('#effect-preview-duration');await duration.fill('3');await duration.press('Tab');
  const input=await duration.boundingBox();assert.ok(input.y>=0&&input.y+input.height<=height,'duration must be reachable without clipping above the composer grid');assert.deepEqual(app.pageErrors,[]);
 }finally{await app.browser.close();}
});
