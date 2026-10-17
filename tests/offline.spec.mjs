import test from 'node:test';import assert from 'node:assert/strict';import {readFile,writeFile} from 'node:fs/promises';import path from 'node:path';
import {openApp,qa} from './helpers/browser.mjs';import {saveProject,drawStroke,openPainter,downloadClick} from './helpers/flows.mjs';
const pages=bytes=>(bytes.toString('latin1').match(/\/Type\s*\/Page\b/g)||[]).length;
async function fill(page,selector,value){await page.locator(selector).fill(value);await page.locator(selector).press('Tab');}
test('complete offline deck workflow restores named skills and layers in a fresh session and prints matching sheets',async()=>{const first=await openApp(),page=first.page;let second;try{
 await page.setViewportSize({width:1280,height:800});
 await fill(page,'#card-name','해류 정령');await fill(page,'#card-quantity','9');await fill(page,'#hp-reduction','25');await page.locator('#attribute-menu-toggle').click();await page.locator('#attribute-water').check();await page.locator('#attribute-neutral').uncheck();
 for(const [key,names,effects] of [['passives',['물결','젖은 바람'],['체력을 5 회복한다.','판정을 한 번 다시 굴린다.']],['actives',['방울탄','큰 파도'],['대미지 20.','대미지 30.']]]){
  for(let i=0;i<2;i++){await page.locator(key==='passives'?'#add-passive':'#add-active').click();await fill(page,'#'+key+' .skill-name >> nth='+i,names[i]);await page.locator('#'+key+' .skill-effect').nth(i).fill(effects[i]);}
 }
 await page.locator('#actives .check input').last().check();await page.getByRole('button',{name:'긴 효과 맞춤',exact:true}).click();
 await openPainter(page);await page.locator('#paint-resize').click();await page.locator('#paint-new-width').fill('256');await page.locator('#paint-new-height').fill('256');await page.locator('#paint-resize-canvas').click();await page.locator('#paint-new-width').waitFor({state:'hidden'});
 await fill(page,'#paint-layer-name','바탕');await page.locator('#tool-rect').click();await page.locator('#paint-shape-fill').check();await drawStroke(page,{x:.2,y:.2},{x:.8,y:.8});
 await page.locator('#paint-add-layer').click();await fill(page,'#paint-layer-name','선화');await page.locator('#tool-brush').click();await drawStroke(page,{x:.2,y:.4},{x:.8,y:.6});await page.locator('#paint-add-layer').click();await fill(page,'#paint-layer-name','하이라이트');
 const png=await downloadClick(page,'#paint-export-transparent','offline-art.png');assert.ok(png.length>100);
 await page.locator('#paint-apply').click();await page.locator('#painting-editor').waitFor({state:'hidden'});
 await page.locator('#add-item').click();await fill(page,'#card-name','작은 물약');await page.locator('#item-effect').fill('체력을 15 회복한다.');const chosen=page.waitForEvent('filechooser');await page.getByRole('button',{name:'그림 가져오기',exact:true}).click();await (await chosen).setFiles(path.join(qa,'offline-art.png'));await page.waitForFunction(()=>{const c=document.getElementById('card-canvas'),d=c.getContext('2d').getImageData(Math.floor(c.width*32/63),Math.floor(c.height*30/88),1,1).data;return d[0]<80;});
 await page.locator('#back-tab').click();await page.getByRole('button',{name:'텍스트 추가',exact:true}).click();await page.locator('#element-content').fill('우리의 카드게임');
 await page.locator('#paper-tab').click();await page.locator('#print-duplex').uncheck();const single=await downloadClick(page,'#export-pdf','offline-single.pdf');assert.equal(pages(single),2);
 await page.locator('#print-duplex').check();const duplex=await downloadClick(page,'#export-pdf','offline-duplex.pdf');assert.equal(pages(duplex),4);
 await page.locator('#paper-fit').click();await page.screenshot({path:path.join(qa,'offline-paper-1280.png'),fullPage:true});
 const saved=await saveProject(page,'offline-deck.json');assert.equal(saved.cards[0].hpReduction,25);assert.equal(saved.cards[0].passives.length+saved.cards[0].actives.length,4);assert.equal(saved.cards[1].effect,'체력을 15 회복한다.');assert.ok(saved.cards[1].artAssetId);assert.equal(saved.assets[saved.cards[1].artAssetId].dataUrl,'data:image/png;base64,'+png.toString('base64'));assert.ok((await readFile(path.join(qa,'offline-deck.json'))).length>png.length);
 assert.equal(first.httpRequests.length,0);assert.deepEqual(first.pageErrors,[]);await first.browser.close();
 second=await openApp();await second.page.locator('#project-file').setInputFiles(path.join(qa,'offline-deck.json'));await second.page.waitForFunction(()=>document.querySelector('#message')?.textContent.includes('프로젝트를 불러왔어요.'));
 await second.page.locator('.card-select').first().click();assert.equal(await second.page.locator('#passives .skill').count(),2);assert.equal(await second.page.locator('#actives .skill').count(),2);assert.equal(await second.page.locator('#final-hp').innerText(),'75');
 await openPainter(second.page);assert.equal(await second.page.locator('.paint-layer').count(),3);await second.page.locator('#paint-close').click();
 await second.page.setViewportSize({width:760,height:800});await second.page.locator('#card-tab').click();await second.page.screenshot({path:path.join(qa,'offline-editor-narrow.png'),fullPage:true});
 assert.equal(await second.page.locator('#add-active').isVisible(),true);assert.equal(await second.page.evaluate(()=>window.testApi),undefined);assert.deepEqual(await saveProject(second.page,'offline-restored.json'),saved);
 assert.equal(second.httpRequests.length,0);assert.deepEqual(second.pageErrors,[]);await writeFile(path.join(qa,'offline-report.json'),JSON.stringify({httpRequests:0,pageErrors:[],cards:2,totalQuantity:10,skills:4,layers:3,singlePages:2,duplexPages:4,pngBytes:png.length},null,2));
 }catch(e){await page.screenshot({path:path.join(qa,'offline-failure.png'),fullPage:true}).catch(()=>{});throw e;}finally{await first.browser.close();if(second)await second.browser.close();}});
