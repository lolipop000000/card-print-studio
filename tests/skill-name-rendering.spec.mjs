import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {openHarness,qa} from './helpers/browser.mjs';

test('skill title color changes only actual name ink and keeps the passive prefix identical',async()=>{
 const {browser,page,pageErrors}=await openHarness();try{
  const r=await page.evaluate(async()=>{
   const a=window.testApi;await a.ensureFont();const p=a.createProject(),c=p.cards[0],canvas=document.createElement('canvas'),g=canvas.getContext('2d',{willReadFrequently:true}),dpi=300,scale=dpi/25.4;
   c.passives=[{id:'hit',name:'강타',effect:'',dice:null,keywords:[]}];c.actives=[];
   const e={id:'title',type:'text',binding:{field:'skill.name',skillId:'hit'},rect:{x:7,y:20,w:49,h:8},style:{fontPt:12,fontWeight:720,color:'#253d32',align:'left'}};c.elements=[e];
   const draw=()=>{a.renderCard(g,p,c,new Map(),dpi);return g.getImageData(0,0,canvas.width,canvas.height).data.slice();},before=draw();
   c.passives[0].nameStyle={color:'#ef2345'};const after=draw();
   const measure=document.createElement('canvas').getContext('2d');measure.font='720 '+(12*25.4/72)+'px CardStudio';
   const x0=(e.rect.x+measure.measureText('패시브 · ').width)*scale,x1=(e.rect.x+measure.measureText('패시브 · 강타').width)*scale;
   let changed=0,outside=0,red=0;for(let y=0;y<canvas.height;y++)for(let x=0;x<canvas.width;x++){
    const k=(y*canvas.width+x)*4,d=before[k]!==after[k]||before[k+1]!==after[k+1]||before[k+2]!==after[k+2]||before[k+3]!==after[k+3];
    if(d){changed++;if(x<x0-1||x>x1+1||y<e.rect.y*scale-1||y>(e.rect.y+e.rect.h)*scale+1)outside++;}
    if(after[k]>200&&after[k+1]<70&&after[k+2]<100)red++;
   }
   canvas.style.width='420px';document.body.append(canvas);return {changed,outside,red};
  });
  assert.ok(r.changed>50,'a skill name color must change actual title pixels');assert.equal(r.outside,0,'title prefix and unrelated card pixels must remain identical');assert.ok(r.red>50);assert.deepEqual(pageErrors,[]);
  await page.screenshot({path:path.join(qa,'skill-name-title-color.png'),fullPage:true});
 }finally{await browser.close();}
});

test('plain repeated mentions and linked labels inherit color while unrelated keyword ink remains',async()=>{
 const {browser,page}=await openHarness();try{
  const r=await page.evaluate(async()=>{
   const a=window.testApi;await a.ensureFont();const p=a.createProject(),c=p.cards[0],canvas=document.createElement('canvas');
   p.keywords=[{id:'heal',name:'회복',description:'',color:'#12a575',iconAssetId:null}];
   c.passives=[{id:'hit',name:'강타',effect:'',dice:null,keywords:[],nameStyle:{color:'#e72d45'}}];
   c.actives=[{id:'owner',name:'연계',effect:'강타 일반 강타 회복 강타',dice:null,keywords:[{keywordId:'heal',display:'inline'}],skillReferences:[{id:'linked',skillId:'hit',start:6,end:8}]}];
   c.elements=[{id:'body',type:'text',binding:{field:'skill.effect',skillId:'owner'},rect:{x:6,y:25,w:50,h:12},style:{fontPt:11,color:'#253d32'}}];
   a.renderCard(canvas.getContext('2d'),p,c,new Map(),300);const bytes=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;
   const redColumns=new Set();let green=0,blue=0;for(let y=0;y<canvas.height;y++)for(let x=0;x<canvas.width;x++){const k=(y*canvas.width+x)*4;
    if(bytes[k]>190&&bytes[k+1]<80&&bytes[k+2]<120)redColumns.add(x);
    if(bytes[k]<70&&bytes[k+1]>120&&bytes[k+2]>70&&bytes[k+2]<170)green++;
    if(bytes[k+2]>120&&bytes[k+2]>bytes[k]*1.8&&bytes[k+1]<150)blue++;
   }
   let groups=0,last=-10;for(const x of [...redColumns].sort((a,b)=>a-b)){if(x-last>20)groups++;last=x;}
   return {groups,green,blue};
  });
  assert.equal(r.groups,3,'all three authored/linked name occurrences use the skill color');assert.ok(r.green>20,'unrelated selected keyword keeps its green');assert.ok(r.blue>0,'linked label underline remains visible');
 }finally{await browser.close();}
});

