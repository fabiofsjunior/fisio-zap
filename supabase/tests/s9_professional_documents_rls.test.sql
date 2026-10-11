begin;
select plan(17);

select ok(
  (select c.relrowsecurity from pg_class c where c.oid = 'public.professional_documents'::regclass),
  'professional_documents has row level security enabled'
);

select ok(
  not has_table_privilege('anon', 'public.professional_documents', 'SELECT,INSERT,UPDATE,DELETE'),
  'anonymous clients have no table privileges'
);

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('f9000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 's9-owner@test.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('f9000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 's9-professional@test.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('f9000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 's9-peer@test.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('f9000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 's9-admin@test.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('f9000000-0000-4000-8000-000000000005', 'authenticated', 'authenticated', 's9-outsider@test.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

insert into public.organizations (id, name, owner_id) values
  ('f9100000-0000-4000-8000-000000000001', 'S9 document org', 'f9000000-0000-4000-8000-000000000001'),
  ('f9100000-0000-4000-8000-000000000002', 'S9 unrelated org', 'f9000000-0000-4000-8000-000000000005');

insert into public.organization_members (organization_id, user_id, role) values
  ('f9100000-0000-4000-8000-000000000001', 'f9000000-0000-4000-8000-000000000001', 'owner'),
  ('f9100000-0000-4000-8000-000000000001', 'f9000000-0000-4000-8000-000000000002', 'professional'),
  ('f9100000-0000-4000-8000-000000000001', 'f9000000-0000-4000-8000-000000000003', 'professional'),
  ('f9100000-0000-4000-8000-000000000001', 'f9000000-0000-4000-8000-000000000004', 'administrative'),
  ('f9100000-0000-4000-8000-000000000002', 'f9000000-0000-4000-8000-000000000005', 'owner');

insert into public.professional_documents (
  id, organization_id, professional_id, name, document_type, reference, expires_on, status
) values
  ('f9200000-0000-4000-8000-000000000001', 'f9100000-0000-4000-8000-000000000001', 'f9000000-0000-4000-8000-000000000002', 'Registro profissional', 'registration', 'REG-123', current_date - 1, 'active'),
  ('f9200000-0000-4000-8000-000000000002', 'f9100000-0000-4000-8000-000000000001', 'f9000000-0000-4000-8000-000000000003', 'Certificado', 'certificate', null, null, 'active'),
  ('f9200000-0000-4000-8000-000000000003', 'f9100000-0000-4000-8000-000000000002', 'f9000000-0000-4000-8000-000000000005', 'Licença', 'license', null, null, 'active');

select throws_ok(
  $$insert into public.professional_documents (organization_id, professional_id, name, document_type, status)
    values ('f9100000-0000-4000-8000-000000000001', 'f9000000-0000-4000-8000-000000000002', 'Estado derivado', 'other', 'expired')$$,
  '23514', null,
  'expired is derived from expires_on and cannot be stored as a status'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'f9000000-0000-4000-8000-000000000002', true);

select is(
  (select count(*)::integer from public.professional_documents where organization_id = 'f9100000-0000-4000-8000-000000000001'),
  1,
  'a professional sees only their own documents in the organization'
);

select is(
  (select count(*)::integer from public.professional_documents where id = 'f9200000-0000-4000-8000-000000000002'),
  0,
  'a professional cannot read a peer document'
);

select lives_ok(
  $$insert into public.professional_documents (organization_id, professional_id, name, document_type)
    values ('f9100000-0000-4000-8000-000000000001', 'f9000000-0000-4000-8000-000000000002', 'Certificado próprio', 'certificate')$$,
  'a professional can create their own document'
);

select throws_ok(
  $$insert into public.professional_documents (organization_id, professional_id, name, document_type)
    values ('f9100000-0000-4000-8000-000000000001', 'f9000000-0000-4000-8000-000000000003', 'Documento alheio', 'other')$$,
  '42501', null,
  'a professional cannot create a document for a peer'
);

select lives_ok(
  $$update public.professional_documents set status = 'archived'
    where id = 'f9200000-0000-4000-8000-000000000001'$$,
  'a professional can update their own document'
);

select lives_ok(
  $$update public.professional_documents set status = 'archived'
    where id = 'f9200000-0000-4000-8000-000000000002'$$,
  'a professional peer update matches no accessible row'
);

select throws_ok(
  $$update public.professional_documents set professional_id = 'f9000000-0000-4000-8000-000000000003'
    where id = 'f9200000-0000-4000-8000-000000000001'$$,
  '42501', null,
  'a professional cannot reassign document ownership'
);

select ok(
  not has_table_privilege(current_user, 'public.professional_documents', 'DELETE'),
  'authenticated clients cannot physically delete professional documents'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'f9000000-0000-4000-8000-000000000004', true);

select is(
  (select count(*)::integer from public.professional_documents where organization_id = 'f9100000-0000-4000-8000-000000000001'),
  3,
  'an administrative organization member can read professional documents across the organization'
);

select is(
  (select status from public.professional_documents where id = 'f9200000-0000-4000-8000-000000000002'),
  'active',
  'a peer update did not change another professional document'
);

select lives_ok(
  $$update public.professional_documents set status = 'archived'
    where id = 'f9200000-0000-4000-8000-000000000002'$$,
  'an administrative organization member can update another professional document'
);

select lives_ok(
  $$insert into public.professional_documents (organization_id, professional_id, name, document_type)
    values ('f9100000-0000-4000-8000-000000000001', 'f9000000-0000-4000-8000-000000000003', 'Documento cadastrado pela clínica', 'other')$$,
  'an administrative organization member can create a document for a member professional'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'f9000000-0000-4000-8000-000000000005', true);

select is(
  (select count(*)::integer from public.professional_documents where id = 'f9200000-0000-4000-8000-000000000001'),
  0,
  'a user from another organization cannot read the document'
);

select throws_ok(
  $$insert into public.professional_documents (organization_id, professional_id, name, document_type)
    values ('f9100000-0000-4000-8000-000000000001', 'f9000000-0000-4000-8000-000000000002', 'Acesso cruzado', 'other')$$,
  '42501', null,
  'a user from another organization cannot create a document there'
);

select * from finish();
rollback;
