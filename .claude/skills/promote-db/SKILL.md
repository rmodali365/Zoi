---
name: promote-db
description: Promote database schema changes from dev to the production Supabase project (zoi-prod), or set up the migration ledger on a project. Use when asked to deploy/migrate/promote DB changes, apply migrations to prod, or when a schema change needs to reach production. Covers backup, ledger, db push, verification, secrets and Edge Functions.
---

# Promoting database changes to production

Applies pending migrations to a Supabase project and verifies the result. Prod holds
**real user data** (phone numbers, everyone's experiences and trips), so the ordering
below is not optional — the backup and the verification are the parts that make this
recoverable.

Background and history: `docs/deployment.md`. This file is the procedure.

## Projects

| | Name | Ref | Used by |
|---|---|---|---|
| dev | `Zoi` | `ckfpzzddogzdbjtxmahq` | `.env`, EAS `development` + `preview` |
| prod | `zoi-prod` | `bpwkbfffbplxyzxpkwva` | EAS `production` |

The Management API token is in `.claude/settings.local.json` (gitignored). Never print it,
never write it into a tracked file.

## Rules

1. **Confirm with the user before any write to prod.** Reads and verification are fine
   unprompted; `db push`, secrets and function deploys are not.
2. **Never `db push` without a fresh backup.** See step 2 — there is no other recovery
   path on this project.
3. **Verify the link target before pushing.** `supabase/.temp/project-ref` must contain
   the ref you intend. A push aimed at the wrong project replays the baseline against a
   populated database.
4. **A migration is only "done" when `verify-schema.py` passes**, not when `db push`
   prints success. Structural damage is silent.

## Procedure

### 1. Establish state

```sh
supabase login                                    # required; the access token alone
                                                  # gives LegacyPlatformAuthRequiredError
supabase link --project-ref <ref>
cat supabase/.temp/project-ref                    # MUST match the intended project
supabase migration list --linked
```

Read the output carefully:

- **Some applied, some pending** → normal. Proceed.
- **Everything pending / no ledger** → the project has no migration history. Do **not**
  push; it would replay the baseline over a live schema. Backfill first:
  ```sh
  supabase migration repair --status applied <timestamps already applied>
  ```
  Work out which are already applied by inspecting the schema (`information_schema.
  columns`, `pg_policies`) against each migration file. Confirm the resulting counts with
  the user before pushing.

### 2. Back up (prod, or any project with real data)

```sh
python3 scripts/backup-supabase.py prod
```

`supabase db dump` does **not** work here — it shells out to Docker, which isn't
installed, and the project has no managed backups (free plan, PITR off). The script above
is the backup. Output is gitignored; it contains real phone numbers.

### 3. Push

```sh
supabase db push
```

Applies pending migrations in **filename order**, so timestamps must sort correctly.
Migrations that read something an earlier one created will fail if ordering is wrong.

### 4. Verify — do not skip

```sh
python3 scripts/verify-schema.py prod
```

Checks structure (orphans, ranked posts with no ranking), the app's real PostgREST query
shapes, and that SECURITY DEFINER functions are closed to anon. Exits non-zero on failure.

If a query shape fails with **PGRST201**, an embed is ambiguous: nearly every path from a
table to `users` has more than one relationship, so every embed must name its FK
(`creator:users!experiences_created_by_fkey(...)`). See the PostgREST section of
`CLAUDE.md`.

### 5. Edge Functions and secrets

Neither rides along with migrations.

```sh
supabase functions deploy push places match-contacts link --project-ref <ref>
```

Per-project secrets — check these exist whenever a migration adds something that reads
one:

| Secret | Where | Notes |
|---|---|---|
| `GOOGLE_PLACES_API_KEY` | function secret | `places` |
| `PUSH_SECRET` | function secret | must equal the Vault `push_secret` |
| `push_endpoint` | Vault | `https://<ref>.supabase.co/functions/v1/push` — differs per project |
| `push_secret` | Vault | use a **different** value per project |

```sh
supabase secrets set PUSH_SECRET=<random> --project-ref <ref>
```
```sql
select vault.create_secret('https://<ref>.supabase.co/functions/v1/push', 'push_endpoint');
select vault.create_secret('<same random>', 'push_secret');
select * from public.push_config();   -- both columns must be non-null
```

**Push fails closed**: `push_config()` returning nulls disables it silently. A missing
secret looks exactly like "nobody has notifications on", so check it explicitly.

### 6. The app build

A schema change that drops or renames columns **breaks every installed build the moment
it lands**. Before promoting one, ask whether a build is live on TestFlight or a device.

If yes, the choice is the user's: coordinated cutover (migrate, then build and submit
immediately, testers update) or expand/contract (add the new shape, ship, drop the old
shape later). Do not decide this silently.

After a breaking promotion, the next step is always:

```sh
eas build --profile production --platform ios --auto-submit
```

`production` targets prod; `preview` targets dev. Building the wrong profile points the
app at a database that may not have the schema it expects.

## Running ad-hoc SQL

```py
python3 -c "
import sys; sys.path.insert(0, 'scripts')
from _supabase import run_sql
print(run_sql('prod', 'select count(*) from experiences'))
"
```

Two traps encoded in that helper: build the JSON payload with `json.dumps` (raw newlines
fail *silently*, returning `[]` with nothing applied), and send it with **curl**, because
Cloudflare 403s urllib on `api.supabase.com`.

## Known traps

- `supabase db dump` needs Docker → use `scripts/backup-supabase.py`.
- `supabase link` needs `supabase login` first.
- The CLI stays linked to whatever you linked last — **always re-check the ref**.
- `revoke ... from anon` does **not** remove the default PUBLIC grant on a function. Use
  `revoke execute on function f() from public, anon` then re-grant `authenticated` if an
  RLS policy calls it.
- Dev may carry columns from unmerged branches, so its schema can match no merged
  migration. Check before repairing dev's ledger.
