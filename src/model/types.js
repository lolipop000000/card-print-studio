/** Shared units: element rectangles are mm, font sizes pt, paintings px.
 * @typedef {'C'|'B'|'A'|'S'} Rank
 * @typedef {'water'|'fire'|'grass'|'neutral'|'dark'|'light'} Attribute
 * @typedef {{x:number,y:number,w:number,h:number}} RectMm
 * @typedef {{faces:number[],text:string,color:string}} DiceCondition
 * @typedef {{id:string,name:string,description:string,color:string,iconAssetId:string|null}} Keyword
 * @typedef {{keywordId:string,display:'inline'|'badge'|'both'}} KeywordReference
 * @typedef {{id:string,skillId:string,start:number,end:number}} SkillReference
 * @typedef {{fontPt?:number,fontWeight?:number,fontStyle?:'normal'|'italic',letterSpacingMm?:number,lineHeight?:number,align?:'left'|'center'|'right',underline?:boolean,color?:string,visualEffects?:Object}} SkillNameStyle
 * @typedef {{id:string,start:number,end:number,style:SkillNameStyle}} TextRange
 * @typedef {Record<string,TextRange[]>} TextRanges
 * @typedef {{id:string,name:string,effect:string,dice:DiceCondition|null,keywords?:KeywordReference[],nameKeywords?:KeywordReference[],skillReferences?:SkillReference[],nameStyle?:SkillNameStyle,textRanges?:TextRanges}} Skill
 * @typedef {{field:string,skillId?:string}} Binding
 * @typedef {{id:string,type:string,rect:RectMm,binding:Binding|null,style:Object,content?:string,assetId?:string,dice?:DiceCondition,textRanges?:TextRanges}} Element
 * @typedef {{id:string,kind:'monster'|'item',name:string,quantity:number,artAssetId:string|null,template:string,autoSkillLayout?:boolean,keywords?:KeywordReference[],nameKeywords?:KeywordReference[],textRanges?:TextRanges,elements:Element[],rank?:Rank,attribute?:Attribute,attributes?:Attribute[],baseHp?:number,hpReduction?:number,passives?:Skill[],actives?:Skill[],effect?:string}} Card
 * @typedef {{id:string,mime:string,dataUrl:string,width:number,height:number,paintingId:string|null}} Asset
 * @typedef {{id:string,width:number,height:number,activeLayerId:string,layers:Array<{id:string,name:string,visible:boolean,locked:boolean,opacity:number,blendMode?:string,png:string}>}} SavedPainting
 * @typedef {{format:'card-print-studio',version:1,name:string,settings:Object,keywords?:Keyword[],cards:Card[],back:{elements:Element[]},assets:Object,paintings:Object,print:Object}} Project
 * @typedef {{code:string,message:string,cardId?:string,elementId?:string,skillId?:string,severity?:'error'|'warning'}} Problem
 */
export const RANKS = ['C','B','A','S'];
export const ATTRIBUTES = {
  water:{name:'물',color:'#3688ba'},fire:{name:'불',color:'#d7553d'},
  grass:{name:'풀',color:'#4d8660'},neutral:{name:'무속성',color:'#777d89'},
  dark:{name:'어둠',color:'#79549e'},light:{name:'빛',color:'#aa7a21'}
};
/** Monsters require a selection; item attributes are optional and distinct from neutral. */
export function cardAttributes(card){
 if(!['monster','item'].includes(card?.kind))return [];
 const values=Array.isArray(card.attributes)?card.attributes:[card.attribute??(card.kind==='monster'?'neutral':undefined)];
 return [...new Set(values.filter(value=>typeof value==='string'&&Object.hasOwn(ATTRIBUTES,value)))];
}
export const ELEMENT_TYPES = ['text','image','rect','attribute','rank','dice','keywords','effect'];
export function newId(){return globalThis.crypto?.randomUUID?.() || 'id-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2);}
export function clone(value){if(Array.isArray(value))return value.map(clone);if(value && typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,clone(v)]));return value;}
