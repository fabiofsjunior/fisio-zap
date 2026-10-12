begin;
select plan(13);

select ok(
  has_function_privilege('authenticated', 'public.s10_team_directory(uuid)', 'EXECUTE'),
  'authenticated clients can call the roster RPC'
);
select ok(
  not has_function_privilege('anon', 'public.s10_team_directory(uuid)', 'EXECUTE'),
  'anonymous clients cannot call the roster RPC'
);
select ok(
  not exists (
    select 1
    from pg_proc as p
    cross join lateral aclexplode(p.proacl) as acl
    where p.oid = 'public.s10_team_directory(uuid)'::regprocedure
      and acl.grantee = 0
      and acl.privilege_type = 'EXECUTE'
  ),
  'PUBLIC has no direct EXECUTE grant on the roster RPC'
);

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('fa000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 's10-owner@test.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('fa000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 's10-coordinator@test.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('fa000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 's10-professional@test.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('fa000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 's10-administrative@test.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('fa000000-0000-4000-8000-000000000005', 'authenticated', 'authenticated', 's10-outsider@test.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('fa000000-0000-4000-8000-000000000006', 'authenticated', 'authenticated', 's10-no-profile@test.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

insert into public.profiles (id, full_name) values
  ('fa000000-0000-4000-8000-000000000001', 'Owner S10'),
  ('fa000000-0000-4000-8000-000000000002', 'Coordinator S10'),
  ('fa000000-0000-4000-8000-000000000003', 'Professional S10'),
  ('fa000000-0000-4000-8000-000000000004', 'Administrative S10'),
  ('fa000000-0000-4000-8000-000000000005', 'Outsider S10');

insert into public.organizations (id, name, owner_id) values
  ('fa100000-0000-4000-8000-000000000001', 'S10 roster org', 'fa000000-0000-4000-8000-000000000001'),
  ('fa100000-0000-4000-8000-000000000002', 'S10 outsider org', 'fa000000-0000-4000-8000-000000000005');

insert into public.organization_members (organization_id, user_id, role) values
  ('fa100000-0000-4000-8000-000000000001', 'fa000000-0000-4000-8000-000000000001', 'owner'),
  ('fa100000-0000-4000-8000-000000000001', 'fa000000-0000-4000-8000-000000000002', 'coordinator'),
  ('fa100000-0000-4000-8000-000000000001', 'fa000000-0000-4000-8000-000000000003', 'professional'),
  ('fa100000-0000-4000-8000-000000000001', 'fa000000-0000-4000-8000-000000000004', 'administrative'),
  ('fa100000-0000-4000-8000-000000000001', 'fa000000-0000-4000-8000-000000000006', 'professional'),
  ('fa100000-0000-4000-8000-000000000002', 'fa000000-0000-4000-8000-000000000005', 'owner');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'fa000000-0000-4000-8000-000000000001', true);

select is(
  (select count(*)::integer from public.s10_team_directory('fa100000-0000-4000-8000-000000000001')),
  5,
  'an owner receives every member of their organization'
);
select is(
  (select display_name from public.s10_team_directory('fa100000-0000-4000-8000-000000000001')
   where user_id = 'fa000000-0000-4000-8000-000000000002'),
  'Coordinator S10',
  'the roster exposes profiles.full_name as display_name'
);
select is(
  (select role from public.s10_team_directory('fa100000-0000-4000-8000-000000000001')
   where user_id = 'fa000000-0000-4000-8000-000000000004'),
  'administrative',
  'the roster exposes the membership role as text'
);
select is(
  (select count(*)::integer from public.s10_team_directory('fa100000-0000-4000-8000-000000000001')
   where user_id = 'fa000000-0000-4000-8000-000000000005'),
  0,
  'the roster does not include users from a different organization'
);
select is(
  (select display_name from public.s10_team_directory('fa100000-0000-4000-8000-000000000001')
   where user_id = 'fa000000-0000-4000-8000-000000000006'),
  null::text,
  'a member without a profile remains in the roster with a null display_name'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'fa000000-0000-4000-8000-000000000002', true);
select is(
  (select count(*)::integer from public.s10_team_directory('fa100000-0000-4000-8000-000000000001')),
  5,
  'a coordinator receives the organization roster'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'fa000000-0000-4000-8000-000000000003', true);
select throws_ok(
  $$select * from public.s10_team_directory('fa100000-0000-4000-8000-000000000001')$$,
  '42501', null,
  'a professional cannot read the organization roster'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'fa000000-0000-4000-8000-000000000004', true);
select throws_ok(
  $$select * from public.s10_team_directory('fa100000-0000-4000-8000-000000000001')$$,
  '42501', null,
  'an administrative member cannot read the organization roster'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'fa000000-0000-4000-8000-000000000005', true);
select throws_ok(
  $$select * from public.s10_team_directory('fa100000-0000-4000-8000-000000000001')$$,
  '42501', null,
  'an outsider cannot read another organization roster'
);

reset role;
set local role anon;
select throws_ok(
  $$select * from public.s10_team_directory('fa100000-0000-4000-8000-000000000001')$$,
  '42501', null,
  'an anonymous client cannot call the roster RPC'
);

select * from finish();
rollback;
