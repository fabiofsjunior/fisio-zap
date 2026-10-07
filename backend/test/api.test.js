import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
process.env.NODE_ENV = 'test';
process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://test.local';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';
const { createApp } = await import('../src/index.js');

function startServer({ user = null } = {}) {
  const supabaseClientFactory = () => ({
    auth: {
      getUser: async (token) =>
        token === 'valid'
          ? { data: { user }, error: null }
          : { data: { user: null }, error: new Error('invalid token') },
    },
  });

  const app = createApp({ supabaseClientFactory });
  const server = http.createServer(app);

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({
        baseUrl: `http://127.0.0.1:${port}`,
        close: () => {
          server.close();
          server.closeAllConnections?.();
        },
      });
    });
  });
}

async function request(baseUrl, path, options = {}) {
  return fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
}

test('health is public and does not expose secrets', async () => {
  const server = await startServer();
  const response = await request(server.baseUrl, '/health');
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: 'ok', service: 'fisio-zap-backend' });
  await server.close();
});

test('chat rejects missing and invalid authentication', async () => {
  const server = await startServer({ user: { id: 'user-a' } });

  const missing = await request(server.baseUrl, '/chat', {
    method: 'POST',
    body: { message: 'olá' },
  });
  assert.equal(missing.status, 401);

  const invalid = await request(server.baseUrl, '/chat', {
    method: 'POST',
    headers: { Authorization: 'Bearer invalid' },
    body: { message: 'olá' },
  });
  assert.equal(invalid.status, 401);

  await server.close();
});

test('chat validates the message after authentication', async () => {
  const server = await startServer({ user: { id: 'user-a' } });

  const empty = await request(server.baseUrl, '/chat', {
    method: 'POST',
    headers: { Authorization: 'Bearer valid' },
    body: { message: '' },
  });
  assert.equal(empty.status, 400);

  const oversized = await request(server.baseUrl, '/chat', {
    method: 'POST',
    headers: { Authorization: 'Bearer valid' },
    body: { message: 'x'.repeat(4001) },
  });
  assert.equal(oversized.status, 422);

  await server.close();
});

test('chat accepts only configured frontend origin for CORS', async () => {
  const server = await startServer({ user: { id: 'user-a' } });

  const allowed = await request(server.baseUrl, '/health', {
    headers: { Origin: 'http://localhost:3000' },
  });
  assert.equal(allowed.headers.get('access-control-allow-origin'), 'http://localhost:3000');

  const denied = await request(server.baseUrl, '/health', {
    headers: { Origin: 'https://evil.example' },
  });
  assert.equal(denied.headers.get('access-control-allow-origin'), null);

  await server.close();
});

test('chat uses the authenticated token identity and returns demo response', async () => {
  const server = await startServer({ user: { id: 'user-a' } });

  const response = await request(server.baseUrl, '/chat', {
    method: 'POST',
    headers: { Authorization: 'Bearer valid' },
    body: { message: 'minha rotina' },
  });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    message: 'Demonstração FisioZap: recebi sua mensagem, profissional. A integração de IA ainda não está ativa.',
    mode: 'demo',
  });

  await server.close();
});
