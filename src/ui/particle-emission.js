import {el,button,field} from './dom.js';
import {createParticleEmission} from '../model/particle-emission.js';

const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const pair=(start,end)=>el('div',{class:'particle-range'},start,el('span',{'aria-hidden':'true'},'~'),end);
const columns=(...fields)=>el('div',{class:'two-fields'},...fields);
const number=(label,id,value,change,min,max,step=.1)=>field(label,id,value,change,{type:'number',min,max,step});

function curveEditor(key,title,points,change,{max=8,valueKey='value',suffix='배',defaultValue=1}={}){
 const id='effect-'+key+'-curve',enabled=!!points?.length;
 const box=el('section',{class:'particle-curve'},el('label',{class:'check'},el('input',{id:id+'-enabled',type:'checkbox',checked:enabled,onchange:event=>change(event.target.checked?[{at:0,[valueKey]:defaultValue},{at:1,[valueKey]:key==='alpha'?0:defaultValue}]:undefined)}),title));
 if(!enabled)return box;
 const update=(index,key,value)=>{const next=structuredClone(points);next[index][key]=value;change(next);};
 const largest=()=>{let best=0;for(let i=1;i<points.length-1;i++)if(points[i+1].at-points[i].at>points[best+1].at-points[best].at)best=i;return best;};
 const addPoint=(at,value)=>{if(points.length>=16)return;const next=structuredClone(points);if(next.some(p=>Math.abs(p.at-at)<.005))return;next.push({at,[valueKey]:value});next.sort((a,b)=>a.at-b.at);change(next);};
 box.append(pair(number('시작 ('+suffix+')',id+'-start',points[0][valueKey],v=>update(0,valueKey,v),0,max),number('끝 ('+suffix+')',id+'-end',points.at(-1)[valueKey],v=>update(points.length-1,valueKey,v),0,max)));
 const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.id=id+'-graph';svg.setAttribute('viewBox','0 0 240 90');svg.setAttribute('class','particle-curve-graph');svg.setAttribute('aria-label',title+' · 점을 끌거나 두 번 눌러 추가');
 const top=Math.max(.1,...points.map(p=>p[valueKey]));
 const path=document.createElementNS(svg.namespaceURI,'polyline');path.setAttribute('points',points.map(p=>(10+p.at*220)+','+(80-p[valueKey]/top*70)).join(' '));svg.append(path);
 points.forEach((p,index)=>{
  const node=document.createElementNS(svg.namespaceURI,'circle');node.setAttribute('cx',10+p.at*220);node.setAttribute('cy',80-p[valueKey]/top*70);node.setAttribute('r','5');node.setAttribute('tabindex','0');node.setAttribute('role','slider');node.setAttribute('aria-label',title+' '+Math.round(p.at*100)+'%');node.setAttribute('aria-valuemin','0');node.setAttribute('aria-valuemax',String(max));node.setAttribute('aria-valuenow',String(p[valueKey]));let draft=null;
  const sample=event=>{const r=svg.getBoundingClientRect(),at=index===0?0:index===points.length-1?1:clamp((event.clientX-r.left)/r.width*240/220-10/220,points[index-1].at+.005,points[index+1].at-.005),value=clamp((80-(event.clientY-r.top)/r.height*90)/70*top,0,max);return {at:Math.round(at*1000)/1000,[valueKey]:Math.round(value*100)/100};};
  node.addEventListener('pointerdown',event=>{event.preventDefault();node.setPointerCapture(event.pointerId);draft=sample(event);});
  node.addEventListener('pointermove',event=>{if(!draft)return;draft=sample(event);node.setAttribute('cx',10+draft.at*220);node.setAttribute('cy',80-draft[valueKey]/top*70);});
  node.addEventListener('pointerup',event=>{if(!draft)return;const next=structuredClone(points);next[index]=sample(event);draft=null;change(next);});
  node.addEventListener('pointercancel',()=>{draft=null;node.setAttribute('cx',10+p.at*220);node.setAttribute('cy',80-p[valueKey]/top*70);});
  node.addEventListener('keydown',event=>{if(!['ArrowUp','ArrowDown'].includes(event.key))return;event.preventDefault();update(index,valueKey,Math.round(clamp(p[valueKey]+(event.key==='ArrowUp'?.1:-.1),0,max)*100)/100);});svg.append(node);
 });
 svg.addEventListener('dblclick',event=>{if(event.target!==svg&&event.target!==path)return;const r=svg.getBoundingClientRect();addPoint(Math.round(clamp(((event.clientX-r.left)/r.width*240-10)/220,.005,.995)*1000)/1000,Math.round(clamp((80-(event.clientY-r.top)/r.height*90)/70*top,0,max)*100)/100);});
 box.append(svg,el('p',{class:'hint'},'가로축: '+(key==='rate'?'생성 지속 시간':'입자 수명')+' 0~100% · 점을 끌어 조절하거나 두 번 눌러 추가'));
 points.slice(1,-1).forEach((p,i)=>{const index=i+1;box.append(el('div',{class:'particle-curve-point'},number('시점 (%)',id+'-'+index+'-at',p.at*100,v=>update(index,'at',v/100),(points[index-1].at+.005)*100,(points[index+1].at-.005)*100,1),number('값 ('+suffix+')',id+'-'+index+'-value',p[valueKey],v=>update(index,valueKey,v),0,max),button('×',()=>change(points.filter((_,j)=>j!==index)),{'aria-label':title+' 중간 점 삭제'})));});
 box.append(button('중간 점 추가',()=>{const i=largest();addPoint((points[i].at+points[i+1].at)/2,(points[i][valueKey]+points[i+1][valueKey])/2);},{id:id+'-add',disabled:points.length>=16}));
 return box;
}

