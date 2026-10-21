import test from 'node:test';
import assert from 'node:assert/strict';

const module=await import('../supabase/functions/_shared/maintenance-auth.js').catch(error=>{
 if(error.code==='ERR_MODULE_NOT_FOUND')return {};
 throw error;
});
const config={legacyKey:'legacy-admin-test',secretKeys:JSON.stringify({default:'sb_secret_current-test',rotated:'sb_secret_rotated-test'})};
const request=headers=>new Request('https://example.test/maintenance',{method:'POST',headers});

test('authorization failures identify only a bounded credential mismatch category',async()=>{
 assert.equal(typeof module.checkMaintenanceAuthorization,'function');
 const checks=[
  [{},config,'unauthorized-admin-header-missing'],
  [{apikey:'sb_secret_current-test'},{},'unauthorized-modern-config-unavailable'],
  [{apikey:'sb_secret_current-test'},{secretKeys:'{broken'},'unauthorized-modern-config-unavailable'],
  [{apikey:'sb_secret_other-test'},config,'unauthorized-modern-key-mismatch'],
  [{apikey:'sb_secret_other-test',Authorization:'Bearer gateway-anon-test'},config,'unauthorized-modern-key-mismatch'],
  [{Authorization:'Bearer other-legacy-test'},config,'unauthorized-legacy-key-mismatch']
 ];
 for(const [headers,environment,code] of checks){
  assert.deepEqual(await module.checkMaintenanceAuthorization(request(headers),environment),{ok:false,code});
 }
 assert.deepEqual(await module.checkMaintenanceAuthorization(request({apikey:'sb_secret_current-test'}),config),{ok:true});
 assert.deepEqual(await module.checkMaintenanceAuthorization(request({Authorization:'Bearer legacy-admin-test'}),config),{ok:true});
});

test('maintenance accepts an exact configured modern server key on apikey',async()=>{
 assert.equal(typeof module.authorizeMaintenance,'function','modern maintenance authorization is missing');
 assert.equal(await module.authorizeMaintenance(request({apikey:'sb_secret_current-test'}),config),true);
 assert.equal(await module.authorizeMaintenance(request({apikey:'sb_secret_rotated-test'}),config),true);
});

test('legacy bearer service keys remain accepted',async()=>{
 assert.equal(typeof module.authorizeMaintenance,'function');
 assert.equal(await module.authorizeMaintenance(request({Authorization:'Bearer legacy-admin-test'}),config),true);
});

test('public keys, user JWTs, unknown server keys and malformed bearer headers stay denied',async()=>{
 assert.equal(typeof module.authorizeMaintenance,'function');
 for(const headers of [{},{apikey:'sb_publishable_public-test'},{apikey:'sb_secret_another-project-test'},
  {Authorization:'Bearer member-user-test'},{Authorization:'Bearer legacy-admin-test extra'},
  {Authorization:'Basic legacy-admin-test'},{apikey:'legacy-admin-test'},
  {apikey:'sb_secret_just-a-prefix'},{Authorization:'Bearer '+ 'x'.repeat(16385)}]){
  assert.equal(await module.authorizeMaintenance(request(headers),config),false);
 }
});

test('missing, malformed and public-key-only server configuration fails closed',async()=>{
 assert.equal(typeof module.authorizeMaintenance,'function');
 for(const secretKeys of [undefined,'{','[]','"sb_secret_current-test"','{"default":null}','{"default":"sb_publishable_public-test"}']){
  assert.equal(await module.authorizeMaintenance(request({apikey:'sb_secret_current-test'}),{secretKeys}),false);
 }
 assert.equal(await module.authorizeMaintenance(request({apikey:'sb_publishable_public-test'}),{secretKeys:'{"default":"sb_publishable_public-test"}'}),false);
});
