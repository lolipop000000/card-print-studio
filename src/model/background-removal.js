import {createBackgroundModelLoader,checkBackgroundAbort} from '../storage/background-model.js';
import {validateImageSize} from './image-crop.js';

const MODEL_SIZE=320;
const loadModel=createBackgroundModelLoader();

/** rembg U2NetP's RGB/max, ImageNet mean/std, and NCHW tensor contract. */
export function preprocessForegroundPixels(rgba){
 if(!rgba?.length||rgba.length%4)throw Error('배경 제거에 사용할 그림 픽셀을 읽지 못했어요.');
 const count=rgba.length/4,output=new Float32Array(count*3),mean=[.485,.456,.406],std=[.229,.224,.225];let maximum=1e-6;
 for(let i=0;i<rgba.length;i+=4)maximum=Math.max(maximum,rgba[i],rgba[i+1],rgba[i+2]);
 for(let i=0;i<count;i++)for(let channel=0;channel<3;channel++)output[channel*count+i]=(rgba[i*4+channel]/maximum-mean[channel])/std[channel];
 return output;
}

/** A continuous alpha mask; constant/invalid output must never erase a photo. */
export function normalizeForegroundMask(prediction){
 if(!prediction?.length)throw Error('배경 제거 결과가 비어 있어요. 다른 그림으로 다시 시도하세요.');
 let min=Infinity,max=-Infinity;
 for(const value of prediction){if(!Number.isFinite(value))throw Error('배경 제거 결과를 읽지 못했어요. 다른 그림으로 다시 시도하세요.');min=Math.min(min,value);max=Math.max(max,value);}
 if(max-min<1e-6)throw Error('그림에서 대상을 구분하지 못했어요. 대상이 더 또렷한 그림으로 다시 시도하세요.');
 const rgba=new Uint8ClampedArray(prediction.length*4);
 for(let i=0;i<prediction.length;i++){rgba[i*4]=rgba[i*4+1]=rgba[i*4+2]=255;rgba[i*4+3]=(prediction[i]-min)/(max-min)*255;}
 return rgba;
}

// Kept self-contained so esbuild can embed a classic Worker in the offline HTML.
function foregroundWorker(){
 self.onmessage=async({data})=>{
  const urls=[];let session;
  try{
   const runtime=URL.createObjectURL(new Blob([data.runtime],{type:'application/javascript'})),wasm=URL.createObjectURL(new Blob([data.wasm],{type:'application/wasm'}));urls.push(runtime,wasm);
   importScripts(runtime);
   self.ort.env.wasm.numThreads=1;self.ort.env.wasm.proxy=false;self.ort.env.wasm.simd=true;
   self.ort.env.wasm.wasmPaths={'ort-wasm-simd.wasm':wasm};
   session=await self.ort.InferenceSession.create(new Uint8Array(data.model),{executionProviders:['wasm'],graphOptimizationLevel:'all'});
   self.postMessage({stage:'segment'});
   const input=new self.ort.Tensor('float32',new Float32Array(data.input),[1,3,320,320]);
   const outputs=await session.run({[session.inputNames[0]]:input}),prediction=outputs[session.outputNames[0]];
   if(!prediction||prediction.data.length!==320*320)throw Error('Unexpected foreground mask dimensions');
   const mask=new Float32Array(prediction.data);self.postMessage({mask:mask.buffer},[mask.buffer]);
  }catch(error){self.postMessage({error:String(error?.message||error)});}finally{await session?.release();for(const url of urls)URL.revokeObjectURL(url);}
 };
}

