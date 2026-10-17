import {newCanvas} from './document.js';
import {clipRect} from './selection.js';
import {mirroredBounds,mirrorMask,softSquareTip} from './brush-masks.js';
export function createStroke(original,options,selection,start,pressure=1){
 const mask=newCanvas(original.width,original.height),ctx=mask.getContext('2d'),result=newCanvas(original.width,original.height),colored=newCanvas(original.width,original.height),colorCtx=colored.getContext('2d');
 const symmetry=options.mirrorX||options.mirrorY,mirrored=symmetry?newCanvas(original.width,original.height):null,squareTip=options.brushTip==='square'&&options.hardness<.999?softSquareTip(options.size,options.hardness):null;
 if(selection&&!symmetry){ctx.beginPath();ctx.rect(selection.x,selection.y,selection.w,selection.h);ctx.clip();}
 let last={...start},raw={...start},lastPressure=pressure,left=Infinity,top=Infinity,right=-Infinity,bottom=-Infinity,finished=false;
 const rawBounds=()=>({x:left,y:top,w:right-left,h:bottom-top});
 function stamp(point,p,target=ctx){
  const size=Math.max(.1,options.size*(options.pressureSize?Math.max(.05,p):1)),r=size/2;
  const x=options.pixelSnap?Math.floor(point.x)+.5:point.x,y=options.pixelSnap?Math.floor(point.y)+.5:point.y;
  left=Math.min(left,x-r-1);top=Math.min(top,y-r-1);right=Math.max(right,x+r+1);bottom=Math.max(bottom,y+r+1);
  target.fillStyle='#ffffff';
  if(options.pixelSnap&&options.hardness>=.999){const d=Math.max(1,Math.round(size));target.fillRect(Math.floor(x-d/2),Math.floor(y-d/2),d,d);return;}
  if(options.brushTip==='square'){
   if(squareTip)target.drawImage(squareTip,x-r,y-r,size,size);else target.fillRect(x-r,y-r,size,size);return;
  }
  if(options.hardness<.999){const gradient=target.createRadialGradient(x,y,Math.max(0,r*options.hardness),x,y,r);gradient.addColorStop(0,'#ffffff');gradient.addColorStop(1,'rgba(255,255,255,0)');target.fillStyle=gradient;}
  target.beginPath();target.arc(x,y,r,0,Math.PI*2);target.fill();
 }
 function connect(point,p,target=ctx,advance=true){
  const dx=point.x-last.x,dy=point.y-last.y,n=Math.max(1,Math.ceil(Math.hypot(dx,dy)/Math.max(.5,options.size*.12)));
  for(let i=1;i<=n;i++)stamp({x:last.x+dx*i/n,y:last.y+dy*i/n},lastPressure+(p-lastPressure)*i/n,target);
  if(advance){last={...point};lastPressure=p;}
 }
 stamp(start,pressure);
 return {
  move(point,p=1){raw={...point};const factor=1-options.smoothing*.85;connect({x:last.x+(point.x-last.x)*factor,y:last.y+(point.y-last.y)*factor},p);},
  finish(){if(!finished){connect(raw,lastPressure);finished=true;}},
  bounds(){return symmetry?mirroredBounds(rawBounds(),original.width,original.height,options,selection):clipRect(rawBounds(),original.width,original.height);},
  preview(){
   // Preview the same final smoothing tail as pointer-up, without changing the accumulated stroke.
   colorCtx.globalCompositeOperation='source-over';colorCtx.clearRect(0,0,colored.width,colored.height);colorCtx.drawImage(mask,0,0);
   if(!finished){colorCtx.save();if(selection&&!symmetry){colorCtx.beginPath();colorCtx.rect(selection.x,selection.y,selection.w,selection.h);colorCtx.clip();}connect(raw,lastPressure,colorCtx,false);colorCtx.restore();}
   const coverage=symmetry?mirrorMask(colored,mirrored,rawBounds(),options,selection):colored;
   const out=result.getContext('2d');out.clearRect(0,0,result.width,result.height);out.drawImage(original,0,0);out.globalAlpha=options.opacity;
   if(options.tool==='eraser'){out.globalCompositeOperation='destination-out';out.drawImage(coverage,0,0);}
   else{
    if(symmetry){colorCtx.globalCompositeOperation='source-over';colorCtx.clearRect(0,0,colored.width,colored.height);colorCtx.drawImage(coverage,0,0);}
    colorCtx.globalCompositeOperation='source-in';colorCtx.fillStyle=options.color;colorCtx.fillRect(0,0,colored.width,colored.height);
    if(options.preserveAlpha)out.globalCompositeOperation='source-atop';out.drawImage(colored,0,0);
   }
   out.globalAlpha=1;out.globalCompositeOperation='source-over';return result;
  }
 };
}
