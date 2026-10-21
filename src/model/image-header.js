const u32=(b,o)=>((b[o]*0x1000000)+(b[o+1]<<16)+(b[o+2]<<8)+b[o+3])>>>0;
const le32=(b,o)=>(b[o]+(b[o+1]<<8)+(b[o+2]<<16)+(b[o+3]*0x1000000))>>>0;
const word=(b,o)=>(b[o]<<8)+b[o+1];
const text=(b,o,n)=>String.fromCharCode(...b.slice(o,o+n));
export function sniffImage(bytes){
 if(!(bytes instanceof Uint8Array))return null;
 if(bytes.length>=8&&[137,80,78,71,13,10,26,10].every((n,i)=>bytes[i]===n))return 'image/png';
 if(bytes.length>=3&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return 'image/jpeg';
 if(bytes.length>=12&&text(bytes,0,4)==='RIFF'&&text(bytes,8,4)==='WEBP')return 'image/webp';
 return null;
}
export function imageSize(bytes,mime){
 if(mime==='image/png'){
  if(bytes.length<33||[137,80,78,71,13,10,26,10].some((n,i)=>bytes[i]!==n)||u32(bytes,8)!==13||text(bytes,12,4)!=='IHDR')return null;
  return [u32(bytes,16),u32(bytes,20)];
 }
 if(mime==='image/jpeg'){
  if(bytes[0]!==255||bytes[1]!==216)return null;
  let cursor=2;
  while(cursor<bytes.length){
   if(bytes[cursor++]!==255)return null;
   while(bytes[cursor]===255)cursor++;
   const marker=bytes[cursor++];
   if(marker===217||marker===218)return null;
   if(marker===1||(marker>=208&&marker<=215))continue;
   if(cursor+2>bytes.length)return null;
   const length=word(bytes,cursor);if(length<2||cursor+length>bytes.length)return null;
   if([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker))return length>=8?[word(bytes,cursor+5),word(bytes,cursor+3)]:null;
   cursor+=length;
  }
  return null;
 }
 if(bytes.length<25||text(bytes,0,4)!=='RIFF'||text(bytes,8,4)!=='WEBP'||le32(bytes,4)+8!==bytes.length)return null;
 const type=text(bytes,12,4);
 if(type==='VP8X'&&bytes.length>=30)return [1+bytes[24]+(bytes[25]<<8)+(bytes[26]<<16),1+bytes[27]+(bytes[28]<<8)+(bytes[29]<<16)];
 if(type==='VP8L'&&bytes[20]===47)return [1+bytes[21]+((bytes[22]&63)<<8),1+(bytes[22]>>6)+(bytes[23]<<2)+((bytes[24]&15)<<10)];
 if(type==='VP8 '&&bytes.length>=30&&bytes[23]===157&&bytes[24]===1&&bytes[25]===42)return [(bytes[26]+(bytes[27]<<8))&16383,(bytes[28]+(bytes[29]<<8))&16383];
 return null;
}
