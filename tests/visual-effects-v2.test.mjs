import test from 'node:test';
import assert from 'node:assert/strict';
import * as fx from '../src/model/visual-effects.js';
import {createProject,parseProject,serializeProject,validateProject} from '../src/model/project.js';
import {createStore} from '../src/model/store.js';
import {createVariant,syncVariants} from '../src/model/variants.js';

const copy=value=>structuredClone(value);
const legacyParams={
 outline:{color:'#ffb24b',width:.5},
 glow:{color:'#ffb24b',radius:2,strength:1},
 shadow:{color:'#152032',offsetX:1,offsetY:1,blur:1.5},
 gradient:{color:'#fff1a8',color2:'#ed6039',angle:90,strength:1},
 sweep:{color:'#ffffff',width:.3,angle:-25,strength:.8},
 flame:{color:'#e74917',color2:'#ff9e24',color3:'#fff0a3',height:.65,width:.14,count:24,sway:.4,life:2,direction:-90},
 smoke:{color:'#79818c',density:.55,size:.2,spread:.5,life:3.5,count:14,direction:-90},
 textWarp:{arc:0,wave:0,wavelength:.5,skewDeg:0,scaleX:1,scaleY:1}
};
function legacyLayer(kind,id=kind,overrides={}){
 return {id,kind,enabled:true,opacity:1,placement:kind==='textWarp'?'source':['flame'].includes(kind)?'front':['gradient','sweep'].includes(kind)?'surface':'behind',
  emitter:['flame','smoke'].includes(kind)?'bottom':'area',rotationDeg:0,origin:{x:0,y:0,w:1,h:1},motion:{enabled:!['outline','shadow','textWarp'].includes(kind),speed:1},
  ...copy(overrides),params:{...copy(legacyParams[kind]),...copy(overrides.params||{})}};
}
const legacyRecipe=(layers=[legacyLayer('smoke'),legacyLayer('flame')])=>({seed:4294967295,layers});
const frameTarget=p=>({cardId:p.cards[0].id,back:false,elementId:null});
function textElement(id,recipe){return {id,type:'text',rect:{x:4,y:4,w:40,h:10},binding:null,style:{fontPt:14,visualEffects:recipe},content:'불타는 글자'};}

// These assertions catch missing v2 kind separation at every model entry point.
test('new recipes are v2 with generator, filter and text-warp fields separated',()=>{
 const recipe=fx.createVisualEffects('burningText',{seed:27});
 assert.equal(recipe.version,2);assert.equal(recipe.seed,27);
 assert.deepEqual(recipe.layers.filter(l=>['flame','smoke'].includes(l.kind)).map(l=>[l.kind,l.placement,l.emit.face,l.emit.openOnly]),[['smoke','behind','up',true],['flame','behind','up',true]]);
 for(const [key] of Object.entries(fx.VISUAL_EFFECT_PRESETS))assert.deepEqual(fx.validateVisualEffects(fx.createVisualEffects(key),'any'),[],key);
 const generator=fx.makeVisualEffectLayer('flame'),filter=fx.makeVisualEffectLayer('pixelate'),warp=fx.makeVisualEffectLayer('textWarp');
 assert.equal(generator.placement,'behind');assert.equal(generator.protectText,true);assert.equal('scope' in generator,false);assert.equal('emitter' in generator,false);
 assert.equal(filter.scope,'all');assert.equal(filter.protectText,true);
 for(const key of ['emit','emitter','origin','rotationDeg','placement'])assert.equal(key in filter,false,key);
 assert.equal(warp.placement,'source');assert.equal(warp.protectText,true);
 for(const key of ['emit','scope','emitter','origin','rotationDeg'])assert.equal(key in warp,false,key);
});

test('quality particle counts and round-fire defaults accept their documented bounds',()=>{
 const flame=fx.makeVisualEffectLayer('flame'),smoke=fx.makeVisualEffectLayer('smoke');
 assert.equal(flame.params.count,110);assert.equal(flame.params.size,.1);assert.equal(flame.params.height,.68);assert.equal(flame.params.life,1.8);
 assert.equal(smoke.params.count,70);assert.equal(smoke.params.size,.09);assert.equal(smoke.params.height,.95);assert.equal(smoke.params.density,.6);
 for(const [kind,max] of [['flame',260],['smoke',200],['particle',80]]){
  const recipe={version:2,seed:1,layers:[fx.makeVisualEffectLayer(kind,{params:{count:max}})]};
  assert.deepEqual(fx.validateVisualEffects(recipe),[]);
  for(const count of [0,max+1,1.5]){const invalid=copy(recipe);invalid.layers[0].params.count=count;assert.ok(fx.validateVisualEffects(invalid).length,kind+' '+count);}
 }
});

