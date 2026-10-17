import {createRequire} from 'node:module';
import {pathToFileURL,fileURLToPath} from 'node:url';
import path from 'node:path';
import {mkdir} from 'node:fs/promises';
const require=createRequire(import.meta.url);
let playwright;try{playwright=require('playwright');}catch{playwright=require('C:/Users/hyeon/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');}
const appRoot=fileURLToPath(new URL('../../',import.meta.url));
export const qa=path.resolve(appRoot,'artifacts/qa');
async function open(file,harness){
 await mkdir(qa,{recursive:true});const browser=await playwright.chromium.launch({headless:true,executablePath:process.env.CARD_BROWSER_PATH||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
 const context=await browser.newContext({viewport:{width:1440,height:960},acceptDownloads:true}),httpRequests=[],pageErrors=[];
 await context.route(/^https?:/,r=>r.abort());const page=await context.newPage();page.on('request',r=>{if(/^https?:/.test(r.url()))httpRequests.push(r.url());});page.on('pageerror',e=>pageErrors.push(e.message));
 try{await page.goto(pathToFileURL(path.resolve(appRoot,file)).href);if(harness)await page.waitForFunction(()=>window.testApiReady);else await page.waitForSelector('[data-ready="true"]');return {browser,page,context,httpRequests,pageErrors};}catch(e){await browser.close();throw e;}
}
export const openHarness=()=>open('artifacts/qa/harness.html',true);
export const openApp=()=>open('dist/card-print-studio.html',false);
