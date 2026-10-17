import {newCanvas} from './document.js';
import {clipRect,unionRect} from './selection.js';

const flips=options=>[[false,false],...(options.mirrorX?[[true,false]]:[]),...(options.mirrorY?[[false,true]]:[]),...(options.mirrorX&&options.mirrorY?[[true,true]]:[])];
const reflected=(rect,width,height,flipX,flipY)=>({x:flipX?width-rect.x-rect.w:rect.x,y:flipY?height-rect.y-rect.h:rect.y,w:rect.w,h:rect.h});

export function mirroredBounds(rect,width,height,options,selection){
 const source=clipRect(rect,width,height);if(!source)return null;
 let bounds=null;for(const [flipX,flipY] of flips(options))bounds=unionRect(bounds,reflected(source,width,height,flipX,flipY),width,height);
 if(!selection)return bounds;
 const x=Math.max(bounds.x,selection.x),y=Math.max(bounds.y,selection.y),right=Math.min(bounds.x+bounds.w,selection.x+selection.w),bottom=Math.min(bounds.y+bounds.h,selection.y+selection.h);
 return right>x&&bottom>y?{x,y,w:right-x,h:bottom-y}:null;
}

/** Reflect a single stroke mask. Overlap uses maximum coverage, so the center is not painted twice. */
export function mirrorMask(source,target,bounds,options,selection){
 const width=source.width,height=source.height,rect=clipRect(bounds,width,height),out=target.getContext('2d');out.clearRect(0,0,width,height);
 if(!rect)return target;
 const pixels=source.getContext('2d').getImageData(rect.x,rect.y,rect.w,rect.h).data;
 for(const [flipX,flipY] of flips(options)){
  const dest=reflected(rect,width,height,flipX,flipY),data=out.getImageData(dest.x,dest.y,dest.w,dest.h);
  for(let y=0;y<dest.h;y++)for(let x=0;x<dest.w;x++){
   const xx=dest.x+x,yy=dest.y+y;if(selection&&(xx<selection.x||yy<selection.y||xx>=selection.x+selection.w||yy>=selection.y+selection.h))continue;
   const from=((flipY?dest.h-1-y:y)*rect.w+(flipX?dest.w-1-x:x))*4+3,to=(y*dest.w+x)*4,alpha=pixels[from];
   if(alpha>data.data[to+3]){data.data[to]=255;data.data[to+1]=255;data.data[to+2]=255;data.data[to+3]=alpha;}
  }
  out.putImageData(data,dest.x,dest.y);
 }
 return target;
}

export function softSquareTip(size,hardness){
 const side=Math.max(1,Math.ceil(size)),tip=newCanvas(side,side),ctx=tip.getContext('2d'),edge=(1-hardness)/2;
 const feather=(x,y)=>{const g=ctx.createLinearGradient(0,0,x,y);g.addColorStop(0,'rgba(255,255,255,0)');g.addColorStop(edge,'#fff');g.addColorStop(1-edge,'#fff');g.addColorStop(1,'rgba(255,255,255,0)');return g;};
 ctx.fillStyle=feather(side,0);ctx.fillRect(0,0,side,side);ctx.globalCompositeOperation='destination-in';ctx.fillStyle=feather(0,side);ctx.fillRect(0,0,side,side);return tip;
}
