-- Push notifications (#74): deliver the events we already record to the lock screen.
--
-- The in-app half already exists — DB triggers write `notifications` rows, which
-- ActivityScreen reads. Push doesn't duplicate that: ONE trigger on
-- `notifications` insert fans the same row out to the recipient's devices, so
-- every type (follow, save, trip_invite, trip_join, experience_tag) gets a push
-- for free, and any type added later does too.
--
-- Delivery is async and fire-and-forget via pg_net: a failed push must never
-- roll back the write that caused it.

create extension if not exists pg_net with schema extensions;

-- ---------------------------------------------------------------------------
-- Device tokens
-- ---------------------------------------------------------------------------

-- Expo push tokens, one row per device. Keyed by the token itself so a device
-- that gets reassigned to another account moves rather than duplicating.
create table if not exists public.device_tokens (
  token text primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  platform text check (platform in ('ios', 'android')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists device_tokens_user on public.device_tokens (user_id);

alter table public.device_tokens enable row level security;

-- Tokens are addressable secrets — never world-readable, unlike the rest of the
-- app's data. Only the owner touches their own; the sender uses the service role.
drop policy if exists "Users manage their own device tokens" on public.device_tokens;
create policy "Users manage their own device tokens"
  on public.device_tokens for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create trigger device_tokens_updated_at
  before update on public.device_tokens
  for each row execute function update_updated_at();

-- ---------------------------------------------------------------------------
-- Delivery: notifications insert -> push Edge Function
-- ---------------------------------------------------------------------------

-- Endpoint + shared secret live in Vault, not in this migration, because they
-- differ per environment (dev vs zoi-prod) and one is a credential. Set them
-- once per project — see docs/deployment.md:
--
--   select vault.create_secret('https://<ref>.supabase.co/functions/v1/push',
--                              'push_endpoint');
--   select vault.create_secret('<random string>', 'push_secret');
--
-- Until both exist the trigger no-ops, so a fresh database (or a restored
-- backup) simply has push disabled rather than erroring on every notification.
create or replace function public.push_config()
returns table (endpoint text, secret text)
language sql stable security definer set search_path = vault, public as $$
  select
    (select decrypted_secret from vault.decrypted_secrets where name = 'push_endpoint'),
    (select decrypted_secret from vault.decrypted_secrets where name = 'push_secret');
$$;

revoke all on function public.push_config() from anon, authenticated;

create or replace function public.push_on_notification()
returns trigger
language plpgsql
security definer
set search_path = public as $$
declare cfg record;
begin
  select * into cfg from public.push_config();
  if cfg.endpoint is null or cfg.secret is null then
    return new; -- push not configured in this environment
  end if;

  -- Fire-and-forget. pg_net queues the request and returns immediately, so a
  -- slow or failing push never blocks (or rolls back) the write that caused it.
  -- The function re-reads the row server-side; this body is just the pointer.
  perform net.http_post(
    url := cfg.endpoint,
    body := jsonb_build_object('notification_id', new.id),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-push-secret', cfg.secret
    ),
    timeout_milliseconds := 5000
  );

  return new;
end;
$$;

drop trigger if exists notifications_push on public.notifications;
create trigger notifications_push
  after insert on public.notifications
  for each row execute function public.push_on_notification();
