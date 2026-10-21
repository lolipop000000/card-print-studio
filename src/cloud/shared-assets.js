import {newId} from '../model/types.js';
import {validateProject} from '../model/project.js';
import {validateCloudAsset} from './server-model.js';
import {remapTemplateResources} from '../model/card-templates.js';
import {createAssetLibrary,createLibraryEntry,parseAssetLibrary,serializeAssetLibrary} from '../model/asset-library.js';
import {toCloudProject,fromCloudProject,toCloudLibraryEntry,fromCloudLibraryEntry,collectBlobRefs} from './cloud-format.js';
const fields={keyword:'keywords',effect_template:'visualEffectPresets',card_template:'cardTemplates'};
function dependencies(project,item,kind){
 const ids=new Set();
 if(kind==='keyword'&&item.iconAssetId)ids.add(item.iconAssetId);
 if(kind==='effect_template')for(const layer of item.recipe.layers)if(layer.params?.assetId)ids.add(layer.params.assetId);
 const assets={},paintings={};
 for(const id of ids){const asset=project.assets[id];if(!asset)throw Error('공유할 에셋에 연결된 그림이 없어요.');assets[id]=structuredClone(asset);if(asset.paintingId){const original=project.paintings[asset.paintingId];if(!original)throw Error('공유할 그림의 편집 원본이 없어요.');paintings[original.id]=structuredClone(original);}}
 return {assets,paintings};
}
export async function snapshotAsset(project,kind,itemId){
 const item=structuredClone(project[fields[kind]]?.find(item=>item.id===itemId));if(!item)throw Error('공유할 에셋을 찾을 수 없어요.');
 let data,blobs;
 if(kind==='card_template'){const encoded=await toCloudProject(item);data={kind,item:encoded.data};blobs=encoded.blobs;}
 else{const encoded=await toCloudProject(dependencies(project,item,kind));data={kind,item,...encoded.data};blobs=encoded.blobs;}
 data.blobs=collectBlobRefs(data);validateCloudAsset(kind,data);return {data,blobBytes:blobs};
}
const uniqueName=(name,items)=>{const names=new Set(items.map(item=>item.name.normalize('NFC')));let next=name,index=1;while(names.has(next)){const suffix=' ('+(++index)+')';next=Array.from(name).slice(0,120-suffix.length).join('')+suffix;}return next;};
export async function applySharedAsset(project,data,fetchBlob){
 validateCloudAsset(data.kind,data);const field=fields[data.kind];if(!field)throw Error('이미지는 내 이미지 보관함에 가져오세요.');
 const decoded=await fromCloudProject(data.kind==='card_template'?data.item:data,fetchBlob),item=structuredClone(data.kind==='card_template'?decoded:decoded.item),resources=remapTemplateResources({...decoded,assets:decoded.assets??{},paintings:decoded.paintings??{}},()=>newId());
 item.id=newId();item.name=uniqueName(item.name,project[field]??[]);
 if(data.kind==='keyword'){if(item.iconAssetId)item.iconAssetId=resources.assetMap.get(item.iconAssetId);}
 else if(data.kind==='effect_template')item.recipe=resources.mapEffect(item.recipe,'any');
 else{
  item.assets=resources.assets;item.paintings=resources.paintings;
  for(const element of item.recipe.elements){if(element.assetId)element.assetId=resources.assetMap.get(element.assetId);if(element.style.visualEffects)element.style.visualEffects=resources.mapEffect(element.style.visualEffects,element.type);}
  for(const skill of item.recipe.skillStyles)if(skill.nameStyle?.visualEffects)skill.nameStyle.visualEffects=resources.mapEffect(skill.nameStyle.visualEffects,'text');
  if(item.recipe.visualEffects)item.recipe.visualEffects=resources.mapEffect(item.recipe.visualEffects,'frame');
 }
 const next={...project,[field]:[...(project[field]??[]),item],...(data.kind==='card_template'?{}:{assets:{...project.assets,...resources.assets},paintings:{...project.paintings,...resources.paintings}})},problems=validateProject(next);
 if(problems.length)throw Error(problems[0].message);Object.assign(project,next);return {newId:item.id};
}
export async function snapshotLibraryEntry(entry){
 const encoded=await toCloudLibraryEntry(entry),data={kind:'image',item:encoded.data,blobs:collectBlobRefs(encoded.data)};validateCloudAsset('image',data);return {data,blobBytes:encoded.blobs};
}
export async function applyLibraryEntry(library,data,fetchBlob){
 validateCloudAsset('image',data);const decoded=await fromCloudLibraryEntry(data.item,fetchBlob),entry=createLibraryEntry(decoded.asset,uniqueName(decoded.name,library.entries)),next={...library,entries:[...library.entries,entry]};serializeAssetLibrary(next);library.entries=next.entries;return {newId:entry.id};
}
export async function decodeLibraryEntry(data,fetchBlob){validateCloudAsset('image',data);const item=await fromCloudLibraryEntry(data.item,fetchBlob);return parseAssetLibrary(JSON.stringify({format:'card-print-studio-assets',version:1,entries:[item]})).entries[0];}
export function createCloudLibraryStorage({cache,pendingCache,client,blobs,owner,isActive=()=>true}){
 let state={mode:'cloud',location:'내 클라우드 보관함',message:null,pending:false},rows=null,disposed=false,queue=Promise.resolve();const listeners=new Set();
 const check=()=>{if(disposed||!isActive())throw Error('계정이 바뀌었어요. 보관함을 다시 불러오세요.');};
 const publish=patch=>{state={...state,...patch};for(const fn of listeners)fn({...state});};
 const enqueue=fn=>{const result=queue.catch(()=>{}).then(fn);queue=result;return result;};
 return {
  getState:()=>({...state}),subscribe(fn){listeners.add(fn);return ()=>listeners.delete(fn);},
  load({discardPending=false}={}){return enqueue(async()=>{
   check();rows=null;
   const pending=await pendingCache?.get();check();
   if(pending&&!discardPending){const library=parseAssetLibrary(pending.text);rows=pending.rows?new Map(pending.rows):null;publish({mode:'error',message:'클라우드에 저장하지 못한 그림을 이 기기에서 복구했어요. 저장 재시도 또는 다시 불러오기를 선택하세요.',pending:true});return library;}
   if(discardPending)await pendingCache?.set(null);
   try{
    const remote=await client.select('shared_assets',{eq:{owner,kind:'image'},is:{deleted_at:null}});check();const library=createAssetLibrary(),map=new Map();
    for(const row of remote){const entry=await decodeLibraryEntry(row.data,hash=>blobs.fetch(hash));check();entry.id='entry-cloud-'+row.id;entry.asset.id='asset-cloud-'+row.id;library.entries.push(entry);map.set(entry.id,row);}
    serializeAssetLibrary(library);await cache.save(library);check();rows=map;publish({mode:'cloud',message:null,pending:false});return library;
   }catch(error){check();const cached=await cache.load();check();publish({mode:'temporary',message:'오프라인 보관함을 열었어요. '+error.message,pending:false});return cached;}
  });},
  save(library){const snapshot=parseAssetLibrary(serializeAssetLibrary(library));return enqueue(async()=>{
   check();await cache.save(snapshot);check();const preserve=()=>pendingCache?.set({text:serializeAssetLibrary(snapshot),rows:rows?[...rows]:null});await preserve();check();publish({pending:true});
   try{
    if(!rows)throw Error('연결을 복구한 뒤 보관함을 다시 불러오세요. 저장하지 못한 그림은 이 기기에 남아 있어요.');
    for(const entry of snapshot.entries){
     const encoded=await snapshotLibraryEntry(entry);check();let row=rows.get(entry.id);
     if(row&&JSON.stringify(row.data)===JSON.stringify(encoded.data))continue;
     await blobs.ensureUploaded(encoded.blobBytes,{expectedUserId:owner});check();
     const result=await client.call(row?'asset.save':'asset.create',row?{id:row.id,data:encoded.data,baseVersion:row.version}:{kind:'image',title:entry.name,data:encoded.data},{expectedUserId:owner});check();
     row={id:row?.id??result.id,owner,kind:'image',title:entry.name,data:encoded.data,version:result.version,visibility:row?.visibility??'private',deleted_at:null};rows.set(entry.id,row);await preserve();check();
    }
    const ids=new Set(snapshot.entries.map(entry=>entry.id));for(const [id,row] of rows)if(!ids.has(id)){await client.call('asset.delete',{id:row.id},{expectedUserId:owner});check();rows.delete(id);}
    await pendingCache?.set(null);check();publish({mode:'cloud',pending:false,message:null});return snapshot;
   }catch(error){if(!disposed)publish({mode:'error',pending:true,message:error.message});throw error;}
  });},
  destroy(){disposed=true;listeners.clear();cache.destroy();}
 };
}
