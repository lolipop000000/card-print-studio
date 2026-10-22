import {clone,newId} from './types.js';
import {valueLabel} from './problem-details.js';
import {BLEND_MODES,DEFAULT_BLEND_MODE} from './blend-modes.js';
import {SPRITE_CONTROL_FIELDS,spriteControlDefaults,validateSpriteControls} from './sprite-controls.js';
import {textRangeTarget,textRangeOwners} from './text-ranges.js';
import {PARTICLE_MOTION_FIELDS} from './particle-motion.js';
import {validateParticleEmission} from './particle-emission.js';

const numeric=(label,value,min,max,step=.05,unit='')=>({type:'number',label,value,min,max,step,unit});
const color=(label,value)=>({type:'color',label,value});
const choice=(label,value,options)=>({type:'select',label,value,options});
const count=numeric('개수',24,1,80,1);
const life=numeric('수명',2,.2,6,.1,'초');
const direction=numeric('진행 방향',-90,-180,180,5,'°');
const colorField=color('색','#ffb24b');
function particleFields({color:primary,color2:secondary,count:amount,size,travel,spread,life:duration,direction:heading,fade,spin}){
 const fields={color:color('기본 색',primary),color2:color('보조 색',secondary),count:{...count,value:amount},size:numeric('크기',size,.005,.3,.005),travel:numeric('이동 거리',travel,0,2,.05),spread:numeric('흩어짐',spread,0,2,.05),life:{...life,value:duration},direction:{...direction,value:heading},fade:numeric('끝 사라짐',fade,.2,4,.1)};
 if(spin!==undefined)fields.spin=numeric('회전 속도',spin,-3,3,.05,'회전/초');return fields;
}
function particleCombination(name,layers){return {name,category:'흩날림·입자',layers:[{kind:'outline',scope:'outside',params:{color:'#334a50',width:.12}},...layers]};}
export const VISUAL_EFFECT_CATALOG={
 bloom:{name:'Bloom · 밝은 빛 번짐',hint:'밝기 기준을 넘는 부분만 골라 빛을 퍼뜨려요. 밝은 글자·그림 또는 불꽃 뒤에 겹쳐보세요.',animated:false,filter:true,fields:{threshold:numeric('밝기 기준',.55,0,1,.05),knee:numeric('기준 경계 부드러움',.35,0,1,.05),radius:numeric('번짐 반경',2,0,12,.1,'mm'),strength:numeric('빛 강도',1.1,0,3,.1),color:color('빛 색','#ffffff')}},
 directionalBlur:{name:'방향 흐림',hint:'정한 방향으로 잔상을 펴요. 샘플 수를 높이면 부드러워지고 계산 시간이 늘어나요.',animated:false,filter:true,fields:{distance:numeric('잔상 길이',1,0,8,.1,'mm'),angle:numeric('잔상 방향',0,-180,180,5,'°'),samples:numeric('샘플 수',9,3,25,1),strength:numeric('강도',1,0,1,.05)}},
 displacement:{name:'교차 일렁임',hint:'가로·세로 움직임을 겹쳐 열기나 물속처럼 일렁여요. 움직임을 끄면 같은 모양으로 고정돼요.',animated:true,filter:true,fields:{amount:numeric('흔들림 거리',.45,0,3,.05,'mm'),wavelength:numeric('무늬 간격',4,.5,20,.5,'mm'),axis:choice('변형 축','both',[['both','가로 + 세로'],['x','가로'],['y','세로']])}},
 heatHaze:{name:'이글거림 · 열기 왜곡',hint:'불규칙한 열기가 흐르며 글자나 그림이 아른거려요. 불꽃·발광 뒤에 겹쳐보세요. 움직임을 끄면 같은 장면으로 고정돼요.',animated:true,filter:true,fields:{amount:numeric('이글거림 세기',.22,0,3,.02,'mm'),wavelength:numeric('열기 무늬 크기',2.4,.5,20,.1,'mm'),detail:numeric('잔물결',.65,0,1,.05),direction:numeric('열기 이동 방향',-90,-180,180,5,'°')}},
 sprite:{name:'이미지·도형 입자',hint:'룬·별·꽃잎 또는 직접 가져온 그림을 날려요. 크기·이동 거리는 대상 높이 기준이며, 끝 크기를 줄이면 작아져요. 배치 변화 0은 같은 경로를 반복해요.',animated:true,generative:true,fields:{
  shape:choice('입자 모양','star',[['image','내 이미지'],['star','별'],['circle','원'],['rune','룬'],['diamond','수정'],['petal','꽃잎'],['snowflake','눈 결정']]),
  assetId:{type:'asset',label:'입자 이미지',value:null},tint:choice('이미지 색 처리','original',[['original','원본 색 유지'],['tint','기본 색으로 칠하기'],['lifetime','수명에 따라 두 색 전환']]),
  color:color('시작 색','#d6edff'),color2:color('끝 색','#9c75ff'),count:numeric('입자 수',24,1,120,1),
  sizeStart:numeric('시작 크기',.025,0,8,.005,'대상 높이 비율'),sizeEnd:numeric('끝 크기',.06,0,8,.005,'대상 높이 비율'),
  alphaStart:numeric('시작 투명도',1,0,1,.05),alphaEnd:numeric('끝 투명도',0,0,1,.05),fadeIn:numeric('생성 부드러움',.1,0,.5,.05,'수명 비율'),fadeOut:numeric('소멸 부드러움',.35,0,1,.05,'수명 비율'),
  life:numeric('수명',2,.2,12,.1,'초'),direction,travel:numeric('이동 거리',.5,0,3,.05,'대상 높이 비율'),spread:numeric('퍼짐',.5,0,2,.05),drift:numeric('좌우 흔들림',.15,0,1,.05),
  gravity:numeric('중력',0,-2,2,.05,'대상 높이/초²'),rotation:numeric('시작 회전',0,-180,180,5,'°'),spin:numeric('회전 속도',.1,-3,3,.05,'회전/초'),randomness:numeric('배치 변화',1,0,1,.05),...SPRITE_CONTROL_FIELDS
 }},
 outline:{name:'외곽선',hint:'원본과 입자의 투명도를 따라 테두리도 함께 옅어져요.',placement:'behind',animated:false,filter:true,fields:{color:colorField,width:numeric('두께',.5,.05,5,.05,'mm')}},
 glow:{name:'발광',placement:'behind',animated:true,filter:true,fields:{color:colorField,radius:numeric('번짐',2,0,12,.1,'mm'),strength:numeric('강도',1,0,3,.1)}},
 shadow:{name:'그림자',placement:'behind',animated:false,filter:true,fields:{color:color('색','#152032'),offsetX:numeric('가로 거리',1,-12,12,.1,'mm'),offsetY:numeric('세로 거리',1,-12,12,.1,'mm'),blur:numeric('번짐',1.5,0,12,.1,'mm')}},
 gradient:{name:'그라데이션',placement:'surface',animated:true,filter:true,fields:{color:color('시작 색','#fff1a8'),color2:color('끝 색','#ed6039'),angle:numeric('각도',90,-180,180,5,'°'),strength:numeric('강도',1,0,1,.05)}},
 flame:{name:'불꽃',placement:'behind',animated:true,generative:true,fields:{color:color('바깥 색','#e74917'),color2:color('중간 색','#ff9e24'),color3:color('안쪽 색','#fff0a3'),height:numeric('높이',.68,.05,2,.05),size:numeric('불덩이 크기',.1,.02,.6,.01),width:numeric('폭',.14,.02,.6,.01),count:{...count,value:110,max:260},sway:numeric('흔들림',.4,0,1),life:{...life,value:1.8},direction}},
 smoke:{name:'연기',placement:'behind',animated:true,generative:true,fields:{color:color('색','#79818c'),density:numeric('농도',.6,.05,1),size:numeric('덩어리 크기',.09,.02,1),height:numeric('높이',.95,.05,2,.05),spread:numeric('퍼짐',.5,0,2),life:{...life,value:3.5},count:{...count,value:70,max:200},direction}},
 ember:{name:'불티',placement:'behind',animated:true,generative:true,fields:{color:color('색','#ffbc61'),count:{...count,value:40},size:numeric('크기',.025,.005,.2,.005),tail:numeric('꼬리 길이',.1,0,.6,.01),life,direction}},
 mist:{name:'안개',placement:'behind',animated:true,generative:true,fields:{color:color('색','#b7d3d8'),density:numeric('밀도',.35,.05,1),spread:numeric('퍼짐',.8,0,2),softness:numeric('부드러움',.8,0,1),size:numeric('덩어리 크기',.4,.05,1),count:{...count,value:12},life:{...life,value:5},direction:{...direction,value:-15}}},
 lightning:{name:'번개',placement:'behind',animated:true,generative:true,fields:{color:color('색','#b9e9ff'),width:numeric('두께',.3,.05,3,.05,'mm'),branches:numeric('갈라짐',3,0,8,1),frequency:numeric('발생 빈도',2,.2,8,.1)}},
 ripple:{name:'파동',hint:'끝 크기가 시작보다 작으면 안으로 줄어들어요. 0으로 끝낼 수도 있어요.',placement:'behind',animated:true,generative:true,fields:{color:color('색','#79d9ff'),width:numeric('두께',.35,.05,3,.05,'mm'),start:numeric('시작 크기',.05,0,1),end:numeric('끝 크기',.9,0,2),frequency:numeric('발생 빈도',1,.2,8,.1),count:{...count,value:3},life,fade:{...numeric('끝 사라짐',1,.2,4,.1),optional:true}}},
 particle:{name:'반짝이는 입자',placement:'behind',animated:true,generative:true,fields:{shape:choice('모양','star',[['star','별'],['snow','눈'],['dot','점']]),color:color('색','#fff3b6'),count,size:numeric('크기',.04,.005,.3,.005),spread:numeric('퍼짐',.7,0,2),life:{...life,value:3.5},direction}},
 starlight:{name:'4각 별빛',hint:'밝고 둥근 중심에서 가는 광선이 네 방향으로 뻗고, 끝으로 갈수록 투명해져요. 반짝임을 0으로 하면 밝기를 고정하고, 회전은 따로 조절해요.',placement:'front',animated:true,generative:true,fields:{
  color:color('빛 색','#b8dfff'),coreColor:color('중심 색','#ffffff'),count:numeric('개수',12,0,160,1),size:numeric('빛 크기',.12,0,2,.01,'대상 높이 비율'),rays:numeric('별 안쪽 두께',.22,.03,.65,.01),stretch:numeric('세로 길이',1.45,.25,4,.05,'배'),glow:numeric('빛 번짐',.65,0,2,.05),life:numeric('빛 수명',2.8,.1,30,.1,'초'),twinkle:numeric('반짝임 속도',1,0,4,.05,'회/초'),rotation:numeric('시작 회전',0,-180,180,5,'°'),spin:numeric('회전 속도',.1,-3,3,.05,'회전/초'),randomness:numeric('배치 변화',0,0,1,.05)
 }},
 aura:{name:'오라·광선',placement:'behind',animated:true,generative:true,fields:{color:color('색','#b693ff'),length:numeric('광선 길이',.5,.05,2),count:{...count,value:20}}},
 sweep:{name:'빛 스윕',placement:'surface',animated:true,filter:true,fields:{color:color('색','#ffffff'),width:numeric('빛띠 폭',.3,.05,1),angle:numeric('각도',-25,-80,80,5,'°'),strength:numeric('강도',.8,0,1)}},
 pixelate:{name:'픽셀화',animated:false,filter:true,fields:{size:numeric('칸 크기',.6,.2,3,.1,'mm')}},
 blur:{name:'흐림',animated:false,filter:true,fields:{radius:numeric('반경',.4,0,3,.1,'mm')}},
 colorAdjust:{name:'색 조정',animated:false,filter:true,fields:{hue:numeric('색조',0,-180,180,1,'°'),saturation:numeric('채도',1,0,2),brightness:numeric('밝기',1,0,2)}},
 posterize:{name:'포스터화',animated:false,filter:true,fields:{levels:numeric('단계',4,2,8,1)}},
 halftone:{name:'하프톤 망점',animated:false,filter:true,fields:{size:numeric('망점 크기',.6,.3,2,.1,'mm'),angle:numeric('각도',45,-90,90,1,'°')}},
 chromatic:{name:'색수차',hint:'자동은 어두운 글자에 색 테두리를, 컬러 그림에 RGB 채널 분리를 적용해요.',animated:false,filter:true,fields:{distance:numeric('분리 거리',.3,0,1.5,.1,'mm'),angle:numeric('분리 방향',0,-180,180,1,'°'),mode:{...choice('분리 방식','auto',[['auto','자동'],['channels','RGB 채널'],['fringe','색 테두리']]),optional:true},color:{...color('첫 테두리 색','#ec3868'),optional:true},color2:{...color('둘째 테두리 색','#168fba'),optional:true},strength:{...numeric('강도',1,0,1,.05),optional:true}}},
 waveDistort:{name:'물결 왜곡',animated:true,filter:true,fields:{amplitude:numeric('진폭',.6,0,3,.1,'mm'),wavelength:numeric('파장',6,1,20,.5,'mm')}},
 erode:{name:'가장자리 침식',animated:false,filter:true,fields:{depth:numeric('깊이',.3,0,2,.1,'mm'),roughness:numeric('거칠기',.6,0,1)}},
 innerGlow:{name:'안쪽 발광',hint:'원본 안쪽 가장자리에 빛을 더해요.',animated:false,filter:true,fields:{color:color('빛 색','#68bcdb'),width:numeric('빛 두께',.6,.02,12,.02,'mm'),strength:numeric('강도',.8,0,1,.05)}},
 innerShadow:{name:'안쪽 그림자',hint:'안쪽 가장자리를 어둡게 눌러 깊이를 만들어요.',animated:false,filter:true,fields:{color:color('그림자 색','#182936'),offsetX:numeric('가로 거리',.4,-12,12,.05,'mm'),offsetY:numeric('세로 거리',.6,-12,12,.05,'mm'),blur:numeric('번짐',.4,0,12,.05,'mm'),strength:numeric('강도',.7,0,1,.05)}},
 bevel:{name:'양각·음각',hint:'빛 방향과 밝고 어두운 가장자리로 표면의 높낮이를 표현해요.',animated:false,filter:true,fields:{highlight:color('밝은 면','#fff3cf'),shadow:color('어두운 면','#6b4050'),size:numeric('깎인 면 두께',.5,.02,12,.02,'mm'),angle:numeric('빛 방향',-55,-180,180,5,'°'),strength:numeric('강도',.8,0,1,.05)}},
 extrude:{name:'두께·입체',hint:'원본 뒤에 두께를 더해 입체적인 모서리를 만들어요.',animated:false,filter:true,fields:{color:color('옆면 색','#463655'),depth:numeric('두께',1.2,0,4,.05,'mm'),angle:numeric('쌓는 방향',45,-180,180,5,'°')}},
 foil:{name:'금속 반사 무늬',hint:'밝고 어두운 반사 띠를 색으로 표현해요.',animated:true,filter:true,fields:{color:color('금속 색','#d49b39'),color2:color('반사 색','#fff1b3'),size:numeric('반사 띠 간격',3,.02,12,.1,'mm'),angle:numeric('반사 방향',-35,-180,180,5,'°'),strength:numeric('강도',1,0,1,.05)}},
 holographic:{name:'무지개 분광 무늬',hint:'원본 안에 여러 색의 분광 띠를 더해요.',animated:true,filter:true,fields:{size:numeric('분광 띠 간격',4,.02,12,.1,'mm'),angle:numeric('분광 방향',-25,-180,180,5,'°'),strength:numeric('강도',.85,0,1,.05)}},
 glitch:{name:'글리치',hint:'가로 띠를 조금씩 어긋나게 해 디지털 잡음을 표현해요.',animated:true,filter:true,fields:{distance:numeric('어긋남 거리',.7,0,4,.05,'mm'),bands:numeric('띠 개수',10,1,40,1),strength:numeric('강도',.65,0,1,.05)}},
 scanlines:{name:'주사선',hint:'얇고 일정한 선을 겹쳐 화면·인쇄 질감을 만들어요.',animated:false,filter:true,fields:{color:color('선 색','#142d46'),spacing:numeric('선 간격',.45,.02,12,.02,'mm'),width:numeric('선 두께',.12,.02,12,.02,'mm'),angle:numeric('기울기',0,-180,180,5,'°'),strength:numeric('강도',.45,0,1,.05)}},
 grain:{name:'입자 질감',hint:'시드로 고정된 작은 입자를 원본 표면에 더해요.',animated:false,filter:true,fields:{size:numeric('입자 크기',.15,.02,12,.01,'mm'),strength:numeric('강도',.2,0,1,.05)}},
 duotone:{name:'두 색조',hint:'밝기에 따라 어두운 색과 밝은 색을 섞어 칠해요.',animated:false,filter:true,fields:{color:color('어두운 색','#30235a'),color2:color('밝은 색','#ffc48d'),strength:numeric('강도',1,0,1,.05)}},
 firefly:{name:"반딧불",hint:"작은 빛이 흔들리며 피어나고 서서히 사라져요.",placement:'behind',animated:true,generative:true,fields:particleFields({"color":"#b4d852","color2":"#e5f5a2","count":24,"size":0.028,"travel":0.45,"spread":0.65,"life":3.2,"direction":-90,"fade":1.1})},
 bubble:{name:"기포·물방울",hint:"속이 투명한 물방울이 떠오르며 옅어져요.",placement:'behind',animated:true,generative:true,fields:particleFields({"color":"#339bbd","color2":"#a9e3ea","count":18,"size":0.065,"travel":0.5,"spread":0.45,"life":3.8,"direction":-90,"fade":0.8})},
 petal:{name:"꽃잎",hint:"곡선 꽃잎이 바람을 따라 회전하며 흩날려요.",placement:'behind',animated:true,generative:true,fields:particleFields({"color":"#e478a6","color2":"#f3b0c9","count":24,"size":0.055,"travel":0.65,"spread":0.65,"life":3.5,"direction":80,"fade":1.1,"spin":0.35})},
 leaf:{name:"나뭇잎",hint:"잎맥이 있는 나뭇잎이 회전하며 떨어져요.",placement:'behind',animated:true,generative:true,fields:particleFields({"color":"#63994c","color2":"#b5c468","count":22,"size":0.06,"travel":0.65,"spread":0.7,"life":3.5,"direction":80,"fade":1.2,"spin":0.25})},
 snowflake:{name:"눈송이",hint:"가지가 갈라진 눈 결정이 천천히 내려와요.",placement:'behind',animated:true,generative:true,fields:particleFields({"color":"#6badd0","color2":"#d0e7f0","count":24,"size":0.05,"travel":0.6,"spread":0.55,"life":4,"direction":90,"fade":0.9,"spin":0.16})},
 crystal:{name:"수정 조각",hint:"밝고 어두운 면이 나뉜 수정 조각이 흩어져요.",placement:'behind',animated:true,generative:true,fields:particleFields({"color":"#6e7ac5","color2":"#bdcfef","count":20,"size":0.055,"travel":0.4,"spread":0.6,"life":3.2,"direction":-90,"fade":1.2,"spin":0.2})},
 confetti:{name:"색종이",hint:"납작한 색종이가 뒤집히고 회전하며 떨어져요.",placement:'behind',animated:true,generative:true,fields:particleFields({"color":"#d95d7d","color2":"#69a6be","count":32,"size":0.045,"travel":0.65,"spread":0.9,"life":3,"direction":70,"fade":1.2,"spin":1.2})},
 comet:{name:"혜성·빛 꼬리",hint:"끝이 투명해지는 긴 꼬리와 빛나는 머리를 만들어요.",placement:'behind',animated:true,generative:true,fields:particleFields({"color":"#487fb9","color2":"#8fcee2","count":12,"size":0.035,"travel":0.7,"spread":0.3,"life":2,"direction":-50,"fade":1.25})},
 rain:{name:"빗줄기",hint:"방향을 따라 가느다란 빗줄기와 물방울이 내려와요.",placement:'behind',animated:true,generative:true,fields:particleFields({"color":"#3d7b9d","color2":"#93b9cf","count":32,"size":0.022,"travel":0.8,"spread":0.2,"life":1.25,"direction":100,"fade":1})},
 dust:{name:"부유 먼지",hint:"부드러운 작은 먼지가 빛 속에 떠다녀요.",placement:'behind',animated:true,generative:true,fields:particleFields({"color":"#ad865b","color2":"#dfc797","count":28,"size":0.035,"travel":0.3,"spread":0.9,"life":4.5,"direction":-85,"fade":1.5})},
 rune:{name:"룬 조각",hint:"구멍과 선이 있는 기하학 문양이 떠올라요.",placement:'behind',animated:true,generative:true,fields:particleFields({"color":"#7756a9","color2":"#b995d6","count":18,"size":0.06,"travel":0.35,"spread":0.5,"life":3,"direction":-90,"fade":1.4,"spin":0.15})},
 vortex:{name:"소용돌이 입자",hint:"입자들이 나선 궤적을 따라 퍼지며 사라져요.",placement:'behind',animated:true,generative:true,fields:particleFields({"color":"#5466bb","color2":"#b7a1dd","count":28,"size":0.025,"travel":0.4,"spread":0.65,"life":3.5,"direction":-90,"fade":1.1,"spin":0.65})},
 textWarp:{name:'글자 형태 왜곡',placement:'source',animated:false,textOnly:true,fields:{arc:numeric('아치',0,-1,1),wave:numeric('물결 높이',0,0,1),wavelength:numeric('물결 간격',.5,.1,2),skewDeg:numeric('기울임',0,-45,45,1,'°'),scaleX:numeric('가로 배율',1,.25,3),scaleY:numeric('세로 배율',1,.25,3)}}
};
// Optional fields keep earlier projects byte-for-byte compatible until edited.
for(const definition of Object.values(VISUAL_EFFECT_CATALOG))if(definition.generative)Object.assign(definition.fields,PARTICLE_MOTION_FIELDS);
export const VISUAL_EFFECT_PRESETS={
 fourPointStarlight:{name:'4각 별빛 반짝임',category:'빛·움직임',layers:[{kind:'starlight',placement:'front',emit:{face:'area',openOnly:false},params:{color:'#86c9ff',coreColor:'#ffffff',count:12,size:.1,stretch:1.5,glow:.85,twinkle:1,spin:.04,randomness:0}}]},
 radiantBloom:{name:'눈부신 빛',category:'빛·움직임',layers:[{kind:'gradient',scope:'inside',params:{color:'#fffbea',color2:'#ffbb68'}},{kind:'outline',scope:'outside',opacity:.9,params:{color:'#79502b',width:.14}},{kind:'bloom',params:{threshold:.35,knee:.5,radius:1.5,strength:1.7,color:'#ffe6b0'}}]},
 luminousRunes:{name:'떠오르는 빛의 문양',category:'빛·움직임',layers:[{kind:'sprite',placement:'front',params:{shape:'rune',color:'#607db5',color2:'#9154b3',count:18,sizeStart:.12,sizeEnd:.22,travel:.9,life:3,spin:.12,randomness:0}},{kind:'bloom',params:{threshold:.3,radius:.7,strength:1.5}}]},
 lightStreak:{name:'빛의 잔상',category:'빛·움직임',layers:[{kind:'gradient',scope:'inside',params:{color:'#80b5de',color2:'#395d9e'}},{kind:'directionalBlur',opacity:.65,params:{distance:1.2,angle:-25,samples:11,strength:.75}},{kind:'bloom',params:{threshold:.4,radius:.7,strength:.7}}]},
 liquidMirage:{name:'수면의 신기루',category:'빛·움직임',layers:[{kind:'displacement',params:{amount:.28,wavelength:3,axis:'both'}},{kind:'sprite',placement:'front',opacity:.6,params:{shape:'circle',color:'#96ddf6',color2:'#d0c5ff',sizeStart:.008,sizeEnd:.035,travel:.65,count:18,life:3.5,randomness:0}},{kind:'bloom',params:{threshold:.55,radius:.5,strength:.6}}]},
 fireflyGarden:particleCombination("반딧불 정원",[{"kind":"firefly","params":{}},{"kind":"dust","opacity":0.55,"params":{"color":"#6d9960","color2":"#b7cc82","count":12,"size":0.018,"travel":0.2}}]),
 bubbleStream:particleCombination("물방울 흐름",[{"kind":"bubble","params":{}},{"kind":"ripple","params":{"color":"#4491ac","start":0.03,"end":0.65,"count":2,"width":0.13,"fade":1.5}},{"kind":"outline","scope":"outside","opacity":0.5,"params":{"color":"#3e718a","width":0.08}}]),
 sakuraBreeze:particleCombination("벚꽃 바람",[{"kind":"petal","params":{}},{"kind":"dust","opacity":0.5,"params":{"color":"#ce95ad","color2":"#edc6d8","count":12,"size":0.018,"travel":0.3}}]),
 forestBreeze:particleCombination("숲의 바람",[{"kind":"leaf","params":{}},{"kind":"firefly","opacity":0.7,"params":{"color":"#9dbd50","color2":"#cde68d","count":12,"size":0.018,"travel":0.3}}]),
 snowfall:particleCombination("눈꽃 눈보라",[{"kind":"snowflake","params":{}},{"kind":"particle","opacity":0.5,"params":{"shape":"dot","color":"#6d9cb3","count":18,"size":0.012,"spread":0.4,"direction":90}}]),
 crystalShower:particleCombination("수정 비",[{"kind":"crystal","params":{}},{"kind":"particle","opacity":0.6,"params":{"color":"#8f7bb3","count":12,"size":0.017}}]),
 festival:particleCombination("축제 색종이",[{"kind":"confetti","params":{}},{"kind":"particle","opacity":0.55,"params":{"color":"#b27b30","count":12,"size":0.018}}]),
 meteorShower:particleCombination("별똥별 궤적",[{"kind":"comet","params":{}},{"kind":"particle","opacity":0.5,"params":{"color":"#7193b2","count":14,"size":0.016}}]),
 rainfall:particleCombination("빗방울 파문",[{"kind":"rain","params":{}},{"kind":"ripple","params":{"color":"#527f9b","start":0.05,"end":0.8,"count":3,"width":0.12,"fade":1.7}},{"kind":"outline","scope":"outside","opacity":0.45,"params":{"color":"#466478","width":0.08}}]),
 goldenDust:particleCombination("황금 먼지",[{"kind":"dust","params":{}},{"kind":"firefly","opacity":0.65,"params":{"color":"#b7903e","color2":"#e4c976","count":14,"size":0.02,"travel":0.25}}]),
 runeVortex:particleCombination("룬 소용돌이",[{"kind":"rune","params":{}},{"kind":"vortex","opacity":0.65,"params":{"count":20,"size":0.02,"travel":0.35}}]),
 soulVortex:particleCombination("영혼의 소용돌이",[{"kind":"vortex","params":{}},{"kind":"firefly","opacity":0.6,"params":{"color":"#6389a6","color2":"#bad8e6","count":12,"size":0.022,"travel":0.25}},{"kind":"ripple","opacity":0.5,"params":{"color":"#757bb5","count":2,"start":0.02,"end":0.55,"width":0.1,"fade":1.8}}]),
 flame:{name:'타오르는 불꽃',layers:[{kind:'flame'}]},
 smoke:{name:'피어오르는 연기',layers:[{kind:'smoke'}]},
 burning:{name:'불타는 카드',layers:[{kind:'smoke'},{kind:'flame'},{kind:'ember'}]},
 burningText:{name:'불타며 이글거리는 글자',category:'글자·질감',layers:[
  {kind:'gradient',params:{color:'#fff5b5',color2:'#f16c18',angle:90}},
  {kind:'glow',params:{color:'#ff7f24',radius:.5,strength:.65}},
  {kind:'flame',params:{count:60,height:.52,size:.075,width:.1,life:1.8}},
  {kind:'ember',params:{count:14,size:.015,tail:.07}},
  {kind:'heatHaze',params:{amount:.16,wavelength:1.8,detail:.7,direction:-90}}
 ]},
 heatShimmer:{name:'이글거리는 열기',category:'글자·질감',layers:[
  {kind:'gradient',params:{color:'#fff3ae',color2:'#e87928',angle:90}},
  {kind:'glow',scope:'outside',params:{color:'#ed652e',radius:.65,strength:.55}},
  {kind:'heatHaze',params:{amount:.3,wavelength:2.4,detail:.7,direction:-90}}
 ]},
 frost:{name:'서리 오라',layers:[{kind:'aura',params:{color:'#70cfff'}},{kind:'particle',params:{color:'#659cbc',shape:'snow'},placement:'front'},{kind:'glow',scope:'outside',params:{color:'#85dfff'}}]},
 poison:{name:'독안개',layers:[{kind:'smoke',params:{color:'#9759cc'}},{kind:'mist',params:{color:'#ac6ed4'}},{kind:'glow',scope:'outside',params:{color:'#9a48de'}}]},
 lightningAura:{name:'번개 오라',layers:[{kind:'aura',params:{color:'#79beff'}},{kind:'lightning'},{kind:'glow',scope:'outside',params:{color:'#b0d8ff'}}]},
 starlight:{name:'별빛 반짝임',layers:[{kind:'particle',placement:'front',params:{color:'#b98530'}},{kind:'glow',scope:'outside',params:{color:'#fff0a0',radius:1}}]},
 darkAfterglow:{name:'어둠의 잔광',layers:[{kind:'aura',params:{color:'#7846a8'}},{kind:'smoke',params:{color:'#53386e'}},{kind:'glow',scope:'outside',params:{color:'#c777f5'}}]},
 goldTitle:{name:'금빛 제목',layers:[{kind:'outline',scope:'outside',params:{color:'#805221',width:.2}},{kind:'shadow',scope:'outside',opacity:.65,params:{offsetX:.3,offsetY:.5,blur:.5}},{kind:'gradient',scope:'inside',params:{color:'#fff3ba',color2:'#b57a25'}},{kind:'sweep',scope:'inside'}]},
 neonText:{name:'네온 글자',layers:[{kind:'outline',scope:'outside',params:{color:'#faecff',width:.18}},{kind:'glow',scope:'outside',params:{color:'#e358f8',radius:2.5}},{kind:'sweep',scope:'inside',params:{color:'#8bf6ff'}}]},
 rgbSplit:{name:'RGB 분리',category:'디지털·인쇄',layers:[
  {kind:'outline',scope:'outside',params:{color:'#343c4d',width:.12}},
  {kind:'shadow',scope:'outside',opacity:.25,params:{color:'#344254',offsetX:.18,offsetY:.22,blur:.12}},
  {kind:'chromatic',scope:'all',params:{distance:.38,angle:0,mode:'auto',color:'#e84963',color2:'#168ba9',strength:.9}},
  {kind:'scanlines',scope:'inside',opacity:.3,params:{color:'#263c52',spacing:.45,width:.06,strength:.18}}
 ]},
 cyberGlitch:{name:'사이버 글리치',category:'디지털·인쇄',layers:[
  {kind:'outline',scope:'outside',params:{color:'#243949',width:.16}},
  {kind:'shadow',scope:'outside',opacity:.35,params:{color:'#183544',offsetX:.3,offsetY:.35,blur:.15}},
  {kind:'duotone',scope:'inside',params:{color:'#142536',color2:'#76d9e7',strength:.5}},
  {kind:'chromatic',scope:'all',params:{distance:.45,angle:0,mode:'fringe',color:'#dc3c72',color2:'#168fba',strength:.85}},
  {kind:'glitch',scope:'all',params:{distance:.7,bands:10,strength:.55},motion:{enabled:true}},
  {kind:'scanlines',scope:'inside',params:{color:'#12354d',spacing:.45,width:.08,strength:.25}}
 ]},
 hologram:{name:'푸른 홀로그램',category:'디지털·인쇄',layers:[
  {kind:'outline',scope:'outside',params:{color:'#25435d',width:.16}},
  {kind:'shadow',scope:'outside',opacity:.35,params:{color:'#24465c',offsetX:.22,offsetY:.28,blur:.25}},
  {kind:'holographic',scope:'inside',params:{size:3,angle:-25,strength:.75},motion:{enabled:true}},
  {kind:'innerGlow',scope:'inside',params:{color:'#ace9f2',width:.3,strength:.45}},
  {kind:'scanlines',scope:'inside',params:{color:'#28627b',spacing:.4,width:.06,strength:.22}},
  {kind:'glow',scope:'outside',params:{color:'#71cbdc',radius:.6,strength:.22},motion:{enabled:false}}
 ]},
 roseGold:{name:'장미 금속',category:'금속·입체',layers:[
  {kind:'outline',scope:'outside',params:{color:'#69423e',width:.16}},
  {kind:'extrude',scope:'outside',params:{color:'#603b40',depth:.35,angle:50}},
  {kind:'foil',scope:'inside',params:{color:'#a35d5a',color2:'#ffe0b8',size:6,angle:-35,strength:.85},motion:{enabled:false}},
  {kind:'bevel',scope:'inside',params:{highlight:'#fff0dc',shadow:'#8c4c4d',size:.28,angle:-55,strength:.7}},
  {kind:'innerShadow',scope:'inside',params:{color:'#69343e',offsetX:.13,offsetY:.2,blur:.15,strength:.28}}
 ]},
 silverChrome:{name:'은빛 크롬',category:'금속·입체',layers:[
  {kind:'outline',scope:'outside',params:{color:'#3f4b5a',width:.16}},
  {kind:'extrude',scope:'outside',params:{color:'#3c4659',depth:.32,angle:45}},
  {kind:'foil',scope:'inside',params:{color:'#6e7b8c',color2:'#f3f7ff',size:5,angle:-45,strength:1},motion:{enabled:false}},
  {kind:'bevel',scope:'inside',params:{highlight:'#ffffff',shadow:'#46546a',size:.25,angle:-55,strength:.8}},
  {kind:'innerShadow',scope:'inside',params:{color:'#24394b',offsetX:.12,offsetY:.18,blur:.15,strength:.3}}
 ]},
 enchantedGold:{name:'마법 황금',category:'금속·입체',layers:[
  {kind:'outline',scope:'outside',params:{color:'#654c25',width:.18}},
  {kind:'shadow',scope:'outside',opacity:.45,params:{color:'#654321',offsetX:.28,offsetY:.35,blur:.28}},
  {kind:'foil',scope:'inside',params:{color:'#ad711b',color2:'#fff0a6',size:6,angle:-35,strength:.95},motion:{enabled:false}},
  {kind:'bevel',scope:'inside',params:{highlight:'#fff7cf',shadow:'#694219',size:.28,angle:-55,strength:.8}},
  {kind:'glow',scope:'outside',params:{color:'#ffe07b',radius:.75,strength:.35},motion:{enabled:false}},
  {kind:'particle',placement:'front',opacity:.55,params:{color:'#b47b2b',count:14,size:.018,spread:.35,life:3},motion:{enabled:false}}
 ]},
 iceCrystal:{name:'얼음 수정',category:'마법·자연',layers:[
  {kind:'outline',scope:'outside',params:{color:'#31586b',width:.16}},
  {kind:'shadow',scope:'outside',opacity:.35,params:{color:'#325b73',offsetX:.22,offsetY:.3,blur:.25}},
  {kind:'gradient',scope:'inside',params:{color:'#d8f6ff',color2:'#3c83af',angle:90,strength:.9},motion:{enabled:false}},
  {kind:'bevel',scope:'inside',params:{highlight:'#f2ffff',shadow:'#32637f',size:.25,angle:-60,strength:.8}},
  {kind:'innerGlow',scope:'inside',params:{color:'#e4fcff',width:.22,strength:.55}},
  {kind:'particle',placement:'front',opacity:.5,params:{shape:'snow',color:'#3b789c',count:14,size:.018,spread:.3},motion:{enabled:false}},
  {kind:'glow',scope:'outside',params:{color:'#9fd9ed',radius:.65,strength:.25},motion:{enabled:false}}
 ]},
 moltenLava:{name:'용암 심장',category:'마법·자연',layers:[
  {kind:'outline',scope:'outside',params:{color:'#533025',width:.18}},
  {kind:'extrude',scope:'outside',params:{color:'#52251d',depth:.4,angle:50}},
  {kind:'gradient',scope:'inside',params:{color:'#ffbd4e',color2:'#b32a21',angle:90,strength:1},motion:{enabled:false}},
  {kind:'bevel',scope:'inside',params:{highlight:'#ffdf92',shadow:'#5b261f',size:.3,angle:-55,strength:.85}},
  {kind:'innerGlow',scope:'inside',params:{color:'#ffd365',width:.22,strength:.45}},
  {kind:'ember',placement:'behind',opacity:.5,params:{color:'#dd6c25',count:15,size:.012,tail:.03},motion:{enabled:false}},
  {kind:'glow',scope:'outside',params:{color:'#f2a54c',radius:.6,strength:.2},motion:{enabled:false}}
 ]},
 poisonSlime:{name:'독성 슬라임',category:'마법·자연',layers:[
  {kind:'outline',scope:'outside',params:{color:'#354c32',width:.18}},
  {kind:'shadow',scope:'outside',opacity:.4,params:{color:'#344b29',offsetX:.25,offsetY:.3,blur:.3}},
  {kind:'gradient',scope:'inside',params:{color:'#c0e965',color2:'#4a8c43',angle:90,strength:.95},motion:{enabled:false}},
  {kind:'bevel',scope:'inside',params:{highlight:'#efffb3',shadow:'#3e5a28',size:.3,angle:-55,strength:.8}},
  {kind:'innerGlow',scope:'inside',params:{color:'#daff9a',width:.2,strength:.4}},
  {kind:'particle',placement:'front',opacity:.4,params:{shape:'dot',color:'#607d32',count:12,size:.015,spread:.4},motion:{enabled:false}},
  {kind:'glow',scope:'outside',params:{color:'#afd960',radius:.65,strength:.18},motion:{enabled:false}}
 ]},
 shadowRelief:{name:'그림자 부조',category:'금속·입체',layers:[
  {kind:'outline',scope:'outside',params:{color:'#343043',width:.16}},
  {kind:'extrude',scope:'outside',params:{color:'#353043',depth:.55,angle:50}},
  {kind:'duotone',scope:'inside',params:{color:'#252238',color2:'#c3b4cf',strength:.65}},
  {kind:'bevel',scope:'inside',params:{highlight:'#d9cced',shadow:'#282236',size:.3,angle:-55,strength:.65}},
  {kind:'innerShadow',scope:'inside',params:{color:'#1c1828',offsetX:.2,offsetY:.25,blur:.22,strength:.7}}
 ]},
 stampedInk:{name:'잉크 도장',category:'디지털·인쇄',layers:[
  {kind:'outline',scope:'outside',params:{color:'#4b3031',width:.1}},
  {kind:'duotone',scope:'inside',params:{color:'#4e272b',color2:'#cf7d72',strength:1}},
  {kind:'innerShadow',scope:'inside',params:{color:'#49242a',offsetX:.15,offsetY:.15,blur:.12,strength:.4}},
  {kind:'erode',scope:'all',params:{depth:.08,roughness:.28}},
  {kind:'grain',scope:'inside',params:{size:.06,strength:.18}}
 ]},
 retroPrint:{name:'레트로 인쇄',category:'디지털·인쇄',layers:[
  {kind:'outline',scope:'outside',params:{color:'#313d46',width:.12}},
  {kind:'shadow',scope:'outside',opacity:.3,params:{color:'#3d4954',offsetX:.2,offsetY:.25,blur:.1}},
  {kind:'duotone',scope:'inside',params:{color:'#204d61',color2:'#e9b769',strength:.8}},
  {kind:'halftone',scope:'inside',opacity:.45,params:{size:.32,angle:30}},
  {kind:'grain',scope:'inside',params:{size:.07,strength:.16}},
  {kind:'chromatic',scope:'all',params:{distance:.15,angle:0,mode:'fringe',color:'#db6758',color2:'#267799',strength:.4}}
 ]},
 arcaneRune:{name:'비전 룬',category:'마법·자연',layers:[
  {kind:'outline',scope:'outside',params:{color:'#47305e',width:.17}},
  {kind:'shadow',scope:'outside',opacity:.4,params:{color:'#44335e',offsetX:.2,offsetY:.25,blur:.2}},
  {kind:'gradient',scope:'inside',params:{color:'#d3b9ff',color2:'#8053ad',angle:90,strength:.9},motion:{enabled:false}},
  {kind:'bevel',scope:'inside',params:{highlight:'#eee3ff',shadow:'#4d3069',size:.23,angle:-55,strength:.65}},
  {kind:'aura',placement:'behind',opacity:.28,params:{color:'#8254b8',length:.16,count:12},motion:{enabled:false}},
  {kind:'glow',scope:'outside',params:{color:'#a177d8',radius:.7,strength:.25},motion:{enabled:false}},
  {kind:'particle',placement:'front',opacity:.45,params:{color:'#925fa9',count:12,size:.018,spread:.35},motion:{enabled:false}}
 ]},
 starryDream:{name:'별빛 꿈결',category:'마법·자연',layers:[
  {kind:'outline',scope:'outside',params:{color:'#3d395d',width:.16}},
  {kind:'shadow',scope:'outside',opacity:.4,params:{color:'#35314f',offsetX:.22,offsetY:.28,blur:.3}},
  {kind:'gradient',scope:'inside',params:{color:'#e5cbfa',color2:'#7187bd',angle:90,strength:.9},motion:{enabled:false}},
  {kind:'holographic',scope:'inside',opacity:.35,params:{size:2.5,angle:-30,strength:.35},motion:{enabled:false}},
  {kind:'innerGlow',scope:'inside',params:{color:'#fff0fb',width:.2,strength:.35}},
  {kind:'particle',placement:'front',opacity:.45,params:{color:'#97799e',count:16,size:.02,spread:.4},motion:{enabled:false}},
  {kind:'glow',scope:'outside',params:{color:'#d2afec',radius:.75,strength:.2},motion:{enabled:false}}
 ]}
};
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const safe=k=>!['__proto__','constructor','prototype'].includes(k);
const validId=v=>typeof v==='string'&&v.length>0&&v.length<200&&safe(v);
const bounded=(v,min,max)=>typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max;
const keys=(value,allowed)=>object(value)&&Object.keys(value).every(key=>allowed.includes(key));
const definitionFor=kind=>Object.hasOwn(VISUAL_EFFECT_CATALOG,kind)?VISUAL_EFFECT_CATALOG[kind]:null;
const defaultParams=definition=>Object.fromEntries(Object.entries(definition.fields).filter(([,field])=>!field.optional).map(([key,field])=>[key,field.value]));
const emission=emitter=>({face:emitter==='edge'?'all':'area',openOnly:emitter!=='edge'});
const bottomStrip=origin=>({...clone(origin),y:origin.y+origin.h*.9,h:origin.h*.1});

