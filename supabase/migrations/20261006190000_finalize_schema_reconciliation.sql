-- S1.5 follow-up: normalize appointments, close RLS gap for patient groups, and index foreign keys.
-- Additive/data-preserving; safe to replay after the S1.5 reconciliation migration.

alter table public.appointments drop column if exists status_new;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema='public' and table_name='appointments'
      and column_name='status'
      and udt_name='text'
  ) then
    alter table public.appointments
      alter column status type public.appointment_status
      using status::text::public.appointment_status;
  end if;
end $$;

alter table public.appointments
  alter column status set default 'scheduled'::public.appointment_status;

drop policy if exists "s15_groups_select" on public.patient_groups;
drop policy if exists "s15_groups_insert" on public.patient_groups;
drop policy if exists "s15_groups_update" on public.patient_groups;
drop policy if exists "s15_groups_delete" on public.patient_groups;

create policy "s15_groups_select"
on public.patient_groups
for select to authenticated
using ((select private.is_org_member(organization_id)));

create policy "s15_groups_insert"
on public.patient_groups
for insert to authenticated
with check ((select private.is_org_member(organization_id)));

create policy "s15_groups_update"
on public.patient_groups
for update to authenticated
using ((select private.is_org_member(organization_id)))
with check ((select private.is_org_member(organization_id)));

create policy "s15_groups_delete"
on public.patient_groups
for delete to authenticated
using ((select private.is_org_member(organization_id)));

create index if not exists organizations_owner_id_idx
  on public.organizations(owner_id);

create index if not exists organization_members_organization_id_idx
  on public.organization_members(organization_id);

create index if not exists organization_members_user_id_idx
  on public.organization_members(user_id);

create index if not exists patient_groups_organization_id_idx
  on public.patient_groups(organization_id);

create index if not exists patients_group_id_idx
  on public.patients(group_id);

create index if not exists appointments_organization_id_idx
  on public.appointments(organization_id);

create index if not exists appointments_patient_id_idx
  on public.appointments(patient_id);

create index if not exists appointments_professional_id_idx
  on public.appointments(professional_id);

create index if not exists clinical_notes_organization_id_idx
  on public.clinical_notes(organization_id);

create index if not exists clinical_notes_appointment_id_idx
  on public.clinical_notes(appointment_id);

create index if not exists clinical_notes_professional_id_idx
  on public.clinical_notes(professional_id);

create index if not exists documents_organization_id_idx
  on public.documents(organization_id);

create index if not exists documents_patient_id_idx
  on public.documents(patient_id);

create index if not exists documents_professional_id_idx
  on public.documents(professional_id);

create index if not exists exercises_organization_id_idx
  on public.exercises(organization_id);

create index if not exists exercises_professional_id_idx
  on public.exercises(professional_id);

create index if not exists protocols_organization_id_idx
  on public.protocols(organization_id);

create index if not exists protocols_professional_id_idx
  on public.protocols(professional_id);

create index if not exists protocols_skill_id_idx
  on public.protocols(skill_id);

create index if not exists skills_organization_id_idx
  on public.skills(organization_id);

create index if not exists skills_professional_id_idx
  on public.skills(professional_id);

create index if not exists patient_protocols_organization_id_idx
  on public.patient_protocols(organization_id);

create index if not exists patient_protocols_patient_id_idx
  on public.patient_protocols(patient_id);

create index if not exists patient_protocols_protocol_id_idx
  on public.patient_protocols(protocol_id);

create index if not exists notifications_organization_id_idx
  on public.notifications(organization_id);

create index if not exists notifications_patient_id_idx
  on public.notifications(patient_id);

create index if not exists notifications_user_id_idx
  on public.notifications(user_id);

create index if not exists financial_entries_organization_id_idx
  on public.financial_entries(organization_id);

create index if not exists financial_entries_patient_id_idx
  on public.financial_entries(patient_id);

create index if not exists financial_entries_professional_id_idx
  on public.financial_entries(professional_id);
