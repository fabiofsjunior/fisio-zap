import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceRoleKey) {
  throw new Error('Defina NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no ambiente local antes de executar o bootstrap.');
}

const ADMIN_EMAIL = process.env.FISIOZAP_ADMIN_EMAIL || 'admin@fisiozap.local';
const ADMIN_PASSWORD = process.env.FISIOZAP_ADMIN_PASSWORD || 'FisioZap#Admin2026!';
const TEST_EMAIL = process.env.FISIOZAP_TEST_EMAIL || 'teste@fisiozap.local';
const TEST_PASSWORD = process.env.FISIOZAP_TEST_PASSWORD || 'FisioZap#Teste2026!';
const ORG_NAME = process.env.FISIOZAP_TEST_ORG || 'FisioZap — Ambiente de Teste';

const supabase = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function findOrCreateUser(email, password, fullName) {
  const { data, error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw error;
  const existing = data.users.find((user) => user.email?.toLowerCase() === email.toLowerCase());
  if (existing) return existing;

  const created = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });
  if (created.error) throw created.error;
  return created.data.user;
}

async function main() {
  const admin = await findOrCreateUser(ADMIN_EMAIL, ADMIN_PASSWORD, 'FisioZap Admin');
  const test = await findOrCreateUser(TEST_EMAIL, TEST_PASSWORD, 'Profissional de Teste');

  const { data: existingOrg, error: orgLookupError } = await supabase
    .from('organizations')
    .select('id')
    .eq('name', ORG_NAME)
    .maybeSingle();
  if (orgLookupError) throw orgLookupError;

  let organizationId = existingOrg?.id;
  if (!organizationId) {
    const { data: org, error } = await supabase
      .from('organizations')
      .insert({ name: ORG_NAME, owner_id: admin.id })
      .select('id')
      .single();
    if (error) throw error;
    organizationId = org.id;
  }

  for (const membership of [
    { organization_id: organizationId, user_id: admin.id, role: 'owner' },
    { organization_id: organizationId, user_id: test.id, role: 'professional' },
  ]) {
    const { error } = await supabase
      .from('organization_members')
      .upsert(membership, { onConflict: 'organization_id,user_id' });
    if (error) throw error;
  }

  console.log('');
  console.log('FisioZap — contas de teste prontas');
  console.log(`Admin: ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`);
  console.log(`Teste: ${TEST_EMAIL} / ${TEST_PASSWORD}`);
  console.log(`Organização: ${ORG_NAME}`);
  console.log('Admin role: owner | Test role: professional');
}

main().catch((error) => {
  console.error('Falha no bootstrap:', error.message);
  process.exit(1);
});
