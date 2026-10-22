const TAU=Math.PI*2;
const shapes=new Set(['image','star','circle','rune','diamond','petal','snowflake']);
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const number=(value,fallback,min,max)=>Number.isFinite(value)?clamp(value,min,max):fallback;
const mix=(a,b,phase)=>a+(b-a)*phase;
const smooth=value=>{const x=clamp(value,0,1);return x*x*(3-2*x);};
const color=(value,fallback)=>typeof value==='string'&&/^#[0-9a-f]{6}$/i.test(value)?value:fallback;
const channels=value=>[1,3,5].map(at=>parseInt(value.slice(at,at+2),16));
const lifetimeColor=(start,end,phase)=>'rgb('+start.map((value,index)=>Math.round(mix(value,end[index],phase))).join(',')+')';

// Only immutable decoded images are shared across render calls. Canvas sources
// are mutable, so their tint results live for this invocation only.
const imageKeys=new WeakMap(),tintCache=new Map();
let nextImageKey=0;
const MAX_TINTS=32,MAX_TINT_SIDE=256;
function cachedTint(image,fill,local,region){
 const width=image.naturalWidth||image.width,height=image.naturalHeight||image.height;
 const localKey=[region.x,region.y,region.w,region.h,fill].join(':');
 if(local.has(localKey))return local.get(localKey);
 const immutable=typeof image.getContext!=='function';
 let key;
 if(immutable){
  const source=image.currentSrc||image.src||'';let identity=imageKeys.get(image);
  if(!identity||identity.source!==source||identity.width!==width||identity.height!==height){identity={id:++nextImageKey,source,width,height};imageKeys.set(image,identity);}
  key=identity.id+':'+localKey;
  if(tintCache.has(key)){
   const cached=tintCache.get(key);tintCache.delete(key);tintCache.set(key,cached);local.set(localKey,cached);if(local.size>MAX_TINTS)local.delete(local.keys().next().value);return cached;
  }
 }
 const scale=Math.min(1,MAX_TINT_SIDE/Math.max(region.w,region.h));
 const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(region.w*scale));canvas.height=Math.max(1,Math.round(region.h*scale));
 const ctx=canvas.getContext('2d');
 if(region.x===0&&region.y===0&&region.w===width&&region.h===height)ctx.drawImage(image,0,0,canvas.width,canvas.height);
 else ctx.drawImage(image,region.x,region.y,region.w,region.h,0,0,canvas.width,canvas.height);
 ctx.globalCompositeOperation='source-in';ctx.fillStyle=fill;ctx.fillRect(0,0,canvas.width,canvas.height);
 local.set(localKey,canvas);if(local.size>MAX_TINTS)local.delete(local.keys().next().value);
 if(immutable){tintCache.set(key,canvas);if(tintCache.size>MAX_TINTS)tintCache.delete(tintCache.keys().next().value);}
 return canvas;
}
function imageLayout(width,height,p){
 const left=number(p.cropLeft,0,0,.95),right=number(p.cropRight,0,0,.95),top=number(p.cropTop,0,0,.95),bottom=number(p.cropBottom,0,0,.95);
 if(left+right>=1||top+bottom>=1)return null;
 const columns=Math.floor(number(p.sheetColumns,1,1,16)),rows=Math.floor(number(p.sheetRows,1,1,16)),total=columns*rows;
 const start=Math.floor(number(p.frameStart,0,0,total-1)),remaining=total-start,count=p.frameCount>0?Math.floor(number(p.frameCount,remaining,1,remaining)):remaining;
 return {x:left*width,y:top*height,w:width*(1-left-right)/columns,h:height*(1-top-bottom)/rows,columns,start,count};
}
function spriteFrame(layout,p,sprite,single,moving,random){
 let offset=0;
 if(layout.count>1&&(p.frameMode==='random'||p.frameMode==='randomLoop')){
  const tick=p.frameMode==='randomLoop'&&moving?Math.floor(Math.max(0,sprite.age)*number(p.frameRate,12,0,60)):0;
  const salt=(sprite.cycle??0)+':sprite:frame'+(p.frameMode==='randomLoop'?':'+tick:'');
  offset=Math.min(layout.count-1,Math.floor(number(random?.(sprite.index??0,salt),0,0,1)*layout.count));
 }else if(moving&&layout.count>1){
  const steps=Math.floor(Math.max(0,sprite.age)*number(p.frameRate,12,0,60));
  if(p.frameMode==='life')offset=single?Math.min(layout.count-1,steps):Math.min(layout.count-1,Math.floor(sprite.phase*layout.count));
  else if(p.frameMode==='loop')offset=steps%layout.count;
  else if(p.frameMode==='pingpong'){const period=layout.count*2-2,at=steps%period;offset=at<layout.count?at:period-at;}
 }
 const frame=layout.start+offset;
 return {x:layout.x+frame%layout.columns*layout.w,y:layout.y+Math.floor(frame/layout.columns)*layout.h,w:layout.w,h:layout.h};
}
function spriteQuad(sprite,left,top,width,height,mirrorX,mirrorY){
 const cos=Math.cos(sprite.angle),sin=Math.sin(sprite.angle);
 return [[left,top],[left+width,top],[left+width,top+height],[left,top+height]].map(([x,y])=>{x*=mirrorX;y*=mirrorY;return {x:sprite.x+x*cos-y*sin,y:sprite.y+x*sin+y*cos};});
}
function spriteTransform(p){return {scaleX:number(p.scaleX,1,.05,8),scaleY:number(p.scaleY,1,.05,8),anchorX:number(p.anchorX,.5,0,1),anchorY:number(p.anchorY,.5,0,1),mirrorX:['x','both'].includes(p.mirror)?-1:1,mirrorY:['y','both'].includes(p.mirror)?-1:1};}
function spriteRectangle(sprite,frame,{scaleX,scaleY,anchorX,anchorY,mirrorX,mirrorY}){
 const size=sprite.radius*2,longest=Math.max(frame.w,frame.h),w=size*frame.w/longest*scaleX,h=size*frame.h/longest*scaleY,left=-w*anchorX,top=-h*anchorY;
 return {w,h,left,top,quad:spriteQuad(sprite,left,top,w,h,mirrorX,mirrorY)};
}
function decorationSprite(layer,height,time,center){
 const p=layer.params??{},moving=layer.motion?.enabled===true;
 return {phase:0,age:moving?Math.max(0,time):0,alpha:number(p.alphaStart,1,0,1),radius:height*number(p.sizeStart,.025,0,8),x:center.x,y:center.y,angle:number(p.rotation,0,-180,180)*Math.PI/180+(moving?number(p.spin,.1,-3,3)*TAU*time:0)};
}
/** The same geometry used for Canvas drawing and the drag transform overlay. */
export function getSpriteDecorationGeometry(layer,{rect,sizeHeightMm,image,timeSec=1.2}={}){
 if(layer?.kind!=='sprite'||layer.params?.renderMode!=='single'||!rect)return null;
 const p=layer.params,origin=layer.origin??{x:0,y:0,w:1,h:1},center={x:rect.x+(origin.x+origin.w/2)*rect.w,y:rect.y+(origin.y+origin.h/2)*rect.h};
 const moving=layer.motion?.enabled===true,time=moving?timeSec*(layer.motion.speed??1):1.2,h=Math.max(.01,sizeHeightMm??rect.h*origin.h);
 const shape=shapes.has(p.shape)?p.shape:'star',width=image&&(image.naturalWidth||image.width),height=image&&(image.naturalHeight||image.height);
 if(shape==='image'&&(!(width>0)||!(height>0)))return null;
 const layout=shape==='image'?imageLayout(width,height,p):{w:1,h:1};if(!layout)return null;
 const sprite=decorationSprite(layer,h,Number.isFinite(time)?time:1.2,center);if(sprite.radius<=0)return null;
 sprite.angle+=(layer.rotationDeg??0)*Math.PI/180;
 const transform=spriteTransform(p),box=spriteRectangle(sprite,layout,transform),rotationDeg=(layer.rotationDeg??0)+number(p.rotation,0,-180,180)+(moving?number(p.spin,.1,-3,3)*360*time:0);
 return {center,width:box.w,height:box.h,...transform,rotationDeg,corners:box.quad,sizeHeightMm:h,frameAspect:layout.w/layout.h};
}
function polygon(ctx,points,radius){ctx.beginPath();points.forEach(([x,y],index)=>index?ctx.lineTo(x*radius,y*radius):ctx.moveTo(x*radius,y*radius));ctx.closePath();ctx.fill();}
function drawShape(ctx,shape,radius){
 if(shape==='circle'){ctx.beginPath();ctx.arc(0,0,radius,0,TAU);ctx.fill();}
 else if(shape==='star')polygon(ctx,Array.from({length:10},(_,index)=>{const angle=index*TAU/10-Math.PI/2,r=index%2?.42:1;return [Math.cos(angle)*r,Math.sin(angle)*r];}),radius);
 else if(shape==='diamond')polygon(ctx,[[0,-1],[.68,0],[0,1],[-.68,0]],radius);
 else if(shape==='petal'){
  ctx.beginPath();ctx.moveTo(0,-radius);ctx.bezierCurveTo(radius*.9,-radius*.55,radius*.75,radius*.5,0,radius);ctx.bezierCurveTo(-radius*.75,radius*.5,-radius*.9,-radius*.55,0,-radius);ctx.fill();
 }
 else if(shape==='rune'){
  ctx.lineWidth=radius*.13;ctx.beginPath();ctx.moveTo(-radius*.55,radius*.88);ctx.lineTo(-radius*.18,-radius*.92);ctx.lineTo(radius*.65,-radius*.55);ctx.lineTo(radius*.27,radius*.5);ctx.moveTo(-radius*.05,-radius*.65);ctx.lineTo(-radius*.05,radius*.92);ctx.moveTo(-radius*.05,-radius*.13);ctx.lineTo(radius*.55,radius*.18);ctx.moveTo(-radius*.5,-radius*.06);ctx.lineTo(-radius*.88,-radius*.33);ctx.stroke();
 }
 else if(shape==='snowflake'){
  ctx.lineWidth=radius*.09;ctx.beginPath();
  for(let index=0;index<6;index++){
   const angle=index*TAU/6,dx=Math.cos(angle),dy=Math.sin(angle);ctx.moveTo(0,0);ctx.lineTo(dx*radius,dy*radius);
   for(const at of [.5,.76])for(const side of [-1,1]){const x=dx*radius*at,y=dy*radius*at,branch=angle+side*.82;ctx.moveTo(x,y);ctx.lineTo(x-Math.cos(branch)*radius*.24,y-Math.sin(branch)*radius*.24);}
  }
  ctx.stroke();
 }
}

