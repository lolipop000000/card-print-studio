import {newId} from '../model/types.js';

// Original procedural textures: bundled offline, with no external downloads or licenses.
export const PARTICLE_IMAGES=[['glow','부드러운 빛'],['sparkle','네 갈래 별빛'],['flare','긴 빛줄기'],['smoke','연기 덩어리'],['flame','불꽃'],['ring','빛의 고리'],['petal','꽃잎'],['snow','눈 결정'],['bubble','비눗방울'],['drop','물방울']];
const cache=new Map();
function radial(ctx,x,y,r,stops){const fill=ctx.createRadialGradient(x,y,0,x,y,r);for(const [at,color] of stops)fill.addColorStop(at,color);return fill;}
export function particleImageData(key){
 if(cache.has(key))return cache.get(key);
 if(!PARTICLE_IMAGES.some(([id])=>id===key))throw Error('기본 입자 이미지를 찾을 수 없어요.');
 const canvas=document.createElement('canvas');canvas.width=canvas.height=128;const ctx=canvas.getContext('2d');ctx.translate(64,64);ctx.scale(60,60);
 if(['glow','sparkle','flare'].includes(key)){
  ctx.fillStyle=radial(ctx,0,0,1,[[0,'#ffffff'],[.12,'#eafaff'],[.35,'#8bdfff99'],[1,'#60cfff00']]);ctx.fillRect(-1,-1,2,2);
  if(key!=='glow'){
   ctx.fillStyle='#f5fcff';ctx.beginPath();const narrow=key==='flare'?.035:.095;
   ctx.moveTo(0,-1);ctx.bezierCurveTo(narrow,-narrow,narrow,-narrow,1,0);ctx.bezierCurveTo(narrow,narrow,narrow,narrow,0,1);ctx.bezierCurveTo(-narrow,narrow,-narrow,narrow,-1,0);ctx.bezierCurveTo(-narrow,-narrow,-narrow,-narrow,0,-1);ctx.fill();
   ctx.fillStyle=radial(ctx,0,0,.24,[[0,'#ffffff'],[1,'#ffffff00']]);ctx.fillRect(-.24,-.24,.48,.48);
  }
 }else if(key==='smoke'){
  for(let i=0;i<7;i++){const a=i*2.4,r=.34+i*.023,x=Math.cos(a)*.34,y=Math.sin(a)*.3;ctx.fillStyle=radial(ctx,x,y,r,[[0,'#e7edf0cc'],[.4,'#c8d3db88'],[1,'#9baab800']]);ctx.fillRect(x-r,y-r,r*2,r*2);}
 }else if(key==='flame'){
  const fill=ctx.createLinearGradient(0,-1,0,1);fill.addColorStop(0,'#ff591800');fill.addColorStop(.4,'#ff7020dd');fill.addColorStop(.75,'#ffca4aff');fill.addColorStop(1,'#fff2b8');ctx.fillStyle=fill;
  ctx.beginPath();ctx.moveTo(0,-1);ctx.bezierCurveTo(.1,-.2,.95,.25,.45,.8);ctx.bezierCurveTo(.2,1,-.65,1,-.55,.2);ctx.bezierCurveTo(-.5,.5,-.05,-.45,0,-1);ctx.fill();
 }else if(key==='ring'||key==='bubble'){
  ctx.fillStyle=radial(ctx,0,0,1,key==='ring'?[[0,'#c4f6ff00'],[.62,'#c4f6ff00'],[.78,'#dcfaffee'],[.87,'#9bd9ff88'],[1,'#69c4ff00']]:[[0,'#c4f6ff08'],[.65,'#b6e7ff15'],[.84,'#b7cfff99'],[.9,'#ecfaffee'],[1,'#b3f3ff00']]);ctx.fillRect(-1,-1,2,2);
  if(key==='bubble'){ctx.strokeStyle='#ffffffdd';ctx.lineWidth=.055;ctx.beginPath();ctx.arc(0,0,.74,-2.6,-1.4);ctx.stroke();}
 }else if(key==='petal'){
  ctx.fillStyle=radial(ctx,-.2,-.2,1.5,[[0,'#fff0f8'],[.5,'#ffb9d5'],[1,'#eb6ba8']]);ctx.beginPath();ctx.moveTo(-.6,-.65);ctx.bezierCurveTo(.65,-1,.95,.3,.15,.8);ctx.bezierCurveTo(-.8,.5,-.95,-.15,-.6,-.65);ctx.fill();
 }else if(key==='snow'){
  ctx.strokeStyle='#e6f8ff';ctx.lineWidth=.045;ctx.lineCap='round';
  for(let i=0;i<6;i++){ctx.save();ctx.rotate(i*Math.PI/3);ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(0,-.85);for(const y of [-.4,-.63]){ctx.moveTo(-.16,y-.13);ctx.lineTo(0,y);ctx.lineTo(.16,y-.13);}ctx.stroke();ctx.restore();}
 }else{
  ctx.fillStyle=radial(ctx,-.2,.15,1.1,[[0,'#f1fcff'],[.4,'#9cdeff'],[1,'#429deed0']]);ctx.beginPath();ctx.moveTo(0,-.95);ctx.bezierCurveTo(.25,-.35,.8,.25,.4,.7);ctx.bezierCurveTo(0,1.1,-.8,.5,-.5,.05);ctx.closePath();ctx.fill();
 }
 const data=canvas.toDataURL('image/png');cache.set(key,data);return data;
}
export function createBuiltinParticleAsset(key){return {id:newId(),mime:'image/png',dataUrl:particleImageData(key),width:128,height:128,paintingId:null};}
