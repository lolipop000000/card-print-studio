import test from 'node:test';
import assert from 'node:assert/strict';
import {openApp,qa} from './helpers/browser.mjs';
import {saveProject} from './helpers/flows.mjs';
import path from 'node:path';
import {readFile} from 'node:fs/promises';

const readHtml=await readFile(new URL('../dist/card-print-studio.html',import.meta.url),'utf8');
async function withFolder(page){
 await page.addInitScript(()=>{
  window.__pickerCalls=0;
  window.__workspaceRoot=navigator.storage.getDirectory().then(root=>root.getDirectoryHandle('card-studio-ui-test',{create:true})).then(async root=>{await root.getFileHandle('card-print-studio.html',{create:true});return root;});
  window.showDirectoryPicker=async()=>{window.__pickerCalls++;return window.__selectedFolder||window.__workspaceRoot;};
 });
 await page.route('http://localhost/card-studio-test',route=>route.fulfill({contentType:'text/html',body:readHtml}));
 await page.goto('http://localhost/card-studio-test');await page.waitForSelector('[data-ready="true"]');
}
async function diskProjects(page){return page.evaluate(async()=>{
 const root=await window.__workspaceRoot,folder=await (await root.getDirectoryHandle('작업실 데이터')).getDirectoryHandle('프로젝트'),results=[];
 for await(const [name,handle] of folder.entries())if(handle.kind==='file')results.push({name,text:await (await handle.getFile()).text()});return results;
});}

test('selecting the data folder persists its exact position across reload and reconnect never opens another picker',async()=>{
 const {browser,page,pageErrors}=await openApp();try{page.setDefaultTimeout(12_000);await withFolder(page);
  await page.evaluate(async()=>{window.__selectedFolder=await (await window.__workspaceRoot).getDirectoryHandle('작업실 데이터',{create:true});});
  await page.locator('#workspace-folder').click();await page.waitForFunction(()=>document.getElementById('workspace-status').textContent.includes('작업실 데이터/프로젝트'),null,{timeout:12_000});
  await page.locator('#card-name').fill('폴더 기억 확인');await page.locator('#card-name').press('Control+s');await page.waitForFunction(()=>document.getElementById('save-state').textContent==='저장됨',null,{timeout:12_000});
  assert.equal((await diskProjects(page)).length,1);assert.equal(await page.evaluate(async()=>{const data=await (await window.__workspaceRoot).getDirectoryHandle('작업실 데이터');for await(const [name] of data.entries())if(name==='작업실 데이터')return true;return false;}),false);
  await page.reload();await page.waitForSelector('[data-ready="true"]');await page.waitForFunction(()=>document.getElementById('workspace-status').textContent.includes('작업실 데이터/프로젝트'),null,{timeout:12_000});
  assert.equal(await page.evaluate(()=>window.__pickerCalls),0);await page.locator('#workspace-folder').click();await page.locator('#workspace-resume').click();await page.locator('#workspace-folder-dialog').waitFor({state:'detached'});assert.equal(await page.evaluate(()=>window.__pickerCalls),0);
  await page.getByRole('button',{name:'프로젝트 불러오기',exact:true}).click();await page.locator('#workspace-library .workspace-file').waitFor();assert.equal(await page.evaluate(()=>window.__pickerCalls),0);assert.deepEqual(pageErrors,[]);
 }finally{await browser.close();}
});
test('explicit folder selection lists existing deck and card JSON without changing the current work',async()=>{
 const {browser,page,pageErrors}=await openApp();try{
  page.setDefaultTimeout(10_000);await withFolder(page);
  const original=await saveProject(page,'folder-choice-before.json'),incoming=structuredClone(original);incoming.name='폴더의 덱';incoming.cards[0].name='폴더의 카드';
  const {exportCardFile}=await import('../src/model/card-file.js');
  await page.evaluate(async({project,card})=>{
   const root=await window.__workspaceRoot,data=await root.getDirectoryHandle('작업실 데이터',{create:true});
   for(const [folder,name,text] of [['프로젝트','폴더의 덱.card-project.json',project],['카드','폴더의 카드.card.json',card]]){
    const dir=await data.getDirectoryHandle(folder,{create:true}),file=await dir.getFileHandle(name,{create:true}),writer=await file.createWritable();await writer.write(text);await writer.close();
   }
  },{project:JSON.stringify(incoming),card:exportCardFile(incoming,incoming.cards[0].id)});
  await page.getByRole('button',{name:'프로젝트 불러오기',exact:true}).click();await page.locator('#project-import-folder').click();
  await page.locator('#workspace-library .workspace-file').waitFor();assert.equal(await page.evaluate(()=>window.__pickerCalls),1);
  await page.locator('#workspace-library').getByRole('button',{name:'닫기',exact:true}).click();assert.deepEqual(await saveProject(page,'folder-choice-unchanged.json'),original);
  await page.locator('#load-card').click();await page.locator('#card-library .workspace-file').waitFor();await page.locator('#card-import-folder').click();
  await page.locator('#card-library .workspace-file').waitFor();assert.equal(await page.evaluate(()=>window.__pickerCalls),2);
  await page.locator('#card-library .workspace-file').click();await page.waitForFunction(()=>document.querySelectorAll('.card-row').length===2,null,{timeout:10_000});
  assert.equal(await page.locator('#card-name').inputValue(),'폴더의 카드');await page.locator('#undo').click();assert.deepEqual(await saveProject(page,'folder-choice-card-undo.json'),original);assert.deepEqual(pageErrors,[]);
 }finally{await browser.close();}
});