function burstTimeline(emission,change){
 const timeline=el('div',{id:'effect-burst-timeline',class:'particle-burst-timeline','aria-label':'Burst 시간표 · 표시를 끌어 시점 이동'});
 emission.bursts.forEach((burst,index)=>{
  const max=emission.duration-(burst.cycles-1)*burst.interval;
  const marker=button(String(index+1),()=>{},{'data-burst':index,role:'slider','aria-label':'Burst '+(index+1)+' 발생 시점','aria-valuemin':0,'aria-valuemax':max,'aria-valuenow':burst.time,style:'left:'+burst.time/emission.duration*100+'%'});
  let dragging=false;
  const sample=event=>Math.round(clamp((event.clientX-timeline.getBoundingClientRect().left)/timeline.clientWidth*emission.duration,0,max)*100)/100;
  marker.addEventListener('pointerdown',event=>{event.preventDefault();dragging=true;marker.setPointerCapture(event.pointerId);});
  marker.addEventListener('pointermove',event=>{if(dragging){const value=sample(event);marker.style.left=value/emission.duration*100+'%';marker.setAttribute('aria-valuenow',value);}});
  marker.addEventListener('pointerup',event=>{if(!dragging)return;dragging=false;change(index,sample(event));});
  marker.addEventListener('pointercancel',()=>{dragging=false;marker.style.left=burst.time/emission.duration*100+'%';});
  marker.addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();change(index,event.key==='Home'?0:event.key==='End'?max:Math.round(clamp(burst.time+(event.key==='ArrowRight'?.05:-.05),0,max)*100)/100);});timeline.append(marker);
 });
 return el('div',{class:'particle-burst-chart'},timeline,el('div',{class:'particle-time-labels'},el('span',{},'0초'),el('span',{},emission.duration+'초')));
}

