-- S5.1: notifications are personal tasks. Remove the older organization/professional
-- policies because permissive PostgreSQL policies combine with OR.
drop policy if exists "scoped select" on public.notifications;
drop policy if exists "scoped insert" on public.notifications;
drop policy if exists "scoped update" on public.notifications;
drop policy if exists "scoped delete" on public.notifications;

-- Recreate the current rules idempotently so replay leaves exactly the intended
-- authenticated-user policy set for this table.
drop policy if exists "s15_notifications_select" on public.notifications;
drop policy if exists "s15_notifications_insert" on public.notifications;
drop policy if exists "s15_notifications_update" on public.notifications;
drop policy if exists "s15_notifications_delete" on public.notifications;

create policy "s15_notifications_select" on public.notifications
  for select to authenticated
  using (user_id = (select auth.uid()) and professional_id = (select auth.uid()) and (select private.is_org_member(organization_id)));

create policy "s15_notifications_insert" on public.notifications
  for insert to authenticated
  with check (user_id = (select auth.uid()) and professional_id = (select auth.uid()) and (select private.is_org_member(organization_id)));

create policy "s15_notifications_update" on public.notifications
  for update to authenticated
  using (user_id = (select auth.uid()) and professional_id = (select auth.uid()) and (select private.is_org_member(organization_id)))
  with check (user_id = (select auth.uid()) and professional_id = (select auth.uid()) and (select private.is_org_member(organization_id)));

create policy "s15_notifications_delete" on public.notifications
  for delete to authenticated
  using (user_id = (select auth.uid()) and professional_id = (select auth.uid()) and (select private.is_org_member(organization_id)));
