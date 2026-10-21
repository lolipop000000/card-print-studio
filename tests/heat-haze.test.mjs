import test from 'node:test';
import assert from 'node:assert/strict';
import {VISUAL_EFFECT_CATALOG,makeVisualEffectLayer,createVisualEffects,validateVisualEffects,hasEffectMotion} from '../src/model/visual-effects.js';

test('heat shimmer is an adjustable animated filter usable on text and artwork',()=>{
 assert.ok(VISUAL_EFFECT_CATALOG.heatHaze,'heat shimmer must be a distinct effect, not a rename of regular crossing waves');
 const layer=makeVisualEffectLayer('heatHaze',{params:{amount:.3,wavelength:2.4,detail:.7,direction:-90}}),recipe=createVisualEffects();recipe.layers.push(layer);
 assert.deepEqual(validateVisualEffects(recipe,'text'),[]);assert.deepEqual(validateVisualEffects(recipe,'image'),[]);assert.equal(hasEffectMotion(recipe),true);
 for(const [field,value] of [['amount',-1],['wavelength',0],['detail',2],['direction',181]]){const bad=structuredClone(recipe);bad.layers[0].params[field]=value;assert.ok(validateVisualEffects(bad,'text').length,field);}
 layer.motion.enabled=false;assert.equal(hasEffectMotion(recipe),false);
});

test('hot text presets combine real irregular heat shimmer with light and flames',()=>{
 const heat=createVisualEffects('heatShimmer');assert.ok(heat.layers.some(layer=>layer.kind==='heatHaze'));assert.deepEqual(validateVisualEffects(heat,'text'),[]);
 const fire=createVisualEffects('burningText');assert.ok(fire.layers.some(layer=>layer.kind==='flame'));assert.equal(fire.layers.at(-1).kind,'heatHaze');
});
