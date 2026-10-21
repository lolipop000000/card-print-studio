import test from 'node:test';
import assert from 'node:assert/strict';
import {buildManifest} from '../supabase/functions/_shared/manifest.js';
import {diffManifest} from '../src/cloud/manifest-diff.js';
const row=(id,extra={})=>({id,owner:'friend',title:id,visibility:'public',deleted_at:null,data:{x:1},version:1,blob_refs:['a'.repeat(64)],updated_at:'2026-10-21T00:00:00Z',...extra});
const url='https://example.supabase.co/storage/v1/object/public/blobs/';
test('manifest lists only public non-deleted items with nickname',async()=>{
 const result=await buildManifest([row('public'),row('private',{visibility:'private'}),row('trash',{deleted_at:'2026-10-20T00:00:00Z'})],[row('image',{kind:'image'}),row('secret',{kind:'keyword',visibility:'private'})],new Map([['friend','친구']]),url);
 assert.equal(result.format,'card-print-studio-manifest');assert.equal(result.version,1);assert.ok(Number.isFinite(Date.parse(result.generatedAt)));assert.equal(result.blobBaseUrl,url);
 assert.deepEqual(result.works.map(item=>item.id),['public']);assert.deepEqual(result.assets.map(item=>item.id),['image']);assert.equal(result.assets[0].kind,'image');assert.equal(result.works[0].nickname,'친구');
 assert.match(result.works[0].hash,/^[0-9a-f]{64}$/);assert.equal(Object.hasOwn(result.works[0],'data'),false);assert.deepEqual(result.works[0].blobs,['a'.repeat(64)]);
});
test('hash stable under key order',async()=>{
 const a=await buildManifest([row('x',{data:{z:[{b:1,a:2}],a:'글자'}})],[],{},url),b=await buildManifest([row('x',{data:{a:'글자',z:[{a:2,b:1}]}})],[],{},url),c=await buildManifest([row('x',{data:{a:'다름',z:[{a:2,b:1}]}})],[],{},url);
 assert.equal(a.works[0].hash,b.works[0].hash);assert.notEqual(a.works[0].hash,c.works[0].hash);
});
test('diff reports only changed items and unseen blobs',()=>{
 const previous={works:[{id:'same',hash:'1',version:1,blobs:['old']},{id:'gone',hash:'2',version:1,blobs:['also-old']}],assets:[{id:'asset',hash:'3',version:1,blobs:['old']}]};
 const next={works:[previous.works[0],{id:'new',hash:'4',version:1,blobs:['old','new','new']}],assets:[{id:'asset',hash:'5',version:2,blobs:['old','new','asset-new']}]};
 assert.deepEqual(diffManifest(previous,next),{changedWorks:['new'],removedWorks:['gone'],changedAssets:['asset'],removedAssets:[],newBlobs:['asset-new','new']});
 assert.deepEqual(diffManifest(null,next).changedWorks,['same','new']);assert.deepEqual(diffManifest(next,next).changedWorks,[]);
 // Publishing metadata changes must refresh the local listing even with the same data hash.
 assert.deepEqual(diffManifest(next,{...next,works:next.works.map(item=>({...item,title:'이름 변경'}))}).changedWorks,['same','new']);
});
