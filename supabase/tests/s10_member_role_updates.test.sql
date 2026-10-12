begin;
select plan(23);

select ok(
  has_function_privilege('authenticated', 'public.s10_update_member_role(uuid,uuid,public.app_role)', 'EXECUTE'),
  'authenticated clients can call the member-role RPC'
);
select ok(
  not has_function_privilege('anon', 'public.s10_update_member_role(uuid,uuid,public.app_role)', 'EXECUTE'),
  'anonymous clients cannot call the member-role RPC'
);
select ok(
  not exists (
    select 1 from pg_proc as procedure
    cross join lateral aclexplode(procedure.proacl) as acl
    where procedure.oid = 'public.s10_update_member_role(uuid,uuid,public.app_role)'::regprocedure
      and acl.grantee = 0 and acl.privilege_type = 'EXECUTE'
  ),
  'PUBLIC has no direct EXECUTE grant on the member-role RPC'
);
select ok(
  has_table_privilege('authenticated', 'public.organization_members', 'SELECT'),
  'authenticated clients retain membership read access'
);
select ok(
  not has_table_privilege('authenticated', 'public.organization_members', 'INSERT'),
  'authenticated clients cannot insert memberships directly'
);
select ok(
  not has_table_privilege('authenticated', 'public.organization_members', 'UPDATE'),
  'authenticated clients cannot update memberships directly'
);
select ok(
  not has_table_privilege('authenticated', 'public.organization_members', 'DELETE'),
  'authenticated clients cannot delete memberships directly'
);

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('fb000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 's10-role-owner@test.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('fb000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 's10-role-coordinator@test.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('fb000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 's10-role-professional@test.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('fb000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 's10-role-administrative@test.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('fb000000-0000-4000-8000-000000000005', 'authenticated', 'authenticated', 's10-role-outsider@test.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

insert into public.organizations (id, name, owner_id) values
  ('fb100000-0000-4000-8000-000000000001', 'S10 role update org', 'fb000000-0000-4000-8000-000000000001'),
  ('fb100000-0000-4000-8000-000000000002', 'S10 role outsider org', 'fb000000-0000-4000-8000-000000000005');

insert into public.organization_members (organization_id, user_id, role) values
  ('fb100000-0000-4000-8000-000000000001', 'fb000000-0000-4000-8000-000000000001', 'owner'),
  ('fb100000-0000-4000-8000-000000000001', 'fb000000-0000-4000-8000-000000000002', 'coordinator'),
  ('fb100000-0000-4000-8000-000000000001', 'fb000000-0000-4000-8000-000000000003', 'professional'),
  ('fb100000-0000-4000-8000-000000000001', 'fb000000-0000-4000-8000-000000000004', 'administrative'),
  ('fb100000-0000-4000-8000-000000000002', 'fb000000-0000-4000-8000-000000000005', 'owner');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'fb000000-0000-4000-8000-000000000001', true);

select is(
  (select role::text from public.s10_update_member_role(
    'fb100000-0000-4000-8000-000000000001',
    'fb000000-0000-4000-8000-000000000003',
    'coordinator'
  )),
  'coordinator',
  'the owner can change a same-organization member role'
);
select is(
  (select user_id from public.s10_update_member_role(
    'fb100000-0000-4000-8000-000000000001',
    'fb000000-0000-4000-8000-000000000004',
    'professional'
  )),
  'fb000000-0000-4000-8000-000000000004'::uuid,
  'the RPC returns only the changed user id and role'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'fb000000-0000-4000-8000-000000000002', true);
select throws_ok(
  $$select * from public.s10_update_member_role('fb100000-0000-4000-8000-000000000001', 'fb000000-0000-4000-8000-000000000004', 'coordinator')$$,
  '42501', null,
  'a coordinator cannot change member roles'
);
select is(
  (select role::text from public.organization_members where organization_id = 'fb100000-0000-4000-8000-000000000001' and user_id = 'fb000000-0000-4000-8000-000000000004'),
  'professional',
  'a rejected coordinator request leaves the target role unchanged'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'fb000000-0000-4000-8000-000000000003', true);
select throws_ok(
  $$select * from public.s10_update_member_role('fb100000-0000-4000-8000-000000000001', 'fb000000-0000-4000-8000-000000000004', 'administrative')$$,
  '42501', null,
  'a professional cannot change member roles'
);
reset role;
select is(
  (select role::text from public.organization_members where organization_id = 'fb100000-0000-4000-8000-000000000001' and user_id = 'fb000000-0000-4000-8000-000000000004'),
  'professional',
  'a rejected professional request leaves the target role unchanged'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'fb000000-0000-4000-8000-000000000005', true);
select throws_ok(
  $$select * from public.s10_update_member_role('fb100000-0000-4000-8000-000000000001', 'fb000000-0000-4000-8000-000000000004', 'administrative')$$,
  '42501', null,
  'an owner of another organization cannot change member roles'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'fb000000-0000-4000-8000-000000000001', true);
select throws_ok(
  $$select * from public.s10_update_member_role('fb100000-0000-4000-8000-000000000001', 'fb000000-0000-4000-8000-000000000005', 'professional')$$,
  'P0002', null,
  'a target in a different organization is reported as absent'
);
reset role;
select is(
  (select role::text from public.organization_members where organization_id = 'fb100000-0000-4000-8000-000000000002' and user_id = 'fb000000-0000-4000-8000-000000000005'),
  'owner',
  'a cross-organization rejection leaves the target role unchanged'
);
select throws_ok(
  $$select * from public.s10_update_member_role('fb100000-0000-4000-8000-000000000001', 'fb000000-0000-4000-8000-000000000001', 'professional')$$,
  'P0001', 'The organization owner role is immutable',
  'the owner membership cannot be changed'
);
select throws_ok(
  $$select * from public.s10_update_member_role('fb100000-0000-4000-8000-000000000001', 'fb000000-0000-4000-8000-000000000004', 'owner')$$,
  '22023', null,
  'owner is not an allowed new role'
);
select is(
  (select role::text from public.organization_members where organization_id = 'fb100000-0000-4000-8000-000000000001' and user_id = 'fb000000-0000-4000-8000-000000000004'),
  'professional',
  'an invalid-role rejection leaves the target role unchanged'
);
select throws_ok(
  $$select * from public.s10_update_member_role('fb100000-0000-4000-8000-000000000001', 'fb000000-0000-4000-8000-000000000006', 'professional')$$,
  'P0002', null,
  'a missing target member is reported as absent'
);

reset role;
update public.organizations
set owner_id = 'fb000000-0000-4000-8000-000000000005'
where id = 'fb100000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub', 'fb000000-0000-4000-8000-000000000001', true);
select throws_ok(
  $$select * from public.s10_update_member_role('fb100000-0000-4000-8000-000000000001', 'fb000000-0000-4000-8000-000000000004', 'administrative')$$,
  '42501', null,
  'the owner membership must match organizations.owner_id'
);

reset role;
update public.organizations
set owner_id = 'fb000000-0000-4000-8000-000000000001'
where id = 'fb100000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub', 'fb000000-0000-4000-8000-000000000001', true);
select throws_ok(
  $$update public.organization_members set role = 'administrative' where organization_id = 'fb100000-0000-4000-8000-000000000001' and user_id = 'fb000000-0000-4000-8000-000000000004'$$,
  '42501', null,
  'authenticated clients cannot change membership roles directly'
);
reset role;
set local role anon;
select throws_ok(
  $$select * from public.s10_update_member_role('fb100000-0000-4000-8000-000000000001', 'fb000000-0000-4000-8000-000000000004', 'coordinator')$$,
  '42501', null,
  'an anonymous client cannot call the member-role RPC'
);

select * from finish();
rollback;
