import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { test } from 'node:test';
import { localTunnelConfig } from '../local-tunnel-config.mjs';
import {
  BACKEND_PORT,
  FRONTEND_PORT,
  createApplicationEnvironment,
  createNgrokEnvironment,
  createTunnelEnvironment,
  parseNgrokUrlLogLine,
  runDevTunnel,
  validatePublicTunnelUrl,
  validateTunnelSupabaseConfig,
} from '../dev-tunnel.mjs';

const baseEnvironment = {
  NODE_ENV: 'production',
  FISIOZAP_LOCAL_TUNNEL: 'true',
  FISIOZAP_TUNNEL_RUNTIME: 'local-build',
  FISIOZAP_DEV_TUNNEL_ORIGIN: 'https://fisiozap-test.ngrok-free.app',
};

test('enables only an explicitly marked local build host and proxies backend paths to loopback 3848', async () => {
  const config = localTunnelConfig(baseEnvironment);
  assert.deepEqual(config.allowedDevOrigins, [
    '127.0.0.1',
    'localhost',
    'fisiozap-test.ngrok-free.app',
  ]);
  assert.deepEqual(await config.rewrites(), [{
    source: '/backend/:path*',
    destination: 'http://127.0.0.1:3848/:path*',
  }]);
  assert.ok(config.allowedDevOrigins.every((origin) => !origin.includes('*')));
});

test('keeps tunnel disabled unless explicit opt-in and local-build runtime marker are present', async (t) => {
  const cases = [
    ['production without marker stays off', { ...baseEnvironment, FISIOZAP_TUNNEL_RUNTIME: undefined }],
    ['development mode alone stays off', { ...baseEnvironment, NODE_ENV: 'development', FISIOZAP_TUNNEL_RUNTIME: undefined }],
    ['test mode without marker stays off', { ...baseEnvironment, NODE_ENV: 'test', FISIOZAP_TUNNEL_RUNTIME: undefined }],
    ['missing opt-in stays off', { ...baseEnvironment, FISIOZAP_LOCAL_TUNNEL: undefined }],
    ['false opt-in stays off', { ...baseEnvironment, FISIOZAP_LOCAL_TUNNEL: 'false' }],
    ['case-mismatched opt-in stays off', { ...baseEnvironment, FISIOZAP_LOCAL_TUNNEL: 'TRUE' }],
    ['numeric opt-in stays off', { ...baseEnvironment, FISIOZAP_LOCAL_TUNNEL: '1' }],
    ['other runtime marker stays off', { ...baseEnvironment, FISIOZAP_TUNNEL_RUNTIME: 'development' }],
  ];
  for (const [name, env] of cases) {
    await t.test(name, async () => {
      const config = localTunnelConfig(env);
      assert.deepEqual(config.allowedDevOrigins, ['127.0.0.1', 'localhost']);
      assert.deepEqual(await config.rewrites(), []);
    });
  }
});

test('does not parse or enable tunnel settings when tunnel mode is off', async () => {
  const config = localTunnelConfig({
    NODE_ENV: 'production',
    FISIOZAP_LOCAL_TUNNEL: 'true',
    FISIOZAP_TUNNEL_RUNTIME: undefined,
    FISIOZAP_DEV_TUNNEL_ORIGIN: 'not a URL',
  });
  assert.deepEqual(await config.rewrites(), []);
});

test('rejects non-HTTPS, credentials, ports, path/query/fragment and wildcard tunnel origins', () => {
  const invalidOrigins = [
    'http://fisiozap-test.ngrok-free.app',
    'https://user@fisiozap-test.ngrok-free.app',
    'https://user:secret@fisiozap-test.ngrok-free.app',
    'https://fisiozap-test.ngrok-free.app:444',
    'https://fisiozap-test.ngrok-free.app/path',
    'https://fisiozap-test.ngrok-free.app/?token=secret',
    'https://fisiozap-test.ngrok-free.app/#fragment',
    'https://*.ngrok-free.app',
    'https://fisiozap-test.ngrok-free.app/.',
    'https://fisiozap-test.ngrok-free.app/extra/path',
    'https:\\\\fisiozap-test.ngrok-free.app',
    'https://fisiozap-test.ngrok-free.app\n',
    'https://físiozap-test.ngrok-free.app',
    'https://',
    '/relative/path',
  ];
  for (const origin of invalidOrigins) {
    assert.throws(() => localTunnelConfig({
      ...baseEnvironment,
      FISIOZAP_DEV_TUNNEL_ORIGIN: origin,
    }), Error, `reject ${origin}`);
  }
});

