import test from 'node:test';
import assert from 'node:assert/strict';

import {skillNameSpans} from '../src/model/skill-name-styles.js';
const red={color:'#dc2345'},blue={color:'#2376dc'};
const skill=(id,name,nameStyle)=>({id,name,effect:'',...(nameStyle?{nameStyle}:{})});
const spans=value=>value.map(({start,end,skillId,id,style})=>({start,end,skillId,id,color:style.color}));

test('literal typed names use longest styled current-card skill and stable duplicate order',()=>{
 const card={passives:[skill('short','강타',red),skill('long','폭풍 강타🙂',blue),skill('duplicate','강타',blue)],actives:[skill('plain','연계')]};
 assert.deepEqual(spans(skillNameSpans(card,'강타 폭풍 강타🙂 강타 연계')), [
  {start:0,end:2,skillId:'short',id:'plain:short:0',color:'#dc2345'},
  {start:3,end:10,skillId:'long',id:'plain:long:3',color:'#2376dc'},
  {start:11,end:13,skillId:'short',id:'plain:short:11',color:'#dc2345'}
 ]);
});

test('explicit references reserve their entire range and choose their linked skill style',()=>{
 const card={passives:[skill('red','강타',red),skill('blue','강타',blue),skill('unstyled','폭풍 강타')],actives:[]};
 const skillReferences=[{id:'linked',skillId:'blue',start:3,end:5},{id:'reserved',skillId:'unstyled',start:6,end:11},{id:'missing',skillId:'deleted',start:12,end:14}];
 assert.deepEqual(spans(skillNameSpans(card,'강타 강타 폭풍 강타 강타',{skillReferences})),[
  {start:0,end:2,skillId:'red',id:'plain:red:0',color:'#dc2345'},
  {start:3,end:5,skillId:'blue',id:'linked',color:'#2376dc'}
 ]);
});

test('bound title styles only its actual name suffix even when prefix matches another skill',()=>{
 const card={passives:[skill('prefix','패시브',blue),skill('name','강타',red)],actives:[]};
 assert.deepEqual(spans(skillNameSpans(card,'패시브 · 강타',{titleSkillId:'name'})),[{start:6,end:8,skillId:'name',id:'title:name',color:'#dc2345'}]);
 assert.deepEqual(skillNameSpans(card,'패시브 · 강타',{titleSkillId:'gone'}),[]);
});

test('empty and inactive recipes do not opt legacy names into rich styling',()=>{
 const card={passives:[skill('none','기본'),skill('empty','빈 이름',{}),skill('disabled','꺼짐',{visualEffects:{layers:[{enabled:false,opacity:1}]}}),skill('zero','투명',{visualEffects:{layers:[{enabled:true,opacity:0}]}})],actives:[]};
 assert.deepEqual(skillNameSpans(card,'기본 빈 이름 꺼짐 투명'),[]);
});

test('active effect-only names match without inventing a text color',()=>{
 const recipe={version:2,seed:37,layers:[{id:'glow',kind:'glow',enabled:true,opacity:1}]},style={visualEffects:recipe};
 const result=skillNameSpans({passives:[],actives:[skill('active','A+B?',style)]},'A+B? / AAB');
 assert.deepEqual(result,[{start:0,end:4,skillId:'active',id:'plain:active:0',style}]);
 assert.equal(Object.hasOwn(result[0].style,'color'),false);
});

test('matching keeps exact authored Unicode spelling and UTF-16 emoji offsets',()=>{
 const card={passives:[skill('emoji','🙂',red),skill('decomposed','e\u0301',blue)],actives:[]};
 assert.deepEqual(spans(skillNameSpans(card,'🙂é e\u0301🙂')), [
  {start:0,end:2,skillId:'emoji',id:'plain:emoji:0',color:'#dc2345'},
  {start:4,end:6,skillId:'decomposed',id:'plain:decomposed:4',color:'#2376dc'},
  {start:6,end:8,skillId:'emoji',id:'plain:emoji:6',color:'#dc2345'}
 ]);
});

test('name matching never mutates text references or saved style data',()=>{
 const card={passives:[skill('red','강타',red)],actives:[]},refs=[{id:'r',skillId:'red',start:0,end:2}],before=structuredClone({card,refs});
 const result=skillNameSpans(card,'강타 강타',{skillReferences:refs});
 assert.equal(result.length,2);assert.deepEqual({card,refs},before);
 assert.deepEqual(skillNameSpans({kind:'item',effect:'강타'},'강타'),[]);
 assert.deepEqual(skillNameSpans({elements:[]},'강타'),[]);
});
