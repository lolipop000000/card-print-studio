/** Clip crop guides to paper and subtract all neighbouring card rectangles. */
export function cropMarks(page,plan){
 const output=[],seen=new Set();
 function add(x1,y1,x2,y2){
  const horizontal=y1===y2,fixed=horizontal?y1:x1,limit=horizontal?plan.widthMm:plan.heightMm;
  if(fixed<0||fixed>(horizontal?plan.heightMm:plan.widthMm))return;
  let intervals=[[Math.max(0,Math.min(horizontal?x1:y1,horizontal?x2:y2)),Math.min(limit,Math.max(horizontal?x1:y1,horizontal?x2:y2))]];
  for(const c of page.cells){
   const lo=horizontal?c.yMm:c.xMm,hi=lo+(horizontal?c.heightMm:c.widthMm);if(fixed<lo-1e-8||fixed>hi+1e-8)continue;
   const start=horizontal?c.xMm:c.yMm,end=start+(horizontal?c.widthMm:c.heightMm);
   intervals=intervals.flatMap(([a,b])=>end<=a||start>=b?[[a,b]]:[[a,Math.min(b,start)],[Math.max(a,end),b]].filter(([a,b])=>b>a+1e-6));
  }
  for(const [a,b] of intervals){if(b-a<.15)continue;const line=horizontal?{x1:a,y1:fixed,x2:b,y2:fixed}:{x1:fixed,y1:a,x2:fixed,y2:b};
   const key=Object.values(line).map(n=>n.toFixed(5)).join(',');if(!seen.has(key)){seen.add(key);output.push(line);}
  }
 }
 for(const c of page.cells.filter(c=>c.cardId))for(const x of [c.xMm,c.xMm+c.widthMm])for(const y of [c.yMm,c.yMm+c.heightMm]){
  const dx=x===c.xMm?-1:1,dy=y===c.yMm?-1:1;add(x+dx*.35,y,x+dx*2.3,y);add(x,y+dy*.35,x,y+dy*2.3);
 }
 return output;
}
