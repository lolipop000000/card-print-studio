import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {openHarness} from './helpers/browser.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const bundle=await build({absWorkingDir:root,stdin:{contents:"import * as sprite from './src/render/effects/sprite-emitter.js';import {drawGenerator} from './src/render/effects/generators.js';import {effectRandom} from './src/render/effects/random.js';import {renderCard} from './src/render/card.js';import {createProject} from './src/model/project.js';import {createVisualEffects,makeVisualEffectLayer} from './src/model/visual-effects.js';import {createEffectCache} from './src/render/effects/composite.js';window.spriteCustomApi={...sprite,drawGenerator,effectRandom,renderCard,createProject,createVisualEffects,makeVisualEffectLayer,createEffectCache};",resolveDir:root},bundle:true,format:'iife',write:false,target:'es2022'});
async function openCustom(){
 const session=await openHarness();await session.page.addScriptTag({content:bundle.outputFiles[0].text});
 await session.page.evaluate(()=>{
  window.makeCustomAtlas=()=>{
   const c=document.createElement('canvas');c.width=32;c.height=16;const g=c.getContext('2d'),colors=['#f02828','#18c040','#2048e8','#f0c020'];
   colors.forEach((color,index)=>{const x=index%2*16,y=Math.floor(index/2)*8;g.fillStyle=color;g.fillRect(x,y,16,8);g.clearRect(x,y,2,2);g.clearRect(x+14,y+6,2,2);g.globalAlpha=.5;g.fillRect(x+14,y+6,2,2);g.globalAlpha=1;});return c;
  };
  window.customSprite=async(options={})=>{
   const source=options.source??window.makeCustomAtlas(),hash=data=>{let result=2166136261;for(const value of data)result=Math.imul(result^value,16777619);return result>>>0;},sourceG=source.getContext('2d'),sourceBefore=hash(sourceG.getImageData(0,0,source.width,source.height).data);
   const make=()=>{const c=document.createElement('canvas');c.width=320;c.height=240;const g=c.getContext('2d');g.scale(10,10);g.imageSmoothingEnabled=false;return {c,g};},actual=make(),expected=make();
   const params={shape:'image',tint:'original',color:'#cc22aa',color2:'#cc22aa',count:1,sizeStart:.4,sizeEnd:.4,travel:0,spread:0,life:2,direction:0,spin:0,rotation:0,gravity:0,fadeIn:0,fadeOut:0,alphaStart:1,alphaEnd:1,drift:0,randomness:0,...options.params},motion={enabled:options.motion!==false,speed:1},time=options.time??.5;
   let image=options.image??source;if(options.immutable){image=new Image();image.src=source.toDataURL();await image.decode();}if(options.missing)image=null;
   const included=[],include=(x,y,radius,quad)=>included.push({x,y,radius,quad});
   const random=(index,salt)=>window.spriteCustomApi.effectRandom(options.seed??41,'custom-sprite',index,salt),layer={id:'custom-sprite',kind:'sprite',params,motion,opacity:1};
   const state=()=>({alpha:actual.g.globalAlpha,transform:['a','b','c','d','e','f'].map(k=>actual.g.getTransform()[k]),smoothing:actual.g.imageSmoothingEnabled});const before=state();let generatorBounds;
   if(options.generator){Object.assign(layer,{emit:{face:'up',openOnly:true},origin:{x:.25,y:.25,w:.5,h:.5},rotationDeg:options.layerRotation??0});generatorBounds=window.spriteCustomApi.drawGenerator(actual.g,layer,{rect:{x:10,y:8,w:12,h:8},seed:41,timeSec:time,sizeHeightMm:10,shape:{points:[],inside:[],boundsMm:{h:10}},assets:new Map([[params.assetId,image]])});}
   else window.spriteCustomApi.drawSpriteEmitter(actual.g,layer,{time,height:10,center:{x:16,y:12},point:()=>options.noPoint?null:{x:options.pointX??16,y:options.pointY??12},random,include,image});
   if(options.expected){
    const e=options.expected,g=expected.g,rect=e.rect??[0,0,32,16],w=e.width??8,h=e.height??4,anchor=e.anchor??[.5,.5],center=e.center??[16,12],flip=e.flip??[1,1];
    g.translate(center[0],center[1]);g.rotate((e.rotation??0)*Math.PI/180);g.scale(flip[0],flip[1]);g.globalAlpha=e.alpha??1;
    if(e.shape==='circle'){g.fillStyle='#cc22aa';g.beginPath();g.scale(w/8,h/8);g.translate((.5-anchor[0])*8,(.5-anchor[1])*8);g.arc(0,0,4,0,Math.PI*2);g.fill();}
    else if(e.tint){const tint=document.createElement('canvas');tint.width=32;tint.height=16;const tg=tint.getContext('2d');tg.drawImage(source,0,0);tg.globalCompositeOperation='source-in';tg.fillStyle=e.tint;tg.fillRect(0,0,32,16);g.drawImage(tint,...rect,-w*anchor[0],-h*anchor[1],w,h);}
    else g.drawImage(source,...rect,-w*anchor[0],-h*anchor[1],w,h);
   }
   const data=actual.g.getImageData(0,0,320,240).data,reference=expected.g.getImageData(0,0,320,240).data;let pixels=0,differences=0,minX=320,minY=240,maxX=-1,maxY=-1;
   for(let i=0;i<data.length;i++){if(data[i]!==reference[i])differences++;if(i%4===3&&data[i]>0){pixels++;const x=(i-3)/4%320,y=Math.floor(i/4/320);minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);}}
   const quads=included.flatMap(p=>p.quad??[]),bounds=quads.length?{x:Math.min(...quads.map(p=>p.x)),y:Math.min(...quads.map(p=>p.y)),right:Math.max(...quads.map(p=>p.x)),bottom:Math.max(...quads.map(p=>p.y))}:null;
   return {hash:hash(data),expectedHash:hash(reference),differences,pixels,bounds,generatorBounds,included,extent:pixels?{x:minX/10,y:minY/10,right:(maxX+1)/10,bottom:(maxY+1)/10}:null,sourceBefore,sourceAfter:hash(sourceG.getImageData(0,0,source.width,source.height).data),before,after:state()};
  };
 });return session;
}
const render=(page,options)=>page.evaluate(options=>window.customSprite(options),options);
const nativeSame=(result,label='')=>{assert.equal(result.differences,0,label+' '+JSON.stringify({actual:result.hash,expected:result.expectedHash}));assert.equal(result.sourceAfter,result.sourceBefore,'source pixels stay intact');assert.deepEqual(result.after,result.before,'Canvas state restored');};

