import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
import {build} from 'esbuild';
import {BLEND_MODES} from '../src/model/blend-modes.js';

const require=createRequire(import.meta.url),root=fileURLToPath(new URL('../',import.meta.url));
let playwright;try{playwright=require('playwright');}catch{playwright=require('C:/Users/hyeon/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');}
const bundles=await Promise.all([
 build({absWorkingDir:root,stdin:{contents:`import * as model from './src/model/visual-effects.js';import * as effects from './src/render/effects/composite.js';import * as masks from './src/render/effects/masks.js';import * as filters from './src/render/effects/filters.js';import * as shapes from './src/render/effects/shape.js';import * as generators from './src/render/effects/generators.js';import {getEffectAccelerationStatus} from './src/render/effects/gpu-runtime.js';window.blendApi={...model,...effects,...masks,...filters,...shapes,...generators,getEffectAccelerationStatus};`,resolveDir:root},bundle:true,format:'iife',target:'es2022',write:false}),
 build({absWorkingDir:root,entryPoints:['src/app.js'],bundle:true,format:'iife',target:'es2022',write:false,loader:{'.woff2':'base64'}}),
]);
const css=await readFile(path.join(root,'src/styles.css'),'utf8');
async function openBlend({app=false,legacyRaster=false}={}){
 const browser=await playwright.chromium.launch({headless:true,executablePath:process.env.CARD_BROWSER_PATH||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
 const context=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true}),page=await context.newPage(),pageErrors=[],httpRequests=[];
 page.setDefaultTimeout(7000);page.on('pageerror',error=>pageErrors.push(error.message));page.on('request',request=>{if(/^https?:/.test(request.url()))httpRequests.push(request.url());});await context.route(/^https?:/,route=>route.abort());
 try{
  if(legacyRaster)await page.addInitScript(()=>{
   // Golden bytes belong to the original software rasterizer. Keep that exact
   // oracle without forcing the production GPU/reference tests onto software.
   const get=HTMLCanvasElement.prototype.getContext;
   HTMLCanvasElement.prototype.getContext=function(type,options,...args){
    if(type==='webgl2')return null;
    return get.call(this,type,type==='2d'?{...options,willReadFrequently:true}:options,...args);
   };
  });
  await page.goto(pathToFileURL(path.join(root,'src/index.html')).href);
  await page.addScriptTag({content:bundles[0].outputFiles[0].text});
  await page.evaluate(()=>{
   const a=window.blendApi,view={x:0,y:0,w:48,h:44},rect={x:14,y:16,w:24,h:12},renderCache=a.createEffectCache(),referenceShapes=new Map();
   const pixels=surface=>surface.ctx.getImageData(0,0,surface.canvas.width,surface.canvas.height).data;
   const hash=surface=>{let h=2166136261;for(const value of pixels(surface))h=Math.imul(h^value,16777619);return h>>>0;};
   function draw(c,{translucent=false,keyword=false}={}){
    c.save();c.fillStyle=translucent?'rgba(204,86,42,.45)':'#cc562a';c.fillRect(14,16,24,12);c.clearRect(18,20,4,4);
    c.fillStyle='rgba(38,156,195,.35)';c.fillRect(14,32,10,5);
    if(keyword){c.fillStyle='#20b8d0';c.fillRect(29,16,9,12);}c.restore();return {fits:true,fontPt:14};
   }
   function sourceFor(options={}){return {key:'blend-fixture-'+JSON.stringify(options),draw:c=>draw(c,options),...(options.keyword?{drawPlainMask:c=>{c.fillRect(14,16,12,12);c.clearRect(18,20,4,4);c.fillRect(14,32,10,5);}}:{})};}
   function fixture({dpi=127,...options}={}){
    const work={x:-12,y:-12,w:view.w+24,h:view.h+24},base=a.makeSurface(work,dpi),source=sourceFor(options);source.draw(base.ctx);
    return {work,base,source,dpi,rect,view};
   }
   function render(recipe,options={}){
    const f=fixture(options),out=a.makeSurface(view,f.dpi);let protection=null;
    if(options.protected){protection=a.makeSurface(view,f.dpi);protection.ctx.fillStyle='#fff';protection.ctx.fillRect(14,16,24,12);}
    const report=a.renderVisualEffects(out.ctx,{rect,recipe,target:'image',source:f.source,dpi:f.dpi,timeSec:options.timeSec??1.2,cardRect:view,textProtection:protection,cache:renderCache});return {...out,report};
   }
   // This reference uses Canvas native compositing and native additive coverage,
   // independently of the production compositing/interpolation helpers.
   function nativeCompose(destination,source,mode,alpha=1){const out=a.makeSurface(destination.work,destination.dpi);a.paintSurface(out.ctx,destination);out.ctx.globalCompositeOperation=mode;out.ctx.globalAlpha=alpha;a.paintSurface(out.ctx,source);return out;}
   function nativeMix(base,candidate,amount){
    if(amount===1)return candidate;
    const out=a.makeSurface(base.work,base.dpi);out.ctx.globalAlpha=1-amount;a.paintSurface(out.ctx,base);out.ctx.globalCompositeOperation='lighter';out.ctx.globalAlpha=amount;a.paintSurface(out.ctx,candidate);return out;
   }
   const crop=surface=>{const out=a.makeSurface(view,surface.dpi);a.paintSurface(out.ctx,surface);return out;};
   function compare(actual,expected,tolerance=2){
    const left=pixels(actual),right=pixels(expected);let mismatches=0,maxAlpha=0,maxPremultiplied=0,sample;
    for(let k=0;k<left.length;k+=4){const alpha=Math.abs(left[k+3]-right[k+3]);maxAlpha=Math.max(maxAlpha,alpha);let error=alpha;
     for(let channel=0;channel<3;channel++){const delta=Math.abs(left[k+channel]*left[k+3]/255-right[k+channel]*right[k+3]/255);maxPremultiplied=Math.max(maxPremultiplied,delta);error=Math.max(error,delta);}
     if(error>tolerance){mismatches++;sample??={offset:k,actual:Array.from(left.slice(k,k+4)),reference:Array.from(right.slice(k,k+4))};}
    }return {mismatches,maxAlpha,maxPremultiplied,...(sample?{sample}:{})};
   }
   const at=(surface,x,y)=>Array.from(surface.ctx.getImageData(Math.floor(x*surface.scale),Math.floor(y*surface.scale),1,1).data);
   const recipe=layer=>({...a.createVisualEffects(),seed:31,layers:[layer]});
   const filter=(kind='gradient',overrides={})=>a.makeVisualEffectLayer(kind,{id:'blend-filter',motion:{enabled:false},params:kind==='gradient'?{color:'#37b3db',color2:'#8a36c2',angle:25,strength:.85}:undefined,...overrides});
   function filterReference(layer,options={}){
    const f=fixture(options),filtered=a.applyEffectFilter(f.base,layer,{rect,timeSec:options.timeSec??1.2,seed:31});
    const candidate=!layer.blendMode||layer.blendMode==='source-over'?filtered:nativeCompose(f.base,filtered,layer.blendMode);
    return {base:f.base,filtered,candidate,out:crop(nativeMix(f.base,candidate,layer.opacity)),...f};
   }
   const generator=overrides=>a.makeVisualEffectLayer('sprite',{id:'blend-generator',emit:{face:'area',openOnly:false},placement:'front',motion:{enabled:false},params:{shape:'circle',color:'#427cd5',color2:'#427cd5',count:6,sizeStart:.6,sizeEnd:.6,alphaStart:.75,alphaEnd:.75,fadeIn:0,fadeOut:0,life:4,travel:0,spread:.3,drift:0,randomness:0},...overrides});
   function generatorReference(layer,options={}){
    const f=fixture(options),key=f.source.key+':'+f.dpi;
    if(!referenceShapes.has(key)){const mask=a.makeSurface(f.work,Math.min(f.dpi,150));f.source.draw(mask.ctx);referenceShapes.set(key,a.analyzeShape(mask,{fillHoles:true}));}
    const shape=referenceShapes.get(key),generated=a.makeSurface(f.work,f.dpi);
    a.drawGenerator(generated.ctx,{...layer,opacity:1},{rect,seed:31,timeSec:options.timeSec??1.2,shape,sizeHeightMm:shape.boundsMm?.h||rect.h});
    const out=layer.placement==='behind'?nativeCompose(nativeCompose(a.makeSurface(f.work,f.dpi),generated,'source-over',layer.opacity),f.base,layer.blendMode||'source-over'):nativeCompose(f.base,generated,layer.blendMode||'source-over',layer.opacity);
    return {out:crop(out),generated:crop(generated),base:crop(f.base)};
   }
   function textCoverage(kind='colorAdjust',overrides={}){
    const dpi=127,work={x:-12,y:-12,w:view.w+24,h:view.h+24},base=a.makeSurface(work,dpi),out=a.makeSurface(view,dpi),protection=a.makeSurface(view,dpi);
    const source={key:'text-coverage-fixture',draw:c=>{c.fillStyle='rgba(0,0,0,.45)';c.fillRect(14,16,24,12);c.fillStyle='#a74815';c.fillRect(14,32,10,5);return {fits:true,fontPt:14};}};
    source.draw(base.ctx);protection.ctx.fillRect(14,16,24,12);
    const layer=a.makeVisualEffectLayer(kind,{id:'text-coverage-filter',blendMode:'multiply',protectText:false,motion:{enabled:false},params:kind==='colorAdjust'?{hue:90,saturation:1,brightness:1}:{strength:1,color:'#ee925c',color2:'#ee925c'},...overrides});
    const filtered=a.applyEffectFilter(base,layer,{rect,timeSec:1.2,seed:31}),report=a.renderVisualEffects(out.ctx,{rect,recipe:recipe(layer),target:'image',source,dpi,timeSec:1.2,textProtection:protection,cardRect:view});
    return {pixel:at(out,25,25),basePixel:at(crop(base),25,25),rawFilteredPixel:at(crop(filtered),25,25),warnings:report.problems.filter(p=>p.code==='effect-over-text')};
   }
   window.blendTest={...a,view,rect,pixels,hash,at,fixture,render,compare,filter,recipe,filterReference,generator,generatorReference,crop,nativeMix,nativeCompose,textCoverage};
  });
  if(app){await page.addStyleTag({content:css});await page.addScriptTag({content:bundles[1].outputFiles[0].text});await page.waitForSelector('[data-ready="true"]');}
  return {browser,page,pageErrors,httpRequests};
 }catch(error){await browser.close();throw error;}
}

