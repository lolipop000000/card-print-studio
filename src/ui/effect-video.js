import {el,button} from './dom.js';
import {clone} from '../model/types.js';
import {getEffectFrameSec} from '../model/visual-effects.js';
import {renderCard} from '../render/card.js';
import {createEffectCache} from '../render/effects/composite.js';
import {renderEffectVideo} from '../render/effect-video.js';
import {effectPreviewDpi} from './effect-preview.js';

export function openEffectVideo({project,target,assets,startTimeSec=0,playbackTarget=null,frozenTimeSec=getEffectFrameSec(project),onClose=()=>{}}){
 const snapshot=clone(project),card=clone(target),images=new Map(assets),selection=playbackTarget?clone(playbackTarget):null;
 const start=Number.isFinite(startTimeSec)?Math.max(0,startTimeSec):0;
 const controller=new AbortController(),cache=createEffectCache(),canvas=document.createElement('canvas'),previousFocus=document.activeElement;
 const {cardWidthMm,cardHeightMm}=snapshot.settings,dpi=effectPreviewDpi({widthMm:cardWidthMm,heightMm:cardHeightMm,printQuality:true});
 canvas.width=Math.round(cardWidthMm*dpi/25.4);canvas.height=Math.round(cardHeightMm*dpi/25.4);
 let closed=false,url=null;
 const dialog=el('dialog',{id:'effect-video-viewer',class:'effect-video-dialog','aria-labelledby':'effect-video-title','data-state':'preparing','data-selected-only':String(!!selection)});
 const progress=el('progress',{id:'effect-video-progress',max:1,value:0,'aria-label':'고화질 영상 준비 진행률'});
 const status=el('p',{id:'effect-video-status',role:'status'},'6초 분량을 고화질로 준비하고 있어요. 0%');
 const video=el('video',{id:'effect-video-player',hidden:true,controls:true,muted:true,playsInline:true,loop:true,'aria-label':'6초 고화질 이펙트 영상'});
 const closeButton=button('준비 취소',close,{id:'effect-video-close'});
 const loop=el('input',{type:'checkbox',checked:true,onchange:()=>video.loop=loop.checked});
 const controls=el('label',{class:'check',hidden:true},loop,'반복 재생');
 dialog.append(el('header',{},el('h2',{id:'effect-video-title'},'고화질 6초 보기'),closeButton),
  el('p',{class:'hint'},start.toFixed(2)+'초부터 6초 · '+dpi+'dpi · '+(selection?'선택 대상만 재생':'전체 이펙트 재생')),
  status,progress,el('div',{class:'effect-video-screen'},video),controls);
 function close(){
  if(closed)return;closed=true;controller.abort();clearTimeout(timer);video.pause();video.removeAttribute('src');video.load();
  if(url)URL.revokeObjectURL(url);url=null;cache.clear();images.clear();canvas.width=canvas.height=1;
  if(dialog.open)dialog.close();dialog.remove();if(previousFocus?.isConnected)previousFocus.focus({preventScroll:true});onClose();
 }
 dialog.addEventListener('cancel',event=>{event.preventDefault();event.stopPropagation();close();});dialog.addEventListener('close',close);
 video.addEventListener('loadeddata',()=>{
  if(closed)return;dialog.dataset.state='ready';video.hidden=false;progress.hidden=true;controls.hidden=false;closeButton.textContent='닫기';
  status.textContent='준비 완료 · 6초 · 30fps · '+video.videoWidth+' × '+video.videoHeight;
  video.play().catch(()=>{if(!closed)status.textContent='준비 완료 · 영상의 재생 버튼을 눌러 주세요.';});
 });
 function failed(message){if(closed)return;dialog.dataset.state='error';status.textContent=message;progress.hidden=true;closeButton.textContent='닫기';}
 video.addEventListener('error',()=>failed('준비한 영상을 이 브라우저에서 재생하지 못했어요. 최신 Chrome 또는 Edge에서 열어 주세요.'));
 async function prepare(){
  try{
   const blob=await renderEffectVideo({canvas,signal:controller.signal,startTimeSec:start,onProgress:value=>{
    if(closed)return;progress.value=value;status.textContent='6초 분량을 고화질로 준비하고 있어요. '+Math.floor(value*100)+'%';
   },renderFrame:timeSec=>renderCard(canvas.getContext('2d',{willReadFrequently:false}),snapshot,card,images,dpi,{timeSec,playbackTarget:selection,frozenTimeSec,effectCache:cache})});
   if(closed)return;url=URL.createObjectURL(blob);video.src=url;
  }catch(error){if(error.name!=='AbortError')failed(error.message);}
  finally{cache.clear();images.clear();canvas.width=canvas.height=1;}
 }
 document.body.append(dialog);dialog.showModal();const timer=setTimeout(prepare,0);return close;
}
