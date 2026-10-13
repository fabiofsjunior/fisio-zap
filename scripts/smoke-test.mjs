import { createClient } from '@supabase/supabase-js';
import {
  describeAuthFailure,
  describeRequestFailure,
  SMOKE_CHAT_MESSAGE,
  smokeTestConfig,
  validateSmokeChatResponse,
} from './smoke-test-config.mjs';

const config = smokeTestConfig();
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const REQUEST_TIMEOUT_MS = 10_000;

function fetchWithSmokeTimeout(input, init = {}) {
  const timeoutSignal = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  const signal = init.signal ? AbortSignal.any([init.signal, timeoutSignal]) : timeoutSignal;
  return fetch(input, { ...init, signal });
}

function requireEnv(name, value) {
  if (!value) throw new Error(`Variável obrigatória ausente: ${name}`);
}

function requireCredentialPair(label, email, password) {
  if (Boolean(email) !== Boolean(password)) {
    throw new Error(`Configure FISIOZAP_${label}_EMAIL e FISIOZAP_${label}_PASSWORD juntos, ou deixe ambos ausentes.`);
  }
}

async function testFrontendLogin(label, loginEmail, loginPassword) {
  let response;
  try {
    response = await fetchWithSmokeTimeout(`${config.frontendUrl}/api/auth/login`, {
      method: 'POST',
      redirect: 'error',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: loginEmail, password: loginPassword }),
    });
  } catch (error) {
    throw new Error(describeRequestFailure(`${label} login Next.js`, error));
  }

  if (response.ok) {
    const body = await response.json().catch(() => ({}));
    if (body.ok === true) return;
    throw new Error(`${label} login Next.js respondeu sem confirmar { ok: true } (HTTP ${response.status}).`);
  }

  if (response.status === 401) {
    throw new Error(`${label} login Next.js respondeu HTTP 401: e-mail ou senha inválidos. Confira as credenciais da conta no projeto Supabase correto; .env.local não cria contas.`);
  }
  throw new Error(`${label} login Next.js respondeu HTTP ${response.status}. Verifique se o frontend local usa a mesma URL e chave anon do Supabase.`);
}

async function signIn(label, email, password, supabase) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.session) {
    throw new Error(`${label}: ${describeAuthFailure(error)}`);
  }
  return data.session;
}

async function main() {
  requireEnv('NEXT_PUBLIC_SUPABASE_URL', supabaseUrl);
  requireEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', anonKey);
  requireEnv('FISIOZAP_TEST_EMAIL', config.email);
  requireEnv('FISIOZAP_TEST_PASSWORD', config.password);
  requireCredentialPair('ADMIN', config.adminEmail, config.adminPassword);

  const supabase = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    global: { fetch: fetchWithSmokeTimeout },
  });

  console.log(`1/7 Login Supabase TESTE${config.adminEmail ? ' e ADMIN' : ''}...`);
  const testSession = await signIn('TESTE', config.email, config.password, supabase);

  console.log('2/7 Login pela rota Next.js local...');
  await testFrontendLogin('TESTE', config.email, config.password);
  if (config.adminEmail) {
    await signIn('ADMIN', config.adminEmail, config.adminPassword, supabase);
    await testFrontendLogin('ADMIN', config.adminEmail, config.adminPassword);
    console.log('Login ADMIN Supabase e Next.js OK.');
  }

  console.log('3/7 Identidade autenticada...');
  const { data: userData, error: userError } = await supabase.auth.getUser(testSession.access_token);
  if (userError || !userData.user) throw new Error('getUser falhou: token de teste não foi aceito pelo Supabase.');

  console.log('4/7 Health do backend...');
  let health;
  try {
    health = await fetchWithSmokeTimeout(`${config.backendUrl}/health`);
  } catch (error) {
    throw new Error(describeRequestFailure('Backend /health', error));
  }
  if (!health.ok) throw new Error(`Backend /health respondeu HTTP ${health.status}.`);

  console.log('5/7 Chat autenticado...');
  let chat;
  try {
    chat = await fetchWithSmokeTimeout(`${config.backendUrl}/chat`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${testSession.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ message: SMOKE_CHAT_MESSAGE }),
    });
  } catch (error) {
    throw new Error(describeRequestFailure('Backend /chat', error));
  }
  if (chat.status === 401) throw new Error('Backend /chat respondeu HTTP 401: o token Supabase de TESTE foi rejeitado. Confirme se backend e frontend apontam para o mesmo projeto.');
  if (!chat.ok) throw new Error(`Backend /chat respondeu HTTP ${chat.status}. Confirme que a conta TESTE tem vínculo ativo com uma organização.`);
  const chatBody = await chat.json().catch(() => ({}));
  if (!validateSmokeChatResponse(chatBody)) {
    throw new Error('Resposta do /chat não corresponde ao contrato atual: mode "read_only" e message textual.');
  }

  console.log('6/7 Logout local...');
  const { error: signOutError } = await supabase.auth.signOut({ scope: 'local' });
  if (signOutError) throw new Error('Logout local falhou.');
  const { data: sessionAfterLogout } = await supabase.auth.getSession();
  if (sessionAfterLogout.session) throw new Error('Sessão local permaneceu após logout.');

  console.log('7/7 Contrato final...');
  console.log('');
  console.log('SMOKE TEST OK — Supabase → Next.js local → Chat read_only → API → logout');
}

main().catch((error) => {
  console.error(`SMOKE TEST FALHOU: ${error.message}`);
  process.exit(1);
});
