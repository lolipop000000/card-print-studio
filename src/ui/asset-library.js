import {createAssetLibrary,createLibraryEntry,parseAssetLibrary,serializeAssetLibrary,ASSET_LIBRARY_LIMITS} from '../model/asset-library.js';
import {createAssetLibraryStorage} from '../storage/asset-library.js';
import {importAsset,decodeImage} from '../model/assets.js';
import {el,button,showMessage} from './dom.js';
import {download} from './files.js';
import {openDialog} from './dialogs.js';
import {openImageCropper} from './image-crop.js';

const MAX_BATCH_PIXELS=32_000_000,MAX_IMAGE_FILES=64;
const cleanName=value=>Array.from(String(value||'그림').normalize('NFC').replace(/[\x00-\x1f\x7f]/g,' ').replace(/\.(png|jpe?g|webp)$/i,'').trim()||'그림').slice(0,120).join('');
const fileName=value=>cleanName(value).replace(/[<>:"/\\|?*]/g,'_');
const canceled=()=>Object.assign(Error('에셋 작업이 취소되었어요.'),{code:'canceled'});
const bytes=asset=>Uint8Array.from(atob(asset.dataUrl.split(',')[1]),character=>character.charCodeAt(0));

export function createAssetLibraryControls(ctx,{workspace}={}){
 const storage=createAssetLibraryStorage({workspace});
 let library=createAssetLibrary(),loaded=false,dirty=false,disposed=false,busy=false,selected=null,session=null,lastError=null,prompt=null,cropDialog=null;
 const trigger=button('에셋 보관함',()=>{void open();},{id:'asset-library',title:'그림을 자르고 여러 덱에서 함께 사용해요.'});
 const active=origin=>!disposed&&(!origin||session===origin&&origin.dialog.open);
 const guard=origin=>{if(!active(origin))throw canceled();};
 const selectedEntry=()=>library.entries.find(entry=>entry.id===selected);
 function errorMessage(error){lastError=error?.message||'에셋 작업을 완료하지 못했어요.';if(session)session.feedback.textContent=lastError;else if(!disposed)showMessage(lastError);}
 function refreshStatus(){
  if(!session)return;const value=storage.getState(),mode=dirty?(value.mode==='error'?'error':'temporary'):value.mode;
  session.status.dataset.mode=mode;session.status.textContent=(busy?'작업 중…':dirty?'변경사항 저장 필요':value.mode==='disk'?'폴더 저장됨':value.mode==='error'?'저장 오류':'브라우저 임시 보관')+' · '+(value.location||'브라우저');
  session.storageNote.textContent=value.message||'보관함에서 삭제해도 카드에 이미 적용한 그림은 유지돼요.';
  session.dialog.dataset.busy=String(busy);session.dialog.setAttribute('aria-busy',String(busy));
  for(const node of session.dialog.querySelectorAll('[data-asset-action]'))node.disabled=busy||(node.dataset.needsLoaded==='true'&&!loaded)||(node.dataset.needsSelection==='true'&&!selectedEntry())||(node.dataset.needsApply==='true'&&typeof ctx.applyLibraryAsset!=='function');
  session.resume.hidden=!workspace?.getState?.().folderName;session.connect.disabled=busy||!workspace?.getState?.().supported;
 }
 const unsubscribe=storage.subscribe(refreshStatus),unsubscribeWorkspace=workspace?.subscribe?.(refreshStatus);
 async function perform(action){
  if(disposed||busy)return false;busy=true;refreshStatus();
  try{return await action();}catch(error){if(disposed||error?.code==='canceled')return false;errorMessage(error);throw error;}finally{busy=false;if(!disposed)refreshStatus();}
 }
 const ui=action=>()=>{void perform(action).catch(()=>{});};
 function acceptLibrary(result,selectFirst=false){
  // Shared read/save completion also serves a newly opened manager. Its caller
  // still checks the original session before any further import/crop mutation.
  guard();library=result;loaded=true;dirty=storage.getState().pending===true;lastError=null;if(selectFirst||!selectedEntry())selected=library.entries[0]?.id??null;render();
 }
 async function loadLibrary(options,origin){
  guard(origin);const result=await storage.load(options);acceptLibrary(result,true);guard(origin);return true;
 }
 async function ensureLoaded(origin){
  guard(origin);return loaded?true:loadLibrary(undefined,origin);
 }
 async function persist(origin){
  guard(origin);dirty=true;refreshStatus();const result=await storage.save(library);acceptLibrary(result);guard(origin);return true;
 }
 function uniqueName(name,used){
  const base=cleanName(name);let value=base,index=1;
  while(used.has(value.normalize('NFC').toLocaleLowerCase())){const suffix=' ('+(++index)+')';value=Array.from(base).slice(0,120-suffix.length).join('')+suffix;}
  used.add(value.normalize('NFC').toLocaleLowerCase());return value;
 }
 async function append(items,origin){
  guard(origin);await ensureLoaded(origin);guard(origin);
  if(!Array.isArray(items)||items.length===0)return false;
  if(items.length+library.entries.length>ASSET_LIBRARY_LIMITS.entries)throw Error('보관함은 최대 512개예요. 추가할 그림 개수를 줄이세요.');
  if(items.reduce((sum,item)=>sum+(item?.asset?.width||0)*(item?.asset?.height||0),0)>MAX_BATCH_PIXELS)throw Error('한 번에 추가하는 그림은 전체 3,200만 픽셀 이하로 나누어 주세요.');
  const used=new Set(library.entries.map(entry=>entry.name.normalize('NFC').toLocaleLowerCase())),entries=items.map(item=>createLibraryEntry(item.asset,uniqueName(item.name,used)));
  const next={...library,entries:[...library.entries,...entries]};serializeAssetLibrary(next);guard(origin);library=next;selected=entries[0].id;dirty=true;render();return persist(origin);
 }
 function addAssets(items){return perform(()=>append(items));}
 async function confirm(title,message,label,origin){
  const choice=await openDialog({title,message,choices:[{id:'yes',label},{id:'cancel',label:'취소'}],onOpen:dialog=>{prompt=dialog;}});prompt=null;guard(origin);return choice==='yes';
 }
 function finish(value=null){
  const current=session;if(!current)return;session=null;prompt?.dispatchEvent(new Event('cancel',{cancelable:true}));prompt=null;cropDialog?.dispatchEvent(new Event('cancel',{cancelable:true}));cropDialog=null;
  if(current.dialog.open)current.dialog.close();current.dialog.remove();current.resolve(value);if(current.previousFocus?.isConnected)current.previousFocus.focus({preventScroll:true});if(!disposed)ctx.refresh?.();
 }
 function renderList(){
  const current=session;if(!current)return;const query=current.search.value.normalize('NFC').toLocaleLowerCase(),entries=library.entries.filter(entry=>entry.name.normalize('NFC').toLocaleLowerCase().includes(query));
  current.list.replaceChildren(...entries.map(entry=>button(el('span',{},el('span',{class:'asset-thumbnail'},el('img',{src:entry.asset.dataUrl,alt:'',loading:'lazy'})),el('strong',{},entry.name),el('small',{},entry.asset.width+' × '+entry.asset.height+' px')),()=>{selected=entry.id;render();},{class:'asset-entry'+(entry.id===selected?' selected':''),'data-asset-id':entry.asset.id,'data-entry-id':entry.id,'data-asset-action':'','aria-pressed':String(entry.id===selected)})));
  if(!entries.length)current.list.append(el('p',{class:'empty-note'},library.entries.length?'검색한 그림이 없어요.':'그림을 가져오거나 원본을 잘라 보관하세요.'));current.count.textContent=library.entries.length+'개';refreshStatus();
 }
 function renderDetails(){
  const current=session;if(!current)return;const entry=selectedEntry();current.details.replaceChildren();
  if(!entry){current.details.append(el('p',{class:'empty-note'},'목록에서 사용할 그림을 선택하세요.'));return;}
  const action=(label,run,id,extra={})=>button(label,ui(run),{id,'data-asset-action':'','data-needs-selection':'true',...extra});
  const name=el('input',{id:'asset-name',value:entry.name,maxLength:120,'data-asset-action':''});
  current.details.append(el('div',{class:'asset-preview'},el('img',{src:entry.asset.dataUrl,alt:entry.name})),el('p',{class:'hint'},entry.asset.width+' × '+entry.asset.height+' px · '+entry.asset.mime.replace('image/','').toUpperCase()),el('label',{class:'field',htmlFor:'asset-name'},el('span',{},'그림 이름'),name),
   action('이름 변경',async()=>{guard(current);const value=name.value.normalize('NFC').trim();if(library.entries.some(other=>other.id!==entry.id&&other.name.toLocaleLowerCase()===value.toLocaleLowerCase()))throw Error('이미 있는 그림 이름이에요. 다른 이름을 입력하세요.');const next={...library,entries:library.entries.map(other=>other.id===entry.id?{...other,name:value}:other)};serializeAssetLibrary(next);library=next;dirty=true;render();await persist(current);},'asset-rename'),
   el('div',{class:'asset-action-row'},action('영역 자르기 / 시트',async()=>{
    guard(current);await decodeImage(entry.asset.dataUrl);guard(current);const observer=new MutationObserver(()=>{const node=document.getElementById('image-cropper');if(node){cropDialog=node;if(!active(current))node.dispatchEvent(new Event('cancel',{cancelable:true}));}});observer.observe(document.body,{childList:true});
    try{const results=await openImageCropper({asset:entry.asset,name:entry.name});guard(current);if(results?.length)await append(results,current);}finally{observer.disconnect();cropDialog=null;}
   },'asset-crop'),action('삭제',async()=>{if(!await confirm('그림을 보관함에서 삭제할까요?','카드·이펙트·키워드에 이미 복사한 그림은 유지돼요.','에셋 삭제',current))return;library={...library,entries:library.entries.filter(other=>other.id!==entry.id)};selected=library.entries[0]?.id??null;dirty=true;render();await persist(current);},'asset-delete',{class:'danger'})),
   el('div',{class:'asset-action-row'},action('PNG 받기',async()=>{
    let blob;if(entry.asset.mime==='image/png')blob=new Blob([bytes(entry.asset)],{type:'image/png'});else{const image=await decodeImage(entry.asset.dataUrl);guard(current);const canvas=el('canvas',{width:entry.asset.width,height:entry.asset.height});canvas.getContext('2d').drawImage(image,0,0);blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!blob)throw Error('PNG 파일을 만들지 못했어요.');}guard(current);download(blob,fileName(entry.name)+'.png','image/png');
   },'asset-download'),action('원본 받기',()=>{guard(current);download(new Blob([bytes(entry.asset)],{type:entry.asset.mime}),fileName(entry.name)+'.'+({'image/png':'png','image/jpeg':'jpg','image/webp':'webp'}[entry.asset.mime]),entry.asset.mime);},'asset-download-original')));
  if(current.pick)current.details.append(action('이 그림 선택',()=>finish(createLibraryEntry(entry.asset,entry.name).asset),'asset-choose',{class:'primary wide'}));
  else current.details.append(el('div',{class:'asset-apply-actions'},...['art','element'].map(mode=>action(mode==='art'?'카드 그림으로 사용':'새 이미지 요소로 추가',()=>{guard(current);if(ctx.applyLibraryAsset?.(createLibraryEntry(entry.asset,entry.name).asset,{mode})===true)finish();else throw Error('그림을 적용할 카드나 요소를 다시 선택하세요.');},mode==='art'?'asset-use-art':'asset-use-element',{'data-needs-apply':'true',class:mode==='art'?'primary':''}))));
 }
 function render(){if(!session)return;renderList();renderDetails();session.feedback.textContent=lastError||'';refreshStatus();}
 function open({pick=false,title}={}){
  if(disposed)return Promise.resolve(null);if(session){session.dialog.focus();return Promise.resolve(null);}
  let resolve;const result=new Promise(done=>resolve=done),dialog=el('dialog',{id:'asset-library-dialog',class:'asset-library-dialog','aria-labelledby':'asset-library-title',tabIndex:-1});
  const current={dialog,resolve,pick,previousFocus:document.activeElement};session=current;
  const toolbarButton=(label,run,id,attrs={})=>button(label,ui(run),{id,'data-asset-action':'',...attrs});
  current.feedback=el('p',{id:'asset-library-feedback',class:'asset-feedback',role:'alert'});current.status=el('p',{id:'asset-library-status',class:'asset-storage-status',role:'status'});current.storageNote=el('p',{class:'hint'});current.count=el('small');current.list=el('div',{class:'asset-list'});current.details=el('section',{class:'asset-details','aria-label':'선택한 그림'});
  let composing=false;current.search=el('input',{id:'asset-search',type:'search',placeholder:'그림 이름 검색','aria-label':'그림 이름 검색',oncompositionstart:()=>{composing=true;},oncompositionend:()=>{composing=false;renderList();},oninput:event=>{if(!composing&&!event.isComposing)renderList();}});
  const files=el('input',{id:'asset-files',type:'file',accept:'image/png,image/jpeg,image/webp',multiple:true,hidden:true,'data-asset-action':'',onchange:event=>{
   const batch=[...event.target.files];event.target.value='';void perform(async()=>{
    if(!batch.length)return false;if(batch.length>MAX_IMAGE_FILES)throw Error('이미지 파일은 한 번에 최대 64개씩 가져오세요.');if(batch.some(file=>file.size>ASSET_LIBRARY_LIMITS.assetBytes)||batch.reduce((sum,file)=>sum+file.size,0)>ASSET_LIBRARY_LIMITS.totalBytes)throw Error('그림당 20 MB, 한 번에 전체 64 MB 이하로 나누어 가져오세요.');
    const items=[];let pixels=0;for(const file of batch){guard(current);const asset=await importAsset(file);guard(current);pixels+=asset.width*asset.height;if(pixels>MAX_BATCH_PIXELS)throw Error('한 번에 가져오는 그림은 전체 3,200만 픽셀 이하로 나누세요.');items.push({asset,name:file.name});}return append(items,current);
   }).catch(()=>{});
  }});
  const json=el('input',{id:'asset-library-file',type:'file',accept:'.json,application/json',hidden:true,'data-asset-action':'',onchange:event=>{
   const file=event.target.files[0];event.target.value='';void perform(async()=>{if(!file)return false;if(file.size>96*1024*1024)throw Error('보관함 JSON은 최대 96 MB까지 가져올 수 있어요.');const text=await file.text();guard(current);const imported=parseAssetLibrary(text);return append(imported.entries.map(entry=>({asset:entry.asset,name:entry.name})),current);}).catch(()=>{});
  }});
  current.resume=toolbarButton('기억한 폴더 다시 연결',async()=>{if(!workspace?.resume)throw Error('연결할 저장 폴더가 없어요.');const connected=await workspace.resume();guard(current);if(connected)current.feedback.textContent='폴더를 연결했어요. 현재 목록은 유지돼요. 다시 불러오기 또는 저장 재시도를 선택하세요.';},'asset-resume');
  current.connect=toolbarButton('저장 폴더 선택',async()=>{if(!workspace?.connect)throw Error('이 브라우저에서는 폴더 연결을 지원하지 않아요. 보관함 JSON으로 공유하세요.');const connected=await workspace.connect();guard(current);current.feedback.textContent=connected?'폴더를 연결했어요. 다시 불러오기를 눌러 이 폴더의 보관함을 확인하세요.':'폴더 선택을 취소했어요. 현재 보관함을 유지해요.';},'asset-connect');
  dialog.append(el('header',{class:'asset-library-top'},el('div',{},el('h2',{id:'asset-library-title'},title||(pick?'에셋에서 그림 선택':'에셋 보관함')),el('p',{class:'hint'},'이미지를 자르고 보관해 여러 덱에서 함께 사용해요.')),button('닫기',()=>finish(),{id:'asset-library-close'})),
   el('div',{class:'asset-library-toolbar'},toolbarButton('그림 가져오기',()=>files.click(),'asset-import',{'data-needs-loaded':'true',class:'primary'}),toolbarButton('보관함 JSON 가져오기',()=>json.click(),'asset-import-json',{'data-needs-loaded':'true'}),toolbarButton('보관함 JSON 내보내기',()=>{guard(current);download(serializeAssetLibrary(library),'asset-library.json','application/json');},'asset-export-json',{'data-needs-loaded':'true'})),
   el('section',{class:'asset-storage'},current.status,current.storageNote,el('div',{class:'asset-action-row'},current.resume,current.connect,toolbarButton('다시 불러오기',async()=>{
    if((dirty||storage.getState().pending)&&!await confirm('현재 보관함을 다시 불러올까요?','저장하지 못한 보관함 변경을 버리고 저장된 목록을 열어요. 필요하면 먼저 JSON으로 내보내세요.','다시 불러오기',current))return;
    return loadLibrary({discardPending:true},current);
   },'asset-reload'),toolbarButton('저장 재시도',async()=>{await ensureLoaded(current);return persist(current);},'asset-retry'))),
   el('div',{class:'asset-library-grid'},el('section',{class:'asset-browser'},el('div',{class:'asset-search-row'},current.search,current.count),current.list),current.details),current.feedback,files,json);
  dialog.addEventListener('cancel',event=>{event.preventDefault();if(session===current)finish();});dialog.addEventListener('close',()=>{if(session===current)finish();});document.body.append(dialog);render();dialog.showModal();if(!loaded)void perform(()=>ensureLoaded(current)).catch(()=>{});return result;
 }
 return {button:trigger,open,addAssets,destroy(){if(disposed)return;disposed=true;finish();unsubscribe();unsubscribeWorkspace?.();storage.destroy();trigger.remove();}};
}
