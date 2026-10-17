import {el,button,field,preserveFocus,showMessage} from './dom.js';
import {planSheets,denseA4Print} from '../printing/layout.js';
import {cropMarks} from '../printing/marks.js';
import {loadAssets} from '../model/assets.js';
import {renderCard} from '../render/card.js';
import {getEffectFrameSec} from '../model/visual-effects.js';
import {effectPreviewDpi} from './effect-preview.js';
import {CSS_MM,wheelZoomFactor,captureViewAnchor,restoreViewAnchor} from './view-zoom.js';
export function mountPaperView(root,store){
 let zoom=40,calibration=1,tick=0,destroyed=false,lastRatio=window.devicePixelRatio||1;
 const controls=el('div',{class:'print-controls'}),summary=el('div',{id:'paper-summary',class:'paper-summary'}),scroll=el('div',{class:'paper-scroll'});
 const zoomInput=el('input',{id:'paper-zoom',type:'number',min:10,max:200,step:.1,value:zoom,'aria-label':'용지 배율',onchange:e=>setZoom(Number(e.target.value)||40)});
 const label=el('span',{id:'paper-scale-label'});
 const footer=el('div',{class:'paper-footer'},label,zoomInput,el('span',{},'%'),button('전체 맞춤',()=>{try{const p=planSheets(store.getProject());setZoom(Math.min(100,Math.floor(100*Math.min((scroll.clientWidth-80)/(p.widthMm*CSS_MM*calibration),(scroll.clientHeight-65)/(p.heightMm*CSS_MM*calibration)))));}catch(e){showMessage(e.message);}},{id:'paper-fit'}),button('실제 크기 100%',()=>setZoom(100)),button('화면 자 보정',calibrate,{id:'paper-calibration'}),el('span',{},'Ctrl+휠 확대·축소'));
 root.replaceChildren(controls,summary,scroll,footer);root.classList.add('paper-view');
 const edit=(key,value)=>{try{store.edit('인쇄 설정',d=>d.print[key]=value);}catch(e){showMessage(e.message);refresh();}};
 function settings(){
  preserveFocus(()=>{const p=store.getProject().print;controls.replaceChildren(
   button('A4 꽉 채우기',()=>{try{store.edit('A4 꽉 채우기',d=>d.print=denseA4Print(d));}catch(e){showMessage(e.message);}},{id:'print-dense',class:'primary'}),
   field('용지','print-paper',p.paper,v=>edit('paper',v),{options:[['A4','A4 · 210 × 297 mm'],['Letter','Letter · 215.9 × 279.4 mm']]}),
   field('방향','print-orientation',p.orientation,v=>edit('orientation',v),{options:[['portrait','세로'],['landscape','가로']]}),
   field('여백 (mm)','print-margin',p.marginMm,v=>edit('marginMm',v),{type:'number',min:0,step:.5}),
   field('간격 (mm)','print-gap',p.gapMm,v=>edit('gapMm',v),{type:'number',min:0,step:.5}),
   el('label',{class:'check'},el('input',{id:'print-duplex',type:'checkbox',checked:p.duplex,onchange:e=>edit('duplex',e.target.checked)}),'양면 인쇄'),
   field('뒤집기','print-flip',p.flip,v=>edit('flip',v),{options:[['long','긴 변으로 넘기기'],['short','짧은 변으로 넘기기']]}),
   field('뒷면 X 보정 (mm)','print-offset-x',p.backOffsetXmm,v=>edit('backOffsetXmm',v),{type:'number',step:.1}),
   field('뒷면 Y 보정 (mm)','print-offset-y',p.backOffsetYmm,v=>edit('backOffsetYmm',v),{type:'number',step:.1}),
   field('고정 인쇄 장면 (초)','print-effect-frame',getEffectFrameSec(store.getProject()),v=>edit('effectFrameSec',v),{type:'number',min:0,step:.01}),
   el('label',{class:'check'},el('input',{id:'print-crop',type:'checkbox',checked:p.cropMarks,onchange:e=>edit('cropMarks',e.target.checked)}),'재단선')
  );});
 }
 function ruler(length,horizontal,scale){
  const node=el('div',{class:horizontal?'mm-ruler horizontal':'mm-ruler vertical'});
  for(let mm=0;mm<=length;mm+=10){const mark=el('span',{class:'ruler-tick'},String(mm));mark.style[horizontal?'left':'top']=mm*scale+'px';node.append(mark);}return node;
 }
 function marksSvg(page,plan){
  const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');svg.classList.add('crop-overlay');svg.setAttribute('viewBox','0 0 '+plan.widthMm+' '+plan.heightMm);
  for(const m of cropMarks(page,plan)){const line=document.createElementNS(ns,'line');for(const [k,v] of Object.entries(m))line.setAttribute(k,v);line.setAttribute('stroke','#59655f');line.setAttribute('stroke-width','.14');svg.append(line);}return svg;
 }
 function setZoom(value,point){
  if(destroyed||!Number.isFinite(value))return;
  const next=Math.round(Math.max(10,Math.min(200,value))*10)/10;if(next===zoom){zoomInput.value=zoom;return;}
  const sheets=[...scroll.querySelectorAll('.paper-sheet')],sheet=sheets.find(node=>{const r=node.getBoundingClientRect();return point&&point.y>=r.top&&point.y<=r.bottom;})||sheets[0];
  const anchor=sheet?captureViewAnchor(scroll,sheet,point):null,sheetIndex=sheets.indexOf(sheet);zoom=next;refresh({anchor,sheetIndex});
 }
 function wheel(event){
  if(!event.ctrlKey&&!event.metaKey||document.querySelector('dialog[open]'))return;
  event.preventDefault();if(!Number.isFinite(event.deltaY))return;
  setZoom(zoom*wheelZoomFactor(event,scroll),{x:event.clientX,y:event.clientY});
 }
 function resized(){if(!root.hidden&&lastRatio!==(window.devicePixelRatio||1))refresh();}
 async function refresh({anchor=null,sheetIndex=0}={}){
  if(destroyed)return;const own=++tick,p=store.getProject();settings();zoomInput.value=zoom;label.textContent=zoom+'%'+(calibration!==1?' · 화면 보정 적용':'');
  let plan;try{plan=planSheets(p);}catch(e){summary.textContent=e.message;scroll.replaceChildren();return;}
  summary.textContent=plan.columns+' × '+plan.rows+' 배치 · 한 면 '+plan.capacity+'장 · '+plan.pages.length+'페이지 · '+p.settings.cardWidthMm+' × '+p.settings.cardHeightMm+' mm · 고정 이펙트 '+getEffectFrameSec(p).toFixed(2)+'초 (PDF도 같은 장면)';
  let assets;try{assets=await loadAssets(p);}catch(e){showMessage(e.message);return;}if(own!==tick||destroyed)return;
  const scale=zoom/100*CSS_MM*calibration,cache=new Map(),fragment=document.createDocumentFragment();lastRatio=window.devicePixelRatio||1;
  const dpi=effectPreviewDpi({widthMm:p.settings.cardWidthMm,heightMm:p.settings.cardHeightMm,displayWidth:p.settings.cardWidthMm*scale,pixelRatio:lastRatio});
  for(const [index,page] of plan.pages.entries()){
   const frame=el('section',{class:'paper-frame'},el('h3',{},(index+1)+' / '+plan.pages.length+' · '+(page.side==='front'?'앞면':'뒷면')+' '+(page.pairIndex+1)+' · '+plan.widthMm+' × '+plan.heightMm+' mm'));
   const sheet=el('div',{class:'paper-sheet','data-width-mm':plan.widthMm,'data-height-mm':plan.heightMm,'data-side':page.side});sheet.style.width=plan.widthMm*scale+'px';sheet.style.height=plan.heightMm*scale+'px';
   for(const c of page.cells){
    const cell=el('div',{class:'paper-cell'+(c.cardId?'':' blank'),...(c.cardId?{'data-card-id':c.cardId}:{}),'data-x-mm':c.xMm,'data-y-mm':c.yMm});
    Object.assign(cell.style,{left:c.xMm*scale+'px',top:c.yMm*scale+'px',width:c.widthMm*scale+'px',height:c.heightMm*scale+'px'});
    if(c.cardId){const key=page.side==='back'?'back':c.cardId;if(!cache.has(key)){const canvas=el('canvas');renderCard(canvas.getContext('2d',{willReadFrequently:true}),p,page.side==='back'?p.back:p.cards.find(card=>card.id===c.cardId),assets,dpi);cache.set(key,{src:canvas.toDataURL(),width:canvas.width});}
     const image=cache.get(key),img=el('img',{src:image.src,alt:page.side==='back'?'공통 뒷면':p.cards.find(card=>card.id===c.cardId).name,draggable:false,'data-preview-dpi':dpi});img.style.imageRendering=image.width+.5<c.widthMm*scale*lastRatio?'pixelated':'auto';cell.append(img);
    }else cell.append(el('span',{},'빈 칸'));sheet.append(cell);
   }
   if(p.print.cropMarks)sheet.append(marksSvg(page,plan));
   frame.append(el('div',{class:'paper-measured'},ruler(plan.widthMm,true,scale),ruler(plan.heightMm,false,scale),sheet));fragment.append(frame);
  }
  scroll.replaceChildren(fragment);
  const sheet=scroll.querySelectorAll('.paper-sheet')[sheetIndex];if(sheet)restoreViewAnchor(scroll,sheet,anchor);
 }
 async function calibrate(){
  const dialog=el('dialog',{class:'confirm-dialog'},el('h2',{},'화면 자 보정'),el('p',{},'아래 선을 실제 자로 재고 길이를 입력하세요. 보정은 화면에만 적용돼요. PDF는 항상 설정한 mm 치수를 사용해요.'));
  const sample=el('div',{class:'calibration-ruler'},'100 mm');sample.style.width=100*CSS_MM*calibration+'px';
  const measured=el('input',{id:'ruler-measured',type:'number',min:1,value:100,'aria-label':'자로 잰 길이 (mm)'});
  dialog.append(sample,el('label',{class:'field'},el('span',{},'실제로 잰 길이 (mm)'),measured),el('div',{class:'dialog-actions'},button('보정 초기화',()=>{calibration=1;dialog.close();refresh();}),button('취소',()=>dialog.close()),button('보정 적용',()=>{const mm=Number(measured.value);if(mm<=0||!Number.isFinite(mm))return;calibration*=100/mm;dialog.close();refresh();},{id:'apply-calibration',class:'primary'})));
  document.body.append(dialog);dialog.addEventListener('close',()=>dialog.remove(),{once:true});dialog.showModal();
 }
 scroll.addEventListener('wheel',wheel,{passive:false});window.addEventListener('resize',resized);
 const unsub=store.subscribe(refresh);refresh();return {refresh,destroy(){destroyed=true;tick++;unsub();scroll.removeEventListener('wheel',wheel);window.removeEventListener('resize',resized);root.replaceChildren();}};
}
