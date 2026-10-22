const finite=(value,min,max)=>Number.isFinite(value)&&value>=min&&value<=max;
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const EPS=1e-8;

export function createParticleEmission(params={}){
 const life=finite(params.life,.05,30)?params.life:2;
 return {delay:0,duration:Math.max(1,life),loops:0,loopDelay:0,prewarm:0,rate:Math.min(500,(params.count??24)/life),rateCurve:[],lifeMin:life,lifeMax:life,maxAlive:256,bursts:[]};
}

export function validateParticleEmission(value){
 const errors=[];
 const shape=(item,allowed,label)=>{
  if(!object(item)){errors.push(label+'은 설정을 담은 객체여야 해요.');return false;}
  for(const key of Object.keys(item))if(!allowed.includes(key))errors.push(label+'에 지원하지 않는 항목 “'+key+'”이 있어요.');
  return true;
 };
 const num=(item,key,label,min,max,integer=false)=>{
  if(!finite(item[key],min,max)||integer&&!Number.isInteger(item[key]))errors.push(label+' 값 '+String(item[key])+'은 '+min+'~'+max+(integer?' 사이의 정수':' 사이의 수')+'여야 해요.');
 };
 if(!shape(value,['delay','duration','loops','loopDelay','prewarm','rate','rateCurve','lifeMin','lifeMax','maxAlive','bursts','sizeCurve','alphaCurve','drawOrder'],'입자 생성 설정'))return errors;
 if(value.drawOrder!==undefined&&!['newerFront','olderFront'].includes(value.drawOrder))errors.push('입자 겹침 순서는 새 입자 위 또는 오래된 입자 위로 설정하세요.');
 for(const [key,label,min,max,integer] of [['delay','시작 지연',0,60],['duration','생성 지속 시간',.05,60],['loops','전체 반복 횟수',0,1000,true],['loopDelay','반복 사이 휴식',0,60],['prewarm','미리 채우기 시간',0,30],['rate','초당 생성량',0,500],['lifeMin','최소 입자 수명',.05,30],['lifeMax','최대 입자 수명',.05,30],['maxAlive','동시 표시 한도',1,1024,true]])num(value,key,label,min,max,integer);
 if(value.lifeMin>value.lifeMax)errors.push('최소 입자 수명은 최대 입자 수명보다 클 수 없어요.');
 for(const [key,label,max] of [['sizeCurve','수명별 크기 곡선',8],['alphaCurve','수명별 불투명도 곡선',1]]){
  if(value[key]===undefined)continue;
  const curve=value[key];
  if(!Array.isArray(curve)||curve.length<2||curve.length>16){errors.push(label+'은 2~16개의 점으로 설정하세요.');continue;}
  let previous=-1;
  for(const point of curve){
   if(!shape(point,['at','value'],label))continue;
   num(point,'at',label+' 시점',0,1);num(point,'value',label+' 값',0,max);
   if(point.at<=previous)errors.push(label+'의 시점은 중복 없이 앞에서 뒤 순서여야 해요.');previous=point.at;
  }
  if(curve[0]?.at!==0||curve.at(-1)?.at!==1)errors.push(label+'에는 시작(0)과 끝(1) 지점이 필요해요.');
 }
 if(!Array.isArray(value.rateCurve)||value.rateCurve.length>16||value.rateCurve.length===1)errors.push('생성률 곡선은 비우거나 2~16개의 점으로 설정하세요.');
 else if(value.rateCurve.length){
  let previous=-1;
  for(const point of value.rateCurve){
   if(!shape(point,['at','rate'],'생성률 곡선 점'))continue;
   num(point,'at','곡선 시점',0,1);num(point,'rate','곡선 초당 생성량',0,500);
   if(point.at<=previous)errors.push('생성률 곡선의 시점은 중복 없이 앞에서 뒤 순서여야 해요.');previous=point.at;
  }
  if(value.rateCurve[0]?.at!==0||value.rateCurve.at(-1)?.at!==1)errors.push('생성률 곡선에는 시작(0)과 끝(1) 지점이 필요해요.');
 }
 if(!Array.isArray(value.bursts)||value.bursts.length>32)errors.push('Burst 시간표는 최대 32개까지 추가할 수 있어요.');
 else for(const [index,burst] of value.bursts.entries()){
  const label='Burst '+(index+1)+' · ';
  if(!shape(burst,['time','countMin','countMax','cycles','interval','probability'],label))continue;
  for(const [key,name,min,max,integer] of [['time','발생 시점',0,value.duration],['countMin','최소 생성량',1,1024,true],['countMax','최대 생성량',1,1024,true],['cycles','반복 횟수',1,1000,true],['interval','반복 간격',0,60],['probability','발생 확률',0,1]])num(burst,key,label+name,min,max,integer);
  if(burst.countMin>burst.countMax)errors.push(label+'최소 생성량은 최대 생성량보다 클 수 없어요.');
  if(burst.cycles>1&&burst.interval<=0)errors.push(label+'여러 번 반복할 때는 반복 간격을 0초보다 크게 설정하세요.');
  if(burst.time+(burst.cycles-1)*burst.interval>value.duration+EPS)errors.push(label+'마지막 반복 시점이 생성 지속 시간 '+value.duration+'초를 넘어요.');
 }
 return errors;
}

