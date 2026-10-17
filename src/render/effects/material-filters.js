import {makeSurface} from './masks.js';
import {effectRandom,fract} from './random.js';

const clamp=(v,min=0,max=1)=>Math.max(min,Math.min(max,v));
const number=(v,fallback)=>Number.isFinite(v)?v:fallback;
const pixels=surface=>surface.ctx.getImageData(0,0,surface.canvas.width,surface.canvas.height);
const fresh=surface=>makeSurface({...surface.work},surface.dpi);
function finish(surface,data){const out=fresh(surface);out.ctx.putImageData(data,0,0);return out;}
function copy(surface){return finish(surface,pixels(surface));}
function rgb(color,fallback){
 let hex=/^#([\da-f]{3}|[\da-f]{6})$/i.test(color)?color:fallback;
 if(hex.length===4)hex='#'+[...hex.slice(1)].map(c=>c+c).join('');
 return [parseInt(hex.slice(1,3),16),parseInt(hex.slice(3,5),16),parseInt(hex.slice(5,7),16)];
}
const timeFor=(layer,timeSec)=>layer.motion?.enabled?number(timeSec,1.2)*number(layer.motion.speed,1):0;
function mixAt(data,at,color,amount){
 data[at]+=(color[0]-data[at])*amount;data[at+1]+=(color[1]-data[at+1])*amount;data[at+2]+=(color[2]-data[at+2])*amount;
}
function inwardCoverage(distance,radius,squared=false){
 const start=Math.max(0,distance-1),end=Math.min(distance,radius);if(start>=end)return 0;
 if(!squared)return (end-start)*(1-(end+start)/(2*radius));
 const a=1-start/radius,b=1-end/radius;return radius*(a*a*a-b*b*b)/3;
}

// The two separable lower-envelope passes are exact Euclidean distances to air.
// Treat the outside of the canvas as air as well, including fully filled inputs.
function inwardDistances(data,w,h){
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
 for(let y=0;y<h;y++){for(let x=0;x<w;x++)line[x]=data[(y*w+x)*4+3]?far:0;transform(w);result.set(out.subarray(0,w),y*w);}
 for(let x=0;x<w;x++){
  for(let y=0;y<h;y++)line[y]=result[y*w+x];transform(h);
  for(let y=0;y<h;y++)result[y*w+x]=Math.sqrt(Math.min(out[y],(x+1)**2,(w-x)**2,(y+1)**2,(h-y)**2));
 }
 return result;
}

function innerGlow(surface,layer,p,timeSec){
 const width=Math.max(0,number(p.width,.6))*surface.scale,strength=clamp(number(p.strength,.8));if(!width||!strength)return copy(surface);
 const image=pixels(surface),d=image.data,dist=inwardDistances(d,image.width,image.height),color=rgb(p.color,'#68bcdb'),pulse=layer.motion?.enabled ? .84+.16*Math.sin(timeFor(layer,timeSec)*2.3) : 1;
 for(let i=0;i<dist.length;i++){
  const at=i*4;if(!d[at+3])continue;const edge=inwardCoverage(dist[i],width,true);if(edge)mixAt(d,at,color,edge*strength*pulse);
 }
 return finish(surface,image);
}

