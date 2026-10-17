import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {openHarness,qa} from './helpers/browser.mjs';
import {renderEffectFixture} from './helpers/effects.mjs';
import {createVisualEffects,makeVisualEffectLayer,VISUAL_EFFECT_CATALOG} from '../src/model/visual-effects.js';

test('flames and rising smoke have reproducible changing transparent silhouettes',async()=>{
 const {browser,page,pageErrors,httpRequests}=await openHarness();try{
  for(const key of ['flame','smoke','burning']){
   const recipe=createVisualEffects(key,{seed:77});
   const a=await renderEffectFixture(page,recipe,{timeSec:1.2}),b=await renderEffectFixture(page,recipe,{timeSec:1.2}),c=await renderEffectFixture(page,recipe,{timeSec:2.35});
   assert.equal(a.hash,b.hash);assert.notEqual(a.hash,c.hash,key);
   assert.equal(a.transparentCorners,true);assert.ok(a.alpha>100);assert.equal(a.report.hasVisibleContent,true);
  }
  assert.deepEqual(pageErrors,[]);assert.deepEqual(httpRequests,[]);
 }finally{await browser.close();}
});
test('empty alpha remains empty under outline and glow and frozen recipes ignore playback time',async()=>{
 const {browser,page}=await openHarness();try{
  const empty=createVisualEffects();empty.layers=[makeVisualEffectLayer('outline'),makeVisualEffectLayer('glow')];
  const out=await renderEffectFixture(page,empty,{emptySource:true});assert.equal(out.alpha,0);assert.equal(out.report.hasVisibleContent,false);
  const still=createVisualEffects('burning',{seed:77});still.layers.forEach(l=>l.motion.enabled=false);
  assert.equal((await renderEffectFixture(page,still,{timeSec:.1})).hash,(await renderEffectFixture(page,still,{timeSec:4.8})).hash);
 }finally{await browser.close();}
});
test('arc wave skew and stretch reshape Korean glyphs while preserving their colored pixels',async()=>{
 const {browser,page}=await openHarness();try{
  const base=await renderEffectFixture(page,createVisualEffects(),{text:true});
  for(const params of [{arc:.6},{wave:.45},{skewDeg:25},{scaleX:1.5,scaleY:1.2},{arc:.4,wave:.2,skewDeg:15,scaleX:1.3,scaleY:1.1}]){
   const r=createVisualEffects();r.layers=[makeVisualEffectLayer('textWarp',{params})];
   const out=await renderEffectFixture(page,r,{text:true});assert.notEqual(out.hash,base.hash);assert.ok(out.red>30);assert.ok(out.cyan>30);assert.equal(out.transparentCorners,true);
  }
  const moving=createVisualEffects();moving.layers=[makeVisualEffectLayer('textWarp',{params:{wave:.4},motion:{enabled:true}})];
  assert.notEqual((await renderEffectFixture(page,moving,{text:true,timeSec:.1})).hash,(await renderEffectFixture(page,moving,{text:true,timeSec:1.8})).hash);
 }finally{await browser.close();}
});
test('all visual ingredients render and an atlas records flames smoke and deformed lettering',async()=>{
 const {browser,page}=await openHarness();try{
  await page.evaluate(()=>{document.body.style.cssText='margin:20px;background:#101b2b;max-width:1300px';});
  for(const [kind,definition] of Object.entries(VISUAL_EFFECT_CATALOG)){
   const r=createVisualEffects();r.layers=[makeVisualEffectLayer(kind,kind==='textWarp'?{params:{arc:.4,wave:.25,skewDeg:12}}:{})];
   const out=await renderEffectFixture(page,r,{text:!definition.generative,standalone:!!definition.generative,show:true,label:definition.name});
   assert.ok(out.alpha>0,kind);
  }
  const combo=createVisualEffects('burningText',{seed:77});combo.layers.unshift(makeVisualEffectLayer('textWarp',{params:{arc:.4,wave:.2}}));
  await renderEffectFixture(page,combo,{text:true,show:true,label:'휘어진 불꽃 글자'});
  await page.screenshot({path:path.join(qa,'visual-effects-atlas.png'),fullPage:true});
 }finally{await browser.close();}
});
