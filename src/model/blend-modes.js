export const DEFAULT_BLEND_MODE='source-over';
export const BLEND_MODES=[
 ['source-over','일반'],['multiply','곱하기'],['screen','스크린'],['overlay','오버레이'],
 ['darken','어둡게'],['lighten','밝게'],['color-dodge','색상 닷지'],['color-burn','색상 번'],
 ['hard-light','하드 라이트'],['soft-light','소프트 라이트'],['difference','차이'],['exclusion','제외'],
 ['hue','색조'],['saturation','채도'],['color','색상'],['luminosity','광도'],['lighter','더하기'],
 ['source-in','현재 레이어 · 아래와 겹친 부분'],['source-out','현재 레이어 · 아래와 안 겹친 부분'],
 ['source-atop','현재 레이어 · 아래 투명도 유지'],['destination-over','아래 그림을 앞에'],
 ['destination-in','아래 그림 · 현재와 겹친 부분'],['destination-out','아래 그림 · 현재로 지우기'],
 ['destination-atop','아래 그림 · 현재 투명도 유지'],['copy','현재 레이어만'],['xor','겹친 부분 제외'],
];
const supported=new Set(BLEND_MODES.map(([mode])=>mode));
export const isBlendMode=value=>supported.has(value);
export const normalizeBlendMode=value=>isBlendMode(value)?value:DEFAULT_BLEND_MODE;
export const blendModeLabel=value=>BLEND_MODES.find(([mode])=>mode===value)?.[1]??'일반';
