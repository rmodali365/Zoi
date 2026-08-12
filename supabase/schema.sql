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

-- Collaborative trips: joined members can edit trip details too (insert/delete
-- stay owner-only). See migration 20260812000000_collaborative_trips.
create policy "Members can update shared trips"
  on public.trips for update
  using (public.is_trip_member(id, auth.uid()))
  with check (public.is_trip_member(id, auth.uid()));

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
  -- Links the rows different people logged for the SAME real-world outing
  -- (collaborative experiences / shared trip stops). Each participant keeps
  -- their own row — own sentiment, own rank_key, own quick take. Null = solo.
  group_id uuid,
  -- When the experience happened (ranked) or is planned for (planned stop).
  -- Backfilled from created_at (see migration 20260702000000_experience_date).
  experience_date date not null default current_date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.experiences enable row level security;

-- Public taste profiles: any authenticated user can read experiences (see migration
-- 20260608220000_public_profiles).
create policy "Authenticated users can read all experiences"
  on public.experiences for select
  using (auth.uid() is not null);

-- Split per command for collaborative trips (migration
-- 20260812000000_collaborative_trips). Writes are still owner-only for content;
-- the two "Members …" policies are the only cross-user capabilities, and both
-- are deliberately narrow.
create policy "Users insert their own experiences"
  on public.experiences for insert
  with check (
    auth.uid() = user_id
    and (trip_id is null or public.is_trip_member(trip_id, auth.uid()))
  );

create policy "Users update their own experiences"
  on public.experiences for update
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and (trip_id is null or public.is_trip_member(trip_id, auth.uid()))
  );

-- Reorder-only for other people's stops; the column guard is the trigger below.
create policy "Members reorder shared trip stops"
  on public.experiences for update
  using (trip_id is not null and public.is_trip_member(trip_id, auth.uid()))
  with check (trip_id is not null and public.is_trip_member(trip_id, auth.uid()));

create policy "Users delete their own experiences"
  on public.experiences for delete
  using (auth.uid() = user_id);

-- Planning is shared scratch work: anyone in the trip can clear a planned stop.
-- Ranked experiences are excluded — those belong to one person's list.
create policy "Members delete planned stops in shared trips"
  on public.experiences for delete
  using (
    status = 'planned'
    and trip_id is not null
    and public.is_trip_member(trip_id, auth.uid())
  );

-- Index for fast ranked list lookup (one overall list per user)
create index experiences_user_rank
  on public.experiences (user_id, rank_key);

-- Index for fetching a trip's experiences
create index experiences_trip
  on public.experiences (trip_id);

-- Index for fetching a trip's itinerary in order
create index experiences_trip_position
  on public.experiences (trip_id, trip_position);

-- Index for gathering every participant's row for one outing
create index experiences_group
  on public.experiences (group_id);

create trigger experiences_updated_at
  before update on public.experiences
  for each row execute function update_updated_at();

-- Column-level guard behind "Members reorder shared trip stops": a non-owner may
-- move trip_position and nothing else. RLS can't express column scope, so this
-- trigger is what keeps that policy safe.
create or replace function public.guard_foreign_stop_update()
returns trigger
language plpgsql as $$
begin
  if auth.uid() is null or auth.uid() = old.user_id then
    return new;
  end if;

  -- Deleting a trip detaches its stops via ON DELETE SET NULL, running as
  -- whoever deleted the trip — without this the owner of a shared trip couldn't
  -- delete it. Only the FK's referential action reaches here: the parent trip is
  -- already gone by then, and deleting a trip is owner-only.
  if new.trip_id is null and old.trip_id is not null
     and not exists (select 1 from trips where id = old.trip_id) then
    return new;
  end if;

  if (
    new.user_id, new.trip_id, new.group_id, new.status, new.sentiment, new.rank_key,
    new.title, new.locations, new.location, new.tags, new.photos, new.quick_take,
    new.note, new.experience_date
  ) is distinct from (
    old.user_id, old.trip_id, old.group_id, old.status, old.sentiment, old.rank_key,
    old.title, old.locations, old.location, old.tags, old.photos, old.quick_take,
    old.note, old.experience_date
  ) then
    raise exception 'Only the owner can edit this stop';
  end if;

  return new;
