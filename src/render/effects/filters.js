import {makeSurface} from './masks.js';
import {effectRandom,fract} from './random.js';
import {applyMaterialFilter} from './material-filters.js';
import {applyCreativeFilter} from './creative-filters.js';
import {applyGpuFilter} from './gpu-filters.js';
import {recordCpuEffect,recordCanvasEffect} from './gpu-runtime.js';

const clamp=(value,min=0,max=1)=>Math.max(min,Math.min(max,value));
const number=(value,fallback)=>Number.isFinite(value)?value:fallback;
const imageData=surface=>surface.ctx.getImageData(0,0,surface.canvas.width,surface.canvas.height);
function fresh(surface){return makeSurface({...surface.work},surface.dpi);}
function drawPixels(target,source,{blur=0,x=0,y=0,alpha=1,operation='source-over'}={}){
 const c=target.ctx;c.save();c.setTransform(1,0,0,1,0,0);c.globalAlpha=clamp(alpha);c.globalCompositeOperation=operation;
 if(blur>0)c.filter=`blur(${blur}px)`;
 c.drawImage(source.canvas,x,y);c.restore();
}
function copy(surface){const result=fresh(surface);drawPixels(result,surface);return result;}
function tinted(surface,color){
 const result=copy(surface),c=result.ctx;c.save();c.setTransform(1,0,0,1,0,0);c.globalCompositeOperation='source-in';c.fillStyle=color;c.fillRect(0,0,result.canvas.width,result.canvas.height);c.restore();return result;
}
function rgb(color,fallback='#ffb24b'){
 const hex=/^#[\da-f]{6}$/i.test(color)?color:fallback;return [parseInt(hex.slice(1,3),16),parseInt(hex.slice(3,5),16),parseInt(hex.slice(5,7),16)];
}
function timeFor(layer,timeSec){return layer.motion?.enabled?timeSec*number(layer.motion.speed,1):1.2;}

