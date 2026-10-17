import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url);let playwright;try{playwright=require('playwright');}catch{playwright=require('C:/Users/hyeon/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');}
const root=fileURLToPath(new URL('../',import.meta.url));
// Bundle in memory so this feature never rewrites the shared harness or app.
const bundle=await build({absWorkingDir:root,stdin:{contents:`
 import * as project from './src/model/project.js';import * as types from './src/model/types.js';
 import * as templates from './src/render/templates.js';import {renderCard} from './src/render/card.js';
 import {createStore} from './src/model/store.js';import {renderInspector} from './src/ui/inspector.js';
 import {createVariant} from './src/model/variants.js';import {ensureFont} from './src/render/font.js';
 import {mountCardCanvas} from './src/ui/canvas-editor.js';import {setElementSelection} from './src/ui/element-selection.js';
 window.attributeApi={...project,...types,...templates,renderCard,createStore,renderInspector,createVariant,ensureFont,mountCardCanvas,setElementSelection};
 `,resolveDir:root},bundle:true,format:'iife',target:'es2022',write:false,loader:{'.woff2':'base64'}});
async function openSource(){
 const browser=await playwright.chromium.launch({headless:true,executablePath:process.env.CARD_BROWSER_PATH||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.route(/^https?:/,r=>r.abort());
 await page.setContent('<!doctype html><html lang="ko"><body><aside id="inspector"></aside></body></html>');await page.addScriptTag({content:bundle.outputFiles[0].text});
 await page.evaluate(async()=>{
  const a=window.attributeApi;await a.ensureFont();const p=a.createProject();p.cards[0]=a.applyTemplate(p.cards[0],p.settings,'monster-standard');
  const store=a.createStore(p,{prepare:d=>{d.cards=d.cards.map(c=>c.variant&&c.autoSkillLayout?a.syncSkillElements(c,d.settings,d.keywords):c);}});
  const host=document.getElementById('inspector'),state={activeCardId:p.cards[0].id,back:false,selectedElementIds:[]};
  const ctx={store,state,card:()=>store.getProject().cards.find(c=>c.id===state.activeCardId),target:()=>ctx.card(),edit:(label,change)=>{store.edit(label,change);a.renderInspector(host,ctx);}};
  window.attributeEditor=ctx;a.renderInspector(host,ctx);
 });return {browser,page,errors};
}

test('monster selection stays required while items can grant multiple attributes or clear them all',async()=>{
 const {browser,page,errors}=await openSource();try{
  assert.equal(await page.locator('#attributes input[type=checkbox]').count(),6);
  assert.equal(await page.locator('#attribute-selection').innerText(),'무속성');
  assert.equal(await page.locator('#attribute-water').isVisible(),false);await page.locator('#attribute-menu-toggle').click();
  assert.equal(await page.locator('#attribute-neutral').isChecked(),true);assert.equal(await page.locator('#attribute-neutral').isDisabled(),true);
  for(const attribute of ['water','fire','grass','dark','light'])await page.locator('#attribute-'+attribute).check();
  const selection=await page.evaluate(()=>{const e=window.attributeEditor,a=window.attributeApi,p=a.parseProject(a.serializeProject(e.store.getProject()));return {values:a.cardAttributes(p.cards[0]),scalar:p.cards[0].attribute};});
  assert.deepEqual(selection.values,['water','fire','grass','neutral','dark','light']);assert.equal(selection.scalar,'water');
  await page.locator('#attribute-neutral').uncheck();assert.equal(await page.locator('#attribute-neutral').isChecked(),false);
  await page.evaluate(()=>{const e=window.attributeEditor,a=window.attributeApi,item=a.createCard('item',e.store.getProject());e.state.activeCardId=item.id;e.edit('아이템',d=>d.cards.push(a.applyTemplate(item,d.settings,'item')));});
  assert.equal(await page.locator('#attributes input[type=checkbox]').count(),6);
  assert.equal(await page.locator('#attributes input:checked').count(),0);assert.equal(await page.locator('#attributes input:disabled').count(),0);
  await page.locator('#attribute-water').check();await page.locator('#attribute-light').check();
  assert.deepEqual(await page.evaluate(()=>{const e=window.attributeEditor,a=window.attributeApi;return a.cardAttributes(a.parseProject(a.serializeProject(e.store.getProject())).cards.at(-1));}),['water','light']);
  await page.locator('#attribute-water').uncheck();await page.locator('#attribute-light').uncheck();
  assert.deepEqual(await page.evaluate(()=>{const e=window.attributeEditor;return {values:window.attributeApi.cardAttributes(e.card()),badges:e.card().elements.filter(el=>el.type==='attribute').length};}),{values:[],badges:1});
  assert.equal(await page.locator('#item-effect').count(),1);assert.equal(await page.locator('#attribute-selection').innerText(),'속성 없음');
  await page.locator('#attribute-light').press('Escape');assert.equal(await page.locator('#attribute-water').isVisible(),false);
  await page.locator('#attribute-menu-toggle').press('Enter');assert.equal(await page.locator('#attribute-water').isVisible(),true);assert.deepEqual(errors,[]);
 }finally{await browser.close();}
});

test('variant attribute checkboxes preserve independent selection and restore current parent values',async()=>{
 const {browser,page,errors}=await openSource();try{
  await page.locator('#attribute-menu-toggle').click();
  await page.locator('#attribute-water').check();
  await page.evaluate(()=>{const e=window.attributeEditor,a=window.attributeApi,child=a.createVariant(e.store.getProject(),e.state.activeCardId);e.state.activeCardId=child.id;e.edit('Variant',d=>d.cards.push(child));});
  await page.locator('#attribute-fire').check();
  await page.evaluate(()=>{const e=window.attributeEditor;e.edit('원본 변경',d=>{d.cards[0].attributes=['grass','light'];d.cards[0].attribute='grass';d.cards[0].baseHp=250;});});
  assert.equal(await page.locator('#attribute-fire').isChecked(),true);assert.equal(await page.locator('#attribute-water').isChecked(),true);
  const own=await page.evaluate(()=>{const e=window.attributeEditor;return {overrides:Object.keys(e.card().variant.overrides),hp:e.card().baseHp};});
  assert.deepEqual(own,{overrides:['attributes'],hp:250});await page.locator('[data-variant-reset=attributes]').click();
  assert.equal(await page.locator('#attribute-grass').isChecked(),true);assert.equal(await page.locator('#attribute-light').isChecked(),true);assert.equal(await page.locator('#attribute-fire').isChecked(),false);assert.deepEqual(errors,[]);
 }finally{await browser.close();}
});

test('all six circular badges render legibly without font or layout errors at preview and print resolutions',async()=>{
 const {browser,page}=await openSource();try{
  const result=await page.evaluate(()=>{
   const a=window.attributeApi,p=a.createProject(),all=Object.keys(a.ATTRIBUTES);p.cards[0].attributes=all;p.cards[0].attribute=all[0];
   p.cards[0].passives=[{id:'multi-passive',name:'속성 연결',effect:'각 속성이 함께 적용됩니다.',dice:null,keywords:[]}];
   const card=a.applyTemplate(p.cards[0],p.settings,'monster-standard'),badge=card.elements.find(e=>e.type==='attribute');
   return [72,300].map(dpi=>{
    const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d'),report=a.renderCard(ctx,p,card,new Map(),dpi),scale=dpi/25.4;
    const colored=all.map((_,i)=>{const left=Math.round((badge.rect.x+i*badge.rect.w/6)*scale),right=Math.round((badge.rect.x+(i+1)*badge.rect.w/6)*scale),top=Math.round(badge.rect.y*scale),height=Math.round(5*scale);
     const pixels=ctx.getImageData(left,top,right-left,height).data;let count=0;for(let n=0;n<pixels.length;n+=4)if(Math.min(...pixels.slice(n,n+3))<140)count++;return count;
    });return {problems:report.problems,colored,fontSizes:card.elements.filter(e=>e.style.fontPt).map(e=>e.style.fontPt)};
   });
  });
  for(const r of result){assert.deepEqual(r.problems,[]);assert.ok(r.colored.every(count=>count>=4));assert.ok(r.fontSizes.every(size=>size>=7));}
 }finally{await browser.close();}
});

test('item candle badges render with no innate attribute and with six grants at preview and print sizes',async()=>{
 const {browser,page}=await openSource();try{
  const results=await page.evaluate(()=>{
   const a=window.attributeApi,p=a.createProject();return [[],Object.keys(a.ATTRIBUTES)].flatMap(selected=>{
    const original=a.createCard('item',p);original.name='양초 유물';original.effect='사용하면 체력을 회복합니다.';original.attributes=selected;
    const item=a.applyTemplate(original,p.settings,'item'),badge=item.elements.find(e=>e.type==='attribute'),art=item.elements.find(e=>e.binding?.field==='art'),body=item.elements.find(e=>e.binding?.field==='item.effect');
    return [72,300].map(dpi=>{
     const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d'),report=a.renderCard(ctx,p,item,new Map(),dpi),scale=dpi/25.4;
     const pixels=ctx.getImageData(Math.round(badge.rect.x*scale),Math.round(badge.rect.y*scale),Math.round(badge.rect.w*scale),Math.round(badge.rect.h*scale)).data;
     let ink=0;for(let i=0;i<pixels.length;i+=4)if(Math.min(...pixels.slice(i,i+3))<140)ink++;
     return {problems:report.problems,ink,noArtOverlap:badge.rect.y+badge.rect.h<=art.rect.y,noBodyOverlap:art.rect.y+art.rect.h<body.rect.y};
    });
   });
  });for(const result of results){assert.deepEqual(result.problems,[]);assert.ok(result.ink>20);assert.equal(result.noArtOverlap,true);assert.equal(result.noBodyOverlap,true);}
 }finally{await browser.close();}
});

test('item attribute checkboxes inherit, clear independently and restore parent grants',async()=>{
 const {browser,page,errors}=await openSource();try{
  await page.evaluate(()=>{const a=window.attributeApi,e=window.attributeEditor,item=a.applyTemplate(a.createCard('item',e.store.getProject()),e.store.getProject().settings,'item');e.state.activeCardId=item.id;e.edit('아이템',d=>{d.cards=[item];});});
  await page.locator('#attribute-menu-toggle').click();await page.locator('#attribute-fire').check();await page.locator('#attribute-dark').check();
  await page.evaluate(()=>{const a=window.attributeApi,e=window.attributeEditor,child=a.createVariant(e.store.getProject(),e.state.activeCardId);e.state.activeCardId=child.id;e.edit('Variant',d=>d.cards.push(child));});
  await page.locator('#attribute-fire').uncheck();await page.locator('#attribute-dark').uncheck();
  await page.evaluate(()=>window.attributeEditor.edit('원본 속성 변경',d=>{d.cards[0].attributes=['water','light'];d.cards[0].attribute='water';}));
  assert.equal(await page.locator('#attributes input:checked').count(),0);await page.locator('[data-variant-reset=attributes]').click();
  assert.equal(await page.locator('#attribute-water').isChecked(),true);assert.equal(await page.locator('#attribute-light').isChecked(),true);assert.deepEqual(errors,[]);
 }finally{await browser.close();}
});

test('out-of-bounds diagnostics include actual element and card dimensions and all exceeded edges',async()=>{
 const {browser,page}=await openSource();try{
  const result=await page.evaluate(()=>{
   const a=window.attributeApi,p=a.createProject();p.cards[0].name='경계';p.cards[0].elements=[{id:'oversize',type:'rect',rect:{x:-1,y:-2,w:70,h:95},binding:null,style:{fill:'#333'}}];
   return a.renderCard(document.createElement('canvas').getContext('2d'),p,p.cards[0],new Map(),72).problems;
  });const issue=result.find(p=>p.code==='out-of-bounds');assert.ok(issue);assert.equal(issue.severity,undefined);
  for(const text of ['경계','x -1','y -2','폭 70','높이 95','폭 63','높이 88','왼쪽 1','위쪽 2','오른쪽 6','아래쪽 5'])assert.ok(issue.message.includes(text),text);
 }finally{await browser.close();}
});
async function prepareLegacyItemCanvas(page){
 await page.addStyleTag({content:'.attribute-canvas-fixture{width:252px}.card-stage{position:relative}.card-stage>canvas{display:block;width:100%;height:100%}#selection-box,#selection-marquee,.selection-members,.selection-member{position:absolute;pointer-events:none}.selection-members{inset:0}.resize-handle{pointer-events:auto}'});
 await page.evaluate(()=>{
  const a=window.attributeApi,e=window.attributeEditor,item=a.createCard('item',e.store.getProject());
  Object.assign(item,{name:'옛 아이템 배치',template:'custom',autoSkillLayout:false});
  const visible=(id,rect)=>({id,type:'rect',rect,binding:null,style:{fill:'#4d8660'}});
  item.elements=[visible('visible-art',{x:10,y:20,w:30,h:30}),visible('other-art',{x:45,y:20,w:10,h:10}),
   {id:'candle-badge',type:'attribute',rect:{x:49,y:4,w:8,h:9},binding:null,style:{fontPt:7}}];
  e.state.activeCardId=item.id;e.state.mode='card';e.state.cardScale=4;e.assets=new Map();e.edit('옛 아이템 테스트',d=>{d.cards=[item];});
  const region=document.createElement('div');region.className='attribute-canvas-fixture';
  region.innerHTML='<div id="attribute-canvas-host"></div><div hidden><input id="card-zoom" type="range"><span id="card-zoom-value"></span><button id="card-effect-play"></button><input id="card-effect-time" type="number"><span id="card-effect-seconds"></span><button id="card-effect-print-frame"></button><button id="card-effect-freeze"></button><div id="card-warnings"></div><span id="canvas-size"></span></div>';
  document.body.prepend(region);e.renderInspector=()=>a.renderInspector(document.getElementById('inspector'),e);
  e.editTarget=(label,change)=>e.edit(label,d=>change(d.cards.find(c=>c.id===e.state.activeCardId)));
  e.cardCanvas=a.mountCardCanvas(document.getElementById('attribute-canvas-host'),e);
  e.selectElements=ids=>{a.setElementSelection(e.state,ids,e.target());e.renderInspector();e.cardCanvas.refresh();};
  e.store.subscribe(()=>e.cardCanvas.refresh());e.cardCanvas.refresh();
  window.attributeSelectionStart=a.serializeProject(e.store.getProject());
 });
}
async function canvasPoint(page,x,y){const box=await page.locator('#card-canvas').boundingBox();return {x:box.x+x*box.width/63,y:box.y+y*box.height/88};}
async function canvasClick(page,x,y,shift=false){const point=await canvasPoint(page,x,y);if(shift)await page.keyboard.down('Shift');try{await page.mouse.click(point.x,point.y);}finally{if(shift)await page.keyboard.up('Shift');}}
async function canvasDrag(page,x1,y1,x2,y2,shift=false){const from=await canvasPoint(page,x1,y1),to=await canvasPoint(page,x2,y2);if(shift)await page.keyboard.down('Shift');try{await page.mouse.move(from.x,from.y);await page.mouse.down();await page.mouse.move(to.x,to.y,{steps:5});await page.mouse.up();}finally{if(shift)await page.keyboard.up('Shift');}}
async function canvasSelection(page){return page.evaluate(()=>{const e=window.attributeEditor,box=document.getElementById('selection-box');return {ids:e.state.selectedElementIds,primary:e.state.selectedElementId,overlay:!box.hidden,count:Number(box.dataset.count),members:[...document.querySelectorAll('.selection-member')].map(node=>node.dataset.elementId),controls:document.querySelectorAll('#element-x').length};});}
async function assertLegacyCanvasUnchanged(page){assert.equal(await page.evaluate(()=>window.attributeApi.serializeProject(window.attributeEditor.store.getProject())===window.attributeSelectionStart),true);}

test('visible item candles support ordinary and Shift selection together with artwork',async()=>{
 const {browser,page,errors}=await openSource();try{
  await prepareLegacyItemCanvas(page);await canvasClick(page,53,8);
  assert.deepEqual(await canvasSelection(page),{ids:['candle-badge'],primary:'candle-badge',overlay:true,count:1,members:[],controls:1});
  await canvasClick(page,25,35,true);const mixed=await canvasSelection(page);assert.deepEqual(mixed.ids,['candle-badge','visible-art']);assert.deepEqual(mixed.members,['visible-art','candle-badge']);assert.equal(mixed.count,2);
  await canvasClick(page,53,8,true);assert.deepEqual((await canvasSelection(page)).ids,['visible-art']);
  await assertLegacyCanvasUnchanged(page);assert.deepEqual(errors,[]);
 }finally{await browser.close();}
});

test('item candles participate in forward reverse and additive marquee selections',async()=>{
 const {browser,page,errors}=await openSource();try{
  await prepareLegacyItemCanvas(page);await canvasDrag(page,45,1,60,15);assert.deepEqual((await canvasSelection(page)).ids,['candle-badge']);
  await canvasDrag(page,5,15,42,55,true);assert.deepEqual((await canvasSelection(page)).ids,['candle-badge','visible-art']);
  await page.evaluate(()=>window.attributeEditor.selectElements([]));await canvasDrag(page,60,55,5,1);
  const reverse=await canvasSelection(page);assert.deepEqual(reverse.ids,['visible-art','other-art','candle-badge']);assert.deepEqual(reverse.members,['visible-art','other-art','candle-badge']);
  await assertLegacyCanvasUnchanged(page);assert.deepEqual(errors,[]);
 }finally{await browser.close();}
});

test('stale IDs are removed while valid item candle selections and cancelled artwork moves survive',async()=>{
 const {browser,page,errors}=await openSource();try{
  await prepareLegacyItemCanvas(page);await page.evaluate(()=>window.attributeEditor.selectElements(['gone-element']));
  assert.deepEqual(await canvasSelection(page),{ids:[],primary:null,overlay:false,count:0,members:[],controls:0});
  await page.evaluate(()=>window.attributeEditor.selectElements(['candle-badge','gone-element']));
  assert.deepEqual(await canvasSelection(page),{ids:['candle-badge'],primary:'candle-badge',overlay:true,count:1,members:[],controls:1});
  await page.evaluate(()=>window.attributeEditor.selectElements(['visible-art','candle-badge']));
  const from=await canvasPoint(page,25,35),to=await canvasPoint(page,30,40);await page.mouse.move(from.x,from.y);await page.mouse.down();await page.mouse.move(to.x,to.y,{steps:4});
  await page.locator('.card-stage').dispatchEvent('pointercancel',{pointerId:1});await page.mouse.up();assert.deepEqual((await canvasSelection(page)).ids,['visible-art','candle-badge']);
  await assertLegacyCanvasUnchanged(page);assert.deepEqual(errors,[]);
 }finally{await browser.close();}
});