test('single decorations use the stable origin center and ignore particle lifetimes and travel',async()=>{
 const {browser,page,pageErrors,httpRequests}=await openCustom();try{
  for(const time of [0,.7,7]){
   const result=await render(page,{time,pointX:2,pointY:2,noPoint:true,params:{renderMode:'single',sizeEnd:0,count:120,alphaEnd:0,fadeIn:.5,fadeOut:1,travel:3,gravity:2,randomness:1},expected:{}});nativeSame(result,String(time));assert.equal(result.included.length,1);
  }
  const generator=await render(page,{generator:true,params:{renderMode:'single'},expected:{}});nativeSame(generator);assert.deepEqual(generator.generatorBounds,{x:12,y:10,w:8,h:4});assert.deepEqual(pageErrors,[]);assert.deepEqual(httpRequests,[]);
 }finally{await browser.close();}
});

test('crop selects source pixels without trimming alpha or changing the original bitmap',async()=>{
 const {browser,page}=await openCustom();try{
  for(const immutable of [false,true]){
   const cropped=await render(page,{immutable,params:{cropLeft:.5},expected:{rect:[16,0,16,16],width:8,height:8}});nativeSame(cropped);
   const allSides=await render(page,{immutable,params:{cropLeft:.25,cropRight:.25,cropTop:.25,cropBottom:.25},expected:{rect:[8,4,16,8]}});nativeSame(allSides);
  }
 }finally{await browser.close();}
});

