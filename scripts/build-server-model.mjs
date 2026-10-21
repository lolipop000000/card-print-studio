import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
await build({absWorkingDir:root,entryPoints:['src/cloud/server-model.js'],bundle:true,format:'esm',platform:'neutral',target:'es2022',outfile:'supabase/functions/_shared/model.bundle.js'});
console.log('Built shared server validation model');
