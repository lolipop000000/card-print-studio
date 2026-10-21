/** Preview-only targeting; neither recipes nor the saved print frame are changed. */
export function isEffectPlaybackTarget(playbackTarget,{elementId=null,skillId=null,textRangeId=null}={}){
 if(!playbackTarget)return true;
 if(playbackTarget.textRangeId)return playbackTarget.textRangeId===textRangeId;
 if(playbackTarget.skillId)return playbackTarget.skillId===skillId;
 return (playbackTarget.elementId||null)===(elementId||null);
}
export function effectPlaybackTime({timeSec,frozenTimeSec,playbackTarget},identity){
 return isEffectPlaybackTarget(playbackTarget,identity)?timeSec:frozenTimeSec;
}
