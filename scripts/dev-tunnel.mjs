import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer, isIP } from 'node:net';
import { loadEnvFile } from 'node:process';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

export const FRONTEND_HOST = '127.0.0.1';
export const FRONTEND_PORT = 3847;
export const BACKEND_HOST = '127.0.0.1';
export const BACKEND_PORT = 3848;
const HEALTH_TIMEOUT_MS = 30_000;
const NGROK_URL_TIMEOUT_MS = 30_000;
const CHILD_STOP_TIMEOUT_MS = 2_000;
const MAX_LOG_LINE_BYTES = 16 * 1024;

const errorMessage = Object.freeze({
  PORT_IN_USE: 'Porta local necessária indisponível; nenhum serviço foi iniciado.',
  NGROK_MISSING: 'ngrok CLI não encontrado no PATH.',
  NGROK_START: 'Não foi possível iniciar o túnel ngrok.',
  NGROK_TIMEOUT: 'Tempo esgotado aguardando o endpoint HTTPS do ngrok.',
  NGROK_EXIT: 'O processo ngrok encerrou antes de concluir a inicialização.',
  BACKEND_START: 'O backend local não iniciou corretamente.',
  FRONTEND_START: 'O frontend local não iniciou corretamente.',
  BUILD_FAILED: 'A compilação local do frontend falhou. Atualize as dependências com npm ci --include=dev e tente novamente; se persistir, confira o erro de compilação acima.',
  ENV_MISSING: 'Configure .env.local com o Supabase de homologação antes de iniciar o túnel.',
  SUPABASE_URL_INVALID: 'NEXT_PUBLIC_SUPABASE_URL deve ser HTTPS e apontar para um host Supabase de homologação alcançável fora do loopback local.',
  SUPABASE_ANON_KEY_MISSING: 'Configure NEXT_PUBLIC_SUPABASE_ANON_KEY em .env.local antes de iniciar o túnel.',
  ENV_INVALID: 'Não foi possível carregar .env.local.',
  INTERRUPTED: 'Inicialização interrompida.',
  CHILD_EXIT: 'Um serviço local encerrou inesperadamente.',
});

export function parseNgrokUrlLogLine(line) {
  if (typeof line !== 'string' || Buffer.byteLength(line, 'utf8') > MAX_LOG_LINE_BYTES) return null;
  let record;
  try {
    record = JSON.parse(line);
  } catch {
    return null;
  }
  if (!record || typeof record !== 'object' || Array.isArray(record) || record.msg !== 'started tunnel') return null;
  if (record.obj !== 'tunnels' || record.addr !== `http://${FRONTEND_HOST}:${FRONTEND_PORT}`) return null;
  return validatePublicTunnelUrl(record.url);
}

export function validatePublicTunnelUrl(value) {
  if (typeof value !== 'string' || value.length > 2048 || /[\u0000-\u0020\\]/.test(value)) return null;
  let url;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || !url.hostname || url.username || url.password || url.port) return null;
  if (url.search || url.hash || (url.pathname !== '/' && url.pathname !== '')) return null;
  if (url.hostname.length > 253 || !/^[a-zA-Z0-9.-]+$/.test(url.hostname) || !url.hostname.includes('.')) return null;
  return url.origin;
}

export function createTunnelEnvironment(baseEnv, publicUrl) {
  const origin = validatePublicTunnelUrl(publicUrl);
  if (!origin) throw new TypeError('Invalid ngrok HTTPS URL');
  return {
    backend: {
      ...baseEnv,
      NODE_ENV: 'development',
      HOST: BACKEND_HOST,
      PORT: String(BACKEND_PORT),
      FRONTEND_ORIGIN: origin,
      FISIOZAP_LOCAL_TUNNEL: 'true',
    },
    frontend: {
      ...baseEnv,
      NODE_ENV: 'production',
      HOST: FRONTEND_HOST,
      PORT: String(FRONTEND_PORT),
      FRONTEND_ORIGIN: origin,
      NEXT_PUBLIC_BACKEND_URL: '/backend',
      FISIOZAP_DEV_TUNNEL_ORIGIN: origin,
      FISIOZAP_LOCAL_TUNNEL: 'true',
      FISIOZAP_TUNNEL_RUNTIME: 'local-build',
    },
  };
}

