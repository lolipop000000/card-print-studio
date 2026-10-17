import test from 'node:test';
import assert from 'node:assert/strict';
import {createProject,validateProject,parseProject,serializeProject} from '../src/model/project.js';

const helperModule='../src/model/problem-details.js';

test('diagnostic values stay short and never include embedded image payloads',async()=>{
 const {valueLabel}=await import(helperModule);
 assert.equal(valueLabel(undefined),'없음');assert.equal(valueLabel(NaN),'NaN');
 assert.equal(valueLabel(Infinity),'Infinity');assert.equal(valueLabel(-1.5),'-1.5');
 assert.equal(valueLabel(null),'null');assert.equal(valueLabel(false),'false');
 assert.match(valueLabel('잘못된 값'),/잘못된 값/);assert.match(valueLabel([1,2,3]),/3/);
 assert.equal(valueLabel({dataUrl:'data:image/png;base64,AAAA'}),'객체');
 assert.ok(valueLabel('가'.repeat(300)).length<75);
 assert.doesNotMatch(valueLabel('data:image/png;base64,'+'SECRET'.repeat(100)),/SECRET/);
});

test('diagnostic labels identify card fields, skill parts and free elements',async()=>{
 const {cardProblemLabel}=await import(helperModule);
 const card={id:'card-1',name:'바다의 검',passives:[{id:'skill-1',name:'해류'}],actives:[{id:'skill-2',name:'참격'}],elements:[]};
 assert.equal(cardProblemLabel(), '');
 for(const [field,part] of [['name','카드 이름'],['hp','HP'],['art','카드 그림'],['item.effect','아이템 효과'],['item.keywords','아이템 키워드']]){
  const label=cardProblemLabel(card,{type:'text',binding:{field}});assert.match(label,/바다의 검/);assert.ok(label.includes(part));assert.ok(!label.endsWith(':'));
 }
 for(const [field,part] of [['skill.name','이름'],['skill.effect','효과'],['skill.dice','주사위'],['skill.keywords','키워드']]){
  const label=cardProblemLabel(card,{type:'text',binding:{field,skillId:'skill-1'}});assert.match(label,/패시브.*해류/);assert.ok(label.includes(part));
 }
 assert.match(cardProblemLabel(card,null,'skill-2'),/액티브.*참격.*이름/);
 assert.match(cardProblemLabel(card,{id:'note',type:'text',content:'별도 안내 문구'}),/별도 안내 문구/);
 const image={id:'art-extra',type:'image'};card.elements=[{id:'name',type:'text'},image];
 assert.match(cardProblemLabel(card,image),/그림.*1/);
 assert.match(cardProblemLabel(null,{id:'back-note',type:'text',content:'뒷면 문구'}),/공통 뒷면.*뒷면 문구/);
 assert.match(cardProblemLabel(card,{id:'orphan',type:'effect'}),/orphan/);
});

const problem=(project,code)=>{
 const found=validateProject(project).find(issue=>issue.code===code);assert.ok(found,'Expected '+code+' diagnostic');
 assert.doesNotMatch(found.message,/확인하세요/);return found;
};
const element=(patch={})=>({id:'element-1',type:'text',rect:{x:4,y:4,w:20,h:8},style:{fontPt:9},content:'별도 안내',...patch});
const skill=(patch={})=>({id:'skill-1',name:'물결',effect:'대미지 20',dice:null,keywords:[],...patch});
const imageData='data:image/png;base64,AAAA';
const painting=()=>({id:'drawing-1',width:128,height:128,activeLayerId:'layer-1',layers:[{id:'layer-1',name:'밑그림',visible:true,locked:false,opacity:1,png:imageData}]});

test('invalid dimensions identify only the actual field, current value and permitted minimum',()=>{
 for(const [key,value,label,current,unit] of [['cardWidthMm',-4,/카드 폭/,/-4/,/mm/],['cardHeightMm',0,/카드 높이/,/0/,/mm/],['maxWidthMm',NaN,/최대.*폭/,/NaN/,/mm/],['maxHeightMm',null,/최대.*높이/,/null/,/mm/],['minFontPt',-2,/최소 글자 크기/,/-2/,/pt/]]){
  const p=createProject();p.settings[key]=value;const issue=problem(p,'dimension');
  assert.match(issue.message,label);assert.match(issue.message,current);assert.match(issue.message,/0\.01/);assert.match(issue.message,unit);
  if(key==='cardWidthMm')assert.doesNotMatch(issue.message,/글자 크기/);
  if(key==='minFontPt')assert.doesNotMatch(issue.message,/카드 폭/);
 }
});

