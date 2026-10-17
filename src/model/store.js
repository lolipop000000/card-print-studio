import {clone} from './types.js';
import {validateProject} from './project.js';
import {syncVariants} from './variants.js';
export function createStore(initial,{prepare=()=>{}}={}){
  let generation=0,current={project:clone(initial),token:0,generation},savedToken=0,counter=0;const past=[],future=[],listeners=new Set(),snapshots=new WeakMap();
  const remember=()=>snapshots.set(current.project,{token:current.token,generation:current.generation});remember();
  syncVariants(current.project);prepare(current.project);
  const emit=()=>listeners.forEach(fn=>fn());
  return {
    getProject:()=>current.project,
    edit(label,change){const draft=clone(current.project);change(draft);syncVariants(draft,current.project);prepare(draft);const problems=validateProject(draft);if(problems.length)throw new Error(problems[0].message);
      if(JSON.stringify(draft)===JSON.stringify(current.project))return;
      past.push(current);if(past.length>100)past.shift();future.length=0;current={project:draft,token:++counter,label,generation};remember();emit();},
    undo(){if(!past.length)return false;future.push(current);current=past.pop();emit();return true;},
    redo(){if(!future.length)return false;past.push(current);current=future.pop();emit();return true;},
    load(project){const problems=validateProject(project);if(problems.length)throw new Error(problems[0].message);const next=clone(project);syncVariants(next);prepare(next);const resolved=validateProject(next);if(resolved.length)throw new Error(resolved[0].message);current={project:next,token:++counter,generation:++generation};remember();past.length=0;future.length=0;savedToken=current.token;emit();},
    markSaved(project=current.project){const snapshot=snapshots.get(project);if(!snapshot||snapshot.generation!==generation)return false;savedToken=snapshot.token;emit();return true;},isDirty:()=>savedToken!==current.token,
    subscribe(fn){listeners.add(fn);return ()=>listeners.delete(fn);},
    canUndo:()=>past.length>0,canRedo:()=>future.length>0
  };
}
