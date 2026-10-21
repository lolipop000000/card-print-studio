import {cardSkills} from './skill-references.js';
import {hasTextTypography} from './text-style.js';
import {mergeTextSpans,getTextRanges} from './text-ranges.js';

const styled=skill=>getTextRanges(skill,'name').length||skill.nameStyle&&(skill.nameStyle.color||hasTextTypography(skill.nameStyle)||skill.nameStyle.visualEffects?.layers?.some(layer=>layer.enabled&&layer.opacity>0));

/** Read-only, literal matching. Offsets use the textarea's UTF-16 coordinates. */
export function skillNameSpans(card,text,{skillReferences=[],titleSkillId=null}={}){
 text=String(text);const skills=cardSkills(card),byId=new Map(skills.map(skill=>[skill.id,skill]));
 const span=(skill,start,end,id)=>({start,end,skillId:skill.id,id,style:skill.nameStyle});
 const spans=(skill,start,end,id)=>{
  const ranges=getTextRanges(skill,'name');if(!ranges.length)return [span(skill,start,end,id)];
  const base=skill.nameStyle?[{...span(skill,0,end-start,id),style:skill.nameStyle}]:[];
  return mergeTextSpans(skill.name,base,ranges).map(s=>({...s,start:s.start+start,end:s.end+start,skillId:skill.id,id:id+':'+s.id}));
 };
 if(titleSkillId!==null){
  const skill=byId.get(titleSkillId);
  return skill?.name&&styled(skill)&&text.endsWith(skill.name)?spans(skill,text.length-skill.name.length,text.length,'title:'+skill.id):[];
 }
 const candidates=skills.filter(skill=>skill.name&&styled(skill)).sort((a,b)=>b.name.length-a.name.length),result=[];
 const refs=[...skillReferences].sort((a,b)=>a.start-b.start);let at=0;
 const plain=end=>{
  while(at<end){
   const skill=candidates.find(skill=>at+skill.name.length<=end&&text.startsWith(skill.name,at));
   if(skill){result.push(...spans(skill,at,at+skill.name.length,'plain:'+skill.id+':'+at));at+=skill.name.length;}
   else at++;
  }
 };
 for(const ref of refs){
  plain(ref.start);const skill=byId.get(ref.skillId);
  if(skill&&styled(skill))result.push(...spans(skill,ref.start,ref.end,ref.id));
  at=ref.end;
 }
 plain(text.length);return result;
}