test('legacy CPU normal filter blending retains exact replacement pixels including translucent holes and alpha removal',async()=>{
 const {browser,page,pageErrors}=await openBlend({legacyRaster:true});try{
  const results=await page.evaluate(()=>{
   const t=blendTest,cases=[['gradient',{}],['blur',{radius:.6}],['erode',{depth:.45,roughness:0}],['halftone',{size:.8,angle:20}]];
   return cases.map(([kind,params])=>{
    const layer=t.filter(kind,{opacity:.6,params}),old=t.render(t.recipe(layer),{translucent:true}),explicit=t.render(t.recipe({...layer,blendMode:'source-over'}),{translucent:true}),reference=t.filterReference(layer,{translucent:true});
    return {kind,sameOld:t.hash(old)===t.hash(explicit),reference:t.compare(old,reference.out),hash:t.hash(old)};
   });
  });
  for(const value of results){assert.equal(value.sameOld,true,value.kind);assert.equal(value.reference.mismatches,0,JSON.stringify(value));}
  assert.deepEqual(results.map(({kind,hash})=>({kind,hash})),[{kind:'gradient',hash:1552107338},{kind:'blur',hash:2513950633},{kind:'erode',hash:3734849669},{kind:'halftone',hash:967113393}],'Golden hashes captured before changing the effect compositor');assert.deepEqual(pageErrors,[]);
 }finally{await browser.close();}
});