export function createNgrokEnvironment(sourceEnv) {
  const allowedNames = new Set([
    'PATH', 'HOME', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'XDG_CONFIG_HOME',
    'TEMP', 'TMP', 'SYSTEMROOT', 'COMSPEC', 'PATHEXT', 'LANG', 'LC_ALL',
    'NGROK_AUTHTOKEN', 'NGROK_CONFIG',
  ]);
  const selected = {};
  for (const [name, value] of Object.entries(sourceEnv)) {
    if (allowedNames.has(name.toUpperCase()) && value !== undefined) selected[name] = value;
  }
  return selected;
}

export function validateTunnelSupabaseConfig(env) {
  const raw = env.NEXT_PUBLIC_SUPABASE_URL;
  if (typeof raw !== 'string' || !raw.trim()) throw new Error('SUPABASE_URL_INVALID');
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('SUPABASE_URL_INVALID');
  }
  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  const localOrReservedName = !hostname.includes('.')
    || /(?:^|\.)(?:localhost|local|localdomain|lan|internal|intranet|home|home\.arpa|test|invalid|example|nip\.io|sslip\.io|localtest\.me|lvh\.me|vcap\.me|in-addr\.arpa|ip6\.arpa)$/i.test(hostname);
  const validDnsName = hostname.length <= 253 && hostname.split('.').every((label) =>
    label.length <= 63 && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(label));
  // A Supabase endpoint must be a DNS host, not an IP literal (which could be private,
  // link-local, reserved, or change meaning across environments).
  const isIpLiteral = isIP(hostname) !== 0;
  const valid = url.protocol === 'https:' && !url.username && !url.password
    && !url.search && !url.hash && !localOrReservedName && !isIpLiteral && validDnsName;
  if (!valid) throw new Error('SUPABASE_URL_INVALID');
  if (typeof env.NEXT_PUBLIC_SUPABASE_ANON_KEY !== 'string' || !env.NEXT_PUBLIC_SUPABASE_ANON_KEY.trim()) {
    throw new Error('SUPABASE_ANON_KEY_MISSING');
  }
  return true;
}

export function createApplicationEnvironment(baseEnv, publicUrl) {
  const sanitized = Object.fromEntries(
    Object.entries(baseEnv).filter(([name]) => name.toUpperCase() !== 'SUPABASE_SERVICE_ROLE_KEY'
      && !/^NGROK_.*(?:TOKEN|API_KEY)$/i.test(name)),
  );
  // Next and dotenv load their own env files from cwd. Shadow the key in the web process.
  sanitized.SUPABASE_SERVICE_ROLE_KEY = '';
  const appEnv = createTunnelEnvironment(sanitized, publicUrl);
  // Private document writes are validated by the API. Only that local server may
  // receive the privileged key; neither Next nor the ngrok process receives it.
  appEnv.backend.SUPABASE_SERVICE_ROLE_KEY = baseEnv.SUPABASE_SERVICE_ROLE_KEY || '';
  return appEnv;
}

export function canBindLoopback(port, host = '127.0.0.1') {
  return new Promise((resolveResult) => {
    const server = createServer();
    server.once('error', () => resolveResult(false));
    server.once('listening', () => server.close(() => resolveResult(true)));
    server.listen(port, host);
  });
}

