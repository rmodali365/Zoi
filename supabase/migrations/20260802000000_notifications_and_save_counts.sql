-- Author-side feedback (#59): in-app notifications (follow / save events) and
-- RLS-safe aggregate save counts.

-- 1) Notifications — one row per event shown on the Activity screen.
create table if not exists public.notifications (
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

-- One live notification per (recipient, actor, event) so follow/unfollow or
-- save/unsave churn can't spam; the triggers below rely on these via
-- `on conflict do nothing`.
create unique index if not exists notifications_follow_once
  on public.notifications (user_id, actor_id) where type = 'follow';
create unique index if not exists notifications_save_once
  on public.notifications (user_id, actor_id, experience_id) where type = 'save';
create index if not exists notifications_recipient
  on public.notifications (user_id, created_at desc);

alter table public.notifications enable row level security;

drop policy if exists "Users can read their own notifications" on public.notifications;
create policy "Users can read their own notifications"
  on public.notifications for select using (auth.uid() = user_id);

drop policy if exists "Users can update their own notifications" on public.notifications;
create policy "Users can update their own notifications"
  on public.notifications for update using (auth.uid() = user_id);

drop policy if exists "Users can delete their own notifications" on public.notifications;
create policy "Users can delete their own notifications"
  on public.notifications for delete using (auth.uid() = user_id);

-- No insert policy: rows are only written by the security-definer triggers below.

-- 2) Triggers write notifications server-side, so every client path (and any
-- future one) produces them without extra client writes.
create or replace function public.notify_on_follow()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into notifications (user_id, actor_id, type)
  values (new.following_id, new.follower_id, 'follow')
  on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists follows_notify on public.follows;
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

drop trigger if exists saves_notify on public.saves;
create trigger saves_notify
  after insert on public.saves
  for each row execute function public.notify_on_save();

-- 3) Save counts. saves are private (owner-only select), so an author can't count
-- who wants to do their experience. This definer function exposes ONLY aggregate
-- counts — never who saved.
create or replace function public.save_counts(exp_ids uuid[])
returns table (experience_id uuid, saves bigint)
language sql stable security definer set search_path = public as $$
  select s.experience_id, count(*)::bigint
  from saves s
  where s.experience_id = any(exp_ids)
  group by s.experience_id;
$$;

revoke all on function public.save_counts(uuid[]) from anon;
