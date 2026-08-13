#!/usr/bin/env python3
"""Snapshot every user-data table to JSON, for use before a migration.

    python3 scripts/backup-supabase.py prod

Why this exists rather than `supabase db dump`: that command shells out to
Docker, which isn't installed on this machine, and the project has no managed
backups (free plan, PITR off). So there is no other backup path — do not skip
this step before pushing migrations to prod.

Output lands in the repo root as prod-backup-<date>.json, which .gitignore
already matches. It contains real phone numbers. Never commit it.
"""

import datetime
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _supabase import REPO, die, label_for, resolve_ref, run_sql  # noqa: E402

# Ordered parent-first, so a restore could replay them in this sequence.
TABLES = [
    ('auth.users', 'select id, phone, email, created_at, last_sign_in_at from auth.users'),
    ('public.users', 'select * from public.users'),
    ('public.follows', 'select * from public.follows'),
    ('public.trips', 'select * from public.trips'),
    ('public.trip_members', 'select * from public.trip_members'),
    ('public.experiences', 'select * from public.experiences'),
    ('public.experience_rankings', 'select * from public.experience_rankings'),
    ('public.experience_participants', 'select * from public.experience_participants'),
    ('public.saves', 'select * from public.saves'),
    ('public.notifications', 'select * from public.notifications'),
    ('public.device_tokens', 'select * from public.device_tokens'),
]


def main():
    if len(sys.argv) < 2:
        die('usage: backup-supabase.py <dev|prod|project-ref>')
    ref = resolve_ref(sys.argv[1])
    label = label_for(ref)

    dump = {
        'taken_at': datetime.datetime.now(datetime.timezone.utc).isoformat(),
        'project_ref': ref,
        'project': label,
        'tables': {},
    }

    total = 0
    for name, sql in TABLES:
        rows = run_sql(ref, sql)
        if isinstance(rows, dict):
            # A table that doesn't exist yet is expected pre-migration; record
            # the gap rather than aborting a backup that's otherwise fine.
            msg = str(rows.get('message', rows))[:120]
            print(f'  {name}: SKIPPED ({msg})')
            dump['tables'][name] = {'error': msg}
            continue
        dump['tables'][name] = rows
        total += len(rows)
        print(f'  {name}: {len(rows)} rows')

    out = os.path.join(REPO, f'{label}-backup-{datetime.date.today():%Y%m%d}.json')
    with open(out, 'w') as f:
        json.dump(dump, f, indent=1, default=str)

    print(f'\nwrote {out} ({os.path.getsize(out):,} bytes, {total:,} rows)')
    print('contains real user data — gitignored, keep it off shared drives')


if __name__ == '__main__':
    main()