test('accepts a single explicit origin hostname and never derives a wildcard allowlist entry', () => {
  const origin = 'https://one-device.ngrok.app';
  const config = localTunnelConfig({ ...baseEnvironment, FISIOZAP_DEV_TUNNEL_ORIGIN: origin });
  assert.equal(config.allowedDevOrigins.at(-1), new URL(origin).hostname);
  assert.equal(config.allowedDevOrigins.length, 3);
});

test('validates public tunnel endpoints as HTTPS origins without embedded paths or credentials', () => {
  assert.equal(validatePublicTunnelUrl('https://test-tunnel.ngrok-free.app'), 'https://test-tunnel.ngrok-free.app');
  assert.equal(validatePublicTunnelUrl('https://test-tunnel.ngrok-free.app/'), 'https://test-tunnel.ngrok-free.app');
  for (const value of [
    'http://test-tunnel.ngrok-free.app',
    'https://user:test@test-tunnel.ngrok-free.app',
    'https://test-tunnel.ngrok-free.app:444',
    'https://test-tunnel.ngrok-free.app/path',
    'https://test-tunnel.ngrok-free.app/?token=x',
    'https://test-tunnel.ngrok-free.app/#fragment',
    'https://*.ngrok-free.app',
    'https://',
    'https://test-tunnel.ngrok-free.app\\@evil.example',
    `https://test-tunnel.ngrok-free.app/${'a'.repeat(2050)}`,
  ]) {
    assert.equal(validatePublicTunnelUrl(value), null, `reject ${value.slice(0, 80)}`);
  }
});

test('accepts only the expected ngrok JSON tunnel startup record', () => {
  const validLine = JSON.stringify({
    msg: 'started tunnel',
    obj: 'tunnels',
    addr: 'http://127.0.0.1:3847',
    url: 'https://test-tunnel.ngrok-free.app',
  });
  assert.equal(parseNgrokUrlLogLine(validLine), 'https://test-tunnel.ngrok-free.app');
  for (const record of [
    { msg: 'tunnel created', obj: 'tunnels', addr: 'http://127.0.0.1:3847', url: 'https://test-tunnel.ngrok-free.app' },
    { msg: 'started tunnel', obj: 'other', addr: 'http://127.0.0.1:3847', url: 'https://test-tunnel.ngrok-free.app' },
    { msg: 'started tunnel', obj: 'tunnels', addr: 'http://127.0.0.1:38470', url: 'https://test-tunnel.ngrok-free.app' },
    { msg: 'started tunnel', obj: 'tunnels', addr: 'http://127.0.0.1:3848', url: 'https://test-tunnel.ngrok-free.app' },
    { msg: 'started tunnel', obj: 'tunnels', addr: 'http://127.0.0.1:3847', url: 'http://test-tunnel.ngrok-free.app' },
    { msg: 'started tunnel', obj: 'tunnels', addr: 'http://127.0.0.1:3847', url: 'https://user@tunnel.example' },
  ]) {
    assert.equal(parseNgrokUrlLogLine(JSON.stringify(record)), null);
  }
  assert.equal(parseNgrokUrlLogLine('{ malformed'), null);
  assert.equal(parseNgrokUrlLogLine('x'.repeat(20_000)), null);
});

test('creates loopback-only child environments with tunnel opt-in limited to local frontend build', () => {
  const env = createTunnelEnvironment({ PATH: '/mock/path', SECRET_FOR_LOCAL_BACKEND: 'test-only' }, 'https://test-tunnel.ngrok-free.app');
  assert.equal(env.backend.HOST, '127.0.0.1');
  assert.equal(env.backend.PORT, '3848');
  assert.equal(env.backend.FRONTEND_ORIGIN, 'https://test-tunnel.ngrok-free.app');
  assert.equal(env.frontend.HOST, '127.0.0.1');
  assert.equal(env.frontend.PORT, '3847');
  assert.equal(env.frontend.NEXT_PUBLIC_BACKEND_URL, '/backend');
  assert.equal(env.frontend.FISIOZAP_LOCAL_TUNNEL, 'true');
  assert.equal(env.frontend.FISIOZAP_TUNNEL_RUNTIME, 'local-build');
  assert.equal(env.frontend.FISIOZAP_DEV_TUNNEL_ORIGIN, 'https://test-tunnel.ngrok-free.app');
  assert.equal(env.backend.FISIOZAP_TUNNEL_RUNTIME, undefined);
  assert.throws(() => createTunnelEnvironment({}, 'http://tunnel.example'), TypeError);
});

