-- S1.5: additive reconciliation of remote Supabase schema.
create extension if not exists pgcrypto;
create schema if not exists private;
do $$begin
 if not exists(select 1 from pg_type where typnamespace='public'::regnamespace and typname='app_role') then create type public.app_role as enum('owner','professional','coordinator','administrative');end if;
 if not exists(select 1 from pg_type where typnamespace='public'::regnamespace and typname='appointment_status') then create type public.appointment_status as enum('scheduled','confirmed','completed','cancelled','no_show','rescheduled');end if;
 if not exists(select 1 from pg_type where typnamespace='public'::regnamespace and typname='notification_priority') then create type public.notification_priority as enum('urgent','attention','informational');end if;
 if not exists(select 1 from pg_type where typnamespace='public'::regnamespace and typname='notification_status') then create type public.notification_status as enum('unread','read','completed','dismissed');end if;
 if not exists(select 1 from pg_type where typnamespace='public'::regnamespace and typname='patient_status') then create type public.patient_status as enum('active','inactive','discharged');end if;
end$$;

alter table public.organizations add column if not exists owner_id uuid;
alter table public.organizations add column if not exists updated_at timestamptz not null default now();
update public.organizations o set owner_id=(select m.user_id from public.organization_members m where m.organization_id=o.id and m.role='owner' order by m.created_at limit 1) where o.owner_id is null;
do $$begin if exists(select 1 from public.organizations where owner_id is null) then raise exception 'S1.5: owner_id cannot be derived safely';end if;end$$;
alter table public.organizations alter column owner_id set not null;
alter table public.organizations drop constraint if exists organizations_owner_id_fkey;
alter table public.organizations add constraint organizations_owner_id_fkey foreign key(owner_id) references auth.users(id) on delete restrict;

do $$begin if exists(select 1 from public.organization_members where role not in('owner','professional','coordinator','administrative')) then raise exception 'S1.5: unsupported membership role';end if;end$$;
alter table public.organization_members alter column role type public.app_role using role::public.app_role;
alter table public.profiles add column if not exists professional_registration text;
alter table public.profiles add column if not exists profession text default 'Fisioterapia';
alter table public.profiles add column if not exists avatar_url text;

create table if not exists public.patient_groups(id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id) on delete cascade,name text not null,description text,created_at timestamptz not null default now(),unique(organization_id,name));
create table if not exists public.skills(id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id) on delete cascade,professional_id uuid not null references auth.users(id) on delete cascade,name text not null,description text,created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create table if not exists public.documents(id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id) on delete cascade,patient_id uuid references public.patients(id) on delete cascade,professional_id uuid not null references auth.users(id) on delete restrict,document_type text not null,title text not null,content text,ai_assisted boolean not null default false,confirmed_at timestamptz,created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create table if not exists public.patient_protocols(id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id) on delete cascade,patient_id uuid not null references public.patients(id) on delete cascade,protocol_id uuid not null references public.protocols(id) on delete restrict,started_at date,ended_at date,active boolean not null default true,created_at timestamptz not null default now());

alter table public.patients add column if not exists group_id uuid;
alter table public.patients add column if not exists address text;
alter table public.patients add column if not exists condition text;
alter table public.patients add column if not exists treatment_goal text;
alter table public.patients add column if not exists status public.patient_status default 'active';
alter table public.patients add column if not exists started_at date;
alter table public.patients alter column professional_id drop not null;
update public.patients set status=case when active then 'active'::public.patient_status else 'inactive'::public.patient_status end where status is null;
alter table public.patients alter column status set not null;
alter table public.patients drop constraint if exists patients_group_id_fkey;
alter table public.patients add constraint patients_group_id_fkey foreign key(group_id) references public.patient_groups(id) on delete set null;

alter table public.appointments add column if not exists duration_minutes integer default 60;
alter table public.appointments add column if not exists protocol_name text;
alter table public.appointments add column if not exists status_new public.appointment_status;
update public.appointments set status_new=status::text::public.appointment_status where status_new is null;
alter table public.appointments drop constraint if exists appointments_duration_minutes_check;
alter table public.appointments add constraint appointments_duration_minutes_check check(duration_minutes between 5 and 480);

