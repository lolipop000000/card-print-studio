import {drawParticleGenerator} from './particle-generators.js';
import {drawSpriteEmitter} from './sprite-emitter.js';
import {drawStarlight} from './starlight.js';
import {effectRandom,fract} from './random.js';
import {unionBounds} from './masks.js';
import {selectEmissionPoints} from './shape.js';
import {getSmokeTexture,getMistTexture,getFireTexture,getSparkTexture} from './textures.js';
import {gpuContour} from './gpu-filters.js';
import {recordCpuEffect} from './gpu-runtime.js';

const TAU=Math.PI*2,tintCache=new Map();
const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
const smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t);};
const rgb=hex=>[1,3,5].map(at=>parseInt(hex.slice(at,at+2),16));
function region(rect,origin={x:0,y:0,w:1,h:1}){return {x:rect.x+origin.x*rect.w,y:rect.y+origin.y*rect.h,w:origin.w*rect.w,h:origin.h*rect.h};}
function memoTexture(key,create){if(!tintCache.has(key)){tintCache.set(key,create());if(tintCache.size>128)tintCache.delete(tintCache.keys().next().value);}return tintCache.get(key);}
function tint(texture,color,key){return memoTexture(key,()=>{const c=document.createElement('canvas');c.width=texture.width;c.height=texture.height;const g=c.getContext('2d');g.drawImage(texture,0,0);g.globalCompositeOperation='source-in';g.fillStyle=color;g.fillRect(0,0,c.width,c.height);return c;});}
function smokeTexture(variant,tone,color){
 const source=getSmokeTexture(variant,tone);if(!color||color==='#79818c')return source;
 const original=rgb('#79818c'),wanted=rgb(color),base=[[74,62,58],[118,110,106],[168,164,160]][tone];
 return tint(source,'rgb('+base.map((v,i)=>clamp(v+wanted[i]-original[i],0,255)).join(',')+')','smoke:'+variant+':'+tone+':'+color);
}
function fireTexture(index,p){
 if((!p.color||p.color==='#e74917')&&(!p.color2||p.color2==='#ff9e24')&&(!p.color3||p.color3==='#fff0a3'))return getFireTexture(index);
 const key='fire:'+index+':'+p.color+':'+p.color2+':'+p.color3;
 return memoTexture(key,()=>{
  const ramp=[[255,226,120],[255,170,50],[248,110,30],[222,62,24],[150,48,30],[118,104,98],[150,142,138]];
  const defaults=['#fff0a3','#ff9e24','#ff9e24','#e74917','#e74917','#e74917','#e74917'];
  const colors=[p.color3,p.color2,p.color2,p.color,p.color,p.color,p.color];
  const mapped=ramp.map((value,i)=>{const d=rgb(defaults[i]),c=rgb(colors[i]??defaults[i]),weight=i>4?.25:1;return value.map((v,k)=>clamp(v+(c[k]-d[k])*weight,0,255));});
  const [r,g,b]=mapped[index],next=mapped[Math.min(6,index+1)],c=document.createElement('canvas');c.width=c.height=64;const ctx=c.getContext('2d'),gradient=ctx.createRadialGradient(32,32,0,32,32,32);
  gradient.addColorStop(0,'rgba('+Math.min(255,r+20)+','+Math.min(255,g+40)+','+Math.min(255,b+60)+',1)');gradient.addColorStop(.5,'rgba('+r+','+g+','+b+',.95)');gradient.addColorStop(.8,'rgba('+next.join(',')+',.55)');gradient.addColorStop(1,'rgba('+next.join(',')+',0)');ctx.fillStyle=gradient;ctx.fillRect(0,0,64,64);return c;
 });
}
function sprite(ctx,texture,x,y,w,h,rotation,alpha){if(alpha<=.003||w<=0||h<=0)return false;ctx.save();ctx.globalAlpha*=alpha;ctx.translate(x,y);ctx.rotate(rotation);ctx.drawImage(texture,-w/2,-h/2,w,h);ctx.restore();return true;}
function roundFire(ctx,x,y,r,temperature,alpha,p){
 if(alpha<=.003||r<=0)return false;
 const index=clamp(Math.floor(temperature),0,5),fraction=clamp(temperature-index,0,1);
 sprite(ctx,fireTexture(index,p),x,y,r*2,r*2,0,alpha*(1-fraction));sprite(ctx,fireTexture(index+1,p),x,y,r*2,r*2,0,alpha*fraction);return true;
}
function flow(x,y,time,height){const pixels=124/Math.max(.1,height);x*=pixels;y*=pixels;return [Math.sin(y*.021+time*.9)+.6*Math.sin(x*.013-time*.7+y*.009),Math.cos(x*.017+time*.6)*.4];}
function rectanglePoints(r){
 const points=[],perimeter=2*(r.w+r.h),count=Math.max(16,Math.ceil(perimeter/.25));
 for(let i=0;i<count;i++){
  let d=perimeter*i/count;
  if(d<r.w)points.push({x:r.x+d,y:r.y,nx:0,ny:-1,open:true});
  else if((d-=r.w)<r.h)points.push({x:r.x+r.w,y:r.y+d,nx:1,ny:0,open:true});
  else if((d-=r.h)<r.w)points.push({x:r.x+r.w-d,y:r.y+r.h,nx:0,ny:1,open:true});
  else points.push({x:r.x,y:r.y+r.h-(d-r.w),nx:-1,ny:0,open:true});
 }
 return points;
}
function emissionSetup(layer,rect,shape,edges){
 const r=region(rect,layer.origin),legacy=!layer.emit,emit=layer.emit??{face:layer.emitter==='area'||layer.emitter==='bottom'?'area':'all',openOnly:false};
 if(emit.face==='area')return {r,emit,points:null,bottom:legacy&&layer.emitter==='bottom'};
 let geometry=shape;
 if(!geometry){const points=edges??rectanglePoints(r);geometry={points:points.map(p=>({...p,nx:p.nx??0,ny:p.ny??-1,open:p.open??true})),inside:[]};}
 return {r,emit,points:selectEmissionPoints(geometry,emit),bottom:false};
}
function boltPath(start,end,amplitude,depth,random,salt){
 let nodes=[start,end];
 for(let level=0;level<depth;level++){
  const next=[nodes[0]];
  for(let i=0;i<nodes.length-1;i++){
   const a=nodes[i],b=nodes[i+1],dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy)||1,offset=(random(i,salt+':'+level)-.5)*amplitude;
   next.push({x:(a.x+b.x)/2-dy/length*offset,y:(a.y+b.y)/2+dx/length*offset},b);
  }
  nodes=next;amplitude*=.52;
 }
 return nodes;
}
function strokeNodes(ctx,nodes,color,width,alpha=1){ctx.save();ctx.globalAlpha*=alpha;ctx.strokeStyle=color;ctx.lineWidth=width;ctx.beginPath();nodes.forEach((n,i)=>i?ctx.lineTo(n.x,n.y):ctx.moveTo(n.x,n.y));ctx.stroke();ctx.restore();}
function contourSurface(shape,rings,color,width){
 const canvas=document.createElement('canvas');canvas.width=shape.width;canvas.height=shape.height;const ctx=canvas.getContext('2d'),data=ctx.createImageData(shape.width,shape.height),c=rgb(color),aa=1/shape.scale;
 const accelerated=gpuContour(shape,rings,color,width);
 if(accelerated){data.data.set(accelerated);ctx.putImageData(data,0,0);return canvas;}
 recordCpuEffect('ripple');
 for(let i=0;i<shape.distance.length;i++){
  const d=shape.distance[i];if(d<0||!Number.isFinite(d))continue;let alpha=0;
  for(const ring of rings){const coverage=clamp((width*.5+aa*.5-Math.abs(d-ring.radius))/aa,0,1)*ring.alpha;alpha=1-(1-alpha)*(1-coverage);}
  if(alpha<=0)continue;data.data[i*4]=c[0];data.data[i*4+1]=c[1];data.data[i*4+2]=c[2];data.data[i*4+3]=Math.round(alpha*255);
 }
 ctx.putImageData(data,0,0);return canvas;
}