export function waitForNgrokUrl(child, { timeoutMs = NGROK_URL_TIMEOUT_MS, signal } = {}) {
  return new Promise((resolveResult, reject) => {
    let settled = false;
    let buffer = '';
    const timer = setTimeout(() => finish(new Error('NGROK_TIMEOUT')), timeoutMs);
    const onAbort = () => finish(new Error('INTERRUPTED'));
    const onError = (error) => finish(new Error(error?.code === 'ENOENT' ? 'NGROK_MISSING' : 'NGROK_START'));
    const onClose = () => {
      const remaining = buffer.trim();
      const url = parseNgrokUrlLogLine(remaining);
      if (url) finish(null, url);
      else finish(new Error('NGROK_EXIT'));
    };
    const onData = (chunk) => {
      buffer += chunk.toString('utf8');
      if (Buffer.byteLength(buffer, 'utf8') > MAX_LOG_LINE_BYTES && !buffer.includes('\n')) {
        buffer = '';
        return;
      }
      let newline;
      while ((newline = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        const url = parseNgrokUrlLogLine(line);
        if (url) finish(null, url);
      }
    };
    function finish(error, value) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      child.removeListener('error', onError);
      child.removeListener('close', onClose);
      if (error) reject(error);
      else resolveResult(value);
    }
    if (signal?.aborted) return finish(new Error('INTERRUPTED'));
    signal?.addEventListener('abort', onAbort, { once: true });
    child.once('error', onError);
    child.once('close', onClose);
    child.stdout.on('data', onData);
    // Keep draining both streams, but never render ngrok's raw diagnostics. They may contain
    // user or credential details and are not needed by the launcher.
    child.stderr?.on('data', () => {});
  });
}

export async function waitForHttpReady(url, children, fetchImpl, signal, timeoutMs = HEALTH_TIMEOUT_MS) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (signal.aborted) throw new Error('INTERRUPTED');
    if (children.some((child) => child.exitCode !== null || child.signalCode !== null)) throw new Error('CHILD_EXIT');
    try {
      const response = await fetchImpl(url, { signal: AbortSignal.timeout(1_000) });
      if (response.ok) return;
    } catch {}
    await new Promise((resolveResult) => setTimeout(resolveResult, 200));
  }
  throw new Error('CHILD_EXIT');
}

function waitForAnyChildExit(children, signal) {
  return new Promise((resolveResult) => {
    let settled = false;
    const listeners = [];
    const finish = (result) => {
      if (settled) return;
      settled = true;
      for (const [child, event, handler] of listeners) child.removeListener(event, handler);
      signal.removeEventListener('abort', onAbort);
      resolveResult(result);
    };
    const onAbort = () => finish({ interrupted: true });
    if (signal.aborted) return finish({ interrupted: true });
    const alreadyExited = children.find((child) => child.exitCode !== null || child.signalCode !== null);
    if (alreadyExited) return finish({ child: alreadyExited, code: alreadyExited.exitCode, signal: alreadyExited.signalCode });
    signal.addEventListener('abort', onAbort, { once: true });
    for (const child of children) {
      const onClose = (code, closeSignal) => finish({ child, code, signal: closeSignal });
      const onError = () => finish({ error: true });
      listeners.push([child, 'close', onClose], [child, 'error', onError]);
      child.once('close', onClose);
      child.once('error', onError);
      if (child.exitCode !== null || child.signalCode !== null) onClose(child.exitCode, child.signalCode);
      if (settled) break;
    }
  });
}

export async function stopChildren(children) {
  const running = children.filter((child) => child && child.exitCode === null && child.signalCode === null);
  for (const child of running) {
    try { child.kill('SIGTERM'); } catch {}
  }
  if (running.length) {
    let timeout;
    await Promise.race([
      Promise.all(running.map((child) => once(child, 'close').catch(() => {}))),
      new Promise((resolveResult) => { timeout = setTimeout(resolveResult, CHILD_STOP_TIMEOUT_MS); }),
    ]);
    clearTimeout(timeout);
    for (const child of running) {
      if (child.exitCode === null && child.signalCode === null) {
        try { child.kill('SIGKILL'); } catch {}
      }
    }
  }
}

function attachSignalHandlers(signalTarget, controller) {
  const onSignal = () => controller.abort();
  signalTarget.once('SIGINT', onSignal);
  signalTarget.once('SIGTERM', onSignal);
  return () => {
    signalTarget.removeListener('SIGINT', onSignal);
    signalTarget.removeListener('SIGTERM', onSignal);
  };
}

