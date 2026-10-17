import {cardSkills} from './skill-references.js';
import {hasTextTypography} from './text-style.js';

const styled=skill=>skill.nameStyle&&(skill.nameStyle.color||hasTextTypography(skill.nameStyle)||skill.nameStyle.visualEffects?.layers?.some(layer=>layer.enabled&&layer.opacity>0));

/** Read-only, literal matching. Offsets use the textarea's UTF-16 coordinates. */
export function skillNameSpans(card,text,{skillReferences=[],titleSkillId=null}={}){
 text=String(text);const skills=cardSkills(card),byId=new Map(skills.map(skill=>[skill.id,skill]));
 const span=(skill,start,end,id)=>({start,end,skillId:skill.id,id,style:skill.nameStyle});
 if(titleSkillId!==null){
  const skill=byId.get(titleSkillId);
  return skill?.name&&styled(skill)&&text.endsWith(skill.name)?[span(skill,text.length-skill.name.length,text.length,'title:'+skill.id)]:[];
 }
 const candidates=skills.filter(skill=>skill.name&&styled(skill)).sort((a,b)=>b.name.length-a.name.length),result=[];
 const refs=[...skillReferences].sort((a,b)=>a.start-b.start);let at=0;
 const plain=end=>{
  while(at<end){
   const skill=candidates.find(skill=>at+skill.name.length<=end&&text.startsWith(skill.name,at));
   if(skill){result.push(span(skill,at,at+skill.name.length,'plain:'+skill.id+':'+at));at+=skill.name.length;}
   else at++;
  }
 };
 for(const ref of refs){
  plain(ref.start);const skill=byId.get(ref.skillId);
  if(skill&&styled(skill))result.push(span(skill,ref.start,ref.end,ref.id));
  at=ref.end;
 }
 plain(text.length);return result;
}
