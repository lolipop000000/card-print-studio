import {createHash} from 'node:crypto';

export function buildCsp(script,cloud={}){
 const connections=["'self'",'blob:','data:','https:','https://raw.githubusercontent.com','https://cdn.jsdelivr.net','https://huggingface.co'];
 if(cloud.url){const url=new URL(cloud.url);if(!['https:','http:'].includes(url.protocol))throw Error('Invalid cloud URL');connections.push(url.origin,url.origin.replace(/^http/,'ws'));}
 const hash=createHash('sha256').update(script).digest('base64');
 return ["default-src 'self'",`script-src 'sha256-${hash}' 'wasm-unsafe-eval' blob:`,"style-src 'self' 'unsafe-inline'","img-src 'self' data: blob: https:","font-src 'self' data:","media-src 'self' blob: data:","worker-src blob:",`connect-src ${connections.join(' ')}`,"object-src 'none'","base-uri 'none'","form-action 'none'"].join('; ');
}
