// Synchronous shader jobs preserve the renderer's saved-time / print contract.
// The source is never a render target. All targets and programs belong to this
// one lazy context, and a failed job returns null for the unchanged CPU path.
const LIMIT=128*1024*1024,PROGRAM_LIMIT=40;
const vertex=`#version 300 es
layout(location=0) in vec2 position;
void main(){gl_Position=vec4(position,0.,1.);}`;
export const pixelPrelude=`#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;
precision highp sampler2DArray;
uniform sampler2D image,source,auxiliary,mask;
uniform sampler2DArray pyramid;
uniform ivec2 size;
uniform ivec2 pixelOrigin;
uniform vec4 u0,u1,u2,u3,u4,u5,u6,u7;
out vec4 result;
vec4 get(ivec2 p){if(any(lessThan(p,ivec2(0)))||any(greaterThanEqual(p,size)))return vec4(0.);return texelFetch(image,p,0)*255.;}
vec2 pixelPosition(){return gl_FragCoord.xy+vec2(pixelOrigin);}
vec4 original(ivec2 p){p-=pixelOrigin;if(any(lessThan(p,ivec2(0)))||any(greaterThanEqual(p,textureSize(source,0))))return vec4(0.);return texelFetch(source,p,0)*255.;}
vec4 premul(vec4 v){return vec4(v.rgb*v.a/255.,v.a);}
vec4 sampleAt(vec2 p){
 // Derive weights from the same rounded cell used by the fetches. On ANGLE,
 // fract(p) can round to 1 while floor(p) has already rounded up at a grid edge.
 ivec2 a=ivec2(floor(p));vec2 f=p-vec2(a);
 return mix(mix(premul(original(a)),premul(original(a+ivec2(1,0))),f.x),mix(premul(original(a+ivec2(0,1))),premul(original(a+ivec2(1))),f.x),f.y);
}
vec4 unassociate(vec4 p){return p.a<.5?vec4(0.):vec4(p.rgb*255./p.a,p.a);}
vec4 bytes(vec4 v){return clamp(roundEven(v),0.,255.)/255.;}
vec4 over(vec4 a,vec4 b){return a+b*(1.-a.a/255.);}
float inward(float distance,float radius,bool squared){
 float start=max(0.,distance-1.),end=min(distance,radius);if(start>=end)return 0.;
 if(!squared)return (end-start)*(1.-(end+start)/(2.*radius));
 float a=1.-start/radius,b=1.-end/radius;return radius*(a*a*a-b*b*b)/3.;
}
`;
let canvas,device,unavailable=null,lost=false;
const status={backend:'idle',reason:null,renderer:null,gpuRenders:0,cpuRenders:0,canvasRenders:0,gpuPasses:0,kinds:{}};
export const getEffectAccelerationStatus=()=>({...status,kinds:{...status.kinds}});
export function recordCpuEffect(kind){status.backend='cpu';status.cpuRenders++;status.kinds[kind]={...(status.kinds[kind]||{}),cpu:(status.kinds[kind]?.cpu||0)+1};}
// Canvas paths remain browser-managed. Never count a drawing preference as a
// completed WebGL job: a browser can choose software rasterization at any time.
export function recordCanvasEffect(kind){status.canvasRenders++;status.kinds[kind]={...(status.kinds[kind]||{}),canvas:(status.kinds[kind]?.canvas||0)+1};}
function freeTargets(d){for(const t of d.targets.values()){d.gl.deleteTexture(t.texture);d.gl.deleteFramebuffer(t.framebuffer);}d.targets.clear();if(d.pyramid)d.gl.deleteTexture(d.pyramid);d.pyramid=null;d.width=d.height=d.levels=0;}
function fail(reason){
 unavailable=reason;status.reason=reason;
 if(device&&!device.gl.isContextLost()){
  const d=device;freeTargets(d);for(const p of d.programs.values())d.gl.deleteProgram(p.program);d.gl.deleteVertexArray(d.vao);d.gl.deleteBuffer(d.buffer);
 }
 device=null;
}
function createDevice(){
 if(unavailable||lost)return null;
 try{
  if(!canvas){canvas=document.createElement('canvas');canvas.width=canvas.height=1;
   canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();lost=true;device=null;status.reason='context-lost';});
   canvas.addEventListener('webglcontextrestored',()=>{lost=false;device=null;unavailable=null;status.reason=null;});
  }
  const gl=canvas.getContext('webgl2',{alpha:true,depth:false,stencil:false,antialias:false,premultipliedAlpha:false,preserveDrawingBuffer:false,powerPreference:'high-performance',failIfMajorPerformanceCaveat:true});
  if(!gl){fail('webgl2-unavailable');return null;}
  if(!gl.getExtension('EXT_color_buffer_float')){fail('float-target-unavailable');return null;}
  const vao=gl.createVertexArray(),buffer=gl.createBuffer();if(!vao||!buffer){gl.deleteVertexArray(vao);gl.deleteBuffer(buffer);throw Error('vertex allocation');}
  device={gl,vao,buffer,programs:new Map(),targets:new Map(),width:0,height:0,levels:0,pyramid:null,limit:Math.min(gl.getParameter(gl.MAX_TEXTURE_SIZE),...gl.getParameter(gl.MAX_VIEWPORT_DIMS))};
  gl.bindVertexArray(vao);gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),gl.STATIC_DRAW);gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,2,gl.FLOAT,false,0,0);
  gl.disable(gl.BLEND);gl.disable(gl.DITHER);gl.disable(gl.DEPTH_TEST);
  const info=gl.getExtension('WEBGL_debug_renderer_info');status.renderer=info?gl.getParameter(info.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER);
  if(gl.getError()!==gl.NO_ERROR)throw Error('device setup');return device;
 }catch{fail('gpu-setup-failed');return null;}
}
function programFor(d,key,body){
 if(d.programs.has(key)){const p=d.programs.get(key);d.programs.delete(key);d.programs.set(key,p);return p;}
 const gl=d.gl,shaders=[];let program;
 try{
  for(const [kind,code] of [[gl.VERTEX_SHADER,vertex],[gl.FRAGMENT_SHADER,pixelPrelude+body]]){
   const shader=gl.createShader(kind);if(!shader)throw Error('shader allocation');shaders.push(shader);gl.shaderSource(shader,code);gl.compileShader(shader);
   if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(shader)||'shader compile');
  }
  program=gl.createProgram();if(!program)throw Error('program allocation');for(const s of shaders)gl.attachShader(program,s);gl.linkProgram(program);
  if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error('program link');
  const value={program,uniforms:Object.fromEntries(['image','source','auxiliary','pyramid','mask','size','pixelOrigin',...Array.from({length:8},(_,i)=>'u'+i)].map(n=>[n,gl.getUniformLocation(program,n)]))};
  if(d.programs.size>=PROGRAM_LIMIT){const oldest=d.programs.keys().next().value;gl.deleteProgram(d.programs.get(oldest).program);d.programs.delete(oldest);}
  d.programs.set(key,value);return value;
 }catch(e){if(program)gl.deleteProgram(program);throw e;}finally{for(const shader of shaders)gl.deleteShader(shader);}
}
function target(d,name,width,height,format){
 const existing=d.targets.get(name);if(existing&&existing.width===width&&existing.height===height&&existing.format===format)return existing;
 const gl=d.gl;if(existing){gl.deleteTexture(existing.texture);gl.deleteFramebuffer(existing.framebuffer);d.targets.delete(name);}
 const texture=gl.createTexture(),framebuffer=gl.createFramebuffer();if(!texture||!framebuffer){gl.deleteTexture(texture);gl.deleteFramebuffer(framebuffer);throw Error('target allocation');}
 const value={texture,framebuffer,width,height,format};d.targets.set(name,value);gl.bindTexture(gl.TEXTURE_2D,texture);
 gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
 gl.texStorage2D(gl.TEXTURE_2D,1,format,width,height);gl.bindFramebuffer(gl.FRAMEBUFFER,framebuffer);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,texture,0);
 if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw Error('incomplete target');return value;
}

