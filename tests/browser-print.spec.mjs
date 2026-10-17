import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {openHarness,qa} from './helpers/browser.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const python=process.env.CARD_PYTHON_PATH||'C:/Users/hyeon/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe';
const verifyNativePdf=`import hashlib,json,sys
from pathlib import Path
from PIL import Image
from pypdf import PdfReader
from pypdf.generic import ContentStream
pdf,manifest_path=sys.argv[1:];manifest_path=Path(manifest_path)
manifest=json.loads(manifest_path.read_text(encoding='utf8'));reader=PdfReader(pdf)
assert len(reader.pages)==len(manifest['pages'])
mm=25.4/72;pages=[]
def multiply(a,b):
 return [a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5]]
for page,planned in zip(reader.pages,manifest['pages']):
 matrix=[1,0,0,1,0,0];stack=[];cards=[];marks=0
 images=page['/Resources'].get('/XObject',{})
 for op,command in ContentStream(page.get_contents(),reader).operations:
  if command==b'q':stack.append(matrix[:])
  elif command==b'Q':matrix=stack.pop()
  elif command==b'cm':matrix=multiply(matrix,[float(v) for v in op])
  elif command==b'S':marks+=1
  elif command==b'Do':
   image=images[op[0]].get_object()
   if image.get('/Subtype')!='/Image':continue
   cell=planned['cells'][len(cards)];reference=manifest_path.parent/cell['reference']
   size=(int(image['/Width']),int(image['/Height']));rgb=image.get_data()
   assert size==(744,1039) and len(rgb)==size[0]*size[1]*3
   with Image.open(reference) as expected:
    assert size==expected.size and rgb==expected.convert('RGB').tobytes(),'Wrong frozen pixels'
   if '/SMask' in image:assert all(v==255 for v in image['/SMask'].get_object().get_data())
   corners=[(matrix[0]*x+matrix[2]*y+matrix[4],matrix[1]*x+matrix[3]*y+matrix[5]) for x,y in [(0,0),(1,0),(0,1),(1,1)]]
   xs=[p[0]*mm for p in corners];ys=[p[1]*mm for p in corners]
   box=[min(xs),float(page.mediabox.height)*mm-max(ys),max(xs)-min(xs),max(ys)-min(ys)]
   want=[cell[k] for k in ['xMm','yMm','widthMm','heightMm']]
   assert all(abs(a-b)<.01 for a,b in zip(box,want)),(box,want)
   cards.append({'boxMm':box,'rgbSha256':hashlib.sha256(rgb).hexdigest()})
 assert len(cards)==len(planned['cells'])
 assert marks==planned['marks'],(marks,planned['marks'])
 pages.append({'cards':cards,'marks':marks})
print(json.dumps({'status':'PASS','cardsPerPage':[len(p['cards']) for p in pages],'pages':pages}))`;
async function setup(){
 const env=await openHarness();
 env.downloads=[];env.page.on('download',download=>env.downloads.push(download.suggestedFilename()));
 if(existsSync(path.join(root,'src/printing/browser.js'))){
  const result=await build({stdin:{contents:"import {printProject} from './src/printing/browser.js';import {cropMarks} from './src/printing/marks.js';window.directPrint=printProject;window.directCropMarks=cropMarks;",resolveDir:root},bundle:true,write:false,format:'iife',loader:{'.woff2':'base64'}});
  await env.page.addScriptTag({content:result.outputFiles[0].text});
 }
 const callable=await env.page.evaluate(()=>typeof window.directPrint);if(callable!=='function')await env.browser.close();
 assert.equal(callable,'function','browser print must expose a callable production entry');
 await env.page.evaluate(()=>{
  window.printCalls=[];window.printMode='hold';
  new MutationObserver(records=>{for(const r of records)for(const f of r.addedNodes)if(f.tagName==='IFRAME'&&f.isConnected){
   f.contentWindow.print=()=>{window.printCalls.push({frame:f,html:f.contentDocument.documentElement.outerHTML,ready:[...f.contentDocument.images].every(i=>i.complete&&i.naturalWidth>0)});if(window.printMode==='throw')throw Error('native printer unavailable');if(window.printMode==='async')f.contentWindow.dispatchEvent(new Event('beforeprint'));if(window.printMode==='sync')f.contentWindow.dispatchEvent(new Event('afterprint'));};
  }}).observe(document.body,{childList:true});
 });
 return env;
}
async function fixture(page,options={}){return page.evaluate(options=>{
 const a=window.testApi,p=a.createProject(),c=p.cards[0];c.quantity=10;c.template='custom';
 c.elements=[{id:'print-title',type:'text',content:'인쇄 고정 장면',binding:null,rect:{x:5,y:5,w:53,h:15},style:{fontPt:13,visualEffects:a.createVisualEffects('starlight',{seed:81})}}];
 const art=document.createElement('canvas');art.width=80;art.height=96;const g=art.getContext('2d');g.strokeStyle='#7d25b1';g.lineWidth=4;g.strokeRect(18,16,44,64);const png=art.toDataURL();
 p.assets.ink={id:'ink',mime:'image/png',width:80,height:96,dataUrl:png,paintingId:'ink-doc'};p.paintings['ink-doc']={id:'ink-doc',width:80,height:96,activeLayerId:'ink-layer',layers:[{id:'ink-layer',name:'원본 선화',visible:true,locked:false,opacity:1,png}]};
 c.artAssetId='ink';c.elements.push({id:'print-art',type:'image',binding:{field:'art'},rect:{x:10,y:25,w:43,h:50},style:{fit:'contain',cropX:.5,cropY:.5}});
 p.back.elements=[{id:'print-back',type:'text',content:'공통 뒷면',binding:null,rect:{x:5,y:30,w:53,h:15},style:{fontPt:15}}];
 Object.assign(p.print,{duplex:true,effectFrameSec:2.35,gapMm:0,marginMm:5,backOffsetXmm:.6,backOffsetYmm:-.4,...options});return p;
 },options);}

