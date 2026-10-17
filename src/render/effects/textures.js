import {effectRandom} from './random.js';

const smokeCache=new Map(),mistCache=new Map(),fireCache=new Map();let spark=null;
const SMOKE_TONES=[[74,62,58],[118,110,106],[168,164,160]];
const FIRE_RAMP=[[255,226,120],[255,170,50],[248,110,30],[222,62,24],[150,48,30],[118,104,98],[150,142,138]];
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t);};
function canvas(w,h=w){const c=document.createElement('canvas');c.width=w;c.height=h;return c;}
function noiseFactory(){
 const lattice=new Map();
 const hash=(x,y,seed)=>{const key=seed+':'+x+':'+y;if(!lattice.has(key))lattice.set(key,effectRandom(438913,'texture-'+seed,x,y));return lattice.get(key);};
 const value=(x,y,seed)=>{const ix=Math.floor(x),iy=Math.floor(y),fx=x-ix,fy=y-iy,u=fx*fx*(3-2*fx),v=fy*fy*(3-2*fy);return (hash(ix,iy,seed)*(1-u)+hash(ix+1,iy,seed)*u)*(1-v)+(hash(ix,iy+1,seed)*(1-u)+hash(ix+1,iy+1,seed)*u)*v;};
 return (x,y,seed)=>{let result=0,frequency=1,weight=.5;for(let octave=0;octave<5;octave++){result+=weight*value(x*frequency,y*frequency,seed+octave*17);frequency*=2.03;weight*=.5;}return result;};
}
function bakeNoise(width,height,variant,mist=false){
 const out=canvas(width,height),ctx=out.getContext('2d'),image=ctx.createImageData(width,height),fbm=noiseFactory(),seed=variant*101+(mist?317:7);
 for(let j=0;j<height;j++)for(let i=0;i<width;i++){
  const x=i/width*2-1,y=j/height*2-1,r=Math.hypot(x,y);
  const qx=fbm(x*1.2+1.7,y*1.2+9.2,seed),qy=fbm(x*1.2+8.3,y*1.2+2.8,seed+3);
  const n=fbm(x*1.3+qx*2.2,y*1.3+qy*2.2,seed+9),fall=smooth(1,.05,r);
  const alpha=Math.pow(Math.max(0,n-.2)/.8,1.1)*fall*(mist?1.4:1.7),k=(j*width+i)*4;
  image.data[k]=image.data[k+1]=image.data[k+2]=255;image.data[k+3]=clamp(alpha*255,0,255);
 }
 ctx.putImageData(image,0,0);const softened=canvas(width,height),soft=softened.getContext('2d');soft.filter='blur(1.4px)';soft.drawImage(out,0,0);return softened;
}
function tinted(source,tone){const out=canvas(source.width,source.height),ctx=out.getContext('2d');ctx.drawImage(source,0,0);ctx.globalCompositeOperation='source-in';ctx.fillStyle='rgb('+tone.join(',')+')';ctx.fillRect(0,0,out.width,out.height);return out;}

export function getSmokeTexture(variant=0,tone=0){
 const v=((Math.floor(variant)%4)+4)%4,t=clamp(Math.floor(tone),0,2),key=v+':'+t;
 if(!smokeCache.has(key)){
  const alphaKey=v+':alpha';if(!smokeCache.has(alphaKey))smokeCache.set(alphaKey,bakeNoise(128,128,v));
  smokeCache.set(key,tinted(smokeCache.get(alphaKey),SMOKE_TONES[t]));
 }
 return smokeCache.get(key);
}
export function getMistTexture(variant=0){
 const v=((Math.floor(variant)%3)+3)%3;
 if(!mistCache.has(v))mistCache.set(v,bakeNoise(128,64,v,true));
 return mistCache.get(v);
}
export function getFireTexture(temperature=0){
 const index=clamp(Math.round(temperature),0,6);
 if(!fireCache.has(index)){
  const [r,g,b]=FIRE_RAMP[index],next=FIRE_RAMP[Math.min(6,index+1)],out=canvas(64),ctx=out.getContext('2d'),gradient=ctx.createRadialGradient(32,32,0,32,32,32);
  gradient.addColorStop(0,'rgba('+Math.min(255,r+20)+','+Math.min(255,g+40)+','+Math.min(255,b+60)+',1)');
  gradient.addColorStop(.5,'rgba('+r+','+g+','+b+',.95)');gradient.addColorStop(.8,'rgba('+next.join(',')+',.55)');gradient.addColorStop(1,'rgba('+next.join(',')+',0)');
  ctx.fillStyle=gradient;ctx.fillRect(0,0,64,64);fireCache.set(index,out);
 }
 return fireCache.get(index);
}
export function getSparkTexture(){
 if(spark)return spark;
 spark=canvas(64);const ctx=spark.getContext('2d');
 const core=ctx.createRadialGradient(32,32,0,32,32,17);core.addColorStop(0,'#ffffff');core.addColorStop(.16,'#ffffffe6');core.addColorStop(.55,'#ffffff55');core.addColorStop(1,'#ffffff00');ctx.fillStyle=core;ctx.fillRect(0,0,64,64);
 for(const rotation of [0,Math.PI/2]){
  ctx.save();ctx.translate(32,32);ctx.rotate(rotation);const glow=ctx.createLinearGradient(-31,0,31,0);glow.addColorStop(0,'#ffffff00');glow.addColorStop(.44,'#ffffff80');glow.addColorStop(.5,'#ffffff');glow.addColorStop(.56,'#ffffff80');glow.addColorStop(1,'#ffffff00');ctx.fillStyle=glow;ctx.beginPath();ctx.moveTo(-31,0);ctx.lineTo(0,-2.7);ctx.lineTo(31,0);ctx.lineTo(0,2.7);ctx.closePath();ctx.fill();ctx.restore();
 }
 return spark;
}
