-- Let organization owners change non-owner member roles through a narrowly
-- scoped RPC. Authenticated clients retain read access to memberships only.

create or replace function public.s10_update_member_role(
  target_org uuid,
  target_user uuid,
  new_role public.app_role
)
returns table (
  user_id uuid,
  role public.app_role
)
language plpgsql
volatile
security definer
set search_path = ''
as $s10_update_member_role$
declare
  caller_id uuid := (select auth.uid());
  organization_owner_id uuid;
  target_membership_role public.app_role;
  changed_role public.app_role;
begin
  if caller_id is null then
    raise insufficient_privilege using message = 'Not authorized to update organization member roles';
  end if;

  if new_role is null or new_role not in (
    'professional'::public.app_role,
    'coordinator'::public.app_role,
    'administrative'::public.app_role
  ) then
    raise invalid_parameter_value using message = 'Unsupported organization member role';
  end if;

  -- Serialize membership role changes within an organization and keep the
  -- owner_id check consistent for the duration of this transaction.
  select organization.owner_id
    into organization_owner_id
  from public.organizations as organization
  where organization.id = target_org
  for update;

  if not found
     or organization_owner_id is distinct from caller_id
     or not exists (
       select 1
       from public.organization_members as caller_membership
       where caller_membership.organization_id = target_org
         and caller_membership.user_id = caller_id
         and caller_membership.role = 'owner'::public.app_role
     ) then
    raise insufficient_privilege using message = 'Not authorized to update organization member roles';
  end if;

  select target_membership.role
    into target_membership_role
  from public.organization_members as target_membership
  where target_membership.organization_id = target_org
    and target_membership.user_id = target_user
  for update;

  if not found then
    raise no_data_found using message = 'Organization member not found';
  end if;

  if target_membership_role = 'owner'::public.app_role then
    raise exception using
      errcode = 'P0001',
      message = 'The organization owner role is immutable';
  end if;

  update public.organization_members as target_membership
  set role = new_role
  where target_membership.organization_id = target_org
    and target_membership.user_id = target_user
  returning target_membership.role into changed_role;

  return query select target_user, changed_role;
end;
$s10_update_member_role$;

-- The RPC is the only authenticated path for membership role changes.
revoke all on function public.s10_update_member_role(uuid, uuid, public.app_role)
  from public, anon, authenticated;
grant execute on function public.s10_update_member_role(uuid, uuid, public.app_role)
  to authenticated;

revoke insert, update, delete on table public.organization_members from authenticated;
grant select on table public.organization_members to authenticated;
