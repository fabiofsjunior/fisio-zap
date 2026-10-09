import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
process.env.NODE_ENV='test';
process.env.NEXT_PUBLIC_SUPABASE_URL='http://test.local';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY='test-anon-key';
const {createApp}=await import('../src/index.js');

function mock({user={id:'11111111-1111-4111-8111-111111111111'},membership={organization_id:'22222222-2222-4222-8222-222222222222',role:'professional'},memberships=null,patients=[],encounters=[],evolutions=[],exercises=[],protocols=[],encounterProtocols=[],operationErrors={}}={}){
  const memberRows=(memberships??[membership]).map(row=>({...row,user_id:row.user_id??user.id}));
  const rowsByTable={
    organization_members:memberRows,
    patients,
    clinical_encounters:encounters,
    clinical_evolutions:evolutions,
    clinical_exercises:exercises,
    clinical_protocols:protocols,
    clinical_encounter_protocols:encounterProtocols,
  };
  const matchingRows=(rows,filters)=>rows.filter(row=>filters.every(([key,value,operator])=>operator==='in'?value.includes(row[key]):row[key]===value));
  return {
    auth:{getUser:async token=>token==='valid'?{data:{user},error:null}:{data:{user:null},error:new Error('invalid token')}},
    from(table){
      const state={table,values:null,filters:[],operation:'select',limit:null};
      const tableRows=rowsByTable[table]??[];
      const matching=()=>matchingRows(tableRows,state.filters);
      const api={
        select(){return api},
        eq(k,v){state.filters.push([k,v,'eq']);return api},
        in(k,values){state.filters.push([k,values,'in']);return api},
        ilike(){return api},
        order(){return api},
        limit(n){state.limit=n;return api},
        maybeSingle:async()=>{
          const operationError=operationErrors[state.table]?.[state.operation];
          if(operationError)return {data:null,error:operationError};
          const rows=matching();
          if(state.operation==='update'&&rows[0])Object.assign(rows[0],state.values);
          if(state.operation==='delete'&&rows[0])tableRows.splice(tableRows.indexOf(rows[0]),1);
          return {data:rows[0]??null,error:null};
        },
        insert(v){state.operation='insert';state.values=v;return api},
        update(v){state.operation='update';state.values=v;return api},
        delete(){state.operation='delete';return api},
        single:async()=>{
          if(state.operation==='insert'){const row={...state.values};tableRows.push(row);return {data:row,error:null};}
          return {data:state.values,error:null};
        },
        then(resolve){
          const operationError=operationErrors[state.table]?.[state.operation];
          if(operationError)return Promise.resolve({data:null,error:operationError}).then(resolve);
          let data=matching();
          if(state.operation==='update')for(const row of data)Object.assign(row,state.values);
          if(state.operation==='delete'){for(const row of data)tableRows.splice(tableRows.indexOf(row),1);data=[]}
          if(state.limit!==null)data=data.slice(0,state.limit);
          return Promise.resolve({data,error:null}).then(resolve);
        }
      }; return api;
    }
  };
}
function startServer(options={},supabaseClientFactory=()=>mock(options)){const app=createApp({supabaseClientFactory});const server=http.createServer(app);return new Promise(resolve=>server.listen(0,'127.0.0.1',()=>resolve({baseUrl:'http://127.0.0.1:'+server.address().port,close:()=>{server.close();server.closeAllConnections?.()}})))}
async function request(baseUrl,path,options={}){return fetch(baseUrl+path,{...options,headers:{...(options.body?{'Content-Type':'application/json'}:{}),...(options.headers||{})},body:options.body?JSON.stringify(options.body):undefined})}

test('authenticated Supabase data client forwards the verified JWT for RLS',async()=>{
  let accessToken;
  const factory=(_url,_key,options)=>{accessToken=options.accessToken;return mock()};
  const s=await startServer({},factory);
  try{
    const response=await request(s.baseUrl,'/encounters',{headers:{Authorization:'Bearer valid'}});
    assert.equal(response.status,200);
    assert.equal(await accessToken(),'valid');
  }finally{await s.close()}
});

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

test('CORS permits the organization selector header',async()=>{
  const s=await startServer();
  try{
    const response=await request(s.baseUrl,'/encounters',{method:'OPTIONS',headers:{
      Origin:'http://localhost:3000',
      'Access-Control-Request-Method':'GET',
      'Access-Control-Request-Headers':'x-fisiozap-organization-id',
    }});
    assert.equal(response.status,204);
    assert.match(response.headers.get('access-control-allow-headers'),/X-FisioZap-Organization-Id/i);
  }finally{await s.close()}
});

