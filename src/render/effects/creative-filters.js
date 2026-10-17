import {makeSurface} from './masks.js';
import {effectRandom} from './random.js';

const clamp=(value,min=0,max=1)=>Math.max(min,Math.min(max,value));
const number=(value,fallback,min,max)=>clamp(Number.isFinite(value)?value:fallback,min,max);
const imageData=surface=>surface.ctx.getImageData(0,0,surface.canvas.width,surface.canvas.height);
const fresh=surface=>makeSurface({...surface.work},surface.dpi);
function finish(surface,pixels){const output=fresh(surface);output.ctx.putImageData(pixels,0,0);return output;}
function copy(surface,pixels=imageData(surface)){return finish(surface,pixels);}
function rgb(value){
 let hex=/^#([\da-f]{3}|[\da-f]{6})$/i.test(value)?value:'#ffffff';
 if(hex.length===4)hex='#'+[...hex.slice(1)].map(channel=>channel+channel).join('');
 return [parseInt(hex.slice(1,3),16)/255,parseInt(hex.slice(3,5),16)/255,parseInt(hex.slice(5,7),16)/255];
}
function premultiply(bytes){
 const pixels=new Float32Array(bytes.length);
 for(let at=0;at<bytes.length;at+=4){const alpha=bytes[at+3]/255;pixels[at]=bytes[at]*alpha;pixels[at+1]=bytes[at+1]*alpha;pixels[at+2]=bytes[at+2]*alpha;pixels[at+3]=bytes[at+3];}
 return pixels;
}
function writePixel(bytes,at,r,g,b,alpha){
 if(alpha<.5)return;
 const inverse=255/alpha;bytes[at]=r*inverse;bytes[at+1]=g*inverse;bytes[at+2]=b*inverse;bytes[at+3]=alpha;
}
// Pixel centers have integer sampling coordinates. Outside the work canvas is
// transparent; interpolate premultiplied color and alpha together, never RGB alone.
function sample(pixels,w,h,x,y,out){
 out[0]=out[1]=out[2]=out[3]=0;
 if(x<=-1||y<=-1||x>=w||y>=h)return;
 const left=Math.floor(x),top=Math.floor(y),fx=x-left,fy=y-top;
 for(let iy=0;iy<2;iy++){
  const py=top+iy;if(py<0||py>=h)continue;const vertical=iy?fy:1-fy;
  for(let ix=0;ix<2;ix++){
   const px=left+ix;if(px<0||px>=w)continue;
   const at=(py*w+px)*4,weight=vertical*(ix?fx:1-fx);
   out[0]+=pixels[at]*weight;out[1]+=pixels[at+1]*weight;out[2]+=pixels[at+2]*weight;out[3]+=pixels[at+3]*weight;
  }
 }
}
// Three fractional box passes approximate a smooth, finite-support Gaussian.
// Sliding sums keep the cost linear in pixels even at the maximum print radius.
function boxPass(input,output,w,h,radius,horizontal){
 const radiusInt=Math.floor(radius),edge=radius-radiusInt,denominator=2*radiusInt+1+2*edge,length=horizontal?w:h,lines=horizontal?h:w,step=horizontal?4:w*4;
 for(let line=0;line<lines;line++){
  const base=horizontal?line*w*4:line*4;let r=0,g=0,b=0,a=0;
  for(let pos=0;pos<=Math.min(radiusInt,length-1);pos++){
   const at=base+pos*step;r+=input[at];g+=input[at+1];b+=input[at+2];a+=input[at+3];
  }
  for(let pos=0;pos<length;pos++){
   const at=base+pos*step,left=pos-radiusInt-1,right=pos+radiusInt+1;let er=0,eg=0,eb=0,ea=0;
   if(edge){
    if(left>=0){const i=base+left*step;er+=input[i];eg+=input[i+1];eb+=input[i+2];ea+=input[i+3];}
    if(right<length){const i=base+right*step;er+=input[i];eg+=input[i+1];eb+=input[i+2];ea+=input[i+3];}
   }
   output[at]=(r+er*edge)/denominator;output[at+1]=(g+eg*edge)/denominator;output[at+2]=(b+eb*edge)/denominator;output[at+3]=(a+ea*edge)/denominator;
   if(right<length){const i=base+right*step;r+=input[i];g+=input[i+1];b+=input[i+2];a+=input[i+3];}
   const remove=pos-radiusInt;
   if(remove>=0){const i=base+remove*step;r-=input[i];g-=input[i+1];b-=input[i+2];a-=input[i+3];}
  }
 }
}
function bloom(surface,p){
 const radius=number(p.radius,2,0,12),strength=number(p.strength,1.1,0,3),source=imageData(surface);
 if(!radius||!strength)return copy(surface,source);
 const threshold=number(p.threshold,.55,0,1),knee=threshold*number(p.knee,.35,0,1),color=rgb(p.color),d=source.data,energy=new Float32Array(d.length);let bright=false;
 for(let at=0;at<d.length;at+=4){
  if(!d[at+3])continue;
  const light=(.2126*d[at]+.7152*d[at+1]+.0722*d[at+2])/255;
  const transition=knee?clamp(light-threshold+knee,0,2*knee)**2/(4*knee):0,extraction=Math.max(light-threshold,transition,0)/Math.max(light,1e-8);
  if(!extraction)continue;
  // Threshold unassociated RGB, then attenuate emitted light by source coverage.
  const alpha=d[at+3]*extraction;energy[at]=d[at]/255*alpha*color[0];energy[at+1]=d[at+1]/255*alpha*color[1];energy[at+2]=d[at+2]/255*alpha*color[2];energy[at+3]=alpha;bright=true;
 }
 if(!bright)return copy(surface,source);
 const scratch=new Float32Array(d.length),blurRadius=radius*surface.scale/3;
 for(let pass=0;pass<3;pass++){boxPass(energy,scratch,source.width,source.height,blurRadius,true);boxPass(scratch,energy,source.width,source.height,blurRadius,false);}
 const output=fresh(surface),pixels=output.ctx.createImageData(source.width,source.height),o=pixels.data;
 for(let at=0;at<d.length;at+=4){
  const originalAlpha=d[at+3],added=Math.max(0,energy[at+3])*strength,alpha=Math.min(255,originalAlpha+added);
  if(!added){o[at]=d[at];o[at+1]=d[at+1];o[at+2]=d[at+2];o[at+3]=originalAlpha;continue;}
  writePixel(o,at,d[at]*originalAlpha/255+Math.max(0,energy[at])*strength,d[at+1]*originalAlpha/255+Math.max(0,energy[at+1])*strength,d[at+2]*originalAlpha/255+Math.max(0,energy[at+2])*strength,alpha);
 }
 output.ctx.putImageData(pixels,0,0);return output;
}
function directionalBlur(surface,p){
 const distance=number(p.distance,1,0,8)*surface.scale,strength=number(p.strength,1,0,1),source=imageData(surface);
 if(!distance||!strength)return copy(surface,source);
 const samples=Math.round(number(p.samples,9,3,25)),angle=number(p.angle,0,-180,180)*Math.PI/180,dx=Math.cos(angle)*distance,dy=Math.sin(angle)*distance,shifts=Array.from({length:samples},(_,i)=>[(i/(samples-1)-.5)*dx,(i/(samples-1)-.5)*dy]);
 const output=fresh(surface),pixels=output.ctx.createImageData(source.width,source.height),d=premultiply(source.data),o=pixels.data,tmp=new Float64Array(4),blurWeight=strength/samples,baseWeight=1-strength,w=source.width,h=source.height;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const at=(y*w+x)*4;let r=0,g=0,b=0,a=0;
  for(const [sx,sy] of shifts){sample(d,w,h,x-sx,y-sy,tmp);r+=tmp[0];g+=tmp[1];b+=tmp[2];a+=tmp[3];}
  writePixel(o,at,d[at]*baseWeight+r*blurWeight,d[at+1]*baseWeight+g*blurWeight,d[at+2]*baseWeight+b*blurWeight,d[at+3]*baseWeight+a*blurWeight);
 }
 output.ctx.putImageData(pixels,0,0);return output;
}
function displacement(surface,layer,p,timeSec,seed){
 const amount=number(p.amount,.45,0,3)*surface.scale,source=imageData(surface);if(!amount)return copy(surface,source);
 const wavelength=number(p.wavelength,4,.5,20),axis=['x','y','both'].includes(p.axis)?p.axis:'both',speed=number(layer.motion?.speed,1,.1,3),time=layer.motion?.enabled?(Number.isFinite(timeSec)?timeSec:1.2)*speed:0,id=layer.id||'displacement',tau=Math.PI*2;
 const phaseX=effectRandom(seed,id,0,1)*tau,phaseY=effectRandom(seed,id,0,2)*tau,w=source.width,h=source.height,xShifts=new Float32Array(h),yShifts=new Float32Array(w);
 // The saved seed fixes each wave's phase. Continuous logical time advances it
 // without global wrapping, and work coordinates make cropped accumulators agree.
 for(let y=0;y<h;y++)if(axis!=='y')xShifts[y]=Math.sin((surface.work.y+(y+.5)/surface.scale)*tau/wavelength+phaseX+time*1.7)*amount;
 for(let x=0;x<w;x++)if(axis!=='x')yShifts[x]=Math.sin((surface.work.x+(x+.5)/surface.scale)*tau/wavelength+phaseY-time*1.3)*amount;
 const output=fresh(surface),pixels=output.ctx.createImageData(w,h),d=premultiply(source.data),o=pixels.data,tmp=new Float64Array(4);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const at=(y*w+x)*4;sample(d,w,h,x-xShifts[y],y-yShifts[x],tmp);writePixel(o,at,tmp[0],tmp[1],tmp[2],tmp[3]);
 }
 output.ctx.putImageData(pixels,0,0);return output;
}

/** Independent full-accumulator filters. The compositor owns opacity, scope,
 * protection and clipping. Unknown kinds let the dispatch chain try its next family. */
export function applyCreativeFilter(surface,layer,{rect=surface.work,timeSec=1.2,seed=1}={}){
 const p=layer.params||{};
 switch(layer.kind){
  case 'bloom':return bloom(surface,p);
  case 'directionalBlur':return directionalBlur(surface,p);
  case 'displacement':return displacement(surface,layer,p,timeSec,seed);
  default:return null;
 }
}
