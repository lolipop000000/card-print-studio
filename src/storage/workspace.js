import {parseProject,serializeProject} from '../model/project.js';
import {parseCardFile,cardNameKey} from '../model/card-file.js';

const DATA_FOLDER='작업실 데이터',PROJECTS_FOLDER='프로젝트',CARDS_FOLDER='카드',EXTENSION='.card-project.json',CARD_EXTENSION='.card.json';
const projectFiles={folderName:PROJECTS_FOLDER,extension:EXTENSION,parse:parseProject,invalid:'invalid-project',label:'프로젝트'};
const cardFiles={folderName:CARDS_FOLDER,extension:CARD_EXTENSION,parse:parseCardFile,invalid:'invalid-card',label:'카드 파일'};
const permissionOptions={mode:'readwrite'};
const reserved=/^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i;

export class WorkspaceStorageError extends Error {
 constructor(code,message,cause){super(message,{cause});this.name='WorkspaceStorageError';this.code=code;}
}
const problem=(code,message,cause)=>new WorkspaceStorageError(code,message,cause);
function normalizeError(error,code,message){
 if(error instanceof WorkspaceStorageError)return error;
 if(['NotAllowedError','SecurityError'].includes(error?.name))return problem('permission-denied','폴더 쓰기 권한이 없어요. 폴더 연결에서 다시 허용하세요.',error);
 if(error?.name==='NoModificationAllowedError')return problem('conflict','다른 창에서 이 파일을 저장하고 있어요. 잠시 후 파일을 다시 열어 주세요.',error);
 return problem(code,message,error);
}
const errorInfo=error=>({code:error.code,message:error.message});
function checkFileName(fileName,extension=EXTENSION){
 if(typeof fileName!=='string'||!fileName.toLowerCase().endsWith(extension)||fileName.length>200||/[<>:"/\\|?*\x00-\x1f]/.test(fileName)||/[.\s]$/.test(fileName)||reserved.test(fileName))throw problem('invalid-file-name','파일 이름을 확인하세요.');
 return fileName;
}
function fileStem(name){
 let stem=Array.from(String(name).normalize('NFC').replace(/[^\p{L}\p{N} ._-]/gu,'_').replace(/^\.+/,'').replace(/[.\s]+$/,'').trim()).slice(0,72).join('');
 if(!stem)stem='카드 덱';
 if(reserved.test(stem))stem='_'+stem;
 return stem;
}

// IndexedDB contains directory handles only; deck JSON and embedded assets stay in the selected folder.
export function createHandlePersistence({indexedDB=globalThis.indexedDB}={}){
 async function transact(mode,key,value){
  if(!indexedDB)throw problem('persistence-unavailable','이 브라우저에서는 연결한 폴더를 기억할 수 없어요.');
  const database=await new Promise((resolve,reject)=>{
   const request=indexedDB.open('card-print-studio-workspaces',1);
   request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains('handles'))request.result.createObjectStore('handles');};
   request.onsuccess=()=>resolve(request.result);
   request.onerror=()=>reject(request.error);
   request.onblocked=()=>reject(problem('persistence-unavailable','폴더 연결 정보를 열 수 없어요. 다른 작업실 창을 닫고 다시 시도하세요.'));
  });
  try{return await new Promise((resolve,reject)=>{
   const transaction=database.transaction('handles',mode),store=transaction.objectStore('handles');
   const request=mode==='readonly'?store.get(key):store.put(value,key);
   transaction.oncomplete=()=>resolve(request.result);
   transaction.onabort=()=>reject(transaction.error||request.error||problem('persistence-unavailable','폴더 연결 정보를 기억하지 못했어요.'));
   transaction.onerror=()=>reject(transaction.error||request.error);
  });}finally{database.close();}
 }
 return {get:key=>transact('readonly',key),set:(key,handle)=>transact('readwrite',key,handle)};
}

/**
 * The active filename is separate from the project model. read() only prepares a load;
 * call bindLoaded(result) after confirming and loading it, or unbind() for a new/imported deck.
 */
