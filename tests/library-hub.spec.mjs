import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {openHarness} from './helpers/browser.mjs';
import {installCloud} from './helpers/cloud-fixture.mjs';

const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO5EE2cAAAAASUVORK5CYII=';
async function setup(options={}){
 const app=await openHarness();
 app.page.setDefaultTimeout(8000);
 await app.page.addStyleTag({content:await readFile(new URL('../src/styles.css',import.meta.url),'utf8')});
 if(options.phone)await app.page.setViewportSize({width:390,height:844});
 await installCloud(app.page,options);
 await app.page.evaluate(()=>{
  const f=window.__cloudFixture,data=structuredClone(window.__cloudTest.ctx.store.getProject()),updated_at='2026-10-22T00:00:00Z';
  f.works.push({id:'mine-deck',owner:'u',title:'보관한 덱',data,visibility:'private',card_count:1,version:1,deleted_at:null,updated_at},{id:'public-deck',owner:'friend',title:'친구의 덱',data,visibility:'public',card_count:1,version:1,deleted_at:null,updated_at});
  for(const [id,owner,title,visibility,deleted_at] of [['own-keyword','u','별빛 키워드','private',null],['public-keyword','friend','친구의 별빛','public',null],['deleted-keyword','u','삭제한 키워드','private',updated_at]])f.assets.push({id,owner,title,visibility,deleted_at,kind:'keyword',version:1,updated_at,data:{kind:'keyword',item:{id:'kw-'+id,name:title,description:'효과',color:'#3355aa',iconAssetId:null},blobs:[]}});
  f.feedRows.push({item_id:'public-deck',kind:'work',owner:'friend',nickname:'친구',title:'친구의 덱',version:1,updated_at},{item_id:'public-keyword',kind:'asset',asset_kind:'keyword',owner:'friend',nickname:'친구',title:'친구의 별빛',version:1,updated_at});
 });
 return app;
}
async function open(page){await page.locator('#asset-library').click();await page.locator('#asset-library-dialog').waitFor();}
async function tab(page,id){await page.locator('#'+id).click();await page.waitForFunction(()=>document.querySelector('#cloud-panel')?.dataset.loading==='false');}

test('one library searches owned decks and assets and scopes public content by type',async()=>{
 const app=await setup();try{const {page}=app;await open(page);
  assert.equal(await page.getByRole('tablist',{name:'보관함 자료 위치'}).count(),1,'the asset library must expose its cloud collections');
  await tab(page,'cloud-tab-mine');
  assert.equal(await page.locator('[data-cloud-item="mine-deck"]').count(),1);assert.equal(await page.locator('[data-cloud-asset="own-keyword"]').count(),1);assert.equal(await page.locator('[data-cloud-asset="public-keyword"]').count(),0);
  await page.locator('#library-kind').selectOption('keyword');assert.equal(await page.locator('[data-cloud-item]').count(),0);assert.equal(await page.locator('[data-cloud-asset]').count(),1);
  await page.locator('#library-search').fill('없는 이름');assert.match(await page.locator('#cloud-list').innerText(),/검색/);
  await tab(page,'cloud-tab-public');await page.locator('#library-search').fill('친구');await page.locator('#library-kind').selectOption('all');
  assert.equal(await page.locator('[data-cloud-item="public-deck"]').count(),1);assert.equal(await page.locator('[data-cloud-asset="public-keyword"]').count(),1);assert.equal(await page.locator('[data-cloud-asset="own-keyword"]').count(),0);
  assert.equal(await page.locator('#cloud-open').count(),0,'there must be one visible library entry instead of a separate cloud destination');assert.deepEqual(app.pageErrors,[]);
 }finally{await app.browser.close();}
});

test('my account settings live in the library and nickname changes survive closing and reopening',async()=>{
 const app=await setup();try{const {page}=app;await open(page);await page.locator('#library-account-toggle').click();
  assert.equal(await page.locator('#asset-library-dialog #cloud-account').count(),1);assert.match(await page.locator('#cloud-account-status').innerText(),/친구.*멤버/);
  await page.locator('#cloud-edit-nickname').click();await page.locator('#cloud-nickname').fill('새 별빛');await page.locator('#cloud-nickname-save').click();await page.locator('#cloud-nickname-dialog').waitFor({state:'detached'});
  assert.match(await page.locator('#cloud-account-status').innerText(),/새 별빛.*멤버/);
  await page.locator('#asset-library-close').click();await open(page);await page.locator('#library-account-toggle').click();assert.equal(await page.locator('#cloud-account').count(),1);assert.match(await page.locator('#cloud-account-status').innerText(),/새 별빛/);assert.deepEqual(app.pageErrors,[]);
 }finally{await app.browser.close();}
});

