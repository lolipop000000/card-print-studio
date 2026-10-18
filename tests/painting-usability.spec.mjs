import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {chromium} from 'playwright';

const root=fileURLToPath(new URL('../',import.meta.url));
const bundle=build({absWorkingDir:root,stdin:{contents:"import * as painting from './src/painting/document.js';import * as tools from './src/painting/tools.js';import {createPaintHistory} from './src/painting/history.js';import {openPaintingEditor} from './src/ui/painting.js';import {createProject} from './src/model/project.js';import {createStore} from './src/model/store.js';window.paintApi={...painting,...tools,createPaintHistory,openPaintingEditor,createProject,createStore};",resolveDir:root},bundle:true,format:'iife',target:'es2022',write:false,loader:{'.woff2':'base64'}});
const MODES=['source-over','multiply','screen','overlay','darken','lighten','color-dodge','color-burn','hard-light','soft-light','difference','exclusion','hue','saturation','color','luminosity','lighter','source-in','source-out','source-atop','destination-over','destination-in','destination-out','destination-atop','copy','xor'];
async function openMemoryPainter(){
 await mkdir(new URL('../artifacts/qa/',import.meta.url),{recursive:true});
 const browser=await chromium.launch({headless:true,executablePath:process.env.CARD_BROWSER_PATH||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:960},acceptDownloads:true}),errors=[];page.setDefaultTimeout(10000);
  page.on('pageerror',e=>errors.push(e.message));await page.route(/^https?:/,route=>route.abort());
  await page.setContent('<!doctype html><html lang="ko"><meta charset="utf-8"><body></body></html>');
  await page.addStyleTag({content:await readFile(new URL('../src/styles.css',import.meta.url),'utf8')});
  await page.addScriptTag({content:(await bundle).outputFiles[0].text});
  return {browser,page,errors};
 }catch(error){await browser.close();throw error;}
}
async function fixture(page,layers=[{id:'bottom',name:'밑그림',color:'#ff0000'},{id:'middle',name:'선화',color:'#00ff00',opacity:.5,visible:false,locked:true},{id:'top',name:'빛',color:'#0000ff'}]){
 await page.evaluate(async definitions=>{
  const a=window.paintApi,p=a.createProject(),saved={id:'qa-painting',width:512,height:512,activeLayerId:definitions.at(-1).id,layers:[]};
  for(const definition of definitions){const c=a.newCanvas(512,512),ctx=c.getContext('2d');ctx.fillStyle=definition.color;ctx.fillRect(0,0,512,512);saved.layers.push({id:definition.id,name:definition.name,visible:definition.visible??true,locked:definition.locked??false,opacity:definition.opacity??1,blendMode:definition.blendMode??'source-over',png:c.toDataURL()});}
  p.paintings[saved.id]=saved;p.assets['qa-art']={id:'qa-art',mime:'image/png',width:512,height:512,dataUrl:saved.layers[0].png,paintingId:saved.id};p.cards[0].artAssetId='qa-art';
  window.paintFixture=saved;window.paintStore=a.createStore(p);window.paintCardId=p.cards[0].id;void a.openPaintingEditor(document.body,window.paintStore,window.paintCardId);
 },layers);
 await page.locator('#painting-editor').waitFor();await idle(page);
}
const idle=page=>page.waitForFunction(()=>document.querySelector('#painting-editor')?.dataset.busy==='false');
const order=page=>page.locator('.paint-layer').evaluateAll(nodes=>nodes.map(n=>n.dataset.layerId));
const history=page=>page.locator('#paint-history').textContent();
async function mouseDrag(page,id,targetId,edge='before',{release=true}={}){
 await page.locator('[data-layer-id="'+id+'"]').scrollIntoViewIfNeeded();const from=await page.locator('[data-layer-id="'+id+'"]').boundingBox(),to=await page.locator('[data-layer-id="'+targetId+'"]').boundingBox();
 await page.mouse.move(from.x+from.width*.7,from.y+from.height/2);await page.mouse.down();await page.mouse.move(to.x+to.width*.65,to.y+(edge==='before'?4:to.height-4),{steps:12});
 if(release){await page.mouse.up();await idle(page);}
}
async function downloadPixels(page,selector){
 const pending=page.waitForEvent('download');await page.locator(selector).click();const download=await pending,stream=await download.createReadStream(),chunks=[];for await(const chunk of stream)chunks.push(chunk);
 return page.evaluate(async data=>{const image=new Image();image.src=data;await image.decode();const c=document.createElement('canvas');c.width=image.width;c.height=image.height;c.getContext('2d').drawImage(image,0,0);return [...c.getContext('2d').getImageData(256,256,1,1).data];},'data:image/png;base64,'+Buffer.concat(chunks).toString('base64'));
}

