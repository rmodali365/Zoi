-- Trip stops that aren't experiences (hotels, restaurants, transport) + reliable
-- city grouping (#72).
--
-- `kind` is what a stop *is* (orthogonal to `status`, its lifecycle). A 'stay' or
-- 'transport' is logistics and never becomes ranked content; 'eat'/'other' may be
-- ranked but aren't required to. `details` holds kind-specific extras. `city_key`
-- is the canonical section key a stop is grouped under within its trip.

alter table public.experiences
  add column if not exists kind text not null default 'experience'
    check (kind in ('experience','stay','eat','transport','other')),
  add column if not exists details jsonb not null default '{}'::jsonb,
  add column if not exists city_key text;

-- A stay or transport stop is never ranked content — it must stay 'planned'.
alter table public.experiences drop constraint if exists experiences_kind_rankable;
alter table public.experiences add constraint experiences_kind_rankable
  check (kind not in ('stay','transport') or status = 'planned');

-- A picked-place anchor for the destination (keeps trips.destination as the
-- display string). Gives city resolution a coordinate to snap stops to.
alter table public.trips
  add column if not exists destination_location jsonb;

-- Backfill: keep existing trips grouped exactly as they are today by seeding
-- city_key from the stored locality.
update public.experiences
   set city_key = lower(regexp_replace(location->>'city', '[^a-zA-Z0-9]', '', 'g'))
 where city_key is null and location->>'city' is not null;

create index if not exists experiences_trip_kind_idx
  on public.experiences (trip_id, kind);
create index if not exists experiences_trip_city_idx
  on public.experiences (trip_id, city_key);
