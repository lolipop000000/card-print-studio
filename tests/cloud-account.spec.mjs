import test from 'node:test';
import assert from 'node:assert/strict';
import {openApp,openHarness} from './helpers/browser.mjs';
import {installCloud} from './helpers/cloud-fixture.mjs';
test('file url shows web-address hint and no login button',async()=>{
 const app=await openApp();try{assert.ok((await app.page.locator('#cloud-account').innerText()).includes('웹 주소에서 열면 클라우드를 쓸 수 있어요'));assert.equal(await app.page.locator('#cloud-sign-in').isVisible(),false);assert.equal(app.httpRequests.length,0);}finally{await app.browser.close();}
});
test('login then nickname dialog then member badge',async()=>{
 const app=await openHarness();try{await installCloud(app.page,{loggedIn:false,nickname:null});await app.page.locator('#cloud-sign-in').click();await app.page.locator('#cloud-nickname-dialog').waitFor();await app.page.locator('#cloud-nickname').fill('카드 친구');await app.page.locator('#cloud-nickname-save').click();await app.page.waitForFunction(()=>!document.querySelector('#cloud-nickname-dialog'));assert.match(await app.page.locator('#cloud-account').innerText(),/카드 친구.*멤버/s);assert.deepEqual(app.pageErrors,[]);}finally{await app.browser.close();}
});
test('approval refresh resumes cloud saving after pending local mode',async()=>{
 const app=await openHarness();try{await installCloud(app.page,{status:'pending'});await app.page.evaluate(async()=>{window.__cloudFixture.profile.status='member';await window.__cloudTest.ctx.cloudAccount.refresh();});await app.page.keyboard.press('Control+s');await app.page.waitForFunction(()=>window.__cloudFixture.works.length===1);assert.equal(await app.page.evaluate(()=>window.__cloudTest.ctx.cloudSession.state().status),'saved');}finally{await app.browser.close();}
});
test('pending user ctrl+s falls back to local save and notices once',async()=>{
 const app=await openHarness();try{await installCloud(app.page,{status:'pending'});
  for(let i=0;i<2;i++){const download=app.page.waitForEvent('download');await app.page.keyboard.press('Control+s');await download;}
  assert.equal(await app.page.evaluate(()=>window.__cloudFixture.calls.filter(c=>c.action.startsWith('work.')).length),0);
  assert.equal(await app.page.locator('#cloud-local-notice').count(),1);assert.match(await app.page.locator('#cloud-account').innerText(),/승인 대기 중/);assert.deepEqual(app.pageErrors,[]);
 }finally{await app.browser.close();}
});
test('member ctrl+s triggers cloud save and shows confirmed state',async()=>{
 const app=await openHarness();try{await installCloud(app.page);await app.page.locator('#card-name').fill('클라우드 몬스터');await app.page.keyboard.press('Control+s');await app.page.waitForFunction(()=>document.querySelector('#cloud-save-state')?.textContent==='확정 저장됨');
  assert.equal(await app.page.evaluate(()=>window.__cloudFixture.calls.filter(c=>c.action==='work.create').length),1);
  assert.equal(await app.page.evaluate(()=>window.__cloudFixture.works[0].data.cards[0].name),'클라우드 몬스터');assert.deepEqual(app.pageErrors,[]);
 }finally{await app.browser.close();}
});
test('revoked during session switches to read-only notice without losing dirty edits',async()=>{
 const app=await openHarness();try{await installCloud(app.page);await app.page.keyboard.press('Control+s');await app.page.waitForFunction(()=>window.__cloudFixture.works.length===1);await app.page.locator('#card-name').fill('계속 남는 카드');await app.page.locator('#card-name').press('Tab');
  await app.page.evaluate(()=>{window.__cloudFixture.profile.status='revoked';return window.__cloudTest.ctx.cloudSession.save().catch(()=>{});});
  await app.page.waitForFunction(()=>document.querySelector('#cloud-save-state')?.dataset.state==='read-only');assert.match(await app.page.locator('#cloud-account').innerText(),/읽기 전용|저장 중지/);assert.equal(await app.page.locator('#card-name').inputValue(),'계속 남는 카드');assert.equal(await app.page.evaluate(()=>window.__cloudTest.ctx.store.isDirty()),true);
 }finally{await app.browser.close();}
});
