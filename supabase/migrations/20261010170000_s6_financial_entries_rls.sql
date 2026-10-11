-- S6.1: financial access is broader than clinical access for organization managers,
-- while professionals remain limited to their own ledger entries.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.financial_entries'::regclass
      and conname = 'financial_entries_amount_positive_check'
  ) then
    -- NOT VALID preserves any legacy rows while enforcing all new inserts/updates.
    alter table public.financial_entries
      add constraint financial_entries_amount_positive_check check (amount > 0) not valid;
  end if;
end $$;

drop policy if exists "scoped select" on public.financial_entries;
drop policy if exists "scoped insert" on public.financial_entries;
drop policy if exists "scoped update" on public.financial_entries;
drop policy if exists "scoped delete" on public.financial_entries;
drop policy if exists "s15_select" on public.financial_entries;
drop policy if exists "s15_insert" on public.financial_entries;
drop policy if exists "s15_update" on public.financial_entries;
drop policy if exists "s15_delete" on public.financial_entries;
drop policy if exists "s6_financial_entries_select" on public.financial_entries;
drop policy if exists "s6_financial_entries_insert" on public.financial_entries;
drop policy if exists "s6_financial_entries_update" on public.financial_entries;

create policy "s6_financial_entries_select" on public.financial_entries
  for select to authenticated
  using (
    (select private.is_org_member(organization_id))
    and (
      professional_id = (select auth.uid())
      or exists (
        select 1 from public.organization_members m
        where m.organization_id = financial_entries.organization_id
          and m.user_id = (select auth.uid())
          and m.role in ('owner', 'coordinator', 'administrative')
      )
    )
  );

create policy "s6_financial_entries_insert" on public.financial_entries
  for insert to authenticated
  with check (
    (select private.is_org_member(organization_id))
    and (
      professional_id = (select auth.uid())
      or exists (
        select 1 from public.organization_members m
        where m.organization_id = financial_entries.organization_id
          and m.user_id = (select auth.uid())
          and m.role in ('owner', 'coordinator', 'administrative')
      )
    )
    and exists (
      select 1 from public.organization_members assigned
      where assigned.organization_id = financial_entries.organization_id
        and assigned.user_id = financial_entries.professional_id
    )
    and (
      patient_id is null
      or exists (
        select 1 from public.patients p
        where p.id = financial_entries.patient_id
          and p.organization_id = financial_entries.organization_id
          and (
            p.professional_id = (select auth.uid())
            or (select private.is_org_admin(financial_entries.organization_id))
          )
      )
    )
  );

create policy "s6_financial_entries_update" on public.financial_entries
  for update to authenticated
  using (
    (select private.is_org_member(organization_id))
    and (
      professional_id = (select auth.uid())
      or exists (
        select 1 from public.organization_members m
        where m.organization_id = financial_entries.organization_id
          and m.user_id = (select auth.uid())
          and m.role in ('owner', 'coordinator', 'administrative')
      )
    )
  )
  with check (
    -- The only authenticated update grant is paid_at, so patient visibility is
    -- checked on insert and the immutable patient association is not rewritten here.
    (select private.is_org_member(organization_id))
    and (
      professional_id = (select auth.uid())
      or exists (
        select 1 from public.organization_members m
        where m.organization_id = financial_entries.organization_id
          and m.user_id = (select auth.uid())
          and m.role in ('owner', 'coordinator', 'administrative')
      )
    )
  );

-- Keep the Data API from rewriting entry ownership or deleting ledger history.
-- Payment state is the only mutable field after insertion.
revoke insert, update, delete on table public.financial_entries from authenticated;
grant insert (organization_id, professional_id, patient_id, kind, entry_type, amount, description, occurred_at, due_date, paid_at)
  on table public.financial_entries to authenticated;
grant update (paid_at) on table public.financial_entries to authenticated;
