-- Read-only team roster for organization owners and coordinators.
-- Keep membership and profile access behind this narrowly scoped RPC so that
-- authenticated clients do not receive broader table-level access.

create or replace function public.s10_team_directory(target_org uuid)
returns table (
  user_id uuid,
  display_name text,
  role text
)
language plpgsql
stable
security definer
set search_path = ''
as $s10_team_directory$
begin
  if auth.uid() is null or not exists (
    select 1
    from public.organization_members as caller_membership
    where caller_membership.organization_id = target_org
      and caller_membership.user_id = auth.uid()
      and caller_membership.role in ('owner', 'coordinator')
  ) then
    raise insufficient_privilege using message = 'Not authorized to read this organization roster';
  end if;

  return query
  select
    member.user_id,
    profile.full_name as display_name,
    member.role::text
  from public.organization_members as member
  left join public.profiles as profile
    on profile.id = member.user_id
  where member.organization_id = target_org
  order by member.user_id;
end;
$s10_team_directory$;

-- New functions inherit EXECUTE for PUBLIC by default; remove it explicitly.
revoke all on function public.s10_team_directory(uuid) from public, anon, authenticated;
grant execute on function public.s10_team_directory(uuid) to authenticated;
