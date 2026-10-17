import test from 'node:test';
import assert from 'node:assert/strict';
import {createProject,serializeProject} from '../src/model/project.js';
import {createVisualEffects} from '../src/model/visual-effects.js';
import {exportCardFile,parseCardFile} from '../src/model/card-file.js';

let storageModule;
try { storageModule=await import('../src/storage/workspace.js'); }
catch(error) { if(error.code!=='ERR_MODULE_NOT_FOUND')throw error; }
const storageTest=(name,fn)=>test(name,{skip:!storageModule},fn);
const domError=(name,message=name)=>Object.assign(new Error(message),{name});
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};

// File System Access handles are the browser boundary. Serialization and validation stay real.
class MemoryFile {
 constructor(name,text=''){this.kind='file';this.name=name;this.contents=text;this.lastModified=1;this.failRead=false;this.failWrite=false;this.failClose=false;this.locked=false;}
 async getFile(){
  if(this.failRead)throw domError('NotReadableError');
  const text=this.contents;
  return {name:this.name,size:Buffer.byteLength(text),lastModified:this.lastModified,text:async()=>text};
 }
 async createWritable(options={}){
  if(this.locked&&options.mode==='exclusive')throw domError('NoModificationAllowedError');
  this.locked=true;this.writerStarted?.resolve();
  let buffer=options.keepExistingData?this.contents:'';
  return {
   write:async text=>{await this.writeGate?.promise;if(this.failWrite)throw domError('QuotaExceededError');buffer=String(text);},
   close:async()=>{await this.closeGate?.promise;if(this.failClose)throw domError('UnknownError','disk close failed');this.contents=buffer;this.lastModified++;this.locked=false;},
   abort:async()=>{this.aborted=true;this.locked=false;}
  };
 }
 externalWrite(text){this.contents=text;this.lastModified++;}
}
class MemoryDirectory {
 constructor(name='HTML 위치',permission={value:'granted',requestResult:'granted',requests:0,queries:0}){this.kind='directory';this.name=name;this.permission=permission;this.children=new Map();}
 async queryPermission(options){assert.equal(options.mode,'readwrite');this.permission.queries++;return this.permission.value;}
 async requestPermission(options){assert.equal(options.mode,'readwrite');this.permission.requests++;this.permission.value=this.permission.requestResult;return this.permission.value;}
 async getDirectoryHandle(name,{create=false}={}){
  if(this.permission.value!=='granted')throw domError('NotAllowedError');
  const child=this.children.get(name);
  if(child){if(child.kind!=='directory')throw domError('TypeMismatchError');return child;}
  if(!create)throw domError('NotFoundError');
  const directory=new MemoryDirectory(name,this.permission);this.children.set(name,directory);return directory;
 }
 async getFileHandle(name,{create=false}={}){
  const child=this.children.get(name);
  if(child){if(child.kind!=='file')throw domError('TypeMismatchError');return child;}
  if(!create)throw domError('NotFoundError');
  const file=new MemoryFile(name);this.onCreateFile?.(file);this.children.set(name,file);return file;
 }
 async *entries(){for(const entry of this.children)yield entry;}
}
function memoryPersistence(){const map=new Map();return {map,get:async key=>map.get(key),set:async(key,value)=>{map.set(key,value);}};}
function harness({root=new MemoryDirectory(),picker,persistence=memoryPersistence()}={}){
 const storage=storageModule.createWorkspaceStorage({picker:picker??(async()=>root),persistence,key:'file:///local/card-print-studio.html'});
 return {storage,root,persistence};
}
async function projects(root){return (await root.getDirectoryHandle('작업실 데이터')).getDirectoryHandle('프로젝트');}
async function cards(root){return (await root.getDirectoryHandle('작업실 데이터')).getDirectoryHandle('카드');}
function cardBundle(name='바다 카드'){const project=completeProject();project.cards[0].name=name;return exportCardFile(project,project.cards[0].id);}
function completeProject(name='바다 덱'){
 const project=createProject();project.name=name;
 project.paintings.paper={id:'paper',width:64,height:64,activeLayerId:'pixels',layers:[{id:'pixels',name:'손그림',visible:true,locked:false,opacity:.7,png:'data:image/png;base64,AA=='}]};
 project.assets.art={id:'art',mime:'image/png',dataUrl:'data:image/png;base64,AA==',width:64,height:64,paintingId:'paper'};
 project.cards[0].artAssetId='art';
 project.keywords=[{id:'rain',name:'비',description:'직접 쓴 키워드 설명',color:'#178fba',iconAssetId:'art'}];
 project.cards[0].passives=[{id:'rain-skill',name:'빗방울',effect:'비 2를 얻는다.',dice:null,keywords:[{keywordId:'rain',display:'both'}]}];
 project.visualEffectPresets=[{id:'own-effect',name:'내 불꽃',recipe:createVisualEffects('burning',{seed:31})}];
 return project;
}

