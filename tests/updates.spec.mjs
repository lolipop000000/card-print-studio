import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {openApp,qa} from './helpers/browser.mjs';

const source='https://studio-updates.test/update.json';
const update=(version='999.0.0',extra={})=>({format:'card-print-studio-update',version,releasedAt:'2026-10-17',notes:['새 브러시','<img src=x onerror=alert(1)>'],downloadUrl:'./card-print-studio.html',...extra});
async function openUpdates(page){assert.equal(await page.locator('#studio-updates').count(),1,'The HTML must provide its own update button');await page.locator('#studio-updates').click();await page.locator('#updates-dialog').waitFor({state:'visible'});}
async function configure(page,url=source){await page.locator('#update-source').fill(url);await page.locator('#updates-check').click();}
// Edge exposes its own download hub as a page; it is not an editor or remote HTML tab.
async function assertNoNewContentTab(context){for(const p of context.pages())if(p.url()==='')await p.waitForURL('edge://downloads-hub/',{timeout:3000});assert.equal(context.pages().filter(p=>p.url()!=='edge://downloads-hub/').length,1);}

test('HTML update dialog opens offline, backs up the dirty deck without marking it saved, and reopens after Esc',async()=>{
 const {browser,page,httpRequests,pageErrors}=await openApp();try{
  await page.locator('#card-name').fill('백업할 미저장 카드');await page.locator('#card-name').press('Tab');
  const appUrl=page.url();await openUpdates(page);
  assert.match(await page.locator('#update-current-version').innerText(),/\d+\.\d+\.\d+/);
  assert.match(await page.locator('#update-status').innerText(),/배포 주소/);
  assert.equal(await page.locator('#update-download').isVisible(),false);assert.deepEqual(httpRequests,[]);
  const pending=page.waitForEvent('download');await page.locator('#update-backup').click();const file=await pending;
  assert.match(file.suggestedFilename(),/\.card-project\.json$/);const out=path.join(qa,'update-backup.card-project.json');await file.saveAs(out);
  const project=JSON.parse(await readFile(out,'utf8'));assert.equal(project.cards[0].name,'백업할 미저장 카드');
  await page.keyboard.press('Escape');await page.locator('#updates-dialog').waitFor({state:'detached'});
  assert.equal(await page.locator('#save-state').innerText(),'미저장');assert.equal(page.url(),appUrl);
  await page.locator('#undo').click();assert.notEqual(await page.locator('#card-name').inputValue(),'백업할 미저장 카드');await page.locator('#redo').click();
  await openUpdates(page);await page.locator('#updates-close').click();assert.equal(await page.locator('#card-name').inputValue(),'백업할 미저장 카드');
  assert.deepEqual(httpRequests,[]);assert.deepEqual(pageErrors,[]);
 }finally{await browser.close();}
});

test('an explicit update check shows notes as text and downloads the new HTML while keeping this editor open',async()=>{
 const {browser,page,context,httpRequests,pageErrors}=await openApp();try{
  await context.route(source,route=>route.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify(update())}));
  await context.route('https://studio-updates.test/card-print-studio.html',route=>route.fulfill({status:200,headers:{'content-type':'text/html','access-control-allow-origin':'*'},body:'<!doctype html><html lang="ko"><title>새 작업실</title></html>'}));
  const appUrl=page.url();await openUpdates(page);assert.deepEqual(httpRequests,[]);await configure(page);
  await page.waitForFunction(()=>document.querySelector('#update-status')?.dataset.state==='available');
  assert.equal(await page.locator('#update-latest-version').innerText(),'999.0.0');assert.match(await page.locator('#update-notes').innerText(),/<img src=x onerror=alert\(1\)>/);
  assert.equal(await page.locator('#update-notes img').count(),0);
  assert.equal(await page.locator('#update-download').getAttribute('href'),'https://studio-updates.test/card-print-studio.html');
  assert.equal(await page.locator('#update-download').getAttribute('target'),'_blank');
  const pending=page.waitForEvent('download',{timeout:5000});await page.locator('#update-download').click();const download=await pending;
  assert.equal(download.suggestedFilename(),'card-print-studio.html');const out=path.join(qa,'update-received.html');await download.saveAs(out);assert.match(await readFile(out,'utf8'),/새 작업실/);
  assert.equal(page.url(),appUrl);assert.equal(await page.locator('[data-ready=true]').count(),1);await assertNoNewContentTab(context);assert.deepEqual(pageErrors,[]);
  assert.equal(httpRequests.filter(u=>u===source).length,1);assert.equal(httpRequests.some(u=>u.includes('백업')),false);
 }finally{await browser.close();}
});

