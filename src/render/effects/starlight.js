const TAU=Math.PI*2;
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const number=(value,fallback,min,max)=>Number.isFinite(value)?clamp(value,min,max):fallback;
const color=(value,fallback)=>typeof value==='string'&&/^#[0-9a-f]{6}$/i.test(value)?value:fallback;
const rgba=(hex,alpha)=>'rgba('+[1,3,5].map(at=>parseInt(hex.slice(at,at+2),16)).join(',')+','+alpha+')';

const STAMP_BYTES=16*1024*1024,stamps=new Map();
let stampBytes=0;

function ellipseLight(ctx,rx,ry,stops){
 ctx.save();ctx.scale(rx,ry);
 const gradient=ctx.createRadialGradient(0,0,0,0,0,1);
 for(const [at,tint,alpha] of stops)gradient.addColorStop(at,rgba(tint,alpha));
 ctx.fillStyle=gradient;ctx.fillRect(-1,-1,2,2);ctx.restore();
}

function lightStamp(ctx,side,notch,glow,extent,rayColor,coreColor){
 const key=[side,notch,glow,rayColor,coreColor].join(':');
 if(stamps.has(key)){const found=stamps.get(key);stamps.delete(key);stamps.set(key,found);return found;}
 const canvas=typeof OffscreenCanvas==='function'?new OffscreenCanvas(side,side):ctx.canvas?.ownerDocument?.createElement('canvas');
 if(!canvas)return null;
 canvas.width=canvas.height=side;
 const brush=canvas.getContext('2d',{alpha:true});if(!brush)return null;
 brush.translate(side/2,side/2);brush.scale(side/(extent*2),side/(extent*2));
 brush.globalCompositeOperation='lighter';
 if(glow>0)ellipseLight(brush,extent,extent,[[0,rayColor,Math.min(1,glow*.34)],[.1,rayColor,glow*.18],[.35,rayColor,glow*.035],[.7,rayColor,glow*.004],[1,rayColor,0]]);
 const width=.025+notch*.18;
 const rays=[[0,coreColor,.85],[.08,coreColor,.8],[.25,rayColor,.62],[.5,rayColor,.3],[.75,rayColor,.07],[1,rayColor,0]];
 ellipseLight(brush,1,width,rays);ellipseLight(brush,width,1,rays);
 const needle=.009+notch*.025,hot=[[0,coreColor,.9],[.15,coreColor,.8],[.4,rayColor,.38],[.7,rayColor,.065],[1,rayColor,0]];
 ellipseLight(brush,1,needle,hot);ellipseLight(brush,needle,1,hot);
 const core=.055+notch*.2;
 brush.globalCompositeOperation='source-over';
 ellipseLight(brush,core,core,[[0,coreColor,1],[.3,coreColor,1],[.6,coreColor,.85],[.85,rayColor,.35],[1,rayColor,0]]);
 const bytes=side*side*4;
 while(stamps.size&&stampBytes+bytes>STAMP_BYTES){const [oldKey,old]=stamps.entries().next().value;stamps.delete(oldKey);stampBytes-=old.width*old.height*4;old.width=old.height=1;}
 stamps.set(key,canvas);stampBytes+=bytes;return canvas;
}

/** Four diffraction spikes, a hot core and deterministic lifetime/twinkle fades. */
export function drawStarlight(ctx,layer,{time=1.2,height=1,point,random,include,lifetimes=null}){
 const p=layer.params??{},count=Math.floor(number(p.count,12,0,160)),size=number(p.size,.12,0,2);
 if(!count||!size||ctx.globalAlpha<=0)return false;
 const h=number(height,1,.01,1e6),t=number(time,1.2,-1e9,1e9);
 const notch=number(p.rays,.22,.03,.65),stretch=number(p.stretch,1.45,.25,4),glow=number(p.glow,.65,0,2);
 const life=number(p.life,2.8,.1,30),twinkle=number(p.twinkle,1,0,4),moving=twinkle>0,randomness=number(p.randomness,0,0,1);
 const rayColor=color(p.color,'#b8dfff'),coreColor=color(p.coreColor,'#ffffff'),extent=glow>0?1.15+glow*.5:1;
 const angle=(number(p.rotation,0,-180,180)/360+t*number(p.spin,.1,-3,3))%1*TAU;
 const matrix=ctx.getTransform?.(),scale=matrix?number(Math.max(Math.hypot(matrix.a,matrix.b),Math.hypot(matrix.c,matrix.d)),1,.01,1000):1;
 const seeded=(index,salt)=>number(random?.(index,'starlight:'+salt),.5,0,1);
 // One stable resolution covers the largest possible star in this recipe.
 // Per-star or per-frame buckets would evict each other at high print scales.
 const footprint=h*size*1.25*Math.max(1,stretch)*extent*scale*2.5*Math.max(1,...(layer.emission?.sizeCurve??[]).map(p=>p.value));
 const side=Math.min(2048,2**Math.ceil(Math.log2(Math.max(256,footprint))));
 let drawn=false,stamp;
 const states=lifetimes??Array.from({length:count},(_,index)=>{const age=moving?t/life+seeded(index,'phase'):0;return {index,cycle:Math.floor(age),phase:age-Math.floor(age),sizeScale:1};});
 for(const state of states){
  const {index,cycle,phase}=state;
  const envelope=moving?Math.sin(Math.PI*phase)**2:1;
  const pulse=moving?.5+.5*Math.cos(TAU*(t*twinkle+seeded(index,'twinkle'))):1;
  const alpha=state.alpha??envelope*(.65+.35*pulse);
  if(alpha<1/4096)continue;
  const anchor=point?.(index,lifetimes?cycle:0,'starlight');
  if(!anchor||!Number.isFinite(anchor.x)||!Number.isFinite(anchor.y))continue;
  let x=anchor.x,y=anchor.y;
  if(!lifetimes&&randomness>0&&moving&&cycle!==0){
   const next=point(index,cycle,'starlight');
   if(next&&Number.isFinite(next.x)&&Number.isFinite(next.y)){
    x+=(next.x-x)*randomness;y+=(next.y-y)*randomness;
   }
  }
  const radius=h*size*(.75+.5*seeded(index,'size'))*(.5+.5*Math.sqrt(envelope))*(.9+.1*pulse)*state.sizeScale;
  if(radius<=0)continue;
  stamp??=lightStamp(ctx,side,notch,glow,extent,rayColor,coreColor);if(!stamp)continue;
  ctx.save();
  try{
   ctx.globalAlpha*=alpha;ctx.translate(x,y);ctx.rotate(angle);ctx.scale(radius,radius*stretch);
   ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
   ctx.drawImage(stamp,-extent,-extent,extent*2,extent*2);
  }finally{ctx.restore();}
  include?.(x,y,radius*Math.max(1,stretch)*extent);drawn=true;
 }
 return drawn;
}