function boxPass(input,output,w,h,radius,horizontal){
 const r=Math.floor(radius),fraction=radius-r,length=horizontal?w:h,lines=horizontal?h:w,step=horizontal?1:w,normal=1/(2*r+1+fraction*2);
 for(let line=0;line<lines;line++){
  const start=horizontal?line*w:line;let sum=0;for(let q=0;q<=Math.min(r,length-1);q++)sum+=input[start+q*step];
  for(let q=0;q<length;q++){
   const before=q-r-1>=0?input[start+(q-r-1)*step]:0,after=q+r+1<length?input[start+(q+r+1)*step]:0;
   output[start+q*step]=(sum+(before+after)*fraction)*normal;
   if(q-r>=0)sum-=input[start+(q-r)*step];if(q+r+1<length)sum+=input[start+(q+r+1)*step];
  }
 }
}
function alphaPlane(image,blur=0){
 const {data,width:w,height:h}=image,a=new Float32Array(w*h);for(let i=0;i<a.length;i++)a[i]=data[i*4+3]/255;
 if(blur>0){const b=new Float32Array(a.length),radius=blur*.75;for(let pass=0;pass<3;pass++){boxPass(a,b,w,h,radius,true);boxPass(b,a,w,h,radius,false);}}
 return a;
}
function sampleAlpha(data,w,h,x,y){
 const ix=Math.floor(x),iy=Math.floor(y),fx=x-ix,fy=y-iy;
 const a=ix>=0&&iy>=0&&ix<w&&iy<h?data[iy*w+ix]:0,b=ix+1>=0&&iy>=0&&ix+1<w&&iy<h?data[iy*w+ix+1]:0,c=ix>=0&&iy+1>=0&&ix<w&&iy+1<h?data[(iy+1)*w+ix]:0,d=ix+1>=0&&iy+1>=0&&ix+1<w&&iy+1<h?data[(iy+1)*w+ix+1]:0;
 return (a*(1-fx)+b*fx)*(1-fy)+(c*(1-fx)+d*fx)*fy;
}
function innerShadow(surface,layer,p,timeSec){
 const strength=clamp(number(p.strength,.7)),blur=Math.max(0,number(p.blur,.4))*surface.scale,dx=number(p.offsetX,.4)*surface.scale,dy=number(p.offsetY,.6)*surface.scale;if(!strength||(!blur&&!dx&&!dy))return copy(surface);
 const image=pixels(surface),d=image.data,w=image.width,h=image.height,alpha=alphaPlane(image,blur),color=rgb(p.color,'#182936'),motion=layer.motion?.enabled?Math.sin(timeFor(layer,timeSec)*1.6)*.15:0;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const at=(y*w+x)*4;if(!d[at+3])continue;const edge=clamp(1-sampleAlpha(alpha,w,h,x-dx*(1+motion),y-dy*(1-motion)));if(edge)mixAt(d,at,color,edge*strength);
 }
 return finish(surface,image);
}

function bevel(surface,layer,p,timeSec){
 const size=Math.max(0,number(p.size,.5))*surface.scale,strength=clamp(number(p.strength,.8));if(!size||!strength)return copy(surface);
 const image=pixels(surface),d=image.data,w=image.width,h=image.height,dist=inwardDistances(d,w,h),light=rgb(p.highlight,'#fff3cf'),dark=rgb(p.shadow,'#6b4050'),angle=(number(p.angle,-55)+(layer.motion?.enabled?Math.sin(timeFor(layer,timeSec)) * 35:0))*Math.PI/180,ux=Math.cos(angle),uy=Math.sin(angle);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const i=y*w+x,at=i*4;if(!d[at+3])continue;const edge=inwardCoverage(dist[i],size);if(!edge)continue;
  const gx=(x+1<w?dist[i+1]:0)-(x?dist[i-1]:0),gy=(y+1<h?dist[i+w]:0)-(y?dist[i-w]:0),length=Math.hypot(gx,gy);
  // A slight crest on a one-pixel stroke retains a raised face when the two
  // opposing normals coincide; ordinary edges keep their directional lighting.
  const shade=length>1e-5?-(gx*ux+gy*uy)/length:.16;
  mixAt(d,at,shade>=0?light:dark,Math.abs(shade)*edge*strength);
 }
 return finish(surface,image);
}