test('a failed HTML download explains the error and keeps a direct link, while a retry saves the file',async()=>{
 const {browser,page,context}=await openApp();try{
  let broken=true;await context.route(source,r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(update())}));
  await context.route('https://studio-updates.test/card-print-studio.html',r=>broken?r.abort():r.fulfill({status:200,contentType:'text/html',body:'<!doctype html><html>새 작업실</html>'}));
  await openUpdates(page);await configure(page);await page.waitForFunction(()=>document.querySelector('#update-status')?.dataset.state==='available');
  await page.locator('#update-download').click();await page.waitForFunction(()=>document.querySelector('#update-download-status')?.dataset.state==='error');
  assert.match(await page.locator('#update-download-status').innerText(),/연결/);assert.equal(await page.locator('#update-direct-link').isVisible(),true);assert.equal(await page.locator('#update-direct-link').getAttribute('href'),'https://studio-updates.test/card-print-studio.html');
  broken=false;const pending=page.waitForEvent('download');await page.locator('#update-download').click();await pending;
  await page.waitForFunction(()=>document.querySelector('#update-download-status')?.dataset.state==='success');assert.equal(await page.locator('#update-direct-link').isVisible(),false);await assertNoNewContentTab(context);
 }finally{await browser.close();}
});

test('closing during an HTML download cancels that file and permits a fresh retry',async()=>{
 const {browser,page,context}=await openApp();let answer;try{
  const held=new Promise(resolve=>answer=resolve);await context.route(source,r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(update())}));
  await context.route('https://studio-updates.test/card-print-studio.html',async r=>{await held;await r.fulfill({status:200,contentType:'text/html',body:'<!doctype html><html>새 작업실</html>'}).catch(()=>{});});
  let received=0;page.on('download',()=>received++);await openUpdates(page);await configure(page);await page.waitForFunction(()=>document.querySelector('#update-status')?.dataset.state==='available');
  await page.locator('#update-download').click();await page.waitForFunction(()=>document.querySelector('#update-download-status')?.dataset.state==='loading');
  await page.keyboard.press('Escape');await openUpdates(page);assert.equal(received,0);answer();
  const pending=page.waitForEvent('download');await page.locator('#update-download').click();await pending;assert.equal(received,1);assert.equal(await page.locator('#save-state').innerText(),'저장됨');
 }finally{answer?.();await browser.close();}
});

test('failed and malformed checks clear the previous download and explain the actual problem',async()=>{
 const {browser,page,context}=await openApp();try{
  let payload=update(),status=200;await context.route(source,r=>r.fulfill({status,contentType:'application/json',body:JSON.stringify(payload)}));
  await openUpdates(page);await configure(page);await page.waitForFunction(()=>document.querySelector('#update-status')?.dataset.state==='available');
  status=404;await page.locator('#updates-check').click();await page.waitForFunction(()=>document.querySelector('#update-status')?.dataset.state==='error');
  assert.match(await page.locator('#update-status').innerText(),/404/);assert.equal(await page.locator('#update-download').isVisible(),false);
  status=200;payload=update('999.0.0',{downloadUrl:'javascript:alert(1)'});await page.locator('#updates-check').click();await page.waitForFunction(()=>document.querySelector('#update-status')?.dataset.state==='error');
  assert.match(await page.locator('#update-status').innerText(),/다운로드 주소/);assert.equal(await page.locator('#update-download').isVisible(),false);
  payload=update('잘못된 버전');await page.locator('#updates-check').click();await page.waitForFunction(()=>document.querySelector('#update-status')?.dataset.state==='error');assert.match(await page.locator('#update-status').innerText(),/버전/);
 }finally{await browser.close();}
});

