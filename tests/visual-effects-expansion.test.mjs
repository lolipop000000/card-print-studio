import test from 'node:test';
import assert from 'node:assert/strict';
import * as fx from '../src/model/visual-effects.js';
import {createProject,parseProject,serializeProject,validateProject} from '../src/model/project.js';
import {createStore} from '../src/model/store.js';
import {createVariant} from '../src/model/variants.js';

const copy=value=>structuredClone(value);
const recipeFor=layer=>({version:2,seed:37,layers:[layer]});
const frameTarget=p=>({cardId:p.cards[0].id,back:false,elementId:null});
const materials=[
 ['innerGlow',{color:'#68bcdb',width:.6,strength:.8},{width:[.02,12],strength:[0,1]}],
 ['innerShadow',{color:'#182936',offsetX:.4,offsetY:.6,blur:.4,strength:.7},{offsetX:[-12,12],offsetY:[-12,12],blur:[0,12],strength:[0,1]}],
 ['bevel',{highlight:'#fff3cf',shadow:'#6b4050',size:.5,angle:-55,strength:.8},{size:[.02,12],angle:[-180,180],strength:[0,1]}],
 ['extrude',{color:'#463655',depth:1.2,angle:45},{depth:[0,4],angle:[-180,180]}],
 ['foil',{color:'#d49b39',color2:'#fff1b3',size:3,angle:-35,strength:1},{size:[.02,12],angle:[-180,180],strength:[0,1]}],
 ['holographic',{size:4,angle:-25,strength:.85},{size:[.02,12],angle:[-180,180],strength:[0,1]}],
 ['glitch',{distance:.7,bands:10,strength:.65},{distance:[0,4],bands:[1,40],strength:[0,1]}],
 ['scanlines',{color:'#142d46',spacing:.45,width:.12,angle:0,strength:.45},{spacing:[.02,12],width:[.02,12],angle:[-180,180],strength:[0,1]}],
 ['grain',{size:.15,strength:.2},{size:[.02,12],strength:[0,1]}],
 ['duotone',{color:'#30235a',color2:'#ffc48d',strength:1},{strength:[0,1]}]
];
const newPresets=['rgbSplit','cyberGlitch','hologram','roseGold','silverChrome','enchantedGold','iceCrystal','moltenLava','poisonSlime','shadowRelief','stampedInk','retroPrint','arcaneRune','starryDream'];

// A missing filter definition or wrong schema would prevent an ordinary recipe from being saved.
test('ten material filters create independent v2 recipes that save and reload',()=>{
 for(const [kind,params] of materials){
  const layer=fx.makeVisualEffectLayer(kind),definition=fx.VISUAL_EFFECT_CATALOG[kind];
  assert.deepEqual(layer.params,params,kind);
  assert.equal(definition.filter,true,kind);assert.notEqual(definition.generative,true,kind);
  assert.equal(definition.animated,['foil','holographic','glitch'].includes(kind),kind);
  assert.equal(layer.scope,'all');assert.equal(layer.protectText,true);
  for(const property of ['placement','emit','origin','rotationDeg','emitter'])assert.equal(Object.hasOwn(layer,property),false,kind+' '+property);
  for(const scope of ['all','inside','outside'])for(const target of ['any','text','image','effect','frame']){
   assert.deepEqual(fx.validateVisualEffects(recipeFor({...copy(layer),scope}),target),[],kind+' '+scope+' '+target);
  }
  const p=createProject(),recipe=recipeFor(layer);fx.writeTargetEffects(p,frameTarget(p),recipe);
  const id=fx.saveVisualEffectPreset(p,'새 재질 '+kind,recipe);
  const loaded=parseProject(serializeProject(p));
  assert.equal(loaded.version,1);assert.deepEqual(loaded.cards[0].visualEffects,recipe);
  assert.deepEqual(loaded.visualEffectPresets.find(preset=>preset.id===id).recipe,recipe);
  const independent=fx.upgradeVisualEffects(recipe);independent.layers[0].enabled=false;
  assert.equal(recipe.layers[0].enabled,true);
  if('strength' in params){independent.layers[0].params.strength=0;assert.equal(recipe.layers[0].params.strength,params.strength);}
 }
});