test('native printing uses frozen 300dpi cards, planned duplex cells and crop marks without mutating the project',async()=>{
 const e=await setup();try{
  const p=await fixture(e.page),before=JSON.stringify(p);
  const result=await e.page.evaluate(async p=>{
   const a=window.testApi;await a.ensureFont();const assets=await a.loadAssets(p),refs={};for(const [id,c] of [[p.cards[0].id,p.cards[0]],['back',p.back]]){const canvas=document.createElement('canvas');a.renderCard(canvas.getContext('2d'),p,c,assets,300);refs[id]=canvas.toDataURL();}
   const before=JSON.stringify(p);await window.directPrint(p);const call=window.printCalls[0],d=call.frame.contentDocument;
   const plan=a.planSheets(p);
   return {unchanged:before===JSON.stringify(p),ready:call.ready,plan,refs,expectedMarks:plan.pages.map(page=>window.directCropMarks(page,plan)),sheets:[...d.querySelectorAll('.print-sheet')].map(s=>({side:s.dataset.side,cells:[...s.querySelectorAll('img')].map(i=>{const b=i.getBoundingClientRect(),a=s.getBoundingClientRect();return {cardId:i.dataset.cardId,src:i.src,w:i.naturalWidth,h:i.naturalHeight,box:[b.x-a.x,b.y-a.y,b.width,b.height].map(n=>n*25.4/96)};}),marks:[...s.querySelectorAll('svg line')].map(l=>Object.fromEntries(['x1','y1','x2','y2'].map(k=>[k,Number(l.getAttribute(k))])))})),frames:document.querySelectorAll('iframe[data-card-print]').length};
  },p);
  assert.equal(JSON.stringify(p),before);assert.equal(result.unchanged,true);assert.equal(result.ready,true);assert.equal(result.frames,1);
  assert.deepEqual(result.sheets.map(s=>s.side),['front','back','front','back']);assert.deepEqual(result.sheets.map(s=>s.cells.length),[9,9,1,1]);
  for(const [i,sheet] of result.sheets.entries()){
   assert.ok(sheet.marks.length>0);assert.deepEqual(sheet.marks,result.expectedMarks[i]);for(const [j,cell] of sheet.cells.entries()){
    const want=result.plan.pages[i].cells.filter(c=>c.cardId)[j];assert.equal(cell.src,result.refs[sheet.side==='back'?'back':cell.cardId]);assert.deepEqual([cell.w,cell.h],[744,1039]);
    for(const [k,wantMm] of [want.xMm,want.yMm,want.widthMm,want.heightMm].entries())assert.ok(Math.abs(cell.box[k]-wantMm)<.003,JSON.stringify(cell));
   }
  }
  const more=await e.page.evaluate(async p=>{const first=window.printCalls[0].frame;first.contentWindow.dispatchEvent(new Event('afterprint'));const cleaned=!first.isConnected;window.printMode='sync';await window.directPrint(p);return {cleaned,calls:window.printCalls.length,frames:document.querySelectorAll('iframe[data-card-print]').length,same:window.printCalls[0].html===window.printCalls[1].html};},p);
  assert.deepEqual(more,{cleaned:true,calls:2,frames:0,same:true});assert.deepEqual(e.httpRequests,[]);assert.deepEqual(e.pageErrors,[]);assert.deepEqual(e.downloads,[]);
 }finally{await e.browser.close();}
});

