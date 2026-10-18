export function makeSurface(work,dpi,{readback=false}={}){
 const scale=dpi/25.4,canvas=document.createElement('canvas');
 canvas.width=Math.max(1,Math.round(work.w*scale));canvas.height=Math.max(1,Math.round(work.h*scale));
 const ctx=canvas.getContext('2d',{willReadFrequently:readback});ctx.setTransform(scale,0,0,scale,-work.x*scale,-work.y*scale);
 return {canvas,ctx,work,scale,dpi};
}
export function paintSurface(ctx,surface){ctx.drawImage(surface.canvas,surface.work.x,surface.work.y,surface.work.w,surface.work.h);}
export function tintSurface(source,color){
 const out=makeSurface(source.work,source.dpi);paintSurface(out.ctx,source);out.ctx.globalCompositeOperation='source-in';out.ctx.fillStyle=color;
 out.ctx.fillRect(source.work.x,source.work.y,source.work.w,source.work.h);out.ctx.globalCompositeOperation='source-over';return out;
}
export function alphaBounds(surface){
 const {canvas,work,scale}=surface,bytes=surface.ctx.getImageData(0,0,canvas.width,canvas.height).data;
 let left=canvas.width,top=canvas.height,right=-1,bottom=-1;
 for(let y=0;y<canvas.height;y++)for(let x=0;x<canvas.width;x++)if(bytes[(y*canvas.width+x)*4+3]>2){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}
 return right<0?null:{x:work.x+left/scale,y:work.y+top/scale,w:(right-left+1)/scale,h:(bottom-top+1)/scale};
}
export function alphaEdgePoints(surface){
 const {canvas,work,scale}=surface,w=canvas.width,h=canvas.height,data=surface.ctx.getImageData(0,0,w,h).data,points=[];
 const alpha=(x,y)=>x<0||y<0||x>=w||y>=h?0:data[(y*w+x)*4+3];
 for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(alpha(x,y)>48&&(alpha(x-1,y)<48||alpha(x+1,y)<48||alpha(x,y-1)<48||alpha(x,y+1)<48))points.push({x:work.x+(x+.5)/scale,y:work.y+(y+.5)/scale});
 if(points.length<=4096)return points;
 return Array.from({length:4096},(_,i)=>points[Math.floor(i*points.length/4096)]);
}
export function unionBounds(a,b){
 if(!a)return b;if(!b)return a;const x=Math.min(a.x,b.x),y=Math.min(a.y,b.y);
 return {x,y,w:Math.max(a.x+a.w,b.x+b.w)-x,h:Math.max(a.y+a.h,b.y+b.h)-y};
}
