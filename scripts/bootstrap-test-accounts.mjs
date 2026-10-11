import { createClient } from '@supabase/supabase-js';
import { assertLocalSupabaseTestMutations } from './local-supabase-test-guard.mjs';

assertLocalSupabaseTestMutations();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const adminEmail = process.env.FISIOZAP_ADMIN_EMAIL;
const adminPassword = process.env.FISIOZAP_ADMIN_PASSWORD;
const testEmail = process.env.FISIOZAP_TEST_EMAIL;
const testPassword = process.env.FISIOZAP_TEST_PASSWORD;
const orgName = process.env.FISIOZAP_TEST_ORG;

for (const [name, value] of Object.entries({
  url,
  key,
  anonKey,
  adminEmail,
  adminPassword,
  testEmail,
  testPassword,
  orgName,
})) {
  if (!value) throw new Error(`Variável obrigatória ausente: ${name}`);
}

const adminDb = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const authDb = createClient(url, anonKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function user(email, password, name) {
  const list = await adminDb.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (list.error) throw list.error;

  const existing = list.data.users.find(
    (item) => item.email?.toLowerCase() === email.toLowerCase(),
  );

  if (existing) {
    const result = await adminDb.auth.admin.updateUserById(existing.id, {
      password,
      email_confirm: true,
      user_metadata: { ...existing.user_metadata, full_name: name },
    });

    if (result.error) throw result.error;
    return result.data.user;
  }

  const result = await adminDb.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: name },
  });

  if (result.error) throw result.error;
  return result.data.user;
}

async function verifyLogin(label, email, password) {
  const { data, error } = await authDb.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    throw new Error(`${label}: login de validação falhou (${error.message})`);
  }

  if (!data.user?.id || !data.session?.access_token) {
    throw new Error(`${label}: Supabase não retornou uma sessão válida.`);
  }

  await authDb.auth.signOut();
  console.log(`${label}: OK`);
}

async function main() {
  const admin = await user(adminEmail, adminPassword, 'FisioZap Admin');
  const test = await user(testEmail, testPassword, 'Profissional de Teste');

  const found = await adminDb
    .from('organizations')
    .select('id')
    .eq('name', orgName)
    .maybeSingle();

  if (found.error) throw found.error;

  let orgId = found.data?.id;

  if (!orgId) {
    const created = await adminDb
      .from('organizations')
      .insert({ name: orgName, owner_id: admin.id })
      .select('id')
      .single();

    if (created.error) throw created.error;
    orgId = created.data.id;
  }

  for (const member of [
    { organization_id: orgId, user_id: admin.id, role: 'owner' },
    { organization_id: orgId, user_id: test.id, role: 'professional' },
  ]) {
    const result = await adminDb
      .from('organization_members')
      .upsert(member, { onConflict: 'organization_id,user_id' });

    if (result.error) throw result.error;
  }

  await verifyLogin('ADMIN', adminEmail, adminPassword);
  await verifyLogin('TESTE', testEmail, testPassword);

  console.log('Contas de teste sincronizadas e login validado.');
}

main().catch((error) => {
  console.error('Falha no bootstrap:', error.message);
  process.exit(1);
});