test('validates Supabase URL/key for tunneling without permitting local, insecure or credential URLs', () => {
  assert.equal(validateTunnelSupabaseConfig({
    NEXT_PUBLIC_SUPABASE_URL: 'https://project.supabase.co',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'public-anon-test-key',
  }), true);
  for (const url of [
    undefined,
    '',
    'not a URL',
    'http://project.supabase.co',
    'https://user:password@project.supabase.co',
    'https://project.supabase.co?token=secret',
    'https://localhost:54321',
    'https://127.0.0.1:54321',
    'https://10.2.3.4',
    'https://172.20.1.2',
    'https://192.168.1.9',
    'https://169.254.10.20',
    'https://[::1]:54321',
    'https://[fd00::1]',
    'https://[fe80::1]',
    'https://db.local',
    'https://127.4.5.6:54321',
  ]) {
    assert.throws(() => validateTunnelSupabaseConfig({
      NEXT_PUBLIC_SUPABASE_URL: url,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'public-anon-test-key',
    }), /SUPABASE_URL_INVALID/);
  }
  assert.throws(() => validateTunnelSupabaseConfig({ NEXT_PUBLIC_SUPABASE_URL: 'https://project.supabase.co' }), /SUPABASE_ANON_KEY_MISSING/);
});

test('restricts ngrok credentials to ngrok and excludes service role from application children', () => {
  const source = {
    PATH: '/mock/bin',
    NGROK_AUTHTOKEN: 'tunnel-token-test',
    NGROK_CONFIG: '/tmp/ngrok.yml',
    SUPABASE_SERVICE_ROLE_KEY: 'never-pass-to-ngrok',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'app-key-test',
    OTHER_SECRET: 'app-secret-test',
  };
  assert.deepEqual(createNgrokEnvironment(source), {
    PATH: '/mock/bin',
    NGROK_AUTHTOKEN: 'tunnel-token-test',
    NGROK_CONFIG: '/tmp/ngrok.yml',
  });
  const appEnv = createApplicationEnvironment(source, 'https://test-tunnel.ngrok-free.app');
  assert.equal(appEnv.backend.NGROK_AUTHTOKEN, undefined);
  assert.equal(appEnv.frontend.NGROK_AUTHTOKEN, undefined);
  assert.equal(appEnv.backend.SUPABASE_SERVICE_ROLE_KEY, '');
  assert.equal(appEnv.frontend.SUPABASE_SERVICE_ROLE_KEY, '');
});

class FakeChild extends EventEmitter {
  stdout = new EventEmitter();
  stderr = new EventEmitter();
  exitCode = null;
  signalCode = null;
  kills = [];

  kill(signal) {
    this.kills.push(signal);
    this.signalCode = signal;
    setImmediate(() => this.emit('close', null, signal));
    return true;
  }

  finish(code = 0) {
    this.exitCode = code;
    setImmediate(() => this.emit('close', code, null));
  }
}

function validTunnelEnvironment() {
  return {
    PATH: '/mock/bin',
    NEXT_PUBLIC_SUPABASE_URL: 'https://project.supabase.co',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'public-anon-test-key',
    SUPABASE_SERVICE_ROLE_KEY: 'backend-local-only-test-key',
    NGROK_AUTHTOKEN: 'ngrok-mock-token',
  };
}

test('preflight fails closed before spawning children when ports or local env are invalid', async (t) => {
  const cases = [
    {
      name: 'missing local environment file',
      loadEnv: () => { const error = new Error('missing'); error.code = 'ENOENT'; throw error; },
      portAvailable: async () => true,
      expected: /Configure .env.local/i,
    },
    {
      name: 'invalid Supabase URL',
      loadEnv: async () => {},
      environment: { ...validTunnelEnvironment(), NEXT_PUBLIC_SUPABASE_URL: 'http://localhost:54321' },
      portAvailable: async () => true,
      expected: /NEXT_PUBLIC_SUPABASE_URL/i,
    },
    ...[
      'https://10.10.1.2',
      'https://192.168.1.2',
      'https://169.254.1.2',
      'https://[fd00::1]',
      'https://db.local',
    ].map((url) => ({
      name: `rejects non-public Supabase host ${url}`,
      loadEnv: async () => {},
      environment: { ...validTunnelEnvironment(), NEXT_PUBLIC_SUPABASE_URL: url },
      portAvailable: async () => true,
      expected: /NEXT_PUBLIC_SUPABASE_URL/i,
    })),
    {
      name: 'missing anonymous key',
      loadEnv: async () => {},
      environment: { NEXT_PUBLIC_SUPABASE_URL: 'https://project.supabase.co' },
      portAvailable: async () => true,
      expected: /NEXT_PUBLIC_SUPABASE_ANON_KEY/i,
    },
    {
      name: 'occupied frontend port',
      loadEnv: async () => {},
      portAvailable: async (port) => port !== FRONTEND_PORT,
      expected: /Porta local necessária indisponível/i,
    },
    {
      name: 'occupied backend port',
      loadEnv: async () => {},
      portAvailable: async (port) => port !== BACKEND_PORT,
      expected: /Porta local necessária indisponível/i,
    },
  ];

  for (const scenario of cases) {
    await t.test(scenario.name, async () => {
      const spawned = [];
      const errors = [];
      const exitCodes = [];
      await runDevTunnel({
        environment: scenario.environment ?? validTunnelEnvironment(),
        loadEnv: scenario.loadEnv,
        portAvailable: scenario.portAvailable,
        spawnProcess: (...args) => { spawned.push(args); throw new Error('unexpected spawn'); },
        fetchImpl: async () => { throw new Error('network must not be called during preflight'); },
        signalTarget: new EventEmitter(),
        print: () => assert.fail('public endpoint must not be printed on failed preflight'),
        printError: (message) => errors.push(message),
        setExitCode: (code) => exitCodes.push(code),
      });
      assert.equal(spawned.length, 0);
      assert.equal(exitCodes.at(-1), 1);
      assert.match(errors.join('\n'), scenario.expected);
    });
  }
});