create table if not exists public.clinical_notes(id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id) on delete cascade,patient_id uuid not null references public.patients(id) on delete cascade,appointment_id uuid references public.appointments(id) on delete set null,professional_id uuid not null references auth.users(id) on delete restrict,content text not null,ai_assisted boolean not null default false,confirmed_at timestamptz,created_at timestamptz not null default now(),updated_at timestamptz not null default now());

alter table public.exercises add column if not exists objective text;
alter table public.exercises add column if not exists duration_minutes integer;
alter table public.exercises add column if not exists repetitions text;
alter table public.exercises add column if not exists frequency text;
alter table public.exercises add column if not exists observations text;
alter table public.protocols add column if not exists skill_id uuid;
alter table public.protocols add column if not exists objective text;
alter table public.protocols add column if not exists estimated_session_minutes integer;
alter table public.protocols add column if not exists content jsonb default '{}'::jsonb;
alter table public.protocols add column if not exists approved_by_professional boolean default false;
alter table public.protocols drop constraint if exists protocols_skill_id_fkey;
alter table public.protocols add constraint protocols_skill_id_fkey foreign key(skill_id) references public.skills(id) on delete set null;
alter table public.financial_entries add column if not exists entry_type text;
alter table public.financial_entries add column if not exists due_date date;
alter table public.financial_entries add column if not exists paid_at timestamptz;
update public.financial_entries set entry_type=coalesce(entry_type,kind),due_date=coalesce(due_date,occurred_at) where entry_type is null or due_date is null;
alter table public.financial_entries alter column entry_type set not null;

alter table public.notifications add column if not exists user_id uuid;
alter table public.notifications add column if not exists priority public.notification_priority default 'informational';
alter table public.notifications add column if not exists status public.notification_status default 'unread';
alter table public.notifications add column if not exists message text;
alter table public.notifications add column if not exists action_type text;
alter table public.notifications add column if not exists action_data jsonb default '{}'::jsonb;
alter table public.notifications add column if not exists completed_at timestamptz;
update public.notifications set user_id=coalesce(user_id,professional_id),message=coalesce(message,body),action_type=coalesce(action_type,type),status=case when completed_at is not null then 'completed'::public.notification_status when read_at is not null then 'read'::public.notification_status else 'unread'::public.notification_status end;
alter table public.notifications alter column user_id set not null;
alter table public.notifications alter column status set not null;
alter table public.notifications alter column action_data set not null;

alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.organization_members enable row level security;
alter table public.patient_groups enable row level security;
alter table public.patients enable row level security;
alter table public.appointments enable row level security;
alter table public.clinical_notes enable row level security;
alter table public.documents enable row level security;
alter table public.exercises enable row level security;
alter table public.financial_entries enable row level security;
alter table public.notifications enable row level security;
alter table public.patient_protocols enable row level security;
alter table public.protocols enable row level security;
alter table public.skills enable row level security;

create or replace function private.is_org_member(target_org uuid) returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.organization_members m where m.organization_id=target_org and m.user_id=(select auth.uid()));$$;
create or replace function private.is_org_admin(target_org uuid) returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.organization_members m where m.organization_id=target_org and m.user_id=(select auth.uid()) and m.role in('owner','coordinator'));$$;
revoke execute on function private.is_org_member(uuid) from public,anon;
revoke execute on function private.is_org_admin(uuid) from public,anon;
grant usage on schema private to authenticated;
grant execute on function private.is_org_member(uuid) to authenticated;
grant execute on function private.is_org_admin(uuid) to authenticated;

do $$declare t text;begin foreach t in array array['patients','appointments','clinical_notes','documents','exercises','protocols','skills','financial_entries'] loop
 execute format('drop policy if exists "scoped select" on public.%I',t);
 execute format('drop policy if exists "scoped insert" on public.%I',t);
 execute format('drop policy if exists "scoped update" on public.%I',t);
 execute format('drop policy if exists "scoped delete" on public.%I',t);
 execute format('drop policy if exists "s15_select" on public.%I',t);
 execute format('drop policy if exists "s15_insert" on public.%I',t);
 execute format('drop policy if exists "s15_update" on public.%I',t);
 execute format('drop policy if exists "s15_delete" on public.%I',t);
 execute format('create policy "s15_select" on public.%I for select to authenticated using((select private.is_org_member(organization_id)) and ((select private.is_org_admin(organization_id)) or professional_id=(select auth.uid())))',t);
 execute format('create policy "s15_insert" on public.%I for insert to authenticated with check((select private.is_org_member(organization_id)) and ((select private.is_org_admin(organization_id)) or professional_id=(select auth.uid())))',t);
 execute format('create policy "s15_update" on public.%I for update to authenticated using((select private.is_org_member(organization_id)) and ((select private.is_org_admin(organization_id)) or professional_id=(select auth.uid()))) with check((select private.is_org_member(organization_id)) and ((select private.is_org_admin(organization_id)) or professional_id=(select auth.uid())))',t);
 execute format('create policy "s15_delete" on public.%I for delete to authenticated using((select private.is_org_member(organization_id)) and ((select private.is_org_admin(organization_id)) or professional_id=(select auth.uid())))',t);
