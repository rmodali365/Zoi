-- Collaborative trips (#67, first half): a trip can have members, and anyone in
-- the trip can build the itinerary.
--
-- Product rules this encodes:
--   * The trip OWNER is still `trips.user_id`. `trip_members` holds only the
--     other people, so there is no role column to escalate.
--   * Any joined member can add stops, reorder the itinerary, and invite others.
--   * Any joined member can DELETE a planned stop — even one someone else added.
--     Planning is shared scratch work.
--   * Nobody but the owner can touch a RANKED experience. It belongs to one
--     person's ranked list; a trip mate can't edit, detach or delete it.
--   * `experiences.group_id` links the rows different people logged for the SAME
--     real-world outing. Each participant keeps their own row (own sentiment,
--     own rank_key, own quick take) — we never write into someone else's ranked
--     list. The group is what lets one stop / one feed card show several people.

-- ---------------------------------------------------------------------------
-- Trip members
-- ---------------------------------------------------------------------------

create table if not exists public.trip_members (
  trip_id uuid references public.trips(id) on delete cascade,
  user_id uuid references public.users(id) on delete cascade,
  -- 'invited' until they accept; only 'joined' grants any write capability.
  status text not null default 'invited' check (status in ('invited', 'joined', 'declined')),
  invited_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (trip_id, user_id)
);

-- "Which trips am I in?" — drives getMyTrips + the invite inbox.
create index if not exists trip_members_user on public.trip_members (user_id, status);

alter table public.trip_members enable row level security;

-- Membership: is this user the owner of, or a joined member of, this trip?
-- SECURITY DEFINER on purpose: policies on `trips`/`experiences` call this while
-- policies on `trip_members` are themselves being evaluated, which recurses
-- infinitely under RLS. A definer function reads the tables directly instead.
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

-- Trips are publicly readable already, so their roster is too (it's just avatars).
drop policy if exists "Authenticated users can read trip members" on public.trip_members;
create policy "Authenticated users can read trip members"
  on public.trip_members for select
  using (auth.uid() is not null);

-- Anyone already in the trip can invite someone else. Invites always start as
-- 'invited' — you cannot add yourself to a trip, or add someone pre-joined.
drop policy if exists "Members can invite others" on public.trip_members;
create policy "Members can invite others"
  on public.trip_members for insert
  with check (
    public.is_trip_member(trip_id, auth.uid())
    and invited_by = auth.uid()
    and user_id <> auth.uid()
    and status = 'invited'
  );

-- Only the invitee answers their own invite (accept / decline).
drop policy if exists "Invitees answer their own invite" on public.trip_members;
create policy "Invitees answer their own invite"
  on public.trip_members for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Leave a trip yourself, or be removed by the trip owner.
drop policy if exists "Members leave and owners remove" on public.trip_members;
create policy "Members leave and owners remove"
  on public.trip_members for delete
  using (
    auth.uid() = user_id
    or exists (select 1 from trips t where t.id = trip_id and t.user_id = auth.uid())
  );

-- ---------------------------------------------------------------------------
-- Trips: members can edit trip details (title / dates / cover)
-- ---------------------------------------------------------------------------

-- The owner keeps the existing blanket policy (insert + delete stay owner-only);
-- this only widens UPDATE to joined members.
drop policy if exists "Members can update shared trips" on public.trips;
create policy "Members can update shared trips"
  on public.trips for update
  using (public.is_trip_member(id, auth.uid()))
  with check (public.is_trip_member(id, auth.uid()));

-- ---------------------------------------------------------------------------
-- Experiences: group_id + per-command policies
-- ---------------------------------------------------------------------------

-- Rows sharing a group_id are the same outing logged by different people.
-- Null = a solo experience (every row before this migration).
alter table public.experiences add column if not exists group_id uuid;
create index if not exists experiences_group on public.experiences (group_id);

-- The old policy was `for all using (auth.uid() = user_id)` with no WITH CHECK,
-- so INSERT only checked user_id — any user could insert a row pointing at
-- SOMEONE ELSE'S trip_id and it would render in their itinerary (getTripDetail
-- selects by trip_id alone). Splitting per command closes that and adds the
-- member capabilities in one place.
drop policy if exists "Users can manage their own experiences" on public.experiences;

-- You may only create your own rows, and only inside a trip you're part of.
drop policy if exists "Users insert their own experiences" on public.experiences;
create policy "Users insert their own experiences"
  on public.experiences for insert
  with check (
    auth.uid() = user_id
    and (trip_id is null or public.is_trip_member(trip_id, auth.uid()))
  );

-- Owner edits: unchanged behaviour, plus the same "trip must be yours or shared"
-- rule when moving a row between trips.
drop policy if exists "Users update their own experiences" on public.experiences;
create policy "Users update their own experiences"
  on public.experiences for update
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and (trip_id is null or public.is_trip_member(trip_id, auth.uid()))
  );

