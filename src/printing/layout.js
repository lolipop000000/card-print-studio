import {orderedCards} from '../model/variants.js';

export function denseA4Print(project){
 const print={...project.print,paper:'A4',gapMm:0},s=project.settings,preferredMargin=Math.min(project.print.marginMm,5);
 const options=['portrait','landscape'].map(orientation=>{
  const [w,h]=orientation==='portrait'?[210,297]:[297,210];
  const columns=Math.floor((w+1e-8)/s.cardWidthMm),rows=Math.floor((h+1e-8)/s.cardHeightMm);
  const marginMm=Math.max(0,Math.min(preferredMargin,(w-columns*s.cardWidthMm)/2,(h-rows*s.cardHeightMm)/2));
  return {orientation,marginMm,capacity:columns*rows};
 });
 const selected=options.find(o=>o.orientation===print.orientation),other=options.find(o=>o!==selected);
 const best=other.capacity>selected.capacity?other:selected;
 if(!best.capacity)throw problem('paper-size','설정한 카드가 A4 용지에 들어가지 않아요.');
 print.orientation=best.orientation;print.marginMm=best.marginMm;return print;
}

/** All print positions are millimetres, independent of display calibration. */
export function planSheets(project){
 const cards=orderedCards(project),s=project.settings,p=project.print,portrait=p.paper==='Letter'?[215.9,279.4]:[210,297];
 const [widthMm,heightMm]=p.orientation==='portrait'?portrait:[...portrait].reverse(),w=s.cardWidthMm,h=s.cardHeightMm,g=p.gapMm,m=p.marginMm;
 const columns=Math.floor((widthMm-2*m+g+1e-8)/(w+g)),rows=Math.floor((heightMm-2*m+g+1e-8)/(h+g));
 if(columns<1||rows<1)throw problem('paper-size','설정한 카드가 용지의 여백 안에 들어가지 않아요.');
 const capacity=columns*rows,total=cards.reduce((n,c)=>n+c.quantity,0),pageCount=Math.ceil(total/capacity);
 if(!Number.isSafeInteger(total)||capacity>10000||pageCount>1000||capacity*pageCount>100000)throw problem('print-size-limit','한 번에 처리할 카드가 너무 많아요. 덱 또는 인쇄 수량을 나눠 주세요.');
 const x0=(widthMm-columns*w-(columns-1)*g)/2,y0=(heightMm-rows*h-(rows-1)*g)/2,pages=[];
 let cardIndex=0,remaining=cards[0]?.quantity??0;
 for(let pairIndex=0;pairIndex<pageCount;pairIndex++){
  const cells=[];
  for(let i=0;i<capacity;i++){
   while(remaining===0&&cardIndex<cards.length){cardIndex++;remaining=cards[cardIndex]?.quantity??0;}
   const cardId=cardIndex<cards.length?cards[cardIndex].id:null;if(cardId)remaining--;
   const row=Math.floor(i/columns),col=i%columns;cells.push({cardId,row,col,xMm:x0+col*(w+g),yMm:y0+row*(h+g),widthMm:w,heightMm:h});
  }
  pages.push({side:'front',pairIndex,cells});
  if(p.duplex){
   const mirrorX=(p.orientation==='portrait')===(p.flip==='long');
   const backs=cells.map(c=>({...c,xMm:(mirrorX?widthMm-c.xMm-w:c.xMm)+p.backOffsetXmm,yMm:(mirrorX?c.yMm:heightMm-c.yMm-h)+p.backOffsetYmm}));
   if(backs.some(c=>c.cardId&&(c.xMm<0||c.yMm<0||c.xMm+w>widthMm+1e-8||c.yMm+h>heightMm+1e-8)))throw problem('back-outside','뒷면 보정 때문에 카드가 용지 밖으로 나가요. X/Y 보정을 줄여 주세요.');
   pages.push({side:'back',pairIndex,cells:backs});
  }
 }
 return {widthMm,heightMm,columns,rows,capacity,pages};
}
function problem(code,message){return Object.assign(new Error(message),{problems:[{code,message}]});}
