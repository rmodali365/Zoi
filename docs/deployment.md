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

## Current state (2026-08-13) — prod is behind

`zoi-prod` has **real data**: 9 users, 26 experiences, 3 trips, 16 follows, 3 saves.

Its schema is at `20260802000000_notifications_and_save_counts`. Three migrations are
unapplied:

- `20260812000000_collaborative_trips`
- `20260812120000_experience_tags`
- `20260813000000_shared_experiences`

Until those land, **a production build is broken** — every screen reads
`experience_rankings`, which doesn't exist there yet.

Prod's `places` Edge Function is version 1; dev's is version 3. Same drift, same cause.

## Why it drifted

`supabase/README.md` describes applying migrations by hand through the Management API
(`POST /v1/projects/<ref>/database/query`). That writes the schema but **records
nothing** — there's no `supabase_migrations.schema_migrations` ledger on either project.
With one database that's survivable; with two it means nothing knows what's been applied
where, and the only way to find out is inspecting `information_schema`.

Everything below depends on fixing that first. Once the ledger exists, **stop applying
migrations through the Management API** — a hand-applied migration leaves the ledger
stale, and the next `db push` will try to apply it again.

## Part 1 — Adopt the migration ledger (one-time, per project)

Upgrade the CLI first (was 2.33.7 locally, current is 2.114.x).

```sh
supabase link --project-ref bpwkbfffbplxyzxpkwva   # needs the DB password from the dashboard
# Tell the ledger which migrations prod ALREADY has, without re-running them:
supabase migration repair --status applied \
  20260608000000 20260608193000 20260608201000 20260608210000 20260608220000 \
  20260609000000 20260609010000 20260702000000 20260802000000
supabase migration list                            # confirm: 9 applied, 3 pending
```

Do the same on dev (`ckfpzzddogzdbjtxmahq`), marking **all twelve** as applied — dev
already has them.

## Part 2 — The pending promotion

1. **Back up.** The `20260813` migration self-creates an `experiences_backup_20260813`
   table, but that's one table. Take the whole thing:
   ```sh
   supabase db dump --db-url "<prod connection string>" -f prod-backup-$(date +%Y%m%d).sql
   ```
2. **Apply, in order.** `supabase db push` handles this. The order matters:
   `20260813` reads `experience_tags` and `experiences.group_id` before dropping them, so
   it needs the two migrations before it — even though it deletes most of their work.
3. **Verify** (see below).
4. **Deploy Edge Functions** and confirm secrets:
   ```sh
   SUPABASE_ACCESS_TOKEN=<token> supabase functions deploy places --project-ref bpwkbfffbplxyzxpkwva
   SUPABASE_ACCESS_TOKEN=<token> supabase secrets set GOOGLE_PLACES_API_KEY=<key> --project-ref bpwkbfffbplxyzxpkwva
   ```
5. **Then** build the app.

Prod's data was checked against the `20260813` backfill and is clean: 0 ranked
experiences missing `sentiment`/`rank_key`, 0 orphans, 0 trip stops missing a position.
No prod row has a `group_id`, so the group-collapse step is a no-op there — it only moves
rankings into the new table.

## Part 3 — Ongoing CI/CD

`.github/workflows/db.yml` (repo is `rmodali365/Atlas`):

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

## Also needed before real users (#70)

- **SMS**: prod still uses Supabase test OTPs. Outside users need Twilio.
- **Universal links**: the `link` Edge Function's domain config has to match prod.
- **Storage**: both buckets (`experience-photos`, `avatars`) exist on prod with per-user
  folder RLS — verified, nothing to do.
- Drop `experiences_backup_20260813` from both databases once the refactor has shipped.
