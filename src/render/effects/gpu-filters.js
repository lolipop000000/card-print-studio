import {makeSurface} from './masks.js';
import {effectRandom} from './random.js';
import {runGpuEffect} from './gpu-runtime.js';
import {simpleShaders,distanceHorizontal,distanceVertical,distanceShaders,outlineBase,outlineRange,outlineFinish,alphaBase,alphaBlur,innerShadowFinish} from './gpu-filter-shaders.js';

const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x)),n=(v,d)=>Number.isFinite(v)?v:d;
const color=(v,fallback)=>{let s=/^#([\da-f]{3}|[\da-f]{6})$/i.test(v)?v:fallback;if(s.length===4)s='#'+[...s.slice(1)].map(c=>c+c).join('');return [1,3,5].map(i=>parseInt(s.slice(i,i+2),16));};
const noop='void main(){result=bytes(original(ivec2(pixelPosition())));}';
const pass=(key,body,values={})=>({key,body,values});
const auxData=(width,height=1)=>({width,height,data:new Float32Array(width*height*4)});
const pointwiseKinds=new Set(['colorAdjust','posterize','halftone','scanlines','grain','duotone','foil','holographic']);
function occupiedRegion(data,width,height){
 let left=width,top=height,right=-1,bottom=-1;
 for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(data[(y*width+x)*4+3]){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=y;}
 if(right<left)return {x:0,y:0,width:1,height:1};
 return {x:left,y:top,width:right-left+1,height:bottom-top+1};
}
function regionPixels(data,width,region){
 const out=new Uint8ClampedArray(region.width*region.height*4);
 for(let y=0;y<region.height;y++){const start=((region.y+y)*width+region.x)*4;out.set(data.subarray(start,start+region.width*4),y*region.width*4);}
 return out;
}
function reflectTable(p,foil){
 const out=auxData(2048),base=color(p.color,'#d49b39'),light=color(p.color2,'#fff1b3'),scaled=k=>base.map(v=>clamp(v*k,0,255));
 const stops=[[0,scaled(.28)],[.14,scaled(.65)],[.3,base],[.38,light],[.425,[255,255,242]],[.47,scaled(.42)],[.57,base],[.72,light],[.86,scaled(.66)],[1,scaled(.28)]];let stop=0;
 for(let i=0;i<2048;i++){
  if(foil){const phase=i/2047;while(phase>stops[stop+1][0])stop++;const a=stops[stop],b=stops[stop+1],t=(phase-a[0])/(b[0]-a[0]);for(let k=0;k<3;k++)out.data[i*4+k]=a[1][k]+(b[1][k]-a[1][k])*t;}
  else for(let k=0;k<3;k++)out.data[i*4+k]=128+117*Math.cos(i/2048*Math.PI*2-k*Math.PI*2/3);
  out.data[i*4+3]=Math.sin(i/2048*Math.PI*2);
 }
 return out;
}

/** The complete original accumulator is filtered; the compositor still owns
 * scope, layer opacity, text protection and blend order. */
export function applyGpuFilter(surface,layer,{rect=surface.work,timeSec=1.2,seed=1}={}){
 const kind=layer.kind,p=layer.params||{},s=surface.scale,w=surface.canvas.width,h=surface.canvas.height;
 if(!simpleShaders[kind]&&!distanceShaders[kind]&&!['outline','innerShadow','foil','holographic'].includes(kind))return null;
 const source=surface.ctx.getImageData(0,0,w,h);
 const time=layer.motion?.enabled?n(timeSec,1.2)*n(layer.motion.speed,1):0;
 let passes=[],aux=null,levels=0,values={};let neutral=false;
 switch(kind){
  case 'colorAdjust':{
   const hue=n(p.hue,0),a=hue*Math.PI/180,c=Math.cos(a),z=Math.sin(a);neutral=!hue&&n(p.saturation,1)===1&&n(p.brightness,1)===1;
   values={u0:[.213+c*.787-z*.213,.715-c*.715-z*.715,.072-c*.072+z*.928,0],u1:[.213-c*.213+z*.143,.715+c*.285+z*.14,.072-c*.072-z*.283,0],u2:[.213-c*.213-z*.787,.715-c*.715+z*.715,.072+c*.928+z*.072,0],u3:[n(p.saturation,1),n(p.brightness,1),0,0]};break;
  }
  case 'posterize':values={u0:[Math.max(2,Math.round(n(p.levels,4)))-1,0,0,0]};break;
  case 'halftone':{const angle=n(p.angle,45)*Math.PI/180;values={u0:[Math.max(1,n(p.size,.6)*s),surface.work.x*s,surface.work.y*s,0],u1:[Math.cos(angle),Math.sin(angle),0,0]};break;}
  case 'duotone':values={u0:[...color(p.color,'#30235a'),clamp(n(p.strength,1))],u1:[...color(p.color2,'#ffc48d'),0]};neutral=!values.u0[3];break;
  case 'scanlines':{
   const angle=n(p.angle,0)*Math.PI/180,c=Math.cos(angle),z=Math.sin(angle),cos=Math.abs(c)<1e-12?0:c,sin=Math.abs(z)<1e-12?0:z,spacing=Math.max(0,n(p.spacing,.45)),width=Math.max(0,n(p.width,.12)),strength=clamp(n(p.strength,.45));neutral=!spacing||!width||!strength;
   values={u0:[s,cos,sin,0],u1:[surface.work.x-rect.x,surface.work.y-rect.y,spacing,time*.37],u2:[width,(Math.abs(cos)+Math.abs(sin))/s,strength,0],u3:[...color(p.color,'#142d46'),0]};break;
  }
  case 'grain':{
   const size=Math.max(0,n(p.size,.15)),strength=clamp(n(p.strength,.2)),key=Math.floor(effectRandom(seed,layer.id||'grain',0,101)*4294967296);neutral=!size||!strength;
   // Split world coordinates before float upload. Recomputing work origin +
   // pixel position in a shader loses different bits when padding changes.
   aux=auxData(Math.max(w,h));
   if(!neutral){
    for(let x=0;x<w;x++){const value=(surface.work.x+(x+.5)/s)/size+time*.83,cell=Math.floor(value);aux.data[x*4]=cell;aux.data[x*4+1]=value-cell;}
    for(let y=0;y<h;y++){const value=(surface.work.y+(y+.5)/s)/size+time*.61,cell=Math.floor(value);aux.data[y*4+2]=cell;aux.data[y*4+3]=value-cell;}
   }
   values={u1:[0,0,strength,0],u2:[key>>>16,key&65535,0,0]};break;
  }
  case 'directionalBlur':{
   const distance=clamp(n(p.distance,1),0,8)*s,strength=clamp(n(p.strength,1)),angle=clamp(n(p.angle,0),-180,180)*Math.PI/180;neutral=!distance||!strength;
   values={u0:[Math.cos(angle)*distance,Math.sin(angle)*distance,strength,Math.round(clamp(n(p.samples,9),3,25))]};break;
  }
  case 'displacement':{
   const amount=clamp(n(p.amount,.45),0,3)*s,wavelength=clamp(n(p.wavelength,4),.5,20),axis=['x','y','both'].includes(p.axis)?p.axis:'both',t=layer.motion?.enabled?n(timeSec,1.2)*clamp(n(layer.motion.speed,1),.1,3):0,tau=Math.PI*2;neutral=!amount;
   aux=auxData(Math.max(w,h));const phaseX=effectRandom(seed,layer.id||'displacement',0,1)*tau,phaseY=effectRandom(seed,layer.id||'displacement',0,2)*tau;
   for(let y=0;y<h;y++)if(axis!=='y')aux.data[y*4]=Math.sin((surface.work.y+(y+.5)/s)*tau/wavelength+phaseX+t*1.7)*amount;
   for(let x=0;x<w;x++)if(axis!=='x')aux.data[x*4+1]=Math.sin((surface.work.x+(x+.5)/s)*tau/wavelength+phaseY-t*1.3)*amount;break;
  }
  case 'glitch':{
   const distance=clamp(n(p.distance,.7),0,4)*s,strength=clamp(n(p.strength,.65)),bands=clamp(Math.round(n(p.bands,10)),1,128),height=Math.max(1/s,rect.h),tick=layer.motion?.enabled?Math.floor(time*9):0,shifts=new Map();neutral=!distance||!strength;aux=auxData(h);
   for(let y=0;y<h;y++){const band=Math.floor((surface.work.y+(y+.5)/s-rect.y)/height*bands);if(!shifts.has(band)){const random=effectRandom(seed,layer.id||'glitch',band,tick+911),direction=effectRandom(seed,layer.id||'glitch',band,tick+317)<.5?-1:1;shifts.set(band,-direction*distance*strength*(.3+.7*random));}aux.data[y*4]=shifts.get(band);}break;
  }
  case 'chromatic':{
   const distance=n(p.distance,.3)*s,strength=clamp(n(p.strength,1)),angle=n(p.angle,0)*Math.PI/180;neutral=distance<=0||!strength;
   let fringe=p.mode==='fringe';if(!p.mode||p.mode==='auto'){const data=source.data;let coverage=0,light=0;for(let i=0;i<data.length;i+=4){coverage+=data[i+3];light+=Math.max(data[i],data[i+1],data[i+2])*data[i+3];}fringe=coverage>0&&light/coverage<=140;}
   // Native source-in tinting and fractional Canvas draws quantize each stage.
   // Preserve that authored fringe path on GPU-eligible drawing surfaces.
   if(fringe&&!neutral)return null;
   values={u0:[Math.cos(angle)*distance,Math.sin(angle)*distance,strength,0]};break;
  }
  case 'extrude':{
   const depth=Math.max(0,n(p.depth,1.2))*s,strength=clamp(n(p.strength,1)),angle=(n(p.angle,45)+(layer.motion?.enabled?Math.sin(time)*12:0))*Math.PI/180,length=Math.min(depth,Math.hypot(w,h));neutral=!depth||!strength;
   values={u0:[Math.cos(angle)*length,Math.sin(angle)*length,Math.min(192,Math.max(1,Math.ceil(length*1.25))),strength],u1:[...color(p.color,'#463655'),0]};break;
  }
  case 'foil':case 'holographic':{
   const foil=kind==='foil',size=Math.max(0,n(p.size,foil?3:4)),strength=clamp(n(p.strength,foil?1:.85)),angle=n(p.angle,foil?-35:-25)*Math.PI/180;neutral=!size||!strength;aux=reflectTable(p,foil);
   values={u0:[surface.work.x-rect.x+.5/s,surface.work.y-rect.y+.5/s,s,size],u1:[Math.cos(angle),Math.sin(angle),time,effectRandom(seed,layer.id||kind,0,731)],u2:[strength,foil?1:0,0,0]};break;
  }
  case 'outline':{
   const radius=n(p.width,.5)*s;neutral=radius<=0;levels=Math.max(1,Math.floor(Math.log2(Math.max(1,Math.min(w,2*Math.floor(radius)+1))))+1);
   passes=[{...pass('outline-base',outlineBase),saveLevel:0}];
   for(let i=1;i<levels;i++)passes.push({...pass('outline-range',outlineRange,{u0:[2**(i-1),0,0,0]}),saveLevel:i});
   passes.push(pass('outline-finish',outlineFinish,{u0:[radius,0,0,0],u1:[...color(p.color,'#ffb24b'),0]}));break;
  }
  case 'innerShadow':{
   const strength=clamp(n(p.strength,.7)),blur=Math.max(0,n(p.blur,.4))*s,dx=n(p.offsetX,.4)*s,dy=n(p.offsetY,.6)*s,motion=layer.motion?.enabled?Math.sin(time*1.6)*.15:0;neutral=!strength||(!blur&&!dx&&!dy);passes=[pass('alpha-base',alphaBase)];
   if(blur>0)for(let i=0;i<6;i++)passes.push(pass('alpha-blur',alphaBlur,{u0:[blur*.75,i%2?0:1,i%2?1:0,0]}));
   passes.push(pass('innerShadow',innerShadowFinish,{u0:[dx*(1+motion),dy*(1-motion),strength,0],u1:[...color(p.color,'#182936'),0]}));break;
  }
  case 'innerGlow':case 'bevel':case 'erode':{
   let radius;
   if(kind==='erode'){
    const depth=n(p.depth,.3),rough=clamp(n(p.roughness,.6)),pitch=Math.max(.2,depth*.7),x0=Math.floor(surface.work.x/pitch),y0=Math.floor(surface.work.y/pitch);neutral=depth<=0;radius=depth*s*(1+rough*.75)+1;
    aux=auxData(Math.ceil(surface.work.w/pitch)+3,Math.ceil(surface.work.h/pitch)+3);for(let y=0;y<aux.height;y++)for(let x=0;x<aux.width;x++)aux.data[(y*aux.width+x)*4]=effectRandom(seed,layer.id||'erode',x+x0,y+y0);
    values={u0:[depth*s,rough,pitch,0],u1:[surface.work.x,surface.work.y,s,0],u2:[x0,y0,0,0]};
   }else{
    const width=Math.max(0,n(kind==='bevel'?p.size:p.width,kind==='bevel'?.5:.6))*s,strength=clamp(n(p.strength,.8));neutral=!width||!strength;radius=width+2;
    if(kind==='innerGlow')values={u0:[width,strength*(layer.motion?.enabled?.84+.16*Math.sin(time*2.3):1),0,0],u1:[...color(p.color,'#68bcdb'),0]};
    else{const angle=(n(p.angle,-55)+(layer.motion?.enabled?Math.sin(time)*35:0))*Math.PI/180;values={u0:[width,strength,Math.cos(angle),Math.sin(angle)],u1:[...color(p.highlight,'#fff3cf'),0],u2:[...color(p.shadow,'#6b4050'),0]};}
   }
   const distanceValues={u0:[Math.min(Math.max(w,h),Math.ceil(radius)),0,0,0]};passes=[pass('distance-horizontal',distanceHorizontal,distanceValues),pass('distance-vertical',distanceVertical,distanceValues),pass(kind,distanceShaders[kind],values)];break;
  }
 }
 if(neutral){passes=[pass('copy',noop)];levels=0;aux=null;}
 else if(!passes.length)passes=[pass(kind==='foil'||kind==='holographic'?'reflective':kind,simpleShaders[kind]||simpleShaders.reflective,values)];
 // Pointwise kernels cannot create pixels outside the input alpha. Keep their
 // original pixel/world coordinates while transferring just occupied pixels.
 // Sampling, distance and generator jobs retain the complete original surface.
 let region={x:0,y:0,width:w,height:h};
 if(pointwiseKinds.has(kind)&&w*h>16384){const occupied=occupiedRegion(source.data,w,h);if(occupied.width*occupied.height<w*h*.75)region=occupied;}
 const cropped=region.width!==w||region.height!==h,data=cropped?regionPixels(source.data,w,region):source.data;
 const result=runGpuEffect({kind,width:region.width,height:region.height,data,passes,aux,levels,pixelOrigin:[region.x,region.y],sourceSize:[w,h]});if(!result)return null;
 const output=makeSurface({...surface.work},surface.dpi),pixels=output.ctx.createImageData(region.width,region.height);pixels.data.set(result);output.ctx.putImageData(pixels,region.x,region.y);return output;
}

const contourShader=`void main(){ivec2 p=ivec2(gl_FragCoord.xy);float distance=texelFetch(auxiliary,p,0).r,alpha=0.;if(distance>=0.&&!isinf(distance)){for(int i=0;i<int(u0.z);i++){vec4 pair=i<2?u2:i<4?u3:i<6?u4:i<8?u5:i<10?u6:u7;vec2 ring=i%2==0?pair.xy:pair.zw;float coverage=clamp((u0.x*.5+u0.y*.5-abs(distance-ring.x))/u0.y,0.,1.)*ring.y;alpha=1.-(1.-alpha)*(1.-coverage);}}result=bytes(vec4(u1.rgb,floor(alpha*255.+.5)));}`;
export function gpuContour(shape,rings,primary,width){
 if(rings.length>12)return null;
 const aux=auxData(shape.width,shape.height);for(let i=0;i<shape.distance.length;i++)aux.data[i*4]=shape.distance[i];
 const values={u0:[width,1/shape.scale,rings.length,0],u1:[...color(primary,'#79d9ff'),0]};
 for(let i=0;i<rings.length;i++){const key='u'+(2+Math.floor(i/2));values[key]||=[0,0,0,0];values[key][i%2*2]=rings[i].radius;values[key][i%2*2+1]=rings[i].alpha;}
 return runGpuEffect({kind:'ripple',width:shape.width,height:shape.height,data:new Uint8ClampedArray(shape.width*shape.height*4),aux,passes:[pass('contour',contourShader,values)]});
}

const mixingShader=`void main(){ivec2 p=ivec2(gl_FragCoord.xy);vec4 a=original(p),b=texelFetch(auxiliary,p,0);float m=texelFetch(mask,p,0).r,alpha=a.a*(1.-m)+b.a*m;vec3 rgb=alpha>0.?(a.rgb*a.a*(1.-m)+b.rgb*b.a*m)/alpha:vec3(0.);result=bytes(vec4(floor(rgb+.5),floor(alpha+.5)));}`;
export function gpuMixPixels(width,height,base,filtered,weights){
 const aux={width,height,data:Float32Array.from(filtered)};
 return runGpuEffect({kind:'composite',width,height,data:base,aux,mask:weights,passes:[pass('filter-mix',mixingShader)]});
}