test('independent stretch, all mirror directions and anchors match native Canvas pixels',async()=>{
 const {browser,page}=await openCustom();try{
  for(const [mirror,flip] of [['none',[1,1]],['x',[-1,1]],['y',[1,-1]],['both',[-1,-1]]]){
   const r=await render(page,{params:{scaleX:1.4,scaleY:.5,anchorX:.2,anchorY:.8,mirror,rotation:35},expected:{width:11.2,height:2,anchor:[.2,.8],flip,rotation:35}});nativeSame(r,mirror);assert.ok(r.bounds);assert.ok(r.extent.x>=r.bounds.x-.1&&r.extent.y>=r.bounds.y-.1&&r.extent.right<=r.bounds.right+.1&&r.extent.bottom<=r.bounds.bottom+.1,JSON.stringify({extent:r.extent,bounds:r.bounds}));
  }
  nativeSame(await render(page,{params:{renderMode:'single',shape:'circle',scaleX:2,scaleY:.5,anchorX:0,anchorY:1,rotation:0},expected:{shape:'circle',width:16,height:4,anchor:[0,1]}}));
 }finally{await browser.close();}
});

test('large sprite sizes are drawn above the previous one-height limit',async()=>{
 const {browser,page}=await openCustom();try{
  nativeSame(await render(page,{params:{sizeStart:1.4,sizeEnd:1.4,scaleX:.5,scaleY:.5},expected:{width:14,height:7}}));
 }finally{await browser.close();}
});

test('fixed atlas frames are selected after cropping and retain each cell aspect ratio',async()=>{
 const {browser,page}=await openCustom();try{
  nativeSame(await render(page,{params:{sheetColumns:2,sheetRows:2,frameStart:3,frameMode:'fixed'},expected:{rect:[16,8,16,8]}}));
  nativeSame(await render(page,{params:{cropLeft:.25,sheetColumns:3,sheetRows:2,frameStart:4},expected:{rect:[16,8,8,8],width:8,height:8}}));
 }finally{await browser.close();}
});

test('life, loop and pingpong frame modes follow explicit particle age with no wall clock',async()=>{
 const {browser,page}=await openCustom();try{
  for(const [time,frame] of [[.1,0],[.6,1],[1.1,2],[1.6,3]])nativeSame(await render(page,{time,params:{sheetColumns:2,sheetRows:2,frameMode:'life'},expected:{rect:[frame%2*16,Math.floor(frame/2)*8,16,8]}}),'life '+time);
  for(const [mode,sequence] of [['loop',[0,1,2,3,0,1,2]],['pingpong',[0,1,2,3,2,1,0]]])for(const [index,frame] of sequence.entries())nativeSame(await render(page,{time:index*.5+.1,params:{life:12,sheetColumns:2,sheetRows:2,frameMode:mode,frameRate:2},expected:{rect:[frame%2*16,Math.floor(frame/2)*8,16,8]}}),mode+' '+index);
  for(const [time,frame] of [[.1,1],[.6,2],[1.1,1]])nativeSame(await render(page,{time,params:{life:12,sheetColumns:2,sheetRows:2,frameMode:'loop',frameStart:1,frameCount:2,frameRate:2},expected:{rect:[frame%2*16,Math.floor(frame/2)*8,16,8]}}));
 }finally{await browser.close();}
});

test('single atlas motion uses explicit time, freezes on its start frame and spins only when enabled',async()=>{
 const {browser,page}=await openCustom();try{
  for(const [mode,time,frame] of [['loop',1.1,2],['pingpong',2.1,2],['life',9,3]])nativeSame(await render(page,{time,params:{renderMode:'single',life:.2,sheetColumns:2,sheetRows:2,frameMode:mode,frameRate:2},expected:{rect:[frame%2*16,Math.floor(frame/2)*8,16,8]}}));
  const freeze={motion:false,params:{renderMode:'single',sheetColumns:2,sheetRows:2,frameMode:'loop',frameStart:1,frameRate:20,spin:.5,rotation:20},expected:{rect:[16,0,16,8],rotation:20}};
  const a=await render(page,{...freeze,time:.1}),b=await render(page,{...freeze,time:9});nativeSame(a);nativeSame(b);assert.equal(a.hash,b.hash);
  nativeSame(await render(page,{time:.5,params:{renderMode:'single',spin:.5,rotation:10},expected:{rotation:100}}));
 }finally{await browser.close();}
});

