import {createHash} from 'node:crypto';
export async function renderEffectFixture(page,recipe,options={}){
 const result=await page.evaluate(async({recipe,options})=>{
  const a=window.testApi;await a.ensureFont();
  const dpi=options.dpi??200,rect=options.rect??{x:24,y:30,w:42,h:28};
  const canvas=document.createElement('canvas');canvas.width=Math.round(90*dpi/25.4);canvas.height=Math.round(90*dpi/25.4);
  const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.setTransform(dpi/25.4,0,0,dpi/25.4,0,0);
  const draw=c=>{
   if(!options.emptySource){c.save();
    if(options.text){c.font='700 '+(14*25.4/72)+'px CardStudio';c.textBaseline='top';c.fillStyle='#ed3348';c.fillText('한글',rect.x+2,rect.y+3);c.fillStyle='#29cce8';c.fillText('별🙂',rect.x+15,rect.y+11);}
    else{c.fillStyle='#e85a38';c.beginPath();c.ellipse(rect.x+rect.w*.5,rect.y+rect.h*.5,rect.w*.22,rect.h*.32,0,0,Math.PI*2);c.fill();c.globalCompositeOperation='destination-out';c.beginPath();c.arc(rect.x+rect.w*.5,rect.y+rect.h*.5,rect.w*.07,0,Math.PI*2);c.fill();}
    c.restore();}
   return {fontPt:14,fits:true};
  };
  const report=a.renderVisualEffects(ctx,{rect,recipe,target:options.text?'text':options.standalone?'effect':'image',source:options.standalone?null:{key:'fixture',draw,drawPlainMask:draw},dpi,timeSec:options.timeSec??1.2,minFontPt:7,cache:a.createEffectCache()});
  const pixels=ctx.getImageData(0,0,canvas.width,canvas.height).data;let alpha=0,red=0,cyan=0;
  for(let i=0;i<pixels.length;i+=4)if(pixels[i+3]>0){alpha++;if(pixels[i]>170&&pixels[i+1]<100&&pixels[i+2]<130)red++;if(pixels[i]<100&&pixels[i+1]>140&&pixels[i+2]>150)cyan++;}
  const corners=[3,canvas.width*4-1,pixels.length-1,pixels.length-canvas.width*4+3].every(i=>pixels[i]===0);
  if(options.show){const box=document.createElement('div');box.style.cssText='display:inline-block;width:230px;margin:8px;vertical-align:top;color:#e9eef4;background:#1c2b40;border-radius:12px;padding:8px;font:14px sans-serif';const label=document.createElement('p');label.textContent=options.label||recipe.layers.map(l=>l.kind).join(' + ');canvas.style.cssText='width:230px;height:230px;display:block';box.append(label,canvas);document.body.append(box);}
  return {png:canvas.toDataURL('image/png'),alpha,red,cyan,transparentCorners:corners,report};
 },{recipe,options});
 result.hash=createHash('sha256').update(Buffer.from(result.png.split(',')[1],'base64')).digest('hex');return result;
}
import {VISUAL_EFFECT_CATALOG} from '../../src/model/visual-effects.js';

/** Exercise the visible particle or postprocessing entry point as appropriate. */
export async function addVisualLayer(page,kind){
 const particle=VISUAL_EFFECT_CATALOG[kind]?.generative;
 await page.locator(particle?'#effect-emitter-preset':'#effect-layer-kind').selectOption(kind);
 await page.locator(particle?'#effect-particle-add':'#effect-layer-add').click();
}