const filters=[
 ['pixelate',{size:.6},{size:[.2,3]}],
 ['blur',{radius:.4},{radius:[0,3]}],
 ['colorAdjust',{hue:0,saturation:1,brightness:1},{hue:[-180,180],saturation:[0,2],brightness:[0,2]}],
 ['posterize',{levels:4},{levels:[2,8]}],
 ['halftone',{size:.6,angle:45},{size:[.3,2],angle:[-90,90]}],
 ['chromatic',{distance:.3,angle:0},{distance:[0,1.5],angle:[-180,180]}],
 ['waveDistort',{amplitude:.6,wavelength:6},{amplitude:[0,3],wavelength:[1,20]}],
 ['erode',{depth:.3,roughness:.6},{depth:[0,2],roughness:[0,1]}]
];
test('all eight filters validate scopes, physical parameters and boundary values',()=>{
 for(const [kind,defaults,ranges] of filters){
  const layer=fx.makeVisualEffectLayer(kind);assert.deepEqual(layer.params,defaults,kind);
  for(const scope of ['all','inside','outside'])assert.deepEqual(fx.validateVisualEffects({version:2,seed:0,layers:[{...layer,scope}]}),[],kind+' '+scope);
  for(const [key,[min,max]] of Object.entries(ranges))for(const value of [min,max,min-.01,max+.01,NaN]){
   const recipe={version:2,seed:0,layers:[{...copy(layer),params:{...layer.params,[key]:value}}]};
   assert.equal(fx.validateVisualEffects(recipe).length===0,value===min||value===max,kind+' '+key+' '+value);
  }
 }
 const recipe={version:2,seed:1,layers:[fx.makeVisualEffectLayer('posterize',{params:{levels:3.5}})]};assert.ok(fx.validateVisualEffects(recipe).length);
});

test('v2 validation rejects cross-kind fields and malformed values without repairing input',()=>{
 const original={version:2,seed:1,layers:[fx.makeVisualEffectLayer('flame')]};
 const mutations=[
  r=>r.version=3,r=>delete r.version,r=>delete r.layers[0].protectText,r=>r.layers[0].protectText=1,
  r=>r.layers[0].emit.face='left',r=>r.layers[0].emit.openOnly='true',r=>r.layers[0].emit.extra=true,
  r=>r.layers[0].scope='all',r=>r.layers[0].placement='surface',r=>r.layers[0].emitter='edge',
  r=>r.layers[0].params.noise=1,r=>r.layers[0].origin.z=0,r=>r.layers[0].origin.w=.049,r=>r.layers[0].motion.speed=0,
  r=>{r.layers=[fx.makeVisualEffectLayer('glow')];r.layers[0].emit={face:'all',openOnly:true};},
  r=>{r.layers=[fx.makeVisualEffectLayer('glow')];r.layers[0].placement='behind';},
  r=>{r.layers=[fx.makeVisualEffectLayer('glow')];r.layers[0].scope='edge';},
  r=>{r.layers=[fx.makeVisualEffectLayer('textWarp')];r.layers[0].scope='all';},
  r=>r.frame={scope:'border',bandMm:1.99},r=>r.frame={scope:'border',bandMm:10.01},
  r=>r.frame={scope:'edge',bandMm:4},r=>r.frame={scope:'full',bandMm:4,extra:true}
 ];
 for(const mutate of mutations){const value=copy(original);mutate(value);const before=copy(value);assert.ok(fx.validateVisualEffects(value).length);assert.deepEqual(value,before);}
 for(const scope of ['border','borderBleed','full'])for(const bandMm of [2,10]){
  const value={...copy(original),frame:{scope,bandMm}};assert.deepEqual(fx.validateVisualEffects(value,'frame'),[]);assert.deepEqual(fx.validateVisualEffects(value,'any'),[]);
  for(const target of ['text','image','effect'])assert.ok(fx.validateVisualEffects(value,target).length,target);
 }
 const warp=fx.makeVisualEffectLayer('textWarp');assert.ok(fx.validateVisualEffects({version:2,seed:1,layers:[fx.makeVisualEffectLayer('glow'),warp]},'text').length);
 assert.ok(fx.validateVisualEffects({version:2,seed:1,layers:[warp]},'frame').length);
});