test('folder save, Ctrl+S in an input, new deck isolation, and native-folder load roundtrip',async()=>{
 const {browser,page,pageErrors,httpRequests}=await openApp();try{
  await withFolder(page);
  const initial=await saveProject(page,'workspace-before.json');initial.keywords=[{id:'warmth',name:'온기',description:'저장도 함께',color:'#e17733',iconAssetId:null}];initial.cards[0].passives=[{id:'skill',name:'회복',effect:'온기',dice:null,keywords:[{keywordId:'warmth',display:'inline'}]}];
  await page.locator('#project-file').setInputFiles({name:'folder-test.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(initial))});
  await page.waitForSelector('#passives .skill-name');await page.locator('#card-name').fill('첫 카드');await page.locator('#card-name').press('Control+s');
  await page.waitForFunction(()=>document.getElementById('workspace-status').textContent.includes('.card-project.json'));
  let files=await diskProjects(page);assert.equal(files.length,1);const originalName=files[0].name;let saved=JSON.parse(files[0].text);assert.equal(saved.cards[0].name,'첫 카드');assert.equal(saved.keywords[0].name,'온기');assert.equal(await page.locator('#save-state').innerText(),'저장됨');
  await page.locator('#card-name').fill('수정 카드');await page.locator('#card-name').press('Control+s');await page.waitForFunction(()=>document.getElementById('save-state').textContent==='저장됨');
  files=await diskProjects(page);assert.equal(files.length,1);assert.equal(JSON.parse(files[0].text).cards[0].name,'수정 카드');
  await page.getByRole('button',{name:'새 덱',exact:true}).click();await page.getByRole('button',{name:'프로젝트 저장',exact:true}).click();await page.waitForFunction(()=>document.getElementById('workspace-status').textContent.includes('(2)'));
  files=await diskProjects(page);assert.equal(files.length,2);assert.equal(await page.evaluate(()=>window.__pickerCalls),1);
  await page.getByRole('button',{name:'프로젝트 불러오기',exact:true}).click();await page.locator('#workspace-library .workspace-file').filter({hasText:originalName}).click();await page.waitForSelector('#workspace-library',{state:'detached'});
  assert.equal(await page.locator('#card-name').inputValue(),'수정 카드');assert.equal((await saveProject(page,'workspace-restored.json')).keywords[0].name,'온기');
  await page.screenshot({path:path.join(qa,'workspace-connected.png'),fullPage:true});assert.deepEqual(pageErrors,[]);assert.deepEqual(httpRequests.filter(url=>url!=='http://localhost/card-studio-test'),[]);
 }finally{await browser.close();}
});
test('failed permission and cancelled folder chooser leave edits dirty without downloading',async()=>{
 const {browser,page,pageErrors}=await openApp();try{
  await page.addInitScript(()=>{window.showDirectoryPicker=async()=>{throw new DOMException('cancelled','AbortError');};});await page.reload();await page.waitForSelector('[data-ready="true"]');
  let downloads=0;page.on('download',()=>downloads++);await page.locator('#card-name').fill('지켜야 하는 카드');await page.locator('#card-name').press('Tab');await page.getByRole('button',{name:'프로젝트 저장',exact:true}).click();
  assert.equal(await page.locator('#save-state').innerText(),'미저장');assert.equal(downloads,0);
  await page.locator('#load-card').click();await page.waitForSelector('#card-library');
  const downloadEvent=page.waitForEvent('download');await page.locator('#card-export-file').click();const downloaded=await downloadEvent;const cardText=await readFile(await downloaded.path(),'utf8');assert.equal(JSON.parse(cardText).project.cards[0].name,'지켜야 하는 카드');
  const chooser=page.waitForEvent('filechooser');await page.locator('#card-import-file').click();await (await chooser).setFiles({name:'only.card.json',mimeType:'application/json',buffer:Buffer.from(cardText)});await page.locator('#duplicate-card-dialog').getByRole('button',{name:'추가',exact:true}).click();await page.waitForFunction(()=>document.querySelectorAll('.card-row').length===2);
  assert.equal(await page.locator('#save-state').innerText(),'미저장');downloads=0;
  // The picker is bound at controller creation, so exercise a fresh isolated load.
  await page.addInitScript(()=>{window.showDirectoryPicker=async()=>{throw new DOMException('denied','NotAllowedError');};});await page.reload();await page.waitForSelector('[data-ready="true"]');
  await page.locator('#card-name').fill('보존');await page.locator('#card-name').press('Tab');await page.getByRole('button',{name:'프로젝트 저장',exact:true}).click();await page.waitForFunction(()=>!document.getElementById('message').hidden);
  assert.equal(await page.locator('#save-state').innerText(),'미저장');assert.match(await page.locator('#message').innerText(),/권한/);assert.equal(downloads,0);assert.deepEqual(pageErrors,[]);
 }finally{await browser.close();}
});

test('closing the folder library cancels a delayed selection without replacing later edits',async()=>{
 const {browser,page}=await openApp();try{
  await withFolder(page);await page.getByRole('button',{name:'프로젝트 저장',exact:true}).click();await page.waitForFunction(()=>document.getElementById('workspace-status').textContent.includes('.json'));
  await page.getByRole('button',{name:'프로젝트 불러오기',exact:true}).click();await page.waitForSelector('#workspace-library .workspace-file');
  await page.evaluate(()=>{
   const original=FileSystemFileHandle.prototype.getFile;let count=0;
   FileSystemFileHandle.prototype.getFile=async function(){if(++count===2){window.__lateReadBlocked=true;await new Promise(resolve=>window.__releaseRead=resolve);}return original.call(this);};
  });
  await page.locator('#workspace-library .workspace-file').click();await page.waitForFunction(()=>window.__lateReadBlocked);
  await page.locator('#workspace-library').getByRole('button',{name:'닫기',exact:true}).click();await page.locator('#card-name').fill('닫은 뒤 편집');await page.locator('#card-name').press('Tab');
  await page.evaluate(()=>window.__releaseRead());await page.waitForTimeout(150);
  assert.equal(await page.locator('#card-name').inputValue(),'닫은 뒤 편집');assert.equal(await page.locator('#save-state').innerText(),'미저장');
 }finally{await browser.close();}
});
test('card-only folder snapshots and portable card import append without replacing the deck',async()=>{
 const {browser,page,pageErrors}=await openApp();try{
  await withFolder(page);await page.locator('#add-passive').click();await page.locator('#passives .skill-name').fill('강타');await page.locator('#passives .skill-name').press('Tab');
  await page.locator('#passives .skill-name-effects').click();await page.locator('#effect-text-color').fill('#ed2244');await page.locator('#effect-text-color').dispatchEvent('change');await page.locator('#effect-apply').click();
  await page.locator('#save-card').click();await page.waitForFunction(()=>document.getElementById('message').textContent.includes('카드만 저장했어요'));
  const saved=await page.evaluate(async()=>{const folder=await (await (await window.__workspaceRoot).getDirectoryHandle('작업실 데이터')).getDirectoryHandle('카드');const files=[];for await(const [name,handle] of folder.entries())files.push({name,text:await (await handle.getFile()).text()});return files;});
  assert.equal(saved.length,1);const bundle=JSON.parse(saved[0].text);assert.equal(bundle.project.cards.length,1);assert.equal(bundle.project.cards[0].passives[0].nameStyle.color,'#ed2244');
  await page.locator('#load-card').click();await page.locator('#card-library .workspace-file').click();await page.locator('#duplicate-card-dialog').getByRole('button',{name:'추가',exact:true}).click();await page.waitForSelector('#card-library',{state:'detached'});assert.equal(await page.locator('.card-row').count(),2);
  await page.locator('#card-file').setInputFiles({name:'one.card.json',mimeType:'application/json',buffer:Buffer.from(saved[0].text)});await page.locator('#duplicate-card-dialog').getByRole('button',{name:'추가',exact:true}).click();await page.waitForFunction(()=>document.querySelectorAll('.card-row').length===3);
  const deck=await saveProject(page,'card-file-ui.json');assert.equal(deck.cards.length,3);assert.equal(new Set(deck.cards.map(c=>c.id)).size,3);assert.equal(deck.cards[2].passives[0].nameStyle.color,'#ed2244');assert.deepEqual(pageErrors,[]);
 }finally{await browser.close();}
});

test('duplicate card import asks for cancel, overwrite or add, even when warnings are ignored',async()=>{
 const {browser,page,pageErrors}=await openApp();try{
  await page.locator('#card-name').fill('같은 카드');await page.locator('#card-name').press('Tab');await page.locator('#ignore-output-warnings').check();
  const original=await saveProject(page,'duplicate-import-before.json'),incoming=structuredClone(original);incoming.cards[0].baseHp=220;
  const {exportCardFile}=await import('../src/model/card-file.js');const file={name:'card.card.json',mimeType:'application/json',buffer:Buffer.from(exportCardFile(incoming,incoming.cards[0].id))};
  await page.locator('#card-file').setInputFiles(file);await page.locator('#duplicate-card-dialog').waitFor();assert.equal(await page.locator('.card-row').count(),1);await page.keyboard.press('Escape');assert.deepEqual(await saveProject(page,'duplicate-cancel.json'),original);
  await page.locator('#card-file').setInputFiles(file);await page.locator('#duplicate-card-dialog').getByRole('button',{name:'덮어쓰기',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#final-hp').textContent==='220');
  let current=await saveProject(page,'duplicate-replaced.json');assert.equal(current.cards.length,1);assert.equal(current.cards[0].id,original.cards[0].id);
  await page.locator('#undo').click();assert.deepEqual(await saveProject(page,'duplicate-undo.json'),original);await page.locator('#redo').click();
  await page.locator('#card-file').setInputFiles(file);await page.locator('#duplicate-card-dialog').getByRole('button',{name:'추가',exact:true}).click();await page.waitForFunction(()=>document.querySelectorAll('.card-row').length===2);
  incoming.cards[0].baseHp=333;file.buffer=Buffer.from(exportCardFile(incoming,incoming.cards[0].id));await page.locator('#card-file').setInputFiles(file);await page.locator('#duplicate-card-target').selectOption('1');await page.locator('#duplicate-card-dialog').getByRole('button',{name:'덮어쓰기',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#final-hp').textContent==='333');
  current=await saveProject(page,'duplicate-selected.json');assert.equal(current.cards.length,2);assert.equal(current.cards[0].baseHp,220);assert.equal(current.cards[1].baseHp,333);assert.equal(new Set(current.cards.map(c=>c.id)).size,2);assert.deepEqual(pageErrors,[]);
 }finally{await browser.close();}
});

test('duplicate folder saving cancels, keeps another copy, or replaces only the selected card file',async()=>{
 const {browser,page,pageErrors}=await openApp();try{
  await withFolder(page);await page.locator('#card-name').fill('중복 저장');await page.locator('#card-name').press('Tab');await page.locator('#save-card').click();await page.waitForFunction(()=>document.getElementById('message').textContent.includes('카드만 저장했어요'));
  const disk=()=>page.evaluate(async()=>{const f=await (await (await window.__workspaceRoot).getDirectoryHandle('작업실 데이터')).getDirectoryHandle('카드'),files=[];for await(const [name,h] of f.entries())files.push({name,text:await(await h.getFile()).text()});return files.sort((a,b)=>a.name.localeCompare(b.name,'ko'));});
  const before=await disk();await page.locator('#hp-reduction').fill('10');await page.locator('#hp-reduction').press('Tab');
  await page.locator('#save-card').click();await page.locator('#duplicate-card-dialog').getByRole('button',{name:'취소',exact:true}).click();assert.deepEqual(await disk(),before);
  await page.locator('#save-card').click();await page.locator('#duplicate-card-dialog').getByRole('button',{name:'추가',exact:true}).click();await page.waitForFunction(()=>document.getElementById('message').textContent.includes('(2)'));const added=await disk();assert.equal(added.length,2);
  const selected=added.find(e=>e.name.includes('(2)'));await page.locator('#hp-reduction').fill('20');await page.locator('#hp-reduction').press('Tab');await page.locator('#save-card').click();await page.locator('#duplicate-card-target').selectOption({label:selected.name});await page.locator('#duplicate-card-dialog').getByRole('button',{name:'덮어쓰기',exact:true}).click();
  await page.waitForFunction(()=>document.getElementById('message').textContent.includes('덮어썼어요'));const after=await disk();assert.equal(after.length,2);assert.equal(after.find(e=>e.name===before[0].name).text,before[0].text);assert.equal(JSON.parse(after.find(e=>e.name===selected.name).text).project.cards[0].hpReduction,20);assert.equal(await page.locator('#save-state').innerText(),'미저장');assert.deepEqual(pageErrors,[]);
 }finally{await browser.close();}
});

test('card imports begun before a deck switch cannot change the replacement deck',async()=>{
 const {browser,page,pageErrors}=await openApp();try{
  const {exportCardFile}=await import('../src/model/card-file.js');
  for(const phase of ['file','image']){
   const before=await saveProject(page,'stale-'+phase+'-before.json'),incoming=structuredClone(before);incoming.cards[0].name='늦게 읽힌 카드';
   if(phase==='image'){
    const png=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=c.height=2;const x=c.getContext('2d');x.fillStyle='#18a476';x.fillRect(0,0,2,2);return c.toDataURL();});
    incoming.assets['late-art']={id:'late-art',mime:'image/png',dataUrl:png,width:2,height:2,paintingId:null};incoming.cards[0].artAssetId='late-art';
   }
   await page.evaluate(phase=>{
    window.__readStarted=false;window.__readFinished=false;
    const type=phase==='file'?File:Image,method=phase==='file'?'text':'decode',original=type.prototype[method];
    type.prototype[method]=async function(...args){
     if((phase==='file'&&this.name==='slow.card.json')||(phase==='image'&&this.src.startsWith('data:image/png'))){
      type.prototype[method]=original;window.__readStarted=true;await new Promise(resolve=>window.__releaseImport=resolve);
      const value=await original.apply(this,args);window.__readFinished=true;return value;
     }
     return original.apply(this,args);
    };
   },phase);
   await page.locator('#card-file').setInputFiles({name:'slow.card.json',mimeType:'application/json',buffer:Buffer.from(exportCardFile(incoming,incoming.cards[0].id))});
   await page.waitForFunction(()=>window.__readStarted);await page.getByRole('button',{name:'새 덱',exact:true}).click();
   const replacement=await saveProject(page,'stale-'+phase+'-replacement.json');assert.notEqual(replacement.cards[0].id,before.cards[0].id);
   await page.evaluate(()=>window.__releaseImport());await page.waitForFunction(()=>window.__readFinished);await page.waitForTimeout(60);
   assert.deepEqual(await saveProject(page,'stale-'+phase+'-after.json'),replacement,phase+' read changed the new deck');
   assert.match(await page.locator('#message').innerText(),/카드를 읽는 동안 현재 덱이 바뀌었어요/);
   assert.equal(await page.locator('#duplicate-card-dialog').count(),0);
  }
  assert.deepEqual(pageErrors,[]);
 }finally{await browser.close();}
});

test('dropping another deck clears the saved-file binding and restores its front-card selection',async()=>{
 const {browser,page,pageErrors}=await openApp();try{
  await withFolder(page);await page.locator('#deck-name').fill('원본 덱');await page.locator('#deck-name').press('Tab');await page.getByRole('button',{name:'프로젝트 저장',exact:true}).click();
  await page.waitForFunction(()=>document.getElementById('save-state').textContent==='저장됨');const original=await diskProjects(page);assert.equal(original.length,1);
  const {createProject}=await import('../src/model/project.js'),{applyTemplate}=await import('../src/render/templates.js');const incoming=createProject();incoming.name='드롭한 다른 덱';incoming.cards[0]=applyTemplate(incoming.cards[0],incoming.settings,'monster-standard');incoming.cards[0].name='다른 덱의 첫 카드';
  await page.locator('#back-tab').click();
  await page.evaluate(text=>{const dataTransfer=new DataTransfer();dataTransfer.items.add(new File([text],'another.json',{type:'application/json'}));document.body.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer}));},JSON.stringify(incoming));
  await page.waitForFunction(()=>document.getElementById('app').dataset.jsonDropBusy==='false');
  assert.match(await page.locator('#workspace-status').innerText(),/^새 덱/,'replacement deck must be unbound before a later save');
  assert.equal(await page.locator('#card-name').inputValue(),incoming.cards[0].name);
  await page.getByRole('button',{name:'프로젝트 저장',exact:true}).click();await page.waitForFunction(()=>document.getElementById('workspace-status').textContent.includes('드롭한 다른 덱.card-project.json'));
  const files=await diskProjects(page);assert.equal(files.length,2);assert.equal(files.find(f=>f.name===original[0].name).text,original[0].text);assert.equal(JSON.parse(files.find(f=>f.name!==original[0].name).text).name,incoming.name);assert.deepEqual(pageErrors,[]);
 }finally{await browser.close();}
});
