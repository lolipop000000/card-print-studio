import {clone} from './types.js';

export const TEXT_STYLE_DEFAULTS=Object.freeze({fontPt:9,fontWeight:400,fontStyle:'normal',letterSpacingMm:0,lineHeight:1.22,align:'left',underline:false});
export const TEXT_STYLE_KEYS=Object.freeze(Object.keys(TEXT_STYLE_DEFAULTS));
export const hasTextTypography=style=>TEXT_STYLE_KEYS.some(key=>style?.[key]!==undefined);

export function textStyleProblems(style){
 if(!style||typeof style!=='object'||Array.isArray(style))return [];
 const problems=[],finite=(value,min,max)=>typeof value==='number'&&Number.isFinite(value)&&value>=min&&value<=max;
 const check=(key,label,valid,rule)=>{if(style[key]!==undefined&&!valid(style[key]))problems.push({key,label,value:style[key],rule});};
 // Saved files historically allow every finite positive font size; input limits belong to the UI.
 check('fontPt','글자 크기',v=>finite(v,.01,Infinity),'0.01 pt 이상의 유한한 숫자여야 합니다');
 check('fontWeight','글자 굵기',v=>finite(v,100,1000),'100~1000의 유한한 숫자여야 합니다');
 check('fontStyle','기울임',v=>['normal','italic'].includes(v),'normal 또는 italic이어야 합니다');
 check('letterSpacingMm','자간',v=>finite(v,-1,5),'-1~5 mm의 유한한 숫자여야 합니다');
 check('lineHeight','줄 간격',v=>finite(v,.8,4),'0.8~4배의 유한한 숫자여야 합니다');
 check('align','글자 정렬',v=>['left','center','right'].includes(v),'left, center, right 중 하나여야 합니다');
 check('underline','밑줄',v=>typeof v==='boolean','true 또는 false여야 합니다');
 return problems;
}
function targetStyle(project,{cardId,back=false,elementId=null,skillId=null},{write=false}={}){
 const card=back?project.back:project.cards.find(c=>c.id===cardId);if(!card)throw Error('글자를 꾸밀 카드를 찾을 수 없어요.');
 if(skillId!==null){
  const skill=!back&&[...(card.passives||[]),...(card.actives||[])].find(s=>s.id===skillId);if(!skill)throw Error('글자를 꾸밀 기술을 찾을 수 없어요.');
  if(write)skill.nameStyle??={};return {card,owner:skill.nameStyle||{},text:true};
 }
 const element=card.elements.find(e=>e.id===elementId);return {card,owner:element?.style,text:element?.type==='text'};
}
/** Draft snapshots contain authored typography only; color and effects have independent controls. */
export function readTargetTextStyle(project,target){
 const selected=targetStyle(project,target);if(!selected.text)return {};
 return Object.fromEntries(TEXT_STYLE_KEYS.filter(key=>selected.owner[key]!==undefined).map(key=>[key,clone(selected.owner[key])]));
}
export function writeTargetTextStyle(project,target,style){
 if(!style||typeof style!=='object'||Array.isArray(style))throw Error('글자 스타일 객체가 필요합니다.');
 const problem=textStyleProblems(style)[0];if(problem)throw Error(problem.label+' 값이 올바르지 않습니다. '+problem.rule+'.');
 const selected=targetStyle(project,target,{write:true});if(!selected.text)throw Error('글자 꾸미기는 텍스트에만 적용할 수 있어요.');
 for(const key of TEXT_STYLE_KEYS){if(style[key]===undefined)delete selected.owner[key];else selected.owner[key]=clone(style[key]);}
 if(target.elementId&&!target.skillId&&selected.card.kind)selected.card.template='custom';
}