export function sampleLifetimeCurve(points,phase){
 if(!points?.length)return undefined;
 const at=Math.max(0,Math.min(1,phase));
 const index=points.findIndex(point=>point.at>=at);
 if(index<=0)return points[index<0?points.length-1:0].value;
 const before=points[index-1],after=points[index],mix=(at-before.at)/(after.at-before.at);
 return before.value+(after.value-before.value)*mix;
}

function rateSegments(e){
 const points=e.rateCurve?.length?e.rateCurve:[{at:0,rate:e.rate},{at:1,rate:e.rate}];
 let area=0;
 return points.slice(1).map((end,index)=>{
  const start=points[index],time=start.at*e.duration,width=(end.at-start.at)*e.duration;
  const slope=(end.rate-start.rate)/width,segment={time,width,rate:start.rate,slope,area};
  area+=(start.rate+end.rate)*width/2;segment.endArea=area;return segment;
 });
}
function areaAt(segments,time){
 let area=0;
 for(const s of segments){const dt=Math.max(0,Math.min(s.width,time-s.time));area=s.area+s.rate*dt+s.slope*dt*dt/2;if(time<=s.time+s.width)break;}
 return area;
}
function birthAt(segments,ordinal){
 const s=segments.find(s=>s.endArea+EPS>=ordinal&&s.endArea>s.area);
 if(!s)return Infinity;
 const amount=Math.max(0,ordinal-s.area),root=Math.sqrt(Math.max(0,s.rate*s.rate+2*s.slope*amount));
 const dt=amount===0?0:Math.abs(s.slope)<1e-10?amount/s.rate:2*amount/(s.rate+root);
 return s.time+Math.min(s.width,dt);
}

/** Sample only live births, independent of frame rate, playback history or seeking.
 * The display cap keeps the most recent live births. No frames/history accumulate.
 */
export function sampleParticleEmission(e,time,random=()=>.5){
 if(!e||!Number.isFinite(time)||time<0)return [];
 const now=time+e.prewarm,period=e.duration+e.loopDelay,cap=e.maxAlive;
 if(!finite(period,.05,120)||!Number.isInteger(cap)||cap<1||cap>1024||!finite(e.lifeMax,.05,30)||now<e.delay)return [];
 const particles=[],segments=rateSegments(e),latest=Math.min(Math.floor((now-e.delay)/period),e.loops?e.loops-1:Infinity);let oldestKept=-Infinity;
 const bursts=e.bursts.map((burst,event)=>({burst,event})).filter(({burst})=>burst.probability>0);
 if(!bursts.length&&!segments.at(-1)?.endArea)return [];
 const earliest=Math.max(0,Math.ceil((now-e.lifeMax-e.delay-e.duration)/period-EPS));
 const compare=(a,b)=>b.birth-a.birth||b.index-a.index;
 const trim=()=>{particles.sort(compare);particles.length=Math.min(cap,particles.length);oldestKept=particles.length===cap?particles.at(-1).birth:-Infinity;};
 const add=(birth,index,cycle,slot,count)=>{
  if(birth>now+EPS)return;
  const life=e.lifeMin+(e.lifeMax-e.lifeMin)*random(index,cycle+':emission-life'),age=Math.max(0,now-birth);
  if(age>=life-EPS)return;
  const phase=age/life;
  particles.push({birth:birth-e.prewarm,index,cycle,slot,count,life,age,phase,sizeScale:sampleLifetimeCurve(e.sizeCurve,phase)??1,alpha:sampleLifetimeCurve(e.alphaCurve,phase)});
  if(particles.length>=cap*2)trim();
  return true;
 };
 for(let cycle=latest;cycle>=earliest;cycle--){
  const start=e.delay+cycle*period;
  if(start+e.duration-e.prewarm<oldestKept-EPS)break;
  const low=Math.max(0,now-e.lifeMax-start),high=Math.min(e.duration,now-start);
  const first=Math.max(1,Math.ceil(areaAt(segments,low)-EPS)),last=Math.floor(areaAt(segments,high)+EPS);
  for(let ordinal=last;ordinal>=first;ordinal--){
   const birth=start+birthAt(segments,ordinal);
   if(birth-e.prewarm<oldestKept-EPS)break;
   add(birth,ordinal,cycle,(ordinal-1)%cap,cap);
  }
  trim();
  for(const {event,burst} of bursts){
   const firstRepeat=burst.interval?Math.max(0,Math.ceil((low-burst.time)/burst.interval-EPS)):0;
   const lastRepeat=burst.interval?Math.min(burst.cycles-1,Math.floor((high-burst.time)/burst.interval+EPS)):high+EPS>=burst.time?0:-1;
   for(let repeat=lastRepeat;repeat>=firstRepeat;repeat--){
    const birth=start+burst.time+repeat*burst.interval;
    if(birth-e.prewarm<oldestKept-EPS)break;
    const salt=cycle+':burst:'+event+':'+repeat;
    if(random(event,salt+':chance')>=burst.probability)continue;
    const count=burst.countMin+Math.floor(random(event,salt+':count')*(burst.countMax-burst.countMin+1));
    let alive=0;
    for(let slot=count-1;slot>=0;slot--)if(add(birth,(event+1)*2**24+repeat*2048+slot,cycle,slot,count)&&++alive>=cap)break;
   }
   trim();
  }
 }
 trim();return e.drawOrder==='olderFront'?particles:particles.reverse();
}
