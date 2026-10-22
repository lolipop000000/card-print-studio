import {createAssetLibraryStorage} from './asset-library.js';
import {createParticleLibrary,parseParticleLibrary,serializeParticleLibrary} from '../model/particle-library.js';

/** Reuse the image library's recovery, folder identity and compare-before-write guarantees. */
export function createParticleLibraryStorage({workspace,...options}={}){
 const state=()=>{const value=workspace.getState();return {...value,assetsPath:value.assetsPath?.replace(/asset-library\.json$/,'particle-library.json')??null};};
 const adapter=workspace?{getState:state,subscribe:fn=>workspace.subscribe(fn),getAssetLibraryRoot:()=>workspace.getAssetLibraryRoot(),
  readAssetLibrary:()=>workspace.readAssetLibrary({kind:'particle'}),writeAssetLibrary:(value,settings)=>workspace.writeAssetLibrary(value,{...settings,kind:'particle'})}:undefined;
 return createAssetLibraryStorage({...options,workspace:adapter,key:'particle-library:v1',codec:{create:createParticleLibrary,parse:parseParticleLibrary,serialize:serializeParticleLibrary}});
}
