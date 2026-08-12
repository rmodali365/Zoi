-- Collaborative experiences (#67, second half): tag the friends you did something
-- with, so one night shows up as everyone's, not just the logger's.
--
-- Same rule as shared trip stops: we NEVER write into someone else's ranked list.
-- A tag is an invitation. Accepting it creates the tagged person's OWN experience
-- row (same experiences.group_id), which they then rank themselves — with their
-- own photos and their own quick take. Declining leaves no trace on their list.

create table if not exists public.experience_tags (
  id uuid primary key default gen_random_uuid(),
  -- The outing. Matches experiences.group_id across every participant's row.
  group_id uuid not null,
  -- The tagger's row, used to prefill place/title/date when the tag is accepted.
  source_experience_id uuid not null references public.experiences(id) on delete cascade,
  tagged_by uuid not null references public.users(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  -- One tag per person per experience; re-tagging revives the same row.
  unique (source_experience_id, user_id)
);

create index if not exists experience_tags_user on public.experience_tags (user_id, status);
create index if not exists experience_tags_group on public.experience_tags (group_id);

alter table public.experience_tags enable row level security;

-- Tags are private to the two people involved. A pending tag is NOT public: being
-- named in someone's night before you've agreed to it shouldn't be visible to
-- anyone else. (Once accepted, your own experience row carries the group publicly.)
drop policy if exists "Participants read their own tags" on public.experience_tags;
create policy "Participants read their own tags"
  on public.experience_tags for select
  using (auth.uid() = user_id or auth.uid() = tagged_by);

-- You can only tag people on YOUR OWN experience, and only as the tagger.
drop policy if exists "Owners tag people on their experience" on public.experience_tags;
create policy "Owners tag people on their experience"
  on public.experience_tags for insert
  with check (
    tagged_by = auth.uid()
    and user_id <> auth.uid()
    and exists (
      select 1 from experiences e
      where e.id = source_experience_id and e.user_id = auth.uid()
    )
  );

-- Only the tagged person answers their own tag.
drop policy if exists "Tagged people answer their own tag" on public.experience_tags;
create policy "Tagged people answer their own tag"
  on public.experience_tags for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- The tagger can untag; the tagged person can remove themselves.
drop policy if exists "Either side removes a tag" on public.experience_tags;
create policy "Either side removes a tag"
  on public.experience_tags for delete
  using (auth.uid() = user_id or auth.uid() = tagged_by);

-- ---------------------------------------------------------------------------
-- Notification for a tag
-- ---------------------------------------------------------------------------

alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('follow', 'save', 'trip_invite', 'trip_join', 'experience_tag'));

create unique index if not exists notifications_experience_tag_once
  on public.notifications (user_id, actor_id, experience_id) where type = 'experience_tag';

create or replace function public.notify_on_experience_tag()
returns trigger
language plpgsql
security definer
set search_path = public as $$
begin
  if new.status = 'pending' then
    insert into notifications (user_id, actor_id, type, experience_id)
    values (new.user_id, new.tagged_by, 'experience_tag', new.source_experience_id)
    on conflict do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists experience_tags_notify on public.experience_tags;
create trigger experience_tags_notify
  after insert on public.experience_tags
  for each row execute function public.notify_on_experience_tag();
