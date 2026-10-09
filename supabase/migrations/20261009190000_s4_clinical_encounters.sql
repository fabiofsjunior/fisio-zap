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
create or replace function public.s4_prevent_confirmed_evolution_edit() returns trigger language plpgsql set search_path = '' as $$
begin
 if old.status='confirmed' then raise exception 'Confirmed clinical evolution is immutable'; end if;
 if new.status='confirmed' and new.confirmed_at is null then raise exception 'Confirmation timestamp required'; end if;
 return new;
end $$;
revoke all on function public.s4_prevent_confirmed_evolution_edit() from public, anon, authenticated;
create trigger s4_evolution_immutable before update or delete on public.clinical_evolutions
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
-- Never trust client-supplied organization identifiers; policies are defense in depth.
do $$
declare t text;
begin
 foreach t in array array['clinical_encounters','clinical_evolutions','clinical_exercises','clinical_protocols','clinical_encounter_protocols'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('create policy s4_read on public.%I for select to authenticated using (private.is_org_member(organization_id))',t);
  execute format('create policy s4_insert on public.%I for insert to authenticated with check (private.is_org_member(organization_id))',t);
  execute format('create policy s4_update on public.%I for update to authenticated using (private.is_org_member(organization_id)) with check (private.is_org_member(organization_id))',t);
  execute format('create policy s4_delete on public.%I for delete to authenticated using (private.is_org_member(organization_id))',t);
  execute format('revoke all on public.%I from anon',t);
  execute format('grant select,insert,update,delete on public.%I to authenticated',t);
 end loop;
end $$;
