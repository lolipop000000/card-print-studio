import {build} from 'esbuild';
import {mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';

const root=fileURLToPath(new URL('../',import.meta.url));
const result=await build({absWorkingDir:root,entryPoints:['tests/harness-entry.js'],bundle:true,format:'iife',target:'es2022',write:false,loader:{'.woff2':'base64'}});
const output=join(root,'artifacts/qa');
await mkdir(output,{recursive:true});
await writeFile(join(output,'harness.html'),'<!doctype html><html lang="ko"><meta charset="utf-8"><body><script>'+result.outputFiles[0].text.replace(/<\/script/gi,'<\\/script')+'</script></body></html>');
console.log('Built test harness');
