const numeric=(label,value,min,max,step=.05,unit='')=>({type:'number',label,value,min,max,step,unit,optional:true});
const choice=(label,value,options)=>({type:'select',label,value,options,optional:true});
const grouped=(group,field)=>({...field,group});
const crop=label=>({...numeric(label,0,0,.95,.01,'%'),displayScale:100,group:'이미지 자르기'});

/** Optional in stored recipes; new layers explicitly receive these defaults. */
export const SPRITE_CONTROL_FIELDS={
 renderMode:choice('배치 방식','particles',[['particles','여러 입자로 날리기'],['single','한 장 고정 장식']]),
 cropLeft:crop('왼쪽 자르기'),cropRight:crop('오른쪽 자르기'),
 cropTop:crop('위쪽 자르기'),cropBottom:crop('아래쪽 자르기'),
 scaleX:numeric('가로 늘리기',1,.05,8,.05,'배'),scaleY:numeric('세로 늘리기',1,.05,8,.05,'배'),
 mirror:choice('뒤집기','none',[['none','안 뒤집기'],['x','좌우'],['y','상하'],['both','좌우 + 상하']]),
 anchorX:{...numeric('가로 회전축',.5,0,1,.05,'%'),displayScale:100},anchorY:{...numeric('세로 회전축',.5,0,1,.05,'%'),displayScale:100},
 sheetColumns:numeric('시트 가로 칸',1,1,16,1),sheetRows:numeric('시트 세로 칸',1,1,16,1),
 frameMode:choice('프레임 재생','fixed',[['fixed','선택한 한 컷'],['life','수명에 맞춰 한 번'],['loop','계속 반복'],['pingpong','앞뒤로 반복']]),
 frameStart:numeric('시작 프레임',0,0,255,1,'0부터'),frameCount:numeric('사용할 프레임 수',0,0,256,1,'0 = 남은 전체'),frameRate:numeric('프레임 속도',12,0,60,1,'컷/초')
};
for(const key of ['scaleX','scaleY','mirror','anchorX','anchorY'])SPRITE_CONTROL_FIELDS[key]=grouped('크기·회전 중심',SPRITE_CONTROL_FIELDS[key]);
for(const key of ['sheetColumns','sheetRows','frameMode','frameStart','frameCount','frameRate'])SPRITE_CONTROL_FIELDS[key]=grouped('여러 컷 재생',SPRITE_CONTROL_FIELDS[key]);
export const spriteControlDefaults=()=>Object.fromEntries(Object.entries(SPRITE_CONTROL_FIELDS).map(([key,field])=>[key,field.value]));
export const SPRITE_CONTROL_HINT='한 장 고정 장식은 발생 영역의 중앙에 놓여요. 자르기는 원본을 바꾸지 않으며, 가로·세로 크기와 회전축은 따로 조절할 수 있어요.';
export const SPRITE_SHEET_HINT='시트는 한 이미지에 여러 컷이 들어 있는 자료용이에요. 자른 영역을 가로·세로 칸으로 나누고 왼쪽 위부터 0번으로 읽어요. 프레임 수 0은 시작 컷부터 끝까지예요. 고정 장식의 수명 재생은 프레임 속도로 한 번 재생하고, 움직임을 끄면 시작 컷으로 고정돼요.';
const imageFields=new Set(['assetId','tint','cropLeft','cropRight','cropTop','cropBottom','sheetColumns','sheetRows','frameMode','frameStart','frameCount','frameRate']);
const lifetimeFields=new Set(['color2','count','sizeEnd','alphaEnd','fadeIn','fadeOut','life','direction','travel','spread','drift','gravity','randomness']);
export function isSpriteFieldVisible(key,params={}){
 if(imageFields.has(key)&&params.shape!=='image')return false;
 if(lifetimeFields.has(key)&&params.renderMode==='single')return false;
 if(key==='frameRate')return ['loop','pingpong'].includes(params.frameMode)||params.renderMode==='single'&&params.frameMode==='life';
 return true;
}
/** Cross-field checks complement the catalogue's individual number/enum checks. */
export function validateSpriteControls(params={}){
 const problems=[],value=key=>params[key]??SPRITE_CONTROL_FIELDS[key].value;
 for(const [axis,first,last] of [['가로','cropLeft','cropRight'],['세로','cropTop','cropBottom']]){
  const a=value(first),b=value(last);if(Number.isFinite(a)&&Number.isFinite(b)&&a+b>=1)problems.push(axis+' 자르기 합 '+Number(((a+b)*100).toPrecision(12))+'% ('+SPRITE_CONTROL_FIELDS[first].label+' '+Number((a*100).toPrecision(12))+'% + '+SPRITE_CONTROL_FIELDS[last].label+' '+Number((b*100).toPrecision(12))+'%)는 이미지를 모두 지웁니다. 두 값의 합을 100%보다 작게 낮추세요.');
 }
 const columns=value('sheetColumns'),rows=value('sheetRows'),start=value('frameStart'),count=value('frameCount');
 if([columns,rows].every(v=>Number.isInteger(v)&&v>=1&&v<=16)){
  const total=columns*rows;
  if(Number.isInteger(start)&&start>=0){
   if(start>=total)problems.push('시작 프레임 '+start+'은 전체 '+total+'컷을 벗어납니다. 0~'+(total-1)+' 중 하나로 낮추거나 시트 칸 수를 늘리세요.');
   else if(Number.isInteger(count)&&count>total-start)problems.push('사용할 프레임 수 '+count+'은 시작 프레임 '+start+'부터 남은 '+(total-start)+'컷을 넘습니다. '+(total-start)+' 이하로 줄이거나 0으로 바꾸세요.');
  }
 }
 return problems;
}