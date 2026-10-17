import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {chromium} from 'playwright';

const root=fileURLToPath(new URL('../',import.meta.url));
// An isolated bundle keeps the app delivery and shared harness untouched.
const built=await build({absWorkingDir:root,stdin:{resolveDir:root,contents:"import * as effects from './src/model/visual-effects.js';import * as renderer from './src/render/effects/composite.js';import * as masks from './src/render/effects/masks.js';import * as shapes from './src/render/effects/shape.js';import * as targetFactories from './src/model/effect-emission.js';window.emissionApi={...effects,...renderer,...masks,...shapes,...targetFactories};"},bundle:true,format:'iife',write:false,target:'es2022'});

async function openScene(){
 const browser=await chromium.launch({headless:true,executablePath:process.env.CARD_BROWSER_PATH||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
 try{
  const page=await browser.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.addScriptTag({content:built.outputFiles[0].text});
  await page.evaluate(()=>{
   window.renderEmission=(options={})=>{
    const a=window.emissionApi,dpi=options.dpi??150,rect={x:16,y:24,w:32,h:20},work={x:0,y:0,w:64,h:68},out=a.makeSurface(work,dpi);
    const overrides={id:'emission-fixture',...options.overrides,params:{shape:'circle',color:'#ff0000',color2:'#ff0000',count:100,sizeStart:.012,sizeEnd:.012,alphaStart:1,alphaEnd:1,fadeIn:0,fadeOut:0,travel:0,spread:0,drift:0,gravity:0,spin:0,life:2,...options.overrides?.params}};
    const layer=options.oldFactory?a.makeVisualEffectLayer('sprite',overrides):a.makeVisualEffectLayerForTarget('sprite',options.target??'effect',overrides);
    const recipe=options.savedRecipe?JSON.parse(options.savedRecipe):{version:2,seed:77,layers:[layer]},before=JSON.stringify(recipe);
    const draw=c=>{c.fillStyle='#222222';c.font='900 14px sans-serif';c.textBaseline='top';c.fillText('HH',18,26);return {fontPt:14*72/25.4};};
    const source=options.target==='text'?{key:'attached-text',draw}:null;
    const report=a.renderVisualEffects(out.ctx,{rect,recipe,target:options.target??'effect',source,dpi,timeSec:options.timeSec??1.2,cardRect:work});
    const raw=out.ctx.getImageData(0,0,out.canvas.width,out.canvas.height).data,quadrants=[0,0,0,0];let red=0,interior=0,nearContour=0,bounds=null;
    let shape;if(source){const mask=a.makeSurface({x:-12,y:-12,w:88,h:92},150);draw(mask.ctx);shape=a.analyzeShape(mask);}
    for(let y=0;y<out.canvas.height;y++)for(let x=0;x<out.canvas.width;x++){
     const i=(y*out.canvas.width+x)*4;if(raw[i]<200||raw[i+1]>40||raw[i+2]>40||raw[i+3]<25)continue;
     const mx=(x+.5)/out.scale,my=(y+.5)/out.scale;red++;
     if(mx>20&&mx<44&&my>28&&my<40)interior++;
     if(mx>16&&mx<48&&my>24&&my<44)quadrants[(mx>=32?1:0)+(my>=34?2:0)]++;
     bounds=bounds?{x:Math.min(bounds.x,mx),y:Math.min(bounds.y,my),right:Math.max(bounds.right,mx),bottom:Math.max(bounds.bottom,my)}:{x:mx,y:my,right:mx,bottom:my};
     if(shape){const sx=Math.floor((mx-shape.work.x)*shape.scale),sy=Math.floor((my-shape.work.y)*shape.scale);if(Math.abs(shape.distance[sy*shape.width+sx])<.65)nearContour++;}
    }
    return {red,interior,quadrants,bounds,nearContour,png:out.canvas.toDataURL(),report,recipe,unchanged:JSON.stringify(recipe)===before};
   };
  });
  return {browser,page,errors};
 }catch(error){await browser.close();throw error;}
}
const render=(page,options)=>page.evaluate(options=>window.renderEmission(options),options);

// Applying a source-contour default to a new independent emitter puts all red
// pixels at its rectangle border and leaves this interior empty.
test('new standalone particle layers cover the chosen area instead of only its border',async t=>{
 const {browser,page,errors}=await openScene();try{
  const scene=await render(page);
  assert.ok(scene.red>500,'particles produce visible pixels');
  assert.ok(scene.interior/scene.red>.3,'the interior contains a substantial share of the particles: '+scene.interior+'/'+scene.red);
  assert.ok(scene.quadrants.every(count=>count>scene.red*.08),'all four area quadrants contain particles');
  assert.equal(scene.unchanged,true);assert.deepEqual(scene.report.problems,[]);assert.deepEqual(errors,[]);
  t.diagnostic('interior='+scene.interior+'/'+scene.red+'; quadrants='+scene.quadrants.join(','));
 }finally{await browser.close();}
});

test('new standalone built-in presets use area defaults while attached defaults stay unchanged',async()=>{
 const {browser,page}=await openScene();try{
  const result=await page.evaluate(()=>{
   const a=window.emissionApi,free=a.createVisualEffectsForTarget('burning','effect',{seed:13}),plain=a.createVisualEffects('burning',{seed:13});
   const withoutIds=recipe=>({...recipe,layers:recipe.layers.map(({id,...layer})=>layer)});
   const attached=['text','image','frame','any'].map(target=>withoutIds(a.createVisualEffectsForTarget('burning',target,{seed:13})));
   return {faces:free.layers.map(layer=>layer.emit.face),seed:free.seed,attached,plain:withoutIds(plain)};
  });
  assert.deepEqual(result.faces,['area','area','area']);assert.equal(result.seed,13);for(const recipe of result.attached)assert.deepEqual(recipe,result.plain);
 }finally{await browser.close();}
});

// Source-attached text must still sample glyph contours rather than its box.
test('attached text keeps its existing contour emission and deterministic frozen pixels',async()=>{
 const {browser,page}=await openScene();try{
  const options={target:'text',overrides:{placement:'front',params:{sizeStart:.025,sizeEnd:.025}}};
  const scene=await render(page,options),old=await render(page,{...options,oldFactory:true}),again=await render(page,options);
  assert.ok(scene.red>200);assert.ok(scene.nearContour/scene.red>.9,'red particles stay beside the actual letters');
  assert.equal(scene.png,old.png);assert.equal(scene.png,again.png);assert.equal(scene.unchanged,true);
 }finally{await browser.close();}
});

test('explicit standalone faces and saved recipe values are preserved when rendered',async()=>{
 const {browser,page}=await openScene();try{
  for(const face of ['up','down','side','all','inside','area']){
   const overrides={emit:{face,openOnly:false},blendMode:'multiply',protectText:false,origin:{x:.2,y:.25,w:.45,h:.4}},scene=await render(page,{overrides}),legacy=await render(page,{overrides,oldFactory:true});
   const saved=JSON.stringify(scene.recipe),reloaded=await render(page,{savedRecipe:saved});
   assert.deepEqual(scene.recipe,legacy.recipe,face+' preserves explicit values');assert.equal(scene.png,legacy.png,face+' renders the explicitly selected face');
   assert.equal(JSON.stringify(reloaded.recipe),saved,face+' preserves persisted recipe values');assert.equal(reloaded.png,scene.png,face+' reloads the same frozen pixels');assert.equal(reloaded.unchanged,true,face);
  }
  const legacyOverrides=await page.evaluate(()=>['edge','area','bottom'].map(emitter=>{
   const a=window.emissionApi,options={id:'legacy-emitter',emitter,origin:{x:.2,y:.3,w:.4,h:.5}};
   return {current:a.makeVisualEffectLayerForTarget('sprite','effect',options),previous:a.makeVisualEffectLayer('sprite',options)};
  }));
  for(const {current,previous} of legacyOverrides)assert.deepEqual(current,previous,'legacy explicit emitter overrides are retained');
 }finally{await browser.close();}
});

test('standalone area emission respects its custom origin area',async()=>{
 const {browser,page}=await openScene();try{
  const scene=await render(page,{overrides:{emit:{face:'area',openOnly:true},origin:{x:.25,y:.25,w:.5,h:.5}}});
  assert.ok(scene.red>200);assert.ok(scene.bounds.x>=23.5&&scene.bounds.right<=40.5,'horizontal pixels stay in the chosen 24–40 mm region');
  assert.ok(scene.bounds.y>=28.5&&scene.bounds.bottom<=39.5,'vertical pixels stay in the chosen 29–39 mm region');
 }finally{await browser.close();}
});

test('standalone area pixels repeat for seed and frozen time at preview and print resolutions',async()=>{
 const {browser,page}=await openScene();try{
  for(const dpi of [100,300]){
   const options={dpi,overrides:{emit:{face:'area',openOnly:false},params:{shape:'circle',count:80,travel:.4,drift:.1}},timeSec:2.35};
   const first=await render(page,options),again=await render(page,options),later=await render(page,{...options,timeSec:3});
   assert.equal(first.png,again.png,dpi+' DPI frozen pixels repeat');assert.notEqual(first.png,later.png,dpi+' DPI animation advances');
   assert.equal(first.unchanged,true);
  }
 }finally{await browser.close();}
});