test('oversized cards report the exceeded direction and both current and maximum sizes',()=>{
 for(const [key,value,label,max] of [['cardWidthMm',70,/폭/,/63/],['cardHeightMm',91,/높이/,/88/]]){
  const p=createProject();p.settings[key]=value;const issue=problem(p,'max-size');assert.match(issue.message,label);assert.ok(issue.message.includes(String(value)));assert.match(issue.message,max);
 }
});

test('rank rules identify the rank and distinguish base HP from its cap',()=>{
 let p=createProject();p.settings.rankRules.B.baseHp=-3;let issue=problem(p,'rank-rule');assert.match(issue.message,/B.*기본.*HP.*-3/);
 p=createProject();p.settings.rankRules.A.hpCap='무제한';issue=problem(p,'rank-rule');assert.match(issue.message,/A.*상한.*무제한/);assert.match(issue.message,/null|없음/);
 p=createProject();p.settings.rankRules.S=null;assert.match(problem(p,'rank-rule').message,/S.*null/);
});

test('print diagnostics identify each bad setting and its accepted value domain',()=>{
 for(const [key,value,label,current,limit] of [['paper','Legal',/용지/,/Legal/,/A4.*Letter/],['orientation','sideways',/방향/,/sideways/,/portrait|세로/],['flip','around',/넘김|뒤집기/,/around/,/long|긴/],['duplex','yes',/양면/,/yes/,/true.*false/],['cropMarks',0,/재단선/,/0/,/true.*false/],['marginMm',-1,/여백/,/-1/,/0/],['gapMm',Infinity,/간격/,/Infinity/,/유한/],['backOffsetXmm',NaN,/뒷면.*가로/,/NaN/,/유한/],['backOffsetYmm','0',/뒷면.*세로/,/“0”/,/유한/]]){
  const p=createProject();p.print[key]=value;const issue=problem(p,'print-settings');for(const expected of [label,current,limit])assert.match(issue.message,expected);
 }
 const p=createProject();p.print.backOffsetXmm=-3;assert.deepEqual(validateProject(p),[]);
});

test('print frames accept all finite nonnegative times and reject values that only coerce to times',()=>{
 for(const time of [0,6.01,12.35,500000]){const p=createProject();p.print.effectFrameSec=time;assert.deepEqual(validateProject(p),[]);assert.equal(parseProject(serializeProject(p)).print.effectFrameSec,time);}
 for(const time of [-.01,NaN,Infinity,-Infinity,null,'2']){const p=createProject();p.print.effectFrameSec=time;const issue=problem(p,'effect-frame');assert.match(issue.message,/인쇄.*장면/);assert.match(issue.message,/0.*유한|유한.*0/);}
 const p=createProject();delete p.print.effectFrameSec;assert.deepEqual(validateProject(p),[]);
});

test('file metadata and structure errors report the malformed part and supplied type',()=>{
 let p=createProject();p.version=99;assert.match(problem(p,'file-version').message,/99/);
 p=createProject();p.name=7;assert.match(problem(p,'deck-name').message,/덱 이름.*7/);
 for(const [change,label] of [[p=>p.cards={},/카드 목록.*객체/],[p=>p.back.elements='앞면',/뒷면.*앞면/],[p=>p.assets=[],/그림 자료.*배열/],[p=>p.paintings=null,/그림 원본.*null/]]){p=createProject();change(p);assert.match(problem(p,'file-structure').message,label);}
});

test('card metadata diagnostics identify the card and separate quantity from other fields',()=>{
 for(const [key,value,label,current] of [['kind','trap',/종류/,/trap/],['name',7,/이름/,/7/],['quantity',1.5,/수량/,/1.5/],['autoSkillLayout','yes',/자동 배치/,/yes/]]){
  const p=createProject();p.cards[0].name='바다의 검';p.cards[0][key]=value;const issue=problem(p,'card-info');assert.equal(issue.cardId,p.cards[0].id);assert.match(issue.message,label);assert.match(issue.message,current);if(key!=='name')assert.match(issue.message,/바다의 검/);
 }
});