-- Members may touch another person's stop ONLY to reorder the shared itinerary.
-- RLS can't restrict which columns change, so the column guard is the trigger
-- below — this policy just gets the row in range.
drop policy if exists "Members reorder shared trip stops" on public.experiences;
create policy "Members reorder shared trip stops"
  on public.experiences for update
  using (trip_id is not null and public.is_trip_member(trip_id, auth.uid()))
  with check (trip_id is not null and public.is_trip_member(trip_id, auth.uid()));

drop policy if exists "Users delete their own experiences" on public.experiences;
create policy "Users delete their own experiences"
  on public.experiences for delete
  using (auth.uid() = user_id);

-- Shared planning is disposable: anyone in the trip can clear out a planned stop.
-- Ranked experiences are excluded — those are someone's list entry, not scratch.
drop policy if exists "Members delete planned stops in shared trips" on public.experiences;
create policy "Members delete planned stops in shared trips"
  on public.experiences for delete
  using (
    status = 'planned'
    and trip_id is not null
    and public.is_trip_member(trip_id, auth.uid())
  );

-- Column-level guard: when the actor is NOT the row owner, the only thing they
-- are allowed to move is trip_position (itinerary order). Any other change —
-- content, photos, sentiment, rank_key, status, trip membership, ownership —
-- is rejected outright. This is what makes the broad "Members reorder" policy
-- above safe.
create or replace function public.guard_foreign_stop_update()
returns trigger
language plpgsql as $$
begin
  if auth.uid() is null or auth.uid() = old.user_id then
    return new;
  end if;

  -- Deleting a trip detaches its stops via the FK's ON DELETE SET NULL, and that
  -- update runs as whoever deleted the trip — so without this the owner of a
  -- SHARED trip could not delete it (the guard would reject detaching a trip
  -- mate's stop). Only the referential action can reach here: the parent trip is
  -- already gone by the time the FK fires, and deleting a trip is owner-only.
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

drop trigger if exists experiences_guard_foreign_update on public.experiences;
create trigger experiences_guard_foreign_update
  before update on public.experiences
  for each row execute function public.guard_foreign_stop_update();

-- ---------------------------------------------------------------------------
-- Notifications: trip invites + joins
-- ---------------------------------------------------------------------------

alter table public.notifications
  add column if not exists trip_id uuid references public.trips(id) on delete cascade;

alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('follow', 'save', 'trip_invite', 'trip_join'));

-- Same "one live notification per event" shape as the follow/save indexes, so
-- re-inviting after a decline can't spam.
create unique index if not exists notifications_trip_invite_once
  on public.notifications (user_id, actor_id, trip_id) where type = 'trip_invite';
create unique index if not exists notifications_trip_join_once
  on public.notifications (user_id, actor_id, trip_id) where type = 'trip_join';

-- Invited -> tell the invitee. Joined -> tell the trip owner.
create or replace function public.notify_on_trip_membership()
returns trigger
language plpgsql
security definer
set search_path = public as $$
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

drop trigger if exists trip_members_notify on public.trip_members;
create trigger trip_members_notify
  after insert or update on public.trip_members
  for each row execute function public.notify_on_trip_membership();
