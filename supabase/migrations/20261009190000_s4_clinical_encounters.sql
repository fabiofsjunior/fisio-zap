-- S4.1: clinical encounter records. Synthetic data only during QA.
create table public.clinical_encounters (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id) on delete cascade,
 patient_id uuid not null,
 professional_id uuid not null,
 appointment_id uuid,
 status text not null default 'in_progress' check (status in ('in_progress','completed')),
 started_at timestamptz not null default now(),
 completed_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique (organization_id,id),
 foreign key (organization_id,patient_id) references public.patients(organization_id,id) on delete restrict,
 foreign key (organization_id,professional_id) references public.organization_members(organization_id,user_id) on delete restrict,
 check ((status='in_progress' and completed_at is null) or (status='completed' and completed_at is not null))
);
-- Appointment must belong to the same organization and patient/professional.
alter table public.appointments add constraint appointments_s4_org_id_unique unique (organization_id,id);
alter table public.clinical_encounters add constraint clinical_encounters_appointment_org_fk
 foreign key (organization_id,appointment_id) references public.appointments(organization_id,id) on delete restrict;
create or replace function public.s4_validate_encounter_appointment() returns trigger language plpgsql set search_path = '' as $s4$
begin
 if new.appointment_id is not null and not exists (
  select 1 from public.appointments a
  where a.id=new.appointment_id and a.organization_id=new.organization_id
    and a.patient_id=new.patient_id and a.professional_id=new.professional_id
 ) then raise exception 'Appointment does not match encounter patient and professional'; end if;
 return new;
end $s4$;
revoke all on function public.s4_validate_encounter_appointment() from public, anon, authenticated;
create trigger s4_encounter_appointment_match before insert or update on public.clinical_encounters
 for each row execute function public.s4_validate_encounter_appointment();
create unique index clinical_encounters_org_appointment_unique on public.clinical_encounters(organization_id,appointment_id) where appointment_id is not null;
create index clinical_encounters_patient_history_idx on public.clinical_encounters(organization_id,patient_id,started_at desc);
create table public.clinical_evolutions (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null,
 encounter_id uuid not null,
 author_id uuid not null,
 content text not null check (char_length(content) between 1 and 10000),
 status text not null default 'draft' check (status in ('draft','confirmed')),
 confirmed_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 foreign key (organization_id,encounter_id) references public.clinical_encounters(organization_id,id) on delete restrict,
 foreign key (organization_id,author_id) references public.organization_members(organization_id,user_id) on delete restrict,
 check ((status='draft' and confirmed_at is null) or (status='confirmed' and confirmed_at is not null))
);
create index clinical_evolutions_encounter_idx on public.clinical_evolutions(organization_id,encounter_id,created_at desc);
create or replace function public.s4_prevent_confirmed_evolution_edit()
returns trigger
language plpgsql
set search_path = ''
as $s4$
declare
 encounter_status text;
begin
 if tg_op='DELETE' then
  if old.status='confirmed' then raise exception 'Confirmed clinical evolution is immutable'; end if;
  return old;
 end if;
 if tg_op='INSERT' then
  if new.status <> 'draft' or new.confirmed_at is not null then
   raise exception 'Clinical evolutions must be inserted as drafts';
  end if;
  select ce.status into encounter_status
  from public.clinical_encounters ce
  where ce.organization_id=new.organization_id and ce.id=new.encounter_id
  for update;
  if encounter_status is distinct from 'in_progress' then
   raise exception 'Clinical evolutions require an in-progress encounter';
  end if;
  return new;
 end if;
 if old.status='confirmed' then raise exception 'Confirmed clinical evolution is immutable'; end if;
 if new.status='confirmed' and new.content is distinct from old.content then
  raise exception 'Review the draft before confirming it';
 end if;
 if new.status='confirmed' and new.confirmed_at is null then
  raise exception 'Confirmation timestamp required';
 end if;
 return new;
end
$s4$;
revoke all on function public.s4_prevent_confirmed_evolution_edit() from public, anon, authenticated;
create trigger s4_evolution_immutable before insert or update or delete on public.clinical_evolutions
 for each row execute function public.s4_prevent_confirmed_evolution_edit();