test('production GPU blending preserves legacy translucent artwork within native raster rounding',async()=>{
 const outputs=[];
 for(const legacyRaster of [true,false]){
  const {browser,page,pageErrors,httpRequests}=await openBlend({legacyRaster});try{
   outputs.push(await page.evaluate(()=>{
    const t=blendTest,cases=[['gradient',{}],['blur',{radius:.6}],['erode',{depth:.45,roughness:0}],['halftone',{size:.8,angle:20}]];
    const results=cases.map(([kind,params])=>{
     const layer=t.filter(kind,{opacity:.6,params}),render=()=>t.render(t.recipe(layer),{translucent:true}),first=render();
     return {kind,hash:t.hash(first),stable:t.hash(first)===t.hash(render()),pixels:Array.from(t.pixels(first))};
    });return {results,status:t.getEffectAccelerationStatus()};
   }));assert.deepEqual(pageErrors,[]);assert.deepEqual(httpRequests,[]);
  }finally{await browser.close();}
 }
 const [legacy,production]=outputs,comparisons=[];
 const limits={gradient:{alpha:0,color:1.4},blur:{alpha:3,color:3.2},erode:{alpha:0,color:0},halftone:{alpha:0,color:1.1}};
 assert.equal(legacy.status.gpuRenders,0);assert.ok(production.status.kinds.halftone.gpu>0);assert.ok(production.status.kinds.erode.gpu>0);assert.ok(production.status.kinds.composite.gpu>0);
 for(let i=0;i<legacy.results.length;i++){
  const a=legacy.results[i],b=production.results[i];let alpha=0,premultiplied=0;
  assert.equal(b.stable,true,b.kind);assert.equal(b.pixels.length,a.pixels.length);
  for(let k=0;k<b.pixels.length;k+=4){alpha=Math.max(alpha,Math.abs(a.pixels[k+3]-b.pixels[k+3]));for(let c=0;c<3;c++)premultiplied=Math.max(premultiplied,Math.abs(a.pixels[k+c]*a.pixels[k+3]/255-b.pixels[k+c]*b.pixels[k+3]/255));}
  // Native GPU blur rounds its mask and color stages differently from Skia's
  // software blur. Invisible RGB at alpha zero is deliberately not compared.
  const result={kind:b.kind,alpha,premultiplied,legacyHash:a.hash,productionHash:b.hash};comparisons.push(result);
  assert.ok(alpha<=limits[b.kind].alpha&&premultiplied<=limits[b.kind].color,JSON.stringify(result));
 }
 await mkdir(path.join(root,'artifacts/qa'),{recursive:true});await writeFile(path.join(root,'artifacts/qa/effects-gpu-native-raster.json'),JSON.stringify(comparisons,null,2));
});

