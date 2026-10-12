begin;
select plan(30);

select ok(
  has_function_privilege(
    'authenticated',
    'public.s10_team_directory_page(uuid,uuid,integer)',
    'EXECUTE'
  ),
  'authenticated clients can call the paginated roster RPC'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.s10_team_directory_page(uuid,uuid,integer)',
    'EXECUTE'
  ),
  'anonymous clients cannot call the paginated roster RPC'
);
select ok(
  not exists (
    select 1
    from pg_proc as procedure
    cross join lateral aclexplode(procedure.proacl) as acl
    where procedure.oid = 'public.s10_team_directory_page(uuid,uuid,integer)'::regprocedure
      and acl.grantee = 0
      and acl.privilege_type = 'EXECUTE'
  ),
  'PUBLIC has no direct EXECUTE grant on the paginated roster RPC'
);
select ok(
  has_function_privilege('authenticated', 'public.s10_team_directory(uuid)', 'EXECUTE'),
  'the original roster RPC remains available for compatibility'
);

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('fc000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 's10-page-owner@test.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('fc000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 's10-page-coordinator@test.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('fc000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 's10-page-professional@test.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('fc000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 's10-page-administrative@test.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('fc000000-0000-4000-8000-000000000005', 'authenticated', 'authenticated', 's10-page-outsider@test.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('fc000000-0000-4000-8000-000000000006', 'authenticated', 'authenticated', 's10-page-secondary-owner@test.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('fc000000-0000-4000-8000-000000000007', 'authenticated', 'authenticated', 's10-page-no-profile@test.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

insert into public.profiles (id, full_name) values
  ('fc000000-0000-4000-8000-000000000001', 'Owner S10 Page'),
  ('fc000000-0000-4000-8000-000000000002', 'Coordinator S10 Page'),
  ('fc000000-0000-4000-8000-000000000003', 'Professional S10 Page'),
  ('fc000000-0000-4000-8000-000000000004', 'Administrative S10 Page'),
  ('fc000000-0000-4000-8000-000000000005', 'Outsider S10 Page'),
  ('fc000000-0000-4000-8000-000000000006', 'Secondary Owner S10 Page');

insert into public.organizations (id, name, owner_id) values
  ('fc100000-0000-4000-8000-000000000001', 'S10 paginated roster org', 'fc000000-0000-4000-8000-000000000001'),
  ('fc100000-0000-4000-8000-000000000002', 'S10 paginated outsider org', 'fc000000-0000-4000-8000-000000000005');

insert into public.organization_members (organization_id, user_id, role) values
  ('fc100000-0000-4000-8000-000000000001', 'fc000000-0000-4000-8000-000000000001', 'owner'),
  ('fc100000-0000-4000-8000-000000000001', 'fc000000-0000-4000-8000-000000000002', 'coordinator'),
  ('fc100000-0000-4000-8000-000000000001', 'fc000000-0000-4000-8000-000000000003', 'professional'),
  ('fc100000-0000-4000-8000-000000000001', 'fc000000-0000-4000-8000-000000000004', 'administrative'),
  ('fc100000-0000-4000-8000-000000000001', 'fc000000-0000-4000-8000-000000000006', 'owner'),
  ('fc100000-0000-4000-8000-000000000001', 'fc000000-0000-4000-8000-000000000007', 'professional'),
  ('fc100000-0000-4000-8000-000000000002', 'fc000000-0000-4000-8000-000000000005', 'owner');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'fc000000-0000-4000-8000-000000000001', true);

select is(
  public.s10_team_directory_page('fc100000-0000-4000-8000-000000000001', null, 2)->'members',
  '[
    {"user_id":"fc000000-0000-4000-8000-000000000001","display_name":"Owner S10 Page","role":"owner"},
    {"user_id":"fc000000-0000-4000-8000-000000000002","display_name":"Coordinator S10 Page","role":"coordinator"}
  ]'::jsonb,
  'the first page is ordered by user_id and contains at most page_size members'
);
select is(
  public.s10_team_directory_page('fc100000-0000-4000-8000-000000000001', null, 2)->>'next_cursor',
  'fc000000-0000-4000-8000-000000000002',
  'the first page cursor is its last returned member, not the sentinel'
);
select is(
  public.s10_team_directory_page('fc100000-0000-4000-8000-000000000001', null, 2)->>'can_manage_roles',
  'true',
  'the canonical organization owner can manage roles'
);
select is(
  jsonb_array_length(public.s10_team_directory_page(
    'fc100000-0000-4000-8000-000000000001', null, 1
  )->'members'),
  1,
  'the minimum valid page size returns one member'
);

select is(
  public.s10_team_directory_page(
    'fc100000-0000-4000-8000-000000000001',
    'fc000000-0000-4000-8000-000000000002',
    2
  )->'members',
  '[
    {"user_id":"fc000000-0000-4000-8000-000000000003","display_name":"Professional S10 Page","role":"professional"},
    {"user_id":"fc000000-0000-4000-8000-000000000004","display_name":"Administrative S10 Page","role":"administrative"}
  ]'::jsonb,
  'the next page starts strictly after its cursor'
);
select is(
  public.s10_team_directory_page(
    'fc100000-0000-4000-8000-000000000001',
    'fc000000-0000-4000-8000-000000000002',
    2
  )->>'next_cursor',
  'fc000000-0000-4000-8000-000000000004',
  'a middle page returns its last member as the next cursor'
);

select is(
  public.s10_team_directory_page(
    'fc100000-0000-4000-8000-000000000001',
    'fc000000-0000-4000-8000-000000000004',
    2
  )->'members',
  '[
    {"user_id":"fc000000-0000-4000-8000-000000000006","display_name":"Secondary Owner S10 Page","role":"owner"},
    {"user_id":"fc000000-0000-4000-8000-000000000007","display_name":null,"role":"professional"}
  ]'::jsonb,
  'the final page includes all remaining rows and preserves missing profiles'
);
select is(
  public.s10_team_directory_page(
    'fc100000-0000-4000-8000-000000000001',
    'fc000000-0000-4000-8000-000000000004',
    2
  )->'next_cursor',
  'null'::jsonb,
  'the final page has no next cursor'
);
select is(
  public.s10_team_directory_page(
    'fc100000-0000-4000-8000-000000000001',
    'ffffffff-ffff-4fff-8fff-ffffffffffff',
    2
  )->'members',
  '[]'::jsonb,
  'an empty page returns an empty members array'
);
select is(
  public.s10_team_directory_page(
    'fc100000-0000-4000-8000-000000000001',
    'ffffffff-ffff-4fff-8fff-ffffffffffff',
    2
  )->>'can_manage_roles',
  'true',
  'an empty page still returns the caller capability'
);
select is(
  public.s10_team_directory_page(
    'fc100000-0000-4000-8000-000000000001',
    'ffffffff-ffff-4fff-8fff-ffffffffffff',
    2
  )->'next_cursor',
  'null'::jsonb,
  'an empty page has no next cursor'
);
select is(
  jsonb_array_length(public.s10_team_directory_page(
    'fc100000-0000-4000-8000-000000000001', null, 100
  )->'members'),
  6,
  'the maximum valid page size returns all available roster members'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'fc000000-0000-4000-8000-000000000002', true);
select is(
  public.s10_team_directory_page('fc100000-0000-4000-8000-000000000001')->>'can_manage_roles',
  'false',
  'a coordinator can read the roster but cannot manage roles'
);

reset role;
update public.organizations
set owner_id = 'fc000000-0000-4000-8000-000000000002'
where id = 'fc100000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub', 'fc000000-0000-4000-8000-000000000002', true);
select is(
  public.s10_team_directory_page('fc100000-0000-4000-8000-000000000001')->>'can_manage_roles',
  'false',
  'a coordinator remains unable to manage roles even if organizations.owner_id points to them'
);
reset role;
update public.organizations
set owner_id = 'fc000000-0000-4000-8000-000000000001'
where id = 'fc100000-0000-4000-8000-000000000001';

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'fc000000-0000-4000-8000-000000000006', true);
select is(
  public.s10_team_directory_page('fc100000-0000-4000-8000-000000000001')->>'can_manage_roles',
  'false',
  'a secondary owner membership cannot manage roles without matching organizations.owner_id'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'fc000000-0000-4000-8000-000000000003', true);
