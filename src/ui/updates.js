import release from '../../release.json' with {type:'json'};
import {normalizeSource,checkForUpdate,receiveUpdateFile} from '../updates/releases.js';
import {el,button} from './dom.js';
import {saveProjectFile,download as downloadFile} from './files.js';

const KEY='card-print-studio:updates:v1';
export function createUpdateControls({store,onOpen=()=>{},onClose=()=>{}}){
 let settings={sourceUrl:release.sourceUrl||'',autoCheck:false,disconnected:false},storageNote='',dialog=null,view=null,disposed=false,request=null,generation=0,receiving=false,downloadMessage='',downloadKind='idle';
 try{
  const saved=JSON.parse(localStorage.getItem(KEY)||'null');
  if(saved&&typeof saved.sourceUrl==='string'){
   const source=saved.sourceUrl.trim(),disconnected=!source&&saved.disconnected===true;
   settings={sourceUrl:source?normalizeSource(source):disconnected?'':release.sourceUrl||'',autoCheck:!!source&&saved.autoCheck===true,disconnected};
  }
 }
 catch{storageNote='이 브라우저에서 업데이트 설정을 읽지 못했어요. 주소를 다시 입력할 수 있어요.';}
 let state={phase:settings.sourceUrl?'idle':'unconfigured',message:'',result:null,checkedAt:''};
 const action=button('새 버전',open,{id:'studio-updates',title:'작업실 v'+release.version+' · 새 버전 확인과 백업','data-available':'false'});
 function remember(){try{localStorage.setItem(KEY,JSON.stringify(settings));storageNote='';}catch{storageNote='이 브라우저는 업데이트 설정 저장을 허용하지 않아요. 이번에 연 작업실 안에서만 기억해요.';}}
 function stop(){generation++;request?.abort();request=null;receiving=false;}
 function resetDownload(){downloadMessage='';downloadKind='idle';}
 function paint(){
  action.dataset.available=String(state.phase==='available');action.textContent=state.phase==='available'?'새 버전 있음':'새 버전';
  if(!view)return;
  const {status,check,latest,latestVersion,date,notes,download,direct,downloadStatus,storage,checked}=view;
  status.dataset.state=state.phase;
  status.textContent=state.message||({unconfigured:'아직 배포 주소가 연결되지 않았어요. 아래에 새 버전 정보 주소를 입력해 주세요.',idle:'새 버전 확인을 누르면 배포 주소에서 버전 정보를 가져와요.',checking:'새 버전 정보를 확인하고 있어요…',current:'현재 작업실이 최신 버전이에요.',ahead:'현재 작업실이 배포된 버전보다 새로워요.'}[state.phase]||'');
  check.disabled=state.phase==='checking'||receiving;check.textContent=state.phase==='checking'?'확인 중…':'새 버전 확인';
  const found=state.result?.release;latest.hidden=!found;
  if(found){latestVersion.textContent=found.version;date.textContent=found.releasedAt?'배포일 '+found.releasedAt:'배포일 미입력';notes.replaceChildren(...found.notes.map(note=>el('li',{},note)));if(!found.notes.length)notes.append(el('li',{},'배포자가 변경사항을 적지 않았어요.'));}
  download.hidden=state.phase!=='available';if(state.phase==='available')download.href=found.downloadUrl;else download.removeAttribute('href');
  download.textContent=receiving?'새 HTML 받는 중…':'새 버전 HTML 받기';download.setAttribute('aria-disabled',String(receiving));download.setAttribute('aria-busy',String(receiving));
  downloadStatus.textContent=downloadMessage;downloadStatus.dataset.state=downloadKind;downloadStatus.hidden=!downloadMessage;
  direct.hidden=downloadKind!=='error'||state.phase!=='available';if(!direct.hidden)direct.href=found.downloadUrl;else direct.removeAttribute('href');
  storage.textContent=storageNote;storage.hidden=!storageNote;checked.textContent=state.checkedAt?'마지막 확인 '+state.checkedAt:'';
 }
 function clearResult(){stop();resetDownload();state={phase:view?.source.value.trim()?'idle':'unconfigured',message:'',result:null,checkedAt:''};paint();}
 function applySource(){
  const value=view.source.value.trim();settings.sourceUrl=value?normalizeSource(value):'';view.source.value=settings.sourceUrl;settings.disconnected=!settings.sourceUrl;settings.autoCheck=view.auto.checked;remember();
 }
 async function check({fromDialog=false}={}){
  stop();resetDownload();
  if(fromDialog){try{applySource();}catch(error){state={phase:'error',message:error.message,result:null,checkedAt:''};paint();return;}}
  if(!settings.sourceUrl){state={phase:'unconfigured',message:'',result:null,checkedAt:''};paint();return;}
  const ticket=generation,control=new AbortController();request=control;state={phase:'checking',message:'',result:null,checkedAt:''};paint();
  try{
   const result=await checkForUpdate(settings.sourceUrl,{currentVersion:release.version,signal:control.signal});if(disposed||ticket!==generation)return;
   state={phase:result.relation,message:result.relation==='available'?'새 버전 '+result.release.version+'을 받을 수 있어요.':'',result,checkedAt:new Date().toLocaleString('ko-KR')};
  }catch(error){if(disposed||ticket!==generation||error.name==='AbortError')return;state={phase:'error',message:error.message,result:null,checkedAt:''};}
  finally{if(!disposed&&ticket===generation){request=null;paint();}}
 }
 async function receive(){
  if(disposed||receiving||state.phase!=='available')return;
  stop();resetDownload();const ticket=generation,control=new AbortController(),found=state.result.release;request=control;receiving=true;downloadMessage='새 HTML 파일을 받고 있어요…';downloadKind='loading';paint();
  try{
   const blob=await receiveUpdateFile(found,{signal:control.signal});if(disposed||ticket!==generation)return;
   downloadFile(blob,'card-print-studio.html','text/html');downloadMessage='새 HTML을 내려받았어요. 현재 작업을 저장한 뒤 새 파일을 열어 주세요.';downloadKind='success';
  }catch(error){if(disposed||ticket!==generation||error.name==='AbortError')return;downloadMessage=error.message+' 직접 다운로드 주소를 열 수도 있어요.';downloadKind='error';}
  finally{if(!disposed&&ticket===generation){receiving=false;request=null;paint();}}
 }
 function close(){
  if(!dialog)return;const old=dialog;dialog=null;view=null;const wasReceiving=receiving;
  if(request)stop();if(wasReceiving){downloadMessage='파일 받기를 취소했어요. 다시 받을 수 있어요.';downloadKind='idle';}
  if(state.phase==='checking')state={phase:settings.sourceUrl?'idle':'unconfigured',message:'',result:null,checkedAt:''};paint();
  if(old.open)old.close();old.remove();if(!disposed){onClose();action.focus({preventScroll:true});}
 }
 function open(){
  if(disposed||dialog||document.querySelector('dialog[open]'))return;
  dialog=el('dialog',{id:'updates-dialog',class:'update-dialog','aria-labelledby':'updates-title'});
  const source=el('input',{id:'update-source',type:'url',value:settings.sourceUrl,maxLength:2048,placeholder:'https://…/update.json',spellcheck:false,autocomplete:'off',oninput:clearResult});
  const auto=el('input',{id:'update-auto',type:'checkbox',checked:settings.autoCheck,onchange:()=>{
   try{applySource();paint();}catch(error){auto.checked=settings.autoCheck;state={phase:'error',message:error.message,result:null,checkedAt:''};paint();}
  }});
  const status=el('p',{id:'update-status',class:'update-status',role:'status','aria-live':'polite'}),checkButton=button('새 버전 확인',()=>check({fromDialog:true}),{id:'updates-check',class:'primary'});
  const notes=el('ul',{id:'update-notes'}),latestVersion=el('strong',{id:'update-latest-version'}),date=el('small',{}),latest=el('section',{class:'update-latest'},el('div',{class:'update-version-row'},el('span',{},'배포된 버전'),latestVersion,date),notes);
  const download=el('a',{id:'update-download',class:'update-download',target:'_blank',rel:'noopener noreferrer',download:'card-print-studio.html',hidden:true,onclick:event=>{event.preventDefault();void receive();}},'새 버전 HTML 받기');
  const direct=el('a',{id:'update-direct-link',class:'update-direct',target:'_blank',rel:'noopener noreferrer',hidden:true},'직접 다운로드 주소 열기'),downloadStatus=el('p',{id:'update-download-status',class:'hint',role:'status',hidden:true});
  const storage=el('p',{class:'hint',hidden:true}),checked=el('small',{class:'update-checked'}),backupStatus=el('p',{id:'update-backup-status',class:'hint',role:'status'});
  dialog.append(
   el('div',{class:'update-heading'},el('div',{},el('small',{},'PP Monster'),el('h2',{id:'updates-title'},'작업실 업데이트')),button('닫기',close,{id:'updates-close'})),
   el('div',{class:'update-current'},el('div',{},el('span',{},'현재 버전'),el('strong',{id:'update-current-version'},release.version)),el('small',{},release.releasedAt+' 배포')),
   status,checked,latest,download,downloadStatus,direct,
   el('details',{class:'update-history'},el('summary',{},'현재 버전의 변경사항'),el('ul',{},release.notes.map(note=>el('li',{},note)))),
   el('section',{class:'update-source-settings'},el('h3',{},'새 버전 받기 설정'),el('label',{class:'field',htmlFor:'update-source'},el('span',{},'배포자가 안내한 새 버전 정보 주소'),source),
    el('p',{class:'hint'},'확인할 때 이 주소를 기억해요. 버전 정보만 요청하며 카드와 그림은 보내지 않아요.'),el('label',{class:'check',htmlFor:'update-auto'},auto,'작업실을 열 때 새 버전 확인'),el('div',{class:'update-check-row'},checkButton,button('연결 해제',()=>{source.value='';auto.checked=false;clearResult();applySource();paint();},{id:'update-disconnect'})),storage),
   el('section',{class:'update-backup'},el('h3',{},'업데이트 전 작업 보관'),el('p',{},'새 HTML을 기존 작업실 폴더에 넣고 여세요. 기존 작업실 데이터 폴더를 유지하면 저장한 작업을 다시 불러올 수 있어요.'),
    button('현재 덱 백업',async()=>{try{await saveProjectFile(store,{markSaved:false});if(backupStatus.isConnected)backupStatus.textContent='현재 덱을 내려받았어요. 그림 원본·레이어·키워드·이펙트도 포함돼요.';}catch(error){if(backupStatus.isConnected)backupStatus.textContent=error.message;}},{id:'update-backup'}),el('small',{},'지금 열린 덱 하나를 백업해요. 폴더 저장의 미저장 표시는 유지해요.'),backupStatus)
  );
  view={source,auto,status,check:checkButton,latest,latestVersion,date,notes,download,direct,downloadStatus,storage,checked};
  const opened=dialog;opened.addEventListener('cancel',event=>{event.preventDefault();if(dialog===opened)close();});opened.addEventListener('close',()=>{if(dialog===opened)close();});document.body.append(opened);paint();opened.showModal();onOpen();
 }
 return {button:action,checkAtStartup(){if(settings.autoCheck&&settings.sourceUrl)void check();},destroy(){disposed=true;stop();close();}};
}
