import {VISUAL_EFFECT_CATALOG,upgradeVisualEffects} from '../../model/visual-effects.js';
import {DEFAULT_BLEND_MODE,normalizeBlendMode} from '../../model/blend-modes.js';
import {makeSurface,paintSurface,alphaBounds,unionBounds} from './masks.js';
import {warpTextSources} from './text-warp.js';
import {drawGenerator} from './generators.js';
import {analyzeShape} from './shape.js';
import {applyEffectFilter} from './filters.js';

export function createEffectCache(){
 const entries=new Map();let previous=null;
 return {
  prepare(project,target,assets){
   const materials=[...(assets||new Map())],changed=!previous||previous.project!==project||previous.target!==target||previous.assets!==assets||previous.materials.length!==materials.length||materials.some(([key,value],i)=>previous.materials[i]?.[0]!==key||previous.materials[i]?.[1]!==value);
   if(changed)entries.clear();previous={project,target,assets,materials};
  },
  memo(key,create){if(entries.has(key))return entries.get(key);const value=create();entries.set(key,value);if(entries.size>48)entries.delete(entries.keys().next().value);return value;},
  clear(){entries.clear();previous=null;}
 };
}
function readSource(source,work,dpi,cache){
 return cache.memo('source:'+source.key+':'+dpi+':'+JSON.stringify(work),()=>{
  const image=makeSurface(work,dpi),result=source.draw(image.ctx)||{},plain=makeSurface(work,dpi);
  if(source.drawPlainMask)source.drawPlainMask(plain.ctx);else paintSurface(plain.ctx,image);
  return {source:image,plainMask:plain,result};
 });
}
const clamp=v=>Math.max(0,Math.min(1,v));
const smooth=v=>{v=clamp(v);return v*v*(3-2*v);};
function shapeSurface(shape,work,dpi){
 const out=makeSurface(work,dpi),c=document.createElement('canvas');c.width=shape.width;c.height=shape.height;
 const g=c.getContext('2d'),image=g.createImageData(c.width,c.height);
 for(let i=0;i<shape.solid.length;i++){image.data[i*4]=255;image.data[i*4+1]=255;image.data[i*4+2]=255;image.data[i*4+3]=shape.solid[i]?255:0;}
 g.putImageData(image,0,0);out.ctx.drawImage(c,shape.work.x,shape.work.y,c.width/shape.scale,c.height/shape.scale);return out;
}
function frameBand(work,dpi,w,h,band){
 const out=makeSurface(work,dpi),c=out.ctx;c.fillStyle='#fff';c.beginPath();c.roundRect(0,0,w,h,2.5);c.fill();
 if(w>band*2&&h>band*2){c.globalCompositeOperation='destination-out';c.beginPath();c.roundRect(band,band,w-band*2,h-band*2,Math.max(.1,2.5-band*.25));c.fill();c.globalCompositeOperation='source-over';}
 return out;
}
function frameMask(work,dpi,w,h,frame){
 const out=frameBand(work,dpi,w,h,frame.bandMm);
 if(frame.scope==='full'){out.ctx.fillStyle='#fff';out.ctx.fillRect(0,0,w,h);}
 if(frame.scope==='borderBleed'){
  const {canvas,scale}=out,c=out.ctx,bytes=c.getImageData(0,0,canvas.width,canvas.height);
  for(let y=0;y<canvas.height;y++)for(let x=0;x<canvas.width;x++){
   const mx=work.x+(x+.5)/scale,my=work.y+(y+.5)/scale,d=Math.min(mx,my,w-mx,h-my);
   if(d>=frame.bandMm&&d<frame.bandMm+6)bytes.data[(y*canvas.width+x)*4+3]=Math.round(255*(1-smooth((d-frame.bandMm)/6)));
  }c.putImageData(bytes,0,0);
 }
 return out;
}
function bloom(surface,solid,height){
 const out=makeSurface(surface.work,surface.dpi),halo=makeSurface(surface.work,surface.dpi),c=halo.ctx;
 // Keep automatic bloom restrained on light paper; a separate glow layer can
 // intentionally add stronger light without washing out every fire preset.
 c.save();c.filter='blur('+Math.max(.3,height*.145)*surface.scale+'px) saturate(1.6)';c.globalAlpha=.12;paintSurface(c,surface);c.restore();
 c.save();c.filter='blur('+Math.max(.12,height*.048)*surface.scale+'px) saturate(1.4)';c.globalAlpha=.1;paintSurface(c,surface);c.restore();
 c.globalCompositeOperation='destination-out';paintSurface(c,solid);c.globalCompositeOperation='source-over';
 paintSurface(out.ctx,halo);paintSurface(out.ctx,surface);return out;
}
function protectContribution(surface,protection){
 if(!protection)return surface;
 const out=makeSurface(surface.work,surface.dpi);paintSurface(out.ctx,surface);out.ctx.globalCompositeOperation='destination-out';out.ctx.globalAlpha=.85;paintSurface(out.ctx,protection);out.ctx.globalAlpha=1;out.ctx.globalCompositeOperation='source-over';return out;
}
function scopeWeights(shape,work,dpi,width,height,scope){
 if(scope==='all'||!scope)return null;
 const scale=dpi/25.4,result=new Float32Array(width*height);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const sx=Math.max(0,Math.min(shape.width-1,Math.floor((work.x+(x+.5)/scale-shape.work.x)*shape.scale))),sy=Math.max(0,Math.min(shape.height-1,Math.floor((work.y+(y+.5)/scale-shape.work.y)*shape.scale)));
  const inside=1-smooth((shape.distance[sy*shape.width+sx]+.1)/.2);result[y*width+x]=scope==='inside'?inside:1-inside;
 }return result;
}
function mixFilter(base,filtered,layer,shape,protection,cache,shapeKey,colorExemption){
 const out=makeSurface(base.work,base.dpi),w=out.canvas.width,h=out.canvas.height,a=base.ctx.getImageData(0,0,w,h),data=a.data;
 let b=filtered.ctx.getImageData(0,0,w,h);const mode=normalizeBlendMode(layer.blendMode);
 if(mode!==DEFAULT_BLEND_MODE){
  // A neutral filter is a no-op even when the selected mode would otherwise
  // blend the unchanged image with itself (changing translucent alpha or color).
  if(data.every((value,index)=>value===b.data[index]))return base;
  const blended=makeSurface(base.work,base.dpi);paintSurface(blended.ctx,base);blended.ctx.globalCompositeOperation=mode;paintSurface(blended.ctx,filtered);
  b=blended.ctx.getImageData(0,0,w,h);
 }
 // Normal deliberately keeps the original replacement interpolation: filters
 // that erase alpha must still remove pixels instead of drawing over the base.
 const scope=cache.memo('scope:'+shapeKey+':'+base.dpi+':'+layer.scope,()=>scopeWeights(shape,base.work,base.dpi,w,h,layer.scope));
 const protectedBytes=layer.protectText!==false&&protection?protection.ctx.getImageData(0,0,w,h).data:null;
 for(let i=0;i<w*h;i++){
  const k=i*4,m=layer.opacity*(scope?scope[i]:1)*(protectedBytes?1-.85*protectedBytes[k+3]/255:1)*(colorExemption?1-colorExemption[k+3]/255:1),aa=data[k+3]/255,ba=b.data[k+3]/255,alpha=aa*(1-m)+ba*m;
  for(let channel=0;channel<3;channel++)data[k+channel]=alpha?Math.round((data[k+channel]*aa*(1-m)+b.data[k+channel]*ba*m)/alpha):0;
  data[k+3]=Math.round(alpha*255);
 }out.ctx.putImageData(a,0,0);return out;
}
function obscuresText(surface,protection,base=null){
 if(!protection)return false;const w=surface.canvas.width,h=surface.canvas.height,p=protection.ctx.getImageData(0,0,w,h).data,g=surface.ctx.getImageData(0,0,w,h).data,b=base?.ctx.getImageData(0,0,w,h).data;
 let total=0,covered=0;
 for(let i=3;i<p.length;i+=4)if(p[i]>127){total++;if(g[i]>24&&(!b||Math.abs(g[i]-b[i])>12||Math.abs(g[i-1]-b[i-1])+Math.abs(g[i-2]-b[i-2])+Math.abs(g[i-3]-b[i-3])>24))covered++;}
 return total>0&&covered/total>.2;
}
export function renderVisualEffects(ctx,{rect,recipe,target,source,dpi,timeSec=1.2,minFontPt=7,cache=createEffectCache(),textProtection=null,cardRect=null,assets=null,onGeometry=null}){
 recipe=upgradeVisualEffects(recipe,target);
 const scale=dpi/25.4,w=cardRect?.w??ctx.canvas.width/scale,h=cardRect?.h??ctx.canvas.height/scale,work={x:-12,y:-12,w:w+24,h:h+24};
 const layers=recipe.layers.filter(l=>l.enabled&&l.opacity>0),warp=layers.find(l=>l.kind==='textWarp'),problems=[];
 const sourcesAt=resolution=>{
  const raw=readSource(source,work,resolution,cache);if(!warp)return raw;
  const params=warp.params,time=warp.motion.enabled?timeSec*warp.motion.speed:0;
  if(!params.arc&&!params.wave&&!params.skewDeg&&params.scaleX===1&&params.scaleY===1)return {...raw,verticalScale:1};
  const create=()=>({...warpTextSources(raw.source,raw.plainMask,{rect,params,timeSec:time,dpi:resolution}),result:raw.result});
  return warp.motion.enabled&&params.wave?create():cache.memo('warp:'+source.key+':'+resolution+':'+JSON.stringify(params)+':'+JSON.stringify(work),create);
 };
 const original=source?sourcesAt(dpi):{source:makeSurface(work,dpi),plainMask:makeSurface(work,dpi),result:{}};
 const result=original.result||{},frame=target==='frame'?(recipe.frame||{scope:'border',bandMm:4}):null;
 const shapeKey='shape:'+(source?.key||'independent')+':'+Math.min(dpi,150)+':'+JSON.stringify(warp?.params||{})+':'+(warp?.motion.enabled?timeSec:0)+':'+JSON.stringify(frame)+':'+JSON.stringify(rect);
 const shape=cache.memo(shapeKey,()=>{
  let mask;
  if(frame)mask=frameBand(work,Math.min(dpi,150),w,h,frame.bandMm);
  else if(source)mask=sourcesAt(Math.min(dpi,150)).plainMask;
  else {mask=makeSurface(work,Math.min(dpi,150));mask.ctx.fillRect(rect.x,rect.y,rect.w,rect.h);}
  return analyzeShape(mask,{fillHoles:!frame});
 });
 const solid=cache.memo(shapeKey+':solid:'+dpi,()=>shapeSurface(shape,work,dpi));
 let geometry=original.boundsMm??null,acc=original.source;
 if(warp&&result.fontPt*(original.verticalScale??warp.params.scaleY)<minFontPt-.001)problems.push({code:'effect-font-minimum',message:'글자 세로 압축 후 '+(result.fontPt*(original.verticalScale??warp.params.scaleY)).toFixed(2)+'pt로 최소 '+minFontPt+'pt보다 작습니다. 원래 '+result.fontPt+'pt × 세로 '+(original.verticalScale??warp.params.scaleY)+'배입니다.'});
 if(!source&&!layers.some(l=>VISUAL_EFFECT_CATALOG[l.kind]?.generative))problems.push({code:'empty-effect',severity:'warning',message:'불꽃이나 연기 등 모양을 만드는 효과를 추가하세요.'});
 // A warped neighboring title produces a new mask at each animation time.
 // Cache the conversion by that mask's identity, not this effect's source ID.
 const protection=textProtection&&cache.memo(textProtection,()=>new Map());
 if(protection&&!protection.has(dpi)){const out=makeSurface(work,dpi);paintSurface(out.ctx,textProtection);protection.set(dpi,out);}
 const protectionSurface=protection?.get(dpi);
 // Inline keywords and their icons keep their authored colors. Color overlays
 // still process the accumulated flame/smoke outside those original glyphs.
 const colorExemption=source?.drawPlainMask&&layers.some(l=>['gradient','sweep'].includes(l.kind))?cache.memo('color-exemption:'+shapeKey+':'+dpi,()=>{
  const out=makeSurface(work,dpi);paintSurface(out.ctx,original.source);out.ctx.globalCompositeOperation='destination-out';paintSurface(out.ctx,original.plainMask);return out.ctx.getImageData(0,0,out.canvas.width,out.canvas.height).data;
 }):null;
 const sizeHeightMm=frame?frame.bandMm:target==='text'&&result.fontPt?result.fontPt*25.4/72:shape.boundsMm?.h||rect.h;
 const generatorRect=frame?.scope==='full'?{x:0,y:0,w,h}:rect;
 onGeometry?.({rect:{...generatorRect},sizeHeightMm});
 let warning=false;
 for(const layer of layers){
  if(layer.kind==='textWarp')continue;
  if(VISUAL_EFFECT_CATALOG[layer.kind]?.generative){
   if(layer.kind==='sprite'&&layer.params.shape==='image'&&!assets?.get(layer.params.assetId))problems.push({code:'effect-image-missing',severity:'warning',message:'이미지·도형 입자 '+(recipe.layers.indexOf(layer)+1)+'번 레이어에 그릴 이미지가 없습니다. ‘입자 이미지’에서 그림을 가져오거나 도형 모양을 선택하세요.'});
   let generated=makeSurface(work,dpi);
   geometry=unionBounds(geometry,drawGenerator(generated.ctx,{...layer,opacity:1},{rect:generatorRect,seed:recipe.seed,timeSec,shape,sizeHeightMm,assets}));
   if(['flame','ember','lightning','particle','aura'].includes(layer.kind))generated=bloom(generated,solid,sizeHeightMm);
   if(layer.protectText!==false)generated=protectContribution(generated,protectionSurface);else if(obscuresText(generated,protectionSurface))warning=true;
   const next=makeSurface(work,dpi);next.ctx.save();next.ctx.globalAlpha=layer.opacity;
   // Placement determines draw order; the selected mode combines the second
   // draw with the first, just like two layers in their displayed stack order.
   const mode=normalizeBlendMode(layer.blendMode);
   if(layer.placement==='behind'){paintSurface(next.ctx,generated);next.ctx.globalAlpha=1;next.ctx.globalCompositeOperation=mode;paintSurface(next.ctx,acc);}
   else {next.ctx.globalAlpha=1;paintSurface(next.ctx,acc);next.ctx.globalAlpha=layer.opacity;next.ctx.globalCompositeOperation=mode;paintSurface(next.ctx,generated);}
   next.ctx.restore();acc=next;
  }else{
   const filtered=applyEffectFilter(acc,layer,{rect,timeSec,seed:recipe.seed});
   const next=mixFilter(acc,filtered,layer,shape,protectionSurface,cache,shapeKey,['gradient','sweep'].includes(layer.kind)?colorExemption:null);
   // Diagnose only the visible contribution after blending, opacity and scope.
   if(layer.protectText===false&&obscuresText(next,protectionSurface,acc))warning=true;
   acc=next;
  }
 }
 if(warning)problems.push({code:'effect-over-text',severity:'warning',message:'이펙트가 다른 글자를 덮습니다. 해당 레이어의 ‘글자 위에도 그리기’를 끄면 보호돼요.'});
 if(frame){
  const out=makeSurface(work,dpi);paintSurface(out.ctx,acc);out.ctx.globalCompositeOperation='destination-in';paintSurface(out.ctx,frameMask(work,dpi,w,h,frame));out.ctx.globalCompositeOperation='source-over';acc=out;geometry=null;
 }
 paintSurface(ctx,acc);
 const analysis=makeSurface(work,Math.min(120,dpi));paintSurface(analysis.ctx,acc);let bounds=alphaBounds(analysis);
 if(geometry&&(geometry.x<work.x||geometry.y<work.y||geometry.x+geometry.w>work.x+work.w||geometry.y+geometry.h>work.y+work.h))bounds=unionBounds(bounds,geometry);
 return {boundsMm:bounds,problems,hasVisibleContent:!!bounds,...result};
}
