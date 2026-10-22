import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {openHarness} from './helpers/browser.mjs';
import {installCloud,openCloudCollection} from './helpers/cloud-fixture.mjs';

async function setup(options={}){const app=await openHarness();app.page.setDefaultTimeout(4000);await app.page.addStyleTag({content:await readFile(new URL('../src/styles.css',import.meta.url),'utf8')});await installCloud(app.page,options);return app;}
const state=page=>page.evaluate(()=>{const ctx=window.__cloudTest.ctx,s=ctx.store;return {project:JSON.stringify(s.getProject()),dirty:s.isDirty(),undo:s.canUndo(),redo:s.canRedo(),document:s.getDocumentId(),selected:ctx.getActiveCardId(),session:ctx.cloudSession.state()};});
const uploadJSON=(page,value)=>page.locator('#cloud-card-file').setInputFiles({name:'친구 카드.json',mimeType:'application/json',buffer:Buffer.from(typeof value==='string'?value:JSON.stringify(value))});
const success=page=>page.waitForFunction(()=>document.querySelector('#message')?.dataset.kind==='success');

test('uploading the selected card includes only its dependencies and preserves the open cloud deck and undo history',async()=>{
 const a=await setup();try{
  await a.page.keyboard.press('Control+s');await a.page.waitForFunction(()=>window.__cloudFixture.works.length===1);
  await a.page.evaluate(()=>{const ctx=window.__cloudTest.ctx;
   ctx.store.edit('업로드할 카드 작성',p=>{
    const c=p.cards[0],png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==';
    c.name='불꽃 기사';c.artAssetId='art';c.nameStyle={color:'#ff5500',visualEffects:window.testApi.createVisualEffects('burning')};
    p.assets.art={id:'art',mime:'image/png',dataUrl:png,width:1,height:1,paintingId:'original'};
    p.assets.icon={...p.assets.art,id:'icon',paintingId:null};p.assets.unused={...p.assets.icon,id:'unused'};
    p.paintings.original={id:'original',width:64,height:64,activeLayerId:'pixels',layers:[{id:'pixels',name:'원본',visible:true,locked:false,opacity:.8,png}]};
    p.keywords=[{id:'fire',name:'불꽃',description:'타오르는 힘',color:'#dd1144',iconAssetId:'icon',visualEffects:window.testApi.createVisualEffects('burning')},{id:'unused',name:'얼음',description:'',color:'#1155dd',iconAssetId:'unused'}];
    p.cards.push(window.testApi.createCard('item',p));
   });
  });
  const before=await state(a.page);await a.page.locator('#upload-card').click();await success(a.page);
  const uploaded=await a.page.evaluate(()=>{const f=window.__cloudFixture,w=f.works.at(-1);return {work:w,blobs:f.blobs.size,actions:f.calls.map(c=>c.action)};});
  assert.equal(uploaded.work.title,'불꽃 기사');assert.equal(uploaded.work.visibility,'private');assert.equal(uploaded.work.data.cards.length,1);
  assert.deepEqual(Object.keys(uploaded.work.data.assets).sort(),['art','icon']);assert.deepEqual(Object.keys(uploaded.work.data.paintings),['original']);
  assert.deepEqual(uploaded.work.data.keywords.map(k=>k.id),['fire']);assert.equal(uploaded.work.data.cards[0].nameStyle.visualEffects.layers.length>0,true);
  assert.match(uploaded.work.data.assets.art.dataUrl,/^blob:sha256:/);assert.match(uploaded.work.data.paintings.original.layers[0].png,/^blob:sha256:/);assert.equal(uploaded.blobs,1);
  assert.equal(uploaded.actions.includes('import.begin'),false);assert.equal(uploaded.actions.includes('work.setVisibility'),false);assert.deepEqual(await state(a.page),before);
  await openCloudCollection(a.page);await a.page.getByRole('button',{name:'불꽃 기사 상세 보기'}).waitFor();assert.deepEqual(a.pageErrors,[]);
 }finally{await a.browser.close();}
});

