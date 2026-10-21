import test from 'node:test';
import assert from 'node:assert/strict';
import {openHarness} from './helpers/browser.mjs';
import {installCloud} from './helpers/cloud-fixture.mjs';
import {snapshotLibraryEntry,snapshotAsset} from '../src/cloud/shared-assets.js';
import {createLibraryEntry} from '../src/model/asset-library.js';
import {createProject} from '../src/model/project.js';
const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO5EE2cAAAAASUVORK5CYII=';
test('owned keyword snapshot can be applied to another deck without another cloud copy',async()=>{
 const a=await openHarness();try{await installCloud(a.page);await a.page.evaluate(()=>{
  window.__cloudFixture.assets.push({id:'owned-keyword',kind:'keyword',owner:'u',title:'보관한 별빛',visibility:'private',version:1,deleted_at:null,data:{kind:'keyword',item:{id:'kw',name:'별빛',description:'보관한 효과',color:'#3355aa',iconAssetId:null},blobs:[]}});
 });
 for(let i=0;i<2;i++){
  await a.page.locator('#cloud-open').click();await a.page.locator('#cloud-tab-assets').click();await a.page.locator('[data-cloud-asset-apply="owned-keyword"]').click({timeout:3000});
  await a.page.waitForFunction(()=>window.__cloudTest.ctx.store.getProject().keywords.length===1);assert.equal(await a.page.evaluate(()=>window.__cloudTest.ctx.store.getProject().keywords[0].name),'별빛');
  await a.page.locator('#cloud-close').click();if(i===0)await a.page.evaluate(()=>window.__cloudTest.ctx.store.load(window.testApi.createProject()));
 }
 assert.equal(await a.page.evaluate(()=>window.__cloudFixture.calls.filter(c=>c.action==='asset.copy').length),0);assert.equal(await a.page.evaluate(()=>window.__cloudFixture.assets.length),1);assert.deepEqual(a.pageErrors,[]);
 }finally{await a.browser.close();}
});
test('copied asset can be retried after hydration fails without copying it twice',async()=>{
 const a=await openHarness();try{await installCloud(a.page);const project=createProject();project.assets.icon={id:'icon',mime:'image/png',width:1,height:1,dataUrl:png,paintingId:null};project.keywords.push({id:'kw',name:'별빛',description:'그림 키워드',color:'#3355aa',iconAssetId:'icon'});
 const snapshot=await snapshotAsset(project,'keyword','kw');await a.page.evaluate(({data,bytes})=>{const f=window.__cloudFixture;for(const [hash,bytesArray] of bytes)f.blobs.set(hash,new Uint8Array(bytesArray));f.assets.push({id:'foreign-keyword',kind:'keyword',owner:'friend',title:'그림 키워드',visibility:'public',version:1,deleted_at:null,data});const fetch=window.__cloudTest.ctx.cloudBlobs.fetch;let first=true;window.__cloudTest.ctx.cloudBlobs.fetch=async hash=>{if(first){first=false;throw Error('그림 연결 끊김');}return fetch(hash);};},{data:snapshot.data,bytes:[...snapshot.blobBytes].map(([hash,value])=>[hash,[...value.bytes]])});
 await a.page.locator('#cloud-open').click();await a.page.locator('#cloud-tab-assets').click();await a.page.locator('[data-cloud-asset-take="foreign-keyword"]').click();
 await a.page.locator('[data-cloud-asset-apply]').waitFor();assert.equal(await a.page.evaluate(()=>window.__cloudTest.ctx.store.getProject().keywords.length),0);
 await a.page.locator('[data-cloud-asset-apply]').click();await a.page.waitForFunction(()=>window.__cloudTest.ctx.store.getProject().keywords.length===1);
 assert.equal(await a.page.evaluate(()=>window.__cloudFixture.calls.filter(c=>c.action==='asset.copy').length),1);assert.deepEqual(a.pageErrors,[]);
 }finally{await a.browser.close();}
});
test('share keyword from manager then another member takes it into open deck',async()=>{const a=await openHarness();try{await installCloud(a.page);await a.page.evaluate(()=>window.__cloudTest.ctx.store.edit('키워드',p=>p.keywords.push({id:'kw',name:'별빛',description:'공유할 키워드',color:'#3355aa',iconAssetId:null})));await a.page.locator('#keyword-manager').click();await a.page.locator('#keyword-share').click();await a.page.waitForFunction(()=>window.__cloudFixture.assets.some(a=>a.visibility==='public'));await a.page.locator('#keyword-close').click();
 await a.page.evaluate(async()=>{window.__cloudFixture.profile.id='friend';await window.__cloudTest.ctx.cloudAccount.refresh();window.__cloudTest.ctx.store.load(window.testApi.createProject());});await a.page.locator('#cloud-open').click();await a.page.locator('#cloud-tab-assets').click();await a.page.locator('[data-cloud-asset-take]').click();await a.page.waitForFunction(()=>window.__cloudTest.ctx.store.getProject().keywords.length===1);assert.equal(await a.page.evaluate(()=>window.__cloudTest.ctx.store.getProject().keywords[0].name),'별빛');assert.notEqual(await a.page.evaluate(()=>window.__cloudTest.ctx.store.getProject().keywords[0].id),'kw');assert.equal(await a.page.evaluate(()=>window.__cloudFixture.assets.filter(a=>a.owner==='friend'&&a.visibility==='private').length),1);assert.deepEqual(a.pageErrors,[]);
 }finally{await a.browser.close();}});
test('image library lists cloud images and adds a copied public image',async()=>{const a=await openHarness();try{await installCloud(a.page);const snapshot=await snapshotLibraryEntry(createLibraryEntry({id:'art',mime:'image/png',width:1,height:1,dataUrl:png,paintingId:null},'공유 그림'));await a.page.evaluate(({data,bytes})=>{const f=window.__cloudFixture;for(const [hash,value] of bytes)f.blobs.set(hash,new Uint8Array(value));f.assets.push({id:'public-image',kind:'image',owner:'friend',title:'공유 그림',visibility:'public',data,version:1,deleted_at:null});},{data:snapshot.data,bytes:[...snapshot.blobBytes].map(([hash,value])=>[hash,[...value.bytes]])});
 await a.page.locator('#cloud-open').click();await a.page.locator('#cloud-tab-assets').click();await a.page.locator('[data-cloud-asset-take]').click();await a.page.waitForFunction(()=>window.__cloudFixture.assets.length===2);await a.page.locator('#cloud-close').click();await a.page.locator('#asset-library').click();await a.page.locator('.asset-entry').waitFor();assert.match(await a.page.locator('.asset-entry').innerText(),/공유 그림/);assert.match(await a.page.locator('#asset-library-dialog').innerText(),/클라우드/);assert.deepEqual(a.pageErrors,[]);
 }finally{await a.browser.close();}});
