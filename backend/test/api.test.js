import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
process.env.NODE_ENV='test';
process.env.NEXT_PUBLIC_SUPABASE_URL='http://test.local';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY='test-anon-key';
const {createApp}=await import('../src/index.js');

function mock({user={id:'11111111-1111-4111-8111-111111111111'},membership={organization_id:'22222222-2222-4222-8222-222222222222',role:'professional'},memberships=null,patients=[]}={}){
  const memberRows=memberships??[membership];
  const matchingRows=filters=>memberRows.filter(row=>filters.every(([key,value])=>row[key]===value));
  return {
    auth:{getUser:async token=>token==='valid'?{data:{user},error:null}:{data:{user:null},error:new Error('invalid token')}},
    from(table){
      const state={table,values:null,filters:[]};
      const api={
        select(){return api},eq(k,v){state.filters.push([k,v]);return api},ilike(){return api},order(){return api},limit(){return api},
        maybeSingle:async()=>{
          if(table==='organization_members')return {data:matchingRows(state.filters)[0]??null,error:null};
          if(table==='patients')return {data:patients.find(p=>state.filters.some(([k,v])=>k==='id'&&p.id===v))??null,error:null};
          return {data:null,error:null};
        },
        insert(v){state.values=v;return api},update(v){state.values=v;return api},delete(){return api},
        single:async()=>({data:state.values,error:null}),
        then(resolve){
          const data=table==='organization_members'?matchingRows(state.filters):table==='patients'?patients:[];
          return Promise.resolve({data,error:null}).then(resolve);
        }
      }; return api;
    }
  };
}
function startServer(options={}){const app=createApp({supabaseClientFactory:()=>mock(options)});const server=http.createServer(app);return new Promise(resolve=>server.listen(0,'127.0.0.1',()=>resolve({baseUrl:'http://127.0.0.1:'+server.address().port,close:()=>{server.close();server.closeAllConnections?.()}})))}
async function request(baseUrl,path,options={}){return fetch(baseUrl+path,{...options,headers:{...(options.body?{'Content-Type':'application/json'}:{}),...(options.headers||{})},body:options.body?JSON.stringify(options.body):undefined})}

test('multiple memberships require an explicit authorized organization selection',async()=>{
  const memberships=[
    {organization_id:'22222222-2222-4222-8222-222222222222',role:'professional'},
    {organization_id:'44444444-4444-4444-8444-444444444444',role:'professional'},
  ];
  const s=await startServer({memberships});
  const headers={Authorization:'Bearer valid'};
  try{
    assert.equal((await request(s.baseUrl,'/encounters',{headers})).status,409);
    const selected=await request(s.baseUrl,'/encounters',{headers:{...headers,'X-FisioZap-Organization-Id':memberships[1].organization_id}});
    assert.equal(selected.status,200);
    const unauthorized=await request(s.baseUrl,'/encounters',{headers:{...headers,'X-FisioZap-Organization-Id':'55555555-5555-4555-8555-555555555555'}});
    assert.equal(unauthorized.status,403);
  }finally{await s.close()}
});

test('exercise creation validates payload before querying an encounter',async()=>{
  const s=await startServer();
  try{
    const response=await request(s.baseUrl,'/encounters/33333333-3333-4333-8333-333333333333/exercises',{method:'POST',headers:{Authorization:'Bearer valid'},body:{title:'   '}});
    assert.equal(response.status,422);
  }finally{await s.close()}
});

test('protocol catalog writes require owner or coordinator',async()=>{
  const s=await startServer({membership:{organization_id:'22222222-2222-4222-8222-222222222222',role:'professional'}});
  try{
    const response=await request(s.baseUrl,'/protocols',{method:'POST',headers:{Authorization:'Bearer valid'},body:{title:'Protocolo sintético'}});
    assert.equal(response.status,403);
  }finally{await s.close()}
});