select throws_ok(
  $$select public.s10_team_directory_page('fc100000-0000-4000-8000-000000000001')$$,
  '42501', null,
  'a professional cannot read the roster'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'fc000000-0000-4000-8000-000000000004', true);
select throws_ok(
  $$select public.s10_team_directory_page('fc100000-0000-4000-8000-000000000001')$$,
  '42501', null,
  'an administrative member cannot read the roster'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'fc000000-0000-4000-8000-000000000005', true);
select throws_ok(
  $$select public.s10_team_directory_page('fc100000-0000-4000-8000-000000000001')$$,
  '42501', null,
  'an outsider cannot read another organization roster'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'fc000000-0000-4000-8000-000000000001', true);
select throws_ok(
  $$select public.s10_team_directory_page('fc100000-0000-4000-8000-000000000001', null, null::integer)$$,
  '22023', null,
  'a null page size is rejected'
);
select throws_ok(
  $$select public.s10_team_directory_page('fc100000-0000-4000-8000-000000000001', null, 0)$$,
  '22023', null,
  'a page size below one is rejected'
);
select throws_ok(
  $$select public.s10_team_directory_page('fc100000-0000-4000-8000-000000000001', null, 101)$$,
  '22023', null,
  'a page size above one hundred is rejected'
);

reset role;
set local role anon;
select throws_ok(
  $$select public.s10_team_directory_page('fc100000-0000-4000-8000-000000000001')$$,
  '42501', null,
  'an anonymous client cannot call the paginated roster RPC'
);

