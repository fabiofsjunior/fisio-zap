begin;
select plan(7);

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

insert into public.clinical_encounters (id, organization_id, patient_id, professional_id)
values
  ('f3000000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000001', 'f2000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000002'),
  ('f3000000-0000-4000-8000-000000000002', 'f1000000-0000-4000-8000-000000000001', 'f2000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000002');

insert into public.clinical_evolutions (id, organization_id, encounter_id, author_id, content)
values
  ('f4000000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000001', 'f3000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000002', 'Rascunho para testar confirmação'),
  ('f4000000-0000-4000-8000-000000000002', 'f1000000-0000-4000-8000-000000000001', 'f3000000-0000-4000-8000-000000000002', 'f0000000-0000-4000-8000-000000000002', 'Rascunho para testar encerramento');

select lives_ok(
  $$update public.clinical_evolutions
    set status='confirmed', confirmed_at='2999-01-01 00:00:00+00'
    where id='f4000000-0000-4000-8000-000000000001'$$,
  'confirmation accepts a draft while replacing a client-supplied timestamp'
);

select ok(
  (select abs(extract(epoch from (confirmed_at - statement_timestamp()))) < 2
   from public.clinical_evolutions where id='f4000000-0000-4000-8000-000000000001'),
  'confirmed_at is assigned from server statement time'
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

select lives_ok(
  $$update public.clinical_encounters
    set status='completed', completed_at=statement_timestamp()
    where id='f3000000-0000-4000-8000-000000000002'$$,
  'encounter can be completed'
);

select throws_ok(
  $$update public.clinical_evolutions set content='rascunho após fechar atendimento'
    where id='f4000000-0000-4000-8000-000000000002'$$,
  'P0001', 'Clinical evolutions require an in-progress encounter',
  'draft evolution cannot be edited after encounter completion'
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
