import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {chromium} from 'playwright';

const root=fileURLToPath(new URL('../',import.meta.url));let bundle;
function editorBundle(){return bundle??=build({absWorkingDir:root,stdin:{contents:"import {mountEditor} from './src/app.js';import {createProject} from './src/model/project.js';import {createStore} from './src/model/store.js';window.editorTestApi={createProject,mount:p=>window.editorCtx=mountEditor(document.getElementById('app'),createStore(p))};",resolveDir:root},plugins:[{name:'explicit-fixture-boot',setup(b){b.onLoad({filter:/[/\\]src[/\\]app\.js$/},async args=>({contents:(await readFile(args.path,'utf8')).replace(/\bboot\(\);\s*$/,'')}));}}],bundle:true,format:'iife',target:'es2022',write:false,loader:{'.woff2':'base64'}});}

/** Real app UI with an explicit fixture, no persistent or shared harness state. */
export async function openEditor(fixture){
 const browser=await chromium.launch({headless:true,executablePath:process.env.CARD_BROWSER_PATH||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
 try{const page=await browser.newPage({viewport:{width:1440,height:960}}),errors=[];page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));await page.route(/^https?:/,r=>r.abort());await page.setContent('<!doctype html><html lang="ko"><meta charset="utf-8"><body><div id="app"></div></body></html>');await page.addStyleTag({content:await readFile(new URL('../src/styles.css',import.meta.url),'utf8')});await page.addScriptTag({content:(await editorBundle()).outputFiles[0].text});const project=await page.evaluate(fixture);await page.evaluate(p=>window.editorTestApi.mount(p),project);await page.waitForSelector('[data-ready="true"]');return {browser,page,project,errors};}catch(error){await browser.close();throw error;}
}
export async function clickAt(page,x,y,shift=false){const b=await page.locator('#card-canvas').boundingBox();if(shift)await page.keyboard.down('Shift');try{await page.mouse.click(b.x+x*b.width/63,b.y+y*b.height/88);}finally{if(shift)await page.keyboard.up('Shift');}}
export async function dragAt(page,x1,y1,x2,y2){const b=await page.locator('#card-canvas').boundingBox(),pt=(x,y)=>({x:b.x+x*b.width/63,y:b.y+y*b.height/88}),a=pt(x1,y1),z=pt(x2,y2);await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(z.x,z.y,{steps:6});await page.mouse.up();}
export const currentProject=page=>page.evaluate(()=>structuredClone(window.editorCtx.store.getProject()));
export const selectedIds=page=>page.evaluate(()=>window.editorCtx.state.selectedElementIds);
