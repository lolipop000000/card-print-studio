import test from 'node:test';
import assert from 'node:assert/strict';
import {openApp,openHarness} from './helpers/browser.mjs';
import {saveProject} from './helpers/flows.mjs';

test('card and composer clocks continue through six seconds, freeze the visible frame and reopen it',async()=>{
 const {browser,page,pageErrors,httpRequests}=await openApp();try{
  await page.clock.install();await page.locator('#card-effect-time').evaluate(n=>{n.value='5.95';n.dispatchEvent(new Event('input',{bubbles:true}));});
  await page.locator('#card-effect-play').click();await page.clock.runFor(200);
  assert.ok(parseFloat(await page.locator('#card-effect-seconds').innerText())>6,'The card clock must not reset to zero');
  assert.ok(Number(await page.locator('#card-effect-time').getAttribute('max'))>6);
  await page.locator('#card-effect-freeze').click();const p=await saveProject(page,'continuous-frame.json');assert.ok(p.print.effectFrameSec>6);
  await page.locator('#card-frame-effects').click();
  assert.match(await page.locator('#effect-frame-label').innerText(),/6\./);
  await page.locator('#effect-time').evaluate(n=>{n.value='11.95';n.dispatchEvent(new Event('input',{bubbles:true}));});
  await page.locator('#effect-play').click();await page.clock.runFor(200);
  assert.ok(parseFloat(await page.locator('#effect-time').inputValue())>12,'Composer playback must continue into the next time window');
  await page.locator('#effect-freeze').click();const frame=await page.locator('#effect-frame-label').innerText();assert.match(frame,/12\./);
  await page.locator('#effect-undo').click();assert.match(await page.locator('#effect-frame-label').innerText(),/6\./);await page.locator('#effect-redo').click();assert.equal(await page.locator('#effect-frame-label').innerText(),frame);
  await page.locator('#effect-apply').click();const applied=await saveProject(page,'continuous-frame-applied.json');assert.ok(applied.print.effectFrameSec>12);
  await page.locator('#paper-tab').click();assert.equal(await page.locator('#print-effect-frame').inputValue(),String(applied.print.effectFrameSec));
  await page.locator('#card-tab').click();await page.locator('#card-frame-effects').click();assert.equal(await page.locator('#effect-frame-label').innerText(),frame);
  assert.deepEqual(pageErrors,[]);assert.deepEqual(httpRequests,[]);
 }finally{await browser.close();}
});

test('ripple geometry contracts for both silhouettes and independent decoration when end is smaller',async()=>{
 const {browser,page}=await openHarness();try{
  const results=await page.evaluate(()=>{
   const a=window.testApi,work={x:0,y:0,w:80,h:70},source=a.makeSurface(work,101.6);source.ctx.fillRect(30,25,20,15);const shape=a.analyzeShape(source);
   return [null,shape].map(shape=>[.2,1,1.8].map(timeSec=>{
    const out=a.makeSurface(work,101.6),layer=a.makeVisualEffectLayer('ripple',{params:{start:1,end:0,count:1,width:.3,life:2},motion:{enabled:true}});
    a.drawGenerator(out.ctx,layer,{rect:{x:30,y:25,w:20,h:15},shape,seed:7,timeSec,sizeHeightMm:15});
    const data=out.ctx.getImageData(0,0,out.canvas.width,out.canvas.height).data;let left=out.canvas.width,right=-1,max=0;
    for(let i=3;i<data.length;i+=4)if(data[i]){const x=(i-3)/4%out.canvas.width;left=Math.min(left,x);right=Math.max(right,x);max=Math.max(max,data[i]);}
    return {width:right-left,max};
   }));
  });
  for(const r of results){assert.ok(r[0].width>r[1].width&&r[1].width>r[2].width);assert.ok(r[0].max>r[1].max&&r[1].max>r[2].max);}
 }finally{await browser.close();}
});

test('render diagnostics identify skill, actual compressed size, minimum and overflowing line count',async()=>{
 const {browser,page}=await openHarness();try{
  const problems=await page.evaluate(async()=>{
   const a=window.testApi;await a.ensureFont();const p=a.createProject(),c=p.cards[0];c.name='푸른 용';c.passives=[{id:'passive',name:'용의 숨결',effect:'효과 설명 '.repeat(35),dice:null,keywords:[]}];
   c.elements=[{id:'title',type:'text',binding:{field:'skill.name',skillId:'passive'},rect:{x:5,y:15,w:45,h:7},style:{fontPt:10,visualEffects:a.createVisualEffects()}},{id:'body',type:'text',binding:{field:'skill.effect',skillId:'passive'},rect:{x:5,y:24,w:40,h:3},style:{fontPt:10}}];
   c.elements[0].style.visualEffects.layers=[a.makeVisualEffectLayer('textWarp',{params:{scaleY:.5}})];
   const canvas=document.createElement('canvas');return a.renderCard(canvas.getContext('2d'),p,c,new Map(),100).problems;
  });
  const small=problems.find(p=>p.code==='effect-font-minimum').message,overflow=problems.find(p=>p.code==='text-overflow').message;
  assert.match(small,/푸른 용/);assert.match(small,/용의 숨결/);assert.match(small,/5(?:\.0+)?pt/);assert.match(small,/7(?:\.0+)?pt/);
  assert.match(overflow,/용의 숨결/);assert.match(overflow,/효과|설명/);assert.match(overflow,/\d+줄/);assert.match(overflow,/3(?:\.0+)?mm/);
  assert.ok(problems.every(p=>!p.message.includes('확인하세요')));
 }finally{await browser.close();}
});
