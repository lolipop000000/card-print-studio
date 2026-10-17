import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
import {openHarness} from './helpers/browser.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
async function setup(){
 const env=await openHarness();
 const bundle=await build({stdin:{contents:`
  import {createProject} from './src/model/project.js';
  import {createVisualEffects,makeVisualEffectLayer} from './src/model/visual-effects.js';
  import {renderCard} from './src/render/card.js';
  import {preflightProject,createPdf} from './src/printing/pdf.js';
  import {printProject} from './src/printing/browser.js';
  import {ensureFont} from './src/render/font.js';
  window.tolerantPrint={createProject,createVisualEffects,makeVisualEffectLayer,renderCard,preflightProject,createPdf,printProject,ensureFont};
 `,resolveDir:root},bundle:true,write:false,format:'iife',loader:{'.woff2':'base64'}});
 await env.page.addScriptTag({content:bundle.outputFiles[0].text});
 await env.page.evaluate(()=>{
  window.nativeCalls=[];
  new MutationObserver(records=>{for(const record of records)for(const frame of record.addedNodes)if(frame.tagName==='IFRAME'&&frame.isConnected){
   frame.contentWindow.print=()=>{
    window.nativeCalls.push([...frame.contentDocument.images].map(image=>image.src));
    frame.contentWindow.dispatchEvent(new Event('afterprint'));
   };
  }}).observe(document.body,{childList:true});
 });
 return env;
}

test('slightly short skill title boxes and clipped content print unchanged through PDF and direct print',async()=>{
 const env=await setup();try{
  const result=await env.page.evaluate(async()=>{
   const a=window.tolerantPrint;await a.ensureFont();
   const p=a.createProject(),card=p.cards[0];p.cards=[card];card.quantity=1;card.name='세다 쪼쪼';
   card.template='custom';card.autoSkillLayout=false;card.passives=[{id:'turn',name:'모가지 돌리기',effect:'영역이 작아도 그대로 인쇄',dice:null,keywords:[]}];card.actives=[];
   const text=(id,rect,content,style={},binding=null)=>({id,type:'text',rect,content,binding,style:{fontPt:7,color:'#253d32',...style}});
   card.elements=[text('title',{x:4,y:20,w:38.189998440723826,h:2.9562332891483933},'',{}, {field:'skill.name',skillId:'turn'}),text('body',{x:4,y:25,w:45,h:8},'',{}, {field:'skill.effect',skillId:'turn'}),text('clipped',{x:57,y:85,w:20,h:8},'카드 밖으로 나가는 글자')];
   p.print.duplex=true;p.back.elements=[text('back-short',{x:4,y:4,w:30,h:.5},'뒷면 잘림도 허용')];
   const before=JSON.stringify(p),assets=new Map(),canvas=document.createElement('canvas');
   const raw=a.renderCard(canvas.getContext('2d'),p,card,assets,300).problems;
   const expectedFront=canvas.toDataURL('image/png');a.renderCard(canvas.getContext('2d'),p,p.back,assets,300);const expectedBack=canvas.toDataURL('image/png');
   const preflight=await a.preflightProject(p,assets);
   let pdfSize=0,pdfError=null,nativeError=null;
   try{pdfSize=(await a.createPdf(p)).length;}catch(error){pdfError=error.message;}
   try{await a.printProject(p);}catch(error){nativeError=error.message;}
   return {raw,preflight,pdfSize,pdfError,nativeError,calls:window.nativeCalls,expected:[expectedFront,expectedBack],unchanged:before===JSON.stringify(p),frames:document.querySelectorAll('iframe[data-card-print]').length};
  });
  assert.ok(result.raw.some(problem=>problem.code==='text-overflow'&&problem.elementId==='title'));
  assert.ok(result.raw.some(problem=>problem.code==='out-of-bounds'));
  assert.ok(result.preflight.some(problem=>problem.message.startsWith('공통 뒷면:')));
  assert.ok(result.preflight.every(problem=>problem.severity==='warning'),'render diagnostics must not block a printable project');
  assert.equal(result.pdfError,null);assert.ok(result.pdfSize>2000);assert.equal(result.nativeError,null);
  assert.equal(result.calls.length,1);assert.deepEqual(result.calls[0],result.expected,'native output uses the same unmodified 300dpi card and back');
  assert.equal(result.unchanged,true);assert.equal(result.frames,0);assert.deepEqual(env.pageErrors,[]);assert.deepEqual(env.httpRequests,[]);
 }finally{await env.browser.close();}
});

test('small typography, compressed effects and absent skill display remain printable while invalid data still fails',async()=>{
 const env=await setup();try{
  const result=await env.page.evaluate(async()=>{
   const a=window.tolerantPrint;await a.ensureFont();const p=a.createProject(),c=p.cards[0];p.cards=[c];c.quantity=1;c.template='custom';c.autoSkillLayout=false;
   const recipe=a.createVisualEffects();recipe.layers=[a.makeVisualEffectLayer('textWarp',{params:{scaleY:.3}})];
   c.passives=[{id:'hidden',name:'수동으로 숨긴 기술',effect:'표시 요소 없음',dice:null,keywords:[]}];c.actives=[];
   c.elements=[{id:'tiny',type:'text',content:'작은 글자',binding:null,rect:{x:4,y:4,w:45,h:15},style:{fontPt:2,visualEffects:recipe}}];
   const preflight=await a.preflightProject(p,new Map());let pdfError=null;
   try{await a.createPdf(p);await a.printProject(p);}catch(error){pdfError=error.message;}
   const failures=[];
   for(const kind of ['empty','invalid-font','invalid-layout']){
    const bad=structuredClone(p);if(kind==='empty')bad.cards=[];else if(kind==='invalid-font')bad.cards[0].elements[0].style.fontPt=-1;else{bad.print.duplex=true;bad.print.backOffsetXmm=500;}
    for(const make of [a.createPdf,a.printProject])try{await make(bad);failures.push({kind,accepted:true});}catch(error){failures.push({kind,codes:error.problems?.map(p=>p.code),message:error.message});}
   }
   return {preflight,pdfError,failures,calls:window.nativeCalls.length,frames:document.querySelectorAll('iframe[data-card-print]').length};
  });
  for(const code of ['font-min','effect-font-minimum','missing-skill'])assert.ok(result.preflight.some(problem=>problem.code===code&&problem.severity==='warning'),code);
  assert.equal(result.pdfError,null);assert.equal(result.calls,1);assert.equal(result.failures.length,6);
  assert.ok(result.failures.every(failure=>!failure.accepted&&failure.codes?.length&&failure.message.length>5));assert.equal(result.frames,0);
  assert.deepEqual(env.pageErrors,[]);assert.deepEqual(env.httpRequests,[]);
 }finally{await env.browser.close();}
});
