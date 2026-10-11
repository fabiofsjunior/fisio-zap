import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { assertLocalSupabaseTestMutations as guard } from '../local-supabase-test-guard.mjs';
const allowed = { FISIOZAP_ALLOW_LOCAL_TEST_MUTATIONS: 'true' };
const scripts = ['bootstrap-test-accounts.mjs', 'create-test-user.mjs', 'rls-negative-test.mjs'];
test('requires literal explicit opt-in', () => {
  for (const value of [undefined, '', 'false', 'TRUE', '1']) assert.throws(() => guard({ NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321', FISIOZAP_ALLOW_LOCAL_TEST_MUTATIONS: value }));
});
test('allows canonical HTTP loopback', () => {
  for (const host of ['localhost', '127.0.0.1', '[::1]']) assert.doesNotThrow(() => guard({ ...allowed, NEXT_PUBLIC_SUPABASE_URL: `http://${host}:54321/` }));
});
test('blocks remote and misleading hosts', () => {
  for (const host of ['project.supabase.co', 'localhost.evil.test', 'evil-localhost', '192.168.0.1', '0.0.0.0', 'localhost.', '127.1', '2130706433', '0x7f000001', '0177.0.0.1', '[::ffff:127.0.0.1]']) assert.throws(() => guard({ ...allowed, NEXT_PUBLIC_SUPABASE_URL: `http://${host}:54321` }));
});
test('rejects unsafe URL features and malformed input', () => {
  for (const value of [undefined, '', 'not a URL', 'https://localhost:54321', 'ftp://127.0.0.1', 'http://user:pass@localhost', 'http://localhost/path', 'http://localhost?redirect=remote', 'http://localhost#remote', 'http://%6cocalhost', ' http://localhost', 'http://localhost\\@evil.test']) assert.throws(() => guard({ ...allowed, NEXT_PUBLIC_SUPABASE_URL: value }));
});

test('mutation entrypoints stop before configuration or client setup unless explicitly opted in', () => {
  const scriptsDir = fileURLToPath(new URL('..', import.meta.url));
  for (const script of scripts) {
    const result = spawnSync(process.execPath, [`${scriptsDir}/${script}`], {
      encoding: 'utf8',
      env: { ...process.env, FISIOZAP_ALLOW_LOCAL_TEST_MUTATIONS: '', NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321' },
    });
    assert.notEqual(result.status, 0, `${script} unexpectedly ran without opt-in`);
    assert.match(result.stderr, /FISIOZAP_ALLOW_LOCAL_TEST_MUTATIONS=true/);
    assert.doesNotMatch(result.stderr, /Variável obrigatória ausente/);
  }
});

test('mutation entrypoints reject hosted URLs even with explicit opt-in', () => {
  const scriptsDir = fileURLToPath(new URL('..', import.meta.url));
  for (const script of scripts) {
    const result = spawnSync(process.execPath, [`${scriptsDir}/${script}`], {
      encoding: 'utf8',
      env: { ...process.env, ...allowed, NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co' },
    });
    assert.notEqual(result.status, 0, `${script} unexpectedly accepted a hosted URL`);
    assert.match(result.stderr, /remote URLs are blocked/);
    assert.doesNotMatch(result.stderr, /Variável obrigatória ausente/);
  }
});
