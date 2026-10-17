// One synchronous WebGL2 engine for bloom's expensive blur stage. Extraction,
// cropping and final alpha compositing stay with the existing Canvas renderer.
// Float targets avoid quantizing a faint halo between the six passes.
const MAX_TEXTURE_BYTES=128*1024*1024;
const vertexSource=`#version 300 es
layout(location=0) in vec2 position;
void main(){gl_Position=vec4(position,0.,1.);}`;
const fragmentSource=`#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;
uniform sampler2D image;
uniform ivec2 size;
uniform ivec2 axis;
uniform int radius;
uniform float fraction;
out vec4 result;
vec4 at(ivec2 p){
 if(any(lessThan(p,ivec2(0)))||any(greaterThanEqual(p,size)))return vec4(0.);
 return texelFetch(image,p,0);
}
void main(){
 ivec2 p=ivec2(gl_FragCoord.xy);
 vec4 sum=vec4(0.);
 for(int i=-radius;i<=radius;i++)sum+=at(p+axis*i);
 if(fraction>0.)sum+=(at(p-axis*(radius+1))+at(p+axis*(radius+1)))*fraction;
 result=sum/(float(2*radius+1)+2.*fraction);
}`;

let canvas,device,unavailable=null,lost=false;
const status={backend:'idle',reason:null,renderer:null,gpuRenders:0,cpuRenders:0,gpuPasses:0};
export function getBloomAccelerationStatus(){return {...status};}
export function recordCpuBloom(){status.backend='cpu';status.reason=unavailable||status.reason;status.cpuRenders++;}

function freeTargets(d){
 for(const target of d.targets){d.gl.deleteFramebuffer(target.framebuffer);d.gl.deleteTexture(target.texture);}
 d.targets=[];d.width=d.height=0;
}
function fail(reason){
 unavailable=reason;status.reason=reason;
 if(device&&!device.gl.isContextLost()){
  freeTargets(device);device.gl.deleteProgram(device.program);device.gl.deleteBuffer(device.buffer);device.gl.deleteVertexArray(device.vao);
 }
 device=null;
}
function createDevice(){
 if(unavailable||lost)return null;
 try{
  if(!canvas){
   canvas=document.createElement('canvas');canvas.width=canvas.height=1;
   canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();lost=true;device=null;status.reason='context-lost';});
   canvas.addEventListener('webglcontextrestored',()=>{lost=false;unavailable=null;device=null;status.reason=null;});
  }
  const gl=canvas.getContext('webgl2',{alpha:true,depth:false,stencil:false,antialias:false,premultipliedAlpha:false,preserveDrawingBuffer:false,powerPreference:'high-performance',failIfMajorPerformanceCaveat:true});
  if(!gl){fail('webgl2-unavailable');return null;}
  if(!gl.getExtension('EXT_color_buffer_float')){fail('float-target-unavailable');return null;}
  const info=gl.getExtension('WEBGL_debug_renderer_info');status.renderer=info?gl.getParameter(info.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER);
  const shaders=[];let program;
  try{
   for(const [kind,source] of [[gl.VERTEX_SHADER,vertexSource],[gl.FRAGMENT_SHADER,fragmentSource]]){
    const shader=gl.createShader(kind);if(!shader)throw new Error('shader allocation');
    shaders.push(shader);gl.shaderSource(shader,source);gl.compileShader(shader);
   }
   program=gl.createProgram();if(!program)throw new Error('program allocation');
   for(const shader of shaders)gl.attachShader(program,shader);gl.linkProgram(program);
   if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error('shader link');
  }catch(error){if(program)gl.deleteProgram(program);throw error;}
  finally{for(const shader of shaders)gl.deleteShader(shader);}
  const vao=gl.createVertexArray(),buffer=gl.createBuffer();
  if(!vao||!buffer){gl.deleteProgram(program);gl.deleteVertexArray(vao);gl.deleteBuffer(buffer);throw new Error('vertex allocation');}
  gl.bindVertexArray(vao);gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,2,gl.FLOAT,false,0,0);
  gl.disable(gl.BLEND);gl.disable(gl.DEPTH_TEST);gl.disable(gl.DITHER);
  const limit=gl.getParameter(gl.MAX_TEXTURE_SIZE),viewport=gl.getParameter(gl.MAX_VIEWPORT_DIMS);
  device={gl,program,vao,buffer,limit:Math.min(limit,...viewport),targets:[],width:0,height:0,uniforms:Object.fromEntries(['image','size','axis','radius','fraction'].map(name=>[name,gl.getUniformLocation(program,name)]))};
  if(gl.getError()!==gl.NO_ERROR)throw new Error('device setup');
  return device;
 }catch{fail('gpu-setup-failed');return null;}
}
function prepareTargets(d,width,height){
 if(d.width===width&&d.height===height)return;
 freeTargets(d);
 const gl=d.gl;
 for(let i=0;i<2;i++){
  const texture=gl.createTexture(),framebuffer=gl.createFramebuffer();
  if(!texture||!framebuffer){gl.deleteTexture(texture);gl.deleteFramebuffer(framebuffer);throw new Error('target allocation');}
  d.targets.push({texture,framebuffer});gl.bindTexture(gl.TEXTURE_2D,texture);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
  gl.texStorage2D(gl.TEXTURE_2D,1,gl.RGBA32F,width,height);
  gl.bindFramebuffer(gl.FRAMEBUFFER,framebuffer);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,texture,0);
  if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw new Error('incomplete target');
 }
 if(gl.getError()!==gl.NO_ERROR)throw new Error('target setup');
 d.width=width;d.height=height;
}

/** Returns independent premultiplied float energy, or null for the CPU fallback.
 * Typed arrays retain row order in both upload and readback, so no canvas flip,
 * browser color conversion or unpremultiplication can alter the source pixels. */
export function blurBloomOnGpu(energy,width,height,blurRadius){
 const d=device||createDevice();
 if(!d){status.reason=lost?'context-lost':unavailable;return null;}
 if(width>d.limit||height>d.limit||width*height*32>MAX_TEXTURE_BYTES){status.reason='job-too-large';return null;}
 const gl=d.gl;
 try{
  if(gl.isContextLost()){status.reason='context-lost';return null;}
  prepareTargets(d,width,height);
  gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,d.targets[0].texture);
  gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,width,height,gl.RGBA,gl.FLOAT,energy);
  gl.useProgram(d.program);gl.bindVertexArray(d.vao);gl.viewport(0,0,width,height);
  const u=d.uniforms,radius=Math.floor(blurRadius);
  gl.uniform1i(u.image,0);gl.uniform2i(u.size,width,height);gl.uniform1i(u.radius,radius);gl.uniform1f(u.fraction,blurRadius-radius);
  for(let pass=0;pass<6;pass++){
   gl.bindTexture(gl.TEXTURE_2D,d.targets[pass%2].texture);gl.bindFramebuffer(gl.FRAMEBUFFER,d.targets[(pass+1)%2].framebuffer);
   gl.uniform2i(u.axis,pass%2?0:1,pass%2?1:0);gl.drawArrays(gl.TRIANGLES,0,3);
  }
  const result=new Float32Array(energy.length);gl.readPixels(0,0,width,height,gl.RGBA,gl.FLOAT,result);
  if(gl.isContextLost()||gl.getError()!==gl.NO_ERROR)throw new Error('GPU render');
  status.backend='gpu';status.reason=null;status.gpuRenders++;status.gpuPasses+=6;
  return result;
 }catch{fail(gl.isContextLost()?'context-lost':'gpu-render-failed');return null;}
}