test('brush, eraser and line honor fractional and canvas-wide pixel sizes without corrupting undo',async()=>{
 const {browser,page,errors}=await openMemoryPainter();try{
  const result=await page.evaluate(async()=>{
   const a=window.paintApi,s=await a.openPainting(null);await a.editLayers(s,{type:'resizeCanvas',width:512,height:512});s.history=a.createPaintHistory();const t=a.createPaintTools(s),c=s.layers[0].canvas,alpha=(x,y)=>c.getContext('2d').getImageData(x,y,1,1).data[3];
   t.setOptions({size:.1,smoothing:0,color:'#ff0000'});const fractionalSize=t.getOptions().size;t.begin({x:20.5,y:20.5});await t.end();const fine=alpha(20,20);await s.history.undo();t.setOptions({size:1});t.begin({x:20.5,y:20.5});await t.end();const one=alpha(20,20);
   await s.history.undo();t.setOptions({size:512});const wideSize=t.getOptions().size;t.begin({x:256,y:256});await t.end();const wide=alpha(456,256),outside=alpha(0,0),count=s.history.count();await s.history.undo();const undone=alpha(456,256);await s.history.redo();const redone=alpha(456,256);
   t.setOptions({tool:'eraser',size:512});t.begin({x:256,y:256});await t.end();const erased=alpha(456,256);
   t.setOptions({tool:'line',size:300});t.begin({x:100,y:256});t.move({x:400,y:256});await t.end();const line=alpha(256,386);
   t.setOptions({size:99999});const max=t.getOptions().size;t.setOptions({size:-5});const min=t.getOptions().size;t.setOptions({size:NaN});const nan=t.getOptions().size;t.setOptions({size:Infinity});const infinite=t.getOptions().size;
   return {fractionalSize,fine,one,wideSize,wide,outside,count,undone,redone,erased,line,max,min,nan,infinite};
  });
  assert.equal(result.fractionalSize,.1);assert.ok(result.fine<result.one);assert.equal(result.wideSize,512);assert.equal(result.wide,255);assert.equal(result.outside,0);assert.equal(result.count,1);assert.equal(result.undone,0);assert.equal(result.redone,255);assert.equal(result.erased,0);assert.equal(result.line,255);assert.equal(result.min,.1);assert.equal(result.max,4096);assert.equal(result.nan,8);assert.equal(result.infinite,8);assert.deepEqual(errors,[]);
 }finally{await browser.close();}
});

test('brush size input keeps fine and large sizes aligned with the drawing cursor',async()=>{
 const {browser,page,errors}=await openMemoryPainter();try{
  await fixture(page);await page.locator('#paint-100').click();const box=await page.locator('#paint-viewport').boundingBox();
  for(const value of ['0.1','512','4096']){
   await page.locator('#brush-size').fill(value);await page.locator('#brush-size').press('Tab');assert.equal(await page.locator('#brush-size').inputValue(),value);await page.mouse.move(box.x+200,box.y+200);
   const actual=await page.locator('.paint-cursor').evaluate(n=>{const r=n.getBoundingClientRect(),css=getComputedStyle(n);return {width:r.width,height:r.height,computedWidth:parseFloat(css.width),computedHeight:parseFloat(css.height)};});
   for(const [key,size] of Object.entries(actual))assert.ok(Math.abs(size-Number(value))<=1/64,key+' must reflect the real brush footprint: '+JSON.stringify(actual));
  }
  await page.locator('#brush-size').fill('0.1');await page.locator('#brush-size').press('Tab');await page.locator('#paint-zoom').fill('50');await page.locator('#paint-zoom').press('Tab');await page.mouse.move(box.x+201,box.y+201);const zoomed=await page.locator('.paint-cursor').boundingBox();assert.ok(Math.abs(zoomed.width-.05)<=1/64);assert.ok(Math.abs(zoomed.height-.05)<=1/64);
  await page.locator('#brush-size').fill('');await page.locator('#brush-size').press('Tab');assert.equal(await page.locator('#brush-size').inputValue(),'8');assert.deepEqual(errors,[]);
 }finally{await browser.close();}
});

