-- Zoi schema — GENERATED SNAPSHOT of the full current database.
-- This file is NOT applied to the DB. The source of truth is supabase/migrations/.
-- To change the schema, add a new migration file (see supabase/README.md), then
-- update this snapshot to match. Do not hand-edit this to make schema changes.

-- Users (extends Supabase auth.users)
create table public.users (
  id uuid references auth.users(id) on delete cascade primary key,
  name text not null default '',
  handle text unique not null default '',
  avatar_url text,
  phone text,
  created_at timestamptz not null default now()
);

alter table public.users enable row level security;

create policy "Users can read all profiles"
  on public.users for select using (true);

create policy "Users can update their own profile"
  on public.users for update using (auth.uid() = id);

create policy "Users can insert their own profile"
  on public.users for insert with check (auth.uid() = id);


-- Follows (one-way, Twitter-style)
create table public.follows (
  follower_id uuid references public.users(id) on delete cascade,
  following_id uuid references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, following_id)
);

alter table public.follows enable row level security;

create policy "Anyone can read follows"
  on public.follows for select using (true);

create policy "Users can manage their own follows"
  on public.follows for all using (auth.uid() = follower_id);


-- Auto-update updated_at (shared by trips + experiences)
create or replace function update_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;


-- Trips: containers that group experiences (not ranked themselves)
create table public.trips (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete cascade not null,
  title text not null,
  destination text,
  start_date date,
  end_date date,
  cover_photo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.trips enable row level security;

-- Public taste profiles: any authenticated user can read trips (see migration
-- 20260608220000_public_profiles).
create policy "Authenticated users can read all trips"
  on public.trips for select
  using (auth.uid() is not null);

create policy "Users can manage their own trips"
  on public.trips for all using (auth.uid() = user_id);

create trigger trips_updated_at
  before update on public.trips
  for each row execute function update_updated_at();


-- Experiences: the atomic, rankable unit
create table public.experiences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete cascade not null,
  -- Lifecycle: 'planned' = a trip stop not yet ranked (no sentiment/rank_key);
  -- 'ranked' = logged + ranked. Planned stops are hidden from ranked surfaces
  -- (see migration 20260609010000_experience_status_and_trip_position).
  status text not null default 'ranked' check (status in ('planned', 'ranked')),
  -- Coarse gut reaction; seeds the starting third of the overall ranked list.
  -- Null for planned stops.
  sentiment text check (sentiment in ('loved', 'liked', 'fine')),
  -- Optional membership in a trip container
  trip_id uuid references public.trips(id) on delete set null,
  -- Short display headline ("SoMa bar crawl"); backfilled from location name
  title text,
  -- One or more locations for this outing (array of the Location shape)
  locations jsonb not null default '[]'::jsonb,
  -- Denormalized representative location (= locations[0]); nullable (see migration
  -- 20260609000000_multi_location). Kept for older builds / map pin.
  location jsonb,
  tags text[] not null default '{}',
  photos text[] not null default '{}',
  quick_take text not null default '',
  -- Fractional index string ordering the single overall list per user.
  -- Null for planned stops.
  rank_key text,
  -- Per-trip itinerary order (fractional index), independent of rank_key.
  trip_position text,
  -- Optional reminder text on a planned stop.
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.experiences enable row level security;

-- Public taste profiles: any authenticated user can read experiences (see migration
-- 20260608220000_public_profiles).
create policy "Authenticated users can read all experiences"
  on public.experiences for select
  using (auth.uid() is not null);

create policy "Users can manage their own experiences"
  on public.experiences for all using (auth.uid() = user_id);

-- Index for fast ranked list lookup (one overall list per user)
create index experiences_user_rank
  on public.experiences (user_id, rank_key);

-- Index for fetching a trip's experiences
create index experiences_trip
  on public.experiences (trip_id);

-- Index for fetching a trip's itinerary in order
create index experiences_trip_position
  on public.experiences (trip_id, trip_position);

create trigger experiences_updated_at
  before update on public.experiences
  for each row execute function update_updated_at();


-- Saves (want-to-do list)
create table public.saves (
  user_id uuid references public.users(id) on delete cascade,
  experience_id uuid references public.experiences(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, experience_id)
);

alter table public.saves enable row level security;

create policy "Users can read their own saves"
  on public.saves for select using (auth.uid() = user_id);

create policy "Users can manage their own saves"
  on public.saves for all using (auth.uid() = user_id);