export function makeVisualEffectLayer(kind,overrides={}){
 const definition=definitionFor(kind);if(!definition)throw Error('알 수 없는 이펙트 종류예요.');
 const extra=clone(overrides),common={id:newId(),kind,enabled:true,opacity:1,protectText:true};
 const specific=definition.generative?{placement:'behind',emit:{face:['flame','smoke','ember'].includes(kind)?'up':'all',openOnly:true},origin:{x:0,y:0,w:1,h:1},rotationDeg:0}:definition.textOnly?{placement:'source'}:{scope:'all'};
 // Accept the former factory option, while every returned layer uses the v2 schema.
 if(definition.generative&&extra.emitter!==undefined){specific.emit=emission(extra.emitter);delete extra.emitter;}
 return {...common,...specific,...extra,params:{...(kind==='sprite'?spriteControlDefaults():{}),...defaultParams(definition),...clone(overrides.params||{})},
  ...(definition.generative?{emit:{...specific.emit,...clone(overrides.emit||{})},origin:{...specific.origin,...clone(overrides.origin||{})}}:{}),
  motion:{enabled:definition.animated,speed:1,...clone(overrides.motion||{})}};
}
export function createVisualEffects(presetKey='empty',{seed=1}={}){
 const preset=Object.hasOwn(VISUAL_EFFECT_PRESETS,presetKey)?VISUAL_EFFECT_PRESETS[presetKey]:null;if(presetKey!=='empty'&&!preset)throw Error('시작 이펙트를 찾을 수 없어요.');
 return {version:2,seed,layers:(preset?.layers||[]).map(layer=>makeVisualEffectLayer(layer.kind,layer))};
}