test('a card JSON can be picked and uploaded without importing it into the current deck',async()=>{
 const a=await setup();try{
  const file=await a.page.evaluate(()=>{const p=window.testApi.createProject();p.cards[0].name='JSON 용사';return {format:'card-print-studio-card',version:1,project:p};});
  const before=await state(a.page),chooser=a.page.waitForEvent('filechooser');await a.page.locator('#upload-card-json').click();
  await (await chooser).setFiles({name:'JSON 용사.card.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(file))});await success(a.page);
  assert.deepEqual(await state(a.page),before);assert.equal(await a.page.evaluate(()=>window.__cloudFixture.works[0].data.cards[0].name),'JSON 용사');
  assert.equal(await a.page.locator('#cloud-card-file').inputValue(),'');assert.deepEqual(a.pageErrors,[]);
 }finally{await a.browser.close();}
});

test('a project JSON asks which card to upload and does not upload the other cards',async()=>{
 const a=await setup();try{
  const file=await a.page.evaluate(()=>{const p=window.testApi.createProject();p.cards[0].name='첫 카드';const c=window.testApi.createCard('item',p);c.name='고른 아이템';p.cards.push(c);return p;});
  const before=await state(a.page);await uploadJSON(a.page,file);
  await a.page.locator('#cloud-card-choice').selectOption(file.cards[1].id);await a.page.locator('#cloud-card-choose-dialog').getByRole('button',{name:'이 카드 올리기',exact:true}).click();await success(a.page);
  assert.equal(await a.page.evaluate(()=>window.__cloudFixture.works.length),1);assert.equal(await a.page.evaluate(()=>window.__cloudFixture.works[0].data.cards[0].name),'고른 아이템');assert.deepEqual(await state(a.page),before);assert.deepEqual(a.pageErrors,[]);
 }finally{await a.browser.close();}
});

test('duplicate uploads ask before overwrite, add or cancel and preserve visibility',async()=>{
 const a=await setup();try{
  await a.page.locator('#upload-card').click();await success(a.page);
  await a.page.evaluate(()=>{window.__cloudFixture.works[0].visibility='public';window.__cloudTest.ctx.store.edit('체력 수정',p=>p.cards[0].baseHp=77);});
  const before=await state(a.page);await a.page.locator('#upload-card').click();await a.page.locator('#cloud-card-duplicate').getByRole('button',{name:'취소',exact:true}).click();
  assert.equal(await a.page.evaluate(()=>window.__cloudFixture.works[0].version),1);
  await a.page.locator('#upload-card').click();await a.page.locator('#cloud-card-duplicate').getByRole('button',{name:'덮어쓰기',exact:true}).click();await a.page.waitForFunction(()=>window.__cloudFixture.works[0].version===2);
  assert.equal(await a.page.evaluate(()=>window.__cloudFixture.works[0].data.cards[0].baseHp),77);assert.equal(await a.page.evaluate(()=>window.__cloudFixture.works[0].visibility),'public');
  await a.page.locator('#upload-card').click();await a.page.locator('#cloud-card-duplicate').getByRole('button',{name:'새 카드로 추가',exact:true}).click();await a.page.waitForFunction(()=>window.__cloudFixture.works.length===2);
  assert.equal(await a.page.evaluate(()=>window.__cloudFixture.works[1].visibility),'private');assert.deepEqual(await state(a.page),before);assert.deepEqual(a.pageErrors,[]);
 }finally{await a.browser.close();}
});

test('invalid JSON and unapproved or logged-out accounts never upload a card',async()=>{
 const a=await setup();try{
  const before=await state(a.page);await uploadJSON(a.page,'{broken');await a.page.waitForFunction(()=>document.querySelector('#message')?.textContent.includes('JSON'));
  assert.deepEqual(await state(a.page),before);assert.equal(await a.page.evaluate(()=>window.__cloudFixture.calls.length),0);assert.equal(await a.page.locator('#upload-card').isEnabled(),true);
 }finally{await a.browser.close();}
 for(const options of [{loggedIn:false},{status:'pending'},{status:'revoked'}]){const b=await setup(options);try{
  await b.page.locator('#upload-card').click();await b.page.waitForFunction(()=>!document.querySelector('#message').hidden);
  assert.match(await b.page.locator('#message').innerText(),/로그인|승인/);assert.equal(await b.page.evaluate(()=>window.__cloudFixture.calls.length),0);assert.deepEqual(b.pageErrors,[]);
 }finally{await b.browser.close();}}
});

test('an account switch during upload aborts the write and restores the controls',async()=>{
 const a=await setup();try{
  await a.page.evaluate(()=>{const blobs=window.__cloudTest.ctx.cloudBlobs;blobs.ensureUploaded=()=>new Promise(resolve=>window.__releaseUpload=resolve);});
  await a.page.locator('#upload-card').click();await a.page.waitForFunction(()=>!!window.__releaseUpload);
  assert.equal(await a.page.locator('#upload-card-json').isDisabled(),true);
  await a.page.evaluate(async()=>{const f=window.__cloudFixture;await f.client.signOut();window.__releaseUpload();});
  await a.page.waitForFunction(()=>document.querySelector('#message')?.textContent.includes('계정'));
  assert.equal(await a.page.evaluate(()=>window.__cloudFixture.works.length),0);assert.equal(await a.page.locator('#upload-card').isEnabled(),true);assert.deepEqual(a.pageErrors,[]);
 }finally{await a.browser.close();}
});

test('upload uses the card snapshot from the click even if selection and edits change during authentication',async()=>{
 const a=await setup();try{
  await a.page.evaluate(()=>{const ctx=window.__cloudTest.ctx,f=window.__cloudFixture;
   ctx.store.edit('두 장 준비',p=>{p.cards[0].name='누른 카드';const other=window.testApi.createCard('item',p);other.name='다른 카드';p.cards.push(other);});
   const original=f.client.session.bind(f.client);let blocked=false;
   f.client.session=()=>{if(blocked)return original();blocked=true;return new Promise(resolve=>window.__releaseAuth=async()=>resolve(await original()));};
  });
  await a.page.locator('#upload-card').click();await a.page.waitForFunction(()=>!!window.__releaseAuth);
  await a.page.evaluate(()=>{const ctx=window.__cloudTest.ctx;ctx.store.edit('나중 수정',p=>p.cards[0].name='수정한 이름');ctx.selectCard(ctx.store.getProject().cards[1].id);window.__releaseAuth();});await success(a.page);
  assert.equal(await a.page.evaluate(()=>window.__cloudFixture.works[0].data.cards[0].name),'누른 카드');
  assert.equal(await a.page.evaluate(()=>window.__cloudTest.ctx.card().name),'다른 카드');assert.deepEqual(a.pageErrors,[]);
 }finally{await a.browser.close();}
});

test('a failed request allows retry and a concurrent cloud edit is never silently overwritten',async()=>{
 const a=await setup();try{
  await a.page.evaluate(()=>{const client=window.__cloudFixture.client,call=client.call.bind(client);let fail=true;client.call=async(action,...args)=>{if(action==='work.create'&&fail){fail=false;throw Error('네트워크 연결이 끊겼어요. 다시 올려주세요.');}return call(action,...args);};});
  const before=await state(a.page);await a.page.locator('#upload-card').click();await a.page.waitForFunction(()=>document.querySelector('#message')?.textContent.includes('네트워크'));
  assert.equal(await a.page.locator('#upload-card').isEnabled(),true);assert.equal(await a.page.evaluate(()=>window.__cloudFixture.works.length),0);
  await a.page.locator('#upload-card').click();await success(a.page);
  await a.page.locator('#upload-card').click();await a.page.locator('#cloud-card-duplicate').waitFor();
  await a.page.evaluate(()=>{const row=window.__cloudFixture.works[0];row.version++;row.data.cards[0].baseHp=555;});
  await a.page.locator('#cloud-card-duplicate').getByRole('button',{name:'덮어쓰기',exact:true}).click();await a.page.waitForFunction(()=>document.querySelector('#message')?.textContent.includes('먼저 수정'));
  assert.equal(await a.page.evaluate(()=>window.__cloudFixture.works[0].data.cards[0].baseHp),555);assert.equal(await a.page.locator('#upload-card-json').isEnabled(),true);assert.deepEqual(await state(a.page),before);assert.deepEqual(a.pageErrors,[]);
 }finally{await a.browser.close();}
});

test('mobile card list exposes both upload actions without horizontal overflow',async()=>{
 const a=await setup();try{
  await a.page.setViewportSize({width:390,height:844});await a.page.locator('#mobile-cards').click();
  for(const id of ['upload-card','upload-card-json']){const button=a.page.locator('#'+id);await button.scrollIntoViewIfNeeded();assert.equal(await button.isVisible(),true);const box=await button.boundingBox();assert.ok(box.x>=0&&box.x+box.width<=390);}
  assert.equal(await a.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);assert.deepEqual(a.pageErrors,[]);
 }finally{await a.browser.close();}
});