test('all 25 non-normal filter modes match an independent native Canvas source/destination reference',async()=>{
 const {browser,page,pageErrors,httpRequests}=await openBlend();try{
  const results=await page.evaluate(modes=>{
   const t=blendTest,results=[];
   for(const mode of modes)for(const translucent of [false,true])for(const opacity of [1,.4]){
    const layer=t.filter('gradient',{blendMode:mode,opacity}),actual=t.render(t.recipe(layer),{translucent}),reference=t.filterReference(layer,{translucent});
    // Native globalAlpha quantizes each crossfade contribution separately;
    // the legacy float interpolation rounds once. Allow at most 3/255 of
    // premultiplied color for the partial-opacity independent native oracle.
    const result={mode,translucent,opacity,...t.compare(actual,reference.out,opacity===1?2:3)};results.push(result);if(result.mismatches){const k=result.sample.offset;result.sample.base=Array.from(t.pixels(t.crop(reference.base)).slice(k,k+4));result.sample.candidate=Array.from(t.pixels(t.crop(reference.candidate)).slice(k,k+4));return results;}
   }return results;
  },BLEND_MODES.map(([mode])=>mode).filter(mode=>mode!=='source-over'));
  for(const value of results)assert.equal(value.mismatches,0,JSON.stringify(value));assert.deepEqual(pageErrors,[]);assert.deepEqual(httpRequests,[]);
 }finally{await browser.close();}
});

test('generator blend modes follow front and behind drawing order at full and fractional opacity',async()=>{
 const {browser,page,pageErrors}=await openBlend();try{
  const results=await page.evaluate(modes=>{
   const t=blendTest,results=[];
   for(const mode of modes)for(const placement of ['front','behind'])for(const opacity of [1,.43]){
    const layer=t.generator({blendMode:mode,placement,opacity}),actual=t.render(t.recipe(layer),{translucent:true}),reference=t.generatorReference(layer,{translucent:true});
    const result={mode,placement,opacity,...t.compare(actual,reference.out,1)};results.push(result);if(result.mismatches)return results;
   }return results;
  },BLEND_MODES.map(([mode])=>mode));
  for(const value of results)assert.equal(value.mismatches,0,JSON.stringify(value));assert.deepEqual(pageErrors,[]);
 }finally{await browser.close();}
});