// A jittered boundary is shared by the dying and newborn lifetimes. Each track
// therefore has one continuous age interval, with no gaps or overlapping births.
function lifetime(time,life,index,count,randomness,random){
 const offset=mix(index/count,random(index,'phase'),randomness);
 const boundary=cycle=>(cycle-offset+randomness*(random(index,cycle+':birth')-.5)*.35)*life;
 let cycle=Math.floor(time/life+offset),start=boundary(cycle),end=boundary(cycle+1);
 if(time<start){cycle--;end=start;start=boundary(cycle);}
 else if(time>=end){cycle++;start=end;end=boundary(cycle+1);}
 const duration=end-start;
 return {cycle,age:time-start,phase:clamp((time-start)/(duration>0?duration:life),0,1)};
}

/** Draw independent sprite lifetimes or one decoration in millimetre coordinates. */
export function drawSpriteEmitter(ctx,layer,{time=1.2,height,point,random,include,image,center,lifetimes=null}){
 if(layer.kind!=='sprite')return false;
 const p=layer.params??{},shape=shapes.has(p.shape)?p.shape:'star',h=Math.max(.01,Number.isFinite(height)?height:.01),single=p.renderMode==='single';
 const width=image&&(image.naturalWidth||image.width),imageHeight=image&&(image.naturalHeight||image.height);
 if(shape==='image'&&(!(width>0)||!(imageHeight>0)))return true;
 const layout=shape==='image'?imageLayout(width,imageHeight,p):null;if(shape==='image'&&!layout)return true;
 const count=Math.floor(number(p.count,24,1,120)),life=number(p.life,2,.2,12),startSize=h*number(p.sizeStart,.025,0,8),endSize=h*number(p.sizeEnd,.06,0,8);
 const travel=h*number(p.travel,.5,0,3),spread=number(p.spread,.5,0,2),direction=number(p.direction,-90,-180,180)*Math.PI/180,spin=number(p.spin,.1,-3,3),rotation=number(p.rotation,0,-180,180)*Math.PI/180;
 const gravity=h*number(p.gravity,0,-2,2),fadeIn=number(p.fadeIn,.1,0,.5),fadeOut=number(p.fadeOut,.35,0,1),alphaStart=number(p.alphaStart,1,0,1),alphaEnd=number(p.alphaEnd,0,0,1),drift=h*number(p.drift,.15,0,1),randomness=number(p.randomness,1,0,1);
 const transform=spriteTransform(p),{scaleX,scaleY,anchorX,anchorY,mirrorX,mirrorY}=transform;
 const first=channels(color(p.color,'#d6edff')),last=channels(color(p.color2,'#9c75ff')),fixedColor=lifetimeColor(first,first,0),t=Number.isFinite(time)?time:1.2,moving=!single||layer.motion?.enabled===true;
 const particles=[],localTints=new Map();
 if(single){
  const origin=Number.isFinite(center?.x)&&Number.isFinite(center?.y)?center:point?.(0,0,'sprite-even');
  if(origin&&alphaStart>.00001&&startSize>0)particles.push({...decorationSprite(layer,h,t,origin),fill:fixedColor});
 }else for(const state of lifetimes??Array.from({length:count},(_,index)=>({index,...lifetime(t,life,index,count,randomness,random),sizeScale:1}))){
  const {index,cycle,age,phase}=state;
  const alpha=state.alpha??mix(alphaStart,alphaEnd,phase)*(fadeIn?smooth(phase/fadeIn):1)*(fadeOut?smooth((1-phase)/fadeOut):1),radius=mix(startSize,endSize,phase)*state.sizeScale;
  if(alpha<=.00001||radius<=0)continue;
  const origin=point(index,lifetimes?cycle:randomness?cycle:0,randomness?'emit':'sprite-even');if(!origin)continue;
  const salt=cycle+':sprite:',variation=name=>(random(index,salt+name)-.5)*randomness;
  const slot=state.slot??index,total=state.count??count;
  const heading=direction+mix(total>1?slot/(total-1)-.5:0,random(index,salt+'heading')-.5,randomness)*spread*Math.PI,dx=Math.cos(heading),dy=Math.sin(heading);
  const distance=travel*phase*(1+variation('travel')*.5),sway=drift*.2*Math.sin(phase*TAU+variation('drift')*TAU)*Math.sin(phase*Math.PI);
  particles.push({index,cycle,phase,age,alpha,radius,x:origin.x+dx*distance-dy*sway,y:origin.y+dy*distance+dx*sway+gravity*age*age*.5,angle:rotation+variation('rotation')*TAU+spin*TAU*age,fill:lifetimeColor(first,last,phase)});
 }
 if(!lifetimes)particles.sort((a,b)=>b.phase-a.phase);
 ctx.save();
 try{
  ctx.lineCap='round';ctx.lineJoin='round';ctx.setLineDash([]);ctx.lineDashOffset=0;ctx.shadowBlur=0;ctx.shadowOffsetX=0;ctx.shadowOffsetY=0;ctx.filter='none';
  for(const sprite of particles){
   let quad;
   ctx.save();
   try{
    ctx.globalAlpha*=sprite.alpha;ctx.translate(sprite.x,sprite.y);ctx.rotate(sprite.angle);
    if(shape==='image'){
     const frame=spriteFrame(layout,p,sprite,single,moving,random),tinted=p.tint==='tint'||p.tint==='lifetime',source=tinted?cachedTint(image,p.tint==='tint'?fixedColor:sprite.fill,localTints,frame):image;
     const {w,h:hh,left,top,quad:corners}=spriteRectangle(sprite,frame,transform);
     ctx.scale(mirrorX,mirrorY);
     if(tinted||frame.x===0&&frame.y===0&&frame.w===width&&frame.h===imageHeight)ctx.drawImage(source,left,top,w,hh);
     else ctx.drawImage(source,frame.x,frame.y,frame.w,frame.h,left,top,w,hh);
     quad=corners;
    }else{
     ctx.fillStyle=sprite.fill;ctx.strokeStyle=sprite.fill;ctx.scale(scaleX*mirrorX,scaleY*mirrorY);ctx.translate((.5-anchorX)*sprite.radius*2,(.5-anchorY)*sprite.radius*2);drawShape(ctx,shape,sprite.radius);
     const extent=sprite.radius*(shape==='snowflake'?1.05:1),left=((.5-anchorX)*sprite.radius*2-extent)*scaleX,top=((.5-anchorY)*sprite.radius*2-extent)*scaleY;
     quad=spriteQuad(sprite,left,top,extent*2*scaleX,extent*2*scaleY,mirrorX,mirrorY);
    }
   }finally{ctx.restore();}
   // Older callers can consume a conservative circle. Generators use all four
   // corners to include the exact rotated image rectangle, including its anchor.
   include(sprite.x,sprite.y,Math.max(sprite.radius*1.5,...quad.map(p=>Math.hypot(p.x-sprite.x,p.y-sprite.y))),quad);
  }
 }finally{ctx.restore();}
 return true;
}
