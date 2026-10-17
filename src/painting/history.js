export function createPaintHistory({maxSteps=40,maxBytes=128*1024*1024}={}){
 if(!Number.isSafeInteger(maxSteps)||maxSteps<1||!Number.isSafeInteger(maxBytes)||maxBytes<1)throw Error('잘못된 그림 기록 한도예요.');
 let past=[],future=[],retained=0,busy=false,token=0,counter=0,saved=0;const listeners=new Set(),emit=()=>listeners.forEach(fn=>fn());
 return {
  push(entry){
   if(busy||!Number.isSafeInteger(entry.byteLength)||entry.byteLength<0||entry.byteLength>maxBytes)return false;
   for(const e of future)retained-=e.byteLength;future=[];
   const item={...entry,beforeToken:token,afterToken:++counter};past.push(item);retained+=item.byteLength;token=item.afterToken;
   while(past.length>maxSteps||retained>maxBytes){retained-=past.shift().byteLength;}emit();return true;
  },
  async undo(){if(busy||!past.length)return false;busy=true;const e=past.at(-1);try{await e.undo();past.pop();future.push(e);token=e.beforeToken;emit();return true;}finally{busy=false;}},
  async redo(){if(busy||!future.length)return false;busy=true;const e=future.at(-1);try{await e.redo();future.pop();past.push(e);token=e.afterToken;emit();return true;}finally{busy=false;}},
  count:()=>past.length+future.length,bytes:()=>retained,canUndo:()=>past.length>0,canRedo:()=>future.length>0,isBusy:()=>busy,
  isDirty:()=>token!==saved,markSaved(){saved=token;emit();},subscribe(fn){listeners.add(fn);return ()=>listeners.delete(fn);}
 };
}
