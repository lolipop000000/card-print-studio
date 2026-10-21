const TAU=Math.PI*2;
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const number=(value,fallback,min,max)=>Number.isFinite(value)?clamp(value,min,max):fallback;
const color=(value,fallback)=>typeof value==='string'&&/^#[0-9a-f]{6}$/i.test(value)?value:fallback;
const rgba=(hex,alpha)=>'rgba('+[1,3,5].map(at=>parseInt(hex.slice(at,at+2),16)).join(',')+','+alpha+')';

function fourPoints(ctx,notch){
 ctx.moveTo(0,-1);
 ctx.bezierCurveTo(0,-notch,notch,0,1,0);
 ctx.bezierCurveTo(notch,0,0,notch,0,1);
 ctx.bezierCurveTo(0,notch,-notch,0,-1,0);
 ctx.bezierCurveTo(-notch,0,0,-notch,0,-1);
 ctx.closePath();
}

// Curves and gradients remain vectors at print resolution. No particle buffer,
// decoded texture or pixel readback is needed, even when the light changes size.
function paintLight(ctx,notch,glow,extent,rayColor,coreColor){
 if(glow>0){
  const halo=ctx.createRadialGradient(0,0,0,0,0,extent);
  halo.addColorStop(0,rgba(rayColor,glow*.35));
  halo.addColorStop(.22,rgba(rayColor,glow*.17));
  halo.addColorStop(.65,rgba(rayColor,glow*.05));
  halo.addColorStop(1,rgba(rayColor,0));
  ctx.save();
  ctx.beginPath();ctx.rect(-extent,-extent,extent*2,extent*2);fourPoints(ctx,notch);
  // Keep the halo outside the star so inherited opacity is applied once at its
  // center, instead of accumulating opacity in several overlapping glow passes.
  ctx.clip('evenodd');ctx.fillStyle=halo;ctx.fillRect(-extent,-extent,extent*2,extent*2);
  ctx.restore();
 }
 const fill=ctx.createRadialGradient(0,0,0,0,0,1);
 fill.addColorStop(0,coreColor);fill.addColorStop(.12,coreColor);
 fill.addColorStop(.45,rgba(rayColor,.97));fill.addColorStop(1,rgba(rayColor,.68));
 ctx.fillStyle=fill;ctx.beginPath();fourPoints(ctx,notch);ctx.fill();
}

/** Four concave rays with deterministic lifetime fades and a faster twinkle. */
export function drawStarlight(ctx,layer,{time=1.2,height=1,point,random,include}){
 const p=layer.params??{},count=Math.floor(number(p.count,12,0,160)),size=number(p.size,.12,0,2);
 if(!count||!size||ctx.globalAlpha<=0)return false;
 const h=number(height,1,.01,1e6),t=number(time,1.2,-1e9,1e9);
 const notch=number(p.rays,.22,.03,.65),stretch=number(p.stretch,1.45,.25,4),glow=number(p.glow,.65,0,2);
 const life=number(p.life,2.8,.1,30),twinkle=number(p.twinkle,1,0,4),moving=twinkle>0,randomness=number(p.randomness,0,0,1);
 const rayColor=color(p.color,'#b8dfff'),coreColor=color(p.coreColor,'#ffffff'),extent=glow>0?1.15+glow*.5:1;
 const angle=(number(p.rotation,0,-180,180)/360+t*number(p.spin,.1,-3,3))%1*TAU;
 const seeded=(index,salt)=>number(random?.(index,'starlight:'+salt),.5,0,1);
 let drawn=false;
 for(let index=0;index<count;index++){
  const age=moving?t/life+seeded(index,'phase'):0,cycle=Math.floor(age),phase=age-cycle;
  const envelope=moving?Math.sin(Math.PI*phase)**2:1;
  const pulse=moving?.5+.5*Math.cos(TAU*(t*twinkle+seeded(index,'twinkle'))):1;
  const alpha=envelope*(.65+.35*pulse);
  if(alpha<1/4096)continue;
  const anchor=point?.(index,0,'starlight');
  if(!anchor||!Number.isFinite(anchor.x)||!Number.isFinite(anchor.y))continue;
  let x=anchor.x,y=anchor.y;
  if(randomness>0&&moving&&cycle!==0){
   const next=point(index,cycle,'starlight');
   if(next&&Number.isFinite(next.x)&&Number.isFinite(next.y)){
    x+=(next.x-x)*randomness;y+=(next.y-y)*randomness;
   }
  }
  const radius=h*size*(.75+.5*seeded(index,'size'))*(.5+.5*Math.sqrt(envelope))*(.9+.1*pulse);
  ctx.save();
  try{
   ctx.globalAlpha*=alpha;ctx.translate(x,y);ctx.rotate(angle);ctx.scale(radius,radius*stretch);
   paintLight(ctx,notch,glow,extent,rayColor,coreColor);
  }finally{ctx.restore();}
  include?.(x,y,radius*Math.max(1,stretch)*extent);drawn=true;
 }
 return drawn;
}
