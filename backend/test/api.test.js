import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from './test-server.js';

const baseEnv = {
  NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test-key',
  FRONTEND_ORIGIN: 'http://localhost:3000',
};

test('health is public and does not expose secrets', async () => {
  const server = createServer(baseEnv, { tokenUser: null });
  const response = await server.request('/health');
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: 'ok', service: 'fisio-zap-backend' });
  await server.close();
});

test('chat rejects missing authentication', async () => {
  const server = createServer(baseEnv, { tokenUser: null });
  const response = await server.request('/chat', {
    method: 'POST',
    body: { message: 'olá' },
  });
  assert.equal(response.status, 401);
  await server.close();
});

test('chat rejects invalid payloads', async () => {
  const server = createServer(baseEnv, { tokenUser: { id: 'user-a' } });
  const empty = await server.request('/chat', {
    method: 'POST',
    headers: { Authorization: 'Bearer valid' },
    body: { message: '' },
  });
  assert.equal(empty.status, 400);

  const oversized = await server.request('/chat', {
    method: 'POST',
    headers: { Authorization: 'Bearer valid' },
    body: { message: 'x'.repeat(4001) },
  });
  assert.equal(oversized.status, 422);
  await server.close();
});

test('chat accepts only configured frontend origin for CORS', async () => {
  const server = createServer(baseEnv, { tokenUser: { id: 'user-a' } });
  const allowed = await server.request('/health', { headers: { Origin: 'http://localhost:3000' } });
  assert.equal(allowed.headers.get('access-control-allow-origin'), 'http://localhost:3000');

  const denied = await server.request('/health', { headers: { Origin: 'https://evil.example' } });
  assert.equal(denied.headers.get('access-control-allow-origin'), null);
  await server.close();
});

test('chat response is scoped to authenticated token identity', async () => {
  const server = createServer(baseEnv, { tokenUser: { id: 'user-a' } });
  const response = await server.request('/chat', {
    method: 'POST',
    headers: { Authorization: 'Bearer valid' },
    body: { message: 'minha rotina' },
  });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).mode, 'demo');
  await server.close();
});
