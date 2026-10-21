import {PT_MM,graphemes,fitText,drawText,textFont,textLineHeight,measureTextWidth,drawTextLine} from './text.js';
import {tokenizeKeywords} from '../model/keywords.js';
import {hasTextTypography} from '../model/text-style.js';
const referenceColor='#286fa8';
function richTokens(text,keywords,skillReferences,nameSpans=[]){
 const result=[];
 const append=(run,reference,start)=>{
  const chars=graphemes(run.text.replace(/\r/g,''));let offset=0;
  for(const [i,ch] of chars.entries()){
   while(run.text[offset]==='\r')offset++;
   const from=start+offset,to=from+ch.length;offset+=ch.length;
   result.push({text:ch,keyword:run.keyword,reference,nameSpan:nameSpans.find(span=>span.start<=from&&span.end>=to),icon:i===0?run.keyword?.iconAssetId:null,leftPad:reference&&i===0?.12:0,rightPad:reference&&i===chars.length-1?.12:0});
  }
 };
 const prose=(from,to)=>{let offset=from;for(const run of tokenizeKeywords(String(text).slice(from,to),keywords)){append(run,undefined,offset);offset+=run.text.length;}};
 let at=0;for(const ref of skillReferences){prose(at,ref.start);append({text:String(text).slice(ref.start,ref.end)},ref,ref.start);at=ref.end;}
 prose(at,String(text).length);return result;
}
function tokenStyle(token,style,size,minimum,scale){
 const named=token.nameSpan?.style||{},fontPt=Math.max(minimum,named.fontPt===undefined?size:named.fontPt*scale);
 const effective={...style,...named,fontPt},bold=!!(token.keyword||token.reference)&&named.fontWeight===undefined;
 return {style:effective,fontPt,font:textFont(effective,fontPt,bold)};
}
function layoutTokens(ctx,tokens,width,style,size,minimum,scale){
 const lines=[];let items=[],w=0,y=0,currentFont='';
 const push=()=>{const heightMm=Math.max(textLineHeight(size,style),...items.map(item=>textLineHeight(item.fontPt,item.style)));lines.push({items,width:w,yMm:y,heightMm});y+=heightMm;items=[];w=0;};
 for(const token of tokens){
  if(token.text==='\n'){push();continue;}
  const measured=tokenStyle(token,style,size,minimum,scale);if(measured.font!==currentFont){ctx.font=measured.font;currentFont=measured.font;}
  const iconW=token.icon?measured.fontPt*PT_MM+.35:0,tw=ctx.measureText(token.text).width+iconW+token.leftPad+token.rightPad;
  let spacing=items.length?(measured.style.letterSpacingMm??0):0;
  if(items.length&&w+spacing+tw>width+.001){push();spacing=0;if(token.text===' '&&!token.reference)continue;}
  items.push({...token,x:w+spacing,width:tw,iconWidth:iconW,fontPt:measured.fontPt,style:measured.style,font:measured.font});w+=spacing+tw;
 }
 push();return lines;
}
function plainNameLayout(ctx,text,layout,style,nameSpans){
 const source=String(text),normalized=source.replace(/\r/g,''),offsets=[];let raw=0;
 for(let i=0;i<normalized.length;i++){while(source[raw]==='\r')raw++;offsets.push(raw++);}
 ctx.font=textFont(style,layout.fontPt);let at=0;
 const lines=layout.lines.map((legacyText,index)=>{
  const start=normalized.indexOf(legacyText,at);at=Math.max(at,start)+legacyText.length;if(normalized[at]==='\n')at++;
  let offset=0,charIndex=0;const items=graphemes(legacyText).map(ch=>{
   const x=ctx.measureText(legacyText.slice(0,offset)).width+charIndex*(style.letterSpacingMm??0),from=offsets[start+offset],to=from+ch.length;offset+=ch.length;charIndex++;
   const end=ctx.measureText(legacyText.slice(0,offset)).width+(charIndex-1)*(style.letterSpacingMm??0);
   return {text:ch,x,width:end-x,iconWidth:0,leftPad:0,rightPad:0,nameSpan:nameSpans.find(span=>span.start<=from&&span.end>=to),fontPt:layout.fontPt};
  });
  const heightMm=textLineHeight(layout.fontPt,style);return {legacyText,items,width:measureTextWidth(ctx,legacyText,style),yMm:index*heightMm,heightMm};
 });
 return {...layout,lines};
}
export function fitRichText(ctx,text,rect,style,min,keywords=[],skillReferences=[],nameSpans=[]){
 if(!keywords.length&&!skillReferences.length&&!nameSpans.some(span=>hasTextTypography(span.style))){
  const layout=fitText(ctx,text,rect,style,min);return nameSpans.length?plainNameLayout(ctx,text,layout,style,nameSpans):layout;
 }
 const tokens=richTokens(text,keywords,skillReferences,nameSpans),minimum=Math.max(.1,min),start=Math.max(minimum,style.fontPt??10);let size=start;
 for(;;){
  const lines=layoutTokens(ctx,tokens,Math.max(.01,rect.w),style,size,minimum,size/start),heightMm=lines.reduce((height,line)=>height+line.heightMm,0);
  const fits=heightMm<=rect.h+.001&&lines.every(line=>line.width<=rect.w+.001);
  if(fits||size<=minimum+.001)return {lines,fontPt:size,heightMm,fits};
  size=Math.max(minimum,size-.25);
 }
}
function drawIcon(ctx,keyword,assets,x,y,size){
 const image=assets.get(keyword.iconAssetId);if(!image)return;
 const width=image.naturalWidth||image.width,height=image.naturalHeight||image.height,scale=Math.min(size/width,size/height);
 ctx.drawImage(image,x+(size-width*scale)/2,y+(size-height*scale)/2,width*scale,height*scale);
}
const hasEffects=span=>span?.style.visualEffects?.layers.some(layer=>layer.enabled&&layer.opacity>0);
const hasOwnColor=span=>span?.style.color!==undefined||hasEffects(span);
const lineOffset=(line,rect,style)=>style.align==='center'?(rect.w-line.width)/2:style.align==='right'?rect.w-line.width:0;
const itemColor=(item,style)=>item.nameSpan?.style.color||(item.reference?referenceColor:item.keyword?.color||style.color||'#233831');
function lineParts(line){
 const parts=[];for(const item of line.items){const previous=parts.at(-1);if(previous&&previous.span===item.nameSpan){previous.items.push(item);previous.end=item.x+item.width;}else parts.push({span:item.nameSpan,items:[item],start:item.x,end:item.x+item.width});}return parts;
}
/** Each wrapped line carries its own vertical offset and measured name font size. */
export function layoutSkillNameRuns(layout,rect,style){
 const runs=[];
 for(const [lineIndex,line] of layout.lines.entries()){
  if(!line.items)continue;
  for(const part of lineParts(line))if(part.span){
   const first=part.items[0],last=part.items.at(-1),x=rect.x+lineOffset(line,rect,style)+part.start+first.iconWidth+first.leftPad;
   runs.push({id:part.span.id+':line:'+lineIndex,spanId:part.span.id,skillId:part.span.skillId,textRangeId:part.span.rangeId,keywordId:part.span.keywordId,style:part.span.style,fontPt:Math.min(...part.items.map(item=>item.fontPt??layout.fontPt)),lineIndex,items:part.items,rect:{x,y:rect.y+line.yMm,w:Math.max(.01,rect.x+lineOffset(line,rect,style)+part.end-last.rightPad-x),h:line.heightMm}});
  }
 }
 return runs;
}
const excluded=(span,lineIndex,excludeNameRun)=>span&&excludeNameRun?.spanId===span.id&&excludeNameRun.lineIndex===lineIndex;
function drawLegacyPart(ctx,line,part,x,y,style,size,color){
 // Glyph ink may extend beyond its advance at the end of a line.
 const end=part.end>=line.width-.0001?part.end+size*PT_MM:part.end;
 ctx.save();ctx.beginPath();ctx.rect(x+part.start,y-textLineHeight(size,style),Math.max(.001,end-part.start),textLineHeight(size,style)*3);ctx.clip();
 ctx.font=textFont(style,size);ctx.fillStyle=color;drawTextLine(ctx,line.legacyText,x,y,style,size);ctx.restore();
}
function drawItem(ctx,item,x,y,style,assets,{plainMask=false,icon=true}={}){
 const effective=item.style||style,size=item.fontPt??style.fontPt??10;
 ctx.font=item.font||textFont(effective,size,!!(item.keyword||item.reference));ctx.fillStyle=plainMask?'#ffffff':itemColor(item,style);
 if(icon&&item.icon)drawIcon(ctx,item.keyword,assets,x,y,size*PT_MM);
 drawTextLine(ctx,item.text,x+item.iconWidth+item.leftPad,y,effective,size);
}
export function drawRichTextNameRun(ctx,layout,run,rect,style,assets){
 const line=layout.lines[run.lineIndex],x=rect.x+lineOffset(line,rect,style),y=rect.y+line.yMm;
 ctx.save();ctx.beginPath();ctx.rect(rect.x,rect.y,rect.w,rect.h);ctx.clip();ctx.textBaseline='top';ctx.textAlign='left';
 if(line.legacyText!==undefined){const first=run.items[0],last=run.items.at(-1);drawLegacyPart(ctx,line,{start:first.x,end:last.x+last.width},x,y,style,layout.fontPt,itemColor(first,style));}
 else for(const item of run.items)drawItem(ctx,item,x+item.x,y,style,assets,{icon:false});
 ctx.restore();return {...layout,fontPt:run.fontPt??layout.fontPt};
}
export function drawRichText(ctx,text,rect,style,min,keywords,assets,{plainMask=false,skillReferences=[],skillNameSpans=[],layout:prepared,skipNameEffects=false,excludeNameRun=null}={}){
 if(!keywords.length&&!skillReferences.length&&!skillNameSpans.length)return drawText(ctx,text,rect,plainMask?{...style,color:'#ffffff'}:style,min);
 const layout=prepared||fitRichText(ctx,text,rect,style,min,keywords,skillReferences,skillNameSpans);
 ctx.save();ctx.beginPath();ctx.rect(rect.x,rect.y,rect.w,rect.h);ctx.clip();ctx.textBaseline='top';ctx.textAlign='left';
 for(const [i,line] of layout.lines.entries()){
  const offset=lineOffset(line,rect,style),y=rect.y+line.yMm;
  if(line.legacyText!==undefined){
   for(const part of lineParts(line)){
    if((plainMask&&hasOwnColor(part.span))||(skipNameEffects&&hasEffects(part.span))||excluded(part.span,i,excludeNameRun))continue;
    drawLegacyPart(ctx,line,part,rect.x+offset,y,style,layout.fontPt,plainMask?'#ffffff':itemColor(part.items[0],style));
   }
   continue;
  }
  for(const item of line.items){
   if(plainMask&&(item.keyword||item.reference||hasOwnColor(item.nameSpan))||excluded(item.nameSpan,i,excludeNameRun))continue;
   const x=rect.x+offset+item.x;
   if(item.reference){
    ctx.fillStyle='#286fa812';ctx.fillRect(x,y+.05,item.width,line.heightMm-.1);
    ctx.strokeStyle=referenceColor;ctx.lineWidth=.09;ctx.beginPath();ctx.moveTo(x,y+line.heightMm-.22);ctx.lineTo(x+item.width,y+line.heightMm-.22);ctx.stroke();
   }
   if(!skipNameEffects||!hasEffects(item.nameSpan))drawItem(ctx,item,x,y,style,assets,{plainMask});
   else if(item.icon)drawIcon(ctx,item.keyword,assets,x,y,(item.fontPt??layout.fontPt)*PT_MM);
  }
 }
 ctx.restore();return layout;
}
function badgeLayout(ctx,keywords,rect,style,size){
 ctx.font=textFont({...style,fontWeight:Math.max(style.fontWeight??400,700)},size);
 const pad=.6,gap=.45,rowHeight=textLineHeight(size,style)+.8,items=[];let x=0,y=0;
 for(const keyword of keywords){
  const icon=keyword.iconAssetId?size*PT_MM+.4:0,width=measureTextWidth(ctx,keyword.name,style)+2*pad+icon;
  if(x&&x+width>rect.w+.001){x=0;y+=rowHeight+gap;}
  items.push({keyword,x,y,width,iconWidth:icon});x+=width+gap;
 }
 const heightMm=keywords.length?y+rowHeight:0;return {items,rowHeight,heightMm,fontPt:size,fits:heightMm<=rect.h+.001&&items.every(i=>i.width<=rect.w+.001)};
}
export function fitKeywordBadges(ctx,keywords,rect,style,min){
 const minimum=Math.max(.1,min);let size=Math.max(minimum,style.fontPt??8);
 for(;;){const layout=badgeLayout(ctx,keywords,rect,style,size);if(layout.fits||size<=minimum+.001)return layout;size=Math.max(minimum,size-.25);}
}
export function layoutKeywordBadgeRuns(layout,rect){
 return layout.items.map((item,index)=>({id:'badge:'+item.keyword.id+':'+index,keywordId:item.keyword.id,keyword:item.keyword,fontPt:layout.fontPt,style:{color:item.keyword.color,visualEffects:item.keyword.visualEffects},rect:{x:rect.x+item.x+.6+item.iconWidth,y:rect.y+item.y+.4,w:Math.max(.01,item.width-1.2-item.iconWidth),h:layout.rowHeight-.8}}));
}
export function drawKeywordBadgeRun(ctx,run,rect,style){
 ctx.save();ctx.beginPath();ctx.rect(rect.x,rect.y,rect.w,rect.h);ctx.clip();ctx.textBaseline='top';ctx.textAlign='left';
 ctx.font=textFont({...style,fontWeight:Math.max(style.fontWeight??400,700)},run.fontPt);ctx.fillStyle=run.keyword.color;
 drawTextLine(ctx,run.keyword.name,run.rect.x,run.rect.y,style,run.fontPt);ctx.restore();return {fontPt:run.fontPt,fits:true};
}
export function drawKeywordBadges(ctx,keywords,rect,style,min,assets,{layout:prepared,skipNameEffects=false,labelsOnly=false,excludeKeywordRun=null}={}){
 const layout=prepared||fitKeywordBadges(ctx,keywords,rect,style,min),runs=layoutKeywordBadgeRuns(layout,rect);
 ctx.save();ctx.beginPath();ctx.rect(rect.x,rect.y,rect.w,rect.h);ctx.clip();ctx.textBaseline='top';ctx.textAlign='left';ctx.font=textFont({...style,fontWeight:Math.max(style.fontWeight??400,700)},layout.fontPt);
 for(const [index,item] of layout.items.entries()){
  const {keyword}=item,x=rect.x+item.x,y=rect.y+item.y;
  if(!labelsOnly){
  ctx.fillStyle=keyword.color+'18';ctx.strokeStyle=keyword.color;ctx.lineWidth=.18;
  ctx.beginPath();ctx.roundRect(x+.1,y+.1,Math.max(.01,Math.min(item.width,rect.w)-.2),layout.rowHeight-.2,.75);ctx.fill();ctx.stroke();
  if(item.iconWidth)drawIcon(ctx,keyword,assets,x+.6,y+.4,layout.fontPt*PT_MM);
  }
  if(excludeKeywordRun!==runs[index].id&&!(skipNameEffects&&hasEffects(runs[index])))drawKeywordBadgeRun(ctx,runs[index],rect,style);
 }
 ctx.restore();return layout;
}
