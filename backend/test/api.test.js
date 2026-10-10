import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
process.env.NODE_ENV='test';
process.env.NEXT_PUBLIC_SUPABASE_URL='http://test.local';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY='test-anon-key';
const {createApp}=await import('../src/index.js');

function mock({user={id:'11111111-1111-4111-8111-111111111111'},membership={organization_id:'22222222-2222-4222-8222-222222222222',role:'professional'},memberships=null,patients=[],encounters=[],evolutions=[],exercises=[],protocols=[],encounterProtocols=[],notifications=[],appointments=[],financialEntries=[],operationErrors={}}={}){
  const memberRows=(memberships??[membership]).map(row=>({...row,user_id:row.user_id??user.id}));
  const rowsByTable={
    organization_members:memberRows,
    patients,
    clinical_encounters:encounters,
    clinical_evolutions:evolutions,
    clinical_exercises:exercises,
    clinical_protocols:protocols,
    clinical_encounter_protocols:encounterProtocols,
    notifications,
    appointments,
    financial_entries:financialEntries,
  };
  const matchingRows=(rows,filters)=>rows.filter(row=>filters.every(([key,value,operator])=>operator==='in'?value.includes(row[key]):operator==='gte'?Date.parse(row[key])>=Date.parse(value):operator==='lt'?Date.parse(row[key])<Date.parse(value):row[key]===value));
  return {
    auth:{getUser:async token=>token==='valid'?{data:{user},error:null}:{data:{user:null},error:new Error('invalid token')}},
    from(table){
      const state={table,values:null,filters:[],operation:'select',limit:null,range:null,orderBy:[]};
      const tableRows=rowsByTable[table]??[];
      const matching=()=>matchingRows(tableRows,state.filters);
      const api={
        select(){return api},
        eq(k,v){state.filters.push([k,v,'eq']);return api},
        in(k,values){state.filters.push([k,values,'in']);return api},
        gte(k,v){state.filters.push([k,v,'gte']);return api},
        lt(k,v){state.filters.push([k,v,'lt']);return api},
        ilike(){return api},
        order(key,{ascending=true}={}){state.orderBy.push({key,ascending});return api},
        limit(n){state.limit=n;return api},
        range(start,end){state.range={start,end};return api},
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
          const operationError=operationErrors[state.table]?.[state.operation];
          if(operationError)return {data:null,error:operationError};
          if(state.operation==='insert'){const row={...state.values};tableRows.push(row);return {data:row,error:null};}
          return {data:state.values,error:null};
        },
        then(resolve){
          const operationError=operationErrors[state.table]?.[state.operation];
          if(operationError)return Promise.resolve({data:null,error:operationError}).then(resolve);
          let data=matching();
          if(state.operation==='update')for(const row of data)Object.assign(row,state.values);
          if(state.operation==='delete'){for(const row of data)tableRows.splice(tableRows.indexOf(row),1);data=[]}
          if(state.orderBy.length){data=[...data].sort((a,b)=>{for(const {key,ascending} of state.orderBy){const result=String(a[key]).localeCompare(String(b[key]));if(result)return ascending?result:-result}return 0})}
          if(state.range)data=data.slice(state.range.start,state.range.end+1);
          if(state.limit!==null)data=data.slice(0,state.limit);
          return Promise.resolve({data,error:null}).then(resolve);
        }
      }; return api;
    }
  };
}
function startServer(options={},supabaseClientFactory=null){const database=mock(options);const app=createApp({supabaseClientFactory:supabaseClientFactory??(()=>database)});const server=http.createServer(app);return new Promise(resolve=>server.listen(0,'127.0.0.1',()=>resolve({baseUrl:'http://127.0.0.1:'+server.address().port,close:()=>{server.close();server.closeAllConnections?.()}})))}
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

const financeUser='11111111-1111-4111-8111-111111111111';
const financePeer='66666666-6666-4666-8666-666666666666';
const financeOrg='22222222-2222-4222-8222-222222222222';
const financeForeignOrg='77777777-7777-4777-8777-777777777777';
function financialEntry(id,overrides={}){
  const kind=overrides.kind??'income';
  return {id,organization_id:financeOrg,professional_id:financeUser,patient_id:null,kind,entry_type:kind,amount:'1.00',description:'Sessão avulsa',occurred_at:'2026-12-01',due_date:null,paid_at:null,created_at:id,...overrides};
}
const financeHeaders={Authorization:'Bearer valid'};

