# Deployment: promoting database changes to production

How schema changes get from the dev database to the production one, and what has to
happen alongside them (Edge Functions, secrets, app builds).

Written 2026-08-13. The "current state" numbers below are a snapshot — re-check them
with the queries in [Verifying a promotion](#verifying-a-promotion) rather than trusting
this file.

## Environments

| | Project | Ref | Used by |
|---|---|---|---|
| **Dev** | `Zoi` | `ckfpzzddogzdbjtxmahq` | `.env`, and the `development` + `preview` EAS profiles |
| **Prod** | `zoi-prod` | `bpwkbfffbplxyzxpkwva` | the `production` EAS profile |

Both live in the same org (`bwlexuautjzmwanwfohv`). The anon keys for each are in
`eas.json`; the management token is in `.claude/settings.local.json` (gitignored).

**`eas.json`'s `production` profile already points at `zoi-prod`**, so a production build
talks to prod whether or not prod's schema is ready for it. Check the schema before
building, not after.

## Status: prod migrated 2026-08-13 ✅

`zoi-prod` is now current through `20260814120000`, with the migration ledger adopted, so
future promotions are `supabase db push` and nothing else. What the cutover produced:

- 27 experiences → 27 shared posts + **24 rankings** (the 3 planned stops correctly get
  none). No groups existed on prod, so nothing collapsed. Zero orphans.
- All four Edge Functions redeployed (`places` was two versions behind).
- Push secrets set — a **different** `PUSH_SECRET` from dev, so a leak in one doesn't
  reach the other.
- `push_config` and `save_counts` confirmed closed to anon.
- Pre-migration snapshot: `prod-backup-20260813.sql.json` (gitignored, local only) plus
  the `experiences_backup_20260813` table in the database.

**Two gotchas worth remembering for next time**, both hit during this run:
- `supabase db dump` shells out to **Docker**, which isn't installed here, and the project
  has no managed backups (free plan, PITR off). The fallback was a Management API export —
  see `scratchpad/backup_prod.py` in the session, or just re-derive it: it's a `select *`
  per table dumped to JSON.
- `supabase link` needs `supabase login` first; the access token in
  `.claude/settings.local.json` alone gives `LegacyPlatformAuthRequiredError`.

### Historical: how prod fell behind

Before the cutover, `zoi-prod` sat at `20260802000000_notifications_and_save_counts` with
9 users, 26 experiences, 3 trips, 16 follows and 3 saves — five migrations behind, while
`eas.json`'s production profile already pointed at it. A production build made in that
window would have been broken on arrival. Its `places` function was two versions behind
dev for the same reason.

## Why it drifted

`supabase/README.md` describes applying migrations by hand through the Management API
(`POST /v1/projects/<ref>/database/query`). That writes the schema but **records
nothing** — there's no `supabase_migrations.schema_migrations` ledger on either project.
With one database that's survivable; with two it means nothing knows what's been applied
where, and the only way to find out is inspecting `information_schema`.

Everything below depends on fixing that first. Once the ledger exists, **stop applying
migrations through the Management API** — a hand-applied migration leaves the ledger
stale, and the next `db push` will try to apply it again.

## Part 1 — The migration ledger (done for prod; still owed on dev)

Prod's ledger was backfilled on 2026-08-13. **Dev has not been done** — it still has no
`supabase_migrations` schema, so `db push` against dev would try to replay everything from
the baseline. Do this before ever pushing to dev:

```sh
supabase login                                     # the access token alone isn't enough
supabase link --project-ref ckfpzzddogzdbjtxmahq
supabase migration repair --status applied <every timestamp in supabase/migrations/>
supabase migration list                            # expect: all applied, 0 pending
```

Dev also carries `kind` / `details` / `city_key` from the unmerged `feat/trip-stop-kinds`
branch, so its schema doesn't match any merged migration. Resolve that branch before
repairing dev, or the ledger will encode a state main can't rebuild.

## Part 2 — Promoting (the routine, now that the ledger exists)

1. **Back up.** `supabase db dump` needs **Docker**, which isn't installed, and there are
   no managed backups on the free plan. Use a Management API export instead: `select *`
   per table (`auth.users`, `users`, `follows`, `trips`, `experiences`,
   `experience_rankings`, `experience_participants`, `saves`, `notifications`,
   `trip_members`, `device_tokens`) dumped to JSON. Keep it out of git — `.gitignore`
   matches `prod-backup*` and `*-backup-2*`.
2. **Apply.** `supabase db push`. It applies pending migrations in filename order, which
   is why timestamps must sort correctly — `20260813` reads `experience_tags` and
   `experiences.group_id` before dropping them, so it depends on the two before it.
3. **Verify** (see below) — structural checks *and* the PostgREST query shapes.
4. **Deploy Edge Functions.** They don't ride along with migrations:
   ```sh
   supabase functions deploy push places match-contacts link --project-ref <ref>
   ```
5. **Set any new secrets** (see the table below). Push fails closed, so a missing one is
   silent.
6. **Then** build the app.

## Part 3 — Ongoing CI/CD

`.github/workflows/db.yml` (repo is `rmodali365/Zoi` — the `Atlas` remote URL redirects):

```yaml
name: Database

on:
  pull_request:
    paths: ['supabase/migrations/**']
  push:
    branches: [main]
    paths: ['supabase/migrations/**']

jobs:
  # Every PR: replay ALL migrations from an empty database.
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: supabase/setup-cli@v1
        with: { version: latest }
      - run: supabase db start      # local Postgres, migrations applied in order
      - run: supabase db lint --level warning

  # Merge to main: apply pending migrations to prod.
  deploy:
    if: github.ref == 'refs/heads/main'
    needs: verify
    runs-on: ubuntu-latest
    env:
      SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}
      SUPABASE_DB_PASSWORD: ${{ secrets.PROD_DB_PASSWORD }}
    steps:
      - uses: actions/checkout@v4
      - uses: supabase/setup-cli@v1
      - run: supabase link --project-ref ${{ secrets.PROD_PROJECT_ID }}
      - run: supabase db push
```

Repo secrets needed: `SUPABASE_ACCESS_TOKEN`, `PROD_DB_PASSWORD`, `PROD_PROJECT_ID`.

**The `verify` job is the more valuable half.** There's no Docker on the dev machine, so
`supabase start` / `db reset` can't run locally — meaning the baseline plus twelve
migrations have never actually been replayed against an empty database. They've only ever
been applied incrementally to one long-lived dev DB. CI runners have Docker, so this
proves on every PR that the migration history can still rebuild the schema from zero.

Worth adding to the same workflow later: `supabase functions deploy` on merge, so Edge
Functions stop drifting the way `places` did.

### If schema ever changes in the dashboard

`supabase db diff -f <name>` generates a migration from the difference between the live
schema and the migration history, so Studio edits become tracked files instead of
invisible drift.

## Part 4 — Supabase Branching (the managed alternative)

Supabase can do this as a product feature: connect the GitHub repo, and it watches
`supabase/migrations/`. Opening a PR spins up an ephemeral *preview branch* database,
runs every migration against it, and reports on the PR; merging to the production branch
applies pending migrations to prod. It also gives each PR its own database instead of
sharing one dev DB.

Requires **Pro plan or above** and bills per branch-hour. Same ledger prerequisite as
everything else. For a solo project the GitHub Action above covers most of the value —
branching earns its keep when several changes are in flight at once.

## Part 5 — What CI does not solve

Automation answers *"did prod get the change"*. It doesn't answer *"is the change safe"*.
A migration that drops a column is applied just as cheerfully by CI as by hand — and it
breaks every app build already installed the moment it lands.

**`20260813_shared_experiences` is a textbook breaking change**: it drops
`experiences.sentiment / rank_key / quick_take / photos` and renames `user_id`. Any build
compiled before it will error on nearly every screen. That's acceptable now, pre-launch,
with 9 known users. It would not be acceptable afterwards.

Once there are real users, use **expand/contract**:

1. *Expand* — add the new shape, keep the old one, write to both.
2. Ship the app version that reads the new shape; wait for adoption (or force-update).
3. *Contract* — a later migration drops the old shape.

## Verifying a promotion

Point these at the target project ref. Payload built with Python because raw newlines in
the JSON string fail silently (returns `[]` with nothing applied), and curl rather than
`urllib` because Cloudflare 403s urllib on the Management API.

```sh
python3 -c "import json,sys; open('/tmp/q.json','w').write(json.dumps({'query': sys.argv[1]}))" "<SQL>"
curl -s -X POST "https://api.supabase.com/v1/projects/<REF>/database/query" \
  -H "Authorization: Bearer <TOKEN>" -H "Content-Type: application/json" --data @/tmp/q.json
```

Structural check — every ranked post must have at least one ranking, and no ranking may
be orphaned:

```sql
select
  (select count(*) from experiences) as experiences,
  (select count(*) from experience_rankings) as rankings,
  (select count(*) from experience_participants) as participants,
  (select count(*) from experience_rankings r
     left join experiences e on e.id = r.experience_id where e.id is null) as orphan_rankings,
  (select count(*) from experiences x where x.status = 'ranked'
     and not exists (select 1 from experience_rankings r where r.experience_id = x.id))
     as ranked_without_ranking,
  (select count(*) from saves s
     left join experiences e on e.id = s.experience_id where e.id is null) as orphan_saves;
```

`orphan_rankings`, `ranked_without_ranking` and `orphan_saves` must all be 0.

Then check the app's real queries resolve — PostgREST embed ambiguity (PGRST201) only
shows up at runtime, and after this refactor **every path from a table to `users` is
ambiguous** and must name its FK. The dev-side script that exercises all eleven query
shapes is worth keeping around; point it at the prod URL + anon key.

## Per-environment secrets (not carried by migrations)

Migrations move schema, not credentials. These have to be set once per project, and a
promotion that forgets them fails silently rather than loudly:

| Secret | Where | Notes |
|---|---|---|
| `GOOGLE_PLACES_API_KEY` | function secret | `places` |
| `PUSH_SECRET` | function secret | `push`; must match the Vault value below |
| `push_endpoint` | Vault | `https://<ref>.supabase.co/functions/v1/push` — differs per env |
| `push_secret` | Vault | same random string as `PUSH_SECRET` |

Push is designed to fail closed: `push_config()` returns nulls until both Vault secrets
exist and the trigger no-ops, so an unconfigured environment has push disabled rather
than erroring on every notification. Convenient, but it means **a missing secret looks
exactly like "nobody has notifications on"** — check `push_config()` after promoting.

### Rotating the push secret

`PUSH_SECRET` (function secret) and the `push_secret` Vault entry must match. To rotate:

```sh
supabase secrets set PUSH_SECRET=<new> --project-ref <ref>
```
```sql
select vault.update_secret((select id from vault.secrets where name = 'push_secret'), '<new>');
```

Order doesn't matter much — a mismatch only means pushes 401 until both sides are updated,
which is a pause rather than an outage.

## Known: prod has a minor definer-function exposure

`save_counts()` on `zoi-prod` is executable by PUBLIC, so anyone with the anon key can read
aggregate save counts for experience ids they already know. No secret and no "who saved" —
low severity, but real. It's fixed by `20260814120000_lock_down_definer_functions`, which
sorts after the push migration and so lands in the same promotion. Nothing to do
separately; just don't leave the promotion half-done.

## Also needed before real users (#70)

- **SMS**: prod still uses Supabase test OTPs. Outside users need Twilio.
- **Universal links**: the `link` Edge Function's domain config has to match prod.
- **Storage**: both buckets (`experience-photos`, `avatars`) exist on prod with per-user
  folder RLS — verified, nothing to do.
- Drop `experiences_backup_20260813` from both databases once the refactor has shipped.
