import {createWorkspaceStorage} from '../storage/workspace.js';
import {el,button,showMessage,typing} from './dom.js';
import {confirmReplacement,prepareProjectFile,saveProjectFile} from './files.js';

export function createWorkspaceControls(store,onLoaded,onImportFile){
 const storage=createWorkspaceStorage(),status=el('small',{id:'workspace-status',class:'workspace-status',role:'status'});
 let disposed=false,pendingSave=null,library=null,folderDialog=null;
 const unsubscribe=storage.subscribe(refresh);
 function refresh(){
  const s=storage.getState();
  status.textContent=s.connected?(s.fileName||'새 덱')+' · '+(s.projectsPath||s.cardsPath):s.folderName?'기억한 폴더: '+s.folderName+' · 다시 연결 가능':s.supported?'저장 폴더를 연결해 주세요':'폴더 저장 미지원 · JSON 내보내기 가능';
  status.title=s.error?.message||s.warning||'HTML 폴더에는 작업실 데이터 폴더를 만들고, 데이터 폴더나 그 안쪽을 고르면 중첩 생성하지 않아요.';
 }
 async function ensureConnected(){
  if(storage.getState().connected)return true;
  return storage.getState().folderName?storage.resume():storage.connect();
 }
 async function connect(){
  if(storage.getState().folderName){
   if(folderDialog)return;
   const dialog=el('dialog',{id:'workspace-folder-dialog',class:'workspace-library'});folderDialog=dialog;
   const feedback=el('p',{role:'status'}),close=()=>{if(dialog.open)dialog.close();dialog.remove();if(folderDialog===dialog)folderDialog=null;};
   const run=async action=>{try{if(await action()){close();showMessage('저장 폴더를 연결했어요.','success');}}catch(error){feedback.textContent=error.message;}};
   dialog.append(el('h2',{},'저장 폴더'),el('p',{},'기억한 위치: '+(storage.getState().projectsPath||storage.getState().cardsPath||storage.getState().folderName)),
    button('기억한 폴더 다시 연결',()=>run(()=>storage.resume()),{id:'workspace-resume',class:'primary'}),button('다른 폴더 선택',()=>run(()=>storage.connect()),{id:'workspace-choose-other'}),feedback,button('닫기',close));
   dialog.addEventListener('cancel',event=>{event.preventDefault();close();});document.body.append(dialog);dialog.showModal();return;
  }
  try{if(await storage.connect())showMessage('저장 폴더를 연결했어요. 저장을 누르면 현재 덱을 보관해요.','success');}
  catch(error){showMessage(error.message);}
 }
 function save(){
  if(pendingSave)return pendingSave;
  if(typing(document.activeElement))document.activeElement.blur();
  pendingSave=(async()=>{
   try{
    const state=storage.getState();
    if(!state.supported&&!state.connected){await saveProjectFile(store);showMessage('JSON 파일로 저장했어요. 불러오기에서 다시 열 수 있어요.','success');return !store.isDirty();}
    if(!state.connected&&!state.folderName&&!await ensureConnected())return false;
    const result=await storage.save(store.getProject());
    if(disposed)return false;
    store.markSaved(result.project);
    showMessage('폴더에 저장했어요: '+result.fileName,'success');
    return !store.isDirty();
   }catch(error){showMessage(error.message);return false;}
   finally{pendingSave=null;}
  })();return pendingSave;
 }
 async function load(){
  if(library||disposed)return;
  const dialog=el('dialog',{id:'workspace-library',class:'workspace-library','aria-labelledby':'workspace-library-title'});
  library=dialog;
  const list=el('div',{class:'workspace-files'}),feedback=el('p',{role:'status'});
  let listRevision=0;
  const active=()=>!disposed&&library===dialog&&dialog.isConnected&&dialog.open;
  const close=()=>{if(dialog.open)dialog.close();dialog.remove();if(library===dialog)library=null;};
  const folder=button('저장 폴더 선택',async()=>{
   folder.disabled=true;listRevision++;list.replaceChildren();feedback.textContent='저장 폴더를 선택해 주세요.';
   try{
    if(await storage.connect()){if(active())await showFiles();}
    else if(active())feedback.textContent='폴더 선택을 취소했어요. JSON 파일 선택으로 덱을 직접 열 수 있어요.';
   }catch(error){if(active())feedback.textContent=error.message+' JSON 파일 선택으로 덱을 직접 열 수 있어요.';}
   finally{if(active())folder.disabled=!storage.getState().supported;}
  },{id:'project-import-folder',disabled:!storage.getState().supported});
  dialog.append(el('h2',{id:'workspace-library-title'},'덱 불러오기'),el('p',{class:'hint'},'덱 전체 JSON 파일을 직접 선택하거나, 저장 폴더의 작업실 데이터 / 프로젝트에서 불러오세요.'),
   el('div',{class:'two-fields'},button('JSON 파일 선택',()=>{close();onImportFile();},{id:'project-import-file',class:'primary'}),folder),
   storage.getState().folderName&&!storage.getState().connected?button('기억한 폴더 다시 연결',async()=>{try{if(await storage.resume()&&active())await showFiles();}catch(error){if(active())feedback.textContent=error.message;}},{id:'project-resume-folder'}):null,list,feedback,button('닫기',close));
  dialog.addEventListener('cancel',event=>{event.preventDefault();close();});document.body.append(dialog);dialog.showModal();
  if(storage.getState().connected)await showFiles();
  else feedback.textContent=storage.getState().supported?'JSON 파일 선택은 파일을, 저장 폴더 선택은 폴더를 여는 기능이에요.':'폴더 연결을 지원하지 않는 브라우저예요. JSON 파일 선택으로 덱을 열어 주세요.';
  async function showFiles(){
   const revision=++listRevision;list.replaceChildren();feedback.textContent='파일 목록을 읽고 있어요…';
  try{
   const entries=await storage.list();if(!active()||revision!==listRevision)return;
   feedback.textContent=entries.length?'':'저장된 덱이 없어요. 현재 덱에서 저장을 눌러 보관하세요.';
   for(const entry of entries){
    const action=button(el('span',{},el('strong',{},entry.name),el('small',{},entry.error?entry.error.message:entry.cardCount+'장 · '+entry.fileName)),async()=>{
     for(const b of list.querySelectorAll('button'))b.disabled=true;
     try{
      // Validate assets before asking to replace the current deck. Read again after
      // Save, which may have updated this same file while the confirmation was open.
      let loaded=await storage.read(entry);await prepareProjectFile({text:async()=>loaded.text});
      if(disposed||library!==dialog||!dialog.open)return;
      if(!await confirmReplacement(store,{save}))return;
      const current=store.getProject();if(disposed||library!==dialog||!dialog.open)return;
      loaded=await storage.read(entry);const next=await prepareProjectFile({text:async()=>loaded.text});
      if(disposed||library!==dialog||!dialog.open)return;
      if(store.getProject()!==current)throw Error('불러오는 동안 현재 덱이 바뀌었어요. 다시 선택하세요.');
      store.load(next);storage.bindLoaded(loaded);onLoaded();close();showMessage('폴더에서 덱을 불러왔어요.','success');
     }catch(error){feedback.textContent=error.message;}
     finally{for(const b of list.querySelectorAll('button'))b.disabled=b.dataset.invalid==='true';}
    },{class:'workspace-file',disabled:!!entry.error,'data-invalid':String(!!entry.error)});
    list.append(action);
   }
  }catch(error){if(active()&&revision===listRevision)feedback.textContent=error.message;}
  }
 }
 refresh();storage.restore().catch(error=>{if(!disposed)showMessage(error.message);});
 return {storage,status,save,load,connect,ensureConnected,destroy(){disposed=true;unsubscribe();if(folderDialog){folderDialog.close();folderDialog.remove();folderDialog=null;}if(library){library.close();library.remove();library=null;}}};
}