export async function runDevTunnel({
  spawnProcess = spawn,
  fetchImpl = fetch,
  portAvailable = canBindLoopback,
  signalTarget = process,
  print = (line) => console.log(line),
  printError = (line) => console.error(line),
  setExitCode = (code) => { process.exitCode = code; },
  environment = process.env,
  loadEnv = loadEnvFile,
} = {}) {
  const controller = new AbortController();
  const removeSignalHandlers = attachSignalHandlers(signalTarget, controller);
  const children = [];
  const ngrokEnv = createNgrokEnvironment(environment);
  try {
    try {
      loadEnv('.env.local');
    } catch (error) {
      throw new Error(error?.code === 'ENOENT' ? 'ENV_MISSING' : 'ENV_INVALID');
    }
    validateTunnelSupabaseConfig(environment);
    if (!await portAvailable(FRONTEND_PORT, FRONTEND_HOST) || !await portAvailable(BACKEND_PORT, BACKEND_HOST)) {
      throw new Error('PORT_IN_USE');
    }

    let ngrok;
    try {
      ngrok = spawnProcess('ngrok', [
        'http', `http://${FRONTEND_HOST}:${FRONTEND_PORT}`,
        '--log=stdout', '--log-format=json', '--inspect=false',
      ], { env: ngrokEnv, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    } catch (error) {
      throw new Error(error?.code === 'ENOENT' ? 'NGROK_MISSING' : 'NGROK_START');
    }
    children.push(ngrok);
    ngrok.on('error', () => {});
    const publicUrl = await waitForNgrokUrl(ngrok, { signal: controller.signal });

    const env = createApplicationEnvironment(environment, publicUrl);
    const build = spawnProcess(process.execPath, ['node_modules/next/dist/bin/next', 'build'], {
      cwd: process.cwd(), env: env.frontend, stdio: 'inherit', windowsHide: true,
    });
    children.push(build);
    build.on('error', () => {});
    const buildResult = await waitForAnyChildExit([ngrok, build], controller.signal);
    if (buildResult.interrupted) return;
    if (buildResult.child === ngrok) throw new Error('NGROK_EXIT');
    if (buildResult.error || buildResult.code !== 0) throw new Error('BUILD_FAILED');

    const backend = spawnProcess(process.execPath, ['backend/src/index.js'], {
      cwd: process.cwd(), env: env.backend, stdio: 'inherit', windowsHide: true,
    });
    children.push(backend);
    backend.on('error', () => {});
    await waitForHttpReady(`http://${BACKEND_HOST}:${BACKEND_PORT}/health`, [ngrok, backend], fetchImpl, controller.signal);

    const frontend = spawnProcess(process.execPath, [
      'node_modules/next/dist/bin/next', 'start', '--hostname', FRONTEND_HOST, '--port', String(FRONTEND_PORT),
    ], { cwd: process.cwd(), env: env.frontend, stdio: 'inherit', windowsHide: true });
    children.push(frontend);
    frontend.on('error', () => {});
    await waitForHttpReady(`http://${FRONTEND_HOST}:${FRONTEND_PORT}`, [ngrok, backend, frontend], fetchImpl, controller.signal);

    print(publicUrl);
    const result = await waitForAnyChildExit([ngrok, backend, frontend], controller.signal);
    if (result.interrupted) return;
    throw new Error('CHILD_EXIT');
  } catch (error) {
    const code = error?.message;
    if (code !== 'INTERRUPTED') {
      printError(errorMessage[code] || errorMessage.CHILD_EXIT);
      setExitCode(1);
    }
  } finally {
    controller.abort();
    removeSignalHandlers();
    await stopChildren(children);
  }
}

function printError(message) {
  console.error(message);
}

const launchedDirectly = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (launchedDirectly) {
  runDevTunnel().catch(() => {
    printError(errorMessage.CHILD_EXIT);
    process.exitCode = 1;
  });
}