test('local folder storage feature is available',()=>{
 assert.equal(typeof storageModule?.createWorkspaceStorage,'function','The offline editor needs local folder persistence, not a JSON download only.');
});

storageTest('connect invokes the native picker immediately and remembers only the granted directory',async()=>{
 const root=new MemoryDirectory(),persistence=memoryPersistence();let called=false;
 root.children.set('사용자 문서.txt',new MemoryFile('사용자 문서.txt','내 자료'));
 const {storage}=harness({root,persistence,picker:options=>{called=true;assert.deepEqual(options,{id:'card-studio-data',mode:'readwrite'});return Promise.resolve(root);}});
 const connecting=storage.connect();assert.equal(called,true,'picker must run in the initiating user gesture');
 assert.equal(await connecting,true);
 assert.equal(persistence.map.get('file:///local/card-print-studio.html'),root);
 assert.equal((await projects(root)).children.size,0,'connecting never saves a deck');
 assert.equal(root.children.get('사용자 문서.txt').contents,'내 자료');
 assert.equal(storage.getState().connected,true);assert.equal(storage.getState().fileName,null);
});

storageTest('a self-contained deck preserves artwork, layers, keywords and saved effects on disk',async()=>{
 const {storage,root}=harness();await storage.connect();const project=completeProject();
 const saved=await storage.save(project),folder=await projects(root),file=folder.children.get(saved.fileName);
 assert.equal(saved.project,project,'the caller can compare its original store snapshot');
 assert.equal(saved.text,serializeProject(project));assert.equal(file.contents,saved.text);
 const loaded=await storage.read((await storage.list())[0]);
 assert.deepEqual(loaded.project,project);
 assert.equal(loaded.project.keywords[0].description,'직접 쓴 키워드 설명');
 assert.equal(loaded.project.paintings.paper.layers[0].opacity,.7);
 assert.equal(loaded.project.assets.art.dataUrl,'data:image/png;base64,AA==');
});

storageTest('new and duplicate decks use separate collision-safe files while renamed decks keep their binding',async()=>{
 const {storage,root}=harness();await storage.connect();const original=completeProject();const first=await storage.save(original);
 const renamed=structuredClone(original);renamed.name='바뀐 이름';const second=await storage.save(renamed);
 assert.equal(second.fileName,first.fileName);
 storage.unbind();const duplicate=await storage.save(renamed);assert.notEqual(duplicate.fileName,first.fileName);
 storage.unbind();const another=await storage.save(renamed);assert.notEqual(another.fileName,duplicate.fileName);
 const folder=await projects(root);assert.equal(folder.children.size,3);
 assert.equal(JSON.parse(folder.children.get(first.fileName).contents).name,'바뀐 이름');
});

storageTest('reading another deck does not replace the current binding until bindLoaded follows confirmed load',async()=>{
 const {storage,root}=harness();await storage.connect();const first=await storage.save(completeProject('첫 덱'));
 storage.unbind();const second=await storage.save(completeProject('둘째 덱'));
 const loaded=await storage.read(first.fileName);
 assert.equal(storage.getState().fileName,second.fileName);
 const edited=structuredClone(loaded.project);edited.name='첫 덱 수정';
 storage.bindLoaded(loaded);assert.equal(storage.getState().fileName,first.fileName);
 const saved=await storage.save(edited);assert.equal(saved.fileName,first.fileName);
 assert.equal(JSON.parse((await projects(root)).children.get(second.fileName).contents).name,'둘째 덱');
});

