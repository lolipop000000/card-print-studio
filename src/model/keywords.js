import {newId} from './types.js';
import {rewritePlainSkillText,replaceSkillText} from './skill-references.js';
export const inlineDisplay=ref=>ref.display==='inline'||ref.display==='both';
export const badgeDisplay=ref=>ref.display==='badge'||ref.display==='both';
export function selectedKeywords(project,target,display){
 const library=new Map((project.keywords||[]).map(k=>[k.id,k]));
 return (target?.keywords||[]).filter(ref=>!display||(display==='inline'?inlineDisplay(ref):badgeDisplay(ref))).map(ref=>library.get(ref.keywordId)).filter(Boolean);
}
export function keywordTargets(project){
 return project.cards.flatMap(c=>c.kind==='monster'?[...c.passives,...c.actives]:[c]);
}
export function keywordUseCount(project,id){return keywordTargets(project).filter(t=>(t.keywords||[]).some(r=>r.keywordId===id)).length;}
/** Literal, longest-name-first matching: user text is never HTML or a regular expression. */
export function tokenizeKeywords(text,keywords){
 const candidates=[...keywords].sort((a,b)=>b.name.length-a.name.length),runs=[];let plain='',at=0;
 const flush=()=>{if(plain){runs.push({text:plain});plain='';}};
 while(at<text.length){
  const found=candidates.find(k=>k.name&&text.startsWith(k.name,at));
  if(found){flush();runs.push({text:found.name,keyword:found});at+=found.name.length;}
  else plain+=text[at++];
 }
 flush();return runs;
}
export function addKeyword(project){
 const list=project.keywords??(project.keywords=[]);let name='새 키워드',n=2;
 while(list.some(k=>k.name===name))name='새 키워드 '+n++;
 const keyword={id:newId(),name,description:'',color:'#427963',iconAssetId:null};list.push(keyword);return keyword.id;
}
export function updateKeyword(project,id,patch){
 const keyword=project.keywords?.find(k=>k.id===id);if(!keyword)throw Error('수정할 키워드가 없어요.');
 const name=patch.name===undefined?keyword.name:patch.name.trim().normalize('NFC');
 if(!name||/[\r\n]/.test(name)||project.keywords.some(k=>k.id!==id&&k.name.normalize('NFC')===name))throw Error('키워드 이름은 비어 있거나 중복될 수 없어요.');
 if(name!==keyword.name)for(const target of keywordTargets(project)){
  const selected=selectedKeywords(project,target,'inline');
  if(!selected.some(k=>k.id===id))continue;
  rewritePlainSkillText(target,text=>tokenizeKeywords(text,selected).map(run=>run.keyword?.id===id?name:run.text).join(''));
 }
 Object.assign(keyword,patch,{name});
}
export function removeKeyword(project,id){
 project.keywords=(project.keywords||[]).filter(k=>k.id!==id);
 for(const target of keywordTargets(project))target.keywords=(target.keywords||[]).filter(ref=>ref.keywordId!==id);
}
export function linkKeyword(target,id,display){
 const refs=target.keywords??(target.keywords=[]),ref=refs.find(r=>r.keywordId===id);
 if(ref){if(ref.display!==display)ref.display='both';}else refs.push({keywordId:id,display});
}
export function insertKeywordText(target,keyword,start=target.effect.length,end=start){
 const before=target.effect.slice(0,start),after=target.effect.slice(end);
 const prefix=before&&!/\s$/.test(before)?' ':'',suffix=after&&!/^\s/.test(after)?' ':'';
 replaceSkillText(target,start,end,prefix+keyword.name+suffix);
 return before.length+prefix.length+keyword.name.length+suffix.length;
}
