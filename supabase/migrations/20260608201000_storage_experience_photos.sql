-- Public Storage bucket for experience photos, with per-user upload folders.

insert into storage.buckets (id, name, public)
values ('experience-photos', 'experience-photos', true)
on conflict (id) do nothing;

-- Public read (bucket is public; explicit policy for the objects table)
drop policy if exists "Public read experience photos" on storage.objects;
create policy "Public read experience photos"
  on storage.objects for select
  using (bucket_id = 'experience-photos');

-- Authenticated users can upload into their own folder: <uid>/<file>
drop policy if exists "Users upload own experience photos" on storage.objects;
create policy "Users upload own experience photos"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'experience-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Authenticated users can delete their own photos
drop policy if exists "Users delete own experience photos" on storage.objects;
create policy "Users delete own experience photos"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'experience-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