// The exact squared Euclidean distance transform takes two linear passes. Its
// circular footprint keeps thick outlines and erosion independent of pixel axes.
function distances(bytes,w,h,toOpaque){
 const result=new Float32Array(w*h),limit=Math.max(w,h),line=new Float64Array(limit),out=new Float64Array(limit),sites=new Int32Array(limit),cuts=new Float64Array(limit+1),far=1e12;
 function transform(length){
  let k=0;sites[0]=0;cuts[0]=-Infinity;cuts[1]=Infinity;
  for(let q=1;q<length;q++){
   let s=((line[q]+q*q)-(line[sites[k]]+sites[k]*sites[k]))/(2*(q-sites[k]));
   while(s<=cuts[k]){k--;s=((line[q]+q*q)-(line[sites[k]]+sites[k]*sites[k]))/(2*(q-sites[k]));}
   sites[++k]=q;cuts[k]=s;cuts[k+1]=Infinity;
  }
  k=0;for(let q=0;q<length;q++){while(cuts[k+1]<q)k++;const d=q-sites[k];out[q]=d*d+line[sites[k]];}
 }
 for(let y=0;y<h;y++){
  for(let x=0;x<w;x++)line[x]=((bytes[(y*w+x)*4+3]>0)===toOpaque)?0:far;
  transform(w);result.set(out.subarray(0,w),y*w);
 }
 for(let x=0;x<w;x++){
  for(let y=0;y<h;y++)line[y]=result[y*w+x];transform(h);
  for(let y=0;y<h;y++)result[y*w+x]=toOpaque?out[y]:Math.min(out[y],(x+1)**2,(w-x)**2,(y+1)**2,(h-y)**2);
 }
 return result;
}
// Grayscale dilation by a circular footprint. A full-coverage row uses a
// sliding maximum; only the one-pixel radial shell needs weighted samples.
// Work is linear in the occupied row spans times radius, not disk area.
function dilateAlpha(bytes,w,h,radius){
 const alpha=new Uint8Array(w*h),dilated=new Float32Array(w*h),left=new Int32Array(h),right=new Int32Array(h),queue=new Int32Array(w);
 left.fill(w);right.fill(-1);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const i=y*w+x,value=bytes[i*4+3];alpha[i]=value;
  if(value){left[y]=Math.min(left[y],x);right[y]=x;}
 }
 const slices=[],extent=radius+1;
 for(let dy=0;dy<=Math.min(h-1,Math.ceil(extent)-1);dy++){
  const full=dy<=radius?Math.min(w-1,Math.floor(Math.sqrt(Math.max(0,radius*radius-dy*dy)))):-1;
  const outer=Math.min(w-1,Math.ceil(Math.sqrt(extent*extent-dy*dy))-1),shell=[];
  for(let dx=full+1;dx<=outer;dx++){const weight=clamp(extent-Math.hypot(dx,dy));if(weight>0)shell.push([dx,weight]);}
  slices.push({dy,full,shell});
 }
 for(let y=0;y<h;y++){
  if(right[y]<0)continue;
  const row=y*w,start=left[y],end=right[y];
  for(const {dy,full,shell} of slices){
   const plus=y+dy<h?(y+dy)*w:-1,minus=dy&&y-dy>=0?(y-dy)*w:-1;
   if(plus<0&&minus<0)continue;
   if(full>=0){
    let head=0,tail=0,enter=start;
    for(let x=Math.max(0,start-full),last=Math.min(w-1,end+full);x<=last;x++){
     for(const limit=Math.min(end,x+full);enter<=limit;enter++){
      const value=alpha[row+enter];while(head<tail&&alpha[row+queue[tail-1]]<=value)tail--;
      queue[tail++]=enter;
     }
     while(head<tail&&queue[head]<x-full)head++;
     const value=head<tail?alpha[row+queue[head]]:0;
     if(plus>=0&&value>dilated[plus+x])dilated[plus+x]=value;
     if(minus>=0&&value>dilated[minus+x])dilated[minus+x]=value;
    }
   }
   for(const [dx,weight] of shell)for(let x=start;x<=end;x++){
    const value=alpha[row+x]*weight;if(!value)continue;
    const rightX=x+dx,leftX=x-dx;
    if(rightX<w){
     if(plus>=0&&value>dilated[plus+rightX])dilated[plus+rightX]=value;
     if(minus>=0&&value>dilated[minus+rightX])dilated[minus+rightX]=value;
    }
    if(dx&&leftX>=0){
     if(plus>=0&&value>dilated[plus+leftX])dilated[plus+leftX]=value;
     if(minus>=0&&value>dilated[minus+leftX])dilated[minus+leftX]=value;
    }
   }
  }
 }
 return dilated;
}
function outline(surface,p){
 const radius=number(p.width,.5)*surface.scale;if(radius<=0)return copy(surface);
 const output=fresh(surface),source=imageData(surface),pixels=output.ctx.createImageData(source.width,source.height),dilated=dilateAlpha(source.data,source.width,source.height,radius),color=rgb(p.color);
 for(let i=0;i<dilated.length;i++){
  const at=i*4,original=source.data[at+3],alpha=Math.max(original,Math.round(dilated[i]));if(!alpha)continue;
  // Add only the expanded alpha in premultiplied color. A complete tinted
  // underfill would make a translucent source more opaque even at its center.
  const added=alpha-original;
  for(let channel=0;channel<3;channel++)pixels.data[at+channel]=added?(source.data[at+channel]*original+color[channel]*added)/alpha:source.data[at+channel];
  pixels.data[at+3]=alpha;
 }
 output.ctx.putImageData(pixels,0,0);return output;
}
function glow(surface,layer,p,timeSec){
 const radius=number(p.radius,2)*surface.scale,strength=number(p.strength,1);if(radius<=0||strength<=0)return copy(surface);
 const output=fresh(surface),tint=tinted(surface,p.color||'#ffb24b'),pulse=layer.motion?.enabled ? .85+.15*Math.sin(timeFor(layer,timeSec)*2) : 1;
 drawPixels(output,tint,{blur:radius,alpha:strength*pulse*.55});drawPixels(output,tint,{blur:radius/3,alpha:strength*pulse*.8});
 // Bloom contributes outside the current alpha; the unchanged source sits above it.
 drawPixels(output,surface,{operation:'destination-out'});drawPixels(output,surface);return output;
}
function shadow(surface,p){
 const blur=Math.max(0,number(p.blur,1.5))*surface.scale,x=number(p.offsetX,1)*surface.scale,y=number(p.offsetY,1)*surface.scale;
 if(!blur&&!x&&!y)return copy(surface);
 const output=fresh(surface);drawPixels(output,tinted(surface,p.color||'#152032'),{blur,x,y});drawPixels(output,surface);return output;
}
function colorOverlay(surface,layer,p,rect,timeSec){
 const strength=clamp(number(p.strength,layer.kind==='gradient'?1:.8));if(!strength)return copy(surface);
 const output=copy(surface),c=output.ctx,a=number(p.angle,layer.kind==='gradient'?90:-25)*Math.PI/180,ux=Math.cos(a),uy=Math.sin(a),t=timeFor(layer,timeSec);let gradient;
 if(layer.kind==='gradient'){
  const flow=layer.motion?.enabled?Math.sin(t*.8)*rect.w*.15:0,cx=rect.x+rect.w/2+flow,cy=rect.y+rect.h/2,d=Math.max(.001,(Math.abs(ux)*rect.w+Math.abs(uy)*rect.h)/2);
  gradient=c.createLinearGradient(cx-ux*d,cy-uy*d,cx+ux*d,cy+uy*d);gradient.addColorStop(0,p.color||'#fff1a8');gradient.addColorStop(1,p.color2||'#ed6039');
 }else{
  const x=rect.x+(fract(t/4)*1.6-.3)*rect.w,y=rect.y+rect.h/2,d=Math.max(.001,rect.w*number(p.width,.3)),color=rgb(p.color,'#ffffff');
  gradient=c.createLinearGradient(x-ux*d,y-uy*d,x+ux*d,y+uy*d);gradient.addColorStop(0,`rgba(${color},0)`);gradient.addColorStop(.5,`rgb(${color})`);gradient.addColorStop(1,`rgba(${color},0)`);
 }
 c.save();c.globalCompositeOperation='source-atop';c.globalAlpha=strength;c.fillStyle=gradient;c.fillRect(surface.work.x,surface.work.y,surface.work.w,surface.work.h);c.restore();return output;
}
function pixelate(surface,p){
 const size=number(p.size,.6)*surface.scale;if(size<=1)return copy(surface);
 const cell=Math.max(1,Math.round(size)),w=surface.canvas.width,h=surface.canvas.height,small=document.createElement('canvas');small.width=Math.ceil(w/cell);small.height=Math.ceil(h/cell);
 const c=small.getContext('2d');c.imageSmoothingEnabled=true;c.imageSmoothingQuality='high';c.drawImage(surface.canvas,0,0,w,h,0,0,w/cell,h/cell);
 const output=fresh(surface),o=output.ctx;o.save();o.setTransform(1,0,0,1,0,0);o.imageSmoothingEnabled=false;o.drawImage(small,0,0,small.width*cell,small.height*cell);o.restore();return output;
}
function blur(surface,p){
 const radius=number(p.radius,.4)*surface.scale;if(radius<=0)return copy(surface);
 const output=fresh(surface);drawPixels(output,surface,{blur:radius});return output;
}
function colorAdjust(surface,p){
 const hue=number(p.hue,0),saturation=number(p.saturation,1),brightness=number(p.brightness,1);if(!hue&&saturation===1&&brightness===1)return copy(surface);
 const output=fresh(surface),pixels=imageData(surface),d=pixels.data,a=hue*Math.PI/180,c=Math.cos(a),s=Math.sin(a);
 const matrix=[.213+c*.787-s*.213,.715-c*.715-s*.715,.072-c*.072+s*.928,.213-c*.213+s*.143,.715+c*.285+s*.14,.072-c*.072-s*.283,.213-c*.213-s*.787,.715-c*.715+s*.715,.072+c*.928+s*.072];
 for(let i=0;i<d.length;i+=4){
  if(!d[i+3])continue;let r=d[i],g=d[i+1],b=d[i+2];
  if(hue)[r,g,b]=[r*matrix[0]+g*matrix[1]+b*matrix[2],r*matrix[3]+g*matrix[4]+b*matrix[5],r*matrix[6]+g*matrix[7]+b*matrix[8]];
  const luminance=.2126*r+.7152*g+.0722*b;
  d[i]=(luminance+(r-luminance)*saturation)*brightness;d[i+1]=(luminance+(g-luminance)*saturation)*brightness;d[i+2]=(luminance+(b-luminance)*saturation)*brightness;
 }
 output.ctx.putImageData(pixels,0,0);return output;
}
function posterize(surface,p){
 const output=fresh(surface),pixels=imageData(surface),d=pixels.data,levels=Math.max(2,Math.round(number(p.levels,4)))-1;
 for(let i=0;i<d.length;i+=4)if(d[i+3])for(let channel=0;channel<3;channel++)d[i+channel]=Math.round(d[i+channel]*levels/255)*255/levels;
 output.ctx.putImageData(pixels,0,0);return output;
}
function halftone(surface,p){
 const output=fresh(surface),pixels=imageData(surface),d=pixels.data,w=pixels.width,h=pixels.height,size=Math.max(1,number(p.size,.6)*surface.scale),angle=number(p.angle,45)*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle),ox=surface.work.x*surface.scale,oy=surface.work.y*surface.scale;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const at=(y*w+x)*4;if(!d[at+3])continue;
  const px=x+.5+ox,py=y+.5+oy,u=(px*c+py*s)/size,v=(-px*s+py*c)/size,dx=(fract(u)-.5)*size,dy=(fract(v)-.5)*size,luminance=(.2126*d[at]+.7152*d[at+1]+.0722*d[at+2])/255,radius=size*.5*Math.sqrt(1-luminance);
  d[at+3]*=clamp(radius+.5-Math.hypot(dx,dy));if(!d[at+3])d[at]=d[at+1]=d[at+2]=0;
 }
 output.ctx.putImageData(pixels,0,0);return output;
}
function sampleChannel(data,w,h,x,y,channel,out){
 const x0=Math.floor(x),y0=Math.floor(y),fx=x-x0,fy=y-y0;let premultiplied=0,alpha=0;
 for(let iy=0;iy<2;iy++)for(let ix=0;ix<2;ix++){
  const px=x0+ix,py=y0+iy;if(px<0||py<0||px>=w||py>=h)continue;
  const at=(py*w+px)*4,weight=(ix?fx:1-fx)*(iy?fy:1-fy),a=data[at+3]*weight;alpha+=a;premultiplied+=data[at+channel]*a;
 }
 out[0]=premultiplied;out[1]=alpha;
}
function chromatic(surface,p){
 const distance=number(p.distance,.3)*surface.scale,strength=clamp(number(p.strength,1));if(distance<=0||strength<=0){recordCanvasEffect('chromatic');return copy(surface);}
 const output=fresh(surface),source=imageData(surface),pixels=output.ctx.createImageData(source.width,source.height),d=source.data,o=pixels.data,w=source.width,h=source.height,a=number(p.angle,0)*Math.PI/180,dx=Math.cos(a)*distance,dy=Math.sin(a)*distance,red=new Float64Array(2),blue=new Float64Array(2);
 // Transparent work margins never vote in automatic ink detection. Dark ink
 // needs silhouette fringes: translating its zero RGB channels cannot add color.
 let coverage=0,light=0;for(let i=0;i<d.length;i+=4){coverage+=d[i+3];light+=Math.max(d[i],d[i+1],d[i+2])*d[i+3];}
 if(!coverage)return output;
 if(p.mode==='fringe'||(!p.mode||p.mode==='auto')&&light/coverage<=140){
  recordCanvasEffect('chromatic');
  drawPixels(output,tinted(surface,p.color2||'#168fba'),{x:-dx,y:-dy,alpha:strength});
  drawPixels(output,tinted(surface,p.color||'#ec3868'),{x:dx,y:dy,alpha:strength});
  drawPixels(output,surface);return output;
 }
 recordCpuEffect('chromatic');
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const at=(y*w+x)*4;sampleChannel(d,w,h,x-dx,y-dy,0,red);sampleChannel(d,w,h,x+dx,y+dy,2,blue);
  // Only occupied color channels contribute alpha. Preserve authored black
  // ink in place, but never leave its silhouette where red or blue moved away.
  const original=d[at+3],greenOrBlack=d[at+1]>0||d[at]===0&&d[at+2]===0?original:0,split=Math.max(red[0]>0?red[1]:0,greenOrBlack,blue[0]>0?blue[1]:0),alpha=original*(1-strength)+split*strength;if(!alpha)continue;
  o[at]=(d[at]*original*(1-strength)+red[0]*strength)/alpha;
  o[at+1]=d[at+1]*original/alpha;
  o[at+2]=(d[at+2]*original*(1-strength)+blue[0]*strength)/alpha;o[at+3]=alpha;
 }
 output.ctx.putImageData(pixels,0,0);return output;
}
function waveDistort(surface,layer,p,timeSec){
 const amplitude=number(p.amplitude,.6)*surface.scale;if(amplitude<=0)return copy(surface);
 const output=fresh(surface),c=output.ctx,w=surface.canvas.width,h=surface.canvas.height,wavelength=Math.max(.001,number(p.wavelength,6)),phase=layer.motion?.enabled?timeFor(layer,timeSec)*2:0;
 c.save();c.setTransform(1,0,0,1,0,0);c.imageSmoothingEnabled=true;
 for(let y=0;y<h;y++){
  const worldY=surface.work.y+(y+.5)/surface.scale,offset=Math.sin(worldY*Math.PI*2/wavelength+phase)*amplitude;
  c.drawImage(surface.canvas,0,y,w,1,offset,y,w,1);
 }
 c.restore();return output;
}
function erosionNoise(surface,layer,depth,seed){
 const pitch=Math.max(.2,depth*.7),x0=Math.floor(surface.work.x/pitch),y0=Math.floor(surface.work.y/pitch),cols=Math.ceil(surface.work.w/pitch)+3,rows=Math.ceil(surface.work.h/pitch)+3,grid=new Float32Array(cols*rows);
 for(let y=0;y<rows;y++)for(let x=0;x<cols;x++)grid[y*cols+x]=effectRandom(seed,layer.id||'erode',x+x0,y+y0);
 return (x,y)=>{
  const gx=(surface.work.x+(x+.5)/surface.scale)/pitch-x0,gy=(surface.work.y+(y+.5)/surface.scale)/pitch-y0,ix=Math.floor(gx),iy=Math.floor(gy),fx=gx-ix,fy=gy-iy,at=iy*cols+ix;
  return (grid[at]*(1-fx)+grid[at+1]*fx)*(1-fy)+(grid[at+cols]*(1-fx)+grid[at+cols+1]*fx)*fy;
 };
}
function erode(surface,layer,p,seed){
 const depth=number(p.depth,.3);if(depth<=0)return copy(surface);
 const output=fresh(surface),pixels=imageData(surface),d=pixels.data,w=pixels.width,h=pixels.height,distance=distances(d,w,h,false),roughness=clamp(number(p.roughness,.6)),noise=roughness?erosionNoise(surface,layer,depth,seed):null,radius=depth*surface.scale;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const i=y*w+x,at=i*4;if(!d[at+3])continue;
  const threshold=radius*(1+roughness*((noise?.(x,y)??.5)-.5)*1.5),coverage=clamp(Math.sqrt(distance[i])-threshold);
  d[at+3]*=coverage;if(!d[at+3])d[at]=d[at+1]=d[at+2]=0;
 }
 output.ctx.putImageData(pixels,0,0);return output;
}

