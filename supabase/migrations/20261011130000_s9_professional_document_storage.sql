-- S9.3: private, immutable file attachments for professional_documents.
-- The Storage object name is exactly `${organization_id}/${document_id}`.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'professional-documents',
  'professional-documents',
  false,
  5242880,
  array['application/pdf', 'image/jpeg', 'image/png']::text[]
)
on conflict (id) do update
set name = excluded.name,
    public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- Uploads go through the validated backend using its service role. Authenticated
-- clients get read access only; there are intentionally no INSERT, UPDATE, or
-- DELETE policies on this bucket.
create policy s9_professional_document_files_select
  on storage.objects for select to authenticated
  using (
    bucket_id = 'professional-documents'
    and exists (
      select 1
      from public.professional_documents pd
      where objects.name = pd.organization_id::text || '/' || pd.id::text
        and (select private.is_org_member(pd.organization_id))
        and (
          pd.professional_id = (select auth.uid())
          or exists (
            select 1
            from public.organization_members m
            where m.organization_id = pd.organization_id
              and m.user_id = (select auth.uid())
              and m.role in ('owner', 'coordinator', 'administrative')
          )
        )
    )
  );