for(const [paper,orientation,width,height,counts] of [['A4','portrait',210,297,[9,9,1,1]],['A4','landscape',297,210,[8,8,2,2]],['Letter','portrait',215.9,279.4,[9,9,1,1]],['Letter','landscape',279.4,215.9,[8,8,2,2]]])test(`${paper} ${orientation} print media has exact physical pages and no extra blank sheet`,async()=>{
 const e=await setup();try{
  const p=await fixture(e.page,{paper,orientation});await e.page.evaluate(p=>window.directPrint(p),p);
  const references=await e.page.evaluate(async p=>{const a=window.testApi,assets=await a.loadAssets(p),refs={};for(const [key,card] of [['front',p.cards[0]],['back',p.back]]){const canvas=document.createElement('canvas');a.renderCard(canvas.getContext('2d'),p,card,assets,300);refs[key]=canvas.toDataURL();}const plan=a.planSheets(p);return {refs,plan,marks:plan.pages.map(page=>window.directCropMarks(page,plan).length)};},p);
  const refNames={};for(const [key,src] of Object.entries(references.refs)){refNames[key]=`native-print-ref-${paper}-${orientation}-${key}.png`;await writeFile(path.join(qa,refNames[key]),Buffer.from(src.split(',')[1],'base64'));}
  const manifest={pages:references.plan.pages.map((p,i)=>({...p,marks:references.marks[i],cells:p.cells.filter(c=>c.cardId).map(c=>({...c,reference:refNames[p.side]}))}))};
  const manifestPath=path.join(qa,`native-print-manifest-${paper}-${orientation}.json`);await writeFile(manifestPath,JSON.stringify(manifest,null,2));
  const html=await e.page.evaluate(()=>window.printCalls[0].html),oracle=await e.context.newPage();await oracle.setContent(html);await oracle.evaluate(()=>Promise.all([...document.images].map(i=>i.decode())));
  const cdp=await e.context.newCDPSession(oracle),pdf=await cdp.send('Page.printToPDF',{preferCSSPageSize:true,printBackground:true,displayHeaderFooter:false});
  const file=path.join(qa,`native-print-oracle-${paper}-${orientation}.pdf`);await writeFile(file,Buffer.from(pdf.data,'base64'));
  const pixels=JSON.parse(execFileSync(python,['-c',verifyNativePdf,file,manifestPath],{encoding:'utf8'}));assert.equal(pixels.status,'PASS');assert.deepEqual(pixels.cardsPerPage,counts);await writeFile(path.join(qa,`native-print-pixels-${paper}-${orientation}.json`),JSON.stringify(pixels,null,2));
  const report=JSON.parse(execFileSync(python,['-c',`import json,sys\nfrom pypdf import PdfReader\nr=PdfReader(sys.argv[1]);print(json.dumps({'pages':len(r.pages),'sizes':[[float(p.mediabox.width)*25.4/72,float(p.mediabox.height)*25.4/72] for p in r.pages]}))`,file],{encoding:'utf8'}));
  // Chromium rounds the MediaBox by up to .12 mm; card transforms must remain exact.
  assert.equal(report.pages,4);for(const size of report.sizes){assert.ok(Math.abs(size[0]-width)<.15,JSON.stringify(size));assert.ok(Math.abs(size[1]-height)<.15,JSON.stringify(size));}
  assert.deepEqual(await e.page.evaluate(()=>[...window.printCalls[0].frame.contentDocument.querySelectorAll('.print-sheet')].map(s=>s.querySelectorAll('img').length)),counts);
  await writeFile(path.join(qa,`native-print-physical-${paper}-${orientation}.json`),JSON.stringify(report,null,2));await oracle.close();assert.deepEqual(e.httpRequests,[]);assert.deepEqual(e.pageErrors,[]);
 }finally{await e.browser.close();}
});