function occupiedBounds(data,w,h){
 let left=w,top=h,right=-1,bottom=-1;for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(data[(y*w+x)*4+3]){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}
 return right<0?null:{left,top,right,bottom};
}
function extrude(surface,layer,p,timeSec){
 const depth=Math.max(0,number(p.depth,1.2))*surface.scale,strength=clamp(number(p.strength,1));if(!depth||!strength)return copy(surface);
 const image=pixels(surface),source=image.data,w=image.width,h=image.height,bounds=occupiedBounds(source,w,h);if(!bounds)return finish(surface,image);
 const alpha=alphaPlane(image),side=new Float32Array(w*h),progress=new Float32Array(w*h),angle=(number(p.angle,45)+(layer.motion?.enabled?Math.sin(timeFor(layer,timeSec)) * 12:0))*Math.PI/180,length=Math.min(depth,Math.hypot(w,h)),dx=Math.cos(angle)*length,dy=Math.sin(angle)*length,steps=Math.min(192,Math.max(1,Math.ceil(length*1.25))),color=rgb(p.color,'#463655');
 // Sweep the silhouette, taking maximum coverage instead of accumulating
 // translucent copies. The final source-over operation remains premultiplied.
 for(let step=1;step<=steps;step++){
  const t=step/steps,sx=dx*t,sy=dy*t,left=Math.max(0,Math.floor(bounds.left+sx)),right=Math.min(w-1,Math.ceil(bounds.right+sx)),top=Math.max(0,Math.floor(bounds.top+sy)),bottom=Math.min(h-1,Math.ceil(bounds.bottom+sy));
  for(let y=top;y<=bottom;y++)for(let x=left;x<=right;x++){
   const i=y*w+x,a=sampleAlpha(alpha,w,h,x-sx,y-sy);if(a>side[i]){side[i]=a;progress[i]=t;}
  }
 }
 for(let i=0;i<side.length;i++){
  const at=i*4,front=source[at+3]/255,back=side[i]*strength*(1-front),a=front+back;if(!back)continue;
  const shade=1-progress[i]*.14;for(let k=0;k<3;k++)source[at+k]=(source[at+k]*front+color[k]*shade*back)/a;source[at+3]=a*255;
 }
 return finish(surface,image);
}

const TABLE_SIZE=2048,sine=Float32Array.from({length:TABLE_SIZE},(_,i)=>Math.sin(i/TABLE_SIZE*Math.PI*2));
const sinCycle=value=>sine[(fract(value)*TABLE_SIZE)|0];
function metalTable(color,light){
 const scaled=(c,k)=>c.map(v=>clamp(v*k,0,255)),stops=[[0,scaled(color,.28)],[.14,scaled(color,.65)],[.3,color],[.38,light],[.425,[255,255,242]],[.47,scaled(color,.42)],[.57,color],[.72,light],[.86,scaled(color,.66)],[1,scaled(color,.28)]],table=new Float32Array(TABLE_SIZE*3);let stop=0;
 for(let i=0;i<TABLE_SIZE;i++){
  const phase=i/(TABLE_SIZE-1);while(phase>stops[stop+1][0])stop++;const a=stops[stop],b=stops[stop+1],t=(phase-a[0])/(b[0]-a[0]);for(let k=0;k<3;k++)table[i*3+k]=a[1][k]+(b[1][k]-a[1][k])*t;
 }
 return table;
}
const spectrum=Float32Array.from({length:TABLE_SIZE*3},(_,i)=>128+117*Math.cos(Math.floor(i/3)/TABLE_SIZE*Math.PI*2-(i%3)*Math.PI*2/3));
function reflective(surface,layer,p,rect,timeSec,seed){
 const size=Math.max(0,number(p.size,layer.kind==='foil'?3:4)),strength=clamp(number(p.strength,layer.kind==='foil'?1:.85));if(!size||!strength)return copy(surface);
 const image=pixels(surface),d=image.data,w=image.width,h=image.height,angle=number(p.angle,layer.kind==='foil'?-35:-25)*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle),du=c/surface.scale,dv=-s/surface.scale,time=timeFor(layer,timeSec),phase=effectRandom(seed,layer.id||layer.kind,0,731),isFoil=layer.kind==='foil',table=isFoil?metalTable(rgb(p.color,'#d49b39'),rgb(p.color2,'#fff1b3')):spectrum,x0=surface.work.x-rect.x+.5/surface.scale,y0=surface.work.y-rect.y+.5/surface.scale;
 for(let y=0;y<h;y++){
  const py=y0+y/surface.scale,u0=x0*c+py*s,v0=-x0*s+py*c;
  for(let x=0;x<w;x++){
   const at=(y*w+x)*4;if(!d[at+3])continue;const u=u0+x*du,v=v0+x*dv,luminance=(.2126*d[at]+.7152*d[at+1]+.0722*d[at+2])/255;
   if(isFoil){
    const band=fract(u/size+phase+.045*sinCycle(v/(size*2))+time*.17),index=((band*TABLE_SIZE)|0)*3,groove=.95+.05*sinCycle((v+u*.08)/.19),shade=(.66+.45*luminance)*groove;
    for(let k=0;k<3;k++)d[at+k]+=(table[index+k]*shade-d[at+k])*strength;
   }else{
    const interference=u/size+.19*sinCycle(v/(size*.72)+phase)+phase+time*.13,index=((fract(interference)*TABLE_SIZE)|0)*3,wave=.5+.5*sinCycle((u-v*.65)/size*1.7+phase-time*.11),shine=Math.max(0,sinCycle((u*.61+v)/size*1.55+phase+time*.16)),square=shine*shine,flash=square*square*square*square*.82,shade=(.44+.6*wave)*(.64+.36*luminance);
    for(let k=0;k<3;k++){const value=table[index+k]*shade;d[at+k]+=((value+(255-value)*flash)-d[at+k])*strength;}
   }
  }
 }
 return finish(surface,image);
}

