import test from 'node:test';
import assert from 'node:assert/strict';
import {createProject,parseProject,serializeProject,validateProject} from '../src/model/project.js';

function fixture(){
 const p=createProject();
 p.keywords=[{id:'kw-rain',name:'비',description:'사용자가 정한 비의 설명.',color:'#178fba',iconAssetId:null}];
 p.cards[0].passives=[{id:'rain-skill',name:'빗방울',effect:'비 2를 얻는다.',dice:null,keywords:[{keywordId:'kw-rain',display:'both'}]}];
 return p;
}
test('keyword references survive a project round trip and malformed references cannot be saved',()=>{
 const p=fixture(),loaded=parseProject(serializeProject(p));
 assert.equal(loaded.keywords[0].description,'사용자가 정한 비의 설명.');
 assert.deepEqual(loaded.cards[0].passives[0].keywords,[{keywordId:'kw-rain',display:'both'}]);
 for(const change of [
  p=>p.keywords='bad',
  p=>p.keywords[0].name='',
  p=>p.keywords[0].color='not-a-color',
  p=>p.keywords[0].iconAssetId='missing-art',
  p=>p.keywords.push({...p.keywords[0],id:'kw-other'}),
  p=>p.cards[0].passives[0].keywords[0].keywordId='missing',
  p=>p.cards[0].passives[0].keywords[0].display='execute',
  p=>p.cards[0].passives[0].keywords.push({...p.cards[0].passives[0].keywords[0]}),
  p=>p.cards[0].passives[0].keywords={}
 ]){
  const bad=structuredClone(p);change(bad);
  assert.ok(validateProject(bad).length,'Invalid keyword data must not enter the current project');
  assert.throws(()=>parseProject(JSON.stringify(bad)));
 }
});
test('old version-one files open with an empty keyword library and retain their free text',()=>{
 const p=createProject();delete p.keywords;
 p.cards[0].passives=[{id:'old-skill',name:'오래된 기술',effect:'원래 작성한 설명🙂',dice:null}];
 const loaded=parseProject(JSON.stringify(p));
 assert.deepEqual(loaded.keywords,[]);
 assert.deepEqual(loaded.cards[0].passives[0].keywords,[]);
 assert.equal(loaded.cards[0].passives[0].effect,'원래 작성한 설명🙂');
});