export function renderParticleEmission(layer,mutate,{open=true}={}){
 const emission=layer.emission,section=el('details',{id:'effect-emission-section',open},el('summary',{},'생성 시간 · Burst · 수명 곡선'));
 section.append(el('label',{class:'check'},el('input',{id:'effect-emission-enabled',type:'checkbox',checked:!!emission,onchange:event=>mutate(l=>{if(event.target.checked)l.emission=createParticleEmission(l.params);else delete l.emission;})}),'생성 시간표 사용'));
 if(!emission){section.append(el('p',{class:'hint'},'기존 효과의 순환 방식을 유지하고 있어요. 시간표를 켜면 초당 생성·Burst와 수명을 따로 정할 수 있어요.'));return section;}
 const update=(key,value)=>mutate(l=>{if(value===undefined)delete l.emission[key];else l.emission[key]=value;});
 const input=(key,label,min,max,step=.1)=>number(label,'effect-emission-'+key,emission[key],v=>update(key,v),min,max,step);
 if(!emission.rateCurve?.length)section.append(input('rate','초당 생성량 (개/초)',0,500));
 section.append(columns(input('delay','시작 지연 (초)',0,60),input('duration','생성 지속 (초)',.05,60,.05)),field('전체 반복','effect-emission-loop-mode',emission.loops===0?'infinite':'finite',v=>update('loops',v==='infinite'?0:1),{options:[['infinite','계속 반복'],['finite','횟수 지정']]}));
 if(emission.loops)section.append(input('loops','전체 재생 횟수',1,1000,1));
 section.append(columns(input('loopDelay','반복 사이 휴식 (초)',0,60),input('prewarm','미리 채우기 (초)',0,30)),el('p',{class:'hint'},'생성이 끝나도 이미 나온 입자는 수명이 끝날 때까지 남아요. 초당 생성량을 0으로 하면 Burst만 나와요.'),el('strong',{},'입자 수명 (초)'),pair(input('lifeMin','최소',.05,30,.05),input('lifeMax','최대',.05,30,.05)),input('maxAlive','동시에 보이는 최대 입자',1,1024,1),field('입자 겹침 순서','effect-emission-drawOrder',emission.drawOrder??'newerFront',v=>update('drawOrder',v),{options:[['newerFront','새로 나온 입자가 위'],['olderFront','오래된 입자가 위']]}));
 section.append(curveEditor('rate','시간별 생성률 곡선',emission.rateCurve,v=>update('rateCurve',v??[]),{max:500,valueKey:'rate',suffix:'개/초',defaultValue:emission.rate}));
 section.append(el('h4',{},'Burst · 한 번에 생성'),burstTimeline(emission,(index,value)=>mutate(l=>l.emission.bursts[index].time=value)));
 emission.bursts.forEach((burst,index)=>{
  const patch=(key,value)=>mutate(l=>l.emission.bursts[index][key]=value);
  const input=(key,label,min,max,step=.1)=>number(label,'effect-burst-'+index+'-'+key,burst[key],v=>patch(key,v),min,max,step);
  section.append(el('section',{class:'particle-burst-row'},el('div',{class:'particle-burst-heading'},el('strong',{},'Burst '+(index+1)),button('삭제',()=>mutate(l=>l.emission.bursts.splice(index,1)),{'aria-label':'Burst '+(index+1)+' 삭제'})),input('time','발생 시점 (초)',0,emission.duration,.05),pair(input('countMin','최소 생성량',1,1024,1),input('countMax','최대 생성량',1,1024,1)),columns(input('cycles','반복 횟수',1,1000,1),input('interval','반복 간격 (초)',.01,60,.05)),number('발생 확률 (%)','effect-burst-'+index+'-probability',burst.probability*100,v=>patch('probability',v/100),0,100,1)));
 });
 section.append(button('+ Burst 추가',()=>mutate(l=>l.emission.bursts.push({time:0,countMin:10,countMax:10,cycles:1,interval:.1,probability:1})),{id:'effect-burst-add',disabled:emission.bursts.length>=32}),curveEditor('size','수명별 크기 곡선',emission.sizeCurve,v=>update('sizeCurve',v)),curveEditor('alpha','수명별 불투명도 곡선',emission.alphaCurve,v=>update('alphaCurve',v),{max:1,suffix:'0~1',defaultValue:layer.params.alphaStart??1}));
 return section;
}