test('printing snapshots preparation, rejects concurrent preparation, and replaces only completed print requests',async()=>{
 const e=await setup();try{
  const p=await fixture(e.page);const result=await e.page.evaluate(async p=>{
   const job=window.directPrint(p);p.cards[0].quantity=1;p.print.effectFrameSec=5.1;let busy;try{await window.directPrint(p);}catch(e){busy=e.problems?.[0].code;}await job;
   const old=window.printCalls[0].frame,first=old.contentDocument.querySelectorAll('.print-sheet').length;
   await window.directPrint(p);const fresh=window.printCalls[1].frame;
   return {busy,first,oldRemoved:!old.isConnected,freshSheets:fresh.contentDocument.querySelectorAll('.print-sheet').length,frames:document.querySelectorAll('iframe[data-card-print]').length,different:window.printCalls[0].html!==window.printCalls[1].html};
  },p);assert.deepEqual(result,{busy:'print-busy',first:4,oldRemoved:true,freshSheets:2,frames:1,different:true});assert.deepEqual(e.pageErrors,[]);assert.deepEqual(e.httpRequests,[]);
 }finally{await e.browser.close();}
});

test('a front card named back keeps its own image instead of using the common back cache',async()=>{
 const e=await setup();try{
  const p=await fixture(e.page);p.cards[0].id='back';const same=await e.page.evaluate(async p=>{await window.directPrint(p);const sheets=window.printCalls[0].frame.contentDocument.querySelectorAll('.print-sheet');return sheets[0].querySelector('img').src===sheets[1].querySelector('img').src;},p);assert.equal(same,false);
 }finally{await e.browser.close();}
});

test('an asynchronous active native dialog retains its print snapshot until afterprint',async()=>{
 const e=await setup();try{
  const p=await fixture(e.page);const result=await e.page.evaluate(async p=>{
   window.printMode='async';await window.directPrint(p);const frame=window.printCalls[0].frame;let code;try{await window.directPrint(p);}catch(error){code=error.problems?.[0].code;}
   const retained=frame.isConnected;frame.contentWindow?.dispatchEvent(new Event('afterprint'));return {code,retained,frames:document.querySelectorAll('iframe[data-card-print]').length,calls:window.printCalls.length};
  },p);assert.deepEqual(result,{code:'print-busy',retained:true,frames:0,calls:1});assert.deepEqual(e.pageErrors,[]);
 }finally{await e.browser.close();}
});

test('unsupported browser printing and unreadable user art return useful errors without leaving print documents',async()=>{
 const e=await setup();try{
  const p=await fixture(e.page);const result=await e.page.evaluate(async p=>{
   const failures=[];const capture=async callback=>{try{await callback();}catch(e){failures.push({message:e.message,code:e.problems?.[0].code});}};
   await capture(()=>window.directPrint(p,{document:null}));
   const unavailableDocument={createElement:document.createElement.bind(document),defaultView:window,body:{appendChild:frame=>{document.body.appendChild(frame);frame.contentWindow.print=undefined;}}};
   await capture(()=>window.directPrint(p,{document:unavailableDocument}));
   p.assets.ink.dataUrl='data:image/png;base64,AAAA';await capture(()=>window.directPrint(p));
   return {failures,frames:document.querySelectorAll('iframe[data-card-print]').length};
  },p);assert.deepEqual(result.failures.map(f=>f.code),['native-print-unavailable','native-print-unavailable','asset-decode']);assert.ok(result.failures.every(f=>f.message.length>8));assert.equal(result.frames,0);assert.deepEqual(e.pageErrors,[]);assert.deepEqual(e.httpRequests,[]);
 }finally{await e.browser.close();}
});

test('preflight blocks invalid data and impossible paper layout before opening native print and failure paths clean their iframe',async()=>{
 const e=await setup();try{
  const p=await fixture(e.page);const result=await e.page.evaluate(async p=>{
   const failures=[];const attempt=async project=>{try{await window.directPrint(project);}catch(e){failures.push({message:e.message,codes:e.problems?.map(p=>p.code)});}};
   const empty=structuredClone(p);empty.cards=[];await attempt(empty);
   const invalidFont=structuredClone(p);invalidFont.cards[0].elements[0].style.fontPt=-1;await attempt(invalidFont);
   const invalid=structuredClone(p);invalid.print.backOffsetXmm=500;await attempt(invalid);
   const blockedCalls=window.printCalls.length;window.printMode='throw';await attempt(p);
   return {failures,blockedCalls,frames:document.querySelectorAll('iframe[data-card-print]').length};
  },p);
  assert.equal(result.failures.length,4);assert.ok(result.failures[0].codes.includes('empty-deck'));assert.ok(result.failures[1].codes.length);assert.ok(result.failures[2].codes.includes('back-outside'));assert.equal(result.blockedCalls,0);assert.equal(result.frames,0);assert.match(result.failures[3].message,/native printer unavailable|인쇄/);assert.deepEqual(e.httpRequests,[]);assert.deepEqual(e.pageErrors,[]);
 }finally{await e.browser.close();}
});
