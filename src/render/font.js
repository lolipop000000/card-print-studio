import fontData from '../../vendor/pretendard/PretendardVariable.woff2';
let ready;
export function ensureFont(){return ready??=(async()=>{const bytes=Uint8Array.from(atob(fontData),c=>c.charCodeAt(0));const face=await new FontFace('CardStudio',bytes,{weight:'100 900'}).load();document.fonts.add(face);await document.fonts.ready;})();}
