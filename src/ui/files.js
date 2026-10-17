import {parseProject,serializeProject} from '../model/project.js';
import {loadAssets} from '../model/assets.js';
import {syncSkillElements} from '../render/templates.js';
import {openDialog} from './dialogs.js';
export function download(data,name,mime){const blob=data instanceof Blob?data:new Blob([data],{type:mime});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
const safeName=name=>String(name).replace(/[^\p{L}\p{N} ._-]/gu,'_')||'카드 덱';
export async function saveProjectFile(store,{markSaved=true}={}){download(serializeProject(store.getProject()),safeName(store.getProject().name)+'.card-project.json','application/json');if(markSaved)store.markSaved();return true;}
export async function confirmReplacement(store,{save=()=>saveProjectFile(store)}={}){
 if(!store.isDirty())return true;const choice=await openDialog({title:'현재 작업을 저장할까요?',message:'저장하지 않은 카드 변경이 있어요.',choices:[{id:'save',label:'저장하고 계속'},{id:'discard',label:'저장하지 않고 계속'},{id:'cancel',label:'취소'}]});
 if(choice==='save')return save();return choice==='discard';
}
export async function prepareProjectFile(file){const next=parseProject(await file.text());await loadAssets(next);next.cards=next.cards.map(c=>(c.autoSkillLayout??c.template!=='custom')?syncSkillElements(c,next.settings,next.keywords||[]):c);return next;}
export async function loadProjectFile(file,store,options={}){const next=await prepareProjectFile(file);if(options.isCurrent&&!options.isCurrent())return false;if(!await confirmReplacement(store,options))return false;if(options.isCurrent&&!options.isCurrent())return false;store.load(next);return true;}
