import {cardAttributes} from '../model/types.js';
import {finalHp} from '../model/project.js';
import {cardProblemLabel} from '../model/problem-details.js';
import {getEffectFrameSec} from '../model/visual-effects.js';
import {createEffectCache,renderVisualEffects} from './effects/composite.js';
import {makeSurface,paintSurface} from './effects/masks.js';
import {warpTextSources} from './effects/text-warp.js';
import {drawText} from './text.js';
import {selectedKeywords,keywordTextSpans,keywordsForText} from '../model/keywords.js';
import {resolveSkillEffect} from '../model/skill-references.js';
import {skillNameSpans} from '../model/skill-name-styles.js';
import {fitRichText,drawRichText,drawKeywordBadges,layoutSkillNameRuns,drawRichTextNameRun,fitKeywordBadges,layoutKeywordBadgeRuns,drawKeywordBadgeRun} from './keywords.js';
import {drawAttributes,drawDice} from './icons.js';
import {effectPlaybackTime,isEffectPlaybackTarget} from '../model/effect-playback.js';
import {textFieldForElement,mergeTextSpans,getTextRanges} from '../model/text-ranges.js';
export function resolveElement(project,target,e){
 const b=e.binding;if(!b)return e.type==='image'?e.assetId:e.type==='dice'?e.dice:e.content||'';
 if(b.field==='name')return target.name;
 if(b.field==='hp')return 'HP '+finalHp(target);
 if(b.field==='art')return target.artAssetId;
 if(b.field==='item.effect')return target.effect;
 if(b.field==='item.keywords')return selectedKeywords(project,target,'badge');
 const passive=(target.passives||[]).find(s=>s.id===b.skillId),skill=passive||(target.actives||[]).find(s=>s.id===b.skillId);
 if(b.field==='skill.name')return (passive?'패시브':'액티브')+' · '+(skill?.name||'');
 if(b.field==='skill.effect')return resolveSkillEffect(target,skill).text;
 if(b.field==='skill.keywords')return selectedKeywords(project,skill,'badge');
 return skill?.dice;
}
export function drawImageElement(ctx,image,rect,style){
 if(!image)return;const iw=image.naturalWidth||image.width,ih=image.naturalHeight||image.height;
 ctx.save();ctx.beginPath();ctx.rect(rect.x,rect.y,rect.w,rect.h);ctx.clip();
 if(style.fit==='contain'){const scale=Math.min(rect.w/iw,rect.h/ih);ctx.drawImage(image,rect.x+(rect.w-iw*scale)/2,rect.y+(rect.h-ih*scale)/2,iw*scale,ih*scale);}
 else {const scale=Math.max(rect.w/iw,rect.h/ih),sw=rect.w/scale,sh=rect.h/scale;ctx.drawImage(image,(iw-sw)*(style.cropX??.5),(ih-sh)*(style.cropY??.5),sw,sh,rect.x,rect.y,rect.w,rect.h);}ctx.restore();
}
export function renderCard(ctx,project,target,assets,dpi,options={}){
 // A reused output canvas can change path antialiasing after filtered draws.
 // Isolate each card on a fresh surface and transfer its finished pixels.
 // Effects retain their own drawing and analysis surface settings.
 const w=project.settings.cardWidthMm,h=project.settings.cardHeightMm,surface=makeSurface({x:0,y:0,w,h},dpi);
 const report=drawCard(surface.ctx,project,target,assets,dpi,options);
 ctx.canvas.width=surface.canvas.width;ctx.canvas.height=surface.canvas.height;
 ctx.putImageData(surface.ctx.getImageData(0,0,surface.canvas.width,surface.canvas.height),0,0);
 ctx.setTransform(surface.scale,0,0,surface.scale,0,0);return report;
}
function drawCard(ctx,project,target,assets,dpi,{timeSec=getEffectFrameSec(project),effectCache=createEffectCache(),onEffectGeometry,playbackTarget=null,frozenTimeSec=getEffectFrameSec(project)}={}){
 const s=project.settings,scale=dpi/25.4,w=s.cardWidthMm,h=s.cardHeightMm;
 ctx.canvas.width=Math.round(w*scale);ctx.canvas.height=Math.round(h*scale);ctx.setTransform(scale,0,0,scale,0,0);
 ctx.save();ctx.setTransform(1,0,0,1,0,0);ctx.fillStyle='#fffdf8';ctx.fillRect(0,0,ctx.canvas.width,ctx.canvas.height);ctx.restore();
 const problems=[],nameIssues=new Set(),issue=(code,message,e,severity,skillId)=>{
  const key=skillId&&[code,e?.id,skillId,message].join(':');if(key&&nameIssues.has(key))return;if(key)nameIssues.add(key);
  problems.push({code,message:cardProblemLabel(target,e,skillId)+': '+message,cardId:target.id,elementId:e?.id,...(severity?{severity}:{}),...(skillId?{skillId}:{})});
 };
 effectCache.prepare(project,target,assets);
 const timeOptions={timeSec,frozenTimeSec,playbackTarget},effectTime=(e,skillId=null,textRangeId=null,keywordId=null)=>effectPlaybackTime(timeOptions,{elementId:e?.id??null,skillId,textRangeId,keywordId});
 const visibleElements=target.elements,foreground=[];
 const attributes=cardAttributes(target);
 const textTypes=['text','rank','dice','keywords','attribute'],maskDpi=Math.min(dpi,150),work={x:-12,y:-12,w:w+24,h:h+24};
 const active=recipe=>recipe?.layers.some(l=>l.enabled&&l.opacity>0);
 const textInfos=new Map(visibleElements.filter(e=>e.type==='text').map(e=>{
  const value=resolveElement(project,target,e)||'',field=e.binding?.field;
  const textField=textFieldForElement(target,e),owner=textField?.owner;
  const reference=field==='skill.effect'?resolveSkillEffect(target,owner):{text:value,skillReferences:[],missing:[]};
  const names=!field||['skill.name','skill.effect','item.effect'].includes(field)?skillNameSpans(target,value,{skillReferences:reference.skillReferences,titleSkillId:field==='skill.name'?e.binding.skillId:null}):[];
  const keywords=keywordsForText(project,owner,textField?.field==='name'?'title':'inline',value),shared=keywordTextSpans(value,project.keywords||[],names);
  const ranges=field==='skill.name'?[]:field==='skill.effect'?(reference.textRanges?.effect||[]):getTextRanges(owner,textField?.field);
  const spans=ranges.length?mergeTextSpans(value,shared,ranges,textField?.prefix.length||0):shared;
  const layout=spans.length?fitRichText(ctx,value,e.rect,e.style,s.minFontPt,keywords,reference.skillReferences,spans):null;
  const runs=layout?layoutSkillNameRuns(layout,e.rect,e.style):[],key=spans.length?JSON.stringify([value,e.rect,e.style,reference.skillReferences,keywords,spans]):'';
  return [e.id,{value,reference,keywords,spans,layout,runs,key}];
 }));
 const readableKey=[...textInfos.values()].map(info=>info.key).filter(Boolean).join('|');
 const drawRawText=(g,e,options={})=>{
  const info=textInfos.get(e.id);
  return drawRichText(g,info.value,e.rect,e.style,s.minFontPt,info.keywords,assets,{skillReferences:info.reference.skillReferences,skillNameSpans:info.spans,layout:info.layout,...options});
 };
 const movingMask=visibleElements.some(e=>e.style.visualEffects?.layers.some(l=>l.kind==='textWarp'&&l.enabled&&l.opacity>0&&l.motion.enabled&&l.params.wave));
 const maskTimeKey=movingMask?JSON.stringify(visibleElements.filter(e=>e.style.visualEffects?.layers.some(l=>l.kind==='textWarp'&&l.enabled&&l.opacity>0&&l.motion.enabled&&l.params.wave)).map(e=>[e.id,effectTime(e)])):0;
 const paintReadable=(g,e)=>{
  const value=resolveElement(project,target,e),r=e.rect,style=e.style;
  if(e.type==='text'){
   return drawRawText(g,e);
  }
  if(e.type==='rank')return drawText(g,target.rank||'',r,style,s.minFontPt);
  if(e.type==='dice'&&value)return drawDice(g,value,r,style,s.minFontPt);
  if(e.type==='keywords')return drawKeywordBadges(g,Array.isArray(value)?value:[],r,style,s.minFontPt,assets);
  if(e.type==='attribute')return drawAttributes(g,attributes,r,style,s.minFontPt,target.kind);
 };
 const expandReadable=mask=>{
  const expanded=makeSurface(work,maskDpi);
  for(let i=0;i<16;i++){const angle=i*Math.PI/8;expanded.ctx.save();expanded.ctx.translate(Math.cos(angle)*.6,Math.sin(angle)*.6);paintSurface(expanded.ctx,mask);expanded.ctx.restore();}
  paintSurface(expanded.ctx,mask);
  const soft=makeSurface(work,maskDpi);soft.ctx.filter='blur('+(.4*soft.scale)+'px)';paintSurface(soft.ctx,expanded);soft.ctx.filter='none';paintSurface(soft.ctx,mask);return soft;
 };
 const protectionFor=ownerId=>{const key='readable:'+ownerId+':'+maskDpi+':'+maskTimeKey+':'+readableKey;return effectCache.memo(key,()=>{
  const mask=makeSurface(work,maskDpi);
  for(const e of visibleElements)if(e.id!==ownerId&&textTypes.includes(e.type)){
   const raw=effectCache.memo('readable-source:'+e.id+':'+maskDpi+':'+(textInfos.get(e.id)?.key||''),()=>{const surface=makeSurface(work,maskDpi);paintReadable(surface.ctx,e);return surface;});
   const warp=e.style.visualEffects?.layers.find(l=>l.kind==='textWarp'&&l.enabled&&l.opacity>0);
   const image=warp?warpTextSources(raw,raw,{rect:e.rect,params:warp.params,timeSec:warp.motion.enabled?effectTime(e)*warp.motion.speed:0,dpi:maskDpi}).source:raw;
   paintSurface(mask.ctx,image);
  }
  const protection=expandReadable(mask);protection.cacheKey=key;return protection;
 });};
 const nameProtectionFor=(e,run)=>{const key='readable-name:'+e.id+':'+run.id+':'+maskDpi+':'+readableKey+':'+maskTimeKey;return effectCache.memo(key,()=>{
  const own=makeSurface(work,maskDpi);drawRawText(own.ctx,e,{excludeNameRun:run});
  const mask=expandReadable(own);paintSurface(mask.ctx,protectionFor(e.id));mask.cacheKey=key;return mask;
 });};
 const effects=(e,rect,recipe,source,{context=ctx,protection=protectionFor(e?.id),skillId,runId,textRangeId,keywordId}={})=>{
  const frozen=playbackTarget&&!isEffectPlaybackTarget(playbackTarget,{elementId:e?.id??null,skillId,textRangeId,keywordId});
  const outputCacheKey=frozen?'frozen-effect:'+JSON.stringify([e?.id,skillId,textRangeId,keywordId,runId,dpi,effectTime(e,skillId,textRangeId,keywordId),rect,recipe,source?.key]):null,geometry=[],effectForeground=[];
  const report=renderVisualEffects(context,{rect,recipe,source,dpi,timeSec:effectTime(e,skillId,textRangeId,keywordId),minFontPt:s.minFontPt,cache:effectCache,outputCacheKey,assets,target:keywordId?'text':e?.type||'frame',textProtection:protection,textProtectionKey:protection?.cacheKey,cardRect:{x:0,y:0,w,h},onForeground:entry=>effectForeground.push(entry),onGeometry:g=>geometry.push({elementId:e?.id??null,...(skillId?{skillId}:{}),...(textRangeId?{textRangeId}:{}),...(keywordId?{keywordId}:{}),...(runId?{runId}:{}),rect:{...g.rect},sizeHeightMm:g.sizeHeightMm})});
  if(context===ctx)foreground.push(...effectForeground);
  const effectGeometry=[];
  const emitGeometry=entry=>{effectGeometry.push(entry);if(typeof onEffectGeometry==='function')onEffectGeometry({...entry,rect:{...entry.rect}});};
  for(const entry of geometry)emitGeometry(entry);
  for(const entry of report.nestedNameGeometry||[])emitGeometry(entry);
  const reportedProblems=[...report.problems.map(problem=>({...problem,...(skillId?{skillId}:{})})),...(report.nestedNameProblems||[])];
  for(const problem of reportedProblems)issue(problem.code,problem.message,e,problem.severity,problem.skillId);
  return {...report,reportedProblems,effectGeometry,effectForeground};
 };
 const drawFrame=g=>{g.strokeStyle='#b6c2b8';g.lineWidth=.28;g.beginPath();g.roundRect(1,1,w-2,h-2,2);g.stroke();};
 if(active(target.visualEffects))effects(null,{x:1,y:1,w:w-2,h:h-2},target.visualEffects,{key:'frame',draw:drawFrame});else drawFrame(ctx);
 if(target.kind==='monster')for(const skill of [...target.passives,...target.actives])for(const field of ['skill.name','skill.effect',...(skill.dice?['skill.dice']:[]),...(selectedKeywords(project,skill,'badge').length?['skill.keywords']:[])])if(!target.elements.some(e=>e.binding?.field===field&&e.binding.skillId===skill.id))issue('missing-skill','기술 “'+skill.name+'”의 표시 요소가 없습니다.');
 if(target.kind==='item'&&selectedKeywords(project,target,'badge').length&&!target.elements.some(e=>e.binding?.field==='item.keywords'))issue('missing-skill','아이템의 키워드 표시 요소가 없습니다.');
 for(const e of visibleElements){
  const r=e.rect,style=e.style,value=resolveElement(project,target,e);
  if(r.x<-.001||r.y<-.001||r.x+r.w>w+.001||r.y+r.h>h+.001){
   const mm=value=>Number(value.toFixed(3)),over=[];
   if(r.x<-.001)over.push('왼쪽 '+mm(-r.x)+' mm');if(r.y<-.001)over.push('위쪽 '+mm(-r.y)+' mm');
   if(r.x+r.w>w+.001)over.push('오른쪽 '+mm(r.x+r.w-w)+' mm');if(r.y+r.h>h+.001)over.push('아래쪽 '+mm(r.y+r.h-h)+' mm');
   issue('out-of-bounds','영역 x '+r.x+', y '+r.y+', 폭 '+r.w+', 높이 '+r.h+' mm가 카드 폭 '+w+', 높이 '+h+' mm에서 '+over.join(', ')+' 벗어납니다.',e);
  }
  if(['text','rank','attribute','dice','keywords'].includes(e.type)&&(style.fontPt??s.minFontPt)<s.minFontPt)issue('font-min','글자 크기 '+style.fontPt+'pt가 최소 '+s.minFontPt+'pt보다 작습니다.',e);
  ctx.save();let result;
  if(e.type==='rect'){ctx.fillStyle=style.fill||'#edf1eb';ctx.fillRect(r.x,r.y,r.w,r.h);if(style.strokeWidthMm){ctx.strokeStyle=style.color||'#536d5e';ctx.lineWidth=style.strokeWidthMm;ctx.strokeRect(r.x,r.y,r.w,r.h);}}
  else if(e.type==='image'){
   if(style.fill){ctx.fillStyle=style.fill;ctx.fillRect(r.x,r.y,r.w,r.h);}
   if(value){const image=assets.get(value);if(image){const source={key:e.id,draw:g=>drawImageElement(g,image,r,style)};if(active(style.visualEffects))effects(e,r,style.visualEffects,source);else source.draw(ctx);}else issue('image-missing','그림을 불러오지 못했습니다.',e);}
  }
  else if(e.type==='effect')effects(e,r,style.visualEffects||{seed:0,layers:[]},null);
  else if(e.type==='attribute')result=drawAttributes(ctx,attributes,r,style,s.minFontPt,target.kind);
  else if(e.type==='rank')result=drawText(ctx,target.rank||'',r,style,s.minFontPt);
  else if(e.type==='dice'&&value)result=drawDice(ctx,value,r,style,s.minFontPt);
  else if(e.type==='keywords'){
   const keywords=Array.isArray(value)?value:[],layout=fitKeywordBadges(ctx,keywords,r,style,s.minFontPt),runs=layoutKeywordBadgeRuns(layout,r),key=JSON.stringify([keywords,r,style]);
   result=drawKeywordBadges(ctx,keywords,r,style,s.minFontPt,assets,{layout,skipNameEffects:true});
   for(const run of runs)if(active(run.style.visualEffects)){
    const maskKey='readable-badge:'+e.id+':'+run.id+':'+maskDpi+':'+key+':'+readableKey+':'+maskTimeKey;
    const protection=effectCache.memo(maskKey,()=>{
     const own=makeSurface(work,maskDpi);drawKeywordBadges(own.ctx,keywords,r,style,s.minFontPt,assets,{labelsOnly:true,excludeKeywordRun:run.id});
     const mask=expandReadable(own);paintSurface(mask.ctx,protectionFor(e.id));mask.cacheKey=maskKey;return mask;
    });
    effects(e,run.rect,run.style.visualEffects,{key:e.id+':'+run.id+':'+key,draw:g=>drawKeywordBadgeRun(g,run,r,style)},{protection,keywordId:run.keywordId,runId:run.id});
   }
  }
  else if(e.type==='text'){
   const info=textInfos.get(e.id),{reference}=info;
   const warpScale=recipe=>recipe?.layers.find(layer=>layer.kind==='textWarp'&&layer.enabled&&layer.opacity>0)?.params.scaleY??1;
   const wholeScale=warpScale(style.visualEffects);
   for(const run of info.runs){
    const nameScale=warpScale(run.style.visualEffects);
    if(nameScale!==1&&wholeScale!==1&&(run.fontPt??info.layout.fontPt)*nameScale*wholeScale<s.minFontPt-.001)issue('effect-font-minimum','이름과 요소를 함께 압축한 글자 크기가 '+((run.fontPt??info.layout.fontPt)*nameScale*wholeScale).toFixed(2)+'pt로 최소 '+s.minFontPt+'pt보다 작습니다. 이름 세로 배율 '+nameScale+'배 × 요소 세로 배율 '+wholeScale+'배입니다.',e,undefined,run.skillId);
   }
   const draw=(g,plainMask=false)=>{
    if(plainMask)return drawRawText(g,e,{plainMask:true});
    const layout=drawRawText(g,e,{skipNameEffects:true}),nestedNameProblems=[],nestedNameGeometry=[],nestedNameForeground=[];
    for(const run of info.runs)if(active(run.style.visualEffects)){
     const source={key:e.id+':name:'+run.id+':'+info.key,draw:surface=>drawRichTextNameRun(surface,info.layout,run,r,style,assets)};
     const report=effects(e,run.rect,run.style.visualEffects,source,{context:g,protection:nameProtectionFor(e,run),skillId:run.skillId,runId:run.id,textRangeId:run.textRangeId,keywordId:run.keywordId});
     nestedNameProblems.push(...report.reportedProblems);nestedNameGeometry.push(...report.effectGeometry);if(g!==ctx)nestedNameForeground.push(...report.effectForeground);
    }
    // readSource caches the composed pixels and this result together. Keep
    // nested diagnostics and transform geometry with those pixels for warm previews.
    return nestedNameProblems.length||nestedNameGeometry.length||nestedNameForeground.length?{...layout,...(nestedNameProblems.length?{nestedNameProblems}:{}),...(nestedNameGeometry.length?{nestedNameGeometry}: {}),...(nestedNameForeground.length?{nestedNameForeground}:{})}:layout;
   };
   if(reference.missing.length)issue('missing-skill-reference','참조한 스킬이 삭제되었어요. 표시된 이름은 유지되며 스킬 참조를 다시 고를 수 있어요.',e,'warning');
   const movingNames=info.runs.filter(run=>run.style.visualEffects?.layers.some(layer=>layer.enabled&&layer.opacity>0&&layer.motion?.enabled));
   const sourceKey=e.id+(info.key?':named:'+info.key+':'+(movingNames.length?JSON.stringify(movingNames.map(run=>[run.id,effectTime(e,run.skillId,run.textRangeId,run.keywordId)])):0):'');
   result=active(style.visualEffects)?effects(e,r,style.visualEffects,{key:sourceKey,draw:g=>draw(g),drawPlainMask:g=>draw(g,true)}):draw(ctx);
  }
  if(result&&!result.fits){
   const lines=result.lines?.length,font=result.fontPt;
   const detail=lines&&font?font+'pt로 줄여도 '+lines+'줄이 필요합니다. 필요한 높이 '+(result.heightMm??lines*font*25.4/72*1.22).toFixed(2)+'mm, 현재 영역 '+r.w+' × '+r.h+'mm입니다.':'현재 '+r.w+' × '+r.h+'mm 영역에 '+(e.type==='dice'?'주사위 2열 × 3행과 조건문':e.type==='keywords'?'키워드 배지':'내용')+'이 들어가지 않습니다.';
   issue('text-overflow',detail,e);
  }
  ctx.restore();
 }
 for(const entry of foreground){ctx.save();ctx.globalAlpha*=entry.opacity;ctx.globalCompositeOperation=entry.blendMode;paintSurface(ctx,entry.surface);ctx.restore();}
 return {problems};
}