test('real mouse layer dragging moves to either edge as one reversible action while retaining layer data',async()=>{
 const {browser,page,errors}=await openMemoryPainter();try{
  await fixture(page);const initialHistory=await history(page);await mouseDrag(page,'bottom','top');assert.deepEqual(await order(page),['bottom','top','middle']);assert.match(await history(page),/^1단계/);
  await page.locator('#paint-undo').click();await idle(page);assert.deepEqual(await order(page),['top','middle','bottom']);await page.locator('#paint-redo').click();await idle(page);assert.deepEqual(await order(page),['bottom','top','middle']);
  await mouseDrag(page,'bottom','middle','after');assert.deepEqual(await order(page),['top','middle','bottom']);assert.match(await history(page),/^2단계/);assert.notEqual(await history(page),initialHistory);
  await page.locator('#paint-apply').click();await page.locator('#painting-editor').waitFor({state:'hidden'});
  const result=await page.evaluate(()=>{const p=window.paintStore.getProject(),doc=p.paintings[p.assets[p.cards[0].artAssetId].paintingId];return {doc,original:window.paintFixture};});
  assert.deepEqual(result.doc.layers.map(l=>l.name),['밑그림','선화','빛']);for(const {id,...layer} of result.doc.layers){const {id:originalId,...original}=result.original.layers.find(l=>l.name===layer.name);assert.deepEqual(layer,original);}assert.deepEqual(errors,[]);
 }finally{await browser.close();}
});

test('layer click, cancelled drags and floating transforms never silently change layer pixels or history',async()=>{
 const {browser,page,errors}=await openMemoryPainter();try{
  await fixture(page);await page.locator('[data-layer-id="bottom"]').click();assert.equal(await page.locator('.paint-layer.active').getAttribute('data-layer-id'),'bottom');const before=await history(page);
  await mouseDrag(page,'bottom','top','before',{release:false});assert.equal(await page.locator('.paint-layer.drop-before').count(),1);await page.keyboard.press('Escape');await page.mouse.up();assert.deepEqual(await order(page),['top','middle','bottom']);assert.equal(await history(page),before);assert.equal(await page.locator('dialog[open]').count(),1);
  await mouseDrag(page,'bottom','top','before',{release:false});const box=await page.locator('#paint-viewport').boundingBox();await page.mouse.move(box.x+100,box.y+100);await page.mouse.up();assert.deepEqual(await order(page),['top','middle','bottom']);assert.equal(await history(page),before);
  await page.locator('#select-all').click();await page.locator('#select-x').fill('20');await page.locator('#select-x').press('Tab');assert.equal(await page.locator('#select-commit').isEnabled(),true);
  await mouseDrag(page,'bottom','top');assert.deepEqual(await order(page),['top','middle','bottom']);assert.equal(await page.locator('#select-x').inputValue(),'20');assert.equal(await page.locator('#select-commit').isEnabled(),true);assert.equal(await history(page),before);assert.match(await page.locator('#paint-message').textContent(),/변형/);assert.deepEqual(errors,[]);
 }finally{await browser.close();}
});

