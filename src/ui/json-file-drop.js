import {typing} from './dom.js';

/** Import through the same validated routes as the file buttons. */
export function mountJsonFileDrop(root,{onProject,onCard,onError,canDrop=()=>!document.querySelector('dialog[open]'),getContext=()=>null}){
 let disposed=false,busy=false,revision=0;
 const overlay=document.createElement('div');overlay.id='json-file-drop-overlay';overlay.hidden=true;overlay.setAttribute('aria-hidden','true');
 Object.assign(overlay.style,{position:'fixed',inset:'12px',zIndex:'10000',display:'none',placeContent:'center',textAlign:'center',pointerEvents:'none',border:'3px dashed #6fc7a7',borderRadius:'20px',background:'rgba(14,43,35,.92)',color:'#ffffff',font:'600 24px sans-serif',boxShadow:'0 0 0 20px rgba(14,43,35,.2)'});
 const title=document.createElement('strong'),hint=document.createElement('small');title.textContent='JSON 파일 놓기';hint.textContent='덱은 불러오고, 카드 파일은 현재 덱에 추가해요.';Object.assign(hint.style,{marginTop:'12px',font:'400 15px sans-serif'});overlay.append(title,hint);root.append(overlay);root.dataset.jsonDropBusy='false';
 const hasFiles=event=>Array.from(event.dataTransfer?.types??[]).includes('Files')||!!event.dataTransfer?.files?.length;
 function visible(show){overlay.hidden=!show;overlay.style.display=show?'grid':'none';}
 function reset(){visible(false);}
 function drag(event){if(disposed||!hasFiles(event))return;event.preventDefault();if(event.dataTransfer)event.dataTransfer.dropEffect=busy||!canDrop()?'none':'copy';if(!busy&&canDrop())visible(true);}
 function leave(event){if(!event.relatedTarget)reset();}
 async function drop(event){
  if(disposed||!hasFiles(event))return;event.preventDefault();reset();
  if(busy){onError('이전 JSON 파일을 불러오는 중이에요. 완료된 뒤 다시 놓아 주세요.');return;}
  if(!canDrop()){onError('편집 창을 닫은 뒤 JSON 파일을 놓아 주세요.');return;}
  const files=Array.from(event.dataTransfer?.files??[]);
  if(files.length!==1){onError('JSON 파일은 한 번에 하나씩 놓아 주세요.');return;}
  const file=files[0];if(!/\.json$/i.test(file.name)){onError('JSON 파일만 끌어다 놓을 수 있어요. 넣은 파일: '+file.name);return;}
  if(typing(document.activeElement))document.activeElement.blur();
  busy=true;root.dataset.jsonDropBusy='true';const ticket=++revision,context=getContext(),alive=()=>!disposed&&ticket===revision,isCurrent=()=>alive()&&getContext()===context;
  try{
   const text=await file.text();if(!isCurrent())return;
   if(!canDrop())throw Error('편집 창을 닫은 뒤 JSON 파일을 다시 놓아 주세요.');
   let content;try{content=JSON.parse(text);}catch(error){throw Error('“'+file.name+'”의 JSON 내용을 읽지 못했어요: '+error.message);}
   const snapshot={name:file.name,type:file.type,text:async()=>text};
   const canApply=()=>{if(!isCurrent())return false;if(!canDrop())throw Error('편집 창을 닫은 뒤 JSON 파일을 다시 놓아 주세요.');return true;};
   if(content?.format==='card-print-studio')await onProject(snapshot,canApply);
   else if(content?.format==='card-print-studio-card')await onCard(snapshot,canApply);
   else throw Error('지원하지 않는 JSON 형식이에요: '+String(content?.format??'형식 표시 없음')+'. PP Monster의 덱 또는 카드 파일을 넣어 주세요.');
  }catch(error){if(isCurrent())onError(error.message);}
  finally{if(alive()){busy=false;root.dataset.jsonDropBusy='false';reset();}}
 }
 const key=event=>{if(event.key==='Escape')reset();};
 for(const type of ['dragenter','dragover'])document.addEventListener(type,drag,true);
 document.addEventListener('dragleave',leave,true);document.addEventListener('drop',drop,true);document.addEventListener('dragend',reset,true);window.addEventListener('blur',reset);window.addEventListener('keydown',key);
 return {destroy(){if(disposed)return;disposed=true;revision++;for(const type of ['dragenter','dragover'])document.removeEventListener(type,drag,true);document.removeEventListener('dragleave',leave,true);document.removeEventListener('drop',drop,true);document.removeEventListener('dragend',reset,true);window.removeEventListener('blur',reset);window.removeEventListener('keydown',key);overlay.remove();delete root.dataset.jsonDropBusy;}};
}
