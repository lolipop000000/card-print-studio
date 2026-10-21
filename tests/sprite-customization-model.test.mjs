import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createVisualEffects,makeVisualEffectLayer,validateVisualEffects,upgradeVisualEffects,saveVisualEffectPreset} from '../src/model/visual-effects.js';
import {createProject,validateProject,serializeProject,parseProject} from '../src/model/project.js';
import {createStore} from '../src/model/store.js';
import {createVariant} from '../src/model/variants.js';
const root=fileURLToPath(new URL('../',import.meta.url));
const controls=existsSync(path.join(root,'src/model/sprite-controls.js'))?await import('../src/model/sprite-controls.js'):{};
const recipe=(params={})=>({...createVisualEffects(),layers:[makeVisualEffectLayer('sprite',{id:'image-layer',params})]});

test('new sprite layers contain usable defaults while older v2 recipes stay sparse',()=>{
 const fresh=recipe().layers[0];
 assert.equal(fresh.params.renderMode,'particles');assert.equal(fresh.params.cropLeft,0);assert.equal(fresh.params.scaleX,1);assert.equal(fresh.params.anchorX,.5);assert.equal(fresh.params.mirror,'none');assert.equal(fresh.params.sheetColumns,1);assert.equal(fresh.params.frameMode,'fixed');assert.equal(fresh.params.frameCount,0);
 const old=structuredClone(recipe());for(const key of Object.keys(controls.SPRITE_CONTROL_FIELDS??{}))delete old.layers[0].params[key];
 assert.deepEqual(validateVisualEffects(old),[]);assert.deepEqual(upgradeVisualEffects(old),old,'Reading an old v2 recipe must not fill optional controls');
});

test('sprite crop and sheet constraints report the conflicting values without rewriting the recipe',()=>{
 for(const [params,pattern] of [[{cropLeft:.6,cropRight:.4},/가로.*100%/],[{cropTop:.75,cropBottom:.3},/세로.*105%/],[{sheetColumns:2,sheetRows:2,frameStart:4},/시작 프레임.*4.*4/],[{sheetColumns:2,sheetRows:2,frameStart:2,frameCount:3},/프레임 수.*3.*2/]]){
  const r=recipe(params),before=structuredClone(r),problems=validateVisualEffects(r);assert.ok(problems.some(p=>pattern.test(p.message)),JSON.stringify(problems));assert.deepEqual(r,before);
 }
 for(const params of [{cropLeft:.95,cropRight:0,cropTop:.95},{sheetColumns:16,sheetRows:16,frameStart:255,frameCount:1},{sheetColumns:2,sheetRows:2,frameStart:3,frameCount:0},{sizeStart:8,sizeEnd:0,scaleX:8,scaleY:.05,anchorX:0,anchorY:1,mirror:'both'}])assert.deepEqual(validateVisualEffects(recipe(params)),[],JSON.stringify(params));
});

test('sprite optional numeric and enum controls reject invalid values at the public validation boundary',()=>{
 for(const [key,value] of [['renderMode','stamp'],['cropLeft',1],['cropBottom',NaN],['scaleX',0],['scaleY',8.1],['mirror','horizontal'],['anchorX',-1],['anchorY',2],['sheetColumns',1.5],['sheetRows',17],['frameStart',-1],['frameCount',257],['frameMode','unknown'],['frameRate',61],['sizeStart',8.1]]){
  const problems=validateVisualEffects(recipe({[key]:value}));assert.ok(problems.length,key+'='+String(value));
 }
});

test('sprite controls expose only relevant controls for images, shapes and fixed decorations',()=>{
 assert.equal(typeof controls.isSpriteFieldVisible,'function');const visible=controls.isSpriteFieldVisible;
 assert.equal(visible('cropLeft',{shape:'star'}),false);assert.equal(visible('sheetRows',{shape:'image'}),true);
 for(const key of ['count','life','sizeEnd','alphaEnd','travel','spread','drift','gravity','randomness','fadeIn','fadeOut'])assert.equal(visible(key,{shape:'image',renderMode:'single'}),false,key);
 for(const key of ['sizeStart','alphaStart','rotation','spin','anchorX','scaleY','mirror','cropTop'])assert.equal(visible(key,{shape:'image',renderMode:'single'}),true,key);
 assert.equal(visible('frameRate',{shape:'image',frameMode:'fixed'}),false);assert.equal(visible('frameRate',{shape:'image',frameMode:'life'}),false);assert.equal(visible('frameRate',{shape:'image',renderMode:'single',frameMode:'life'}),true);assert.equal(visible('frameRate',{shape:'image',frameMode:'loop'}),true);
});

test('sprite transforms and atlas settings round trip through presets and sparse Variant edits with undo',()=>{
 const p=createProject(),base=p.cards[0];base.visualEffects=recipe({renderMode:'single',cropLeft:.1,cropBottom:.2,scaleX:2,scaleY:.7,mirror:'both',anchorX:.2,anchorY:.8,sheetColumns:4,sheetRows:2,frameMode:'pingpong',frameStart:1,frameCount:5,frameRate:8,sizeStart:2});
 const preset=saveVisualEffectPreset(p,'잘라 쓴 장식',base.visualEffects);assert.ok(preset);
 const child=createVariant(p,base.id);p.cards.push(child);const store=createStore(p);
 store.edit('장식 변형',d=>{d.cards[1].visualEffects.layers[0].params.mirror='x';d.cards[1].visualEffects.layers[0].params.anchorY=.3;});
 const edit=store.getProject().cards[1].variant.overrides.visualEffects.fields.layers.list.edits['image-layer'];assert.deepEqual(edit,{fields:{params:{fields:{mirror:{value:'x'},anchorY:{value:.3}}}}});
 store.edit('원본 자르기',d=>{d.cards[0].visualEffects.layers[0].params.cropLeft=.2;});assert.equal(store.getProject().cards[1].visualEffects.layers[0].params.cropLeft,.2);
 store.undo();assert.equal(store.getProject().cards[1].visualEffects.layers[0].params.cropLeft,.1);store.redo();
 const loaded=parseProject(serializeProject(store.getProject()));assert.deepEqual(loaded,store.getProject());assert.deepEqual(validateProject(loaded),[]);assert.equal(loaded.visualEffectPresets[0].recipe.layers[0].params.cropLeft,.1);
});