test('professionals cannot start encounters for another professional’s patient',async()=>{
  const patient={id:'33333333-3333-4333-8333-333333333333',organization_id:'22222222-2222-4222-8222-222222222222',professional_id:'55555555-5555-4555-8555-555555555555'};
  const s=await startServer({patients:[patient]});
  try{
    const response=await request(s.baseUrl,'/encounters',{method:'POST',headers:{Authorization:'Bearer valid'},body:{patient_id:patient.id}});
    assert.equal(response.status,403);
  }finally{await s.close()}
});

test('draft evolution can be edited by its author while its encounter is open',async()=>{
  const encounter={id:'33333333-3333-4333-8333-333333333333',organization_id:'22222222-2222-4222-8222-222222222222',professional_id:'11111111-1111-4111-8111-111111111111',status:'in_progress'};
  const evolution={id:'44444444-4444-4444-8444-444444444444',organization_id:encounter.organization_id,encounter_id:encounter.id,author_id:'11111111-1111-4111-8111-111111111111',content:'Rascunho anterior',status:'draft'};
  const s=await startServer({encounters:[encounter],evolutions:[evolution]});
  try{
    const response=await request(s.baseUrl,'/evolutions/'+evolution.id,{method:'PATCH',headers:{Authorization:'Bearer valid'},body:{content:'  Revisado  '}});
    assert.equal(response.status,200);
    assert.equal((await response.json()).evolution.content,'Revisado');
  }finally{await s.close()}
});

test('confirmed evolutions remain immutable through the API',async()=>{
  const evolution={id:'44444444-4444-4444-8444-444444444444',organization_id:'22222222-2222-4222-8222-222222222222',encounter_id:'33333333-3333-4333-8333-333333333333',author_id:'11111111-1111-4111-8111-111111111111',content:'Confirmada',status:'confirmed'};
  const s=await startServer({evolutions:[evolution]});
  try{
    const response=await request(s.baseUrl,'/evolutions/'+evolution.id,{method:'PATCH',headers:{Authorization:'Bearer valid'},body:{content:'Alteração não permitida'}});
    assert.equal(response.status,409);
  }finally{await s.close()}
});

test('encounter completion is rejected while a draft evolution remains',async()=>{
  const encounter={id:'33333333-3333-4333-8333-333333333333',organization_id:'22222222-2222-4222-8222-222222222222',professional_id:'11111111-1111-4111-8111-111111111111',status:'in_progress'};
  const evolution={id:'44444444-4444-4444-8444-444444444444',organization_id:encounter.organization_id,encounter_id:encounter.id,author_id:'11111111-1111-4111-8111-111111111111',content:'Rascunho',status:'draft'};
  const s=await startServer({encounters:[encounter],evolutions:[evolution]});
  try{
    const response=await request(s.baseUrl,'/encounters/'+encounter.id+'/complete',{method:'PATCH',headers:{Authorization:'Bearer valid'}});
    assert.equal(response.status,409);
  }finally{await s.close()}
});

test('professional cannot read another professional’s encounter history',async()=>{
  const encounter={id:'33333333-3333-4333-8333-333333333333',organization_id:'22222222-2222-4222-8222-222222222222',professional_id:'55555555-5555-4555-8555-555555555555',status:'completed'};
  const s=await startServer({encounters:[encounter]});
  try{
    const response=await request(s.baseUrl,'/encounters/'+encounter.id+'/evolutions',{headers:{Authorization:'Bearer valid'}});
    assert.equal(response.status,404);
  }finally{await s.close()}
});

test('protocol association removal accepts the documented body contract',async()=>{
  const s=await startServer();
  try{
    const response=await request(s.baseUrl,'/encounters/33333333-3333-4333-8333-333333333333/protocols',{method:'DELETE',headers:{Authorization:'Bearer valid'},body:{}});
    assert.equal(response.status,422);
  }finally{await s.close()}
});

test('professional encounter history is scoped while owner can review organization history',async()=>{
  const patientId='33333333-3333-4333-8333-333333333333';
  const own={id:'44444444-4444-4444-8444-444444444444',organization_id:'22222222-2222-4222-8222-222222222222',patient_id:patientId,professional_id:'11111111-1111-4111-8111-111111111111',status:'in_progress',started_at:'2026-10-09T12:00:00Z'};
  const peer={id:'55555555-5555-4555-8555-555555555555',organization_id:own.organization_id,patient_id:patientId,professional_id:'66666666-6666-4666-8666-666666666666',status:'completed',started_at:'2026-10-08T12:00:00Z'};
  const professional=await startServer({encounters:[own,peer]});
  const owner=await startServer({membership:{organization_id:own.organization_id,role:'owner'},encounters:[own,peer]});
  try{
    const mine=await request(professional.baseUrl,'/encounters?patient_id='+patientId,{headers:{Authorization:'Bearer valid'}});
    assert.equal(mine.status,200);
    assert.deepEqual((await mine.json()).encounters.map(item=>item.id),[own.id]);
    const managed=await request(owner.baseUrl,'/encounters?patient_id='+patientId,{headers:{Authorization:'Bearer valid'}});
    assert.equal(managed.status,200);
    assert.deepEqual((await managed.json()).encounters.map(item=>item.id),[own.id,peer.id]);
  }finally{await professional.close();await owner.close()}
});

