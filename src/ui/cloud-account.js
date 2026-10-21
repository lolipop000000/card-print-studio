import {el,button,showMessage} from './dom.js';
import {cloudAvailability} from '../cloud/config.js';

export function createCloudAccountControls(ctx,{client,session}){
 const node=el('div',{id:'cloud-account',class:'cloud-account'}),badge=el('span',{id:'cloud-account-status'}),saveState=el('small',{id:'cloud-save-state',role:'status'});
 const feedback=el('small',{class:'cloud-notice',role:'status'}),nicknameButton=button('닉네임 변경',()=>openNickname(),{id:'cloud-edit-nickname'});
 let profile=null,loggedIn=false,disposed=false,generation=0,dialog=null,notified=false,resolving=false,ready=false;
 const readyWaiters=new Set();
 function releaseReady(){ready=true;for(const resolve of readyWaiters)resolve();readyWaiters.clear();}
 const conflict=el('span',{id:'cloud-conflict',class:'cloud-notice',hidden:true},'다른 곳에서 먼저 저장했어요. 서버 내용을 불러오면 현재 편집을 교체해요. ',button('서버 내용 불러오기',()=>resolve('load-server'),{id:'cloud-conflict-load'}),button('현재 내용을 사본으로 저장',()=>resolve('save-as-copy'),{id:'cloud-conflict-copy'}));
 async function resolve(choice){if(resolving)return;resolving=true;render();try{await session.resolveConflict(choice);}catch(error){showMessage(error.message);}finally{resolving=false;render();}}
 const availability=client.availability??cloudAvailability(globalThis.location,client.config);
 const signIn=button('Google 로그인',async()=>{try{await client.signIn();await refresh();}catch(error){showMessage(error.message);}},{id:'cloud-sign-in'});
 const signOut=button('로그아웃',async()=>{try{await client.signOut();session.setIdentity(null);await refresh();}catch(error){showMessage(error.message);}},{id:'cloud-sign-out'});
 const refreshButton=button('계정 새로고침',()=>refresh(),{id:'cloud-account-refresh'});
 const importOffer=el('span',{id:'cloud-import-offer',class:'cloud-notice',hidden:true},'PC 작업이 있다면 한 번에 옮길 수 있어요. ',button('PC 작업 올리기',()=>{dismissImport();void ctx.openCloudImport();},{id:'cloud-import-proposal'}),button('나중에',()=>dismissImport(),{'aria-label':'PC 작업 올리기 안내 닫기'}));
 function dismissImport(){try{localStorage.setItem('cloud-import-offered:'+profile?.id,'true');}catch{}importOffer.hidden=true;}
 node.append(badge,signIn,signOut,nicknameButton,refreshButton,saveState,feedback,conflict,importOffer);
 function render(){
  if(disposed)return;
  const state=session.state();saveState.dataset.state=state.status;
  conflict.hidden=state.status!=='conflict';for(const control of conflict.querySelectorAll('button'))control.disabled=resolving;
  saveState.textContent=({'draft-saving':'저장 중',saving:'저장 중','draft-saved':'초안 저장됨',saved:'확정 저장됨',error:'실패 · 다시 시도',conflict:'다른 곳에서 먼저 저장됨','read-only':'클라우드 저장 중지 · 읽기 전용'})[state.status]??'';
  saveState.title=state.error?.message??'';
  if(state.hasUnsavedDraft&&state.status==='draft-saved')saveState.textContent+=' · 공개본과 다름';
  const enabled=availability.available;
  let offered=false;try{offered=localStorage.getItem('cloud-import-offered:'+profile?.id)==='true';}catch{}
  importOffer.hidden=!enabled||!loggedIn||!['trial','member'].includes(profile?.status)||offered;
  signIn.hidden=!enabled||loggedIn;signOut.hidden=!enabled||!loggedIn;nicknameButton.hidden=!enabled||!profile||!['trial','member'].includes(profile.status);refreshButton.hidden=!enabled;
  if(!enabled){badge.textContent=availability.reason==='file'?'웹 주소에서 열면 클라우드를 쓸 수 있어요':'클라우드 설정을 기다리고 있어요';return;}
  const label=({pending:'승인 대기 중',trial:'준멤버',member:'멤버',revoked:'승인 해제 · 읽기 전용'})[profile?.status]??'로그인';
  badge.textContent=(profile?.nickname?profile.nickname+' · ':'')+label;
  feedback.textContent=state.error?.code==='account-changed'?state.error.message:state.status==='read-only'?'클라우드 저장이 중지됐어요. 편집 내용은 이 기기에 남아 있어요.':profile&&['pending','revoked'].includes(profile.status)?'관리자 승인 후 저장과 공유를 쓸 수 있어요.':'';
 }
 async function refresh(){
  const token=++generation;ready=false;delete node.dataset.refreshed;
  try{
   if(!availability.available){render();return;}
   const auth=await client.session();if(disposed||token!==generation)return;session.setIdentity(auth?.user.id??null);
   const next=auth?await client.myProfile():null;if(disposed||token!==generation)return;
   loggedIn=!!auth;profile=next;
   if(profile&&['pending','revoked'].includes(profile.status))session.setReadOnly();
   else if(profile&&['trial','member'].includes(profile.status))session.resumeWrites();
   render();
   if(loggedIn&&profile?.nickname===null&&['trial','member'].includes(profile.status))openNickname();
  }catch(error){if(!disposed&&token===generation)feedback.textContent=error.message;}
  finally{if(!disposed&&token===generation){node.dataset.refreshed='true';releaseReady();}}
 }
 function openNickname(){
  if(disposed||dialog||!profile)return;
  const owner=profile.id,current=el('dialog',{id:'cloud-nickname-dialog',class:'cloud-dialog','aria-labelledby':'cloud-nickname-title'}),input=el('input',{id:'cloud-nickname',value:profile.nickname??'',autocomplete:'off',maxLength:40}),errorText=el('p',{role:'status'});
  dialog=current;
  const close=()=>{if(current.open)current.close();current.remove();if(dialog===current)dialog=null;};
  const save=button('닉네임 저장',async()=>{
   save.disabled=true;
   try{await client.call('profile.setNickname',{nickname:input.value.normalize('NFC').trim()});if(disposed||dialog!==current||profile?.id!==owner)return;close();await refresh();}
   catch(error){if(dialog===current)errorText.textContent=error.message;}finally{save.disabled=false;}
  },{id:'cloud-nickname-save'});
  current.append(el('h2',{id:'cloud-nickname-title'},'공개할 닉네임'),el('p',{},'다른 친구에게는 닉네임만 보여요. 2~20자로 입력하세요.'),el('label',{htmlFor:'cloud-nickname'},'닉네임'),input,errorText,save,button('나중에',close));
  current.addEventListener('cancel',event=>{event.preventDefault();close();});document.body.append(current);current.showModal();input.focus();
 }
 const stopSession=session.onChange(render),stopAuth=client.onAuthChange(()=>refresh());render();void refresh();
 return {
  node,refresh,whenReady:()=>ready?Promise.resolve():new Promise(resolve=>readyWaiters.add(resolve)),getProfile:()=>profile?{...profile}:null,
  canWrite:()=>availability.available&&loggedIn&&['trial','member'].includes(profile?.status),
  isCloudSaveActive:()=>availability.available&&loggedIn&&['trial','member'].includes(profile?.status)&&session.state().status!=='read-only',
  notifyLocalSave(){if(!notified&&profile&&['pending','revoked'].includes(profile.status)){notified=true;node.append(el('small',{id:'cloud-local-notice',class:'cloud-notice'},'관리자 승인 전에는 기존 파일 저장을 사용해요.'));}},
  destroy(){disposed=true;generation++;releaseReady();stopAuth();stopSession();if(dialog){dialog.close();dialog.remove();dialog=null;}node.remove();}
 };
}
