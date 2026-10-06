import 'dotenv/config';
import express from 'express';
import { createClient } from '@supabase/supabase-js';

const app = express();
const port = Number(process.env.PORT || 3001);
const frontendOrigin = process.env.FRONTEND_ORIGIN || 'http://localhost:3000';
const maxMessageLength = 4000;
const windowMs = 60_000;
const maxRequestsPerWindow = 30;
const rateBuckets = new Map();

app.disable('x-powered-by');
app.use(express.json({ limit: '64kb' }));

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin === frontendOrigin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

function rateLimit(req, res, next) {
  const key = req.ip || 'unknown';
  const now = Date.now();
  const bucket = rateBuckets.get(key);
  if (!bucket || now - bucket.startedAt >= windowMs) {
    rateBuckets.set(key, { startedAt: now, count: 1 });
    return next();
  }
  bucket.count += 1;
  if (bucket.count > maxRequestsPerWindow) {
    return res.status(429).json({ error: 'Muitas solicitações. Tente novamente em instantes.' });
  }
  return next();
}

function getBearerToken(req) {
  const value = req.get('authorization') || '';
  if (!value.startsWith('Bearer ')) return null;
  return value.slice(7).trim() || null;
}

async function requireAuth(req, res, next) {
  const token = getBearerToken(req);
  if (!token || !process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return res.status(401).json({ error: 'Autenticação necessária.' });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return res.status(401).json({ error: 'Sessão inválida ou expirada.' });

  req.user = data.user;
  return next();
}

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'fisio-zap-backend' });
});

app.post('/chat', rateLimit, requireAuth, (req, res) => {
  const message = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
  if (!message) return res.status(400).json({ error: 'A mensagem é obrigatória.' });
  if (message.length > maxMessageLength) {
    return res.status(422).json({ error: `A mensagem deve ter no máximo ${maxMessageLength} caracteres.` });
  }

  res.json({
    message: `Demonstração FisioZap: recebi sua mensagem, profissional. A integração de IA ainda não está ativa.`,
    mode: 'demo',
  });
});

app.use((err, _req, res, _next) => {
  if (err?.type === 'entity.too.large') return res.status(413).json({ error: 'Payload muito grande.' });
  console.error('backend_error', err?.message || 'unknown_error');
  return res.status(500).json({ error: 'Não foi possível concluir a solicitação.' });
});

app.listen(port, () => {
  console.log(`FisioZap backend listening on http://localhost:${port}`);
});