test('mocked launch binds loopback ports, builds with the local marker, waits for health and stops all children on SIGINT', async () => {
  const signalTarget = new EventEmitter();
  const portChecks = [];
  const fetchCalls = [];
  const spawnCalls = [];
  const printed = [];
  const errors = [];
  const exitCodes = [];
  const children = [];
  const sourceEnvironment = validTunnelEnvironment();

  const result = runDevTunnel({
    environment: sourceEnvironment,
    loadEnv: async (filename) => assert.equal(filename, '.env.local'),
    portAvailable: async (port, host) => { portChecks.push([port, host]); return true; },
    spawnProcess: (command, args, options) => {
      const child = new FakeChild();
      children.push(child);
      spawnCalls.push({ command, args, options, child });
      if (command === 'ngrok') {
        setImmediate(() => child.stdout.emit('data', Buffer.from(`${JSON.stringify({
          msg: 'started tunnel', obj: 'tunnels', addr: 'http://127.0.0.1:3847', url: 'https://test-tunnel.ngrok-free.app',
        })}\n`)));
      } else if (args.includes('build')) {
        child.finish(0);
      }
      return child;
    },
    fetchImpl: async (url, options) => {
      fetchCalls.push({ url, options });
      return { ok: true };
    },
    signalTarget,
    print: (line) => {
      printed.push(line);
      setImmediate(() => signalTarget.emit('SIGINT'));
    },
    printError: (line) => errors.push(line),
    setExitCode: (code) => exitCodes.push(code),
  });

  await result;
  assert.deepEqual(portChecks, [[FRONTEND_PORT, '127.0.0.1'], [BACKEND_PORT, '127.0.0.1']]);
  assert.equal(spawnCalls.length, 4);
  assert.equal(spawnCalls[0].command, 'ngrok');
  assert.deepEqual(spawnCalls[0].args.slice(0, 2), ['http', 'http://127.0.0.1:3847']);
  assert.equal(spawnCalls[0].options.env.SUPABASE_SERVICE_ROLE_KEY, undefined);
  assert.equal(spawnCalls[1].args.at(-1), 'build');
  assert.equal(spawnCalls[1].options.env.NODE_ENV, 'production');
  assert.equal(spawnCalls[1].options.env.FISIOZAP_LOCAL_TUNNEL, 'true');
  assert.equal(spawnCalls[1].options.env.FISIOZAP_TUNNEL_RUNTIME, 'local-build');
  assert.equal(spawnCalls[2].options.env.HOST, '127.0.0.1');
  assert.equal(spawnCalls[2].options.env.PORT, '3848');
  assert.equal(spawnCalls[2].options.env.SUPABASE_SERVICE_ROLE_KEY, '');
  assert.equal(spawnCalls[3].options.env.SUPABASE_SERVICE_ROLE_KEY, '');
  assert.equal(spawnCalls[3].args[1], 'start');
  assert.deepEqual(spawnCalls[3].args.slice(-4), ['--hostname', '127.0.0.1', '--port', String(FRONTEND_PORT)]);
  assert.equal(spawnCalls[3].options.env.FISIOZAP_TUNNEL_RUNTIME, 'local-build');
  assert.deepEqual(fetchCalls.map(({ url }) => url), [
    'http://127.0.0.1:3848/health',
    'http://127.0.0.1:3847',
  ]);
  assert.deepEqual(printed, ['https://test-tunnel.ngrok-free.app']);
  assert.deepEqual(errors, []);
  assert.deepEqual(exitCodes, []);
  assert.ok(children[0].kills.includes('SIGTERM'), 'ngrok stops with the local services');
  assert.equal(children[1].kills.length, 0, 'completed build is already stopped');
  assert.ok(children.slice(2).every((child) => child.kills.includes('SIGTERM')));
  assert.equal(signalTarget.listenerCount('SIGINT'), 0);
  assert.equal(signalTarget.listenerCount('SIGTERM'), 0);
});