test('all native layer blend modes match Canvas pixels and survive serialization while legacy layers use normal',async()=>{
 const {browser,page,errors}=await openMemoryPainter();try{
  const result=await page.evaluate(async modes=>{
   const a=window.paintApi,s=await a.openPainting(null);await a.editLayers(s,{type:'resizeCanvas',width:64,height:64});s.layers[0].canvas.getContext('2d').fillStyle='#b03060';s.layers[0].canvas.getContext('2d').fillRect(0,0,64,64);await a.editLayers(s,{type:'add'});const top=s.layers[1],ctx=top.canvas.getContext('2d');ctx.fillStyle='#3090e0';ctx.fillRect(8,8,40,40);top.opacity=.6;
   const mismatch=[];for(const mode of modes){top.blendMode=mode;const expected=a.newCanvas(64,64),ec=expected.getContext('2d');ec.drawImage(s.layers[0].canvas,0,0);ec.globalAlpha=.6;ec.globalCompositeOperation=mode;ec.drawImage(top.canvas,0,0);const got=a.compositePainting(s).getContext('2d').getImageData(0,0,64,64).data,want=ec.getImageData(0,0,64,64).data;if(got.some((v,i)=>v!==want[i]))mismatch.push(mode);}
   top.blendMode='multiply';const saved=await a.serializePainting(s),opened=await a.openPainting(saved);delete saved.layers[0].blendMode;delete saved.layers[1].blendMode;const legacy=await a.openPainting(saved);return {mismatch,savedMode:(await a.serializePainting(opened)).layers[1].blendMode,legacyModes:legacy.layers.map(l=>l.blendMode),pixelsSame:a.compositePainting(s).toDataURL()===a.compositePainting(opened).toDataURL()};
  },MODES);
  assert.deepEqual(result.mismatch,[]);assert.equal(result.savedMode,'multiply');assert.deepEqual(result.legacyModes,['source-over','source-over']);assert.equal(result.pixelsSame,true);assert.deepEqual(errors,[]);
 }finally{await browser.close();}
});

test('blend mode UI, transparent and white PNGs, card apply and reopening share the same compositing',async()=>{
 const {browser,page,errors}=await openMemoryPainter();try{
  await fixture(page,[{id:'bottom',name:'빨강',color:'#ff0000'},{id:'top',name:'파랑',color:'#0000ff'}]);assert.deepEqual((await page.locator('#paint-layer-blend-mode option').evaluateAll(nodes=>nodes.map(n=>n.value))).sort(),[...MODES].sort());
  await page.locator('#paint-layer-blend-mode').selectOption('multiply');await idle(page);assert.deepEqual(await page.locator('#paint-canvas').evaluate(c=>[...c.getContext('2d').getImageData(256,256,1,1).data]),[0,0,0,255]);assert.match(await history(page),/^1단계/);
  await page.locator('#paint-undo').click();await idle(page);assert.equal(await page.locator('#paint-layer-blend-mode').inputValue(),'source-over');await page.locator('#paint-redo').click();await idle(page);assert.equal(await page.locator('#paint-layer-blend-mode').inputValue(),'multiply');assert.deepEqual(await downloadPixels(page,'#paint-export-transparent'),[0,0,0,255]);
  await page.locator('#paint-layer-blend-mode').selectOption('destination-out');await idle(page);assert.deepEqual(await downloadPixels(page,'#paint-export-transparent'),[0,0,0,0]);assert.deepEqual(await downloadPixels(page,'#paint-export-white'),[255,255,255,255]);
  await page.locator('#paint-layer-blend-mode').selectOption('screen');await idle(page);await page.locator('#paint-apply').click();await page.locator('#painting-editor').waitFor({state:'hidden'});const applied=await page.evaluate(()=>{const p=window.paintStore.getProject(),asset=p.assets[p.cards[0].artAssetId];return {mode:p.paintings[asset.paintingId].layers[1].blendMode,dataUrl:asset.dataUrl};});assert.equal(applied.mode,'screen');
  assert.deepEqual(await page.evaluate(async url=>{const image=new Image();image.src=url;await image.decode();const c=document.createElement('canvas');c.width=image.width;c.height=image.height;c.getContext('2d').drawImage(image,0,0);return [...c.getContext('2d').getImageData(256,256,1,1).data];},applied.dataUrl),[255,0,255,255]);
  await page.evaluate(()=>void window.paintApi.openPaintingEditor(document.body,window.paintStore,window.paintCardId));await page.locator('#painting-editor').waitFor();assert.equal(await page.locator('#paint-layer-blend-mode').inputValue(),'screen');assert.deepEqual(await page.locator('#paint-canvas').evaluate(c=>[...c.getContext('2d').getImageData(256,256,1,1).data]),[255,0,255,255]);assert.deepEqual(errors,[]);
 }finally{await browser.close();}
});

