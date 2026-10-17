import {writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {openHarness,qa} from './helpers/browser.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const bundle=await build({absWorkingDir:root,stdin:{contents:`import {applyCreativeFilter} from './src/render/effects/creative-filters.js'; import {referenceBloom,bloomFixture} from './tests/bloom-performance-reference.mjs'; window.bloomBenchmarkApi={applyCreativeFilter,referenceBloom,bloomFixture};`,resolveDir:root},bundle:true,format:'iife',target:'es2022',write:false});
const session=await openHarness();
try{
 await session.page.addScriptTag({content:bundle.outputFiles[0].text});
 const results=await session.page.evaluate(()=>{
  const {applyCreativeFilter,referenceBloom,bloomFixture}=bloomBenchmarkApi;
  const median=times=>times.toSorted((a,b)=>a-b)[Math.floor(times.length/2)];
  const results=[];
  for(const [name,dpi,dense,radius] of [['sparse-preview',150,false,2],['sparse-print',300,false,2],['dense-print',300,true,2],['wide-halo-print',300,false,12]]){
   const source=bloomFixture(dpi,dense),p={radius,strength:1.1,threshold:.55,knee:.35,color:'#ffffff'},optimized=()=>applyCreativeFilter(source,{kind:'bloom',params:p}),reference=()=>referenceBloom(source,p);
   for(let i=0;i<2;i++){reference();optimized();}
   const before=[],after=[],profiles=[];
   for(let i=0;i<7;i++){
    // Alternate order to avoid assigning a warm cache or collection to one path.
    const runs=i%2?[['after',optimized],['before',reference]]:[['before',reference],['after',optimized]];
    for(const [name,run] of runs){const start=performance.now();run();(name==='before'?before:after).push(performance.now()-start);}
    const profile={};referenceBloom(source,p,profile);profiles.push(profile);
   }
   const beforeMs=median(before),afterMs=median(after),profile=Object.fromEntries(Object.keys(profiles[0]).map(key=>[key,median(profiles.map(p=>p[key]))]));
   results.push({name,dpi,dense,radius,size:[source.canvas.width,source.canvas.height],beforeMs,afterMs,speedup:beforeMs/afterMs,beforeSamples:before,afterSamples:after,baselineProfileMs:profile});
  }
  return {userAgent:navigator.userAgent,results};
 });
 const suffix=process.env.BLOOM_BENCHMARK_NAME||'comparison';
 await writeFile(`${qa}/bloom-performance-${suffix}.json`,JSON.stringify({...results,pageErrors:session.pageErrors,httpRequests:session.httpRequests},null,2));
 console.log(JSON.stringify(results,null,2));
 if(session.pageErrors.length||session.httpRequests.length)throw new Error('Unexpected browser error or network request');
}finally{await session.browser.close();}