test('name effects isolate wrapped aligned label runs and preserve surrounding prose',async()=>{
 const {browser,page}=await openHarness();try{
  const r=await page.evaluate(async()=>{
   const a=window.testApi;await a.ensureFont();const p=a.createProject(),c=p.cards[0],canvas=document.createElement('canvas'),g=canvas.getContext('2d',{willReadFrequently:true});
   const style={color:'#e73545',visualEffects:a.createVisualEffects()};style.visualEffects.layers=[a.makeVisualEffectLayer('textWarp',{params:{scaleX:.6,scaleY:1}})];
   c.passives=[{id:'name',name:'긴 이름 강타🙂',effect:'',dice:null,keywords:[]}];c.actives=[];
   const e={id:'prose',type:'text',content:'앞말 긴 이름 강타🙂 뒷말',binding:null,rect:{x:8,y:20,w:21,h:28},style:{fontPt:11,color:'#253d32',align:'right'}};c.elements=[e];
   const spans=a.skillNameSpans({...c,passives:[{...c.passives[0],nameStyle:style}]},e.content),layout=a.fitRichText(g,e.content,e.rect,e.style,7,[],[],spans),runs=a.layoutSkillNameRuns(layout,e.rect,e.style);
   const draw=()=>{a.renderCard(g,p,c,new Map(),300);return g.getImageData(0,0,canvas.width,canvas.height).data.slice();},before=draw();c.passives[0].nameStyle=style;const after=draw();
   const scale=300/25.4;let changed=0,outside=0,removedInk=0,staleInk=0;for(let y=0;y<canvas.height;y++)for(let x=0;x<canvas.width;x++){
    const k=(y*canvas.width+x)*4;
    if(runs.some(({rect:r})=>x>(r.x+.2)*scale&&x<(r.x+r.w-.2)*scale&&y>r.y*scale&&y<(r.y+r.h)*scale&&(x<(r.x+r.w*.2-.2)*scale||x>(r.x+r.w*.8+.2)*scale))&&before[k]<100&&before[k+1]<100&&before[k+2]<100){removedInk++;if(after[k]<230||after[k+1]<230||after[k+2]<230)staleInk++;}
    if(before[k]===after[k]&&before[k+1]===after[k+1]&&before[k+2]===after[k+2])continue;changed++;if(!runs.some(run=>x>=(run.rect.x-.2)*scale&&x<=(run.rect.x+run.rect.w+.2)*scale&&y>=(run.rect.y-.2)*scale&&y<=(run.rect.y+run.rect.h+.2)*scale))outside++;
   }
   return {changed,outside,removedInk,staleInk,runs:runs.map(run=>({skillId:run.skillId,rect:run.rect})),lines:layout.lines.length};
  });
  assert.ok(r.lines>1);assert.ok(r.runs.length>1,'a wrapped name creates one isolated source per line');assert.ok(r.runs.every(run=>run.skillId==='name'));assert.ok(r.changed>50);assert.equal(r.outside,0,'unrelated prose cannot move with a skill name warp');assert.ok(r.removedInk>30,'the compressed name must vacate some original glyph pixels');assert.equal(r.staleInk,0,'original name glyphs cannot remain underneath the compressed source');
 }finally{await browser.close();}
});