test('financial ledger is scoped by professional and month boundaries use occurred_at',async()=>{
  const rows=[
    financialEntry('10000000-0000-4000-8000-000000000001',{amount:'1.01',paid_at:'2026-12-02T12:00:00Z'}),
    financialEntry('10000000-0000-4000-8000-000000000002',{kind:'expense',entry_type:'expense',amount:'2.50',occurred_at:'2026-12-15',due_date:'2027-01-10'}),
    financialEntry('10000000-0000-4000-8000-000000000003',{kind:'expense',entry_type:'expense',amount:'9.00',occurred_at:'2026-12-31',due_date:'2027-01-15',paid_at:'2026-12-31T23:00:00Z'}),
    financialEntry('10000000-0000-4000-8000-000000000004',{amount:'99.99',occurred_at:'2027-01-01',due_date:'2026-12-31'}),
    financialEntry('10000000-0000-4000-8000-000000000005',{professional_id:financePeer,amount:'50.00'}),
    financialEntry('10000000-0000-4000-8000-000000000006',{organization_id:financeForeignOrg,amount:'70.00'}),
  ];
  const s=await startServer({financialEntries:rows});
  try{
    const response=await request(s.baseUrl,'/financial-entries?month=2026-12',{headers:financeHeaders});
    assert.equal(response.status,200);
    const body=await response.json();
    assert.deepEqual(body.entries.map(entry=>entry.id),[rows[2].id,rows[1].id,rows[0].id]);
    assert.equal(body.entries[0].amount_cents,900);
    assert.equal(body.entries[1].patient_id,null);
    assert.equal(body.entries[1].due_date,'2027-01-10');
    assert.equal(Object.hasOwn(body.entries[0],'organization_id'),false);
    assert.equal(Object.hasOwn(body.entries[0],'professional_id'),false);
    assert.deepEqual(body.summary,{income:{paid_cents:101,pending_cents:0},expense:{paid_cents:900,pending_cents:250}});
    const january=await request(s.baseUrl,'/financial-entries?month=2027-01',{headers:financeHeaders});
    assert.deepEqual((await january.json()).entries.map(entry=>entry.id),[rows[3].id]);
  }finally{await s.close()}
});

test('financial managers see organization entries while professionals remain personal',async()=>{
  const rows=[
    financialEntry('20000000-0000-4000-8000-000000000001'),
    financialEntry('20000000-0000-4000-8000-000000000002',{professional_id:financePeer}),
    financialEntry('20000000-0000-4000-8000-000000000003',{organization_id:financeForeignOrg}),
  ];
  for(const role of ['owner','coordinator','administrative']){
    const s=await startServer({membership:{organization_id:financeOrg,role},financialEntries:rows});
    try{
      const response=await request(s.baseUrl,'/financial-entries?month=2026-12',{headers:financeHeaders});
      assert.equal(response.status,200,role);
      assert.deepEqual((await response.json()).entries.map(entry=>entry.id),rows.slice(0,2).map(entry=>entry.id).reverse(),role);
    }finally{await s.close()}
  }
});

test('financial patient options are limited to patients visible to the profile',async()=>{
  const patients=[
    {id:'30000000-0000-4000-8000-000000000001',organization_id:financeOrg,professional_id:financeUser,full_name:'Paciente próprio'},
    {id:'30000000-0000-4000-8000-000000000002',organization_id:financeOrg,professional_id:financePeer,full_name:'Paciente de colega'},
    {id:'30000000-0000-4000-8000-000000000003',organization_id:financeForeignOrg,professional_id:financeUser,full_name:'Paciente estrangeiro'},
  ];
  const professional=await startServer({patients});
  const owner=await startServer({membership:{organization_id:financeOrg,role:'owner'},patients});
  try{
    const mine=await request(professional.baseUrl,'/financial-entries/patient-options',{headers:financeHeaders});
    assert.deepEqual((await mine.json()).patients,[{id:patients[0].id,full_name:'Paciente próprio'}]);
    const managed=await request(owner.baseUrl,'/financial-entries/patient-options',{headers:financeHeaders});
    assert.deepEqual((await managed.json()).patients,patients.slice(0,2).map(({id,full_name})=>({id,full_name})).reverse());
  }finally{await professional.close();await owner.close()}
});

