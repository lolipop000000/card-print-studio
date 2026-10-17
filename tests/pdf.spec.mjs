import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {openApp,qa} from './helpers/browser.mjs';
import {saveProject} from './helpers/flows.mjs';
test('offline UI downloads a ten-card four-page duplex PDF with all skills and common back',async()=>{const {browser,page}=await openApp();try{
 const requests=[];page.on('request',r=>{if(/^https?:/.test(r.url()))requests.push(r.url());});
 for(const [sel,v] of [['#card-name','별빛 정령'],['#card-quantity','10'],['#hp-reduction','25']]){await page.locator(sel).fill(v);await page.locator(sel).press('Tab');}
 await page.locator('#attribute-menu-toggle').click();await page.locator('#attribute-light').check();await page.locator('#attribute-neutral').uncheck();await page.locator('#add-passive').click();await page.locator('#passives .skill-name').fill('별의 보호');await page.locator('#passives .skill-name').press('Tab');await page.locator('#passives .skill-effect').fill('매 턴 체력을 5 회복한다.');
 await page.locator('#add-active').click();await page.locator('#actives .skill-name').fill('빛의 화살');await page.locator('#actives .skill-name').press('Tab');await page.locator('#actives .skill-effect').fill('대미지 30. 주사위 성공 시 추가 대미지 10.');
 await page.locator('#actives').getByLabel('6면 주사위 조건',{exact:true}).check();await page.getByRole('button',{name:'긴 효과 맞춤',exact:true}).click();
 await page.locator('#back-tab').click();await page.getByRole('button',{name:'텍스트 추가',exact:true}).click();await page.locator('#element-content').fill('우리의 카드게임');
 await page.locator('#paper-tab').click();await page.locator('#print-duplex').check();
 const wait=page.waitForEvent('download',{timeout:60000});await page.locator('#export-pdf').click();const d=await wait;await d.saveAs(path.join(qa,'duplex.pdf'));
 const data=await readFile(path.join(qa,'duplex.pdf'));assert.equal(data.subarray(0,5).toString(),'%PDF-');assert.ok(data.length>10000);assert.equal(requests.length,0);
 }finally{await browser.close();}});
test('an overfull skill keeps its concrete warning and exports PDF without rewriting the card',async()=>{const env=await openApp();const {browser,page}=env;try{
 await page.locator('#add-active').click();await page.locator('#auto-skill-layout').uncheck();
 await page.locator('#actives .skill-effect').fill('절대로누락되면안되는긴효과🌊'.repeat(250));await page.locator('#actives .skill-effect').press('Tab');
 const before=await saveProject(page,'pdf-overfull-before.json');
 const detail=/카드 “새 몬스터” · 액티브 스킬 “새 액티브” 효과: [0-9.]+pt로 줄여도 [1-9]\d+줄이 필요합니다\. 필요한 높이 \d+(?:\.\d+)?mm, 현재 영역 [0-9.]+ × [0-9.]+mm입니다\./;
 assert.match(await page.locator('#card-warnings').innerText(),detail);
 await page.locator('#paper-tab').click();const download=page.waitForEvent('download',{timeout:60000});await page.locator('#export-pdf').click();
 const file=path.join(qa,'overfull-allowed.pdf');await (await download).saveAs(file);assert.equal((await readFile(file)).subarray(0,5).toString(),'%PDF-');
 await page.waitForFunction(()=>!document.getElementById('export-pdf').disabled);await page.locator('#card-tab').click();
 assert.match(await page.locator('#card-warnings').innerText(),detail);assert.deepEqual(await saveProject(page,'pdf-overfull-after.json'),before);
 assert.deepEqual(env.pageErrors,[]);assert.deepEqual(env.httpRequests,[]);
 }finally{await browser.close();}});