test('equal or older remote versions do not offer a downgrade or report an error',async()=>{
 const {browser,page,context}=await openApp();try{
  await openUpdates(page);const current=await page.locator('#update-current-version').innerText();let version=current;
  await context.route(source,r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(update(version))}));
  await configure(page);await page.waitForFunction(()=>document.querySelector('#update-status')?.dataset.state==='current');assert.equal(await page.locator('#update-download').isVisible(),false);
  version='0.0.1';await page.locator('#updates-check').click();await page.waitForFunction(()=>document.querySelector('#update-status')?.dataset.state==='ahead');assert.equal(await page.locator('#update-download').isVisible(),false);
 }finally{await browser.close();}
});

test('editing the source invalidates an in-flight result and keeps the new result after reopening',async()=>{
 const {browser,page,context}=await openApp();try{
  let answer;const held=new Promise(resolve=>answer=resolve);await context.route(source,async r=>{await held;await r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(update())}).catch(()=>{});});
  const second='https://other-updates.test/update.json';await context.route(second,r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(update('888.0.0'))}));
  await openUpdates(page);await configure(page);await page.waitForFunction(()=>document.querySelector('#update-status')?.dataset.state==='checking');
  await page.locator('#update-source').fill(second);await page.locator('#updates-check').click();await page.waitForFunction(()=>document.querySelector('#update-latest-version')?.textContent==='888.0.0');answer();
  await page.locator('#updates-close').click();await openUpdates(page);assert.equal(await page.locator('#update-source').inputValue(),second);assert.equal(await page.locator('#update-latest-version').innerText(),'888.0.0');
 }finally{await browser.close();}
});

test('closing a pending check allows immediate re-entry and ignores the previous response',async()=>{
 const {browser,page,context}=await openApp();let answer;try{
  const held=new Promise(resolve=>answer=resolve);await context.route(source,async r=>{await held;await r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(update())}).catch(()=>{});});
  await openUpdates(page);await configure(page);await page.waitForFunction(()=>document.querySelector('#update-status')?.dataset.state==='checking');
  await page.keyboard.press('Escape');await openUpdates(page);assert.equal(await page.locator('#update-status').getAttribute('data-state'),'idle');
  answer();await page.locator('#updates-close').click();await openUpdates(page);assert.equal(await page.locator('#update-download').isVisible(),false);assert.equal(await page.locator('#update-latest-version').isVisible(),false);
  assert.equal(await page.locator('#save-state').innerText(),'저장됨');
 }finally{answer?.();await browser.close();}
});

test('blocked settings storage still allows update checks and never hides a dirty deck',async()=>{
 const {browser,page,context}=await openApp();try{
  await context.addInitScript(()=>{Storage.prototype.getItem=()=>{throw new DOMException('blocked','SecurityError');};Storage.prototype.setItem=()=>{throw new DOMException('blocked','SecurityError');};});
  await page.reload();await page.waitForSelector('[data-ready=true]');await page.locator('#card-name').fill('설정 저장 실패에도 유지');await page.locator('#card-name').press('Tab');
  await context.route(source,r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(update())}));
  await openUpdates(page);await configure(page);await page.waitForFunction(()=>document.querySelector('#update-status')?.dataset.state==='available');
  assert.match(await page.locator('#updates-dialog').innerText(),/설정 저장을 허용하지 않아요/);assert.equal(await page.locator('#update-download').isVisible(),true);
  await page.locator('#updates-close').click();assert.equal(await page.locator('#save-state').innerText(),'미저장');assert.equal(await page.locator('#card-name').inputValue(),'설정 저장 실패에도 유지');
 }finally{await browser.close();}
});

