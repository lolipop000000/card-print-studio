import {el,field} from './dom.js';
import {TEXT_STYLE_DEFAULTS} from '../model/text-style.js';

/** Shared by the inspector and effect editor; callers own history and reflow. */
export function textStyleFields(style={},onChange,{idPrefix='text-style',minFontPt=7,includeColor=false,inline=false}={}){
 const value={...TEXT_STYLE_DEFAULTS,fontPt:Math.max(minFontPt,TEXT_STYLE_DEFAULTS.fontPt),...style},id=key=>idPrefix+'-'+key;
 const fields=[
  field('글자 크기 (pt)',id('font'),value.fontPt,v=>{if(v!==null&&Number.isFinite(v))onChange('fontPt',Math.max(minFontPt,Math.min(200,v)));},{type:'number',min:minFontPt,max:200,step:.5}),
  field('굵기',id('weight'),value.fontWeight,v=>{if(v!==null)onChange('fontWeight',Math.max(100,Math.min(1000,v)));},{type:'number',min:100,max:1000,step:100}),
  ...inline?[]:[field('정렬',id('align'),value.align,v=>onChange('align',v),{options:[['left','왼쪽'],['center','가운데'],['right','오른쪽']]})],
  field('자간 (mm)',id('letter-spacing'),value.letterSpacingMm,v=>{if(v!==null)onChange('letterSpacingMm',Math.max(-1,Math.min(5,v)));},{type:'number',min:-1,max:5,step:.05}),
  field('줄 간격 (배)',id('line-height'),value.lineHeight,v=>{if(v!==null)onChange('lineHeight',Math.max(.8,Math.min(4,v)));},{type:'number',min:.8,max:4,step:.05}),
  el('label',{class:'check'},el('input',{id:id('italic'),type:'checkbox',checked:value.fontStyle==='italic',onchange:event=>onChange('fontStyle',event.target.checked?'italic':'normal')}),'기울임'),
  el('label',{class:'check'},el('input',{id:id('underline'),type:'checkbox',checked:value.underline,onchange:event=>onChange('underline',event.target.checked)}),'밑줄')
 ];
 if(includeColor)fields.push(field('글자 색',id('color'),style.color||'#253d32',v=>onChange('color',v),{type:'color'}));
 return fields;
}

