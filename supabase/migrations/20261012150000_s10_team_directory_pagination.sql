-- Add cursor-based pagination to the team directory while retaining the
-- original RPC for clients that have not migrated yet.
create or replace function public.s10_team_directory_page(
  target_org uuid,
  after_user uuid default null,
  page_size integer default 50
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $s10_team_directory_page$
declare
  caller_id uuid := (select auth.uid());
  caller_can_manage_roles boolean;
  result_members jsonb;
  returned_count integer;
  has_more boolean;
  last_user_id uuid;
begin
  if page_size is null or page_size < 1 or page_size > 100 then
    raise exception using
      errcode = '22023',
      message = 'page_size must be between 1 and 100';
  end if;

  if caller_id is null or not exists (
    select 1
    from public.organization_members as caller_membership
    where caller_membership.organization_id = target_org
      and caller_membership.user_id = caller_id
      and caller_membership.role in (
        'owner'::public.app_role,
        'coordinator'::public.app_role
      )
  ) then
    raise insufficient_privilege using
      message = 'Not authorized to read this organization roster';
  end if;

  select organization.owner_id = caller_id
    and exists (
      select 1
      from public.organization_members as owner_membership
      where owner_membership.organization_id = target_org
        and owner_membership.user_id = caller_id
        and owner_membership.role = 'owner'::public.app_role
    )
    into caller_can_manage_roles
  from public.organizations as organization
  where organization.id = target_org;

  with candidates as (
    select
      member.user_id,
      profile.full_name as display_name,
      member.role::text as role,
      row_number() over (order by member.user_id) as page_row
    from public.organization_members as member
    left join public.profiles as profile
      on profile.id = member.user_id
    where member.organization_id = target_org
      and (after_user is null or member.user_id > after_user)
    order by member.user_id
    limit page_size + 1
  ), page_rows as (
    select user_id, display_name, role, page_row
    from candidates
    where page_row <= page_size
  )
  select
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'user_id', page_rows.user_id,
          'display_name', page_rows.display_name,
          'role', page_rows.role
        ) order by page_rows.user_id
      ) filter (where page_rows.user_id is not null),
      '[]'::jsonb
    ),
    count(page_rows.user_id)::integer,
    coalesce(bool_or(candidates.page_row = page_size + 1), false),
    (
      select page_rows_last.user_id
      from page_rows as page_rows_last
      order by page_rows_last.user_id desc
      limit 1
    )
  into result_members, returned_count, has_more, last_user_id
  from candidates
  left join page_rows on page_rows.user_id = candidates.user_id;

  -- Keep this defensive fallback explicit: callers should never get a cursor
  -- unless a sentinel row proves there is another page.
  return jsonb_build_object(
    'members', result_members,
    'next_cursor', case
      when has_more and returned_count > 0 then last_user_id::text
      else null
    end,
    'can_manage_roles', coalesce(caller_can_manage_roles, false)
  );
end;
$s10_team_directory_page$;

comment on function public.s10_team_directory_page(uuid, uuid, integer) is
  'Returns a keyset-paginated organization roster for owners and coordinators; role management capability is true only for the canonical organization owner.';

-- SECURITY DEFINER is required to read roster rows through this narrow API
-- without granting authenticated clients broader table access. The body checks
-- auth.uid() and organization membership; search_path is fixed and grants are
-- restricted to authenticated users.
revoke all on function public.s10_team_directory_page(uuid, uuid, integer)
  from public, anon, authenticated;
grant execute on function public.s10_team_directory_page(uuid, uuid, integer)
  to authenticated;
