import {makeSurface,alphaBounds,unionBounds} from './masks.js';

function occupiedColumns(surface,rect,columns){
 const {scale,work,canvas}=surface,left=Math.max(0,Math.floor((rect.x-work.x)*scale)),top=Math.max(0,Math.floor((rect.y-work.y)*scale));
 const right=Math.min(canvas.width,Math.ceil((rect.x+rect.w-work.x)*scale)),bottom=Math.min(canvas.height,Math.ceil((rect.y+rect.h-work.y)*scale)),result=Array(columns).fill(null);
 if(right<=left||bottom<=top)return result;
 const width=right-left,height=bottom-top,data=surface.ctx.getImageData(left,top,width,height).data,step=rect.w/columns;
 for(let x=0;x<width;x++){
  let first=height,last=-1;
  for(let y=0;y<height;y++)if(data[(y*width+x)*4+3]>2){first=Math.min(first,y);last=y;}
  if(last<0)continue;
  const start=Math.max(0,Math.floor((work.x+(left+x)/scale-rect.x)/step)),end=Math.min(columns-1,Math.floor((work.x+(left+x+1)/scale-rect.x-1e-8)/step));
  const y0=Math.max(rect.y,work.y+(top+first)/scale),y1=Math.min(rect.y+rect.h,work.y+(top+last+1)/scale);
  for(let i=start;i<=end;i++)result[i]={top:Math.min(result[i]?.top??y0,y0),bottom:Math.max(result[i]?.bottom??y1,y1)};
 }
 return result;
}
export function warpTextSources(source,plainMask,{rect,params,timeSec=0,dpi}){
 const {scaleX,scaleY,skewDeg,arc,wave,wavelength}=params,cx=rect.x+rect.w/2,cy=rect.y+rect.h/2,shear=Math.tan(skewDeg*Math.PI/180);
 const columns=Math.max(1,Math.ceil(rect.w*source.scale)),ink=occupiedColumns(source,rect,columns);
 let transformedBounds=null;
 const deform=(input,trackBounds=false)=>{
  const out=makeSurface(input.work,dpi),c=out.ctx,s=input.scale;
  c.translate(cx,cy);c.transform(scaleX,0,shear*scaleY,scaleY,0,0);
  for(let i=0;i<columns;i++){
   const u=i/columns,step=rect.w/columns,dy=-arc*rect.h*.7*(1-(2*u-1)**2)+wave*rect.h*.35*Math.sin(2*Math.PI*(u/wavelength+timeSec*.4));
   c.drawImage(input.canvas,(rect.x+u*rect.w-input.work.x)*s,(rect.y-input.work.y)*s,step*s,rect.h*s,u*rect.w-rect.w/2,-rect.h/2+dy,step+.008,rect.h);
   // Keep actual ink geometry even when the finite raster discards the entire glyph.
   if(trackBounds&&ink[i]){
    const x0=u*rect.w-rect.w/2,x1=x0+step+.008,y0=ink[i].top-cy+dy,y1=ink[i].bottom-cy+dy;
    const xs=[cx+scaleX*x0+shear*scaleY*y0,cx+scaleX*x1+shear*scaleY*y0,cx+scaleX*x0+shear*scaleY*y1,cx+scaleX*x1+shear*scaleY*y1];
    transformedBounds=unionBounds(transformedBounds,{x:Math.min(...xs),y:cy+scaleY*y0,w:Math.max(...xs)-Math.min(...xs),h:scaleY*(y1-y0)});
   }
  }
  return out;
 };
 const warped=deform(source,true),mask=plainMask?deform(plainMask):warped;
 return {source:warped,plainMask:mask,boundsMm:unionBounds(alphaBounds(warped),transformedBounds),verticalScale:scaleY};
}
