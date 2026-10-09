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
  let foreignOrgId;
  try {
    const org = await must(admin.from('organizations').insert({
      name: `RLS isolamento ${suffix}`,
      owner_id: owner.id,
    }).select('id').single(), 'criar organização isolada');
    orgId = org.id;

    await must(admin.from('organization_members').insert({
      organization_id: orgId,
      user_id: owner.id,
      role: 'owner',
    }), 'associar responsável à organização isolada');
    await must(admin.from('organization_members').insert({
      organization_id: orgId,
      user_id: professional.id,
      role: 'professional',
    }), 'associar segundo profissional à organização isolada');

    const patient = await must(admin.from('patients').insert({
      organization_id: orgId,
      professional_id: owner.id,
      full_name: `Paciente RLS responsável ${suffix}`,
    }).select('id').single(), 'criar paciente isolado');

    const foreignOrg = await must(admin.from('organizations').insert({
      name: `RLS sem vínculo ${suffix}`,
      owner_id: owner.id,
    }).select('id').single(), 'criar segunda organização isolada');
    foreignOrgId = foreignOrg.id;
    await must(admin.from('organization_members').insert({
      organization_id: foreignOrgId,
      user_id: owner.id,
      role: 'owner',
    }), 'associar responsável à segunda organização');
    const foreignPatient = await must(admin.from('patients').insert({
      organization_id: foreignOrgId,
      professional_id: owner.id,
      full_name: `Paciente RLS outra organização ${suffix}`,
    }).select('id').single(), 'criar paciente da organização sem vínculo');
    const assignedPatient = await must(admin.from('patients').insert({
      organization_id: orgId,
      professional_id: professional.id,
      full_name: `Paciente RLS profissional ${suffix}`,
    }).select('id').single(), 'criar paciente atribuído ao profissional');
    const ownerEncounter = await must(admin.from('clinical_encounters').insert({
      organization_id: orgId, patient_id: patient.id, professional_id: owner.id,
    }).select('id').single(), 'criar atendimento sintético do responsável');
    const professionalEncounter = await must(admin.from('clinical_encounters').insert({
      organization_id: orgId, patient_id: assignedPatient.id, professional_id: professional.id,
    }).select('id').single(), 'criar atendimento sintético do profissional');
    const ownerEvolution = await must(admin.from('clinical_evolutions').insert({
      organization_id: orgId, encounter_id: ownerEncounter.id, author_id: owner.id,
      content: 'Registro sintético de isolamento RLS.',
    }).select('id').single(), 'criar evolução sintética de outro profissional');
    const professionalEvolution = await must(admin.from('clinical_evolutions').insert({
      organization_id: orgId, encounter_id: professionalEncounter.id, author_id: professional.id,
      content: 'Rascunho sintético do profissional de teste.',
    }).select('id').single(), 'criar rascunho sintético do profissional');

    const login = await must(client.auth.signInWithPassword({ email: testEmail, password: testPassword }), 'login profissional');
    if (!login.session) throw new Error('Login não retornou sessão.');

    const ownMembership = await must(client.from('organization_members').select('organization_id').eq('user_id', professional.id), 'ler memberships');
    if (!ownMembership.some((membership) => membership.organization_id === orgId)) throw new Error('Membership da organização de teste não foi aplicada.');
    const foreignRead = await must(client.from('patients').select('id').eq('id', foreignPatient.id), 'testar leitura cruzada');
    if (foreignRead.length !== 0) throw new Error('RLS falhou: profissional conseguiu ler paciente de organização sem vínculo.');

    const foreignUpdate = await client.from('patients').update({ notes: 'bloqueio RLS' }).eq('id', foreignPatient.id).select('id');
    if (foreignUpdate.error) throw new Error(`RLS update retornou erro inesperado: ${foreignUpdate.error.message}`);
    if (foreignUpdate.data.length !== 0) throw new Error('RLS falhou: profissional conseguiu alterar paciente de organização sem vínculo.');

    const sameOrgPatient = await must(client.from('patients').select('id').eq('id', assignedPatient.id), 'ler paciente atribuído ao profissional');
    if (sameOrgPatient.length !== 1) throw new Error('RLS bloqueou o paciente atribuído ao profissional.');
    const ownEncounter = await must(client.from('clinical_encounters').insert({
      organization_id: orgId, patient_id: assignedPatient.id, professional_id: professional.id,
    }).select('id').single(), 'iniciar atendimento para paciente próprio');
    const ownEvolution = await must(client.from('clinical_evolutions').insert({
      organization_id: orgId, encounter_id: ownEncounter.id, author_id: professional.id,
      content: 'Rascunho sintético autorizado.',
    }).select('id').single(), 'registrar rascunho próprio');
    const peerEncounter = await must(client.from('clinical_encounters').select('id').eq('id', ownerEncounter.id), 'ler atendimento de outro profissional');
    if (peerEncounter.length !== 0) throw new Error('RLS falhou: profissional conseguiu ler atendimento de outro profissional na mesma organização.');
    const peerEvolution = await must(client.from('clinical_evolutions').select('id').eq('id', ownerEvolution.id), 'ler evolução de outro profissional');
    if (peerEvolution.length !== 0) throw new Error('RLS falhou: profissional conseguiu ler evolução de outro profissional na mesma organização.');

    const forgedEncounter = await client.from('clinical_encounters').insert({
      organization_id: orgId, patient_id: patient.id, professional_id: professional.id,
    }).select('id').maybeSingle();
    if (!forgedEncounter.error && forgedEncounter.data) throw new Error('RLS falhou: profissional iniciou atendimento para paciente atribuído a outro profissional.');

    const foreignEvolution = await client.from('clinical_evolutions').insert({
      organization_id: orgId, encounter_id: ownerEncounter.id, author_id: professional.id,
      content: 'Tentativa sintética não autorizada.',
    }).select('id').maybeSingle();
    if (!foreignEvolution.error && foreignEvolution.data) throw new Error('RLS falhou: profissional inseriu evolução em atendimento de outro profissional.');

    const forgedAuthor = await client.from('clinical_evolutions').insert({
      organization_id: orgId, encounter_id: professionalEncounter.id, author_id: owner.id,
      content: 'Tentativa sintética de falsificar autoria.',
    }).select('id').maybeSingle();
    if (!forgedAuthor.error && forgedAuthor.data) throw new Error('RLS falhou: profissional criou evolução em nome de outra pessoa.');

    const peerUpdate = await client.from('clinical_evolutions').update({ content: 'Tentativa de alteração cruzada.' })
      .eq('id', ownerEvolution.id).select('id');
    if (peerUpdate.error) throw new Error(`RLS update clínico retornou erro inesperado: ${peerUpdate.error.message}`);
    if (peerUpdate.data.length !== 0) throw new Error('RLS falhou: profissional alterou evolução de outro profissional.');

    const draftDelete = await client.from('clinical_evolutions').delete().eq('id', ownEvolution.id).select('id').maybeSingle();
    if (draftDelete.error || !draftDelete.data) throw new Error(`Trigger falhou ao excluir rascunho permitido: ${draftDelete.error?.message || 'nenhum registro removido'}`);

    await client.auth.signOut({ scope: 'local' });

    console.log('RLS NEGATIVE TEST OK');
    console.log(`Memberships do profissional: ${ownMembership.length}`);
    console.log('Leitura/alteração em outra organização: BLOQUEADAS');
    console.log('Acesso a atendimento/evolução de colega na mesma organização: BLOQUEADO');
    console.log('Criação para paciente de colega e autoria forjada: BLOQUEADAS');
    console.log('Exclusão de rascunho próprio: PERMITIDA');
  } finally {
    for (const cleanupOrgId of [orgId, foreignOrgId].filter(Boolean)) {
      const cleanupSteps = [
        ['clinical_encounter_protocols', admin.from('clinical_encounter_protocols').delete().eq('organization_id', cleanupOrgId)],
        ['clinical_exercises', admin.from('clinical_exercises').delete().eq('organization_id', cleanupOrgId)],
        ['clinical_evolutions', admin.from('clinical_evolutions').delete().eq('organization_id', cleanupOrgId)],
        ['clinical_encounters', admin.from('clinical_encounters').delete().eq('organization_id', cleanupOrgId)],
        ['clinical_protocols', admin.from('clinical_protocols').delete().eq('organization_id', cleanupOrgId)],
        ['patients', admin.from('patients').delete().eq('organization_id', cleanupOrgId)],
        ['organizations', admin.from('organizations').delete().eq('id', cleanupOrgId)],
      ];
      for (const [table, query] of cleanupSteps) {
        const { error } = await query;
        if (error) throw new Error(`Falha ao limpar dados RLS sintéticos em ${table}: ${error.message}`);
      }
    }
  }
}

main().catch((error) => {
  console.error(`RLS NEGATIVE TEST FALHOU: ${error.message}`);
  process.exit(1);
});