test('monster errors distinguish rank, attribute, base HP and reduction and show their limits',()=>{
 for(const [key,value,label,current] of [['rank','D',/등급/,/D/],['attribute','wind',/속성/,/wind/],['baseHp',-1,/기본 HP/,/-1/],['hpReduction',105,/차감/,/105.*100/]]){
  const p=createProject();p.cards[0].name='바다의 검';p.cards[0][key]=value;const issue=problem(p,'monster-info');assert.match(issue.message,/바다의 검/);assert.match(issue.message,label);assert.match(issue.message,current);
 }
});

test('element errors name their owner, free text and the exact invalid geometry',()=>{
 for(const [rect,label,current] of [[{x:Infinity,y:4,w:20,h:8},/가로 위치/,/Infinity/],[{x:4,y:4,w:-2,h:8},/폭/,/-2/]]){
  const p=createProject();p.cards[0].name='바다의 검';p.cards[0].elements=[element({rect})];const issue=problem(p,'element');assert.match(issue.message,/바다의 검.*별도 안내/);assert.match(issue.message,label);assert.match(issue.message,current);assert.equal(issue.elementId,'element-1');
 }
 const p=createProject();p.back.elements=[element({style:{fontPt:0},content:'뒷면 안내'})];assert.match(problem(p,'font').message,/공통 뒷면.*뒷면 안내.*0.*0\.01/);
});

test('element references identify the missing asset or skill and their source binding',()=>{
 let p=createProject();p.cards[0].name='바다의 검';p.cards[0].elements=[element({type:'image',assetId:'missing-art'})];assert.match(problem(p,'asset-reference').message,/바다의 검.*그림.*missing-art/);
 p=createProject();p.cards[0].elements=[element({binding:{field:'skill.effect',skillId:'missing-skill'}})];assert.match(problem(p,'skill-reference').message,/효과.*missing-skill|missing-skill.*효과/);
 p=createProject();p.cards[0].elements=[element({binding:{field:'mystery'}})];assert.match(problem(p,'binding').message,/mystery/);
});