test('phone image details return to the searched list and quick actions stay reachable',async()=>{
 const app=await setup({phone:true,loggedIn:false});try{const {page}=app;
  assert.equal(await page.locator('#mobile-save').isVisible(),true,'saving must not require opening the work menu');assert.equal(await page.locator('#mobile-library').isVisible(),true);
  await page.evaluate(async png=>window.__cloudTest.ctx.assetLibrary.addAssets([{name:'별빛 그림',asset:{id:'source',mime:'image/png',width:1,height:1,dataUrl:png,paintingId:null}}]),png);
  await page.locator('#mobile-library').click();await page.locator('#asset-search').fill('별빛');await page.locator('.asset-entry').click();
  assert.equal(await page.locator('.asset-details').isVisible(),true);assert.equal(await page.locator('.asset-browser').isVisible(),false);await page.locator('#asset-back').click();
  assert.equal(await page.locator('.asset-browser').isVisible(),true);assert.equal(await page.locator('.asset-details').isVisible(),false);assert.equal(await page.locator('#asset-search').inputValue(),'별빛');
  const box=await page.locator('#asset-library-dialog').boundingBox();assert.ok(box.x>=0&&box.width<=390&&box.height<=844);const target=await page.locator('#asset-library-close').boundingBox();assert.ok(target.height>=48&&target.width>=48);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+1),true);assert.deepEqual(app.pageErrors,[]);
 }finally{await app.browser.close();}
});

test('phone public details preserve the search and filter when returning to the list',async()=>{
 const app=await setup({phone:true});try{const {page}=app;await page.locator('#mobile-library').click();await tab(page,'cloud-tab-public');await page.locator('#library-kind').selectOption('keyword');await page.locator('#library-search').fill('별빛');
  await page.locator('[data-library-open="public-keyword"]').click();assert.equal(await page.locator('#cloud-panel').getAttribute('data-detail'),'true');assert.equal(await page.locator('[data-cloud-asset-take="public-keyword"]').isVisible(),true);
  await page.locator('#library-back').click();assert.equal(await page.locator('#cloud-panel').getAttribute('data-detail'),'false');assert.equal(await page.locator('#library-search').inputValue(),'별빛');assert.equal(await page.locator('#library-kind').inputValue(),'keyword');assert.deepEqual(app.pageErrors,[]);
 }finally{await app.browser.close();}
});

test('public viewing can reopen the library without exposing writes to an unapproved account',async()=>{
 const app=await setup({status:'pending'});try{const {page}=app;await open(page);await tab(page,'cloud-tab-public');await page.locator('[data-cloud-action="view"]').click();await page.locator('#asset-library-dialog').waitFor({state:'detached'});
  const before=await page.evaluate(()=>JSON.stringify(window.__cloudTest.ctx.store.getProject()));await open(page);await tab(page,'cloud-tab-public');assert.equal(await page.locator('[data-cloud-action="copy"]').count(),0);assert.equal(await page.locator('[data-cloud-asset-take]').count(),0);
  assert.equal(await page.evaluate(()=>JSON.stringify(window.__cloudTest.ctx.store.getProject())),before);await page.locator('#asset-library-close').click();assert.equal(await page.evaluate(()=>window.__cloudFixture.feed.size),0);assert.deepEqual(app.pageErrors,[]);
 }finally{await app.browser.close();}
});

test('trash includes deleted assets and restores them into my library',async()=>{
 const app=await setup();try{const {page}=app;await open(page);await tab(page,'cloud-tab-trash');await page.locator('[data-cloud-asset="deleted-keyword"] [data-cloud-asset-restore]').click();
  await tab(page,'cloud-tab-mine');assert.equal(await page.locator('[data-cloud-asset="deleted-keyword"]').count(),1);await page.locator('#asset-library-close').click();assert.equal(await page.evaluate(()=>window.__cloudFixture.feed.size),0);assert.deepEqual(app.pageErrors,[]);
 }finally{await app.browser.close();}
});

