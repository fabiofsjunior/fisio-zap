export function localTunnelConfig(env) {
  const enabled = env.FISIOZAP_LOCAL_TUNNEL === 'true' && env.FISIOZAP_TUNNEL_RUNTIME === 'local-build';
  if (!enabled) return { allowedDevOrigins: ['127.0.0.1', 'localhost'], async rewrites() { return []; } };
  const raw = env.FISIOZAP_DEV_TUNNEL_ORIGIN || '';
  const origin = new URL(raw);
  if (/[\s\\*]/.test(raw) || [...raw].some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) > 126) || ![origin.origin, `${origin.origin}/`].includes(raw)) {
    throw new Error('Origem HTTPS do túnel inválida.');
  }
  if (origin.protocol !== 'https:' || origin.username || origin.password || origin.port || origin.pathname !== '/' || origin.search || origin.hash) {
    throw new Error('Origem HTTPS do túnel inválida.');
  }
  return {
    allowedDevOrigins: ['127.0.0.1', 'localhost', origin.hostname],
    async rewrites() {
      return [{ source: '/backend/:path*', destination: 'http://127.0.0.1:3848/:path*' }];
    },
  };
}
