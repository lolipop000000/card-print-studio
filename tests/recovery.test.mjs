import test from 'node:test';
import assert from 'node:assert/strict';
import {createProject,serializeProject} from '../src/model/project.js';
import {createStore} from '../src/model/store.js';
let recovery;try{recovery=await import('../src/storage/recovery.js');}catch(error){if(error.code!=='ERR_MODULE_NOT_FOUND')throw error;}
function memory(){const map=new Map();return {map,list:async()=>[...map.values()].map(value=>structuredClone(value)),put:async record=>map.set(record.id,structuredClone(record)),remove:async id=>map.delete(id)};}
function session(store,storage,extra={}){let n=0;return recovery.createRecoverySession(store,{storage,delay:60_000,id:()=>String(++n),...extra});}
test('automatic recovery is available without connecting a disk folder',()=>assert.equal(typeof recovery?.createRecoverySession,'function'));
test('recovery snapshots include complete project data and never mark manual edits saved',async()=>{
 if(!recovery)return;const store=createStore(createProject()),storage=memory(),s=session(store,storage);await s.ready;
 store.edit('작업',p=>{p.name='어제 그린 덱';p.paintings.art={id:'art',width:64,height:64,activeLayerId:'layer',layers:[{id:'layer',name:'손그림',visible:true,locked:false,opacity:.7,png:'data:image/png;base64,AA=='}]};p.assets.art={id:'art',mime:'image/png',width:64,height:64,dataUrl:'data:image/png;base64,AA==',paintingId:'art'};p.cards[0].artAssetId='art';p.keywords=[{id:'warm',name:'온기',description:'설명',color:'#ff0000',iconAssetId:'art'}];});
 await s.flush();assert.equal(store.isDirty(),true);assert.equal(storage.map.size,1);assert.deepEqual(recovery.readRecoveryRecord([...storage.map.values()][0]).project,store.getProject());s.destroy();
});

test('new edits and late older writes cannot report the newest recovery snapshot as saved',async()=>{
 const storage=memory(),store=createStore(createProject()),states=[],s=session(store,storage,{onChange:state=>states.push(state.status)});await s.ready;
 try{
  store.edit('first',p=>p.name='기존 보관본');await s.flush();assert.equal(s.getState().status,'saved');
  store.edit('new painting',p=>p.name='그림 적용 중');assert.equal(s.getState().status,'pending');
  const write=storage.put;let release,start;const gate=new Promise(r=>release=r),started=new Promise(r=>start=r);
  storage.put=async record=>{start();await gate;return write(record);};const older=s.flush();await started;
  store.edit('latest',p=>p.name='가장 최근 그림');assert.equal(s.getState().status,'pending');
  release();await older;assert.equal(s.getState().status,'pending','an older completed write cannot mark a newer pending edit saved');
  assert.equal(JSON.parse([...storage.map.values()][0].text).name,'그림 적용 중');
  await s.flush();assert.equal(s.getState().status,'saved');assert.equal(JSON.parse([...storage.map.values()][0].text).name,'가장 최근 그림');
  assert.equal(store.isDirty(),true);assert.ok(states.includes('pending'));
 }finally{s.destroy();}
});
test('new decks get independent recovery slots and other tabs cannot overwrite them',async()=>{
 if(!recovery)return;const storage=memory(),a=createStore(createProject()),b=createStore(createProject());let n=0;const id=()=>String(++n),sa=session(a,storage,{id}),sb=session(b,storage,{id});await Promise.all([sa.ready,sb.ready]);
 a.edit('a',p=>p.name='첫 창');await sa.flush();b.edit('b',p=>p.name='둘째 창');await sb.flush();a.load(createProject());a.edit('new',p=>p.name='새 덱');await sa.flush();
 assert.deepEqual([...storage.map.values()].map(r=>JSON.parse(r.text).name).sort(),['둘째 창','새 덱','첫 창'].sort());sa.destroy();sb.destroy();
});
test('a late write is ordered before the latest snapshot and failures leave the last good record intact',async()=>{
 if(!recovery)return;const storage=memory(),store=createStore(createProject()),s=session(store,storage);await s.ready;store.edit('first',p=>p.name='먼저');await s.flush();const good=[...storage.map.values()][0];
 const write=storage.put;storage.put=async()=>{throw Object.assign(Error('full'),{name:'QuotaExceededError'});};store.edit('second',p=>p.name='실패');await assert.rejects(s.flush(),/공간/);assert.deepEqual([...storage.map.values()][0],good);assert.equal(store.isDirty(),true);
 storage.put=write;let release,start;const started=new Promise(r=>start=r),gate=new Promise(r=>release=r);storage.put=async record=>{start();await gate;return write(record);};store.edit('third',p=>p.name='대기');const first=s.flush();await started;store.edit('fourth',p=>p.name='최신');const last=s.flush();release();await Promise.all([first,last]);assert.equal(JSON.parse([...storage.map.values()][0].text).name,'최신');s.destroy();
});
test('invalid recovery records are isolated while healthy work can still be restored',async()=>{
 if(!recovery)return;const storage=memory();storage.map.set('bad',{id:'bad',version:1,text:'{',updatedAt:1});const store=createStore(createProject()),s=session(store,storage);await s.ready;store.edit('ok',p=>p.name='정상');await s.flush();
 const next=session(createStore(createProject()),storage,{id:()=> 'other'});await next.ready;const entries=await next.list();assert.equal(entries.length,2);assert.equal(entries.filter(e=>e.error).length,1);assert.equal(entries.find(e=>!e.error).project.name,'정상');next.destroy();s.destroy();
});
test('a recovered document is dirty and stale manual save callbacks cannot mark it saved',()=>{
 const store=createStore(createProject()),old=store.getProject(),p=createProject();p.name='복구본';store.load(p,{dirty:true});assert.equal(store.isDirty(),true);assert.equal(store.markSaved(old),false);assert.equal(store.isDirty(),true);assert.equal(serializeProject(store.getProject()),serializeProject(p));
});
test('switching decks before the debounce keeps the final old edit and exposes it for recovery immediately',async()=>{
 const storage=memory(),store=createStore(createProject()),s=session(store,storage);await s.ready;
 store.edit('last old edit',p=>p.name='전환 직전 최종 내용');const next=createProject();next.name='다음 덱';store.load(next);await s.flush();
 assert.equal(storage.map.size,2);const previous=await s.list();assert.equal(previous.length,1);assert.equal(previous[0].project.name,'전환 직전 최종 내용');s.destroy();
});
