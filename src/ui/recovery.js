import {createRecoverySession} from '../storage/recovery.js';
import {el,button,showMessage} from './dom.js';
import {confirmReplacement,prepareProjectFile} from './files.js';
import {openDialog} from './dialogs.js';

export function createRecoveryControls({store,save,onRestored}){
 let disposed=false,dialog=null,dismissed=false;
 const status=el('small',{id:'recovery-status',class:'recovery-status',role:'status'}),noticeText=el('span'),notice=el('div',{id:'recovery-notice',class:'recovery-notice',hidden:true},noticeText,button('복구본 보기',()=>open()),button('닫기',()=>{dismissed=true;notice.hidden=true;},{'aria-label':'복구 안내 닫기'}));
 const trigger=button('작업 복구',()=>open(),{id:'work-recovery',title:'이 브라우저에 임시 보관한 덱을 복구해요.'});
 const session=createRecoverySession(store,{onChange:refresh});
 function refresh(state){
  trigger.textContent='작업 복구'+(state.candidateCount?' ('+state.candidateCount+')':'');
  status.textContent=state.status==='saving'?'복구본 보관 중…':state.status==='saved'?'임시 보관 '+new Date(state.updatedAt).toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit',second:'2-digit'}):state.status==='error'?'자동 복구 보관 실패':'자동 복구 대기';
  status.dataset.state=state.status;status.title=state.error||'변경한 덱과 적용한 그림·레이어·키워드를 이 브라우저에 임시 보관해요. 원본 파일 저장은 저장 버튼을 사용하세요.';
  notice.hidden=dismissed||!state.candidateCount;noticeText.textContent='이전에 보관한 작업 '+state.candidateCount+'개가 있어요.';
 }
 async function open(){
  if(disposed||dialog)return;
  const current=el('dialog',{id:'recovery-library',class:'workspace-library','aria-labelledby':'recovery-title'}),list=el('div',{class:'workspace-files'}),feedback=el('p',{role:'status'});dialog=current;
  const active=()=>!disposed&&dialog===current&&current.open;
  const close=()=>{if(current.open)current.close();current.remove();if(dialog===current)dialog=null;};
  current.append(el('h2',{id:'recovery-title'},'작업 복구'),el('p',{class:'hint'},'최근 수정한 덱을 이 브라우저에 임시 보관해요. 복구하면 미저장 상태로 열리며, 원본 파일을 자동으로 덮어쓰지 않아요. 그림·이펙트 편집 창에서는 적용한 내용이 보관돼요.'),list,feedback,
   button('현재 작업 임시 보관 재시도',async()=>{try{await session.flush();feedback.textContent='임시 보관했어요.';}catch(error){feedback.textContent=error.message;}},{id:'recovery-retry'}),button('닫기',close));
  current.addEventListener('cancel',event=>{event.preventDefault();close();});document.body.append(current);current.showModal();await showList();
  async function showList(){
   feedback.textContent='복구본을 읽고 있어요…';list.replaceChildren();
   try{const entries=await session.list();if(!active())return;feedback.textContent=entries.length?'':'이전에 보관한 복구본이 없어요. 카드 내용을 수정하면 자동으로 보관해요.';
    for(const entry of entries){
     const restore=button(el('span',{},el('strong',{},entry.error?'읽을 수 없는 복구본':entry.project.name),el('small',{},new Date(entry.updatedAt).toLocaleString('ko-KR')+' · '+(entry.error?entry.error:entry.project.cards.length+'종 카드'))),async()=>{
      const before=store.getProject();restore.disabled=true;
      try{
       const loaded=await session.read(entry.id),next=await prepareProjectFile({text:async()=>loaded.text});if(!active())return;
       if(store.getProject()!==before)throw Error('복구본을 읽는 동안 현재 덱이 바뀌었어요. 다시 선택하세요.');
       if(!await confirmReplacement(store,{save})||!active())return;
       if(store.getProject()!==before)throw Error('복구 중 현재 덱이 바뀌었어요. 다시 선택하세요.');
       if((await session.read(entry.id)).text!==loaded.text)throw Error('다른 창에서 복구본이 갱신되었어요. 목록을 다시 열고 선택하세요.');
       if(!active())return;if(store.getProject()!==before)throw Error('복구 중 현재 덱이 바뀌었어요. 다시 선택하세요.');store.load(next,{dirty:true});onRestored();dismissed=true;notice.hidden=true;close();showMessage('작업을 복구했어요. 저장을 눌러 파일에 보관하세요.','success');
      }catch(error){if(active())feedback.textContent=error.message;}finally{if(active())restore.disabled=!!entry.error;}
     },{class:'workspace-file recovery-file',disabled:!!entry.error,'data-recovery-id':entry.id});
     list.append(el('div',{class:'recovery-entry'},restore,button('삭제',async()=>{
      if(await openDialog({title:'복구본을 삭제할까요?',message:'선택한 임시 복구본만 삭제해요. 저장한 JSON 파일은 유지돼요.',choices:[{id:'remove',label:'삭제'},{id:'cancel',label:'취소'}]})!=='remove'||!active())return;
      try{await session.remove(entry.id);if(active())await showList();}catch(error){if(active())feedback.textContent=error.message;}
     },{class:'danger recovery-delete'})));
    }
   }catch(error){if(active())feedback.textContent=error.message;}
  }
 }
 const flush=()=>{session.flush().catch(()=>{});},visibility=()=>{if(document.visibilityState==='hidden')flush();};
 window.addEventListener('pagehide',flush);document.addEventListener('visibilitychange',visibility);refresh(session.getState());
 return {button:trigger,status,notice,session,destroy(){disposed=true;session.destroy();window.removeEventListener('pagehide',flush);document.removeEventListener('visibilitychange',visibility);if(dialog){dialog.close();dialog.remove();dialog=null;}}};
}
