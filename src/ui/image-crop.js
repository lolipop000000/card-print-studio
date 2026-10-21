import {el,button,field} from './dom.js';
import {decodeImage} from '../model/assets.js';
import {removeImageBackground} from '../model/background-removal.js';
import {IMAGE_CROP_LIMITS,validateImageSize,validateCropRect,cropRectFromPoints,sourcePointFromClient,createSpriteGrid,validateCropBatch,cropAssetRegions} from '../model/image-crop.js';
const inputNumber=event=>event.target.value===''?null:Number(event.target.value);

/** Return independent PNG assets; closing this native dialog never applies edits. */
export async function openImageCropper({asset,name='그림',initialMode='manual',initialGrid={},removeBackground=removeImageBackground}={}){
 const source={...asset},size=validateImageSize(source),image=await decodeImage(source.dataUrl);
 if(image.naturalWidth!==size.width||image.naturalHeight!==size.height)throw new Error('그림의 실제 크기와 저장된 크기가 다릅니다. 원본을 다시 가져오세요.');
 if(document.getElementById('image-cropper'))throw new Error('열려 있는 이미지 자르기 창을 먼저 닫아 주세요.');
 return new Promise(resolve=>{
  let mode=initialMode==='grid'?'grid':'manual',rect={x:0,y:0,...size},regions=[],regionCounter=0,cells=[],selected=new Set(),gridSignature='',zoom='fit',scale=1,busy=false,disposed=false,drag=null;
  let workingSource=source,processedImage=null,backgroundController=null,processingMessage='';
  const previousFocus=document.activeElement,grid={rows:1,columns:1,cellWidth:size.width,cellHeight:size.height,offsetX:0,offsetY:0,gapX:0,gapY:0,...initialGrid},rectInputs={},gridInputs={};
  const dialog=el('dialog',{id:'image-cropper',class:'image-crop-dialog','aria-labelledby':'crop-title',style:'width:min(1160px,calc(100vw - 32px));max-width:none;max-height:calc(100dvh - 32px);overflow:auto;'});
  const status=el('p',{id:'crop-status',class:'image-crop-status',role:'status','aria-live':'polite'});
  const baseName=el('input',{id:'crop-name',type:'text',maxLength:100,value:String(name||'그림').replace(/\.(png|jpe?g|webp)$/i,''),onchange:()=>update()});
  const viewport=el('div',{id:'crop-viewport',class:'image-crop-viewport',style:'height:min(58vh,560px);min-height:180px;overflow:auto;position:relative;padding:12px;box-sizing:border-box;'});
  const stage=el('div',{id:'crop-stage',class:'image-crop-stage',style:'position:relative;touch-action:none;user-select:none;flex:none;'});
  const canvas=el('canvas',{'aria-hidden':'true',style:'display:block;width:100%;height:100%;pointer-events:none;'});
  const previewScale=Math.min(1,2048/size.width,2048/size.height);canvas.width=Math.max(1,Math.round(size.width*previewScale));canvas.height=Math.max(1,Math.round(size.height*previewScale));canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);
  const overlay=el('div',{class:'image-crop-overlay',style:'position:absolute;inset:0;pointer-events:none;'});stage.append(canvas,overlay);viewport.append(stage);
  const zoomSelect=el('select',{id:'crop-zoom','aria-label':'이미지 보기 배율',onchange:()=>setZoom(zoomSelect.value)},[['fit','맞춤'],['0.25','25%'],['0.5','50%'],['1','100%'],['2','200%'],['4','400%'],['8','800%']].map(([value,label])=>el('option',{value},label)));
  const manualButton=button('영역 자르기',()=>{mode='manual';update();},{id:'crop-mode-manual','aria-pressed':'true'});
  const gridButton=button('스프라이트 시트',()=>{mode='grid';update();},{id:'crop-mode-grid','aria-pressed':'false'});
  const backgroundReset=button('원본 배경으로 복원',()=>{
   if(busy||disposed)return;releaseProcessedImage();workingSource=source;drawPreview(image);update();
  },{id:'crop-background-reset',disabled:true});
  const backgroundRemove=button('사람·물체만 자동으로 남기기',async()=>{
   if(busy||disposed)return;
   const controller=new AbortController();backgroundController=controller;busy=true;processingMessage='배경 제거를 준비하고 있습니다…';releaseDrag();update();
   let result;
   try{
    result=await removeBackground(image,{signal:controller.signal,onProgress:progress=>{if(disposed||controller.signal.aborted)return;processingMessage=progress?.message||'사람·물체를 찾고 있습니다…';status.dataset.kind='info';status.textContent=processingMessage;}});
    if(disposed||controller.signal.aborted)return;
    if(!result||result.width!==size.width||result.height!==size.height||typeof result.toDataURL!=='function')throw new Error('배경 제거 결과 크기를 확인하지 못했습니다. 원본으로 다시 시도하세요.');
    const dataUrl=result.toDataURL('image/png');if(!dataUrl.startsWith('data:image/png;base64,'))throw new Error('배경 제거 결과를 PNG로 만들지 못했습니다. 더 작은 그림으로 다시 시도하세요.');
    releaseProcessedImage();processedImage=result;result=null;workingSource={...source,mime:'image/png',dataUrl,paintingId:null};drawPreview(processedImage);
    busy=false;backgroundController=null;processingMessage='';update();
   }catch(error){if(!disposed){busy=false;backgroundController=null;processingMessage='';update();if(error?.name!=='AbortError')showError(error);}}
   finally{if(result)result.width=result.height=1;}
  },{id:'crop-remove-background'});
  const backgroundPanel=el('section',{id:'crop-background-panel'},el('div',{class:'image-crop-tools'},backgroundRemove,backgroundReset),
   el('p',{class:'image-crop-hint'},'사람·물체를 자동으로 구분해 배경을 투명하게 만들어요. 처음 사용할 때 처리 도구를 내려받고, 그림은 이 기기에서 처리해요. 결과를 확인한 뒤 PNG로 저장하세요.'));
  const manualFields=el('div',{id:'crop-rect-fields',class:'image-crop-fields'},[['X','x'],['Y','y'],['너비','width'],['높이','height']].map(([label,key])=>{
   const change=value=>{rect={...rect,[key]:value};update();};
   const node=field(label,'crop-'+key,rect[key],change,{type:'number',min:key==='x'||key==='y'?0:1,step:1,oninput:event=>change(inputNumber(event))});rectInputs[key]=node.querySelector('input');return node;
  }));
  const regionList=el('div',{id:'crop-region-list',class:'image-crop-region-list'});
  const add=button('현재 영역을 목록에 추가',()=>{
   try{validateCropRect(rect,size);if(regions.length>=IMAGE_CROP_LIMITS.maxCells)throw new Error('영역 목록은 최대 256개입니다. 먼저 나누어 저장하세요.');
    regions.push({rect:{...rect},name:cleanName()+'-영역'+String(++regionCounter).padStart(3,'0')});renderRegions();update();
   }catch(error){showError(error);}
  },{id:'crop-region-add'});
  const manualPanel=el('section',{id:'crop-manual-panel'},el('p',{class:'image-crop-hint'},'그림을 드래그하거나 원본 픽셀 좌표를 입력하세요.'),manualFields,
   el('div',{class:'image-crop-tools'},button('전체 영역',()=>{rect={x:0,y:0,...size};syncRectInputs();update();},{id:'crop-full'}),add),
   el('p',{class:'image-crop-hint'},'목록이 비어 있으면 현재 영역을 저장합니다. 여러 조각은 목록에 추가한 뒤 함께 저장하세요.'),regionList);
  const autoSize=el('input',{id:'crop-grid-auto-size',type:'checkbox',checked:true,onchange:()=>{
   if(!autoSize.checked){grid.cellWidth=Number(gridInputs.cellWidth.value);grid.cellHeight=Number(gridInputs.cellHeight.value);}update();
  }});
  const gridFields=el('div',{class:'image-crop-fields'},[['행','rows',1],['열','columns',1],['셀 너비','cellWidth',1],['셀 높이','cellHeight',1],['시작 X','offsetX',0],['시작 Y','offsetY',0],['가로 간격','gapX',0],['세로 간격','gapY',0]].map(([label,key,min])=>{
   const slug={cellWidth:'cell-width',cellHeight:'cell-height',offsetX:'offset-x',offsetY:'offset-y',gapX:'gap-x',gapY:'gap-y'}[key]||key;
   const change=value=>{grid[key]=value;update();};
   const node=field(label,'crop-grid-'+slug,grid[key],change,{type:'number',min,step:1,oninput:event=>change(inputNumber(event))});gridInputs[key]=node.querySelector('input');return node;
  }));
  const gridPanel=el('section',{id:'crop-grid-panel',hidden:true},el('label',{class:'image-crop-auto'},autoSize,'행·열에 맞춰 셀 크기 계산'),gridFields,
   el('div',{class:'image-crop-tools'},button('모두 선택',()=>{selected=new Set(cells.map(cellKey));update();},{id:'crop-grid-all'}),button('선택 해제',()=>{selected.clear();update();},{id:'crop-grid-none'})),
   el('p',{class:'image-crop-hint'},'그림 위 셀을 눌러 저장할 조각만 선택하세요. 배경 제거는 시트 전체에 적용되며, 선택한 셀만 각각 PNG로 저장해요. 이펙트의 여러 컷 재생에서 반복·랜덤 소환을 조절할 수 있어요.'));
  const save=button('PNG 저장',async()=>{
   if(busy||disposed)return;
   let outputs;try{outputs=validateCropBatch(size,currentRegions());}catch(error){showError(error);return;}
   busy=true;update();
   try{
    await new Promise(requestAnimationFrame);if(disposed)return;
    const result=await cropAssetRegions(workingSource,outputs);if(!disposed)finish(result);
   }catch(error){if(!disposed){busy=false;update();showError(error);}}
  },{id:'crop-save',class:'primary'});
  dialog.append(el('div',{class:'image-crop-heading'},el('div',{},el('h2',{id:'crop-title'},'이미지 자르기·배경 제거'),el('p',{},`${size.width} × ${size.height} px · 원본은 그대로 보관합니다.`)),button('닫기',()=>finish(null),{'aria-label':'이미지 편집 닫기'})),
   el('div',{class:'image-crop-modes'},manualButton,gridButton),
   el('div',{class:'image-crop-body',style:'display:grid;grid-template-columns:minmax(0,1fr) 300px;gap:16px;align-items:start;'},
    el('div',{class:'image-crop-preview',style:'min-width:0;'},el('div',{class:'image-crop-zoom'},el('label',{htmlFor:'crop-zoom'},'보기'),zoomSelect,button('맞춤',()=>setZoom('fit'))),viewport),
    el('div',{class:'image-crop-controls'},el('label',{class:'field',htmlFor:'crop-name'},el('span',{},'조각 이름'),baseName),backgroundPanel,manualPanel,gridPanel)),
   status,el('div',{class:'dialog-actions'},button('취소',()=>finish(null),{id:'crop-cancel'}),save));

  function cleanName(){return baseName.value.trim()||'그림';}
  function drawPreview(sourceImage){const context=canvas.getContext('2d');context.clearRect(0,0,canvas.width,canvas.height);context.drawImage(sourceImage,0,0,canvas.width,canvas.height);}
  function releaseProcessedImage(){if(processedImage)processedImage.width=processedImage.height=1;processedImage=null;}
  function cellKey(cell){return cell.row+':'+cell.column;}
  function currentRegions(){
   if(mode==='manual')return regions.length?regions.map(region=>({...region,rect:{...region.rect}})):[{rect:{...rect},name:cleanName()+'-영역001'}];
   return cells.filter(cell=>selected.has(cellKey(cell))).map(cell=>({rect:cell.rect,name:cleanName()+'-행'+String(cell.row+1).padStart(2,'0')+'-열'+String(cell.column+1).padStart(2,'0')}));
  }
  function showError(error){status.dataset.kind='error';status.textContent=error?.message||'영역을 저장하지 못했습니다. 크기를 줄여 다시 시도하세요.';}
  function syncRectInputs(){for(const key of Object.keys(rectInputs))rectInputs[key].value=rect[key]??'';}
  function renderRegions(){
   regionList.replaceChildren(...regions.map((region,index)=>el('div',{class:'image-crop-region'},
    el('input',{type:'text',value:region.name,maxLength:100,'aria-label':`${index+1}번 영역 이름`,onchange:event=>{region.name=event.target.value;update();}}),
    el('small',{},`${region.rect.width} × ${region.rect.height}`),button('보기',()=>{rect={...region.rect};syncRectInputs();update();}),button('삭제',()=>{regions.splice(index,1);renderRegions();update();},{'aria-label':`${index+1}번 영역 삭제`}))));
  }
  function position(rectangle){return `position:absolute;left:${rectangle.x/size.width*100}%;top:${rectangle.y/size.height*100}%;width:${rectangle.width/size.width*100}%;height:${rectangle.height/size.height*100}%;box-sizing:border-box;`;}
  function renderOverlay(){
   const nodes=[];
   if(mode==='manual'){
    for(const [index,region] of regions.entries())nodes.push(el('div',{class:'image-crop-captured',style:position(region.rect)},el('span',{},String(index+1))));
    try{validateCropRect(rect,size);nodes.push(el('div',{class:'image-crop-selection',style:position(rect)+'border:2px solid #f8c35f;box-shadow:0 0 0 1px #172b2c;'},el('span',{},`${rect.width} × ${rect.height}`)));}catch{}
   }else{
    for(const cell of cells){const chosen=selected.has(cellKey(cell));nodes.push(button(String(cell.row+1)+'·'+String(cell.column+1),()=>{
     const key=cellKey(cell);if(selected.has(key))selected.delete(key);else selected.add(key);update();
    },{id:`crop-cell-${cell.row}-${cell.column}`,class:'image-crop-cell','aria-label':`${cell.row+1}행 ${cell.column+1}열`,'aria-pressed':String(chosen),disabled:busy,style:position(cell.rect)+'pointer-events:auto;min-width:0;min-height:0;padding:0;border:1px solid '+(chosen?'#f8c35f':'#94a8a1')+';background:'+(chosen?'#f8c35f30':'#172b2c15')+';'}));}
   }
   overlay.replaceChildren(...nodes);
  }
  function update(){
   if(disposed)return;
   manualPanel.hidden=mode!=='manual';gridPanel.hidden=mode!=='grid';manualButton.setAttribute('aria-pressed',String(mode==='manual'));gridButton.setAttribute('aria-pressed',String(mode==='grid'));
   manualButton.disabled=gridButton.disabled=baseName.disabled=autoSize.disabled=backgroundRemove.disabled=busy;backgroundReset.disabled=busy||!processedImage;
   for(const input of Object.values(rectInputs))input.disabled=busy;
   for(const [key,input] of Object.entries(gridInputs))input.disabled=busy||autoSize.checked&&['cellWidth','cellHeight'].includes(key);
   backgroundRemove.textContent=backgroundController?'자동 배경 제거 중…':'사람·물체만 자동으로 남기기';
   let count=0;
   try{
    if(mode==='manual')validateCropRect(rect,size);
    else{
     cells=[];
     cells=createSpriteGrid(size,{...grid,cellWidth:autoSize.checked?undefined:grid.cellWidth,cellHeight:autoSize.checked?undefined:grid.cellHeight});
     const signature=JSON.stringify(cells);if(signature!==gridSignature){gridSignature=signature;selected=new Set(cells.map(cellKey));}
     gridInputs.cellWidth.disabled=gridInputs.cellHeight.disabled=autoSize.checked||busy;
     if(autoSize.checked){gridInputs.cellWidth.value=cells[0].rect.width;gridInputs.cellHeight.value=cells[0].rect.height;}
    }
    const outputs=validateCropBatch(size,currentRegions());count=outputs.length;save.disabled=busy;add.disabled=busy||regions.length>=IMAGE_CROP_LIMITS.maxCells;
    status.dataset.kind='info';status.textContent=busy?(processingMessage||'원본 해상도의 PNG를 만들고 있습니다…'):`${count}개 조각 · PNG로 저장 · ${processedImage?'배경 제거 결과 적용':'투명도 유지'}`;
   }catch(error){save.disabled=true;add.disabled=true;showError(error);}
   save.textContent=busy?(backgroundController?'배경 처리 중…':'PNG 만드는 중…'):count+'개 PNG 저장';renderOverlay();
  }
  function setZoom(value){
   if(disposed)return;
   const before=stage.getBoundingClientRect(),area=viewport.getBoundingClientRect(),anchor={x:area.left+viewport.clientWidth/2,y:area.top+viewport.clientHeight/2};
   const point=before.width?{x:(anchor.x-before.left)/before.width,y:(anchor.y-before.top)/before.height}:{x:.5,y:.5};
   zoom=value;scale=value==='fit'?Math.min(1,Math.max(1,viewport.clientWidth-24)/size.width,Math.max(1,viewport.clientHeight-24)/size.height):Math.max(.01,Math.min(8,Number(value)||1));
   zoomSelect.value=value;stage.style.width=size.width*scale+'px';stage.style.height=size.height*scale+'px';canvas.style.imageRendering=scale>1?'pixelated':'auto';
   if(value==='fit'){viewport.scrollLeft=viewport.scrollTop=0;}else{const after=stage.getBoundingClientRect();viewport.scrollLeft+=after.left+point.x*after.width-anchor.x;viewport.scrollTop+=after.top+point.y*after.height-anchor.y;}
  }
  function point(event){return sourcePointFromClient({x:event.clientX,y:event.clientY},stage.getBoundingClientRect(),size);}
  function releaseDrag(){if(!drag)return;try{if(stage.hasPointerCapture(drag.id))stage.releasePointerCapture(drag.id);}catch{}drag=null;}
  stage.addEventListener('pointerdown',event=>{
   if(mode!=='manual'||busy||event.button!==0)return;event.preventDefault();drag={id:event.pointerId,start:point(event),before:{...rect}};stage.setPointerCapture(event.pointerId);
  });
  stage.addEventListener('pointermove',event=>{
   if(!drag||drag.id!==event.pointerId)return;const next=cropRectFromPoints(drag.start,point(event),size);if(next){rect=next;syncRectInputs();update();}
  });
  stage.addEventListener('pointerup',event=>{
   if(!drag||drag.id!==event.pointerId)return;rect=cropRectFromPoints(drag.start,point(event),size)||drag.before;releaseDrag();syncRectInputs();update();
  });
  stage.addEventListener('pointercancel',()=>{if(drag){rect=drag.before;releaseDrag();syncRectInputs();update();}});
  const observer=new ResizeObserver(()=>{if(zoom==='fit'&&!disposed)setZoom('fit');});
  function finish(result){
   if(disposed)return;disposed=true;backgroundController?.abort();backgroundController=null;releaseProcessedImage();releaseDrag();observer.disconnect();if(dialog.open)dialog.close();dialog.remove();canvas.width=canvas.height=1;
   if(previousFocus?.isConnected)previousFocus.focus({preventScroll:true});resolve(result);
  }
  dialog.addEventListener('cancel',event=>{event.preventDefault();finish(null);});dialog.addEventListener('close',()=>finish(null));
  document.body.append(dialog);dialog.showModal();update();setZoom('fit');observer.observe(viewport);
 });
}
