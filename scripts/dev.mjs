import { spawn, execFile, execFileSync } from 'node:child_process';
import { createServer } from 'node:net';

const RANGE_START = 3000;
const RANGE_END = 4000;
const ENV_FILE = '.env.local';

function syncLatestBranch() {
  const branch = execFileSync('git', ['branch', '--show-current'], { encoding: 'utf8' }).trim();
  if (!branch) throw new Error('Não foi possível identificar a branch atual.');
  console.log(`FisioZap: atualizando branch ${branch}...`);
  execFileSync('git', ['pull', '--ff-only', 'origin', branch], { stdio: 'inherit' });
  console.log(`FisioZap: branch ${branch} atualizada.`);
}

function canListen(port) {
  return new Promise((resolve) => {
    const server = createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => server.close(() => resolve(true)));
    server.listen(port, '127.0.0.1');
  });
}

async function findPort(excluded = new Set()) {
  for (let port = RANGE_START; port <= RANGE_END; port += 1) {
    if (!excluded.has(port) && await canListen(port)) return port;
  }
  throw new Error(`Nenhuma porta disponível entre ${RANGE_START} e ${RANGE_END}.`);
}

function spawnNode(args, env) {
  return spawn(process.execPath, args, { cwd: process.cwd(), env, stdio: 'inherit' });
}

async function waitFor(url, timeoutMs = 30000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Tempo esgotado aguardando ${url}`);
}

function openBrowser(url) {
  if (process.platform === 'win32') execFile('cmd.exe', ['/c', 'start', '', url]);
  else if (process.platform === 'darwin') execFile('open', [url]);
  else execFile('xdg-open', [url]);
}

try {
  syncLatestBranch();

  const frontPort = await findPort();
  const backendPort = await findPort(new Set([frontPort]));
  const frontUrl = `http://127.0.0.1:${frontPort}`;
  const backendUrl = `http://127.0.0.1:${backendPort}`;

  console.log(`FisioZap: frontend -> ${frontUrl}`);
  console.log(`FisioZap: backend  -> ${backendUrl}`);

  const baseEnv = { ...process.env };
  const backend = spawnNode(['--env-file', ENV_FILE, 'backend/src/index.js'], {
    ...baseEnv,
    PORT: String(backendPort),
    FRONTEND_ORIGIN: frontUrl,
    NODE_ENV: 'development',
  });

  let frontend;
  const shutdown = () => {
    backend.kill('SIGTERM');
    frontend?.kill('SIGTERM');
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  try {
    await waitFor(`${backendUrl}/health`);
    frontend = spawnNode(['node_modules/next/dist/bin/next', 'dev', '-p', String(frontPort)], {
      ...baseEnv,
      PORT: String(frontPort),
      NEXT_PUBLIC_BACKEND_URL: backendUrl,
      FRONTEND_ORIGIN: frontUrl,
    });

    await waitFor(frontUrl);
    openBrowser(frontUrl);
    console.log('FisioZap pronto. Ctrl+C encerra frontend e backend.');

    frontend.once('exit', (code) => {
      backend.kill('SIGTERM');
      if (code && code !== 0) process.exitCode = code;
    });
    backend.once('exit', (code) => {
      if (code && code !== 0) {
        frontend?.kill('SIGTERM');
        process.exitCode = code;
      }
    });
  } catch (error) {
    console.error(error.message);
    shutdown();
    process.exitCode = 1;
  }
} catch (error) {
  console.error(`FisioZap não iniciado: ${error.message}`);
  process.exitCode = 1;
}
