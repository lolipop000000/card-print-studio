import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,webcrypto} from 'node:crypto';

let model,storage;
try{model=await import('../src/model/background-removal.js');storage=await import('../src/storage/background-model.js');}catch(error){if(error.code!=='ERR_MODULE_NOT_FOUND')throw error;}
const near=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-5,`${actual} != ${expected}`);
const memory=()=>{let record;return {get:async()=>structuredClone(record),set:async value=>{record=structuredClone(value);},clear:async()=>{record=undefined;}};};
const bytes=new Uint8Array([9,8,7,6]),sha256=createHash('sha256').update(bytes).digest('hex');
const resources=[{name:'fixture',url:'https://example.test/fixture',size:4,type:'application/octet-stream',sha256}];

test('automatic foreground removal and its local model loader are available',()=>{
 assert.equal(typeof model?.removeImageBackground,'function');
 assert.equal(typeof storage?.createBackgroundModelLoader,'function');
});

test('foreground preprocessing uses RGB image maximum, excludes alpha, and emits channel-first floats',()=>{
 if(!model)return;
 const result=model.preprocessForegroundPixels(new Uint8ClampedArray([128,64,32,255,0,32,64,0]));
 assert.equal(result.length,6);
 [2.2489083,-2.117904,0.19642857,-0.91964286,-0.69333333,0.41777778].forEach((v,i)=>near(result[i],v));
 assert.throws(()=>model.preprocessForegroundPixels(new Uint8ClampedArray(3)),/픽셀/);
 assert.ok([...model.preprocessForegroundPixels(new Uint8ClampedArray([0,0,0,0]))].every(Number.isFinite));
});

test('foreground mask normalization retains soft edges and rejects invalid or empty predictions',()=>{
 if(!model)return;
 assert.deepEqual([...model.normalizeForegroundMask(new Float32Array([.25,.5,.75]))],[255,255,255,0,255,255,255,128,255,255,255,255]);
 for(const bad of [new Float32Array([]),new Float32Array([NaN,1]),new Float32Array([.5,.5])])assert.throws(()=>model.normalizeForegroundMask(bad),/구분|결과/);
});

test('downloaded model bytes are verified, cached together, and reused without network',async()=>{
 if(!storage)return;
 const persistence=memory(),progress=[];
 const load=storage.createBackgroundModelLoader({resources,persistence,crypto:webcrypto,fetch:async()=>new Response(bytes,{headers:{'content-type':'application/octet-stream','content-length':'4'}})});
 const first=await load({onProgress:event=>progress.push(event)});assert.deepEqual([...new Uint8Array(first.fixture)],[9,8,7,6]);
 const offline=storage.createBackgroundModelLoader({resources,persistence,crypto:webcrypto,fetch:async()=>{throw Error('offline');}});
 assert.deepEqual([...new Uint8Array((await offline()).fixture)],[9,8,7,6]);
 assert.ok(progress.some(event=>event.stage==='download'));
});

test('wrong hashes, excessive bytes, and blocked persistent storage never become runnable model bundles',async()=>{
 if(!storage)return;
 const create=(options={})=>storage.createBackgroundModelLoader({resources,persistence:memory(),crypto:webcrypto,fetch:async()=>new Response(bytes,{headers:{'content-type':'application/octet-stream'}}),...options});
 await assert.rejects(create({resources:[{...resources[0],sha256:'0'.repeat(64)}]})(),/검증|다시/);
 await assert.rejects(create({fetch:async()=>new Response(new Uint8Array(5),{headers:{'content-type':'application/octet-stream'}})})(),/크기|다시/);
 const badStorage={get:async()=>undefined,set:async()=>{throw Object.assign(Error('full'),{name:'QuotaExceededError'});},clear:async()=>{}};
 await assert.rejects(create({persistence:badStorage})(),/공간|저장/);
 await assert.rejects(storage.createBackgroundModelStorage({indexedDB:null}).get(),/저장|허용/);
});

test('cancellation stops downloads before any cached bundle is saved',async()=>{
 if(!storage)return;
 const controller=new AbortController(),persistence=memory();controller.abort();
 const load=storage.createBackgroundModelLoader({resources,persistence,crypto:webcrypto,fetch:async()=>{throw Error('must not fetch');}});
 await assert.rejects(load({signal:controller.signal}),{name:'AbortError'});
 assert.equal(await persistence.get(),undefined);
});
