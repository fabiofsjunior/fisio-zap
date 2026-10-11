-- S3: prevent overlapping active appointments at the database layer.
-- The exclusion constraint is concurrency-safe and covers direct Supabase writes.
create extension if not exists btree_gist;

-- Preserve historical records: fail with an actionable error if existing active slots overlap.
do $$
begin
  if exists (
    select 1 from public.appointments a
    join public.appointments b
      on a.organization_id = b.organization_id
     and a.professional_id = b.professional_id
     and a.id < b.id
     and a.status in ('scheduled','confirmed','rescheduled')
     and b.status in ('scheduled','confirmed','rescheduled')
     and tstzrange(a.starts_at,a.ends_at,'[)') && tstzrange(b.starts_at,b.ends_at,'[)')
  ) then
    raise exception 'S3: overlapping active appointments exist; reconcile before applying exclusion constraint';
  end if;
end $$;

alter table public.appointments
  drop constraint if exists appointments_professional_no_overlap;

alter table public.appointments
  add constraint appointments_professional_no_overlap
  exclude using gist (
    organization_id with =,
    professional_id with =,
    tstzrange(starts_at,ends_at,'[)') with &&
  ) where (status in ('scheduled','confirmed','rescheduled'));