storageTest('listing recognizes only project files and reports corrupt or unreadable files without hiding healthy decks',async()=>{
 const {storage,root}=harness();await storage.connect();const healthy=await storage.save(completeProject());const folder=await projects(root);
 folder.children.set('노트.txt',new MemoryFile('노트.txt','leave me'));
 folder.children.set('broken.card-project.json',new MemoryFile('broken.card-project.json','{'));
 const unreadable=new MemoryFile('locked.card-project.json','{}');unreadable.failRead=true;folder.children.set(unreadable.name,unreadable);
 folder.children.set('directory.card-project.json',new MemoryDirectory('directory.card-project.json'));
 const entries=await storage.list();assert.equal(entries.length,3);
 assert.equal(entries.find(e=>e.fileName===healthy.fileName).name,'바다 덱');
 assert.equal(entries.find(e=>e.fileName==='broken.card-project.json').error.code,'invalid-project');
 assert.equal(entries.find(e=>e.fileName==='locked.card-project.json').error.code,'read-failed');
 await assert.rejects(storage.read('broken.card-project.json'),{code:'invalid-project'});
});

storageTest('an external edit is rejected before overwrite and the original binding remains recoverable',async()=>{
 const {storage,root}=harness();await storage.connect();const saved=await storage.save(completeProject()),folder=await projects(root),file=folder.children.get(saved.fileName);
 const external=completeProject('다른 창에서 수정');file.externalWrite(serializeProject(external));
 const local=completeProject('이 창에서 수정');await assert.rejects(storage.save(local),{code:'conflict'});
 assert.equal(file.contents,serializeProject(external));
 const loaded=await storage.read(saved.fileName);storage.bindLoaded(loaded);
 const result=await storage.save(local);assert.equal(result.fileName,saved.fileName);assert.equal(file.contents,serializeProject(local));
});

storageTest('missing bound files are conflicts rather than silently recreated decks',async()=>{
 const {storage,root}=harness();await storage.connect();const saved=await storage.save(completeProject()),folder=await projects(root);
 folder.children.delete(saved.fileName);
 await assert.rejects(storage.save(completeProject()),{code:'conflict'});assert.equal(folder.children.size,0);
});

storageTest('failed writes and close failures abort their streams and preserve the previously saved bytes',async()=>{
 const {storage,root}=harness();await storage.connect();const original=completeProject(),saved=await storage.save(original),folder=await projects(root),file=folder.children.get(saved.fileName);
 for(const failure of ['failWrite','failClose']){
  file[failure]=true;await assert.rejects(storage.save(completeProject('저장 실패')),{code:'write-failed'});
  assert.equal(file.contents,saved.text);assert.equal(file.aborted,true);assert.equal(storage.getState().fileName,saved.fileName);file[failure]=false;
 }
 await storage.save(completeProject('다시 저장'));assert.equal(JSON.parse(file.contents).name,'다시 저장');
});

storageTest('save resolves only after close and keeps the captured text when its object changes during the write',async()=>{
 const {storage,root}=harness();await storage.connect();const initial=await storage.save(completeProject()),file=(await projects(root)).children.get(initial.fileName);
 const project=completeProject('저장 시점');file.closeGate=deferred();file.writerStarted=deferred();
 let resolved=false;const pending=storage.save(project).then(value=>{resolved=true;return value;});
 await file.writerStarted.promise;project.name='저장 중 변경';assert.equal(resolved,false);assert.equal(file.contents,initial.text);
 file.closeGate.resolve();const saved=await pending;assert.equal(saved.project,project);assert.equal(JSON.parse(saved.text).name,'저장 시점');assert.equal(JSON.parse(file.contents).name,'저장 시점');
});