test('non-normal filter mixing retains scope text protection and authored inline keyword colors',async()=>{
 const {browser,page}=await openBlend();try{
  const results=await page.evaluate(()=>{
   const t=blendTest,layer=t.filter('blur',{blendMode:'copy',params:{radius:.7}}),all=t.render(t.recipe(layer)),inside=t.render(t.recipe({...layer,scope:'inside'})),outside=t.render(t.recipe({...layer,scope:'outside'})),base=t.render(t.recipe({...layer,enabled:false}));
   const protectedLayer=t.filter('gradient',{blendMode:'multiply',opacity:.8}),protectedOutput=t.render(t.recipe(protectedLayer),{protected:true}),reference=t.filterReference(protectedLayer),protectedExpected=t.crop(t.nativeMix(reference.base,reference.candidate,.8*.15));
   const keywordOutput=t.render(t.recipe(t.filter('gradient',{blendMode:'screen'})),{keyword:true}),keywordBase=t.render(t.recipe({...layer,enabled:false}),{keyword:true});
   return {insideCenter:t.at(inside,24,22),allCenter:t.at(all,24,22),outsideCenter:t.at(outside,24,22),baseCenter:t.at(base,24,22),insideExterior:t.at(inside,13.5,22),baseExterior:t.at(base,13.5,22),outsideExterior:t.at(outside,13.5,22),allExterior:t.at(all,13.5,22),protectedActual:t.at(protectedOutput,25,25),protectedExpected:t.at(protectedExpected,25,25),keyword:t.at(keywordOutput,33,22),keywordBase:t.at(keywordBase,33,22),plainChanged:t.at(keywordOutput,25,25).join()!==t.at(keywordBase,25,25).join()};
  });
  assert.deepEqual(results.insideCenter,results.allCenter);assert.deepEqual(results.outsideCenter,results.baseCenter);assert.deepEqual(results.insideExterior,results.baseExterior);assert.deepEqual(results.outsideExterior,results.allExterior);
  assert.ok(results.protectedActual.every((v,i)=>Math.abs(v-results.protectedExpected[i])<=2),JSON.stringify(results));assert.deepEqual(results.keyword,results.keywordBase);assert.equal(results.plainChanged,true);
 }finally{await browser.close();}
});

test('disabled and zero-opacity effect layers remain exact no-ops for every blend mode',async()=>{
 const {browser,page}=await openBlend();try{
  const failures=await page.evaluate(modes=>{
   const t=blendTest,base=t.hash(t.render(t.recipe(t.filter('gradient',{enabled:false})),{translucent:true})),failures=[];
   for(const mode of modes)for(const generative of [false,true])for(const change of [{opacity:0},{enabled:false}]){
    const layer=generative?t.generator({blendMode:mode,...change}):t.filter('gradient',{blendMode:mode,...change});
    if(t.hash(t.render(t.recipe(layer),{translucent:true}))!==base)failures.push({mode,generative,change});
   }return failures;
  },BLEND_MODES.map(([mode])=>mode));assert.deepEqual(failures,[]);
 }finally{await browser.close();}
});

test('neutral filter parameters remain exact no-ops instead of blending duplicate source pixels',async()=>{
 const {browser,page}=await openBlend();try{
  const failures=await page.evaluate(()=>{
   const t=blendTest,cases=[['gradient',{strength:0}],['glow',{strength:0}],['blur',{radius:0}],['shadow',{offsetX:0,offsetY:0,blur:0}],['colorAdjust',{hue:0,saturation:1,brightness:1}],['erode',{depth:0}],['chromatic',{distance:0}],['bloom',{strength:0}],['directionalBlur',{strength:0}],['grain',{strength:0}]],base=t.hash(t.render(t.recipe(t.filter('gradient',{enabled:false})),{translucent:true}));
   return cases.flatMap(([kind,params])=>['multiply','destination-out','copy'].flatMap(blendMode=>{
    const layer=t.filter(kind,{blendMode,params});return t.hash(t.render(t.recipe(layer),{translucent:true}))===base?[]:[{kind,blendMode}];
   }));
  });assert.deepEqual(failures,[]);
 }finally{await browser.close();}
});

