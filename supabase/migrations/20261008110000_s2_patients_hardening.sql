-- S2: harden the patient domain for organization-scoped CRUD.
alter table public.patients add column if not exists email text;

do $
begin
  if not exists (select 1 from pg_constraint where conname = 'organization_members_org_user_key') then
    alter table public.organization_members add constraint organization_members_org_user_key unique (organization_id, user_id);
  end if;
end $;

alter table public.patients drop constraint if exists patients_professional_org_fkey;
alter table public.patients add constraint patients_professional_org_fkey
  foreign key (organization_id, professional_id)
  references public.organization_members (organization_id, user_id)
  on delete restrict;

alter table public.patient_groups drop constraint if exists patient_groups_org_id_key;
alter table public.patient_groups add constraint patient_groups_org_id_key unique (organization_id, id);
alter table public.patients drop constraint if exists patients_group_org_fkey;
alter table public.patients add constraint patients_group_org_fkey
  foreign key (organization_id, group_id)
  references public.patient_groups (organization_id, id)
  on delete set null;

create index if not exists patients_org_status_idx on public.patients (organization_id, status);
create index if not exists patients_org_name_idx on public.patients (organization_id, full_name);
create index if not exists patients_org_email_idx on public.patients (organization_id, email);

alter table public.patients enable row level security;
drop policy if exists "s2_patients_select" on public.patients;
drop policy if exists "s2_patients_insert" on public.patients;
drop policy if exists "s2_patients_update" on public.patients;
drop policy if exists "s2_patients_delete" on public.patients;

create policy "s2_patients_select" on public.patients for select to authenticated
using ((select private.is_org_member(organization_id))
  and ((select private.is_org_admin(organization_id)) or professional_id = (select auth.uid())));

create policy "s2_patients_insert" on public.patients for insert to authenticated
with check ((select private.is_org_member(organization_id))
  and ((select private.is_org_admin(organization_id)) or professional_id = (select auth.uid())));

create policy "s2_patients_update" on public.patients for update to authenticated
using ((select private.is_org_member(organization_id))
  and ((select private.is_org_admin(organization_id)) or professional_id = (select auth.uid())))
with check ((select private.is_org_member(organization_id))
  and ((select private.is_org_admin(organization_id)) or professional_id = (select auth.uid())));

create policy "s2_patients_delete" on public.patients for delete to authenticated
using ((select private.is_org_member(organization_id))
  and ((select private.is_org_admin(organization_id)) or professional_id = (select auth.uid())));

revoke all on table public.patients from anon;
grant select, insert, update, delete on table public.patients to authenticated;