test('name effects use saved time, update cache after style edits, and diagnose printable undersized warped names',async()=>{
 const {browser,page}=await openHarness();try{
  const r=await page.evaluate(async()=>{
   const a=window.testApi;await a.ensureFont();const p=a.createProject(),c=p.cards[0],cache=a.createEffectCache(),assets=new Map(),canvas=document.createElement('canvas');
   const nameStyle={color:'#df2446',visualEffects:a.createVisualEffects('flame',{seed:37})};c.passives=[{id:'hit',name:'강타',effect:'',dice:null,keywords:[],nameStyle}];c.actives=[];
   c.elements=[{id:'title',type:'text',binding:{field:'skill.name',skillId:'hit'},rect:{x:8,y:25,w:45,h:9},style:{fontPt:11,color:'#253d32'}}];p.print.effectFrameSec=2.35;
   const draw=options=>{const report=a.renderCard(canvas.getContext('2d'),p,c,assets,160,{effectCache:cache,...options});return {png:canvas.toDataURL(),report};};
   const saved=draw(),explicit=draw({timeSec:2.35}),moving=draw({timeSec:.1});nameStyle.color='#2255ed';const recolored=draw();
   nameStyle.visualEffects=a.createVisualEffects();nameStyle.visualEffects.layers=[a.makeVisualEffectLayer('textWarp',{params:{scaleY:.5}})];const small=draw(),preflight=await a.preflightProject(p,assets),pdfProblems=await a.createPdf(p).then(()=>[],error=>error.problems);
   return {saved:saved.png,explicit:explicit.png,moving:moving.png,recolored:recolored.png,small:small.report,preflight,pdfProblems};
  });
  assert.equal(r.saved,r.explicit);assert.notEqual(r.saved,r.moving,'animated name effect follows explicit deterministic time');assert.notEqual(r.saved,r.recolored,'editing the same style object must invalidate name source cache');
  assert.ok(r.small.problems.some(problem=>problem.code==='effect-font-minimum'&&problem.elementId==='title'&&problem.skillId==='hit'));
  assert.ok(r.preflight.some(problem=>problem.code==='effect-font-minimum'&&problem.skillId==='hit'&&problem.severity==='warning'));assert.deepEqual(r.pdfProblems,[],'readability diagnostics must allow printing the visible warped name');
 }finally{await browser.close();}
});

test('empty name styles leave legacy templates and pixels identical and item/back are unaffected',async()=>{
 const {browser,page}=await openHarness();try{
  const r=await page.evaluate(async()=>{
   const a=window.testApi;await a.ensureFont();const p=a.createProject(),c=p.cards[0],canvas=document.createElement('canvas');c.passives=[{id:'hit',name:'강타',effect:'다시 강타 발동🙂',dice:null,keywords:[]}];c.actives=[];
   const old=a.applyTemplate(c,p.settings,'monster-standard',[]),draw=target=>{a.renderCard(canvas.getContext('2d'),p,target,new Map(),200);return canvas.toDataURL();},before=draw(old);
   c.passives[0].nameStyle={visualEffects:{version:2,seed:31,layers:[]}};const empty=a.applyTemplate(c,p.settings,'monster-standard',[]),after=draw(empty);
   const item=a.createCard('item',p);item.effect='강타';p.back.elements=[{id:'back-text',type:'text',content:'강타',rect:{x:7,y:20,w:49,h:8},style:{fontPt:12,color:'#253d32'}}];const itemBefore=draw(a.applyTemplate(item,p.settings,'item',[])),backBefore=draw(p.back);c.passives[0].nameStyle.color='#ea2344';const itemAfter=draw(a.applyTemplate(item,p.settings,'item',[])),backAfter=draw(p.back);
   return {before,after,oldElements:old.elements,newElements:empty.elements,itemBefore,itemAfter,backBefore,backAfter};
  });
  assert.equal(r.before,r.after);assert.deepEqual(r.oldElements,r.newElements);assert.equal(r.itemBefore,r.itemAfter);assert.equal(r.backBefore,r.backAfter);
 }finally{await browser.close();}
});