function glitch(surface,layer,p,rect,timeSec,seed){
 const distance=clamp(number(p.distance,.7),0,4)*surface.scale,strength=clamp(number(p.strength,.65));if(!distance||!strength)return copy(surface);
 const image=pixels(surface),source=image.data,out=new Uint8ClampedArray(source.length),w=image.width,h=image.height,bands=clamp(Math.round(number(p.bands,10)),1,128),height=Math.max(1/surface.scale,rect.h),tick=layer.motion?.enabled?Math.floor(timeFor(layer,timeSec)*9):0,shifts=new Map();
 for(let y=0;y<h;y++){
  const band=Math.floor((surface.work.y+(y+.5)/surface.scale-rect.y)/height*bands);if(!shifts.has(band)){
   const random=effectRandom(seed,layer.id||'glitch',band,tick+911),direction=effectRandom(seed,layer.id||'glitch',band,tick+317)<.5?-1:1,shift=direction*distance*strength*(.3+.7*random),offset=Math.floor(-shift);shifts.set(band,{offset,fraction:-shift-offset});
  }
  const {offset,fraction}=shifts.get(band),row=y*w*4,start=Math.max(0,-offset-1),end=Math.min(w,w-offset);
  for(let x=start;x<end;x++){
   const at=row+x*4,ix=x+offset,from=row+ix*4,left=ix<0?0:source[from+3]*(1-fraction),right=ix+1>=w?0:source[from+7]*fraction,alpha=left+right;if(!alpha)continue;
   // Transport the whole RGBA row, including its empty pixels and holes. Mix
   // premultiplied samples, then unassociate once; never retain an unshifted
   // source copy or introduce color from a transparent/out-of-bounds sample.
   for(let channel=0;channel<3;channel++)out[at+channel]=((left?source[from+channel]*left:0)+(right?source[from+4+channel]*right:0))/alpha;
   out[at+3]=alpha;
  }
 }
 image.data.set(out);return finish(surface,image);
}

function scanlines(surface,layer,p,rect,timeSec){
 const spacing=Math.max(0,number(p.spacing,.45)),width=Math.max(0,number(p.width,.12)),strength=clamp(number(p.strength,.45));if(!spacing||!width||!strength)return copy(surface);
 const image=pixels(surface),d=image.data,w=image.width,h=image.height,angle=number(p.angle,0)*Math.PI/180,cos=Math.cos(angle),sin=Math.sin(angle),c=Math.abs(cos)<1e-12?0:cos,s=Math.abs(sin)<1e-12?0:sin,aa=(Math.abs(c)+Math.abs(s))/surface.scale,color=rgb(p.color,'#142d46'),phase=timeFor(layer,timeSec)*.37,half=Math.min(spacing,width)/2;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const at=(y*w+x)*4;if(!d[at+3])continue;
  const px=surface.work.x+(x+.5)/surface.scale-rect.x,py=surface.work.y+(y+.5)/surface.scale-rect.y,axis=(-px*s+py*c)/spacing+phase,edge=Math.abs(fract(axis+.5)-.5)*spacing,coverage=width>=spacing?1:clamp((half-edge)/aa+.5);if(coverage)mixAt(d,at,color,coverage*strength);
 }
 return finish(surface,image);
}

