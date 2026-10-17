// Frozen pre-optimization implementation: a pixel oracle and reproducible
// benchmark, deliberately independent of the production blur implementation.
import {makeSurface} from '../src/render/effects/masks.js';

const clamp=(value,min=0,max=1)=>Math.max(min,Math.min(max,value));
const number=(value,fallback,min,max)=>clamp(Number.isFinite(value)?value:fallback,min,max);
const fresh=surface=>makeSurface({...surface.work},surface.dpi);
function rgb(value){
 let hex=/^#([\da-f]{3}|[\da-f]{6})$/i.test(value)?value:'#ffffff';
 if(hex.length===4)hex='#'+[...hex.slice(1)].map(channel=>channel+channel).join('');
 return [parseInt(hex.slice(1,3),16)/255,parseInt(hex.slice(3,5),16)/255,parseInt(hex.slice(5,7),16)/255];
}
function writePixel(bytes,at,r,g,b,alpha){
 if(alpha<.5)return;
 const inverse=255/alpha;bytes[at]=r*inverse;bytes[at+1]=g*inverse;bytes[at+2]=b*inverse;bytes[at+3]=alpha;
}
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
export function referenceBloom(surface,p={},profile=null){
 const started=profile?performance.now():0;
 let last=started;
 const mark=key=>{if(profile){const now=performance.now();profile[key]=(profile[key]||0)+now-last;last=now;}};
 const radius=number(p.radius,2,0,12),strength=number(p.strength,1.1,0,3),source=surface.ctx.getImageData(0,0,surface.canvas.width,surface.canvas.height);
 mark('read');
 if(!radius||!strength){const out=fresh(surface);out.ctx.putImageData(source,0,0);return out;}
 const threshold=number(p.threshold,.55,0,1),knee=threshold*number(p.knee,.35,0,1),color=rgb(p.color),d=source.data,energy=new Float32Array(d.length);let bright=false;
 for(let at=0;at<d.length;at+=4){
  if(!d[at+3])continue;
  const light=(.2126*d[at]+.7152*d[at+1]+.0722*d[at+2])/255;
  const transition=knee?clamp(light-threshold+knee,0,2*knee)**2/(4*knee):0,extraction=Math.max(light-threshold,transition,0)/Math.max(light,1e-8);
  if(!extraction)continue;
  const alpha=d[at+3]*extraction;energy[at]=d[at]/255*alpha*color[0];energy[at+1]=d[at+1]/255*alpha*color[1];energy[at+2]=d[at+2]/255*alpha*color[2];energy[at+3]=alpha;bright=true;
 }
 mark('extract');
 if(!bright){const out=fresh(surface);out.ctx.putImageData(source,0,0);return out;}
 const scratch=new Float32Array(d.length),blurRadius=radius*surface.scale/3;
 for(let pass=0;pass<3;pass++){
  boxPass(energy,scratch,source.width,source.height,blurRadius,true);mark('horizontal');
  boxPass(scratch,energy,source.width,source.height,blurRadius,false);mark('vertical');
 }
 const output=fresh(surface),pixels=output.ctx.createImageData(source.width,source.height),o=pixels.data;
 for(let at=0;at<d.length;at+=4){
  const originalAlpha=d[at+3],added=Math.max(0,energy[at+3])*strength,alpha=Math.min(255,originalAlpha+added);
  if(!added){o[at]=d[at];o[at+1]=d[at+1];o[at+2]=d[at+2];o[at+3]=originalAlpha;continue;}
  writePixel(o,at,d[at]*originalAlpha/255+Math.max(0,energy[at])*strength,d[at+1]*originalAlpha/255+Math.max(0,energy[at+1])*strength,d[at+2]*originalAlpha/255+Math.max(0,energy[at+2])*strength,alpha);
 }
 mark('compose');
 output.ctx.putImageData(pixels,0,0);mark('write');
 if(profile)profile.total=performance.now()-started;
 return output;
}

export function bloomFixture(dpi=300,dense=false){
 const s=makeSurface({x:-12,y:-12,w:87,h:112},dpi),c=s.ctx;
 if(dense){const g=c.createLinearGradient(-12,-12,75,100);g.addColorStop(0,'#ffffff');g.addColorStop(1,'#8ed2ff');c.fillStyle=g;c.fillRect(-12,-12,87,112);}
 else {c.fillStyle='#ffffff';c.font='bold 8px sans-serif';c.fillText('BLOOM TEST',8,13);c.globalAlpha=.45;c.fillStyle='#ffdcc0';c.fillRect(20,25,8,4);c.globalAlpha=1;c.fillStyle='#101010';c.fillRect(7,70,49,7);}
 return s;
}