test('fixed-time blending stays deterministic at 300 dpi and reacts only to explicit animation time',async()=>{
 const {browser,page}=await openBlend();try{
  const result=await page.evaluate(()=>{
   const t=blendTest,l=t.generator({blendMode:'hard-light',placement:'front',motion:{enabled:true,speed:1},params:{shape:'circle',count:8,sizeStart:.2,sizeEnd:.2,travel:.5,life:2}}),r=t.recipe(l);
   r.layers.push(t.filter('gradient',{blendMode:'soft-light',opacity:.55,motion:{enabled:true,speed:1}}));
   const fixed=t.hash(t.render(r,{dpi:300,timeSec:2.35})),next=t.hash(t.render(r,{dpi:300,timeSec:3.15})),again=t.hash(t.render(r,{dpi:300,timeSec:2.35}));
   return {fixed,again,next};
  });assert.equal(result.fixed,result.again);assert.notEqual(result.fixed,result.next);
 }finally{await browser.close();}
});

async function exportProject(page){const download=page.waitForEvent('download');await page.getByRole('button',{name:'프로젝트 파일 내보내기',exact:true}).click();const stream=await (await download).createReadStream(),chunks=[];for await(const chunk of stream)chunks.push(chunk);return Buffer.concat(chunks).toString('utf8');}
const waitPreview=page=>page.waitForFunction(()=>document.querySelector('#effect-preview-status')?.dataset.busy==='false');

test('effect UI selects 26 modes and restores mode changes through undo redo preset apply and save reopen',async()=>{
 const {browser,page,pageErrors,httpRequests}=await openBlend({app:true});try{
  await page.locator('#card-frame-effects').click();await page.locator('#effect-start-preset').selectOption('flame');await page.locator('#effect-layer-kind').selectOption('gradient');await page.locator('#effect-layer-add').click();
  assert.equal(await page.locator('#effect-layer-blend-mode').count(),1,'Each color effect exposes its blend selector');
  assert.equal(await page.locator('#effect-layer-blend-mode option').count(),26);assert.equal(await page.locator('#effect-layer-blend-mode').inputValue(),'source-over');
  await waitPreview(page);const original=await page.locator('#effect-preview').evaluate(canvas=>canvas.toDataURL());
  await page.locator('#effect-layer-blend-mode').selectOption('multiply');await waitPreview(page);const blended=await page.locator('#effect-preview').evaluate(canvas=>canvas.toDataURL());assert.notEqual(original,blended,'The selected mode reaches actual preview pixels');
  await page.locator('#effect-undo').click();await waitPreview(page);assert.equal(await page.locator('#effect-layer-blend-mode').inputValue(),'source-over');assert.equal(await page.locator('#effect-preview').evaluate(canvas=>canvas.toDataURL()),original);
  await page.locator('#effect-redo').click();await waitPreview(page);assert.equal(await page.locator('#effect-layer-blend-mode').inputValue(),'multiply');assert.equal(await page.locator('#effect-preview').evaluate(canvas=>canvas.toDataURL()),blended);
  await page.locator('#effect-preset-name').fill('혼합 검증');await page.locator('#effect-save-preset').click();await page.locator('#effect-apply').click();
  const text=await exportProject(page),saved=JSON.parse(text);assert.equal(saved.cards[0].visualEffects.layers[1].blendMode,'multiply');assert.equal(saved.visualEffectPresets[0].recipe.layers[1].blendMode,'multiply');
  await page.locator('#project-file').setInputFiles({name:'effect-blend-roundtrip.json',mimeType:'application/json',buffer:Buffer.from(text)});
  await page.getByText('프로젝트를 불러왔어요.',{exact:true}).waitFor();await page.locator('#card-frame-effects').click();await page.locator('#effect-layer-list [data-kind="gradient"] .effect-layer-select').click();assert.equal(await page.locator('#effect-layer-blend-mode').inputValue(),'multiply');
  await mkdir(path.join(root,'artifacts/qa'),{recursive:true});await page.screenshot({path:path.join(root,'artifacts/qa/effect-blending-ui.png'),fullPage:true});await page.locator('#effect-close').click();
  assert.deepEqual(pageErrors,[]);assert.deepEqual(httpRequests,[]);
 }finally{await browser.close();}
});

