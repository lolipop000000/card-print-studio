import {RANKS,ATTRIBUTES,ELEMENT_TYPES,newId,clone} from './types.js';
import {validateSkillReferences} from './skill-references.js';
import {validateVariants,syncVariants} from './variants.js';
import {validateVisualEffects,upgradeProjectVisualEffects} from './visual-effects.js';
import {valueLabel,cardProblemLabel} from './problem-details.js';
import {isBlendMode} from './blend-modes.js';
import {textStyleProblems} from './text-style.js';
import {validateCardTemplates} from './card-templates.js';
import {textBoundaries} from './text-ranges.js';
export function createProject(){
  const p={format:'card-print-studio',version:1,name:'나의 카드 덱',
    settings:{cardWidthMm:63,cardHeightMm:88,maxWidthMm:63,maxHeightMm:88,minFontPt:7,rankRules:Object.fromEntries(RANKS.map((r,i)=>[r,{baseHp:[100,220,340,460][i],hpCap:null}]))},
    keywords:[],visualEffectPresets:[],cardTemplates:[],cards:[],back:{elements:[]},assets:{},paintings:{},
    print:{effectFrameSec:1.2,paper:'A4',orientation:'portrait',marginMm:6,gapMm:4,duplex:false,flip:'long',backOffsetXmm:0,backOffsetYmm:0,cropMarks:true}};
  p.cards.push(createCard('monster',p));return p;
}
export function createCard(kind,p){
  const card={id:newId(),kind,name:kind==='monster'?'새 몬스터':'새 아이템',quantity:1,artAssetId:null,autoSkillLayout:true,template:kind==='monster'?'monster-standard':'item',elements:[]};
  if(kind==='monster')Object.assign(card,{rank:'C',attribute:'neutral',baseHp:p.settings.rankRules.C.baseHp,hpReduction:0,passives:[],actives:[]});
  else if(kind==='item')Object.assign(card,{effect:'',keywords:[]});
  else throw new Error('카드 종류를 확인하세요.');
  return card;
}
export const finalHp=card=>card.baseHp-card.hpReduction;
const object=v=>v!==null && typeof v==='object' && !Array.isArray(v);
const number=(v,min=-Infinity)=>typeof v==='number' && Number.isFinite(v) && v>=min;
const id=v=>typeof v==='string' && v.length>0 && v.length<200 && !['__proto__','constructor','prototype'].includes(v);
const dataUrl=(v,mime)=>typeof v==='string' && v.startsWith('data:'+mime+';base64,') && /^[A-Za-z0-9+/]+=*$/.test(v.slice(v.indexOf(',')+1));
export function validateProject(p){
  const errors=[];const bad=(code,message,extra={})=>errors.push({code,message,...extra});
  const invalid=(code,context,field,value,rule,extra={})=>bad(code,(context?context+': ':'')+field+' 값 '+valueLabel(value)+'. '+rule+'.',extra);
  const idRule='ID는 1~199자의 문자열이어야 하며 __proto__, constructor, prototype은 사용할 수 없습니다';
  if(!object(p)){invalid('file-version','','프로젝트 파일',p,'카드 프로젝트 객체(format: card-print-studio, version: 1)가 필요합니다');return errors;}
  if(p.format!=='card-print-studio'||p.version!==1){
    if(p.format!=='card-print-studio')invalid('file-version','','파일 형식',p.format,'card-print-studio여야 합니다');
    if(p.version!==1)invalid('file-version','','파일 버전',p.version,'지원하는 버전은 숫자 1입니다');
    return errors;
  }
  if(typeof p.name!=='string')invalid('deck-name','','덱 이름',p.name,'문자열이어야 합니다');
  const s=p.settings;
  if(!object(s)){invalid('settings','','프로젝트 설정',s,'설정 객체가 필요합니다');return errors;}
  for(const [key,label,unit] of [['cardWidthMm','카드 폭','mm'],['cardHeightMm','카드 높이','mm'],['maxWidthMm','최대 카드 폭','mm'],['maxHeightMm','최대 카드 높이','mm'],['minFontPt','최소 글자 크기','pt']])
    if(!number(s[key],0.01))invalid('dimension','',label,s[key],'0.01 '+unit+' 이상의 유한한 숫자여야 합니다');
  if(s.cardWidthMm>s.maxWidthMm)invalid('max-size','','카드 폭',s.cardWidthMm,'설정한 최대 폭 '+valueLabel(s.maxWidthMm)+' mm 이하여야 합니다');
  if(s.cardHeightMm>s.maxHeightMm)invalid('max-size','','카드 높이',s.cardHeightMm,'설정한 최대 높이 '+valueLabel(s.maxHeightMm)+' mm 이하여야 합니다');
  for(const rank of RANKS){
    const rule=s.rankRules?.[rank],context='등급 '+rank;
    if(!object(rule)){invalid('rank-rule',context,'체력 기준',rule,'기본 HP와 HP 상한이 있는 객체여야 합니다');continue;}
    if(!number(rule.baseHp,0))invalid('rank-rule',context,'기본 HP',rule.baseHp,'0 이상의 유한한 숫자여야 합니다');
    if(!(rule.hpCap===null||number(rule.hpCap,0)))invalid('rank-rule',context,'HP 상한',rule.hpCap,'제한 없음은 null, 상한은 0 이상의 유한한 숫자여야 합니다');
  }
  const print=p.print;
  if(!object(print))invalid('print-settings','','인쇄 설정',print,'인쇄 설정 객체가 필요합니다');
  else {
    for(const [key,label,choices] of [['paper','용지',['A4','Letter']],['orientation','용지 방향',['portrait','landscape']],['flip','양면 뒤집기',['long','short']]])
      if(!choices.includes(print[key]))invalid('print-settings','인쇄',label,print[key],choices.join(' 또는 ')+'여야 합니다');
    for(const [key,label] of [['duplex','양면 인쇄'],['cropMarks','재단선 표시']])
      if(typeof print[key]!=='boolean')invalid('print-settings','인쇄',label,print[key],'true 또는 false여야 합니다');
    for(const [key,label] of [['marginMm','여백'],['gapMm','카드 간격']])
      if(!number(print[key],0))invalid('print-settings','인쇄',label,print[key],'0 mm 이상의 유한한 숫자여야 합니다');
    for(const [key,label] of [['backOffsetXmm','뒷면 가로 보정'],['backOffsetYmm','뒷면 세로 보정']])
      if(!number(print[key]))invalid('print-settings','인쇄',label,print[key],'mm 단위의 유한한 숫자여야 합니다');
  }
  if(print?.effectFrameSec!==undefined&&!number(print.effectFrameSec,0))invalid('effect-frame','','인쇄 이펙트 장면 시간',print.effectFrameSec,'0초 이상의 유한한 숫자여야 합니다');
  let structureInvalid=false;
  for(const [valid,label,value,rule] of [[Array.isArray(p.cards),'카드 목록',p.cards,'배열이어야 합니다'],[object(p.back),'공통 뒷면',p.back,'요소 목록을 가진 객체여야 합니다'],[object(p.back)&&Array.isArray(p.back.elements),'공통 뒷면 요소 목록',p.back?.elements,'배열이어야 합니다'],[object(p.assets),'그림 자료',p.assets,'그림 ID를 키로 하는 객체여야 합니다'],[object(p.paintings),'그림 원본',p.paintings,'원본 ID를 키로 하는 객체여야 합니다']])
    if(!valid){invalid('file-structure','',label,value,rule);structureInvalid=true;}
  if(structureInvalid)return errors;
  errors.push(...validateVariants(p));
  const seen=new Map();
  const checkId=(value,context,extra={})=>{
    if(!id(value))invalid('duplicate-id',context,'ID',value,idRule,extra);
    else if(seen.has(value))invalid('duplicate-id',context,'ID',value,'이미 '+seen.get(value)+'에서 사용한 중복 ID입니다. 서로 다른 ID가 필요합니다',extra);
    if(!seen.has(value))seen.set(value,context);
  };
  const assetRef=value=>value===null||value===undefined||(id(value)&&Object.hasOwn(p.assets,value));
  const effectRecipe=(recipe,target,extra,context)=>{
    errors.push(...validateVisualEffects(recipe,target).map(problem=>({...problem,message:context+': '+problem.message,...extra})));
    for(const [index,layer] of (Array.isArray(recipe?.layers)?recipe.layers:[]).entries()){
      const assetId=layer?.params?.assetId;
      if(layer?.kind==='sprite'&&assetId!==null&&assetId!==undefined&&!assetRef(assetId))
        invalid('asset-reference',context+' · 커스텀 입자 레이어 '+(index+1)+' (ID '+valueLabel(layer.id)+')','그림 ID',assetId,'프로젝트 그림 자료에 존재하는 ID여야 합니다',extra);
    }
  };
  const textRanges=(owner,fields,extra,context)=>{
    if(owner.textRanges===undefined)return;
    if(!object(owner.textRanges)){invalid('text-range',context,'글자 구간 목록',owner.textRanges,'텍스트 필드별 배열을 가진 객체여야 합니다',extra);return;}
    for(const [field,ranges] of Object.entries(owner.textRanges)){
      const location=context+' · '+field+' 글자 구간';
      if(!fields.includes(field)){invalid('text-range',location,'텍스트 필드',field,fields.join(', ')+' 중 하나여야 합니다',extra);continue;}
      if(!Array.isArray(ranges)){invalid('text-range',location,'구간 목록',ranges,'배열이어야 합니다',extra);continue;}
      const text=typeof owner[field]==='string'?owner[field]:'',boundaries=new Set(textBoundaries(text));let end=0;
      for(const [index,r] of ranges.entries()){
        const label=location+' '+(index+1)+'번';
        if(!object(r)){invalid('text-range',label,'구간',r,'ID, 시작·끝 위치, 스타일을 가진 객체여야 합니다',extra);continue;}
        checkId(r.id,label,extra);
        if(!Number.isInteger(r.start)||!Number.isInteger(r.end)||r.start<end||r.end<=r.start||r.end>text.length||!boundaries.has(r.start)||!boundaries.has(r.end))
          invalid('text-range',label,'시작·끝 위치',[r.start,r.end],'0~'+text.length+' 범위의 문자 경계여야 하며 위치 순서대로 겹치지 않아야 합니다',extra);
        if(Number.isInteger(r.end))end=r.end;
        if(!object(r.style)){invalid('text-range',label,'글자 스타일',r.style,'스타일 객체여야 합니다',extra);continue;}
        if(r.style.color!==undefined&&(typeof r.style.color!=='string'||!/^#[0-9a-f]{6}$/i.test(r.style.color)))invalid('text-range',label,'글자 색',r.style.color,'#RRGGBB 형식이어야 합니다',extra);
        for(const problem of textStyleProblems(r.style))invalid('text-range',label,problem.label,problem.value,problem.rule,extra);
        if(r.style.visualEffects!==undefined)effectRecipe(r.style.visualEffects,'text',extra,label);
      }
    }
  };
  if(p.visualEffectPresets!==undefined&&!Array.isArray(p.visualEffectPresets))invalid('visual-effect-presets','','내 이펙트 목록',p.visualEffectPresets,'배열이어야 합니다');
  for(const [index,preset] of (Array.isArray(p.visualEffectPresets)?p.visualEffectPresets:[]).entries()){
    const context='내 이펙트 '+(index+1)+'번'+(typeof preset?.name==='string'?' '+valueLabel(preset.name):'');
    if(!object(preset)){invalid('visual-effect-preset',context,'저장 정보',preset,'이름과 레시피가 있는 객체여야 합니다');continue;}
    checkId(preset.id,context);
    if(typeof preset.name!=='string')invalid('visual-effect-preset',context,'이름',preset.name,'문자열이어야 합니다');
    else {
      if(!preset.name.trim())invalid('visual-effect-preset',context,'이름',preset.name,'공백만 있는 이름은 사용할 수 없습니다');
      if(preset.name!==preset.name.trim())invalid('visual-effect-preset',context,'이름',preset.name,'이름 앞뒤에 공백이 없어야 합니다');
      if(preset.name.length>120)invalid('visual-effect-preset',context,'이름 길이',preset.name.length,'120자 이하여야 합니다');
      if(/[\r\n]/.test(preset.name))invalid('visual-effect-preset',context,'이름',preset.name,'줄바꿈을 포함할 수 없습니다');
    }
    effectRecipe(preset.recipe,undefined,{},context);
  }
  errors.push(...validateCardTemplates(p.cardTemplates));
  for(const [index,saved] of (Array.isArray(p.cardTemplates)?p.cardTemplates:[]).entries())if(object(saved))checkId(saved.id,'내 카드 서식 '+(index+1)+'번');
  const dice=(value,extra,context)=>{
    if(value===null||value===undefined)return;
    if(!object(value)){invalid('dice',context,'주사위 조건',value,'눈 목록, 문구, 색을 가진 객체여야 합니다',extra);return;}
    if(!Array.isArray(value.faces))invalid('dice',context,'주사위 눈 목록',value.faces,'중복 없는 1~6 정수의 배열이어야 합니다',extra);
    else {
      const faces=new Set();
      for(const [index,face] of value.faces.entries()){
        if(!Number.isInteger(face)||face<1||face>6)invalid('dice',context,'주사위 '+(index+1)+'번째 눈',face,'1~6의 정수여야 합니다',extra);
        if(faces.has(face))invalid('dice',context,'중복 주사위 눈',face,'같은 눈을 두 번 지정할 수 없습니다',extra);
        faces.add(face);
      }
    }
    if(typeof value.text!=='string')invalid('dice',context,'주사위 문구',value.text,'문자열이어야 합니다',extra);
    if(typeof value.color!=='string')invalid('dice',context,'주사위 색',value.color,'문자열이어야 합니다',extra);
  };
  const keywordIds=new Set(),keywordNames=new Set();
  if(p.keywords!==undefined&&!Array.isArray(p.keywords))invalid('keywords','','키워드 목록',p.keywords,'배열이어야 합니다');
  for(const [index,kw] of (Array.isArray(p.keywords)?p.keywords:[]).entries()){
    const context='키워드 '+(index+1)+'번'+(typeof kw?.name==='string'?' '+valueLabel(kw.name):'');
    if(!object(kw)){invalid('keyword',context,'저장 정보',kw,'키워드 객체여야 합니다');continue;}
    checkId(kw.id,context);keywordIds.add(kw.id);
    if(typeof kw.name!=='string')invalid('keyword',context,'이름',kw.name,'문자열이어야 합니다');
    else {
      if(!kw.name.trim())invalid('keyword',context,'이름',kw.name,'공백만 있는 이름은 사용할 수 없습니다');
      if(kw.name!==kw.name.trim())invalid('keyword',context,'이름',kw.name,'이름 앞뒤에 공백이 없어야 합니다');
      if(/[\r\n]/.test(kw.name))invalid('keyword',context,'이름',kw.name,'줄바꿈을 포함할 수 없습니다');
      if(keywordNames.has(kw.name.normalize('NFC')))invalid('keyword',context,'이름',kw.name,'이미 사용 중인 중복 이름입니다. 서로 다른 이름이 필요합니다');
      keywordNames.add(kw.name.normalize('NFC'));
    }
    if(typeof kw.description!=='string')invalid('keyword',context,'설명',kw.description,'문자열이어야 합니다');
    if(typeof kw.color!=='string'||!/^#[0-9a-f]{6}$/i.test(kw.color))invalid('keyword',context,'색',kw.color,'#RRGGBB 형식이어야 합니다 (예: #427963)');
    if(!assetRef(kw.iconAssetId))invalid('keyword',context,'아이콘 그림 ID',kw.iconAssetId,'프로젝트 그림 자료에 존재하는 ID여야 합니다');
  }
  const keywordRefs=(refs,extra,context)=>{
    if(refs===undefined)return;
    if(!Array.isArray(refs)){invalid('keyword-reference',context,'키워드 목록',refs,'키워드 연결의 배열이어야 합니다',extra);return;}
    const ids=new Set();
    for(const [index,ref] of refs.entries()){
      const location=context+' · 키워드 연결 '+(index+1)+'번';
      if(!object(ref))invalid('keyword-reference',location,'연결 정보',ref,'keywordId와 표시 방식이 있는 객체여야 합니다',extra);
      else {
        if(!keywordIds.has(ref.keywordId))invalid('keyword-reference',location,'키워드 ID',ref.keywordId,'프로젝트 키워드 목록에 존재하는 ID여야 합니다',extra);
        if(ids.has(ref.keywordId))invalid('keyword-reference',location,'중복 키워드 ID',ref.keywordId,'한 대상에 같은 키워드를 두 번 연결할 수 없습니다',extra);
        if(!['inline','badge','both'].includes(ref.display))invalid('keyword-reference',location,'표시 방식',ref.display,'inline, badge, both 중 하나여야 합니다',extra);
      }
      ids.add(ref?.keywordId);
    }
  };
  const elements=(list,card)=>{
    const owner=cardProblemLabel(card)||'공통 뒷면';
    if(!Array.isArray(list)){invalid('elements',owner,'카드 요소 목록',list,'배열이어야 합니다',{cardId:card?.id});return;}
    for(const [index,e] of list.entries()){
      if(!object(e)){invalid('element',owner+' · 요소 '+(index+1)+'번','저장 정보',e,'요소 객체여야 합니다',{cardId:card?.id});continue;}
      const context=cardProblemLabel(card,e),extra={cardId:card?.id,elementId:e.id};
      checkId(e.id,context,extra);
      if(!ELEMENT_TYPES.includes(e.type))invalid('element',context,'요소 종류',e.type,ELEMENT_TYPES.join(', ')+' 중 하나여야 합니다',extra);
      if(e.locked!==undefined&&typeof e.locked!=='boolean')invalid('element-lock',context,'포인터 잠금',e.locked,'true 또는 false여야 합니다',extra);
      if(!object(e.rect))invalid('element',context,'위치·크기',e.rect,'x, y, w, h가 있는 객체여야 합니다',extra);
      else for(const [key,label,min] of [['x','가로 위치',-Infinity],['y','세로 위치',-Infinity],['w','폭',0.01],['h','높이',0.01]])
        if(!number(e.rect[key],min))invalid('element',context,label,e.rect[key],min===-Infinity?'mm 단위의 유한한 숫자여야 합니다':'0.01 mm 이상의 유한한 숫자여야 합니다',extra);
      if(!object(e.style))invalid('element',context,'스타일',e.style,'스타일 객체여야 합니다',extra);
      if(e.style?.visualEffects!==undefined){
        if(!['text','image','effect'].includes(e.type))invalid('visual-effect-target',context,'이펙트 대상 종류',e.type,'text, image, effect 요소에만 이펙트를 적용할 수 있습니다',extra);
        else effectRecipe(e.style.visualEffects,e.type,extra,context);
      }
      for(const problem of textStyleProblems(e.style))invalid(problem.key==='fontPt'?'font':'text-style',context,problem.label,problem.value,problem.rule,extra);
      if(!assetRef(e.assetId))invalid('asset-reference',context,'그림 ID',e.assetId,'프로젝트 그림 자료에 존재하는 ID여야 합니다',extra);
      if(e.content!==undefined&&typeof e.content!=='string')invalid('text',context,'요소 텍스트',e.content,'문자열이어야 합니다',extra);
      textRanges(e,['content'],extra,context);
      if(e.binding!==null&&e.binding!==undefined){
        const binding=e.binding,fields=['name','hp','art','item.effect','skill.name','skill.effect','skill.dice','skill.keywords','item.keywords'];
        if(!object(binding))invalid('binding',context,'카드 정보 연결',binding,'field가 있는 연결 객체여야 합니다',extra);
        else if(!fields.includes(binding.field))invalid('binding',context,'연결 필드',binding.field,fields.join(', ')+' 중 하나여야 합니다',extra);
        else if(!card)invalid('binding',context,'카드 정보 연결',binding.field,'공통 뒷면에는 카드 정보 연결을 사용할 수 없습니다',extra);
        else if(binding.field.startsWith('skill.')&&![...(Array.isArray(card.passives)?card.passives:[]),...(Array.isArray(card.actives)?card.actives:[])].some(sk=>sk?.id===binding.skillId))
          invalid('skill-reference',context,'연결된 스킬 ID',binding.skillId,'이 카드의 패시브 또는 액티브 목록에 존재하는 ID여야 합니다',extra);
      }
      dice(e.dice,extra,context);
    }
  };
  for(const [index,card] of p.cards.entries()){
    if(!object(card)){invalid('card','카드 '+(index+1)+'번','저장 정보',card,'카드 객체여야 합니다');continue;}
    const context=cardProblemLabel(card),extra={cardId:card.id};checkId(card.id,context,extra);
    if(!['monster','item'].includes(card.kind))invalid('card-info',context,'카드 종류',card.kind,'monster 또는 item이어야 합니다',extra);
    if(typeof card.name!=='string')invalid('card-info',context,'카드 이름',card.name,'문자열이어야 합니다',extra);
    if(!Number.isSafeInteger(card.quantity)||card.quantity<1)invalid('card-info',context,'수량',card.quantity,'1 이상의 안전한 정수여야 합니다',extra);
    if(card.autoSkillLayout!==undefined&&typeof card.autoSkillLayout!=='boolean')invalid('card-info',context,'스킬 자동 배치',card.autoSkillLayout,'true 또는 false여야 합니다',extra);
    if(card.visualEffects!==undefined)effectRecipe(card.visualEffects,'frame',extra,context+' · 카드 테두리');
    keywordRefs(card.keywords,extra,context);
    keywordRefs(card.nameKeywords,extra,context+' · 제목');
    textRanges(card,card.kind==='item'?['name','effect']:['name'],extra,context);
    if(!assetRef(card.artAssetId))invalid('asset-reference',context,'카드 그림 ID',card.artAssetId,'프로젝트 그림 자료에 존재하는 ID여야 합니다',extra);
    if(['monster','item'].includes(card.kind)){
      const minimum=card.kind==='monster'?1:0,attributeCode=card.kind==='monster'?'monster-info':'item-info';
      const attributeRule=Object.keys(ATTRIBUTES).join(', ')+' 중 하나인 문자열이어야 합니다';
      if(((card.kind==='monster'&&card.attributes===undefined)||card.attribute!==undefined)&&(typeof card.attribute!=='string'||!Object.hasOwn(ATTRIBUTES,card.attribute)))invalid(attributeCode,context,'속성',card.attribute,attributeRule,extra);
      if(card.attributes!==undefined){
        if(!Array.isArray(card.attributes))invalid(attributeCode,context,'속성 목록',card.attributes,minimum+'~6개 속성의 배열이어야 합니다',extra);
        else {
          if(card.attributes.length<minimum||card.attributes.length>6)invalid(attributeCode,context,'속성 개수',card.attributes.length,minimum+'~6개여야 합니다',extra);
          const selected=new Map();
          for(const [index,attribute] of card.attributes.entries()){
            if(typeof attribute!=='string'||!Object.hasOwn(ATTRIBUTES,attribute))invalid(attributeCode,context,(index+1)+'번 속성',attribute,attributeRule,extra);
            else if(selected.has(attribute))invalid(attributeCode,context,(index+1)+'번 속성',attribute,(selected.get(attribute)+1)+'번 속성과 중복됩니다. 각 속성은 한 번만 선택해야 합니다',extra);
            else selected.set(attribute,index);
          }
        }
      }
    }
    if(card.kind==='monster'){
      if(!RANKS.includes(card.rank))invalid('monster-info',context,'등급',card.rank,RANKS.join(', ')+' 중 하나여야 합니다',extra);
      if(!number(card.baseHp,0))invalid('monster-info',context,'기본 HP',card.baseHp,'0 이상의 유한한 숫자여야 합니다',extra);
      if(!number(card.hpReduction,0))invalid('monster-info',context,'HP 차감량',card.hpReduction,'0 이상의 유한한 숫자여야 합니다',extra);
      if(card.hpReduction>card.baseHp)invalid('monster-info',context,'HP 차감량',card.hpReduction,'기본 HP '+valueLabel(card.baseHp)+' 이하여야 합니다',extra);
      for(const [field,kind] of [['passives','패시브'],['actives','액티브']]){
        const skills=card[field];
        if(!Array.isArray(skills)){invalid('skills',context,kind+' 스킬 목록',skills,'배열이어야 합니다',extra);continue;}
        for(const [skillIndex,sk] of skills.entries()){
          const location=context+' · '+kind+' 스킬 '+(typeof sk?.name==='string'&&sk.name?valueLabel(sk.name):skillIndex+1+'번');
          if(!object(sk)){invalid('skill',location,'저장 정보',sk,'스킬 객체여야 합니다',extra);continue;}
          const detail={...extra,skillId:sk.id};checkId(sk.id,location,detail);
          if(typeof sk.name!=='string')invalid('skill',location,'스킬 이름',sk.name,'문자열이어야 합니다',detail);
          if(typeof sk.effect!=='string')invalid('skill',location,'스킬 효과',sk.effect,'문자열이어야 합니다',detail);
          dice(sk.dice,detail,location);keywordRefs(sk.keywords,detail,location);
          keywordRefs(sk.nameKeywords,detail,location+' · 제목');textRanges(sk,['name','effect'],detail,location);
          if(sk.nameStyle!==undefined){
            if(!object(sk.nameStyle))invalid('skill-name-style',location,'이름 스타일',sk.nameStyle,'스타일 객체여야 합니다',detail);
            else {
              if(sk.nameStyle.color!==undefined&&(typeof sk.nameStyle.color!=='string'||!/^#[0-9a-f]{6}$/i.test(sk.nameStyle.color)))invalid('skill-name-style',location,'이름 글자 색',sk.nameStyle.color,'#RRGGBB 형식이어야 합니다 (예: #427963)',detail);
              for(const problem of textStyleProblems(sk.nameStyle))invalid('skill-name-style',location,'이름 '+problem.label,problem.value,problem.rule,detail);
              if(sk.nameStyle.visualEffects!==undefined)effectRecipe(sk.nameStyle.visualEffects,'text',detail,location+' 이름');
            }
          }
          errors.push(...validateSkillReferences(sk,detail).map(problem=>({...problem,message:location+': '+problem.message})));
          for(const [refIndex,ref] of (Array.isArray(sk.skillReferences)?sk.skillReferences:[]).entries())if(ref&&typeof ref==='object')checkId(ref.id,location+' · 스킬 참조 '+(refIndex+1)+'번',detail);
        }
      }
    }else {
      if(typeof card.effect!=='string')invalid('item-effect',context,'아이템 효과 설명',card.effect,'문자열이어야 합니다',extra);
    }
    elements(card.elements,card);
  }
  elements(p.back.elements,null);
  for(const [key,asset] of Object.entries(p.assets)){
    const context='그림 자료 '+valueLabel(key),extra={assetId:key};
    if(!object(asset)){invalid('asset',context,'저장 정보',asset,'그림 자료 객체여야 합니다',extra);continue;}
    if(!id(key))invalid('asset',context,'자료 키',key,idRule,extra);
    if(asset.id!==key)invalid('asset',context,'그림 ID',asset.id,'자료 키 '+valueLabel(key)+'와 같아야 합니다',extra);
    if(!['image/png','image/jpeg','image/webp'].includes(asset.mime))invalid('asset',context,'그림 형식',asset.mime,'image/png, image/jpeg, image/webp 중 하나여야 합니다',extra);
    if(!dataUrl(asset.dataUrl,asset.mime))invalid('asset',context,'픽셀 데이터',asset.dataUrl,'그림 형식 '+valueLabel(asset.mime)+'과 일치하는 base64 데이터 URL이어야 합니다',extra);
    if(!Number.isSafeInteger(asset.width)||asset.width<1)invalid('asset',context,'폭',asset.width,'1 px 이상의 안전한 정수여야 합니다',extra);
    if(!Number.isSafeInteger(asset.height)||asset.height<1)invalid('asset',context,'높이',asset.height,'1 px 이상의 안전한 정수여야 합니다',extra);
    if(!(asset.paintingId===null||(id(asset.paintingId)&&Object.hasOwn(p.paintings,asset.paintingId))))invalid('asset',context,'그림 원본 ID',asset.paintingId,'원본이 없으면 null, 있으면 프로젝트 그림 원본에 존재하는 ID여야 합니다',extra);
  }
  for(const [key,drawing] of Object.entries(p.paintings)){
    const context='그림 원본 '+valueLabel(key),extra={paintingId:key};
    if(!object(drawing)){invalid('painting',context,'저장 정보',drawing,'그림 원본 객체여야 합니다',extra);continue;}
    let invalidDrawing=false;
    const drawingBad=(field,value,rule)=>{invalid('painting',context,field,value,rule,extra);invalidDrawing=true;};
    if(!id(key))drawingBad('원본 키',key,idRule);
    if(drawing.id!==key)drawingBad('원본 ID',drawing.id,'원본 키 '+valueLabel(key)+'와 같아야 합니다');
    for(const [field,label] of [['width','폭'],['height','높이']])if(!Number.isInteger(drawing[field])||drawing[field]<64||drawing[field]>4096)drawingBad(label,drawing[field],'64~4096 px의 정수여야 합니다');
    if(!Array.isArray(drawing.layers))drawingBad('레이어 목록',drawing.layers,'레이어가 1장 이상인 배열이어야 합니다');
    else if(drawing.layers.length<1)drawingBad('레이어 수',drawing.layers.length,'레이어가 1장 이상이어야 합니다');
    if(invalidDrawing)continue;
    const layerIds=new Set();
    for(const [index,layer] of drawing.layers.entries()){
      const location=context+' · 레이어 '+(index+1)+'번'+(typeof layer?.name==='string'?' '+valueLabel(layer.name):'');
      if(!object(layer)){invalid('layer',location,'저장 정보',layer,'레이어 객체여야 합니다',extra);layerIds.add(layer?.id);continue;}
      const detail={...extra,layerId:layer.id};
      if(!id(layer.id))invalid('layer',location,'ID',layer.id,idRule,detail);
      if(layerIds.has(layer.id))invalid('layer',location,'중복 ID',layer.id,'이 그림의 다른 레이어와 서로 다른 ID여야 합니다',detail);
      if(typeof layer.name!=='string')invalid('layer',location,'이름',layer.name,'문자열이어야 합니다',detail);
      if(typeof layer.visible!=='boolean')invalid('layer',location,'표시 설정',layer.visible,'true 또는 false여야 합니다',detail);
      if(typeof layer.locked!=='boolean')invalid('layer',location,'잠금 설정',layer.locked,'true 또는 false여야 합니다',detail);
      if(!number(layer.opacity,0)||layer.opacity>1)invalid('layer',location,'불투명도',layer.opacity,'0~1의 유한한 숫자여야 합니다',detail);
      if(layer.blendMode!==undefined&&!isBlendMode(layer.blendMode))invalid('layer',location,'혼합 모드',layer.blendMode,'지원하는 26개 레이어 혼합 모드 중 하나여야 합니다. 이전 파일은 생략하면 일반(source-over)으로 표시합니다',detail);
      if(!dataUrl(layer.png,'image/png'))invalid('layer',location,'픽셀 데이터',layer.png,'image/png 형식의 base64 데이터 URL이어야 합니다',detail);
      layerIds.add(layer.id);
    }
    if(!layerIds.has(drawing.activeLayerId))invalid('active-layer',context,'선택된 레이어 ID',drawing.activeLayerId,'현재 레이어 ID '+[...layerIds].slice(0,5).map(valueLabel).join(', ')+' 중 하나여야 합니다',extra);
  }
  return errors;
}
export function parseProject(text){
  let value;try{value=JSON.parse(text);}catch{throw new Error('JSON 파일을 읽을 수 없습니다. 카드 프로젝트 파일을 선택하세요.');}
  const problems=validateProject(value);if(problems.length){const e=new Error(problems[0].message);e.problems=problems;throw e;}
  const result=clone(value);result.keywords??=[];result.visualEffectPresets??=[];result.cardTemplates??=[];result.print.effectFrameSec??=1.2;
  for(const card of result.cards){card.autoSkillLayout??=card.template!=='custom';if(card.kind==='monster')for(const sk of [...card.passives,...card.actives])sk.keywords??=[];else card.keywords??=[];}
  syncVariants(result);const inherited=validateProject(result);if(inherited.length)throw Object.assign(new Error(inherited[0].message),{problems:inherited});
  upgradeProjectVisualEffects(result);syncVariants(result);const resolved=validateProject(result);if(resolved.length)throw Object.assign(new Error(resolved[0].message),{problems:resolved});
  return result;
}
export function serializeProject(project){const e=validateProject(project);if(e.length)throw new Error(e[0].message);return JSON.stringify(project,null,2);}
