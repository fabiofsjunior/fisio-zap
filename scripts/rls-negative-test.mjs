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

function expectDeniedByPolicy(result, label, acceptedCodes = ['42501']) {
  if (!result.error || !acceptedCodes.includes(result.error.code)) {
    throw new Error(`${label}: esperada negação de autorização (${acceptedCodes.join(' ou ')}), recebido ${result.error?.code || 'sucesso'}.`);
  }
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
    const foreignEncounter = await must(admin.from('clinical_encounters').insert({
      organization_id: foreignOrgId, patient_id: foreignPatient.id, professional_id: owner.id,
    }).select('id').single(), 'criar atendimento de outra organização');
    const foreignExercise = await must(admin.from('clinical_exercises').insert({
      organization_id: foreignOrgId, encounter_id: foreignEncounter.id, title: 'Exercício estrangeiro sintético',
    }).select('id').single(), 'criar exercício de outra organização');
    const protocol = await must(admin.from('clinical_protocols').insert({
      organization_id: orgId, title: `Protocolo RLS ${suffix}`,
    }).select('id').single(), 'criar protocolo sintético da organização');
    const foreignProtocol = await must(admin.from('clinical_protocols').insert({
      organization_id: foreignOrgId, title: `Protocolo estrangeiro ${suffix}`,
    }).select('id').single(), 'criar protocolo sintético de outra organização');
    await must(admin.from('clinical_encounter_protocols').insert({
      organization_id: foreignOrgId, encounter_id: foreignEncounter.id, protocol_id: foreignProtocol.id,
    }), 'associar protocolo sintético a atendimento estrangeiro');
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
    const ownerExercise = await must(admin.from('clinical_exercises').insert({
      organization_id: orgId, encounter_id: ownerEncounter.id, title: 'Exercício sintético de colega',
    }).select('id').single(), 'criar exercício sintético de outro profissional');
    await must(admin.from('clinical_encounter_protocols').insert({
      organization_id: orgId, encounter_id: ownerEncounter.id, protocol_id: protocol.id,
    }), 'associar protocolo sintético ao atendimento de outro profissional');
    const ownerEvolution = await must(admin.from('clinical_evolutions').insert({
      organization_id: orgId, encounter_id: ownerEncounter.id, author_id: owner.id,
      content: 'Registro sintético de isolamento RLS.',
    }).select('id').single(), 'criar evolução sintética de outro profissional');
    const login = await must(client.auth.signInWithPassword({ email: testEmail, password: testPassword }), 'login profissional');
    if (!login.session) throw new Error('Login não retornou sessão.');

    const ownMembership = await must(client.from('organization_members').select('organization_id').eq('user_id', professional.id), 'ler memberships');
    if (!ownMembership.some((membership) => membership.organization_id === orgId)) throw new Error('Membership da organização de teste não foi aplicada.');
    const foreignRead = await must(client.from('patients').select('id').eq('id', foreignPatient.id), 'testar leitura cruzada');
    if (foreignRead.length !== 0) throw new Error('RLS falhou: profissional conseguiu ler paciente de organização sem vínculo.');
    const foreignExerciseRead = await must(client.from('clinical_exercises').select('id').eq('id', foreignExercise.id), 'testar leitura de exercício entre organizações');
    if (foreignExerciseRead.length !== 0) throw new Error('RLS falhou: profissional conseguiu ler exercício de outra organização.');
    const foreignProtocolRead = await must(client.from('clinical_protocols').select('id').eq('id', foreignProtocol.id), 'testar leitura de protocolo entre organizações');
    if (foreignProtocolRead.length !== 0) throw new Error('RLS falhou: profissional conseguiu ler protocolo de outra organização.');
    const foreignProtocolLinkRead = await must(client.from('clinical_encounter_protocols').select('protocol_id').eq('encounter_id', foreignEncounter.id), 'testar leitura de vínculo clínico entre organizações');
    if (foreignProtocolLinkRead.length !== 0) throw new Error('RLS falhou: profissional conseguiu ler vínculo clínico de outra organização.');

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
    const ownExercise = await must(client.from('clinical_exercises').insert({
      organization_id: orgId, encounter_id: ownEncounter.id, title: 'Exercício próprio sintético',
    }).select('id').single(), 'associar exercício ao próprio atendimento');
    const peerExerciseRead = await must(client.from('clinical_exercises').select('id').eq('id', ownerExercise.id), 'ler exercício de outro profissional');
    if (peerExerciseRead.length !== 0) throw new Error('RLS falhou: profissional conseguiu ler exercício de outro profissional na mesma organização.');
    const peerExerciseUpdate = await client.from('clinical_exercises').update({ title: 'Tentativa de alteração' })
      .eq('id', ownerExercise.id).select('id');
    if (peerExerciseUpdate.error) throw new Error(`RLS update de exercício retornou erro inesperado: ${peerExerciseUpdate.error.message}`);
    if ((peerExerciseUpdate.data ?? []).length) throw new Error('RLS falhou: profissional alterou exercício de outro profissional.');
    const peerExerciseDelete = await client.from('clinical_exercises').delete().eq('id', ownerExercise.id).select('id');
    if (peerExerciseDelete.error) throw new Error(`RLS delete de exercício retornou erro inesperado: ${peerExerciseDelete.error.message}`);
    if ((peerExerciseDelete.data ?? []).length) throw new Error('RLS falhou: profissional excluiu exercício de outro profissional.');
    const ownExerciseUpdate = await client.from('clinical_exercises').update({ title: 'Exercício próprio atualizado' })
      .eq('id', ownExercise.id).select('id').maybeSingle();
    if (ownExerciseUpdate.error || !ownExerciseUpdate.data) throw new Error(`Profissional não conseguiu atualizar exercício próprio: ${ownExerciseUpdate.error?.message || 'nenhum registro alterado'}`);
    const movedExercise = await client.from('clinical_exercises').update({ organization_id: foreignOrgId })
      .eq('id', ownExercise.id).select('id').maybeSingle();
    expectDeniedByPolicy(movedExercise, 'mover exercício próprio para outra organização');

    const ownProtocol = await must(client.from('clinical_protocols').select('id').eq('id', protocol.id), 'ler protocolo da própria organização');
    if (ownProtocol.length !== 1) throw new Error('RLS bloqueou protocolo da própria organização.');
    const forbiddenProtocolInsert = await client.from('clinical_protocols').insert({
      organization_id: orgId, title: 'Protocolo não autorizado',
    }).select('id').maybeSingle();
    expectDeniedByPolicy(forbiddenProtocolInsert, 'profissional criar protocolo reservado a responsável');
    const deniedProtocolUpdate = await client.from('clinical_protocols').update({ title: 'Tentativa de alteração' })
      .eq('id', protocol.id).select('id');
    if (deniedProtocolUpdate.error) throw new Error(`Atualização de protocolo retornou erro inesperado: ${deniedProtocolUpdate.error.message}`);
    if ((deniedProtocolUpdate.data ?? []).length) throw new Error('RLS falhou: profissional alterou protocolo administrativo.');
    const deniedProtocolDelete = await client.from('clinical_protocols').delete().eq('id', protocol.id).select('id');
    if (deniedProtocolDelete.error) throw new Error(`Exclusão de protocolo retornou erro inesperado: ${deniedProtocolDelete.error.message}`);
    if ((deniedProtocolDelete.data ?? []).length) throw new Error('RLS falhou: profissional excluiu protocolo administrativo.');

    const ownProtocolLink = await must(client.from('clinical_encounter_protocols').insert({
      organization_id: orgId, encounter_id: ownEncounter.id, protocol_id: protocol.id,
    }).select().single(), 'vincular protocolo ao próprio atendimento');
    if (!ownProtocolLink) throw new Error('Falha ao criar vínculo autorizado do protocolo.');
    const peerProtocolLinkRead = await must(client.from('clinical_encounter_protocols').select('protocol_id')
      .eq('encounter_id', ownerEncounter.id), 'ler vínculo clínico de outro profissional');
    if (peerProtocolLinkRead.length !== 0) throw new Error('RLS falhou: profissional conseguiu ler vínculo de atendimento de outro profissional.');
    const peerProtocolLink = await client.from('clinical_encounter_protocols').insert({
      organization_id: orgId, encounter_id: ownerEncounter.id, protocol_id: protocol.id,
    }).select().maybeSingle();
    expectDeniedByPolicy(peerProtocolLink, 'associar protocolo a atendimento de outro profissional');
    const peerProtocolLinkDelete = await client.from('clinical_encounter_protocols').delete()
      .eq('organization_id', orgId).eq('encounter_id', ownerEncounter.id).eq('protocol_id', protocol.id).select();
    if (peerProtocolLinkDelete.error) throw new Error(`RLS delete de vínculo retornou erro inesperado: ${peerProtocolLinkDelete.error.message}`);
    if ((peerProtocolLinkDelete.data ?? []).length) throw new Error('RLS falhou: profissional excluiu vínculo do atendimento de outro profissional.');
    const ownProtocolLinkDelete = await client.from('clinical_encounter_protocols').delete()
      .eq('organization_id', orgId).eq('encounter_id', ownEncounter.id).eq('protocol_id', protocol.id).select();
    if (ownProtocolLinkDelete.error || ownProtocolLinkDelete.data?.length !== 1) {
      throw new Error(`RLS bloqueou a exclusão do vínculo próprio: ${ownProtocolLinkDelete.error?.message || 'nenhum registro removido'}`);
    }
    const foreignProtocolLink = await client.from('clinical_encounter_protocols').insert({
      organization_id: orgId, encounter_id: ownEncounter.id, protocol_id: foreignProtocol.id,
    }).select().maybeSingle();
    expectDeniedByPolicy(foreignProtocolLink, 'associar protocolo de outra organização');

    const foreignExerciseInsert = await client.from('clinical_exercises').insert({
      organization_id: foreignOrgId, encounter_id: foreignEncounter.id, title: 'Tentativa de exercício cruzado',
    }).select('id').maybeSingle();
    expectDeniedByPolicy(foreignExerciseInsert, 'inserir exercício em organização sem vínculo');
    const peerEncounter = await must(client.from('clinical_encounters').select('id').eq('id', ownerEncounter.id), 'ler atendimento de outro profissional');
    if (peerEncounter.length !== 0) throw new Error('RLS falhou: profissional conseguiu ler atendimento de outro profissional na mesma organização.');
    const peerEvolution = await must(client.from('clinical_evolutions').select('id').eq('id', ownerEvolution.id), 'ler evolução de outro profissional');
    if (peerEvolution.length !== 0) throw new Error('RLS falhou: profissional conseguiu ler evolução de outro profissional na mesma organização.');

    const forgedEncounter = await client.from('clinical_encounters').insert({
      organization_id: orgId, patient_id: patient.id, professional_id: professional.id,
    }).select('id').maybeSingle();
    expectDeniedByPolicy(forgedEncounter, 'iniciar atendimento para paciente atribuído a outro profissional');

    const foreignEvolution = await client.from('clinical_evolutions').insert({
      organization_id: orgId, encounter_id: ownerEncounter.id, author_id: professional.id,
      content: 'Tentativa sintética não autorizada.',
    }).select('id').maybeSingle();
    expectDeniedByPolicy(foreignEvolution, 'inserir evolução em atendimento de outro profissional', ['42501', 'P0001']);

    const forgedAuthor = await client.from('clinical_evolutions').insert({
      organization_id: orgId, encounter_id: professionalEncounter.id, author_id: owner.id,
      content: 'Tentativa sintética de falsificar autoria.',
    }).select('id').maybeSingle();
    expectDeniedByPolicy(forgedAuthor, 'criar evolução em nome de outra pessoa');

    const peerUpdate = await client.from('clinical_evolutions').update({ content: 'Tentativa de alteração cruzada.' })
      .eq('id', ownerEvolution.id).select('id');
    if (peerUpdate.error) throw new Error(`RLS update clínico retornou erro inesperado: ${peerUpdate.error.message}`);
    if (peerUpdate.data.length !== 0) throw new Error('RLS falhou: profissional alterou evolução de outro profissional.');

    const draftDelete = await client.from('clinical_evolutions').delete().eq('id', ownEvolution.id).select('id').maybeSingle();
    if (draftDelete.error || !draftDelete.data) throw new Error(`Trigger falhou ao excluir rascunho permitido: ${draftDelete.error?.message || 'nenhum registro removido'}`);

    const terminalEncounter = await must(client.from('clinical_encounters').insert({
      organization_id: orgId, patient_id: assignedPatient.id, professional_id: professional.id,
    }).select('id').single(), 'criar atendimento sintético para teste de encerramento');
    const completion = await client.from('clinical_encounters').update({ status: 'completed' })
      .eq('id', terminalEncounter.id).select('id').maybeSingle();
    if (completion.error || !completion.data) throw new Error(`Falha ao concluir atendimento sintético: ${completion.error?.message || 'nenhum registro alterado'}`);

    const reopening = await client.from('clinical_encounters').update({ status: 'in_progress', completed_at: null })
      .eq('id', terminalEncounter.id).select('id');
    if (reopening.error) throw new Error(`Reabertura retornou erro inesperado: ${reopening.error.message}`);
    if ((reopening.data ?? []).length) throw new Error('RLS falhou: profissional reabriu atendimento concluído.');

    const completedDelete = await client.from('clinical_encounters').delete()
      .eq('id', terminalEncounter.id).select('id');
    if (completedDelete.error) throw new Error(`Exclusão retornou erro inesperado: ${completedDelete.error.message}`);
    if ((completedDelete.data ?? []).length) throw new Error('RLS falhou: profissional excluiu atendimento concluído.');

    await client.auth.signOut({ scope: 'local' });

    console.log('RLS NEGATIVE TEST OK');
    console.log(`Memberships do profissional: ${ownMembership.length}`);
    console.log('Leitura/alteração em outra organização: BLOQUEADAS');
    console.log('Acesso a atendimento/evolução de colega na mesma organização: BLOQUEADO');
    console.log('CRUD de exercício próprio e isolamento de exercícios/protocolos/vínculos: VERIFICADOS');
    console.log('Criação para paciente de colega e autoria forjada: BLOQUEADAS');
    console.log('Exclusão de rascunho próprio: PERMITIDA');
    console.log('Reabertura e exclusão de atendimento concluído: BLOQUEADAS');
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