// Range validation must accept zero strength but reject malformed, missing and cross-kind parameters.
test('new material controls enforce physical ranges and a closed parameter schema',()=>{
 for(const [kind,params,ranges] of materials){
  const original=recipeFor(fx.makeVisualEffectLayer(kind));
  for(const [key,[min,max]] of Object.entries(ranges))for(const value of [min,max,min-.01,max+.01,NaN,Infinity,'0']){
   const recipe=copy(original);recipe.layers[0].params[key]=value;
   assert.equal(fx.validateVisualEffects(recipe).length===0,value===min||value===max,kind+' '+key+' '+value);
  }
  for(const key of Object.keys(params)){
   const missing=copy(original);delete missing.layers[0].params[key];assert.ok(fx.validateVisualEffects(missing).length,kind+' missing '+key);
   if(typeof params[key]==='string')for(const invalid of ['#fff','#gg0000','red','url(https://invalid)','<script>']){
    const recipe=copy(original);recipe.layers[0].params[key]=invalid;assert.ok(fx.validateVisualEffects(recipe).length,kind+' '+invalid);
   }
  }
  for(const mutate of [
   layer=>layer.params.unrecognized=1,layer=>layer.params.constructor=1,
   layer=>layer.emit={face:'all',openOnly:true},layer=>layer.placement='behind',
   layer=>layer.params=JSON.parse('{"__proto__":{"polluted":true}}')
  ]){const recipe=copy(original);mutate(recipe.layers[0]);const before=copy(recipe);assert.ok(fx.validateVisualEffects(recipe).length,kind);assert.deepEqual(recipe,before);}
 }
 const fractionalBands=recipeFor(fx.makeVisualEffectLayer('glitch',{params:{bands:2.5}}));assert.ok(fx.validateVisualEffects(fractionalBands).length);
});

// Optional chromatic controls must not force old v2 files to acquire new serialized fields.
test('old v2 chromatic recipes remain unchanged through cloning and project save reload',()=>{
 const old={version:2,seed:9,layers:[{id:'old-chromatic',kind:'chromatic',enabled:true,opacity:1,protectText:true,scope:'all',params:{distance:.3,angle:0},motion:{enabled:false,speed:1}}]};
 assert.deepEqual(fx.validateVisualEffects(old),[]);
 const normalized=fx.upgradeVisualEffects(old);assert.deepEqual(normalized,old);normalized.layers[0].params.distance=.8;
 assert.equal(old.layers[0].params.distance,.3);
 assert.deepEqual(fx.makeVisualEffectLayer('chromatic').params,{distance:.3,angle:0});
 const p=createProject();p.cards[0].visualEffects=copy(old);
 const loaded=parseProject(serializeProject(p));assert.deepEqual(loaded.cards[0].visualEffects,old);assert.deepEqual(validateProject(loaded),[]);
 for(const key of ['mode','color','color2','strength'])assert.equal(Object.hasOwn(loaded.cards[0].visualEffects.layers[0].params,key),false,key);
});

test('optional chromatic modes and colors validate independently without weakening other kinds',()=>{
 const layer=fx.makeVisualEffectLayer('chromatic');
 const accepted={mode:['auto','channels','fringe'],color:['#ec3868','#AABBCC'],color2:['#168fba'],strength:[0,.5,1]};
 for(const [key,values] of Object.entries(accepted))for(const value of values){
  const recipe=recipeFor({...copy(layer),params:{...layer.params,[key]:value}});assert.deepEqual(fx.validateVisualEffects(recipe),[],key+' '+value);
  assert.deepEqual(fx.upgradeVisualEffects(recipe),recipe);
 }
 const rejected={mode:['automatic','rgb',0,null],color:['#fff','red','url(x)'],color2:['#12345g',null],strength:[-.01,1.01,NaN,'1',null]};
 for(const [key,values] of Object.entries(rejected))for(const value of values){
  const recipe=recipeFor({...copy(layer),params:{...layer.params,[key]:value}});assert.ok(fx.validateVisualEffects(recipe).length,key+' '+value);
 }
 for(const kind of ['outline','gradient','particle'])for(const key of ['mode','color2','strength']){
  if(Object.hasOwn(fx.VISUAL_EFFECT_CATALOG[kind].fields,key))continue;
  const other=fx.makeVisualEffectLayer(kind);other.params[key]=key==='mode'?'auto':key==='color2'?'#168fba':1;
  assert.ok(fx.validateVisualEffects(recipeFor(other)).length,kind+' '+key);
 }
 const p=createProject(),recipe=recipeFor(fx.makeVisualEffectLayer('chromatic',{params:{mode:'fringe',color:'#ec3868',color2:'#168fba',strength:0}}));
 p.cards[0].visualEffects=recipe;assert.deepEqual(parseProject(serializeProject(p)).cards[0].visualEffects,recipe);
});