/** Input/output row order is unchanged. Byte uploads bypass browser color
 * conversion and Float32 intermediates retain low-alpha and morphology data. */
export function runGpuEffect({kind,width,height,data,passes,aux=null,mask=null,levels=0,pixelOrigin=[0,0],sourceSize=null}){
 const d=device||createDevice();if(!d){status.reason=lost?'context-lost':unavailable;return null;}
 const bytes=width*height*(40+4*levels)+(aux?aux.width*aux.height*16:16)+(mask?width*height*4:4);
 if(width>d.limit||height>d.limit||aux&&(aux.width>d.limit||aux.height>d.limit)||bytes>LIMIT||levels>d.gl.getParameter(d.gl.MAX_ARRAY_TEXTURE_LAYERS)){status.reason='job-too-large';return null;}
 const gl=d.gl;
 try{
  if(gl.isContextLost()){status.reason='context-lost';return null;}
  if(d.width!==width||d.height!==height||d.levels!==levels){freeTargets(d);d.width=width;d.height=height;d.levels=levels;}
  gl.activeTexture(gl.TEXTURE0);
  const input=target(d,'source',width,height,gl.RGBA8),output=target(d,'output',width,height,gl.RGBA8);
  gl.bindTexture(gl.TEXTURE_2D,input.texture);gl.pixelStorei(gl.UNPACK_ALIGNMENT,1);gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,width,height,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array(data.buffer,data.byteOffset,data.byteLength));
  const auxiliary=target(d,'aux',aux?.width||1,aux?.height||1,gl.RGBA32F);gl.bindTexture(gl.TEXTURE_2D,auxiliary.texture);gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,auxiliary.width,auxiliary.height,gl.RGBA,gl.FLOAT,aux?.data||new Float32Array(4));
  const maskTarget=target(d,'mask',mask?width:1,mask?height:1,gl.R32F);gl.bindTexture(gl.TEXTURE_2D,maskTarget.texture);gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,maskTarget.width,maskTarget.height,gl.RED,gl.FLOAT,mask||new Float32Array(1));
  // Samplers of different types always use distinct units, even in programs
  // that optimize one of them out. A dummy array keeps ordinary jobs complete.
  if(!d.pyramid){d.pyramid=gl.createTexture();if(!d.pyramid)throw Error('pyramid allocation');gl.bindTexture(gl.TEXTURE_2D_ARRAY,d.pyramid);gl.texParameteri(gl.TEXTURE_2D_ARRAY,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D_ARRAY,gl.TEXTURE_MAG_FILTER,gl.NEAREST);gl.texStorage3D(gl.TEXTURE_2D_ARRAY,1,gl.R32F,levels?width:1,levels?height:1,levels||1);}
  gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,input.texture);gl.activeTexture(gl.TEXTURE2);gl.bindTexture(gl.TEXTURE_2D,auxiliary.texture);gl.activeTexture(gl.TEXTURE3);gl.bindTexture(gl.TEXTURE_2D_ARRAY,d.pyramid);
  gl.activeTexture(gl.TEXTURE4);gl.bindTexture(gl.TEXTURE_2D,maskTarget.texture);
  gl.bindVertexArray(d.vao);gl.viewport(0,0,width,height);let current=input;
  for(let i=0;i<passes.length;i++){
   const pass=passes[i],last=i===passes.length-1,next=last?output:target(d,'scratch'+(i%2),width,height,gl.RGBA32F),program=programFor(d,pass.key,pass.body),u=program.uniforms;
   gl.useProgram(program.program);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,current.texture);gl.bindFramebuffer(gl.FRAMEBUFFER,next.framebuffer);
   gl.uniform1i(u.image,0);gl.uniform1i(u.source,1);gl.uniform1i(u.auxiliary,2);gl.uniform1i(u.pyramid,3);gl.uniform1i(u.mask,4);gl.uniform2i(u.size,sourceSize?.[0]??width,sourceSize?.[1]??height);gl.uniform2i(u.pixelOrigin,...pixelOrigin);
   for(let j=0;j<8;j++)gl.uniform4fv(u['u'+j],pass.values?.['u'+j]||[0,0,0,0]);
   gl.drawArrays(gl.TRIANGLES,0,3);
   if(pass.saveLevel!==undefined){gl.activeTexture(gl.TEXTURE3);gl.bindTexture(gl.TEXTURE_2D_ARRAY,d.pyramid);gl.copyTexSubImage3D(gl.TEXTURE_2D_ARRAY,0,0,0,pass.saveLevel,0,0,width,height);}
   current=next;
  }
  const pixels=new Uint8Array(width*height*4);gl.readPixels(0,0,width,height,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
  if(gl.isContextLost()||gl.getError()!==gl.NO_ERROR)throw Error('GPU render');
  status.backend='gpu';status.reason=null;status.gpuRenders++;status.gpuPasses+=passes.length;status.kinds[kind]={...(status.kinds[kind]||{}),gpu:(status.kinds[kind]?.gpu||0)+1};
  return new Uint8ClampedArray(pixels.buffer);
 }catch{fail(gl.isContextLost()?'context-lost':'gpu-render-failed');return null;}
}
