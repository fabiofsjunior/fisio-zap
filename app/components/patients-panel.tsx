'use client';

import { useEffect, useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';

type Patient = {
  id:string; full_name:string; email:string|null; phone:string|null; birth_date:string|null;
  address:string|null; condition:string|null; treatment_goal:string|null;
  status:'active'|'inactive'|'discharged'; notes:string|null; started_at:string|null;
};

const emptyForm={full_name:'',email:'',phone:'',birth_date:'',address:'',condition:'',treatment_goal:'',started_at:'',notes:'',status:'active' as Patient['status']};

export default function PatientsPanel(){
  const [patients,setPatients]=useState<Patient[]>([]),[form,setForm]=useState(emptyForm),[editing,setEditing]=useState<string|null>(null);
  const [search,setSearch]=useState(''),[loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[error,setError]=useState('');
  const backendUrl=process.env.NEXT_PUBLIC_BACKEND_URL||'http://localhost:3001';

  async function request(path:string,options:RequestInit={}){
    const client=createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
    const {data:{session}}=await client.auth.getSession();
    if(!session?.access_token)throw new Error('Sessão ausente. Entre novamente.');
    const response=await fetch(backendUrl+path,{...options,headers:{'Content-Type':'application/json',Authorization:'Bearer '+session.access_token,...(options.headers||{})}});
    const body=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(body.error||'Não foi possível concluir a operação.');
    return body;
  }

  async function loadPatients(term=search){
    setLoading(true);setError('');
    try{const body=await request('/patients?search='+encodeURIComponent(term));setPatients(body.patients??[]);}
    catch(err){setError(err instanceof Error?err.message:'Falha ao carregar pacientes.');}
    finally{setLoading(false);}
  }

  useEffect(()=>{void loadPatients('');},[]);

  function resetForm(){setForm(emptyForm);setEditing(null);}
  function set(key:keyof typeof emptyForm,value:string){setForm(current=>({...current,[key]:value}));}

  async function save(event:React.FormEvent){
    event.preventDefault();setSaving(true);setError('');
    try{
      const payload=Object.fromEntries(Object.entries(form).map(([key,value])=>[key,value||null]));
      if(!payload.full_name)throw new Error('Informe o nome completo.');
      await request(editing?'/patients/'+editing:'/patients',{method:editing?'PATCH':'POST',body:JSON.stringify(payload)});
      resetForm();await loadPatients(search);
    }catch(err){setError(err instanceof Error?err.message:'Falha ao salvar paciente.');}
    finally{setSaving(false);}
  }

  function edit(patient:Patient){
    setEditing(patient.id);
    setForm({full_name:patient.full_name,email:patient.email??'',phone:patient.phone??'',birth_date:patient.birth_date??'',address:patient.address??'',condition:patient.condition??'',treatment_goal:patient.treatment_goal??'',started_at:patient.started_at??'',notes:patient.notes??'',status:patient.status});
    window.scrollTo({top:0,behavior:'smooth'});
  }

  async function changeStatus(patient:Patient,status:Patient['status']){
    try{await request('/patients/'+patient.id,{method:'PATCH',body:JSON.stringify({status})});await loadPatients(search);}
    catch(err){setError(err instanceof Error?err.message:'Falha ao atualizar status.');}
  }

  async function remove(patient:Patient){
    if(!window.confirm('Excluir '+patient.full_name+'? Esta ação não pode ser desfeita.'))return;
    try{await request('/patients/'+patient.id,{method:'DELETE'});await loadPatients(search);}
    catch(err){setError(err instanceof Error?err.message:'Falha ao excluir paciente.');}
  }

  return <section className="module-screen">
    <div className="panel-heading"><div><span className="eyebrow">S2 · PACIENTES</span><h2>{editing?'Editar paciente':'Novo paciente'}</h2><p>Cadastro protegido por organização e profissional responsável.</p></div><span className="demo-badge">Dados fictícios em desenvolvimento</span></div>
    {error&&<div className="chat-error" role="alert"><span>{error}</span><button type="button" onClick={()=>setError('')}>Fechar</button></div>}
    <form className="panel patient-form" onSubmit={save}>
      <label>Nome completo<input required maxLength={120} value={form.full_name} onChange={e=>set('full_name',e.target.value)}/></label>
      <div className="patient-form-grid"><label>E-mail<input type="email" maxLength={254} value={form.email} onChange={e=>set('email',e.target.value)}/></label><label>Telefone<input maxLength={30} value={form.phone} onChange={e=>set('phone',e.target.value)}/></label><label>Data de nascimento<input type="date" value={form.birth_date} onChange={e=>set('birth_date',e.target.value)}/></label><label>Início do tratamento<input type="date" value={form.started_at} onChange={e=>set('started_at',e.target.value)}/></label></div>
      <label>Endereço<textarea maxLength={500} rows={2} value={form.address} onChange={e=>set('address',e.target.value)}/></label>
      <div className="patient-form-grid"><label>Condição clínica<textarea maxLength={2000} rows={3} value={form.condition} onChange={e=>set('condition',e.target.value)}/></label><label>Objetivo do tratamento<textarea maxLength={2000} rows={3} value={form.treatment_goal} onChange={e=>set('treatment_goal',e.target.value)}/></label></div>
      <label>Observações<textarea maxLength={4000} rows={3} value={form.notes} onChange={e=>set('notes',e.target.value)}/></label>
      <label>Status<select value={form.status} onChange={e=>set('status',e.target.value as Patient['status'])}><option value="active">Ativo</option><option value="inactive">Inativo</option><option value="discharged">Alta / desligado</option></select></label>
      <div className="form-actions"><button type="submit" disabled={saving}>{saving?'Salvando…':editing?'Salvar alterações':'Cadastrar paciente'}</button>{editing&&<button type="button" onClick={resetForm}>Cancelar</button>}</div>
    </form>
    <div className="panel"><div className="panel-head"><div><span className="eyebrow">CADASTRO</span><h2>Pacientes</h2></div><span className="count">{patients.length}</span></div>
      <div className="patient-search"><input placeholder="Pesquisar por nome…" value={search} onChange={e=>setSearch(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')void loadPatients(search)}}/><button type="button" onClick={()=>void loadPatients(search)}>Pesquisar</button></div>
      {loading?<p>Carregando…</p>:patients.length===0?<p className="empty-state">Nenhum paciente encontrado.</p>:<div className="patient-list">{patients.map(patient=><article className="patient-row" key={patient.id}><div><strong>{patient.full_name}</strong><span>{patient.phone||'Sem telefone'} · {patient.status==='active'?'Ativo':patient.status==='inactive'?'Inativo':'Alta'}</span>{patient.condition&&<small>{patient.condition}</small>}</div><div className="patient-row-actions"><button type="button" onClick={()=>edit(patient)}>Editar</button>{patient.status==='active'?<button type="button" onClick={()=>void changeStatus(patient,'discharged')}>Dar alta</button>:<button type="button" onClick={()=>void changeStatus(patient,'active')}>Reativar</button>}<button type="button" onClick={()=>void remove(patient)}>Excluir</button></div></article>)}</div>}
    </div>
  </section>;
}
