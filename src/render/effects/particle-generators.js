const TAU=Math.PI*2;
const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
const number=(v,fallback,min,max)=>Number.isFinite(v)?clamp(v,min,max):fallback;
const smooth=v=>{const t=clamp(v,0,1);return t*t*(3-2*t);};
const defaults={
 firefly:{color:'#b4d852',color2:'#e5f5a2',count:24,size:.028,travel:.45,spread:.65,life:3.2,direction:-90,fade:1.1},
 bubble:{color:'#339bbd',color2:'#a9e3ea',count:18,size:.065,travel:.5,spread:.45,life:3.8,direction:-90,fade:.8},
 petal:{color:'#e478a6',color2:'#f3b0c9',count:24,size:.055,travel:.65,spread:.65,life:3.5,direction:80,fade:1.1,spin:.35},
 leaf:{color:'#63994c',color2:'#b5c468',count:22,size:.06,travel:.65,spread:.7,life:3.5,direction:80,fade:1.2,spin:.25},
 snowflake:{color:'#6badd0',color2:'#d0e7f0',count:24,size:.05,travel:.6,spread:.55,life:4,direction:90,fade:.9,spin:.16},
 crystal:{color:'#6e7ac5',color2:'#bdcfef',count:20,size:.055,travel:.4,spread:.6,life:3.2,direction:-90,fade:1.2,spin:.2},
 confetti:{color:'#d95d7d',color2:'#69a6be',count:32,size:.045,travel:.65,spread:.9,life:3,direction:70,fade:1.2,spin:1.2},
 comet:{color:'#487fb9',color2:'#8fcee2',count:12,size:.035,travel:.7,spread:.3,life:2,direction:-50,fade:1.25},
 rain:{color:'#3d7b9d',color2:'#93b9cf',count:32,size:.022,travel:.8,spread:.2,life:1.25,direction:100,fade:1},
 dust:{color:'#ad865b',color2:'#dfc797',count:28,size:.035,travel:.3,spread:.9,life:4.5,direction:-85,fade:1.5},
 rune:{color:'#7756a9',color2:'#b995d6',count:18,size:.06,travel:.35,spread:.5,life:3,direction:-90,fade:1.4,spin:.15},
 vortex:{color:'#5466bb',color2:'#b7a1dd',count:28,size:.025,travel:.4,spread:.65,life:3.5,direction:-90,fade:1.1,spin:.65}
};
function channels(color){const hex=color.replace('#','');return [0,2,4].map(i=>parseInt(hex.slice(i,i+2),16));}
function rgba(color,alpha){return 'rgba('+channels(color).join(',')+','+alpha+')';}
function darken(color,weight=.48){const c=channels(color),ink=[37,43,52];return '#'+c.map((v,i)=>Math.round(v*(1-weight)+ink[i]*weight).toString(16).padStart(2,'0')).join('');}
function gradient(ctx,r,a,b){const g=ctx.createLinearGradient(-r,-r,r,r);g.addColorStop(0,a);g.addColorStop(1,b);return g;}
function paint(ctx,fill,ink,width){ctx.fillStyle=fill;ctx.fill();ctx.strokeStyle=ink;ctx.lineWidth=width;ctx.stroke();}
function polygon(ctx,points,r){ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x*r,y*r):ctx.moveTo(x*r,y*r));ctx.closePath();}
function glow(ctx,r,color,color2){
 const g=ctx.createRadialGradient(0,0,0,0,0,r);g.addColorStop(0,rgba(color2,.5));g.addColorStop(.3,rgba(color,.28));g.addColorStop(1,rgba(color,0));ctx.fillStyle=g;ctx.fillRect(-r,-r,r*2,r*2);
}
function firefly(ctx,r,p){
 glow(ctx,r*2.5,p.color,p.color2);
 ctx.fillStyle=rgba(p.color2,.3);for(const side of [-1,1]){ctx.beginPath();ctx.ellipse(side*r*.42,-r*.28,r*.38,r*.63,side*.35,0,TAU);ctx.fill();}
 ctx.fillStyle=p.ink;ctx.beginPath();ctx.ellipse(0,-r*.15,r*.28,r*.7,0,0,TAU);ctx.fill();
 ctx.fillStyle=p.color;ctx.beginPath();ctx.ellipse(0,r*.35,r*.58,r*.65,0,0,TAU);ctx.fill();ctx.fillStyle=p.color2;ctx.beginPath();ctx.ellipse(-r*.1,r*.35,r*.3,r*.4,0,0,TAU);ctx.fill();
}
function bubble(ctx,r,p){
 ctx.beginPath();ctx.arc(0,0,r,0,TAU);ctx.strokeStyle=p.ink;ctx.lineWidth=r*.13;ctx.stroke();
 ctx.strokeStyle=gradient(ctx,r,p.color2,p.color);ctx.lineWidth=r*.08;ctx.stroke();
 ctx.beginPath();ctx.arc(0,0,r*.77,Math.PI*1.07,Math.PI*1.48);ctx.strokeStyle=p.color2;ctx.lineWidth=r*.13;ctx.stroke();
 ctx.beginPath();ctx.arc(r*.6,r*.5,r*.1,0,TAU);ctx.fillStyle=p.color2;ctx.fill();
}
function petal(ctx,r,p){
 ctx.beginPath();ctx.moveTo(-r,0);ctx.bezierCurveTo(-r*.8,-r*.9,r*.4,-r,r*.9,-r*.25);ctx.bezierCurveTo(r*1.35,-r*.05,r*1.3,r*.5,r*.8,r*.7);ctx.bezierCurveTo(r*.2,r,-r*.75,r*.7,-r,0);
 paint(ctx,gradient(ctx,r,p.color2,p.color),p.ink,r*.085);
 ctx.beginPath();ctx.moveTo(-r*.83,0);ctx.quadraticCurveTo(0,-r*.08,r*.8,r*.48);ctx.strokeStyle=rgba(p.color2,.85);ctx.lineWidth=r*.08;ctx.stroke();
}
function leaf(ctx,r,p){
 ctx.beginPath();ctx.moveTo(-r*1.5,r*.15);ctx.bezierCurveTo(-r*.65,-r*.85,r*.55,-r*.85,r*1.5,-r*.22);ctx.bezierCurveTo(r*.6,r*.82,-r*.65,r*.65,-r*1.5,r*.15);
 paint(ctx,gradient(ctx,r,p.color2,p.color),p.ink,r*.085);
 ctx.beginPath();ctx.moveTo(-r*1.45,r*.15);ctx.quadraticCurveTo(0,-r*.05,r*1.42,-r*.2);
 for(const side of [-1,1])for(let i=0;i<3;i++){const x=(-.7+i*.6)*r;ctx.moveTo(x,0);ctx.lineTo(x+r*.4,side*r*(.37-Math.abs(i-1)*.07));}
 ctx.strokeStyle=p.ink;ctx.lineWidth=r*.065;ctx.stroke();
}
function snowflake(ctx,r,p){
 ctx.beginPath();for(let i=0;i<6;i++){const a=i*TAU/6,dx=Math.cos(a),dy=Math.sin(a);ctx.moveTo(0,0);ctx.lineTo(dx*r*1.25,dy*r*1.25);for(const at of [.52,.84])for(const side of [-1,1]){const x=dx*r*at,y=dy*r*at,b=a+side*.85;ctx.moveTo(x,y);ctx.lineTo(x-Math.cos(b)*r*.31,y-Math.sin(b)*r*.31);}}
 ctx.strokeStyle=p.ink;ctx.lineWidth=r*.19;ctx.stroke();ctx.strokeStyle=p.color2;ctx.lineWidth=r*.105;ctx.stroke();
 polygon(ctx,Array.from({length:6},(_,i)=>[Math.cos(i*TAU/6)*.25,Math.sin(i*TAU/6)*.25]),r);ctx.fillStyle=p.color;ctx.fill();
}
function crystal(ctx,r,p){
 const outline=[[0,-1.45],[.65,-.35],[.5,.9],[0,1.4],[-.75,.45],[-.6,-.55]];
 polygon(ctx,outline,r);ctx.fillStyle=p.color;ctx.fill();polygon(ctx,[[0,-1.45],[-.18,-.3],[0,1.4],[-.75,.45],[-.6,-.55]],r);ctx.fillStyle=p.color2;ctx.fill();
 polygon(ctx,[[0,-1.45],[.65,-.35],[.5,.9],[-.18,-.3]],r);ctx.fillStyle=rgba(p.ink,.32);ctx.fill();
 polygon(ctx,outline,r);ctx.strokeStyle=p.ink;ctx.lineWidth=r*.085;ctx.stroke();ctx.beginPath();ctx.moveTo(0,-r*1.45);ctx.lineTo(-r*.18,-r*.3);ctx.lineTo(0,r*1.4);ctx.moveTo(-r*.6,-r*.55);ctx.lineTo(-r*.18,-r*.3);ctx.lineTo(r*.65,-r*.35);ctx.stroke();
}
function confetti(ctx,r,p,index,tumble){
 ctx.scale(1,.3+.7*Math.abs(Math.cos(tumble)));
 const shapes=[[[-1.25,-.48],[1.1,-.38],[1.25,.48],[-1.1,.38]],[[-1,-.7],[1.2,-.35],[.65,.8],[-.75,.5]],[[-1.2,-.35],[.9,-.65],[1.15,.35],[-.9,.65]]];
 polygon(ctx,shapes[index%3],r);paint(ctx,gradient(ctx,r,p.color,p.color2),p.ink,r*.09);
 ctx.beginPath();ctx.moveTo(-r*.1,-r*.4);ctx.lineTo(r*.05,r*.4);ctx.strokeStyle=rgba(p.ink,.6);ctx.lineWidth=r*.06;ctx.stroke();
}
function comet(ctx,r,p,length){
 const tail=ctx.createLinearGradient(-length,0,0,0);tail.addColorStop(0,rgba(p.color,0));tail.addColorStop(.25,rgba(p.color,.08));tail.addColorStop(.72,rgba(p.color,.55));tail.addColorStop(1,p.color2);
 ctx.beginPath();ctx.moveTo(-length,0);ctx.quadraticCurveTo(-length*.46,-r*.33,0,-r*.7);ctx.arc(0,0,r*.7,-Math.PI/2,Math.PI/2);ctx.quadraticCurveTo(-length*.46,r*.33,-length,0);ctx.closePath();ctx.fillStyle=tail;ctx.fill();
 glow(ctx,r*1.45,p.color,p.color2);ctx.beginPath();ctx.arc(0,0,r*.6,0,TAU);ctx.fillStyle=p.color;ctx.fill();ctx.beginPath();ctx.arc(r*.14,-r*.08,r*.36,0,TAU);ctx.fillStyle=p.color2;ctx.fill();ctx.beginPath();ctx.arc(0,0,r*.62,.2,Math.PI*.8);ctx.strokeStyle=p.ink;ctx.lineWidth=r*.08;ctx.stroke();
}
function rain(ctx,r,p,length){
 const tail=ctx.createLinearGradient(-length,0,r*.6,0);tail.addColorStop(0,rgba(p.color,0));tail.addColorStop(.25,rgba(p.color,.1));tail.addColorStop(.8,rgba(p.color,.65));tail.addColorStop(1,p.color);
 ctx.beginPath();ctx.moveTo(-length,0);ctx.quadraticCurveTo(-length*.3,-r*.14,-r*.35,-r*.36);ctx.bezierCurveTo(r*.4,-r*.6,r*.9,-r*.33,r*.9,0);ctx.bezierCurveTo(r*.9,r*.33,r*.4,r*.6,-r*.35,r*.36);ctx.quadraticCurveTo(-length*.3,r*.14,-length,0);ctx.closePath();ctx.fillStyle=tail;ctx.fill();
 ctx.beginPath();ctx.moveTo(-r*.2,r*.34);ctx.quadraticCurveTo(r*.7,r*.48,r*.85,r*.05);ctx.strokeStyle=rgba(p.ink,.7);ctx.lineWidth=r*.085;ctx.stroke();ctx.beginPath();ctx.moveTo(-r*.7,-r*.15);ctx.lineTo(r*.3,-r*.18);ctx.strokeStyle=p.color2;ctx.lineWidth=r*.1;ctx.stroke();
}
function dust(ctx,r,p){
 ctx.save();ctx.scale(1.35,.8);const g=ctx.createRadialGradient(0,0,0,0,0,r*2.1);g.addColorStop(0,rgba(p.color2,.58));g.addColorStop(.25,rgba(p.color,.42));g.addColorStop(.65,rgba(p.color,.14));g.addColorStop(1,rgba(p.color,0));ctx.fillStyle=g;ctx.fillRect(-r*2.1,-r*2.1,r*4.2,r*4.2);ctx.restore();
 ctx.fillStyle=rgba(p.ink,.4);for(const [x,y,size] of [[-.2,.1,.18],[1.2,-.55,.13],[-1.15,.65,.1]]){ctx.beginPath();ctx.arc(x*r,y*r,r*size,0,TAU);ctx.fill();}
}
function rune(ctx,r,p){
 ctx.beginPath();ctx.moveTo(-r*.85,r*.9);ctx.lineTo(-r*.3,-r*1.2);ctx.lineTo(r*.9,-r*.6);ctx.lineTo(r*.35,r*.75);ctx.moveTo(r*.03,-r*.75);ctx.lineTo(r*.03,r*.95);ctx.moveTo(r*.03,-r*.2);ctx.lineTo(r*.6,-r*.52);ctx.moveTo(-r*.7,-r*.05);ctx.lineTo(-r*1.1,-r*.35);ctx.lineTo(-r*.9,-r*.7);
 ctx.strokeStyle=p.ink;ctx.lineWidth=r*.19;ctx.stroke();ctx.strokeStyle=p.color;ctx.lineWidth=r*.1;ctx.stroke();
 polygon(ctx,[[-.7,.3],[-.45,-.2],[-.2,.45]],r);paint(ctx,p.color2,p.ink,r*.065);ctx.beginPath();ctx.arc(r*.03,r*.94,r*.11,0,TAU);ctx.fillStyle=p.color2;ctx.fill();
}
function vortex(ctx,r,p){
 const tail=ctx.createLinearGradient(-r*2.8,-r*.3,r*.5,r*.2);tail.addColorStop(0,rgba(p.color,0));tail.addColorStop(.3,rgba(p.color,.15));tail.addColorStop(.75,rgba(p.color,.65));tail.addColorStop(1,p.color2);
 ctx.beginPath();ctx.moveTo(-r*2.8,r*.2);ctx.bezierCurveTo(-r*2.6,-r*2.7,r*1.7,-r*2.2,r*1.2,r*.4);ctx.bezierCurveTo(r*.85,r*1.9,-r*1.3,r*1.3,-r*.7,-r*.1);ctx.strokeStyle=tail;ctx.lineWidth=r*.38;ctx.stroke();
 ctx.beginPath();ctx.ellipse(-r*.7,-r*.1,r*.42,r*.29,-.5,0,TAU);paint(ctx,p.color,p.ink,r*.07);ctx.beginPath();ctx.arc(-r*.63,-r*.16,r*.14,0,TAU);ctx.fillStyle=p.color2;ctx.fill();
}

