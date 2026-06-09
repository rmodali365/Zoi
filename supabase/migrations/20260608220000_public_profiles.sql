-- Public taste profiles: make experiences and trips readable by any authenticated
-- user (not just people you follow), so you can view another user's profile.
-- Writes stay locked down by the existing "manage their own" (for all) policies.
-- users is already world-readable, so name/handle/avatar already load.

-- Experiences: replace the follow-gated SELECT with an authenticated-read policy.
drop policy if exists "Users can read experiences from people they follow" on public.experiences;
drop policy if exists "Authenticated users can read all experiences" on public.experiences;
create policy "Authenticated users can read all experiences"
  on public.experiences for select
  using (auth.uid() is not null);

-- Trips: same treatment.
drop policy if exists "Users can read trips from people they follow" on public.trips;
drop policy if exists "Authenticated users can read all trips" on public.trips;
create policy "Authenticated users can read all trips"
  on public.trips for select
  using (auth.uid() is not null);
