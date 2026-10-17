import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorkspaceStorage} from '../src/storage/workspace.js';
import {createProject} from '../src/model/project.js';
import {exportCardFile} from '../src/model/card-file.js';

const missing=()=>Object.assign(Error('missing'),{name:'NotFoundError'});
class Dir{
 constructor(name){this.kind='directory';this.name=name;this.children=new Map();this.permission='granted';this.requests=0;}
 async queryPermission(){return this.permission;}
 async requestPermission(){this.requests++;return this.permission='granted';}
 async getDirectoryHandle(name,{create=false}={}){let dir=this.children.get(name);if(!dir&&create)this.children.set(name,dir=new Dir(name));if(!dir)throw missing();if(dir.kind!=='directory')throw Error('file');return dir;}
 async getFileHandle(name,{create=false}={}){let file=this.children.get(name);if(!file&&create){let text='';file={kind:'file',name,getFile:async()=>({text:async()=>text}),createWritable:async()=>({write:async value=>{file.pending=value;},close:async()=>{text=file.pending;},abort:async()=>{}})};this.children.set(name,file);}if(!file)throw missing();return file;}
 async *entries(){yield* this.children;}
 async resolve(target){if(this===target)return [];for(const [name,child] of this.children){if(child.kind!=='directory')continue;const path=await child.resolve(target);if(path)return [name,...path];}return null;}
}
const persistence=()=>{const map=new Map();return {get:async key=>map.get(key),set:async(key,value)=>map.set(key,value)};};
const bundle=()=>{const p=createProject();return exportCardFile(p,p.cards[0].id);};
test('selecting the data directory uses it without nesting a data folder',async()=>{
 const root=new Dir('작업실 데이터'),storage=createWorkspaceStorage({picker:async()=>root,persistence:persistence()});await storage.connect();await storage.save(createProject());await storage.saveCard(bundle());
 assert.equal(root.children.has('작업실 데이터'),false);assert.equal((await root.getDirectoryHandle('프로젝트')).children.size,1);assert.equal((await root.getDirectoryHandle('카드')).children.size,1);
 assert.equal(storage.getState().projectsPath,'작업실 데이터/프로젝트');
});
test('project and card leaf directories save directly and refuse creating the opposite category inside them',async()=>{
 for(const kind of ['프로젝트','카드']){const root=new Dir(kind),storage=createWorkspaceStorage({picker:async()=>root,persistence:persistence()});await storage.connect();
 if(kind==='프로젝트'){await storage.save(createProject());await assert.rejects(storage.saveCard(bundle()),{code:'wrong-folder'});}
 else{await storage.saveCard(bundle());await assert.rejects(storage.save(createProject()),{code:'wrong-folder'});}
 assert.equal([...root.children.values()].filter(c=>c.kind==='directory').length,0);assert.equal(root.children.size,1);
 }
});
test('an unrecognized selected subfolder never gets another data directory',async()=>{
 const root=new Dir('내 폴더'),storage=createWorkspaceStorage({picker:async()=>root,persistence:persistence()});await storage.connect();await storage.save(createProject());await storage.saveCard(bundle());
 assert.equal([...root.children.values()].filter(c=>c.kind==='directory').length,0);assert.equal(root.children.size,2);
});
test('only a confirmed HTML parent creates the data directory, and a known descendant remains direct',async()=>{
 const parent=new Dir('HTML'),html=await parent.getFileHandle('card-print-studio.html',{create:true});let chosen=parent;
 const storage=createWorkspaceStorage({picker:async()=>chosen,persistence:persistence()});await storage.connect();const data=await parent.getDirectoryHandle('작업실 데이터'),art=await data.getDirectoryHandle('그림',{create:true});
 chosen=art;await storage.connect();await storage.save(createProject());assert.equal(art.children.has('작업실 데이터'),false);assert.equal([...art.children.values()].every(c=>c.kind==='file'),true);assert.equal(html.kind,'file');
});
test('remembered folder reconnect requests permission without showing a picker or creating directories',async()=>{
 const root=new Dir('작업실 데이터'),saved=persistence();let picks=0;const first=createWorkspaceStorage({picker:async()=>{picks++;return root;},persistence:saved,key:'same'});await first.connect();await first.save(createProject());
 root.permission='prompt';const next=createWorkspaceStorage({picker:async()=>{picks++;return root;},persistence:saved,key:'same'});assert.equal(await next.restore(),false);const requests=root.requests;
 assert.equal(next.getState().folderName,'작업실 데이터');assert.equal(await next.resume(),true);assert.equal(picks,1);assert.equal(root.requests,requests+1);assert.equal((await next.list()).length,1);assert.equal(root.children.has('작업실 데이터'),false);
});
test('legacy folder memory migrates to a stable key that survives a renamed HTML file',async()=>{
 const root=new Dir('작업실 데이터'),saved=persistence();await saved.set('file:///old/card-print-studio.html',root);
 const picker=()=>{throw Error('folder picker must not open');},first=createWorkspaceStorage({picker,persistence:saved,legacyKey:'file:///old/card-print-studio.html'});assert.equal(await first.restore(),true);
 const renamed=createWorkspaceStorage({picker,persistence:saved,legacyKey:'file:///new/card-print-studio-1.2.0.html'});assert.equal(await renamed.restore(),true);assert.equal(renamed.getState().folderName,'작업실 데이터');
});
