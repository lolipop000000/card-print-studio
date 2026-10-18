import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {build} from 'esbuild';
import {openHarness} from './helpers/browser.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const bundle=await build({absWorkingDir:root,stdin:{contents:"import {createProject,serializeProject,parseProject} from './src/model/project.js';import {createVisualEffects,makeVisualEffectLayer} from './src/model/visual-effects.js';import {loadAssets} from './src/model/assets.js';import {renderCard} from './src/render/card.js';import {createPdf} from './src/printing/pdf.js';import {planSheets} from './src/printing/layout.js';window.spritePrintApi={createProject,serializeProject,parseProject,createVisualEffects,makeVisualEffectLayer,loadAssets,renderCard,createPdf,planSheets};",resolveDir:root},bundle:true,format:'iife',write:false,target:'es2022',loader:{'.woff2':'base64'}});

test('cropped and transformed sprite sheets use the identical saved PNG frame in two real 300dpi PDFs',async()=>{
 const {browser,page,pageErrors,httpRequests}=await openHarness();try{
  await page.addScriptTag({content:bundle.outputFiles[0].text});
  const result=await page.evaluate(async()=>{
   const a=window.spritePrintApi,p=a.createProject(),card=p.cards[0],atlas=document.createElement('canvas');atlas.width=32;atlas.height=16;const g=atlas.getContext('2d');
   for(const [index,color] of ['#e53c27','#27b756','#3152d8','#e2bb28'].entries()){const x=index%2*16,y=Math.floor(index/2)*8;g.fillStyle=color;g.fillRect(x,y,16,8);g.clearRect(x+4,y+2,3,3);g.clearRect(x+12,y,4,2);}
   p.assets.atlas={id:'atlas',mime:'image/png',width:32,height:16,dataUrl:atlas.toDataURL(),paintingId:null};card.template='custom';card.autoSkillLayout=false;card.quantity=1;card.passives=[];card.actives=[];
   const recipe={...a.createVisualEffects(),layers:[a.makeVisualEffectLayer('sprite',{id:'atlas-decoration',placement:'front',params:{shape:'image',assetId:'atlas',renderMode:'single',sizeStart:.2,scaleX:1.4,scaleY:.6,anchorX:.2,anchorY:.8,mirror:'both',cropLeft:.25,sheetColumns:3,sheetRows:2,frameMode:'pingpong',frameStart:1,frameCount:4,frameRate:3,rotation:20,spin:.3}}),a.makeVisualEffectLayer('sprite',{id:'atlas-particles',placement:'front',params:{shape:'image',assetId:'atlas',count:4,life:2,sizeStart:.07,sizeEnd:.07,travel:.08,randomness:0,spin:0,alphaEnd:1,fadeIn:0,fadeOut:0,cropLeft:.5,sheetColumns:2,sheetRows:2,frameMode:'life'}})]};
   card.elements=[{id:'atlas-effect',type:'effect',binding:null,rect:{x:18,y:25,w:24,h:16},style:{visualEffects:recipe}}];p.print.duplex=false;p.print.effectFrameSec=2.1;
   const loaded=a.parseProject(a.serializeProject(p)),assets=await a.loadAssets(loaded),sourceBefore=JSON.stringify([loaded.assets,loaded.paintings]),canvas=document.createElement('canvas');
   const draw=options=>{a.renderCard(canvas.getContext('2d'),loaded,loaded.cards[0],assets,300,options);return canvas.toDataURL();};
   const png=draw(),explicit=draw({timeSec:2.1}),later=draw({timeSec:2.5}),encode=bytes=>{let text='';for(let i=0;i<bytes.length;i+=32768)text+=String.fromCharCode(...bytes.subarray(i,i+32768));return btoa(text);};
   // The print contract is exact decoded pixels, independent of PNG encoding.
   const decode=async url=>{const image=new Image();image.src=url;await image.decode();const c=document.createElement('canvas');c.width=image.width;c.height=image.height;const g=c.getContext('2d',{willReadFrequently:true});g.drawImage(image,0,0);return {width:c.width,height:c.height,data:g.getImageData(0,0,c.width,c.height).data};};
   const [first,saved,next]=await Promise.all([png,explicit,later].map(decode));
   const compare=(left,right)=>{const dimensions=left.width===right.width&&left.height===right.height;let changed=0,max=0,firstDifference=null;if(dimensions)for(let at=0;at<left.data.length;at+=4){let differs=false;for(let k=0;k<4;k++){const delta=Math.abs(left.data[at+k]-right.data[at+k]);differs ||=delta!==0;max=Math.max(max,delta);}if(differs){changed++;firstDifference??={x:at/4%left.width,y:Math.floor(at/4/left.width),left:Array.from(left.data.slice(at,at+4)),right:Array.from(right.data.slice(at,at+4))};}}return {dimensions,changed,max,firstDifference};};
   const repeat=compare(first,saved),differentTime=compare(first,next),pdfs=[encode(await a.createPdf(loaded)),encode(await a.createPdf(loaded))],plan=a.planSheets(loaded);
   return {png,explicit,later,pdfs,repeat,differentTime,encodedPngEqual:png===explicit,fixture:a.serializeProject(loaded),sourceUnchanged:sourceBefore===JSON.stringify([loaded.assets,loaded.paintings]),pages:plan.pages.map(p=>({side:p.side,cells:p.cells.filter(c=>c.cardId).map(c=>({cardId:c.cardId,reference:'reference.png'}))}))};
  });
  const output=path.join(root,'artifacts/qa/sprite-customization');await mkdir(output,{recursive:true});
  await writeFile(path.join(output,'validation.json'),JSON.stringify({repeat:result.repeat,differentTime:result.differentTime,encodedPngEqual:result.encodedPngEqual,sourceUnchanged:result.sourceUnchanged},null,2));
  // Retain full evidence before an assertion, so intermittent pixel failures can
  // be reproduced without relying on the runner's truncated base64 strings.
  await writeFile(path.join(output,'fixture.json'),result.fixture);
  for(const [name,png] of [['reference',result.png],['explicit',result.explicit],['later',result.later]])await writeFile(path.join(output,name+'.png'),Buffer.from(png.split(',')[1],'base64'));
  assert.equal(result.repeat.dimensions,true);assert.equal(result.repeat.changed,0,JSON.stringify(result.repeat));assert.equal(result.differentTime.dimensions,true);assert.ok(result.differentTime.changed>0);assert.equal(result.sourceUnchanged,true);
  await writeFile(path.join(output,'references.json'),JSON.stringify({pages:result.pages}));
  for(const [index,pdf] of result.pdfs.entries()){
   const pdfPath=path.join(output,'atlas-'+(index+1)+'.pdf');await writeFile(pdfPath,Buffer.from(pdf,'base64'));
   const verification=JSON.parse(execFileSync(process.env.CARD_PYTHON_PATH||'C:/Users/hyeon/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe',[path.join(root,'scripts/verify-effects-pdf.py'),pdfPath,'--references',path.join(output,'references.json')],{encoding:'utf8'}));assert.equal(verification.status,'PASS');assert.deepEqual(verification.cardsPerPage,[1]);
  }
  assert.deepEqual(pageErrors,[]);assert.deepEqual(httpRequests,[]);
 }finally{await browser.close();}
});
