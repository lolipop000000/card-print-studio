/** Local preview clock. Only explicit freeze/apply actions write the project. */
export function createEffectTimeline({onFrame,onStateChange=()=>{},initialSec=1.2,maxFps=24,reducedMotion=false,durationSec=Infinity,loop=false,
 requestFrame=fn=>requestAnimationFrame(fn),cancelFrame=id=>cancelAnimationFrame(id),now=()=>performance.now()}){
 let time=Number.isFinite(initialSec)?Math.max(0,initialSec):1.2,playing=false,active=true,destroyed=false,pending=null,startMs=0,startSec=time,lastPaint=0;
 const interval=1000/maxFps;
 function cancel(){if(pending!==null)cancelFrame(pending);pending=null;}
 function pause(){const changed=playing;playing=false;cancel();if(changed&&!destroyed)onStateChange(false);}
 function tick(timestamp){
  pending=null;if(destroyed||!active||!playing)return;
  const elapsed=timestamp-lastPaint;
  if(elapsed>=interval-1e-6){
   const next=startSec+Math.max(0,timestamp-startMs)/1000,ended=next>=durationSec&&!loop;
   time=next>=durationSec?(loop?next%durationSec:durationSec):next;
   if(ended)playing=false;
   lastPaint+=Math.floor((elapsed+1e-6)/interval)*interval;onFrame(time);
   if(ended)onStateChange(false);
  }
  if(!destroyed&&active&&playing)pending=requestFrame(tick);
 }
 return {
  play(){if(destroyed||!active||playing)return;if(time>=durationSec)time=0;playing=true;startMs=lastPaint=now();startSec=time;pending=requestFrame(tick);onStateChange(true);},
  pause,
  seek(seconds){if(destroyed||!Number.isFinite(seconds))return;time=Math.max(0,seconds);if(playing){startMs=lastPaint=now();startSec=time;}onFrame(time);},
  getTime:()=>time,isPlaying:()=>playing,
  setPlaybackOptions(options){
   if(destroyed)return;
   if(Number.isFinite(options.durationSec)&&options.durationSec>0)durationSec=options.durationSec;
   if(typeof options.loop==='boolean')loop=options.loop;
   time=Math.min(time,durationSec);if(playing){startMs=lastPaint=now();startSec=time;}onFrame(time);
  },
  setActive(value){active=!!value;if(!active)pause();},
  destroy(){if(destroyed)return;destroyed=true;pause();}
 };
}

/** The playback range belongs to the user, never to the advancing clock. */
export function syncEffectTimeInput(input,seconds,durationSec=6){
 input.max=durationSec;input.value=Math.min(seconds,durationSec);
}
