import {exportCardFile,parseCardFile,cardNameKey} from '../model/card-file.js';
import {parseProject} from '../model/project.js';
import {toCloudProject} from '../cloud/cloud-format.js';
import {el,button,showMessage,typing} from './dom.js';
import {openDialog} from './dialogs.js';

/** Upload an independent card without binding or replacing the open deck. */
export function createCloudCardUpload(ctx,{client,blobs,account}){
 let disposed=false,busy=false,prompt=null,authEpoch=0,identity;
 const selected=button('카드 올리기',()=>{void uploadSelected();},{id:'upload-card',title:'선택한 카드 한 장을 내 자료에 비공개로 올려요.','data-cloud-export':true});
 const json=button('JSON 카드 올리기',()=>{
  if(busy||disposed)return;
  try{requireMember();input.click();}catch(error){showMessage(error.message);}
 },{id:'upload-card-json',title:'카드 또는 프로젝트 JSON에서 카드 한 장을 골라 올려요.'});
 const input=el('input',{id:'cloud-card-file',type:'file',accept:'.card.json,.json,application/json',hidden:true,onchange:()=>{
  const file=input.files?.[0];input.value='';if(file)void uploadFile(file);
 }});
 const cancelPrompt=()=>prompt?.dispatchEvent(new Event('cancel',{cancelable:true}));
 const stopAuth=client.onAuthChange?.(auth=>{
  const next=auth?.user.id??null;
  if(identity!==undefined&&next!==identity){authEpoch++;cancelPrompt();}identity=next;
 });
 function requireMember(){
  if(!client.availability.available)throw Error(client.availability.reason==='file'?'웹 주소에서 열면 카드를 클라우드에 올릴 수 있어요.':'클라우드 연결 설정이 없어 카드를 올릴 수 없어요.');
  if(!account.getProfile())throw Error('에셋 보관함의 내 계정 설정에서 Google로 로그인한 뒤 카드를 올려주세요.');
  if(!account.canWrite())throw Error('관리자 승인 후 카드를 올릴 수 있어요.');
 }
 async function ask(options){
  try{return await openDialog({...options,onOpen:dialog=>{prompt=dialog;options.onOpen?.(dialog);}});}
  finally{prompt=null;}
 }
 async function cardFromFile(file,check){
  let value;try{value=JSON.parse(await file.text());}catch{throw Error('JSON 파일을 읽을 수 없어요. 카드 또는 프로젝트 JSON을 선택하세요.');}
  await check();
  if(value?.format==='card-print-studio-card')return parseCardFile(JSON.stringify(value));
  const project=parseProject(JSON.stringify(value));
  if(!project.cards.length)throw Error('이 JSON에는 올릴 카드가 없어요.');
  let cardId=project.cards[0].id;
  if(project.cards.length>1){
   const choice=el('select',{id:'cloud-card-choice','aria-label':'올릴 카드'},project.cards.map(card=>el('option',{value:card.id},card.name||'이름 없는 카드')));
   const result=await ask({title:'올릴 카드 선택',message:'파일에 '+project.cards.length+'장이 있어요. 내 자료에 올릴 한 장을 선택하세요. 현재 덱은 그대로 유지돼요.',choices:[{id:'upload',label:'이 카드 올리기'},{id:'cancel',label:'취소'}],onOpen:dialog=>{dialog.id='cloud-card-choose-dialog';dialog.querySelector('.dialog-actions').before(el('label',{},'올릴 카드 ',choice));}});
   await check();if(result!=='upload')return null;cardId=choice.value;
  }
  return parseCardFile(exportCardFile(project,cardId));
 }
 async function duplicate(project,owner,check){
  const title=cardNameKey(project.cards[0].name)||'이름 없는 카드';
  if(Array.from(title).length>120||/[\x00-\x1f\x7f]/.test(title))throw Error('카드 이름은 줄바꿈 없는 1~120자로 정한 뒤 올려주세요.');
  const rows=await client.select('works',{columns:'id,title,card_count,visibility,version',eq:{owner},is:{deleted_at:null}});await check();
  // The open cloud deck keeps its own version and draft lifecycle.
  const matches=rows.filter(row=>row.card_count===1&&row.id!==ctx.cloudSession.state().workId&&cardNameKey(row.title)===title);
  if(!matches.length)return {title};
  const choice=el('select',{id:'cloud-card-overwrite-target','aria-label':'덮어쓸 카드'},matches.map(row=>el('option',{value:row.id},row.title+' · '+(row.visibility==='public'?'공개':'비공개')+' · 버전 '+row.version)));
  const result=await ask({title:'같은 이름의 카드가 있어요',message:'덮어쓰면 해당 자료의 내용과 초안을 바꾸고 공개 상태를 유지해요. 새 카드로 추가하면 비공개로 저장해요.',choices:[{id:'overwrite',label:'덮어쓰기'},{id:'add',label:'새 카드로 추가'},{id:'cancel',label:'취소'}],onOpen:dialog=>{dialog.id='cloud-card-duplicate';if(matches.length>1)dialog.querySelector('.dialog-actions').before(el('label',{},'덮어쓸 카드 ',choice));}});
  await check();return result==='cancel'?null:{title,...(result==='overwrite'?{existing:matches.find(row=>row.id===choice.value)}:{})};
 }
 async function run(source){
  if(disposed||busy)return false;
  if(typing(document.activeElement))document.activeElement.blur();
  busy=true;selected.disabled=json.disabled=true;
  const documentId=ctx.store.getDocumentId(),token=authEpoch;
  let owner;
  const check=async()=>{
   const auth=await client.session();
   if(disposed)throw Error('카드 올리기가 중단됐어요.');
   if(token!==authEpoch||auth?.user.id!==owner||account.getProfile()?.id!==owner)throw Error('업로드 중 계정이 바뀌어 카드 올리기를 중단했어요. 다시 로그인한 뒤 올려주세요.');
   if(ctx.store.getDocumentId()!==documentId)throw Error('업로드 중 덱이 바뀌어 카드 올리기를 중단했어요. 올릴 카드를 다시 선택하세요.');
   requireMember();
  };
  try{
   await account.whenReady();requireMember();
   owner=(await client.session())?.user.id;if(identity===undefined)identity=owner??null;await check();
   const project=await source(check);await check();if(!project)return false;
   const target=await duplicate(project,owner,check);if(!target)return false;
   showMessage('카드와 그림을 올리고 있어요…','info');
   const encoded=await toCloudProject(project);await check();
   await blobs.ensureUploaded(encoded.blobs,{expectedUserId:owner});await check();
   const result=await client.call(target.existing?'work.save':'work.create',target.existing?{id:target.existing.id,baseVersion:target.existing.version,data:encoded.data}:{title:target.title,data:encoded.data},{expectedUserId:owner});await check();
   showMessage('“'+target.title+'” 카드를 '+(target.existing?'덮어썼어요.':'내 자료에 비공개로 올렸어요.')+' 에셋 보관함 → 내 자료에서 볼 수 있어요.','success');return result;
  }catch(error){if(!disposed)showMessage(error.code==='conflict'?'다른 곳에서 이 카드를 먼저 수정했어요. 서버 카드를 덮어쓰지 않았어요. 카드 올리기를 다시 눌러 새 카드로 추가하거나 최신 버전에 덮어쓰세요.':error.message);return false;}
  finally{busy=false;selected.disabled=json.disabled=false;}
 }
 function uploadSelected(){
  if(disposed||busy)return Promise.resolve(false);
  if(typing(document.activeElement))document.activeElement.blur();
  const snapshot=ctx.store.getProject(),cardId=ctx.card()?.id;
  return run(()=>{if(!cardId)throw Error('카드 목록에서 올릴 카드를 선택하세요.');return parseCardFile(exportCardFile(snapshot,cardId));});
 }
 function uploadFile(file){return run(check=>cardFromFile(file,check));}
 return {selected,json,input,uploadSelected,uploadFile,destroy(){disposed=true;cancelPrompt();stopAuth?.();input.remove();}};
}
