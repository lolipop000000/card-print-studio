/** Local preview clock. Only explicit freeze/apply actions write the project. */
export function createEffectTimeline({onFrame,initialSec=1.2,maxFps=24,reducedMotion=false,
 requestFrame=fn=>requestAnimationFrame(fn),cancelFrame=id=>cancelAnimationFrame(id),now=()=>performance.now()}){
 let time=Number.isFinite(initialSec)?Math.max(0,initialSec):1.2,playing=false,active=true,destroyed=false,pending=null,startMs=0,startSec=time,lastPaint=0;
 const interval=1000/maxFps;
 function cancel(){if(pending!==null)cancelFrame(pending);pending=null;}
 function pause(){playing=false;cancel();}
 function tick(timestamp){
  pending=null;if(destroyed||!active||!playing)return;
  const elapsed=timestamp-lastPaint;
  if(elapsed>=interval-1e-6){
   time=startSec+Math.max(0,timestamp-startMs)/1000;
   lastPaint+=Math.floor((elapsed+1e-6)/interval)*interval;onFrame(time);
  }
  if(!destroyed&&active&&playing)pending=requestFrame(tick);
 }
 return {
  play(){if(destroyed||!active||playing)return;playing=true;startMs=lastPaint=now();startSec=time;pending=requestFrame(tick);},
  pause,
  seek(seconds){if(destroyed||!Number.isFinite(seconds))return;time=Math.max(0,seconds);if(playing){startMs=lastPaint=now();startSec=time;}onFrame(time);},
  getTime:()=>time,isPlaying:()=>playing,
  setActive(value){active=!!value;if(!active)pause();},
  destroy(){if(destroyed)return;pause();destroyed=true;}
 };
}

/** Extend the scrub range without rewinding the renderer's clock. */
export function syncEffectTimeInput(input,seconds){
 input.max=Math.max(6,Math.ceil(seconds/6)*6);input.value=seconds;
}