const legacyKinds=new Set(['outline','glow','shadow','gradient','flame','smoke','ember','mist','lightning','ripple','particle','aura','sweep','textWarp']);
function fieldsFor(kind,legacy){
 const fields={...VISUAL_EFFECT_CATALOG[kind].fields};if(!legacy)return fields;
 if(kind==='flame')delete fields.size;if(kind==='smoke')delete fields.height;
 if(fields.count)fields.count={...fields.count,max:80};return fields;
}
function validateRecipe(value,target,legacy){
 const problems=[];let context='';
 const bad=message=>problems.push({code:'visual-effect',message:context+message});
 const numericValue=(label,v,min,max,unit='',integer=false,displayScale=1)=>{
  if(!bounded(v,min,max)||integer&&!Number.isInteger(v)){
   const display=value=>displayScale!==1&&typeof value==='number'&&Number.isFinite(value)?Number((value*displayScale).toPrecision(12)):value;
   bad(label+' 값 '+valueLabel(display(v))+'은 허용 범위를 벗어납니다. '+display(min)+'~'+display(max)+unit+(integer?' 사이의 정수':' 사이의 수')+'를 입력하세요.');
  }
 };
 const choiceValue=(label,v,choices)=>{if(!choices.includes(v))bad(label+' 값 '+valueLabel(v)+'은 지원하지 않습니다. '+choices.join(' / ')+' 중 하나여야 합니다.');};
 const boolValue=(label,v)=>{if(typeof v!=='boolean')bad(label+' 값 '+valueLabel(v)+'은 켜짐/꺼짐 값이 아닙니다.');};
 const shapeKeys=(v,allowed,label)=>{
  if(!object(v)){bad(label+'이 항목을 담은 객체가 아닙니다. 현재 값: '+valueLabel(v)+'.');return false;}
  for(const key of Object.keys(v))if(!allowed.includes(key))bad(label+'에 지원하지 않는 항목 '+valueLabel(key)+'이 있습니다.');
  return true;
 };
 if(!object(value)){bad('이펙트 조합이 객체가 아닙니다. 현재 값: '+valueLabel(value)+'.');return problems;}
 const jsonProblem=(v,path='조합',depth=0)=>{
  if(depth>=20)return path+'의 중첩이 저장 한도인 19단계를 넘습니다.';
  if(v===null||['string','boolean'].includes(typeof v)||typeof v==='number'&&Number.isFinite(v))return '';
  if(typeof v!=='object')return path+' 값 '+valueLabel(v)+'은 파일에 저장할 수 없는 값입니다.';
  for(const [key,item] of Object.entries(v)){
   if(!safe(key))return path+'에 사용할 수 없는 항목 '+valueLabel(key)+'이 있습니다.';
   const error=jsonProblem(item,path+(Array.isArray(v)?'['+key+']':'.'+key),depth+1);if(error)return error;
  }
  return '';
 };
 const unsafe=jsonProblem(value);if(unsafe){bad(unsafe);return problems;}
 shapeKeys(value,legacy?['seed','layers']:['version','seed','layers','frame'],'이펙트 조합');
 if(!legacy&&value.version!==2)bad('지원하는 이펙트 버전은 2입니다. 현재 버전: '+valueLabel(value.version)+'.');
 numericValue('배치 시드',value.seed,0,0xffffffff,'',true);
 if(!Array.isArray(value.layers)){bad('효과 레이어 목록이 배열이 아닙니다. 현재 값: '+valueLabel(value.layers)+'.');return problems;}
 if(value.layers.length>12){bad('효과 레이어가 '+value.layers.length+'개여서 최대 12개를 넘습니다.');return problems;}
 if(value.frame!==undefined){
  if(!['frame','any'].includes(target))bad('프레임 범위는 카드 프레임에만 저장할 수 있습니다. 현재 대상: '+valueLabel(target)+'.');
  if(shapeKeys(value.frame,['scope','bandMm'],'프레임 범위')){
   choiceValue('프레임 적용 범위',value.frame.scope,['border','borderBleed','full']);
   numericValue('테두리 띠 두께',value.frame.bandMm,2,10,'mm');
  }
 }
 const ids=new Set();let warps=0;
 for(const [index,layer] of value.layers.entries()){
  const definition=object(layer)&&definitionFor(layer.kind);
  context=(index+1)+'번 레이어'+(definition?' · '+definition.name:'')+': ';
  if(!definition||legacy&&!legacyKinds.has(layer.kind)){bad('지원하지 않는 효과 종류 '+valueLabel(layer?.kind)+'입니다.');continue;}
  if(!validId(layer.id))bad('레이어 ID '+valueLabel(layer.id)+'은 비어 있거나 사용할 수 없는 식별자입니다.');
  else if(ids.has(layer.id))bad('레이어 ID '+valueLabel(layer.id)+'이 앞선 레이어와 중복됩니다.');
  ids.add(layer.id);
  const common=['id','kind','enabled','opacity','params','motion','blendMode'];
  const specific=legacy?['placement','emitter','rotationDeg','origin']:['protectText',...(definition.generative?['placement','emit','rotationDeg','origin','emission']:definition.textOnly?['placement']:['scope'])];
  shapeKeys(layer,[...common,...specific],'레이어');
  if(!legacy&&definition.generative&&layer.emission!==undefined)for(const message of validateParticleEmission(layer.emission))bad(message);
  boolValue('레이어 사용',layer.enabled);numericValue('불투명도',layer.opacity,0,1);
  if(Object.hasOwn(layer,'blendMode')){
   choiceValue('혼합 모드',layer.blendMode,BLEND_MODES.map(([mode])=>mode));
   if(definition.textOnly&&layer.blendMode!==DEFAULT_BLEND_MODE)bad('글자 형태 왜곡은 원본 모양만 바꾸므로 색 혼합 모드를 적용할 수 없습니다.');
  }
  if(shapeKeys(layer.motion,['enabled','speed'],'움직임')){
   boolValue('움직임 사용',layer.motion.enabled);numericValue('재생 속도',layer.motion.speed,.1,3,'배');
  }
  if(!legacy)boolValue('글자 보호',layer.protectText);
  if(legacy||definition.generative){
   numericValue('회전',layer.rotationDeg,-180,180,'°');
   if(shapeKeys(layer.origin,['x','y','w','h'],'발생 영역'))for(const [key,label,min,max] of [['x','가로 위치',-1,2],['y','세로 위치',-1,legacy?2:5],['w','발생 폭',.05,3],['h','발생 높이',legacy?.05:.005,3]])numericValue(label,layer.origin[key],min,max);
   if(legacy)choiceValue('발생 방식',layer.emitter,['area','bottom','edge']);
   else if(shapeKeys(layer.emit,['face','openOnly'],'발생 면')){
    choiceValue('발생 면',layer.emit.face,['up','down','side','all','inside','area']);boolValue('빈 곳만 발생',layer.emit.openOnly);
   }
  }
  if(definition.textOnly){
   warps++;if(!['text','any'].includes(target))bad('글자 형태 왜곡은 텍스트에만 적용할 수 있습니다. 현재 대상: '+valueLabel(target)+'.');
   if(layer.placement!=='source'||index!==0)bad('글자 형태 왜곡은 조합의 첫 번째 레이어여야 합니다. 현재 순서: '+(index+1)+'번, 배치: '+valueLabel(layer.placement)+'.');
  }else if(legacy)choiceValue('앞뒤 배치',layer.placement,['behind','surface','front']);
  else if(definition.generative)choiceValue('앞뒤 배치',layer.placement,['behind','front']);
  else choiceValue('필터 적용 범위',layer.scope,['all','inside','outside']);
  if(!object(layer.params)){bad('조절 항목이 객체가 아닙니다. 현재 값: '+valueLabel(layer.params)+'.');continue;}
  const fields=fieldsFor(layer.kind,legacy);
  for(const key of Object.keys(layer.params))if(!Object.hasOwn(fields,key))bad('지원하지 않는 조절 항목 '+valueLabel(key)+'이 있습니다.');
  for(const [key,field] of Object.entries(fields)){
   if(field.optional&&!Object.hasOwn(layer.params,key))continue;
   const v=layer.params[key];
   if(field.type==='number')numericValue(field.label,v,field.min,field.max,field.unit||'',field.step===1,field.displayScale??1);
   else if(field.type==='color'&&(typeof v!=='string'||!/^#[0-9a-f]{6}$/i.test(v)))bad(field.label+' 값 '+valueLabel(v)+'은 #RRGGBB 형식의 색이 아닙니다.');
   else if(field.type==='select')choiceValue(field.label,v,field.options.map(([option])=>option));
   else if(field.type==='asset'&&v!==null&&!validId(v))bad(field.label+' 값 '+valueLabel(v)+'은 올바른 그림 ID가 아닙니다. 그림을 선택하거나 비워두세요.');
  }
  if(layer.kind==='sprite')for(const message of validateSpriteControls(layer.params))bad(message);
 }
 context='';if(warps>1)bad('글자 형태 왜곡이 '+warps+'개입니다. 한 조합에는 하나만 둘 수 있습니다.');
 return problems;
}

export function validateVisualEffects(value,target='any'){
 // Legacy validation runs before normalization: a missing new field is compatible,
 // but an invalid former value or a mixed legacy/v2 shape must never be repaired.
 return validateRecipe(value,target,object(value)&&!Object.hasOwn(value,'version'));
}
function upgradeLegacyLayer(layer){
 const definition=VISUAL_EFFECT_CATALOG[layer.kind];
 const common={id:layer.id,kind:layer.kind,enabled:layer.enabled,opacity:layer.opacity,protectText:true,...(Object.hasOwn(layer,'blendMode')?{blendMode:layer.blendMode}:{}),params:{...defaultParams(definition),...clone(layer.params)},motion:clone(layer.motion)};
 if(definition.generative)return {...common,placement:layer.placement==='behind'?'behind':'front',emit:emission(layer.emitter),origin:layer.emitter==='bottom'?bottomStrip(layer.origin):clone(layer.origin),rotationDeg:layer.rotationDeg};
 if(definition.textOnly)return {...common,placement:'source'};
 return {...common,scope:['gradient','sweep'].includes(layer.kind)?'inside':'outside'};
}
function orderLegacyLayers(layers){return [...layers.filter(l=>VISUAL_EFFECT_CATALOG[l.kind].textOnly),...layers.filter(l=>VISUAL_EFFECT_CATALOG[l.kind].filter),...layers.filter(l=>VISUAL_EFFECT_CATALOG[l.kind].generative&&l.placement==='behind'),...layers.filter(l=>VISUAL_EFFECT_CATALOG[l.kind].generative&&l.placement!=='behind')];}
export function upgradeVisualEffects(recipe,target='any'){
 const problems=validateVisualEffects(recipe,target);if(problems.length)throw Object.assign(new Error(problems[0].message),{problems});
 if(recipe.version===2)return clone(recipe);
 const result={version:2,seed:recipe.seed,...(target==='frame'?{frame:{scope:'full',bandMm:4}}:{}),layers:orderLegacyLayers(recipe.layers).map(upgradeLegacyLayer)};
 const resolved=validateVisualEffects(result,target);if(resolved.length)throw Object.assign(new Error(resolved[0].message),{problems:resolved});return result;
}

function upgradeElement(element){if(element.style?.visualEffects!==undefined)element.style.visualEffects=upgradeVisualEffects(element.style.visualEffects,element.type);return element;}
function upgradeLayerValue(layer,legacy,target){return upgradeVisualEffects({...(!legacy?{version:2}:{}),seed:0,layers:[layer]},target).layers[0];}
function upgradeLayerPatch(patch,layer,legacy,target){
 if(Object.hasOwn(patch,'value'))return {value:upgradeLayerValue(patch.value,legacy,target)};
 if(!patch.fields||!legacy)return clone(patch);
 const fields=clone(patch.fields),definition=layer&&definitionFor(layer.kind);
 // A deleted parent layer can leave a dormant override. Its old geometry has
 // different meaning for generators and filters; defer that translation until
 // the same layer ID is restored, rather than guessing or rejecting the deck.
 if(!definition)return {legacyEffect:{fields}};
 // Changing kind replaces the kind-specific schema as one independent layer.
 if(fields.kind)return {value:upgradeLegacyLayer(layer)};
 if(Object.hasOwn(fields.params||{},'value'))fields.params={value:{...defaultParams(definition),...clone(fields.params.value)}};
 if(definition.generative){
  if(fields.placement?.value==='surface')fields.placement={value:'front'};
  if(fields.emitter){fields.emit={value:emission(layer.emitter)};fields.origin={value:layer.emitter==='bottom'?bottomStrip(layer.origin):clone(layer.origin)};}
  else if(fields.origin&&layer.emitter==='bottom')fields.origin={value:bottomStrip(layer.origin)};
 }else for(const key of ['origin','rotationDeg',...(!definition.textOnly?['placement']:[])])delete fields[key];
 delete fields.emitter;return Object.keys(fields).length?{fields}:null;
}
export function applyLegacyVisualEffectPatch(base,patch,apply){
 const definition=base&&definitionFor(base.kind);if(!definition)return base;
 const legacy={...clone(base),placement:definition.textOnly?'source':definition.generative?base.placement:'behind',emitter:base.emit?.face==='all'?'edge':'area',origin:clone(base.origin||{x:0,y:0,w:1,h:1}),rotationDeg:base.rotationDeg||0};
 delete legacy.protectText;delete legacy.emit;delete legacy.scope;
 if(base.kind==='flame')delete legacy.params.size;if(base.kind==='smoke')delete legacy.params.height;
 const resolved=apply(legacy,patch),translated=upgradeLayerPatch(patch,resolved,true,'any');
 return translated?apply(base,translated):clone(base);
}
function upgradeLayersPatch(patch,recipe,target,fallbackLayers=[]){
 const legacy=recipe.version!==2;
 if(Object.hasOwn(patch,'value'))return {value:upgradeVisualEffects({...clone(recipe),layers:patch.value},target).layers};
 if(!patch.list)return clone(patch);
 const list=clone(patch.list),layers=new Map([...fallbackLayers,...recipe.layers].map(layer=>[layer.id,layer]));
 list.added=list.added.map(layer=>upgradeLayerValue(layer,legacy,target));
 for(const [id,change] of Object.entries(list.edits)){const next=upgradeLayerPatch(change,layers.get(id),legacy,target);if(next)list.edits[id]=next;else delete list.edits[id];}
 if(legacy&&(list.order||list.added.length))list.order=orderLegacyLayers(recipe.layers.length?recipe.layers:list.added).map(layer=>layer.id);
 return {list};
}
function upgradeRecipePatch(patch,recipe,target,fallbackLayers=[]){
 if(Object.hasOwn(patch,'value'))return {value:upgradeVisualEffects(patch.value,target)};
 if(!patch.fields)return clone(patch);
 const fields=clone(patch.fields);
 if(fields.layers){
  // A removed source element can leave a valid dormant override. Complete layer
  // values carry their schema; sparse parameter edits inherit the future source.
  const candidates=fields.layers.value||[...(fields.layers.list?.added||[]),...Object.values(fields.layers.list?.edits||{}).filter(p=>Object.hasOwn(p,'value')).map(p=>p.value)];
  const v2=fields.version?.value===2||candidates.some(layer=>object(layer)&&Object.hasOwn(layer,'protectText'));
  fields.layers=upgradeLayersPatch(fields.layers,recipe||{...(v2?{version:2}:{}),seed:0,layers:[]},target,fallbackLayers);
 }
 return {fields};
}
function upgradeStylePatch(patch,element){
 if(Object.hasOwn(patch,'value')){const style=clone(patch.value);if(style?.visualEffects!==undefined)style.visualEffects=upgradeVisualEffects(style.visualEffects,element.type);return {value:style};}
 const result=clone(patch);if(result.fields?.visualEffects)result.fields.visualEffects=upgradeRecipePatch(result.fields.visualEffects,element.style?.visualEffects,element.type);return result;
}
function upgradeElementPatch(patch,element){
 if(Object.hasOwn(patch,'value'))return {value:upgradeElement(clone(patch.value))};
 const result=clone(patch);if(result.fields?.style)result.fields.style=upgradeStylePatch(result.fields.style,element||{type:result.fields.type?.value||'any',style:{}});return result;
}
function upgradeElementsPatch(patch,elements){
 if(Object.hasOwn(patch,'value'))return {value:patch.value.map(element=>upgradeElement(clone(element)))};
 if(!patch.list)return clone(patch);
 const list=clone(patch.list),byId=new Map(elements.map(element=>[element.id,element]));list.added=list.added.map(element=>upgradeElement(element));
 for(const [id,change] of Object.entries(list.edits))list.edits[id]=upgradeElementPatch(change,byId.get(id));return {list};
}
/** Normalize concrete recipes and the stored patches that syncVariants replays later. */
export function upgradeProjectVisualEffects(project){
 // Inspect the resolved legacy copies before replacing them, so sparse layer edits
 // retain IDs and keep unrelated parent parameters inherited.
 const before=clone(project),byId=new Map(before.cards.map(card=>[card.id,card]));
 for(const card of project.cards){
  const old=byId.get(card.id),overrides=card.variant?.overrides,parent=byId.get(card.variant?.parentId);
  if(overrides?.visualEffects)overrides.visualEffects=upgradeRecipePatch(overrides.visualEffects,old.visualEffects,'frame',parent?.visualEffects?.layers);
  if(overrides?.elements)overrides.elements=upgradeElementsPatch(overrides.elements,old.elements);
  if(card.visualEffects!==undefined)card.visualEffects=upgradeVisualEffects(card.visualEffects,'frame');
  for(const element of card.elements)upgradeElement(element);
  for(const skill of [...(card.passives||[]),...(card.actives||[])])if(skill.nameStyle?.visualEffects!==undefined)skill.nameStyle.visualEffects=upgradeVisualEffects(skill.nameStyle.visualEffects,'text');
  for(const owner of textRangeOwners(card))for(const ranges of Object.values(owner.textRanges||{}))for(const range of ranges)if(range.style?.visualEffects!==undefined)range.style.visualEffects=upgradeVisualEffects(range.style.visualEffects,'text');
 }
 for(const element of project.back?.elements||[]){upgradeElement(element);for(const ranges of Object.values(element.textRanges||{}))for(const range of ranges)if(range.style?.visualEffects!==undefined)range.style.visualEffects=upgradeVisualEffects(range.style.visualEffects,'text');}
 for(const preset of project.visualEffectPresets||[])preset.recipe=upgradeVisualEffects(preset.recipe);
 for(const keyword of project.keywords||[])if(keyword.visualEffects!==undefined)keyword.visualEffects=upgradeVisualEffects(keyword.visualEffects,'text');
 return project;
}

export const getEffectFrameSec=project=>bounded(project.print?.effectFrameSec,0,Infinity)?project.print.effectFrameSec:1.2;
export const hasEffectMotion=recipe=>!!recipe?.layers.some(layer=>layer.enabled&&layer.motion.enabled&&(VISUAL_EFFECT_CATALOG[layer.kind]?.animated||layer.kind==='textWarp'&&layer.params.wave>0));
function effectTarget(project,{cardId,back=false,elementId=null,skillId=null,textRangeId=null,keywordId=null},{write=false}={}){
 if(keywordId!==null){const keyword=project.keywords?.find(k=>k.id===keywordId);if(!keyword)throw Error('이펙트를 적용할 키워드가 없어졌어요. 키워드를 다시 선택하세요.');return {owner:keyword,type:'text',keyword};}
 const card=back?project.back:project.cards.find(c=>c.id===cardId);if(!card)throw Error('이펙트를 적용할 카드를 찾을 수 없어요.');
 if(textRangeId!==null){const selected=textRangeTarget(project,{cardId,back,elementId,textRangeId});return {card,owner:selected.range.style,type:'text'};}
 if(skillId!==null){
  const skill=!back&&[...(card.passives||[]),...(card.actives||[])].find(s=>s.id===skillId);if(!skill)throw Error('이펙트를 적용할 기술을 찾을 수 없어요.');
  if(write)skill.nameStyle??={};return {card,owner:skill.nameStyle||{},type:'text',skill};
 }
 if(elementId===null){if(back)throw Error('공통 뒷면은 그림이나 텍스트를 선택하세요.');return {card,owner:card,type:'frame'};}
 const element=card.elements.find(e=>e.id===elementId);if(!element||!['text','image','effect'].includes(element.type))throw Error('그림·텍스트·이펙트 요소를 선택하세요.');
 return {card,owner:element.style,type:element.type};
}
export function readTargetEffects(project,target){const selected=effectTarget(project,target);return upgradeVisualEffects(selected.owner.visualEffects||createVisualEffects(),selected.type);}
export function writeTargetEffects(project,target,recipe){
 const selected=effectTarget(project,target,{write:true});selected.owner.visualEffects=upgradeVisualEffects(recipe,selected.type);if(target.elementId&&!target.skillId&&!target.textRangeId&&!target.keywordId&&selected.card.kind)selected.card.template='custom';
}
export function readTargetTextColor(project,target){const selected=effectTarget(project,target);return selected.type==='text'?selected.owner.color:undefined;}
export function writeTargetTextColor(project,target,color){
 if(color!==undefined&&(typeof color!=='string'||!/^#[0-9a-f]{6}$/i.test(color)))throw Error('글자 색을 올바르게 선택하세요.');
 const selected=effectTarget(project,target,{write:true});if(selected.type!=='text')throw Error('글자 색은 텍스트에만 적용할 수 있어요.');
 if(color===undefined){if(selected.keyword)selected.owner.color='#427963';else delete selected.owner.color;}else selected.owner.color=color;
 if(target.elementId&&!target.skillId&&!target.textRangeId&&!target.keywordId&&selected.card.kind)selected.card.template='custom';
}
export function saveVisualEffectPreset(project,name,recipe,id=null){
 const label=typeof name==='string'?name.trim():'';if(!label||label.length>120||/[\r\n]/.test(label))throw Error('내 이펙트 이름을 1~120자로 입력하세요.');
 const normalized=upgradeVisualEffects(recipe);
 project.visualEffectPresets??=[];let preset=id&&project.visualEffectPresets.find(p=>p.id===id);if(id&&!preset)throw Error('저장한 이펙트를 찾을 수 없어요.');
 if(!preset){preset={id:newId()};project.visualEffectPresets.push(preset);}Object.assign(preset,{name:label,recipe:normalized});return preset.id;
}
export function removeVisualEffectPreset(project,id){project.visualEffectPresets=(project.visualEffectPresets||[]).filter(p=>p.id!==id);}

/** Preserve applied styles by semantic binding while a template recreates geometry. */
export function preserveTemplateVisualEffects(before,after){
 const key=e=>e.binding?e.binding.field+':'+(e.binding.skillId||''):null;
 const bound=new Map(before.elements.filter(e=>e.binding&&e.style.visualEffects).map(e=>[key(e),e.style.visualEffects]));
 for(const element of after.elements){const recipe=bound.get(key(element));if(recipe)element.style.visualEffects=upgradeVisualEffects(recipe,element.type);}
 if(before.visualEffects)after.visualEffects=upgradeVisualEffects(before.visualEffects,'frame');
 for(const element of before.elements.filter(e=>e.type==='effect'&&!e.binding))if(!after.elements.some(e=>e.id===element.id))after.elements.push(upgradeElement(clone(element)));
 return after;
}
