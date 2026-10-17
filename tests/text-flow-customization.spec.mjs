import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url);let chromium;try{({chromium}=require('playwright'));}catch{({chromium}=require('C:/Users/hyeon/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));}
const root=fileURLToPath(new URL('../',import.meta.url));
const bundled=await build({absWorkingDir:root,stdin:{contents:"import './tests/harness-entry.js';import {renderInspector} from './src/ui/inspector.js';import {createStore} from './src/model/store.js';window.testApi.renderInspector=renderInspector;window.testApi.createStore=createStore;",resolveDir:root,sourcefile:'text-flow-private-entry.js'},bundle:true,format:'iife',target:'es2022',write:false,loader:{'.woff2':'base64'}});
async function open(){
 const browser=await chromium.launch({headless:true,executablePath:process.env.CARD_BROWSER_PATH||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'}),page=await browser.newPage(),pageErrors=[];
 page.on('pageerror',e=>pageErrors.push(e.message));await page.setContent('<!doctype html><html lang="ko"><body></body></html>');await page.addScriptTag({content:bundled.outputFiles[0].text});await page.evaluate(()=>window.testApi.ensureFont());return {browser,page,pageErrors};
}
test('wrapping measures spacing and line height for plain keyword and named text',async()=>{
 const {browser,page,pageErrors}=await open();try{
  const r=await page.evaluate(()=>{
   const a=window.testApi,g=document.createElement('canvas').getContext('2d'),rect={x:0,y:0,w:15,h:100},style={fontPt:10,fontWeight:400,letterSpacingMm:1,lineHeight:1.8};
   const plain=a.fitRichText(g,'가나다라마바사아자차',rect,style,10),normal=a.fitRichText(g,'가나다라마바사아자차',rect,{fontPt:10},10),keyword={id:'fire',name:'가나다',color:'#d84422',iconAssetId:null},rich=a.fitRichText(g,'가나다라마바사아자차',rect,style,10,[keyword]);
   const c=a.createProject().cards[0];c.passives=[{id:'named',name:'가나다',effect:'',dice:null,nameStyle:{fontPt:17,fontStyle:'italic',lineHeight:1.8}}];c.actives=[];
   const spans=a.skillNameSpans(c,'가나다라마바사'),named=a.fitRichText(g,'가나다라마바사',rect,{fontPt:10},10,[],[],spans);
   const impossible=a.fitText(g,'폭과 높이가 모자란 문장',{x:0,y:0,w:1,h:1},{fontPt:10,lineHeight:2,letterSpacingMm:.5},9);
   const p=a.createProject(),flowCard=p.cards[0];flowCard.passives=[{id:'small',name:'작은이름',effect:'작은이름 '.repeat(16),dice:null,nameStyle:{fontPt:7}}];flowCard.actives=[];
   const authored=a.applyTemplate(flowCard,p.settings,'monster-standard');authored.elements.find(e=>e.binding?.field==='skill.effect').style.fontPt=14;const flowed=a.syncSkillElements(authored,p.settings),body=flowed.elements.find(e=>e.binding?.field==='skill.effect');
   const measured=a.fitRichText(g,flowed.passives[0].effect,body.rect,body.style,p.settings.minFontPt,[],[],a.skillNameSpans(flowed,flowed.passives[0].effect));
   return {plain,normal,rich,named,spans,impossible,flowedHeight:body.rect.h,measuredHeight:measured.heightMm};
  });
  assert.ok(r.plain.lines.length>r.normal.lines.length,'letter spacing changes wrapping');
  assert.ok(Math.abs(r.plain.heightMm-r.plain.lines.length*10*25.4/72*1.8)<.0001);
  assert.ok(r.rich.lines.length>=r.plain.lines.length,'inline tokens include the same letter spacing');
  assert.equal(r.spans.length,1,'name typography alone creates a styled span');
  assert.ok(r.named.heightMm>r.normal.fontPt*25.4/72*1.22);
  assert.equal(r.impossible.fontPt,9);assert.equal(r.impossible.fits,false);assert.ok(Math.abs(r.flowedHeight-r.measuredHeight)<.001,'automatic layout measures the authored smaller name font at the project minimum');assert.deepEqual(pageErrors,[]);
 }finally{await browser.close();}
});
test('canvas at preview and print resolutions uses italic spacing line height and underline',async()=>{
 const {browser,page,pageErrors}=await open();try{
  const r=await page.evaluate(async()=>{
   const a=window.testApi,p=a.createProject(),c=p.cards[0],canvas=document.createElement('canvas'),e={id:'text',type:'text',binding:null,content:'글자 꾸미기\n같은 인쇄 모양',rect:{x:4,y:20,w:55,h:25},style:{fontPt:11,color:'#263d32'}};
   c.elements=[e];const draw=dpi=>{const report=a.renderCard(canvas.getContext('2d'),p,c,new Map(),dpi);return {png:canvas.toDataURL(),report,width:canvas.width,height:canvas.height};};
   const before=draw(100);Object.assign(e.style,{fontStyle:'italic',letterSpacingMm:.4,lineHeight:1.8,underline:true});
   const preview=draw(100),print=draw(300),again=draw(300),captured=[],original=HTMLCanvasElement.prototype.toDataURL;let pdf;
   HTMLCanvasElement.prototype.toDataURL=function(...args){const png=original.apply(this,args);if(this.width===744&&this.height===1039)captured.push(png);return png;};
   try{pdf=await a.createPdf(p);}finally{HTMLCanvasElement.prototype.toDataURL=original;}
   return {before,preview,print,again,pdfBytes:pdf.length,pdfRasterMatches:captured.at(-1)===print.png};
  });
  assert.ok(r.before.png!==r.preview.png,'custom typography changes preview pixels');assert.ok(r.print.png===r.again.png,'print rendering is deterministic');assert.ok(r.pdfBytes>1000);assert.equal(r.pdfRasterMatches,true,'PDF receives the exact customized 300dpi raster');assert.equal(r.print.width,744);assert.equal(r.print.height,1039);assert.deepEqual(r.print.report.problems,[]);assert.deepEqual(pageErrors,[]);
 }finally{await browser.close();}
});
test('real inspector typography edits keep auto flow and long descriptions move the following row down and up',async()=>{
 const {browser,page,pageErrors}=await open();try{
  await page.evaluate(()=>{
   const a=window.testApi,p=a.createProject(),c=p.cards[0];c.passives=[{id:'first',name:'첫 기술',effect:'짧은 설명',dice:null,keywords:[]},{id:'second',name:'다음 기술',effect:'다음 설명',dice:null,keywords:[]}];c.actives=[];p.cards[0]=a.applyTemplate(c,p.settings,'monster-standard');
   p.cards[0].elements.push({id:'free-art',type:'image',binding:null,rect:{x:1,y:2,w:3,h:4},style:{fit:'contain'}});
   const store=a.createStore(p),state={activeCardId:c.id,back:false,selectedElementId:p.cards[0].elements.find(e=>e.binding?.field==='skill.effect').id},host=document.createElement('aside');host.id='inspector';document.body.append(host);
   const ctx={store,state,card:()=>store.getProject().cards[0],target:()=>store.getProject().cards[0],edit:(label,fn)=>store.edit(label,fn),editTarget:(label,fn)=>store.edit(label,d=>fn(d.cards[0])),renderInspector:()=>a.renderInspector(host,ctx)};window.ui={ctx,host};store.subscribe(()=>a.renderInspector(host,ctx));a.renderInspector(host,ctx);
  });
  assert.equal(await page.locator('#element-font').count(),1);assert.ok((await page.locator('#inspector').textContent()).includes('방향키 1px · Shift 10px (인쇄 300dpi 기준)'));
  await page.locator('#element-font').fill('11');await page.locator('#element-font').dispatchEvent('change');
  const auto=await page.evaluate(()=>window.ui.ctx.card().autoSkillLayout);assert.equal(auto,true,'font changes must keep automatic placement enabled');
  assert.equal(await page.locator('#element-line-height').count(),1);assert.equal(await page.locator('#element-letter-spacing').count(),1);assert.equal(await page.locator('#element-italic').count(),1);assert.equal(await page.locator('#element-underline').count(),1);
  await page.locator('#element-line-height').fill('1.6');await page.locator('#element-line-height').dispatchEvent('change');await page.locator('#element-letter-spacing').fill('0.3');await page.locator('#element-letter-spacing').dispatchEvent('change');await page.locator('#element-italic').check();await page.locator('#element-underline').check();
  const snapshot=()=>page.evaluate(()=>{const c=window.ui.ctx.card(),find=(field,id='first')=>c.elements.find(e=>e.binding?.field===field&&e.binding.skillId===id);return {y:find('skill.name','second').rect.y,body:find('skill.effect'),art:c.elements.find(e=>e.id==='free-art'),auto:c.autoSkillLayout};});
  const short=await snapshot();await page.locator('#skill-first-effect').fill('설명이 길어지면 다음 스킬이 아래로 이어집니다. '.repeat(10));const long=await snapshot();await page.locator('#skill-first-effect').fill('짧게');const back=await snapshot();
  assert.ok(long.y>short.y+15);assert.ok(back.y<long.y-15);assert.equal(back.body.style.fontPt,11);assert.equal(back.body.style.lineHeight,1.6);assert.equal(back.body.style.letterSpacingMm,.3);assert.equal(back.body.style.fontStyle,'italic');assert.equal(back.body.style.underline,true);assert.equal(back.auto,true);assert.deepEqual(back.art,short.art);
  assert.equal(await page.locator('#skill-first-name-style-font').count(),1);assert.equal(await page.locator('#skill-first-effect-style-font').count(),1);assert.equal(await page.locator('#card-name-style-font').count(),1);assert.deepEqual(pageErrors,[]);
 }finally{await browser.close();}
});


test('generated attribute layout still reserves its multi-attribute row',async()=>{
 const {browser,page,pageErrors}=await open();try{
  await page.evaluate(()=>{
   const a=window.testApi,p=a.createProject();p.cards[0]=a.applyTemplate(p.cards[0],p.settings,'monster-standard');
   const store=a.createStore(p),state={activeCardId:p.cards[0].id,back:false,selectedElementId:null},host=document.createElement('aside');document.body.append(host);
   const ctx={store,state,card:()=>store.getProject().cards[0],target:()=>store.getProject().cards[0],edit:(label,fn)=>store.edit(label,fn)};
   window.ui={ctx,host};store.subscribe(()=>a.renderInspector(host,ctx));a.renderInspector(host,ctx);
  });
  await page.locator('#attribute-water').check();
  const result=await page.evaluate(()=>{const c=window.ui.ctx.card();return {badge:c.elements.find(e=>e.type==='attribute').rect,art:c.elements.find(e=>e.binding?.field==='art').rect};});
  assert.equal(result.badge.w,55);assert.equal(result.art.y,26);assert.equal(result.art.y+result.art.h,48);
  const manual=await page.evaluate(()=>{const {ctx}=window.ui;ctx.store.edit('그림 직접 이동',p=>{const c=p.cards[0];c.elements.find(e=>e.binding?.field==='art').rect={x:7,y:30,w:42,h:17};c.elements.push({id:'free-art',type:'image',binding:null,rect:{x:2,y:1,w:3,h:4},style:{fit:'cover'}});});const c=ctx.card();return {art:c.elements.find(e=>e.binding?.field==='art'),free:c.elements.find(e=>e.id==='free-art')};});
  await page.locator('#attribute-water').uncheck();
  const preserved=await page.evaluate(()=>{const c=window.ui.ctx.card();return {badge:c.elements.find(e=>e.type==='attribute').rect,art:c.elements.find(e=>e.binding?.field==='art'),free:c.elements.find(e=>e.id==='free-art')};});
  assert.equal(preserved.badge.w,7.8);assert.deepEqual(preserved.art,manual.art);assert.deepEqual(preserved.free,manual.free);assert.deepEqual(pageErrors,[]);
 }finally{await browser.close();}
});
test('keyword icons remain visible when a styled name is separated for effects',async()=>{
 const {browser,page,pageErrors}=await open();try{
  const result=await page.evaluate(async()=>{
   const a=window.testApi,source=document.createElement('canvas');source.width=source.height=8;source.getContext('2d').fillStyle='#1255ed';source.getContext('2d').fillRect(0,0,8,8);
   const image=new Image();image.src=source.toDataURL();await image.decode();
   const canvas=document.createElement('canvas');canvas.width=canvas.height=240;const g=canvas.getContext('2d');g.scale(8,8);
   const rect={x:1,y:1,w:25,h:20},keyword={id:'icon',name:'강타',color:'#111111',iconAssetId:'blue'},recipe=a.createVisualEffects('neonText'),span={id:'name',skillId:'first',start:0,end:2,style:{visualEffects:recipe}};
   a.drawRichText(g,'강타',rect,{fontPt:10},7,[keyword],new Map([['blue',image]]),{skillNameSpans:[span],skipNameEffects:true});
   const data=g.getImageData(0,0,canvas.width,canvas.height).data;let blue=0;for(let i=0;i<data.length;i+=4)if(data[i]<40&&data[i+1]>55&&data[i+1]<120&&data[i+2]>200&&data[i+3]>200)blue++;return blue;
  });
  assert.ok(result>50,'the keyword icon is independent of its name effect source');assert.deepEqual(pageErrors,[]);
 }finally{await browser.close();}
});

test('an authored overlay keeps covering the same skill after automatic text flow',async()=>{
 const {browser,page,pageErrors}=await open();try{
  const result=await page.evaluate(()=>{
   const a=window.testApi,p=a.createProject(),card=p.cards[0];card.passives=[{id:'first',name:'덮인 기술',effect:'짧은 설명',dice:null,keywords:[]}];card.actives=[];
   const c=a.applyTemplate(card,p.settings,'monster-standard'),title=c.elements.find(e=>e.binding?.field==='skill.name');c.template='custom';c.elements.push({id:'overlay',type:'rect',binding:null,rect:{...title.rect},style:{fill:'#ffffff'}});
   const canvas=document.createElement('canvas'),g=canvas.getContext('2d'),dark=target=>{a.renderCard(g,p,target,new Map(),127);const r=title.rect,data=g.getImageData(Math.ceil(r.x*5),Math.ceil(r.y*5),Math.floor(r.w*5)-1,Math.floor(r.h*5)-1).data;let count=0;for(let i=0;i<data.length;i+=4)if(data[i]<130&&data[i+1]<130&&data[i+2]<130)count++;return count;};
   const before=dark(c);c.passives[0].effect+=' ';const flowed=a.syncSkillElements(c,p.settings);return {before,after:dark(flowed),last:flowed.elements.at(-1).id};
  });
  assert.equal(result.before,0);assert.equal(result.after,0,'the manually placed overlay stays in front');assert.equal(result.last,'overlay');assert.deepEqual(pageErrors,[]);
 }finally{await browser.close();}
});