test('whole-element gradients and name glow remain independent while authored name color survives',async()=>{
 const {browser,page}=await openHarness();try{
  const r=await page.evaluate(async()=>{
   const a=window.testApi;await a.ensureFont();const p=a.createProject(),c=p.cards[0],canvas=document.createElement('canvas');
   const nameStyle={color:'#e72d45'};c.passives=[{id:'hit',name:'강타',effect:'',dice:null,keywords:[],nameStyle}];c.actives=[];
   const whole=a.createVisualEffects();whole.layers=[a.makeVisualEffectLayer('gradient',{params:{color:'#1476ed',color2:'#1476ed',strength:1},motion:{enabled:false,speed:1}})];
   const e={id:'title',type:'text',binding:{field:'skill.name',skillId:'hit'},rect:{x:8,y:28,w:47,h:10},style:{fontPt:12,fontWeight:720,color:'#253d32',visualEffects:whole}};c.elements=[e];
   const draw=()=>{a.renderCard(canvas.getContext('2d'),p,c,new Map(),200);const bytes=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;let red=0,blue=0;for(let i=0;i<bytes.length;i+=4){if(bytes[i]>180&&bytes[i+1]<90&&bytes[i+2]<120)red++;if(bytes[i]<70&&bytes[i+1]>80&&bytes[i+1]<170&&bytes[i+2]>200)blue++;}return {png:canvas.toDataURL(),red,blue};};
   const colored=draw();nameStyle.visualEffects=a.createVisualEffects();nameStyle.visualEffects.layers=[a.makeVisualEffectLayer('glow',{params:{color:'#fa3248',radius:1.3,strength:1},motion:{enabled:false,speed:1}})];const glowing=draw();
   document.body.append(canvas);canvas.style.width='420px';return {colored,glowing,hasWhole:!!e.style.visualEffects,hasName:!!nameStyle.visualEffects};
  });
  assert.ok(r.colored.red>50);assert.ok(r.colored.blue>50,'the title prefix still receives its whole-element gradient');assert.ok(r.glowing.red>50);assert.notEqual(r.colored.png,r.glowing.png,'the separate name glow must remain visible');assert.equal(r.hasWhole,true);assert.equal(r.hasName,true);
  await page.screenshot({path:path.join(qa,'skill-name-composed-effects.png'),fullPage:true});
 }finally{await browser.close();}
});

test('stacked name and element warps cannot jointly shrink a name below the print minimum',async()=>{
 const {browser,page}=await openHarness();try{
  const r=await page.evaluate(async()=>{
   const a=window.testApi;await a.ensureFont();const p=a.createProject(),c=p.cards[0],canvas=document.createElement('canvas');
   const recipe=scaleY=>{const value=a.createVisualEffects();value.layers=[a.makeVisualEffectLayer('textWarp',{params:{scaleY}})];return value;};
   c.passives=[{id:'hit',name:'강타',effect:'',dice:null,keywords:[],nameStyle:{visualEffects:recipe(.8)}}];c.actives=[];
   c.elements=[{id:'stacked-title',type:'text',binding:{field:'skill.name',skillId:'hit'},rect:{x:8,y:28,w:47,h:10},style:{fontPt:12,color:'#253d32',visualEffects:recipe(.7)}}];
   return a.renderCard(canvas.getContext('2d'),p,c,new Map(),100).problems;
  });
  assert.ok(r.some(problem=>problem.code==='effect-font-minimum'&&problem.elementId==='stacked-title'&&problem.skillId==='hit'),'12pt × 0.8 name warp × 0.7 element warp is only 6.72pt');
 }finally{await browser.close();}
});

test('cached whole-element sources replay nested skill-name warnings on every preview render',async()=>{
 const {browser,page}=await openHarness();try{
  const r=await page.evaluate(async()=>{
   const a=window.testApi;await a.ensureFont();const p=a.createProject(),c=p.cards[0],canvas=document.createElement('canvas'),assets=new Map(),effectCache=a.createEffectCache();
   const named=a.createVisualEffects();named.layers=[a.makeVisualEffectLayer('textWarp',{params:{scaleY:.5}})];const whole=a.createVisualEffects();whole.layers=[a.makeVisualEffectLayer('glow',{motion:{enabled:false,speed:1}})];
   c.passives=[{id:'hit',name:'강타',effect:'',dice:null,keywords:[],nameStyle:{visualEffects:named}}];c.actives=[];
   c.elements=[{id:'cached-title',type:'text',binding:{field:'skill.name',skillId:'hit'},rect:{x:8,y:28,w:47,h:10},style:{fontPt:12,color:'#253d32',visualEffects:whole}}];
   const draw=()=>a.renderCard(canvas.getContext('2d'),p,c,assets,100,{effectCache}).problems.filter(problem=>problem.code==='effect-font-minimum').map(problem=>[problem.code,problem.elementId,problem.skillId]);
   return {first:draw(),second:draw(),third:draw()};
  });
  const expected=[['effect-font-minimum','cached-title','hit']];assert.deepEqual(r.first,expected);assert.deepEqual(r.second,expected);assert.deepEqual(r.third,expected);
 }finally{await browser.close();}
});
