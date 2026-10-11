begin;
select plan(19);

select ok(
  (select not public from storage.buckets where id = 'professional-documents'),
  'professional-documents bucket is private'
);

select is(
  (select file_size_limit from storage.buckets where id = 'professional-documents'),
  5242880::bigint,
  'bucket enforces a 5 MiB upload limit'
);

select is(
  (select allowed_mime_types from storage.buckets where id = 'professional-documents'),
  array['application/pdf', 'image/jpeg', 'image/png']::text[],
  'bucket only accepts PDF, JPEG, and PNG'
);

select ok(
  (select relrowsecurity from pg_class where oid = 'storage.objects'::regclass),
  'Storage objects has row level security enabled'
);

select is(
  (select count(*)::integer from pg_policy
    where polrelid = 'storage.objects'::regclass
      and polname = 's9_professional_document_files_select'),
  1,
  'the S9.3 scoped Storage SELECT policy is installed'
);

select is(
  (select count(*)::integer from pg_policy
    where polrelid = 'storage.objects'::regclass
      and polname like 's9_professional_document_files_%'
      and polcmd = 'a'),
  0,
  'S9.3 defines no direct Storage INSERT policy'
);

select is(
  (select count(*)::integer from pg_policy
    where polrelid = 'storage.objects'::regclass
      and polcmd in ('w', 'd')
      and polname like 's9_professional_document_files_%'),
  0,
  'S9.3 defines no UPDATE or DELETE policy'
);

select ok(
  not exists (
    select 1 from pg_policy
    where polrelid = 'storage.objects'::regclass
      and polname = 's9_professional_document_files_select'
      and 'anon'::regrole::oid = any(polroles)
  ),
  'S9.3 Storage policies do not grant access to anon'
);

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('f9300000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 's9-files-owner@test.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('f9300000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 's9-files-professional@test.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('f9300000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 's9-files-peer@test.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('f9300000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 's9-files-admin@test.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('f9300000-0000-4000-8000-000000000005', 'authenticated', 'authenticated', 's9-files-outsider@test.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

insert into public.organizations (id, name, owner_id) values
  ('f9400000-0000-4000-8000-000000000001', 'S9 file org', 'f9300000-0000-4000-8000-000000000001'),
  ('f9400000-0000-4000-8000-000000000002', 'S9 file other org', 'f9300000-0000-4000-8000-000000000005');

insert into public.organization_members (organization_id, user_id, role) values
  ('f9400000-0000-4000-8000-000000000001', 'f9300000-0000-4000-8000-000000000001', 'owner'),
  ('f9400000-0000-4000-8000-000000000001', 'f9300000-0000-4000-8000-000000000002', 'professional'),
  ('f9400000-0000-4000-8000-000000000001', 'f9300000-0000-4000-8000-000000000003', 'professional'),
  ('f9400000-0000-4000-8000-000000000001', 'f9300000-0000-4000-8000-000000000004', 'administrative'),
  ('f9400000-0000-4000-8000-000000000002', 'f9300000-0000-4000-8000-000000000005', 'owner');

insert into public.professional_documents (
  id, organization_id, professional_id, name, document_type
) values
  ('f9500000-0000-4000-8000-000000000001', 'f9400000-0000-4000-8000-000000000001', 'f9300000-0000-4000-8000-000000000002', 'Meu registro', 'registration'),
  ('f9500000-0000-4000-8000-000000000004', 'f9400000-0000-4000-8000-000000000001', 'f9300000-0000-4000-8000-000000000002', 'Meu registro vazio', 'registration'),
  ('f9500000-0000-4000-8000-000000000002', 'f9400000-0000-4000-8000-000000000001', 'f9300000-0000-4000-8000-000000000003', 'Registro do par', 'registration'),
  ('f9500000-0000-4000-8000-000000000003', 'f9400000-0000-4000-8000-000000000002', 'f9300000-0000-4000-8000-000000000005', 'Registro externo', 'registration');

-- Seed objects as the migration/test owner; user JWTs below only exercise reads.
insert into storage.objects (bucket_id, name, metadata) values
  ('professional-documents', 'f9400000-0000-4000-8000-000000000001/f9500000-0000-4000-8000-000000000001', '{"mimetype":"application/pdf","size":100}'::jsonb),
  ('professional-documents', 'f9400000-0000-4000-8000-000000000001/f9500000-0000-4000-8000-000000000002', '{"mimetype":"image/png","size":100}'::jsonb),
  ('professional-documents', 'f9400000-0000-4000-8000-000000000002/f9500000-0000-4000-8000-000000000003', '{"mimetype":"application/pdf","size":100}'::jsonb),
  ('professional-documents', 'f9400000-0000-4000-8000-000000000001/f9500000-0000-4000-8000-000000000001/extra.pdf', '{"mimetype":"application/pdf","size":100}'::jsonb);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'f9300000-0000-4000-8000-000000000002', true);

select throws_ok(
  $$insert into storage.objects (bucket_id, name, metadata)
    values ('professional-documents', 'f9400000-0000-4000-8000-000000000001/f9500000-0000-4000-8000-000000000004', '{"mimetype":"application/pdf","size":100}'::jsonb)$$,
  '42501', null,
  'direct authenticated inserts are denied even for an owned document'
);

select is(
  (select count(*)::integer from storage.objects where bucket_id = 'professional-documents'),
  1,
  'the professional can read their own file'
);

select is(
  (select count(*)::integer from storage.objects where name like '%/f9500000-0000-4000-8000-000000000002'),
  0,
  'the professional cannot read a peer file'
);

select is(
  (select count(*)::integer from storage.objects where bucket_id = 'professional-documents' and name like '%/f9500000-0000-4000-8000-000000000003'),
  0,
  'a different organization cannot read the file'
);

select is(
  (select count(*)::integer from storage.objects where name = 'f9400000-0000-4000-8000-000000000001/f9500000-0000-4000-8000-000000000001/extra.pdf'),
  0,
  'a nested path is not associated with the document and is not visible'
);

select lives_ok(
  $$update storage.objects set metadata = '{"mimetype":"application/pdf","size":101}'::jsonb
    where bucket_id = 'professional-documents'$$,
  'update request cannot overwrite an object without an UPDATE policy'
);

select lives_ok(
  $$delete from storage.objects where bucket_id = 'professional-documents'$$,
  'delete request cannot remove an object without a DELETE policy'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'f9300000-0000-4000-8000-000000000004', true);

select is(
  (select count(*)::integer from storage.objects where bucket_id = 'professional-documents'),
  2,
  'an administrative organization member can read both organization files'
);

select is(
  (select metadata->>'size' from storage.objects where name = 'f9400000-0000-4000-8000-000000000001/f9500000-0000-4000-8000-000000000001'),
  '100',
  'the attempted overwrite did not change stored metadata'
);

select is(
  (select count(*)::integer from storage.objects where name = 'f9400000-0000-4000-8000-000000000001/f9500000-0000-4000-8000-000000000001'),
  1,
  'the attempted deletion did not remove the file'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'f9300000-0000-4000-8000-000000000005', true);

select is(
  (select count(*)::integer from storage.objects where bucket_id = 'professional-documents'),
  0,
  'a user from another organization cannot read these files'
);

select * from finish();
rollback;