export function createWorkspaceStorage({
 picker=globalThis.showDirectoryPicker?.bind(globalThis),
 persistence=createHandlePersistence(),key=globalThis.location?.href||'card-print-studio'
}={}){
 let connection=null,remembered=null,binding={fileName:null,text:null},queue=Promise.resolve(),selection=0;
 let state={supported:typeof picker==='function',connected:false,folderName:null,dataFolderName:DATA_FOLDER,projectsFolderName:PROJECTS_FOLDER,cardsFolderName:CARDS_FOLDER,permission:'prompt',error:null,warning:null};
 const listeners=new Set(),origins=new WeakMap(),loads=new WeakMap();
 const getState=()=>({...state,fileName:binding.fileName});
 function publish(patch={}){state={...state,...patch};const snapshot=getState();for(const fn of listeners){try{fn(snapshot);}catch{/* A rendering listener cannot turn a completed disk write into a failed save. */}}}
 function enqueue(operation){const result=queue.then(operation);queue=result.catch(()=>{});return result;}
 function fail(error,code,message){const next=normalizeError(error,code,message);publish({error:errorInfo(next)});return next;}
 function requireConnection(){if(!connection)throw problem('not-connected','HTML이 있는 폴더를 먼저 연결하세요.');return connection;}
 function verifyHandle(root){if(root?.kind!=='directory'||typeof root.getDirectoryHandle!=='function'||typeof root.queryPermission!=='function')throw problem('invalid-folder','연결할 폴더를 다시 선택하세요.');}
 async function directories(target,create,folderName=PROJECTS_FOLDER){
  const slot=folderName===CARDS_FOLDER?'cards':'projects';
  if(target[slot])return target[slot];
  try{
   const data=await target.root.getDirectoryHandle(DATA_FOLDER,{create});
   target[slot]=await data.getDirectoryHandle(folderName,{create});return target[slot];
  }catch(error){if(!create&&error?.name==='NotFoundError')return null;throw error;}
 }
 async function permission(root,request=false){
  const value=await (request&&typeof root.requestPermission==='function'?root.requestPermission(permissionOptions):root.queryPermission(permissionOptions));
  if(value!=='granted')throw problem('permission-denied','폴더 읽기·쓰기 권한을 허용해야 저장할 수 있어요.');
  return value;
 }
 function adopt(target){connection=target;remembered=target;binding={fileName:null,text:null};publish({connected:true,folderName:target.root.name,permission:'granted',error:null});}
 function descriptor(target,fileName,project,file={}){
  const entry={fileName,name:project?.name||fileName,cardCount:project?.cards?.length??null,lastModified:file.lastModified??null,size:file.size??null,error:null};
  origins.set(entry,target);return entry;
 }
 function entryName(entry,target,extension=EXTENSION){
  if(entry&&typeof entry==='object'&&origins.has(entry)&&origins.get(entry)!==target)throw problem('stale-binding','연결한 폴더가 바뀌었어요. 프로젝트 목록을 다시 열어 주세요.');
  return checkFileName(typeof entry==='string'?entry:entry?.fileName,extension);
 }
 async function readText(handle){const file=await handle.getFile();return {file,text:await file.text()};}
 async function unusedName(folder,stem,extension=EXTENSION){
  const occupied=new Set();for await(const [name] of folder.entries())occupied.add(name.normalize('NFC').toLowerCase());
  let index=1,name=stem+extension;while(occupied.has(name.toLowerCase()))name=stem+' ('+(++index)+')'+extension;
  return name;
 }
 function parseStored(text,kind){try{return kind.parse(text);}catch(error){throw problem(kind.invalid,kind.label+' 내용이 올바르지 않아요: '+error.message,error);}}
 async function listFiles(kind){
  const target=requireConnection();
  return enqueue(async()=>{
   try{
    await permission(target.root);const folder=await directories(target,false,kind.folderName);if(!folder)return [];
    const entries=[];
    for await(const [fileName,handle] of folder.entries()){
     if(handle.kind!=='file'||!fileName.toLowerCase().endsWith(kind.extension))continue;
     let entry;
     try{const {file,text}=await readText(handle);entry=descriptor(target,fileName,parseStored(text,kind),file);}
     catch(error){entry=descriptor(target,fileName,null);entry.error=errorInfo(normalizeError(error,'read-failed','파일을 읽지 못했어요. 권한과 파일 상태를 확인하세요.'));}
     entries.push(entry);
    }
    return entries.sort((a,b)=>a.name.localeCompare(b.name,'ko')||a.fileName.localeCompare(b.fileName));
   }catch(error){throw fail(error,'read-failed',kind.label+' 목록을 읽지 못했어요. 폴더를 다시 연결하세요.');}
  });
 }
 async function readFile(entry,kind){
  const target=requireConnection(),fileName=entryName(entry,target,kind.extension);
  return enqueue(async()=>{
   try{
    await permission(target.root);const folder=await directories(target,false,kind.folderName);if(!folder)throw problem('read-failed',kind.label+' 폴더가 없어요.');
    const {file,text}=await readText(await folder.getFileHandle(fileName)),project=parseStored(text,kind);
    const result={project,text,fileName,entry:descriptor(target,fileName,project,file)};
    if(kind===projectFiles)loads.set(result,{target,fileName,text});return result;
   }catch(error){throw fail(error,'read-failed',kind.label+' 내용을 읽지 못했어요. 파일 상태와 권한을 확인하세요.');}
  });
 }
 async function freshHandle(folder,fileName){
  try{await folder.getFileHandle(fileName);throw problem('conflict','같은 이름의 파일이 이미 있어요. 기존 파일을 열거나 다른 이름으로 저장하세요.');}
  catch(error){if(error?.name!=='NotFoundError')throw error;}
  const handle=await folder.getFileHandle(fileName,{create:true});
  if((await readText(handle)).text!=='')throw problem('conflict','저장할 이름에 다른 파일이 생겼어요. 다시 저장하세요.');
  return handle;
 }
 async function writeChecked(handle,text,expected){
  let writer;
  try{
   writer=await handle.createWritable({keepExistingData:false,mode:'exclusive'});
   if((await readText(handle)).text!==expected)throw problem('conflict','저장 전에 파일이 바뀌었어요. 파일을 다시 열어 주세요.');
   await writer.write(text);
   if((await readText(handle)).text!==expected)throw problem('conflict','저장 중에 파일이 바뀌었어요. 파일을 다시 열어 주세요.');
   await writer.close();writer=null;
  }catch(error){if(writer)try{await writer.abort();}catch{/* Preserve the original write/close failure. */}throw error;}
 }
 function activateRemembered(target){if(!connection&&remembered===target){connection=target;publish({connected:true,folderName:target.root.name,permission:'granted',error:null});}}
 function saveFailure(error,target){
  const next=normalizeError(error,'write-failed','폴더에 저장하지 못했어요. 공간과 파일 권한을 확인하고 다시 저장하세요.');
  if(connection===target||remembered===target)publish({error:errorInfo(next),...(next.code==='permission-denied'?{permission:'denied'}:{})});
  return next;
 }

 const api={
  getState,
  subscribe(fn){listeners.add(fn);return ()=>listeners.delete(fn);},
  unbind(){binding={fileName:null,text:null};publish({error:null});},
  bindLoaded(loaded){
   const known=loads.get(loaded);
   if(!known||known.target!==connection)throw problem('stale-binding','불러올 프로젝트를 현재 폴더에서 다시 열어 주세요.');
   binding={fileName:known.fileName,text:known.text};publish({error:null});
  },
  async restore(){
   if(!state.supported)return false;
   const attempt=++selection;let root;
   try{root=await persistence?.get(key);}catch(error){if(attempt===selection)publish({warning:'폴더 연결을 복원하지 못했어요. 폴더를 다시 선택하세요.'});return false;}
   if(!root||attempt!==selection)return false;
   try{
    verifyHandle(root);remembered={root,projects:null};
    const granted=await root.queryPermission(permissionOptions);if(attempt!==selection)return false;
    if(granted!=='granted'){connection=null;binding={fileName:null,text:null};publish({connected:false,folderName:root.name,permission:granted,error:null});return false;}
    await directories(remembered,false);if(attempt!==selection)return false;
    adopt(remembered);return true;
   }catch(error){if(attempt===selection)publish({error:errorInfo(normalizeError(error,'read-failed','기억한 폴더를 열 수 없어요. 폴더를 다시 연결하세요.'))});return false;}
  },
  async connect(){
   if(!state.supported)throw fail(problem('unsupported','이 브라우저에서는 폴더 저장을 지원하지 않아요. Chrome 또는 Edge에서 열어 주세요.'));
   const attempt=++selection;let root;
   try{
    // Keep this picker ahead of every await so the initiating click grants user activation.
    root=await picker({id:'card-studio-data',mode:'readwrite'});
    if(attempt!==selection)return false;
    verifyHandle(root);await permission(root,true);if(attempt!==selection)return false;
    const target={root,projects:null};await directories(target,true);if(attempt!==selection)return false;
    adopt(target);publish({warning:null});
    try{await persistence?.set(key,root);}catch{if(connection===target)publish({warning:'폴더에는 저장할 수 있지만 연결을 기억하지 못했어요. 다음에 폴더를 다시 선택하세요.'});}
    return true;
   }catch(error){if(error?.name==='AbortError')return false;if(attempt===selection)throw fail(error,'connect-failed','폴더를 연결하지 못했어요. 폴더 권한과 위치를 확인하세요.');throw normalizeError(error,'connect-failed','폴더를 연결하지 못했어요.');}
  },
  list:()=>listFiles(projectFiles),
  read:entry=>readFile(entry,projectFiles),
  listCards:()=>listFiles(cardFiles),
  readCard:entry=>readFile(entry,cardFiles),
  async saveCard(text,name,{onDuplicate}={}){
   let capturedText,stem,project;
   try{
    if(typeof text!=='string')throw problem('invalid-card','저장할 카드 파일 내용을 확인하세요.');
    capturedText=text;project=parseStored(capturedText,cardFiles);stem=fileStem(name??project.cards[0].name);
   }catch(error){throw fail(error,'invalid-card','카드 파일을 저장할 수 없어요: '+error.message);}
   const target=connection||remembered;if(!target)throw fail(problem('not-connected','HTML이 있는 폴더를 먼저 연결하세요.'));
   const permissionResult=permission(target.root,true).then(value=>({value}),error=>({error}));
   return enqueue(async()=>{
    try{
     const result=await permissionResult;if(result.error)throw result.error;
     const folder=await directories(target,true,CARDS_FOLDER);activateRemembered(target);
     let fileName,handle,expected='',overwritten=false;
     if(onDuplicate){
      const entries=[],known=new Map();
      for await(const [name,file] of folder.entries()){
       if(file.kind!=='file'||!name.toLowerCase().endsWith(CARD_EXTENSION))continue;
       let saved;try{saved=await readText(file);}catch(error){throw problem('read-failed','중복 카드를 확인할 파일 “'+name+'”을 읽지 못했어요.',error);}
       let existing;try{existing=parseStored(saved.text,cardFiles);}catch{continue;}
       if(cardNameKey(existing.cards[0].name)!==cardNameKey(project.cards[0].name))continue;
       const entry=descriptor(target,name,existing,saved.file);entries.push(entry);known.set(entry,{handle:file,text:saved.text});
      }
      if(entries.length){
       entries.sort((a,b)=>a.fileName.localeCompare(b.fileName,'ko'));
       const choice=await onDuplicate(entries);
       if(!choice||choice.action==='cancel')return null;
       if(connection!==target)throw problem('stale-binding','중복 카드를 고르는 동안 저장 폴더가 바뀌었어요. 새 폴더에서 다시 저장하세요.');
       if(choice.action==='overwrite'){
        const selected=known.get(choice.entry);if(!selected)throw problem('stale-binding','덮어쓸 파일을 현재 중복 카드 목록에서 다시 선택하세요.');
        fileName=choice.entry.fileName;handle=selected.handle;expected=selected.text;overwritten=true;
       }else if(choice.action!=='add')return null;
      }
     }
     if(!handle){fileName=await unusedName(folder,stem,CARD_EXTENSION);handle=await freshHandle(folder,fileName);}
     await writeChecked(handle,capturedText,expected);
     const entry=descriptor(target,fileName,project,{size:new Blob([capturedText]).size});
     if(connection===target)publish({permission:'granted',error:null});
     return {text:capturedText,project,fileName,entry,overwritten};
    }catch(error){throw saveFailure(error,target);}
   });
  },
  async save(project,options={}){
   let text;const requestedFileName=options.fileName;
   try{text=serializeProject(project);if(requestedFileName!==undefined&&requestedFileName!==null)checkFileName(requestedFileName);}
   catch(error){throw fail(error,'invalid-project','프로젝트를 저장할 수 없어요: '+error.message);}
   const target=connection||remembered,savedBinding=binding;
   if(!target)throw fail(problem('not-connected','HTML이 있는 폴더를 먼저 연결하세요.'));
   // Start any permission request in this explicit Save gesture, before waiting for earlier writes.
   const permissionResult=permission(target.root,true).then(value=>({value}),error=>({error}));
   return enqueue(async()=>{
    try{
     const result=await permissionResult;if(result.error)throw result.error;
     const folder=await directories(target,true);
     activateRemembered(target);
     const specified=requestedFileName!==undefined&&requestedFileName!==null;
     const fileName=specified?requestedFileName:(savedBinding.fileName||await unusedName(folder,fileStem(JSON.parse(text).name)));
     const bound=fileName===savedBinding.fileName&&savedBinding.text!==null;let handle,expected;
     if(bound){
      try{handle=await folder.getFileHandle(fileName);expected=(await readText(handle)).text;}
      catch(error){if(error?.name==='NotFoundError')throw problem('conflict','저장하던 프로젝트 파일이 이동되거나 삭제됐어요. 프로젝트를 다시 열어 주세요.',error);throw error;}
      if(expected!==savedBinding.text)throw problem('conflict','다른 곳에서 프로젝트 파일이 바뀌었어요. 파일을 다시 열어 확인하거나 새 덱으로 저장하세요.');
     }else{handle=await freshHandle(folder,fileName);expected='';}
     await writeChecked(handle,text,expected);
     savedBinding.fileName=fileName;savedBinding.text=text;
     const entry=descriptor(target,fileName,JSON.parse(text),{size:new Blob([text]).size});
     const saved={project,text,fileName,entry};loads.set(saved,{target,fileName,text});
     if(connection===target&&binding===savedBinding)publish({permission:'granted',error:null});
     return saved;
    }catch(error){throw saveFailure(error,target);}
   });
  }
 };
 return api;
}
