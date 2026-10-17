import test from 'node:test';
import assert from 'node:assert/strict';
import {createProject,parseProject,serializeProject,validateProject} from '../src/model/project.js';
import {createVisualEffects,makeVisualEffectLayer,validateVisualEffects,getEffectFrameSec} from '../src/model/visual-effects.js';

test('saved frames past six seconds survive project roundtrip and ripple can shrink to zero',()=>{
 const p=createProject();p.print.effectFrameSec=12.35;
 const recipe=createVisualEffects();recipe.layers=[makeVisualEffectLayer('ripple',{params:{start:.9,end:0,count:1}})];p.cards[0].visualEffects=recipe;
 assert.deepEqual(validateProject(p),[]);assert.equal(getEffectFrameSec(p),12.35);
 assert.equal(parseProject(serializeProject(p)).print.effectFrameSec,12.35);
 for(const time of [-.01,NaN,Infinity]){p.print.effectFrameSec=time;assert.ok(validateProject(p).some(p=>p.code==='effect-frame'));}
});

test('effect field diagnostics state the layer, field, supplied value and accepted range',()=>{
 const recipe=createVisualEffects('flame');recipe.layers[0].params.height=9;
 let message=validateVisualEffects(recipe)[0].message;
 assert.match(message,/불꽃/);assert.match(message,/높이/);assert.match(message,/9/);assert.match(message,/0\.05.*2/);assert.doesNotMatch(message,/확인하세요/);
 recipe.layers[0].params.height=.68;recipe.layers[0].motion.speed=0;
 message=validateVisualEffects(recipe)[0].message;assert.match(message,/재생 속도/);assert.match(message,/0.1/);assert.match(message,/3/);
});

test('project diagnostics identify the exact dimension, HP reduction and print field',()=>{
 const p=createProject();p.settings.cardWidthMm=0;
 assert.match(validateProject(p)[0].message,/카드 폭.*0/);p.settings.cardWidthMm=63;
 p.cards[0].hpReduction=105;assert.match(validateProject(p)[0].message,/105.*100/);p.cards[0].hpReduction=0;
 p.print.marginMm=-1;assert.match(validateProject(p)[0].message,/여백.*-1/);
});
