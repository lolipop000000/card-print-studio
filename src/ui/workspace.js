import {createWorkspaceStorage} from '../storage/workspace.js';
import {el,button,showMessage,typing} from './dom.js';
import {confirmReplacement,prepareProjectFile} from './files.js';

export function createWorkspaceControls(store,onLoaded){
 const storage=createWorkspaceStorage(),status=el('small',{id:'workspace-status',class:'workspace-status',role:'status'});
 let disposed=false,pendingSave=null,library=null;
 const unsubscribe=storage.subscribe(refresh);
 function refresh(){
  const s=storage.getState();
  status.textContent=s.connected?(s.fileName||'새 덱')+' · '+s.folderName+'/작업실 데이터/프로젝트':s.folderName?'저장 폴더 권한을 다시 허용해 주세요':s.supported?'저장 폴더를 연결해 주세요':'폴더 저장 미지원 · JSON 내보내기 가능';
  status.title=s.error?.message||s.warning||'HTML이 있는 폴더를 선택하면 그 안의 작업실 데이터 폴더에 저장해요.';
 }
 async function ensureConnected(){
  if(storage.getState().connected)return true;
  return storage.connect();
 }
 async function connect(){
  try{if(await storage.connect())showMessage('저장 폴더를 연결했어요. 저장을 누르면 현재 덱을 보관해요.','success');}
  catch(error){showMessage(error.message);}
 }
 function save(){
  if(pendingSave)return pendingSave;
  if(typing(document.activeElement))document.activeElement.blur();
  pendingSave=(async()=>{
   try{
    const state=storage.getState();
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
  if(library)return;
  try{if(!await ensureConnected())return;}catch(error){showMessage(error.message);return;}
  if(disposed)return;
  const dialog=el('dialog',{id:'workspace-library',class:'workspace-library','aria-labelledby':'workspace-library-title'});
  library=dialog;
  const list=el('div',{class:'workspace-files'}),feedback=el('p',{role:'status'},'파일 목록을 읽고 있어요…');
  const close=()=>{if(dialog.open)dialog.close();dialog.remove();if(library===dialog)library=null;};
  dialog.append(el('h2',{id:'workspace-library-title'},'저장 폴더에서 불러오기'),el('p',{class:'hint'},'작업실 데이터 / 프로젝트 안의 덱을 선택하세요.'),list,feedback,button('닫기',close));
  dialog.addEventListener('cancel',event=>{event.preventDefault();close();});document.body.append(dialog);dialog.showModal();
  try{
   const entries=await storage.list();if(!dialog.isConnected)return;
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
  }catch(error){feedback.textContent=error.message;}
 }
 refresh();storage.restore().catch(error=>{if(!disposed)showMessage(error.message);});
 return {storage,status,save,load,connect,destroy(){disposed=true;unsubscribe();if(library){library.close();library.remove();library=null;}}};
}
