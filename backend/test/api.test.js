import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
process.env.NODE_ENV='test';
process.env.NEXT_PUBLIC_SUPABASE_URL='http://test.local';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY='test-anon-key';
const {createApp}=await import('../src/index.js');

function mock({user={id:'11111111-1111-4111-8111-111111111111'},membership={organization_id:'22222222-2222-4222-8222-222222222222',role:'professional'},patients=[]}={}){
  return {
    auth:{getUser:async token=>token==='valid'?{data:{user},error:null}:{data:{user:null},error:new Error('invalid token')}},
    from(table){
      const state={table,values:null,filters:[]};
      const api={
        select(){return api},eq(k,v){state.filters.push([k,v]);return api},ilike(){return api},order(){return api},limit(){return api},
        maybeSingle:async()=>table==='organization_members'?{data:membership,error:null}:{data:patients.find(p=>state.filters.some(([k,v])=>k==='id'&&p.id===v))??null,error:null},
        insert(v){state.values=v;return api},update(v){state.values=v;return api},delete(){return api},
        single:async()=>({data:state.values,error:null}),
        then(resolve){return Promise.resolve({data:table==='patients'?patients:[],error:null}).then(resolve)}
      }; return api;
    }
  };
}
function startServer(options={}){const app=createApp({supabaseClientFactory:()=>mock(options)});const server=http.createServer(app);return new Promise(resolve=>server.listen(0,'127.0.0.1',()=>resolve({baseUrl:'http://127.0.0.1:'+server.address().port,close:()=>{server.close();server.closeAllConnections?.()}})))}
async function request(baseUrl,path,options={}){return fetch(baseUrl+path,{...options,headers:{...(options.body?{'Content-Type':'application/json'}:{}),...(options.headers||{})},body:options.body?JSON.stringify(options.body):undefined})}

test('health remains public',async()=>{const s=await startServer();const r=await request(s.baseUrl,'/health');assert.equal(r.status,200);await s.close()});
test('chat remains authenticated',async()=>{const s=await startServer();assert.equal((await request(s.baseUrl,'/chat',{method:'POST',body:{message:'olá'}})).status,401);await s.close()});
test('patients require authentication',async()=>{const s=await startServer();assert.equal((await request(s.baseUrl,'/patients')).status,401);await s.close()});
test('patient creation validates name',async()=>{const s=await startServer();const r=await request(s.baseUrl,'/patients',{method:'POST',headers:{Authorization:'Bearer valid'},body:{full_name:'A'}});assert.equal(r.status,422);await s.close()});
test('patient creation derives organization and professional from authenticated membership',async()=>{const s=await startServer();const r=await request(s.baseUrl,'/patients',{method:'POST',headers:{Authorization:'Bearer valid'},body:{full_name:'Paciente Fictício'}});assert.equal(r.status,201);const body=await r.json();assert.equal(body.patient.organization_id,'22222222-2222-4222-8222-222222222222');assert.equal(body.patient.professional_id,'11111111-1111-4111-8111-111111111111');await s.close()});
test('patient listing is organization scoped by the RLS-backed client',async()=>{const patients=[{id:'33333333-3333-4333-8333-333333333333',full_name:'Paciente Fictício',status:'active'}];const s=await startServer({patients});const r=await request(s.baseUrl,'/patients');assert.equal(r.status,200);assert.deepEqual((await r.json()).patients,patients);await s.close()});
test('patient status can be updated for discharge',async()=>{const patients=[{id:'33333333-3333-4333-8333-333333333333',full_name:'Paciente Fictício',status:'active'}];const s=await startServer({patients});const r=await request(s.baseUrl,'/patients/33333333-3333-4333-8333-333333333333',{method:'PATCH',headers:{Authorization:'Bearer valid'},body:{status:'discharged'}});assert.equal(r.status,200);await s.close()});
