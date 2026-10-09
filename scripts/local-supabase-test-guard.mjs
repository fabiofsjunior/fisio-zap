// Test fixtures must never mutate a hosted Supabase project.
export function assertLocalSupabaseTestMutations(env = process.env) {
  if (env.FISIOZAP_ALLOW_LOCAL_TEST_MUTATIONS !== 'true') {
    throw new Error('Test mutations require FISIOZAP_ALLOW_LOCAL_TEST_MUTATIONS=true.');
  }
  const raw = env.NEXT_PUBLIC_SUPABASE_URL;
  let url;
  try { url = new URL(raw); } catch { throw new Error('Test mutations require a local HTTP Supabase URL.'); }
  // Check the raw authority too: reject URL parser aliases, credentials and escapes.
  const authority = typeof raw === 'string' && /^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::[0-9]+)?(?:\/|$)/.test(raw);
  if (!authority || url.protocol !== 'http:' || url.username || url.password ||
      !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
      url.search || url.hash || url.pathname !== '/') {
    throw new Error('Test mutations require HTTP loopback (localhost, 127.0.0.1 or [::1]); remote URLs are blocked.');
  }
  return url.href;
}
