import {setPreviewDpi} from './helpers/flows.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {openApp,openHarness,qa} from './helpers/browser.mjs';
import {saveProject} from './helpers/flows.mjs';

test('production bloom keeps small and large Korean fire above the bright-paper contrast minimum',async t=>{
 const {browser,page}=await openHarness();try{
  const cases=await page.evaluate(async()=>{
   const a=window.testApi;await a.ensureFont();const work={x:0,y:0,w:63,h:88},rect={x:5,y:40,w:53,h:17},results=[];
   const linear=v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;},luminance=(r,g,b)=>.2126*linear(r)+.7152*linear(g)+.0722*linear(b),background=luminance(255,253,248);
   for(const fontPt of [7,20]){
    const out=a.makeSurface(work,200),recipe=a.createVisualEffects('flame',{seed:77});recipe.layers[0].id='contrast-flame';
    // Isolate the effect contribution while retaining actual text geometry.
    a.renderVisualEffects(out.ctx,{rect,recipe,target:'text',dpi:200,timeSec:1.2,source:{key:'contrast',draw:()=>({fontPt,fits:true}),drawPlainMask:g=>a.drawText(g,'화염의 수호자',rect,{fontPt,fontWeight:800,color:'#fff',align:'center'},7)}});
    const paper=document.createElement('canvas');paper.width=out.canvas.width;paper.height=out.canvas.height;const g=paper.getContext('2d',{willReadFrequently:true});g.fillStyle='#fffdf8';g.fillRect(0,0,paper.width,paper.height);g.drawImage(out.canvas,0,0);
    const ink=out.ctx.getImageData(0,0,paper.width,paper.height).data,printed=g.getImageData(0,0,paper.width,paper.height).data;
    let visible=0,contrasting=0;for(let i=0;i<ink.length;i+=4)if(ink[i+3]>8){visible++;if(Math.abs(luminance(printed[i],printed[i+1],printed[i+2])-background)>=.12)contrasting++;}
    results.push({fontPt,visible,contrasting,fraction:contrasting/visible});
   }return results;
  });
  for(const result of cases){t.diagnostic(JSON.stringify(result));assert.ok(result.visible>100);assert.ok(result.fraction>=.6,JSON.stringify(result));}
 }finally{await browser.close();}
});

test('named text targets retain separate drafts and apply skill titles and descriptions in one undo',async()=>{
 const {browser,page,pageErrors,httpRequests}=await openApp();page.setDefaultTimeout(30000);try{
  await page.locator('#add-passive').click();await page.locator('#passives .skill-name').fill('화염의 가호');await page.locator('#passives .skill-name').press('Tab');
  await page.locator('#passives .skill-effect').fill('매 턴 체력을 10 회복한다.');await page.locator('#passives .skill-effect').press('Tab');
  const before=await saveProject(page,'quality-target-before.json');
  await page.locator('#card-text-effects').click();
  const target=page.locator('#effect-target'),options=await target.locator('option').allTextContents();
  assert.ok(options.some(s=>s.includes('카드 이름')));assert.ok(options.some(s=>s.includes('패시브')&&s.includes('설명')));
  const title=before.cards[0].elements.find(e=>e.binding?.field==='skill.name'),body=before.cards[0].elements.find(e=>e.binding?.field==='skill.effect');
  await target.selectOption(title.id);await page.locator('#effect-start-preset').selectOption('burningText');
  await target.selectOption(body.id);await page.locator('#effect-start-preset').selectOption('neonText');
  await target.selectOption(title.id);assert.ok(await page.locator('#effect-layer-list [data-kind="flame"]').count());
  assert.equal(await page.locator('#effect-reroll').count(),0);
  await setPreviewDpi(page,300);await page.waitForFunction(()=>document.getElementById('effect-preview').width===744&&document.getElementById('effect-preview-status').dataset.busy==='false');
  await page.screenshot({path:path.join(qa,'quality-text-targets.png'),fullPage:true});
  await page.locator('#effect-apply').click();const after=await saveProject(page,'quality-target-after.json');
  assert.ok(after.cards[0].elements.find(e=>e.id===title.id).style.visualEffects.layers.some(l=>l.kind==='flame'));
  assert.ok(after.cards[0].elements.find(e=>e.id===body.id).style.visualEffects.layers.some(l=>l.kind==='glow'));
  assert.deepEqual(after.cards[0].passives,before.cards[0].passives);assert.equal(after.cards[0].visualEffects,undefined);
  await page.locator('#undo').click();assert.deepEqual(await saveProject(page,'quality-target-undo.json'),before);
  await page.locator('#redo').click();assert.deepEqual(await saveProject(page,'quality-target-redo.json'),after);
  assert.deepEqual(pageErrors,[]);assert.deepEqual(httpRequests,[]);
 }finally{await browser.close();}
});

