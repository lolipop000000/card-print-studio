import test from 'node:test';
import assert from 'node:assert/strict';
import {cloudFixture} from './helpers.mjs';
test('maintenance rejects anon, pending, revoked, trial and member tokens',async()=>{
 const f=await cloudFixture();try{const tokens=f.roles.map(user=>user.session.access_token);assert.ok(tokens.every(token=>typeof token==='string'&&token.length>20));for(const token of [null,f.config.anonKey,...tokens]){
  const response=await fetch(`${f.config.url}/functions/v1/maintenance`,{method:'POST',headers:token?{Authorization:`Bearer ${token}`}:{},redirect:'error',signal:AbortSignal.timeout(30000)});assert.equal(response.status,401);
 }}finally{await f.dispose();}
});
