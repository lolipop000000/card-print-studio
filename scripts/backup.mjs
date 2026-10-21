import {createClient} from '@supabase/supabase-js';
import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile,readdir,rename,rm,chmod} from 'node:fs/promises';
import {createWriteStream} from 'node:fs';
import {spawn} from 'node:child_process';
import {pipeline} from 'node:stream/promises';
import {pathToFileURL,fileURLToPath} from 'node:url';
import path from 'node:path';

const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
async function removeInside(root,target){
 const relative=path.relative(path.resolve(root),path.resolve(target));
 if(!relative||relative.startsWith('..')||path.isAbsolute(relative))throw Error('Unsafe backup cleanup path');
 await rm(target,{recursive:true,force:true,maxRetries:5,retryDelay:100});
}
async function move(source,target){
 for(let attempt=0;;attempt++)try{await rename(source,target);return;}catch(error){if(attempt>=5||!['EPERM','EACCES','EBUSY'].includes(error.code))throw error;await new Promise(resolve=>setTimeout(resolve,100*(attempt+1)));}
}
async function listBlobs(client){
 const rows=[];
 for(let start=0;;start+=1000){const {data,error}=await client.from('blobs').select('sha256,mime,bytes').order('sha256').range(start,start+999);if(error)throw Error('Backup blob listing failed');rows.push(...data);if(data.length<1000)return rows;}
}
export async function createBackup({directory,client,dump,now=new Date()}){
 directory=path.resolve(directory);
 const date=now.toISOString().slice(0,10),pending=path.join(directory,date+'.partial'),snapshot=path.join(directory,date),pool=path.join(directory,'blobs');
 await mkdir(pool,{recursive:true,mode:0o700});await mkdir(pending,{recursive:true,mode:0o700});
 try{
  await dump(path.join(pending,'database.sql'));await chmod(path.join(pending,'database.sql'),0o600);
  const blobs=await listBlobs(client);
  for(const row of blobs){
   if(!/^[a-f0-9]{64}$/.test(row.sha256))throw Error('Invalid backup blob hash');
   const file=path.join(pool,row.sha256);let bytes;try{bytes=await readFile(file);}catch(error){if(error.code!=='ENOENT')throw error;}
   if(!bytes||bytes.length!==Number(row.bytes)||hash(bytes)!==row.sha256){
    const {data,error}=await client.storage.from('blobs').download(row.sha256);if(error)throw Error('Backup blob download failed');bytes=Buffer.from(await data.arrayBuffer());
    if(bytes.length!==Number(row.bytes)||hash(bytes)!==row.sha256)throw Error('Backup blob integrity hash mismatch');
    await writeFile(file+'.tmp',bytes,{mode:0o600});await rename(file+'.tmp',file);
   }
  }
  const sql=await readFile(path.join(pending,'database.sql')),migrationRoot=fileURLToPath(new URL('../supabase/migrations/',import.meta.url)),migrations=[];
  await mkdir(path.join(pending,'migrations'),{recursive:true});
  for(const file of (await readdir(migrationRoot)).filter(file=>file.endsWith('.sql')).sort()){const bytes=await readFile(path.join(migrationRoot,file));await writeFile(path.join(pending,'migrations',file),bytes,{mode:0o600});migrations.push({file,sha256:hash(bytes)});}
  await writeFile(path.join(pending,'snapshot.json'),JSON.stringify({format:'card-print-studio-backup',version:1,restoreKind:'app-data-with-migrations',createdAt:now.toISOString(),databaseSha256:hash(sql),migrations,blobs},null,2)+'\n',{mode:0o600});
  const previous=snapshot+'.previous';let moved=false;
  try{await removeInside(directory,previous);await move(snapshot,previous);moved=true;}catch(error){if(error.code!=='ENOENT')throw error;}
  try{await move(pending,snapshot);}catch(error){if(moved)await move(previous,snapshot);throw error;}
  if(moved)await removeInside(directory,previous);
  const cutoff=new Date(now.getTime()-30*86400000).toISOString().slice(0,10);
  for(const entry of await readdir(directory,{withFileTypes:true}))if(entry.isDirectory()&&/^\d{4}-\d{2}-\d{2}$/.test(entry.name)&&entry.name<cutoff)await removeInside(directory,path.join(directory,entry.name));
  const retained=new Set();
  for(const entry of await readdir(directory,{withFileTypes:true}))if(entry.isDirectory()&&/^\d{4}-\d{2}-\d{2}$/.test(entry.name)){const manifest=JSON.parse(await readFile(path.join(directory,entry.name,'snapshot.json')));for(const blob of manifest.blobs)retained.add(blob.sha256);}
  for(const file of await readdir(pool))if(/^[a-f0-9]{64}$/.test(file)&&!retained.has(file))await removeInside(directory,path.join(pool,file));
  return {date,blobs:blobs.length,databaseSha256:hash(sql)};
 }catch(error){await removeInside(directory,pending);throw error;}
}

export async function dumpDatabase(file,env=process.env){
 const url=new URL(env.SUPABASE_DB_URL),pg={...env,PGHOST:url.hostname,PGPORT:url.port||'5432',PGUSER:decodeURIComponent(url.username),PGPASSWORD:decodeURIComponent(url.password),PGDATABASE:decodeURIComponent(url.pathname.slice(1)),PGSSLMODE:url.searchParams.get('sslmode')??(['localhost','127.0.0.1'].includes(url.hostname)?'disable':'require')};
 // Supabase owns internal schemas. Rebuild application DDL from its exact
 // migrations, and preserve Auth/application data without replacing platform DDL.
 let command=env.PG_DUMP_BIN||'pg_dump',args=['--no-owner','--data-only','--schema=public','--schema=auth','--exclude-table=auth.schema_migrations'];
 if(env.BACKUP_DOCKER_CONTAINER){
  if(!['localhost','127.0.0.1'].includes(url.hostname)||!/^supabase_db_[\w-]+$/.test(env.BACKUP_DOCKER_CONTAINER))throw Error('Local backup container requires a local database URL');
  command=env.DOCKER_BIN||'docker';args=['exec',env.BACKUP_DOCKER_CONTAINER,'pg_dump','-U','postgres',...args,'postgres'];
 }else if(env.BACKUP_DOCKER_IMAGE){
  command=env.DOCKER_BIN||'docker';args=['run','--rm','--network','host',...['PGHOST','PGPORT','PGUSER','PGPASSWORD','PGDATABASE','PGSSLMODE'].flatMap(key=>['-e',key]),env.BACKUP_DOCKER_IMAGE,'pg_dump',...args];
 }
 const child=spawn(command,args,{env:pg,stdio:['ignore','pipe','pipe'],windowsHide:true});
 child.stderr.resume();
 const completion=new Promise((resolve,reject)=>{child.once('error',()=>reject(Error('pg_dump could not start')));child.once('close',code=>code===0?resolve():reject(Error('pg_dump failed; check database connection and client version')));});
 await Promise.all([pipeline(child.stdout,createWriteStream(file,{mode:0o600})),completion]);
}
async function main(){
 for(const key of ['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','SUPABASE_DB_URL','BACKUP_DIR'])if(!process.env[key])throw Error(`Missing ${key}`);
 const client=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
 console.log(JSON.stringify(await createBackup({directory:process.env.BACKUP_DIR,client,dump:file=>dumpDatabase(file)})));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)main().catch(()=>{console.error('Backup failed. Check server credentials, database tools and blob integrity. No cleanup was requested.');process.exitCode=1;});