test('automatic checks are opt-in, preserve their setting, and announce a new version without opening a modal',async()=>{
 const {browser,page,context,httpRequests,pageErrors}=await openApp();try{
  await context.route(source,r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(update())}));
  await openUpdates(page);assert.equal(await page.locator('#update-auto').isChecked(),false);await configure(page);await page.waitForFunction(()=>document.querySelector('#update-status')?.dataset.state==='available');
  await page.locator('#update-auto').check();await page.locator('#updates-close').click();const count=httpRequests.length;
  await page.reload();await page.waitForSelector('[data-ready=true]');await page.waitForSelector('#studio-updates[data-available=true]');
  assert.equal(await page.locator('#updates-dialog').count(),0);assert.equal(httpRequests.length,count+1);
  await openUpdates(page);assert.equal(await page.locator('#update-auto').isChecked(),true);assert.equal(await page.locator('#update-source').inputValue(),source);assert.equal(await page.locator('#save-state').innerText(),'저장됨');assert.deepEqual(pageErrors,[]);
 }finally{await browser.close();}
});

test('invalid update addresses never send a request or change the project',async()=>{
 const {browser,page,httpRequests}=await openApp();try{
  await openUpdates(page);for(const address of ['javascript:alert(1)','http://studio-updates.test/update.json','https://name:secret@studio-updates.test/update.json']){
   await configure(page,address);assert.equal(await page.locator('#update-status').getAttribute('data-state'),'error');assert.equal(await page.locator('#update-download').isVisible(),false);
  }
  assert.deepEqual(httpRequests,[]);await page.locator('#updates-close').click();assert.equal(await page.locator('#save-state').innerText(),'저장됨');
 }finally{await browser.close();}
});

test('legacy empty update settings restore the GitHub default without enabling network checks',async()=>{
 const {browser,page,httpRequests,pageErrors}=await openApp();try{
  for(const saved of [{sourceUrl:'',autoCheck:false},{sourceUrl:'  ',autoCheck:true}]){
   await page.evaluate(value=>localStorage.setItem('card-print-studio:updates:v1',JSON.stringify(value)),saved);
   await page.reload();await page.waitForSelector('[data-ready=true]');await openUpdates(page);
   assert.equal(await page.locator('#update-source').inputValue(),'https://raw.githubusercontent.com/lolipop000000/card-print-studio/main/dist/update.json');
   assert.equal(await page.locator('#update-auto').isChecked(),false);
   assert.equal(await page.locator('#update-status').getAttribute('data-state'),'idle');
   await page.locator('#updates-close').click();
  }
  assert.deepEqual(httpRequests,[]);assert.deepEqual(pageErrors,[]);
 }finally{await browser.close();}
});

test('a saved custom update address takes precedence over the built-in default',async()=>{
 const {browser,page,httpRequests,pageErrors}=await openApp();try{
  await page.evaluate(value=>localStorage.setItem('card-print-studio:updates:v1',JSON.stringify({sourceUrl:value,autoCheck:false})),source);
  await page.reload();await page.waitForSelector('[data-ready=true]');await openUpdates(page);
  assert.equal(await page.locator('#update-source').inputValue(),source);
  assert.equal(await page.locator('#update-auto').isChecked(),false);
  assert.deepEqual(httpRequests,[]);assert.deepEqual(pageErrors,[]);
 }finally{await browser.close();}
});

test('explicitly disconnecting updates stays disconnected after reopening the HTML',async()=>{
 const {browser,page,httpRequests,pageErrors}=await openApp();try{
  await openUpdates(page);await page.locator('#update-disconnect').click();
  await page.locator('#updates-close').click();await page.reload();await page.waitForSelector('[data-ready=true]');await openUpdates(page);
  assert.equal(await page.locator('#update-source').inputValue(),'');
  assert.equal(await page.locator('#update-auto').isChecked(),false);
  assert.equal(await page.locator('#update-status').getAttribute('data-state'),'unconfigured');
  assert.deepEqual(httpRequests,[]);assert.deepEqual(pageErrors,[]);
 }finally{await browser.close();}
});
