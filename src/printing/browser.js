import {validateProject} from '../model/project.js';
import {ensureFont} from '../render/font.js';
import {loadAssets} from '../model/assets.js';
import {renderCard} from '../render/card.js';
import {preflightProject} from './pdf.js';
import {planSheets} from './layout.js';
import {cropMarks} from './marks.js';

const sessions=new WeakMap();
const commonBack=Symbol('common back');
const svgNS='http://www.w3.org/2000/svg';
const failure=problems=>Object.assign(new Error(problems.map(p=>p.message).join('\n')),{problems});
const unavailable=()=>failure([{code:'native-print-unavailable',message:'이 브라우저에서는 바로 인쇄를 열 수 없어요. 인쇄를 지원하는 브라우저에서 다시 시도하세요.'}]);

/** Prepare an immutable print snapshot, then open the browser's native print dialog. */
export async function printProject(project,{document=globalThis.document}={}){
 if(!document?.body||typeof document.createElement!=='function')throw unavailable();
 const previous=sessions.get(document);
 if(previous&&(!previous.returned||previous.waitingAfterPrint))throw failure([{code:'print-busy',message:'인쇄를 준비하거나 인쇄창을 열고 있어요. 인쇄창을 닫은 뒤 다시 시도하세요.'}]);
 previous?.cleanup();
 const session={returned:false,cleanup:()=>{if(sessions.get(document)===session)sessions.delete(document);}};
 sessions.set(document,session);
 try{
  // Editing or a playing preview cannot change the job while images are being prepared.
  const snapshot=structuredClone(project),invalid=validateProject(snapshot);if(invalid.length)throw failure(invalid);
  await ensureFont();let assets;
  try{assets=await loadAssets(snapshot);}catch(e){throw failure([{code:'asset-decode',message:e.message}]);}
  const problems=await preflightProject(snapshot,assets),blocking=problems.filter(p=>p.severity!=='warning');if(blocking.length)throw failure(blocking);
  const plan=planSheets(snapshot),images=new Map();
  for(const page of plan.pages)for(const cell of page.cells.filter(c=>c.cardId)){
   const key=page.side==='back'?commonBack:cell.cardId;if(images.has(key))continue;
   const canvas=document.createElement('canvas'),card=page.side==='back'?snapshot.back:snapshot.cards.find(c=>c.id===cell.cardId);
   renderCard(canvas.getContext('2d',{willReadFrequently:true}),snapshot,card,assets,300);
   images.set(key,{src:canvas.toDataURL('image/png'),width:canvas.width,height:canvas.height});
  }
  const frame=document.createElement('iframe');frame.dataset.cardPrint='';frame.title='카드 인쇄';frame.setAttribute('aria-hidden','true');
  Object.assign(frame.style,{position:'fixed',left:'-100000px',top:'0',width:plan.widthMm+'mm',height:plan.heightMm+'mm',border:'0'});
  document.body.appendChild(frame);
  const win=frame.contentWindow,doc=frame.contentDocument;
  const beforePrint=()=>{session.waitingAfterPrint=true;};
  const cleanup=()=>{
   win?.removeEventListener('beforeprint',beforePrint);win?.removeEventListener('afterprint',cleanup);document.defaultView?.removeEventListener('pagehide',cleanup);frame.remove();
   if(sessions.get(document)===session)sessions.delete(document);
  };
  session.cleanup=cleanup;
  if(!doc||typeof win?.print!=='function')throw unavailable();
  doc.open();doc.write('<!doctype html><html><head><meta charset="utf-8"></head><body></body></html>');doc.close();doc.title=snapshot.name;
  const style=doc.createElement('style');style.textContent=`
   @page {size:${plan.widthMm}mm ${plan.heightMm}mm;margin:0;}
   html,body {margin:0;padding:0;border:0;background:white;}
   * {box-sizing:border-box;print-color-adjust:exact;-webkit-print-color-adjust:exact;}
   .print-sheet {position:relative;width:${plan.widthMm}mm;height:${plan.heightMm}mm;margin:0;padding:0;overflow:hidden;break-after:page;page-break-after:always;break-inside:avoid;}
   .print-sheet:last-child {break-after:auto;page-break-after:auto;}
   .print-sheet img {position:absolute;display:block;max-width:none;margin:0;padding:0;border:0;}
   .print-sheet svg {position:absolute;inset:0;width:100%;height:100%;}
  `;doc.head.appendChild(style);
  for(const page of plan.pages){
   const sheet=doc.createElement('section');sheet.className='print-sheet';sheet.dataset.side=page.side;
   for(const cell of page.cells.filter(c=>c.cardId)){
    const raster=images.get(page.side==='back'?commonBack:cell.cardId),image=doc.createElement('img');image.alt='';image.dataset.cardId=cell.cardId;image.src=raster.src;
    // Transform the native raster instead of sizing a replaced element in mm:
    // Chromium otherwise snaps its edges to whole CSS pixels when printing.
    Object.assign(image.style,{left:'0',top:'0',width:raster.width+'px',height:raster.height+'px',transformOrigin:'0 0',transform:`translate(${cell.xMm}mm,${cell.yMm}mm) scale(${cell.widthMm*96/25.4/raster.width},${cell.heightMm*96/25.4/raster.height})`});sheet.appendChild(image);
   }
   if(snapshot.print.cropMarks){
    const svg=doc.createElementNS(svgNS,'svg');svg.setAttribute('viewBox',`0 0 ${plan.widthMm} ${plan.heightMm}`);svg.setAttribute('preserveAspectRatio','none');
    svg.setAttribute('fill','none');svg.setAttribute('stroke','rgb(90,100,94)');svg.setAttribute('stroke-width','.12');
    for(const mark of cropMarks(page,plan)){const line=doc.createElementNS(svgNS,'line');for(const [key,value] of Object.entries(mark))line.setAttribute(key,String(value));svg.appendChild(line);}sheet.appendChild(svg);
   }
   doc.body.appendChild(sheet);
  }
  await Promise.all([...doc.images].map(image=>image.decode()));
  // afterprint also fires on cancel. Keep the document alive for browsers whose print() returns early.
  win.addEventListener('beforeprint',beforePrint);win.addEventListener('afterprint',cleanup);document.defaultView?.addEventListener('pagehide',cleanup);
  win.print();session.returned=true;
 }catch(error){session.cleanup();throw error;}
}
