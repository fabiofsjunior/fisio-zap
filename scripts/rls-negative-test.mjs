import { createClient } from '@supabase/supabase-js';
import { assertLocalSupabaseTestMutations } from './local-supabase-test-guard.mjs';

assertLocalSupabaseTestMutations();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const adminEmail = process.env.FISIOZAP_ADMIN_EMAIL;
const adminPassword = process.env.FISIOZAP_ADMIN_PASSWORD;
const testEmail = process.env.FISIOZAP_TEST_EMAIL;
const testPassword = process.env.FISIOZAP_TEST_PASSWORD;

for (const [name, value] of Object.entries({ NEXT_PUBLIC_SUPABASE_URL: url, NEXT_PUBLIC_SUPABASE_ANON_KEY: anonKey, SUPABASE_SERVICE_ROLE_KEY: serviceKey, FISIOZAP_ADMIN_EMAIL: adminEmail, FISIOZAP_ADMIN_PASSWORD: adminPassword, FISIOZAP_TEST_EMAIL: testEmail, FISIOZAP_TEST_PASSWORD: testPassword })) {
  if (!value) throw new Error(`Variável obrigatória ausente: ${name}`);
}

const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
const client = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } });
const ownerClient = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } });

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
  let foreignProfessionalId;
  let outsiderId;
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

    const foreignProfessional = await must(admin.auth.admin.createUser({
      email: `rls-foreign-${suffix}@example.test`,
      password: `FisioZap!${suffix}ForeignOnlyLocal`,
      email_confirm: true,
    }), 'criar profissional sintético da organização estrangeira');
    foreignProfessionalId = foreignProfessional.user.id;
    const foreignOrg = await must(admin.from('organizations').insert({
      name: `RLS sem vínculo ${suffix}`,
      owner_id: owner.id,
    }).select('id').single(), 'criar segunda organização isolada');
    foreignOrgId = foreignOrg.id;
    await must(admin.from('organization_members').insert({
      organization_id: foreignOrgId,
      user_id: foreignProfessionalId,
      role: 'professional',
    }), 'associar profissional à organização estrangeira');
    const foreignPatient = await must(admin.from('patients').insert({
      organization_id: foreignOrgId,
      professional_id: foreignProfessionalId,
      full_name: `Paciente RLS outra organização ${suffix}`,
    }).select('id').single(), 'criar paciente da organização sem vínculo');
    const foreignEncounter = await must(admin.from('clinical_encounters').insert({
      organization_id: foreignOrgId, patient_id: foreignPatient.id, professional_id: foreignProfessionalId,
    }).select('id').single(), 'criar atendimento de outra organização');
    const foreignNotification = await must(admin.from('notifications').insert({
      organization_id: foreignOrgId, professional_id: foreignProfessionalId, user_id: foreignProfessionalId,
      type: 'task', title: 'Tarefa RLS sintética', body: 'Lembrete sem dados clínicos.',
      message: 'Lembrete sem dados clínicos.', action_type: 'manual_task', action_data: {},
      priority: 'informational', status: 'unread',
    }).select('id').single(), 'criar tarefa de outra organização');
    const peerNotification = await must(admin.from('notifications').insert({
      organization_id: orgId, professional_id: professional.id, user_id: owner.id,
      type: 'task', title: 'Tarefa de outro profissional', body: 'Lembrete sintético.',
      message: 'Lembrete sintético.', action_type: 'manual_task', action_data: {},
      priority: 'informational', status: 'unread',
    }).select('id').single(), 'criar tarefa de outro profissional');
    const foreignDraftEvolution = await must(admin.from('clinical_evolutions').insert({
      organization_id: foreignOrgId, encounter_id: foreignEncounter.id, author_id: foreignProfessionalId,
      content: 'Rascunho sintético de outra organização.',
    }).select('id').single(), 'criar evolução de outra organização');
    // Positive control: privileged reads confirm both foreign fixtures exist.
    for (const [table, id, label] of [
      ['clinical_encounters', foreignEncounter.id, 'atendimento estrangeiro'],
      ['clinical_evolutions', foreignDraftEvolution.id, 'evolução estrangeira'],
      ['notifications', foreignNotification.id, 'notificação estrangeira'],
      ['notifications', peerNotification.id, 'notificação de colega'],
    ]) await must(admin.from(table).select('id').eq('id', id).single(), `verificar fixture ${label}`);
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
    const financialDate = new Date().toISOString().slice(0, 10);
    const ownerFinancialEntry = await must(admin.from('financial_entries').insert({
      organization_id: orgId, professional_id: owner.id, patient_id: patient.id,
      kind: 'income', entry_type: 'income', amount: '75.25', description: 'Entrada sintética responsável',
      occurred_at: financialDate, due_date: financialDate, paid_at: null,
    }).select('id').single(), 'criar lançamento sintético do responsável');
    const professionalFinancialEntry = await must(admin.from('financial_entries').insert({
      organization_id: orgId, professional_id: professional.id, patient_id: assignedPatient.id,
      kind: 'expense', entry_type: 'expense', amount: '12.50', description: 'Despesa sintética profissional',
      occurred_at: financialDate, due_date: financialDate, paid_at: null,
    }).select('id').single(), 'criar lançamento sintético do profissional');
    const foreignFinancialEntry = await must(admin.from('financial_entries').insert({
      organization_id: foreignOrgId, professional_id: foreignProfessionalId, patient_id: foreignPatient.id,
      kind: 'income', entry_type: 'income', amount: '90.00', description: 'Lançamento sintético isolado',
      occurred_at: financialDate, due_date: financialDate, paid_at: null,
    }).select('id').single(), 'criar lançamento sintético de outra organização');
    const outsider = await must(admin.auth.admin.createUser({
      email: `rls-outsider-${suffix}@example.test`,
      password: `FisioZap!${suffix}OnlyLocal`,
      email_confirm: true,
    }), 'criar usuário sem membership');
    outsiderId = outsider.user.id;
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
    const foreignNotificationRead = await must(client.from('notifications').select('id').eq('id', foreignNotification.id), 'testar leitura de tarefa de outra organização');
    if (foreignNotificationRead.length !== 0) throw new Error('RLS falhou: profissional conseguiu ler tarefa de organização sem vínculo.');
    const peerNotificationRead = await must(client.from('notifications').select('id').eq('id', peerNotification.id), 'testar leitura de tarefa de colega');
    if (peerNotificationRead.length !== 0) throw new Error('RLS falhou: profissional conseguiu ler tarefa de colega.');
    const peerNotificationUpdate = await client.from('notifications').update({ title: 'Tentativa de alteração' }).eq('id', peerNotification.id).select('id');
    if (peerNotificationUpdate.error || (peerNotificationUpdate.data ?? []).length) throw new Error(`RLS falhou: profissional alterou tarefa de colega${peerNotificationUpdate.error ? ` (${peerNotificationUpdate.error.message})` : ''}.`);
    const peerNotificationDelete = await client.from('notifications').delete().eq('id', peerNotification.id).select('id');
    if (peerNotificationDelete.error || (peerNotificationDelete.data ?? []).length) throw new Error(`RLS falhou: profissional excluiu tarefa de colega${peerNotificationDelete.error ? ` (${peerNotificationDelete.error.message})` : ''}.`);
    const forgedNotification = await client.from('notifications').insert({
      organization_id: orgId, professional_id: professional.id, user_id: owner.id,
      type: 'task', title: 'Tarefa atribuída indevidamente', body: 'Lembrete sintético.',
      message: 'Lembrete sintético.', action_type: 'manual_task', action_data: {},
      priority: 'informational', status: 'unread',
    }).select('id').maybeSingle();
    expectDeniedByPolicy(forgedNotification, 'criar tarefa em nome de outro usuário');
    const foreignExerciseRead = await must(client.from('clinical_exercises').select('id').eq('id', foreignExercise.id), 'testar leitura de exercício entre organizações');
    if (foreignExerciseRead.length !== 0) throw new Error('RLS falhou: profissional conseguiu ler exercício de outra organização.');
    const foreignProtocolRead = await must(client.from('clinical_protocols').select('id').eq('id', foreignProtocol.id), 'testar leitura de protocolo entre organizações');
    if (foreignProtocolRead.length !== 0) throw new Error('RLS falhou: profissional conseguiu ler protocolo de outra organização.');
    const foreignProtocolLinkRead = await must(client.from('clinical_encounter_protocols').select('protocol_id').eq('encounter_id', foreignEncounter.id), 'testar leitura de vínculo clínico entre organizações');
    if (foreignProtocolLinkRead.length !== 0) throw new Error('RLS falhou: profissional conseguiu ler vínculo clínico de outra organização.');
    for (const [table, id] of [['clinical_encounters', foreignEncounter.id], ['clinical_evolutions', foreignDraftEvolution.id]]) {
      const rows = await must(client.from(table).select('id').eq('id', id), 'testar leitura clínica cruzada');
      if (rows.length !== 0) throw new Error(`RLS falhou: leitura cruzada em ${table}.`);
    }

    const foreignUpdate = await client.from('patients').update({ notes: 'bloqueio RLS' }).eq('id', foreignPatient.id).select('id');
    if (foreignUpdate.error) throw new Error(`RLS update retornou erro inesperado: ${foreignUpdate.error.message}`);
    if (foreignUpdate.data.length !== 0) throw new Error('RLS falhou: profissional conseguiu alterar paciente de organização sem vínculo.');

    const sameOrgPatient = await must(client.from('patients').select('id').eq('id', assignedPatient.id), 'ler paciente atribuído ao profissional');
    if (sameOrgPatient.length !== 1) throw new Error('RLS bloqueou o paciente atribuído ao profissional.');

    const ownFinancialRead = await must(client.from('financial_entries').select('id').eq('id', professionalFinancialEntry.id), 'ler lançamento financeiro próprio');
    if (ownFinancialRead.length !== 1) throw new Error('RLS bloqueou o lançamento financeiro próprio.');
    for (const [id, label] of [
      [ownerFinancialEntry.id, 'lançamento de colega'],
      [foreignFinancialEntry.id, 'lançamento de outra organização'],
    ]) {
      const hiddenEntry = await must(client.from('financial_entries').select('id').eq('id', id), `testar leitura de ${label}`);
      if (hiddenEntry.length !== 0) throw new Error(`RLS falhou: profissional conseguiu ler ${label}.`);
    }
    const ownFinancialInsert = await must(client.from('financial_entries').insert({
      organization_id: orgId, professional_id: professional.id, patient_id: assignedPatient.id,
      kind: 'income', entry_type: 'income', amount: '0.01', description: 'Controle positivo sintético',
      occurred_at: financialDate, due_date: null, paid_at: null,
    }).select('id').single(), 'criar lançamento financeiro próprio');
    if (!ownFinancialInsert.id) throw new Error('RLS não retornou o lançamento próprio.');
    const zeroFinancialAmount = await client.from('financial_entries').insert({
      organization_id: orgId, professional_id: professional.id, patient_id: assignedPatient.id,
      kind: 'income', entry_type: 'income', amount: '0.00', description: 'Valor zero inválido',
      occurred_at: financialDate, due_date: null, paid_at: null,
    }).select('id').maybeSingle();
    if (zeroFinancialAmount.error?.code !== '23514') throw new Error('Banco aceitou valor zero em lançamento financeiro, deveria aplicar financial_entries_amount_positive_check.');
    const forgedFinanceOwner = await client.from('financial_entries').insert({
      organization_id: orgId, professional_id: owner.id, patient_id: assignedPatient.id,
      kind: 'income', entry_type: 'income', amount: '1.00', description: 'Tentativa de autoria forjada',
      occurred_at: financialDate, due_date: null, paid_at: null,
    }).select('id').maybeSingle();
    expectDeniedByPolicy(forgedFinanceOwner, 'criar lançamento financeiro em nome de colega');
    const hiddenPatientFinance = await client.from('financial_entries').insert({
      organization_id: orgId, professional_id: professional.id, patient_id: patient.id,
      kind: 'income', entry_type: 'income', amount: '1.00', description: 'Tentativa com paciente não visível',
      occurred_at: financialDate, due_date: null, paid_at: null,
    }).select('id').maybeSingle();
    expectDeniedByPolicy(hiddenPatientFinance, 'associar lançamento a paciente de colega');
    const foreignPatientFinance = await client.from('financial_entries').insert({
      organization_id: orgId, professional_id: professional.id, patient_id: foreignPatient.id,
      kind: 'income', entry_type: 'income', amount: '1.00', description: 'Tentativa com paciente estrangeiro',
      occurred_at: financialDate, due_date: null, paid_at: null,
    }).select('id').maybeSingle();
    expectDeniedByPolicy(foreignPatientFinance, 'associar lançamento a paciente de outra organização');

    const peerFinanceUpdate = await client.from('financial_entries').update({ paid_at: new Date().toISOString() })
      .eq('id', ownerFinancialEntry.id).select('id');
    if (peerFinanceUpdate.error || (peerFinanceUpdate.data ?? []).length) throw new Error('RLS falhou: profissional alterou lançamento de colega.');
    const forgedProfessionalUpdate = await client.from('financial_entries').update({ professional_id: owner.id })
      .eq('id', ownFinancialInsert.id).select('id').maybeSingle();
    expectDeniedByPolicy(forgedProfessionalUpdate, 'alterar professional_id de lançamento próprio');
    const movedFinancialEntry = await client.from('financial_entries').update({ organization_id: foreignOrgId })
      .eq('id', ownFinancialInsert.id).select('id').maybeSingle();
    expectDeniedByPolicy(movedFinancialEntry, 'mover lançamento próprio para outra organização');
    const linkedHiddenPatient = await client.from('financial_entries').update({ patient_id: patient.id })
      .eq('id', ownFinancialInsert.id).select('id').maybeSingle();
    expectDeniedByPolicy(linkedHiddenPatient, 'alterar lançamento para paciente não visível');
    const ownFinancePayment = await must(client.from('financial_entries').update({ paid_at: new Date().toISOString() })
      .eq('id', ownFinancialInsert.id).select('id').maybeSingle(), 'marcar lançamento próprio como pago');
    if (!ownFinancePayment.id) throw new Error('RLS bloqueou atualização do lançamento próprio.');
    const ownFinanceDelete = await client.from('financial_entries').delete().eq('id', ownFinancialInsert.id).select('id');
    expectDeniedByPolicy(ownFinanceDelete, 'usuário autenticado excluir lançamento financeiro');

    const ownNotification = await must(client.from('notifications').insert({
      organization_id: orgId, professional_id: professional.id, user_id: professional.id,
      type: 'task', title: 'Tarefa própria RLS', body: 'Lembrete sintético.',
      message: 'Lembrete sintético.', action_type: 'manual_task', action_data: {},
      priority: 'informational', status: 'unread',
    }).select('id').single(), 'criar tarefa própria');
    if (!ownNotification.id) throw new Error('RLS não retornou a tarefa própria criada.');
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

    const ownerLogin = await must(ownerClient.auth.signInWithPassword({ email: adminEmail, password: adminPassword }), 'login responsável para teste financeiro');
    if (!ownerLogin.session) throw new Error('Login do responsável não retornou sessão.');
    const ownerLedger = await must(ownerClient.from('financial_entries').select('id').eq('organization_id', orgId), 'responsável consultar livro-caixa da organização');
    if (ownerLedger.length < 3) throw new Error('RLS bloqueou acesso organizacional do responsável ao livro-caixa.');
    const ownerForeignFinance = await must(ownerClient.from('financial_entries').select('id').eq('id', foreignFinancialEntry.id), 'responsável consultar lançamento sem membership');
    if (ownerForeignFinance.length !== 0) throw new Error('RLS falhou: responsável leu finanças de organização sem membership.');
    const ownerPaidPeerEntry = await must(ownerClient.from('financial_entries').update({ paid_at: new Date().toISOString() })
      .eq('id', professionalFinancialEntry.id).select('id').maybeSingle(), 'responsável atualizar pagamento de lançamento da organização');
    if (!ownerPaidPeerEntry.id) throw new Error('RLS bloqueou atualização de pagamento do responsável.');
    const ownerAssignNonMember = await ownerClient.from('financial_entries').insert({
      organization_id: orgId, professional_id: outsiderId, patient_id: null,
      kind: 'expense', entry_type: 'expense', amount: '1.00', description: 'Tentativa de atribuição sem membership',
      occurred_at: financialDate, due_date: null, paid_at: null,
    }).select('id').maybeSingle();
    expectDeniedByPolicy(ownerAssignNonMember, 'responsável atribuir lançamento a usuário sem membership');
    await ownerClient.auth.signOut({ scope: 'local' });

    await must(admin.from('organization_members').update({ role: 'coordinator' })
      .eq('organization_id', orgId).eq('user_id', professional.id), 'promover profissional sintético ao perfil coordinator');
    await client.auth.signOut({ scope: 'local' });
    const coordinatorLogin = await must(client.auth.signInWithPassword({ email: testEmail, password: testPassword }), 'login coordinator para teste financeiro');
    if (!coordinatorLogin.session) throw new Error('Login coordinator não retornou sessão.');
    const coordinatorLedger = await must(client.from('financial_entries').select('id').eq('organization_id', orgId), 'perfil coordinator consultar livro-caixa');
    if (coordinatorLedger.length < 3) throw new Error('RLS bloqueou acesso financeiro organizacional do perfil coordinator.');
    const coordinatorPatient = await must(client.from('patients').select('id').eq('id', patient.id), 'perfil coordinator consultar paciente da organização');
    if (coordinatorPatient.length !== 1) throw new Error('RLS bloqueou acesso organizacional vigente do coordinator aos pacientes.');
    const coordinatorClinicalRead = await must(client.from('clinical_encounters').select('id').eq('id', ownerEncounter.id), 'perfil coordinator consultar atendimento da organização');
    if (coordinatorClinicalRead.length !== 1) throw new Error('RLS bloqueou acesso clínico organizacional vigente do coordinator.');
    const coordinatorPaidPeerEntry = await must(client.from('financial_entries').update({ paid_at: new Date().toISOString() })
      .eq('id', ownerFinancialEntry.id).select('id').maybeSingle(), 'coordinator atualizar pagamento de lançamento da organização');
    if (!coordinatorPaidPeerEntry.id) throw new Error('RLS bloqueou atualização de pagamento do coordinator.');
    const coordinatorOrgPatientEntry = await must(client.from('financial_entries').insert({
      organization_id: orgId, professional_id: professional.id, patient_id: patient.id,
      kind: 'income', entry_type: 'income', amount: '2.00', description: 'Lançamento coordinator com paciente organizacional',
      occurred_at: financialDate, due_date: null, paid_at: null,
    }).select('id').single(), 'coordinator associar paciente visível na organização');
    if (!coordinatorOrgPatientEntry.id) throw new Error('RLS bloqueou associação organizacional do coordinator ao paciente.');
    await client.auth.signOut({ scope: 'local' });

    await must(admin.from('organization_members').update({ role: 'administrative' })
      .eq('organization_id', orgId).eq('user_id', professional.id), 'promover profissional sintético ao perfil administrative');
    const administrativeLogin = await must(client.auth.signInWithPassword({ email: testEmail, password: testPassword }), 'login administrative para teste financeiro');
    if (!administrativeLogin.session) throw new Error('Login administrative não retornou sessão.');
    const administrativeLedger = await must(client.from('financial_entries').select('id').eq('organization_id', orgId), 'perfil administrative consultar livro-caixa');
    if (administrativeLedger.length < 3) throw new Error('RLS bloqueou acesso financeiro organizacional do perfil administrative.');
    const administrativePaidPeerEntry = await must(client.from('financial_entries').update({ paid_at: null })
      .eq('id', ownerFinancialEntry.id).select('id').maybeSingle(), 'administrative atualizar pagamento de lançamento da organização');
    if (!administrativePaidPeerEntry.id) throw new Error('RLS bloqueou atualização financeira organizacional do perfil administrative.');
    const administrativePeerPatient = await must(client.from('patients').select('id').eq('id', patient.id), 'perfil administrative tentar ler paciente não atribuído');
    if (administrativePeerPatient.length !== 0) throw new Error('RLS falhou: perfil administrative ampliou leitura clínica de pacientes.');
    const administrativeClinicalRead = await must(client.from('clinical_encounters').select('id').eq('id', ownerEncounter.id), 'perfil administrative tentar ler atendimento clínico de colega');
    if (administrativeClinicalRead.length !== 0) throw new Error('RLS falhou: perfil administrative ampliou acesso a atendimentos clínicos.');
    const administrativeHiddenPatientFinance = await client.from('financial_entries').insert({
      organization_id: orgId, professional_id: professional.id, patient_id: patient.id,
      kind: 'expense', entry_type: 'expense', amount: '1.00', description: 'Tentativa administrativa não visível',
      occurred_at: financialDate, due_date: null, paid_at: null,
    }).select('id').maybeSingle();
    expectDeniedByPolicy(administrativeHiddenPatientFinance, 'perfil administrative associar paciente não atribuído');
    const administrativeAssignedPatientFinance = await must(client.from('financial_entries').insert({
      organization_id: orgId, professional_id: professional.id, patient_id: assignedPatient.id,
      kind: 'expense', entry_type: 'expense', amount: '3.00', description: 'Lançamento administrative com paciente atribuído',
      occurred_at: financialDate, due_date: null, paid_at: null,
    }).select('id').single(), 'perfil administrative associar paciente atribuído');
    if (!administrativeAssignedPatientFinance.id) throw new Error('RLS bloqueou associação do administrative ao paciente atribuído.');
    await client.auth.signOut({ scope: 'local' });

    await client.auth.signOut({ scope: 'local' });

    console.log('RLS NEGATIVE TEST OK');
    console.log(`Memberships do profissional: ${ownMembership.length}`);
    console.log('Leitura/alteração em outra organização: BLOQUEADAS');
    console.log('Leitura/alteração/exclusão de tarefa de colega e atribuição forjada: BLOQUEADAS');
    console.log('Leitura de atendimentos e evoluções em outra organização: BLOQUEADA');
    console.log('Acesso de owner/coordinator/administrative ao livro-caixa e pagamento permitido: VERIFICADOS');
    console.log('Atribuição financeira fora da membership e exclusão de lançamento: BLOQUEADAS');
    console.log('Acesso a atendimento/evolução de colega na mesma organização: BLOQUEADO');
    console.log('CRUD de exercício próprio e isolamento de exercícios/protocolos/vínculos: VERIFICADOS');
    console.log('Criação para paciente de colega e autoria forjada: BLOQUEADAS');
    console.log('Exclusão de rascunho próprio: PERMITIDA');
    console.log('Reabertura e exclusão de atendimento concluído: BLOQUEADAS');
  } finally {
    for (const cleanupOrgId of [orgId, foreignOrgId].filter(Boolean)) {
      const cleanupSteps = [
        ['financial_entries', admin.from('financial_entries').delete().eq('organization_id', cleanupOrgId)],
        ['clinical_encounter_protocols', admin.from('clinical_encounter_protocols').delete().eq('organization_id', cleanupOrgId)],
        ['notifications', admin.from('notifications').delete().eq('organization_id', cleanupOrgId)],
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
    if (outsiderId) {
      const { error } = await admin.auth.admin.deleteUser(outsiderId);
      if (error) throw new Error(`Falha ao remover usuário RLS sintético sem membership: ${error.message}`);
    }
    if (foreignProfessionalId) {
      const { error } = await admin.auth.admin.deleteUser(foreignProfessionalId);
      if (error) throw new Error(`Falha ao remover profissional sintético estrangeiro: ${error.message}`);
    }
  }
}

main().catch((error) => {
  console.error(`RLS NEGATIVE TEST FALHOU: ${error.message}`);
  process.exit(1);
});