test('professional can start an encounter for an assigned patient',async()=>{
  const patient={id:'33333333-3333-4333-8333-333333333333',organization_id:'22222222-2222-4222-8222-222222222222',professional_id:'11111111-1111-4111-8111-111111111111'};
  const s=await startServer({patients:[patient]});
  try{
    const response=await request(s.baseUrl,'/encounters',{method:'POST',headers:{Authorization:'Bearer valid'},body:{patient_id:patient.id}});
    assert.equal(response.status,201);
    const body=await response.json();
    assert.equal(body.encounter.patient_id,patient.id);
    assert.equal(body.encounter.organization_id,patient.organization_id);
    assert.equal(body.encounter.professional_id,patient.professional_id);
  }finally{await s.close()}
});

test('only the evolution author can edit a draft and completed encounters reject draft edits',async()=>{
  const encounter={id:'33333333-3333-4333-8333-333333333333',organization_id:'22222222-2222-4222-8222-222222222222',professional_id:'11111111-1111-4111-8111-111111111111',status:'in_progress'};
  const peerDraft={id:'44444444-4444-4444-8444-444444444444',organization_id:encounter.organization_id,encounter_id:encounter.id,author_id:'55555555-5555-4555-8555-555555555555',content:'Rascunho de outro autor',status:'draft'};
  const s=await startServer({encounters:[encounter],evolutions:[peerDraft]});
  try{
    const forbidden=await request(s.baseUrl,'/evolutions/'+peerDraft.id,{method:'PATCH',headers:{Authorization:'Bearer valid'},body:{content:'Edição indevida'}});
    assert.equal(forbidden.status,403);
  }finally{await s.close()}

  const completed={...encounter,status:'completed'};
  const ownDraft={...peerDraft,id:'66666666-6666-4666-8666-666666666666',author_id:'11111111-1111-4111-8111-111111111111'};
  const completedServer=await startServer({encounters:[completed],evolutions:[ownDraft]});
  try{
    const conflict=await request(completedServer.baseUrl,'/evolutions/'+ownDraft.id,{method:'PATCH',headers:{Authorization:'Bearer valid'},body:{content:'Edição após finalizar'}});
    assert.equal(conflict.status,409);
  }finally{await completedServer.close()}
});

test('protocol association supports add, read with in-filter, and valid removal',async()=>{
  const encounter={id:'33333333-3333-4333-8333-333333333333',organization_id:'22222222-2222-4222-8222-222222222222',professional_id:'11111111-1111-4111-8111-111111111111',status:'in_progress'};
  const protocol={id:'44444444-4444-4444-8444-444444444444',organization_id:encounter.organization_id,title:'Protocolo sintético',description:'Fixture de teste'};
  const s=await startServer({encounters:[encounter],protocols:[protocol]});
  try{
    const linked=await request(s.baseUrl,'/encounters/'+encounter.id+'/protocols',{method:'POST',headers:{Authorization:'Bearer valid'},body:{protocol_id:protocol.id}});
    assert.equal(linked.status,201);
    const listed=await request(s.baseUrl,'/encounters/'+encounter.id+'/protocols',{headers:{Authorization:'Bearer valid'}});
    assert.equal(listed.status,200);
    assert.deepEqual((await listed.json()).protocols.map(item=>item.id),[protocol.id]);
    const removed=await request(s.baseUrl,'/encounters/'+encounter.id+'/protocols',{method:'DELETE',headers:{Authorization:'Bearer valid'},body:{protocol_id:protocol.id}});
    assert.equal(removed.status,204);
    const after=await request(s.baseUrl,'/encounters/'+encounter.id+'/protocols',{headers:{Authorization:'Bearer valid'}});
    assert.deepEqual((await after.json()).protocols,[]);
  }finally{await s.close()}
});

test('database completion race is reported as HTTP 409',async()=>{
  const encounter={id:'33333333-3333-4333-8333-333333333333',organization_id:'22222222-2222-4222-8222-222222222222',professional_id:'11111111-1111-4111-8111-111111111111',status:'in_progress'};
  const s=await startServer({encounters:[encounter],operationErrors:{clinical_encounters:{update:{code:'P0001'}}}});
  try{
    const response=await request(s.baseUrl,'/encounters/'+encounter.id+'/complete',{method:'PATCH',headers:{Authorization:'Bearer valid'}});
    assert.equal(response.status,409);
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
