import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {readFile,mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import {createProject} from '../src/model/project.js';
import {createVisualEffects,makeVisualEffectLayer} from '../src/model/visual-effects.js';
const require=createRequire(import.meta.url),{chromium}=require('playwright');
const root=fileURLToPath(new URL('../',import.meta.url));
// A private in-memory application build keeps concurrent workers' delivery and harness untouched.
const built=await build({absWorkingDir:root,entryPoints:['src/app.js'],bundle:true,format:'iife',write:false,target:'es2022',loader:{'.woff2':'base64'}});
const css=await readFile(path.join(root,'src/styles.css'),'utf8');
const output=await mkdtemp(path.join(tmpdir(),'effect-transform-'));
async function openPrivateApp(deviceScaleFactor=1){
 const browser=await chromium.launch({headless:true,executablePath:process.env.CARD_BROWSER_PATH||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
 const context=await browser.newContext({viewport:{width:1440,height:960},deviceScaleFactor,acceptDownloads:true});
 await context.route(/^https?:/,route=>route.abort());const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto(pathToFileURL(path.join(root,'src/index.html')).href);await page.addStyleTag({content:css+' .effect-preset-gallery{display:none!important}'});await page.addScriptTag({content:built.outputFiles[0].text});await page.waitForSelector('[data-ready=true]');page.setDefaultTimeout(12000);
 return {browser,page,errors};
}
async function save(page,name){const waiting=page.waitForEvent('download');await page.getByRole('button',{name:'프로젝트 파일 내보내기',exact:true}).click();const download=await waiting;const location=path.join(output,name);await download.saveAs(location);return JSON.parse(await readFile(location,'utf8'));}
async function load(page,project){await page.locator('#project-file').setInputFiles({name:'effect-transform.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(project))});await page.waitForFunction(()=>document.getElementById('save-state').textContent==='저장됨');}
function fixture(kind='flame'){
 const p=createProject();p.cards[0].template='custom';p.cards[0].autoSkillLayout=false;
 const recipe=createVisualEffects();recipe.layers=[makeVisualEffectLayer(kind,kind==='flame'?{emit:{face:'area',openOnly:false},origin:{x:.2,y:.25,w:.35,h:.3},rotationDeg:0,motion:{enabled:false,speed:1}}:{})];
 p.cards[0].elements=[{id:'transform-target',type:'effect',rect:{x:10,y:15,w:30,h:24},binding:null,style:{visualEffects:recipe}}];return p;
}
async function openTarget(page,p){await load(page,p);await page.locator('#card-frame-effects').click();await page.locator('#effect-target').selectOption('transform-target');await page.waitForFunction(()=>document.getElementById('effect-preview-status').dataset.busy==='false');}
async function prepareViewport(page,zoom){await page.locator('#effect-preview-zoom').selectOption(String(zoom));await page.locator('.effect-preview-scroll').evaluate((node,z)=>{node.style.flex='none';node.style.height='220px';node.style.width='260px';node.style.maxWidth='100%';node.scrollLeft=z===2?120:37;node.scrollTop=z===2?160:61;},zoom);await page.waitForFunction(()=>document.querySelector('.effect-preview-scroll').scrollTop>0);await page.evaluate(()=>new Promise(requestAnimationFrame));await page.waitForFunction(()=>document.getElementById('effect-preview-status').dataset.busy==='false');}
async function handlePoint(page,handle){const locator=page.locator('[data-effect-handle="'+handle+'"]');await locator.waitFor({state:'visible'});return page.evaluate(key=>{const node=document.querySelector('[data-effect-handle="'+key+'"]'),b=node.getBoundingClientRect();return {x:b.x+b.width/2,y:b.y+b.height/2};},handle);}
async function drag(page,handle,dx,dy,{shift=false,finish=true}={}){const start=await handlePoint(page,handle);if(shift)await page.keyboard.down('Shift');await page.mouse.move(start.x,start.y);await page.mouse.down();await page.mouse.move(start.x+dx,start.y+dy,{steps:5});if(finish)await page.mouse.up();if(shift)await page.keyboard.up('Shift');}
async function origin(page){return page.evaluate(()=>Object.fromEntries(['x','y','w','h'].map(k=>[k,Number(document.getElementById('effect-origin-'+k).value)])));}
const near=(actual,want,message)=>assert.ok(Math.abs(actual-want)<.002,message+': '+actual+' vs '+want);

for(const zoom of [1,2])test('mouse move uses target mm at '+zoom+'x zoom with scroll and commits one reversible draft',async()=>{
 const {browser,page,errors}=await openPrivateApp(zoom);try{
  const p=fixture();await openTarget(page,p);
  assert.equal(await page.locator('#effect-transform-toggle').count(),1,'the editor must expose the approved transform mode');
  await page.locator('#effect-transform-toggle').click();await prepareViewport(page,zoom);
  const original=await origin(page),pixels=await page.locator('#effect-preview').evaluate(c=>c.toDataURL()),box=await page.locator('#effect-preview').boundingBox();
  // Three mm right and two mm down, independently of CSS zoom and device pixels.
  await drag(page,'move',box.width/63*3,box.height/88*2);const moved=await origin(page);near(moved.x,original.x+.1,'horizontal target ratio');near(moved.y,original.y+2/24,'vertical target ratio');
  assert.notEqual(await page.locator('#effect-preview').evaluate(c=>c.toDataURL()),pixels,'live effect pixels move with the draft');
  await page.locator('#effect-undo').click();assert.deepEqual(await origin(page),original);assert.equal(await page.locator('#effect-undo').isDisabled(),true,'one gesture creates exactly one history entry');
  await page.locator('#effect-redo').click();assert.deepEqual(await origin(page),moved);await page.locator('#effect-apply').click();const applied=await save(page,'moved-'+zoom+'.json');
  near(applied.cards[0].elements[0].style.visualEffects.layers[0].origin.x,moved.x,'applied origin');assert.equal(applied.print.effectFrameSec,p.print.effectFrameSec);assert.deepEqual(applied.assets,p.assets);assert.deepEqual(applied.paintings,p.paintings);
  await page.locator('#undo').click();assert.deepEqual(await save(page,'undo-'+zoom+'.json'),p);await page.locator('#redo').click();assert.deepEqual(await save(page,'redo-'+zoom+'.json'),applied);
  await load(page,applied);assert.deepEqual(await save(page,'reload-'+zoom+'.json'),applied);assert.deepEqual(errors,[]);
 }finally{await browser.close();}
});

test('side, Shift corner and rotation handles update only the selected generator',async()=>{
 const {browser,page,errors}=await openPrivateApp();try{
  const p=fixture(),second=makeVisualEffectLayer('smoke');p.cards[0].elements[0].style.visualEffects.layers.push(second);await openTarget(page,p);await page.locator('#effect-transform-toggle').click();await prepareViewport(page,2);
  const first=await origin(page),box=await page.locator('#effect-preview').boundingBox(),scale=box.width/63;
  await drag(page,'e',first.w*30*scale*.5,0);let changed=await origin(page);near(changed.w,first.w*1.5,'side resize width');near(changed.x,first.x,'opposite edge stays fixed');near(changed.h,first.h,'independent axis height');
  await page.locator('#effect-undo').click();await drag(page,'se',first.w*30*scale*.5,first.h*24*scale*.1,{shift:true});changed=await origin(page);near(changed.w,first.w*1.5,'Shift corner width');near(changed.h,first.h*1.5,'Shift preserves aspect');
  await page.locator('#effect-undo').click();const start=await handlePoint(page,'rotate'),canvas=await page.locator('#effect-preview').boundingBox(),scaleY=canvas.height/88;const pivot={x:canvas.x+(10+(first.x+first.w/2)*30)*scale,y:canvas.y+(15+(first.y+first.h/2)*24)*scaleY};
  const deltaMm={x:(start.x-pivot.x)/scale,y:(start.y-pivot.y)/scaleY};
  await page.mouse.move(start.x,start.y);await page.mouse.down();await page.mouse.move(pivot.x-deltaMm.y*scale,pivot.y+deltaMm.x*scaleY,{steps:8});await page.mouse.up();near(Number(await page.locator('#effect-rotation').inputValue()),90,'rotation around origin centre');
  await page.locator('#effect-apply').click();const applied=await save(page,'handles.json');assert.deepEqual(applied.cards[0].elements[0].style.visualEffects.layers[1],second);assert.deepEqual(errors,[]);
 }finally{await browser.close();}
});

test('Escape, pointer cancellation and lost capture restore the complete draft without history',async()=>{
 const {browser,page,errors}=await openPrivateApp();try{
  const p=fixture();await openTarget(page,p);await page.locator('#effect-transform-toggle').click();await prepareViewport(page,2);const original=await origin(page),pixels=await page.locator('#effect-preview').evaluate(c=>c.toDataURL());
  for(const cancel of ['escape','pointercancel','lostcapture']){
   await drag(page,'move',20,14,{finish:false});
   if(cancel==='escape')await page.keyboard.press('Escape');
   else if(cancel==='pointercancel')await page.locator('#effect-transform-overlay').dispatchEvent('pointercancel',{pointerId:1});
   else await page.locator('#effect-transform-overlay').evaluate(node=>node.releasePointerCapture(1));
   await page.mouse.up();assert.equal(await page.locator('#effect-editor').isVisible(),true);assert.deepEqual(await origin(page),original);assert.equal(await page.locator('#effect-undo').isDisabled(),true);assert.equal(await page.locator('#effect-preview').evaluate(c=>c.toDataURL()),pixels);
  }
  await page.locator('#effect-close').click();assert.equal(await page.locator('.confirm-dialog').count(),0);assert.deepEqual(await save(page,'cancel.json'),p);assert.deepEqual(errors,[]);
 }finally{await browser.close();}
});

test('filters explain why mouse transforms are disabled and comparison hides handles',async()=>{
 const {browser,page,errors}=await openPrivateApp();try{
  await openTarget(page,fixture('outline'));assert.equal(await page.locator('#effect-transform-toggle').isDisabled(),true);assert.match(await page.locator('#effect-transform-hint').innerText(),/필터|발생 영역/);
  await page.locator('#effect-layer-kind').selectOption('flame');await page.locator('#effect-layer-add').click();await page.locator('#effect-transform-toggle').click();assert.equal(await page.locator('#effect-transform-overlay').isVisible(),true);
  const compare=await page.locator('#effect-compare').boundingBox();await page.mouse.move(compare.x+compare.width/2,compare.y+compare.height/2);await page.mouse.down();assert.equal(await page.locator('#effect-transform-overlay').isVisible(),false);await page.mouse.up();assert.equal(await page.locator('#effect-transform-overlay').isVisible(),true);assert.deepEqual(errors,[]);
 }finally{await browser.close();}
});

test('arrow keys nudge one print pixel and alignment is one undo while text inputs retain navigation',async()=>{
 const {browser,page,errors}=await openPrivateApp();try{
  const p=fixture();await openTarget(page,p);await page.locator('#effect-transform-toggle').click();const first=await origin(page);
  await page.keyboard.press('ArrowRight');let next=await origin(page);near((next.x-first.x)*30,25.4/300,'one print pixel');
  await page.locator('#effect-preset-name').fill('방향키 입력 보호');await page.keyboard.press('ArrowLeft');assert.deepEqual(await origin(page),next);await page.locator('#effect-transform-toggle').focus();
  await page.locator('#effect-preview-zoom').selectOption('2');await page.locator('#effect-transform-toggle').focus();await page.keyboard.press('Shift+ArrowDown');const nudged=await origin(page);near((nudged.y-next.y)*24,25.4/30,'ten print pixels at 200%');
  await page.locator('[data-effect-align=right]').click();near((await origin(page)).x,1-first.w,'right alignment');await page.locator('#effect-undo').click();assert.deepEqual(await origin(page),nudged);
  const expectations={left:['x',0],center:['x',(1-first.w)/2],right:['x',1-first.w],top:['y',0],middle:['y',(1-first.h)/2],bottom:['y',1-first.h]};
  for(const [key,[axis,want]] of Object.entries(expectations)){await page.locator('[data-effect-align='+key+']').click();near((await origin(page))[axis],want,key+' alignment');await page.locator('#effect-undo').click();assert.deepEqual(await origin(page),nudged);}
  assert.deepEqual(errors,[]);
 }finally{await browser.close();}
});

test('an uncommitted numeric edit stays a separate undo before a drag',async()=>{
 const {browser,page,errors}=await openPrivateApp();try{
  await openTarget(page,fixture());await page.locator('#effect-transform-toggle').click();await prepareViewport(page,2);await page.locator('#effect-advanced summary').click();await page.locator('#effect-origin-x').fill('.3');
  const box=await page.locator('#effect-preview').boundingBox();await drag(page,'move',box.width/63*3,0);near((await origin(page)).x,.4,'drag starts after committing pending number');
  await page.locator('#effect-undo').click();near((await origin(page)).x,.3,'first undo removes drag');await page.locator('#effect-undo').click();near((await origin(page)).x,.2,'second undo removes number');assert.deepEqual(errors,[]);
 }finally{await browser.close();}
});

test('a fixed image handle follows cropped pixels with an offset anchor mirror spin and layer rotation',async()=>{
 const {browser,page,errors}=await openPrivateApp(2);try{
  const dataUrl=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=80;c.height=40;c.getContext('2d').fillStyle='#ef2525';c.getContext('2d').fillRect(0,0,80,40);return c.toDataURL();});
  const p=createProject();p.cards[0].template='custom';p.cards[0].autoSkillLayout=false;p.cards[0].elements=[];p.assets.picture={id:'picture',width:80,height:40,mime:'image/png',dataUrl,paintingId:null};
  p.cards[0].visualEffects=createVisualEffects();p.cards[0].visualEffects.frame={scope:'full',bandMm:4};p.cards[0].visualEffects.layers=[makeVisualEffectLayer('sprite',{origin:{x:.28,y:.26,w:.1,h:.1},rotationDeg:20,protectText:false,params:{shape:'image',renderMode:'single',assetId:'picture',cropLeft:.25,cropRight:.25,scaleX:1.5,scaleY:.5,anchorX:.2,anchorY:.8,mirror:'x',sizeStart:1,rotation:10,spin:.25},motion:{enabled:true,speed:.5}})];
  await load(page,p);await page.locator('#card-frame-effects').click();await page.waitForFunction(()=>document.getElementById('effect-preview-status').dataset.busy==='false');await page.locator('#effect-transform-toggle').click();await prepareViewport(page,2);
  const expected=[[-2.4,-3.2],[9.6,-3.2],[9.6,.8],[-2.4,.8]].map(([x,y])=>{const a=84*Math.PI/180;return {x:20.79-x*Math.cos(a)-y*Math.sin(a),y:27.28-x*Math.sin(a)+y*Math.cos(a)};});
  const canvasBox=await page.locator('#effect-preview').boundingBox();const displayed=await page.locator('[data-effect-handle=move]').evaluate((node,box)=>node.getAttribute('points').split(' ').map(pair=>{const [x,y]=pair.split(',').map(Number);return {x:x/(box.width/63),y:y/(box.height/88)};}),canvasBox);
  for(let i=0;i<4;i++){near(displayed[i].x,expected[i].x,'cropped image handle x '+i);near(displayed[i].y,expected[i].y,'cropped image handle y '+i);}
  const redBounds=await page.locator('#effect-preview').evaluate(c=>{const data=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let left=c.width,top=c.height,right=0,bottom=0;for(let y=0;y<c.height;y++)for(let x=0;x<c.width;x++){const i=(y*c.width+x)*4;if(data[i]>180&&data[i+1]<80&&data[i+2]<80){left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x+1);bottom=Math.max(bottom,y+1);}}const scale=c.width/63;return {left:left/scale,top:top/scale,right:right/scale,bottom:bottom/scale};});
  for(const [key,want] of Object.entries({left:Math.min(...expected.map(p=>p.x)),right:Math.max(...expected.map(p=>p.x)),top:Math.min(...expected.map(p=>p.y)),bottom:Math.max(...expected.map(p=>p.y))}))assert.ok(Math.abs(redBounds[key]-want)<.3,'handle matches actual red '+key);
  const a=84*Math.PI/180;await drag(page,'e',-Math.cos(a)*12*canvasBox.width/63,-Math.sin(a)*12*canvasBox.height/88);near(Number(await page.locator('#effect-param-scaleX').inputValue()),3,'image side doubles only x scale');near(Number(await page.locator('#effect-param-scaleY').inputValue()),.5,'image height preserved');
  await page.locator('#effect-undo').click();near(Number(await page.locator('#effect-param-scaleX').inputValue()),1.5,'single image resize undo');await page.locator('#effect-redo').click();
  await page.locator('#effect-preview-zoom').selectOption('1');await page.locator('.effect-preview-scroll').evaluate(node=>{node.style.height='500px';node.style.width='100%';node.scrollLeft=0;node.scrollTop=0;});await page.locator('[data-effect-handle=e]').waitFor({state:'visible'});await page.locator('.effect-preview-scroll').screenshot({path:path.join(output,'fixed-image-transform.png')});console.log('Transform preview evidence: '+path.join(output,'fixed-image-transform.png'));await page.locator('#effect-apply').click();const applied=await save(page,'fixed-image.json');assert.deepEqual(applied.assets,p.assets);assert.deepEqual(applied.paintings,p.paintings);assert.equal(applied.print.effectFrameSec,1.2);near(applied.cards[0].visualEffects.layers[0].params.scaleX,3,'saved single image x scale');assert.deepEqual(errors,[]);
 }finally{await browser.close();}
});

test('effect editor typography drafts undo cancel apply and reload without changing manual rectangles',async()=>{
 const {browser,page,errors}=await openPrivateApp();try{
  const p=fixture();p.cards[0].elements.push({id:'type-target',type:'text',rect:{x:5,y:55,w:48,h:12},binding:null,content:'직접 꾸미는 글자',style:{fontPt:9,fontWeight:400,color:'#253d32',align:'left'}});
  await openTarget(page,p);await page.locator('#effect-target').selectOption('type-target');await page.locator('#effect-text-font').fill('12');await page.locator('#effect-text-font').press('Tab');await page.locator('#effect-text-italic').check();await page.locator('#effect-text-underline').check();
  await page.locator('#effect-undo').click();assert.equal(await page.locator('#effect-text-underline').isChecked(),false);await page.locator('#effect-redo').click();assert.equal(await page.locator('#effect-text-underline').isChecked(),true);
  await page.locator('#effect-target').selectOption('transform-target');await page.locator('#effect-target').selectOption('type-target');assert.equal(await page.locator('#effect-text-font').inputValue(),'12');
  await page.locator('#effect-close').click();await page.getByRole('button',{name:'변경 버리기',exact:true}).click();assert.deepEqual(await save(page,'typography-cancel.json'),p);
  await page.locator('#card-frame-effects').click();await page.locator('#effect-target').selectOption('type-target');await page.locator('#effect-text-font').fill('12');await page.locator('#effect-text-font').press('Tab');await page.locator('#effect-text-italic').check();await page.locator('#effect-text-underline').check();await page.locator('#effect-apply').click();const applied=await save(page,'typography-apply.json');const text=applied.cards[0].elements.find(e=>e.id==='type-target');assert.equal(text.style.fontPt,12);assert.equal(text.style.fontStyle,'italic');assert.equal(text.style.underline,true);assert.deepEqual(text.rect,p.cards[0].elements[1].rect);
  await page.locator('#undo').click();assert.deepEqual(await save(page,'typography-undo.json'),p);await page.locator('#redo').click();assert.deepEqual(await save(page,'typography-redo.json'),applied);await load(page,applied);assert.deepEqual(await save(page,'typography-reload.json'),applied);assert.deepEqual(errors,[]);
 }finally{await browser.close();}
});


test('dragging pauses playback without selecting a new print frame and transform mode can be hidden',async()=>{
 const {browser,page,errors}=await openPrivateApp();try{
  const p=fixture();await openTarget(page,p);await page.locator('#effect-transform-toggle').click();await prepareViewport(page,1);await page.locator('#effect-play').click();
  await page.waitForFunction(()=>Number(document.getElementById('effect-time').value)>1.2);
  const start=await handlePoint(page,'move');await page.mouse.move(start.x,start.y);await page.mouse.down();assert.equal(await page.locator('#effect-play').getAttribute('aria-pressed'),'false');const paused=await page.locator('#effect-time').inputValue();
  await page.mouse.move(start.x+12,start.y+8,{steps:4});await page.mouse.up();assert.equal(await page.locator('#effect-time').inputValue(),paused);assert.equal(await page.locator('#effect-frame-label').innerText(),'인쇄 1.20초');
  await page.locator('#effect-transform-toggle').click();assert.equal(await page.locator('#effect-transform-overlay').isVisible(),false);await page.locator('#effect-apply').click();assert.equal((await save(page,'paused-print-frame.json')).print.effectFrameSec,p.print.effectFrameSec);assert.deepEqual(errors,[]);
 }finally{await browser.close();}
});
