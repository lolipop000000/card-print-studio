import {build} from 'esbuild';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url)),read=(f)=>readFile(path.join(root,f),'utf8');
const release=JSON.parse(await read('release.json')),pkg=JSON.parse(await read('package.json'));
const cloud=JSON.parse(await read('cloud.json'));
if(release.version!==pkg.version)throw Error('Package and release versions must match');
if(cloud.anonKey){
 let allowed=cloud.anonKey.startsWith('sb_publishable_');
 try{allowed ||= JSON.parse(Buffer.from(cloud.anonKey.split('.')[1],'base64url').toString()).role==='anon';}catch{}
 if(!allowed)throw Error('cloud.json must contain a public client key');
}
// This pinned browser build accepts public keys only. Exclude the SDK's modern
// server-key detector as well as its comments; retain its original MIT license.
const publicClientOnly={name:'public-client-only',setup(builder){
 builder.onLoad({filter:/@supabase[\\/]supabase-js[\\/]dist[\\/]index\.mjs$/},async args=>{
  const source=await readFile(args.path,'utf8');
  const serverBranch=' || key.startsWith("sb_secret_")';
  if(source.split(serverBranch).length!==2)throw Error('Pinned Supabase public-key adapter needs review');
  return {contents:source.replace(serverBranch,''),loader:'js'};
 });
}};
const result=await build({absWorkingDir:root,entryPoints:['src/app.js'],bundle:true,format:'iife',target:'es2022',write:false,metafile:true,loader:{'.woff2':'base64'},minifyWhitespace:true,legalComments:'none',define:{__CLOUD_CONFIG__:JSON.stringify(cloud)},plugins:[publicClientOnly]});
const template=await read('src/index.html'),css=await read('src/styles.css');
const script=result.outputFiles[0].text.replace(/<\/script/gi,'<\\/script');
let licenses=await read('LICENSES.txt');licenses+='\n'+await read('vendor/pretendard/LICENSE');
const packages=new Set();
for(const input of Object.keys(result.metafile.inputs)){const parts=input.replaceAll('\\','/').split('/'),i=parts.lastIndexOf('node_modules');if(i>=0)packages.add(parts.slice(0,i+(parts[i+1].startsWith('@')?3:2)).join('/'));}
for(const folder of [...packages].sort()){
 const pkg=JSON.parse(await read(folder+'/package.json'));let license=null;
 for(const file of ['LICENSE','LICENSE.txt','LICENSE.md','LICENSE-MIT.txt','license','license.txt','COPYING']){try{license=await read(folder+'/'+file);break;}catch{}}
 if(!license)throw Error('Missing bundled license: '+pkg.name);
 licenses+='\n\n--- '+pkg.name+' '+pkg.version+' ---\n'+license;
}
const html=template.replace('/* STUDIO_STYLES */',css).replace('<!-- STUDIO_SCRIPT -->','<script>'+script+'</script><script type="text/plain" id="studio-licenses">'+licenses.replace(/<\/script/gi,'<\\/script')+'</script>');
await mkdir(path.join(root,'dist'),{recursive:true});await writeFile(path.join(root,'dist/card-print-studio.html'),html);await writeFile(path.join(root,'dist/LICENSES.txt'),licenses);const {sourceUrl,...manifest}=release;await writeFile(path.join(root,'dist/update.json'),JSON.stringify(manifest,null,2)+'\n');
await writeFile(path.join(root,'dist/index.html'),html);
console.log('Built offline HTML '+(Buffer.byteLength(html)/1024/1024).toFixed(2)+' MiB; '+packages.size+' bundled package licenses.');
