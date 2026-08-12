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
  -- Picked-place anchor for the destination (Location shape); keeps `destination`
  -- as the display string (see migration 20260812000000_stop_kinds_and_city_keys).
  destination_location jsonb,
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
  -- What a stop *is*, orthogonal to status. 'stay'/'transport' is logistics and
  -- never ranked; 'eat'/'other' may be ranked (see migration
  -- 20260812000000_stop_kinds_and_city_keys).
  kind text not null default 'experience'
    check (kind in ('experience','stay','eat','transport','other')),
  -- Kind-specific extras (check-in/out, reservation time, confirmation…).
  details jsonb not null default '{}'::jsonb,
  -- Canonical city section key this stop is grouped under within its trip.
  city_key text,
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
  -- When the experience happened (ranked) or is planned for (planned stop).
  -- Backfilled from created_at (see migration 20260702000000_experience_date).
  experience_date date not null default current_date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- A stay or transport stop is never ranked content — it must stay 'planned'.
  constraint experiences_kind_rankable
    check (kind not in ('stay','transport') or status = 'planned')
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

-- Indexes for kind + city-section grouping within a trip (#72)
create index experiences_trip_kind_idx
  on public.experiences (trip_id, kind);
create index experiences_trip_city_idx
  on public.experiences (trip_id, city_key);

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


-- Notifications: in-app activity (follow / save events), written by triggers
-- (see migration 20260802000000_notifications_and_save_counts)
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  -- recipient
  user_id uuid not null references public.users(id) on delete cascade,
  -- who did the thing
  actor_id uuid not null references public.users(id) on delete cascade,
  type text not null check (type in ('follow', 'save')),
  -- the saved experience (null for follows)
  experience_id uuid references public.experiences(id) on delete cascade,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

-- One live notification per (recipient, actor, event) — the triggers' `on
-- conflict do nothing` relies on these, so churn can't spam.
create unique index notifications_follow_once
  on public.notifications (user_id, actor_id) where type = 'follow';
create unique index notifications_save_once
  on public.notifications (user_id, actor_id, experience_id) where type = 'save';
create index notifications_recipient
  on public.notifications (user_id, created_at desc);

alter table public.notifications enable row level security;

create policy "Users can read their own notifications"
  on public.notifications for select using (auth.uid() = user_id);

create policy "Users can update their own notifications"
  on public.notifications for update using (auth.uid() = user_id);

create policy "Users can delete their own notifications"
  on public.notifications for delete using (auth.uid() = user_id);

-- No insert policy: rows are only written by the security-definer triggers.
create or replace function public.notify_on_follow()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into notifications (user_id, actor_id, type)
  values (new.following_id, new.follower_id, 'follow')
  on conflict do nothing;
  return new;
end;
$$;

create trigger follows_notify
  after insert on public.follows
  for each row execute function public.notify_on_follow();

create or replace function public.notify_on_save()
returns trigger language plpgsql security definer set search_path = public as $$
declare owner uuid;
begin
  select user_id into owner from experiences where id = new.experience_id;
  if owner is not null and owner <> new.user_id then
    insert into notifications (user_id, actor_id, type, experience_id)
    values (owner, new.user_id, 'save', new.experience_id)
    on conflict do nothing;
  end if;
  return new;
end;
$$;

create trigger saves_notify
  after insert on public.saves
  for each row execute function public.notify_on_save();

-- Aggregate save counts for authors. saves are owner-private, so this definer
-- function exposes ONLY counts — never who saved.
create or replace function public.save_counts(exp_ids uuid[])
returns table (experience_id uuid, saves bigint)
language sql stable security definer set search_path = public as $$
  select s.experience_id, count(*)::bigint
  from saves s
  where s.experience_id = any(exp_ids)
  group by s.experience_id;
$$;

revoke all on function public.save_counts(uuid[]) from anon;
