import {effectRandom} from './random.js';

const bounded=(value,fallback,min,max)=>Math.max(min,Math.min(max,Number.isFinite(value)?value:fallback));
/** Split world coordinates once per row/column; the GPU evaluates the field.
 * Padding, print DPI and preview crops must sample the same saved heat pattern. */
export function heatHazeField(surface,layer,timeSec=1.2,seed=1){
 const p=layer.params||{},w=surface.canvas.width,h=surface.canvas.height,width=Math.max(w,h),data=new Float32Array(width*2*4);
 const wavelength=bounded(p.wavelength,2.4,.5,20),angle=bounded(p.direction,-90,-180,180)*Math.PI/180;
 const dx=Math.cos(angle),dy=Math.sin(angle),time=layer.motion?.enabled?(Number.isFinite(timeSec)?timeSec:1.2)*bounded(layer.motion.speed,1,.1,3):0;
 for(let octave=0;octave<2;octave++){
  const frequency=(octave+1)/wavelength,offset=octave*width*4;
  for(let x=0;x<w;x++){const v=(surface.work.x+(x+.5)/surface.scale-dx*time*.75)*frequency,cell=Math.floor(v);data[offset+x*4]=cell;data[offset+x*4+1]=v-cell;}
  for(let y=0;y<h;y++){const v=(surface.work.y+(y+.5)/surface.scale-dy*time*.75)*frequency,cell=Math.floor(v);data[offset+y*4+2]=cell;data[offset+y*4+3]=v-cell;}
 }
 return {width,height:2,data,amount:bounded(p.amount,.22,0,3)*surface.scale,detail:bounded(p.detail,.65,0,1),dx,dy,key:Math.floor(effectRandom(seed,layer.id||'heatHaze',0,1231)*4294967296)};
}
function noise(x,y,key){
 let h=(Math.imul(x,0x1f123bb5)^Math.imul(y,0x5f356495)^key)>>>0;
 h^=h>>>16;h=Math.imul(h,0x7feb352d);h^=h>>>15;h=Math.imul(h,0x846ca68b);h^=h>>>16;return (h>>>0)/4294967296;
}
const smooth=t=>t*t*(3-2*t),mix=(a,b,t)=>a+(b-a)*t;
function fieldNoise(field,x,y,octave,key){
 const row=octave*field.width*4,ix=field.data[row+x*4],iy=field.data[row+y*4+2],fx=smooth(field.data[row+x*4+1]),fy=smooth(field.data[row+y*4+3]);
 return mix(mix(noise(ix,iy,key),noise(ix+1,iy,key),fx),mix(noise(ix,iy+1,key),noise(ix+1,iy+1,key),fx),fy)*2-1;
}
export function heatHazeShift(field,x,y,out){
 const channel=key=>(fieldNoise(field,x,y,0,key)+field.detail*fieldNoise(field,x,y,1,key))/(1+field.detail);
 const across=channel(field.key),along=channel(field.key^0x68bc21eb)*.3;
 out[0]=field.amount*(-field.dy*across+field.dx*along);out[1]=field.amount*(field.dx*across+field.dy*along);return out;
}