storageTest('concurrent saves serialize their baselines and never lose the later snapshot',async()=>{
 const {storage,root}=harness();await storage.connect();const first=storage.save(completeProject('첫 저장')),second=storage.save(completeProject('둘째 저장'));
 const results=await Promise.all([first,second]);assert.equal(results[0].fileName,results[1].fileName);
 const folder=await projects(root);assert.equal(folder.children.size,1);assert.equal(JSON.parse(folder.children.get(results[1].fileName).contents).name,'둘째 저장');
});

storageTest('new deck unbinding during a pending write prevents a stale save from binding the new deck',async()=>{
 const {storage,root}=harness();await storage.connect();const saved=await storage.save(completeProject()),folder=await projects(root),file=folder.children.get(saved.fileName);
 file.closeGate=deferred();file.writerStarted=deferred();const pending=storage.save(completeProject('옛 덱 저장'));
 await file.writerStarted.promise;storage.unbind();file.closeGate.resolve();await pending;
 assert.equal(storage.getState().fileName,null);
 const fresh=await storage.save(completeProject('새 덱'));assert.notEqual(fresh.fileName,saved.fileName);
});

storageTest('invalid projects never open a file writer',async()=>{
 const {storage,root}=harness();await storage.connect();const invalid=createProject();invalid.keywords='invalid';
 await assert.rejects(storage.save(invalid),{code:'invalid-project'});assert.equal((await projects(root)).children.size,0);
});

