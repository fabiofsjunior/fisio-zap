-- FisioZap MVP foundation
-- Reproducible schema for local/CI environments.
-- Authorization model: organization membership + professional scope.
-- All exposed tables use RLS.

create extension if not exists pgcrypto;

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner','professional','assistant')),
  created_at timestamptz not null default now(),
  unique (organization_id, user_id)
);

create table if not exists public.patients (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  professional_id uuid not null references auth.users(id),
  full_name text not null,
  phone text,
  birth_date date,
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.appointments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  professional_id uuid not null references auth.users(id),
  patient_id uuid not null references public.patients(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz,
  status text not null default 'scheduled'
    check (status in ('scheduled','confirmed','completed','cancelled','no_show')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.evolutions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  professional_id uuid not null references auth.users(id),
  patient_id uuid not null references public.patients(id) on delete cascade,
  appointment_id uuid references public.appointments(id) on delete set null,
  content text not null,
  source text not null default 'professional'
    check (source in ('professional','ai_suggestion')),
  status text not null default 'draft'
    check (status in ('draft','confirmed')),
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  professional_id uuid not null references auth.users(id),
  patient_id uuid references public.patients(id) on delete cascade,
  type text not null,
  title text not null,
  body text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.exercises (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  professional_id uuid not null references auth.users(id),
  name text not null,
  description text,
  instructions text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.protocols (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  professional_id uuid not null references auth.users(id),
  name text not null,
  description text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.financial_entries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  professional_id uuid not null references auth.users(id),
  patient_id uuid references public.patients(id) on delete set null,
  kind text not null check (kind in ('income','expense')),
  amount numeric(12,2) not null check (amount >= 0),
  description text not null,
  occurred_at date not null default current_date,
  created_at timestamptz not null default now()
);

create index if not exists idx_members_user on public.organization_members(user_id);
create index if not exists idx_patients_scope on public.patients(organization_id, professional_id);
create index if not exists idx_appointments_scope on public.appointments(organization_id, professional_id, starts_at);
create index if not exists idx_evolutions_scope on public.evolutions(organization_id, professional_id, created_at);
create index if not exists idx_notifications_scope on public.notifications(organization_id, professional_id, read_at);
create index if not exists idx_financial_scope on public.financial_entries(organization_id, professional_id, occurred_at);

alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.organization_members enable row level security;
alter table public.patients enable row level security;
alter table public.appointments enable row level security;
alter table public.evolutions enable row level security;
alter table public.notifications enable row level security;
alter table public.exercises enable row level security;
alter table public.protocols enable row level security;
alter table public.financial_entries enable row level security;

drop policy if exists "profiles own row" on public.profiles;
create policy "profiles own row" on public.profiles
  for all to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

drop policy if exists "members own memberships" on public.organization_members;
create policy "members own memberships" on public.organization_members
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "organizations member read" on public.organizations;
create policy "organizations member read" on public.organizations
  for select to authenticated
  using (exists (
    select 1 from public.organization_members m
    where m.organization_id = organizations.id
      and m.user_id = (select auth.uid())
  ));

create or replace function public.is_org_member(target_org uuid, target_user uuid default auth.uid())
returns boolean
language sql
stable
as $$
  select exists (
    select 1 from public.organization_members m
    where m.organization_id = target_org
      and m.user_id = target_user
  );
$$;

grant execute on function public.is_org_member(uuid, uuid) to authenticated;

do $$
declare
  t text;
begin
  foreach t in array array['patients','appointments','evolutions','notifications','exercises','protocols','financial_entries']
  loop
    execute format('drop policy if exists "scoped select" on public.%I', t);
    execute format('drop policy if exists "scoped insert" on public.%I', t);
    execute format('drop policy if exists "scoped update" on public.%I', t);
    execute format('drop policy if exists "scoped delete" on public.%I', t);

    execute format('create policy "scoped select" on public.%I for select to authenticated using (public.is_org_member(organization_id) and professional_id = (select auth.uid()))', t);
    execute format('create policy "scoped insert" on public.%I for insert to authenticated with check (public.is_org_member(organization_id) and professional_id = (select auth.uid()))', t);
    execute format('create policy "scoped update" on public.%I for update to authenticated using (public.is_org_member(organization_id) and professional_id = (select auth.uid())) with check (public.is_org_member(organization_id) and professional_id = (select auth.uid()))', t);
    execute format('create policy "scoped delete" on public.%I for delete to authenticated using (public.is_org_member(organization_id) and professional_id = (select auth.uid()))', t);
  end loop;
end $$;

drop policy if exists "org members manage organizations" on public.organizations;
create policy "org members manage organizations" on public.organizations
  for update to authenticated
  using (exists (
    select 1 from public.organization_members m
    where m.organization_id = organizations.id
      and m.user_id = (select auth.uid())
      and m.role = 'owner'
  ))
  with check (exists (
    select 1 from public.organization_members m
    where m.organization_id = organizations.id
      and m.user_id = (select auth.uid())
      and m.role = 'owner'
  ));
