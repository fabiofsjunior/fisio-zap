-- S9.1: professional document metadata and expiry tracking.
-- Files and patient-related documents are intentionally out of scope here.

create table public.professional_documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  professional_id uuid not null,
  name text not null,
  document_type text not null
    check (document_type in ('registration', 'certificate', 'license', 'other')),
  reference text,
  expires_on date,
  status text not null default 'active'
    check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint professional_documents_org_professional_fkey
    foreign key (organization_id, professional_id)
    references public.organization_members (organization_id, user_id)
    on delete cascade
);

create index professional_documents_expiry_idx
  on public.professional_documents (organization_id, professional_id, expires_on)
  where status = 'active' and expires_on is not null;

alter table public.professional_documents enable row level security;

create policy s9_professional_documents_select
  on public.professional_documents for select to authenticated
  using (
    (select private.is_org_member(organization_id))
    and (
      professional_id = (select auth.uid())
      or exists (
        select 1
        from public.organization_members m
        where m.organization_id = professional_documents.organization_id
          and m.user_id = (select auth.uid())
          and m.role in ('owner', 'coordinator', 'administrative')
      )
    )
  );

create policy s9_professional_documents_insert
  on public.professional_documents for insert to authenticated
  with check (
    (select private.is_org_member(organization_id))
    and (
      professional_id = (select auth.uid())
      or exists (
        select 1
        from public.organization_members m
        where m.organization_id = professional_documents.organization_id
          and m.user_id = (select auth.uid())
          and m.role in ('owner', 'coordinator', 'administrative')
      )
    )
  );

create policy s9_professional_documents_update
  on public.professional_documents for update to authenticated
  using (
    (select private.is_org_member(organization_id))
    and (
      professional_id = (select auth.uid())
      or exists (
        select 1
        from public.organization_members m
        where m.organization_id = professional_documents.organization_id
          and m.user_id = (select auth.uid())
          and m.role in ('owner', 'coordinator', 'administrative')
      )
    )
  )
  with check (
    (select private.is_org_member(organization_id))
    and (
      professional_id = (select auth.uid())
      or exists (
        select 1
        from public.organization_members m
        where m.organization_id = professional_documents.organization_id
          and m.user_id = (select auth.uid())
          and m.role in ('owner', 'coordinator', 'administrative')
      )
    )
  );

-- The API supports GET/POST/PATCH. Ownership and creation fields are immutable,
-- and physical deletion is not exposed through the authenticated Data API.
revoke all on table public.professional_documents from anon, authenticated;
grant select on table public.professional_documents to authenticated;
grant insert (
  organization_id, professional_id, name, document_type, reference, expires_on, status
) on table public.professional_documents to authenticated;
grant update (name, document_type, reference, expires_on, status)
  on table public.professional_documents to authenticated;

create or replace function private.set_professional_document_timestamps()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := pg_catalog.statement_timestamp();
    new.updated_at := new.created_at;
  else
    if new.id is distinct from old.id
      or new.organization_id is distinct from old.organization_id
      or new.professional_id is distinct from old.professional_id
      or new.created_at is distinct from old.created_at then
      raise exception 'Professional document identity and creation time are immutable';
    end if;
    new.updated_at := pg_catalog.statement_timestamp();
  end if;
  return new;
end;
$$;

revoke all on function private.set_professional_document_timestamps() from public, anon, authenticated;

create trigger professional_documents_set_timestamps
  before insert or update on public.professional_documents
  for each row execute function private.set_professional_document_timestamps();
