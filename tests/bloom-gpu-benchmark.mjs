import {writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {openHarness,qa} from './helpers/browser.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const bundle=await build({absWorkingDir:root,stdin:{contents:`import {applyCreativeFilter} from './src/render/effects/creative-filters.js'; import {getBloomAccelerationStatus} from './src/render/effects/gpu-bloom.js'; import {bloomFixture} from './tests/bloom-performance-reference.mjs'; window.bloomBenchmarkApi={applyCreativeFilter,getBloomAccelerationStatus,bloomFixture};`,resolveDir:root},bundle:true,format:'iife',target:'es2022',write:false});
const session=await openHarness();
try{
 await session.page.addScriptTag({content:bundle.outputFiles[0].text});
 const results=await session.page.evaluate(()=>{
  const {applyCreativeFilter,getBloomAccelerationStatus,bloomFixture}=bloomBenchmarkApi,median=times=>times.toSorted((a,b)=>a-b)[Math.floor(times.length/2)],results=[];
  for(const [name,dpi,dense,radius] of [['sparse-preview',150,false,2],['sparse-print',300,false,2],['dense-print',300,true,2],['wide-halo-print',300,false,12]]){
   const source=bloomFixture(dpi,dense),layer={kind:'bloom',params:{radius,strength:1.1,threshold:.55,knee:.35,color:'#ffffff'}},cpu=()=>applyCreativeFilter(source,layer,{bloomBackend:'cpu'}),gpu=()=>applyCreativeFilter(source,layer);
   const cold=performance.now();gpu();const coldMs=performance.now()-cold;
   for(let i=0;i<2;i++){cpu();gpu();}
   const cpuSamples=[],gpuSamples=[],before=getBloomAccelerationStatus();
   for(let i=0;i<9;i++)for(const [samples,run] of (i%2?[[gpuSamples,gpu],[cpuSamples,cpu]]:[[cpuSamples,cpu],[gpuSamples,gpu]])){
    const start=performance.now();run();samples.push(performance.now()-start);
   }
   const after=getBloomAccelerationStatus(),cpuMs=median(cpuSamples),gpuMs=median(gpuSamples);
   results.push({name,dpi,dense,radius,size:[source.canvas.width,source.canvas.height],coldMs,cpuMs,gpuMs,speedup:cpuMs/gpuMs,gpuRenders:after.gpuRenders-before.gpuRenders,cpuSamples,gpuSamples});
  }
  return {userAgent:navigator.userAgent,acceleration:getBloomAccelerationStatus(),results};
 });
 await writeFile(`${qa}/bloom-gpu-benchmark.json`,JSON.stringify({...results,pageErrors:session.pageErrors,httpRequests:session.httpRequests},null,2));
 console.log(JSON.stringify(results,null,2));
 if(session.pageErrors.length||session.httpRequests.length||results.results.some(r=>r.gpuRenders!==9))throw new Error('Benchmark did not consistently exercise the real GPU path');
}finally{await session.browser.close();}
