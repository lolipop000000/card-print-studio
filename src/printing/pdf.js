import {jsPDF} from 'jspdf';
import {validateProject} from '../model/project.js';
import {ensureFont} from '../render/font.js';
import {loadAssets} from '../model/assets.js';
import {renderCard} from '../render/card.js';
import {planSheets} from './layout.js';
import {cropMarks} from './marks.js';
export async function preflightProject(project,assets){
 const problems=validateProject(project);if(problems.length)return problems;
 if(!project.cards.length)return [{code:'empty-deck',message:'인쇄할 카드를 먼저 추가하세요.'}];
 await ensureFont();
 try{planSheets(project);}catch(e){problems.push(...(e.problems??[{code:'paper-layout',message:e.message}]));}
 const canvas=document.createElement('canvas');
 // Layout and readability diagnostics describe the visible result; they do not block printing it.
 const printable=report=>report.problems.map(problem=>({...problem,severity:'warning'}));
 for(const card of project.cards)problems.push(...printable(renderCard(canvas.getContext('2d',{willReadFrequently:true}),project,card,assets,100)));
 if(project.print.duplex)problems.push(...printable(renderCard(canvas.getContext('2d',{willReadFrequently:true}),project,project.back,assets,100)).map(p=>({...p,message:'공통 뒷면: '+p.message})));
 return problems;
}
export async function createPdf(project){
 await ensureFont();let assets;
 try{assets=await loadAssets(project);}catch(e){throw failure([{code:'asset-decode',message:e.message}]);}
 const problems=await preflightProject(project,assets);if(problems.some(p=>p.severity!=='warning'))throw failure(problems.filter(p=>p.severity!=='warning'));
 const plan=planSheets(project),pdf=new jsPDF({unit:'mm',format:[plan.widthMm,plan.heightMm],orientation:project.print.orientation,compress:true,precision:6}),cache=new Map();
 pdf.setProperties({title:project.name,creator:'카드 작업실',subject:plan.pages.map(p=>p.side).join(',')});
 for(const [i,page] of plan.pages.entries()){
  if(i)pdf.addPage([plan.widthMm,plan.heightMm],project.print.orientation);
  for(const c of page.cells.filter(c=>c.cardId)){
   const key=page.side==='back'?'back':c.cardId;
   if(!cache.has(key)){const canvas=document.createElement('canvas');renderCard(canvas.getContext('2d',{willReadFrequently:true}),project,page.side==='back'?project.back:project.cards.find(card=>card.id===c.cardId),assets,300);cache.set(key,canvas.toDataURL('image/png'));}
   pdf.addImage(cache.get(key),'PNG',c.xMm,c.yMm,c.widthMm,c.heightMm,key,'FAST');
  }
  if(project.print.cropMarks){pdf.setDrawColor(90,100,94);pdf.setLineWidth(.12);for(const m of cropMarks(page,plan))pdf.line(m.x1,m.y1,m.x2,m.y2);}
 }
 return new Uint8Array(pdf.output('arraybuffer'));
}
function failure(problems){return Object.assign(new Error(problems.map(p=>p.message).join('\n')),{problems});}