/** Filters consume the complete accumulator. Scope, opacity and text masks are
 * applied exactly once by the compositor, after this independent full result. */
export function applyEffectFilter(surface,layer,{rect=surface.work,timeSec=1.2,seed=1,backend='auto'}={}){
 if(backend!=='cpu'){const gpu=applyGpuFilter(surface,layer,{rect,timeSec,seed});if(gpu)return gpu;}
 if(['outline','colorAdjust','posterize','halftone','erode'].includes(layer.kind))recordCpuEffect(layer.kind);
 if(['glow','shadow','gradient','sweep','pixelate','blur','waveDistort'].includes(layer.kind))recordCanvasEffect(layer.kind);
 const p=layer.params||{};
 switch(layer.kind){
  case 'outline':return outline(surface,p);
  case 'glow':return glow(surface,layer,p,timeSec);
  case 'shadow':return shadow(surface,p);
  case 'gradient':case 'sweep':return colorOverlay(surface,layer,p,rect,timeSec);
  case 'pixelate':return pixelate(surface,p);
  case 'blur':return blur(surface,p);
  case 'colorAdjust':return colorAdjust(surface,p);
  case 'posterize':return posterize(surface,p);
  case 'halftone':return halftone(surface,p);
  case 'chromatic':return chromatic(surface,p);
  case 'waveDistort':return waveDistort(surface,layer,p,timeSec);
  case 'erode':return erode(surface,layer,p,seed);
  default:return applyMaterialFilter(surface,layer,{rect,timeSec,seed,backend:'cpu'})||applyCreativeFilter(surface,layer,{rect,timeSec,seed,backend:'cpu',bloomBackend:backend==='cpu'?'cpu':'auto'})||copy(surface);
 }
}
