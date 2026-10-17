import test from 'node:test';
import assert from 'node:assert/strict';
import {createProject,validateProject} from '../src/model/project.js';
import {createStore} from '../src/model/store.js';
import {createVariant} from '../src/model/variants.js';
import {createVisualEffects,writeTargetEffects,preserveTemplateVisualEffects} from '../src/model/visual-effects.js';
import {applyTemplate,syncSkillElements,fitCard} from '../src/render/templates.js';
function fixtureCardWithBoundAndIndependentEffects(){
 const p=createProject(),c=p.cards[0];c.passives=[{id:'healing',name:'치유',effect:'체력 회복',dice:null,keywords:[]}];
 p.cards[0]=applyTemplate(c,p.settings,'monster-standard');
 for(const e of p.cards[0].elements.filter(e=>e.binding&&['text','image'].includes(e.type)))e.style.visualEffects=createVisualEffects('neonText',{seed:9});
 p.cards[0].visualEffects=createVisualEffects('burning',{seed:8});
 p.cards[0].elements.push({id:'free-effect',type:'effect',binding:null,rect:{x:20,y:20,w:10,h:10},style:{visualEffects:createVisualEffects('smoke',{seed:3})}});
 return p;
}
const boundEffects=card=>Object.fromEntries(card.elements.filter(e=>e.binding&&e.style.visualEffects).map(e=>[e.binding.field+':'+(e.binding.skillId||''),e.style.visualEffects]));
function runLayoutFixture(fn,card,p){return fn===applyTemplate?fn(card,p.settings,'monster-effects',p.keywords):fn(card,p.settings,p.keywords);}
test('templates automatic skill layout and fit preserve bound effects without duplicate standalone art',()=>{
 const p=fixtureCardWithBoundAndIndependentEffects(),old=p.cards[0];
 for(const fn of [applyTemplate,syncSkillElements,fitCard]){
  const next=runLayoutFixture(fn,old,p);
  assert.deepEqual(boundEffects(next),boundEffects(old),fn.name);
  assert.equal(next.elements.filter(e=>e.type==='effect').length,1);
  assert.deepEqual(next.visualEffects,old.visualEffects);assert.equal(next.passives[0].effect,'체력 회복');
  next.elements.find(e=>e.binding?.field==='name').style.visualEffects.seed=80;
  assert.equal(old.elements.find(e=>e.binding?.field==='name').style.visualEffects.seed,9);
 }
 assert.equal(typeof preserveTemplateVisualEffects,'function');
});
test('removed skills cannot resurrect effects and newly added skills do not steal old effects',()=>{
 const p=fixtureCardWithBoundAndIndependentEffects(),card=p.cards[0];card.template='custom';card.passives=[];
 card.actives=[{id:'new-skill',name:'새 기술',effect:'새 효과',dice:null,keywords:[]}];
 const next=syncSkillElements(card,p.settings,p.keywords);
 assert.ok(!next.elements.some(e=>e.binding?.skillId==='healing'));
 assert.ok(next.elements.filter(e=>e.binding?.skillId==='new-skill').every(e=>!e.style.visualEffects));
 assert.equal(next.elements.filter(e=>e.type==='effect').length,1);
});
test('variant text glow color stays independent while source radius and template changes remain shared',()=>{
 const p=fixtureCardWithBoundAndIndependentEffects(),root=p.cards[0],child=createVariant(p,root.id);p.cards.push(child);
 const store=createStore(p,{prepare:d=>{d.cards=d.cards.map(c=>syncSkillElements(c,d.settings,d.keywords));}});
 store.edit('Variant 색',d=>{
  const c=d.cards[1],e=c.elements.find(e=>e.binding?.field==='skill.effect'),r=structuredClone(e.style.visualEffects);
  r.layers.find(l=>l.kind==='glow').params.color='#9944dd';
  writeTargetEffects(d,{cardId:c.id,back:false,elementId:e.id},r);
 });
 store.edit('원본 조정',d=>{
  d.cards[0].elements.find(e=>e.binding?.field==='skill.effect').style.visualEffects.layers.find(l=>l.kind==='glow').params.radius=4;
  d.cards[0]=applyTemplate(d.cards[0],d.settings,'monster-effects',d.keywords);
 });
 const e=store.getProject().cards[1].elements.find(e=>e.binding?.field==='skill.effect');
 assert.equal(e.style.visualEffects.layers.find(l=>l.kind==='glow').params.color,'#9944dd');
 assert.equal(e.style.visualEffects.layers.find(l=>l.kind==='glow').params.radius,4);
 assert.equal(store.getProject().cards[1].elements.filter(e=>e.type==='effect').length,1);
 assert.deepEqual(validateProject(store.getProject()),[]);
});
