import test from 'node:test';
import assert from 'node:assert/strict';

let model;try{model=await import('../src/model/asset-library.js');}catch(error){if(error.code!=='ERR_MODULE_NOT_FOUND')throw error;}
const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO5EE2cAAAAASUVORK5CYII=';
const asset=()=>({id:'project-art',mime:'image/png',dataUrl:png,width:1,height:1,paintingId:'editable-original',privateDrawing:{layers:[]}});
const library=()=>({...model.createAssetLibrary(),entries:[model.createLibraryEntry(asset(),'원본 그림')]});

test('shared asset library model exports its complete public API',()=>{
 for(const name of ['createAssetLibrary','parseAssetLibrary','serializeAssetLibrary','createLibraryEntry'])assert.equal(typeof model?.[name],'function',name);
});
test('library JSON round trips independent flattened rasters without project references',()=>{
 if(!model)return;const original=asset(),entry=model.createLibraryEntry(original,'  바다  '),other=model.createLibraryEntry(original,'바다');
 assert.equal(entry.name,'바다');assert.notEqual(entry.id,other.id);assert.notEqual(entry.asset.id,other.asset.id);assert.notEqual(entry.asset.id,original.id);assert.notEqual(entry.id,entry.asset.id);
 assert.deepEqual(Object.keys(entry.asset).sort(),['dataUrl','height','id','mime','paintingId','width']);assert.equal(entry.asset.paintingId,null);assert.equal(original.paintingId,'editable-original');
 const value={...model.createAssetLibrary(),entries:[entry]},loaded=model.parseAssetLibrary(model.serializeAssetLibrary(value));assert.deepEqual(loaded,value);
 loaded.entries[0].name='다른 이름';loaded.entries[0].asset.width=9;assert.equal(value.entries[0].name,'바다');assert.equal(original.width,1);
});
test('malformed versions, duplicate identifiers and painting references are rejected',()=>{
 if(!model)return;assert.throws(()=>model.parseAssetLibrary('{'),/JSON/);
 for(const change of [v=>v.format='card-print-studio',v=>v.version=2,v=>v.entries={},v=>v.entries[0].name=' ',v=>v.entries[0].createdAt='yesterday',v=>v.entries[0].asset.paintingId='project-only',v=>v.entries.push(structuredClone(v.entries[0])),v=>v.entries[0].asset.id=v.entries[0].id]){
  const value=library();change(value);assert.throws(()=>model.parseAssetLibrary(JSON.stringify(value)));assert.throws(()=>model.serializeAssetLibrary(value));
 }
});
test('image dimensions, MIME, base64, and bounded allocation limits are checked before use',()=>{
 if(!model)return;
 for(const change of [a=>a.width=0,a=>a.height=1.5,a=>a.width=9000,a=>{a.width=8192;a.height=8192;},a=>a.mime='image/svg+xml',a=>a.dataUrl='data:image/jpeg;base64,AA==',a=>a.dataUrl='data:image/png;base64,###',a=>a.dataUrl='data:image/png;base64,AA==',a=>a.width=2]){
  const value=library();change(value.entries[0].asset);assert.throws(()=>model.parseAssetLibrary(JSON.stringify(value)));
 }
 const many=library();many.entries=Array.from({length:513},(_,i)=>({...many.entries[0],id:'entry-'+i,asset:{...many.entries[0].asset,id:'asset-'+i}}));assert.throws(()=>model.serializeAssetLibrary(many),/512/);
});
test('invalid entry input never changes the source image',()=>{
 if(!model)return;const original=asset(),snapshot=structuredClone(original);assert.throws(()=>model.createLibraryEntry({...original,width:-1},'잘못된 그림'));assert.deepEqual(original,snapshot);
 assert.throws(()=>model.createLibraryEntry(original,'x'.repeat(121)),/120/);
});
