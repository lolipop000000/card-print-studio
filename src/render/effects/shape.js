// Geometry is evaluated in millimeters at a capped raster resolution. The source
// alpha stays untouched: filling counters is only for attachment and SDF masks.
const cache=new WeakMap();
const INF=1e15;

function distanceLine(input,length,output,sites,cuts){
 let last=-1;
 for(let q=0;q<length;q++){
  if(input[q]>=INF)continue;
  let crossing=-Infinity;
  while(last>=0){const p=sites[last];crossing=((input[q]+q*q)-(input[p]+p*p))/(2*(q-p));if(crossing>cuts[last])break;last--;}
  last++;sites[last]=q;cuts[last]=last===0?-Infinity:crossing;cuts[last+1]=Infinity;
 }
 if(last<0){output.fill(INF,0,length);return;}
 let k=0;
 for(let q=0;q<length;q++){while(cuts[k+1]<q)k++;const d=q-sites[k];output[q]=d*d+input[sites[k]];}
}
function distanceTo(solid,width,height,target){
 // An exterior padding pixel also makes fully opaque inputs have a finite
 // interior distance, without adding fictitious solid pixels to empty inputs.
 const w=width+2,h=height+2,field=new Float64Array(w*h),n=Math.max(w,h);
 const input=new Float64Array(n),output=new Float64Array(n),sites=new Int32Array(n),cuts=new Float64Array(n+1);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const value=x===0||y===0||x===w-1||y===h-1?0:solid[(y-1)*width+x-1];
  field[y*w+x]=value===target?0:INF;
 }
 for(let y=0;y<h;y++){input.set(field.subarray(y*w,(y+1)*w));distanceLine(input,w,output,sites,cuts);field.set(output.subarray(0,w),y*w);}
 for(let x=0;x<w;x++){for(let y=0;y<h;y++)input[y]=field[y*w+x];distanceLine(input,h,output,sites,cuts);for(let y=0;y<h;y++)field[y*w+x]=output[y];}
 const out=new Float32Array(width*height);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++)out[y*width+x]=field[(y+1)*w+x+1];
 return out;
}
function smoothMask(solid,w,h,radius){
 let a=Float32Array.from(solid),b=new Float32Array(w*h);
 const sample=(data,x,y)=>x<0||y<0||x>=w||y>=h?0:data[y*w+x];
 for(let pass=0;pass<2;pass++){
  for(let y=0;y<h;y++){
   let sum=0;for(let x=-radius;x<=radius;x++)sum+=sample(a,x,y);
   for(let x=0;x<w;x++){b[y*w+x]=sum/(2*radius+1);sum+=sample(a,x+radius+1,y)-sample(a,x-radius,y);}
  }
  for(let x=0;x<w;x++){
   let sum=0;for(let y=-radius;y<=radius;y++)sum+=sample(b,x,y);
   for(let y=0;y<h;y++){a[y*w+x]=sum/(2*radius+1);sum+=sample(b,x,y+radius+1)-sample(b,x,y-radius);}
  }
 }
 return a;
}

