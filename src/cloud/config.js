export const cloudConfig=typeof __CLOUD_CONFIG__==='undefined'?{url:'',anonKey:'',pagesOrigin:'https://lolipop000000.github.io'}:__CLOUD_CONFIG__;
export function cloudAvailability(location=globalThis.location,config=cloudConfig){
 if(location?.protocol==='file:')return {available:false,reason:'file'};
 if(!config?.url||!config?.anonKey)return {available:false,reason:'unconfigured'};
 return {available:true,reason:null};
}
