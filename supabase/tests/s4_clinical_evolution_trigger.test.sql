begin;
select plan(19);
select is(
  (select count(*)::integer from pg_constraint where conrelid = 'public.patients'::regclass and conname = 'patients_s4_org_id_unique'),
  1,
  'patients has the organization-scoped key required by clinical encounters'
);

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('f0000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 's4-owner@test.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('f0000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 's4-professional@test.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

insert into public.organizations (id, name, owner_id)
values ('f1000000-0000-4000-8000-000000000001', 'S4 pgTAP synthetic org', 'f0000000-0000-4000-8000-000000000001');

insert into public.organization_members (organization_id, user_id, role) values
  ('f1000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000001', 'owner'),
  ('f1000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000002', 'professional');

insert into public.patients (id, organization_id, professional_id, full_name)
values ('f2000000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000002', 'Paciente sintético pgTAP');

insert into public.appointments (id, organization_id, patient_id, professional_id, starts_at, ends_at, status)
values (
  'f5000000-0000-4000-8000-000000000001',
  'f1000000-0000-4000-8000-000000000001',
  'f2000000-0000-4000-8000-000000000001',
  'f0000000-0000-4000-8000-000000000002',
  '2026-10-09 09:00:00+00',
  '2026-10-09 10:00:00+00',
  'scheduled'
);

insert into public.clinical_encounters (
  id, organization_id, patient_id, professional_id, appointment_id, started_at, created_at, updated_at
)
values
  ('f3000000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000001', 'f2000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000002', null, '2999-01-01', '2999-01-01', '2999-01-01'),
  ('f3000000-0000-4000-8000-000000000002', 'f1000000-0000-4000-8000-000000000001', 'f2000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000002', 'f5000000-0000-4000-8000-000000000001', '2999-01-01', '2999-01-01', '2999-01-01');

insert into public.clinical_evolutions (id, organization_id, encounter_id, author_id, content, created_at, updated_at)
values
  ('f4000000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000001', 'f3000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000002', 'Rascunho para testar confirmação', '2999-01-01', '2999-01-01'),
  ('f4000000-0000-4000-8000-000000000002', 'f1000000-0000-4000-8000-000000000001', 'f3000000-0000-4000-8000-000000000002', 'f0000000-0000-4000-8000-000000000002', 'Rascunho para testar encerramento', '2999-01-01', '2999-01-01');

insert into public.clinical_exercises (id, organization_id, encounter_id, title, created_at)
values ('f6000000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000001', 'f3000000-0000-4000-8000-000000000001', 'Exercício sintético', '2999-01-01');

insert into public.clinical_protocols (id, organization_id, title, created_at)
values ('f7000000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000001', 'Protocolo sintético', '2999-01-01');

select ok(
  (select created_at < '2999-01-01'::timestamptz from public.clinical_exercises where id='f6000000-0000-4000-8000-000000000001'),
  'exercise creation timestamp is assigned by the server'
);

select throws_ok(
  $update public.clinical_exercises set created_at='2999-01-01' where id='f6000000-0000-4000-8000-000000000001'$,
  'P0001', 'Clinical record creation timestamp is immutable',
  'exercise creation timestamp cannot be changed'
);

select ok(
  (select created_at < '2999-01-01'::timestamptz from public.clinical_protocols where id='f7000000-0000-4000-8000-000000000001'),
  'protocol creation timestamp is assigned by the server'
);

select throws_ok(
  $update public.clinical_protocols set created_at='2999-01-01' where id='f7000000-0000-4000-8000-000000000001'$,
  'P0001', 'Clinical record creation timestamp is immutable',
  'protocol creation timestamp cannot be changed'
);


select ok(
  (select abs(extract(epoch from (started_at - statement_timestamp()))) < 5
      and abs(extract(epoch from (created_at - statement_timestamp()))) < 5
      and abs(extract(epoch from (updated_at - statement_timestamp()))) < 5
   from public.clinical_encounters where id='f3000000-0000-4000-8000-000000000001'),
  'encounter timestamps are assigned by the server'
);

select throws_ok(
  $$insert into public.clinical_encounters (
      id, organization_id, patient_id, professional_id, status, completed_at
    ) values (
      'f3000000-0000-4000-8000-000000000003',
      'f1000000-0000-4000-8000-000000000001',
      'f2000000-0000-4000-8000-000000000001',
      'f0000000-0000-4000-8000-000000000002',
      'completed', '2999-01-01'
    )$$,
  'P0001', 'Clinical encounters must start in progress',
  'encounters cannot be inserted as completed'
);

select ok(
  (select abs(extract(epoch from (created_at - statement_timestamp()))) < 5
      and abs(extract(epoch from (updated_at - statement_timestamp()))) < 5
   from public.clinical_evolutions where id='f4000000-0000-4000-8000-000000000001'),
  'draft evolution timestamps are assigned by the server'
);

select lives_ok(
  $$update public.clinical_evolutions
    set status='confirmed', confirmed_at='2999-01-01 00:00:00+00'
    where id='f4000000-0000-4000-8000-000000000001'$$,
  'confirmation accepts a draft while replacing a client-supplied timestamp'
);

select ok(
  (select abs(extract(epoch from (confirmed_at - statement_timestamp()))) < 2
      and confirmed_at=updated_at
   from public.clinical_evolutions where id='f4000000-0000-4000-8000-000000000001'),
  'confirmation timestamps are assigned by the server'
);

select throws_ok(
  $$update public.clinical_evolutions set content='alteração proibida'
    where id='f4000000-0000-4000-8000-000000000001'$$,
  'P0001', 'Confirmed clinical evolution is immutable',
  'confirmed evolution content cannot be changed'
);

select throws_ok(
  $$delete from public.clinical_evolutions
    where id='f4000000-0000-4000-8000-000000000001'$$,
  'P0001', 'Confirmed clinical evolution is immutable',
  'confirmed evolution cannot be deleted'
);

select throws_ok(
  $$update public.clinical_encounters
    set status='completed', completed_at=statement_timestamp()
    where id='f3000000-0000-4000-8000-000000000002'$$,
  'P0001', 'Confirm or delete draft evolutions before completing the encounter',
  'encounter cannot be completed while a draft remains'
);

select throws_ok(
  $$update public.clinical_evolutions
    set encounter_id='f3000000-0000-4000-8000-000000000001'
    where id='f4000000-0000-4000-8000-000000000002'$$,
  'P0001', 'Clinical evolution identity is immutable',
  'draft evolution cannot be moved to another encounter'
);

select lives_ok(
  $$delete from public.clinical_evolutions
    where id='f4000000-0000-4000-8000-000000000002'$$,
  'draft evolution can be discarded before completion'
);

select lives_ok(
  $$update public.clinical_encounters
    set status='completed', completed_at=statement_timestamp()
    where id='f3000000-0000-4000-8000-000000000002'$$,
  'encounter can be completed after draft resolution'
);

select throws_ok(
  $$update public.clinical_encounters
    set status='in_progress', completed_at=null
    where id='f3000000-0000-4000-8000-000000000002'$$,
  'P0001', 'Completed clinical encounters are immutable',
  'completed encounters cannot be reopened'
);

select throws_ok(
  $$update public.appointments
    set professional_id='f0000000-0000-4000-8000-000000000001'
    where id='f5000000-0000-4000-8000-000000000001'$$,
  '23503', null,
  'appointment professional cannot change while linked to an encounter'
);

select throws_ok(
  $$insert into public.clinical_evolutions (
      organization_id, encounter_id, author_id, content, status, confirmed_at
    ) values (
      'f1000000-0000-4000-8000-000000000001',
      'f3000000-0000-4000-8000-000000000001',
      'f0000000-0000-4000-8000-000000000002',
      'tentativa de inserir já confirmado', 'confirmed', statement_timestamp()
    )$$,
  'P0001', 'Clinical evolutions must be inserted as drafts',
  'confirmed evolutions must begin as drafts'
);

select * from finish();
rollback;
