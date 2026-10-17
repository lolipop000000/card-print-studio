/** Compact diagnostics must never copy image payloads into an error panel. */
export function valueLabel(value){
 if(value===undefined)return '없음';
 if(value===null)return 'null';
 if(typeof value==='string'){
  if(/^data:/i.test(value))return '“데이터 URL”';
  if(/^[A-Za-z0-9+/]{80,}={0,2}$/.test(value))return '“인코딩 데이터 ('+value.length+'자)”';
  const text=value.replace(/[\s\u0000-\u001f\u007f]+/g,' ');
  return '“'+(text.length>60?text.slice(0,59)+'…':text)+'”';
 }
 if(Array.isArray(value))return '배열 ('+value.length+'개)';
 if(typeof value==='object')return '객체';
 if(typeof value==='function')return '함수';
 return String(value);
}
const list=value=>Array.isArray(value)?value:[];
const skillInfo=(card,id)=>{
 const passive=list(card?.passives).find(skill=>skill?.id===id);
 if(passive)return {skill:passive,kind:'패시브 스킬'};
 const active=list(card?.actives).find(skill=>skill?.id===id);
 return {skill:active,kind:active?'액티브 스킬':'스킬'};
};
const skillLabel=(card,id)=>{
 const {skill,kind}=skillInfo(card,id);
 return kind+(typeof skill?.name==='string'&&skill.name.trim()?' '+valueLabel(skill.name):' ID '+valueLabel(id));
};
/** Human identity shared by project validation and render preflight. No trailing colon. */
export function cardProblemLabel(card,element,skillId){
 if(!card&&!element&&skillId===undefined)return '';
 const back=!card||(!card.kind&&!card.id&&card.name===undefined);
 const owner=back?'공통 뒷면':typeof card.name==='string'&&card.name.trim()?'카드 '+valueLabel(card.name):'카드 ID '+valueLabel(card.id);
 let part='';
 if(skillId!==undefined)part=skillLabel(card,skillId)+' 이름';
 else if(element){
  const field=element.binding?.field;
  const fields={name:'카드 이름',hp:'HP',art:'카드 그림','item.effect':'아이템 효과','item.keywords':'아이템 키워드'};
  if(Object.hasOwn(fields,field))part=fields[field];
  else if(typeof field==='string'&&field.startsWith('skill.')){
   const suffix={'skill.name':'이름','skill.effect':'효과','skill.dice':'주사위','skill.keywords':'키워드'}[field]||'연결 요소';
   part=skillLabel(card,element.binding?.skillId)+' '+suffix;
  }else if(element.type==='text'&&typeof element.content==='string'&&element.content.trim())part='텍스트 '+valueLabel(element.content);
  else {
   const kind={text:'텍스트',image:'그림',rect:'사각형',attribute:'속성',rank:'등급',dice:'주사위',keywords:'키워드',effect:'이펙트'}[element.type]||'요소';
   const images=list(card?.elements).filter(item=>item?.type==='image');
   const imageIndex=element.type==='image'?images.findIndex(item=>item===element||(element.id!==undefined&&item?.id===element.id)):-1;
   part=kind+(imageIndex>=0?' '+(imageIndex+1)+'번':'')+(element.id!==undefined?' (ID '+valueLabel(element.id)+')':'');
  }
 }
 return owner+(part?' · '+part:'');
}
