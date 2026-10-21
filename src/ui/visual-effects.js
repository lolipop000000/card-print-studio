import {el,button,field,preserveFocus} from './dom.js';
import {openDialog} from './dialogs.js';
import {clone,newId} from '../model/types.js';
import {importAsset,decodeImage} from '../model/assets.js';
import {VISUAL_EFFECT_PRESETS,createVisualEffects,validateVisualEffects,readTargetEffects,writeTargetEffects,readTargetTextColor,writeTargetTextColor,saveVisualEffectPreset,removeVisualEffectPreset,getEffectFrameSec,upgradeVisualEffects} from '../model/visual-effects.js';
import {createVisualEffectsForTarget} from '../model/effect-emission.js';
import {renderCard} from '../render/card.js';
import {createEffectCache,renderVisualEffects} from '../render/effects/composite.js';
import {makeSurface} from '../render/effects/masks.js';
import {getBloomAccelerationStatus} from '../render/effects/gpu-bloom.js';
import {getEffectAccelerationStatus} from '../render/effects/gpu-runtime.js';
import {createEffectTimeline,syncEffectTimeInput} from './effect-timeline.js';
import {renderVisualEffectFields} from './visual-effect-fields.js';
import {mountEffectTransform} from './effect-transform.js';
import {mountEffectPreview} from './effect-preview.js';
import {readTargetTextStyle,writeTargetTextStyle} from '../model/text-style.js';
import {textStyleFields} from './text-style-fields.js';
import {syncSkillElements} from '../render/templates.js';
import {getTextRanges,textFieldForElement} from '../model/text-ranges.js';
import {resolveSkillEffect} from '../model/skill-references.js';
import {openImageCropper} from './image-crop.js';
import {packSpriteSheet} from '../model/sprite-sheet.js';
import {openEffectVideo} from './effect-video.js';

