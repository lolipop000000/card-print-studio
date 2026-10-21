import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {writeFile} from 'node:fs/promises';
import {openHarness,qa} from './helpers/browser.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const bundle=await build({absWorkingDir:root,stdin:{contents:`
 import {createProject} from './src/model/project.js';
 import {makeSurface} from './src/render/effects/masks.js';
 import {applyEffectFilter} from './src/render/effects/filters.js';
 import {renderCard} from './src/render/card.js';
 import {createEffectCache} from './src/render/effects/composite.js';
 import {makeVisualEffectLayer,createVisualEffects} from './src/model/visual-effects.js';
 import {getEffectAccelerationStatus} from './src/render/effects/gpu-runtime.js';
 import {applyTemplate} from './src/render/templates.js';
 import {fitRichText} from './src/render/keywords.js';
 import {keywordTextSpans} from './src/model/keywords.js';
 import {skillNameSpans} from './src/model/skill-name-styles.js';
 window.keywordHeatApi={createProject,makeSurface,applyEffectFilter,renderCard,createEffectCache,makeVisualEffectLayer,createVisualEffects,getEffectAccelerationStatus,applyTemplate,fitRichText,keywordTextSpans,skillNameSpans};
 `,resolveDir:root},bundle:true,format:'iife',target:'es2022',write:false});
let session;
before(async()=>{session=await openHarness();await session.page.addScriptTag({content:bundle.outputFiles[0].text});await session.page.evaluate(()=>testApi.ensureFont());});
after(async()=>{await session?.browser.close();});

test('keyword recipes affect their title, body and badge glyphs and explicit character choices win',async()=>{
 const result=await session.page.evaluate(()=>{
  const a=keywordHeatApi,p=a.createProject(),card=p.cards[0],recipe=a.createVisualEffects();
  recipe.layers=[a.makeVisualEffectLayer('duotone',{id:'keyword-red',params:{color:'#ff0000',color2:'#ff0000',strength:1}})];
  const keyword={id:'fire-word',name:'불꽃',description:'',color:'#0066cc',iconAssetId:null};p.keywords=[keyword];
  card.name='불꽃  이름';card.nameKeywords=[{keywordId:keyword.id,display:'inline'}];
  card.passives=[{id:'skill',name:'기술',effect:'설명 불꽃 끝',dice:null,keywords:[{keywordId:keyword.id,display:'both'}]}];
  const element=(id,field,y)=>({id,type:field==='skill.keywords'?'keywords':'text',rect:{x:4,y,w:54,h:9},style:{fontPt:14,color:'#202020'},binding:{field,...(field.startsWith('skill.')?{skillId:'skill'}:{})}});
  card.elements=[element('title','name',6),element('body','skill.effect',25),element('badge','skill.keywords',44)];
  const draw=()=>{const c=document.createElement('canvas'),geometry=[];a.renderCard(c.getContext('2d'),p,card,new Map(),150,{onEffectGeometry:g=>geometry.push(g)});return {bytes:c.getContext('2d').getImageData(0,0,c.width,c.height).data,w:c.width,geometry};};
  const plain=draw();keyword.visualEffects=recipe;const styled=draw(),regions={title:[4,6,54,9],body:[4,25,54,9],badge:[4,44,54,9]},counts={};
  for(const [name,[x,y,w,h]] of Object.entries(regions)){let changed=0,red=0;for(let py=Math.ceil(y*150/25.4);py<(y+h)*150/25.4;py++)for(let px=Math.ceil(x*150/25.4);px<(x+w)*150/25.4;px++){const i=(py*plain.w+px)*4;if(styled.bytes[i]>styled.bytes[i+1]+80&&styled.bytes[i]>styled.bytes[i+2]+80)red++;if(styled.bytes[i]!==plain.bytes[i]||styled.bytes[i+1]!==plain.bytes[i+1]||styled.bytes[i+2]!==plain.bytes[i+2])changed++;}counts[name]={changed,red};}
  const blue=a.createVisualEffects();blue.layers=[a.makeVisualEffectLayer('duotone',{params:{color:'#0033ff',color2:'#0033ff'}})];
  card.textRanges={name:[{id:'blue-override',start:0,end:2,style:{color:'#0033ff',visualEffects:blue}}]};const explicit=draw();let red=0;for(let i=0;i<explicit.bytes.length;i+=4){const y=Math.floor(i/4/explicit.w)*25.4/150;if(y<6||y>15)continue;if(explicit.bytes[i]>explicit.bytes[i+1]+80&&explicit.bytes[i]>explicit.bytes[i+2]+80)red++;}
  return {counts,explicitRed:red,geometry:styled.geometry.map(g=>({elementId:g.elementId,keywordId:g.keywordId}))};
 });
 for(const [region,count] of Object.entries(result.counts)){assert.ok(count.changed>30,region+' must visibly change: '+JSON.stringify(result));assert.ok(count.red>30,region+' must use keyword recipe');}
 assert.equal(result.explicitRed,0,'A manual blue character range must not retain the shared red effect');
 for(const id of ['title','body','badge'])assert.ok(result.geometry.some(g=>g.elementId===id&&g.keywordId==='fire-word'),'Keyword identity must reach '+id+' preview geometry');
 assert.deepEqual(session.pageErrors,[]);
});

test('heat shimmer executes GPU work, preserves source pixels and matches its deterministic CPU fallback',async()=>{
 const results=await session.page.evaluate(()=>{
  const a=keywordHeatApi,read=s=>s.ctx.getImageData(0,0,s.canvas.width,s.canvas.height).data,results=[];
  const source=a.makeSurface({x:-3.7,y:-2.1,w:22,h:19},127),c=source.ctx;
  c.fillStyle='#ed8736';c.fillRect(1,1,10,8);c.clearRect(5,4,3,4);c.globalAlpha=.35;c.fillStyle='#235bcc';c.fillRect(5,9,9,4);c.globalAlpha=1;
  const original=read(source);
  for(const direction of [-180,-90,0,37,90,180]){
   const layer=a.makeVisualEffectLayer('heatHaze',{id:'hot-air',params:{amount:.6,wavelength:2.4,detail:.65,direction}}),options={rect:{x:1,y:1,w:14,h:12},seed:29,timeSec:6.01};
   const cpu=read(a.applyEffectFilter(source,layer,{...options,backend:'cpu'})),before=a.getEffectAccelerationStatus(),output=a.applyEffectFilter(source,layer,options),after=a.getEffectAccelerationStatus(),gpu=read(output),repeat=read(a.applyEffectFilter(source,layer,options));
   let maxAlpha=0,maxColor=0,changed=0;for(let i=0;i<gpu.length;i+=4){maxAlpha=Math.max(maxAlpha,Math.abs(cpu[i+3]-gpu[i+3]));for(let k=0;k<3;k++)maxColor=Math.max(maxColor,Math.abs(cpu[i+k]*cpu[i+3]/255-gpu[i+k]*gpu[i+3]/255));if(gpu[i+3]!==original[i+3])changed++;}
   const next=read(a.applyEffectFilter(source,layer,{...options,timeSec:6.02}));let step=0;for(let i=0;i<next.length;i++)step+=Math.abs(gpu[i]-next[i]);
   const frozen={...layer,motion:{...layer.motion,enabled:false}},frozenA=read(a.applyEffectFilter(source,frozen,{...options,timeSec:0})),frozenB=read(a.applyEffectFilter(source,frozen,{...options,timeSec:19}));
   const afterSource=read(source);results.push({direction,maxAlpha,maxColor,changed,gpu:after.gpuRenders-before.gpuRenders,cpu:after.cpuRenders-before.cpuRenders,repeat:gpu.every((v,i)=>v===repeat[i]),untouched:original.every((v,i)=>v===afterSource[i]),independent:source.canvas!==output.canvas,frozen:frozenA.every((v,i)=>v===frozenB[i]),step});
  }
  return results;
 });
 await writeFile(qa+'/keyword-heat-gpu.json',JSON.stringify(results,null,2));
 for(const r of results){assert.equal(r.gpu,1,JSON.stringify(r));assert.equal(r.cpu,0,JSON.stringify(r));assert.ok(r.changed>30,JSON.stringify(r));assert.ok(r.maxAlpha<=1&&r.maxColor<=1.6,JSON.stringify(r));assert.equal(r.repeat,true);assert.equal(r.untouched,true);assert.equal(r.independent,true);assert.equal(r.frozen,true);assert.ok(r.step>0&&r.step<50000,JSON.stringify(r));}
 assert.deepEqual(session.pageErrors,[]);
});

test('literal keyword effects work without inserting a reference and a skill title character range has priority',async()=>{
 const result=await session.page.evaluate(()=>{
  const a=keywordHeatApi,p=a.createProject(),card=p.cards[0],red=a.createVisualEffects(),blue=a.createVisualEffects();
  red.layers=[a.makeVisualEffectLayer('duotone',{params:{color:'#ff0000',color2:'#ff0000'}})];blue.layers=[a.makeVisualEffectLayer('duotone',{params:{color:'#0033ff',color2:'#0033ff'}})];
  p.keywords=[{id:'fire',name:'불꽃',color:'#0066cc',description:'',iconAssetId:null,visualEffects:red}];
  card.name='불꽃';card.passives=[{id:'hot',name:'불꽃',effect:'불꽃',dice:null,textRanges:{name:[{id:'chosen',start:0,end:2,style:{visualEffects:blue}}]}}];
  card.elements=[{id:'literal',type:'text',binding:{field:'name'},rect:{x:4,y:6,w:50,h:10},style:{fontPt:16}},{id:'skill-title',type:'text',binding:{field:'skill.name',skillId:'hot'},rect:{x:4,y:24,w:54,h:10},style:{fontPt:16}}];
  const canvas=document.createElement('canvas'),geometry=[];a.renderCard(canvas.getContext('2d'),p,card,new Map(),150,{onEffectGeometry:g=>geometry.push(g)});
  const bytes=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;let titleRed=0,skillRed=0,skillBlue=0;
  for(let i=0;i<bytes.length;i+=4){const y=Math.floor(i/4/canvas.width)*25.4/150;if(bytes[i]>bytes[i+1]+80&&bytes[i]>bytes[i+2]+80){if(y>6&&y<16)titleRed++;if(y>24&&y<34)skillRed++;}if(y>24&&y<34&&bytes[i+2]>bytes[i]+80&&bytes[i+2]>bytes[i+1]+80)skillBlue++;}
  return {titleRed,skillRed,skillBlue,geometry};
 });
 assert.ok(result.titleRed>30,'Typing a keyword must apply its effect without an extra insertion step');assert.equal(result.skillRed,0);assert.ok(result.skillBlue>30,'Explicit skill-title characters must override the keyword');
 assert.deepEqual(session.pageErrors,[]);
});

test('adding and clearing keyword effects preserves skill typography and keyword color in explicit references',async()=>{
 const result=await session.page.evaluate(()=>{
  const a=keywordHeatApi,p=a.createProject(),card=p.cards[0],word={id:'fire',name:'Fire',color:'#ef6b24',description:'',iconAssetId:null};p.keywords=[word];
  card.passives=[{id:'hot',name:'Fire',effect:'',dice:null,nameStyle:{fontPt:24,fontStyle:'italic'}},{id:'link',name:'Link',effect:'Fire',dice:null,skillReferences:[{id:'ref',skillId:'hot',start:0,end:4}]}];
  card.elements=[{id:'name',type:'text',binding:{field:'skill.name',skillId:'hot'},rect:{x:4,y:6,w:55,h:20},style:{fontPt:10}},{id:'reference',type:'text',binding:{field:'skill.effect',skillId:'link'},rect:{x:4,y:38,w:55,h:20},style:{fontPt:10}}];
  const draw=()=>{const canvas=document.createElement('canvas');a.renderCard(canvas.getContext('2d'),p,card,new Map(),150);const data=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;return [6,38].map(y=>{let minX=Infinity,minY=Infinity,maxX=0,maxY=0,count=0;for(let py=Math.ceil(y*150/25.4);py<(y+20)*150/25.4;py++)for(let px=Math.ceil(4*150/25.4);px<59*150/25.4;px++){const i=(py*canvas.width+px)*4;if(data[i]>data[i+1]+70&&data[i]>data[i+2]+100){count++;minX=Math.min(minX,px);minY=Math.min(minY,py);maxX=Math.max(maxX,px);maxY=Math.max(maxY,py);}}return {count,w:maxX-minX,h:maxY-minY};});};
  const before=draw();word.visualEffects=a.createVisualEffects();word.visualEffects.layers=[a.makeVisualEffectLayer('heatHaze',{params:{amount:0}})];const applied=draw();word.visualEffects=a.createVisualEffects();return {before,applied,cleared:draw()};
 });
 for(const frame of ['before','applied','cleared'])for(const region of result[frame])assert.ok(region.count>60&&region.h>30,frame+' must keep large orange italic words: '+JSON.stringify(result));
 for(let i=0;i<result.before.length;i++)for(const dimension of ['w','h'])assert.ok(Math.abs(result.applied[i][dimension]-result.before[i][dimension])<=1,'Compositing may change only edge antialiasing');assert.deepEqual(result.cleared,result.before);assert.deepEqual(session.pageErrors,[]);
});

test('automatic skill and item layout measures literal keyword icons with the same text styling as rendering',async()=>{
 const result=await session.page.evaluate(()=>{
  const a=keywordHeatApi,p=a.createProject(),word={id:'fire',name:'Fire',color:'#ef6b24',description:'',iconAssetId:'icon',visualEffects:a.createVisualEffects('neonText')};p.keywords=[word];
  const source=p.cards[0];source.passives=[{id:'hot',name:'Fire',effect:'Fire Fire Fire Fire',dice:null,nameStyle:{fontPt:24,fontStyle:'italic'}},{id:'next',name:'Next',effect:'next',dice:null}];
  const monster=a.applyTemplate(source,p.settings,'monster-standard',p.keywords),canvas=document.createElement('canvas'),ctx=canvas.getContext('2d'),checks=[];
  for(const field of ['skill.name','skill.effect']){
   const e=monster.elements.find(e=>e.binding?.field===field&&e.binding.skillId==='hot'),text=field==='skill.name'?'패시브 · Fire':source.passives[0].effect;
   const names=a.skillNameSpans(monster,text,field==='skill.name'?{titleSkillId:'hot'}:{}),spans=a.keywordTextSpans(text,p.keywords,names),layout=a.fitRichText(ctx,text,e.rect,e.style,e.style.fontPt,p.keywords,[],spans);
   checks.push({field,fits:layout.fits,actual:e.rect.h,needed:layout.heightMm});
  }
  const item={...source,id:'item',kind:'item',effect:'Fire '.repeat(80),passives:[],actives:[]},fitted=a.applyTemplate(item,p.settings,'item',p.keywords),e=fitted.elements.find(e=>e.binding?.field==='item.effect'),layout=a.fitRichText(ctx,item.effect,e.rect,e.style,e.style.fontPt,p.keywords);
  checks.push({field:'item.effect',fits:layout.fits,actual:e.rect.h,needed:layout.heightMm});
  const next=monster.elements.find(e=>e.binding?.field==='skill.name'&&e.binding.skillId==='next'),body=monster.elements.find(e=>e.binding?.field==='skill.effect'&&e.binding.skillId==='hot');return {checks,ordered:next.rect.y>body.rect.y+body.rect.h};
 });
 for(const check of result.checks)assert.equal(check.fits,true,JSON.stringify(check));assert.equal(result.ordered,true);assert.deepEqual(session.pageErrors,[]);
});

test('selected keyword playback survives warm nested caches and the saved print frame round-trips at 300 dpi',async()=>{
 const result=await session.page.evaluate(()=>{
  const a=keywordHeatApi,p=a.createProject(),card=p.cards[0],hot=a.createVisualEffects(),cold=a.createVisualEffects();p.print.effectFrameSec=2.25;
  hot.layers=[a.makeVisualEffectLayer('heatHaze',{id:'heat-hot',params:{amount:.8}})];cold.layers=[a.makeVisualEffectLayer('heatHaze',{id:'heat-cold',params:{amount:.8}})];
  p.keywords=[{id:'fire',name:'불꽃',description:'',color:'#e55b27',iconAssetId:null,visualEffects:hot},{id:'ice',name:'얼음',description:'',color:'#366aba',iconAssetId:null,visualEffects:cold}];
  card.name='불꽃';card.passives=[{id:'skill',name:'기술',effect:'얼음',dice:null,keywords:[{keywordId:'fire',display:'badge'}]}];
  const whole=a.createVisualEffects();whole.layers=[a.makeVisualEffectLayer('colorAdjust')];
  card.elements=[{id:'hot',type:'text',binding:{field:'name'},rect:{x:4,y:6,w:50,h:10},style:{fontPt:18,visualEffects:whole}},{id:'cold',type:'text',binding:{field:'skill.effect',skillId:'skill'},rect:{x:4,y:35,w:50,h:10},style:{fontPt:18,visualEffects:whole}},{id:'badge',type:'keywords',binding:{field:'skill.keywords',skillId:'skill'},rect:{x:4,y:63,w:50,h:10},style:{fontPt:18}}];
  const cache=a.createEffectCache(),assets=new Map(),draw=(project,card,options={})=>{const canvas=document.createElement('canvas'),geometry=[];a.renderCard(canvas.getContext('2d'),project,card,assets,options.dpi||150,{...options,effectCache:options.cache||cache,onEffectGeometry:g=>geometry.push(g)});return {bytes:canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data,w:canvas.width,png:canvas.toDataURL(),geometry};};
  const options={playbackTarget:{keywordId:'fire'},frozenTimeSec:1.2},first=draw(p,card,{...options,timeSec:1.2}),second=draw(p,card,{...options,timeSec:4.1}),repeat=draw(p,card,{...options,timeSec:4.1}),changes={};
  for(const [id,y] of [['hot',6],['cold',35],['badge',63]]){let changed=0;for(let py=Math.ceil(y*150/25.4);py<(y+10)*150/25.4;py++)for(let px=Math.ceil(4*150/25.4);px<54*150/25.4;px++){const i=(py*first.w+px)*4;for(let k=0;k<4;k++)if(first.bytes[i+k]!==second.bytes[i+k]){changed++;break;}}changes[id]=changed;}
  const restored=testApi.parseProject(testApi.serializeProject(p)),printA=draw(p,card,{dpi:300,cache:a.createEffectCache()}),printB=draw(restored,restored.cards[0],{dpi:300,cache:a.createEffectCache()});
  return {changes,repeat:second.png===repeat.png,geometry:repeat.geometry.filter(g=>g.keywordId==='fire').map(g=>g.elementId),samePrint:printA.png===printB.png};
 });
 assert.ok(result.changes.hot>30&&result.changes.badge>30,JSON.stringify(result));assert.equal(result.changes.cold,0,'Unselected keyword pixels must remain frozen');assert.equal(result.repeat,true);assert.equal(result.samePrint,true);
 assert.ok(result.geometry.includes('hot')&&result.geometry.includes('badge'),'Warm-cache frames must retain target geometry');assert.deepEqual(session.pageErrors,[]);
});

test('selecting a skill name animates its own recipe when a matching keyword has only a color',async()=>{
 const result=await session.page.evaluate(()=>{
  const a=keywordHeatApi,p=a.createProject(),card=p.cards[0],recipe=a.createVisualEffects();recipe.layers=[a.makeVisualEffectLayer('heatHaze',{params:{amount:.8}})];
  const word={id:'fire',name:'Fire',color:'#ef6b24',description:'',iconAssetId:null};p.keywords=[word];card.passives=[{id:'hot',name:'Fire',effect:'',dice:null,nameStyle:{visualEffects:recipe}}];
  card.elements=[{id:'title',type:'text',binding:{field:'skill.name',skillId:'hot'},rect:{x:4,y:10,w:54,h:15},style:{fontPt:18}}];
  const assets=new Map(),cache=a.createEffectCache(),draw=timeSec=>{const canvas=document.createElement('canvas'),geometry=[];a.renderCard(canvas.getContext('2d'),p,card,assets,150,{effectCache:cache,timeSec,frozenTimeSec:1.2,playbackTarget:{skillId:'hot'},onEffectGeometry:g=>geometry.push(g)});return {png:canvas.toDataURL(),geometry};};
  const first=draw(1.2),second=draw(4.1);word.visualEffects=a.createVisualEffects();cache.clear();const cleared=draw(4.1);
  return {animated:first.png!==second.png,sameAfterClear:second.png===cleared.png,geometry:second.geometry.map(g=>({skillId:g.skillId,keywordId:g.keywordId}))};
 });
 assert.equal(result.animated,true);assert.equal(result.sameAfterClear,true);assert.ok(result.geometry.some(g=>g.skillId==='hot'&&!g.keywordId),JSON.stringify(result));assert.deepEqual(session.pageErrors,[]);
});

test('heat patterns keep world alignment through padding changes and GPU failure falls back to matching pixels',async()=>{
 const aligned=await session.page.evaluate(()=>{
  const a=keywordHeatApi,layer=a.makeVisualEffectLayer('heatHaze',{id:'aligned-heat',params:{amount:.35,wavelength:1.7,detail:1,direction:37}}),draw=work=>{
   const source=a.makeSurface(work,127);source.ctx.fillStyle='#e74922';source.ctx.fillRect(2,2,8,7);source.ctx.globalAlpha=.4;source.ctx.fillStyle='#2673be';source.ctx.fillRect(4,6,5,5);
   const out=a.applyEffectFilter(source,layer,{seed:21,timeSec:8.01});return {data:out.ctx.getImageData(0,0,out.canvas.width,out.canvas.height).data,w:out.canvas.width};
  },large=draw({x:-3.7,y:-2.1,w:22,h:19}),small=draw({x:-1.7,y:-.1,w:18,h:15});let alpha=0,color=0;
  for(let y=8;y<small.data.length/small.w/4-8;y++)for(let x=8;x<small.w-8;x++){const i=(y*small.w+x)*4,j=((y+10)*large.w+x+10)*4;alpha=Math.max(alpha,Math.abs(small.data[i+3]-large.data[j+3]));for(let k=0;k<3;k++)color=Math.max(color,Math.abs(small.data[i+k]*small.data[i+3]/255-large.data[j+k]*large.data[j+3]/255));}return {alpha,color};
 });assert.ok(aligned.alpha<=1&&aligned.color<=1.6,JSON.stringify(aligned));
 const page=await session.context.newPage();try{
  await page.evaluate(()=>{const get=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){return type==='webgl2'?null:get.call(this,type,...args);};});await page.addScriptTag({content:bundle.outputFiles[0].text});
  const fallback=await page.evaluate(()=>{const a=keywordHeatApi,s=a.makeSurface({x:0,y:0,w:15,h:12},127);s.ctx.fillStyle='#dd6732';s.ctx.fillRect(3,3,7,5);const layer=a.makeVisualEffectLayer('heatHaze'),read=x=>x.ctx.getImageData(0,0,x.canvas.width,x.canvas.height).data,expected=read(a.applyEffectFilter(s,layer,{backend:'cpu'})),before=a.getEffectAccelerationStatus(),actual=read(a.applyEffectFilter(s,layer)),after=a.getEffectAccelerationStatus();return {equal:expected.every((v,i)=>v===actual[i]),cpu:after.cpuRenders-before.cpuRenders,gpu:after.gpuRenders-before.gpuRenders};});assert.deepEqual(fallback,{equal:true,cpu:1,gpu:0});
 }finally{await page.close();}
 assert.deepEqual(session.pageErrors,[]);
});
