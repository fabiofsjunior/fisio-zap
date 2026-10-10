import 'dotenv/config';
import express from 'express';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import {
  attachmentKind,
  attachmentNameMatchesMime,
  decodeSafeAttachmentName,
  matchesAttachmentSignature,
  MAX_CHAT_ATTACHMENT_BYTES,
  normalizeAttachmentMime,
} from './chat-attachment.js';
import { getTranscriptionConfig, MAX_TRANSCRIPTION_TEXT_CHARS, transcribeWithOpenAI } from './chat-transcription.js';

const port = Number(process.env.PORT || 3001);
const frontendOrigin = process.env.FRONTEND_ORIGIN || 'http://localhost:3000';
const maxMessageLength = 4000;
const windowMs = 60_000;
const maxRequestsPerWindow = 30;
const PATIENT_STATUSES = new Set(['active', 'inactive', 'discharged']);
const PATIENT_FIELDS = ['id','organization_id','professional_id','group_id','full_name','email','phone','birth_date','address','condition','treatment_goal','status','notes','started_at','created_at','updated_at'];
const FINANCE_ORG_ROLES = new Set(['owner', 'coordinator', 'administrative']);
const FINANCE_ROLES = new Set([...FINANCE_ORG_ROLES, 'professional']);
const MAX_FINANCIAL_AMOUNT_CENTS = 999_999_999_999;

function isCivilDate(value) {
  if (typeof value !== 'string') return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
  if (year < 1 || month < 1 || month > 12) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day >= 1 && day <= days[month - 1];
}

