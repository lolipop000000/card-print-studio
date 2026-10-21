import test from 'node:test';
import assert from 'node:assert/strict';
import {createProject,parseProject,serializeProject,validateProject} from '../src/model/project.js';
import {createStore} from '../src/model/store.js';
import {createVariant,resetVariantOverride} from '../src/model/variants.js';
import {createVisualEffects,makeVisualEffectLayer,writeTargetEffects} from '../src/model/visual-effects.js';
import {exportCardFile,importCardFile} from '../src/model/card-file.js';
import {editSkillEffect,resolveSkillEffect,materializeSkillEffect} from '../src/model/skill-references.js';
import {applyTemplate} from '../src/render/templates.js';
const ranges=await import('../src/model/text-ranges.js').catch(e=>{if(e.code==='ERR_MODULE_NOT_FOUND')return {};throw e;});
const api=name=>{assert.equal(typeof ranges[name],'function','Text selections must support '+name);return ranges[name];};
const style={color:'#ed6424'};
function fixture(){const p=createProject(),card=p.cards[0];card.name='불꽃🙂 기사';Object.assign(card,applyTemplate(card,p.settings,'monster-standard'));return {p,card};}

test('selected characters have independent styles and emoji selections keep whole graphemes',()=>{
 const {card}=fixture(),first=api('setTextRange')(card,'name',0,1,style),second=api('setTextRange')(card,'name',3,3,{color:'#3699ff'});
 assert.notEqual(first.id,second.id);
 assert.deepEqual(card.textRanges.name.map(r=>[card.name.slice(r.start,r.end),r.style.color]),[['불','#ed6424'],['🙂','#3699ff']]);
 const joined={name:'A👩‍👩‍👧‍👦B'};api('setTextRange')(joined,'name',3,4,style);
 assert.equal(joined.name.slice(joined.textRanges.name[0].start,joined.textRanges.name[0].end),'👩‍👩‍👧‍👦');
});

test('typing shifts later effects, preserves an edited selection, and deletes only removed letters',()=>{
 const owner={name:'얼음 불꽃 방패'};api('setTextRange')(owner,'name',3,5,style);
 api('editText')(owner,'name','큰 얼음 불꽃 방패',{start:0,end:0,inputType:'insertText'});
 assert.deepEqual(owner.textRanges.name.map(r=>[r.start,r.end]),[[5,7]]);
 api('replaceText')(owner,'name',6,6,'의');
 assert.equal(owner.name.slice(owner.textRanges.name[0].start,owner.textRanges.name[0].end),'불의꽃');
 api('replaceText')(owner,'name',5,8,'화염');
 assert.equal(owner.name.slice(owner.textRanges.name[0].start,owner.textRanges.name[0].end),'화염');
 api('replaceText')(owner,'name',5,7,'');assert.deepEqual(owner.textRanges.name,[]);
});

test('overlapping new selections replace just their own characters and retain adjacent styles',()=>{
 const owner={name:'가나다라마'};api('setTextRange')(owner,'name',0,5,style);api('setTextRange')(owner,'name',2,3,{color:'#2468ff'});
 assert.deepEqual(owner.textRanges.name.map(r=>[owner.name.slice(r.start,r.end),r.style.color]),[['가나','#ed6424'],['다','#2468ff'],['라마','#ed6424']]);
 assert.equal(new Set(owner.textRanges.name.map(r=>r.id)).size,3);
});

test('skill reference renames and edits keep text effects on their visible labels',()=>{
 const {card}=fixture();card.passives=[{id:'target',name:'강타',effect:'',dice:null}];
 card.actives=[{id:'source',name:'연계',effect:'다시 강타 발동',dice:null,skillReferences:[{id:'ref',skillId:'target',start:3,end:5}]}];
 const s=card.actives[0];api('setTextRange')(s,'effect',3,5,style);card.passives[0].name='폭풍 강타';
 const visible=resolveSkillEffect(card,s);assert.equal(visible.text,'다시 폭풍 강타 발동');
 assert.deepEqual(visible.textRanges.effect.map(r=>[r.start,r.end]),[[3,8]]);
 materializeSkillEffect(card,s);assert.equal(s.effect.slice(s.textRanges.effect[0].start,s.textRanges.effect[0].end),'폭풍 강타');
 editSkillEffect(card,s,'지금 다시 폭풍 강타 발동',{start:0,end:0,inputType:'insertText'});
 assert.equal(s.effect.slice(s.textRanges.effect[0].start,s.textRanges.effect[0].end),'폭풍 강타');
});

test('a styled character inside a skill reference survives no-op rendering and an appended name',()=>{
 const {card}=fixture();card.passives=[{id:'target',name:'ABC',effect:'',dice:null}];const source={id:'source',name:'연계',effect:'다시 ABC 발동',dice:null,skillReferences:[{id:'r',skillId:'target',start:3,end:6}]};card.actives=[source];
 api('setTextRange')(source,'effect',4,5,style);
 assert.deepEqual(resolveSkillEffect(card,source).textRanges.effect.map(r=>[r.start,r.end]),[[4,5]]);
 card.passives[0].name='ABCD';const visible=resolveSkillEffect(card,source);assert.equal(visible.text,'다시 ABCD 발동');assert.deepEqual(visible.textRanges.effect.map(r=>[r.start,r.end]),[[4,5]]);
});

