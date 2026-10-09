import 'dotenv/config';
import express from 'express';
import { createClient } from '@supabase/supabase-js';

const port = Number(process.env.PORT || 3001);
const frontendOrigin = process.env.FRONTEND_ORIGIN || 'http://localhost:3000';
const maxMessageLength = 4000;
const windowMs = 60_000;
const maxRequestsPerWindow = 30;
const PATIENT_STATUSES = new Set(['active', 'inactive', 'discharged']);
const PATIENT_FIELDS = ['id','organization_id','professional_id','group_id','full_name','email','phone','birth_date','address','condition','treatment_goal','status','notes','started_at','created_at','updated_at'];

export function createApp({ supabaseClientFactory = createClient } = {}) {
  const app = express();
  const rateBuckets = new Map();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '64kb' }));

  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin === frontendOrigin) { res.setHeader('Access-Control-Allow-Origin', origin); res.setHeader('Vary', 'Origin'); }
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-FisioZap-Organization-Id');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });

  function rateLimit(req, res, next) {
    const key = req.ip || 'unknown'; const now = Date.now(); const bucket = rateBuckets.get(key);
    if (!bucket || now - bucket.startedAt >= windowMs) { rateBuckets.set(key, { startedAt: now, count: 1 }); return next(); }
    bucket.count += 1;
    if (bucket.count > maxRequestsPerWindow) return res.status(429).json({ error: 'Muitas solicitações. Tente novamente em instantes.' });
    return next();
  }

  function getBearerToken(req) {
    const value = req.get('authorization') || '';
    if (!value.startsWith('Bearer ')) return null;
    return value.slice(7).trim() || null;
  }

  async function requireAuth(req, res, next) {
    const token = getBearerToken(req);
    if (!token || !process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return res.status(401).json({ error: 'Autenticação necessária.' });
    const supabase = supabaseClientFactory(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { autoRefreshToken: false, persistSession: false }, accessToken: async () => token });
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user) return res.status(401).json({ error: 'Sessão inválida ou expirada.' });
    req.user = data.user; req.supabase = supabase; return next();
  }

  async function getMembership(req) {
    const requestedOrganizationId = req.get('x-fisiozap-organization-id');
    const membershipQuery = req.supabase.from('organization_members')
      .select('organization_id, role').eq('user_id', req.user.id);
    if (requestedOrganizationId) {
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requestedOrganizationId)) {
        req.invalidOrganizationSelection = true;
        return null;
      }
      const { data, error } = await membershipQuery.eq('organization_id', requestedOrganizationId).maybeSingle();
      if (error || !data) {
        req.invalidOrganizationSelection = true;
        return null;
      }
      return data;
    }
    const { data, error } = await membershipQuery.limit(2);
    if (error || !data?.length) return null;
    if (data.length > 1) {
      req.organizationSelectionRequired = true;
      return null;
    }
    return data[0];
  }

  function rejectMembership(req, res) {
    if (req.organizationSelectionRequired) {
      return res.status(409).json({ error: 'Usuário vinculado a várias organizações. Envie X-FisioZap-Organization-Id com uma organização da sua membership.' });
    }
    if (req.invalidOrganizationSelection) {
      return res.status(403).json({ error: 'Organização solicitada não autorizada.' });
    }
    return res.status(403).json({ error: 'Usuário sem organização autorizada.' });
  }

  function validatePatient(input, { partial = false } = {}) {
    const errors = {};
    const value = (key) => input?.[key];
    if (!partial || input?.full_name !== undefined) {
      if (typeof value('full_name') !== 'string' || value('full_name').trim().length < 2) errors.full_name = 'Nome completo é obrigatório.';
      else if (value('full_name').trim().length > 120) errors.full_name = 'Nome completo deve ter no máximo 120 caracteres.';
    }
    for (const [key, max] of [['email',254],['phone',30],['address',500],['condition',2000],['treatment_goal',2000],['notes',4000]]) {
      if (value(key) !== undefined && value(key) !== null && (typeof value(key) !== 'string' || value(key).length > max)) errors[key] = 'Campo inválido ou excede ' + max + ' caracteres.';
    }
    if (value('email') && !/^\S+@\S+\.\S+$/.test(value('email'))) errors.email = 'E-mail inválido.';
    if (value('status') !== undefined && !PATIENT_STATUSES.has(value('status'))) errors.status = 'Status inválido.';
    for (const key of ['birth_date','started_at']) if (value(key) !== undefined && value(key) !== null && value(key) !== '' && !/^\d{4}-\d{2}-\d{2}$/.test(value(key))) errors[key] = 'Data inválida.';
    if (value('professional_id') !== undefined && value('professional_id') !== null && !/^[0-9a-f-]{36}$/i.test(value('professional_id'))) errors.professional_id = 'Profissional inválido.';
    if (value('group_id') !== undefined && value('group_id') !== null && value('group_id') !== '' && !/^[0-9a-f-]{36}$/i.test(value('group_id'))) errors.group_id = 'Grupo inválido.';
    return errors;
  }

  async function verifyProfessionalMembership(supabase, organizationId, professionalId) {
    const { data, error } = await supabase.from('organization_members').select('user_id').eq('organization_id', organizationId).eq('user_id', professionalId).maybeSingle();
    return !error && Boolean(data);
  }

  function sanitizePatient(input, defaults = {}) {
    const output = {};
    for (const key of PATIENT_FIELDS) {
      if (['id','organization_id','created_at','updated_at'].includes(key)) continue;
      if (input?.[key] !== undefined) output[key] = typeof input[key] === 'string' ? input[key].trim() : input[key];
    }
    return { ...defaults, ...output };
  }

  app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'fisio-zap-backend' }));

  app.get('/patients', rateLimit, requireAuth, async (req, res) => {
    const membership = await getMembership(req);
    if (!membership) return rejectMembership(req, res);
    let query = req.supabase.from('patients').select(PATIENT_FIELDS.join(',')).order('full_name', { ascending: true });
    if (typeof req.query.search === 'string' && req.query.search.trim()) query = query.ilike('full_name', '%' + req.query.search.trim().slice(0,80) + '%');
    if (typeof req.query.status === 'string' && PATIENT_STATUSES.has(req.query.status)) query = query.eq('status', req.query.status);
    const { data, error } = await query;
    if (error) return res.status(400).json({ error: 'Não foi possível consultar os pacientes.' });
    return res.json({ patients: data ?? [] });
  });

  app.post('/patients', rateLimit, requireAuth, async (req, res) => {
    const membership = await getMembership(req);
    if (!membership) return rejectMembership(req, res);
    const errors = validatePatient(req.body);
    if (Object.keys(errors).length) return res.status(422).json({ error: 'Dados inválidos.', fields: errors });
    const professionalId = req.body?.professional_id || req.user.id;
    if (!/^[0-9a-f-]{36}$/i.test(professionalId) || !(await verifyProfessionalMembership(req.supabase, membership.organization_id, professionalId))) return res.status(422).json({ error: 'Profissional responsável não pertence à organização.' });
    const payload = sanitizePatient(req.body, { organization_id: membership.organization_id, professional_id: professionalId, status: req.body?.status || 'active' });
    const { data, error } = await req.supabase.from('patients').insert(payload).select(PATIENT_FIELDS.join(',')).single();
    if (error) return res.status(400).json({ error: 'Não foi possível criar o paciente.' });
    return res.status(201).json({ patient: data });
  });

  app.patch('/patients/:id', rateLimit, requireAuth, async (req, res) => {
    const membership = await getMembership(req);
    if (!membership) return rejectMembership(req, res);
    if (!/^[0-9a-f-]{36}$/i.test(req.params.id)) return res.status(400).json({ error: 'Paciente inválido.' });
    const errors = validatePatient(req.body, { partial: true });
    if (Object.keys(errors).length) return res.status(422).json({ error: 'Dados inválidos.', fields: errors });
    const { data: existing, error: existingError } = await req.supabase.from('patients').select(PATIENT_FIELDS.join(',')).eq('id', req.params.id).maybeSingle();
    if (existingError || !existing) return res.status(404).json({ error: 'Paciente não encontrado.' });
    const patch = sanitizePatient(req.body); delete patch.organization_id;
    if (patch.professional_id && !(await verifyProfessionalMembership(req.supabase, membership.organization_id, patch.professional_id))) return res.status(422).json({ error: 'Profissional responsável não pertence à organização.' });
    const { data, error } = await req.supabase.from('patients').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', req.params.id).select(PATIENT_FIELDS.join(',')).single();
    if (error) return res.status(400).json({ error: 'Não foi possível atualizar o paciente.' });
    return res.json({ patient: data });
  });

  app.delete('/patients/:id', rateLimit, requireAuth, async (req, res) => {
    const membership = await getMembership(req);
    if (!membership) return rejectMembership(req, res);
    if (!/^[0-9a-f-]{36}$/i.test(req.params.id)) return res.status(400).json({ error: 'Paciente inválido.' });
    const { data, error } = await req.supabase.from('patients').delete().eq('id', req.params.id).select('id').maybeSingle();
    if (error) return res.status(400).json({ error: 'Não foi possível excluir o paciente.' });
    if (!data) return res.status(404).json({ error: 'Paciente não encontrado ou sem permissão.' });
    return res.status(204).send();
  });

  const APPOINTMENT_FIELDS = 'id,organization_id,professional_id,patient_id,starts_at,ends_at,status,notes,created_at,updated_at';
  const APPOINTMENT_STATUSES = new Set(['scheduled','confirmed','completed','cancelled','no_show','rescheduled']);
  const isUuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
  function validateAppointment(body, partial = false) {
    const errors = {};
    if (!body || typeof body !== 'object' || Array.isArray(body)) return { body: 'Objeto obrigatório.' };
    if (!partial || body.patient_id !== undefined) if (!isUuid(body.patient_id)) errors.patient_id = 'Paciente inválido.';
    if (body.professional_id !== undefined && !isUuid(body.professional_id)) errors.professional_id = 'Profissional inválido.';
    for (const field of ['starts_at','ends_at']) if (!partial || body[field] !== undefined) {
      if (typeof body[field] !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(body[field]) || !/(Z|[+-]\d{2}:\d{2})$/.test(body[field]) || !Number.isFinite(Date.parse(body[field]))) errors[field] = 'Data/hora com fuso obrigatório.';
    }
    if (body.status !== undefined && !APPOINTMENT_STATUSES.has(body.status)) errors.status = 'Status inválido.';
    if (body.notes !== undefined && body.notes !== null && (typeof body.notes !== 'string' || body.notes.length > 4000)) errors.notes = 'Observação inválida.';
    if (body.starts_at && body.ends_at && Date.parse(body.ends_at) <= Date.parse(body.starts_at)) errors.ends_at = 'Fim deve ser posterior ao início.';
    return errors;
  }
  async function appointmentScope(req, res) {
    const membership = await getMembership(req);
    if (!membership) { rejectMembership(req, res); return null; }
    return membership;
  }
  app.get('/appointments', rateLimit, requireAuth, async (req, res) => {
    const membership = await appointmentScope(req,res); if (!membership) return;
    let query = req.supabase.from('appointments').select(APPOINTMENT_FIELDS).eq('organization_id', membership.organization_id).order('starts_at', { ascending: true }).limit(250);
    if (req.query.from) { if (!Number.isFinite(Date.parse(req.query.from))) return res.status(422).json({ error: 'Início inválido.' }); query = query.gte('starts_at',new Date(req.query.from).toISOString()); }
    if (req.query.to) { if (!Number.isFinite(Date.parse(req.query.to))) return res.status(422).json({ error: 'Fim inválido.' }); query = query.lt('starts_at',new Date(req.query.to).toISOString()); }
    if (req.query.status) { if (!APPOINTMENT_STATUSES.has(req.query.status)) return res.status(422).json({ error: 'Status inválido.' }); query = query.eq('status',req.query.status); }
    const {data,error} = await query;
    if (error) return res.status(400).json({error:'Não foi possível consultar a agenda.'});
    return res.json({appointments:data??[]});
  });
  app.post('/appointments', rateLimit, requireAuth, async (req,res) => {
    const membership = await appointmentScope(req,res); if (!membership) return;
    const errors = validateAppointment(req.body);
    if (Object.keys(errors).length) return res.status(422).json({error:'Dados inválidos.',fields:errors});
    const professionalId = req.body.professional_id || req.user.id;
    if (!(await verifyProfessionalMembership(req.supabase,membership.organization_id,professionalId))) return res.status(422).json({error:'Profissional não pertence à organização.'});
    const {data:patient,error:patientError} = await req.supabase.from('patients').select('id').eq('id',req.body.patient_id).eq('organization_id',membership.organization_id).maybeSingle();
    if (patientError || !patient) return res.status(422).json({error:'Paciente não encontrado nesta organização.'});
    const payload = {organization_id:membership.organization_id,professional_id:professionalId,patient_id:req.body.patient_id,starts_at:new Date(req.body.starts_at).toISOString(),ends_at:new Date(req.body.ends_at).toISOString(),status:req.body.status||'scheduled',notes:req.body.notes??null};
    const {data,error} = await req.supabase.from('appointments').insert(payload).select(APPOINTMENT_FIELDS).single();
    if (error?.code === '23P01') return res.status(409).json({error:'O profissional já possui atendimento nesse horário.'});
    if (error) return res.status(400).json({error:'Não foi possível criar o agendamento.'});
    return res.status(201).json({appointment:data});
  });
  app.patch('/appointments/:id', rateLimit, requireAuth, async (req,res) => {
    const membership = await appointmentScope(req,res); if (!membership) return;
    if (!isUuid(req.params.id)) return res.status(400).json({error:'Agendamento inválido.'});
    const errors = validateAppointment(req.body,true);
    if (Object.keys(errors).length) return res.status(422).json({error:'Dados inválidos.',fields:errors});
    const {data:existing,error:existingError} = await req.supabase.from('appointments').select(APPOINTMENT_FIELDS).eq('id',req.params.id).eq('organization_id',membership.organization_id).maybeSingle();
    if (existingError || !existing) return res.status(404).json({error:'Agendamento não encontrado.'});
    const patch = {};
    for (const key of ['starts_at','ends_at','status','notes']) if (req.body[key] !== undefined) patch[key] = req.body[key];
    if (patch.starts_at || patch.ends_at) {
      const start = Date.parse(patch.starts_at || existing.starts_at), end = Date.parse(patch.ends_at || existing.ends_at);
      if (!(end>start)) return res.status(422).json({error:'Intervalo inválido.'});
    }
    if (!Object.keys(patch).length) return res.status(422).json({error:'Nenhuma alteração permitida.'});
    const {data,error} = await req.supabase.from('appointments').update({...patch,updated_at:new Date().toISOString()}).eq('id',req.params.id).eq('organization_id',membership.organization_id).select(APPOINTMENT_FIELDS).single();
    if (error?.code === '23P01') return res.status(409).json({error:'O profissional já possui atendimento nesse horário.'});
    if (error) return res.status(400).json({error:'Não foi possível atualizar o agendamento.'});
    return res.json({appointment:data});
  });
  app.delete('/appointments/:id', rateLimit, requireAuth, async (req,res) => {
    const membership = await appointmentScope(req,res); if (!membership) return;
    if (!isUuid(req.params.id)) return res.status(400).json({error:'Agendamento inválido.'});
    const {data,error} = await req.supabase.from('appointments').delete().eq('id',req.params.id).eq('organization_id',membership.organization_id).select('id').maybeSingle();
    if (error) return res.status(400).json({error:'Não foi possível excluir o agendamento.'});
    if (!data) return res.status(404).json({error:'Agendamento não encontrado.'});
    return res.status(204).send();
  });


  // S4.2: clinical encounters. Organization is always resolved from the session.
  const ENCOUNTER_FIELDS = 'id,organization_id,patient_id,professional_id,appointment_id,status,started_at,completed_at,created_at,updated_at';
  const EVOLUTION_FIELDS = 'id,organization_id,encounter_id,author_id,content,status,confirmed_at,created_at,updated_at';
  function canManageClinicalRecords(membership) {
    return membership.role === 'owner' || membership.role === 'coordinator';
  }
  async function getScopedEncounter(req, membership, id) {
    if (!isUuid(id)) return null;
    let query = req.supabase.from('clinical_encounters')
      .select(ENCOUNTER_FIELDS).eq('id', id).eq('organization_id', membership.organization_id);
    if (!canManageClinicalRecords(membership)) query = query.eq('professional_id', req.user.id);
    const { data, error } = await query.maybeSingle();
    return error ? null : data;
  }
  app.get('/encounters', rateLimit, requireAuth, async (req, res) => {
    const membership = await appointmentScope(req,res); if (!membership) return;
    if (req.query.patient_id && !isUuid(req.query.patient_id)) return res.status(422).json({error:'Paciente inválido.'});
    let query = req.supabase.from('clinical_encounters').select(ENCOUNTER_FIELDS)
      .eq('organization_id', membership.organization_id).order('started_at',{ascending:false}).limit(100);
    if (!canManageClinicalRecords(membership)) query=query.eq('professional_id',req.user.id);
    if (req.query.patient_id) query=query.eq('patient_id',req.query.patient_id);
    const {data,error}=await query;
    if (error) return res.status(400).json({error:'Não foi possível consultar os atendimentos.'});
    return res.json({encounters:data??[]});
  });
  app.post('/encounters', rateLimit, requireAuth, async (req,res) => {
    const membership=await appointmentScope(req,res); if (!membership) return;
    const {patient_id,appointment_id}=req.body??{};
    if (!isUuid(patient_id) || (appointment_id!==undefined && appointment_id!==null && !isUuid(appointment_id)))
      return res.status(422).json({error:'Paciente ou agendamento inválido.'});
    const {data:patient,error:patientError}=await req.supabase.from('patients').select('id,professional_id')
      .eq('id',patient_id).eq('organization_id',membership.organization_id).maybeSingle();
    if (patientError || !patient) return res.status(404).json({error:'Paciente não encontrado.'});
    if (!canManageClinicalRecords(membership) && patient.professional_id !== req.user.id)
      return res.status(403).json({error:'Paciente atribuído a outro profissional.'});
    const professional_id=req.user.id;
    if (!(await verifyProfessionalMembership(req.supabase,membership.organization_id,professional_id)))
      return res.status(403).json({error:'Profissional sem autorização.'});
    if (appointment_id) {
      const {data:appointment,error}=await req.supabase.from('appointments').select('id')
        .eq('id',appointment_id).eq('organization_id',membership.organization_id)
        .eq('patient_id',patient_id).eq('professional_id',professional_id).maybeSingle();
      if (error || !appointment) return res.status(422).json({error:'Agendamento incompatível.'});
    }
    const {data,error}=await req.supabase.from('clinical_encounters').insert({
      organization_id:membership.organization_id,patient_id,professional_id,appointment_id:appointment_id??null
    }).select(ENCOUNTER_FIELDS).single();
    if (error?.code==='23505') return res.status(409).json({error:'Agendamento já possui atendimento.'});
    if (error) return res.status(400).json({error:'Não foi possível iniciar o atendimento.'});
    return res.status(201).json({encounter:data});
  });
  app.patch('/encounters/:id/complete',rateLimit,requireAuth,async(req,res)=>{
    const membership=await appointmentScope(req,res);if(!membership)return;
    const encounter=await getScopedEncounter(req,membership,req.params.id);
    if(!encounter)return res.status(404).json({error:'Atendimento não encontrado.'});
    if(encounter.status!=='in_progress')return res.status(409).json({error:'Atendimento já finalizado.'});
    const {data:drafts,error:draftError}=await req.supabase.from('clinical_evolutions').select('id')
      .eq('organization_id',membership.organization_id).eq('encounter_id',encounter.id)
      .eq('status','draft').limit(1);
    if(draftError)return res.status(400).json({error:'Não foi possível validar as evoluções pendentes.'});
    if((drafts??[]).length)return res.status(409).json({error:'Confirme ou exclua as evoluções em rascunho antes de finalizar.'});
    const {data,error}=await req.supabase.from('clinical_encounters').update({status:'completed'})
      .eq('id',encounter.id).eq('organization_id',membership.organization_id)
      .eq('status','in_progress').select(ENCOUNTER_FIELDS).maybeSingle();
    if(error?.code==='P0001')return res.status(409).json({error:'Atendimento alterado ou com evoluções pendentes.'});
    if(error)return res.status(400).json({error:'Não foi possível finalizar o atendimento.'});
    if(!data)return res.status(409).json({error:'Atendimento alterado simultaneamente.'});
    return res.json({encounter:data});
  });
  app.get('/encounters/:id/evolutions',rateLimit,requireAuth,async(req,res)=>{
    const membership=await appointmentScope(req,res);if(!membership)return;
    const encounter=await getScopedEncounter(req,membership,req.params.id);
    if(!encounter)return res.status(404).json({error:'Atendimento não encontrado.'});
    const {data,error}=await req.supabase.from('clinical_evolutions').select(EVOLUTION_FIELDS)
      .eq('organization_id',membership.organization_id).eq('encounter_id',encounter.id)
      .order('created_at',{ascending:true}).limit(100);
    if(error)return res.status(400).json({error:'Não foi possível consultar as evoluções.'});
    return res.json({evolutions:data??[]});
  });
  app.post('/encounters/:id/evolutions',rateLimit,requireAuth,async(req,res)=>{
    const membership=await appointmentScope(req,res);if(!membership)return;
    const encounter=await getScopedEncounter(req,membership,req.params.id);
    if(!encounter)return res.status(404).json({error:'Atendimento não encontrado.'});
    if(encounter.professional_id!==req.user.id)return res.status(403).json({error:'Profissional não autorizado.'});
    if(encounter.status!=='in_progress')return res.status(409).json({error:'Atendimento finalizado.'});
    const content=req.body?.content;
    if(typeof content!=='string'||content.trim().length<1||content.length>10000)
      return res.status(422).json({error:'Evolução deve conter entre 1 e 10000 caracteres.'});
    const {data,error}=await req.supabase.from('clinical_evolutions').insert({
      organization_id:membership.organization_id,encounter_id:encounter.id,author_id:req.user.id,content:content.trim()
    }).select(EVOLUTION_FIELDS).single();
    if(error)return res.status(400).json({error:'Não foi possível salvar a evolução.'});
    return res.status(201).json({evolution:data});
  });
  app.patch('/evolutions/:id',rateLimit,requireAuth,async(req,res)=>{
    const membership=await appointmentScope(req,res);if(!membership)return;
    if(!isUuid(req.params.id))return res.status(400).json({error:'Evolução inválida.'});
    const keys=Object.keys(req.body??{});
    if(keys.length!==1||keys[0]!=='content')return res.status(422).json({error:'Informe somente o conteúdo da evolução.'});
    const content=req.body.content;
    if(typeof content!=='string'||content.trim().length<1||content.length>10000)
      return res.status(422).json({error:'Evolução deve conter entre 1 e 10000 caracteres.'});
    const {data:existing,error:lookupError}=await req.supabase.from('clinical_evolutions').select(EVOLUTION_FIELDS)
      .eq('id',req.params.id).eq('organization_id',membership.organization_id).maybeSingle();
    if(lookupError||!existing)return res.status(404).json({error:'Evolução não encontrada.'});
    if(existing.author_id!==req.user.id)return res.status(403).json({error:'Autor não autorizado.'});
    if(existing.status!=='draft')return res.status(409).json({error:'Evolução já confirmada.'});
    const encounter=await getScopedEncounter(req,membership,existing.encounter_id);
    if(!encounter)return res.status(404).json({error:'Atendimento não encontrado.'});
    if(encounter.status!=='in_progress')return res.status(409).json({error:'Atendimento finalizado.'});
    const {data,error}=await req.supabase.from('clinical_evolutions').update({content:content.trim()})
      .eq('id',existing.id).eq('organization_id',membership.organization_id).eq('status','draft')
      .select(EVOLUTION_FIELDS).maybeSingle();
    if(error)return res.status(400).json({error:'Não foi possível atualizar a evolução.'});
    if(!data)return res.status(409).json({error:'Evolução alterada simultaneamente.'});
    return res.json({evolution:data});
  });
  app.patch('/evolutions/:id/confirm',rateLimit,requireAuth,async(req,res)=>{
    const membership=await appointmentScope(req,res);if(!membership)return;
    if(!isUuid(req.params.id))return res.status(400).json({error:'Evolução inválida.'});
    const {data:existing,error:lookupError}=await req.supabase.from('clinical_evolutions')
      .select(EVOLUTION_FIELDS).eq('id',req.params.id).eq('organization_id',membership.organization_id).maybeSingle();
    if(lookupError||!existing)return res.status(404).json({error:'Evolução não encontrada.'});
    if(existing.author_id!==req.user.id)return res.status(403).json({error:'Autor não autorizado.'});
    if(existing.status!=='draft')return res.status(409).json({error:'Evolução já confirmada.'});
    const encounter=await getScopedEncounter(req,membership,existing.encounter_id);
    if(!encounter)return res.status(404).json({error:'Atendimento não encontrado.'});
    if(encounter.status!=='in_progress')return res.status(409).json({error:'Atendimento finalizado.'});
    const {data,error}=await req.supabase.from('clinical_evolutions').update({
      status:'confirmed',confirmed_at:new Date().toISOString(),updated_at:new Date().toISOString()
    }).eq('id',existing.id).eq('organization_id',membership.organization_id)
      .eq('status','draft').select(EVOLUTION_FIELDS).maybeSingle();
    if(error)return res.status(400).json({error:'Não foi possível confirmar a evolução.'});
    if(!data)return res.status(409).json({error:'Evolução alterada simultaneamente.'});
    return res.json({evolution:data});
  });

  // S4.2: exercises and protocols are scoped to the authenticated organization.
  const EXERCISE_FIELDS = 'id,organization_id,encounter_id,title,instructions,created_at';
  const PROTOCOL_FIELDS = 'id,organization_id,title,description,created_at';
  const ENCOUNTER_PROTOCOL_FIELDS = 'organization_id,encounter_id,protocol_id';

  function validateExercise(body, partial = false) {
    const errors = {};
    if (!body || typeof body !== 'object' || Array.isArray(body)) return { body: 'Objeto obrigatório.' };
    if (!partial || body.title !== undefined) {
      if (typeof body.title !== 'string' || body.title.trim().length < 1) errors.title = 'Título obrigatório.';
      else if (body.title.trim().length > 200) errors.title = 'Título deve ter no máximo 200 caracteres.';
    }
    if (body.instructions !== undefined && body.instructions !== null
      && (typeof body.instructions !== 'string' || body.instructions.length > 4000)) {
      errors.instructions = 'Instruções inválidas ou excedem 4000 caracteres.';
    }
    return errors;
  }

  function validateProtocol(body, partial = false) {
    const errors = {};
    if (!body || typeof body !== 'object' || Array.isArray(body)) return { body: 'Objeto obrigatório.' };
    if (!partial || body.title !== undefined) {
      if (typeof body.title !== 'string' || body.title.trim().length < 1) errors.title = 'Título obrigatório.';
      else if (body.title.trim().length > 200) errors.title = 'Título deve ter no máximo 200 caracteres.';
    }
    if (body.description !== undefined && body.description !== null
      && (typeof body.description !== 'string' || body.description.length > 4000)) {
      errors.description = 'Descrição inválida ou excede 4000 caracteres.';
    }
    return errors;
  }

  function canManageProtocols(membership) {
    return membership.role === 'owner' || membership.role === 'coordinator';
  }

  async function getOwnedInProgressEncounter(req, res, membership, id) {
    const encounter = await getScopedEncounter(req, membership, id);
    if (!encounter) {
      res.status(404).json({ error: 'Atendimento não encontrado.' });
      return null;
    }
    if (encounter.professional_id !== req.user.id) {
      res.status(403).json({ error: 'Profissional não autorizado.' });
      return null;
    }
    if (encounter.status !== 'in_progress') {
      res.status(409).json({ error: 'Atendimento finalizado.' });
      return null;
    }
    return encounter;
  }

  app.get('/encounters/:id/exercises', rateLimit, requireAuth, async (req, res) => {
    const membership = await appointmentScope(req, res); if (!membership) return;
    const encounter = await getScopedEncounter(req, membership, req.params.id);
    if (!encounter) return res.status(404).json({ error: 'Atendimento não encontrado.' });
    const { data, error } = await req.supabase.from('clinical_exercises').select(EXERCISE_FIELDS)
      .eq('organization_id', membership.organization_id).eq('encounter_id', encounter.id)
      .order('created_at', { ascending: true }).limit(100);
    if (error) return res.status(400).json({ error: 'Não foi possível consultar os exercícios.' });
    return res.json({ exercises: data ?? [] });
  });

  app.post('/encounters/:id/exercises', rateLimit, requireAuth, async (req, res) => {
    const membership = await appointmentScope(req, res); if (!membership) return;
    const errors = validateExercise(req.body);
    if (Object.keys(errors).length) return res.status(422).json({ error: 'Dados inválidos.', fields: errors });
    const encounter = await getOwnedInProgressEncounter(req, res, membership, req.params.id);
    if (!encounter) return;
    const { data, error } = await req.supabase.from('clinical_exercises').insert({
      organization_id: membership.organization_id,
      encounter_id: encounter.id,
      title: req.body.title.trim(),
      instructions: typeof req.body.instructions === 'string' ? req.body.instructions.trim() || null : null,
    }).select(EXERCISE_FIELDS).single();
    if (error) return res.status(400).json({ error: 'Não foi possível registrar o exercício.' });
    return res.status(201).json({ exercise: data });
  });

  app.patch('/exercises/:id', rateLimit, requireAuth, async (req, res) => {
    const membership = await appointmentScope(req, res); if (!membership) return;
    if (!isUuid(req.params.id)) return res.status(400).json({ error: 'Exercício inválido.' });
    const keys = Object.keys(req.body ?? {});
    if (!keys.length || keys.some(key => !['title', 'instructions'].includes(key))) {
      return res.status(422).json({ error: 'Informe somente título e/ou instruções.' });
    }
    const errors = validateExercise(req.body, true);
    if (Object.keys(errors).length) return res.status(422).json({ error: 'Dados inválidos.', fields: errors });
    const { data: existing, error: lookupError } = await req.supabase.from('clinical_exercises').select(EXERCISE_FIELDS)
      .eq('id', req.params.id).eq('organization_id', membership.organization_id).maybeSingle();
    if (lookupError || !existing) return res.status(404).json({ error: 'Exercício não encontrado.' });
    const encounter = await getOwnedInProgressEncounter(req, res, membership, existing.encounter_id);
    if (!encounter) return;
    const patch = {};
    if (req.body.title !== undefined) patch.title = req.body.title.trim();
    if (req.body.instructions !== undefined) patch.instructions = typeof req.body.instructions === 'string' ? req.body.instructions.trim() || null : null;
    const { data, error } = await req.supabase.from('clinical_exercises').update(patch)
      .eq('id', existing.id).eq('organization_id', membership.organization_id).select(EXERCISE_FIELDS).maybeSingle();
    if (error) return res.status(400).json({ error: 'Não foi possível atualizar o exercício.' });
    if (!data) return res.status(409).json({ error: 'Exercício alterado simultaneamente.' });
    return res.json({ exercise: data });
  });

  app.delete('/exercises/:id', rateLimit, requireAuth, async (req, res) => {
    const membership = await appointmentScope(req, res); if (!membership) return;
    if (!isUuid(req.params.id)) return res.status(400).json({ error: 'Exercício inválido.' });
    const { data: existing, error: lookupError } = await req.supabase.from('clinical_exercises').select(EXERCISE_FIELDS)
      .eq('id', req.params.id).eq('organization_id', membership.organization_id).maybeSingle();
    if (lookupError || !existing) return res.status(404).json({ error: 'Exercício não encontrado.' });
    const encounter = await getOwnedInProgressEncounter(req, res, membership, existing.encounter_id);
    if (!encounter) return;
    const { data, error } = await req.supabase.from('clinical_exercises').delete()
      .eq('id', existing.id).eq('organization_id', membership.organization_id).select('id').maybeSingle();
    if (error) return res.status(400).json({ error: 'Não foi possível excluir o exercício.' });
    if (!data) return res.status(404).json({ error: 'Exercício não encontrado.' });
    return res.status(204).send();
  });

  app.get('/protocols', rateLimit, requireAuth, async (req, res) => {
    const membership = await appointmentScope(req, res); if (!membership) return;
    const { data, error } = await req.supabase.from('clinical_protocols').select(PROTOCOL_FIELDS)
      .eq('organization_id', membership.organization_id).order('title', { ascending: true }).limit(200);
    if (error) return res.status(400).json({ error: 'Não foi possível consultar os protocolos.' });
    return res.json({ protocols: data ?? [] });
  });

  app.post('/protocols', rateLimit, requireAuth, async (req, res) => {
    const membership = await appointmentScope(req, res); if (!membership) return;
    if (!canManageProtocols(membership)) return res.status(403).json({ error: 'Somente owner ou coordenador pode gerenciar protocolos.' });
    const errors = validateProtocol(req.body);
    if (Object.keys(errors).length) return res.status(422).json({ error: 'Dados inválidos.', fields: errors });
    const { data, error } = await req.supabase.from('clinical_protocols').insert({
      organization_id: membership.organization_id,
      title: req.body.title.trim(),
      description: typeof req.body.description === 'string' ? req.body.description.trim() || null : null,
    }).select(PROTOCOL_FIELDS).single();
    if (error) return res.status(400).json({ error: 'Não foi possível criar o protocolo.' });
    return res.status(201).json({ protocol: data });
  });

  app.patch('/protocols/:id', rateLimit, requireAuth, async (req, res) => {
    const membership = await appointmentScope(req, res); if (!membership) return;
    if (!canManageProtocols(membership)) return res.status(403).json({ error: 'Somente owner ou coordenador pode gerenciar protocolos.' });
    if (!isUuid(req.params.id)) return res.status(400).json({ error: 'Protocolo inválido.' });
    const keys = Object.keys(req.body ?? {});
    if (!keys.length || keys.some(key => !['title', 'description'].includes(key))) {
      return res.status(422).json({ error: 'Informe somente título e/ou descrição.' });
    }
    const errors = validateProtocol(req.body, true);
    if (Object.keys(errors).length) return res.status(422).json({ error: 'Dados inválidos.', fields: errors });
    const patch = {};
    if (req.body.title !== undefined) patch.title = req.body.title.trim();
    if (req.body.description !== undefined) patch.description = typeof req.body.description === 'string' ? req.body.description.trim() || null : null;
    const { data, error } = await req.supabase.from('clinical_protocols').update(patch)
      .eq('id', req.params.id).eq('organization_id', membership.organization_id).select(PROTOCOL_FIELDS).maybeSingle();
    if (error) return res.status(400).json({ error: 'Não foi possível atualizar o protocolo.' });
    if (!data) return res.status(404).json({ error: 'Protocolo não encontrado.' });
    return res.json({ protocol: data });
  });

  app.delete('/protocols/:id', rateLimit, requireAuth, async (req, res) => {
    const membership = await appointmentScope(req, res); if (!membership) return;
    if (!canManageProtocols(membership)) return res.status(403).json({ error: 'Somente owner ou coordenador pode gerenciar protocolos.' });
    if (!isUuid(req.params.id)) return res.status(400).json({ error: 'Protocolo inválido.' });
    const { data, error } = await req.supabase.from('clinical_protocols').delete()
      .eq('id', req.params.id).eq('organization_id', membership.organization_id).select('id').maybeSingle();
    if (error?.code === '23503') return res.status(409).json({ error: 'Protocolo associado a atendimentos.' });
    if (error) return res.status(400).json({ error: 'Não foi possível excluir o protocolo.' });
    if (!data) return res.status(404).json({ error: 'Protocolo não encontrado.' });
    return res.status(204).send();
  });

  app.get('/encounters/:id/protocols', rateLimit, requireAuth, async (req, res) => {
    const membership = await appointmentScope(req, res); if (!membership) return;
    const encounter = await getScopedEncounter(req, membership, req.params.id);
    if (!encounter) return res.status(404).json({ error: 'Atendimento não encontrado.' });
    const { data: links, error: linkError } = await req.supabase.from('clinical_encounter_protocols')
      .select(ENCOUNTER_PROTOCOL_FIELDS).eq('organization_id', membership.organization_id).eq('encounter_id', encounter.id);
    if (linkError) return res.status(400).json({ error: 'Não foi possível consultar os protocolos do atendimento.' });
    const protocolIds = (links ?? []).map(link => link.protocol_id);
    if (!protocolIds.length) return res.json({ protocols: [] });
    const { data, error } = await req.supabase.from('clinical_protocols').select(PROTOCOL_FIELDS)
      .eq('organization_id', membership.organization_id).in('id', protocolIds).order('title', { ascending: true });
    if (error) return res.status(400).json({ error: 'Não foi possível consultar os protocolos do atendimento.' });
    return res.json({ protocols: data ?? [] });
  });

  app.post('/encounters/:id/protocols', rateLimit, requireAuth, async (req, res) => {
    const membership = await appointmentScope(req, res); if (!membership) return;
    const protocolId = req.body?.protocol_id;
    if (!isUuid(protocolId)) return res.status(422).json({ error: 'Protocolo inválido.' });
    const encounter = await getOwnedInProgressEncounter(req, res, membership, req.params.id);
    if (!encounter) return;
    const { data: protocol, error: protocolError } = await req.supabase.from('clinical_protocols').select(PROTOCOL_FIELDS)
      .eq('id', protocolId).eq('organization_id', membership.organization_id).maybeSingle();
    if (protocolError || !protocol) return res.status(404).json({ error: 'Protocolo não encontrado.' });
    const { data, error } = await req.supabase.from('clinical_encounter_protocols').insert({
      organization_id: membership.organization_id, encounter_id: encounter.id, protocol_id: protocol.id,
    }).select(ENCOUNTER_PROTOCOL_FIELDS).single();
    if (error?.code === '23505') return res.status(409).json({ error: 'Protocolo já associado ao atendimento.' });
    if (error) return res.status(400).json({ error: 'Não foi possível associar o protocolo.' });
    return res.status(201).json({ association: data });
  });

  app.delete('/encounters/:id/protocols', rateLimit, requireAuth, async (req, res) => {
    const membership = await appointmentScope(req, res); if (!membership) return;
    const protocolId = req.body?.protocol_id;
    if (!isUuid(protocolId)) return res.status(422).json({ error: 'Protocolo inválido.' });
    const encounter = await getOwnedInProgressEncounter(req, res, membership, req.params.id);
    if (!encounter) return;
    const { data, error } = await req.supabase.from('clinical_encounter_protocols').delete()
      .eq('organization_id', membership.organization_id).eq('encounter_id', encounter.id)
      .eq('protocol_id', protocolId).select('protocol_id').maybeSingle();
    if (error) return res.status(400).json({ error: 'Não foi possível remover o protocolo do atendimento.' });
    if (!data) return res.status(404).json({ error: 'Vínculo de protocolo não encontrado.' });
    return res.status(204).send();
  });

  app.post('/chat', rateLimit, requireAuth, (req, res) => {
    const message = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
    if (!message) return res.status(400).json({ error: 'A mensagem é obrigatória.' });
    if (message.length > maxMessageLength) return res.status(422).json({ error: 'A mensagem deve ter no máximo ' + maxMessageLength + ' caracteres.' });
    res.json({ message: 'Demonstração FisioZap: recebi sua mensagem, profissional. A integração de IA ainda não está ativa.', mode: 'demo' });
  });

  app.use((err, _req, res, _next) => {
    if (err?.type === 'entity.too.large') return res.status(413).json({ error: 'Payload muito grande.' });
    console.error('backend_error', err?.message || 'unknown_error');
    return res.status(500).json({ error: 'Não foi possível concluir a solicitação.' });
  });

  return app;
}

const app = createApp();
if (process.env.NODE_ENV !== 'test') app.listen(port, () => console.log('FisioZap backend listening on http://localhost:' + port));
export default app;
