import {build} from 'esbuild';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url)),read=(f)=>readFile(path.join(root,f),'utf8');
const release=JSON.parse(await read('release.json')),pkg=JSON.parse(await read('package.json'));
if(release.version!==pkg.version)throw Error('Package and release versions must match');
const result=await build({absWorkingDir:root,entryPoints:['src/app.js'],bundle:true,format:'iife',target:'es2022',write:false,metafile:true,loader:{'.woff2':'base64'},minify:false});
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
console.log('Built offline HTML '+(Buffer.byteLength(html)/1024/1024).toFixed(2)+' MiB; '+packages.size+' bundled package licenses.');