test('financial entry creation derives scope, stores exact cents, and validates patient visibility',async()=>{
  const assigned={id:'30000000-0000-4000-8000-000000000001',organization_id:financeOrg,professional_id:financeUser,full_name:'Paciente próprio'};
  const peer={id:'30000000-0000-4000-8000-000000000002',organization_id:financeOrg,professional_id:financePeer,full_name:'Paciente de colega'};
  const s=await startServer({patients:[assigned,peer]});
  try{
    const payload={kind:'income',amount_cents:15007,description:'  Sessão domiciliar  ',occurred_at:'2026-12-10',due_date:'2026-12-15',patient_id:assigned.id,paid:true};
    const response=await request(s.baseUrl,'/financial-entries',{method:'POST',headers:financeHeaders,body:payload});
    assert.equal(response.status,201);
    const {entry}=await response.json();
    assert.equal(entry.amount_cents,15007);
    assert.equal(entry.description,'Sessão domiciliar');
    assert.equal(entry.patient_id,assigned.id);
    assert.ok(entry.paid_at);
    assert.equal(Object.hasOwn(entry,'organization_id'),false);
    assert.equal(Object.hasOwn(entry,'professional_id'),false);

    const hidden=await request(s.baseUrl,'/financial-entries',{method:'POST',headers:financeHeaders,body:{...payload,patient_id:peer.id}});
    assert.equal(hidden.status,422);
    const spoofed=await request(s.baseUrl,'/financial-entries',{method:'POST',headers:financeHeaders,body:{...payload,organization_id:financeForeignOrg}});
    assert.equal(spoofed.status,422);
  }finally{await s.close()}
});

test('financial creation rejects invalid precision, range, civil dates, and client-managed fields',async()=>{
  const s=await startServer();
  const base={kind:'expense',amount_cents:100,description:'Material',occurred_at:'2026-10-10'};
  try{
    for(const amount_cents of [0,-1,1.5,1.001,1_000_000_000_000,Number.MAX_SAFE_INTEGER]){
      const response=await request(s.baseUrl,'/financial-entries',{method:'POST',headers:financeHeaders,body:{...base,amount_cents}});
      assert.equal(response.status,422,`amount_cents=${amount_cents}`);
    }
    for(const occurred_at of ['2026-02-29','2026-13-01','2026-1-01','2026-06-31']){
      const response=await request(s.baseUrl,'/financial-entries',{method:'POST',headers:financeHeaders,body:{...base,occurred_at}});
      assert.equal(response.status,422,`occurred_at=${occurred_at}`);
    }
    const due=await request(s.baseUrl,'/financial-entries',{method:'POST',headers:financeHeaders,body:{...base,due_date:'2026-02-30'}});
    assert.equal(due.status,422);
    const managed=await request(s.baseUrl,'/financial-entries',{method:'POST',headers:financeHeaders,body:{...base,organization_id:financeOrg,professional_id:financeUser,paid_at:'2026-10-10T00:00:00Z'}});
    assert.equal(managed.status,422);
    const invalidMonth=await request(s.baseUrl,'/financial-entries?month=2026-13',{headers:financeHeaders});
    assert.equal(invalidMonth.status,422);
  }finally{await s.close()}
});

