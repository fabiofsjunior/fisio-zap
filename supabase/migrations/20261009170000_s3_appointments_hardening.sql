-- S3.1: harden existing appointments without changing authenticated login.
-- Store instants as timestamptz; API will convert user-local times to UTC.
alter table public.appointments
  alter column ends_at set not null;

alter table public.appointments drop constraint if exists appointments_valid_interval;
alter table public.appointments add constraint appointments_valid_interval
  check (ends_at > starts_at);

-- Scope both relationships to the appointment organization.
alter table public.patients drop constraint if exists patients_org_id_id_key;
alter table public.patients add constraint patients_org_id_id_key unique (organization_id, id);

alter table public.appointments drop constraint if exists appointments_patient_org_fkey;
alter table public.appointments add constraint appointments_patient_org_fkey
  foreign key (organization_id, patient_id)
  references public.patients (organization_id, id) on delete cascade;

alter table public.appointments drop constraint if exists appointments_professional_org_fkey;
alter table public.appointments add constraint appointments_professional_org_fkey
  foreign key (organization_id, professional_id)
  references public.organization_members (organization_id, user_id) on delete restrict;

create index if not exists appointments_org_start_idx
  on public.appointments (organization_id, starts_at);
create index if not exists appointments_professional_interval_idx
  on public.appointments (organization_id, professional_id, starts_at, ends_at);

-- Keep existing appointments, but replace generic policies with explicit ownership rules.
alter table public.appointments enable row level security;
drop policy if exists "appointments_scoped_access" on public.appointments;
drop policy if exists "s15_select" on public.appointments;
drop policy if exists "s15_insert" on public.appointments;
drop policy if exists "s15_update" on public.appointments;
drop policy if exists "s15_delete" on public.appointments;
drop policy if exists "scoped select" on public.appointments;
drop policy if exists "scoped insert" on public.appointments;
drop policy if exists "scoped update" on public.appointments;
drop policy if exists "scoped delete" on public.appointments;

create policy "s3_appointments_select" on public.appointments for select to authenticated
using ((select private.is_org_member(organization_id))
  and ((select private.is_org_admin(organization_id)) or professional_id = (select auth.uid())));
create policy "s3_appointments_insert" on public.appointments for insert to authenticated
with check ((select private.is_org_member(organization_id))
  and ((select private.is_org_admin(organization_id)) or professional_id = (select auth.uid())));
create policy "s3_appointments_update" on public.appointments for update to authenticated
using ((select private.is_org_member(organization_id))
  and ((select private.is_org_admin(organization_id)) or professional_id = (select auth.uid())))
with check ((select private.is_org_member(organization_id))
  and ((select private.is_org_admin(organization_id)) or professional_id = (select auth.uid())));
create policy "s3_appointments_delete" on public.appointments for delete to authenticated
using ((select private.is_org_member(organization_id))
  and ((select private.is_org_admin(organization_id)) or professional_id = (select auth.uid())));

revoke all on table public.appointments from anon;
grant select, insert, update, delete on table public.appointments to authenticated;