end;
$$;

create trigger experiences_guard_foreign_update
  before update on public.experiences
  for each row execute function public.guard_foreign_stop_update();


-- Trip members: everyone in a shared trip EXCEPT the owner (the owner is
-- trips.user_id, so there is no role column to escalate).
create table public.trip_members (
  trip_id uuid references public.trips(id) on delete cascade,
  user_id uuid references public.users(id) on delete cascade,
  status text not null default 'invited' check (status in ('invited', 'joined', 'declined')),
  invited_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (trip_id, user_id)
);

create index trip_members_user on public.trip_members (user_id, status);

alter table public.trip_members enable row level security;

-- Owner-or-joined-member test. SECURITY DEFINER on purpose: policies on trips /
-- experiences call this while trip_members' own policies are being evaluated,
-- which recurses infinitely under RLS.
create or replace function public.is_trip_member(t uuid, u uuid)
returns boolean
language sql
stable
security definer
set search_path = public as $$
  select u is not null and (
    exists (select 1 from trips where id = t and user_id = u)
    or exists (
      select 1 from trip_members
      where trip_id = t and user_id = u and status = 'joined'
    )
  );
$$;

revoke all on function public.is_trip_member(uuid, uuid) from anon;

create policy "Authenticated users can read trip members"
  on public.trip_members for select
  using (auth.uid() is not null);

create policy "Members can invite others"
  on public.trip_members for insert
  with check (
    public.is_trip_member(trip_id, auth.uid())
    and invited_by = auth.uid()
    and user_id <> auth.uid()
    and status = 'invited'
  );

create policy "Invitees answer their own invite"
  on public.trip_members for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Members leave and owners remove"
  on public.trip_members for delete
  using (
    auth.uid() = user_id
    or exists (select 1 from trips t where t.id = trip_id and t.user_id = auth.uid())
  );


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
  type text not null check (type in ('follow', 'save', 'trip_invite', 'trip_join')),
  -- the saved experience (null for follows)
  experience_id uuid references public.experiences(id) on delete cascade,
  -- the trip (trip_invite / trip_join only)
  trip_id uuid references public.trips(id) on delete cascade,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

-- One live notification per (recipient, actor, event) — the triggers' `on
-- conflict do nothing` relies on these, so churn can't spam.
create unique index notifications_follow_once
  on public.notifications (user_id, actor_id) where type = 'follow';
create unique index notifications_save_once
  on public.notifications (user_id, actor_id, experience_id) where type = 'save';
create unique index notifications_trip_invite_once
  on public.notifications (user_id, actor_id, trip_id) where type = 'trip_invite';
create unique index notifications_trip_join_once
  on public.notifications (user_id, actor_id, trip_id) where type = 'trip_join';
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

-- Invited -> tell the invitee. Joined -> tell the trip owner.
create or replace function public.notify_on_trip_membership()
returns trigger language plpgsql security definer set search_path = public as $$
declare owner_id uuid;
begin
  if tg_op = 'INSERT' and new.status = 'invited' then
    if new.invited_by is not null and new.invited_by <> new.user_id then
      insert into notifications (user_id, actor_id, type, trip_id)
      values (new.user_id, new.invited_by, 'trip_invite', new.trip_id)
      on conflict do nothing;
    end if;
  elsif tg_op = 'UPDATE' and new.status = 'joined' and old.status <> 'joined' then
    select user_id into owner_id from trips where id = new.trip_id;
    if owner_id is not null and owner_id <> new.user_id then
      insert into notifications (user_id, actor_id, type, trip_id)
      values (owner_id, new.user_id, 'trip_join', new.trip_id)
      on conflict do nothing;
    end if;
  end if;
  return new;
end;
$$;

create trigger trip_members_notify
  after insert or update on public.trip_members
  for each row execute function public.notify_on_trip_membership();

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