test('financial payment changes are scoped and repeated state updates are idempotent',async()=>{
  const own=financialEntry('40000000-0000-4000-8000-000000000001');
  const peer=financialEntry('40000000-0000-4000-8000-000000000002',{professional_id:financePeer});
  const s=await startServer({financialEntries:[own,peer]});
  try{
    const hidden=await request(s.baseUrl,`/financial-entries/${peer.id}/payment`,{method:'PATCH',headers:financeHeaders,body:{paid:true}});
    assert.equal(hidden.status,404);
    const paid=await request(s.baseUrl,`/financial-entries/${own.id}/payment`,{method:'PATCH',headers:financeHeaders,body:{paid:true}});
    assert.equal(paid.status,200);
    const firstPaidAt=(await paid.json()).entry.paid_at;
    const repeated=await request(s.baseUrl,`/financial-entries/${own.id}/payment`,{method:'PATCH',headers:financeHeaders,body:{paid:true}});
    assert.equal((await repeated.json()).entry.paid_at,firstPaidAt);
    const pending=await request(s.baseUrl,`/financial-entries/${own.id}/payment`,{method:'PATCH',headers:financeHeaders,body:{paid:false}});
    assert.equal((await pending.json()).entry.paid_at,null);
    const spoofed=await request(s.baseUrl,`/financial-entries/${own.id}/payment`,{method:'PATCH',headers:financeHeaders,body:{paid:true,paid_at:'2026-10-10T00:00:00Z'}});
    assert.equal(spoofed.status,422);
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
  const patientId='33333333-3333-4333-8333-333333333333';
  const s=await startServer({
    patients:[{id:patientId,organization_id:'22222222-2222-4222-8222-222222222222',professional_id:'11111111-1111-4111-8111-111111111111'}],
    operationErrors:{appointments:{insert:{code:'23P01'}}},
  });
  try {
    const response=await request(s.baseUrl,'/appointments',{method:'POST',headers:{Authorization:'Bearer valid'},body:{
      patient_id:patientId,starts_at:'2026-10-12T13:00:00Z',ends_at:'2026-10-12T14:00:00Z'
    }});
    assert.equal(response.status,409);
  }finally{await s.close()}
});

test('notifications require authentication and list only the current user and organization',async()=>{
  const own={id:'33333333-3333-4333-8333-333333333333',organization_id:'22222222-2222-4222-8222-222222222222',user_id:'11111111-1111-4111-8111-111111111111',action_type:'manual_task',title:'Tarefa própria',status:'unread'};
  const peer={...own,id:'44444444-4444-4444-8444-444444444444',user_id:'55555555-5555-4555-8555-555555555555',title:'Tarefa alheia'};
  const foreign={...own,id:'66666666-6666-4666-8666-666666666666',organization_id:'77777777-7777-4777-8777-777777777777',title:'Outra organização'};
  const s=await startServer({notifications:[own,peer,foreign]});
  try{
    assert.equal((await request(s.baseUrl,'/notifications')).status,401);
    const response=await request(s.baseUrl,'/notifications',{headers:{Authorization:'Bearer valid'}});
    assert.equal(response.status,200);
    assert.deepEqual((await response.json()).notifications.map(item=>item.id),[own.id]);
  }finally{await s.close()}
});

test('notification routes reject authenticated users without organization membership',async()=>{
  const s=await startServer({memberships:[]});
  try{
    const response=await request(s.baseUrl,'/notifications',{headers:{Authorization:'Bearer valid'}});
    assert.equal(response.status,403);
  }finally{await s.close()}
});

test('upcoming appointment reminders require membership and only return the current professional within 24 hours',async()=>{
  const now=Date.now();
  const own={id:'33333333-3333-4333-8333-333333333333',organization_id:'22222222-2222-4222-8222-222222222222',professional_id:'11111111-1111-4111-8111-111111111111',patient_id:'88888888-8888-4888-8888-888888888888',starts_at:new Date(now+60*60*1000).toISOString(),status:'scheduled',notes:'Conteúdo clínico que não pode sair'};
  const rows=[
    own,
    {...own,id:'44444444-4444-4444-8444-444444444444',starts_at:new Date(now+23*60*60*1000).toISOString(),status:'confirmed'},
    {...own,id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',starts_at:new Date(now+2*60*60*1000).toISOString(),status:'rescheduled'},
    {...own,id:'55555555-5555-4555-8555-555555555555',starts_at:new Date(now+25*60*60*1000).toISOString()},
    {...own,id:'cccccccc-cccc-4ccc-8ccc-cccccccccccc',starts_at:new Date(now+24*60*60*1000+60_000).toISOString()},
    {...own,id:'66666666-6666-4666-8666-666666666666',starts_at:new Date(now-60_000).toISOString()},
    {...own,id:'77777777-7777-4777-8777-777777777777',professional_id:'55555555-5555-4555-8555-555555555555'},
    {...own,id:'99999999-9999-4999-8999-999999999999',organization_id:'77777777-7777-4777-8777-777777777777'},
    {...own,id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',status:'completed'},
  ];
  const s=await startServer({appointments:rows});
  try{
    assert.equal((await request(s.baseUrl,'/notifications/upcoming-appointments')).status,401);
    const response=await request(s.baseUrl,'/notifications/upcoming-appointments',{headers:{Authorization:'Bearer valid'}});
    assert.equal(response.status,200);
    const {appointments}=await response.json();
    assert.deepEqual(appointments.map(item=>item.id),[own.id,'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','44444444-4444-4444-8444-444444444444']);
    assert.deepEqual(Object.keys(appointments[0]).sort(),['id','starts_at','status']);
    assert.equal(JSON.stringify(appointments).includes('patient_id'),false);
    assert.equal(JSON.stringify(appointments).includes('Conteúdo clínico'),false);
  }finally{await s.close()}
});

test('upcoming appointment reminders reject a user without organization membership',async()=>{
  const s=await startServer({memberships:[]});
  try{
    assert.equal((await request(s.baseUrl,'/notifications/upcoming-appointments',{headers:{Authorization:'Bearer valid'}})).status,403);
  }finally{await s.close()}
});

test('notification creation derives scope from membership and stores only a bounded due date',async()=>{
  const s=await startServer();
  try{
    const response=await request(s.baseUrl,'/notifications',{method:'POST',headers:{Authorization:'Bearer valid'},body:{
      title:'  Confirmar horário  ',message:' Lembrete operacional ',priority:'attention',due_at:'2026-10-12T10:30:00-03:00'
    }});
    assert.equal(response.status,201);
    const {notification}=await response.json();
    assert.equal(notification.organization_id,'22222222-2222-4222-8222-222222222222');
    assert.equal(notification.user_id,'11111111-1111-4111-8111-111111111111');
    assert.equal(notification.professional_id,'11111111-1111-4111-8111-111111111111');
    assert.equal(notification.title,'Confirmar horário');
    assert.equal(notification.body,'Lembrete operacional');
    assert.equal(notification.action_type,'manual_task');
    assert.equal(notification.action_data.due_at,'2026-10-12T13:30:00.000Z');
    assert.equal(notification.status,'unread');
  }finally{await s.close()}
});

test('notification creation rejects client-controlled scope and invalid fields',async()=>{
  const s=await startServer();
  try{
    const spoof=await request(s.baseUrl,'/notifications',{method:'POST',headers:{Authorization:'Bearer valid'},body:{title:'Tarefa',organization_id:'77777777-7777-4777-8777-777777777777'}});
    assert.equal(spoof.status,422);
    const invalid=await request(s.baseUrl,'/notifications',{method:'POST',headers:{Authorization:'Bearer valid'},body:{title:'x',priority:'critical',due_at:'2026-10-12T10:30:00'}});
    assert.equal(invalid.status,422);
    const impossibleDate=await request(s.baseUrl,'/notifications',{method:'POST',headers:{Authorization:'Bearer valid'},body:{title:'Tarefa válida',due_at:'2026-02-31T10:00:00Z'}});
    assert.equal(impossibleDate.status,422);
  }finally{await s.close()}
});

test('notification filters reject unsupported values',async()=>{
  const s=await startServer();
  try{
    const status=await request(s.baseUrl,'/notifications?status=invalid',{headers:{Authorization:'Bearer valid'}});
    const priority=await request(s.baseUrl,'/notifications?priority=critical',{headers:{Authorization:'Bearer valid'}});
    assert.equal(status.status,422);
    assert.equal(priority.status,422);
  }finally{await s.close()}
});

test('notification filters return only matching valid status and priority',async()=>{
  const rows=[
    {id:'33333333-3333-4333-8333-333333333333',organization_id:'22222222-2222-4222-8222-222222222222',user_id:'11111111-1111-4111-8111-111111111111',action_type:'manual_task',title:'Urgente aberta',status:'unread',priority:'urgent'},
    {id:'44444444-4444-4444-8444-444444444444',organization_id:'22222222-2222-4222-8222-222222222222',user_id:'11111111-1111-4111-8111-111111111111',action_type:'manual_task',title:'Informativa concluída',status:'completed',priority:'informational'},
  ];
  const s=await startServer({notifications:rows});
  try{
    const response=await request(s.baseUrl,'/notifications?status=unread&priority=urgent',{headers:{Authorization:'Bearer valid'}});
    assert.deepEqual((await response.json()).notifications.map(item=>item.id),[rows[0].id]);
  }finally{await s.close()}
});

test('notification task routes do not expose legacy notifications',async()=>{
  const legacy={id:'33333333-3333-4333-8333-333333333333',organization_id:'22222222-2222-4222-8222-222222222222',user_id:'11111111-1111-4111-8111-111111111111',action_type:'clinical_alert',title:'Aviso legado',status:'unread'};
  const s=await startServer({notifications:[legacy]});
  try{
    const list=await request(s.baseUrl,'/notifications',{headers:{Authorization:'Bearer valid'}});
    assert.deepEqual((await list.json()).notifications,[]);
    assert.equal((await request(s.baseUrl,'/notifications/'+legacy.id,{method:'PATCH',headers:{Authorization:'Bearer valid'},body:{status:'read'}})).status,404);
    assert.equal((await request(s.baseUrl,'/notifications/'+legacy.id,{method:'DELETE',headers:{Authorization:'Bearer valid'}})).status,404);
  }finally{await s.close()}
});

test('notification state changes set server timestamps and terminal tasks cannot reopen',async()=>{
  const task={id:'33333333-3333-4333-8333-333333333333',organization_id:'22222222-2222-4222-8222-222222222222',user_id:'11111111-1111-4111-8111-111111111111',action_type:'manual_task',title:'Tarefa',body:'Tarefa',status:'unread',action_data:{}};
  const s=await startServer({notifications:[task]});
  try{
    const completed=await request(s.baseUrl,'/notifications/'+task.id,{method:'PATCH',headers:{Authorization:'Bearer valid'},body:{status:'completed',organization_id:'77777777-7777-4777-8777-777777777777'}});
    assert.equal(completed.status,422);
    const response=await request(s.baseUrl,'/notifications/'+task.id,{method:'PATCH',headers:{Authorization:'Bearer valid'},body:{status:'completed'}});
    assert.equal(response.status,200);
    const {notification}=await response.json();
    assert.equal(notification.status,'completed');
    assert.ok(Number.isFinite(Date.parse(notification.completed_at)));
    assert.equal((await request(s.baseUrl,'/notifications/'+task.id,{method:'PATCH',headers:{Authorization:'Bearer valid'},body:{status:'unread'}})).status,409);
  }finally{await s.close()}
});

test('notification due date can be changed and cleared without losing other action metadata',async()=>{
  const task={id:'33333333-3333-4333-8333-333333333333',organization_id:'22222222-2222-4222-8222-222222222222',user_id:'11111111-1111-4111-8111-111111111111',action_type:'manual_task',title:'Tarefa',status:'unread',action_data:{source:'manual'}};
  const s=await startServer({notifications:[task]});
  try{
    const changed=await request(s.baseUrl,'/notifications/'+task.id,{method:'PATCH',headers:{Authorization:'Bearer valid'},body:{due_at:'2026-10-12T10:30:00-03:00'}});
    assert.equal((await changed.json()).notification.action_data.due_at,'2026-10-12T13:30:00.000Z');
    const cleared=await request(s.baseUrl,'/notifications/'+task.id,{method:'PATCH',headers:{Authorization:'Bearer valid'},body:{due_at:null}});
    const notification=(await cleared.json()).notification;
    assert.equal(Object.hasOwn(notification.action_data,'due_at'),false);
    assert.equal(notification.action_data.source,'manual');
  }finally{await s.close()}
});

test('notification delete is scoped to the authenticated user',async()=>{
  const other={id:'33333333-3333-4333-8333-333333333333',organization_id:'22222222-2222-4222-8222-222222222222',user_id:'55555555-5555-4555-8555-555555555555',action_type:'manual_task',title:'Tarefa de outra pessoa'};
  const s=await startServer({notifications:[other]});
  try{
    assert.equal((await request(s.baseUrl,'/notifications/'+other.id,{method:'DELETE',headers:{Authorization:'Bearer valid'}})).status,404);
  }finally{await s.close()}
});