// A bad preset scope/order would block a normal image/frame target or wash out small printed text.
test('fourteen reusable presets validate on every target and keep material fills inside dark edges',()=>{
 const surfaceKinds=new Set(['gradient','foil','holographic','innerGlow','innerShadow','bevel','duotone','scanlines','grain','halftone','sweep']);
 for(const key of newPresets){
  const preset=fx.VISUAL_EFFECT_PRESETS[key];assert.ok(preset?.name,key);assert.ok(preset.category,key+' category');
  const recipe=fx.createVisualEffects(key,{seed:81});assert.ok(recipe.layers.length>1);assert.ok(recipe.layers.length<=12,key);
  assert.equal(recipe.layers.some(layer=>layer.kind==='textWarp'),false,key);
  for(const target of ['any','text','image','effect','frame'])assert.deepEqual(fx.validateVisualEffects(recipe,target),[],key+' '+target);
  const edge=recipe.layers.findIndex(layer=>layer.kind==='outline');assert.ok(edge>=0,key+' edge');assert.equal(recipe.layers[edge].scope,'outside');
  const hex=recipe.layers[edge].params.color.slice(1),rgb=[0,2,4].map(i=>Number.parseInt(hex.slice(i,i+2),16));assert.ok(Math.max(...rgb)<=140,key+' dark edge');
  for(const [index,layer] of recipe.layers.entries()){
   if(['shadow','extrude'].includes(layer.kind))assert.ok(index>edge,key+' edge before shadow');
   if(surfaceKinds.has(layer.kind))assert.equal(layer.scope,'inside',key+' '+layer.kind);
   if(layer.kind==='glow'){assert.equal(layer.scope,'outside');assert.ok(layer.params.radius<=1.5,key+' restrained glow');assert.ok(layer.params.strength<=.6,key+' restrained glow');}
  }
  const p=createProject();fx.writeTargetEffects(p,frameTarget(p),recipe);fx.saveVisualEffectPreset(p,preset.name,recipe);
  assert.deepEqual(parseProject(serializeProject(p)),p,key+' saved preset');
  const independent=fx.createVisualEffects(key,{seed:81});independent.layers[0].params.color='#000000';
  assert.notEqual(recipe.layers[0].params.color,'#000000',key+' independent factory');
 }
 for(const key of ['flame','smoke','burning','burningText','frost','poison','lightningAura','starlight','darkAfterglow','goldTitle','neonText']){
  assert.deepEqual(fx.validateVisualEffects(fx.createVisualEffects(key)),[],key+' existing preset');
 }
});

// New nested material fields must participate in the same sparse Variant overrides as existing effects.
test('new material presets preserve manual copies and sparse Variant inheritance through reload',()=>{
 const p=createProject(),recipe=fx.createVisualEffects('roseGold',{seed:71});p.cards[0].visualEffects=copy(recipe);
 const child=createVariant(p,p.cards[0].id);p.cards.push(child);const store=createStore(p);
 store.edit('Variant 금속 색',draft=>draft.cards[1].visualEffects.layers.find(layer=>layer.kind==='foil').params.color='#ac6472');
 store.edit('원본 금속 무늬 간격',draft=>draft.cards[0].visualEffects.layers.find(layer=>layer.kind==='foil').params.size=3.8);
 const current=store.getProject(),variant=current.cards[1].visualEffects.layers.find(layer=>layer.kind==='foil');
 assert.equal(variant.params.color,'#ac6472');assert.equal(variant.params.size,3.8);
 const id=fx.saveVisualEffectPreset(current,'내 장미 금속',recipe);recipe.layers[0].params.color='#000000';
 assert.notEqual(current.visualEffectPresets.find(preset=>preset.id===id).recipe.layers[0].params.color,'#000000');
 fx.removeVisualEffectPreset(current,id);assert.equal(current.cards[1].visualEffects.layers.find(layer=>layer.kind==='foil').params.color,'#ac6472');
 assert.deepEqual(validateProject(current),[]);assert.deepEqual(parseProject(serializeProject(current)),current);
});
