import test from 'node:test';
import assert from 'node:assert/strict';
import {createProject,parseProject,serializeProject,validateProject} from '../src/model/project.js';
import {createStore} from '../src/model/store.js';
import {createVariant} from '../src/model/variants.js';
import * as fx from '../src/model/visual-effects.js';
const target=p=>({cardId:p.cards[0].id,back:false,elementId:null});

test('effects survive save/reload and preset deletion without changing the applied copy',()=>{
 const p=createProject(),recipe=fx.createVisualEffects('burning',{seed:77});
 assert.equal(fx.getEffectFrameSec(p),1.2);
 assert.deepEqual(fx.validateVisualEffects(recipe,'image'),[]);
 fx.writeTargetEffects(p,target(p),recipe);
 const id=fx.saveVisualEffectPreset(p,'불꽃과 연기',recipe);
 recipe.layers[0].params.color='#102030';
 assert.notEqual(p.cards[0].visualEffects.layers[0].params.color,'#102030');
 const copy=fx.readTargetEffects(p,target(p));copy.seed=999;
 assert.equal(p.cards[0].visualEffects.seed,77);
 fx.removeVisualEffectPreset(p,id);
 const loaded=parseProject(serializeProject(p));
 assert.deepEqual(loaded.cards[0].visualEffects,p.cards[0].visualEffects);
 assert.deepEqual(loaded.visualEffectPresets,[]);
 const old=JSON.parse(serializeProject(createProject()));delete old.visualEffectPresets;delete old.print.effectFrameSec;
 assert.equal(fx.getEffectFrameSec(parseProject(JSON.stringify(old))),1.2);
 assert.deepEqual(parseProject(JSON.stringify(old)).visualEffectPresets,[]);
});

test('all starting recipes can be reused and text deformation rejects incompatible targets',()=>{
 for(const [key,preset] of Object.entries(fx.VISUAL_EFFECT_PRESETS)){
  const recipe=fx.createVisualEffects(key,{seed:19});
  assert.ok(preset.name.length);assert.ok(recipe.layers.length);
  assert.deepEqual(fx.validateVisualEffects(recipe,'any'),[],key);
 }
 const recipe=fx.createVisualEffects();
 recipe.layers.push(fx.makeVisualEffectLayer('textWarp',{params:{arc:.3,wave:.2,skewDeg:12,scaleX:1.4,scaleY:1}}));
 assert.deepEqual(fx.validateVisualEffects(recipe,'text'),[]);
 assert.ok(fx.validateVisualEffects(recipe,'image').length);
 const p=createProject(),id='text-target';p.cards[0].elements.push({id,type:'text',rect:{x:4,y:4,w:40,h:10},binding:null,style:{fontPt:14},content:'한글'});
 fx.writeTargetEffects(p,{...target(p),elementId:id},recipe);
 assert.equal(p.cards[0].elements[0].style.visualEffects.layers[0].params.arc,.3);
 assert.throws(()=>fx.writeTargetEffects(p,target(p),recipe),/글자|텍스트/);
 assert.throws(()=>fx.writeTargetEffects(p,{...target(p),elementId:'missing'},recipe));
});

test('effect input validation bounds work and rejects malformed or unsafe recipes',()=>{
 const valid=fx.createVisualEffects();valid.layers.push(fx.makeVisualEffectLayer('particle',{params:{count:80}}));
 assert.deepEqual(fx.validateVisualEffects(valid),[]);
 const mutate=[
  r=>r.layers[0].params.count=81,r=>r.layers[0].params.count=0,
  r=>r.layers[0].params.size=NaN,r=>r.layers[0].origin.x=Infinity,
  r=>r.layers[0].opacity=1.1,r=>r.layers[0].kind='script',
  r=>r.layers[0].params.color='url(https://invalid)',r=>r.layers[0].motion.speed=0,
  r=>r.layers.push(structuredClone(r.layers[0])),r=>r.seed=NaN,
  r=>r.layers[0].params=JSON.parse('{"__proto__":{"bad":1}}'),
  r=>{r.layers=Array.from({length:13},()=>fx.makeVisualEffectLayer('glow'));},
  r=>{r.layers=[fx.makeVisualEffectLayer('textWarp'),fx.makeVisualEffectLayer('textWarp')];}
 ];
 for(const change of mutate){const r=structuredClone(valid);change(r);assert.ok(fx.validateVisualEffects(r).length);}
 for(const time of [-.01,Infinity,NaN]){
  const p=createProject();p.print.effectFrameSec=time;assert.ok(validateProject(p).length);
 }
 const p=createProject();p.cards[0].visualEffects=valid;p.visualEffectPresets=[{id:p.cards[0].id,name:'중복',recipe:structuredClone(valid)}];
 assert.ok(validateProject(p).length);
});

test('preset replacement is isolated and local layer IDs may repeat across applied copies',()=>{
 const p=createProject(),r=fx.createVisualEffects('burning',{seed:8});
 const id=fx.saveVisualEffectPreset(p,'원본',r);fx.writeTargetEffects(p,target(p),r);
 r.layers.find(l=>l.kind==='flame').params.height=.9;fx.saveVisualEffectPreset(p,'바뀐 조합',r,id);
 assert.equal(p.visualEffectPresets.length,1);assert.equal(p.visualEffectPresets[0].name,'바뀐 조합');
 assert.notEqual(p.cards[0].visualEffects.layers.find(l=>l.kind==='flame').params.height,.9);
 assert.deepEqual(validateProject(p),[]);
 assert.throws(()=>fx.saveVisualEffectPreset(p,' ',r));
});

test('variant layer color edits preserve sharing of untouched source properties and undo',()=>{
 const p=createProject(),root=p.cards[0],r=fx.createVisualEffects('burning',{seed:7});
 root.visualEffects=r;const child=createVariant(p,root.id);p.cards.push(child);const store=createStore(p);
 store.edit('Variant 연기 색',d=>d.cards[1].visualEffects.layers.find(l=>l.kind==='smoke').params.color='#9933ff');
 store.edit('원본 불꽃 높이',d=>d.cards[0].visualEffects.layers.find(l=>l.kind==='flame').params.height=.85);
 const value=store.getProject().cards[1].visualEffects;
 assert.equal(value.layers.find(l=>l.kind==='smoke').params.color,'#9933ff');
 assert.equal(value.layers.find(l=>l.kind==='flame').params.height,.85);
 assert.deepEqual(validateProject(store.getProject()),[]);
 assert.deepEqual(parseProject(serializeProject(store.getProject())),store.getProject());
 store.undo();assert.notEqual(store.getProject().cards[1].visualEffects.layers.find(l=>l.kind==='flame').params.height,.85);
});
