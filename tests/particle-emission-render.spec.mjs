import test from 'node:test';
import assert from 'node:assert/strict';
import {openHarness} from './helpers/browser.mjs';

test('an explicitly foreground decoration paints above later text and respects its blend mode',async()=>{
 const {browser,page,pageErrors}=await openHarness();try{
  const r=await page.evaluate(async()=>{
   const a=window.testApi;await a.ensureFont();
   const project=a.createProject(),card=project.cards[0],rect={x:12,y:20,w:32,h:12},layer=a.makeVisualEffectLayer('sprite',{placement:'front',protectText:false,params:{renderMode:'single',shape:'circle',color:'#ff0000',sizeStart:2,alphaStart:1,spin:0}});
   card.elements=[{id:'foreground',type:'effect',rect,style:{visualEffects:{version:2,seed:1,layers:[layer]}}},{id:'words',type:'text',rect,content:'HHHH',style:{fontPt:20,color:'#111111',align:'center'}}];
   const render=(protect,blend='source-over')=>{layer.protectText=protect;layer.blendMode=blend;const c=document.createElement('canvas');a.renderCard(c.getContext('2d'),project,card,new Map(),100);const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let dark=0;for(let y=Math.ceil(rect.y*100/25.4);y<(rect.y+rect.h)*100/25.4;y++)for(let x=Math.ceil(rect.x*100/25.4);x<(rect.x+rect.w)*100/25.4;x++){const i=(y*c.width+x)*4;if(d[i]<40&&d[i+1]<40&&d[i+2]<40)dark++;}return dark;};
   return {protected:render(true),foreground:render(false),multiply:render(false,'multiply')};
  });assert.ok(r.protected>100,JSON.stringify(r));assert.ok(r.foreground<r.protected*.1,JSON.stringify(r));assert.ok(r.multiply>r.protected*.5,'multiply must blend against the card, including the dark lettering');assert.deepEqual(pageErrors,[]);
 }finally{await browser.close();}
});

test('every emitter obeys burst timing and finishes live particles without an always-on base',async()=>{
 const {browser,page,pageErrors}=await openHarness();try{
  const results=await page.evaluate(()=>{
   const a=window.testApi,rect={x:20,y:20,w:20,h:15};
   const visible=(layer,timeSec)=>{const s=a.makeSurface({x:0,y:0,w:70,h:70},100);a.drawGenerator(s.ctx,layer,{rect,seed:42,timeSec,sizeHeightMm:10});const d=s.ctx.getImageData(0,0,s.canvas.width,s.canvas.height).data;let n=0;for(let i=3;i<d.length;i+=4)if(d[i])n++;return n;};
   return Object.entries(a.VISUAL_EFFECT_CATALOG).filter(([,d])=>d.generative).map(([kind])=>{
    const emission={delay:0,duration:2,loops:1,loopDelay:0,prewarm:0,rate:0,rateCurve:[],lifeMin:.5,lifeMax:.5,maxAlive:32,bursts:[{time:1,countMin:3,countMax:3,cycles:1,interval:0,probability:1}]};
    const layer=a.makeVisualEffectLayer(kind,{emission,emit:{face:'area'}});
    return {kind,before:visible(layer,.8),during:visible(layer,1.2),after:visible(layer,1.6)};
   });
  });
  for(const r of results){assert.equal(r.before,0,r.kind+' must wait for its first burst');assert.ok(r.during>0,r.kind+' must render its live births');assert.equal(r.after,0,r.kind+' must stop after their lifetime');}
  assert.deepEqual(pageErrors,[]);
 }finally{await browser.close();}
});

test('nested skill-name foreground survives a whole-text filter and warm source/output caches',async()=>{
 const {browser,page,pageErrors}=await openHarness();try{
  const r=await page.evaluate(async()=>{
   const a=window.testApi;await a.ensureFont();const p=a.createProject(),c=p.cards[0],rect={x:12,y:20,w:32,h:12};
   const nested=a.makeVisualEffectLayer('sprite',{placement:'front',protectText:false,params:{renderMode:'single',shape:'circle',color:'#ff0000',sizeStart:8,alphaStart:1,spin:0}});
   c.passives=[{id:'skill',name:'HHHH',nameStyle:{visualEffects:{version:2,seed:1,layers:[nested]}},effect:''}];c.actives=[];
   c.elements=[{id:'first',type:'text',rect,content:'HHHH',style:{fontPt:20,color:'#111111',align:'center',visualEffects:{version:2,seed:1,layers:[a.makeVisualEffectLayer('gradient',{params:{strength:0}})]}}},{id:'later',type:'text',rect,content:'LLLL',style:{fontPt:20,color:'#111111',align:'center'}}];
   const cache=a.createEffectCache(),assets=new Map(),render=()=>{const canvas=document.createElement('canvas');a.renderCard(canvas.getContext('2d'),p,c,assets,100,{effectCache:cache,playbackTarget:{elementId:'later'}});const d=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;let dark=0,hash=0;for(let y=Math.ceil(rect.y*100/25.4);y<(rect.y+rect.h)*100/25.4;y++)for(let x=Math.ceil(rect.x*100/25.4);x<(rect.x+rect.w)*100/25.4;x++){const i=(y*canvas.width+x)*4;if(d[i]<40&&d[i+1]<40&&d[i+2]<40)dark++;hash=Math.imul(hash^d[i]^d[i+1]^d[i+2],16777619);}return {dark,hash};};
   return {cold:render(),warm:render()};
  });assert.equal(r.cold.dark,0,JSON.stringify(r));assert.deepEqual(r.cold,r.warm);assert.deepEqual(pageErrors,[]);
 }finally{await browser.close();}
});

