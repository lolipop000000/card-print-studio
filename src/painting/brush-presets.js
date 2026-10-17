/** Presets use the same brush controls as manual drawing; no hidden flow. */
export const BRUSH_PRESETS=Object.freeze([
 {id:'pen',label:'펜',size:8,hardness:1,opacity:1,smoothing:.2,brushTip:'round'},
 {id:'pencil',label:'연필',size:3,hardness:.65,opacity:.55,smoothing:.15,brushTip:'round'},
 {id:'marker',label:'마커',size:24,hardness:1,opacity:.35,smoothing:.25,brushTip:'square'},
 {id:'airbrush',label:'에어브러시',size:40,hardness:0,opacity:.2,smoothing:.15,brushTip:'round'},
 {id:'pixel',label:'픽셀 펜',size:1,hardness:1,opacity:1,smoothing:0,brushTip:'square'}
].map(({id,label,...settings})=>Object.freeze({id,label,options:Object.freeze({tool:'brush',...settings,pixelSnap:id==='pixel',pressureSize:false})})));

export function brushPresetOptions(id){
 const preset=BRUSH_PRESETS.find(item=>item.id===id);return preset?{...preset.options}:null;
}
