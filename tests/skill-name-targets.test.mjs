import {applyTemplate,syncSkillElements} from '../src/render/templates.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createProject,validateProject,serializeProject,parseProject} from '../src/model/project.js';
import * as effects from '../src/model/visual-effects.js';
import {createStore} from '../src/model/store.js';
import {createVariant} from '../src/model/variants.js';

function fixture(){const p=createProject();p.cards[0].passives=[{id:'strike',name:'강타',effect:'다시 강타',dice:null,keywords:[]}];return p;}
test('name-only effect target writes the skill and leaves frame and title element effects independent',()=>{
 const p=fixture(),card=p.cards[0],target={cardId:card.id,skillId:'strike',elementId:null},recipe=effects.createVisualEffects('flame',{seed:12});
 effects.writeTargetEffects(p,target,recipe);
 assert.equal(card.passives[0].nameStyle?.visualEffects.layers[0].kind,'flame');
 assert.equal(card.visualEffects,undefined);
 assert.deepEqual(effects.readTargetEffects(p,target),recipe);
 assert.deepEqual(parseProject(serializeProject(p)).cards[0].passives[0].nameStyle,card.passives[0].nameStyle);
});
test('text color targets accept an optional skill color and preserve recipes when reset',()=>{
 const p=fixture(),target={cardId:p.cards[0].id,skillId:'strike'};
 effects.writeTargetEffects(p,target,effects.createVisualEffects('smoke',{seed:1}));
 effects.writeTargetTextColor(p,target,'#f12c45');
 assert.equal(p.cards[0].passives[0].nameStyle.color,'#f12c45');
 assert.equal(effects.readTargetTextColor(p,target),'#f12c45');
 effects.writeTargetTextColor(p,target,undefined);
 assert.equal(effects.readTargetTextColor(p,target),undefined);
 assert.equal(p.cards[0].passives[0].nameStyle.visualEffects.layers[0].kind,'smoke');
 assert.throws(()=>effects.writeTargetTextColor(p,target,'url(bad)'));
});
test('invalid name color and image-only recipes in skill names cannot enter saved projects',()=>{
 const p=fixture();p.cards[0].passives[0].nameStyle={color:'bad'};
 assert.ok(validateProject(p).some(e=>e.code==='skill-name-style'));
 p.cards[0].passives[0].nameStyle={visualEffects:effects.createVisualEffects()};
 p.cards[0].passives[0].nameStyle.visualEffects.layers.push({id:'bad',kind:'not-an-effect'});
 assert.ok(validateProject(p).length);
});
test('name colors and recipes inherit into Variants and own edits survive parent changes',()=>{
 const p=fixture(),card=p.cards[0],t={cardId:card.id,skillId:'strike'};
 effects.writeTargetTextColor(p,t,'#2244aa');effects.writeTargetEffects(p,t,effects.createVisualEffects('flame',{seed:5}));
 p.cards.push(createVariant(p,card.id));const s=createStore(p),v=s.getProject().cards[1],vid=v.passives[0].id;
 s.edit('own color',d=>effects.writeTargetTextColor(d,{cardId:v.id,skillId:vid},'#ee3311'));
 s.edit('source recipe',d=>effects.writeTargetEffects(d,t,effects.createVisualEffects('smoke',{seed:7})));
 const child=s.getProject().cards[1];assert.equal(child.passives[0].nameStyle.color,'#ee3311');assert.equal(child.passives[0].nameStyle.visualEffects.layers[0].kind,'smoke');
 const saved=parseProject(serializeProject(s.getProject()));assert.deepEqual(saved.cards[1].passives[0].nameStyle,child.passives[0].nameStyle);
});

test('color-only element edits survive standard and automatic Variant synchronization',()=>{
 const p=fixture();p.cards[0]=applyTemplate(p.cards[0],p.settings,'monster-standard');p.cards.push(createVariant(p,p.cards[0].id));
 const store=createStore(p,{prepare:project=>{project.cards=project.cards.map(card=>card.variant&&card.autoSkillLayout?syncSkillElements(card,project.settings,project.keywords):card);}});
 for(const id of store.getProject().cards.map(card=>card.id)){
  const element=store.getProject().cards.find(card=>card.id===id).elements.find(e=>e.binding?.field==='skill.name');
  store.edit('color only',project=>effects.writeTargetTextColor(project,{cardId:id,elementId:element.id},'#ee2244'));
  assert.equal(store.getProject().cards.find(card=>card.id===id).elements.find(e=>e.binding?.field==='skill.name').style.color,'#ee2244');
  store.edit('edit skill',project=>{const card=project.cards.find(card=>card.id===id);card.passives[0].effect+=' 문장';Object.assign(card,syncSkillElements(card,project.settings,project.keywords));});
  assert.equal(store.getProject().cards.find(card=>card.id===id).elements.find(e=>e.binding?.field==='skill.name').style.color,'#ee2244');
 }
});
