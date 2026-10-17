import {newCanvas} from './document.js';
export function clipRect(rect,width,height){
 if(!rect)return null;
 const left=Math.max(0,Math.floor(Math.min(rect.x,rect.x+rect.w))),top=Math.max(0,Math.floor(Math.min(rect.y,rect.y+rect.h))),right=Math.min(width,Math.ceil(Math.max(rect.x,rect.x+rect.w))),bottom=Math.min(height,Math.ceil(Math.max(rect.y,rect.y+rect.h)));
 return right>left&&bottom>top?{x:left,y:top,w:right-left,h:bottom-top}:null;
}
export function region(canvas,rect){const c=newCanvas(rect.w,rect.h);c.getContext('2d').drawImage(canvas,rect.x,rect.y,rect.w,rect.h,0,0,rect.w,rect.h);return c;}
export function unionRect(a,b,width,height){if(!a)return clipRect(b,width,height);if(!b)return clipRect(a,width,height);const x=Math.min(a.x,b.x),y=Math.min(a.y,b.y);return clipRect({x,y,w:Math.max(a.x+a.w,b.x+b.w)-x,h:Math.max(a.y+a.h,b.y+b.h)-y},width,height);}
export function transformedImage(image,flipX,flipY){const c=newCanvas(image.width,image.height),ctx=c.getContext('2d');ctx.translate(flipX?image.width:0,flipY?image.height:0);ctx.scale(flipX?-1:1,flipY?-1:1);ctx.drawImage(image,0,0);return c;}
export function rotateImage(image){const c=newCanvas(image.height,image.width),ctx=c.getContext('2d');ctx.translate(image.height,0);ctx.rotate(Math.PI/2);ctx.drawImage(image,0,0);return c;}
