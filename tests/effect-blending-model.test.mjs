import test from 'node:test';
import assert from 'node:assert/strict';
import {BLEND_MODES,DEFAULT_BLEND_MODE} from '../src/model/blend-modes.js';
import {createProject,parseProject,serializeProject,validateProject} from '../src/model/project.js';
import {createStore} from '../src/model/store.js';
import {createVariant} from '../src/model/variants.js';
import {exportCardFile,parseCardFile,importCardFile} from '../src/model/card-file.js';
import {createVisualEffects,makeVisualEffectLayer,validateVisualEffects,upgradeVisualEffects,writeTargetEffects,saveVisualEffectPreset,removeVisualEffectPreset} from '../src/model/visual-effects.js';

const recipe=(kind='gradient',overrides={})=>({...createVisualEffects(),layers:[makeVisualEffectLayer(kind,{id:'blend-layer',...overrides})]});
const target=p=>({cardId:p.cards[0].id,elementId:null,back:false});

test('effect recipes accept all 26 shared native blend modes and preserve omission for old layers',()=>{
 assert.equal(BLEND_MODES.length,26);assert.equal(DEFAULT_BLEND_MODE,'source-over');
 for(const kind of ['gradient','sprite'])for(const [blendMode] of BLEND_MODES){
  const value=recipe(kind,{blendMode});
  assert.deepEqual(validateVisualEffects(value),[],kind+' '+blendMode);
  assert.equal(upgradeVisualEffects(value).layers[0].blendMode,blendMode);
 }
 const old=recipe();assert.equal(Object.hasOwn(old.layers[0],'blendMode'),false);
 assert.deepEqual(upgradeVisualEffects(old),old,'Reading an older v2 recipe does not insert defaults');
});

test('malformed effect blend values are rejected instead of normalized during validation or parsing',()=>{
 for(const blendMode of ['normal','Multiply','source-over ', '',null,2,true,{},['screen'],undefined]){
  const value=recipe('gradient',{blendMode}),before=structuredClone(value);
  assert.ok(validateVisualEffects(value).length,'invalid '+String(blendMode));
  assert.deepEqual(value,before,'Validation is read only');assert.throws(()=>upgradeVisualEffects(value));
  const p=createProject();p.cards[0].visualEffects=value;assert.ok(validateProject(p).length);
  if(blendMode!==undefined)assert.throws(()=>parseProject(JSON.stringify(p)));
 }
});

test('text warp accepts optional normal metadata and rejects a color blend that has no defined effect',()=>{
 assert.deepEqual(validateVisualEffects(recipe('textWarp'),'text'),[]);
 assert.deepEqual(validateVisualEffects(recipe('textWarp',{blendMode:'source-over'}),'text'),[]);
 for(const blendMode of ['multiply','copy','destination-in']){
  assert.match(validateVisualEffects(recipe('textWarp',{blendMode}),'text').map(p=>p.message).join(' '),/혼합/);
 }
});

test('optional blend metadata survives legacy recipe upgrade without adding it to untouched layers',()=>{
 const legacyLayer={id:'old',kind:'gradient',enabled:true,opacity:.6,params:{color:'#ffb24b',color2:'#334488',angle:20,strength:.7},motion:{enabled:false,speed:1},placement:'surface',emitter:'area',rotationDeg:0,origin:{x:0,y:0,w:1,h:1}};
 const old={seed:9,layers:[structuredClone(legacyLayer)]};assert.deepEqual(validateVisualEffects(old),[]);
 assert.equal(Object.hasOwn(upgradeVisualEffects(old).layers[0],'blendMode'),false);
 legacyLayer.blendMode='overlay';const value={seed:9,layers:[legacyLayer]};
 assert.deepEqual(validateVisualEffects(value),[]);assert.equal(upgradeVisualEffects(value).layers[0].blendMode,'overlay');
});

test('blend selections round trip through deck presets and detached card files',()=>{
 const p=createProject(),r=recipe('sprite',{blendMode:'screen',placement:'front'});
 writeTargetEffects(p,target(p),r);const presetId=saveVisualEffectPreset(p,'빛 혼합',r);
 const element={id:'blend-text',type:'text',binding:null,content:'빛',rect:{x:4,y:5,w:30,h:10},style:{fontPt:14,visualEffects:recipe('gradient',{blendMode:'color'})}};
 p.cards[0].elements.push(element);p.cards[0].template='custom';p.cards[0].autoSkillLayout=false;
 const loaded=parseProject(serializeProject(p));assert.deepEqual(loaded,p);
 r.layers[0].blendMode='multiply';saveVisualEffectPreset(p,'수정',r,presetId);
 assert.equal(p.cards[0].visualEffects.layers[0].blendMode,'screen');
 removeVisualEffectPreset(p,presetId);assert.equal(p.cards[0].visualEffects.layers[0].blendMode,'screen');
 const exported=exportCardFile(p,p.cards[0].id),card=parseCardFile(exported).cards[0];
 assert.equal(card.visualEffects.layers[0].blendMode,'screen');assert.equal(card.elements[0].style.visualEffects.layers[0].blendMode,'color');
 const receiving=createProject(),added=importCardFile(receiving,exported);
 assert.equal(added.visualEffects.layers[0].blendMode,'screen');assert.equal(added.elements[0].style.visualEffects.layers[0].blendMode,'color');
 assert.deepEqual(validateProject(receiving),[]);
});

test('a Variant blend override remains sparse while other parameters and new source modes inherit with undo',()=>{
 const p=createProject(),base=p.cards[0];base.visualEffects={...createVisualEffects(),layers:[makeVisualEffectLayer('gradient',{id:'color'}),makeVisualEffectLayer('sprite',{id:'particles'})]};
 const child=createVariant(p,base.id);p.cards.push(child);const store=createStore(p);
 store.edit('Variant 혼합',d=>{d.cards[1].visualEffects.layers[0].blendMode='multiply';});
 const change=store.getProject().cards[1].variant.overrides.visualEffects.fields.layers.list;
 assert.deepEqual(change.edits.color,{fields:{blendMode:{value:'multiply'}}});assert.deepEqual(change.added,[]);
 store.edit('원본 변경',d=>{d.cards[0].visualEffects.layers[0].params.angle=35;d.cards[0].visualEffects.layers[0].blendMode='screen';d.cards[0].visualEffects.layers[1].blendMode='overlay';});
 let value=store.getProject().cards[1].visualEffects;
 assert.equal(value.layers[0].blendMode,'multiply');assert.equal(value.layers[0].params.angle,35);assert.equal(value.layers[1].blendMode,'overlay');
 const restored=parseProject(serializeProject(store.getProject()));assert.deepEqual(restored,store.getProject());
 store.undo();assert.equal(store.getProject().cards[1].visualEffects.layers[1].blendMode,undefined);store.redo();
 const reloaded=createStore(restored);reloaded.edit('원본 추가 변경',d=>{d.cards[0].visualEffects.layers[0].params.strength=.35;d.cards[0].visualEffects.layers[1].blendMode='xor';});
 value=reloaded.getProject().cards[1].visualEffects;assert.equal(value.layers[0].blendMode,'multiply');assert.equal(value.layers[0].params.strength,.35);assert.equal(value.layers[1].blendMode,'xor');
 assert.deepEqual(validateProject(reloaded.getProject()),[]);
});
