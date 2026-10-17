import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {chromium} from 'playwright';

const root=fileURLToPath(new URL('../',import.meta.url));
const bundled=build({absWorkingDir:root,stdin:{contents:`import './src/app.js';import {createProject} from './src/model/project.js';import {applyTemplate} from './src/render/templates.js';import {exportCardFile} from './src/model/card-file.js';window.dropFixtures={createProject,applyTemplate,exportCardFile};`,resolveDir:root},bundle:true,write:false,format:'iife',target:'es2022',loader:{'.woff2':'base64'}});
async function open(){
 const browser=await chromium.launch({headless:true,executablePath:process.env.CARD_BROWSER_PATH||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
 try{const page=await browser.newPage({viewport:{width:1440,height:960},acceptDownloads:true}),errors=[];page.setDefaultTimeout(10000);page.on('pageerror',error=>errors.push(error.message));await page.route(/^https?:/,route=>route.abort());await page.setContent('<!doctype html><html lang="ko"><meta charset="utf-8"><body><div id="app"></div></body></html>');await page.addStyleTag({content:await readFile(new URL('../src/styles.css',import.meta.url),'utf8')});await page.addScriptTag({content:(await bundled).outputFiles[0].text});await page.waitForSelector('[data-ready="true"]');
 const project=await page.evaluate(()=>{const a=window.dropFixtures,p=a.createProject();p.name='드래그 덱';p.cards[0]=a.applyTemplate(p.cards[0],p.settings,'monster-standard');p.cards[0].name='원래 카드';return p;});return {browser,page,project,errors};}catch(error){await browser.close();throw error;}
}
async function drop(page,files){return page.evaluate(files=>{const dataTransfer=new DataTransfer();for(const file of files)dataTransfer.items.add(new File([file.text],file.name,{type:file.type??'application/json'}));const event=new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer});document.body.dispatchEvent(event);return event.defaultPrevented;},files);}
async function settle(page){await page.waitForFunction(()=>document.getElementById('app').dataset.jsonDropBusy==='false');}
async function save(page){const pending=page.waitForEvent('download');await page.getByRole('button',{name:'프로젝트 파일 내보내기',exact:true}).click();const stream=await (await pending).createReadStream(),chunks=[];for await(const chunk of stream)chunks.push(chunk);return JSON.parse(Buffer.concat(chunks).toString());}

test('dropping a deck or standalone card auto-detects contents and card import remains one undo',async()=>{
 const e=await open();try{const {page,project}=e;assert.equal(await drop(page,[{name:'anything.JSON',text:JSON.stringify(project)}]),true,'file drop prevents browser navigation');await page.waitForFunction(()=>document.getElementById('deck-name').value==='드래그 덱');await settle(page);assert.deepEqual(await save(page),project);
 const standalone=await page.evaluate(p=>{p=structuredClone(p);p.cards[0].name='추가한 카드';return window.dropFixtures.exportCardFile(p,p.cards[0].id);},project);await drop(page,[{name:'random.json',text:standalone}]);await settle(page);const added=await save(page);assert.equal(added.name,project.name);assert.equal(added.cards.length,2);assert.deepEqual(added.cards[0],project.cards[0]);assert.equal(added.cards[1].name,'추가한 카드');assert.notEqual(added.cards[1].id,project.cards[0].id);assert.deepEqual(added.assets,project.assets);assert.deepEqual(added.paintings,project.paintings);await page.locator('#undo').click();assert.deepEqual(await save(page),project);assert.deepEqual(e.errors,[]);
 }finally{await e.browser.close();}
});

