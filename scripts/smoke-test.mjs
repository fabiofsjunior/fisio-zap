import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const backendUrl = (process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001').replace(/\/$/, '');
const email = process.env.FISIOZAP_TEST_EMAIL;
const password = process.env.FISIOZAP_TEST_PASSWORD;

function requireEnv(name, value) {
  if (!value) throw new Error(`Variável obrigatória ausente: ${name}`);
}

requireEnv('NEXT_PUBLIC_SUPABASE_URL', url);
requireEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', anonKey);
requireEnv('FISIOZAP_TEST_EMAIL', email);
requireEnv('FISIOZAP_TEST_PASSWORD', password);

const supabase = createClient(url, anonKey, {
  auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
});

async function main() {
  console.log('1/5 Login Supabase...');
  const { data: signIn, error: signInError } = await supabase.auth.signInWithPassword({ email, password });
  if (signInError || !signIn.session) throw new Error(`Login falhou: ${signInError?.message || 'sessão ausente'}`);
  const accessToken = signIn.session.access_token;

  console.log('2/5 Identidade autenticada...');
  const { data: userData, error: userError } = await supabase.auth.getUser(accessToken);
  if (userError || !userData.user) throw new Error(`getUser falhou: ${userError?.message || 'usuário ausente'}`);

  console.log('3/5 Health do backend...');
  const health = await fetch(`${backendUrl}/health`);
  if (!health.ok) throw new Error(`Backend /health respondeu HTTP ${health.status}`);

  console.log('4/5 Chat autenticado...');
  const chat = await fetch(`${backendUrl}/chat`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ message: 'smoke test FisioZap' }),
  });
  const chatBody = await chat.json().catch(() => ({}));
  if (!chat.ok) throw new Error(`/chat respondeu HTTP ${chat.status}: ${chatBody.error || 'erro desconhecido'}`);
  if (chatBody.mode !== 'demo' || typeof chatBody.message !== 'string') {
    throw new Error('Resposta do /chat não corresponde ao contrato de demonstração.');
  }

  console.log('5/5 Logout...');
  const { error: signOutError } = await supabase.auth.signOut({ scope: 'local' });
  if (signOutError) throw new Error(`Logout falhou: ${signOutError.message}`);
  const { data: sessionAfterLogout } = await supabase.auth.getSession();
  if (sessionAfterLogout.session) throw new Error('Sessão local permaneceu após logout.');

  console.log('');
  console.log('SMOKE TEST OK — login → Chat → API → resposta → logout');
  console.log(`Usuário: ${userData.user.email || userData.user.id}`);
}

main().catch((error) => {
  console.error(`SMOKE TEST FALHOU: ${error.message}`);
  process.exit(1);
});
