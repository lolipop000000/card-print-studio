import {newId} from './types.js';
import {replaceSkillText} from './skill-references.js';
import {replaceText,mergeTextSpans} from './text-ranges.js';
export const inlineDisplay=ref=>ref.display==='inline'||ref.display==='both';
export const badgeDisplay=ref=>ref.display==='badge'||ref.display==='both';
const titleField=field=>field==='title'||field==='name';
export function selectedKeywords(project,target,display){
 const keywords=project.keywords||[],library=new Map(keywords.map(k=>[k.id,k]));
 if(titleField(display)){
  // Derive title styling from the authored name, including keywords registered
  // later. No extra edit or saved link is needed just to display a typed name.
  const matches=new Set(tokenizeKeywords(target?.name||'',keywords).flatMap(run=>run.keyword?[run.keyword.id]:[]));
  return keywords.filter(keyword=>matches.has(keyword.id));
 }
 return (target?.keywords||[]).filter(ref=>!display||(display==='inline'?inlineDisplay(ref):badgeDisplay(ref))).map(ref=>library.get(ref.keywordId)).filter(Boolean);
}
export function keywordTargets(project){
 return project.cards.flatMap(c=>[c,...(c.passives||[]),...(c.actives||[])]);
}
export function keywordUseCount(project,id){return keywordTargets(project).filter(t=>(t.keywords||[]).some(r=>r.keywordId===id)||selectedKeywords(project,t,'title').some(k=>k.id===id)).length;}
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
export function keywordsInText(text,keywords){
 const found=new Map();for(const run of tokenizeKeywords(String(text),keywords))if(run.keyword)found.set(run.keyword.id,run.keyword);return [...found.values()];
}
export function keywordsForText(project,target,display,text){
 const linked=selectedKeywords(project,target,display),ids=new Set(linked.map(keyword=>keyword.id));
 return [...linked,...keywordsInText(text,project.keywords||[]).filter(keyword=>!ids.has(keyword.id))];
}
/** Shared recipes keep underlying typography; explicit skill-name characters take priority. */
export function keywordTextSpans(text,keywords,skillSpans=[]){
 const spans=[];let at=0;
 for(const run of tokenizeKeywords(String(text),keywords)){
  const keyword=run.keyword;
  if(keyword)spans.push({id:'keyword:'+keyword.id+':'+at,keywordId:keyword.id,start:at,end:at+run.text.length,style:{color:keyword.color,...(keyword.visualEffects?.layers.some(layer=>layer.enabled&&layer.opacity>0)?{visualEffects:keyword.visualEffects}:{})}});
  at+=run.text.length;
 }
 return spans.length?mergeTextSpans(text,[...skillSpans.filter(span=>span.rangeId),...spans,...skillSpans.filter(span=>!span.rangeId)]):skillSpans;
}
export function addKeyword(project){
 const list=project.keywords??(project.keywords=[]);let name='새 키워드',n=2;
 while(list.some(k=>k.name===name))name='새 키워드 '+n++;
 const keyword={id:newId(),name,description:'',color:'#427963',iconAssetId:null};list.push(keyword);return keyword.id;
}
function renameKeywordText(target,field,selected,id,name){
 const source=target[field]||'',segments=[];let at=0;
 for(const ref of field==='effect'?target.skillReferences||[]:[]){segments.push([at,ref.start]);at=ref.end;}segments.push([at,source.length]);
 const edits=[];
 for(const [start,end] of segments){
  let offset=start;
  for(const run of tokenizeKeywords(source.slice(start,end),selected)){
   if(run.keyword?.id===id)edits.push({start:offset,end:offset+run.text.length});
   offset+=run.text.length;
  }
 }
 // Replacing each occurrence from the end keeps styling between matches intact.
 for(const edit of edits.reverse())if(field==='effect')replaceSkillText(target,edit.start,edit.end,name);else replaceText(target,field,edit.start,edit.end,name);
}
export function updateKeyword(project,id,patch){
 const keyword=project.keywords?.find(k=>k.id===id);if(!keyword)throw Error('수정할 키워드가 없어요.');
 const name=patch.name===undefined?keyword.name:patch.name.trim().normalize('NFC');
 if(!name||/[\r\n]/.test(name)||project.keywords.some(k=>k.id!==id&&k.name.normalize('NFC')===name))throw Error('키워드 이름은 비어 있거나 중복될 수 없어요.');
 if(name!==keyword.name)for(const target of keywordTargets(project)){
  for(const [field,scope] of [['name','title'],['effect','inline']]){
   const selected=selectedKeywords(project,target,scope);
   if(selected.some(k=>k.id===id))renameKeywordText(target,field,selected,id,name);
  }
 }
 Object.assign(keyword,patch,{name});
}
export function removeKeyword(project,id){
 project.keywords=(project.keywords||[]).filter(k=>k.id!==id);
 for(const target of keywordTargets(project)){
  if(target.keywords!==undefined)target.keywords=target.keywords.filter(ref=>ref.keywordId!==id);
  if(target.nameKeywords!==undefined)target.nameKeywords=target.nameKeywords.filter(ref=>ref.keywordId!==id);
 }
}
export function linkKeyword(target,id,display,field='effect'){
 const title=titleField(field),key=title?'nameKeywords':'keywords';if(title)display='inline';
 const refs=target[key]??(target[key]=[]),ref=refs.find(r=>r.keywordId===id);
 if(title){if(!ref)refs.push({keywordId:id,display});return;}
 if(ref){if(ref.display!==display)ref.display='both';}else refs.push({keywordId:id,display});
}
export function insertKeywordText(target,keyword,start,end,field='effect'){
 field=titleField(field)?'name':'effect';const source=target[field]||'';start??=source.length;end??=start;
 const before=source.slice(0,start),after=source.slice(end);
 const prefix=before&&!/\s$/.test(before)?' ':'',suffix=after&&!/^\s/.test(after)?' ':'';
 if(field==='effect')replaceSkillText(target,start,end,prefix+keyword.name+suffix);else replaceText(target,field,start,end,prefix+keyword.name+suffix);
 return before.length+prefix.length+keyword.name.length+suffix.length;
}
