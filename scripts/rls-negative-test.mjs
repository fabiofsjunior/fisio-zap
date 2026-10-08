import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const adminEmail = process.env.FISIOZAP_ADMIN_EMAIL;
const testEmail = process.env.FISIOZAP_TEST_EMAIL;
const testPassword = process.env.FISIOZAP_TEST_PASSWORD;

for (const [name, value] of Object.entries({ NEXT_PUBLIC_SUPABASE_URL: url, NEXT_PUBLIC_SUPABASE_ANON_KEY: anonKey, SUPABASE_SERVICE_ROLE_KEY: serviceKey, FISIOZAP_ADMIN_EMAIL: adminEmail, FISIOZAP_TEST_EMAIL: testEmail, FISIOZAP_TEST_PASSWORD: testPassword })) {
  if (!value) throw new Error(`Variável obrigatória ausente: ${name}`);
}

const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
const client = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } });

async function must(promise, label) {
  const { data, error } = await promise;
  if (error) throw new Error(`${label}: ${error.message}`);
  return data;
}

async function main() {
  const users = await must(admin.auth.admin.listUsers({ page: 1, perPage: 1000 }), 'listar usuários');
  const owner = users.users.find((u) => u.email?.toLowerCase() === adminEmail.toLowerCase());
  const professional = users.users.find((u) => u.email?.toLowerCase() === testEmail.toLowerCase());
  if (!owner || !professional) throw new Error('Contas de teste não encontradas. Execute npm run bootstrap:test-accounts primeiro.');

  const suffix = Date.now().toString(36);
  let orgId;
  try {
    const org = await must(admin.from('organizations').insert({
      name: `RLS isolamento ${suffix}`,
      owner_id: owner.id,
    }).select('id').single(), 'criar organização isolada');
    orgId = org.id;

    const patient = await must(admin.from('patients').insert({
      organization_id: orgId,
      professional_id: owner.id,
      full_name: `Paciente RLS ${suffix}`,
    }).select('id').single(), 'criar paciente isolado');

    const login = await must(client.auth.signInWithPassword({ email: testEmail, password: testPassword }), 'login profissional');
    if (!login.session) throw new Error('Login não retornou sessão.');

    const ownMembership = await must(client.from('organization_members').select('organization_id').eq('user_id', professional.id), 'ler memberships');
    const foreignRead = await must(client.from('patients').select('id').eq('id', patient.id), 'testar leitura cruzada');
    if (foreignRead.length !== 0) throw new Error('RLS falhou: profissional conseguiu ler paciente de organização sem vínculo.');

    const foreignUpdate = await client.from('patients').update({ notes: 'bloqueio RLS' }).eq('id', patient.id).select('id');
    if (foreignUpdate.error) throw new Error(`RLS update retornou erro inesperado: ${foreignUpdate.error.message}`);
    if (foreignUpdate.data.length !== 0) throw new Error('RLS falhou: profissional conseguiu alterar paciente de organização sem vínculo.');

    await client.auth.signOut({ scope: 'local' });

    console.log('RLS NEGATIVE TEST OK');
    console.log(`Memberships do profissional: ${ownMembership.length}`);
    console.log('Leitura de organização sem vínculo: BLOQUEADA');
    console.log('Alteração de paciente de organização sem vínculo: BLOQUEADA');
  } finally {
    if (orgId) await admin.from('organizations').delete().eq('id', orgId);
  }
}

main().catch((error) => {
  console.error(`RLS NEGATIVE TEST FALHOU: ${error.message}`);
  process.exit(1);
});
