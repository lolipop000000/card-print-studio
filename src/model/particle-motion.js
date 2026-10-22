export const PARTICLE_PATHS=[['natural','기존 움직임'],['straight','직선'],['fan','부채꼴 퍼짐'],['spiral','바깥으로 나선'],['vortex','안쪽으로 소용돌이'],['wave','물결 흔들림'],['orbit','원 궤도']];
const number=(label,value,min,max,step)=>({type:'number',label,value,min,max,step,optional:true,group:'이동 패턴'});
export const PARTICLE_MOTION_FIELDS={
 motionPattern:{type:'select',label:'추가 이동 패턴',value:'natural',options:PARTICLE_PATHS,optional:true,group:'이동 패턴'},
 pathDistance:number('패턴 이동 거리',.5,0,3,.05),
 pathTurns:number('패턴 회전 수',1,-8,8,.1),
 pathAmplitude:number('물결 진폭',.15,0,2,.05)
};
/** Target-height units. Pure sampling keeps seeking, looping and print frames deterministic. */
export function particlePathOffset(params,{phase,index=0,count=1}){
 const pattern=params.motionPattern??'natural';if(pattern==='natural')return {x:0,y:0};
 const distance=params.pathDistance??.5,turns=params.pathTurns??1,angle=(params.direction??-90)*Math.PI/180;
 const theta=phase*turns*Math.PI*2;let x=distance*phase,y=0;
 if(pattern==='fan'){
  const fan=(count>1?index/(count-1)-.5:0)*(params.spread??1)*Math.PI;
  x=distance*phase*Math.cos(fan);y=distance*phase*Math.sin(fan);
 }else if(['spiral','vortex','orbit'].includes(pattern)){
  const radius=distance*(pattern==='spiral'?phase:pattern==='vortex'?1-phase:1);
  x=radius*Math.cos(theta);y=radius*Math.sin(theta);
 }else if(pattern==='wave')y=(params.pathAmplitude??.15)*Math.sin(theta);
 return {x:x*Math.cos(angle)-y*Math.sin(angle),y:x*Math.sin(angle)+y*Math.cos(angle)};
}
