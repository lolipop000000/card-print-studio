import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorkspaceStorage} from '../src/storage/workspace.js';
import {createProject} from '../src/model/project.js';

let model,storageModule;try{model=await import('../src/model/asset-library.js');storageModule=await import('../src/storage/asset-library.js');}catch(error){if(error.code!=='ERR_MODULE_NOT_FOUND')throw error;}
const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO5EE2cAAAAASUVORK5CYII=';
const image=()=>({id:'project-image',mime:'image/png',dataUrl:png,width:1,height:1,paintingId:null});
const library=(name='공용 그림')=>({...model.createAssetLibrary(),entries:[model.createLibraryEntry(image(),name)]});
const domError=(name)=>Object.assign(Error(name),{name});
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
const memory=()=>{const map=new Map();return {map,get:async key=>map.get(key),set:async(key,value)=>{map.set(key,structuredClone(value));}};};
let directoryId=0;
class File{
 constructor(name,text=''){this.kind='file';this.name=name;this.text=text;}
 async getFile(){const captured=this.text;await this.readGate?.promise;return {text:async()=>captured};}
 async createWritable(){this.started?.resolve();let pending='';return {write:async text=>{await this.writeGate?.promise;if(this.failWrite)throw domError('QuotaExceededError');pending=text;},close:async()=>{if(this.failClose)throw Error('disk close failure');this.text=pending;},abort:async()=>{this.aborted=true;}};}
}
class Dir{
 constructor(name){this.kind='directory';this.name=name;this.entryId=++directoryId;this.children=new Map();this.permission='granted';}
 async isSameEntry(other){return this.entryId===other?.entryId;}
 async queryPermission(){return this.permission;}
 async requestPermission(){return this.permission;}
 async getDirectoryHandle(name,{create=false}={}){let child=this.children.get(name);if(!child&&create){child=new Dir(name);this.children.set(name,child);}if(!child)throw domError('NotFoundError');if(child.kind!=='directory')throw domError('TypeMismatchError');return child;}
 async getFileHandle(name,{create=false}={}){let child=this.children.get(name);if(!child&&create){child=new File(name);this.children.set(name,child);}if(!child)throw domError('NotFoundError');if(child.kind!=='file')throw domError('TypeMismatchError');return child;}
 async *entries(){yield* this.children;}
 async resolve(target){if(this===target)return [];for(const [name,child] of this.children){if(child.kind==='directory'){const path=await child.resolve(target);if(path)return [name,...path];}}return null;}
}
const workspace=(picker)=>createWorkspaceStorage({picker,persistence:memory()});
const create=(options)=>storageModule.createAssetLibraryStorage(options);

