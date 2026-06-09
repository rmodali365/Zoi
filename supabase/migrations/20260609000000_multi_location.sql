-- Multi-location experiences: an experience becomes a titled outing with 1..N
-- locations. Adds `title` (the display headline) and `locations` (jsonb array of the
-- Location shape). The existing `location` column is kept as a denormalized
-- "representative" location (locations[0]) so older app builds keep working; it can
-- be dropped in a later migration.

alter table public.experiences add column if not exists title text;
alter table public.experiences add column if not exists locations jsonb not null default '[]'::jsonb;

-- Backfill title from the single location's name where missing.
update public.experiences
  set title = location->>'name'
  where (title is null or title = '') and location is not null;

-- Backfill the locations array from the single location where empty.
update public.experiences
  set locations = jsonb_build_array(location)
  where (locations = '[]'::jsonb or locations is null) and location is not null;

-- location is now derived (representative); no longer required.
alter table public.experiences alter column location drop not null;
