import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {openHarness,openApp,qa} from './helpers/browser.mjs';
import {saveProject,downloadClick} from './helpers/flows.mjs';

test('passive and active descriptions sit immediately below their names, before badges',async()=>{
 const {browser,page}=await openHarness();try{
 const result=await page.evaluate(async()=>{
  const a=window.testApi;await a.ensureFont();const p=a.createProject();p.keywords=[{id:'k',name:'회복',description:'',color:'#427963',iconAssetId:null}];
  for(const [key,id] of [['passives','p'],['actives','a']])p.cards[0][key]=[{id,name:'기술',effect:'회복 5 적용.',dice:null,keywords:[{keywordId:'k',display:'both'}]}];
  const c=a.applyTemplate(p.cards[0],p.settings,'monster-standard',p.keywords),canvas=document.createElement('canvas');
  const rows=['p','a'].map(id=>Object.fromEntries(['name','effect','keywords'].map(key=>[key,c.elements.find(e=>e.binding?.skillId===id&&e.binding.field==='skill.'+key).rect])));
  return {rows,problems:a.renderCard(canvas.getContext('2d'),p,c,new Map(),300).problems};
 });
 for(const r of result.rows){assert.ok(r.effect.y>=r.name.y+r.name.h);assert.ok(r.effect.y-r.name.y-r.name.h<=.36);assert.ok(r.keywords.y>=r.effect.y+r.effect.h);}
 assert.deepEqual(result.problems,[]);
 }finally{await browser.close();}
});
test('automatic art fit shows the whole portrait and landscape image with transparent holes',async()=>{
 const {browser,page}=await openHarness();try{
 const result=await page.evaluate(async()=>{
  const a=window.testApi;await a.ensureFont();const p=a.createProject(),samples=[];
  for(const [w,h] of [[40,100],[100,40]]){
   const source=document.createElement('canvas');source.width=w;source.height=h;const sc=source.getContext('2d');sc.strokeStyle='#df1835';sc.lineWidth=4;sc.strokeRect(2,2,w-4,h-4);
   const img=new Image();img.src=source.toDataURL();await img.decode();
   const c=a.applyTemplate(p.cards[0],p.settings,'monster-standard');c.artAssetId='art';const art=c.elements.find(e=>e.binding?.field==='art'),canvas=document.createElement('canvas'),ctx=canvas.getContext('2d'),scale=300/25.4;
   const report=a.renderCard(ctx,p,c,new Map([['art',img]]),300),r=art.rect;
   const pixel=(x,y)=>[...ctx.getImageData(Math.round(x*scale),Math.round(y*scale),1,1).data];
   const factor=Math.min(r.w/w,r.h/h),left=r.x+(r.w-w*factor)/2,top=r.y+(r.h-h*factor)/2;
   samples.push({fit:art.style.fit,center:pixel(r.x+r.w/2,r.y+r.h/2),nearEdge:pixel(left+2*factor,top+h/2*factor),problems:report.problems});
  }return samples;
 });
 for(const r of result){assert.equal(r.fit,'contain');assert.deepEqual(r.center,[255,253,248,255]);assert.ok(r.nearEdge[0]>170&&r.nearEdge[1]<80);assert.deepEqual(r.problems,[]);}
 }finally{await browser.close();}
});
test('items keep candle badges with optional multiple grants and join dense actual-size PDFs',async()=>{
 const {browser,page,pageErrors,httpRequests}=await openApp();try{
 await page.locator('#card-quantity').fill('9');await page.locator('#card-quantity').press('Tab');
 await page.locator('#add-item').click();assert.equal(await page.locator('#attributes input[type=checkbox]').count(),6);assert.equal(await page.locator('#attributes input:checked').count(),0);await page.locator('#attribute-menu-toggle').click();await page.locator('#attribute-fire').check();await page.locator('#attribute-light').check();await page.locator('#card-name').fill('불의 양초');await page.locator('#card-name').press('Tab');
 const p=await saveProject(page,'items-attributes.json'),item=p.cards.find(c=>c.kind==='item');
 assert.equal(item.attribute,'fire');assert.deepEqual(item.attributes,['fire','light']);assert.equal(item.elements.filter(e=>e.type==='attribute').length,1);assert.equal(item.elements.some(e=>e.type==='rank'||e.binding?.field==='hp'),false);
 await page.locator('#paper-tab').click();await page.locator('#print-dense').click();await page.locator('#print-duplex').check();
 await page.waitForFunction(()=>document.querySelectorAll('.paper-sheet').length===4);
 const packed=await saveProject(page,'dense-items.json');assert.equal(packed.print.gapMm,0);assert.equal(packed.settings.cardWidthMm,63);assert.equal(packed.settings.cardHeightMm,88);
 await page.screenshot({path:path.join(qa,'dense-items-preview.png'),fullPage:true});
 const pdf=await downloadClick(page,'#export-pdf','workshop-dense.pdf');assert.ok(pdf.length>1000);assert.deepEqual(pageErrors,[]);assert.deepEqual(httpRequests,[]);
 }finally{await browser.close();}
});
test('variant UI inherits original edits, preserves an edited effect, and prints its own quantity',async()=>{
 const {browser,page,pageErrors,httpRequests}=await openApp();try{
 await page.locator('#card-name').fill('원본 몬스터');await page.locator('#card-name').press('Tab');await page.locator('#add-passive').click();
 await page.locator('#passives .skill-effect').fill('체력 5 회복');await page.locator('#passives .skill-effect').press('Tab');
 const base=await saveProject(page,'variant-base.json'),root=base.cards[0];await page.locator('#add-variant').click();
 await page.locator('#variant-label').fill('스페셜');await page.locator('#variant-label').press('Tab');await page.locator('#card-quantity').fill('2');await page.locator('#card-quantity').press('Tab');
 await page.locator('#passives .skill-effect').fill('체력 20 회복');await page.locator('#passives .skill-effect').press('Tab');
 const child=(await saveProject(page,'variant-edited.json')).cards.find(c=>c.variant);
 await page.locator('.card-row[data-card-id="'+root.id+'"] .card-select').click();await page.locator('#card-name').fill('변경된 원본');await page.locator('#card-name').press('Tab');
 await page.locator('#passives .skill-name').fill('회복 기술');await page.locator('#passives .skill-name').press('Tab');
 const saved=await saveProject(page,'variant-inherited.json'),c=saved.cards.find(c=>c.id===child.id);
 assert.equal(c.name,'변경된 원본');assert.equal(c.passives[0].name,'회복 기술');assert.equal(c.passives[0].effect,'체력 20 회복');assert.equal(c.quantity,2);assert.equal(c.variant.parentId,root.id);
 await page.locator('#paper-tab').click();await page.waitForFunction(()=>document.querySelectorAll('.paper-cell[data-card-id]').length===3);
 assert.equal(await page.locator('.paper-cell[data-card-id="'+root.id+'"]').count(),1);assert.equal(await page.locator('.paper-cell[data-card-id="'+child.id+'"]').count(),2);
 assert.deepEqual(pageErrors,[]);assert.deepEqual(httpRequests,[]);
 }finally{await browser.close();}
});
