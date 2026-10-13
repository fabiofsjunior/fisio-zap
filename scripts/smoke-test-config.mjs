const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

export const SMOKE_CHAT_MESSAGE = 'teste interno FisioZap';

export function isLoopbackHttpUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'http:'
      && LOOPBACK_HOSTS.has(url.hostname.toLowerCase())
      && !url.username
      && !url.password
      && !url.search
      && !url.hash
      && (url.pathname === '/' || url.pathname === '');
  } catch {
    return false;
  }
}

function normalizeLoopbackUrl(value, variableName) {
  if (!isLoopbackHttpUrl(value)) {
    throw new Error(`${variableName} deve apontar para um endereço HTTP local (localhost, 127.0.0.1 ou ::1), sem caminho.`);
  }
  return new URL(value).origin;
}

export function smokeTestConfig(env = process.env, argv = process.argv.slice(2)) {
  const unknown = argv.filter((arg) => arg !== '--tunnel');
  if (unknown.length) throw new Error('Argumento inválido. Use somente --tunnel.');
  const tunnel = argv.includes('--tunnel');
  return {
    tunnel,
    frontendUrl: normalizeLoopbackUrl(
      tunnel ? 'http://127.0.0.1:3847' : (env.FISIOZAP_FRONTEND_URL || 'http://127.0.0.1:3000'),
      'FISIOZAP_FRONTEND_URL',
    ),
    backendUrl: normalizeLoopbackUrl(
      tunnel ? 'http://127.0.0.1:3848' : (env.NEXT_PUBLIC_BACKEND_URL || 'http://127.0.0.1:3001'),
      'NEXT_PUBLIC_BACKEND_URL',
    ),
    email: env.FISIOZAP_TEST_EMAIL,
    password: env.FISIOZAP_TEST_PASSWORD,
    adminEmail: env.FISIOZAP_ADMIN_EMAIL,
    adminPassword: env.FISIOZAP_ADMIN_PASSWORD,
  };
}

export function validateSmokeChatResponse(body) {
  return Boolean(body && body.mode === 'read_only' && typeof body.message === 'string' && body.message.length > 0);
}

export function describeAuthFailure(error) {
  const status = Number(error?.status);
  const code = String(error?.code || '').toLowerCase();
  const message = String(error?.message || '').toLowerCase();
  if (message === 'invalid login credentials' || code === 'invalid_credentials') {
    return 'Credenciais inválidas (401): confirme e-mail e senha no Supabase do projeto configurado. Variáveis .env.local apenas fornecem credenciais; não criam contas. Use a recuperação de senha do projeto correto se necessário.';
  }
  if (code === 'email_not_confirmed') {
    return 'E-mail ainda não confirmado no Supabase. Confirme a conta pelo fluxo de confirmação do projeto correto e tente novamente.';
  }
  if (status === 0 || code.includes('fetch') || /network|failed to fetch|connection/.test(message)) {
    return 'Não foi possível alcançar o Supabase. Verifique NEXT_PUBLIC_SUPABASE_URL, a conexão de rede e o projeto configurado.';
  }
  if (status) return `Falha de autenticação no Supabase (HTTP ${status}). Verifique URL, chave anon e credenciais no projeto correto.`;
  return 'Falha de autenticação no Supabase sem resposta HTTP. Verifique configuração e conectividade.';
}

export function describeRequestFailure(label, error) {
  if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
    return `${label}: tempo limite de 10 segundos excedido. Verifique a disponibilidade do serviço local ou do Supabase.`;
  }
  if (error?.name === 'TypeError' || error?.cause?.code) {
    return `${label}: falha de rede/configuração ao acessar o serviço local. Confirme que o processo correspondente está ativo e que as portas estão corretas.`;
  }
  return `${label}: a requisição falhou. Verifique o serviço local e sua configuração.`;
}