test('merging native mixed layers is reversible and rejects a merge that would change the current picture',async()=>{
 const {browser,page,errors}=await openMemoryPainter();try{
  const result=await page.evaluate(async()=>{
   const a=window.paintApi,s=await a.openPainting(null);await a.editLayers(s,{type:'resizeCanvas',width:64,height:64});const base=s.layers[0];base.canvas.getContext('2d').fillStyle='#ff0000';base.canvas.getContext('2d').fillRect(0,0,64,64);await a.editLayers(s,{type:'add'});let top=s.layers[1];top.canvas.getContext('2d').fillStyle='#0000ff';top.canvas.getContext('2d').fillRect(0,0,64,64);top.blendMode='multiply';s.history=a.createPaintHistory();const before=a.compositePainting(s).toDataURL();await a.editLayers(s,{type:'mergeDown'});const same=before===a.compositePainting(s).toDataURL(),mode=s.layers[0].blendMode,count=s.history.count();await s.history.undo();const undoSame=before===a.compositePainting(s).toDataURL(),restoredMode=s.layers[1].blendMode;await s.history.redo();const redoSame=before===a.compositePainting(s).toDataURL();
   await a.editLayers(s,{type:'add'});top=s.layers[1];top.canvas.getContext('2d').fillStyle='#ff0000';top.canvas.getContext('2d').fillRect(0,0,32,64);await a.editLayers(s,{type:'add'});top=s.layers[2];top.canvas.getContext('2d').fillStyle='#00ff00';top.canvas.getContext('2d').fillRect(0,0,64,64);top.blendMode='multiply';const original=await a.serializePainting(s),prior=s.history.count();let rejected='';try{await a.editLayers(s,{type:'mergeDown'});}catch(e){rejected=e.message;}return {same,mode,count,undoSame,restoredMode,redoSame,rejected,unchanged:JSON.stringify(original)===JSON.stringify(await a.serializePainting(s)),historyUnchanged:s.history.count()===prior};
  });assert.equal(result.same,true);assert.equal(result.mode,'source-over');assert.equal(result.count,1);assert.equal(result.undoSame,true);assert.equal(result.restoredMode,'multiply');assert.equal(result.redoSame,true);assert.match(result.rejected,/혼합|모드|그림/);assert.equal(result.unchanged,true);assert.equal(result.historyUnchanged,true);assert.deepEqual(errors,[]);
 }finally{await browser.close();}
});

test('layer drag autoscroll reaches distant edges and dropping in place does not create history',async()=>{
 const {browser,page,errors}=await openMemoryPainter();try{
  const layers=Array.from({length:7},(_,i)=>({id:'layer-'+i,name:'레이어 '+i,color:i%2?'#00ff00':'#ff0000'}));await fixture(page,layers);const original=await order(page),before=await history(page);await mouseDrag(page,'layer-6','layer-6');assert.deepEqual(await order(page),original);assert.equal(await history(page),before);
  async function dragToEdge(id,down){
   await page.locator('[data-layer-id="'+id+'"]').scrollIntoViewIfNeeded();const from=await page.locator('[data-layer-id="'+id+'"]').boundingBox(),list=await page.locator('.paint-layer-list').boundingBox();await page.mouse.move(from.x+from.width*.7,from.y+from.height/2);await page.mouse.down();await page.mouse.move(list.x+list.width*.7,down?list.y+list.height-4:list.y+4,{steps:12});
   await page.waitForFunction(down=>{const list=document.querySelector('.paint-layer-list');return down?list.scrollTop>=list.scrollHeight-list.clientHeight-1:list.scrollTop===0;},down);await page.mouse.up();await idle(page);
  }
  await dragToEdge('layer-6',true);assert.deepEqual(await order(page),['layer-5','layer-4','layer-3','layer-2','layer-1','layer-0','layer-6']);await dragToEdge('layer-6',false);assert.deepEqual(await order(page),original);assert.match(await history(page),/^2단계/);await page.locator('[data-layer-id="layer-5"]').click();assert.equal(await page.locator('.paint-layer.active').getAttribute('data-layer-id'),'layer-5');assert.deepEqual(errors,[]);
 }finally{await browser.close();}
});

