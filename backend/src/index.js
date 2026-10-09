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
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
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
    const supabase = supabaseClientFactory(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user) return res.status(401).json({ error: 'Sessão inválida ou expirada.' });
    req.user = data.user; req.supabase = supabase; return next();
  }

  async function getMembership(req) {
    const { data, error } = await req.supabase.from('organization_members').select('organization_id, role').eq('user_id', req.user.id).order('created_at', { ascending: true }).limit(1).maybeSingle();
    if (error || !data) return null;
    return data;
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
    if (!membership) return res.status(403).json({ error: 'Usuário sem organização autorizada.' });
    let query = req.supabase.from('patients').select(PATIENT_FIELDS.join(',')).order('full_name', { ascending: true });
    if (typeof req.query.search === 'string' && req.query.search.trim()) query = query.ilike('full_name', '%' + req.query.search.trim().slice(0,80) + '%');
    if (typeof req.query.status === 'string' && PATIENT_STATUSES.has(req.query.status)) query = query.eq('status', req.query.status);
    const { data, error } = await query;
    if (error) return res.status(400).json({ error: 'Não foi possível consultar os pacientes.' });
    return res.json({ patients: data ?? [] });
  });

  app.post('/patients', rateLimit, requireAuth, async (req, res) => {
    const membership = await getMembership(req);
    if (!membership) return res.status(403).json({ error: 'Usuário sem organização autorizada.' });
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
    if (!membership) return res.status(403).json({ error: 'Usuário sem organização autorizada.' });
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
    if (!membership) return res.status(403).json({ error: 'Usuário sem organização autorizada.' });
    if (!/^[0-9a-f-]{36}$/i.test(req.params.id)) return res.status(400).json({ error: 'Paciente inválido.' });
    const { data, error } = await req.supabase.from('patients').delete().eq('id', req.params.id).select('id').maybeSingle();
    if (error) return res.status(400).json({ error: 'Não foi possível excluir o paciente.' });
    if (!data) return res.status(404).json({ error: 'Paciente não encontrado ou sem permissão.' });
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
