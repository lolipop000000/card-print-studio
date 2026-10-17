import test from 'node:test';
import assert from 'node:assert/strict';
import {createProject,createCard,parseProject,serializeProject,validateProject} from '../src/model/project.js';
import {createStore} from '../src/model/store.js';
import {createVariant} from '../src/model/variants.js';
import {createVisualEffects,makeVisualEffectLayer} from '../src/model/visual-effects.js';
import {resolveSkillEffect} from '../src/model/skill-references.js';
import {exportCardFile,parseCardFile,importCardFile} from '../src/model/card-file.js';

const pixel='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j7xkAAAAASUVORK5CYII=';
const asset=(id,paintingId=null)=>({id,mime:'image/png',dataUrl:pixel,width:1,height:1,paintingId});
const painting=id=>({id,width:64,height:64,activeLayerId:'pixels',layers:[{id:'pixels',name:'원본',visible:true,locked:false,opacity:.8,png:pixel}]});
const keyword=(id,name,iconAssetId=null)=>({id,name,description:'효과 설명',color:'#286fa8',iconAssetId});
function fixture(){
 const p=createProject(),card=p.cards[0];card.id='source-card';card.name='바다';card.quantity=3;card.rank='S';card.attribute='water';card.baseHp=777;card.hpReduction=49;card.template='custom';card.autoSkillLayout=false;
 const recipe=createVisualEffects();recipe.layers.push(makeVisualEffectLayer('glow',{id:'title-glow'}));
 card.passives=[{id:'source-passive',name:'강타',effect:'취약 부여',dice:null,keywords:[{keywordId:'source-keyword',display:'both'}],nameStyle:{color:'#dc2345',fontPt:11,visualEffects:recipe}}];
 card.actives=[{id:'source-active',name:'연계',effect:'강타 후 취약',dice:null,keywords:[{keywordId:'source-keyword',display:'inline'}],skillReferences:[{id:'source-reference',skillId:'source-passive',start:0,end:2}]}];
 card.artAssetId='source-art';
 card.elements=[
  {id:'source-title',type:'text',rect:{x:4,y:6,w:20,h:10},binding:{field:'skill.name',skillId:'source-passive'},style:{fontPt:9,color:'#dc2345',visualEffects:structuredClone(recipe)}},
  {id:'source-image',type:'image',assetId:'source-extra',rect:{x:3,y:20,w:12,h:18},binding:null,style:{fit:'contain',cropX:.2,cropY:.8}}
 ];
 p.assets={'source-art':asset('source-art','source-painting'),'source-extra':asset('source-extra'),'source-icon':asset('source-icon','icon-painting'),unrelated:asset('unrelated')};
 p.paintings={'source-painting':painting('source-painting'),'icon-painting':painting('icon-painting'),unrelated:painting('unrelated')};
 p.keywords=[keyword('source-keyword','취약','source-icon'),keyword('unrelated-keyword','미사용','unrelated')];
 p.visualEffectPresets=[{id:'unrelated-preset',name:'개인 보관함',recipe:createVisualEffects('burning')}];
 p.back.elements=[{id:'back',type:'image',assetId:'unrelated',rect:{x:0,y:0,w:10,h:10},binding:null,style:{fit:'contain'}}];
 p.cards.push(createCard('item',p));return p;
}
function structuralIds(card){return [card.id,...card.elements.map(e=>e.id),...[...(card.passives||[]),...(card.actives||[])].flatMap(s=>[s.id,...(s.skillReferences||[]).map(r=>r.id)])];}

test('single-card export preserves settings and content while omitting unrelated deck resources',()=>{
 const p=fixture(),before=serializeProject(p),text=exportCardFile(p,'source-card'),file=JSON.parse(text);
 assert.equal(file.format,'card-print-studio-card');assert.equal(file.version,1);
 const one=parseCardFile(text);assert.equal(one.cards.length,1);assert.equal(one.name,'바다');
 assert.deepEqual(one.cards[0],parseProject(before).cards[0]);assert.deepEqual(one.settings,p.settings);
 assert.deepEqual(one.keywords.map(k=>k.id),['source-keyword']);
 assert.deepEqual(Object.keys(one.assets).sort(),['source-art','source-extra','source-icon']);
 assert.deepEqual(Object.keys(one.paintings).sort(),['icon-painting','source-painting']);
 assert.deepEqual(one.back,{elements:[]});assert.deepEqual(one.visualEffectPresets,[]);
 assert.deepEqual(validateProject(one),[]);assert.equal(serializeProject(p),before,'Export does not edit the open deck');
 assert.throws(()=>exportCardFile(p,'missing'),/카드/);
});

