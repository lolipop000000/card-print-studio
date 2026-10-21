import {createReadStream,createWriteStream} from 'node:fs';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {pipeline} from 'node:stream/promises';
import {createHash,randomUUID} from 'node:crypto';
import path from 'node:path';
import {localClients,createTestUser,must} from '../tests/cloud/helpers.mjs';
import {createBackup,dumpDatabase} from './backup.mjs';

if(!process.argv.includes('--reset-local'))throw Error('Explicit --reset-local is required. This verification resets only the guarded local database.');
const clients=localClients(),{admin,config}=clients,root=path.resolve('artifacts/qa/local-backup'),docker=process.env.DOCKER_BIN||'docker',cli=process.env.SUPABASE_CLI||'supabase';
await mkdir(root,{recursive:true});
async function command(binary,args,log,input){
 const out=createWriteStream(path.join(root,log)),child=spawn(binary,args,{windowsHide:true,env:process.env,stdio:[input?'pipe':'ignore','pipe','pipe']});
 child.stdout.pipe(out,{end:false});child.stderr.pipe(out,{end:false});
 const completion=new Promise((resolve,reject)=>{child.once('error',()=>reject(Error('Local restore tool failed to start')));child.once('close',code=>{out.end();code===0?resolve():reject(Error(`Local restore step failed (${log}); private diagnostic retained`));});});
 await Promise.all([completion,...(input?[pipeline(createReadStream(input),child.stdin)]:[])]);
}
async function counts(){const result={};for(const table of ['profiles','works','shared_assets','blobs']){const response=await admin.from(table).select('*',{head:true,count:'exact'});must(response,table);result[table]=response.count;}return result;}
const user=await createTestUser(clients,'member');
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jC1sAAAAASUVORK5CYII=','base64'),sha=createHash('sha256').update(png).digest('hex');
const existing=must(await admin.from('blobs').select('sha256').eq('sha256',sha),'pre-existing test image');
let restored=false;
try{
 must(await admin.storage.from('blobs').upload(sha,png,{contentType:'image/png',upsert:true}),'seed restore image');
 if(!existing.length)must(await admin.from('blobs').insert({sha256:sha,mime:'image/png',bytes:png.length,uploader:user.id}),'seed restore blob');
 must(await admin.from('works').insert({owner:user.id,title:'backup-verification-'+randomUUID(),data:{test:true},card_count:0,blob_refs:[sha],visibility:'public'}),'seed restore work');
 const before=await counts(),env={...process.env,SUPABASE_DB_URL:config.dbUrl,BACKUP_DOCKER_CONTAINER:'supabase_db_pp-monster',DOCKER_BIN:docker};
 const backup=await createBackup({directory:root,client:admin,dump:file=>dumpDatabase(file,env)}),folder=path.join(root,backup.date),snapshot=JSON.parse(await readFile(path.join(folder,'snapshot.json')));
 if(createHash('sha256').update(await readFile(path.join(folder,'database.sql'))).digest('hex')!==snapshot.databaseSha256)throw Error('Database dump integrity failed');
 await command(cli,['db','reset','--local','--no-seed'],'reset.log');
 const prefix="SET session_replication_role = replica;\nDO $$ DECLARE t record; BEGIN FOR t IN SELECT schemaname,tablename FROM pg_tables WHERE schemaname='public' OR (schemaname='auth' AND tablename<>'schema_migrations') LOOP EXECUTE format('TRUNCATE TABLE %I.%I CASCADE',t.schemaname,t.tablename); END LOOP; END $$;\n";
 const restoreFile=path.join(root,'restore-input.sql');await writeFile(restoreFile,prefix+await readFile(path.join(folder,'database.sql'),'utf8')+'\nSET session_replication_role = origin;\n',{mode:0o600});
 await command(docker,['exec','-i','supabase_db_pp-monster','psql','-U','supabase_admin','-d','postgres','--set','ON_ERROR_STOP=on','--single-transaction'],'restore.log',restoreFile);
 for(const blob of snapshot.blobs){const bytes=await readFile(path.join(root,'blobs',blob.sha256));must(await admin.storage.from('blobs').upload(blob.sha256,bytes,{contentType:blob.mime,upsert:true}),'restore storage object');const data=must(await admin.storage.from('blobs').download(blob.sha256),'verify restored storage');if(createHash('sha256').update(Buffer.from(await data.arrayBuffer())).digest('hex')!==blob.sha256)throw Error('Restored blob integrity failed');}
 const after=await counts();if(JSON.stringify(before)!==JSON.stringify(after))throw Error('Restored row counts differ');
 // Exercise Auth after the no-owner restore as well as PostgREST reads.
 const probe=await createTestUser(clients,'pending');must(await admin.auth.admin.deleteUser(probe.id),'delete restored auth probe');
 restored=true;const result={checkedAt:new Date().toISOString(),before,after,verifiedBlobs:snapshot.blobs.length,databaseSha256:snapshot.databaseSha256,authCreateAfterRestore:true};await writeFile(path.join(root,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{
 if(restored){if(!existing.length){must(await admin.storage.from('blobs').remove([sha]),'clean restored image');must(await admin.from('blobs').delete().eq('sha256',sha),'clean restored blob');}must(await admin.auth.admin.deleteUser(user.id),'clean restored test user');}
 else console.error('Local restore verification incomplete. Private snapshot is preserved in artifacts/qa/local-backup; no production project was contacted.');
}
