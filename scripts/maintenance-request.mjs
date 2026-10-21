import {writeFile} from 'node:fs/promises';

// Reports are public Actions artifacts. Never copy response bodies, URLs,
// credentials, exception messages or stack traces into them.
const allowedCodes=new Set(['unauthorized','method-not-allowed','maintenance-failed']);

async function requestMaintenance(env){
 if(!env.SUPABASE_URL||!env.SUPABASE_SERVICE_ROLE_KEY)return {ok:false,status:0,code:'configuration-missing'};
 let endpoint;
 try{
  const url=new URL(env.SUPABASE_URL);
  const local=['localhost','127.0.0.1'].includes(url.hostname);
  if((url.protocol!=='https:'&&!(local&&url.protocol==='http:'))||url.username||url.password||url.search||url.hash||url.pathname!=='/')throw Error();
  endpoint=new URL('/functions/v1/maintenance',url);
 }catch{return {ok:false,status:0,code:'configuration-invalid'};}
 let response;
 try{
  response=await fetch(endpoint,{method:'POST',headers:{Authorization:`Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`},redirect:'error',signal:AbortSignal.timeout(30000)});
 }catch{return {ok:false,status:0,code:'request-failed'};}
 let body;
 try{body=await response.json();}catch{return {ok:false,status:response.status,code:'unexpected-response'};}
 if(response.ok&&body?.ok===true){
  const counters={trashed:body.result?.trashed,blobs:body.result?.blobs,audits:body.result?.audits};
  if(Object.values(counters).every(value=>Number.isSafeInteger(value)&&value>=0))return {ok:true,status:response.status,code:'ok',result:counters};
 }
 const code=!response.ok&&body?.ok===false&&allowedCodes.has(body.code)?body.code:'unexpected-response';
 return {ok:false,status:response.status,code};
}

const result=await requestMaintenance(process.env);
if(process.env.MAINTENANCE_REPORT_FILE){
 try{await writeFile(process.env.MAINTENANCE_REPORT_FILE,JSON.stringify(result,null,2)+'\n');}
 catch{console.error('Maintenance report could not be written.');process.exitCode=1;}
}
console.log(JSON.stringify(result));
if(!result.ok)process.exitCode=1;
