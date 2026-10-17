export const fract=v=>v-Math.floor(v);
export function effectRandom(seed,id,index=0,salt=0){
 const text=seed+':'+id+':'+index+':'+salt;let h=2166136261;
 for(let i=0;i<text.length;i++){h^=text.charCodeAt(i);h=Math.imul(h,16777619);}
 h^=h>>>16;h=Math.imul(h,0x7feb352d);h^=h>>>15;return (h>>>0)/4294967296;
}
export const effectPhase=(time,life,offset)=>fract(time/life+offset);
