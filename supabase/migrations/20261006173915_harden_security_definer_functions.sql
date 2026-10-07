-- FisioZap security hardening.
-- This migration is intentionally tolerant of the historical MVP migration:
-- if an older helper signature is absent, the reconciliation migration creates
-- the hardened private helpers later in the chain.

create schema if not exists private;

revoke usage on schema private from public;
grant usage on schema private to authenticated;

do $$
begin
  if to_regprocedure('public.is_org_member(uuid)') is not null then
    alter function public.is_org_member(uuid) set schema private;
    alter function private.is_org_member(uuid) set search_path = '';
    revoke execute on function private.is_org_member(uuid) from public, anon;
    grant execute on function private.is_org_member(uuid) to authenticated;
  end if;

  if to_regprocedure('public.is_org_admin(uuid)') is not null then
    alter function public.is_org_admin(uuid) set schema private;
    alter function private.is_org_admin(uuid) set search_path = '';
    revoke execute on function private.is_org_admin(uuid) from public, anon;
    grant execute on function private.is_org_admin(uuid) to authenticated;
  end if;

  if to_regprocedure('public.handle_new_user()') is not null then
    alter function public.handle_new_user() set schema private;
    alter function private.handle_new_user() set search_path = '';
    revoke execute on function private.handle_new_user() from public, anon, authenticated;
  end if;
end $$;

revoke all on schema private from public;
grant usage on schema private to authenticated;
