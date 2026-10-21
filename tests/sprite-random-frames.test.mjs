import test from 'node:test';
import assert from 'node:assert/strict';
import {makeVisualEffectLayer,createVisualEffects,validateVisualEffects} from '../src/model/visual-effects.js';
import {isSpriteFieldVisible} from '../src/model/sprite-controls.js';
import {createProject,serializeProject,parseProject} from '../src/model/project.js';

test('random frame selections are valid recipes and survive project save and reload',()=>{
 for(const frameMode of ['random','randomLoop']){
  const recipe={...createVisualEffects(),layers:[makeVisualEffectLayer('sprite',{params:{shape:'image',sheetColumns:3,sheetRows:2,frameStart:2,frameCount:3,frameMode}})]};
  assert.deepEqual(validateVisualEffects(recipe),[],frameMode);
  const project=createProject();project.cards[0].visualEffects=recipe;
  assert.deepEqual(parseProject(serializeProject(project)).cards[0].visualEffects,recipe);
 }
});

test('only changing random frames exposes a playback rate control',()=>{
 assert.equal(isSpriteFieldVisible('frameRate',{shape:'image',frameMode:'random'}),false);
 assert.equal(isSpriteFieldVisible('frameRate',{shape:'image',frameMode:'randomLoop'}),true);
});