create table public.clinical_exercises (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null,
 encounter_id uuid not null,
 title text not null check (char_length(title) between 1 and 200),
 instructions text check (char_length(instructions)<=4000),
 created_at timestamptz not null default now(),
 foreign key (organization_id,encounter_id) references public.clinical_encounters(organization_id,id) on delete restrict
);
create table public.clinical_protocols (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id) on delete cascade,
 title text not null check (char_length(title) between 1 and 200),
 description text check (char_length(description)<=4000),
 created_at timestamptz not null default now()
);
create table public.clinical_encounter_protocols (
 organization_id uuid not null,
 encounter_id uuid not null,
 protocol_id uuid not null,
 primary key (organization_id,encounter_id,protocol_id),
 foreign key (organization_id,encounter_id) references public.clinical_encounters(organization_id,id) on delete cascade,
 foreign key (protocol_id) references public.clinical_protocols(id) on delete restrict
);
-- Add composite organization scoping for protocol references.
alter table public.clinical_protocols add constraint clinical_protocols_org_id_unique unique (organization_id,id);
alter table public.clinical_encounter_protocols add constraint clinical_encounter_protocols_org_fk foreign key (organization_id,protocol_id) references public.clinical_protocols(organization_id,id);
-- Organization membership establishes the outer boundary; clinical rows are then
-- limited to the responsible professional or an organization administrator.
alter table public.clinical_encounters enable row level security;
create policy s4_encounters_select on public.clinical_encounters for select to authenticated
using ((select private.is_org_member(organization_id))
 and ((select private.is_org_admin(organization_id)) or professional_id=(select auth.uid())));
create policy s4_encounters_insert on public.clinical_encounters for insert to authenticated
with check ((select private.is_org_member(organization_id))
 and ((select private.is_org_admin(organization_id)) or professional_id=(select auth.uid())));
create policy s4_encounters_update on public.clinical_encounters for update to authenticated
using ((select private.is_org_member(organization_id))
 and ((select private.is_org_admin(organization_id)) or professional_id=(select auth.uid())))
with check ((select private.is_org_member(organization_id))
 and ((select private.is_org_admin(organization_id)) or professional_id=(select auth.uid())));
create policy s4_encounters_delete on public.clinical_encounters for delete to authenticated
using ((select private.is_org_member(organization_id))
 and ((select private.is_org_admin(organization_id)) or professional_id=(select auth.uid())));
revoke all on public.clinical_encounters from anon;
grant select,insert,update,delete on public.clinical_encounters to authenticated;

alter table public.clinical_evolutions enable row level security;
create policy s4_evolutions_select on public.clinical_evolutions for select to authenticated
using ((select private.is_org_member(organization_id))
 and exists (
  select 1 from public.clinical_encounters ce
  where ce.organization_id=clinical_evolutions.organization_id
   and ce.id=clinical_evolutions.encounter_id
   and ((select private.is_org_admin(ce.organization_id)) or ce.professional_id=(select auth.uid()))
 ));
create policy s4_evolutions_insert on public.clinical_evolutions for insert to authenticated
with check ((select private.is_org_member(organization_id))
 and author_id=(select auth.uid())
 and status='draft' and confirmed_at is null
 and exists (
  select 1 from public.clinical_encounters ce
  where ce.organization_id=clinical_evolutions.organization_id
   and ce.id=clinical_evolutions.encounter_id
   and ce.status='in_progress'
   and ((select private.is_org_admin(ce.organization_id)) or ce.professional_id=(select auth.uid()))
 ));
create policy s4_evolutions_update on public.clinical_evolutions for update to authenticated
using ((select private.is_org_member(organization_id))
 and author_id=(select auth.uid())
 and exists (
  select 1 from public.clinical_encounters ce
  where ce.organization_id=clinical_evolutions.organization_id
   and ce.id=clinical_evolutions.encounter_id
   and ((select private.is_org_admin(ce.organization_id)) or ce.professional_id=(select auth.uid()))
 ))
with check ((select private.is_org_member(organization_id))
 and author_id=(select auth.uid())
 and exists (
  select 1 from public.clinical_encounters ce
  where ce.organization_id=clinical_evolutions.organization_id
   and ce.id=clinical_evolutions.encounter_id
   and ((select private.is_org_admin(ce.organization_id)) or ce.professional_id=(select auth.uid()))
 ));
create policy s4_evolutions_delete on public.clinical_evolutions for delete to authenticated
using ((select private.is_org_member(organization_id))
 and author_id=(select auth.uid())
 and status='draft'
 and exists (
  select 1 from public.clinical_encounters ce
  where ce.organization_id=clinical_evolutions.organization_id
   and ce.id=clinical_evolutions.encounter_id
   and ((select private.is_org_admin(ce.organization_id)) or ce.professional_id=(select auth.uid()))
 ));
revoke all on public.clinical_evolutions from anon;
grant select,insert,update,delete on public.clinical_evolutions to authenticated;

alter table public.clinical_exercises enable row level security;
create policy s4_exercises_select on public.clinical_exercises for select to authenticated
using ((select private.is_org_member(organization_id))
 and exists (
  select 1 from public.clinical_encounters ce
  where ce.organization_id=clinical_exercises.organization_id
   and ce.id=clinical_exercises.encounter_id
   and ((select private.is_org_admin(ce.organization_id)) or ce.professional_id=(select auth.uid()))
 ));
