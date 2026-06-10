-- Experience lifecycle: a `planned` stop lives in a trip but is not yet ranked
-- (no sentiment, no rank_key); a `ranked` experience is logged + ranked as before.
-- Planned stops share the experiences table but are hidden from every ranked
-- surface (app queries filter status = 'ranked'). Adds `trip_position`: a per-trip
-- itinerary order independent of the global rank_key.

alter table public.experiences
  add column if not exists status text not null default 'ranked'
    check (status in ('planned', 'ranked'));

-- Planned stops have neither a sentiment nor a place in the overall ranking.
alter table public.experiences alter column sentiment drop not null;
alter table public.experiences alter column rank_key drop not null;

-- Itinerary order within a trip (fractional-index string, same format as rank_key).
alter table public.experiences add column if not exists trip_position text;

-- Optional reminder text on a planned stop ("book Sintra tickets").
alter table public.experiences add column if not exists note text;

-- Seed trip_position for existing trip experiences from their current global rank
-- order (rank_key is already a valid fractional index, so order is preserved).
update public.experiences
  set trip_position = rank_key
  where trip_id is not null and trip_position is null and rank_key is not null;

-- Index for fetching a trip's itinerary in order.
create index if not exists experiences_trip_position
  on public.experiences (trip_id, trip_position);