function monthRange(month) {
  if (typeof month !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return null;
  const year = Number(month.slice(0, 4));
  if (year < 1) return null;
  const monthNumber = Number(month.slice(5));
  const nextMonth = monthNumber === 12
    ? (year === 9999 ? null : `${String(year + 1).padStart(4, '0')}-01-01`)
    : `${month.slice(0, 5)}${String(monthNumber + 1).padStart(2, '0')}-01`;
  return { from: `${month}-01`, to: nextMonth };
}

function amountToCents(value) {
  const text = typeof value === 'number' ? value.toFixed(2) : String(value ?? '');
  const match = /^(\d{1,10})(?:\.(\d{1,2}))?$/.exec(text);
  if (!match) return null;
  const cents = Number(match[1]) * 100 + Number((match[2] || '').padEnd(2, '0') || 0);
  return Number.isSafeInteger(cents) && cents <= MAX_FINANCIAL_AMOUNT_CENTS ? cents : null;
}

function financialSummaryAmountToCents(value) {
  if (typeof value === 'number' && (!Number.isFinite(value) || value < 0)) return null;
  const text = String(value ?? '');
  if (!/^\d{1,10}(?:\.\d{1,2})?$/.test(text)) return null;
  const cents = amountToCents(text);
  return cents !== null && cents >= 1 ? cents : null;
}

function centsToAmount(cents) {
  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}`;
}

function formatCents(cents) {
  const negative = cents < 0;
  const absolute = BigInt(Math.abs(cents));
  const whole = absolute / 100n;
  const fraction = String(absolute % 100n).padStart(2, '0');
  return `${negative ? '-' : ''}R$ ${new Intl.NumberFormat('pt-BR').format(whole)},${fraction}`;
}

function normalizeAssistantMessage(message) {
  return message.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function rawHeaderValues(req, name) {
  const values = [];
  for (let index = 0; index < req.rawHeaders.length; index += 2) {
    if (req.rawHeaders[index].toLowerCase() === name) values.push(req.rawHeaders[index + 1]);
  }
  return values;
}

function isChatAttachmentPath(path) {
  return /^\/chat\/attachments\/?$/i.test(path);
}

function isChatTranscriptionPath(path) {
  return /^\/chat\/transcriptions\/?$/i.test(path);
}

function discardChatAttachmentBody(req) {
  if (Buffer.isBuffer(req.body)) req.body.fill(0);
  req.body = undefined;
}

function assistantIntent(message) {
  const normalized = normalizeAssistantMessage(message);
  if (/^(?:resumo financeiro(?: deste mes| do mes atual)?|como esta meu financeiro(?: este mes| no mes atual)?)[?.!]*$/.test(normalized)) {
    return 'financial_summary';
  }
  if ((/\b(agenda|atendimento|atendimentos|compromisso|compromissos)\b/.test(normalized) && /\bhoje\b/.test(normalized)) || /\bo que (eu )?tenho hoje\b/.test(normalized)) {
    return 'agenda_today';
  }
  if (/\b(pendencia|pendencias|tarefa|tarefas)\b/.test(normalized)) return 'own_pending_tasks';
  return 'unsupported';
}

function zonedCalendarParts(instant, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(instant);
  return Object.fromEntries(parts.filter(part => part.type !== 'literal').map(part => [part.type, Number(part.value)]));
}

function isValidLocalDayRange(range, timeZone, currentInstant) {
  if (!range || typeof range !== 'object' || Array.isArray(range) || Object.keys(range).length !== 2 || !range.from || !range.to) return false;
  if (typeof timeZone !== 'string' || timeZone.length > 100) return false;
  const now = currentInstant instanceof Date ? currentInstant : new Date(currentInstant);
  if (!Number.isFinite(now.getTime())) return false;
  if (typeof range.from !== 'string' || typeof range.to !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(range.from) || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(range.to)) return false;
  const from = new Date(range.from), to = new Date(range.to);
  if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime()) || from.toISOString() !== range.from || to.toISOString() !== range.to) return false;
  const duration = to.getTime() - from.getTime();
  if (duration < 22 * 60 * 60 * 1000 || duration > 26 * 60 * 60 * 1000) return false;
  try {
    const start = zonedCalendarParts(from, timeZone), end = zonedCalendarParts(to, timeZone), current = zonedCalendarParts(now, timeZone);
    const nextStartDay = new Date(Date.UTC(start.year, start.month - 1, start.day + 1)).toISOString().slice(0, 10);
    const endDay = `${String(end.year).padStart(4, '0')}-${String(end.month).padStart(2, '0')}-${String(end.day).padStart(2, '0')}`;
    const startDay = `${String(start.year).padStart(4, '0')}-${String(start.month).padStart(2, '0')}-${String(start.day).padStart(2, '0')}`;
    const currentDay = `${String(current.year).padStart(4, '0')}-${String(current.month).padStart(2, '0')}-${String(current.day).padStart(2, '0')}`;
    return start.hour === 0 && start.minute === 0 && start.second === 0
      && end.hour === 0 && end.minute === 0 && end.second === 0
      && nextStartDay === endDay && startDay === currentDay;
  } catch {
    return false;
  }
}

function sanitizeFinancialEntry(entry) {
  return {
    id: entry.id,
    patient_id: entry.patient_id ?? null,
    kind: entry.kind ?? entry.entry_type,
    amount_cents: amountToCents(entry.amount),
    description: entry.description,
    occurred_at: entry.occurred_at,
    due_date: entry.due_date ?? null,
    paid_at: entry.paid_at ?? null,
  };
}

export function createApp({ supabaseClientFactory = createClient, now = () => new Date(), transcriptionProvider = transcribeWithOpenAI, transcriptionConfig = getTranscriptionConfig, transcriptionNow = () => Date.now() } = {}) {
  const app = express();
  const rateBuckets = new Map();
  const transcriptionQuotaBuckets = new Map();
  let activeTranscriptions = 0;
  const maxActiveTranscriptions = 2;
  const jsonBodyParser = express.json({ limit: '64kb' });
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    if (req.method === 'POST' && (isChatAttachmentPath(req.path) || isChatTranscriptionPath(req.path))) return next();
    return jsonBodyParser(req, res, next);
  });

  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin === frontendOrigin) { res.setHeader('Access-Control-Allow-Origin', origin); res.setHeader('Vary', 'Origin'); }
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-FisioZap-Organization-Id, X-FisioZap-File-Name, X-Transcription-Consent');
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
      .select('organization_id, role').eq('user_id', req.user.id).order('created_at', { ascending: true });
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
  const FINANCIAL_ENTRY_FIELDS = 'id,organization_id,professional_id,patient_id,kind,entry_type,amount,description,occurred_at,due_date,paid_at';
  async function financeScope(req, res) {
    const membership = await appointmentScope(req, res);
    if (!membership) return null;
    if (!FINANCE_ROLES.has(membership.role)) {
      res.status(403).json({ error: 'Perfil sem acesso ao financeiro.' });
      return null;
    }
    return membership;
  }
  function scopeFinancialEntries(query, membership, userId) {
    let scoped = query.eq('organization_id', membership.organization_id);
    if (!FINANCE_ORG_ROLES.has(membership.role)) scoped = scoped.eq('professional_id', userId);
    return scoped;
  }
  async function findVisibleFinancePatient(req, membership, patientId) {
    let query = req.supabase.from('patients').select('id')
      .eq('id', patientId).eq('organization_id', membership.organization_id);
    if (!['owner', 'coordinator'].includes(membership.role)) query = query.eq('professional_id', req.user.id);
    const { data, error } = await query.maybeSingle();
    return !error && Boolean(data);
  }
  app.get('/financial-entries/patient-options', rateLimit, requireAuth, async (req, res) => {
    const membership = await financeScope(req, res); if (!membership) return;
    let query = req.supabase.from('patients').select('id,full_name')
      .eq('organization_id', membership.organization_id).order('full_name', { ascending: true }).limit(500);
    if (!['owner', 'coordinator'].includes(membership.role)) query = query.eq('professional_id', req.user.id);
    const { data, error } = await query;
    if (error) return res.status(400).json({ error: 'Não foi possível consultar os pacientes disponíveis.' });
    return res.json({ patients: (data ?? []).map(({ id, full_name }) => ({ id, full_name })) });
  });
  app.get('/financial-entries', rateLimit, requireAuth, async (req, res) => {
    const membership = await financeScope(req, res); if (!membership) return;
    const range = monthRange(req.query.month);
    if (!range) return res.status(422).json({ error: 'Informe um mês válido no formato AAAA-MM.' });

    const pageSize = 500;
    const rows = [];
    for (let offset = 0; ; offset += pageSize) {
      let query = scopeFinancialEntries(req.supabase.from('financial_entries').select(FINANCIAL_ENTRY_FIELDS), membership, req.user.id)
        .gte('occurred_at', range.from).order('occurred_at', { ascending: false }).order('created_at', { ascending: false })
        .range(offset, offset + pageSize - 1);
      if (range.to) query = query.lt('occurred_at', range.to);
      const { data, error } = await query;
      if (error) return res.status(400).json({ error: 'Não foi possível consultar os lançamentos.' });
      rows.push(...(data ?? []));
      if ((data ?? []).length < pageSize) break;
    }

    const summary = {
      income: { paid_cents: 0, pending_cents: 0 },
      expense: { paid_cents: 0, pending_cents: 0 },
    };
    for (const row of rows) {
      const kind = row.kind ?? row.entry_type;
      const cents = amountToCents(row.amount);
      if (!summary[kind] || cents === null) return res.status(500).json({ error: 'Há um lançamento inválido no período.' });
      const key = row.paid_at ? 'paid_cents' : 'pending_cents';
      const total = summary[kind][key] + cents;
      if (!Number.isSafeInteger(total)) return res.status(413).json({ error: 'O período contém valores demais para totalização segura.' });
      summary[kind][key] = total;
    }
    return res.json({ month: req.query.month, entries: rows.map(sanitizeFinancialEntry), summary });
  });
  app.post('/financial-entries', rateLimit, requireAuth, async (req, res) => {
    const membership = await financeScope(req, res); if (!membership) return;
    const body = req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body)) return res.status(422).json({ error: 'Dados inválidos.' });
    const allowed = new Set(['kind', 'amount_cents', 'description', 'occurred_at', 'due_date', 'patient_id', 'paid']);
    const fields = {};
    for (const key of Object.keys(body)) if (!allowed.has(key)) fields[key] = 'Campo gerenciado pelo sistema ou não permitido.';
    if (!['income', 'expense'].includes(body.kind)) fields.kind = 'Tipo inválido.';
    if (!Number.isSafeInteger(body.amount_cents) || body.amount_cents < 1 || body.amount_cents > MAX_FINANCIAL_AMOUNT_CENTS) fields.amount_cents = 'Informe um valor positivo com até duas casas decimais.';
    if (typeof body.description !== 'string' || body.description.trim().length < 2 || body.description.trim().length > 120) fields.description = 'A descrição deve ter entre 2 e 120 caracteres.';
    if (!isCivilDate(body.occurred_at)) fields.occurred_at = 'Data inválida.';
    if (body.due_date !== undefined && body.due_date !== null && !isCivilDate(body.due_date)) fields.due_date = 'Vencimento inválido.';
    if (body.patient_id !== undefined && body.patient_id !== null && body.patient_id !== '' && !isUuid(body.patient_id)) fields.patient_id = 'Paciente inválido.';
    if (body.paid !== undefined && typeof body.paid !== 'boolean') fields.paid = 'Informe se o lançamento foi pago.';
    if (Object.keys(fields).length) return res.status(422).json({ error: 'Dados inválidos.', fields });

    const patientId = body.patient_id || null;
    if (patientId && !(await findVisibleFinancePatient(req, membership, patientId))) {
      return res.status(422).json({ error: 'Paciente indisponível para associação.' });
    }
    const kind = body.kind;
    const { data, error } = await req.supabase.from('financial_entries').insert({
      organization_id: membership.organization_id,
      professional_id: req.user.id,
      patient_id: patientId,
      kind,
      entry_type: kind,
      amount: centsToAmount(body.amount_cents),
      description: body.description.trim(),
      occurred_at: body.occurred_at,
      due_date: body.due_date || null,
      paid_at: body.paid ? new Date().toISOString() : null,
    }).select(FINANCIAL_ENTRY_FIELDS).single();
    if (error) return res.status(400).json({ error: 'Não foi possível criar o lançamento.' });
    return res.status(201).json({ entry: sanitizeFinancialEntry(data) });
  });
  app.patch('/financial-entries/:id/payment', rateLimit, requireAuth, async (req, res) => {
    const membership = await financeScope(req, res); if (!membership) return;
    if (!isUuid(req.params.id)) return res.status(400).json({ error: 'Lançamento inválido.' });
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body) || Object.keys(req.body).length !== 1 || typeof req.body.paid !== 'boolean') {
      return res.status(422).json({ error: 'Informe somente o estado pago/pendente.' });
    }
    let existingQuery = req.supabase.from('financial_entries').select(FINANCIAL_ENTRY_FIELDS)
      .eq('id', req.params.id).eq('organization_id', membership.organization_id);
    if (!FINANCE_ORG_ROLES.has(membership.role)) existingQuery = existingQuery.eq('professional_id', req.user.id);
    const { data: existing, error: lookupError } = await existingQuery.maybeSingle();
    if (lookupError || !existing) return res.status(404).json({ error: 'Lançamento não encontrado.' });
    if (Boolean(existing.paid_at) === req.body.paid) return res.json({ entry: sanitizeFinancialEntry(existing) });

    let updateQuery = req.supabase.from('financial_entries')
      .update({ paid_at: req.body.paid ? new Date().toISOString() : null })
      .eq('id', req.params.id).eq('organization_id', membership.organization_id);
    if (!FINANCE_ORG_ROLES.has(membership.role)) updateQuery = updateQuery.eq('professional_id', req.user.id);
    const { data, error } = await updateQuery.select(FINANCIAL_ENTRY_FIELDS).maybeSingle();
    if (error) return res.status(400).json({ error: 'Não foi possível atualizar o pagamento.' });
    if (!data) return res.status(404).json({ error: 'Lançamento não encontrado.' });
    return res.json({ entry: sanitizeFinancialEntry(data) });
  });
  const NOTIFICATION_FIELDS = 'id,organization_id,user_id,title,priority,status,message,action_type,action_data,read_at,completed_at,created_at';
  const NOTIFICATION_STATUSES = new Set(['unread','read','completed','dismissed']);
  const NOTIFICATION_PRIORITIES = new Set(['urgent','attention','informational']);
  function isValidNotificationDueAt(value) {
    if (typeof value !== 'string') return false;
    const match = /^(\d{4})-(\d{2})-(\d{2})T([01]\d|2[0-3]):([0-5]\d):([0-5]\d)(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.exec(value);
    if (!match || !Number.isFinite(Date.parse(value))) return false;
    const [, yearText, monthText, dayText] = match;
    const year = Number(yearText), month = Number(monthText), day = Number(dayText);
    if (year < 1 || month < 1 || month > 12) return false;
    const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    const daysByMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    return day >= 1 && day <= daysByMonth[month - 1];
  }
  function validateNotification(body, partial = false) {
    const errors = {};
    if (!body || typeof body !== 'object' || Array.isArray(body)) return { body: 'Objeto obrigatório.' };
    for (const key of ['organization_id','user_id','professional_id','patient_id','id','action_data','action_type']) {
      if (Object.hasOwn(body, key)) errors[key] = 'Campo gerenciado pelo sistema.';
    }
    if (!partial || body.title !== undefined) {
      if (typeof body.title !== 'string' || body.title.trim().length < 2) errors.title = 'Informe um título com pelo menos 2 caracteres.';
      else if (body.title.trim().length > 120) errors.title = 'O título deve ter no máximo 120 caracteres.';
    }
    if (!partial || body.message !== undefined) {
      if (body.message !== undefined && body.message !== null && (typeof body.message !== 'string' || body.message.trim().length > 1000)) errors.message = 'A mensagem deve ter no máximo 1000 caracteres.';
    }
    if (body.priority !== undefined && !NOTIFICATION_PRIORITIES.has(body.priority)) errors.priority = 'Prioridade inválida.';
    if (body.due_at !== undefined && body.due_at !== null && body.due_at !== '') {
      if (!isValidNotificationDueAt(body.due_at)) errors.due_at = 'Vencimento deve ser uma data/hora válida com fuso horário.';
    }
    return errors;
  }
  app.get('/notifications', rateLimit, requireAuth, async (req, res) => {
    const membership = await appointmentScope(req, res); if (!membership) return;
    if (req.query.status && !NOTIFICATION_STATUSES.has(req.query.status)) return res.status(422).json({ error: 'Status inválido.' });
    if (req.query.priority && !NOTIFICATION_PRIORITIES.has(req.query.priority)) return res.status(422).json({ error: 'Prioridade inválida.' });
    let query = req.supabase.from('notifications').select(NOTIFICATION_FIELDS)
      .eq('organization_id', membership.organization_id).eq('user_id', req.user.id)
      .eq('action_type', 'manual_task')
      .order('created_at', { ascending: false }).limit(100);
    if (req.query.status) query = query.eq('status', req.query.status);
    if (req.query.priority) query = query.eq('priority', req.query.priority);
    const { data, error } = await query;
    if (error) return res.status(400).json({ error: 'Não foi possível consultar as tarefas.' });
    return res.json({ notifications: data ?? [] });
  });
  app.get('/notifications/upcoming-appointments', rateLimit, requireAuth, async (req, res) => {
    const membership = await appointmentScope(req, res); if (!membership) return;
    const now = new Date();
    const within24Hours = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const { data, error } = await req.supabase.from('appointments')
      .select('id,starts_at,status')
      .eq('organization_id', membership.organization_id).eq('professional_id', req.user.id)
      .in('status', ['scheduled','confirmed','rescheduled'])
      .gte('starts_at', now.toISOString()).lt('starts_at', within24Hours.toISOString())
      .order('starts_at', { ascending: true }).limit(20);
    if (error) return res.status(400).json({ error: 'Não foi possível consultar os próximos atendimentos.' });
    const appointments = (data ?? []).map(({ id, starts_at, status }) => ({ id, starts_at, status }));
    return res.json({ appointments });
  });
  app.post('/notifications', rateLimit, requireAuth, async (req, res) => {
    const membership = await appointmentScope(req, res); if (!membership) return;
    const errors = validateNotification(req.body);
    if (Object.keys(errors).length) return res.status(422).json({ error: 'Dados inválidos.', fields: errors });
    const title = req.body.title.trim();
    const message = typeof req.body.message === 'string' ? req.body.message.trim() : '';
    const dueAt = req.body.due_at ? new Date(req.body.due_at).toISOString() : null;
    const payload = {
      organization_id: membership.organization_id,
      professional_id: req.user.id,
      user_id: req.user.id,
      patient_id: null,
      type: 'task',
      title,
      body: message || title,
      message: message || null,
      priority: req.body.priority || 'informational',
      status: 'unread',
      action_type: 'manual_task',
      action_data: dueAt ? { due_at: dueAt } : {},
    };
    const { data, error } = await req.supabase.from('notifications').insert(payload).select(NOTIFICATION_FIELDS).single();
    if (error) return res.status(400).json({ error: 'Não foi possível criar a tarefa.' });
    return res.status(201).json({ notification: data });
  });
  app.patch('/notifications/:id', rateLimit, requireAuth, async (req, res) => {
    const membership = await appointmentScope(req, res); if (!membership) return;
    if (!isUuid(req.params.id)) return res.status(400).json({ error: 'Tarefa inválida.' });
    const errors = validateNotification(req.body, true);
    if (req.body?.status !== undefined && !NOTIFICATION_STATUSES.has(req.body.status)) errors.status = 'Status inválido.';
    if (Object.keys(errors).length) return res.status(422).json({ error: 'Dados inválidos.', fields: errors });
    const allowed = ['title','message','priority','due_at','status'];
    if (!allowed.some(key => req.body?.[key] !== undefined)) return res.status(422).json({ error: 'Nenhuma alteração permitida.' });
    const { data: existing, error: lookupError } = await req.supabase.from('notifications').select(NOTIFICATION_FIELDS)
      .eq('id', req.params.id).eq('organization_id', membership.organization_id).eq('user_id', req.user.id)
      .eq('action_type', 'manual_task').maybeSingle();
    if (lookupError || !existing) return res.status(404).json({ error: 'Tarefa não encontrada.' });
    if (['completed','dismissed'].includes(existing.status) && req.body.status && req.body.status !== existing.status) return res.status(409).json({ error: 'Tarefa concluída ou descartada não pode ser reaberta.' });
    const patch = {};
    if (req.body.title !== undefined) patch.title = req.body.title.trim();
    if (req.body.message !== undefined) {
      patch.message = req.body.message?.trim() || null;
      patch.body = patch.message || existing.title;
    }
    if (req.body.priority !== undefined) patch.priority = req.body.priority;
    if (req.body.due_at !== undefined) {
      const actionData = { ...(existing.action_data ?? {}) };
      if (req.body.due_at) actionData.due_at = new Date(req.body.due_at).toISOString(); else delete actionData.due_at;
      patch.action_data = actionData;
    }
    if (req.body.status !== undefined) {
      patch.status = req.body.status;
      if (req.body.status === 'read') patch.read_at = existing.read_at || new Date().toISOString();
      if (req.body.status === 'unread') patch.read_at = null;
      if (req.body.status === 'completed') patch.completed_at = new Date().toISOString();
      if (req.body.status !== 'completed') patch.completed_at = null;
    }
    const { data, error } = await req.supabase.from('notifications').update(patch)
      .eq('id', req.params.id).eq('organization_id', membership.organization_id).eq('user_id', req.user.id).eq('action_type', 'manual_task')
      .select(NOTIFICATION_FIELDS).maybeSingle();
    if (error) return res.status(400).json({ error: 'Não foi possível atualizar a tarefa.' });
    if (!data) return res.status(404).json({ error: 'Tarefa não encontrada.' });
    return res.json({ notification: data });
  });
  app.delete('/notifications/:id', rateLimit, requireAuth, async (req, res) => {
    const membership = await appointmentScope(req, res); if (!membership) return;
    if (!isUuid(req.params.id)) return res.status(400).json({ error: 'Tarefa inválida.' });
    const { data, error } = await req.supabase.from('notifications').delete()
      .eq('id', req.params.id).eq('organization_id', membership.organization_id).eq('user_id', req.user.id).eq('action_type', 'manual_task')
      .select('id').maybeSingle();
    if (error) return res.status(400).json({ error: 'Não foi possível excluir a tarefa.' });
    if (!data) return res.status(404).json({ error: 'Tarefa não encontrada.' });
    return res.status(204).send();
  });
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

  app.post('/chat/attachments', rateLimit, requireAuth, async (req, res, next) => {
    const membership = await appointmentScope(req, res);
    if (!membership) return;
    return next();
  }, express.raw({ type: () => true, limit: MAX_CHAT_ATTACHMENT_BYTES, inflate: false }), (req, res) => {
    const bytes = req.body;
    const discardBytes = () => discardChatAttachmentBody(req);
    if (!Buffer.isBuffer(bytes) || bytes.length === 0) {
      discardBytes();
      return res.status(400).json({ error: 'O arquivo está vazio ou inválido.' });
    }
    const contentTypes = rawHeaderValues(req, 'content-type');
    const encodedNames = rawHeaderValues(req, 'x-fisiozap-file-name');
    if (contentTypes.length !== 1 || encodedNames.length !== 1) {
      discardBytes();
      return res.status(400).json({ error: 'Cabeçalhos do arquivo inválidos.' });
    }
    const mime = normalizeAttachmentMime(contentTypes[0]);
    if (!mime) {
      discardBytes();
      return res.status(415).json({ error: 'Tipo de arquivo não aceito.' });
    }
    const name = decodeSafeAttachmentName(encodedNames[0]);
    if (!name) {
      discardBytes();
      return res.status(422).json({ error: 'Nome de arquivo inválido.' });
    }
    if (!attachmentNameMatchesMime(name, mime)) {
      discardBytes();
      return res.status(422).json({ error: 'O nome do arquivo não corresponde ao tipo informado.' });
    }
    if (!matchesAttachmentSignature(mime, bytes)) {
      discardBytes();
      return res.status(422).json({ error: 'O conteúdo não corresponde ao tipo de arquivo informado.' });
    }
    const attachment = {
      id: randomUUID(),
      name,
      size: bytes.length,
      mime,
      kind: attachmentKind(mime),
    };
    discardBytes();
    return res.json({
      message: 'Arquivo/Áudio recebido nesta sessão. Nenhuma transcrição ou análise foi realizada.',
      mode: 'attachment_receipt',
      attachment,
    });
  });

  function releaseTranscriptionSlot(req) {
    if (req.transcriptionUploadDeadline) {
      clearTimeout(req.transcriptionUploadDeadline);
      req.transcriptionUploadDeadline = null;
    }
    req.setTimeout?.(0);
    if (req.transcriptionSlotHeld) {
      req.transcriptionSlotHeld = false;
      activeTranscriptions = Math.max(0, activeTranscriptions - 1);
    }
  }

  function consumeTranscriptionQuota(req) {
    const current = transcriptionNow();
    for (const [key, bucket] of transcriptionQuotaBuckets) {
      if (current - bucket.startedAt >= 60_000) transcriptionQuotaBuckets.delete(key);
    }
    const key = `${req.user.id}:${req.transcriptionOrganizationId}`;
    const bucket = transcriptionQuotaBuckets.get(key);
    if (!bucket || current - bucket.startedAt >= 60_000) {
      if (transcriptionQuotaBuckets.size >= 10_000) return false;
      transcriptionQuotaBuckets.set(key, { startedAt: current, count: 1 });
      return true;
    }
    if (bucket.count >= 3) return false;
    bucket.count += 1;
    return true;
  }

  app.get('/chat/transcription-status', rateLimit, requireAuth, async (req, res) => {
    const membership = await appointmentScope(req, res);
    if (!membership) return;
    const config = transcriptionConfig();
    return res.json({ enabled: Boolean(config?.enabled) });
  });

  app.post('/chat/transcriptions', rateLimit, requireAuth, async (req, res, next) => {
    const membership = await appointmentScope(req, res);
    if (!membership) return;
    const config = transcriptionConfig();
    if (activeTranscriptions >= maxActiveTranscriptions) {
      return res.status(429).json({ error: 'Muitas transcrições em andamento. Tente novamente em instantes.' });
    }
    activeTranscriptions += 1;
    req.transcriptionSlotHeld = true;
    req.transcriptionConfig = config;
    req.transcriptionOrganizationId = membership.organization_id;
    req.transcriptionAbortController = new AbortController();
    req.once('aborted', () => {
      req.transcriptionAbortController?.abort();
      releaseTranscriptionSlot(req);
    });
    res.once('close', () => {
      if (!res.writableEnded) req.transcriptionAbortController?.abort();
    });
    req.setTimeout(30_000, () => {
      req.transcriptionAbortController?.abort();
      releaseTranscriptionSlot(req);
      req.destroy();
    });
    req.transcriptionUploadDeadline = setTimeout(() => {
      req.transcriptionAbortController?.abort();
      releaseTranscriptionSlot(req);
      req.destroy();
    }, 60_000);
    return next();
  }, express.raw({ type: () => true, limit: MAX_CHAT_ATTACHMENT_BYTES, inflate: false }), async (req, res) => {
    if (req.transcriptionUploadDeadline) {
      clearTimeout(req.transcriptionUploadDeadline);
      req.transcriptionUploadDeadline = null;
    }
    req.setTimeout(0);
    const bytes = req.body;
    const reject = (status, message) => {
      discardChatAttachmentBody(req);
      releaseTranscriptionSlot(req);
      return res.status(status).json({ error: message });
    };
    try {
      const consentHeaders = rawHeaderValues(req, 'x-transcription-consent');
      if (consentHeaders.length !== 1 || consentHeaders[0].trim().toLowerCase() !== 'true') {
        return reject(422, 'Confirme o consentimento para transcrever este áudio.');
      }
      const { enabled, apiKey, model } = req.transcriptionConfig ?? {};
      if (!enabled || !apiKey || !model) return reject(503, 'A transcrição está indisponível no momento.');
      if (!Buffer.isBuffer(bytes) || bytes.length === 0) return reject(400, 'O áudio está vazio ou inválido.');
      const contentTypes = rawHeaderValues(req, 'content-type');
      const encodedNames = rawHeaderValues(req, 'x-fisiozap-file-name');
      if (contentTypes.length !== 1 || encodedNames.length !== 1) return reject(400, 'Cabeçalhos do áudio inválidos.');
      const mime = normalizeAttachmentMime(contentTypes[0]);
      if (!mime || attachmentKind(mime) !== 'audio') return reject(415, 'Tipo de áudio não aceito.');
      const name = decodeSafeAttachmentName(encodedNames[0]);
      if (!name) return reject(422, 'Nome de arquivo inválido.');
      if (!attachmentNameMatchesMime(name, mime)) return reject(422, 'O nome do arquivo não corresponde ao tipo informado.');
      if (!matchesAttachmentSignature(mime, bytes)) return reject(422, 'O conteúdo não corresponde ao tipo de áudio informado.');
      if (!consumeTranscriptionQuota(req)) return reject(429, 'Limite de três transcrições por minuto atingido. Tente novamente mais tarde.');

      const extension = name.split('.').at(-1).toLowerCase();
      const safeProviderFilename = `audio.${extension}`;
      const text = await transcriptionProvider({ bytes, mime, filename: safeProviderFilename, apiKey, model, signal: req.transcriptionAbortController?.signal });
      if (typeof text !== 'string' || !text.trim() || text.length > MAX_TRANSCRIPTION_TEXT_CHARS) {
        return reject(502, 'Não foi possível concluir a transcrição do áudio.');
      }
      discardChatAttachmentBody(req);
      return res.json({ text, mode: 'transcription' });
    } catch {
      discardChatAttachmentBody(req);
      return res.status(502).json({ error: 'Não foi possível concluir a transcrição do áudio.' });
    } finally {
      releaseTranscriptionSlot(req);
    }
  });

  app.post('/chat', rateLimit, requireAuth, async (req, res) => {
    const message = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
    if (!message) return res.status(400).json({ error: 'A mensagem é obrigatória.' });
    if (message.length > maxMessageLength) return res.status(422).json({ error: 'A mensagem deve ter no máximo ' + maxMessageLength + ' caracteres.' });
    const membership = await appointmentScope(req, res); if (!membership) return;
    const intent = assistantIntent(message);

    if (intent === 'agenda_today') {
      const { today_range: dayRange, timezone } = req.body ?? {};
      const requestNow = now();
      if (!isValidLocalDayRange(dayRange, timezone, requestNow)) return res.status(422).json({ error: 'Informe o intervalo do dia atual no fuso horário selecionado.' });
      const { data, error } = await req.supabase.from('appointments').select('starts_at,status')
        .eq('organization_id', membership.organization_id).eq('professional_id', req.user.id)
        .in('status', ['scheduled', 'confirmed', 'rescheduled'])
        .gte('starts_at', dayRange.from).lt('starts_at', dayRange.to)
        .order('starts_at', { ascending: true }).limit(20);
      if (error) return res.status(400).json({ error: 'Não foi possível consultar sua agenda.' });
      const appointments = data ?? [];
      if (!appointments.length) return res.json({
        message: 'Você não tem atendimentos previstos para hoje.', mode: 'read_only', intent,
      });
      const formatter = new Intl.DateTimeFormat('pt-BR', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
      const times = appointments.map(appointment => formatter.format(new Date(appointment.starts_at)));
      const count = appointments.length >= 20 ? 'pelo menos 20' : String(appointments.length);
      const noun = appointments.length === 1 ? 'atendimento' : 'atendimentos';
      const timeSummary = appointments.length >= 20 ? ` Horários listados: ${times.join(', ')}.` : ` Às ${times.join(', ')}.`;
      return res.json({ message: `Você tem ${count} ${noun} previstos para hoje.${timeSummary}`, mode: 'read_only', intent });
    }

    if (intent === 'own_pending_tasks') {
      const { data, error } = await req.supabase.from('notifications').select('id')
        .eq('organization_id', membership.organization_id).eq('user_id', req.user.id).eq('action_type', 'manual_task')
        .in('status', ['unread', 'read']).limit(100);
      if (error) return res.status(400).json({ error: 'Não foi possível consultar suas pendências.' });
      const count = data?.length ?? 0;
      const countLabel = count === 100 ? 'pelo menos 100' : String(count);
      const noun = count === 1 ? 'pendência própria em aberto' : 'pendências próprias em aberto';
      return res.json({ message: count ? `Você tem ${countLabel} ${noun}.` : 'Você não tem pendências próprias em aberto.', mode: 'read_only', intent });
    }

    if (intent === 'financial_summary') {
      if (!FINANCE_ROLES.has(membership.role)) return res.status(403).json({ error: 'Perfil sem acesso ao financeiro.' });
      const range = monthRange(req.body?.month);
      if (!range?.to) return res.status(422).json({ error: 'Informe um mês válido no formato AAAA-MM.' });
      let query = req.supabase.from('financial_entries').select('kind,entry_type,amount,paid_at', { count: 'exact' })
        .eq('organization_id', membership.organization_id)
        .gte('occurred_at', range.from).lt('occurred_at', range.to);
      const organizationScope = FINANCE_ORG_ROLES.has(membership.role);
      if (!organizationScope) query = query.eq('professional_id', req.user.id);
      const { data, error, count } = await query.limit(1000);
      if (error) return res.status(400).json({ error: 'Não foi possível consultar o resumo financeiro.' });
      const entries = data ?? [];
      if (!Number.isSafeInteger(count)) return res.status(400).json({ error: 'Não foi possível consultar o resumo financeiro.' });
      if (count !== entries.length || count >= 1000) {
        return res.status(413).json({ error: 'O período tem muitos lançamentos para um resumo exato. Consulte os lançamentos no módulo Financeiro.' });
      }

      const totals = { income: { paid: 0, pending: 0 }, expense: { paid: 0, pending: 0 } };
      for (const entry of entries) {
        const kind = entry.kind ?? entry.entry_type;
        const cents = financialSummaryAmountToCents(entry.amount);
        if (!['income', 'expense'].includes(kind) || cents === null) return res.status(500).json({ error: 'Não foi possível totalizar os lançamentos com segurança.' });
        const status = entry.paid_at ? 'paid' : 'pending';
        const sum = totals[kind][status] + cents;
        if (!Number.isSafeInteger(sum)) return res.status(413).json({ error: 'Os valores do período excedem o limite para um resumo exato. Consulte o módulo financeiro.' });
        totals[kind][status] = sum;
      }
      const balance = totals.income.paid - totals.expense.paid;
      if (!Number.isSafeInteger(balance)) return res.status(413).json({ error: 'Os valores do período excedem o limite para um resumo exato. Consulte o módulo financeiro.' });
      const monthLabel = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' })
        .format(new Date(`${req.body.month}-01T00:00:00.000Z`));
      const scope = organizationScope ? 'da organização ativa' : 'seus lançamentos';
      const message = `Resumo financeiro de ${monthLabel} (${scope}): receitas pagas ${formatCents(totals.income.paid)}, receitas pendentes ${formatCents(totals.income.pending)}, despesas pagas ${formatCents(totals.expense.paid)}, despesas pendentes ${formatCents(totals.expense.pending)}. Saldo realizado: ${formatCents(balance)}.`;
      return res.json({ message, mode: 'read_only', intent });
    }

    return res.json({
      message: 'Por enquanto posso consultar sua agenda de hoje, contar suas pendências próprias ou resumir seu financeiro do mês informado. Não consulto informações clínicas nem executo ações.',
      mode: 'read_only', intent,
    });
  });

  app.use((err, req, res, _next) => {
    if (isChatTranscriptionPath(req.path)) {
      discardChatAttachmentBody(req);
      releaseTranscriptionSlot(req);
      if (err?.type === 'entity.too.large') return res.status(413).json({ error: 'Áudio excede o limite de 10 MiB.' });
      if (err?.type === 'encoding.unsupported') return res.status(415).json({ error: 'Codificação do áudio não aceita.' });
      if (['entity.parse.failed', 'request.aborted', 'request.size.invalid'].includes(err?.type)) {
        return res.status(400).json({ error: 'O corpo binário do áudio é inválido.' });
      }
      return res.status(500).json({ error: 'Não foi possível receber o áudio.' });
    }
    if (isChatAttachmentPath(req.path)) {
      discardChatAttachmentBody(req);
      if (err?.type === 'entity.too.large') return res.status(413).json({ error: 'Arquivo excede o limite de 10 MiB.' });
      if (err?.type === 'encoding.unsupported') return res.status(415).json({ error: 'Codificação do arquivo não aceita.' });
      if (['entity.parse.failed', 'request.aborted', 'request.size.invalid'].includes(err?.type)) {
        return res.status(400).json({ error: 'O corpo binário do arquivo é inválido.' });
      }
      return res.status(500).json({ error: 'Não foi possível receber o arquivo.' });
    }
    if (err?.type === 'entity.too.large') return res.status(413).json({ error: 'Payload muito grande.' });
    console.error('backend_error', err?.message || 'unknown_error');
    return res.status(500).json({ error: 'Não foi possível concluir a solicitação.' });
  });

  return app;
}

const app = createApp();
if (process.env.NODE_ENV !== 'test') app.listen(port, () => console.log('FisioZap backend listening on http://localhost:' + port));
export default app;