function targetLabel(card,e,index){
 const b=e.binding;
 if(b?.field==='name')return '카드 이름 · '+card.name;
 if(b?.field==='hp')return 'HP';
 if(b?.field==='art')return '카드 그림';
 if(b?.field==='item.effect')return '아이템 효과 설명';
 if(b?.skillId){
  const passive=card.passives?.find(s=>s.id===b.skillId),skill=passive||card.actives?.find(s=>s.id===b.skillId);
  return (passive?'패시브':'액티브')+' · '+(skill?.name||'이름 없음')+' · '+(b.field==='skill.name'?'제목 전체':'설명');
 }
 return ({text:'자유 글자',image:'그림',effect:'독립 장식'})[e.type]+' '+(e.content?.slice(0,20)||index+1);
}
export function openVisualEffectsEditor(ctx,initialTarget){
 if(document.getElementById('effect-editor'))return ctx.closeVisualEffects;
 const p=ctx.store.getProject(),documentId=ctx.store.getDocumentId(),card=initialTarget.back?p.back:p.cards.find(c=>c.id===initialTarget.cardId);
 const targets=[...(!initialTarget.back?[['','카드 프레임']]:[]),...card.elements.filter(e=>['text','image','effect'].includes(e.type)).map((e,i)=>[e.id,targetLabel(card,e,i)])];
 const definitions=new Map(targets.map(([value])=>[value,{cardId:initialTarget.cardId,back:!!initialTarget.back,elementId:value||null}]));
 if(!initialTarget.back)for(const skill of [...(card.passives||[]),...(card.actives||[])]){
  let value='skill-name:'+skill.id;while(definitions.has(value))value='_'+value;
  definitions.set(value,{cardId:card.id,back:false,elementId:null,skillId:skill.id});targets.push([value,'이름만 · '+(skill.name||'이름 없음')]);
 }
 for(const [index,element] of card.elements.entries()){
  const info=textFieldForElement(card,element);if(!info)continue;
  const resolved=info.field==='effect'&&info.owner!==card?resolveSkillEffect(card,info.owner):null;
  const text=resolved?.text??info.owner[info.field]??'',ranges=resolved?.textRanges?.[info.field]??getTextRanges(info.owner,info.field);
  for(const range of ranges){
    let value='text-range:'+element.id+':'+range.id;while(definitions.has(value))value='_'+value;
   definitions.set(value,{cardId:initialTarget.cardId,back:!!initialTarget.back,elementId:element.id,textRangeId:range.id});
   targets.push([value,'선택 글자 · “'+text.slice(range.start,range.end)+'” · '+targetLabel(card,element,index)]);
  }
 }
 const targetValue=t=>[...definitions].find(([,d])=>t.textRangeId?d.textRangeId===t.textRangeId&&d.elementId===t.elementId:t.skillId?d.skillId===t.skillId:!d.skillId&&!d.textRangeId&&d.elementId===(t.elementId||null))?.[0];
 const initialValue=targetValue(initialTarget);
 const initialFrame=getEffectFrameSec(p),drafts=new Map(),past=[],future=[];
 const stagedAssets=new Map(),stagedImages=new Map(),assetNames=new Map(),previewAssets=new Map(ctx.assets);let pendingImage=null,pendingImports=0;
 const imageFile=el('input',{id:'effect-sprite-file',type:'file',hidden:true,accept:'image/png,image/jpeg,image/webp',onchange:importSpriteImage});
 let target={...initialTarget},targetType,currentKey,textColor,textStyle,recipe,selected,savedId=null,presetName='',draftFrame=initialFrame,disposed=false,confirming=false,confirmation=null,previewProject,previewTarget,comparisonProject,comparisonTarget,comparing=false,unsubscribe,timer,librarySearch='',libraryCategory='all',libraryComposing=false,transform,previewView,lastDpi=0,renderGeometry=null;
 const cache=createEffectCache(),dialog=el('dialog',{id:'effect-editor',class:'effect-dialog','aria-labelledby':'effect-title'});
 let closeVideo=null;
 const library=el('aside',{class:'effect-library'}),fields=el('aside',{class:'effect-controls'}),canvas=el('canvas',{id:'effect-preview','aria-label':'선택한 대상과 카드의 이펙트 미리보기'});
 const feedback=el('p',{id:'effect-feedback',class:'effect-feedback',role:'status',hidden:true});
 const status=el('span',{id:'effect-preview-status',role:'status','data-busy':'false'},'미리보기');
 const quality=el('input',{id:'effect-print-quality',type:'checkbox',onchange:()=>scheduleDraw()});
 const selectedPlayback=el('input',{id:'effect-selected-playback',type:'checkbox',checked:true,onchange:()=>{cache.clear();draw();}});
 const sampleCache=new Map(),sampleObserver=new IntersectionObserver(entries=>{for(const entry of entries)if(entry.isIntersecting){sampleObserver.unobserve(entry.target);paintSample(entry.target);}},{root:library,rootMargin:'100px'});
 const time=el('input',{id:'effect-time',type:'range',min:0,max:6,step:.01,value:initialFrame,'aria-label':'미리보기 시간 (초)',oninput:event=>{timeline.pause();timeline.seek(Number(event.target.value));updateTransport();}});
 const timeLabel=el('output',{htmlFor:'effect-time'}),frameLabel=el('span',{id:'effect-frame-label'});
 const play=button('재생',()=>{timeline.isPlaying()?timeline.pause():timeline.play();updateTransport();},{id:'effect-play','aria-pressed':false});
 const timeline=createEffectTimeline({initialSec:initialFrame,reducedMotion:matchMedia('(prefers-reduced-motion: reduce)').matches,onFrame:()=>{draw();updateTransport();},onStateChange:playing=>{if(!playing&&!disposed)scheduleDraw();}});
 const targetPicker=field('효과를 붙일 대상','effect-target',initialValue,value=>switchTarget(value),{options:targets});
 const undoButton=button('↶ 실행 취소',()=>moveHistory(false),{id:'effect-undo',disabled:true,onpointerdown:event=>{if(pendingControl())event.preventDefault();},title:'Ctrl+Z / ⌘Z'});
 const redoButton=button('↷ 다시 실행',()=>moveHistory(true),{id:'effect-redo',disabled:true,onpointerdown:event=>{if(pendingControl())event.preventDefault();},title:'Ctrl+Shift+Z / Ctrl+Y / ⌘⇧Z'});
 const zoom=field('확대','effect-preview-zoom','1',value=>setZoom(value),{options:[['0.5','50%'],['0.75','75%'],['1','100%'],['1.5','150%'],['2','200%'],['3','300%'],['4','400%'],['6','600%'],['8','800%']]});
 const compare=button('원본 비교 · 누르기',()=>{},{id:'effect-compare','aria-pressed':false,title:'누르는 동안 선택한 대상의 이펙트를 빼고 봅니다. 저장 내용은 바뀌지 않아요.',onpointerdown:event=>{event.preventDefault();showOriginal(true);},onpointerup:()=>showOriginal(false),onpointercancel:()=>showOriginal(false),onkeydown:event=>{if([' ','Enter'].includes(event.key)){event.preventDefault();showOriginal(true);}},onkeyup:event=>{if([' ','Enter'].includes(event.key)){event.preventDefault();showOriginal(false);}},onblur:()=>showOriginal(false)});
 const focus=button('선택 대상 확대',()=>{setZoom('2');const e=previewTarget.elements.find(e=>target.skillId?e.binding?.field==='skill.name'&&e.binding.skillId===target.skillId:e.id===target.elementId),rect=renderGeometry?.rect??e?.rect;if(!rect)return;const viewport=canvas.parentElement,scale=canvas.getBoundingClientRect().width/p.settings.cardWidthMm;viewport.scrollTo({left:canvas.offsetLeft+(rect.x+rect.w/2)*scale-viewport.clientWidth/2,top:canvas.offsetTop+(rect.y+rect.h/2)*scale-viewport.clientHeight/2});},{id:'effect-focus-target'});
 function setZoom(value){previewView?.setZoom(value);}
 function showOriginal(value){if(disposed||comparing===value)return;comparing=value;compare.setAttribute('aria-pressed',value);draw();}
 function releaseComparison(){showOriginal(false);}
 function paintSample(canvas){
  const key=canvas.dataset.sampleKey;
  if(!sampleCache.has(key)){
   const surface=makeSurface({x:0,y:0,w:38,h:16},80),r=createVisualEffects(key,{seed:31515});r.layers.forEach((layer,i)=>layer.id='sample-'+key+'-'+i);
   surface.ctx.fillStyle='#fffdf8';surface.ctx.fillRect(0,0,38,16);
   renderVisualEffects(surface.ctx,{recipe:r,target:'text',assets:previewAssets,dpi:80,rect:{x:4,y:5,w:30,h:6},timeSec:1.2,source:{key:'sample-'+key,draw:c=>{c.font='700 4px CardStudio,sans-serif';c.fillStyle='#243c38';c.fillText('카드의 힘',4,10);return {fontPt:11.34};}}});
   sampleCache.set(key,surface.canvas);
  }
  const image=sampleCache.get(key);canvas.width=image.width;canvas.height=image.height;canvas.getContext('2d').drawImage(image,0,0);canvas.dataset.ready='true';
 }
 function remember(){
  if(!recipe)return;
  const d=drafts.get(currentKey);Object.assign(d,{recipe,color:textColor,style:textStyle,selected,savedId,presetName:document.getElementById('effect-preset-name')?.value??presetName});
 }
 function pendingControl(){
  const active=document.activeElement;
  return fields.contains(active)&&active.matches('input[type="number"],input[type="color"]')&&active.value!==active.dataset.effectCommitted?active:null;
 }
 function updateHistoryControls(){
  const pending=!!pendingControl();undoButton.disabled=!past.length&&!pending;redoButton.disabled=!future.length||pending;
 }
 function snapshot(){remember();return {key:currentKey,frame:draftFrame,drafts:clone([...drafts])};}
 function editDraft(change){
  const control=pendingControl(),before=snapshot();change();const after=snapshot();
  if(control)control.dataset.effectCommitted=control.value;
  recordEdit(before,after);
 }
 function recordEdit(before,after=snapshot()){
  if(JSON.stringify(before)!==JSON.stringify(after)){
   past.push({before,after});if(past.length>100)past.shift();future.length=0;
  }
  updateHistoryControls();
 }
 function restoreSnapshot(state){
  timeline.pause();releaseComparison();const frameChanged=draftFrame!==state.frame;
  drafts.clear();for(const [key,draft] of clone(state.drafts))drafts.set(key,draft);
  draftFrame=state.frame;activate(state.key);
  targetPicker.querySelector('select').value=currentKey;
  if(document.getElementById('effect-preset-name'))document.getElementById('effect-preset-name').value=presetName;
  prepare();renderLibrary();renderFields();if(frameChanged)timeline.seek(draftFrame);scheduleDraw();updateTransport();
 }
 function moveHistory(redo){
  if(disposed||confirming)return;
  const active=document.activeElement,restoreFocus=dialog.contains(active),pending=pendingControl(),previous=past.at(-1);
  const refocus=()=>{if(restoreFocus&&!dialog.contains(document.activeElement)){
   const next=active.id&&dialog.querySelector('#'+CSS.escape(active.id));(next&&!next.disabled?next:play).focus({preventScroll:true});
  }};
  pending?.blur();
  // A rejected (or numerically unchanged) field has no new model edit to undo.
  if(pending&&past.at(-1)===previous){updateHistoryControls();refocus();return;}
  const from=redo?future:past,to=redo?past:future,entry=from.pop();if(!entry){updateHistoryControls();refocus();return;}
  to.push(entry);restoreSnapshot(redo?entry.after:entry.before);refocus();
 }
 function historyKey(event){
  if(event.defaultPrevented||event.isComposing||event.keyCode===229||confirming||event.altKey||!(event.ctrlKey||event.metaKey))return;
  const key=event.key.toLowerCase();if(!['z','y'].includes(key))return;
  if(event.target.closest('textarea,input[type="text"],input[type="search"],[contenteditable="true"]'))return;
  event.preventDefault();event.stopPropagation();moveHistory(key==='y'||event.shiftKey);
 }
 function activate(value){
  if(!definitions.has(value))throw Error('효과를 붙일 대상을 다시 선택하세요.');
  currentKey=value;target={...definitions.get(value)};
  targetType=target.skillId?'text':target.elementId?card.elements.find(e=>e.id===target.elementId).type:'frame';
  if(!drafts.has(value)){
   const original=readTargetEffects(ctx.store.getProject(),target);
   drafts.set(value,{target:{...target},original,originalColor:readTargetTextColor(ctx.store.getProject(),target),color:readTargetTextColor(ctx.store.getProject(),target),originalStyle:readTargetTextStyle(ctx.store.getProject(),target),style:readTargetTextStyle(ctx.store.getProject(),target),recipe:clone(original),selected:original.layers[0]?.id,savedId:null,presetName:''});
  }
  const d=drafts.get(value);textColor=d.color;textStyle=d.style;recipe=d.recipe;selected=d.selected;savedId=d.savedId;presetName=d.presetName;
 }
 function updateImportControls(){
  for(const id of ['effect-apply','effect-save-preset','effect-sprite-import','effect-sprite-library']){const control=dialog.querySelector('#'+id);if(control)control.disabled=pendingImports>0;}
  const sprite=recipe.layers.find(layer=>layer.id===selected&&layer.kind==='sprite'),assetId=sprite?.params.assetId,hasImage=stagedAssets.has(assetId)||!!ctx.store.getProject().assets[assetId];
  for(const id of ['effect-sprite-edit','effect-sprite-crop-sheet']){const control=dialog.querySelector('#'+id);if(control)control.disabled=pendingImports>0||!hasImage;}
  const update=dialog.querySelector('#effect-update-preset');if(update)update.disabled=pendingImports>0||!savedId;
 }
 function chooseSpriteImage(layerId){if(pendingImports)return;pendingImage={key:currentKey,layerId,documentId};imageFile.value='';imageFile.click();}
 function stageSpriteImage(destination,asset,image,name,spritePatch={}){
  if(disposed)return;
  if(ctx.store.getDocumentId()!==destination.documentId)return message('덱이 바뀌어 이미지를 붙이지 않았어요. 사용할 덱에서 다시 선택하세요.');
  const draft=drafts.get(destination.key),current=destination.key===currentKey,draftRecipe=current?recipe:draft?.recipe;
  if(!draftRecipe?.layers.some(l=>l.id===destination.layerId&&l.kind==='sprite'))return message('그림을 고르는 동안 해당 입자 레이어가 삭제되어 이미지를 붙이지 않았어요. 사용할 레이어에서 다시 가져오세요.');
  // A destination may disappear independently while the library dialog is open.
  try{readTargetEffects(ctx.store.getProject(),draft.target);}catch{return message('그림을 고르는 동안 대상이 삭제되어 이미지를 붙이지 않았어요. 사용할 대상에서 다시 선택하세요.');}
  if(image.naturalWidth!==asset.width||image.naturalHeight!==asset.height)throw new Error('선택한 그림의 크기가 맞지 않습니다. 보관함에 원본을 다시 가져오세요.');
  stagedAssets.set(asset.id,asset);stagedImages.set(asset.id,image);assetNames.set(asset.id,name);
  editDraft(()=>{
   const next=clone(draftRecipe),layer=next.layers.find(l=>l.id===destination.layerId);Object.assign(layer.params,spritePatch,{assetId:asset.id,shape:'image'});
   if(current){recipe=next;selected=layer.id;}else{draft.recipe=next;draft.selected=layer.id;}
  });
  prepare();renderFields();scheduleDraw();updateTransport();
 }
 async function chooseSpriteLibraryImage(layerId){
  if(pendingImports||disposed||!ctx.openAssetLibrary)return;
  const destination={key:currentKey,layerId,documentId};pendingImports++;updateImportControls();updateTransport();
  try{
   const picked=await ctx.openAssetLibrary({pick:true,title:'입자 이미지 선택'});if(!picked||disposed)return;
   if(ctx.store.getDocumentId()!==documentId)return message('덱이 바뀌어 이미지를 붙이지 않았어요. 사용할 덱에서 다시 선택하세요.');
   const asset={id:newId(),mime:picked.mime,dataUrl:picked.dataUrl,width:picked.width,height:picked.height,paintingId:null},image=await decodeImage(asset.dataUrl);
   stageSpriteImage(destination,asset,image,'보관함 그림');
  }catch(error){if(!disposed)message(error.message);}
  finally{pendingImports--;if(!disposed){updateImportControls();updateTransport();}}
 }
 async function importSpriteImage(){
  const file=imageFile.files[0],destination=pendingImage;pendingImage=null;if(!file||!destination)return;
  pendingImports++;updateImportControls();updateTransport();
  try{
   const asset=await importAsset(file),image=await decodeImage(asset.dataUrl);
   stageSpriteImage(destination,asset,image,file.name);
  }catch(error){if(!disposed)message(error.message);}
  finally{pendingImports--;if(!disposed){updateImportControls();updateTransport();}}
 }
 async function processSpriteImage(layerId,grid=false){
  if(pendingImports||disposed)return;
  const layer=recipe.layers.find(l=>l.id===layerId&&l.kind==='sprite'),asset=stagedAssets.get(layer?.params.assetId)||ctx.store.getProject().assets[layer?.params.assetId];if(!asset)return;
  timeline.pause();updateTransport();
  const destination={key:currentKey,layerId,documentId},params=clone(layer.params);pendingImports++;updateImportControls();updateTransport();
  try{
   const results=await openImageCropper({asset,name:assetNames.get(asset.id)||'입자 그림',initialMode:grid?'grid':'manual',initialGrid:{rows:params.sheetRows??1,columns:params.sheetColumns??1}});
   if(!results||disposed)return;
   const full=!grid&&results.length===1&&results[0].sourceRect.x===0&&results[0].sourceRect.y===0&&results[0].asset.width===asset.width&&results[0].asset.height===asset.height;
   const packed=full?{asset:results[0].asset}:await packSpriteSheet(results,{columns:params.sheetColumns??1});
   const patch=full?{}:{sheetColumns:packed.sheetColumns,sheetRows:packed.sheetRows,frameCount:packed.frameCount,frameStart:0,cropLeft:0,cropRight:0,cropTop:0,cropBottom:0};
   stageSpriteImage(destination,packed.asset,await decodeImage(packed.asset.dataUrl),grid?'편집한 스프라이트 시트':'편집한 입자 그림',patch);
  }catch(error){if(!disposed)message(error.message);}
  finally{pendingImports--;if(!disposed){updateImportControls();updateTransport();}}
 }
 function commitAssets(project,recipes){
  for(const r of recipes)for(const layer of r.layers){const asset=stagedAssets.get(layer.params?.assetId);if(asset)project.assets[asset.id]=clone(asset);}
 }
 function recipeChanged(d){return JSON.stringify(d.recipe)!==JSON.stringify(d.original);}
 function styleChanged(d){return JSON.stringify(d.style)!==JSON.stringify(d.originalStyle);}
 function applyDraft(project,d){if(recipeChanged(d))writeTargetEffects(project,d.target,d.recipe);if(d.color!==d.originalColor)writeTargetTextColor(project,d.target,d.color);if(styleChanged(d))writeTargetTextStyle(project,d.target,d.style);}
 function applyDrafts(project){
  for(const d of drafts.values())applyDraft(project,d);
  const reflow=new Set([...drafts.values()].filter(d=>styleChanged(d)&&!d.target.back).map(d=>d.target.cardId));
  project.cards=project.cards.map(c=>reflow.has(c.id)&&(c.autoSkillLayout??(c.template!=='custom'))?syncSkillElements(c,project.settings,project.keywords||[]):c);
 }

 function dirty(){remember();return pendingImports>0||draftFrame!==initialFrame||[...drafts.values()].some(d=>recipeChanged(d)||d.color!==d.originalColor||styleChanged(d));}
 function message(text){feedback.textContent=text;feedback.hidden=!text;}
 function updateTransport(){
  syncEffectTimeInput(time,timeline.getTime());timeLabel.textContent=timeline.getTime().toFixed(2)+'초';play.textContent=timeline.isPlaying()?'일시정지':'재생';play.setAttribute('aria-pressed',timeline.isPlaying());
  frameLabel.textContent='인쇄 '+draftFrame.toFixed(2)+'초';dialog.dataset.effectDirty=String(dirty());updateHistoryControls();
 }
 function prepare(){
  remember();const p=ctx.store.getProject(),copy=clone(target.back?p.back:p.cards.find(c=>c.id===target.cardId));
  previewAssets.clear();for(const [id,image] of ctx.assets)previewAssets.set(id,image);for(const [id,image] of stagedImages)previewAssets.set(id,image);
  previewProject={...p,assets:{...p.assets,...Object.fromEntries(stagedAssets)},cards:target.back?p.cards:p.cards.map(c=>c.id===target.cardId?copy:c),back:target.back?copy:p.back};
  applyDrafts(previewProject);renderGeometry=null;
  previewTarget=target.back?previewProject.back:previewProject.cards.find(c=>c.id===target.cardId);comparisonTarget=clone(previewTarget);comparisonProject={...previewProject,cards:target.back?previewProject.cards:previewProject.cards.map(c=>c.id===target.cardId?comparisonTarget:c),back:target.back?comparisonTarget:previewProject.back};
  writeTargetEffects(comparisonProject,target,createVisualEffects());if(targetType==='text')writeTargetTextColor(comparisonProject,target,drafts.get(currentKey).originalColor);focus.disabled=!target.elementId&&!target.skillId;cache.clear();dialog.dataset.effectDirty=String(dirty());transform?.refresh();
 }
 function draw(){
  clearTimeout(timer);if(disposed||!previewTarget)return;
  const started=performance.now(),accelerationBefore=getBloomAccelerationStatus(),effectsBefore=getEffectAccelerationStatus(),active=timeline.isPlaying()||transform?.isDragging(),dpi=previewView?.dpi({active})||(quality.checked?300:200);
  if(dpi!==lastDpi){cache.clear();lastDpi=dpi;}
  const report=renderCard(canvas.getContext('2d',{willReadFrequently:false}),comparing?comparisonProject:previewProject,comparing?comparisonTarget:previewTarget,previewAssets,dpi,{timeSec:timeline.getTime(),playbackTarget:selectedPlayback.checked?target:null,frozenTimeSec:draftFrame,effectCache:cache,onEffectGeometry:entry=>{
   if(comparing)return;
   if(target.textRangeId){
    if(entry.textRangeId===target.textRangeId&&(!renderGeometry||entry.elementId===target.elementId))renderGeometry=entry;
   }else if(target.skillId){
    const title=previewTarget.elements.find(e=>e.binding?.field==='skill.name'&&e.binding.skillId===target.skillId);
    if(entry.skillId===target.skillId&&(!renderGeometry||entry.elementId===title?.id))renderGeometry=entry;
   }else if(!entry.skillId&&!entry.textRangeId&&entry.elementId===(target.elementId||null))renderGeometry=entry;
  }});
  previewView?.afterDraw(dpi,{active,durationMs:performance.now()-started});transform?.refresh();
  const problems=ctx.state.ignoreOutputWarnings?[]:report.problems.filter(p=>target.skillId?p.skillId===target.skillId:p.elementId===target.elementId||!target.elementId&&!p.elementId);
  message(problems.slice(0,2).map(p=>(p.severity==='warning'?'안내: ':'인쇄 확인: ')+p.message).join(' '));
  const acceleration=getBloomAccelerationStatus(),gpu=acceleration.gpuRenders>accelerationBefore.gpuRenders,cpu=acceleration.cpuRenders>accelerationBefore.cpuRenders;
  const effects=getEffectAccelerationStatus(),effectsGpu=effects.gpuRenders>effectsBefore.gpuRenders,effectsCpu=effects.cpuRenders>effectsBefore.cpuRenders;
  status.dataset.bloomBackend=gpu?(cpu?'mixed':'gpu'):(cpu?'cpu':'idle');
  status.dataset.effectBackend=effectsGpu?(effectsCpu?'mixed':'gpu'):(effectsCpu?'cpu':'idle');
  status.title=(cpu&&acceleration.reason||effectsCpu&&effects.reason)?'GPU 가속을 사용할 수 없는 작업은 기본 방식으로 처리해요.':'';
  status.dataset.busy=String(pendingImports>0);status.textContent=pendingImports?'입자 그림 읽는 중…':(quality.checked?'인쇄 품질 확인 · ':'미리보기 · ')+dpi+'dpi'+' · '+Math.round(performance.now()-started)+'ms'+(gpu?' · 블룸 GPU'+(cpu?' + CPU':''):cpu?' · 블룸 CPU':'')+(effectsGpu?' · 이펙트 GPU'+(effectsCpu?' + CPU':''):effectsCpu?' · 이펙트 CPU':'');
 }
 function scheduleDraw(){clearTimeout(timer);status.dataset.busy='true';status.textContent='계산 중…';timer=setTimeout(draw,150);}
 function renderFields(){
  preserveFocus(()=>{renderVisualEffectFields(fields,{recipe,selectedLayerId:selected,targetType,importing:pendingImports>0,assetOptions:Object.values({...ctx.store.getProject().assets,...Object.fromEntries(stagedAssets)}).map((a,i)=>[a.id,(assetNames.get(a.id)||'저장 그림 '+(i+1))+' · '+a.width+'×'+a.height]),onImportImage:chooseSpriteImage,onLibraryImage:ctx.openAssetLibrary?chooseSpriteLibraryImage:undefined,onSelect:id=>{selected=id;renderFields();transform?.refresh();},onChange:change=>{
   const next=clone(recipe),id=change(next),errors=validateVisualEffects(next,targetType);
   if(errors.length){message(errors[0].message);renderFields();return;}
   editDraft(()=>{recipe=next;if(typeof id==='string'&&next.layers.some(l=>l.id===id))selected=id;if(!recipe.layers.some(l=>l.id===selected))selected=recipe.layers[0]?.id;});
   prepare();renderFields();scheduleDraw();updateTransport();
  }});
  const sprite=recipe.layers.find(layer=>layer.id===selected&&layer.kind==='sprite');
  if(sprite?.params.shape==='image')fields.append(el('section',{class:'inspector-group'},el('h3',{},'입자 원본 편집'),
   button('이미지 자르기·배경 제거',()=>processSpriteImage(sprite.id),{id:'effect-sprite-edit',class:'wide',disabled:pendingImports>0||!sprite.params.assetId}),
   button('스프라이트 시트 자르기',()=>processSpriteImage(sprite.id,true),{id:'effect-sprite-crop-sheet',class:'wide',disabled:pendingImports>0||!sprite.params.assetId}),
   el('p',{class:'hint'},'선택한 조각은 한 시트로 묶어요. 여러 컷 재생에서 반복이나 랜덤 소환을 고를 수 있어요.')));
  if(targetType==='text')fields.prepend(el('section',{class:'inspector-group'},el('h3',{},'글자 꾸미기'),
   ...textStyleFields(textStyle,(key,value)=>{editDraft(()=>textStyle={...textStyle,[key]:value});prepare();renderFields();scheduleDraw();updateTransport();},{idPrefix:'effect-text',minFontPt:p.settings.minFontPt,inline:!!target.skillId||!!target.textRangeId}),
   field('글자 색','effect-text-color',textColor||'#253d32',value=>{editDraft(()=>textColor=value);prepare();scheduleDraw();updateTransport();},{type:'color'}),
   button('기본 글자 색 사용',()=>{editDraft(()=>textColor=undefined);prepare();renderFields();scheduleDraw();updateTransport();},{id:'effect-text-color-reset',disabled:textColor===undefined}),
   target.textRangeId?el('p',{class:'hint'},'선택한 글자 구간에만 적용돼요. 스킬 이름에 지정하면 설명 속 같은 스킬 이름에도 함께 적용돼요.'):target.skillId?el('p',{class:'hint'},'이 스킬의 제목 이름과 설명 속 같은 이름에 함께 적용돼요.'):null));
  });
  for(const input of fields.querySelectorAll('input[type=number],input[type=color]'))input.dataset.effectCommitted=input.value;
  updateHistoryControls();
 }
 function switchTarget(value){
  transform?.cancel();releaseComparison();remember();activate(value);if(document.getElementById('effect-preset-name'))document.getElementById('effect-preset-name').value=presetName;renderLibrary();renderFields();prepare();scheduleDraw();updateTransport();
 }
 function useRecipe(next,id=null,name=''){
  next=upgradeVisualEffects(next);
  if(targetType!=='frame')delete next.frame;
  else next.frame=clone(recipe.frame||next.frame||{scope:'border',bandMm:4});
  const errors=validateVisualEffects(next,targetType);if(errors.length){message(errors[0].message);return;}
  editDraft(()=>{recipe=clone(next);selected=recipe.layers[0]?.id;savedId=id;presetName=name;
   if(document.getElementById('effect-preset-name'))document.getElementById('effect-preset-name').value=name;
  });
  prepare();renderLibrary();renderFields();scheduleDraw();updateTransport();
 }
 function storeEdit(label,change){try{ctx.store.edit(label,change);return true;}catch(e){message(e.message);return false;}}
 function savePreset(replace){
  if(pendingImports)return message('입자 그림을 읽고 있어요. 이미지가 준비되면 이펙트를 저장할 수 있어요.');
  const name=document.getElementById('effect-preset-name').value;let id;
  if(storeEdit('내 이펙트 저장',p=>{commitAssets(p,[recipe]);id=saveVisualEffectPreset(p,name,recipe,replace?savedId:null);})){savedId=id;renderLibrary();message('내 이펙트에 저장했어요. 적용을 누르면 편집한 대상들에 반영돼요.');}
 }
 function renderLibrary(){
  const name=document.getElementById('effect-preset-name')?.value??presetName,p=ctx.store.getProject();
  if(savedId&&!p.visualEffectPresets?.some(a=>a.id===savedId))savedId=null;
  const category=(key,preset)=>preset.category||(['goldTitle','neonText'].includes(key)?'글자 스타일':'마법·자연');
  const entries=Object.entries(VISUAL_EFFECT_PRESETS).filter(([key,preset])=>(libraryCategory==='all'||category(key,preset)===libraryCategory)&&(preset.name+' '+key+' '+category(key,preset)).toLowerCase().includes(librarySearch.trim().toLowerCase()));
  sampleObserver.disconnect();
  preserveFocus(()=>{
   library.replaceChildren(...[el('h3',{},'프리셋 둘러보기'),
    el('label',{class:'field',htmlFor:'effect-preset-search'},el('span',{},'이름 검색'),el('input',{id:'effect-preset-search',type:'search',value:librarySearch,placeholder:'금속, 불꽃, 글리치…',oncompositionstart:()=>{libraryComposing=true;},oncompositionend:event=>{libraryComposing=false;librarySearch=event.target.value;renderLibrary();},oninput:event=>{librarySearch=event.target.value;if(!libraryComposing&&!event.isComposing)renderLibrary();}})),
    field('분류','effect-preset-category',libraryCategory,value=>{libraryCategory=value;renderLibrary();},{options:[['all','모든 효과'],...[...new Set(Object.entries(VISUAL_EFFECT_PRESETS).map(([key,preset])=>category(key,preset)))].map(c=>[c,c])]}),
    el('p',{class:'hint',role:'status'},entries.length+'개 · 눌러서 시작, 아래에서 조합 조절'),
    el('div',{class:'effect-preset-gallery'},...entries.map(([key,preset])=>button([el('canvas',{'data-sample-key':key,'aria-hidden':'true',width:120,height:50}),el('strong',{},preset.name),el('small',{},category(key,preset))],()=>useRecipe(createVisualEffectsForTarget(key,targetType)),{'data-builtin-effect':key,class:'effect-preset-card',title:preset.name+' 조합으로 시작'}))),
    !entries.length?el('p',{class:'empty-note'},'찾은 프리셋이 없어요. 검색어나 분류를 바꿔보세요.'):null,
    el('h3',{class:'effect-library-heading'},'프리셋 조합'),
    field('이 조합으로 시작','effect-start-preset','',v=>{if(v)useRecipe(createVisualEffectsForTarget(v,targetType));},{options:[['','프리셋 선택'],['empty','빈 조합'],...Object.entries(VISUAL_EFFECT_PRESETS).map(([k,v])=>[k,v.name])]}),
    field('다른 프리셋 겹치기','effect-combine-preset','smoke',()=>{},{options:Object.entries(VISUAL_EFFECT_PRESETS).map(([k,v])=>[k,v.name])}),
    button('+ 선택 프리셋 겹치기',()=>{
     const next=clone(recipe),added=createVisualEffectsForTarget(document.getElementById('effect-combine-preset').value,targetType);
     for(const layer of added.layers){layer.id=newId();layer.kind==='textWarp'?next.layers.unshift(layer):next.layers.push(layer);}useRecipe(next);
    },{id:'effect-merge-preset',class:'wide'}),
    el('h3',{class:'effect-library-heading'},'내 이펙트'),
    ...((p.visualEffectPresets||[]).map(a=>button(a.name,()=>useRecipe(a.recipe,a.id,a.name),{'data-effect-preset':a.id,class:'wide effect-saved'+(savedId===a.id?' active':'')}))),
    !(p.visualEffectPresets||[]).length?el('p',{class:'hint'},'조합에 이름을 붙여 다른 글자에도 써보세요.'):null,
    field('이펙트 이름','effect-preset-name',name,()=>{},{maxLength:120}),
    button('새 이펙트로 저장',()=>savePreset(false),{id:'effect-save-preset',class:'wide',disabled:pendingImports>0}),
    ctx.cloudAccount?.canWrite()?button('에셋으로 공유',()=>ctx.shareAsset('effect_template',savedId),{id:'effect-share',class:'wide',disabled:pendingImports>0||!savedId}):null,
    el('div',{class:'two-fields'},button('저장본 수정',()=>savePreset(true),{id:'effect-update-preset',disabled:pendingImports>0||!savedId}),button('저장본 삭제',()=>{if(storeEdit('내 이펙트 삭제',p=>removeVisualEffectPreset(p,savedId))){savedId=null;renderLibrary();}},{id:'effect-delete-preset',disabled:!savedId,class:'danger'})),
    el('p',{class:'hint'},'저장본을 바꿔도 이미 카드에 적용한 조합은 유지돼요.')].filter(node=>node!==null));
  });
  for(const sample of library.querySelectorAll('[data-sample-key]')){if(sampleCache.has(sample.dataset.sampleKey))paintSample(sample);else sampleObserver.observe(sample);}
 }
 function cleanup(){
  if(disposed)return;disposed=true;closeVideo?.();previewView?.destroy();transform?.destroy();past.length=0;future.length=0;clearTimeout(timer);timeline.destroy();cache.clear();sampleObserver.disconnect();sampleCache.clear();stagedAssets.clear();stagedImages.clear();assetNames.clear();previewAssets.clear();unsubscribe?.();if(ctx.refreshVisualEffects===draw)ctx.refreshVisualEffects=null;document.removeEventListener('visibilitychange',visibility);document.removeEventListener('pointerup',releaseComparison);window.removeEventListener('blur',releaseComparison);
  confirmation?.dispatchEvent(new Event('cancel',{cancelable:true}));confirmation=null;
  if(dialog.open)dialog.close();dialog.remove();ctx.onEffectsClosed?.();
 }
 async function close({force=false}={}){
  if(disposed)return true;if(confirming&&!force)return false;transform?.cancel();
  if(!force&&dirty()){
   confirming=true;timeline.pause();updateTransport();
   const choice=await openDialog({onOpen:node=>confirmation=node,title:'적용 전 변경을 버릴까요?',message:'편집한 대상들의 이펙트와 인쇄 장면을 버려요. 내 이펙트에 저장한 조합은 남습니다.',choices:[{id:'cancel',label:'계속 편집'},{id:'discard',label:'변경 버리기'}]});
   confirmation=null;confirming=false;if(disposed||choice!=='discard')return false;
  }
  cleanup();return true;
 }
 function visibility(){timeline.setActive(!document.hidden&&dialog.open);updateTransport();}
 const transport=el('div',{class:'effect-transport'},play,el('label',{class:'check'},selectedPlayback,'선택 대상만 재생'),time,timeLabel,
  button('고화질 6초 보기',()=>{pendingControl()?.blur();timeline.pause();releaseComparison();prepare();updateTransport();closeVideo?.();closeVideo=openEffectVideo({project:previewProject,target:previewTarget,assets:previewAssets,startTimeSec:timeline.getTime(),playbackTarget:selectedPlayback.checked?target:null,frozenTimeSec:draftFrame,onClose:()=>{closeVideo=null;}});},{id:'effect-prerender'}),
  button('장면 고정',()=>{timeline.pause();editDraft(()=>draftFrame=Math.round(timeline.getTime()*100)/100);timeline.seek(draftFrame);updateTransport();},{id:'effect-freeze',title:'현재 장면을 인쇄 프레임으로'}),
  button('인쇄 장면',()=>{timeline.pause();timeline.seek(draftFrame);updateTransport();},{id:'effect-print-frame'}),frameLabel);
 dialog.append(imageFile,
  el('header',{class:'effect-top'},el('div',{},el('h2',{id:'effect-title'},'이펙트 만들기'),el('p',{class:'hint'},'선택한 그림이나 글자에 효과를 조합해 보세요. 스킬 이름만 따로 꾸밀 수도 있어요.')),
   el('div',{class:'effect-top-actions'},undoButton,redoButton,button('닫기',()=>close(),{id:'effect-close'}),button('편집한 대상에 적용',()=>{
    if(pendingImports)return message('입자 그림을 읽고 있어요. 이미지가 준비되면 적용할 수 있어요.');
    remember();if(storeEdit('이펙트 적용',p=>{commitAssets(p,[...drafts.values()].map(d=>d.recipe));applyDrafts(p);p.print.effectFrameSec=draftFrame;}))cleanup();
   },{id:'effect-apply',class:'primary'}))),
  el('div',{class:'effect-target-bar'},targetPicker,el('label',{class:'check'},quality,'인쇄 품질로 보기'),status),
  el('div',{class:'effect-grid'},library,el('main',{class:'effect-center'},el('div',{class:'effect-preview-tools'},zoom,focus,compare,el('span',{class:'effect-zoom-hint'},'Ctrl+휠 확대·축소')),el('div',{class:'effect-preview-scroll'},canvas),transport),fields),feedback);
 transform=mountEffectTransform({canvas,viewport:canvas.parentElement,toolbar:dialog.querySelector('.effect-preview-tools'),scope:dialog,
  getState:()=>({layer:recipe?.layers.find(l=>l.id===selected),...renderGeometry,image:previewAssets.get(recipe?.layers.find(l=>l.id===selected)?.params.assetId),timeSec:timeline.getTime(),cardWidthMm:p.settings.cardWidthMm,cardHeightMm:p.settings.cardHeightMm,hidden:comparing||confirming}),
  onBegin:()=>{if(disposed||confirming)return false;pendingControl()?.blur();timeline.pause();releaseComparison();draw();updateTransport();return snapshot();},
  onPreview:layer=>{
   if(disposed)return;const next=clone(recipe),index=next.layers.findIndex(l=>l.id===selected);if(index<0)return;next.layers[index]=layer;
   const errors=validateVisualEffects(next,targetType);if(errors.length){message(errors[0].message);return;}
   recipe=next;writeTargetEffects(previewProject,target,recipe);draw();updateTransport();
  },
  onCommit:before=>{if(disposed)return;recordEdit(before);renderFields();prepare();draw();updateTransport();},
  onCancel:before=>{if(disposed)return;restoreSnapshot(before);draw();}
 });
 dialog.addEventListener('keydown',historyKey);dialog.addEventListener('input',updateHistoryControls);
 dialog.addEventListener('cancel',event=>{if(event.target!==dialog)return;event.preventDefault();if(!transform.cancel())close();});dialog.addEventListener('close',cleanup);
 activate(initialValue);document.body.append(dialog);prepare();renderLibrary();renderFields();draw();updateTransport();dialog.showModal();
 previewView=mountEffectPreview({canvas,viewport:canvas.parentElement,select:zoom.querySelector('select'),widthMm:p.settings.cardWidthMm,heightMm:p.settings.cardHeightMm,getPrintQuality:()=>quality.checked,canZoom:()=>!disposed&&!confirming&&!transform?.isDragging(),onChange:scheduleDraw,onLayout:()=>transform?.refresh()});
 document.addEventListener('visibilitychange',visibility);document.addEventListener('pointerup',releaseComparison);window.addEventListener('blur',releaseComparison);
 ctx.refreshVisualEffects=draw;unsubscribe=ctx.store.subscribe(()=>{if(!disposed)renderLibrary();});return close;
}
