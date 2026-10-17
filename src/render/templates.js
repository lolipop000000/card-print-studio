import {preserveTemplateVisualEffects} from '../model/visual-effects.js';
import {clone,cardAttributes} from '../model/types.js';
import {selectedKeywords} from '../model/keywords.js';
import {resolveSkillEffect} from '../model/skill-references.js';
import {skillNameSpans} from '../model/skill-name-styles.js';
import {PT_MM,graphemes,textLineHeight} from './text.js';
import {fitRichText,fitKeywordBadges} from './keywords.js';
import {diceContentHeight} from './icons.js';
const textStyle={fontPt:9,fontWeight:400,color:'#253d32',align:'left'};
const bindingKey=binding=>binding?binding.field+':'+(binding.skillId||''):null;
const previousElements=card=>new Map(card.elements.filter(e=>e.binding).map(e=>[bindingKey(e.binding),e]));
const preserveLock=(previous,element)=>{if(previous?.locked!==undefined)element.locked=previous.locked;};
const flowElement=e=>e.binding?.skillId||e.binding?.field?.startsWith('item.');
/** Keep authored layers on the same side of existing text when rows are regenerated. */
function replaceFlowElements(ordered,generated){
 const pending=new Map(generated.map(e=>[bindingKey(e.binding),e])),elements=[];let insertion;
 for(const previous of ordered){
  if(!flowElement(previous)){elements.push(previous);continue;}
  const key=bindingKey(previous.binding),replacement=pending.get(key);if(replacement){elements.push(replacement);pending.delete(key);}insertion=elements.length;
 }
 elements.splice(insertion??elements.length,0,...generated.filter(e=>pending.has(bindingKey(e.binding))));return elements;
}
const element=(card,key,type,rect,binding,style={})=>({id:card.id+':'+key,type,rect,binding,style:{...textStyle,...style}});
let measurement;
function context(){if(!measurement&&typeof document!=='undefined')measurement=document.createElement('canvas').getContext('2d');return measurement;}
function authoredStyle(previous,field,skillId,defaults,min){
 const old=previous.get(field+':'+(skillId||'')),style={...defaults,...old?.style};style.fontPt=Math.max(min,style.fontPt??9);return style;
}
function textHeight(ctx,text,width,style,min,keywords=[],skillReferences=[],nameSpans=[]){
 if(ctx)return fitRichText(ctx,text,{x:0,y:0,w:width,h:Infinity},style,min,keywords,skillReferences,nameSpans).heightMm;
 const font=Math.max(min,style.fontPt??9,...nameSpans.map(span=>span.style.fontPt??0)),advance=font*PT_MM*.65+(style.letterSpacingMm??0);
 return String(text).replace(/\r/g,'').split('\n').reduce((height,line)=>height+Math.max(1,Math.ceil(graphemes(line).length*Math.max(.01,advance)/width))*textLineHeight(font,style),0);
}
function skillRows(card,s,keywords,previous){
 const ctx=context(),sx=s.cardWidthMm/63,sy=s.cardHeightMm/88,w=55*sx,project={keywords},gap=.35*sy;
 return [...(card.passives||[]),...(card.actives||[])].map(sk=>{
  const title=(card.passives?.includes(sk)?'패시브':'액티브')+' · '+sk.name;
  const titleStyle=authoredStyle(previous,'skill.name',sk.id,{fontPt:9.2,fontWeight:720},s.minFontPt),bodyStyle=authoredStyle(previous,'skill.effect',sk.id,{fontPt:8.5},s.minFontPt);
  const badgeStyle=authoredStyle(previous,'skill.keywords',sk.id,{fontPt:8.5},s.minFontPt),diceStyle=authoredStyle(previous,'skill.dice',sk.id,{fontPt:7.5},s.minFontPt);
  const titleH=Math.max(4.5*sy,textHeight(ctx,title,w,titleStyle,s.minFontPt,[],[],skillNameSpans(card,title,{titleSkillId:sk.id})));
  const badges=selectedKeywords(project,sk,'badge'),badgeH=badges.length?(ctx?fitKeywordBadges(ctx,badges,{w,h:Infinity},badgeStyle,badgeStyle.fontPt).heightMm:textLineHeight(badgeStyle.fontPt,badgeStyle)+.8):0;
  const diceW=sk.dice?Math.min(16*sx,w*.36):0,effectW=w-(sk.dice?diceW+.8*sx:0);
  const effect=resolveSkillEffect(card,sk),textH=textHeight(ctx,effect.text,effectW,bodyStyle,s.minFontPt,selectedKeywords(project,sk,'inline'),effect.skillReferences,skillNameSpans(card,effect.text,{skillReferences:effect.skillReferences}));
  const diceH=sk.dice?ctx?diceContentHeight(ctx,sk.dice,diceW,diceStyle.fontPt):7.7:0,bodyH=Math.max(textH,diceH);
  return {sk,titleH,badgeH,bodyH,diceW,effectW,gap,titleStyle,bodyStyle,badgeStyle,diceStyle,total:titleH+gap+(badgeH?badgeH+gap:0)+bodyH};
 });
}
function addSkills(card,s,top,rows,previous){
 const sx=s.cardWidthMm/63,sy=s.cardHeightMm/88,width=55*sx,between=1.4*sy;let y=top;
 for(const row of rows){
  const {sk,titleH,badgeH,bodyH,gap}=row;
  const add=(key,type,rect,field,style)=>{
   const e=element(card,sk.id+':'+key,type,rect,{field,skillId:sk.id},style),old=previous.get(bindingKey(e.binding));if(old)e.id=old.id;preserveLock(old,e);card.elements.push(e);
  };
  add('name','text',{x:4*sx,y,w:width,h:titleH},'skill.name',row.titleStyle);y+=titleH+gap;
  add('effect','text',{x:4*sx,y,w:row.effectW,h:bodyH},'skill.effect',row.bodyStyle);
  if(sk.dice)add('dice','dice',{x:4*sx+width-row.diceW,y,w:row.diceW,h:bodyH},'skill.dice',row.diceStyle);
  y+=bodyH;
  if(badgeH){y+=gap;add('keywords','keywords',{x:4*sx,y,w:width,h:badgeH},'skill.keywords',row.badgeStyle);y+=badgeH;}
  y+=between;
 }
}
function layoutSkillArea(card,s,keywords,artH,customTop,artTop=15,previous=new Map()){
 const sy=s.cardHeightMm/88,rows=skillRows(card,s,keywords,previous),between=1.4*sy;
 const required=rows.reduce((n,row)=>n+row.total,0)+Math.max(0,rows.length-1)*between;
 const chosenArt=customTop===undefined?Math.max(8,Math.min(artH,80-artTop-required/sy)):artH;
 const top=customTop??(artTop+4+chosenArt)*sy;addSkills(card,s,top,rows,previous);return chosenArt;
}
function addItemEffect(card,s,keywords,top,previous=new Map()){
 const sx=s.cardWidthMm/63,sy=s.cardHeightMm/88,w=55*sx,ctx=context(),badges=selectedKeywords({keywords},card,'badge');let y=top;
 const add=(key,type,rect,field,style)=>{const e=element(card,key,type,rect,{field},style),old=previous.get(bindingKey(e.binding));if(old)e.id=old.id;preserveLock(old,e);card.elements.push(e);};
 if(badges.length){
  const style=authoredStyle(previous,'item.keywords',null,{fontPt:8.5},s.minFontPt),height=ctx?fitKeywordBadges(ctx,badges,{w,h:Infinity},style,style.fontPt).heightMm:4.5*sy;
  add('keywords','keywords',{x:4*sx,y,w,h:Math.max(.1,height)},'item.keywords',style);y+=height+.5*sy;
 }
 const style=authoredStyle(previous,'item.effect',null,{fontPt:10},s.minFontPt),height=textHeight(ctx,card.effect,w,style,style.fontPt,selectedKeywords({keywords},card,'inline'));
 add('effect','text',{x:4*sx,y,w,h:Math.max(.1,84*sy-y,height)},'item.effect',style);
}
export function applyTemplate(input,s,variant,keywords=[]){
 const previous=previousElements(input),c=clone(input);c.template=variant;c.autoSkillLayout=true;c.elements=[];const sx=s.cardWidthMm/63,sy=s.cardHeightMm/88;
 const multiple=cardAttributes(c).length>1,artTop=multiple?26:15;
 const r=(x,y,w,h)=>({x:x*sx,y:y*sy,w:w*sx,h:h*sy}),add=(key,type,rect,binding,style)=>{
  const e=element(c,key,type,rect,binding,style),old=previous.get(bindingKey(binding));if(old){e.id=old.id;e.style={...e.style,...old.style};}preserveLock(old??input.elements.find(previous=>previous.id===e.id),e);c.elements.push(e);
 };
 add('name','text',r(4,4,29,8),{field:'name'},{fontPt:14,fontWeight:760});
 if(c.kind==='monster'){
  add('hp','text',r(35,5,12,6),{field:'hp'},{fontPt:10,fontWeight:700});
  add('rank','rank',r(57,4,4,7),null,{fontPt:12,fontWeight:800,align:'center'});
 }
 add('attribute','attribute',multiple?r(4,14,55,9):r(49,3.5,7.8,9),null,{fontPt:7});
 const count=(c.passives?.length||0)+(c.actives?.length||0);let artH=c.kind==='item'?33:variant==='monster-effects'?Math.max(8,24-Math.max(0,count-3)*3):33;
 if(multiple)artH=Math.max(8,artH-(artTop-15));
 add('art','image',r(4,artTop,55,artH),{field:'art'},{fit:'contain',cropX:.5,cropY:.5});
 if(c.kind==='item')addItemEffect(c,s,keywords,(artTop+4+artH)*sy,previous);
 else {artH=layoutSkillArea(c,s,keywords,artH,undefined,artTop,previous);c.elements.find(e=>e.binding?.field==='art').rect.h=artH*sy;}
 for(const e of c.elements)e.style.fontPt=Math.max(s.minFontPt,e.style.fontPt);
 return preserveTemplateVisualEffects(input,c);
}
export function syncSkillElements(card,s,keywords=[]){
 if(!card.elements.length&&card.template!=='custom')return applyTemplate(card,s,card.template,keywords);
 const c=clone(card),ordered=c.elements,skills=[...(c.passives||[]),...(c.actives||[])],ids=new Set(skills.map(x=>x.id));
 c.elements=c.elements.filter(e=>!e.binding?.skillId||ids.has(e.binding.skillId));
 if(c.autoSkillLayout??c.template!=='custom'){
  const previous=previousElements(c);
  c.elements=c.elements.filter(e=>!flowElement(e));const generatedStart=c.elements.length;
  const art=c.elements.find(e=>e.binding?.field==='art'),sy=s.cardHeightMm/88,top=art?Math.max(15*sy,art.rect.y+art.rect.h+4*sy):19*sy;
  if(c.kind==='item')addItemEffect(c,s,keywords,top,previous);else layoutSkillArea(c,s,keywords,0,top,15,previous);
  c.elements=replaceFlowElements(ordered,c.elements.slice(generatedStart));return preserveTemplateVisualEffects(card,c);
 }
 const generated=applyTemplate(c,s,c.kind==='monster'?'monster-effects':'item',keywords);
 for(const e of generated.elements.filter(e=>e.binding?.skillId||e.binding?.field?.startsWith('item.'))){
  if(!c.elements.some(existing=>bindingKey(existing.binding)===bindingKey(e.binding)))c.elements.push(e);
 }
 c.elements=c.elements.filter(e=>e.binding?.field!=='skill.dice'||skills.find(sk=>sk.id===e.binding.skillId)?.dice);
 c.elements=c.elements.filter(e=>e.binding?.field!=='skill.keywords'||selectedKeywords({keywords},skills.find(sk=>sk.id===e.binding.skillId),'badge').length);
 c.elements=c.elements.filter(e=>e.binding?.field!=='item.keywords'||selectedKeywords({keywords},c,'badge').length);
 return preserveTemplateVisualEffects(card,c);
}
export function fitCard(card,s,keywords=[]){
 const extras=card.elements.filter(e=>!e.binding&&!['attribute','rank','effect'].includes(e.type));
 const fitted=applyTemplate(card,s,card.kind==='monster'?'monster-effects':'item',keywords);fitted.elements.push(...clone(extras));return fitted;
}
