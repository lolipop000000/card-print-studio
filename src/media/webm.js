// Single VP8 track, millisecond timecodes and a seek cue at every keyframe.
// Container layout follows https://www.webmproject.org/docs/container/.
const bytes=(value,length=Math.max(1,Math.ceil(Math.log2(value+1)/8)))=>{
 const out=new Uint8Array(length);for(let i=length-1;i>=0;i--){out[i]=value%256;value=Math.floor(value/256);}return out;
};
function join(parts){const out=new Uint8Array(parts.reduce((sum,p)=>sum+p.length,0));let at=0;for(const p of parts){out.set(p,at);at+=p.length;}return out;}
function size(value){let length=1;while(value>=2**(7*length)-1)length++;const out=bytes(value,length);out[0]|=1<<(8-length);return out;}
const element=(id,payload)=>join([bytes(id),size(payload.length),payload]);
const group=(id,...children)=>element(id,join(children));
const uint=(id,value,length)=>element(id,bytes(value,length));
const text=(id,value)=>element(id,new TextEncoder().encode(value));
function float(id,value){const buffer=new ArrayBuffer(8);new DataView(buffer).setFloat64(0,value);return element(id,new Uint8Array(buffer));}

export function vp8Webm(frames,{width,height,durationMs,fps}){
 const header=group(0x1a45dfa3,uint(0x4286,1),uint(0x42f7,1),uint(0x42f2,4),uint(0x42f3,8),text(0x4282,'webm'),uint(0x4287,2),uint(0x4285,2));
 const info=group(0x1549a966,uint(0x2ad7b1,1_000_000),float(0x4489,durationMs),text(0x4d80,'Card Studio'),text(0x5741,'Card Studio'));
 const tracks=group(0x1654ae6b,group(0xae,uint(0xd7,1),uint(0x73c5,1),uint(0x83,1),uint(0x9c,0),text(0x86,'V_VP8'),uint(0x23e383,Math.round(1e9/fps)),group(0xe0,uint(0xb0,width),uint(0xba,height))));
 const clusters=[];let blocks=[],clusterTime=0;
 function finish(){if(blocks.length)clusters.push({time:clusterTime,data:group(0x1f43b675,uint(0xe7,clusterTime),...blocks)});blocks=[];}
 for(const frame of frames){
  const time=Math.round(frame.timestamp/1000);
  if(frame.key){finish();clusterTime=time;}
  const relative=time-clusterTime;
  const prefix=new Uint8Array([0x81,(relative>>8)&255,relative&255,frame.key?0x80:0]);
  blocks.push(element(0xa3,join([prefix,frame.data])));
 }
 finish();
 // Fixed-width seek positions make the index size independent of its offsets.
 const seek=(id,position)=>group(0x4dbb,element(0x53ab,bytes(id)),uint(0x53ac,position,8));
 const seekHead=(infoAt,tracksAt,cuesAt)=>group(0x114d9b74,seek(0x1549a966,infoAt),seek(0x1654ae6b,tracksAt),seek(0x1c53bb6b,cuesAt));
 const indexSize=seekHead(0,0,0).length,infoAt=indexSize,tracksAt=infoAt+info.length;
 let position=tracksAt+tracks.length;
 const cues=group(0x1c53bb6b,...clusters.map(cluster=>{const cue=group(0xbb,uint(0xb3,cluster.time),group(0xb7,uint(0xf7,1),uint(0xf1,position)));position+=cluster.data.length;return cue;}));
 const segment=group(0x18538067,seekHead(infoAt,tracksAt,position),info,tracks,...clusters.map(c=>c.data),cues);
 return new Blob([header,segment],{type:'video/webm; codecs="vp8"'});
}