test('valid legacy inputs remain accepted but malformed legacy values cannot be rescued',()=>{
 const original=legacyRecipe();assert.deepEqual(fx.validateVisualEffects(original,'image'),[]);
 for(const mutate of [
  r=>delete r.layers[0].params.life,r=>r.layers[0].params.height=.5,r=>r.layers[0].protectText=true,
  r=>r.layers[0].emit={face:'up',openOnly:true},r=>r.layers[0].scope='all',r=>r.layers[0].params.count=81,
  r=>r.layers[0].origin.h=.001,r=>r.layers[0].kind='pixelate',r=>r.frame={scope:'full',bandMm:4}
 ]){const value=copy(original);mutate(value);assert.ok(fx.validateVisualEffects(value).length);assert.throws(()=>fx.upgradeVisualEffects(value));}
 assert.deepEqual(original,legacyRecipe());
});

test('legacy upgrade keeps IDs and seed, sorts old groups and maps original-shape filters',()=>{
 const original=legacyRecipe([
  legacyLayer('textWarp','warp'),legacyLayer('flame','fire'),legacyLayer('glow','light'),legacyLayer('smoke','haze'),legacyLayer('gradient','ink'),legacyLayer('sweep','shine')
 ]),before=copy(original),next=fx.upgradeVisualEffects(original,'text');
 assert.equal(next.version,2);assert.equal(next.seed,4294967295);
 assert.deepEqual(next.layers.map(l=>l.id),['warp','light','ink','shine','haze','fire']);
 assert.deepEqual(next.layers.filter(l=>l.scope).map(l=>[l.kind,l.scope]),[['glow','outside'],['gradient','inside'],['sweep','inside']]);
 assert.deepEqual(next.layers.filter(l=>l.emit).map(l=>l.placement),['behind','front']);
 assert.ok(next.layers.every(l=>l.protectText));assert.equal(next.layers.find(l=>l.kind==='flame').params.size,.1);
 assert.equal(next.layers.find(l=>l.kind==='smoke').params.height,.95);assert.deepEqual(fx.validateVisualEffects(next,'text'),[]);
 assert.deepEqual(original,before);assert.deepEqual(fx.upgradeVisualEffects(next,'text'),next);
 const independent=fx.upgradeVisualEffects(next,'text');independent.layers[0].params.arc=.9;assert.equal(next.layers[0].params.arc,0);
});

test('legacy emitter conversion retains extreme valid geometry as the last ten-percent strip',()=>{
 const original=legacyRecipe([
  legacyLayer('flame','bottom',{origin:{x:2,y:2,w:3,h:3}}),
  legacyLayer('flame','small',{origin:{x:-1,y:-1,w:.05,h:.05}}),
  legacyLayer('smoke','edge',{emitter:'edge'}),legacyLayer('smoke','area',{emitter:'area'})
 ]),next=fx.upgradeVisualEffects(original);
 const bottom=next.layers.find(l=>l.id==='bottom'),small=next.layers.find(l=>l.id==='small');
 assert.deepEqual(bottom.emit,{face:'area',openOnly:true});assert.equal(bottom.origin.y,4.7);assert.ok(Math.abs(bottom.origin.h-.3)<1e-12);
 assert.ok(Math.abs(small.origin.y+.955)<1e-12);assert.ok(Math.abs(small.origin.h-.005)<1e-12);
 assert.deepEqual(next.layers.find(l=>l.id==='edge').emit,{face:'all',openOnly:false});assert.deepEqual(next.layers.find(l=>l.id==='area').emit,{face:'area',openOnly:true});
 assert.deepEqual(fx.validateVisualEffects(next),[]);
 assert.deepEqual(fx.upgradeVisualEffects(legacyRecipe(),'frame').frame,{scope:'full',bandMm:4});
 assert.equal('frame' in fx.upgradeVisualEffects(legacyRecipe(),'image'),false);
});