test('generator then pixelate processes fire whereas pixelate then generator keeps fresh fire detail',async()=>{
 const {browser,page}=await openHarness();try{
  const out=await page.evaluate(()=>{
   const a=window.testApi,work={x:0,y:0,w:63,h:88},render=order=>{
    const out=a.makeSurface(work,150),recipe=a.createVisualEffects();recipe.layers=order.map(k=>a.makeVisualEffectLayer(k,{id:k,params:k==='pixelate'?{size:2}:{count:50,height:.7},...(k==='pixelate'?{scope:'all'}:{emit:{face:'up',openOnly:true}})}));
    a.renderVisualEffects(out.ctx,{rect:{x:8,y:35,w:47,h:15},recipe,target:'text',dpi:150,timeSec:1.2,source:{key:'title',draw:g=>{g.font='bold 11px sans-serif';g.fillText('FIRE',12,48);return {fits:true,fontPt:20};}}});return Array.from(out.ctx.getImageData(0,0,out.canvas.width,out.canvas.height).data);
   };const first=render(['flame','pixelate']),last=render(['pixelate','flame']);let changed=0;for(let i=0;i<first.length;i++)if(first[i]!==last[i])changed++;return changed;
  });assert.ok(out>300);
 }finally{await browser.close();}
});

test('opaque text protection leaves at most fifteen percent generator contribution without erasing source',async()=>{
 const {browser,page}=await openHarness();try{
  const result=await page.evaluate(()=>{
   const a=window.testApi,work={x:0,y:0,w:63,h:88},protection=a.makeSurface(work,100);protection.ctx.fillRect(0,0,63,88);
   const recipe=a.createVisualEffects('smoke');recipe.layers[0].id='protected-smoke';
   const draw=protect=>{const out=a.makeSurface(work,100);recipe.layers[0].protectText=protect;recipe.layers[0].emit={face:'area',openOnly:false};recipe.layers[0].params.count=70;
    a.renderVisualEffects(out.ctx,{rect:{x:14,y:40,w:28,h:20},recipe,target:'effect',dpi:100,timeSec:1.2,source:null,textProtection:protection});return out.ctx.getImageData(0,0,out.canvas.width,out.canvas.height).data;};
   const raw=draw(false),safe=draw(true);let total=0,protectedTotal=0;for(let i=3;i<raw.length;i+=4){total+=raw[i];protectedTotal+=safe[i];}return {total,protectedTotal};
  });assert.ok(result.total>1000);assert.ok(result.protectedTotal/result.total<=.155,JSON.stringify(result));
 }finally{await browser.close();}
});

test('frame border clips all effect pixels to its band while full scope reaches the center',async()=>{
 const {browser,page}=await openHarness();try{
  const result=await page.evaluate(()=>{
   const a=window.testApi,p=a.createProject(),card=p.cards[0];card.elements=[];card.visualEffects=a.createVisualEffects('smoke');card.visualEffects.frame={scope:'border',bandMm:4};
   card.visualEffects.layers[0].emit={face:'area',openOnly:false};card.visualEffects.layers[0].params.size=1;card.visualEffects.layers[0].params.count=150;
   const c=document.createElement('canvas'),ctx=c.getContext('2d',{willReadFrequently:true});a.renderCard(ctx,p,card,new Map(),100);const border=ctx.getImageData(100,130,30,30).data;card.visualEffects.frame.scope='full';a.renderCard(ctx,p,card,new Map(),100);const full=ctx.getImageData(100,130,30,30).data;
   const changed=bytes=>{let n=0;for(let i=0;i<bytes.length;i+=4)if(bytes[i]!==255||bytes[i+1]!==253||bytes[i+2]!==248)n++;return n;};return {border:changed(border),full:changed(full)};
  });assert.equal(result.border,0);assert.ok(result.full>0);
 }finally{await browser.close();}
});
