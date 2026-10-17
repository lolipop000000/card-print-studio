import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {openApp,qa} from './helpers/browser.mjs';
import {saveProject,openPainter} from './helpers/flows.mjs';

test('card application trims transparent margins while preserving faint pixels and editable originals',async()=>{
 const {browser,page}=await openApp();let fresh;
 try{
  const fixture=await saveProject(page,'trim-fixture-base.json');
  const pixels=await page.evaluate(()=>{
   const c=document.createElement('canvas');c.width=64;c.height=96;
   const ctx=c.getContext('2d');ctx.fillStyle='#ff0000';ctx.fillRect(10,12,4,3);
   const faint=ctx.createImageData(1,1);faint.data.set([0,255,0,1]);ctx.putImageData(faint,39,47);
   const ink=c.toDataURL();ctx.fillStyle='#000000';ctx.fillRect(0,0,64,96);
   return {ink,solid:c.toDataURL()};
  });
  fixture.assets['trim-source']={id:'trim-source',mime:'image/png',width:64,height:96,dataUrl:pixels.ink,paintingId:'trim-original'};
  fixture.paintings['trim-original']={id:'trim-original',width:64,height:96,activeLayerId:'trim-ink',layers:[
   {id:'trim-ink',name:'원본 선화',visible:true,locked:false,opacity:1,png:pixels.ink},
   {id:'trim-hidden',name:'숨긴 배경',visible:false,locked:false,opacity:1,png:pixels.solid},
   {id:'trim-zero',name:'불투명도 0',visible:true,locked:false,opacity:0,png:pixels.solid}
  ]};
  fixture.cards[0].artAssetId='trim-source';
  const art=fixture.cards[0].elements.find(e=>e.binding?.field==='art');
  art.style={...art.style,fit:'contain',cropX:.2,cropY:.7};
  await page.locator('#project-file').setInputFiles({name:'trim-fixture.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(fixture))});
  await page.waitForFunction(()=>document.querySelector('#message')?.textContent.includes('프로젝트를 불러왔어요.'));
  const before=await saveProject(page,'trim-before.json');
  await openPainter(page);
  await page.locator('#paint-apply').click();
  await page.locator('#painting-editor').waitFor({state:'hidden'});
  const after=await saveProject(page,'trim-applied.json'),asset=after.assets[after.cards[0].artAssetId],doc=after.paintings[asset.paintingId];
  // Drawn bounds are x=10..39 and y=12..47, including the one-alpha edge.
  assert.deepEqual([asset.width,asset.height],[30,36]);
  const output=await page.evaluate(async url=>{
   const img=new Image();img.src=url;await img.decode();const c=document.createElement('canvas');c.width=img.width;c.height=img.height;
   const ctx=c.getContext('2d');ctx.drawImage(img,0,0);
   const pixel=(x,y)=>[...ctx.getImageData(x,y,1,1).data];
   return {size:[img.width,img.height],red:pixel(0,0),faint:pixel(29,35),hole:pixel(15,15)};
  },asset.dataUrl);
  assert.deepEqual(output,{size:[30,36],red:[255,0,0,255],faint:[0,255,0,1],hole:[0,0,0,0]});
  assert.deepEqual([doc.width,doc.height],[64,96]);
  // Omitted legacy blend mode and explicit source-over have the same editable meaning.
  const comparableLayer=({id,blendMode='source-over',...layer})=>({...layer,blendMode});
  assert.deepEqual(doc.layers.map(comparableLayer),fixture.paintings['trim-original'].layers.map(comparableLayer));
  assert.deepEqual(after.cards[0].elements.find(e=>e.binding?.field==='art'),before.cards[0].elements.find(e=>e.binding?.field==='art'));
  assert.deepEqual(after.assets['trim-source'],before.assets['trim-source']);
  assert.deepEqual(after.paintings['trim-original'],before.paintings['trim-original']);
  await page.locator('#undo').click();assert.deepEqual(await saveProject(page,'trim-undone.json'),before);
  await page.locator('#redo').click();await openPainter(page);
  assert.equal(await page.locator('#paint-size').innerText(),'64 × 96 px');
  assert.equal(await page.locator('.paint-layer').count(),3);
  await page.locator('#paint-close').click();
  fresh=await openApp();
  await fresh.page.locator('#project-file').setInputFiles(path.join(qa,'trim-applied.json'));
  await fresh.page.waitForFunction(()=>document.querySelector('#message')?.textContent.includes('프로젝트를 불러왔어요.'));
  await openPainter(fresh.page);
  assert.equal(await fresh.page.locator('#paint-size').innerText(),'64 × 96 px');
  assert.equal(await fresh.page.locator('.paint-layer').count(),3);
  assert.deepEqual(fresh.pageErrors,[]);
 }finally{if(fresh)await fresh.browser.close();await browser.close();}
});

test('empty painting applies a valid transparent pixel and retains the full editable canvas',async()=>{
 const {browser,page,pageErrors}=await openApp();
 try{
  await openPainter(page);await page.locator('#paint-apply').click();await page.locator('#painting-editor').waitFor({state:'hidden'});
  const p=await saveProject(page,'trim-empty.json'),asset=p.assets[p.cards[0].artAssetId],doc=p.paintings[asset.paintingId];
  assert.deepEqual([asset.width,asset.height],[1,1]);
  const result=await page.evaluate(async url=>{const img=new Image();img.src=url;await img.decode();const c=document.createElement('canvas');c.width=img.width;c.height=img.height;const ctx=c.getContext('2d');ctx.drawImage(img,0,0);return {size:[img.width,img.height],alpha:ctx.getImageData(0,0,1,1).data[3]};},asset.dataUrl);
  assert.deepEqual(result,{size:[1,1],alpha:0});
  assert.deepEqual([doc.width,doc.height,doc.layers.length],[1200,1200,1]);
  await openPainter(page);assert.equal(await page.locator('#paint-size').innerText(),'1200 × 1200 px');
  assert.deepEqual(pageErrors,[]);
 }finally{await browser.close();}
});
