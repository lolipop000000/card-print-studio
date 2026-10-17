import {VISUAL_EFFECT_CATALOG,VISUAL_EFFECT_PRESETS,makeVisualEffectLayer,createVisualEffects} from './visual-effects.js';

const usesAreaDefault=(kind,targetType,overrides={})=>targetType==='effect'&&VISUAL_EFFECT_CATALOG[kind]?.generative&&overrides.emit?.face===undefined&&overrides.emitter===undefined;

// Choose defaults only at creation time. Saved recipes and explicit faces keep
// their existing meaning, including contours attached to text and artwork.
export function makeVisualEffectLayerForTarget(kind,targetType,overrides={}){
 return makeVisualEffectLayer(kind,usesAreaDefault(kind,targetType,overrides)?{...overrides,emit:{...overrides.emit,face:'area'}}:overrides);
}

export function createVisualEffectsForTarget(presetKey='empty',targetType='any',options={}){
 const recipe=createVisualEffects(presetKey,options),definitions=VISUAL_EFFECT_PRESETS[presetKey]?.layers||[];
 for(let i=0;i<recipe.layers.length;i++)if(usesAreaDefault(recipe.layers[i].kind,targetType,definitions[i]))recipe.layers[i].emit.face='area';
 return recipe;
}