function inferForeground(assets,input,{signal,onProgress}){
 checkBackgroundAbort(signal);
 return new Promise((resolve,reject)=>{
  const url=URL.createObjectURL(new Blob(['('+foregroundWorker.toString()+')();'],{type:'application/javascript'}));let worker,timer,settled=false;
  const finish=(error,result)=>{if(settled)return;settled=true;clearTimeout(timer);signal?.removeEventListener('abort',cancel);worker?.terminate();URL.revokeObjectURL(url);error?reject(error):resolve(result);};
  const cancel=()=>finish(new DOMException('배경 제거를 취소했어요.','AbortError'));
  try{
   worker=new Worker(url);signal?.addEventListener('abort',cancel,{once:true});
   timer=setTimeout(()=>finish(Error('배경 제거 시간이 너무 오래 걸려요. 더 작은 그림으로 다시 시도하거나 최신 Chrome 또는 Edge를 사용하세요.')),120000);
   worker.onmessage=({data})=>{
    if(data.stage==='segment')onProgress({stage:'segment',progress:.8,message:'이 기기에서 사람·물체를 찾고 있어요. 잠시 기다려 주세요.'});
    else if(data.error)finish(Error('배경 제거를 실행하지 못했어요. 다른 그림으로 다시 시도하거나 최신 Chrome 또는 Edge를 사용하세요.'));
    else if(data.mask instanceof ArrayBuffer)finish(null,new Float32Array(data.mask));
   };
   worker.onerror=event=>{event.preventDefault();finish(Error('이 브라우저에서 배경 제거 작업을 열지 못했어요. 최신 Chrome 또는 Edge의 일반 창에서 다시 시도하세요.'));};
   worker.postMessage({...assets,input:input.buffer},[...Object.values(assets),input.buffer]);
   if(signal?.aborted)cancel();
  }catch(error){finish(Error('배경 제거 작업 공간을 만들지 못했어요. 최신 Chrome 또는 Edge에서 다시 시도하세요.',{cause:error}));}
 });
}

/** Leaves the input intact. Model/runtime downloads only; the photo never leaves this device. */
export async function removeImageBackground(image,{signal,onProgress=()=>{}}={}){
 checkBackgroundAbort(signal);
 const {width,height}=validateImageSize({width:image?.naturalWidth??image?.width,height:image?.naturalHeight??image?.height});
 if(typeof Worker==='undefined'||typeof WebAssembly==='undefined')throw Error('이 브라우저는 자동 배경 제거를 지원하지 않아요. 최신 Chrome 또는 Edge에서 다시 시도하세요.');
 const small=document.createElement('canvas'),mask=document.createElement('canvas');small.width=small.height=mask.width=mask.height=MODEL_SIZE;
 let output;
 try{
  const context=small.getContext('2d',{willReadFrequently:true}),maskContext=mask.getContext('2d');
  if(!context||!maskContext)throw Error('그림 작업 공간을 만들지 못했어요. 더 작은 그림으로 다시 시도하세요.');
  context.imageSmoothingEnabled=true;context.imageSmoothingQuality='high';context.drawImage(image,0,0,MODEL_SIZE,MODEL_SIZE);
  const input=preprocessForegroundPixels(context.getImageData(0,0,MODEL_SIZE,MODEL_SIZE).data);
  const assets=await loadModel({signal,onProgress});checkBackgroundAbort(signal);
  onProgress({stage:'load',progress:.7,message:'배경 제거 모델을 이 기기에서 열고 있어요.'});
  const prediction=await inferForeground(assets,input,{signal,onProgress});checkBackgroundAbort(signal);
  onProgress({stage:'finish',progress:.95,message:'원본 크기와 투명도를 유지하며 결과를 만들어요.'});
  maskContext.putImageData(new ImageData(normalizeForegroundMask(prediction),MODEL_SIZE,MODEL_SIZE),0,0);
  output=document.createElement('canvas');output.width=width;output.height=height;const target=output.getContext('2d');
  if(!target)throw Error('배경 제거 결과를 만들 공간이 부족해요. 더 작은 그림으로 다시 시도하세요.');
  target.drawImage(image,0,0,width,height);target.globalCompositeOperation='destination-in';target.imageSmoothingEnabled=true;target.imageSmoothingQuality='high';target.drawImage(mask,0,0,width,height);target.globalCompositeOperation='source-over';
  checkBackgroundAbort(signal);onProgress({stage:'finish',progress:1,message:'배경 제거가 끝났어요. 결과를 확인한 뒤 저장하세요.'});return output;
 }catch(error){if(output)output.width=output.height=1;throw error;}finally{small.width=small.height=mask.width=mask.height=1;}
}
