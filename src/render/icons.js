import {ATTRIBUTES} from '../model/types.js';
import {drawText,fitText,PT_MM} from './text.js';
export function drawAttributeIcon(ctx,attribute,rect,color,kind){
 const {x,y,w,h}=rect;ctx.save();ctx.translate(x,y);ctx.scale(w/24,h/24);ctx.strokeStyle=color||ATTRIBUTES[attribute]?.color||'#6b7370';ctx.fillStyle=ctx.strokeStyle;ctx.lineWidth=1.7;ctx.lineJoin='round';
 ctx.beginPath();ctx.arc(12,12,11,0,Math.PI*2);ctx.fillStyle='#fff';ctx.fill();ctx.stroke();ctx.fillStyle=ctx.strokeStyle;ctx.translate(4.5,4.5);ctx.scale(15/24,15/24);
 const path=(points)=>{ctx.beginPath();for(const [i,p] of points.entries())i?ctx.lineTo(...p):ctx.moveTo(...p);ctx.closePath();ctx.fill();};
 if(kind==='item'){
  ctx.beginPath();ctx.roundRect(6,11,12,12,1.6);ctx.fill();
  ctx.fillStyle='#fff';ctx.beginPath();ctx.ellipse(12,11,6,1.8,0,0,Math.PI*2);ctx.fill();ctx.stroke();
  ctx.beginPath();ctx.moveTo(12,11);ctx.lineTo(12,7);ctx.stroke();
  ctx.fillStyle=ctx.strokeStyle;ctx.beginPath();ctx.moveTo(12,0);ctx.bezierCurveTo(7,4,9,8,12,8);ctx.bezierCurveTo(16,8,17,4,12,0);ctx.fill();
 }else if(attribute==='water'){for(const [x,y,s] of [[9,2,1],[3,9,.65],[16,10,.65]]){ctx.save();ctx.translate(x,y);ctx.scale(s,s);ctx.beginPath();ctx.moveTo(3,0);ctx.bezierCurveTo(3,3,0,5,0,8);ctx.bezierCurveTo(0,13,7,13,7,8);ctx.bezierCurveTo(7,5,4,3,3,0);ctx.fill();ctx.restore();}}
 else if(attribute==='fire'){ctx.beginPath();ctx.moveTo(11,1);ctx.bezierCurveTo(16,6,10,9,18,7);ctx.bezierCurveTo(24,17,17,23,11,23);ctx.bezierCurveTo(1,23,1,14,6,8);ctx.bezierCurveTo(5,14,9,14,11,1);ctx.fill();ctx.fillStyle='#fff7d9';path([[12,11],[16,20],[8,20]]);}
 else if(attribute==='grass'){path([[11,23],[6,6],[11,10],[13,1],[17,15],[22,9],[18,23]]);ctx.strokeStyle='#376548';ctx.beginPath();ctx.moveTo(2,23);ctx.lineTo(22,23);ctx.stroke();}
 else if(attribute==='neutral'){ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(12,12,9,0,Math.PI*2);ctx.fill();ctx.stroke();}
 else if(attribute==='dark'){ctx.beginPath();ctx.moveTo(1,12);ctx.quadraticCurveTo(12,-1,23,12);ctx.quadraticCurveTo(12,25,1,12);ctx.stroke();ctx.beginPath();ctx.arc(12,12,4.5,0,Math.PI*2);ctx.fill();ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(13,10,1.3,0,Math.PI*2);ctx.fill();}
 else {path([[12,0],[15,9],[24,12],[15,15],[12,24],[9,15],[0,12],[9,9]]);ctx.fillStyle='#fff9cf';path([[12,5],[13,11],[19,12],[13,13],[12,19],[11,13],[5,12],[11,11]]);}
 ctx.restore();
}
export function drawAttribute(ctx,attribute,rect,style,min,kind){
 const gap=.4,iconH=Math.max(1,rect.h-4);drawAttributeIcon(ctx,attribute,{x:rect.x+(rect.w-iconH)/2,y:rect.y,w:iconH,h:iconH},kind==='item'?undefined:style.color,kind);
 return drawText(ctx,ATTRIBUTES[attribute]?.name||(kind==='item'?'아이템':''),{x:rect.x,y:rect.y+iconH+gap,w:rect.w,h:Math.max(.1,rect.h-iconH-gap)},{...style,fontPt:style.fontPt??7,align:'center'},min);
}
/** Wide template rows retain names; small custom boxes retain all symbols. */
export function drawAttributes(ctx,attributes,rect,style,min,kind){
 if(!attributes.length)return kind==='item'?drawAttribute(ctx,undefined,rect,style,min,kind):{fits:true};
 if(attributes.length===1)return drawAttribute(ctx,attributes[0],rect,style,min,kind);
 const cellWidth=rect.w/attributes.length,gap=.4,labelHeight=Math.max(min,style.fontPt??7)*PT_MM*1.22;
 const iconSize=Math.min(5,cellWidth-.5,rect.h-labelHeight-gap),labelStyle={...style,fontPt:Math.max(min,style.fontPt??7),align:'center'};
 const labelsFit=iconSize>=3&&attributes.every(attribute=>fitText(ctx,ATTRIBUTES[attribute].name,{w:cellWidth,h:labelHeight},labelStyle,min).fits);
 ctx.save();ctx.beginPath();ctx.rect(rect.x,rect.y,rect.w,rect.h);ctx.clip();
 if(labelsFit){
  const results=attributes.map((attribute,index)=>{
   const x=rect.x+index*cellWidth;
   drawAttributeIcon(ctx,attribute,{x:x+(cellWidth-iconSize)/2,y:rect.y,w:iconSize,h:iconSize},undefined,kind);
   return drawText(ctx,ATTRIBUTES[attribute].name,{x,y:rect.y+iconSize+gap,w:cellWidth,h:labelHeight},labelStyle,min);
  });
  ctx.restore();return {fits:results.every(result=>result.fits)};
 }
 let layout={columns:1,rows:attributes.length,size:0};
 for(let columns=1;columns<=attributes.length;columns++){
  const rows=Math.ceil(attributes.length/columns),size=Math.min(rect.w/columns,rect.h/rows)-.25;
  if(size>layout.size)layout={columns,rows,size};
 }
 const size=Math.max(.01,layout.size),cellW=rect.w/layout.columns,cellH=rect.h/layout.rows;
 for(const [index,attribute] of attributes.entries())drawAttributeIcon(ctx,attribute,{x:rect.x+(index%layout.columns)*cellW+(cellW-size)/2,y:rect.y+Math.floor(index/layout.columns)*cellH+(cellH-size)/2,w:size,h:size},undefined,kind);
 ctx.restore();return {fits:true};
}
const PIPS={1:[[.5,.5]],2:[[.25,.25],[.75,.75]],3:[[.25,.25],[.5,.5],[.75,.75]],4:[[.25,.25],[.75,.25],[.25,.75],[.75,.75]],5:[[.25,.25],[.75,.25],[.5,.5],[.25,.75],[.75,.75]],6:[[.25,.25],[.75,.25],[.25,.5],[.75,.5],[.25,.75],[.75,.75]]};
export function drawDie(ctx,face,x,y,size,color,selected){
 ctx.fillStyle=selected?color:'#fff';ctx.strokeStyle=selected===false?'#c3cdc5':color;ctx.lineWidth=.22;ctx.beginPath();ctx.roundRect(x,y,size,size,size*.18);ctx.fill();ctx.stroke();ctx.fillStyle=selected?'#fff':selected===false?'#a6b3aa':color;
 for(const [px,py] of PIPS[face]||[]){ctx.beginPath();ctx.arc(x+px*size,y+py*size,size*.073,0,Math.PI*2);ctx.fill();}
}
const DICE_PAD=.3,DICE_GAP=.25,DICE_SIZE=2.2,DICE_MIN=1.25,LABEL_GAP=.45;
const gridSize=size=>({w:2*size+DICE_GAP+2*DICE_PAD,h:3*size+2*DICE_GAP+2*DICE_PAD});
export function diceContentHeight(ctx,dice,width,fontPt){
 const grid=gridSize(DICE_SIZE);
 if(!dice.text)return grid.h;
 const textWidth=Math.max(.01,width-grid.w-LABEL_GAP-DICE_PAD);
 const label=fitText(ctx,dice.text,{w:textWidth,h:Infinity},{fontPt},fontPt);
 return Math.max(grid.h,label.lines.length*fontPt*PT_MM*1.22+2*DICE_PAD);
}
export function drawDice(ctx,dice,rect,style,min){
 ctx.save();ctx.beginPath();ctx.rect(rect.x,rect.y,rect.w,rect.h);ctx.clip();
 const color=dice.color||style.color||'#49695a';
 let size=Math.min(DICE_SIZE,(rect.h-2*DICE_PAD-2*DICE_GAP)/3,(rect.w-2*DICE_PAD-DICE_GAP)/2);
 if(size<DICE_MIN-.001){ctx.restore();return {fits:false};}
 const labelStyle={...style,color,fontPt:style.fontPt??7.5};
 const textRect=()=>{const grid=gridSize(size);return {x:rect.x+grid.w+LABEL_GAP,y:rect.y+DICE_PAD,w:Math.max(.01,rect.w-grid.w-LABEL_GAP-DICE_PAD),h:Math.max(.01,rect.h-2*DICE_PAD)};};
 if(dice.text)for(;;){
  if(fitText(ctx,dice.text,textRect(),labelStyle,min).fits||size<=DICE_MIN+.001)break;
  size=Math.max(DICE_MIN,size-.1);
 }
 const grid=gridSize(size);
 ctx.fillStyle=style.fill||'#ecf1ed';ctx.strokeStyle=color;ctx.lineWidth=.15;
 ctx.beginPath();ctx.roundRect(rect.x+.05,rect.y+.05,grid.w-.1,grid.h-.1,.6);ctx.fill();ctx.stroke();
 for(let face=1;face<=6;face++){
  const x=rect.x+DICE_PAD+((face-1)%2)*(size+DICE_GAP),y=rect.y+DICE_PAD+Math.floor((face-1)/2)*(size+DICE_GAP);
  drawDie(ctx,face,x,y,size,color,dice.faces.includes(face));
 }
 const result=dice.text?drawText(ctx,dice.text,textRect(),labelStyle,min):{fits:true};
 ctx.restore();return {...result,fits:result.fits&&dice.faces.length>0};
}
