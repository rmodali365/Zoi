#!/usr/bin/env python3
"""Post-migration checks. Run against a project after `supabase db push`.

    python3 scripts/verify-schema.py prod

Three classes of check, because each catches failures the others miss:

  1. Structural — did the data survive? Orphans, and ranked posts with no
     ranking (which would silently vanish from every list).
  2. PostgREST shapes — the app's real queries. Embed ambiguity (PGRST201)
     only ever shows up at runtime, and nearly every path from a table to
     `users` is ambiguous, so all of them must name their FK.
  3. Security — SECURITY DEFINER functions must not be callable by anon.
     Postgres grants EXECUTE to PUBLIC by default and `revoke ... from anon`
     does NOT undo that; this once left the push secret world-readable.

Exit code is non-zero if anything fails, so it can gate a deploy.
"""

import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _supabase import anon_key, die, label_for, resolve_ref, run_sql  # noqa: E402

STRUCTURAL = """
select
  (select count(*) from experiences)                            as experiences,
  (select count(*) from experience_rankings)                    as rankings,
  (select count(*) from experience_participants)                as participants,
  (select count(*) from users)                                  as users,
  (select count(*) from trips)                                  as trips,
  (select count(*) from saves)                                  as saves,
  (select count(*) from experience_rankings r
     left join experiences e on e.id = r.experience_id
     where e.id is null)                                        as orphan_rankings,
  (select count(*) from experiences x where x.status = 'ranked'
     and not exists (select 1 from experience_rankings r
                     where r.experience_id = x.id))             as ranked_without_ranking,
  (select count(*) from saves s
     left join experiences e on e.id = s.experience_id
     where e.id is null)                                        as orphan_saves,
  (select count(*) from information_schema.columns
     where table_name = 'experiences' and column_name = 'created_by') as created_by_present
"""

MUST_BE_ZERO = ['orphan_rankings', 'ranked_without_ranking', 'orphan_saves']

EXPERIENCE_SELECT = (
    '*,creator:users!experiences_created_by_fkey(id,name,handle,avatar_url)'
    ',trip:trips(id,title)'
    ',rankings:experience_rankings(*,user:users!experience_rankings_user_id_fkey(id,name,handle,avatar_url))'
)

QUERIES = [
    ('EXPERIENCE_WITH_RANKINGS', 'experiences', EXPERIENCE_SELECT),
    ('getRankedList', 'experience_rankings', f'*,experience:experiences({EXPERIENCE_SELECT})'),
    ('getRankingPool', 'experience_rankings',
     '*,experience:experiences(id,title,locations,location,experience_date)'),
    ('getFeed trips', 'trips',
     '*,user:users!trips_user_id_fkey(id,name)'
     ',members:trip_members(status,user:users!trip_members_user_id_fkey(id,name))'
     ',experiences(id,status,location,locations)'),
    ('getSaves', 'saves', f'created_at,experience:experiences!saves_experience_id_fkey({EXPERIENCE_SELECT})'),
    ('getParticipants', 'experience_participants',
     '*,user:users!experience_participants_user_id_fkey(id,name,handle,avatar_url)'),
    ('getNotifications', 'notifications',
     '*,actor:users!notifications_actor_id_fkey(id,name),experience:experiences(*),trip:trips(*)'),
    ('getMyTrips', 'trips', '*,user:users!trips_user_id_fkey(id,name,handle,avatar_url)'),
    ('getTripMembers', 'trip_members', '*,user:users!trip_members_user_id_fkey(id,name)'),
]

# (function, POST body) — must all be denied to anon.
LOCKED_RPCS = [('push_config', b'{}'), ('save_counts', b'{"exp_ids":[]}')]


def main():
    if len(sys.argv) < 2:
        die('usage: verify-schema.py <dev|prod|project-ref>')
    ref = resolve_ref(sys.argv[1])
    failures = []

    print(f'== structural ({label_for(ref)}) ==')
    rows = run_sql(ref, STRUCTURAL)
    if isinstance(rows, dict):
        die(f'query failed: {rows.get("message")}')
    stats = rows[0]
    for k, v in stats.items():
        flag = ''
        if k in MUST_BE_ZERO and v != 0:
            flag = '   <-- MUST BE 0'
            failures.append(f'{k} = {v}')
        if k == 'created_by_present' and v != 1:
            flag = '   <-- migration did not apply'
            failures.append('created_by missing')
        print(f'  {k:<24} {v}{flag}')

    url, key = anon_key(ref)
    if not key:
        print('\n(no eas.json profile targets this ref — skipping HTTP checks)')
    else:
        print('\n== postgrest query shapes ==')
        for name, table, select in QUERIES:
            qs = urllib.parse.urlencode({'select': select, 'limit': '1'})
            req = urllib.request.Request(
                f'{url}/rest/v1/{table}?{qs}',
                headers={'apikey': key, 'Authorization': f'Bearer {key}'},
            )
            try:
                urllib.request.urlopen(req, timeout=30).read()
                print(f'  ok      {name}')
            except urllib.error.HTTPError as e:
                body = json.loads(e.read().decode() or '{}')
                print(f'  FAIL    {name} -> {body.get("code")}: {body.get("message")}')
                failures.append(f'query {name}')

        print('\n== security: definer functions closed to anon ==')
        for fn, payload in LOCKED_RPCS:
            req = urllib.request.Request(
                f'{url}/rest/v1/rpc/{fn}', data=payload, method='POST',
                headers={'apikey': key, 'Authorization': f'Bearer {key}',
                         'Content-Type': 'application/json'},
            )
            try:
                body = urllib.request.urlopen(req, timeout=30).read().decode()
                print(f'  FAIL    {fn} REACHABLE AS ANON: {body[:100]}')
                failures.append(f'{fn} exposed')
            except urllib.error.HTTPError as e:
                if e.code in (401, 403):
                    print(f'  ok      {fn} denied ({e.code})')
                else:
                    print(f'  ?       {fn} HTTP {e.code}')

    print()
    if failures:
        print(f'FAILED ({len(failures)}): ' + '; '.join(failures))
        sys.exit(1)
    print('all checks passed')


if __name__ == '__main__':
    main()
