# Database

`migrations/` is the **source of truth** for the database schema. Each change is its
own append-only, timestamped SQL file, applied in filename order. This gives us a
version history of every schema change in git and lets the DB be rebuilt from scratch.

`schema.sql` is a **generated snapshot** of the full current schema for quick reading.
It is NOT applied to the database — do not hand-edit it to make changes.

## Making a schema change

1. Create a new migration file:
   `migrations/<YYYYMMDDHHMMSS>_short_description.sql`
   (timestamp must sort after the latest existing migration)
2. Write the change as forward-only SQL (`alter table ...`, `create ...`, etc.).
   Prefer idempotent guards (`if not exists`, `drop policy if exists`) so it's replayable.
3. Apply it to the live database (Management API):
   ```sh
   python3 -c "import json; open('/tmp/p.json','w').write(json.dumps({'query': open('supabase/migrations/<file>.sql').read()}))"
   curl -s -X POST "https://api.supabase.com/v1/projects/<PROJECT_REF>/database/query" \
     -H "Authorization: Bearer <MGMT_TOKEN>" \
     -H "Content-Type: application/json" \
     --data @/tmp/p.json
   ```
   (Project ref + token are in `.claude/settings.local.json`. Build the JSON payload with
   Python so SQL newlines are escaped correctly — raw newlines in the JSON string fail.)
4. Update `schema.sql` to reflect the new full state.
5. Commit the migration file + updated `schema.sql` together.

## Baseline

`20260608000000_baseline.sql` is the squashed starting point — the full schema as it
existed when we adopted migrations. The live DB already matches it; it exists so a fresh
database can be built from zero. Everything after it is an incremental change.