test('card import remaps colliding identities and retains skill keyword image and painting connections',()=>{
 const source=fixture(),text=exportCardFile(source,'source-card'),target=createProject();
 target.cards[0].id='source-card';target.cards[0].passives=[{id:'source-passive',name:'기존',effect:'유지',keywords:[]}];
 target.keywords=[keyword('source-keyword','기존 키워드')];target.assets['source-art']=asset('source-art');target.paintings['source-painting']=painting('source-painting');
 const existing=structuredClone(target),added=importCardFile(target,text);
 assert.equal(target.cards.length,2);assert.equal(added,target.cards[1]);assert.deepEqual(target.cards[0],existing.cards[0]);
 assert.ok(structuralIds(added).every(id=>!structuralIds(source.cards[0]).includes(id)));
 assert.equal(added.actives[0].skillReferences[0].skillId,added.passives[0].id);
 assert.equal(added.elements[0].binding.skillId,added.passives[0].id);
 assert.equal(resolveSkillEffect(added,added.actives[0]).text,'강타 후 취약');
 const linkedKeyword=target.keywords.find(k=>k.id===added.passives[0].keywords[0].keywordId);
 assert.equal(linkedKeyword.name,'취약');assert.notEqual(linkedKeyword.id,'source-keyword');assert.equal(added.actives[0].keywords[0].keywordId,linkedKeyword.id);
 assert.notEqual(added.artAssetId,'source-art');assert.equal(target.assets[added.artAssetId].dataUrl,pixel);
 assert.notEqual(added.elements[1].assetId,'source-extra');assert.ok(target.assets[added.elements[1].assetId]);
 const original=target.paintings[target.assets[added.artAssetId].paintingId];assert.ok(original);assert.notEqual(original.id,'source-painting');assert.notEqual(original.layers[0].id,'pixels');assert.equal(original.activeLayerId,original.layers[0].id);assert.equal(original.layers[0].png,pixel);
 assert.ok(target.paintings[target.assets[linkedKeyword.iconAssetId].paintingId]);
 assert.equal(added.passives[0].nameStyle.color,'#dc2345');assert.equal(added.passives[0].nameStyle.visualEffects.layers[0].params.radius,2);assert.notEqual(added.passives[0].nameStyle.visualEffects.layers[0].id,'title-glow');
 assert.notEqual(added.elements[0].style.visualEffects.layers[0].id,'title-glow');
 assert.deepEqual(validateProject(target),[]);assert.deepEqual(parseProject(serializeProject(target)),target);
});

test('Variant exports its resolved effective contents as an independent card',()=>{
 const p=fixture(),child=createVariant(p,'source-card',{quantity:5});p.cards.push(child);const store=createStore(p);
 store.edit('자식 변경',d=>{const c=d.cards.find(c=>c.id===child.id);c.baseHp=900;c.actives[0].effect='강타 후 취약 추가';});
 store.edit('원본 변경',d=>{d.cards[0].name='새 바다';d.cards[0].passives[0].name='폭풍 강타';});
 const current=store.getProject(),before=serializeProject(current),one=parseCardFile(exportCardFile(current,child.id)),card=one.cards[0];
 assert.equal(card.variant,undefined);assert.equal(card.name,'새 바다');assert.equal(card.quantity,5);assert.equal(card.baseHp,900);assert.equal(card.passives[0].name,'폭풍 강타');assert.equal(resolveSkillEffect(card,card.actives[0]).text,'폭풍 강타 후 취약 추가');
 assert.deepEqual(card.passives[0].nameStyle,current.cards.find(c=>c.id===child.id).passives[0].nameStyle);
 assert.equal(serializeProject(current),before);assert.deepEqual(validateProject(one),[]);
 const added=importCardFile(current,exportCardFile(current,child.id));assert.equal(added.variant,undefined);assert.notEqual(added.id,child.id);assert.deepEqual(validateProject(current),[]);
});

test('invalid or conflicting card files fail atomically without changing the destination deck',()=>{
 const p=fixture(),text=exportCardFile(p,'source-card'),file=JSON.parse(text),target=createProject(),before=serializeProject(target);
 const mutations=[v=>v.format='card-print-studio',v=>v.version=2,v=>v.project.cards=[],v=>v.project.cards.push(structuredClone(v.project.cards[0])),v=>v.project.cards[0].quantity=0,v=>delete v.project.assets['source-art'],v=>v.project.paintings['source-painting'].activeLayerId='missing'];
 for(const mutate of mutations){const value=structuredClone(file);mutate(value);assert.throws(()=>importCardFile(target,JSON.stringify(value)));assert.equal(serializeProject(target),before);}
 assert.throws(()=>importCardFile(target,'{broken'));assert.equal(serializeProject(target),before);
 target.keywords=[{...p.keywords[0],id:'existing-keyword',iconAssetId:null,color:'#ff0000'}];const conflicting=serializeProject(target);
 assert.throws(()=>importCardFile(target,text),/키워드.*취약|취약.*키워드/);assert.equal(serializeProject(target),conflicting);
});

