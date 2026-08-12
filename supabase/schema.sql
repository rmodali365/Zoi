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


-- Experiences: the SHARED half of an outing — what happened, held once no matter
-- how many people were there (see migration 20260813000000_shared_experiences).
-- Everything personal lives in experience_rankings below.
create table public.experiences (
  id uuid primary key default gen_random_uuid(),
  -- Who first logged it. NOT an owner: everyone on the experience can edit it,
  -- and the post outlives any one person leaving.
  created_by uuid references public.users(id) on delete cascade not null,
  -- Lifecycle: 'planned' = a trip stop nobody has ranked yet; 'ranked' = at
  -- least one participant has. Maintained by the ranking triggers below.
  status text not null default 'ranked' check (status in ('planned', 'ranked')),
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
  -- Per-trip itinerary order (fractional index).
  trip_position text,
  -- Optional reminder text on a planned stop.
  note text,
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

create policy "Users create experiences"
  on public.experiences for insert
  with check (
    created_by = auth.uid()
    and (trip_id is null or public.is_trip_member(trip_id, auth.uid()))
  );

-- Shared content is editable by everyone on the experience — that's what makes
-- it one post rather than a copy each.
create policy "People on an experience edit it"
  on public.experiences for update
  using (public.can_edit_experience(id, auth.uid()))
  with check (public.can_edit_experience(id, auth.uid()));

-- Deleting the post outright is the creator's call. Everyone else "leaves",
-- which deletes only their ranking (see on_ranking_removed below).
create policy "Creators delete their experience"
  on public.experiences for delete
  using (created_by = auth.uid());

-- Planning is shared scratch work: anyone in the trip can clear a planned stop.
create policy "Members delete planned stops in shared trips"
  on public.experiences for delete
  using (
    status = 'planned'
    and trip_id is not null
    and public.is_trip_member(trip_id, auth.uid())
  );

create index experiences_created_by
  on public.experiences (created_by);

-- Index for fetching a trip's experiences
create index experiences_trip
  on public.experiences (trip_id);

-- Index for fetching a trip's itinerary in order
create index experiences_trip_position
  on public.experiences (trip_id, trip_position);

create trigger experiences_updated_at
  before update on public.experiences
  for each row execute function update_updated_at();


-- Experience rankings: the PERSONAL half. One row per person per experience —
-- their sentiment, their position in their own list, their take, their photos.
-- Ranking can't be shared (it's #3 in your list and #12 in theirs), which is the
-- whole reason the outing and the ranking are separate tables.
create table public.experience_rankings (
  experience_id uuid not null references public.experiences(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  sentiment text not null check (sentiment in ('loved', 'liked', 'fine')),
  -- Fractional index over this user's single overall list.
  rank_key text not null,
  quick_take text not null default '',
  -- Your photos of the shared night; the post pools everyone's for display.
  photos text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (experience_id, user_id)
);

-- The ranked-list lookup (replaces experiences_user_rank).
create index experience_rankings_user_rank
  on public.experience_rankings (user_id, rank_key);

alter table public.experience_rankings enable row level security;

create policy "Authenticated users read rankings"
  on public.experience_rankings for select
  using (auth.uid() is not null);

create policy "Users rank for themselves"
  on public.experience_rankings for insert
  with check (
    user_id = auth.uid()
    and public.can_rank_experience(experience_id, auth.uid())
  );

create policy "Users update their own ranking"
  on public.experience_rankings for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Leaving an experience = deleting your own ranking. Never anyone else's.
create policy "Users delete their own ranking"
  on public.experience_rankings for delete
  using (user_id = auth.uid());

create trigger experience_rankings_updated_at
  before update on public.experience_rankings
  for each row execute function update_updated_at();


-- Experience participants: who's on it. Ranking auto-joins you (trigger below).
create table public.experience_participants (
  experience_id uuid not null references public.experiences(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  status text not null default 'invited' check (status in ('invited', 'joined', 'declined')),
  invited_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (experience_id, user_id)
);

create index experience_participants_user
  on public.experience_participants (user_id, status);

alter table public.experience_participants enable row level security;

-- A pending invite is private to the two people involved — being named in
-- someone's night before you agree to it isn't public. Once joined, it is.
create policy "Read joined participants and your own invites"
  on public.experience_participants for select
  using (
    auth.uid() is not null
    and (status = 'joined' or auth.uid() = user_id or auth.uid() = invited_by)
  );

create policy "People on an experience invite others"
  on public.experience_participants for insert
  with check (
    public.can_edit_experience(experience_id, auth.uid())
    and invited_by = auth.uid()
    and user_id <> auth.uid()
    and status = 'invited'
  );

create policy "Invitees answer their own invite"
  on public.experience_participants for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Leave, or be removed by the creator"
  on public.experience_participants for delete
  using (
    auth.uid() = user_id
    or exists (
      select 1 from experiences e
      where e.id = experience_id and e.created_by = auth.uid()
    )
  );


-- Who may RANK an experience: whoever was there. SECURITY DEFINER for the same
-- reason as is_trip_member — these are called from policies on the very tables
-- they read, which recurses under RLS.
create or replace function public.can_rank_experience(exp_id uuid, uid uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select uid is not null and exists (
    select 1 from experiences e
    where e.id = exp_id and (
      e.created_by = uid
      or exists (
        select 1 from experience_participants p
        where p.experience_id = e.id and p.user_id = uid and p.status in ('invited', 'joined')
      )
      or (e.trip_id is not null and public.is_trip_member(e.trip_id, uid))
    )
  );
$$;

-- Who may edit the SHARED content: the people who were there, plus trip members
-- while it's still only a plan (a planned stop is the group's scratch work).
-- Once someone has ranked it, only its participants can change it.
create or replace function public.can_edit_experience(exp_id uuid, uid uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select uid is not null and exists (
    select 1 from experiences e
    where e.id = exp_id and (
      e.created_by = uid
      or exists (
        select 1 from experience_participants p
        where p.experience_id = e.id and p.user_id = uid and p.status = 'joined'
      )
      or (e.status = 'planned' and e.trip_id is not null
          and public.is_trip_member(e.trip_id, uid))
    )
  );
$$;

revoke all on function public.can_rank_experience(uuid, uuid) from anon;
revoke all on function public.can_edit_experience(uuid, uuid) from anon;

-- Ranking something makes you one of its people, and marks the post done.
create or replace function public.on_ranking_added()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into experience_participants (experience_id, user_id, status)
  values (new.experience_id, new.user_id, 'joined')
  on conflict (experience_id, user_id) do update set status = 'joined';

  update experiences set status = 'ranked'
  where id = new.experience_id and status <> 'ranked';

  return new;
end;
$$;

create trigger experience_rankings_join
  after insert on public.experience_rankings
  for each row execute function public.on_ranking_added();

-- Leaving: when the last ranking goes, a trip stop reverts to a plan and a
-- standalone experience disappears — nobody is left who did it.
create or replace function public.on_ranking_removed()
returns trigger language plpgsql security definer set search_path = public as $$
declare remaining int; exp record;
begin
  -- Deleting the experience cascades into its rankings and re-enters here; the
  -- parent row is already gone by then, so bail rather than recursing.
  select * into exp from experiences where id = old.experience_id;
  if not found then return old; end if;

  delete from experience_participants
  where experience_id = old.experience_id and user_id = old.user_id;

  select count(*) into remaining
  from experience_rankings where experience_id = old.experience_id;

  if remaining = 0 then
    if exp.trip_id is not null then
      update experiences set status = 'planned' where id = exp.id;
    else
      delete from experiences where id = exp.id;
    end if;
  end if;

  return old;
end;
$$;

create trigger experience_rankings_cleanup
  after delete on public.experience_rankings
  for each row execute function public.on_ranking_removed();


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
  type text not null check (type in ('follow', 'save', 'trip_invite', 'trip_join', 'experience_tag')),
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
create unique index notifications_experience_tag_once
  on public.notifications (user_id, actor_id, experience_id) where type = 'experience_tag';
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


-- "Someone added you to an experience" — the notification behind an invite.
-- (The old experience_tags table this replaced is gone; participants ARE the tag.)
create or replace function public.notify_on_experience_invite()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'invited' and new.invited_by is not null and new.invited_by <> new.user_id then
    insert into notifications (user_id, actor_id, type, experience_id)
    values (new.user_id, new.invited_by, 'experience_tag', new.experience_id)
    on conflict do nothing;
  end if;
  return new;
end;
$$;

create trigger experience_participants_notify
  after insert on public.experience_participants
  for each row execute function public.notify_on_experience_invite();

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