test('busy PNG history capture ignores another mouse layer drag without losing metadata',async()=>{
 const {browser,page,errors}=await openMemoryPainter();try{
  await fixture(page);await page.evaluate(()=>{const native=HTMLCanvasElement.prototype.toBlob,pending=[];let held=true;HTMLCanvasElement.prototype.toBlob=function(callback,...args){return native.call(this,blob=>{if(held)pending.push(()=>callback(blob));else callback(blob);},...args);};window.releasePaintCapture=()=>{held=false;for(const callback of pending)callback();HTMLCanvasElement.prototype.toBlob=native;};});
  await page.locator('#paint-layer-opacity').fill('70');await page.locator('#paint-layer-opacity').press('Tab');await page.waitForFunction(()=>document.querySelector('#painting-editor').dataset.busy==='true');await mouseDrag(page,'bottom','top','before',{release:false});await page.mouse.up();assert.deepEqual(await order(page),['top','middle','bottom']);assert.equal(await page.locator('.paint-layer.drop-before,.paint-layer.drop-after').count(),0);
  await page.evaluate(()=>window.releasePaintCapture());await idle(page);assert.deepEqual(await order(page),['top','middle','bottom']);assert.match(await history(page),/^1단계/);assert.equal(await page.locator('#paint-layer-opacity').inputValue(),'70');await page.locator('#paint-undo').click();await idle(page);assert.equal(await page.locator('#paint-layer-opacity').inputValue(),'100');assert.deepEqual(errors,[]);
 }finally{await browser.close();}
});


test('pixel snap cursor matches the real square brush and eraser footprints at fractional sizes',async()=>{
 const {browser,page,errors}=await openMemoryPainter();try{
  await fixture(page,[{id:'white',name:'흰 바탕',color:'#ffffff'}]);await page.locator('#paint-100').click();await page.locator('#paint-pixel-snap').check();await page.locator('#paint-color').evaluate(input=>{input.value='#000000';input.dispatchEvent(new Event('change',{bubbles:true}));});
  for(const [tool,value,expected] of [['brush','0.1',{x:20,y:20,w:1,h:1}],['brush','2.6',{x:19,y:19,w:3,h:3}],['brush','2.1',{x:19,y:19,w:2,h:2}],['eraser','0.1',{x:20,y:20,w:1,h:1}]]){
   await page.locator('#tool-'+tool).click();await page.locator('#brush-size').fill(value);await page.locator('#brush-size').press('Tab');const canvas=await page.locator('#paint-canvas').boundingBox();await page.mouse.move(canvas.x+20.25,canvas.y+20.75);
   const cursor=await page.locator('.paint-cursor').evaluate(n=>{const r=n.getBoundingClientRect(),css=getComputedStyle(n);return {x:r.x,y:r.y,w:r.width,h:r.height,radius:css.borderRadius,computedWidth:parseFloat(css.width)};});
   await page.mouse.down();await page.mouse.up();await idle(page);
   const actual=await page.locator('#paint-canvas').evaluate((canvas,tool)=>{const pixels=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;let left=canvas.width,top=canvas.height,right=-1,bottom=-1,count=0;for(let y=0;y<canvas.height;y++)for(let x=0;x<canvas.width;x++){const i=(y*canvas.width+x)*4,changed=tool==='eraser'?pixels[i+3]===0:pixels[i]===0&&pixels[i+1]===0&&pixels[i+2]===0;if(changed){left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x);bottom=Math.max(bottom,y);count++;}}return {x:left,y:top,w:right-left+1,h:bottom-top+1,count};},tool);
   assert.deepEqual(actual,{...expected,count:expected.w*expected.h});assert.equal(cursor.w,expected.w);assert.equal(cursor.h,expected.h);assert.equal(cursor.computedWidth,expected.w);assert.ok(Math.abs(cursor.x-(canvas.x+expected.x))<=1/64);assert.ok(Math.abs(cursor.y-(canvas.y+expected.y))<=1/64);assert.equal(cursor.radius,'0px');await page.locator('#paint-undo').click();await idle(page);
  }
  await page.locator('#brush-hardness').evaluate(input=>{input.value='50';input.dispatchEvent(new Event('change',{bubbles:true}));});const canvas=await page.locator('#paint-canvas').boundingBox();await page.mouse.move(canvas.x+20.25,canvas.y+20.75);const soft=await page.locator('.paint-cursor').evaluate(n=>({width:n.getBoundingClientRect().width,radius:getComputedStyle(n).borderRadius}));assert.ok(Math.abs(soft.width-.1)<=1/64);assert.equal(soft.radius,'50%');assert.deepEqual(errors,[]);
 }finally{await browser.close();}
});