test('a renamed reference that joins a preceding grapheme keeps valid whole-character ranges',()=>{
 const {p,card}=fixture();card.passives=[{id:'target',name:'B',effect:'',dice:null}];const source={id:'source',name:'연계',effect:'AB',dice:null,skillReferences:[{id:'r',skillId:'target',start:1,end:2}]};card.actives=[source];
 api('setTextRange')(source,'effect',0,1,style);card.passives[0].name='\u0301B';
 materializeSkillEffect(card,source);assert.equal(source.effect,'A\u0301B');assert.deepEqual(source.textRanges.effect.map(r=>[r.start,r.end]),[[0,2]]);assert.deepEqual(validateProject(p),[]);
});

test('range effects survive project/card files and remap imported image and range identities',()=>{
 const {p,card}=fixture(),e=card.elements.find(e=>e.binding?.field==='name'),r=api('setTextRange')(card,'name',0,2,style);
 const recipe=createVisualEffects();recipe.layers.push(makeVisualEffectLayer('sprite',{params:{shape:'image',assetId:'range-image'}}));
 p.assets['range-image']={id:'range-image',mime:'image/png',dataUrl:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==',width:1,height:1,paintingId:null};
 writeTargetEffects(p,{cardId:card.id,elementId:e.id,textRangeId:r.id},recipe);
 const loaded=parseProject(serializeProject(p));assert.deepEqual(loaded.cards[0].textRanges,card.textRanges);
 const destination=createProject(),copy=importCardFile(destination,exportCardFile(p,card.id));
 const imported=destination.cards.find(c=>c.id===copy.cardId||c.id===copy.id)||destination.cards.at(-1);
 assert.notEqual(imported.textRanges.name[0].id,r.id);
 const layer=imported.textRanges.name[0].style.visualEffects.layers[0];assert.equal(layer.kind,'sprite');assert.notEqual(layer.params.assetId,'range-image');
 assert.equal(destination.assets[layer.params.assetId].dataUrl,p.assets['range-image'].dataUrl);
 assert.deepEqual(validateProject(destination),[]);
});

test('legacy child text overrides do not inherit newer parent character offsets',()=>{
 const p=createProject(),card=p.cards[0];card.passives=[{id:'parent-skill',name:'패시브',effect:'긴 부모 설명입니다',dice:null}];p.cards.push(createVariant(p,card.id));const store=createStore(p);
 store.edit('own child prose',p=>p.cards[1].passives[0].effect='짧음');
 store.edit('parent new character effect',p=>api('setTextRange')(p.cards[0].passives[0],'effect',5,8,style));
 const child=store.getProject().cards[1].passives[0];assert.equal(child.effect,'짧음');assert.equal(child.textRanges?.effect,undefined);assert.deepEqual(validateProject(store.getProject()),[]);
});

test('a Variant keeps text with its own ranges while shared parent titles and undo remain live',()=>{
 const {p,card}=fixture();api('setTextRange')(card,'name',0,2,style);p.cards.push(createVariant(p,card.id));const store=createStore(p);
 assert.notEqual(store.getProject().cards[1].textRanges.name[0].id,store.getProject().cards[0].textRanges.name[0].id);
 store.edit('child text',p=>api('editText')(p.cards[1],'name','검은 불꽃 기사'));
 const child=structuredClone(store.getProject().cards[1]);
 store.edit('parent text',p=>api('editText')(p.cards[0],'name','하얀 불꽃🙂 기사'));
 assert.equal(store.getProject().cards[1].name,'검은 불꽃 기사');assert.deepEqual(store.getProject().cards[1].textRanges,child.textRanges);
 store.undo();store.redo();assert.deepEqual(store.getProject().cards[1].textRanges,child.textRanges);
 assert.deepEqual(validateProject(parseProject(serializeProject(store.getProject()))),[]);
});

test('resetting a Variant title restores its paired original character effects',()=>{
 for(const [parent,child] of [['abcdef','xyz'],['abc','uvwxyz']]){
  const p=createProject(),card=p.cards[0];card.name=parent;api('setTextRange')(card,'name',0,parent.length,style);p.cards.push(createVariant(p,card.id));const store=createStore(p);
  store.edit('own child title',p=>api('editText')(p.cards[1],'name',child));
  store.edit('reset title',p=>resetVariantOverride(p.cards[1],'name'));
  const next=store.getProject().cards[1];assert.equal(next.name,parent);assert.deepEqual(next.textRanges.name.map(r=>[r.start,r.end]),[[0,parent.length]]);
 }
});

test('invalid or overlapping text ranges are rejected with precise content locations',()=>{
 const {p,card}=fixture();api('setTextRange')(card,'name',0,2,style);
 for(const mutate of [r=>r.end=99,r=>r.start=-1,r=>r.start=.5,r=>r.style.color='red',r=>r.style.fontPt=0]){
  const bad=structuredClone(p);mutate(bad.cards[0].textRanges.name[0]);
  assert.ok(validateProject(bad).some(e=>e.code==='text-range'),'Invalid selection must be diagnosed');
 }
 const bad=structuredClone(p);bad.cards[0].textRanges.name.push({...bad.cards[0].textRanges.name[0],id:'overlap',start:1,end:3});
 assert.ok(validateProject(bad).some(e=>e.code==='text-range'));
 assert.deepEqual(validateProject(p),[]);
});