test('target read/write normalize legacy copies and reject direct frame metadata on text',()=>{
 const p=createProject(),recipe=legacyRecipe();p.cards[0].visualEffects=copy(recipe);p.cards[0].elements.push(textElement('title',copy(recipe)));
 const read=fx.readTargetEffects(p,frameTarget(p));assert.equal(read.version,2);assert.deepEqual(read.frame,{scope:'full',bandMm:4});assert.equal(p.cards[0].visualEffects.version,undefined);
 fx.writeTargetEffects(p,{...frameTarget(p),elementId:'title'},recipe);assert.equal(p.cards[0].elements[0].style.visualEffects.version,2);
 fx.writeTargetEffects(p,frameTarget(p),recipe);assert.equal(p.cards[0].visualEffects.version,2);
 assert.throws(()=>fx.writeTargetEffects(p,{...frameTarget(p),elementId:'title'},read));
 const id=fx.saveVisualEffectPreset(p,'프레임',read);read.frame.bandMm=8;
 assert.equal(p.visualEffectPresets.find(x=>x.id===id).recipe.frame.bandMm,4);
 assert.equal(p.visualEffectPresets.find(x=>x.id===id).recipe.version,2);
});

function legacyVariantFixture(){
 const p=createProject(),root=p.cards[0];root.template='custom';root.autoSkillLayout=false;root.visualEffects=legacyRecipe();root.elements.push(textElement('source-title',legacyRecipe()));
 const child=createVariant(p,root.id);p.cards.push(child);const store=createStore(p);
 store.edit('이전 Variant의 일부 레이어만 수정',d=>{
  d.cards[1].visualEffects.layers.find(l=>l.kind==='smoke').params.color='#9933ff';
  d.cards[1].elements[0].style.visualEffects.layers.find(l=>l.kind==='flame').params.color='#cc2200';
 });
 return copy(store.getProject());
}
test('import upgrades sparse Variant patches and untouched parent parameters continue to inherit',()=>{
 const original=legacyVariantFixture(),loaded=parseProject(JSON.stringify(original));
 assert.equal(loaded.version,1);assert.equal(loaded.cards[0].visualEffects.version,2);assert.equal(loaded.cards[1].visualEffects.version,2);
 assert.equal(loaded.cards[1].elements[0].style.visualEffects.version,2);assert.deepEqual(validateProject(loaded),[]);
 const snapshot=JSON.stringify(loaded);syncVariants(loaded);assert.equal(JSON.stringify(loaded),snapshot);
 const store=createStore(loaded);store.edit('원본의 다른 불꽃 값',d=>{
  d.cards[0].visualEffects.layers.find(l=>l.kind==='flame').params.height=.88;
  d.cards[0].elements[0].style.visualEffects.layers.find(l=>l.kind==='smoke').params.density=.8;
 });
 const child=store.getProject().cards[1];assert.equal(child.visualEffects.layers.find(l=>l.kind==='flame').params.height,.88);
 assert.equal(child.visualEffects.layers.find(l=>l.kind==='smoke').params.color,'#9933ff');
 assert.equal(child.elements[0].style.visualEffects.layers.find(l=>l.kind==='smoke').params.density,.8);
 assert.equal(child.elements[0].style.visualEffects.layers.find(l=>l.kind==='flame').params.color,'#cc2200');
 const saved=serializeProject(store.getProject()),again=serializeProject(parseProject(saved));assert.equal(again,saved);
 assert.equal(original.cards[0].visualEffects.version,undefined);
});

test('project upgrader visits presets, backs, independent overrides and added Variant elements',()=>{
 const p=legacyVariantFixture(),child=p.cards[1];p.visualEffectPresets=[{id:'old-preset',name:'예전 조합',recipe:legacyRecipe()}];p.back.elements.push(textElement('back-title',legacyRecipe()));
 child.variant.overrides.visualEffects={value:legacyRecipe([legacyLayer('flame','own-fire')])};child.visualEffects=copy(child.variant.overrides.visualEffects.value);
 child.variant.overrides.elements={list:{edits:{},removed:[],added:[textElement('own-title',legacyRecipe())],order:null}};syncVariants(p);
 const reference=p;assert.equal(fx.upgradeProjectVisualEffects(p),reference);syncVariants(p);
 assert.equal(p.visualEffectPresets[0].recipe.version,2);assert.equal(p.back.elements[0].style.visualEffects.version,2);
 assert.equal(p.cards[1].variant.overrides.visualEffects.value.version,2);assert.equal(p.cards[1].variant.overrides.elements.list.added[0].style.visualEffects.version,2);
 assert.equal(p.cards[1].visualEffects.layers[0].id,'own-fire');assert.equal(p.cards[1].elements.find(e=>e.id==='own-title').style.visualEffects.version,2);
 assert.deepEqual(validateProject(p),[]);
 const saved=serializeProject(p);assert.equal(serializeProject(parseProject(saved)),saved);
});

