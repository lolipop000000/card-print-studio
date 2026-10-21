import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createProject,validateProject} from '../src/model/project.js';
import {createLibraryEntry} from '../src/model/asset-library.js';
import {BLOB_REF_PREFIX,sha256Hex,toCloudProject,fromCloudProject,collectBlobRefs,cloudProjectForValidation,toCloudLibraryEntry,fromCloudLibraryEntry} from '../src/cloud/cloud-format.js';

const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO5EE2cAAAAASUVORK5CYII=';
const other='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLttAAAAABJRU5ErkJggg==';
function fixture(){
 const p=createProject();
 for(const id of ['art','icon','other'])p.assets[id]={id,mime:'image/png',dataUrl:id==='other'?other:png,width:1,height:1,paintingId:null};
 p.cards[0].artAssetId='art';
 p.keywords=[{id:'kw',name:'불',description:'불꽃',color:'#ff5500',iconAssetId:'icon'}];
 p.paintings.drawing={id:'drawing',width:64,height:64,activeLayerId:'layer',layers:[{id:'layer',name:'레이어',visible:true,locked:false,opacity:1,png}]};
 return p;
}
test('round trips a project with art, layers and keyword icons byte-for-byte',async()=>{
 const p=fixture(),{data,blobs}=await toCloudProject(p);
 assert.equal(blobs.size,2);
 assert.equal(JSON.stringify(await fromCloudProject(JSON.parse(JSON.stringify(data)),async hash=>blobs.get(hash).bytes)),JSON.stringify(p));
});
test('replaces every data url with a 64-hex reference',async()=>{
 const {data,blobs}=await toCloudProject(fixture());
 assert.equal(BLOB_REF_PREFIX,'blob:sha256:');
 assert.ok(!JSON.stringify(data).includes('data:image'));
 for(const value of [...Object.values(data.assets).map(a=>a.dataUrl),data.paintings.drawing.layers[0].png])assert.match(value,/^blob:sha256:[0-9a-f]{64}$/);
 assert.deepEqual(collectBlobRefs(data),[...blobs.keys()].sort());
 assert.deepEqual(collectBlobRefs({a:'blob:sha256:bad',b:3}),[]);
});
test('validation copy passes validateProject without pixel bytes',async()=>{
 const {data}=await toCloudProject(fixture()),before=JSON.stringify(data),copy=cloudProjectForValidation(data);
 assert.deepEqual(validateProject(copy),[]);
 assert.equal(copy.assets.art.dataUrl,'data:image/png;base64,AAAA');
 assert.equal(JSON.stringify(data),before);
});
test('fromCloudProject rejects a blob whose hash does not match',async()=>{
 const {data}=await toCloudProject(fixture());
 await assert.rejects(fromCloudProject(data,async()=>new Uint8Array([1,2,3])),/그림 데이터가 손상/);
});
test('does not mutate the input project',async()=>{
 const p=fixture(),before=JSON.stringify(p),{data,blobs}=await toCloudProject(p);
 assert.equal(JSON.stringify(p),before);
 const cloud=JSON.stringify(data);await fromCloudProject(data,async hash=>blobs.get(hash).bytes);
 assert.equal(JSON.stringify(data),cloud);
});
test('hashes bytes with SHA-256 and restores each shared blob only once',async()=>{
 const bytes=new Uint8Array([0,1,255]);
 assert.equal(await sha256Hex(bytes),createHash('sha256').update(bytes).digest('hex'));
 const {data,blobs}=await toCloudProject(fixture()),calls=[];
 await fromCloudProject(data,async hash=>{calls.push(hash);return blobs.get(hash).bytes;});
 assert.equal(calls.length,2);
});
test('round trips an independent library entry without changing its metadata',async()=>{
 const entry=createLibraryEntry(fixture().assets.art,'내 그림'),before=JSON.stringify(entry);
 const {data,blobs}=await toCloudLibraryEntry(entry);
 assert.equal(blobs.size,1);assert.ok(data.asset.dataUrl.startsWith(BLOB_REF_PREFIX));
 assert.equal(JSON.stringify(await fromCloudLibraryEntry(data,async hash=>blobs.get(hash).bytes)),before);
 assert.equal(JSON.stringify(entry),before);
});
test('saved card templates also store and restore their independent artwork',async()=>{
 const p=fixture();p.cardTemplates=[{id:'saved',assets:{art:structuredClone(p.assets.art)},paintings:structuredClone(p.paintings)}];
 const {data,blobs}=await toCloudProject(p);
 assert.ok(!JSON.stringify(data).includes('data:image'));
 assert.equal(cloudProjectForValidation(data).cardTemplates[0].assets.art.dataUrl,'data:image/png;base64,AAAA');
 assert.equal(JSON.stringify(await fromCloudProject(data,async hash=>blobs.get(hash).bytes)),JSON.stringify(p));
});