test('import scales only element rectangles and preserves stats styles fonts and receiving settings',()=>{
 const p=fixture(),target=createProject();Object.assign(target.settings,{cardWidthMm:126,cardHeightMm:44,maxWidthMm:126,minFontPt:18});target.settings.rankRules.S={baseHp:12,hpCap:50};
 const settings=structuredClone(target.settings),print=structuredClone(target.print),added=importCardFile(target,exportCardFile(p,'source-card'));
 assert.deepEqual(added.elements[0].rect,{x:8,y:3,w:40,h:5});assert.equal(added.elements[0].style.fontPt,9);
 assert.deepEqual([added.quantity,added.rank,added.baseHp,added.hpReduction,added.attribute],[3,'S',777,49,'water']);
 assert.equal(added.passives[0].nameStyle.fontPt,11);assert.equal(added.elements[1].style.cropX,.2);assert.equal(added.elements[1].style.cropY,.8);
 assert.deepEqual(target.settings,settings);assert.deepEqual(target.print,print);assert.equal(target.cards[0].baseHp,100);assert.deepEqual(validateProject(target),[]);
});

test('reimporting a card reuses compatible keywords while every new card and original stays independent',()=>{
 const p=fixture(),text=exportCardFile(p,'source-card'),first=importCardFile(p,text),second=importCardFile(p,text);
 assert.equal(p.keywords.length,2);assert.equal(first.passives[0].keywords[0].keywordId,'source-keyword');assert.equal(second.passives[0].keywords[0].keywordId,'source-keyword');
 assert.ok(structuralIds(second).every(id=>!structuralIds(first).includes(id)));assert.notEqual(first.artAssetId,second.artAssetId);assert.notEqual(p.assets[first.artAssetId].paintingId,p.assets[second.artAssetId].paintingId);
 first.passives[0].name='독립 변경';assert.equal(second.passives[0].name,'강타');assert.equal(p.cards[0].passives[0].name,'강타');assert.deepEqual(validateProject(p),[]);
});

test('item card files retain authored Unicode and their own keyword links',()=>{
 const p=createProject(),card=createCard('item',p);card.effect='취약🙂 e\u0301';card.attribute='dark';card.keywords=[{keywordId:'item-keyword',display:'both'}];p.keywords=[keyword('item-keyword','취약')];p.cards.push(card);
 const target=createProject(),added=importCardFile(target,exportCardFile(p,card.id));
 assert.equal(added.kind,'item');assert.equal(added.effect,'취약🙂 e\u0301');assert.equal(added.attribute,'dark');assert.equal(added.attributes,undefined);assert.equal(added.elements.filter(e=>e.type==='attribute').length,1);assert.equal(target.keywords[0].id,added.keywords[0].keywordId);assert.notEqual(target.keywords[0].id,'item-keyword');assert.deepEqual(validateProject(target),[]);
});

test('compatible keyword originals compare their content independently of ids and JSON property order',()=>{
 const p=fixture(),target=createProject(),original=painting('other-original');
 original.layers=[{png:pixel,opacity:.8,locked:false,visible:true,name:'원본',id:'other-layer'}];original.activeLayerId='other-layer';
 target.paintings[original.id]=original;target.assets['other-icon']=asset('other-icon',original.id);target.keywords=[keyword('other-keyword','취약','other-icon')];
 const added=importCardFile(target,exportCardFile(p,'source-card'));
 assert.equal(target.keywords.length,1);assert.equal(added.passives[0].keywords[0].keywordId,'other-keyword');assert.equal(target.assets['other-icon'].paintingId,'other-original');assert.deepEqual(validateProject(target),[]);
});

test('overwriting one card preserves its identity and position, remaps art and references, and supports undo',()=>{
 const source=fixture(),target=fixture();target.cards[0].name='옛 카드';target.cards[0].baseHp=100;
 const child=createVariant(target,target.cards[0].id);target.cards.push(child);const store=createStore(target);
 store.edit('Variant 체력',d=>d.cards.find(c=>c.id===child.id).baseHp=900);
 const before=serializeProject(store.getProject()),text=exportCardFile(source,source.cards[0].id);let replaced;
 store.edit('카드 덮어쓰기',d=>{replaced=importCardFile(d,text,{replaceCardId:'source-card'});});
 const after=store.getProject();assert.equal(after.cards.length,3);assert.equal(after.cards[0].id,'source-card');assert.equal(replaced.id,'source-card');assert.equal(after.cards[0].name,'바다');assert.equal(after.cards[0].baseHp,777);
 assert.deepEqual(after.cards[1],JSON.parse(before).cards[1]);assert.equal(after.cards[2].variant.parentId,'source-card');assert.equal(after.cards[2].name,'바다');assert.equal(after.cards[2].baseHp,900);
 assert.equal(resolveSkillEffect(after.cards[0],after.cards[0].actives[0]).text,'강타 후 취약');assert.ok(after.assets[after.cards[0].artAssetId]);assert.deepEqual(validateProject(after),[]);
 const saved=serializeProject(after);store.undo();assert.equal(serializeProject(store.getProject()),before);store.redo();assert.equal(serializeProject(store.getProject()),saved);
});

test('an absent overwrite target fails atomically without appending or merging resources',()=>{
 const source=fixture(),target=createProject(),before=serializeProject(target);
 assert.throws(()=>importCardFile(target,exportCardFile(source,'source-card'),{replaceCardId:'deleted-card'}),/덮어쓸 카드/);assert.equal(serializeProject(target),before);
});