/** Draw stateless particles in the caller's millimetre coordinate system. */
export function drawParticleGenerator(ctx,layer,{time=1.2,height,point,random,include,lifetimes=null}){
 if(!Object.hasOwn(defaults,layer.kind))return false;const base=defaults[layer.kind];
 const p={...base,...layer.params},h=Math.max(.01,height),count=Math.floor(number(p.count,base.count,1,80)),life=number(p.life,base.life,.2,6),size=h*number(p.size,base.size,.005,.3),travel=h*number(p.travel,base.travel,0,2),spread=number(p.spread,base.spread,0,2),direction=number(p.direction,base.direction,-180,180)*Math.PI/180,fade=number(p.fade,base.fade,.2,4),spin=number(p.spin,base.spin??0,-3,3),t=Number.isFinite(time)?time:1.2;
 p.ink=darken(p.color);
 const particles=[];
 const states=lifetimes??Array.from({length:count},(_,index)=>{const u=t/life+random(index,'phase');return {index,cycle:Math.floor(u),phase:u-Math.floor(u),sizeScale:1};});
 for(const state of states){
  const {index,cycle,phase}=state;
  // The smooth entrance also masks the new seed/position at a life boundary.
  const alpha=state.alpha??smooth(phase/.12)*smooth((1-phase)/.2)*Math.pow(1-phase,fade);
  if(alpha<.00001)continue;
  const e=point(index,cycle);if(!e)continue;
  const salt=cycle+':',r=size*(.78+.44*random(index,salt+'size'))*state.sizeScale,heading=direction+(random(index,salt+'direction')-.5)*spread*(layer.kind==='rain'?.35:1.4),dx=Math.cos(heading),dy=Math.sin(heading),distance=travel*phase*(.75+.5*random(index,salt+'travel'));
  if(r<=0)continue;
  const sway=Math.sin(phase*TAU+random(index,salt+'sway')*TAU)*h*spread*.055*phase;
  let x=e.x+dx*distance-dy*sway,y=e.y+dy*distance+dx*sway,angle=random(index,salt+'rotation')*TAU+t*spin*TAU;
  if(layer.kind==='vortex'){
   const orbit=r*(1.3+spread*2)*Math.sin(Math.PI*phase),a=random(index,salt+'orbit')*TAU+phase*TAU*1.4+t*spin*TAU;
   x+=Math.cos(a)*orbit;y+=Math.sin(a)*orbit;angle=a+Math.PI/2;
  }
  particles.push({index,phase,alpha,r,x,y,angle,heading,dx,dy,tumble:t*spin*TAU+random(index,salt+'tumble')*TAU});
 }
 if(!lifetimes)particles.sort((a,b)=>b.phase-a.phase);
 ctx.save();
 try{
  ctx.lineCap='round';ctx.lineJoin='round';ctx.setLineDash([]);ctx.lineDashOffset=0;ctx.shadowBlur=0;
  for(const s of particles){
   ctx.save();ctx.globalAlpha*=s.alpha;ctx.translate(s.x,s.y);ctx.rotate(layer.kind==='comet'||layer.kind==='rain'?s.heading:s.angle);
   let radius=s.r*1.7,tail=0;
   if(layer.kind==='firefly'){firefly(ctx,s.r,p);radius=s.r*2.55;}
   else if(layer.kind==='bubble'){bubble(ctx,s.r*(.9+s.phase*.18),p);radius=s.r*1.2;}
   else if(layer.kind==='petal')petal(ctx,s.r,p);
   else if(layer.kind==='leaf')leaf(ctx,s.r,p);
   else if(layer.kind==='snowflake')snowflake(ctx,s.r,p);
   else if(layer.kind==='crystal')crystal(ctx,s.r,p);
   else if(layer.kind==='confetti')confetti(ctx,s.r,p,s.index,s.tumble);
   else if(layer.kind==='comet'){tail=s.r*(5.5+s.phase*2);comet(ctx,s.r,p,tail);radius=s.r*1.5;}
   else if(layer.kind==='rain'){tail=s.r*8;rain(ctx,s.r,p,tail);radius=s.r;}
   else if(layer.kind==='dust'){dust(ctx,s.r,p);radius=s.r*2.9;}
   else if(layer.kind==='rune')rune(ctx,s.r,p);
   else if(layer.kind==='vortex'){vortex(ctx,s.r,p);radius=s.r*3.4;}
   ctx.restore();include(s.x,s.y,radius);
   if(tail)include(s.x-s.dx*tail,s.y-s.dy*tail,radius);
  }
 }finally{ctx.restore();}
 return true;
}