test('a neutral outer text warp preserves nested foreground outside the text rectangle',async()=>{
 const {browser,page,pageErrors}=await openHarness();try{
  const r=await page.evaluate(async()=>{
   const a=window.testApi;await a.ensureFont();const p=a.createProject(),c=p.cards[0],rect={x:12,y:20,w:32,h:12};
   const nested=a.makeVisualEffectLayer('sprite',{placement:'front',protectText:false,params:{renderMode:'single',shape:'circle',color:'#ff0000',sizeStart:8,alphaStart:1,spin:0}});
   c.passives=[{id:'skill',name:'HHHH',nameStyle:{visualEffects:{version:2,seed:1,layers:[nested]}},effect:''}];c.actives=[];
   const render=layers=>{c.elements=[{id:'title',type:'text',rect,content:'HHHH',style:{fontPt:20,color:'#111111',align:'center',visualEffects:{version:2,seed:1,layers}}}];const canvas=document.createElement('canvas');a.renderCard(canvas.getContext('2d'),p,c,new Map(),100);const d=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;let red=0;for(let i=0;i<d.length;i+=4)if(d[i]>200&&d[i+1]<50&&d[i+2]<50)red++;return red;};
   return {plain:render([]),neutral:render([a.makeVisualEffectLayer('textWarp',{params:{arc:0,wave:0,skewDeg:0,scaleX:1,scaleY:1}})])};
  });assert.ok(r.plain>10000);assert.equal(r.neutral,r.plain,JSON.stringify(r));assert.deepEqual(pageErrors,[]);
 }finally{await browser.close();}
});

test('scheduled ripple paths displace each live ring at its own age',async()=>{
 const {browser,page,pageErrors}=await openHarness();try{
  const r=await page.evaluate(()=>{
   const a=window.testApi,emission={delay:0,duration:2,loops:1,loopDelay:0,prewarm:0,rate:0,rateCurve:[],lifeMin:1,lifeMax:1,maxAlive:32,bursts:[{time:0,countMin:1,countMax:1,cycles:2,interval:.5,probability:1}]};
   const draw=motionPattern=>{const s=a.makeSurface({x:0,y:0,w:70,h:70},100),layer=a.makeVisualEffectLayer('ripple',{emission,params:{motionPattern,pathDistance:1,direction:0,start:.1,end:.5}});a.drawGenerator(s.ctx,layer,{rect:{x:20,y:20,w:20,h:15},seed:42,timeSec:.75,sizeHeightMm:10});const d=s.ctx.getImageData(0,0,s.canvas.width,s.canvas.height).data;let weight=0,xsum=0;for(let y=0;y<s.canvas.height;y++)for(let x=0;x<s.canvas.width;x++){const alpha=d[(y*s.canvas.width+x)*4+3];weight+=alpha;xsum+=x*alpha;}return xsum/weight*25.4/100;};
   return {natural:draw('natural'),straight:draw('straight')};
  });assert.ok(r.straight-r.natural>2&&r.straight-r.natural<7,JSON.stringify(r));assert.deepEqual(pageErrors,[]);
 }finally{await browser.close();}
});

test('lifetime curves change particle size and alpha at the same frame and survive seeking',async()=>{
 const {browser,page}=await openHarness();try{
  const r=await page.evaluate(()=>{
   const a=window.testApi,emission={delay:0,duration:1,loops:1,loopDelay:0,prewarm:0,rate:0,rateCurve:[],lifeMin:1,lifeMax:1,maxAlive:32,bursts:[{time:0,countMin:1,countMax:1,cycles:1,interval:0,probability:1}],sizeCurve:[{at:0,value:.2},{at:1,value:2}],alphaCurve:[{at:0,value:1},{at:1,value:0}]};
   const draw=(timeSec,e=emission)=>{const s=a.makeSurface({x:0,y:0,w:40,h:40},100),layer=a.makeVisualEffectLayer('sprite',{id:'curves',emission:e,params:{shape:'circle',count:1,sizeStart:.2,sizeEnd:.2,travel:0,drift:0,randomness:0,alphaStart:1,alphaEnd:1,fadeIn:0,fadeOut:0},origin:{x:.5,y:.5,w:.05,h:.05}});a.drawGenerator(s.ctx,layer,{rect:{x:0,y:0,w:30,h:30},seed:42,timeSec,sizeHeightMm:10});const d=s.ctx.getImageData(0,0,s.canvas.width,s.canvas.height).data;let n=0,max=0,hash=0;for(let i=3;i<d.length;i+=4){if(d[i])n++;max=Math.max(max,d[i]);hash=Math.imul(hash^d[i],16777619);}return {n,max,hash};};
   return {early:draw(.2),late:draw(.8),again:draw(.2),zero:draw(.2,{...emission,sizeCurve:[{at:0,value:0},{at:1,value:0}]})};
  });assert.ok(r.late.n>r.early.n*3,JSON.stringify(r));assert.ok(r.early.max>r.late.max*2,JSON.stringify(r));assert.deepEqual(r.early,r.again);assert.equal(r.zero.n,0);
 }finally{await browser.close();}
});
