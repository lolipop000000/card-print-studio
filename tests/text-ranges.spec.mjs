import test from 'node:test';
import assert from 'node:assert/strict';
import {openHarness,openApp,qa} from './helpers/browser.mjs';
import {saveProject} from './helpers/flows.mjs';
import path from 'node:path';

test('different characters in one title render independent colors without changing adjacent ink',async()=>{
 const {browser,page,pageErrors}=await openHarness();try{
  const result=await page.evaluate(async()=>{
   const a=window.testApi;await a.ensureFont();const p=a.createProject(),c=p.cards[0],canvas=document.createElement('canvas');c.name='불꽃 기사';
   c.elements=[{id:'title',type:'text',binding:{field:'name'},rect:{x:7,y:20,w:49,h:9},style:{fontPt:15,fontWeight:700,color:'#253d32'}}];
   const draw=()=>{a.renderCard(canvas.getContext('2d'),p,c,new Map(),200);return canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;},before=draw();
   c.textRanges={name:[{id:'red-char',start:0,end:1,style:{color:'#ff2010'}},{id:'blue-char',start:1,end:2,style:{color:'#1545fa'}}]};const after=draw();
   const m=document.createElement('canvas').getContext('2d');m.font=a.textFont(c.elements[0].style,15);const boundary=(7+m.measureText('불꽃').width)*200/25.4;
   let red=0,blue=0,outside=0;const changed=[];for(let y=0;y<canvas.height;y++)for(let x=0;x<canvas.width;x++){
    const i=(y*canvas.width+x)*4;if(after[i]>200&&after[i+1]<65&&after[i+2]<65)red++;if(after[i]<70&&after[i+1]<100&&after[i+2]>200)blue++;
    if(x>boundary+1&&(before[i]!==after[i]||before[i+1]!==after[i+1]||before[i+2]!==after[i+2])){outside++;if(changed.length<10)changed.push({x,y,before:[...before.slice(i,i+4)],after:[...after.slice(i,i+4)]});}
   }
   canvas.style.width='450px';document.body.append(canvas);return {red,blue,outside,changed,boundary};
  });
  assert.ok(result.red>30,'first chosen character is red');assert.ok(result.blue>30,'second chosen character is blue');assert.equal(result.outside,0,JSON.stringify(result));assert.deepEqual(pageErrors,[]);
  await page.screenshot({path:path.join(qa,'text-range-title-colors.png'),fullPage:true});
 }finally{await browser.close();}
});

test('empty and typography-only character ranges retain a whole-title color effect',async()=>{
 const {browser,page}=await openHarness();try{
  const difference=await page.evaluate(async()=>{
   const a=window.testApi;await a.ensureFont();const p=a.createProject(),c=p.cards[0],canvas=document.createElement('canvas');c.name='불꽃 기사';
   c.elements=[{id:'title',type:'text',binding:{field:'name'},rect:{x:7,y:20,w:49,h:9},style:{fontPt:15,fontWeight:700,color:'#253d32',visualEffects:{version:2,seed:1,layers:[a.makeVisualEffectLayer('gradient',{params:{color:'#f34c2a',color2:'#ffc552'}})]}}}];
   const draw=()=>{a.renderCard(canvas.getContext('2d'),p,c,new Map(),150);return canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;},before=draw(),difference={};
   for(const [key,style] of Object.entries({empty:{},typography:{fontWeight:700}})){
    c.textRanges={name:[{id:key,start:0,end:1,style}]};const after=draw();difference[key]=before.reduce((count,value,i)=>count+(value!==after[i]),0);
   }return difference;
  });assert.deepEqual(difference,{empty:0,typography:0});
 }finally{await browser.close();}
});

test('title selected range opens its own recipe and survives effect undo, save and document undo',async()=>{
 const {browser,page,pageErrors,httpRequests}=await openApp();try{
  const input=page.locator('#card-name');await input.fill('불꽃 기사');await input.press('Tab');
  await input.evaluate(e=>{e.focus();e.setSelectionRange(0,2);e.dispatchEvent(new Event('select',{bubbles:true}));});
  await page.locator('[data-text-ranges-for="card-name"] .text-range-create').click();
  assert.match(await page.locator('#effect-target option:checked').innerText(),/선택 글자.*불꽃/);
  await page.locator('#effect-start-preset').selectOption('burningText');
  await page.locator('#effect-text-color').fill('#f27822');await page.locator('#effect-text-color').dispatchEvent('change');
  await page.locator('#effect-undo').click();assert.notEqual(await page.locator('#effect-text-color').inputValue(),'#f27822');await page.locator('#effect-redo').click();
  await page.locator('#effect-apply').click();const saved=await saveProject(page,'text-range-applied.json'),range=saved.cards[0].textRanges.name[0];
  assert.equal(saved.cards[0].name.slice(range.start,range.end),'불꽃');assert.equal(range.style.color,'#f27822');
  assert.ok(range.style.visualEffects.layers.some(l=>l.kind==='flame'));assert.ok(range.style.visualEffects.layers.some(l=>l.kind==='displacement'||l.kind==='textWarp'));
  await page.locator('#undo').click();const undone=await saveProject(page,'text-range-undone.json');assert.equal(undone.cards[0].textRanges.name[0].style.visualEffects,undefined);
  await page.locator('#redo').click();assert.deepEqual((await saveProject(page,'text-range-redone.json')).cards[0].textRanges,saved.cards[0].textRanges);
  await page.screenshot({path:path.join(qa,'text-range-inspector.png'),fullPage:true});assert.deepEqual(pageErrors,[]);assert.deepEqual(httpRequests,[]);
 }finally{await browser.close();}
});