function gridRandom(x,y,seed){
 let h=Math.imul(x,0x1f123bb5)^Math.imul(y,0x5f356495)^seed;h^=h>>>16;h=Math.imul(h,0x7feb352d);h^=h>>>15;h=Math.imul(h,0x846ca68b);h^=h>>>16;return (h>>>0)/4294967296;
}
function grain(surface,layer,p,timeSec,seed){
 const size=Math.max(0,number(p.size,.15)),strength=clamp(number(p.strength,.2));if(!size||!strength)return copy(surface);
 const image=pixels(surface),d=image.data,w=image.width,h=image.height,time=timeFor(layer,timeSec),dx=time*.83,dy=time*.61,key=Math.floor(effectRandom(seed,layer.id||'grain',0,101)*4294967296);
 // Evaluate four numeric grid corners only for occupied pixels. Noise memory
 // stays constant even for .02 mm cells, and work padding never changes pitch.
 // The pixel loop has no string hashing, random state or wall-clock dependency.
 for(let y=0;y<h;y++){
  const gy=(surface.work.y+(y+.5)/surface.scale)/size+dy,iy=Math.floor(gy),fy=gy-iy;
  for(let x=0;x<w;x++){
   const at=(y*w+x)*4;if(!d[at+3])continue;const gx=(surface.work.x+(x+.5)/surface.scale)/size+dx,ix=Math.floor(gx),fx=gx-ix,noise=((gridRandom(ix,iy,key)*(1-fx)+gridRandom(ix+1,iy,key)*fx)*(1-fy)+(gridRandom(ix,iy+1,key)*(1-fx)+gridRandom(ix+1,iy+1,key)*fx)*fy)*2-1,value=noise*100*strength;
   d[at]+=value;d[at+1]+=value;d[at+2]+=value;
  }
 }
 return finish(surface,image);
}

function duotone(surface,p){
 const strength=clamp(number(p.strength,1));if(!strength)return copy(surface);
 const image=pixels(surface),d=image.data,dark=rgb(p.color,'#30235a'),light=rgb(p.color2,'#ffc48d');
 for(let at=0;at<d.length;at+=4){
  if(!d[at+3])continue;const luminance=(.2126*d[at]+.7152*d[at+1]+.0722*d[at+2])/255;
  for(let k=0;k<3;k++)d[at+k]+=(dark[k]+(light[k]-dark[k])*luminance-d[at+k])*strength;
 }
 return finish(surface,image);
}

/** Return an independent complete accumulator. The compositor alone owns layer
 * opacity, scope and text protection. Unknown kinds allow the caller to fall
 * through to its own filters. Color and inward materials retain source alpha;
 * extrusion adds a side silhouette and glitch displaces RGBA rows and holes.
 * All dimensions are in mm. */
export function applyMaterialFilter(surface,layer,{rect=surface.work,timeSec=1.2,seed=1}={}){
 const p=layer.params||{};
 switch(layer.kind){
  case 'innerGlow':return innerGlow(surface,layer,p,timeSec);
  case 'innerShadow':return innerShadow(surface,layer,p,timeSec);
  case 'bevel':return bevel(surface,layer,p,timeSec);
  case 'extrude':return extrude(surface,layer,p,timeSec);
  case 'foil':case 'holographic':return reflective(surface,layer,p,rect,timeSec,seed);
  case 'glitch':return glitch(surface,layer,p,rect,timeSec,seed);
  case 'scanlines':return scanlines(surface,layer,p,rect,timeSec);
  case 'grain':return grain(surface,layer,p,timeSec,seed);
  case 'duotone':return duotone(surface,p);
  default:return null;
 }
}
