import test from 'node:test';
import assert from 'node:assert/strict';
import {createVisualEffects,makeVisualEffectLayer,validateVisualEffects} from '../src/model/visual-effects.js';

const recipe=params=>({...createVisualEffects(),layers:[makeVisualEffectLayer('sprite',{params})]});
const messages=params=>validateVisualEffects(recipe(params)).map(p=>p.message).join(' ');

test('sprite ratio diagnostics use the same percent range and values as their controls',()=>{
 for(const [params,value,range] of [[{cropLeft:.96},'96','0~95%'],[{cropBottom:-.01},'-1','0~95%'],[{anchorX:1.1},'110','0~100%'],[{anchorY:-.1},'-10','0~100%']]){
  const text=messages(params);assert.ok(text.includes('값 '+value+'은'),text);assert.ok(text.includes(range),text);
 }
});

test('sprite percent diagnostics keep malformed input readable without numeric coercion',()=>{
 for(const [value,label] of [['잘못된 값','“잘못된 값”'],[null,'null'],[{},'객체'],[false,'false']]){
  const text=messages({cropTop:value});assert.ok(text.includes('값 '+label+'은'),text);assert.ok(text.includes('0~95%'),text);assert.equal(text.includes('NaN'),false,text);
 }
});
