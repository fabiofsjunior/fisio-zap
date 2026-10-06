-- FisioZap security hardening
-- Keep SECURITY DEFINER helpers out of the exposed public schema.
-- They are used by RLS and therefore remain executable only by authenticated
-- requests where needed. The auth trigger helper is not directly callable.

create schema if not exists private;

revoke usage on schema private from public;
grant usage on schema private to authenticated;

alter function public.is_org_member(uuid) set schema private;
alter function public.is_org_admin(uuid) set schema private;
alter function public.handle_new_user() set schema private;

alter function private.is_org_member(uuid) set search_path = '';
alter function private.is_org_admin(uuid) set search_path = '';
alter function private.handle_new_user() set search_path = '';

revoke execute on function private.is_org_member(uuid) from public, anon;
grant execute on function private.is_org_member(uuid) to authenticated;

revoke execute on function private.is_org_admin(uuid) from public, anon;
grant execute on function private.is_org_admin(uuid) to authenticated;

revoke execute on function private.handle_new_user() from public, anon, authenticated;

revoke all on schema private from public;
grant usage on schema private to authenticated;
