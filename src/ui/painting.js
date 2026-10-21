import {el,button,field,preserveFocus,typing} from './dom.js';
import {openDialog} from './dialogs.js';
import {download} from './files.js';
import {applyPaintingToCard} from '../model/assets.js';
import {openPainting,serializePainting,compositePainting,trimTransparentCanvas,editLayers,activeLayer,compressCanvas} from '../painting/document.js';
import {createPaintTools,PAINT_BRUSH_MIN,PAINT_BRUSH_MAX} from '../painting/tools.js';
import {PAINT_BLEND_MODES,DEFAULT_PAINT_BLEND_MODE,normalizePaintBlendMode,paintBlendModeLabel} from '../painting/blend-modes.js';
import {BRUSH_PRESETS,brushPresetOptions} from '../painting/brush-presets.js';
import {screenToPixel,zoomAt} from '../painting/viewport.js';
import {mountTouchViewport} from './touch-viewport.js';
const TOOLS=[['brush','✎','브러시','B'],['eraser','▱','지우개','E'],['select','▧','사각 선택','M'],['pan','✥','화면 이동','H'],['fill','▰','채우기','G'],['gradient','◩','그라데이션','D'],['eyedropper','⌖','스포이트','I'],['line','╱','직선','L'],['rect','□','사각형','R'],['ellipse','○','타원','O']];
export async function openPaintingEditor(root,store,cardId){
 const p=store.getProject(),card=p.cards.find(c=>c.id===cardId);if(!card)throw Error('그림을 그릴 카드를 선택하세요.');
 const asset=p.assets[card.artAssetId],source=asset?.paintingId?p.paintings[asset.paintingId]:asset;let session;
 try{session=await openPainting(source??null);}catch(e){
  if(e.code!=='painting-size-limit')throw e;
  const choice=await openDialog({title:'큰 그림을 그리기용으로 줄일까요?',message:'가져온 원본은 그대로 보존해요. 편집할 레이어만 긴 변 4096 px 안으로 비례 축소합니다.',choices:[{id:'fit',label:'그리기용 축소'},{id:'cancel',label:'취소'}]});
  if(choice!=='fit')return 'discarded';session=await openPainting(source,{fitToLimits:true});
 }
 const tools=createPaintTools(session),dialog=el('dialog',{id:'painting-editor',class:'painting-dialog','data-busy':'false','data-paint-dirty':'false','data-tool':'brush'}),viewport=el('div',{id:'paint-viewport',class:'paint-viewport',tabIndex:0,'aria-label':'그림 캔버스'});
 const canvas=el('canvas',{id:'paint-canvas'}),selectionBox=el('div',{id:'paint-selection',class:'paint-selection',hidden:true},['nw','ne','sw','se'].map(h=>el('button',{class:'paint-handle '+h,'data-handle':h,type:'button','aria-label':'선택 크기 조절 '+h})));
 const surface=el('div',{class:'paint-surface'},canvas,selectionBox),cursor=el('div',{class:'paint-cursor',hidden:true});viewport.append(surface,cursor);
 const panel=el('aside',{class:'paint-panel'}),toolBar=el('nav',{class:'paint-tools','aria-label':'그림 도구'}),status=el('div',{class:'paint-status'}),message=el('div',{id:'paint-message',class:'paint-message',role:'alert',hidden:true});
 let view={scale:1,panX:0,panY:0},busy=false,space=false,drag=null,layerDrag=null,suppressedLayerPointer=null,frame=0,closed=false,closing=false,fitMode=true,brushPresetId='',recent=['#233d33','#ffffff','#d7553d','#3688ba','#4d8660','#79549e'];
 let finish;
 const outcome=new Promise(resolve=>{
  finish=result=>{if(closed)return;closed=true;touchView.destroy();cancelLayerDrag();unsub();cancelAnimationFrame(frame);window.removeEventListener('keydown',key);window.removeEventListener('keyup',keyUp);window.removeEventListener('resize',resize);window.removeEventListener('pointermove',moveLayerDrag);window.removeEventListener('pointerup',endLayerDrag);window.removeEventListener('pointercancel',cancelLayerPointer);dialog.close();dialog.remove();resolve(result);};
 });
 const note=text=>{message.hidden=!text;message.textContent=text;};
 const dirty=()=>session.history.isDirty()||tools.isFloating()||tools.isGesture();
 const undo=()=>run(async()=>{tools.cancel();tools.cancelSelection();await session.history.undo();});
 const redo=()=>run(async()=>{tools.cancel();tools.cancelSelection();await session.history.redo();});
 const selectAll=()=>{if(busy){note('이전 그림 작업을 마친 뒤 다시 시도하세요.');return;}call(()=>{tools.setOptions({tool:'select'});tools.select({x:0,y:0,w:session.width,h:session.height});});};
 async function run(fn){cancelLayerDrag();if(busy||session.busy||session.history.isBusy()){note('이전 그림 작업을 마친 뒤 다시 시도하세요.');return false;}busy=true;dialog.dataset.busy='true';note('');renderState();try{await fn();return true;}catch(e){note(e.message);return false;}finally{busy=false;dialog.dataset.busy='false';if(!closed)renderAll();}}
 function call(fn){try{fn();note('');renderAll();}catch(e){note(e.message);}}
 function setTool(tool){call(()=>{tools.setOptions({tool});if(tool!=='brush')brushPresetId='';});}
 async function exportPng(white){const c=compose(white);download(await compressCanvas(c),card.name+(white?' - 흰 배경':' - 투명')+'.png','image/png');note('PNG를 저장했어요. 편집할 레이어는 카드에 적용하고 프로젝트로 저장하세요.');}
 async function apply(){await run(async()=>{tools.cancel();await tools.commitSelection();const saved=await serializePainting(session),composite=trimTransparentCanvas(compositePainting(session)),png=composite.toDataURL('image/png');store.edit('그림 적용',draft=>Object.assign(draft,applyPaintingToCard(draft,cardId,saved,png,{width:composite.width,height:composite.height})));finish('applied');});}
 async function close(){
  if(closed||closing)return;
  if(busy){note('이전 그림 작업을 마친 뒤 닫아 주세요.');return;}
  if(!dirty()){finish('discarded');return;}
  closing=true;
  try {const choice=await openDialog({title:'그림 변경을 어떻게 할까요?',message:'그림 변경은 아직 카드에 적용되지 않았어요.',choices:[{id:'apply',label:'카드에 적용'},{id:'discard',label:'그림 버리기'},{id:'continue',label:'계속 그리기'}]});
  if(choice==='apply')await apply();else if(choice==='discard')finish('discarded');
  }finally{closing=false;if(!closed&&!dialog.open)dialog.showModal();}
 }
 const applyButton=button('카드에 적용',apply,{id:'paint-apply',class:'primary'});
 const undoButton=button('↶',undo,{id:'paint-undo','aria-label':'그림 실행 취소'}),redoButton=button('↷',redo,{id:'paint-redo','aria-label':'그림 다시 실행'});
 const top=el('header',{class:'paint-top'},el('div',{},el('strong',{},'그림 작업실'),el('small',{},card.name)),el('div',{class:'paint-top-actions'},undoButton,redoButton,button('캔버스 크기',resizeDialog,{id:'paint-resize'}),button('투명 PNG',()=>exportPng(false),{id:'paint-export-transparent'}),button('흰 배경 PNG',()=>exportPng(true),{id:'paint-export-white'}),applyButton,button('닫기',close,{id:'paint-close'})));
 for(const [tool,icon,name,shortcut] of TOOLS)toolBar.append(button(icon,()=>setTool(tool),{id:'tool-'+tool,title:name+' · '+shortcut,'aria-label':name,class:'paint-tool','data-tool':tool}),el('small',{},shortcut));
 const zoomInput=el('input',{id:'paint-zoom',type:'number',min:12.5,max:1600,step:12.5,'aria-label':'그림 배율',onchange:e=>setZoom(Number(e.target.value)/100)});
 const bottom=el('footer',{class:'paint-bottom'},status,el('span',{id:'paint-coords'},'B 브러시 · E 지우개 · M 선택 · Space 이동'),zoomInput,el('span',{},'%'),button('전체 맞춤',fit,{id:'paint-fit'}),button('100%',()=>setZoom(1),{id:'paint-100'}));
 dialog.append(top,el('div',{class:'paint-grid'},toolBar,viewport,panel),message,bottom);document.body.append(dialog);dialog.showModal();
 function renderState(){for(const node of dialog.querySelectorAll('input,select,button'))node.disabled=busy;const confirm=document.getElementById('select-commit'),cancel=document.getElementById('select-cancel');if(confirm)confirm.disabled=busy||!tools.isFloating();if(cancel)cancel.disabled=busy||!tools.isFloating();dialog.dataset.tool=tools.getOptions().tool;dialog.dataset.paintDirty=String(dirty());undoButton.disabled=busy||!session.history.canUndo();redoButton.disabled=busy||!session.history.canRedo();applyButton.disabled=busy;
  status.replaceChildren(el('strong',{id:'paint-size'},session.width+' × '+session.height+' px'),el('span',{id:'paint-history'},session.history.count()+'단계 · '+(session.history.bytes()/1024/1024).toFixed(2)+' / 128 MiB'));zoomInput.value=(view.scale*100).toFixed(1);
  for(const [tool] of TOOLS)document.getElementById('tool-'+tool).classList.toggle('selected',tools.getOptions().tool===tool);
 }
 function compose(white=false){return compositePainting(session,white,{preview:tools.getPreview(),layerId:tools.previewLayerId()});}
 function renderViewport(){
  if(closed)return;if(canvas.width!==session.width||canvas.height!==session.height){canvas.width=session.width;canvas.height=session.height;}
  const ctx=canvas.getContext('2d');ctx.imageSmoothingEnabled=false;ctx.clearRect(0,0,canvas.width,canvas.height);ctx.drawImage(compose(),0,0);
  surface.style.width=session.width+'px';surface.style.height=session.height+'px';surface.style.transform='translate('+view.panX+'px,'+view.panY+'px) scale('+view.scale+')';canvas.style.imageRendering=view.scale>=1?'pixelated':'auto';
  const rect=tools.getSelection();selectionBox.hidden=!rect;
  if(rect){Object.assign(selectionBox.style,{left:rect.x+'px',top:rect.y+'px',width:rect.w+'px',height:rect.h+'px',borderWidth:1/view.scale+'px'});
   for(const h of selectionBox.children){h.style.width=8/view.scale+'px';h.style.height=8/view.scale+'px';h.style.borderWidth=1/view.scale+'px';}
  }
  viewport.style.cursor=space||tools.getOptions().tool==='pan'?'grab':tools.getOptions().tool==='select'?'crosshair':'none';renderState();
 }
 function requestRender(){if(!frame)frame=requestAnimationFrame(()=>{frame=0;renderViewport();});}
 function renderAll(){renderViewport();renderPanel();}
 function fit(){fitMode=true;view.scale=Math.max(.01,Math.min(1,(viewport.clientWidth-60)/session.width,(viewport.clientHeight-60)/session.height));view.panX=(viewport.clientWidth-session.width*view.scale)/2;view.panY=(viewport.clientHeight-session.height*view.scale)/2;renderViewport();}
 function setZoom(scale){fitMode=false;view=zoomAt(view,{x:viewport.clientWidth/2,y:viewport.clientHeight/2},scale);renderViewport();}
 function resize(){if(fitMode)fit();else renderViewport();}
 function layerOp(op){return run(async()=>{if(tools.isFloating())throw Error('선택 변형을 먼저 확정하거나 취소하세요.');tools.cancel();await editLayers(session,op);tools.select(null);if(['resizeCanvas','resample'].includes(op.type))fit();});}
 function renderPanel(){
  const scroll=panel.scrollTop,layerScroll=panel.querySelector('.paint-layer-list')?.scrollTop??0;
  preserveFocus(()=>{panel.replaceChildren();const options=tools.getOptions(),layer=activeLayer(session),set=(key,value)=>call(()=>{tools.setOptions({[key]:value});if(['size','hardness','opacity','smoothing','brushTip','pixelSnap','pressureSize'].includes(key))brushPresetId='';if(key==='color'){recent=[value,...recent.filter(v=>v!==value)].slice(0,8);}});
   const toolSettings=el('section',{class:'paint-section'},el('h3',{},'도구 설정'),
    field('브러시 종류','paint-brush-preset',brushPresetId,id=>call(()=>{brushPresetId=id;const preset=brushPresetOptions(id);if(preset)tools.setOptions(preset);}),{options:[['','직접 설정'],...BRUSH_PRESETS.map(p=>[p.id,p.label])]}),
    field('브러시 모양','paint-brush-tip',options.brushTip,value=>set('brushTip',value),{options:[['round','원형'],['square','사각형']]}),
    field('색상','paint-color',options.color,v=>set('color',v),{type:'color'}),
    el('div',{class:'recent-colors'},recent.map(color=>{const b=button('',()=>set('color',color),{'aria-label':'최근 색 '+color});b.style.background=color;return b;})),
    field('브러시 크기 (px)','brush-size',options.size,v=>set('size',v),{type:'number',min:PAINT_BRUSH_MIN,max:PAINT_BRUSH_MAX,step:.1}),
    field('불투명도 (%)','brush-opacity',Math.round(options.opacity*100),v=>set('opacity',v/100),{type:'number',min:1,max:100}),
    field('경도 (%)','brush-hardness',Math.round(options.hardness*100),v=>set('hardness',v/100),{type:'range',min:0,max:100}),
    field('선 보정 (%)','brush-smoothing',Math.round(options.smoothing*100),v=>set('smoothing',v/100),{type:'range',min:0,max:100}),
    el('label',{class:'check'},el('input',{id:'paint-pixel-snap',type:'checkbox',checked:options.pixelSnap,onchange:e=>set('pixelSnap',e.target.checked)}),'픽셀 격자에 맞춰 그리기'),
    el('label',{class:'check'},el('input',{id:'paint-pressure',type:'checkbox',checked:options.pressureSize,onchange:e=>set('pressureSize',e.target.checked)}),'펜 압력으로 브러시 크기 조절'),
    el('div',{class:'two-fields'},el('label',{class:'check'},el('input',{id:'paint-mirror-x',type:'checkbox',checked:options.mirrorX,onchange:e=>set('mirrorX',e.target.checked)}),'좌우 대칭'),el('label',{class:'check'},el('input',{id:'paint-mirror-y',type:'checkbox',checked:options.mirrorY,onchange:e=>set('mirrorY',e.target.checked)}),'상하 대칭')),
    el('p',{class:'hint'},'대칭은 브러시·지우개에 적용돼요.'),
    el('label',{class:'check'},el('input',{id:'paint-preserve-alpha',type:'checkbox',checked:options.preserveAlpha,onchange:e=>set('preserveAlpha',e.target.checked)}),'그려진 곳에만 칠하기 (지우개 제외)'),
    options.tool==='gradient'?el('div',{},field('그라데이션 끝 색상','paint-gradient-color',options.gradientColor,value=>set('gradientColor',value),{type:'color'}),field('그라데이션 모양','paint-gradient-type',options.gradientType,value=>set('gradientType',value),{options:[['linear','직선'],['radial','원형']]}),el('p',{class:'hint'},'캔버스를 끌어서 시작 색과 끝 색의 방향·범위를 정해요.')):null,
    options.tool==='fill'?el('label',{class:'check'},el('input',{id:'paint-sample-merged',type:'checkbox',checked:options.sampleMerged,onchange:e=>set('sampleMerged',e.target.checked)}),'보이는 모든 레이어를 기준으로 채우기'):null,
    field('채우기 허용차','paint-tolerance',options.tolerance,v=>set('tolerance',v),{type:'number',min:0,max:255}),
    el('label',{class:'check'},el('input',{id:'paint-shape-fill',type:'checkbox',checked:options.shapeFill,onchange:e=>set('shapeFill',e.target.checked)}),'도형 안쪽 채우기'));
   const selection=tools.getSelection(),selectionPanel=el('section',{class:'paint-section'},el('h3',{},'선택 · 현재 레이어'),
    el('div',{class:'paint-small-grid'},button('복사',()=>call(()=>tools.copy()),{id:'select-copy'}),button('잘라내기',()=>run(()=>tools.cut()),{id:'select-cut'}),button('붙여넣기',()=>call(()=>tools.paste()),{id:'select-paste'}),button('전체 선택',selectAll,{id:'select-all'}),button('선택 해제',()=>call(()=>tools.select(null)),{id:'select-clear'})));
   if(selection){selectionPanel.append(el('div',{class:'two-fields'},...['x','y','w','h'].map(k=>field(({x:'X',y:'Y',w:'가로',h:'세로'})[k]+' (px)','select-'+k,selection[k],v=>call(()=>tools.transform({[k]:v})),{type:'number',step:1,min:['w','h'].includes(k)?1:undefined}))),
     el('div',{class:'paint-small-grid'},button('좌우 반전',()=>call(()=>tools.transform({flipX:true})),{id:'select-flip-x'}),button('상하 반전',()=>call(()=>tools.transform({flipY:true})),{id:'select-flip-y'}),button('90° 회전',()=>call(()=>tools.transform({rotate90:true})),{id:'select-rotate'})),
     el('div',{class:'two-fields'},button('변형 확정',()=>run(()=>tools.commitSelection()),{id:'select-commit',class:'primary',disabled:!tools.isFloating()}),button('변형 취소',()=>call(()=>tools.cancelSelection()),{id:'select-cancel',disabled:!tools.isFloating()})));
    if(selection.x<0||selection.y<0||selection.x+selection.w>session.width||selection.y+selection.h>session.height)selectionPanel.append(el('p',{class:'warning'},'캔버스 밖 부분은 적용할 때 잘려요.'));
   }
   const layerList=el('div',{class:'paint-layer-list'});
   for(const l of [...session.layers].reverse()){
    const thumb=el('canvas',{class:'paint-layer-thumb',width:56,height:56}),ctx=thumb.getContext('2d'),factor=Math.min(56/session.width,56/session.height);ctx.drawImage(l.canvas,(56-session.width*factor)/2,(56-session.height*factor)/2,session.width*factor,session.height*factor);
    const row=button('',event=>{if(busy||event.pointerId===suppressedLayerPointer)return;if(tools.isFloating()){note('선택 변형을 먼저 확정하거나 취소하세요.');return;}tools.select(null);session.activeLayerId=l.id;renderAll();},{class:'paint-layer'+(l.id===session.activeLayerId?' active':''),'data-layer-id':l.id,'aria-label':l.name+' 레이어 선택',title:'끌어서 레이어 순서 변경',onpointerdown:event=>startLayerDrag(event,l.id,layerList)});
    row.append(el('span',{class:'paint-layer-grip','aria-hidden':true},'⠿'),thumb,el('span',{},el('strong',{},l.name||'이름 없는 레이어'),el('small',{},(l.visible?'표시':'숨김')+' · '+Math.round(l.opacity*100)+'%'+(l.locked?' · 잠금':'')+(normalizePaintBlendMode(l.blendMode)!==DEFAULT_PAINT_BLEND_MODE?' · '+paintBlendModeLabel(l.blendMode):''))));layerList.append(row);
   }
   const layers=el('section',{class:'paint-section'},el('div',{class:'paint-layer-heading'},el('h3',{},'레이어'),el('small',{},session.layers.length+'장 · 위에서 아래 순서')),
    el('div',{class:'paint-small-grid'},button('+ 추가',()=>layerOp({type:'add'}),{id:'paint-add-layer'}),button('복제',()=>layerOp({type:'duplicate'}),{id:'paint-duplicate-layer'}),button('삭제',()=>layerOp({type:'delete'}),{id:'paint-delete-layer',class:'danger'})),layerList,el('small',{id:'paint-layer-drop-hint',class:'paint-layer-drop-hint',role:'status','aria-live':'polite'},'레이어를 끌어서 순서를 바꿀 수 있어요.'),
    field('혼합 모드','paint-layer-blend-mode',normalizePaintBlendMode(layer.blendMode),v=>layerOp({type:'blendMode',value:v}),{options:PAINT_BLEND_MODES}),
    field('레이어 이름','paint-layer-name',layer.name,v=>layerOp({type:'rename',name:v})),
    el('div',{class:'two-fields'},el('label',{class:'check'},el('input',{id:'paint-layer-visible',type:'checkbox',checked:layer.visible,onchange:e=>layerOp({type:'visibility',value:e.target.checked})}),'표시'),el('label',{class:'check'},el('input',{id:'paint-layer-lock',type:'checkbox',checked:layer.locked,onchange:e=>layerOp({type:'lock',value:e.target.checked})}),'잠금')),
    field('레이어 불투명도 (%)','paint-layer-opacity',Math.round(layer.opacity*100),v=>layerOp({type:'opacity',value:v/100}),{type:'number',min:0,max:100}),
    el('div',{class:'two-fields'},button('위로',()=>layerOp({type:'reorder',index:Math.min(session.layers.length-1,session.layers.findIndex(l=>l.id===layer.id)+1)}),{id:'paint-layer-up'}),button('아래로',()=>layerOp({type:'reorder',index:Math.max(0,session.layers.findIndex(l=>l.id===layer.id)-1)}),{id:'paint-layer-down'})),
    button('아래 레이어와 합치기',()=>layerOp({type:'mergeDown'}),{id:'paint-merge-layer',class:'wide'}));
   panel.append(layers,toolSettings,selectionPanel,el('p',{class:'hint'},'카드에 적용하면 투명 여백을 뺀 그림만 들어가요. 원본 캔버스와 레이어는 보관해요. 그림 기록은 최근 40단계 또는 128 MiB이고, 적용은 카드 기록 한 단계예요.'));
  });panel.querySelector('.paint-layer-list').scrollTop=layerScroll;panel.scrollTop=scroll;
 }
 function startLayerDrag(event,layerId,list){
  if(event.button!==0||busy||session.busy||session.history.isBusy())return;
  if(tools.isFloating()||tools.isGesture()){note('선택 변형이나 획을 먼저 확정하거나 취소하세요.');return;}
  cancelLayerDrag();layerDrag={layerId,list,pointerId:event.pointerId,startX:event.clientX,startY:event.clientY,x:event.clientX,y:event.clientY,started:false,index:null,frame:0};
 }
 function layerDropPosition(scroll=true){
  const d=layerDrag;if(!d)return;const box=d.list.getBoundingClientRect(),rows=[...d.list.querySelectorAll('.paint-layer')];
  for(const row of rows)row.classList.remove('drop-before','drop-after');d.index=null;
  if(d.x<box.left||d.x>box.right||d.y<box.top||d.y>box.bottom)return;
  if(scroll){if(d.y<box.top+24)d.list.scrollTop-=10;else if(d.y>box.bottom-24)d.list.scrollTop+=10;}
  let slot=rows.findIndex(row=>{const r=row.getBoundingClientRect();return d.y<r.top+r.height/2;});if(slot<0)slot=rows.length;
  const source=rows.findIndex(row=>row.dataset.layerId===d.layerId),index=slot>source?slot-1:slot,target=rows[Math.min(slot,rows.length-1)];
  d.index=rows.length-1-index;target.classList.add(slot===rows.length?'drop-after':'drop-before');
  const hint=panel.querySelector('#paint-layer-drop-hint'),name=session.layers.find(l=>l.id===target.dataset.layerId)?.name||'이름 없는 레이어',text=name+' '+(slot===rows.length?'아래':'위')+'에 놓기';if(hint.textContent!==text)hint.textContent=text;
 }
 function layerDragFrame(){if(!layerDrag?.started)return;layerDropPosition();layerDrag.frame=requestAnimationFrame(layerDragFrame);}
 function moveLayerDrag(event){
  const d=layerDrag;if(!d||event.pointerId!==d.pointerId)return;
  if(busy||session.busy||session.history.isBusy()||tools.isFloating()){cancelLayerDrag();return;}
  d.x=event.clientX;d.y=event.clientY;
  if(!d.started){if(Math.hypot(d.x-d.startX,d.y-d.startY)<5)return;d.started=true;note('');d.list.setPointerCapture(d.pointerId);[...d.list.children].find(row=>row.dataset.layerId===d.layerId)?.classList.add('dragging');dialog.classList.add('layer-reordering');d.frame=requestAnimationFrame(layerDragFrame);}
  event.preventDefault();layerDropPosition();
 }
 function cancelLayerDrag(){
  const d=layerDrag;if(!d)return;layerDrag=null;cancelAnimationFrame(d.frame);if(d.started)suppressedLayerPointer=d.pointerId;
  for(const row of d.list.querySelectorAll('.paint-layer'))row.classList.remove('dragging','drop-before','drop-after');dialog.classList.remove('layer-reordering');
  const hint=panel.querySelector('#paint-layer-drop-hint');if(hint)hint.textContent='레이어를 끌어서 순서를 바꿀 수 있어요.';
  if(d.list.hasPointerCapture(d.pointerId))d.list.releasePointerCapture(d.pointerId);
 }
 function endLayerDrag(event){
  const d=layerDrag;
  if(d&&event.pointerId===d.pointerId){
   d.x=event.clientX;d.y=event.clientY;if(d.started)layerDropPosition(false);const index=d.index,started=d.started,id=d.layerId;cancelLayerDrag();
   if(started){event.preventDefault();if(index!==null&&index!==session.layers.findIndex(l=>l.id===id))void layerOp({type:'reorder',layerId:id,index});}
  }
  if(suppressedLayerPointer===event.pointerId)setTimeout(()=>{if(suppressedLayerPointer===event.pointerId)suppressedLayerPointer=null;},0);
 }
 function cancelLayerPointer(event){if(layerDrag?.pointerId===event.pointerId)cancelLayerDrag();if(suppressedLayerPointer===event.pointerId)suppressedLayerPointer=null;}
 function point(event){return screenToPixel({x:event.clientX,y:event.clientY},viewport.getBoundingClientRect(),view);}
 function pressure(event){return event.pointerType==='pen'?event.pressure||.05:1;}
 function renderCursor(event,at=point(event)){
  const options=tools.getOptions(),snapped=options.pixelSnap&&options.hardness>=.999,square=snapped||options.brushTip==='square';
  let size=Math.max(PAINT_BRUSH_MIN,options.size*(options.pressureSize?Math.max(.05,pressure(event)):1)),x=at.x,y=at.y;
  if(snapped)size=Math.max(1,Math.round(size));
  if(options.pixelSnap){x=Math.floor(x)+.5;y=Math.floor(y)+.5;if(snapped){x=Math.floor(x-size/2)+size/2;y=Math.floor(y-size/2)+size/2;}}
  cursor.hidden=space||!['brush','eraser'].includes(options.tool);Object.assign(cursor.style,{left:view.panX+x*view.scale+'px',top:view.panY+y*view.scale+'px',width:size*view.scale+'px',height:size*view.scale+'px',borderRadius:square?'0':'50%'});
 }
 function down(event){
  if(busy||event.button>1)return;event.preventDefault();viewport.focus({preventScroll:true});const at=point(event),rect=tools.getSelection(),floating=tools.isFloating(),handle=event.target.closest?.('[data-handle]')?.dataset.handle;
  try{
   renderCursor(event,at);
   if(space||tools.getOptions().tool==='pan'||event.button===1)drag={kind:'pan',x:event.clientX,y:event.clientY,panX:view.panX,panY:view.panY};
   else if(handle&&rect){tools.transform({});drag={kind:'resize',handle,rect:{...rect},floating,at};}
   else if(rect&&(floating||tools.getOptions().tool==='select')&&at.x>=rect.x&&at.y>=rect.y&&at.x<=rect.x+rect.w&&at.y<=rect.y+rect.h){tools.transform({});drag={kind:'move',rect:{...rect},floating,at};}
   else{tools.begin(at,pressure(event));drag={kind:'tool'};}
   viewport.setPointerCapture(event.pointerId);renderAll();
  }catch(e){note(e.message);drag=null;}
 }
 function move(event){
  const at=point(event);document.getElementById('paint-coords').textContent=Math.floor(at.x)+', '+Math.floor(at.y)+' px';renderCursor(event,at);
  if(!drag)return;event.preventDefault();
  if(drag.kind==='pan'){fitMode=false;view.panX=drag.panX+event.clientX-drag.x;view.panY=drag.panY+event.clientY-drag.y;}
  else if(drag.kind==='move')tools.transform({x:drag.rect.x+at.x-drag.at.x,y:drag.rect.y+at.y-drag.at.y});
  else if(drag.kind==='resize'){
   const r=drag.rect,h=drag.handle,left=h.includes('w')?Math.min(r.x+r.w-1,at.x):r.x,right=h.includes('e')?Math.max(r.x+1,at.x):r.x+r.w,top=h.includes('n')?Math.min(r.y+r.h-1,at.y):r.y,bottom=h.includes('s')?Math.max(r.y+1,at.y):r.y+r.h;
   tools.transform({x:left,y:top,w:right-left,h:bottom-top});
  }else tools.move(at,pressure(event));
  requestRender();
 }
 async function up(event){if(!drag)return;const current=drag;drag=null;if(viewport.hasPointerCapture(event.pointerId))viewport.releasePointerCapture(event.pointerId);if(current.kind==='tool')await run(()=>tools.end());else renderAll();}
 function restoreDrag(){
  tools.cancel();
  if(drag?.kind==='pan'){view.panX=drag.panX;view.panY=drag.panY;}
  else if(drag&&drag.kind!=='tool'){if(drag.floating)tools.transform(drag.rect);else tools.cancelSelection();}
  drag=null;
 }
 function cancel(event){if(!drag)return;restoreDrag();renderAll();if(viewport.hasPointerCapture(event.pointerId))viewport.releasePointerCapture(event.pointerId);}
 const touchView=mountTouchViewport({viewport,onStart:()=>{if(busy)return false;restoreDrag();cursor.hidden=true;renderAll();return true;},onChange:({factor,from,to})=>{if(busy)return;const box=viewport.getBoundingClientRect();fitMode=false;view=zoomAt(view,{x:from.x-box.left,y:from.y-box.top},view.scale*factor);view.panX+=to.x-from.x;view.panY+=to.y-from.y;renderViewport();}});
 viewport.addEventListener('pointerdown',down);viewport.addEventListener('pointermove',move);viewport.addEventListener('pointerup',up);viewport.addEventListener('pointercancel',cancel);viewport.addEventListener('pointerleave',()=>cursor.hidden=true);
 viewport.addEventListener('wheel',event=>{event.preventDefault();if(busy)return;const r=viewport.getBoundingClientRect();fitMode=false;view=zoomAt(view,{x:event.clientX-r.left,y:event.clientY-r.top},view.scale*Math.exp(-event.deltaY*.0015));renderViewport();},{passive:false});
 function key(event){
  if(closed||document.querySelector('dialog[open]:last-of-type')!==dialog)return;
  if(event.key==='Escape'&&layerDrag){event.preventDefault();cancelLayerDrag();return;}
  if(typing(event.target))return;
  const k=event.key.toLowerCase();
  if((event.ctrlKey||event.metaKey)&&k==='a'){event.preventDefault();selectAll();}
  else if((event.ctrlKey||event.metaKey)&&k==='z'){event.preventDefault();event.shiftKey?redo():undo();}
  else if((event.ctrlKey||event.metaKey)&&['c','x','v'].includes(k)){event.preventDefault();if(k==='c')call(()=>tools.copy());else if(k==='x')run(()=>tools.cut());else call(()=>tools.paste());}
  else if(event.code==='Space'){event.preventDefault();space=true;renderViewport();}
  else if(k==='escape'&&(tools.isFloating()||tools.isGesture())){event.preventDefault();tools.cancel();tools.cancelSelection();renderAll();}
  else if(k==='enter'&&tools.isFloating()){event.preventDefault();run(()=>tools.commitSelection());}
  else if(TOOLS.some(t=>t[3].toLowerCase()===k)){event.preventDefault();setTool(TOOLS.find(t=>t[3].toLowerCase()===k)[0]);}
  else if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)&&tools.getSelection()){event.preventDefault();const r=tools.getSelection(),step=event.shiftKey?10:1;call(()=>tools.transform({x:r.x+(event.key==='ArrowLeft'?-step:event.key==='ArrowRight'?step:0),y:r.y+(event.key==='ArrowUp'?-step:event.key==='ArrowDown'?step:0)}));}
 }
 function keyUp(event){if(event.code==='Space'){space=false;renderViewport();}}
 dialog.addEventListener('cancel',event=>{event.preventDefault();if(layerDrag)cancelLayerDrag();else close();});
 dialog.addEventListener('close',()=>{if(closed||closing)return;dialog.showModal();close();});
 window.addEventListener('keydown',key);window.addEventListener('keyup',keyUp);window.addEventListener('resize',resize);window.addEventListener('pointermove',moveLayerDrag,{passive:false});window.addEventListener('pointerup',endLayerDrag);window.addEventListener('pointercancel',cancelLayerPointer);
 const unsub=session.history.subscribe(requestRender);renderAll();requestAnimationFrame(fit);
 async function resizeDialog(){
  if(busy)return;const d=el('dialog',{class:'confirm-dialog'},el('h2',{},'캔버스 크기 변경'),el('p',{},'범위만 변경하면 픽셀 크기를 유지하고 기준점에 맞춰 여백 또는 잘림을 바꿔요. 리샘플은 그림 자체를 확대·축소해요.'));
  const w=el('input',{id:'paint-new-width',type:'number',min:64,max:4096,value:session.width}),h=el('input',{id:'paint-new-height',type:'number',min:64,max:4096,value:session.height}),anchor=el('select',{id:'paint-anchor'},Object.entries({'top-left':'왼쪽 위',top:'위 가운데','top-right':'오른쪽 위',left:'왼쪽 가운데',center:'가운데',right:'오른쪽 가운데','bottom-left':'왼쪽 아래',bottom:'아래 가운데','bottom-right':'오른쪽 아래'}).map(([v,name])=>el('option',{value:v},name)));anchor.value='center';
  const op=type=>({type,width:Number(w.value),height:Number(h.value),anchor:anchor.value});
  d.append(el('div',{class:'two-fields'},el('label',{class:'field'},el('span',{},'가로 px'),w),el('label',{class:'field'},el('span',{},'세로 px'),h)),el('label',{class:'field'},el('span',{},'범위 변경 기준점'),anchor),el('div',{class:'dialog-actions'},button('취소',()=>d.close()),button('그림도 리샘플',async()=>{const choice=await openDialog({title:'그림 픽셀을 확대·축소할까요?',message:'리샘플은 모든 레이어의 그림 픽셀을 바꿔요. 실행 취소할 수 있습니다.',choices:[{id:'yes',label:'리샘플 적용'},{id:'no',label:'취소'}]});if(choice==='yes'&&await layerOp(op('resample')))d.close();},{id:'paint-resample'}),button('범위만 변경',async()=>{if(await layerOp(op('resizeCanvas')))d.close();},{id:'paint-resize-canvas',class:'primary'})));
  d.addEventListener('close',()=>d.remove(),{once:true});document.body.append(d);d.showModal();
 }
 return outcome;
}