export function analyzeAlpha(alpha,width,height,{scale=1,work={x:0,y:0,w:width/scale,h:height/scale},fillHoles=true}={}){
 const total=width*height,ink=new Uint8Array(total),outside=new Uint8Array(total),queue=new Int32Array(total);
 let head=0,tail=0;
 for(let i=0;i<total;i++)ink[i]=alpha[i]>=25.5?1:0;
 const enqueue=i=>{if(!ink[i]&&!outside[i]){outside[i]=1;queue[tail++]=i;}};
 for(let x=0;x<width;x++){enqueue(x);enqueue((height-1)*width+x);}
 for(let y=0;y<height;y++){enqueue(y*width);enqueue(y*width+width-1);}
 while(head<tail){const i=queue[head++],x=i%width,y=Math.floor(i/width);if(x)enqueue(i-1);if(x+1<width)enqueue(i+1);if(y)enqueue(i-width);if(y+1<height)enqueue(i+width);}
 const solid=new Uint8Array(total);let left=width,top=height,right=-1,bottom=-1;
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){const i=y*width+x;if(fillHoles?!outside[i]:ink[i]){solid[i]=1;left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x);bottom=Math.max(bottom,y);}}
 const distance=new Float32Array(total),points=[],inside=[];
 const boundsMm=right<0?null:{x:work.x+left/scale,y:work.y+top/scale,w:(right-left+1)/scale,h:(bottom-top+1)/scale};
 if(!boundsMm){distance.fill(Infinity);return {width,height,scale,work,solid,distance,boundsMm,points,inside};}
 const toSolid=distanceTo(solid,width,height,1),toAir=distanceTo(solid,width,height,0);
 for(let i=0;i<total;i++)distance[i]=(solid[i]?-Math.sqrt(toAir[i]):Math.sqrt(toSolid[i]))/scale;
 const blur=smoothMask(solid,width,height,Math.max(1,Math.round(.3*scale)));
 const at=(data,x,y)=>x<0||y<0||x>=width||y>=height?0:data[y*width+x];
 const sampleStep=Math.max(1,Math.round(scale*.5));
 for(let y=top;y<=bottom;y++)for(let x=left;x<=right;x++){
  const i=y*width+x;if(!solid[i])continue;
  if((x-left)%sampleStep===0&&(y-top)%sampleStep===0)inside.push({x:work.x+(x+.5)/scale,y:work.y+(y+.5)/scale,nx:0,ny:0,open:true});
  if(at(solid,x-1,y)&&at(solid,x+1,y)&&at(solid,x,y-1)&&at(solid,x,y+1))continue;
  let nx=at(blur,x-1,y)-at(blur,x+1,y),ny=at(blur,x,y-1)-at(blur,x,y+1),length=Math.hypot(nx,ny);
  if(length<1e-7){nx=at(solid,x-1,y)-at(solid,x+1,y);ny=at(solid,x,y-1)-at(solid,x,y+1);length=Math.hypot(nx,ny);}
  if(length<1e-7){nx=0;ny=-1;length=1;}
  nx/=length;ny/=length;
  let open=true,exited=false;
  for(let k=1;k<=Math.ceil(1.2*scale);k++){
   const hit=at(solid,Math.floor(x+.5+nx*k),Math.floor(y+.5+ny*k));
   if(!hit)exited=true;else if(exited){open=false;break;}
  }
  points.push({x:work.x+(x+.5)/scale,y:work.y+(y+.5)/scale,nx,ny,open});
 }
 return {width,height,scale,work,solid,distance,boundsMm,points,inside};
}

export function analyzeShape(surface,{fillHoles=true}={}){
 const dpi=Math.min(surface.dpi??surface.scale*25.4,150),scale=dpi/25.4,work=surface.work;
 const width=Math.max(1,Math.round(work.w*scale)),height=Math.max(1,Math.round(work.h*scale));
 const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
 const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(surface.canvas,0,0,width,height);
 const rgba=ctx.getImageData(0,0,width,height).data,alpha=new Uint8Array(width*height);let hash=2166136261;
 for(let i=0;i<alpha.length;i++){alpha[i]=rgba[i*4+3];hash=Math.imul(hash^alpha[i],16777619);}
 const key=[width,height,scale,work.x,work.y,work.w,work.h,hash,fillHoles].join(':');
 const saved=cache.get(surface.canvas);if(saved?.key===key)return saved.shape;
 const shape=analyzeAlpha(alpha,width,height,{scale,work,fillHoles});cache.set(surface.canvas,{key,shape});return shape;
}

export function selectEmissionPoints(shape,emit={face:'all',openOnly:false}){
 if(!shape)return [];
 const face=emit.face??'all';
 if(face==='inside')return shape.inside??[];
 if(face==='area')return [];
 return (shape.points??[]).filter(p=>(face==='all'||face==='up'&&p.ny<-.45||face==='down'&&p.ny>.45||face==='side'&&Math.abs(p.nx)>.7)&&(!emit.openOnly||p.open));
}