test('protocol catalog read is authenticated',async()=>{
  const s=await startServer();
  try{
    const response=await request(s.baseUrl,'/protocols',{headers:{Authorization:'Bearer valid'}});
    assert.equal(response.status,200);
    assert.deepEqual((await response.json()).protocols,[]);
  }finally{await s.close()}
});
test('health remains public',async()=>{const s=await startServer();const r=await request(s.baseUrl,'/health');assert.equal(r.status,200);await s.close()});
test('chat remains authenticated',async()=>{const s=await startServer();assert.equal((await request(s.baseUrl,'/chat',{method:'POST',body:{message:'olá'}})).status,401);await s.close()});
test('patients require authentication',async()=>{const s=await startServer();assert.equal((await request(s.baseUrl,'/patients')).status,401);await s.close()});
test('patient creation validates name',async()=>{const s=await startServer();const r=await request(s.baseUrl,'/patients',{method:'POST',headers:{Authorization:'Bearer valid'},body:{full_name:'A'}});assert.equal(r.status,422);await s.close()});
test('patient creation derives organization and professional from authenticated membership',async()=>{const s=await startServer();const r=await request(s.baseUrl,'/patients',{method:'POST',headers:{Authorization:'Bearer valid'},body:{full_name:'Paciente Fictício'}});assert.equal(r.status,201);const body=await r.json();assert.equal(body.patient.organization_id,'22222222-2222-4222-8222-222222222222');assert.equal(body.patient.professional_id,'11111111-1111-4111-8111-111111111111');await s.close()});
test('patient listing is organization scoped by the RLS-backed client',async()=>{const patients=[{id:'33333333-3333-4333-8333-333333333333',full_name:'Paciente Fictício',status:'active'}];const s=await startServer({patients});const r=await request(s.baseUrl,'/patients',{headers:{Authorization:'Bearer valid'}});assert.equal(r.status,200);assert.deepEqual((await r.json()).patients,patients);await s.close()});
test('patient status can be updated for discharge',async()=>{const patients=[{id:'33333333-3333-4333-8333-333333333333',full_name:'Paciente Fictício',status:'active'}];const s=await startServer({patients});const r=await request(s.baseUrl,'/patients/33333333-3333-4333-8333-333333333333',{method:'PATCH',headers:{Authorization:'Bearer valid'},body:{status:'discharged'}});assert.equal(r.status,200);await s.close()});

test('appointments require authentication',async()=>{const s=await startServer();assert.equal((await request(s.baseUrl,'/appointments')).status,401);await s.close()});
test('appointment creation validates patient and timezone',async()=>{const s=await startServer();const r=await request(s.baseUrl,'/appointments',{method:'POST',headers:{Authorization:'Bearer valid'},body:{patient_id:'invalid',starts_at:'2026-10-10T09:00:00',ends_at:'2026-10-10T08:00:00Z'}});assert.equal(r.status,422);await s.close()});
test('appointment update rejects invalid id',async()=>{const s=await startServer();const r=await request(s.baseUrl,'/appointments/not-a-uuid',{method:'PATCH',headers:{Authorization:'Bearer valid'},body:{status:'confirmed'}});assert.equal(r.status,400);await s.close()});
test('appointment listing rejects invalid status',async()=>{const s=await startServer();const r=await request(s.baseUrl,'/appointments?status=unknown',{headers:{Authorization:'Bearer valid'}});assert.equal(r.status,422);await s.close()});

test('appointment conflict returns HTTP 409',async()=>{
  const user={id:'11111111-1111-4111-8111-111111111111'};
  const membership={organization_id:'22222222-2222-4222-8222-222222222222',role:'professional'};
  const patientId='33333333-3333-4333-8333-333333333333';
  const factory=()=>({
    auth:{getUser:async()=>({data:{user},error:null})},
    from(table){
      const api={
        select(){return api},eq(){return api},order(){return api},limit(){return api},
        maybeSingle:async()=>({data:table==='organization_members'?membership:{id:patientId},error:null}),
        insert(){return api},
        single:async()=>({data:null,error:{code:'23P01'}}),
      };
      return api;
    }
  });
  const app=createApp({supabaseClientFactory:factory});
  const server=http.createServer(app);
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const baseUrl='http://127.0.0.1:'+server.address().port;
  try {
    const response=await request(baseUrl,'/appointments',{method:'POST',headers:{Authorization:'Bearer valid'},body:{
      patient_id:patientId,starts_at:'2026-10-12T13:00:00Z',ends_at:'2026-10-12T14:00:00Z'
    }});
    assert.equal(response.status,409);
  }finally{server.close();server.closeAllConnections?.();}
});
