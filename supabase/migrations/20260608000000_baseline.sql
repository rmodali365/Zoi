-- Baseline migration: full Zoi schema as of 2026-06-08.
-- Squashed from the project's initial setup + the trips/sentiment rework.
-- Idempotent so it can run safely on a fresh DB or the existing live DB.

-- Users (extends Supabase auth.users)
create table if not exists public.users (
  id uuid references auth.users(id) on delete cascade primary key,
  name text not null default '',
  handle text unique not null default '',
  avatar_url text,
  phone text,
  created_at timestamptz not null default now()
);

alter table public.users enable row level security;

drop policy if exists "Users can read all profiles" on public.users;
create policy "Users can read all profiles"
  on public.users for select using (true);

drop policy if exists "Users can update their own profile" on public.users;
create policy "Users can update their own profile"
  on public.users for update using (auth.uid() = id);

drop policy if exists "Users can insert their own profile" on public.users;
create policy "Users can insert their own profile"
  on public.users for insert with check (auth.uid() = id);


-- Follows (one-way, Twitter-style)
create table if not exists public.follows (
  follower_id uuid references public.users(id) on delete cascade,
  following_id uuid references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, following_id)
);

alter table public.follows enable row level security;

drop policy if exists "Anyone can read follows" on public.follows;
create policy "Anyone can read follows"
  on public.follows for select using (true);

drop policy if exists "Users can manage their own follows" on public.follows;
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
create table if not exists public.trips (
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

drop policy if exists "Users can read trips from people they follow" on public.trips;
create policy "Users can read trips from people they follow"
  on public.trips for select
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.follows
      where follower_id = auth.uid() and following_id = trips.user_id
    )
  );

drop policy if exists "Users can manage their own trips" on public.trips;
create policy "Users can manage their own trips"
  on public.trips for all using (auth.uid() = user_id);

drop trigger if exists trips_updated_at on public.trips;
create trigger trips_updated_at
  before update on public.trips
  for each row execute function update_updated_at();


-- Experiences: the atomic, rankable unit
create table if not exists public.experiences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete cascade not null,
  -- Sentiment tier drives ranking scope and score range
  sentiment text not null check (sentiment in ('loved', 'liked', 'fine')),
  -- Optional membership in a trip container
  trip_id uuid references public.trips(id) on delete set null,
  -- Location stored as structured JSON
  location jsonb not null,
  tags text[] not null default '{}',
  photos text[] not null default '{}',
  quick_take text not null default '',
  -- Fractional index string for ordering within (user_id, sentiment)
  rank_key text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.experiences enable row level security;

drop policy if exists "Users can read experiences from people they follow" on public.experiences;
create policy "Users can read experiences from people they follow"
  on public.experiences for select
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.follows
      where follower_id = auth.uid() and following_id = experiences.user_id
    )
  );

drop policy if exists "Users can manage their own experiences" on public.experiences;
create policy "Users can manage their own experiences"
  on public.experiences for all using (auth.uid() = user_id);

-- Index for fast ranked list lookup (ranking is scoped per sentiment tier)
create index if not exists experiences_user_sentiment_rank
  on public.experiences (user_id, sentiment, rank_key);

-- Index for fetching a trip's experiences
create index if not exists experiences_trip
  on public.experiences (trip_id);

drop trigger if exists experiences_updated_at on public.experiences;
create trigger experiences_updated_at
  before update on public.experiences
  for each row execute function update_updated_at();


-- Saves (want-to-do list)
create table if not exists public.saves (
  user_id uuid references public.users(id) on delete cascade,
  experience_id uuid references public.experiences(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, experience_id)
);

alter table public.saves enable row level security;

drop policy if exists "Users can read their own saves" on public.saves;
create policy "Users can read their own saves"
  on public.saves for select using (auth.uid() = user_id);

drop policy if exists "Users can manage their own saves" on public.saves;
create policy "Users can manage their own saves"
  on public.saves for all using (auth.uid() = user_id);