create policy s4_exercises_insert on public.clinical_exercises for insert to authenticated
with check ((select private.is_org_member(organization_id))
 and exists (
  select 1 from public.clinical_encounters ce
  where ce.organization_id=clinical_exercises.organization_id
   and ce.id=clinical_exercises.encounter_id
   and ce.status='in_progress'
   and ((select private.is_org_admin(ce.organization_id)) or ce.professional_id=(select auth.uid()))
 ));
create policy s4_exercises_update on public.clinical_exercises for update to authenticated
using ((select private.is_org_member(organization_id))
 and exists (
  select 1 from public.clinical_encounters ce
  where ce.organization_id=clinical_exercises.organization_id
   and ce.id=clinical_exercises.encounter_id
   and ce.status='in_progress'
   and ((select private.is_org_admin(ce.organization_id)) or ce.professional_id=(select auth.uid()))
 ))
with check ((select private.is_org_member(organization_id))
 and exists (
  select 1 from public.clinical_encounters ce
  where ce.organization_id=clinical_exercises.organization_id
   and ce.id=clinical_exercises.encounter_id
   and ce.status='in_progress'
   and ((select private.is_org_admin(ce.organization_id)) or ce.professional_id=(select auth.uid()))
 ));
create policy s4_exercises_delete on public.clinical_exercises for delete to authenticated
using ((select private.is_org_member(organization_id))
 and exists (
  select 1 from public.clinical_encounters ce
  where ce.organization_id=clinical_exercises.organization_id
   and ce.id=clinical_exercises.encounter_id
   and ce.status='in_progress'
   and ((select private.is_org_admin(ce.organization_id)) or ce.professional_id=(select auth.uid()))
 ));
revoke all on public.clinical_exercises from anon;
grant select,insert,update,delete on public.clinical_exercises to authenticated;

alter table public.clinical_protocols enable row level security;
create policy s4_protocols_select on public.clinical_protocols for select to authenticated
using ((select private.is_org_member(organization_id)));
create policy s4_protocols_insert on public.clinical_protocols for insert to authenticated
with check ((select private.is_org_member(organization_id)) and (select private.is_org_admin(organization_id)));
create policy s4_protocols_update on public.clinical_protocols for update to authenticated
using ((select private.is_org_member(organization_id)) and (select private.is_org_admin(organization_id)))
with check ((select private.is_org_member(organization_id)) and (select private.is_org_admin(organization_id)));
create policy s4_protocols_delete on public.clinical_protocols for delete to authenticated
using ((select private.is_org_member(organization_id)) and (select private.is_org_admin(organization_id)));
revoke all on public.clinical_protocols from anon;
grant select,insert,update,delete on public.clinical_protocols to authenticated;

alter table public.clinical_encounter_protocols enable row level security;
create policy s4_encounter_protocols_select on public.clinical_encounter_protocols for select to authenticated
using ((select private.is_org_member(organization_id))
 and exists (
  select 1 from public.clinical_encounters ce
  where ce.organization_id=clinical_encounter_protocols.organization_id
   and ce.id=clinical_encounter_protocols.encounter_id
   and ((select private.is_org_admin(ce.organization_id)) or ce.professional_id=(select auth.uid()))
 ));
create policy s4_encounter_protocols_insert on public.clinical_encounter_protocols for insert to authenticated
with check ((select private.is_org_member(organization_id))
 and exists (
  select 1 from public.clinical_encounters ce
  where ce.organization_id=clinical_encounter_protocols.organization_id
   and ce.id=clinical_encounter_protocols.encounter_id
   and ce.status='in_progress'
   and ((select private.is_org_admin(ce.organization_id)) or ce.professional_id=(select auth.uid()))
 )
 and exists (
  select 1 from public.clinical_protocols cp
  where cp.organization_id=clinical_encounter_protocols.organization_id
   and cp.id=clinical_encounter_protocols.protocol_id
 ));
create policy s4_encounter_protocols_delete on public.clinical_encounter_protocols for delete to authenticated
using ((select private.is_org_member(organization_id))
 and exists (
  select 1 from public.clinical_encounters ce
  where ce.organization_id=clinical_encounter_protocols.organization_id
   and ce.id=clinical_encounter_protocols.encounter_id
   and ce.status='in_progress'
   and ((select private.is_org_admin(ce.organization_id)) or ce.professional_id=(select auth.uid()))
 ));
revoke all on public.clinical_encounter_protocols from anon;
grant select,insert,delete on public.clinical_encounter_protocols to authenticated;
