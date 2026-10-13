import assert from 'node:assert/strict';
import test from 'node:test';
import {
  describeAuthFailure,
  isLoopbackHttpUrl,
  SMOKE_CHAT_MESSAGE,
  smokeTestConfig,
  validateSmokeChatResponse,
} from '../smoke-test-config.mjs';

test('uses the configured local ports by default and tunnel ports in tunnel mode', () => {
  assert.deepEqual(
    [smokeTestConfig({}).frontendUrl, smokeTestConfig({}).backendUrl],
    ['http://127.0.0.1:3000', 'http://127.0.0.1:3001'],
  );
  const tunnel = smokeTestConfig({ NEXT_PUBLIC_BACKEND_URL: '/backend', FISIOZAP_FRONTEND_URL: 'https://unexpected.example' }, ['--tunnel']);
  assert.equal(tunnel.frontendUrl, 'http://127.0.0.1:3847');
  assert.equal(tunnel.backendUrl, 'http://127.0.0.1:3848');
});

test('rejects arbitrary frontend and backend URLs before any credentials can be sent', () => {
  for (const url of [
    'https://attacker.example',
    'http://192.168.1.9:3000',
    'http://localhost:3000/path',
    'http://user:secret@127.0.0.1:3000',
    'http://127.0.0.1:3000/?token=secret',
    '/backend',
  ]) {
    assert.equal(isLoopbackHttpUrl(url), false, `reject ${url}`);
  }
  assert.throws(() => smokeTestConfig({ FISIOZAP_FRONTEND_URL: 'https://attacker.example' }), /HTTP local/);
  assert.throws(() => smokeTestConfig({ NEXT_PUBLIC_BACKEND_URL: 'https://attacker.example' }), /HTTP local/);
  assert.equal(isLoopbackHttpUrl('http://[::1]:3847/'), true);
});

test('rejects unsupported CLI arguments without echoing their values', () => {
  assert.throws(
    () => smokeTestConfig({}, ['--unknown-secret-flag']),
    (error) => {
      assert.equal(error.message, 'Argumento inválido. Use somente --tunnel.');
      assert.doesNotMatch(error.message, /unknown-secret-flag/);
      return true;
    },
  );
});

test('accepts the current authenticated read-only chat contract and rejects the obsolete demo contract', () => {
  assert.equal(SMOKE_CHAT_MESSAGE, 'teste interno FisioZap');
  assert.equal(validateSmokeChatResponse({ mode: 'read_only', message: 'Resposta' }), true);
  assert.equal(validateSmokeChatResponse({ mode: 'demo', message: 'Resposta' }), false);
  assert.equal(validateSmokeChatResponse({ mode: 'read_only', message: '' }), false);
  assert.equal(validateSmokeChatResponse({ mode: 'read_only', message: 1 }), false);
});

test('classifies invalid credentials and network errors without leaking provider details', () => {
  const invalid = describeAuthFailure({ status: 400, code: 'invalid_credentials', message: 'Invalid login credentials', email: 'private@example.test', token: 'secret-token' });
  assert.match(invalid, /Credenciais inválidas \(401\)/);
  assert.match(invalid, /não criam contas/);
  assert.doesNotMatch(invalid, /private@example|secret-token|Invalid login credentials/);

  const network = describeAuthFailure({ status: 0, message: 'Failed to fetch secret-token' });
  assert.match(network, /alcançar o Supabase/);
  assert.doesNotMatch(network, /secret-token/);

  const unconfirmed = describeAuthFailure({ status: 400, code: 'email_not_confirmed', message: 'provider details private@example.test' });
  assert.match(unconfirmed, /E-mail ainda não confirmado/);
  assert.doesNotMatch(unconfirmed, /private@example/);
});