test('ngrok spawn failure never starts or exposes the application processes', async () => {
  const errors = [];
  const exitCodes = [];
  const spawnCalls = [];
  const missingExecutable = Object.assign(new Error('missing'), { code: 'ENOENT' });
  await runDevTunnel({
    environment: validTunnelEnvironment(),
    loadEnv: async () => {},
    portAvailable: async () => true,
    spawnProcess: (...args) => { spawnCalls.push(args); throw missingExecutable; },
    fetchImpl: async () => assert.fail('no health checks before ngrok starts'),
    signalTarget: new EventEmitter(),
    print: () => assert.fail('do not print a tunnel URL when ngrok is missing'),
    printError: (line) => errors.push(line),
    setExitCode: (code) => exitCodes.push(code),
  });
  assert.equal(spawnCalls.length, 1);
  assert.equal(spawnCalls[0][0], 'ngrok');
  assert.match(errors.join('\n'), /ngrok CLI não encontrado/i);
  assert.deepEqual(exitCodes, [1]);
});

test('invalid ngrok startup URL fails closed before build, backend, or URL display', async () => {
  const children = [];
  const spawnCalls = [];
  const errors = [];
  const exitCodes = [];
  await runDevTunnel({
    environment: validTunnelEnvironment(),
    loadEnv: async () => {},
    portAvailable: async () => true,
    spawnProcess: (command, args, options) => {
      spawnCalls.push({ command, args, options });
      const child = new FakeChild();
      children.push(child);
      setImmediate(() => {
        child.stdout.emit('data', Buffer.from(`${JSON.stringify({
          msg: 'started tunnel', obj: 'tunnels', addr: 'http://127.0.0.1:38470', url: 'https://not-accepted.example',
        })}\n`));
        child.finish(1);
      });
      return child;
    },
    fetchImpl: async () => assert.fail('do not perform network checks for invalid tunnel metadata'),
    signalTarget: new EventEmitter(),
    print: () => assert.fail('do not print untrusted tunnel endpoint'),
    printError: (line) => errors.push(line),
    setExitCode: (code) => exitCodes.push(code),
  });
  assert.equal(spawnCalls.length, 1);
  assert.equal(spawnCalls[0].command, 'ngrok');
  assert.match(errors.join('\n'), /ngrok encerrou antes/i);
  assert.deepEqual(exitCodes, [1]);
  assert.equal(children[0].kills.length, 0, 'already exited ngrok child needs no signal');
});

test('failed local frontend build prevents backend/frontend startup and removes ngrok', async () => {
  const spawnCalls = [];
  const children = [];
  const errors = [];
  const exitCodes = [];
  await runDevTunnel({
    environment: validTunnelEnvironment(),
    loadEnv: async () => {},
    portAvailable: async () => true,
    spawnProcess: (command, args, options) => {
      const child = new FakeChild();
      children.push(child);
      spawnCalls.push({ command, args, options, child });
      if (command === 'ngrok') {
        setImmediate(() => child.stdout.emit('data', Buffer.from(`${JSON.stringify({
          msg: 'started tunnel', obj: 'tunnels', addr: 'http://127.0.0.1:3847', url: 'https://test-tunnel.ngrok-free.app',
        })}\n`)));
      } else {
        child.finish(1);
      }
      return child;
    },
    fetchImpl: async () => assert.fail('no backend health check after a failed frontend build'),
    signalTarget: new EventEmitter(),
    print: () => assert.fail('do not display a tunnel URL after failed build'),
    printError: (line) => errors.push(line),
    setExitCode: (code) => exitCodes.push(code),
  });
  assert.equal(spawnCalls.length, 2);
  assert.equal(spawnCalls[0].command, 'ngrok');
  assert.ok(spawnCalls[1].args.includes('build'));
  assert.match(errors.join('\n'), /compilação local do frontend falhou/i);
  assert.deepEqual(exitCodes, [1]);
  assert.ok(children[0].kills.includes('SIGTERM'));
  assert.equal(children[1].kills.length, 0, 'failed build process already exited');
});
