import {vp8Webm} from '../media/webm.js';

const FPS=30,FRAMES=180,MAX_BYTES=32*1024*1024;
const cancelled=()=>new DOMException('고화질 보기 준비를 취소했어요.','AbortError');

export async function renderEffectVideo({canvas,renderFrame,signal,onProgress=()=>{},startTimeSec=0}){
 const width=canvas.width,height=canvas.height;
 if(width<1||height<1||width*height>4_000_000)throw Error('영상 해상도가 지원 범위를 벗어났어요. 가로·세로 크기를 줄여 주세요.');
 if(typeof VideoEncoder==='undefined'||typeof VideoFrame==='undefined')throw Error('이 브라우저는 고화질 영상 준비를 지원하지 않아요. 최신 Chrome 또는 Edge에서 열어 주세요. 일반 재생은 계속 사용할 수 있어요.');
 if(signal?.aborted)throw cancelled();
 const config={codec:'vp8',width,height,framerate:FPS,bitrate:Math.min(24_000_000,Math.max(4_000_000,width*height*18)),latencyMode:'quality',hardwareAcceleration:'no-preference'};
 let support;try{support=await VideoEncoder.isConfigSupported(config);}catch{}
 if(!support?.supported)throw Error('이 브라우저는 VP8 고화질 영상 만들기를 지원하지 않아요. 최신 Chrome 또는 Edge에서 열어 주세요. 일반 재생은 계속 사용할 수 있어요.');
 let failure=null,byteLength=0;const frames=[];
 const check=()=>{if(signal?.aborted)throw cancelled();if(failure)throw failure;};
 const encoder=new VideoEncoder({output:chunk=>{
  if(signal?.aborted||failure)return;
  byteLength+=chunk.byteLength;
  if(byteLength>MAX_BYTES){failure=Error('미리보기 영상이 32MB를 넘었어요. 카드 크기나 입자 수를 줄여 주세요.');return;}
  const data=new Uint8Array(chunk.byteLength);chunk.copyTo(data);frames.push({timestamp:chunk.timestamp,key:chunk.type==='key',data});
 },error:error=>{failure=Error('영상 준비 중 인코더가 중단됐어요: '+error.message);}});
 const abort=()=>{if(encoder.state!=='closed')encoder.close();};signal?.addEventListener('abort',abort,{once:true});
 try{
  check();encoder.configure(config);onProgress(0);
  for(let i=0;i<FRAMES;i++){
   check();await renderFrame(startTimeSec+i/FPS);check();
   if(canvas.width!==width||canvas.height!==height)throw Error('준비 중 카드 해상도가 바뀌었어요. 고화질 보기를 다시 열어 주세요.');
   const timestamp=Math.round(i*1e6/FPS),frame=new VideoFrame(canvas,{timestamp,duration:Math.round((i+1)*1e6/FPS)-timestamp});
   try{encoder.encode(frame,{keyFrame:i%FPS===0});}finally{frame.close();}
   // A small request queue can still hide frames buffered inside the codec.
   // Drain fixed batches too, keeping at most four submitted raw frames alive.
   if((i+1)%4===0||encoder.encodeQueueSize>=4)await encoder.flush();
   check();onProgress((i+1)/(FRAMES+1));await new Promise(resolve=>setTimeout(resolve,0));
  }
  await encoder.flush();check();
  if(frames.length!==FRAMES||!frames[0]?.key)throw Error('일부 영상 프레임을 만들지 못했어요. 고화질 보기를 다시 열어 주세요.');
  const blob=vp8Webm(frames,{width,height,durationMs:6000,fps:FPS});check();onProgress(1);return blob;
 }catch(error){if(signal?.aborted)throw cancelled();throw failure||error;}
 finally{signal?.removeEventListener('abort',abort);if(encoder.state!=='closed')encoder.close();frames.length=0;}
}
