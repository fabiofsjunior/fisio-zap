import { createClient } from '@supabase/supabase-js';
import { assertLocalSupabaseTestMutations } from './local-supabase-test-guard.mjs';

assertLocalSupabaseTestMutations();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const orgName = process.env.FISIOZAP_TEST_ORG;

for (const [name, value] of Object.entries({ url, key, orgName })) {
  if (!value) throw new Error(`Variável obrigatória ausente: ${name}`);
}

const db = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function randomPart(length = 10) {
  return crypto.randomUUID().replaceAll('-', '').slice(0, length);
}

async function main() {
  const suffix = randomPart();
  const email = `usuarioparatestes${suffix}@fisiozap.local`;
  const password = `Teste!${randomPart(12)}aA1`;

  const org = await db.from('organizations').select('id').eq('name', orgName).maybeSingle();
  if (org.error) throw org.error;
  if (!org.data?.id) throw new Error('Organização de testes não encontrada. Execute npm run bootstrap:test-accounts primeiro.');

  const created = await db.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: `Usuário para testes ${suffix}` },
  });
  if (created.error || !created.data.user) throw created.error || new Error('Não foi possível criar o usuário.');

  const member = await db.from('organization_members').upsert(
    { organization_id: org.data.id, user_id: created.data.user.id, role: 'professional' },
    { onConflict: 'organization_id,user_id' },
  );

  if (member.error) {
    await db.auth.admin.deleteUser(created.data.user.id);
    throw member.error;
  }

  console.log('');
  console.log('USUÁRIO DE TESTE GERADO');
  console.log('------------------------');
  console.log(`Usuário: ${email}`);
  console.log(`Senha:   ${password}`);
  console.log('Perfil:  professional');
  console.log('');
  console.log('Use estas credenciais em http://localhost:3000/login');
  console.log('A senha não será exibida novamente.');
}

main().catch((error) => {
  console.error('Falha ao criar usuário de teste:', error.message);
  process.exit(1);
});