test('deleting the last image returns a phone user to the importable list',async()=>{
 const app=await setup({phone:true,loggedIn:false});try{const {page}=app;
  await page.evaluate(async png=>window.__cloudTest.ctx.assetLibrary.addAssets([{name:'마지막 그림',asset:{id:'last',mime:'image/png',width:1,height:1,dataUrl:png,paintingId:null}}]),png);
  await page.locator('#mobile-library').click();await page.locator('.asset-entry').click();await page.locator('#asset-delete').click();await page.getByRole('button',{name:'에셋 삭제',exact:true}).click();
  await page.waitForFunction(()=>!document.querySelector('.asset-entry'));
  assert.equal(await page.locator('.asset-browser').isVisible(),true);assert.equal(await page.locator('#asset-import').isVisible(),true);assert.deepEqual(app.pageErrors,[]);
 }finally{await app.browser.close();}
});

test('phone detail Back returns focus and scroll to the originating public material',async()=>{
 const app=await setup({phone:true});try{const {page}=app;
  await page.evaluate(()=>{const f=window.__cloudFixture;for(let i=0;i<40;i++)f.assets.push({id:'scroll-'+i,owner:'friend',kind:'keyword',title:'검색 자료 '+i,visibility:'public',version:1,deleted_at:null});});
  await page.locator('#mobile-library').click();await tab(page,'cloud-tab-public');await page.locator('#library-search').fill('검색 자료');
  const item=page.locator('[data-library-open="scroll-30"]');await item.scrollIntoViewIfNeeded();const before=await page.locator('#asset-library-dialog').evaluate(node=>node.scrollTop);assert.ok(before>500);
  await item.click();await page.locator('#library-back').click();const after=await page.locator('#asset-library-dialog').evaluate(node=>node.scrollTop);
  assert.ok(Math.abs(after-before)<4,'Back must restore the dialog scroll owner');assert.equal(await item.evaluate(node=>node===document.activeElement),true);assert.equal(await page.locator('#library-search').inputValue(),'검색 자료');assert.deepEqual(app.pageErrors,[]);
 }finally{await app.browser.close();}
});

test('desktop material titles retain keyboard focus after activation',async()=>{
 const app=await setup();try{const {page}=app;await open(page);await tab(page,'cloud-tab-public');const title=page.locator('[data-library-open="public-keyword"]');await title.focus();await title.press('Enter');
  assert.equal(await title.evaluate(node=>node===document.activeElement),true);assert.deepEqual(app.pageErrors,[]);
 }finally{await app.browser.close();}
});

test('opening account settings while the profile is loading keeps the library open',async()=>{
 const app=await setup();try{const {page}=app;
  await page.evaluate(()=>{const f=window.__cloudFixture,original=f.client.myProfile;f.client.myProfile=()=>new Promise(resolve=>{window.__finishLibraryProfile=async()=>resolve(await original());});window.__cloudTest.install(f.client);});
  await open(page);await page.locator('#library-account-toggle').click();
  assert.equal(await page.locator('#asset-library-dialog').count(),1,'a pending profile must not be mistaken for a signed-out identity');
  await page.evaluate(()=>window.__finishLibraryProfile());await page.waitForFunction(()=>document.querySelector('#cloud-account')?.dataset.refreshed==='true');
  await tab(page,'cloud-tab-mine');assert.equal(await page.locator('[data-cloud-item="mine-deck"]').count(),1);assert.equal(await page.locator('[data-cloud-action="visibility"]').count(),1);assert.deepEqual(app.pageErrors,[]);
 }finally{await app.browser.close();}
});

test('account refresh unblocks the library without waiting for an obsolete profile request',async()=>{
 const app=await setup();try{const {page}=app;
  await page.evaluate(()=>{const f=window.__cloudFixture,original=f.client.myProfile;let first=true;f.client.myProfile=()=>{if(!first)return original();first=false;return new Promise(resolve=>{window.__finishObsoleteProfile=async()=>resolve(await original());});};window.__cloudTest.install(f.client);});
  await open(page);await page.locator('#library-account-toggle').click();await page.locator('#cloud-account-refresh').click();
  await page.waitForFunction(()=>document.querySelector('#cloud-account')?.dataset.refreshed==='true');await page.locator('#cloud-tab-mine').click();
  await page.waitForFunction(()=>document.querySelector('#cloud-panel')?.dataset.loading==='false',{},{timeout:3000});assert.equal(await page.locator('[data-cloud-item="mine-deck"]').count(),1);
  await page.evaluate(()=>window.__finishObsoleteProfile());assert.deepEqual(app.pageErrors,[]);
 }finally{await app.browser.close();}
});
