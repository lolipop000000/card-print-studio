import test from 'node:test';
import assert from 'node:assert/strict';
import {createVisualEffects,makeVisualEffectLayer,validateVisualEffects,VISUAL_EFFECT_PRESETS} from '../src/model/visual-effects.js';
import {createProject,validateProject,parseProject,serializeProject} from '../src/model/project.js';

test('creative primitives validate and survive project round trips',()=>{
 const p=createProject(),r=createVisualEffects();
 for(const kind of ['sprite','bloom','directionalBlur','displacement'])r.layers.push(makeVisualEffectLayer(kind));
 assert.deepEqual(validateVisualEffects(r,'text'),[]);
 p.cards[0].visualEffects=r;
 assert.deepEqual(validateProject(p),[]);
 assert.deepEqual(parseProject(serializeProject(p)).cards[0].visualEffects,r);
 for(const key of Object.keys(VISUAL_EFFECT_PRESETS))assert.deepEqual(validateVisualEffects(createVisualEffects(key)),[],key);
});
test('sprite asset IDs are nullable, validated and checked even when shape changes',()=>{
 const p=createProject(),r=createVisualEffects();r.layers.push(makeVisualEffectLayer('sprite'));
 const l=r.layers[0];assert.equal(l.params.assetId,null);
 for(const value of [2,{},'',false,'__proto__']){
  l.params.assetId=value;assert.ok(validateVisualEffects(r).some(p=>p.message.includes('입자 이미지')));
 }
 l.params.assetId='lost-sprite';p.cards[0].visualEffects=r;
 assert.ok(validateProject(p).some(p=>p.code==='asset-reference'&&p.message.includes('lost-sprite')));
});
test('new controls reject exact invalid values and allow contraction to zero',()=>{
 for(const [kind,key,value,label] of [['bloom','threshold',2,'밝기 기준'],['directionalBlur','samples',2,'샘플 수'],['displacement','amount',4,'흔들림 거리'],['sprite','sizeEnd',-1,'끝 크기'],['sprite','gravity',3,'중력']]){
  const r=createVisualEffects();r.layers.push(makeVisualEffectLayer(kind));r.layers[0].params[key]=value;
  assert.ok(validateVisualEffects(r).some(p=>p.message.includes(label)&&p.message.includes(String(value))),kind);
 }
 const r=createVisualEffects();r.layers.push(makeVisualEffectLayer('sprite',{params:{sizeStart:.5,sizeEnd:0,alphaStart:1,alphaEnd:0,randomness:0}}));
 assert.deepEqual(validateVisualEffects(r),[]);
});
