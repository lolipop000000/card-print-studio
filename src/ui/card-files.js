import {exportCardFile,parseCardFile,importCardFile,cardNameKey} from '../model/card-file.js';
import {loadAssets} from '../model/assets.js';
import {el,button,field,showMessage,typing} from './dom.js';
import {openDialog} from './dialogs.js';
import {download} from './files.js';

export function createCardFileControls({store,workspaceFiles,card,onAdded}){
 const storage=workspaceFiles.storage;let library=null,disposed=false,pendingPrompt=null,adding=false,saving=false;
 async function chooseDuplicate(name,entries,mode){
  let selected=0;
  const action=await openDialog({title:'같은 이름의 카드가 있어요',message:'“'+name+'” '+entries.length+'개가 '+(mode==='save'?'저장 폴더':'현재 덱')+'에 있어요. 덮어쓰기는 선택한 하나를 바꾸고, 추가는 기존 카드를 유지해요.'+(mode==='import'?' 연결된 Variant는 바뀐 원본을 따르고, 불러온 카드는 독립 카드가 돼요.':''),choices:[{id:'overwrite',label:'덮어쓰기'},{id:'add',label:'추가'},{id:'cancel',label:'취소'}],onOpen:dialog=>{
   pendingPrompt=dialog;dialog.id='duplicate-card-dialog';
   const picker=field('덮어쓸 대상','duplicate-card-target','0',value=>{selected=Number(value);},{options:entries.map((entry,index)=>[String(index),entry.label||entry.fileName])});
   dialog.insertBefore(picker,dialog.lastChild);
  }});pendingPrompt=null;
  return disposed?{action:'cancel'}:{action,entry:entries[selected]};
 }
 const input=el('input',{id:'card-file',type:'file',accept:'.card.json,.json',hidden:true,onchange:async event=>{
  const file=event.target.files[0];event.target.value='';if(!file)return;
  const expectedProject=store.getProject();
  try{await add(await file.text(),()=>!disposed,expectedProject);}catch(error){showMessage(error.message);}
 }});
 async function add(text,isCurrent=()=>!disposed,expectedProject=store.getProject()){
  if(adding||disposed)return false;adding=true;
  try{
   if(disposed||!isCurrent())return false;
   if(store.getProject()!==expectedProject)throw Error('카드를 읽는 동안 현재 덱이 바뀌었어요. 다시 불러와 주세요.');
   const incoming=parseCardFile(text);await loadAssets(incoming);if(disposed||!isCurrent())return false;
   if(store.getProject()!==expectedProject)throw Error('카드를 읽는 동안 현재 덱이 바뀌었어요. 다시 불러와 주세요.');
   const before=expectedProject,name=incoming.cards[0].name,matches=before.cards.filter(c=>cardNameKey(c.name)===cardNameKey(name));let replaceCardId=null;
   if(matches.length){
    const choice=await chooseDuplicate(name,matches.map((card,index)=>({id:card.id,label:(index+1)+' · '+(card.kind==='monster'?'몬스터':'아이템')+' · '+card.name+(card.variant?' · '+card.variant.label:'')})),'import');
    if(disposed||!isCurrent()||choice.action==='cancel')return false;
    if(store.getProject()!==before)throw Error('중복 카드를 고르는 동안 현재 덱이 바뀌었어요. 다시 불러와 주세요.');
    if(choice.action==='overwrite')replaceCardId=choice.entry.id;
   }
   let added;const different=incoming.settings.cardWidthMm!==before.settings.cardWidthMm||incoming.settings.cardHeightMm!==before.settings.cardHeightMm;
   store.edit(replaceCardId?'카드 파일 덮어쓰기':'카드 파일 불러오기',draft=>{added=importCardFile(draft,text,{replaceCardId});});onAdded(added.id);
   showMessage((replaceCardId?'선택한 카드를 덮어썼어요.':'카드를 현재 덱에 추가했어요.')+(different?' 크기는 현재 덱에 맞춰 조정했어요.':''),'success');return true;
  }finally{adding=false;}
 }
 async function connected(){return workspaceFiles.ensureConnected();}
 async function save(){
  if(typing(document.activeElement))document.activeElement.blur();
  const current=card();if(!current){showMessage('저장할 카드를 선택하세요.');return;}
  if(saving||disposed)return;saving=true;
  try{
   const text=exportCardFile(store.getProject(),current.id),name=current.name;
   if(!await connected()||disposed)return;
   const result=await storage.saveCard(text,name,{onDuplicate:entries=>disposed?{action:'cancel'}:chooseDuplicate(name,entries,'save')});if(!result||disposed)return;showMessage((result.overwritten?'카드 파일을 덮어썼어요: ':'카드만 저장했어요: ')+result.fileName,'success');
  }catch(error){showMessage(error.message);}finally{saving=false;}
 }
 function exportFile(){
  if(typing(document.activeElement))document.activeElement.blur();const current=card();if(!current)return;
  try{download(exportCardFile(store.getProject(),current.id),(current.name||'카드').replace(/[<>:"/\\|?*\x00-\x1f]/g,'_')+'.card.json','application/json');}catch(error){showMessage(error.message);}
 }
 async function open(){
  if(library||disposed)return;
  const dialog=el('dialog',{id:'card-library',class:'workspace-library','aria-labelledby':'card-library-title'}),list=el('div',{class:'workspace-files'}),feedback=el('p',{role:'status'});library=dialog;
  let listRevision=0;
  const active=()=>!disposed&&library===dialog&&dialog.isConnected&&dialog.open;
  const close=()=>{if(dialog.open)dialog.close();dialog.remove();if(library===dialog)library=null;};
  const folder=button('저장 폴더 선택',async()=>{
   folder.disabled=true;listRevision++;list.replaceChildren();feedback.textContent='저장 폴더를 선택해 주세요.';
   try{
    if(await storage.connect()){if(active())await showFiles();}
    else if(active())feedback.textContent='폴더 선택을 취소했어요. 카드 파일 가져오기로 JSON 파일을 직접 열 수 있어요.';
   }catch(error){if(active())feedback.textContent=error.message+' 카드 파일 가져오기로 JSON 파일을 직접 열 수 있어요.';}
   finally{if(active())folder.disabled=!storage.getState().supported;}
  },{id:'card-import-folder',disabled:!storage.getState().supported});
  dialog.append(el('h2',{id:'card-library-title'},'카드만 불러오기'),el('p',{class:'hint'},'카드 JSON 파일을 직접 선택하거나, 저장 폴더의 작업실 데이터 / 카드에서 가져오세요. 같은 이름은 덮어쓰기·추가를 고르며 Variant도 독립 카드로 가져와요.'),
   el('div',{class:'two-fields'},button('카드 파일 가져오기',()=>{close();input.click();},{id:'card-import-file',class:'primary'}),folder),
   storage.getState().folderName&&!storage.getState().connected?button('기억한 폴더 다시 연결',async()=>{try{if(await storage.resume()&&active())await showFiles();}catch(error){if(active())feedback.textContent=error.message;}},{id:'card-resume-folder'}):null,list,feedback,
   el('div',{class:'dialog-actions'},button('선택 카드 파일 내보내기',()=>exportFile(),{id:'card-export-file'}),button('닫기',close)));
  dialog.addEventListener('cancel',event=>{event.preventDefault();close();});document.body.append(dialog);dialog.showModal();
  if(storage.getState().connected)await showFiles();
  else feedback.textContent=storage.getState().supported?'카드 파일 가져오기는 파일을, 저장 폴더 선택은 폴더를 여는 기능이에요.':'폴더 연결을 지원하지 않는 브라우저예요. 카드 파일 가져오기를 이용하세요.';
  async function showFiles(){
   const revision=++listRevision;list.replaceChildren();feedback.textContent='카드 목록을 읽고 있어요…';
  try{
   const entries=await storage.listCards();if(!active()||revision!==listRevision)return;feedback.textContent=entries.length?'':'저장한 카드가 없어요. 카드만 저장을 눌러 보관하세요.';
   for(const entry of entries)list.append(button(el('span',{},el('strong',{},entry.name),el('small',{},entry.error?entry.error.message:entry.fileName)),async()=>{
    for(const node of list.querySelectorAll('button'))node.disabled=true;
    const expectedProject=store.getProject();
    try{const loaded=await storage.readCard(entry);if(active()&&await add(loaded.text,active,expectedProject))close();}
    catch(error){feedback.textContent=error.message;}
    finally{for(const node of list.querySelectorAll('button'))node.disabled=node.dataset.invalid==='true';}
   },{class:'workspace-file',disabled:!!entry.error,'data-invalid':String(!!entry.error)}));
  }catch(error){if(active()&&revision===listRevision)feedback.textContent=error.message;}
  }
 }
 return {input,save,open,exportFile,importFile:async(file,isCurrent=()=>true)=>{const expectedProject=store.getProject();return add(await file.text(),()=>!disposed&&isCurrent(),expectedProject);},destroy(){disposed=true;pendingPrompt?.dispatchEvent(new Event('cancel',{cancelable:true}));if(library){library.close();library.remove();library=null;}}};
}
