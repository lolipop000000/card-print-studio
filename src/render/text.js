export const PT_MM=25.4/72;
const segmenter=new Intl.Segmenter('ko',{granularity:'grapheme'});
export function graphemes(text){return Array.from(segmenter.segment(String(text)),s=>s.segment);}
export const textFont=(style,size=style.fontPt??10,bold=false)=>(style.fontStyle==='italic'?'italic ':'')+Math.max(style.fontWeight??400,bold?700:0)+' '+(size*PT_MM)+'px CardStudio';
export const textLineHeight=(font,style={})=>font*PT_MM*(style.lineHeight??1.22);
export const measureTextWidth=(ctx,text,style={})=>ctx.measureText(text).width+Math.max(0,graphemes(text).length-1)*(style.letterSpacingMm??0);
/** The left-edge primitive is shared by measurement-compatible preview and print text. */
export function drawTextLine(ctx,text,x,y,style={},fontPt=style.fontPt??10){
 const spacing=style.letterSpacingMm??0;
 if(!spacing)ctx.fillText(text,x,y);
 else {let prefix='',index=0;for(const ch of graphemes(text)){ctx.fillText(ch,x+ctx.measureText(prefix).width+index*spacing,y);prefix+=ch;index++;}}
 if(style.underline&&text){
  ctx.save();ctx.strokeStyle=ctx.fillStyle;ctx.lineWidth=Math.max(.07,fontPt*PT_MM*.045);
  const offset=Math.min(textLineHeight(fontPt,style)-ctx.lineWidth,fontPt*PT_MM*1.05);
  ctx.beginPath();ctx.moveTo(x,y+offset);ctx.lineTo(x+measureTextWidth(ctx,text,style),y+offset);ctx.stroke();ctx.restore();
 }
}
export function wrapText(ctx,text,width,style={}){
 const lines=[];
 for(const paragraph of String(text).replace(/\r/g,'').split('\n')){
  let line='';
  for(const ch of graphemes(paragraph)){if(line&&measureTextWidth(ctx,line+ch,style)>width){lines.push(line.trimEnd());line=ch===' '?'':ch;}else line+=ch;}
  lines.push(line);
 }
 return lines;
}
export function fitText(ctx,text,rect,style,minFontPt){
 const minimum=Math.max(.1,minFontPt),start=Math.max(minimum,style.fontPt??10);let size=start,lines=[];
 for(;;){
  ctx.font=textFont(style,size);lines=wrapText(ctx,text,Math.max(.01,rect.w),style);const heightMm=lines.length*textLineHeight(size,style);
  const fits=lines.every(l=>measureTextWidth(ctx,l,style)<=rect.w+.001)&&heightMm<=rect.h+.001;
  if(fits||size<=minimum+.001)return {lines,fontPt:size,heightMm,fits};
  size=Math.max(minimum,size-.25);
 }
}
export function drawText(ctx,text,rect,style,minFontPt){
 const layout=fitText(ctx,text,rect,style,minFontPt);ctx.save();ctx.beginPath();ctx.rect(rect.x,rect.y,rect.w,rect.h);ctx.clip();
 ctx.font=textFont(style,layout.fontPt);ctx.fillStyle=style.color||'#233831';ctx.textBaseline='top';ctx.textAlign='left';
 layout.lines.forEach((line,i)=>{
  const width=measureTextWidth(ctx,line,style),x=rect.x+(style.align==='center'?(rect.w-width)/2:style.align==='right'?rect.w-width:0);
  drawTextLine(ctx,line,x,rect.y+i*textLineHeight(layout.fontPt,style),style,layout.fontPt);
 });
 ctx.restore();return layout;
}
