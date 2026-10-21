import {el,button} from './dom.js';
import {parseProject} from '../model/project.js';
import {parseCardFile} from '../model/card-file.js';
import {toCloudProject} from '../cloud/cloud-format.js';
import {snapshotLibraryEntry} from '../cloud/shared-assets.js';
const mb=value=>(value/1048576).toFixed(2);
export async function openCloudImport(ctx,{client,blobs,workspace,assetLibrary}){
 if(ctx.closeCloudImport)return;
 const dialog=el('dialog',{id:'cloud-import-dialog',class:'cloud-dialog','aria-labelledby':'cloud-import-title'}),list=el('div',{id:'cloud-import-list',class:'cloud-list'}),totals=el('p',{id:'cloud-import-totals'}),feedback=el('p',{id:'cloud-import-feedback',role:'status'}),progress=el('p',{id:'cloud-import-progress',role:'status'});
 let closed=false,busy=false,prepared=false,attempted=false,owner=null,limit=null,used={cards:0,blob_bytes:0},ownedRefs=new Set(),items=[];
 const check=()=>{if(closed||ctx.cloudAccount?.getProfile()?.id!==owner||!ctx.cloudAccount?.canWrite())throw Error('계정이 바뀌었거나 올리기가 중단됐어요. 완료된 항목은 내 클라우드에 남아 있어요.');};
 const close=()=>{closed=true;if(dialog.open)dialog.close();dialog.remove();ctx.closeCloudImport=null;};ctx.closeCloudImport=close;
 const upload=button('선택 항목 올리기',()=>{void run();},{id:'cloud-import-start',disabled:true,class:'primary'});
 function summary(){
  const selected=items.filter(item=>item.checked&&!item.error),unique=new Map();let cards=used.cards,decks=0;
  for(const item of selected){cards+=item.cards;if(item.type==='work')decks++;for(const [hash,blob] of item.snapshot.blobBytes)if(!ownedRefs.has(hash))unique.set(hash,blob);}
  const bytes=used.blob_bytes+[...unique.values()].reduce((sum,blob)=>sum+blob.bytes.length,0),excess=[];
  if(limit){if(cards>limit.max_cards)excess.push('카드 '+(cards-limit.max_cards)+'장 초과');if(bytes>limit.max_blob_bytes)excess.push('이미지 '+mb(bytes-limit.max_blob_bytes)+' MB 초과');}
  if(decks>50)excess.push('덱 '+(decks-50)+'개 초과 (한 번에 50개)');if(unique.size>2000)excess.push('그림 '+(unique.size-2000)+'개 초과 (한 번에 2,000개)');
  totals.textContent=limit?'카드 '+cards+' / '+limit.max_cards+'장, 이미지 '+mb(bytes)+' / '+mb(limit.max_blob_bytes)+' MB'+(excess.length?' · '+excess.join(' · '):''):'';
  upload.disabled=!prepared||busy||attempted||!selected.length||excess.length>0;return selected;
 }
 function render(){
  if(closed)return;list.replaceChildren(...items.map((item,index)=>el('label',{class:'cloud-row'},el('input',{type:'checkbox',checked:item.checked,disabled:busy||item.done||!!item.error,onchange:event=>{item.checked=event.target.checked;summary();},'aria-label':item.title}),el('span',{},el('strong',{},item.title),el('small',{},({work:'덱·카드',image:'이미지'}[item.type])+(item.cards?' · '+item.cards+'장':'')+(item.done?' · 완료':'')+(item.error?' · '+item.error:''))))));summary();
 }
 async function run(){
  const selected=summary();if(upload.disabled)return;busy=true;attempted=true;render();feedback.textContent='';let done=0,failed=0;
  try{
   check();const run=await client.call('import.begin',{},{expectedUserId:owner});check();if(typeof run.token!=='string'||!run.token)throw Error('올리기 토큰을 받지 못했어요. 다시 로그인하세요.');
   for(const item of selected){
    check();progress.textContent='올리는 중 '+(done+failed+1)+' / '+selected.length+' · '+item.title;
    try{
     await blobs.ensureUploaded(item.snapshot.blobBytes,{expectedUserId:owner,importToken:run.token,onProgress:value=>{if(!closed)progress.textContent='그림 '+value.done+' / '+value.total+' · '+item.title;}});check();
     await client.call(item.type==='image'?'asset.create':'work.create',item.type==='image'?{kind:'image',title:item.title,data:item.snapshot.data,importToken:run.token}:{title:item.title,data:item.snapshot.data,importToken:run.token},{expectedUserId:owner});check();
     item.done=true;item.checked=false;done++;
    }catch(error){if(closed)break;item.error=error.message;failed++;if(error.code==='not-member'||error.status===401)throw error;}
    render();
   }
   if(!closed)progress.textContent='완료 '+done+' / '+selected.length+(failed?' · 실패 '+failed:'');
  }catch(error){if(!closed)feedback.textContent=error.message;}
  finally{busy=false;if(!closed)render();}
 }
 dialog.append(el('h2',{id:'cloud-import-title'},'PC 작업 한 번에 올리기'),el('p',{},'선택한 작업과 그림을 비공개로 올려요. 하루에 한 번 실행할 수 있어요. 저장 폴더의 파일은 유지돼요.'),totals,list,progress,feedback,el('div',{class:'dialog-actions'},upload,button('닫기',close,{id:'cloud-import-close'})));
 dialog.addEventListener('cancel',event=>{event.preventDefault();close();});document.body.append(dialog);dialog.showModal();feedback.textContent='PC 작업을 읽고 있어요…';
 try{
  const profile=ctx.cloudAccount?.getProfile();owner=profile?.id;check();
  const [limits,usage,works,drafts,assets]=await Promise.all([client.select('tier_limits'),client.usage(),client.select('works',{columns:'blob_refs',eq:{owner},is:{deleted_at:null}}),client.select('work_drafts',{columns:'blob_refs',eq:{owner}}),client.select('shared_assets',{columns:'blob_refs',eq:{owner},is:{deleted_at:null}})]);check();
  limit=limits.find(row=>row.tier===profile.status);if(!limit)throw Error('계정의 저장 한도를 읽을 수 없어요. 계정을 새로고침하세요.');used={cards:Number(usage.cards),blob_bytes:Number(usage.blob_bytes)};ownedRefs=new Set([...works,...drafts,...assets].flatMap(row=>row.blob_refs??[]));
  if(!workspace.getState().connected&&workspace.getState().supported){const connected=workspace.getState().folderName?await workspace.resume():await workspace.connect();check();if(!connected)feedback.textContent='폴더 선택을 취소했어요. 브라우저의 이미지 보관함만 표시해요.';}
  if(workspace.getState().connected){
   const groups=[['work',await workspace.list(),entry=>workspace.read(entry),parseProject],['work',await workspace.listCards(),entry=>workspace.readCard(entry),parseCardFile]];
   for(const [type,entries,read,parse] of groups)for(const entry of entries){check();const title=entry.name||entry.fileName;try{if(entry.error)throw Error(entry.error.message);const file=await read(entry);check();const project=parse(file.text??JSON.stringify(file.project)),encoded=await toCloudProject(project);items.push({type,title:project.name||title,cards:project.cards.length,snapshot:{data:encoded.data,blobBytes:encoded.blobs},checked:true});}catch(error){items.push({type,title,cards:0,checked:false,error:error.message});}}
  }
  const library=await (assetLibrary.getLocalLibrary?.()??assetLibrary.getLibrary());check();
  for(const entry of library.entries){const snapshot=await snapshotLibraryEntry(entry);check();items.push({type:'image',title:entry.name,cards:0,snapshot,checked:true});}
  prepared=true;feedback.textContent=items.length?'':'올릴 PC 작업이 없어요. 저장 폴더를 연결하거나 그림 보관함에 이미지를 넣으세요.';render();
 }catch(error){if(!closed)feedback.textContent=error.message;}
}
