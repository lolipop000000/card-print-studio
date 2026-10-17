import test from 'node:test';
import assert from 'node:assert/strict';
import * as fx from '../src/model/visual-effects.js';
import {createProject,parseProject,serializeProject,validateProject} from '../src/model/project.js';
import {createVariant} from '../src/model/variants.js';
import {createStore} from '../src/model/store.js';
const kinds=['firefly','bubble','petal','leaf','snowflake','crystal','confetti','comet','rain','dust','rune','vortex'];
const presets=['fireflyGarden','bubbleStream','sakuraBreeze','forestBreeze','snowfall','crystalShower','festival','meteorShower','rainfall','goldenDust','runeVortex','soulVortex'];
const recipe=layers=>({version:2,seed:731,layers});

test('twelve particle kinds expose saved controls and roundtrip without touching artwork',()=>{
 const p=createProject();
 const layers=kinds.map(kind=>{
  const definition=fx.VISUAL_EFFECT_CATALOG[kind];assert.ok(definition,kind+' has its own definition');
  assert.equal(definition.generative,true,kind);assert.equal(definition.animated,true,kind);
  for(const field of ['color','color2','count','size','travel','spread','life','direction','fade'])assert.ok(definition.fields[field],kind+' '+field);
  const layer=fx.makeVisualEffectLayer(kind);for(const target of ['text','image','frame','effect'])assert.deepEqual(fx.validateVisualEffects(recipe([layer]),target),[],kind+' '+target);
  const independent=fx.makeVisualEffectLayer(kind);independent.params.color='#000000';assert.notEqual(layer.params.color,'#000000');return layer;
 });
 p.cards[0].visualEffects=recipe(layers);const assets=structuredClone(p.assets),paintings=structuredClone(p.paintings);
 const saved=serializeProject(p),loaded=parseProject(saved);assert.deepEqual(loaded,p);assert.deepEqual(loaded.assets,assets);assert.deepEqual(loaded.paintings,paintings);assert.deepEqual(validateProject(loaded),[]);
});

test('particle controls validate boundaries and reject malformed parameters',()=>{
 for(const kind of kinds){
  const definition=fx.VISUAL_EFFECT_CATALOG[kind];assert.ok(definition,kind);
  for(const [key,field] of Object.entries(definition.fields))if(field.type==='number'){
   for(const value of [field.min,field.max])assert.deepEqual(fx.validateVisualEffects(recipe([fx.makeVisualEffectLayer(kind,{params:{[key]:value}})])),[],kind+' '+key+' '+value);
   for(const value of [field.min-1,field.max+1,NaN,'1'])assert.ok(fx.validateVisualEffects(recipe([fx.makeVisualEffectLayer(kind,{params:{[key]:value}})])).length,kind+' rejects '+key+' '+value);
  }
  for(const params of [{count:2.5},{color:'red'},{fade:0},{unexpected:1}])assert.ok(fx.validateVisualEffects(recipe([fx.makeVisualEffectLayer(kind,{params})])).length,kind+' bad params');
 }
});

test('twelve particle combinations remain reusable on every card target',()=>{
 const seen=new Set();for(const key of presets){
  assert.ok(fx.VISUAL_EFFECT_PRESETS[key],key);const r=fx.createVisualEffects(key,{seed:91});
  assert.equal(fx.VISUAL_EFFECT_PRESETS[key].category,'흩날림·입자');assert.ok(r.layers.length>1&&r.layers.length<=12);
  for(const layer of r.layers)if(kinds.includes(layer.kind))seen.add(layer.kind);
  for(const target of ['text','image','frame','effect'])assert.deepEqual(fx.validateVisualEffects(r,target),[],key+' '+target);
  const p=createProject();p.cards[0].visualEffects=r;fx.saveVisualEffectPreset(p,key,r);assert.deepEqual(parseProject(serializeProject(p)),p,key);
 }assert.deepEqual([...seen].sort(),[...kinds].sort());
});

test('Variant particle colors override sparsely while parent travel remains shared',()=>{
 assert.ok(fx.VISUAL_EFFECT_PRESETS.sakuraBreeze);const p=createProject();p.cards[0].visualEffects=fx.createVisualEffects('sakuraBreeze');
 p.cards.push(createVariant(p,p.cards[0].id));const store=createStore(p);
 store.edit('Variant 꽃잎 색',draft=>draft.cards[1].visualEffects.layers.find(l=>l.kind==='petal').params.color='#b3499c');
 store.edit('원본 이동 거리',draft=>draft.cards[0].visualEffects.layers.find(l=>l.kind==='petal').params.travel=1.2);
 const current=store.getProject(),variant=current.cards[1].visualEffects.layers.find(l=>l.kind==='petal');assert.equal(variant.params.color,'#b3499c');assert.equal(variant.params.travel,1.2);
 assert.deepEqual(parseProject(serializeProject(current)),current);assert.deepEqual(validateProject(current),[]);
});

test('ripple fade is optional for existing v2 files and independently adjustable',()=>{
 const old=recipe([fx.makeVisualEffectLayer('ripple')]);assert.equal(Object.hasOwn(old.layers[0].params,'fade'),false);assert.deepEqual(fx.upgradeVisualEffects(old),old);
 const p=createProject();p.cards[0].visualEffects=old;assert.deepEqual(parseProject(serializeProject(p)),p);
 const field=fx.VISUAL_EFFECT_CATALOG.ripple.fields.fade;assert.ok(field,'ripple exposes its fade curve');assert.equal(field.optional,true);
 for(const value of [.2,1,4])assert.deepEqual(fx.validateVisualEffects(recipe([fx.makeVisualEffectLayer('ripple',{params:{fade:value}})])),[]);
 for(const value of [0,4.1,NaN])assert.ok(fx.validateVisualEffects(recipe([fx.makeVisualEffectLayer('ripple',{params:{fade:value}})])).length);
});
