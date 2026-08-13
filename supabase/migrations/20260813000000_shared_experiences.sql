-- Shared experiences: one post, many rankings.
--
-- Until now a shared outing was N experience rows (one per person, linked by
-- group_id). The feed merged them into one card, but everywhere else they stayed
-- two objects describing the same night — two rows to edit, and `saves` pointing
-- at whichever copy you happened to be looking at.
--
-- Now `experiences` IS the outing, held once:
--   * SHARED  — place(s), title, tags, date, trip membership, note
--   * PERSONAL — sentiment, rank_key, quick take and photos move to
--     `experience_rankings`, one row per participant
--
-- Ranking still can't be shared: it's #3 in your list and #12 in theirs. That's
-- the whole reason for the split. Leaving an experience deletes YOUR ranking, not
-- the post — the others keep it. When the last person leaves, the post goes too.

-- Safety net for the destructive column drops below. Drop once this has shipped.
create table if not exists public.experiences_backup_20260813 as
  select * from public.experiences;

-- ---------------------------------------------------------------------------
-- 1. New tables
-- ---------------------------------------------------------------------------

-- One person's take on an outing. This is what "my ranked list" now reads.
create table if not exists public.experience_rankings (
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

-- The ranked list lookup, replacing experiences_user_rank.
create index if not exists experience_rankings_user_rank
  on public.experience_rankings (user_id, rank_key);

-- Who's on an experience. 'invited' until they accept; ranking auto-joins you.
create table if not exists public.experience_participants (
  experience_id uuid not null references public.experiences(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  status text not null default 'invited' check (status in ('invited', 'joined', 'declined')),
  invited_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (experience_id, user_id)
);

create index if not exists experience_participants_user
  on public.experience_participants (user_id, status);

-- ---------------------------------------------------------------------------
-- 2. Backfill: every ranked row becomes its author's ranking
-- ---------------------------------------------------------------------------

insert into public.experience_rankings (experience_id, user_id, sentiment, rank_key, quick_take, photos, created_at)
select id, user_id, sentiment, rank_key, coalesce(quick_take, ''), coalesce(photos, '{}'), created_at
from public.experiences
where status = 'ranked' and sentiment is not null and rank_key is not null
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 3. Collapse group_id sets onto one canonical experience
-- ---------------------------------------------------------------------------

create temp table group_canon as
select group_id, (array_agg(id order by created_at, id))[1] as canon_id
from public.experiences
where group_id is not null
group by group_id;

-- Existing tags become participants BEFORE the duplicate rows (and their
-- cascading tags) disappear. Tags on a duplicate map to the canonical row.
insert into public.experience_participants (experience_id, user_id, status, invited_by, created_at)
select coalesce(gc.canon_id, t.source_experience_id), t.user_id,
       case t.status when 'accepted' then 'joined' when 'declined' then 'declined' else 'invited' end,
       t.tagged_by, t.created_at
from public.experience_tags t
join public.experiences e on e.id = t.source_experience_id
left join group_canon gc on gc.group_id = e.group_id
on conflict do nothing;

-- Everyone who had their own row in a group is a joined participant of the canon.
insert into public.experience_participants (experience_id, user_id, status, invited_by)
-- NB: still `user_id` here — the rename to created_by happens in step 4.
select gc.canon_id, e.user_id, 'joined', canon.user_id
from public.experiences e
join group_canon gc on gc.group_id = e.group_id
join public.experiences canon on canon.id = gc.canon_id
where e.id <> gc.canon_id and e.user_id <> canon.user_id
on conflict do nothing;

-- Drop any ranking that would collide on the canonical row (same person ranked
-- both). Can't happen with one row per person per group, but be safe.
delete from public.experience_rankings r
using public.experiences e, group_canon gc
where r.experience_id = e.id
  and e.group_id = gc.group_id and e.id <> gc.canon_id
  and exists (
    select 1 from public.experience_rankings r2
    where r2.experience_id = gc.canon_id and r2.user_id = r.user_id
  );

-- Move each duplicate's ranking onto the canonical experience.
update public.experience_rankings r
set experience_id = gc.canon_id
from public.experiences e, group_canon gc
where r.experience_id = e.id
  and e.group_id = gc.group_id and e.id <> gc.canon_id;

-- Saves pointed at one person's copy — repoint them at the real post.
update public.saves s
set experience_id = gc.canon_id
from public.experiences e, group_canon gc
where s.experience_id = e.id
  and e.group_id = gc.group_id and e.id <> gc.canon_id
  and not exists (
    select 1 from public.saves s2
    where s2.user_id = s.user_id and s2.experience_id = gc.canon_id
  );

update public.notifications n
set experience_id = gc.canon_id
from public.experiences e, group_canon gc
where n.experience_id = e.id
  and e.group_id = gc.group_id and e.id <> gc.canon_id;

-- The duplicates have served their purpose (remaining saves/notifications on
-- them were already duplicates of the canonical row's and cascade away).
delete from public.experiences e
using group_canon gc
where e.group_id = gc.group_id and e.id <> gc.canon_id;

drop table group_canon;

-- Superseded by experience_participants.
drop table if exists public.experience_tags;

-- ---------------------------------------------------------------------------
-- 4. experiences becomes the shared post
-- ---------------------------------------------------------------------------

-- `user_id` implied sole ownership; the post now belongs to everyone on it.
alter table public.experiences rename column user_id to created_by;
alter table public.experiences rename constraint experiences_user_id_fkey to experiences_created_by_fkey;

-- These moved to experience_rankings.
alter table public.experiences drop column if exists sentiment;
alter table public.experiences drop column if exists rank_key;
alter table public.experiences drop column if exists quick_take;
alter table public.experiences drop column if exists photos;
-- Membership is a table now, not a shared uuid on N rows.
alter table public.experiences drop column if exists group_id;

drop index if exists public.experiences_user_rank;
create index if not exists experiences_created_by on public.experiences (created_by);

-- ---------------------------------------------------------------------------
-- 5. Capability helpers
-- ---------------------------------------------------------------------------

-- Who may RANK an experience: whoever was there. Ranking auto-joins you as a
-- participant (trigger below), which is how a trip mate keeps edit access after.
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

-- Who may edit the SHARED content (place, title, date, tags). The people who
-- were there — plus trip members while it's still just a plan, since a planned
-- stop is the group's scratch work. Once someone has ranked it, it's a real
-- experience and only its participants can change it.
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

-- ---------------------------------------------------------------------------
-- 6. RLS
-- ---------------------------------------------------------------------------

-- The old per-command policies assumed one owner per row; content is shared now
-- and rankings live in their own table with their own rules.
drop policy if exists "Users insert their own experiences" on public.experiences;
drop policy if exists "Users update their own experiences" on public.experiences;
drop policy if exists "Members reorder shared trip stops" on public.experiences;
drop policy if exists "Users delete their own experiences" on public.experiences;
drop policy if exists "Members delete planned stops in shared trips" on public.experiences;

-- The column guard existed to stop a trip mate editing someone's ranked row.
-- Rankings are a separate table now, protected by their own owner-only policies,
-- so the guard has nothing left to protect.
drop trigger if exists experiences_guard_foreign_update on public.experiences;
drop function if exists public.guard_foreign_stop_update();

create policy "Users create experiences"
  on public.experiences for insert
  with check (
    created_by = auth.uid()
    and (trip_id is null or public.is_trip_member(trip_id, auth.uid()))
  );

create policy "People on an experience edit it"
  on public.experiences for update
  using (public.can_edit_experience(id, auth.uid()))
  with check (public.can_edit_experience(id, auth.uid()));

-- Deleting the post outright is the creator's call. Everyone else "leaves",
-- which removes their ranking (see the cleanup trigger below).
create policy "Creators delete their experience"
  on public.experiences for delete
  using (created_by = auth.uid());

-- Planning is shared scratch work: anyone on the trip can clear a planned stop.
create policy "Members delete planned stops in shared trips"
  on public.experiences for delete
  using (
    status = 'planned'
    and trip_id is not null
    and public.is_trip_member(trip_id, auth.uid())
  );

alter table public.experience_rankings enable row level security;

-- Rankings are public taste, like the experiences themselves.
create policy "Authenticated users read rankings"
  on public.experience_rankings for select
  using (auth.uid() is not null);

-- You rank for yourself, and only things you were part of.
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

-- ---------------------------------------------------------------------------
-- 7. Triggers keeping the two halves consistent
-- ---------------------------------------------------------------------------

create trigger experience_rankings_updated_at
  before update on public.experience_rankings
  for each row execute function update_updated_at();

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

-- "Someone added you to an experience". The dropped experience_tags table owned
-- this notification; participants ARE the tag now, so the trigger moves here.
-- The 'experience_tag' type name is kept so existing rows stay readable.
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

drop trigger if exists experience_participants_notify on public.experience_participants;
create trigger experience_participants_notify
  after insert on public.experience_participants
  for each row execute function public.notify_on_experience_invite();