export function drawGenerator(ctx,layer,{rect,seed,timeSec=1.2,shape,edgePoints,sizeHeightMm,assets}){
 const p=layer.params??{},t=layer.motion?.enabled?timeSec*(layer.motion.speed??1):1.2,setup=emissionSetup(layer,rect,shape,edgePoints),r=setup.r;
 if(setup.points&&!setup.points.length&&!(layer.kind==='sprite'&&p.renderMode==='single'))return null;
 const height=Math.max(.01,sizeHeightMm??shape?.boundsMm?.h??r.h),cx=r.x+r.w/2,cy=r.y+r.h/2;
 const angle=(layer.rotationDeg??0)*Math.PI/180,cos=Math.cos(angle),sin=Math.sin(angle),direction=(p.direction??-90)*Math.PI/180,dx=Math.cos(direction),dy=Math.sin(direction),sx=-dy,sy=dx;
 const random=(index,salt)=>effectRandom(seed,layer.id,index,salt);
 const point=(index,cycle=0,salt='emit')=>{
  const u=random(index,cycle+':'+salt);
  if(!setup.points)return {x:r.x+u*r.w,y:setup.bottom?r.y+r.h:r.y+random(index,cycle+':y')*r.h,nx:0,ny:-1,open:true};
  return setup.points[Math.min(setup.points.length-1,Math.floor(u*setup.points.length))];
 };
 let bounds=null;
 const include=(x,y,radius=0)=>{const ax=x-cx,ay=y-cy,px=cx+ax*cos-ay*sin,py=cy+ax*sin+ay*cos;bounds=unionBounds(bounds,{x:px-radius,y:py-radius,w:radius*2,h:radius*2});};
 ctx.save();ctx.translate(cx,cy);ctx.rotate(angle);ctx.translate(-cx,-cy);ctx.globalAlpha*=layer.opacity??1;
 if(layer.kind==='flame'){
  const fire=[],size=height*(p.size??p.width??.1),rise=height*(p.height??.68),count=p.count??110;
  for(let j=0;j<count;j++){
   const life=(1.3+1.1*random(j,'life'))*(p.life??1.8)/1.8,u=t/life+random(j,'phase'),cycle=Math.floor(u),phase=u-cycle,e=point(j,cycle);if(!e)continue;
   const lift=rise*phase*(.55+.6*random(j,cycle+':lift'));
   const wob=(Math.sin(t*2.6+j*31+cycle*7)*size*.6*phase+(random(j,cycle+':wob')-.5)*size*phase*2)*(p.sway??.4)/.4*(p.width??.14)/.14;
   const radius=size*(.6+.6*random(j,cycle+':size'))*(phase<.1?phase/.1:1)*(1-.5*phase);
   fire.push({phase,x:e.x+e.nx*size*.3+dx*lift+sx*wob,y:e.y+e.ny*size*.3+dy*lift+sy*wob,radius,temperature:phase*3.6,alpha:Math.min(1,1.2*(1-phase)**.6)});
  }
  fire.sort((a,b)=>b.phase-a.phase);
  for(const f of fire)if(roundFire(ctx,f.x,f.y,f.radius,f.temperature,f.alpha,p))include(f.x,f.y,f.radius);
  const edge=setup.points;
  if(edge)for(let k=0;k<edge.length;k+=9){const e=edge[k],flicker=.5+.5*Math.sin(t*6+k*.37),radius=size*.35*(.6+.4*flicker),x=e.x+e.nx*size*.08,y=e.y+e.ny*size*.08;if(roundFire(ctx,x,y,radius,.6+flicker*.8,.55*flicker,p))include(x,y,radius);}
 }else if(layer.kind==='smoke'){
  const particles=[],size=height*(p.size??.09),rise=height*(p.height??.95),density=p.density??.6,spread=(p.spread??.5)/.5;
  for(let j=0;j<(p.count??70);j++){
   const fireLife=.55+.35*random(j,'burst'),smokeLife=(2.6+1.6*random(j,'life'))*(p.life??3.5)/3.5,life=fireLife+smokeLife*.35,u=t/life+random(j,'phase'),cycle=Math.floor(u);
   // Previous bursts overlap the new burst, so frozen scenes retain a plume.
   for(let back=0;back<3;back++){
    const c=cycle-back,age=(u-c)*life-fireLife*.6;if(age<0||age>smokeLife||random(j,c+':presence')>density+.15)continue;
    const e=point(j,c);if(!e)continue;const phase=age/smokeLife,field=flow(e.x,e.y-rise*phase,t,height);
    const side=(field[0]*size*1.6*phase*phase*3+(random(j,c+':drift')-.5)*size*2*phase)*spread;
    const lift=rise*(.25+1.2*phase)*(.8+.4*random(j,c+':lift')),extent=size*(1.6+5.2*phase)*(.8+.5*random(j,c+':size'));
    particles.push({phase,x:e.x+dx*lift+sx*side,y:e.y+dy*lift+sy*side,size:extent,rotation:(random(j,c+':rotation')-.5)*2+t*(random(j,c+':spin')-.5)*.6,alpha:Math.min(.95,.85*density/.5*smooth(0,.1,phase)*(1-phase)**1.1),tone:Math.min(2,Math.floor(phase*3.2)),variant:Math.floor(random(j,c+':variant')*4)});
   }
  }
  particles.sort((a,b)=>b.phase-a.phase);
  for(const s of particles)if(sprite(ctx,smokeTexture(s.variant,s.tone,p.color),s.x,s.y,s.size,s.size,s.rotation,s.alpha))include(s.x,s.y,s.size*Math.SQRT1_2);
 }else if(layer.kind==='mist'){
  const particles=[];
  for(let j=0;j<(p.count??12);j++){
   const life=p.life??5,u=t/life+random(j,'phase'),cycle=Math.floor(u),phase=fract(u),e=point(j,cycle);if(!e)continue;
   const drift=height*(.2+.6*(p.spread??.8))*phase,field=flow(e.x,e.y,t,height),width=height*(p.size??.4)*(1.5+phase*2);
   particles.push({phase,x:e.x+dx*drift+field[0]*height*.04,y:e.y+dy*drift+field[1]*height*.03,width,rotation:(random(j,cycle+':rotation')-.5)*.25,alpha:(p.density??.35)*Math.sin(Math.PI*phase)*.8,variant:Math.floor(random(j,cycle+':variant')*3)});
  }
  particles.sort((a,b)=>b.phase-a.phase);
  const softness=height*.04*(p.softness??.8);
  if(softness)ctx.filter='blur('+softness*Math.hypot(ctx.getTransform().a,ctx.getTransform().b)+'px)';
  for(const m of particles){const texture=tint(getMistTexture(m.variant),p.color??'#b7d3d8','mist:'+m.variant+':'+p.color);if(sprite(ctx,texture,m.x,m.y,m.width,m.width*.45,m.rotation,m.alpha))include(m.x,m.y,m.width*.56+softness*3);}
 }else if(layer.kind==='starlight'){
  drawStarlight(ctx,layer,{time:t,height,point,random,include});
 }else if(layer.kind==='ember'||layer.kind==='particle'){
  const particles=[];
  for(let j=0;j<(p.count??40);j++){
   const life=p.life??2,u=t/life+random(j,'phase'),cycle=Math.floor(u),phase=fract(u),e=point(j,cycle);if(!e)continue;
   const dir=direction+(random(j,cycle+':direction')-.5)*(p.spread??.4)*1.7,tx=Math.cos(dir),ty=Math.sin(dir),travel=phase*height*.9,field=flow(e.x,e.y,t,height),size=height*(p.size??.025)*(.5+random(j,cycle+':size'));
   particles.push({phase,x:e.x+tx*travel+field[0]*height*.05*phase,y:e.y+ty*travel,tx,ty,size,alpha:Math.sin(Math.PI*phase)*(.6+.4*Math.sin(t*4+j)**2)});
  }
  particles.sort((a,b)=>b.phase-a.phase);
  for(const f of particles){
   ctx.save();ctx.globalAlpha*=f.alpha;ctx.fillStyle=p.color??'#ffbc61';ctx.strokeStyle=p.color??'#ffbc61';ctx.lineWidth=Math.max(.04,f.size*.15);
   if(layer.kind==='ember'&&(p.tail??.1)>0){const length=(p.tail??.1)*height,gradient=ctx.createLinearGradient(f.x-f.tx*length,f.y-f.ty*length,f.x,f.y);gradient.addColorStop(0,(p.color??'#ffbc61')+'00');gradient.addColorStop(1,p.color??'#ffbc61');ctx.strokeStyle=gradient;ctx.beginPath();ctx.moveTo(f.x-f.tx*length,f.y-f.ty*length);ctx.lineTo(f.x,f.y);ctx.stroke();include(f.x-f.tx*length,f.y-f.ty*length,f.size);}
   if(layer.kind==='ember'||p.shape==='dot'){ctx.beginPath();ctx.arc(f.x,f.y,f.size,0,TAU);ctx.fill();ctx.fillStyle='#fff4cf';ctx.beginPath();ctx.arc(f.x,f.y,f.size*.35,0,TAU);ctx.fill();}
   else if(p.shape==='snow'){for(let k=0;k<6;k++){const a=k*Math.PI/3+t*.2,x=f.x+Math.cos(a)*f.size,y=f.y+Math.sin(a)*f.size;ctx.beginPath();ctx.moveTo(f.x,f.y);ctx.lineTo(x,y);ctx.stroke();}}
   else sprite(ctx,tint(getSparkTexture(),p.color??'#fff3b6','spark:'+p.color),f.x,f.y,f.size*2,f.size*2,t*.3,1);
   ctx.restore();include(f.x,f.y,f.size);
  }
 }else if(layer.kind==='lightning'){
  const tick=Math.floor(t*(p.frequency??2)),start=point(0,tick);if(start){
   const nx=start.nx??0,ny=start.ny??-1,tilt=(random(tick,'tilt')-.5)*.8,cosine=Math.cos(tilt),sine=Math.sin(tilt),length=height*(.7+random(tick,'length')*.3);
   const end={x:start.x+(nx*cosine-ny*sine)*length,y:start.y+(nx*sine+ny*cosine)*length},nodes=boltPath(start,end,height*.35,5,random,'bolt:'+tick),paths=[nodes];
   for(let j=0;j<(p.branches??3);j++){
    const index=3+Math.floor(random(j,tick+':branch')*(nodes.length-7)),at=nodes[index],side=random(j,tick+':side')>.5?1:-1,remaining=height*(.18+random(j,tick+':reach')*.2);
    const finish={x:at.x+(nx-ny*side*.8)*remaining,y:at.y+(ny+nx*side*.8)*remaining};paths.push(boltPath(at,finish,remaining*.4,3,random,'branch:'+tick+':'+j));
   }
   ctx.lineJoin='round';ctx.lineCap='round';const width=p.width??.3,flash=.55+.45*Math.abs(Math.sin(t*(p.frequency??2)*Math.PI));
   for(const path of paths){strokeNodes(ctx,path,p.color??'#b9e9ff',width*3,flash*.17);strokeNodes(ctx,path,p.color??'#b9e9ff',width,flash);strokeNodes(ctx,path,'#ffffff',width*.28,flash);for(const n of path)include(n.x,n.y,width*1.5);}
  }
 }else if(layer.kind==='ripple'){
  const rings=[];
  for(let j=0;j<(p.count??3);j++){const phase=fract(t*(p.frequency??1)/(p.life??2)+j/(p.count??3));rings.push({radius:height*((p.start??.05)+((p.end??.9)-(p.start??.05))*phase)*.5,alpha:(1-phase)**(p.fade??1)});}
  if(shape?.boundsMm){
   const texture=contourSurface(shape,rings,p.color??'#79d9ff',p.width??.35);ctx.drawImage(texture,shape.work.x,shape.work.y,shape.work.w,shape.work.h);
   const reach=Math.max(...rings.map(r=>r.radius))+(p.width??.35);include(shape.boundsMm.x,shape.boundsMm.y,reach);include(shape.boundsMm.x+shape.boundsMm.w,shape.boundsMm.y+shape.boundsMm.h,reach);
  }else for(const ring of rings){ctx.save();ctx.globalAlpha*=ring.alpha;ctx.strokeStyle=p.color??'#79d9ff';ctx.lineWidth=p.width??.35;ctx.strokeRect(r.x-ring.radius,r.y-ring.radius,r.w+ring.radius*2,r.h+ring.radius*2);ctx.restore();include(r.x,r.y,ring.radius);include(r.x+r.w,r.y+r.h,ring.radius);}
 }else if(layer.kind==='aura'){
  const center=shape?.boundsMm??r,ax=center.x+center.w/2,ay=center.y+center.h/2;
  // Raster rows alternate the two sides of a shape. Traverse around it before
  // taking evenly spaced samples, otherwise a fixed stride can miss one side.
  const points=[...(setup.points??rectanglePoints(r))].sort((a,b)=>Math.atan2(a.y-ay,a.x-ax)-Math.atan2(b.y-ay,b.x-ax));
  const count=p.count??20,length=height*(p.length??.5),width=Math.max(.08,height*.025);
  for(let j=0;j<count;j++){
   const e=points[Math.min(points.length-1,Math.floor(j/count*points.length))];if(!e)continue;
   const nx=e.nx??0,ny=e.ny??-1,reach=length*(.75+.25*Math.sin(t*1.8+j*.71)),x=e.x+nx*.03,y=e.y+ny*.03;
   ctx.save();ctx.translate(x,y);ctx.rotate(Math.atan2(ny,nx));const gradient=ctx.createLinearGradient(0,0,reach,0);gradient.addColorStop(0,(p.color??'#b693ff')+'c0');gradient.addColorStop(.25,(p.color??'#b693ff')+'80');gradient.addColorStop(1,(p.color??'#b693ff')+'00');ctx.fillStyle=gradient;ctx.beginPath();ctx.moveTo(0,-width);ctx.lineTo(reach,0);ctx.lineTo(0,width);ctx.closePath();ctx.fill();ctx.restore();include(x,y,width);include(x+nx*reach,y+ny*reach,width);
  }
 }else if(layer.kind==='sprite'){
  drawSpriteEmitter(ctx,layer,{time:t,height,point,random,center:{x:cx,y:cy},include:(x,y,radius,quad)=>{if(quad)for(const corner of quad)include(corner.x,corner.y,0);else include(x,y,radius);},image:assets?.get(p.assetId)});
 }else {
  drawParticleGenerator(ctx,layer,{time:t,height,point,random,include});
 }
 ctx.restore();return bounds;
}
