-- Security fix: SECURITY DEFINER functions were executable by PUBLIC.
--
-- `revoke ... from anon` (used in earlier migrations) does NOT remove the
-- default PUBLIC grant every function is created with — the ACL entry `=X/...`
-- means "PUBLIC may execute", and anon/authenticated inherit it. Revoking a role
-- that only ever had access *via PUBLIC* changes nothing.
--
-- That left `push_config()` — which returns the push shared secret — callable as
-- `POST /rest/v1/rpc/push_config` with the anon key, and the anon key ships in
-- the app bundle. Verified reachable before this fix. The secret it exposed must
-- be rotated as well as locked (see docs/deployment.md); revoking alone doesn't
-- un-leak it.
--
-- The other definer functions are far less sensitive (they return booleans or
-- aggregate counts), but the same default applied, so they get the same
-- treatment. `authenticated` keeps its explicit grant where RLS policies need
-- it — policies are evaluated as the invoking role, so removing that would
-- break every read that depends on them.

-- Returns a credential. Nothing but the definer-owned trigger needs it.
revoke all on function public.push_config() from public, anon, authenticated;

-- Used inside RLS policies, so `authenticated` must keep EXECUTE; only the
-- blanket PUBLIC grant (which is what let anon in) goes.
revoke execute on function public.is_trip_member(uuid, uuid) from public, anon;
grant execute on function public.is_trip_member(uuid, uuid) to authenticated;

revoke execute on function public.can_rank_experience(uuid, uuid) from public, anon;
grant execute on function public.can_rank_experience(uuid, uuid) to authenticated;

revoke execute on function public.can_edit_experience(uuid, uuid) from public, anon;
grant execute on function public.can_edit_experience(uuid, uuid) to authenticated;

-- Exposes only aggregate counts, never who saved — but it's still a definer
-- function reading an owner-private table, so anon has no business calling it.
revoke execute on function public.save_counts(uuid[]) from public, anon;
grant execute on function public.save_counts(uuid[]) to authenticated;