test('malformed full recipes hidden in Variant overrides reject import without altering a store',()=>{
 const store=createStore(createProject()),before=JSON.stringify(store.getProject()),p=legacyVariantFixture();
 p.cards[1].variant.overrides.visualEffects={value:{version:2,seed:1,layers:[{...fx.makeVisualEffectLayer('flame'),scope:'all'}]}};
 assert.throws(()=>store.load(parseProject(JSON.stringify(p))));assert.equal(JSON.stringify(store.getProject()),before);
});

test('template preservation normalizes recipes while keeping independent effect elements',()=>{
 const before={elements:[{...textElement('name',legacyRecipe()),binding:{field:'name'}},{id:'standalone',type:'effect',style:{visualEffects:legacyRecipe()},rect:{x:1,y:1,w:10,h:10}}],visualEffects:legacyRecipe()};
 const after={elements:[{...textElement('new-name',undefined),binding:{field:'name'}}]};
 fx.preserveTemplateVisualEffects(before,after);assert.equal(after.visualEffects.version,2);assert.equal(after.elements[0].style.visualEffects.version,2);
 assert.equal(after.elements[1].style.visualEffects.version,2);after.elements[0].style.visualEffects.layers[0].params.color='#000000';assert.equal(before.elements[0].style.visualEffects.layers[0].params.color,'#79818c');
});

test('legacy Variant whole-parameter and kind patches receive new required parameters',()=>{
 for(const changeKind of [false,true]){
  const p=legacyVariantFixture(),child=p.cards[1],id=changeKind?'smoke':'flame',params={...copy(legacyParams.flame),height:.42};
  child.variant.overrides.visualEffects={fields:{layers:{list:{edits:{[id]:{fields:{...(changeKind?{kind:{value:'flame'}}:{}),params:{value:params}}}},removed:[],added:[],order:null}}}};
  syncVariants(p);
  const loaded=parseProject(JSON.stringify(p)),layer=loaded.cards[1].visualEffects.layers.find(l=>l.id===id);
  assert.equal(layer.kind,'flame');assert.equal(layer.params.size,.1);assert.equal(layer.params.height,.42);
  assert.deepEqual(validateProject(loaded),[]);const snapshot=JSON.stringify(loaded);syncVariants(loaded);assert.equal(JSON.stringify(loaded),snapshot);
 }
});

test('legacy Variant new filters migrate ahead of generators and emitter edits stay v2',()=>{
 const p=legacyVariantFixture(),store=createStore(p);
 store.edit('발생 면과 새 필터',d=>{
  const layers=d.cards[1].visualEffects.layers;layers[0].emitter='edge';layers[0].origin.x=.25;layers.push(legacyLayer('shadow','own-shadow'));
 });
 const loaded=parseProject(JSON.stringify(store.getProject())),child=loaded.cards[1];
 assert.deepEqual(child.visualEffects.layers.map(l=>l.id),['own-shadow','smoke','flame']);
 assert.deepEqual(child.visualEffects.layers.find(l=>l.id==='smoke').emit,{face:'all',openOnly:false});
 assert.equal(child.visualEffects.layers.find(l=>l.id==='smoke').origin.x,.25);
 assert.deepEqual(validateProject(loaded),[]);const snapshot=JSON.stringify(loaded);syncVariants(loaded);assert.equal(JSON.stringify(loaded),snapshot);
});

test('hidden legacy element effects upgrade while the source is absent and revive as valid v2',()=>{
 const p=legacyVariantFixture(),restore=copy(p.cards[0].elements[0]),store=createStore(p);
 store.edit('Variant만 글자 왜곡으로 변경',d=>{d.cards[1].elements[0].style.visualEffects=legacyRecipe([legacyLayer('textWarp','own-warp')]);});
 store.edit('원본 글자 숨기기',d=>{d.cards[0].elements=[];});
 const loaded=parseProject(JSON.stringify(store.getProject()));assert.deepEqual(loaded.cards[1].elements,[]);
 const revived=createStore(loaded);revived.edit('원본 글자 다시 표시',d=>{restore.style.visualEffects=fx.upgradeVisualEffects(restore.style.visualEffects,'text');d.cards[0].elements.push(restore);});
 const recipe=revived.getProject().cards[1].elements[0].style.visualEffects;
 assert.equal(recipe.version,2);assert.deepEqual(recipe.layers.map(l=>l.id),['own-warp']);assert.deepEqual(fx.validateVisualEffects(recipe,'text'),[]);
 const saved=serializeProject(revived.getProject());assert.equal(serializeProject(parseProject(saved)),saved);
});