reset role;
insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
select
  ('fd000000-0000-4000-8000-' || lpad(to_hex(bulk.n), 12, '0'))::uuid,
  'authenticated',
  'authenticated',
  's10-page-bulk-' || bulk.n || '@test.invalid',
  '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()
from generate_series(1, 205) as bulk(n);

insert into public.organization_members (organization_id, user_id, role)
select
  'fc100000-0000-4000-8000-000000000001',
  ('fd000000-0000-4000-8000-' || lpad(to_hex(bulk.n), 12, '0'))::uuid,
  'professional'
from generate_series(1, 205) as bulk(n);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'fc000000-0000-4000-8000-000000000001', true);
select is(
  jsonb_array_length(public.s10_team_directory_page(
    'fc100000-0000-4000-8000-000000000001', null, 100
  )->'members'),
  100,
  'a page is capped at one hundred members when the roster exceeds two hundred'
);
select is(
  public.s10_team_directory_page(
    'fc100000-0000-4000-8000-000000000001', null, 100
  )->>'next_cursor',
  public.s10_team_directory_page(
    'fc100000-0000-4000-8000-000000000001', null, 100
  )->'members'->99->>'user_id',
  'the large-roster cursor is the final returned user rather than the sentinel'
);
select is(
  (
    with recursive pages(page_no, payload) as (
      select 1, public.s10_team_directory_page(
        'fc100000-0000-4000-8000-000000000001', null, 100
      )
      union all
      select pages.page_no + 1,
        public.s10_team_directory_page(
          'fc100000-0000-4000-8000-000000000001',
          (pages.payload->>'next_cursor')::uuid,
          100
        )
      from pages
      where pages.payload->>'next_cursor' is not null
        and pages.page_no < 5
    )
    select array_agg(jsonb_array_length(payload->'members') order by page_no)
    from pages
  ),
  array[100, 100, 11]::integer[],
  'three pages cover all 211 members at the requested page size'
);
select ok(
  (
    with recursive pages(page_no, payload) as (
      select 1, public.s10_team_directory_page(
        'fc100000-0000-4000-8000-000000000001', null, 100
      )
      union all
      select pages.page_no + 1,
        public.s10_team_directory_page(
          'fc100000-0000-4000-8000-000000000001',
          (pages.payload->>'next_cursor')::uuid,
          100
        )
      from pages
      where pages.payload->>'next_cursor' is not null
        and pages.page_no < 5
    )
    select count(*) = 211
      and count(distinct member.value->>'user_id') = 211
    from pages
    cross join lateral jsonb_array_elements(pages.payload->'members') as member(value)
  ),
  'walking every page returns all 211 distinct member ids without loss or duplication'
);

select * from finish();
rollback;