test('invalid JSON, unsupported formats, multiple files and non-JSON drops preserve the current deck',async()=>{
 const e=await open();try{const {page,project}=e;await page.locator('#project-file').setInputFiles({name:'base.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(project))});await page.waitForFunction(()=>document.getElementById('deck-name').value==='드래그 덱');
 for(const [files,message] of [
  [[{name:'bad.json',text:'{broken'}],'JSON 내용을 읽지 못했어요'],
  [[{name:'unknown.json',text:JSON.stringify({format:'other',version:1})}],'지원하지 않는 JSON 형식'],
  [[{name:'one.json',text:'{}'},{name:'two.json',text:'{}'}],'한 번에 하나씩'],
  [[{name:'art.png',type:'image/png',text:'not an image'}],'JSON 파일만'],
  [[{name:'invalid.json',text:JSON.stringify({...project,version:99})}],'버전']
 ]){assert.equal(await drop(page,files),true);await settle(page);assert.ok((await page.locator('#message').innerText()).includes(message),message);assert.deepEqual(await save(page),project);}
 assert.deepEqual(e.errors,[]);
 }finally{await e.browser.close();}
});

test('dirty deck replacement uses save/discard/cancel and dropped cards can append without replacing work',async()=>{
 const e=await open();try{const {page,project}=e;await page.locator('#deck-name').fill('저장 전 작업');await page.locator('#deck-name').dispatchEvent('change');await drop(page,[{name:'deck.json',text:JSON.stringify(project)}]);await page.getByRole('dialog').getByRole('button',{name:'취소',exact:true}).click();await settle(page);assert.equal(await page.locator('#deck-name').inputValue(),'저장 전 작업');assert.equal(await page.locator('#save-state').innerText(),'미저장');
 await drop(page,[{name:'deck.json',text:JSON.stringify(project)}]);await page.getByRole('dialog').getByRole('button',{name:'저장하지 않고 계속',exact:true}).click();await settle(page);assert.deepEqual(await save(page),project);
 await page.locator('#deck-name').fill('추가할 덱');await page.locator('#deck-name').dispatchEvent('change');const card=await page.evaluate(p=>window.dropFixtures.exportCardFile(p,p.cards[0].id),project);await drop(page,[{name:'card.json',text:card}]);await page.locator('#duplicate-card-dialog').getByRole('button',{name:'추가',exact:true}).click();await settle(page);assert.equal(await page.getByRole('dialog').count(),0);assert.equal(await page.locator('#deck-name').inputValue(),'추가할 덱');assert.equal((await save(page)).cards.length,2);assert.deepEqual(e.errors,[]);
 }finally{await e.browser.close();}
});

test('file drag overlay clears on leave and modal drops cannot replace work or navigate',async()=>{
 const e=await open();try{const {page}=e;await page.evaluate(()=>{const dataTransfer=new DataTransfer();dataTransfer.items.add(new File(['{}'],'deck.json',{type:'application/json'}));document.body.dispatchEvent(new DragEvent('dragenter',{bubbles:true,cancelable:true,dataTransfer}));});await page.locator('#json-file-drop-overlay').waitFor({state:'visible'});await page.evaluate(()=>document.dispatchEvent(new DragEvent('dragleave',{bubbles:true,cancelable:true,relatedTarget:null})));await page.locator('#json-file-drop-overlay').waitFor({state:'hidden'});
 const before=await save(page);await page.locator('#keyword-manager').click();assert.equal(await drop(page,[{name:'deck.json',text:JSON.stringify(e.project)}]),true);await settle(page);assert.ok((await page.locator('#message').innerText()).includes('편집 창을 닫은 뒤'));await page.keyboard.press('Escape');assert.deepEqual(await save(page),before);assert.deepEqual(e.errors,[]);
 }finally{await e.browser.close();}
});

test('ordinary text drag keeps its native behavior',async()=>{
 const e=await open();try{const prevented=await e.page.evaluate(()=>{const dataTransfer=new DataTransfer();dataTransfer.setData('text/plain','기술 내용');return ['dragenter','dragover','drop'].map(type=>{const event=new DragEvent(type,{bubbles:true,cancelable:true,dataTransfer});document.getElementById('deck-name').dispatchEvent(event);return event.defaultPrevented;});});assert.deepEqual(prevented,[false,false,false]);assert.deepEqual(e.errors,[]);}finally{await e.browser.close();}
});

test('pending imports reject a second drop and destruction cancels delayed file reads',async()=>{
 const privateBundle=await build({absWorkingDir:root,stdin:{contents:"import {mountJsonFileDrop} from './src/ui/json-file-drop.js';window.mountDrop=mountJsonFileDrop;",resolveDir:root},bundle:true,write:false,format:'iife'});
 const browser=await chromium.launch({headless:true,executablePath:process.env.CARD_BROWSER_PATH||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
 try{const page=await browser.newPage();await page.setContent('<!doctype html><body><main></main></body>');await page.addScriptTag({content:privateBundle.outputFiles[0].text});
 const result=await page.evaluate(async()=>{
  const root=document.querySelector('main'),errors=[],calls=[];let release;const wait=new Promise(resolve=>release=resolve);
  const fire=(name,text=()=>Promise.resolve('{"format":"card-print-studio"}'))=>{const file=new File([''],name,{type:'application/json'});Object.defineProperty(file,'text',{value:text});const dataTransfer=new DataTransfer();dataTransfer.items.add(file);const event=new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer});document.body.dispatchEvent(event);return event.defaultPrevented;};
  const mounted=window.mountDrop(root,{onError:message=>errors.push(message),onProject:async(file,isCurrent)=>{if(isCurrent())calls.push(await file.text());},onCard:()=>{throw Error('wrong route');}});
  const firstPrevented=fire('slow.json',()=>wait);const secondPrevented=fire('second.json');release('{"format":"card-print-studio"}');await new Promise(resolve=>setTimeout(resolve,0));
  const done=root.dataset.jsonDropBusy;let releaseLate;fire('late.json',()=>new Promise(resolve=>releaseLate=resolve));mounted.destroy();releaseLate('{"format":"card-print-studio"}');await new Promise(resolve=>setTimeout(resolve,0));
  return {firstPrevented,secondPrevented,done,errors,calls,overlays:document.querySelectorAll('#json-file-drop-overlay').length,postDestroyPrevented:fire('after.json')};
 });assert.equal(result.firstPrevented,true);assert.equal(result.secondPrevented,true);assert.equal(result.done,'false');assert.equal(result.errors.length,1);assert.ok(result.errors[0].includes('불러오는 중'));assert.equal(result.calls.length,1);assert.equal(result.overlays,0);assert.equal(result.postDestroyPrevented,false);
 }finally{await browser.close();}
});

test('opening an editor during asset preparation cancels the late import',async()=>{
 const privateBundle=await build({absWorkingDir:root,stdin:{contents:"import {mountJsonFileDrop} from './src/ui/json-file-drop.js';window.mountDrop=mountJsonFileDrop;",resolveDir:root},bundle:true,write:false,format:'iife'});
 const browser=await chromium.launch({headless:true,executablePath:process.env.CARD_BROWSER_PATH||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
 try{const page=await browser.newPage();await page.setContent('<!doctype html><body><main></main></body>');await page.addScriptTag({content:privateBundle.outputFiles[0].text});
 const result=await page.evaluate(async()=>{
  const root=document.querySelector('main'),errors=[];let allowed=true,release,entered;const waiting=new Promise(resolve=>release=resolve),started=new Promise(resolve=>entered=resolve);let applied=false;
  const mounted=window.mountDrop(root,{canDrop:()=>allowed,onError:message=>errors.push(message),onProject:async(file,isCurrent)=>{entered();await waiting;if(isCurrent())applied=true;},onCard:()=>{}});
  const dataTransfer=new DataTransfer();dataTransfer.items.add(new File(['{"format":"card-print-studio"}'],'deck.json',{type:'application/json'}));document.body.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer}));await started;allowed=false;release();await new Promise(resolve=>setTimeout(resolve,0));const busy=root.dataset.jsonDropBusy;mounted.destroy();return {applied,errors,busy};
 });assert.equal(result.applied,false);assert.equal(result.busy,'false');assert.equal(result.errors.length,1);assert.ok(result.errors[0].includes('편집 창을 닫은 뒤'));
 }finally{await browser.close();}
});

test('same-name dropped cards use the duplicate choice and cancelled drops release busy state',async()=>{
 const e=await open();try{const {page,project}=e;await drop(page,[{name:'base.json',text:JSON.stringify(project)}]);await settle(page);
  const card=await page.evaluate(p=>{p=structuredClone(p);p.cards[0].baseHp=222;return window.dropFixtures.exportCardFile(p,p.cards[0].id);},project);
  await drop(page,[{name:'same.card.json',text:card}]);await page.locator('#duplicate-card-dialog').getByRole('button',{name:'취소',exact:true}).click();await settle(page);assert.deepEqual(await save(page),project);
  await drop(page,[{name:'same.card.json',text:card}]);await page.locator('#duplicate-card-dialog').getByRole('button',{name:'덮어쓰기',exact:true}).click();await settle(page);
  const replaced=await save(page);assert.equal(replaced.cards.length,1);assert.equal(replaced.cards[0].id,project.cards[0].id);assert.equal(replaced.cards[0].baseHp,222);await page.locator('#undo').click();assert.deepEqual(await save(page),project);
  assert.deepEqual(e.errors,[]);
 }finally{await e.browser.close();}
});

test('a deck switch during a dropped file read cancels the import and permits the next drop',async()=>{
 const e=await open();try{const {page,project}=e;await drop(page,[{name:'base.json',text:JSON.stringify(project)}]);await settle(page);
  const card=await page.evaluate(p=>window.dropFixtures.exportCardFile(p,p.cards[0].id),project);
  await page.evaluate(()=>{const original=File.prototype.text;File.prototype.text=async function(){if(this.name==='slow.card.json'){File.prototype.text=original;window.__dropReadStarted=true;await new Promise(resolve=>window.__releaseDrop=resolve);}return original.call(this);};});
  await drop(page,[{name:'slow.card.json',text:card}]);await page.waitForFunction(()=>window.__dropReadStarted);await page.getByRole('button',{name:'새 덱',exact:true}).click();const replacement=await save(page);
  await page.evaluate(()=>window.__releaseDrop());await settle(page);assert.deepEqual(await save(page),replacement);assert.equal(await page.locator('#duplicate-card-dialog').count(),0);
  await drop(page,[{name:'next.card.json',text:card}]);await settle(page);const added=await save(page);assert.equal(added.cards.length,2);assert.equal(added.cards[0].id,replacement.cards[0].id);assert.equal(added.cards[1].name,project.cards[0].name);assert.deepEqual(e.errors,[]);
 }finally{await e.browser.close();}
});