end loop;end$$;

drop policy if exists "s15_patient_protocols_select" on public.patient_protocols;
drop policy if exists "s15_patient_protocols_insert" on public.patient_protocols;
drop policy if exists "s15_patient_protocols_update" on public.patient_protocols;
drop policy if exists "s15_patient_protocols_delete" on public.patient_protocols;
create policy "s15_patient_protocols_select" on public.patient_protocols for select to authenticated using((select private.is_org_member(organization_id)));
create policy "s15_patient_protocols_insert" on public.patient_protocols for insert to authenticated with check((select private.is_org_member(organization_id)) and ((select private.is_org_admin(organization_id)) or exists(select 1 from public.patients p where p.id=patient_id and p.organization_id=patient_protocols.organization_id and p.professional_id=(select auth.uid()))));
create policy "s15_patient_protocols_update" on public.patient_protocols for update to authenticated using((select private.is_org_member(organization_id)) and ((select private.is_org_admin(organization_id)) or exists(select 1 from public.patients p where p.id=patient_id and p.organization_id=patient_protocols.organization_id and p.professional_id=(select auth.uid())))) with check((select private.is_org_member(organization_id)) and ((select private.is_org_admin(organization_id)) or exists(select 1 from public.patients p where p.id=patient_id and p.organization_id=patient_protocols.organization_id and p.professional_id=(select auth.uid()))));
create policy "s15_patient_protocols_delete" on public.patient_protocols for delete to authenticated using((select private.is_org_member(organization_id)) and ((select private.is_org_admin(organization_id)) or exists(select 1 from public.patients p where p.id=patient_id and p.organization_id=patient_protocols.organization_id and p.professional_id=(select auth.uid()))));

create policy "s15_notifications_select" on public.notifications for select to authenticated using((select auth.uid())=user_id and (select private.is_org_member(organization_id)));
create policy "s15_notifications_insert" on public.notifications for insert to authenticated with check((select auth.uid())=user_id and (select private.is_org_member(organization_id)));
create policy "s15_notifications_update" on public.notifications for update to authenticated using((select auth.uid())=user_id and (select private.is_org_member(organization_id))) with check((select auth.uid())=user_id and (select private.is_org_member(organization_id)));
create policy "s15_notifications_delete" on public.notifications for delete to authenticated using((select auth.uid())=user_id and (select private.is_org_member(organization_id)));

create policy "s15_profiles" on public.profiles for all to authenticated using((select auth.uid())=id) with check((select auth.uid())=id);
create policy "s15_org_read" on public.organizations for select to authenticated using((select private.is_org_member(id)));
create policy "s15_members" on public.organization_members for select to authenticated using(user_id=(select auth.uid()) or (select private.is_org_admin(organization_id)));

do $$declare t text;begin foreach t in array array['organizations','profiles','organization_members','patient_groups','patients','appointments','clinical_notes','documents','exercises','financial_entries','notifications','patient_protocols','protocols','skills'] loop
 execute format('revoke all on table public.%I from anon',t);
 execute format('revoke all on table public.%I from authenticated',t);
 execute format('grant select,insert,update,delete on table public.%I to authenticated',t);
end loop;end$$;

create index if not exists patients_org_idx on public.patients(organization_id);
create index if not exists patients_professional_idx on public.patients(professional_id);
create index if not exists appointments_patient_idx on public.appointments(patient_id);
create index if not exists appointments_professional_time_idx on public.appointments(professional_id,starts_at);
create index if not exists clinical_notes_patient_idx on public.clinical_notes(patient_id,created_at desc);
create index if not exists financial_entries_professional_idx on public.financial_entries(professional_id,created_at desc);
create index if not exists notifications_user_status_idx on public.notifications(user_id,status,created_at desc);