test('skill errors identify passive or active owner, invalid part and current value',()=>{
 let p=createProject();p.cards[0].passives=[skill({effect:42})];let issue=problem(p,'skill');assert.match(issue.message,/패시브.*물결.*효과.*42/);assert.equal(issue.skillId,'skill-1');
 p=createProject();p.cards[0].actives=[skill({nameStyle:{color:'red'}})];issue=problem(p,'skill-name-style');assert.match(issue.message,/액티브.*물결.*색.*red/);assert.match(issue.message,/#RRGGBB|#[0-9A-Fa-f]{6}/);
 p=createProject();p.cards[0].passives={};assert.match(problem(p,'skills').message,/패시브.*객체/);
});

test('dice errors identify their skill and the invalid face, duplicate or non-text field',()=>{
 for(const [dice,label,current] of [[{faces:[7],text:'성공',color:'#fff'},/눈/,/7/],[{faces:[3,3],text:'성공',color:'#fff'},/중복/,/3/],[{faces:[2],text:12,color:'#fff'},/문구|텍스트/,/12/],[{faces:[2],text:'성공',color:false},/색/,/false/]]){
  const p=createProject();p.cards[0].passives=[skill({dice})];const issue=problem(p,'dice');assert.match(issue.message,/패시브.*물결/);assert.match(issue.message,label);assert.match(issue.message,current);
 }
});

test('keyword library diagnostics distinguish duplicate names, colors, descriptions and missing icons',()=>{
 const keyword={id:'keyword-1',name:'취약',description:'받는 피해 증가',color:'#c04a32',iconAssetId:null};
 for(const [key,value,label,current] of [['name',' 취약 ',/이름/,/취약/],['description',false,/설명/,/false/],['color','red',/색/,/red/],['iconAssetId','missing-icon',/아이콘/,/missing-icon/]]){
  const p=createProject();p.keywords=[{...keyword,[key]:value}];const issue=problem(p,'keyword');assert.match(issue.message,/키워드/);assert.match(issue.message,label);assert.match(issue.message,current);
 }
 const p=createProject();p.keywords=[keyword,{...keyword,id:'keyword-2'}];assert.match(problem(p,'keyword').message,/취약.*중복|중복.*취약/);
});

test('keyword links identify the skill and distinguish missing IDs, duplicate links and display mode',()=>{
 const kw={id:'keyword-1',name:'취약',description:'',color:'#c04a32',iconAssetId:null};
 for(const [refs,label,current] of [[[{keywordId:'missing-keyword',display:'inline'}],/연결|키워드/,/missing-keyword/],[[{keywordId:'keyword-1',display:'sideways'}],/표시/,/sideways/],[[{keywordId:'keyword-1',display:'inline'},{keywordId:'keyword-1',display:'badge'}],/중복/,/keyword-1/]]){
  const p=createProject();p.keywords=[kw];p.cards[0].passives=[skill({keywords:refs})];const issue=problem(p,'keyword-reference');assert.match(issue.message,/패시브.*물결/);assert.match(issue.message,label);assert.match(issue.message,current);
 }
});

test('duplicate IDs identify the repeated value and the affected owners',()=>{
 const p=createProject();p.cards[0].name='바다의 검';p.cards[0].passives=[skill({id:p.cards[0].id})];const issue=problem(p,'duplicate-id');assert.ok(issue.message.includes(p.cards[0].id));assert.match(issue.message,/바다의 검.*물결|물결.*바다의 검/);assert.match(issue.message,/중복/);
});

test('asset validation states the asset key, bad field and expected resource domain without copying pixels',()=>{
 const asset={id:'art-1',mime:'image/png',dataUrl:imageData,width:128,height:128,paintingId:null};
 for(const [key,value,label,current] of [['mime','image/gif',/형식/,/image\/gif/],['width',0,/폭/,/0/],['height',1.5,/높이/,/1.5/],['paintingId','missing-original',/원본/,/missing-original/]]){
  const p=createProject();p.assets['art-1']={...asset,[key]:value};const issue=problem(p,'asset');assert.match(issue.message,/art-1/);assert.match(issue.message,label);assert.match(issue.message,current);
 }
 const p=createProject();p.assets['art-1']={...asset,dataUrl:'data:image/gif;base64,'+'SECRET'.repeat(200)};const issue=problem(p,'asset');assert.match(issue.message,/픽셀|데이터/);assert.doesNotMatch(issue.message,/SECRET/);
});

test('painting diagnostics identify dimensions, individual layer fields and missing active layer IDs',()=>{
 let p=createProject();p.paintings['drawing-1']=painting();p.paintings['drawing-1'].width=63;assert.match(problem(p,'painting').message,/drawing-1.*폭.*63.*64.*4096/);
 p=createProject();p.paintings['drawing-1']=painting();p.paintings['drawing-1'].layers[0].opacity=1.2;assert.match(problem(p,'layer').message,/drawing-1.*밑그림.*불투명도.*1.2.*0.*1/);
 p=createProject();p.paintings['drawing-1']=painting();p.paintings['drawing-1'].activeLayerId='gone-layer';assert.match(problem(p,'active-layer').message,/drawing-1.*gone-layer/);
});

test('custom particle images must exist for every recipe location even when the chosen shape is not an image',()=>{
 const recipe=()=>({version:2,seed:10,layers:[{id:'sprite-1',kind:'sprite',enabled:true,params:{shape:'circle',assetId:'missing-particle'}}]});
 for(const assign of [p=>p.cards[0].visualEffects=recipe(),p=>p.cards[0].elements=[element({style:{visualEffects:recipe()}})],p=>p.back.elements=[element({style:{visualEffects:recipe()}})],p=>p.cards[0].passives=[skill({nameStyle:{visualEffects:recipe()}})],p=>p.visualEffectPresets=[{id:'preset-1',name:'눈송이',recipe:recipe()}]]){
  const p=createProject();assign(p);const issue=problem(p,'asset-reference');assert.match(issue.message,/missing-particle/);assert.match(issue.message,/sprite-1|입자/);
 }
});
