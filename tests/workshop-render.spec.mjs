import test from 'node:test';
import assert from 'node:assert/strict';
import {openHarness,qa} from './helpers/browser.mjs';
import path from 'node:path';

test('automatic skill layout gives a long passive more height and keeps following skills apart',async()=>{
 const {browser,page}=await openHarness();try{
 const r=await page.evaluate(async()=>{
  const a=window.testApi;await a.ensureFont();const p=a.createProject(),c=p.cards[0];
  c.passives=[
   {id:'long-passive',name:'긴 패시브',effect:'매 턴 시작에 자신에게 표시된 수치를 확인하고 원하는 카드 한 장을 골라 효과를 적용한다. '.repeat(4),dice:null},
   {id:'short-passive',name:'짧은 패시브',effect:'체력 5 회복.',dice:null}
  ];
  c.actives=[{id:'die-active',name:'주사위 기술',effect:'대미지 30.',dice:{faces:[2,5,6],text:'성공',color:'#427963'}}];
  p.cards[0]=a.applyTemplate(c,p.settings,'monster-standard',p.keywords);
  const canvas=document.createElement('canvas');document.body.append(canvas);
  const report=a.renderCard(canvas.getContext('2d'),p,p.cards[0],new Map(),300);
  const elements=p.cards[0].elements,find=(id,field)=>elements.find(e=>e.binding?.skillId===id&&e.binding.field===field);
  return {report,long:find('long-passive','skill.effect').rect,short:find('short-passive','skill.effect').rect,shortName:find('short-passive','skill.name').rect,fonts:elements.filter(e=>e.binding?.field==='skill.effect').map(e=>e.style.fontPt)};
 });
 assert.ok(r.long.h>r.short.h+5,'A long passive needs more vertical space than a one-line passive');
 assert.ok(r.shortName.y>=r.long.y+r.long.h);
 assert.deepEqual(r.report.problems,[]);assert.ok(r.fonts.every(n=>n>=7));
 await page.screenshot({path:path.join(qa,'workshop-auto-layout.png'),fullPage:true});
 }finally{await browser.close();}
});

test('inline and badge keywords appear in the same rendered card and selected dice use two columns',async()=>{
 const {browser,page}=await openHarness();try{
 const r=await page.evaluate(async()=>{
  const a=window.testApi;await a.ensureFont();const p=a.createProject(),c=p.cards[0];
  p.keywords=[
   {id:'rain',name:'비',description:'자유롭게 정의한 설명',color:'#e02030',iconAssetId:null},
   {id:'rainbow',name:'무지개',description:'다른 설명',color:'#1820dc',iconAssetId:null}
  ];
  c.passives=[{id:'p',name:'하늘',effect:'비 2를 얻는다. 무지개가 나타난다.',dice:null,keywords:[{keywordId:'rain',display:'both'},{keywordId:'rainbow',display:'inline'}]}];
  c.actives=[{id:'a',name:'눈 판정',effect:'선택한 눈이 나오면 성공.',keywords:[],dice:{faces:[2,5,6],text:'성공',color:'#427963'}}];
  p.cards[0]=a.applyTemplate(c,p.settings,'monster-standard',p.keywords);
  const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d'),shapes=[],prototype=CanvasRenderingContext2D.prototype,round=prototype.roundRect;
  prototype.roundRect=function(x,y,w,h,...r){shapes.push({x,y,w,h});return round.call(this,x,y,w,h,...r);};
  document.body.append(canvas);canvas.style.width='400px';
  let report;try{report=a.renderCard(ctx,p,p.cards[0],new Map(),300);}finally{prototype.roundRect=round;}
  const badges=p.cards[0].elements.filter(e=>e.binding?.field==='skill.keywords');
  const effect=p.cards[0].elements.find(e=>e.binding?.field==='skill.effect'&&e.binding.skillId==='p');
  const die=p.cards[0].elements.find(e=>e.type==='dice'),scale=300/25.4;
  const pixels=ctx.getImageData(Math.floor(effect.rect.x*scale),Math.floor(effect.rect.y*scale),Math.floor(effect.rect.w*scale),Math.floor(effect.rect.h*scale)).data;
  let red=0,blue=0;for(let i=0;i<pixels.length;i+=4){if(pixels[i]>140&&pixels[i+1]<100&&pixels[i+2]<110)red++;if(pixels[i]<100&&pixels[i+1]<100&&pixels[i+2]>140)blue++;}
  const faces=shapes.filter(s=>Math.abs(s.w-s.h)<.001&&s.x>=die.rect.x&&s.y>=die.rect.y&&s.x+s.w<=die.rect.x+die.rect.w+.001&&s.y+s.h<=die.rect.y+die.rect.h+.001);
  return {report,badgeCount:badges.length,red,blue,faceCount:faces.length,columns:[...new Set(faces.map(s=>+s.x.toFixed(3)))].length,rows:[...new Set(faces.map(s=>+s.y.toFixed(3)))].length};
 });
 assert.equal(r.badgeCount,1);assert.ok(r.red>10&&r.blue>10,'Both chosen keyword colors must be visible inside the effect text');
 assert.equal(r.faceCount,6);assert.equal(r.columns,2);assert.equal(r.rows,3);assert.deepEqual(r.report.problems,[]);
 await page.screenshot({path:path.join(qa,'workshop-keyword-dice.png'),fullPage:true});
 }finally{await browser.close();}
});