test('small original canvases keep sharp source pixels at 200 and 800 percent without altering saved pixels',async()=>{
 const {browser,page,errors}=await openMemoryPainter();try{
  await page.evaluate(()=>{const a=window.paintApi,p=a.createProject(),c=a.newCanvas(64,64),x=c.getContext('2d');for(let y=0;y<64;y++)for(let xx=0;xx<64;xx++){x.fillStyle=(xx+y)%2?'#ffffff':'#000000';x.fillRect(xx,y,1,1);}const png=c.toDataURL(),saved={id:'small-original',width:64,height:64,activeLayerId:'small-layer',layers:[{id:'small-layer',name:'64px 원본',visible:true,locked:false,opacity:1,png}]};p.paintings[saved.id]=saved;p.assets['small-art']={id:'small-art',mime:'image/png',width:64,height:64,dataUrl:png,paintingId:saved.id};p.cards[0].artAssetId='small-art';window.paintStore=a.createStore(p);window.paintCardId=p.cards[0].id;window.smallOriginal=png;void a.openPaintingEditor(document.body,window.paintStore,window.paintCardId);});
  await page.locator('#painting-editor').waitFor();await idle(page);
  // Mount schedules fit on the next animation frame. Finish that layout before
  // editing zoom, otherwise fit can replace the input before its change event.
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  for(const scale of [2,8]){
   await page.locator('#paint-zoom').fill(String(scale*100));await page.locator('#paint-zoom').press('Tab');await page.mouse.move(5,5);const canvas=await page.locator('#paint-canvas').boundingBox();assert.equal(canvas.width,64*scale,'capture only after the requested zoom is applied');assert.equal(canvas.height,64*scale);const clip={x:Math.ceil(canvas.x+8*scale),y:Math.ceil(canvas.y+8*scale),width:64,height:64},capture=await page.screenshot({clip});
   await page.screenshot({path:fileURLToPath(new URL('../artifacts/qa/painting-crisp-'+(scale*100)+'.png',import.meta.url))});const mismatch=await page.evaluate(async({png,clip,canvas,scale})=>{const i=new Image();i.src=png;await i.decode();const c=document.createElement('canvas');c.width=i.width;c.height=i.height;const ctx=c.getContext('2d');ctx.drawImage(i,0,0);const data=ctx.getImageData(0,0,c.width,c.height).data;let mismatches=0;for(let y=0;y<c.height;y++)for(let x=0;x<c.width;x++){const sx=Math.floor((clip.x+x+.5-canvas.x)/scale),sy=Math.floor((clip.y+y+.5-canvas.y)/scale),expected=(sx+sy)%2?255:0,k=(y*c.width+x)*4;if(data[k]!==expected||data[k+1]!==expected||data[k+2]!==expected||data[k+3]!==255)mismatches++;}return mismatches;},{png:'data:image/png;base64,'+capture.toString('base64'),clip,canvas,scale});assert.equal(mismatch,0,scale*100+'% must show the nearest original pixel, not blended display colors');
  }
  assert.match(await history(page),/^0단계/);await page.locator('#paint-pixel-snap').check();await page.locator('#brush-size').fill('1');await page.locator('#brush-size').press('Tab');await page.locator('#paint-color').evaluate(input=>{input.value='#ff0000';input.dispatchEvent(new Event('change',{bubbles:true}));});const canvas=await page.locator('#paint-canvas').boundingBox();await page.mouse.move(canvas.x+10.5*8,canvas.y+12.5*8);assert.equal((await page.locator('.paint-cursor').boundingBox()).width,8);await page.mouse.down();await page.mouse.up();await idle(page);assert.deepEqual(await page.locator('#paint-canvas').evaluate(c=>[...c.getContext('2d').getImageData(10,12,1,1).data]),[255,0,0,255]);await page.locator('#paint-undo').click();await idle(page);
  await page.locator('#paint-zoom').fill('50');await page.locator('#paint-zoom').press('Tab');assert.equal(await page.locator('#paint-canvas').evaluate(c=>getComputedStyle(c).imageRendering),'auto');await page.locator('#paint-apply').click();await page.locator('#painting-editor').waitFor({state:'hidden'});const unchanged=await page.evaluate(()=>{const p=window.paintStore.getProject(),painting=p.paintings[p.assets[p.cards[0].artAssetId].paintingId];return painting.width===64&&painting.height===64&&painting.layers[0].png===window.smallOriginal;});assert.equal(unchanged,true);assert.deepEqual(errors,[]);
 }finally{await browser.close();}
});