storageTest('safe filenames cannot escape their folder or use reserved device names',async()=>{
 const {storage,root}=harness();await storage.connect();
 for(const name of ['../../escape','CON','NUL.txt','..','LPT1','x'.repeat(300),'<bad>:?*\\name']){
  storage.unbind();const result=await storage.save(completeProject(name));
  assert.match(result.fileName,/\.card-project\.json$/);assert.ok(result.fileName.length<200);assert.doesNotMatch(result.fileName,/[<>:"/\\|?*\x00-\x1f]/);
  assert.doesNotMatch(result.fileName,/^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i);
 }
 assert.equal((await projects(root)).children.size,7);
 await assert.rejects(storage.save(completeProject(),{fileName:'../outside.card-project.json'}),{code:'invalid-file-name'});
});

storageTest('explicit filenames do not grant permission to overwrite unrelated existing files',async()=>{
 const {storage,root}=harness();await storage.connect();const folder=await projects(root),text=serializeProject(completeProject('기존 파일'));
 folder.children.set('existing.card-project.json',new MemoryFile('existing.card-project.json',text));
 await assert.rejects(storage.save(completeProject('새 파일'),{fileName:'existing.card-project.json'}),{code:'conflict'});
 assert.equal(folder.children.get('existing.card-project.json').contents,text);
});

storageTest('queued save options are captured before the caller can change their filename',async()=>{
 const {storage,root}=harness();await storage.connect();
 const options={fileName:'chosen.card-project.json'},pending=storage.save(completeProject(),options);
 options.fileName='../outside.card-project.json';
 const saved=await pending;assert.equal(saved.fileName,'chosen.card-project.json');
 assert.equal((await projects(root)).children.has('../outside.card-project.json'),false);
});

storageTest('changes made while a writable stream is open abort instead of overwriting the external version',async()=>{
 const {storage,root}=harness();await storage.connect();const saved=await storage.save(completeProject()),file=(await projects(root)).children.get(saved.fileName);
 file.writeGate=deferred();file.writerStarted=deferred();const pending=storage.save(completeProject('로컬 변경'));
 await file.writerStarted.promise;const external=serializeProject(completeProject('저장 중 외부 변경'));file.externalWrite(external);file.writeGate.resolve();
 await assert.rejects(pending,{code:'conflict'});assert.equal(file.contents,external);assert.equal(file.aborted,true);
});

storageTest('another open browser writer causes a conflict and keeps the last committed file intact',async()=>{
 const {storage,root}=harness();await storage.connect();const saved=await storage.save(completeProject()),file=(await projects(root)).children.get(saved.fileName);
 const otherWriter=await file.createWritable({mode:'exclusive'});
 await assert.rejects(storage.save(completeProject('충돌')),{code:'conflict'});assert.equal(file.contents,saved.text);await otherWriter.abort();
});

storageTest('entries and prepared loads from a previous folder cannot bind a project in the new folder',async()=>{
 const firstRoot=new MemoryDirectory('첫 위치'),secondRoot=new MemoryDirectory('둘째 위치');let selected=firstRoot;
 const {storage}=harness({picker:async()=>selected});await storage.connect();await storage.save(completeProject());
 const entry=(await storage.list())[0],loaded=await storage.read(entry);selected=secondRoot;await storage.connect();
 await assert.rejects(storage.read(entry),{code:'stale-binding'});assert.throws(()=>storage.bindLoaded(loaded),{code:'stale-binding'});
 assert.equal((await projects(secondRoot)).children.size,0);
});

storageTest('restoring a remembered empty folder never creates a data directory until explicit Save',async()=>{
 const root=new MemoryDirectory(),persistence=memoryPersistence();persistence.map.set('file:///local/card-print-studio.html',root);
 const {storage}=harness({root,persistence});assert.equal(await storage.restore(),true);assert.equal(root.children.size,0);
 assert.deepEqual(await storage.list(),[]);assert.equal(root.children.size,0);
 await storage.save(completeProject());assert.equal((await projects(root)).children.size,1);
});

storageTest('a canceled folder picker leaves the previous connection and binding intact',async()=>{
 const root=new MemoryDirectory();let canceled=false;
 const {storage}=harness({root,picker:async()=>{if(canceled)throw domError('AbortError');return root;}});
 await storage.connect();const saved=await storage.save(completeProject());canceled=true;
 assert.equal(await storage.connect(),false);assert.equal(storage.getState().connected,true);assert.equal(storage.getState().fileName,saved.fileName);
});

storageTest('denied permissions expose an actionable error without creating data files',async()=>{
 const root=new MemoryDirectory('거절한 폴더',{value:'prompt',requestResult:'denied',requests:0,queries:0});
 const {storage,persistence}=harness({root});await assert.rejects(storage.connect(),{code:'permission-denied'});
 assert.equal(root.children.size,0);assert.equal(persistence.map.size,0);assert.equal(storage.getState().connected,false);
});

storageTest('remembered handles restore with queryPermission only and never choose or overwrite a deck',async()=>{
 const {storage,root,persistence}=harness();await storage.connect();const saved=await storage.save(completeProject());const before=root.permission.requests;
 const restored=harness({root,persistence,picker:()=>{throw new Error('restore must not show a picker');}}).storage;
 assert.equal(await restored.restore(),true);assert.equal(root.permission.requests,before);assert.equal(restored.getState().fileName,null);
 assert.equal((await restored.list())[0].fileName,saved.fileName);
});

storageTest('revoked remembered permission stays disconnected until an explicit user save grants it',async()=>{
 const {storage,root,persistence}=harness();await storage.connect();await storage.save(completeProject());root.permission.value='prompt';const before=root.permission.requests;
 const restored=harness({root,persistence}).storage;assert.equal(await restored.restore(),false);assert.equal(root.permission.requests,before);assert.equal(restored.getState().connected,false);
 const saved=await restored.save(completeProject('사용자가 저장'));assert.ok(saved.fileName);assert.equal(root.permission.requests,before+1);assert.equal(restored.getState().connected,true);
});

storageTest('unsupported browsers and unavailable handle persistence report their practical limits',async()=>{
 const unsupported=storageModule.createWorkspaceStorage({picker:null,persistence:memoryPersistence()});
 assert.equal(unsupported.getState().supported,false);assert.equal(await unsupported.restore(),false);await assert.rejects(unsupported.connect(),{code:'unsupported'});
 const root=new MemoryDirectory(),badPersistence={get:async()=>{throw new Error('IndexedDB blocked');},set:async()=>{throw new Error('IndexedDB blocked');}};
 const {storage}=harness({root,persistence:badPersistence});assert.equal(await storage.restore(),false);
 await storage.connect();assert.equal(storage.getState().connected,true);assert.ok(storage.getState().warning);
 await storage.save(completeProject());assert.equal((await projects(root)).children.size,1);
});

storageTest('state subscribers receive save errors and can unsubscribe without changing storage outcomes',async()=>{
 const {storage}=harness();const states=[],unsubscribe=storage.subscribe(state=>states.push(state));
 await storage.connect();await storage.save(completeProject());assert.ok(states.some(s=>s.connected&&s.fileName));
 unsubscribe();const count=states.length;storage.unbind();assert.equal(states.length,count);
});

storageTest('standalone cards save and load their embedded dependencies without changing the deck binding',async()=>{
 const {storage,root}=harness();assert.equal(typeof storage.saveCard,'function','Standalone cards need their own local folder snapshots.');
 await storage.connect();const deck=await storage.save(completeProject()),text=cardBundle();
 const saved=await storage.saveCard(text,'바다 카드');assert.equal(saved.text,text);assert.match(saved.fileName,/\.card\.json$/);
 assert.equal(storage.getState().fileName,deck.fileName);assert.equal((await cards(root)).children.get(saved.fileName).contents,text);
 const entries=await storage.listCards();assert.equal(entries.length,1);assert.equal(entries[0].name,'바다 카드');assert.equal(entries[0].cardCount,1);
 const loaded=await storage.readCard(entries[0]);assert.deepEqual(loaded.project,parseCardFile(text));assert.equal(loaded.text,text);
 assert.equal(loaded.project.keywords[0].description,'직접 쓴 키워드 설명');assert.equal(loaded.project.assets.art.dataUrl,'data:image/png;base64,AA==');assert.equal(loaded.project.paintings.paper.layers[0].opacity,.7);
 assert.equal(storage.getState().fileName,deck.fileName);assert.throws(()=>storage.bindLoaded(loaded),{code:'stale-binding'});assert.equal((await storage.list()).length,1);
});

storageTest('same-name concurrent card saves always create independent snapshots and preserve existing files',async()=>{
 const {storage,root}=harness();await storage.connect();const firstText=cardBundle('첫 카드'),secondText=cardBundle('다른 내용');
 const [first,second]=await Promise.all([storage.saveCard(firstText,'같은 이름'),storage.saveCard(secondText,'같은 이름')]);
 assert.notEqual(first.fileName,second.fileName);const folder=await cards(root);assert.equal(folder.children.size,2);
 assert.equal(folder.children.get(first.fileName).contents,firstText);assert.equal(folder.children.get(second.fileName).contents,secondText);assert.equal(storage.getState().fileName,null);
});

storageTest('card file names are safe and captured before queued disk access',async()=>{
 const {storage,root}=harness();await storage.connect();let label='처음 이름';const name={toString:()=>label};
 const pending=storage.saveCard(cardBundle(),name);label='../바뀐 이름';const saved=await pending;assert.equal(saved.fileName,'처음 이름.card.json');
 for(const unsafe of ['../../escape','CON','NUL.txt','..','LPT1','x'.repeat(300),'<bad>:?*\\name']){
  const snapshot=await storage.saveCard(cardBundle(),unsafe);assert.match(snapshot.fileName,/\.card\.json$/);assert.ok(snapshot.fileName.length<200);
  assert.doesNotMatch(snapshot.fileName,/[<>:"/\\|?*\x00-\x1f]/);assert.doesNotMatch(snapshot.fileName,/^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i);
 }
 await assert.rejects(storage.readCard('../escape.card.json'),{code:'invalid-file-name'});assert.equal((await cards(root)).children.size,8);
});

storageTest('card listing is read-only and isolates invalid, unreadable and unrelated files',async()=>{
 const {storage,root}=harness();await storage.connect();assert.deepEqual(await storage.listCards(),[]);
 const data=await root.getDirectoryHandle('작업실 데이터');assert.equal(data.children.has('카드'),false);
 const saved=await storage.saveCard(cardBundle(),'정상 카드'),folder=await cards(root);
 folder.children.set('broken.card.json',new MemoryFile('broken.card.json','{'));
 const unreadable=new MemoryFile('locked.card.json',cardBundle());unreadable.failRead=true;folder.children.set(unreadable.name,unreadable);
 folder.children.set('deck.card-project.json',new MemoryFile('deck.card-project.json',serializeProject(createProject())));
 folder.children.set('notes.txt',new MemoryFile('notes.txt','내 메모'));folder.children.set('nested.card.json',new MemoryDirectory('nested.card.json'));
 const entries=await storage.listCards();assert.equal(entries.length,3);assert.equal(entries.find(e=>e.fileName===saved.fileName).cardCount,1);
 assert.equal(entries.find(e=>e.fileName==='broken.card.json').error.code,'invalid-card');assert.equal(entries.find(e=>e.fileName==='locked.card.json').error.code,'read-failed');
 await assert.rejects(storage.readCard('broken.card.json'),{code:'invalid-card'});assert.equal(folder.children.get('notes.txt').contents,'내 메모');
});

storageTest('card validation rejects project files and invalid card bundles before creating a card folder',async()=>{
 const {storage,root}=harness();await storage.connect();
 for(const text of ['{',serializeProject(createProject()),JSON.stringify({format:'card-print-studio-card',version:1,project:{}})])await assert.rejects(storage.saveCard(text,'잘못된 카드'),{code:'invalid-card'});
 const data=await root.getDirectoryHandle('작업실 데이터');assert.equal(data.children.has('카드'),false);assert.equal(storage.getState().fileName,null);
});

storageTest('failed card writes abort without replacing existing snapshots or binding the open deck',async()=>{
 const {storage,root}=harness();await storage.connect();const deck=await storage.save(completeProject()),first=await storage.saveCard(cardBundle(),'원본'),folder=await cards(root);
 folder.onCreateFile=file=>{file.failClose=true;};await assert.rejects(storage.saveCard(cardBundle('실패'),'원본'),{code:'write-failed'});
 assert.equal(folder.children.get(first.fileName).contents,first.text);const failed=[...folder.children.values()].find(file=>file.name!==first.fileName);
 assert.equal(failed.contents,'');assert.equal(failed.aborted,true);assert.equal(storage.getState().fileName,deck.fileName);
});

storageTest('card saving resolves only after close and retains the request text while waiting',async()=>{
 const {storage,root}=harness();await storage.connect();await storage.saveCard(cardBundle(),'준비');const folder=await cards(root),closeGate=deferred(),writerStarted=deferred();
 folder.onCreateFile=file=>{file.closeGate=closeGate;file.writerStarted=writerStarted;};let text=cardBundle('저장 시점'),resolved=false;
 const expected=text,pending=storage.saveCard(text,'저장 시점').then(saved=>{resolved=true;return saved;});text=cardBundle('나중 변경');
 await writerStarted.promise;assert.equal(resolved,false);closeGate.resolve();const saved=await pending;assert.equal(saved.text,expected);assert.equal(folder.children.get(saved.fileName).contents,expected);assert.notEqual(saved.text,text);
});

storageTest('card save permission denial does not create files and remembered permission can be explicitly restored',async()=>{
 const {storage,root,persistence}=harness();await storage.connect();root.permission.requestResult='denied';
 await assert.rejects(storage.saveCard(cardBundle(),'거절'),{code:'permission-denied'});assert.equal(root.children.get('작업실 데이터').children.has('카드'),false);
 root.permission.value='prompt';root.permission.requestResult='granted';const restored=harness({root,persistence}).storage;
 assert.equal(await restored.restore(),false);const saved=await restored.saveCard(cardBundle(),'명시적 저장');assert.ok(saved.fileName);assert.equal(restored.getState().connected,true);assert.equal(restored.getState().fileName,null);
});

storageTest('card snapshots abort if external content appears while their writer is open',async()=>{
 const {storage,root}=harness();await storage.connect();await storage.saveCard(cardBundle(),'준비');const folder=await cards(root),writeGate=deferred(),writerStarted=deferred();let newFile;
 folder.onCreateFile=file=>{newFile=file;file.writeGate=writeGate;file.writerStarted=writerStarted;};const pending=storage.saveCard(cardBundle(),'새 카드');
 await writerStarted.promise;newFile.externalWrite('외부 자료');writeGate.resolve();await assert.rejects(pending,{code:'conflict'});assert.equal(newFile.contents,'외부 자료');assert.equal(newFile.aborted,true);
});

storageTest('card entries cannot cross folders or acquire a deck save binding',async()=>{
 const firstRoot=new MemoryDirectory('첫 위치'),secondRoot=new MemoryDirectory('둘째 위치');let selected=firstRoot;
 const {storage}=harness({picker:async()=>selected});await storage.connect();await storage.saveCard(cardBundle(),'카드');const entry=(await storage.listCards())[0];
 const loaded=await storage.readCard(entry);assert.throws(()=>storage.bindLoaded(loaded),{code:'stale-binding'});
 const deck=await storage.save(completeProject());await assert.rejects(storage.readCard(deck.entry),{code:'invalid-file-name'});
 selected=secondRoot;await storage.connect();await assert.rejects(storage.readCard(entry),{code:'stale-binding'});assert.equal(storage.getState().fileName,null);
});

storageTest('same-name card saving asks before cancel, add or overwriting the selected file',async()=>{
 const {storage,root}=harness();await storage.connect();const first=await storage.saveCard(cardBundle('같은 카드'));
 const folder=await cards(root),original=folder.children.get(first.fileName).contents;
 const next=JSON.parse(original);next.project.cards[0].baseHp=250;const text=JSON.stringify(next);let asked=0;
 assert.equal(await storage.saveCard(text,'같은 카드',{onDuplicate:async entries=>{asked++;assert.equal(entries.length,1);assert.equal(entries[0].fileName,first.fileName);return {action:'cancel'};}}),null);
 assert.equal(folder.children.size,1);assert.equal(folder.children.get(first.fileName).contents,original);
 const added=await storage.saveCard(text,'같은 카드',{onDuplicate:async()=>({action:'add'})});assert.notEqual(added.fileName,first.fileName);assert.equal(folder.children.size,2);
 const newer=JSON.parse(text);newer.project.cards[0].baseHp=333;const newerText=JSON.stringify(newer);
 const overwritten=await storage.saveCard(newerText,'같은 카드',{onDuplicate:async entries=>{asked++;assert.equal(entries.length,2);return {action:'overwrite',entry:entries.find(e=>e.fileName===added.fileName)};}});
 assert.equal(overwritten.fileName,added.fileName);assert.equal(overwritten.overwritten,true);assert.equal(folder.children.size,2);assert.equal(folder.children.get(first.fileName).contents,original);assert.equal(folder.children.get(added.fileName).contents,newerText);assert.equal(asked,2);assert.equal(storage.getState().fileName,null);
});

storageTest('a file changed while duplicate confirmation is open is never overwritten',async()=>{
 const {storage,root}=harness();await storage.connect();const saved=await storage.saveCard(cardBundle('중복'));
 const file=(await cards(root)).children.get(saved.fileName),external=cardBundle('외부에서 바뀜');
 await assert.rejects(storage.saveCard(cardBundle('중복'),'중복',{onDuplicate:async entries=>{file.externalWrite(external);return {action:'overwrite',entry:entries[0]};}}),{code:'conflict'});
 assert.equal(file.contents,external);assert.equal(file.locked,false);assert.equal(file.aborted,true);
});

storageTest('duplicate choices cannot select an unrelated file or a previous folder',async()=>{
 let selectedRoot=new MemoryDirectory('첫 폴더');const storage=storageModule.createWorkspaceStorage({picker:async()=>selectedRoot,persistence:memoryPersistence()});await storage.connect();
 await storage.saveCard(cardBundle('중복'));await assert.rejects(storage.saveCard(cardBundle('중복'),'중복',{onDuplicate:async()=>({action:'overwrite',entry:{fileName:'../other.card.json'}})}),{code:'stale-binding'});
 await assert.rejects(storage.saveCard(cardBundle('중복'),'중복',{onDuplicate:async entries=>{selectedRoot=new MemoryDirectory('다른 폴더');await storage.connect();return {action:'overwrite',entry:entries[0]};}}),{code:'stale-binding'});
});