test('text warp UI omits color blending while a following color filter exposes the shared selector',async()=>{
 const {browser,page,pageErrors}=await openBlend({app:true});try{
  await page.locator('#card-frame-effects').click();const title=await page.locator('#effect-target option').evaluateAll(options=>options.find(option=>option.textContent.startsWith('카드 이름'))?.value);assert.ok(title);await page.locator('#effect-target').selectOption(title);
  await page.locator('#effect-layer-kind').selectOption('textWarp');await page.locator('#effect-layer-add').click();assert.equal(await page.locator('#effect-layer-blend-mode').count(),0);
  await page.locator('#effect-layer-kind').selectOption('gradient');await page.locator('#effect-layer-add').click();assert.equal(await page.locator('#effect-layer-blend-mode').count(),1);assert.deepEqual(pageErrors,[]);
 }finally{await browser.close();}
});

test('geometry observers receive the actual frame image and text sizing without changing rendered pixels',async()=>{
 const {browser,page,pageErrors}=await openBlend();try{
  const results=await page.evaluate(()=>{
   const t=blendTest,results=[];
   for(const target of ['frame','image','text'])for(const frameScope of target==='frame'?['full','border']:['none']){
    const f=t.fixture(),recipe=t.recipe(t.generator({}));if(target==='frame')recipe.frame={scope:frameScope,bandMm:5};
    const options={rect:{...t.rect},recipe,target,source:target==='frame'?null:f.source,dpi:f.dpi,timeSec:1.2,cardRect:t.view};
    const plain=t.makeSurface(t.view,f.dpi);t.renderVisualEffects(plain.ctx,options);
    const observed=t.makeSurface(t.view,f.dpi),calls=[];
    t.renderVisualEffects(observed.ctx,{...options,onGeometry:value=>{calls.push(structuredClone(value));value.rect.x=999;}});
    let expectedHeight=5;
    if(target==='image'){
     const mask=t.makeSurface(f.work,Math.min(f.dpi,150));f.source.draw(mask.ctx);expectedHeight=t.analyzeShape(mask,{fillHoles:true}).boundsMm.h;
    }else if(target==='text')expectedHeight=14*25.4/72;
    results.push({target,frameScope,calls,expectedRect:frameScope==='full'?t.view:t.rect,expectedHeight,unchanged:t.hash(plain)===t.hash(observed)});
   }return results;
  });
  for(const result of results){assert.equal(result.calls.length,1,JSON.stringify(result));assert.deepEqual(result.calls[0].rect,result.expectedRect);assert.equal(result.calls[0].sizeHeightMm,result.expectedHeight);assert.equal(result.unchanged,true,JSON.stringify(result));}assert.deepEqual(pageErrors,[]);
 }finally{await browser.close();}
});

test('text coverage warnings inspect final native filter blending instead of unchanged raw black pixels',async()=>{
 const {browser,page,pageErrors}=await openBlend();try{
  const results=await page.evaluate(()=>['source-over','multiply','screen','lighter'].map(blendMode=>({blendMode,...blendTest.textCoverage('colorAdjust',{blendMode})})));
  for(const result of results){
   assert.deepEqual(result.rawFilteredPixel,[0,0,0,115],JSON.stringify(result));assert.deepEqual(result.basePixel,[0,0,0,115]);
   assert.deepEqual(result.pixel,[0,0,0,result.blendMode==='source-over'?115:result.blendMode==='lighter'?230:178],JSON.stringify(result));
   assert.equal(result.warnings.length,result.blendMode==='source-over'?0:1,JSON.stringify(result));
   if(result.warnings.length)assert.equal(result.warnings[0].severity,'warning');
  }assert.deepEqual(pageErrors,[]);
 }finally{await browser.close();}
});

test('text coverage warnings stay absent for disabled zero neutral and scope-inactive filter contributions',async()=>{
 const {browser,page,pageErrors}=await openBlend();try{
  const results=await page.evaluate(()=>[
   ['disabled','colorAdjust',{enabled:false}],['zero opacity','colorAdjust',{opacity:0}],
   ['neutral identity','colorAdjust',{params:{hue:0,saturation:1,brightness:1}}],
   ['outside scope','gradient',{scope:'outside'}],['tiny opacity','gradient',{opacity:.01}],['protected text','gradient',{protectText:true}]
  ].map(([name,kind,overrides])=>({name,...blendTest.textCoverage(kind,overrides)})));
  for(const result of results){assert.deepEqual(result.warnings,[],JSON.stringify(result));if(!['tiny opacity','protected text'].includes(result.name))assert.deepEqual(result.pixel,result.basePixel,JSON.stringify(result));}
  assert.deepEqual(pageErrors,[]);
 }finally{await browser.close();}
});