test('shared library storage API is available',()=>assert.equal(typeof storageModule?.createAssetLibraryStorage,'function'));
test('offline browser cache reloads across sessions and never claims a disk save',async()=>{
 if(!storageModule)return;const persistence=memory(),first=create({persistence});let notices=0;first.subscribe(()=>notices++);
 assert.deepEqual(await first.load(),model.createAssetLibrary());const value=library();await first.save(value);value.entries[0].name='나중 변경';assert.equal(first.getState().mode,'temporary');assert.match(first.getState().location,/브라우저/);assert.ok(notices>0);
 const next=create({persistence});assert.equal((await next.load()).entries[0].name,'공용 그림');first.destroy();next.destroy();
});
test('cache quota and unavailable IndexedDB are actionable failures and retain previous good content',async()=>{
 if(!storageModule)return;const persistence=memory(),store=create({persistence});await store.load();await store.save(library('원본'));const saved=[...persistence.map.values()][0];
 persistence.set=async()=>{throw domError('QuotaExceededError');};await assert.rejects(store.save(library('실패')),/공간/);assert.equal(store.getState().mode,'error');assert.equal([...persistence.map.values()][0],saved);
 const absent=create({indexedDB:null});await assert.rejects(absent.load(),/브라우저.*저장/);assert.equal(absent.getState().mode,'error');
});
test('default persistence surfaces IndexedDB open and transaction errors',async()=>{
 if(!storageModule)return;
 for(const kind of ['open','transaction']){let dbName,closed=false;const indexedDB={open(name){dbName=name;const request={};queueMicrotask(()=>{if(kind==='open'){request.error=domError('SecurityError');request.onerror();return;}request.result={close(){closed=true;},transaction(){const transaction={objectStore:()=>({get(){return {};}})};queueMicrotask(()=>{transaction.error=domError('UnknownError');transaction.onabort();});return transaction;}};request.onsuccess();});return request;}};
  const store=create({indexedDB});await assert.rejects(store.load(),/브라우저.*저장/);assert.equal(dbName,'card-print-studio-asset-library');if(kind==='transaction')assert.equal(closed,true);
 }
});
test('library uses separate data assets location and preserves deck binding',async()=>{
 if(!storageModule)return;const root=new Dir('HTML');root.children.set('card-print-studio.html',new File('card-print-studio.html'));const ws=workspace(async()=>root);await ws.connect();const deck=await ws.save(createProject()),store=create({workspace:ws,persistence:memory()});
 await store.load();await store.save(library());const data=await root.getDirectoryHandle('작업실 데이터'),assets=await data.getDirectoryHandle('에셋'),file=await assets.getFileHandle('asset-library.json');
 assert.equal(model.parseAssetLibrary(file.text).entries.length,1);assert.equal(ws.getState().fileName,deck.fileName);assert.equal(store.getState().mode,'disk');assert.equal(store.getState().location,'HTML/작업실 데이터/에셋/asset-library.json');
 const reload=create({workspace:ws,persistence:memory()});assert.equal((await reload.load()).entries[0].name,'공용 그림');store.destroy();reload.destroy();
});
test('data roots, known descendants and unknown subfolders never nest the data directory',async()=>{
 if(!storageModule)return;
 for(const name of ['작업실 데이터','제작소 데이터','알 수 없는 하위 폴더']){const root=new Dir(name),ws=workspace(async()=>root);await ws.connect();const loaded=await ws.readAssetLibrary();await ws.writeAssetLibrary(library(),{expectedText:loaded.text});assert.equal(root.children.has('작업실 데이터'),false);const folder=name.includes('데이터')?await root.getDirectoryHandle('에셋'):root;assert.ok(folder.children.has('asset-library.json'));}
 const parent=new Dir('HTML');parent.children.set('card-print-studio.html',new File('card-print-studio.html'));let selected=parent;const ws=workspace(async()=>selected);await ws.connect();const data=await parent.getDirectoryHandle('작업실 데이터'),child=await data.getDirectoryHandle('그림',{create:true});selected=child;await ws.connect();const loaded=await ws.readAssetLibrary();await ws.writeAssetLibrary(library(),{expectedText:loaded.text});assert.equal(child.children.has('작업실 데이터'),false);assert.equal(child.children.has('에셋'),false);assert.ok(child.children.has('asset-library.json'));
});
test('project and card leaves refuse the shared library and direct users to the parent data folder',async()=>{
 if(!storageModule)return;for(const name of ['프로젝트','카드']){const root=new Dir(name),ws=workspace(async()=>root);await ws.connect();await assert.rejects(ws.readAssetLibrary(),error=>error.code==='wrong-folder'&&/상위.*데이터/.test(error.message));await assert.rejects(ws.writeAssetLibrary(library()),{code:'wrong-folder'});assert.equal(root.children.size,0);}
});
test('exact disk text conflicts require reload and do not overwrite external edits',async()=>{
 if(!storageModule)return;const root=new Dir('작업실 데이터'),ws=workspace(async()=>root);await ws.connect();const store=create({workspace:ws,persistence:memory()});await store.load();await store.save(library('원본'));const file=await(await root.getDirectoryHandle('에셋')).getFileHandle('asset-library.json'),external=model.serializeAssetLibrary(library('다른 창'));file.text=external;
 await assert.rejects(store.save(library('덮어쓰기')),/바뀌|충돌/);assert.equal(file.text,external);assert.notEqual(store.getState().mode,'disk');assert.equal((await store.load({discardPending:true})).entries[0].name,'다른 창');await store.save(library('명시적 다시 저장'));assert.equal(store.getState().mode,'disk');
});
test('failed disk save survives fresh controllers and retries against the original disk baseline',async()=>{
 const root=new Dir('작업실 데이터'),ws=workspace(async()=>root),persistence=memory();await ws.connect();let store=create({workspace:ws,persistence});await store.load();await store.save(library('폴더 원본'));
 const file=await(await root.getDirectoryHandle('에셋')).getFileHandle('asset-library.json'),original=file.text;file.failClose=true;await assert.rejects(store.save(library('잃으면 안 되는 조각')),/저장/);store.destroy();
 const nextWorkspace=workspace(async()=>root);await nextWorkspace.connect();store=create({workspace:nextWorkspace,persistence});assert.equal((await store.load()).entries[0].name,'잃으면 안 되는 조각');assert.equal(store.getState().pending,true);assert.notEqual(store.getState().mode,'disk');assert.equal(file.text,original);
 assert.equal((await store.load()).entries[0].name,'잃으면 안 되는 조각');assert.equal(file.text,original);file.failClose=false;await store.save(await store.load());assert.equal(model.parseAssetLibrary(file.text).entries[0].name,'잃으면 안 되는 조각');assert.equal(store.getState().pending,false);store.destroy();
 store=create({workspace:nextWorkspace,persistence});assert.equal((await store.load()).entries[0].name,'잃으면 안 되는 조각');assert.equal(store.getState().pending,false);assert.equal(store.getState().mode,'disk');store.destroy();
});
test('pending conflicts survive restart and only explicit discard chooses the newer disk file',async()=>{
 const root=new Dir('작업실 데이터'),ws=workspace(async()=>root),persistence=memory();await ws.connect();let store=create({workspace:ws,persistence});await store.load();await store.save(library('원본'));
 const file=await(await root.getDirectoryHandle('에셋')).getFileHandle('asset-library.json'),external=model.serializeAssetLibrary(library('외부 변경'));file.text=external;await assert.rejects(store.save(library('복구할 초안')),{code:'conflict'});store.destroy();
 store=create({workspace:ws,persistence});const draft=await store.load();assert.equal(draft.entries[0].name,'복구할 초안');await assert.rejects(store.save(draft),/바뀌|충돌/);assert.equal(file.text,external);assert.equal((await store.load()).entries[0].name,'복구할 초안');
 assert.equal((await store.load({discardPending:true})).entries[0].name,'외부 변경');assert.equal(store.getState().pending,false);store.destroy();store=create({workspace:ws,persistence});assert.equal((await store.load()).entries[0].name,'외부 변경');assert.equal(store.getState().pending,false);assert.equal(file.text,external);store.destroy();
});
test('same-named different folders cannot receive a recovered pending draft, including cloned handles',async()=>{
 const first=new Dir('작업실 데이터'),other=new Dir('작업실 데이터'),persistence=memory();let chosen=first;const ws=workspace(async()=>chosen);await ws.connect();let store=create({workspace:ws,persistence});await store.load();await store.save(library('공유 원본'));
 const originalFile=await(await first.getDirectoryHandle('에셋')).getFileHandle('asset-library.json'),original=originalFile.text;originalFile.failClose=true;await assert.rejects(store.save(library('첫 폴더 초안')));store.destroy();
 chosen=other;await ws.connect();const existing=await ws.readAssetLibrary();await ws.writeAssetLibrary(model.parseAssetLibrary(original),{expectedText:existing.text});const otherFile=await(await other.getDirectoryHandle('에셋')).getFileHandle('asset-library.json');
 store=create({workspace:ws,persistence});const recovered=await store.load();assert.equal(recovered.entries[0].name,'첫 폴더 초안');await assert.rejects(store.save(recovered),/폴더|연결/);assert.equal(otherFile.text,original);assert.equal(originalFile.text,original);
 chosen=first;await ws.connect();originalFile.failClose=false;assert.equal((await store.load()).entries[0].name,'첫 폴더 초안');await store.save(recovered);assert.equal(model.parseAssetLibrary(originalFile.text).entries[0].name,'첫 폴더 초안');assert.equal(otherFile.text,original);store.destroy();
});
test('legacy cached JSON stays readable and a failed explicit discard keeps pending recovery durable',async()=>{
 const persistence=memory(),legacy=library('기존 문자열');await persistence.set('shared-library:v1',model.serializeAssetLibrary(legacy));let store=create({persistence});assert.deepEqual(await store.load(),legacy);store.destroy();
 const root=new Dir('작업실 데이터'),ws=workspace(async()=>root);await ws.connect();store=create({workspace:ws,persistence});await store.load();await store.save(library('폴더 원본'));const file=await(await root.getDirectoryHandle('에셋')).getFileHandle('asset-library.json');file.failClose=true;await assert.rejects(store.save(library('복구 초안')));store.destroy();
 store=create({workspace:ws,persistence});assert.equal((await store.load()).entries[0].name,'복구 초안');const write=persistence.set;persistence.set=async()=>{throw domError('QuotaExceededError');};await assert.rejects(store.load({discardPending:true}),/공간/);persistence.set=write;store.destroy();
 store=create({workspace:ws,persistence});assert.equal((await store.load()).entries[0].name,'복구 초안');assert.equal(store.getState().pending,true);store.destroy();
});
test('a cache read failure or an unchecked offline save cannot erase a durable pending draft',async()=>{
 const root=new Dir('작업실 데이터'),ws=workspace(async()=>root),persistence=memory();await ws.connect();let store=create({workspace:ws,persistence});await store.load();await store.save(library('폴더 원본'));const file=await(await root.getDirectoryHandle('에셋')).getFileHandle('asset-library.json');file.failClose=true;await assert.rejects(store.save(library('남겨야 하는 초안')));store.destroy();const cached=persistence.map.get('shared-library:v1'),read=persistence.get;
 persistence.get=async()=>{throw domError('UnknownError');};store=create({workspace:ws,persistence});await assert.rejects(store.load(),/브라우저.*저장/);assert.equal(persistence.map.get('shared-library:v1'),cached);assert.equal(store.getState().pending,true);store.destroy();persistence.get=read;
 store=create({persistence});await assert.rejects(store.save(library('확인 없이 저장')),/불러|복구/);await assert.rejects(store.save(library('다시 확인 없이 저장')),/불러|복구/);assert.equal(persistence.map.get('shared-library:v1'),cached);assert.equal((await store.load()).entries[0].name,'남겨야 하는 초안');store.destroy();
});
test('handle cloning failures still cache the draft and refuse an unproven destination after restart',async()=>{
 const root=new Dir('작업실 데이터'),ws=workspace(async()=>root),persistence=memory();await ws.connect();let store=create({workspace:ws,persistence});await store.load();await store.save(library('원본'));const file=await(await root.getDirectoryHandle('에셋')).getFileHandle('asset-library.json');file.failClose=true;const set=persistence.set;
 persistence.set=async(key,value)=>{if(value?.pending?.root)throw Object.assign(Error('blocked handle clone'),{code:'asset-cache-failed',cause:domError('DataCloneError')});return set(key,value);};await assert.rejects(store.save(library('복구할 그림')));store.destroy();
 store=create({workspace:ws,persistence});const recovered=await store.load();assert.equal(recovered.entries[0].name,'복구할 그림');file.failClose=false;await assert.rejects(store.save(recovered),/폴더|연결/);assert.equal(model.parseAssetLibrary(file.text).entries[0].name,'원본');assert.equal((await store.load()).entries[0].name,'복구할 그림');store.destroy();
});
test('external edits while the atomic writer is open abort without replacing the file',async()=>{
 if(!storageModule)return;const root=new Dir('작업실 데이터'),ws=workspace(async()=>root);await ws.connect();const first=await ws.readAssetLibrary();const initial=await ws.writeAssetLibrary(library('원본'),{expectedText:first.text}),file=await(await root.getDirectoryHandle('에셋')).getFileHandle('asset-library.json');file.started=deferred();file.writeGate=deferred();
 const pending=ws.writeAssetLibrary(library('대기'),{expectedText:initial.text});await file.started.promise;file.text='외부 파일';file.writeGate.resolve();await assert.rejects(pending,{code:'conflict'});assert.equal(file.text,'외부 파일');assert.equal(file.aborted,true);
});
test('a file created after a missing-file read conflicts even if its text is empty',async()=>{
 if(!storageModule)return;const root=new Dir('작업실 데이터'),ws=workspace(async()=>root);await ws.connect();const loaded=await ws.readAssetLibrary(),folder=await root.getDirectoryHandle('에셋',{create:true}),file=await folder.getFileHandle('asset-library.json',{create:true});
 await assert.rejects(ws.writeAssetLibrary(library(),{expectedText:loaded.text}),{code:'conflict'});assert.equal(file.text,'');
});
test('library disk writes require a successful read before accepting an expected text',async()=>{
 if(!storageModule)return;const root=new Dir('작업실 데이터'),ws=workspace(async()=>root);await ws.connect();await assert.rejects(ws.writeAssetLibrary(library(),{expectedText:null}),{code:'library-not-loaded'});assert.equal(root.children.has('에셋'),false);
});
test('a folder switch during library save aborts the old writer and cannot write into the new folder',async()=>{
 if(!storageModule)return;const first=new Dir('작업실 데이터'),next=new Dir('다른 폴더');let selected=first;const ws=workspace(async()=>selected);await ws.connect();const store=create({workspace:ws,persistence:memory()});await store.load();await store.save(library('원본'));const file=await(await first.getDirectoryHandle('에셋')).getFileHandle('asset-library.json'),original=file.text;file.started=deferred();file.writeGate=deferred();
 const pending=store.save(library('오래된 저장'));await file.started.promise;selected=next;await ws.connect();file.writeGate.resolve();await assert.rejects(pending,/폴더.*바뀌|연결.*바뀌/);assert.equal(file.text,original);assert.equal(file.aborted,true);assert.equal(next.children.size,0);assert.notEqual(store.getState().mode,'disk');await assert.rejects(store.save(library('다시 저장')),/불러|다시/);
});
test('a folder switch during a library read rejects the old result and leaves the new destination untouched',async()=>{
 if(!storageModule)return;const first=new Dir('작업실 데이터'),next=new Dir('다른 폴더');let selected=first;const ws=workspace(async()=>selected);await ws.connect();const initial=await ws.readAssetLibrary();await ws.writeAssetLibrary(library(),{expectedText:initial.text});const file=await(await first.getDirectoryHandle('에셋')).getFileHandle('asset-library.json');file.readGate=deferred();const readStarted=deferred(),get=file.getFile.bind(file);file.getFile=async()=>{readStarted.resolve();return get();};
 const store=create({workspace:ws,persistence:memory()}),pending=store.load();await readStarted.promise;selected=next;await ws.connect();file.readGate.resolve();await assert.rejects(pending,/폴더.*바뀌|연결.*바뀌/);assert.equal(next.children.size,0);assert.notEqual(store.getState().mode,'disk');store.destroy();
});
test('denied folder reads use a cached library honestly, and failed disk close never claims success',async()=>{
 if(!storageModule)return;const root=new Dir('작업실 데이터'),ws=workspace(async()=>root);await ws.connect();const persistence=memory(),store=create({workspace:ws,persistence});await store.load();await store.save(library('복원할 그림'));root.permission='denied';assert.equal((await store.load()).entries[0].name,'복원할 그림');assert.equal(store.getState().mode,'temporary');assert.match(store.getState().message,/권한/);
 root.permission='granted';await store.load();const file=await(await root.getDirectoryHandle('에셋')).getFileHandle('asset-library.json'),original=file.text;file.failClose=true;await assert.rejects(store.save(library('실패')),/저장/);assert.equal(file.text,original);assert.equal(file.aborted,true);assert.notEqual(store.getState().mode,'disk');store.destroy();
});
test('explicit reconnect restores revoked library permission without replacing the open deck binding',async()=>{
 if(!storageModule)return;const root=new Dir('작업실 데이터'),ws=workspace(async()=>root);await ws.connect();const deck=await ws.save(createProject());await ws.readAssetLibrary();root.permission='denied';await assert.rejects(ws.readAssetLibrary(),{code:'permission-denied'});
 assert.equal(ws.getState().permission,'denied');let requested=0;root.requestPermission=async()=>{requested++;return root.permission='granted';};assert.equal(await ws.resume(),true);assert.equal(requested,1);assert.equal(ws.getState().fileName,deck.fileName);await ws.readAssetLibrary();
});