test('frame and crop tint caches stay separate and mutable Canvas pixels are never stale',async()=>{
 const {browser,page}=await openCustom();try{
  for(const immutable of [false,true])for(const frame of [0,3,1,0,2])nativeSame(await render(page,{immutable,params:{sheetColumns:2,sheetRows:2,frameStart:frame,tint:'tint'},expected:{rect:[frame%2*16,Math.floor(frame/2)*8,16,8],tint:'#cc22aa'}}));
  const immutableFrames=await page.evaluate(async()=>{
   const source=window.makeCustomAtlas(),image=new Image();image.src=source.toDataURL();await image.decode();const results=[];
   for(const frame of [0,3,1,0,2])results.push(await window.customSprite({source,image,params:{sheetColumns:2,sheetRows:2,frameStart:frame,tint:'tint'},expected:{rect:[frame%2*16,Math.floor(frame/2)*8,16,8],tint:'#cc22aa'}}));
   source.getContext('2d').clearRect(0,0,16,8);image.src=source.toDataURL();await image.decode();results.push(await window.customSprite({source,image,params:{sheetColumns:2,sheetRows:2,tint:'tint'},expected:{rect:[0,0,16,8],tint:'#cc22aa'}}));return results;
  });for(const result of immutableFrames)nativeSame(result);assert.equal(immutableFrames.at(-1).pixels,0);
  const mutable=await page.evaluate(async()=>{const source=window.makeCustomAtlas(),options={source,params:{sheetColumns:2,sheetRows:2,tint:'tint'},expected:{rect:[0,0,16,8],tint:'#cc22aa'}},first=await window.customSprite(options);source.getContext('2d').clearRect(0,0,16,8);const second=await window.customSprite(options);return {first,second};});nativeSame(mutable.first);nativeSame(mutable.second);assert.notEqual(mutable.first.hash,mutable.second.hash);
  const transparent=await page.evaluate(async()=>{const source=window.makeCustomAtlas();source.getContext('2d').clearRect(0,0,32,16);return window.customSprite({source,params:{sheetColumns:2,sheetRows:2,tint:'tint'}});});assert.equal(transparent.pixels,0);
  const missing=await render(page,{missing:true,params:{renderMode:'single'}});assert.equal(missing.pixels,0);
 }finally{await browser.close();}
});

test('omitted controls retain the old particle pixels and explicit defaults reproduce the same frame',async t=>{
 const {browser,page}=await openCustom();try{
  const params={count:12,travel:.6,spread:.5,randomness:1,spin:.3,sizeStart:.04,sizeEnd:.12,color:'#1122ff',color2:'#ff8844'},old=await render(page,{time:.8,params}),defaults=await render(page,{time:.8,params:{...params,renderMode:'particles',cropLeft:0,cropRight:0,cropTop:0,cropBottom:0,scaleX:1,scaleY:1,mirror:'none',anchorX:.5,anchorY:.5,sheetColumns:1,sheetRows:1,frameMode:'fixed',frameStart:0,frameCount:0,frameRate:12}});
  assert.equal(old.hash,defaults.hash);assert.equal(old.hash,488142916,'Unchanged particle renderer baseline from before customization');t.diagnostic('legacy particle hash '+old.hash);
 }finally{await browser.close();}
});
test('decoration geometry exposes the same crop, anchor and combined rotation as rendered Canvas corners',async()=>{
 const {browser,page}=await openCustom();try{
  assert.equal(await page.evaluate(()=>typeof window.spriteCustomApi.getSpriteDecorationGeometry),'function');
  const result=await page.evaluate(()=>{
   const image=window.makeCustomAtlas(),params={shape:'image',renderMode:'single',sizeStart:.4,cropLeft:.5,sheetColumns:2,sheetRows:2,scaleX:1.4,scaleY:.5,anchorX:.2,anchorY:.8,mirror:'both',rotation:20,spin:.25},layer={kind:'sprite',params,origin:{x:.25,y:.25,w:.5,h:.5},rotationDeg:30,motion:{enabled:true,speed:2}};
   const geometry=window.spriteCustomApi.getSpriteDecorationGeometry(layer,{rect:{x:10,y:8,w:12,h:8},sizeHeightMm:10,image,timeSec:.5});
   const matrix=new DOMMatrix().translate(16,12).rotate(140).scale(-1,-1),corners=[[-2.24,-3.2],[8.96,-3.2],[8.96,.8],[-2.24,.8]].map(([x,y])=>{const p=matrix.transformPoint({x,y});return {x:p.x,y:p.y};});
   const hidden=window.spriteCustomApi.getSpriteDecorationGeometry({...layer,params:{...params,renderMode:'particles'}},{rect:{x:10,y:8,w:12,h:8},sizeHeightMm:10,image});
   return {geometry,corners,hidden};
  });
  assert.deepEqual(result.geometry.center,{x:16,y:12});assert.equal(result.geometry.width,11.2);assert.equal(result.geometry.height,4);assert.equal(result.geometry.rotationDeg,140);assert.equal(result.geometry.anchorX,.2);assert.equal(result.geometry.anchorY,.8);assert.equal(result.geometry.mirrorX,-1);assert.equal(result.geometry.mirrorY,-1);assert.equal(result.hidden,null);
  for(let i=0;i<4;i++){assert.ok(Math.abs(result.geometry.corners[i].x-result.corners[i].x)<1e-10);assert.ok(Math.abs(result.geometry.corners[i].y-result.corners[i].y)<1e-10);}
 }finally{await browser.close();}
});
test('renderCard reports actual frame, element and repeated skill-name geometry even from a warm source cache',async()=>{
 const {browser,page,pageErrors}=await openCustom();try{
  const result=await page.evaluate(async()=>{
   await window.testApi.ensureFont();const a=window.spriteCustomApi,p=a.createProject(),card=p.cards[0],assets=new Map(),cache=a.createEffectCache(),canvas=document.createElement('canvas');
   const recipe=()=>({...a.createVisualEffects(),layers:[a.makeVisualEffectLayer('sprite',{params:{shape:'circle',renderMode:'single',sizeStart:.1,spin:0},motion:{enabled:false}})]});
   card.visualEffects={...recipe(),frame:{scope:'full',bandMm:3}};
   card.passives=[{id:'hit',name:'강타',effect:'',dice:null,keywords:[],nameStyle:{visualEffects:recipe()}}];card.actives=[];
   card.elements=[{id:'body',type:'text',content:'앞말 강타 뒷말 강타',binding:null,rect:{x:8,y:20,w:46,h:12},style:{fontPt:12,color:'#253d32',visualEffects:{...a.createVisualEffects(),layers:[a.makeVisualEffectLayer('outline',{params:{width:.1}})]}}},{id:'free',type:'effect',rect:{x:8,y:60,w:16,h:8},style:{visualEffects:recipe()}}];
   const before=JSON.stringify(p),hash=()=>{let h=2166136261;for(const v of canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data)h=Math.imul(h^v,16777619);return h>>>0;};
   const draw=observer=>{a.renderCard(canvas.getContext('2d'),p,card,assets,120,{effectCache:cache,onEffectGeometry:observer});return hash();},without=draw(),first=[],second=[];
   const observed=draw(g=>{first.push(structuredClone(g));g.rect.x=999;}),repeat=draw(g=>second.push(g));
   const compact=list=>Array.from(new Map(list.map(g=>[[g.elementId,g.skillId,g.runId].join(':'),g])).values()).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
   return {without,observed,repeat,first:compact(first),second:compact(second),unchanged:before===JSON.stringify(p),width:p.settings.cardWidthMm,height:p.settings.cardHeightMm};
  });
  assert.ok(result.first.length>=5,'frame, whole text, independent effect and both name runs report geometry');assert.equal(result.without,result.observed);assert.equal(result.without,result.repeat);assert.equal(result.unchanged,true);assert.deepEqual(result.first,result.second);
  const frame=result.first.find(g=>g.elementId===null);assert.deepEqual(frame.rect,{x:0,y:0,w:result.width,h:result.height});assert.equal(frame.sizeHeightMm,3);
  const whole=result.first.find(g=>g.elementId==='body'&&!g.skillId);assert.deepEqual(whole.rect,{x:8,y:20,w:46,h:12});assert.ok(Math.abs(whole.sizeHeightMm-12*25.4/72)<1e-10);
  const names=result.first.filter(g=>g.elementId==='body'&&g.skillId==='hit');assert.equal(names.length,2);assert.equal(new Set(names.map(g=>g.runId)).size,2);assert.ok(names.every(g=>g.rect.w>0&&g.sizeHeightMm>0));assert.deepEqual(pageErrors,[]);
 }finally{await browser.close();}
});