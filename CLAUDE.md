# Zoi

Social experience-ranking iOS app. Tagline: **"Rank what you do. Share your taste."**
Think Beli, but for non-food experiences — hikes, dinners, bars, museums, day trips,
getaways. The ranking IS the content. Solo project, built to move fast.

## Stack

- **Frontend:** React Native + Expo (SDK 54, RN 0.81), TypeScript (strict), iOS-first
- **Backend:** Supabase — auth (phone OTP), Postgres (RLS), storage
- **Navigation:** React Navigation (native-stack + bottom-tabs)
- **Location:** Google Places API (New), proxied through a Supabase Edge Function so the
  key stays server-side. Client calls `src/lib/places.ts`; never the Google API directly.
- **Images:** expo-image-picker → Supabase Storage (upload not yet wired)

## Running

```sh
npx expo start          # dev server
npx expo start --clear  # when Metro serves stale modules (common after deletes/renames)
npm run ios             # iOS simulator
```

There is **no linter** configured and that's fine — most "syntax errors" seen in the
editor are a stale TS server (restart: Cmd+Shift+P → "TypeScript: Restart TS Server")
or a stale Metro cache (`--clear`). Source of truth for "does it compile" is:

```sh
./node_modules/.bin/tsc --noEmit    # must be clean before considering work done
```

## File structure

```
App.tsx                     # root: StatusBar + RootNavigator
index.js                    # registerRootComponent(App)
src/
  lib/
    supabase.ts             # Supabase client (SecureStore session persistence)
    ranking.ts              # fractional-index rank_key helpers (bucket-agnostic)
    places.ts               # client wrapper for the `places` Edge Function
  components/
    LocationSearch.tsx      # debounced Places autocomplete + select (used in AddExperience)
  constants/
    theme.ts                # COLORS / SPACING / RADIUS / FONT design tokens
    experiences.ts          # SENTIMENTS, score-from-rank, flat TAGS + labels
  contexts/
    AuthContext.tsx         # setProfileComplete — lets a screen flip RootNavigator to App
  types/index.ts            # all shared types + navigation param lists
  navigation/
    index.tsx               # RootNavigator: session+profile -> App, else Auth
    AuthNavigator.tsx       # Welcome -> PhoneAuth -> VerifyOtp -> SetupProfile
    AppNavigator.tsx        # bottom tabs: Feed / Log / Profile / Search
    LogNavigator.tsx        # Log tab stack (see Log flow below)
  screens/
    auth/                   # Welcome, PhoneAuth, VerifyOtp, SetupProfile
    feed/FeedScreen.tsx     # stub
    log/                    # LogScreen (home), AddExperience, RankExperience, StartTrip
    profile/ProfileScreen.tsx  # has sign out; ranked lists not yet wired
    search/SearchScreen.tsx # stub
supabase/
  migrations/               # SOURCE OF TRUTH for the DB (see DB section)
  schema.sql                # generated snapshot, read-only
  README.md                 # DB workflow
  config.toml               # project ref + function config (verify_jwt)
  functions/
    places/index.ts         # Deno Edge Function: Google Places proxy (key server-side)
```

## Core concepts

### Auth flow
Phone OTP via Supabase. `VerifyOtpScreen` keys off the **auth user** (1:1 with phone):
existing profile row → straight into app; no profile row → `SetupProfile` (name + handle)
→ `setProfileComplete(true)`. No separate onboarding screen.

### Data model (reworked — there are NO "buckets")
Two entity types:
- **Experience** = the atomic, rankable unit (a hike, a dinner, a bar). Has a `sentiment`
  tier, optional `trip_id`, location (jsonb), tags[], photos[], quick_take, `rank_key`.
- **Trip** = a container that groups experiences via `experiences.trip_id`. NOT ranked
  itself; can be empty; shows a derived average score.

### Ranking & rating (the differentiator)
When logging an experience: pick a **sentiment tier** — Loved / Liked / Fine — then a
**binary comparison** ("which did you enjoy more?") places it *within that tier* using
fractional indexing (`src/lib/ranking.ts`). Ranking is scoped per `(user_id, sentiment)`.
Score (0–10) is **derived** from tier + position (`scoreFromRank`): Loved 8.5–10,
Liked 6.0–8.4, Fine 0–5.9. No manual star rating — position is the rating.

### Log flow (Log tab → LogNavigator)
`LogHome` (two options) → either:
- **Log an experience:** `AddExperience` (place, photos, quick take, tags, optional trip)
  → `RankExperience` (sentiment + binary compare) → inserts the experience.
- **Start a trip:** `StartTrip` creates a trip container, optionally jump to add an experience.

## Conventions

- **Path alias:** `@/` → `src/` (configured in both `babel.config.js` and `tsconfig.json`).
- **Styling:** always use tokens from `@/constants/theme` (COLORS/SPACING/RADIUS/FONT);
  Beli-inspired warm cream aesthetic. No external UI lib.
- **Screens:** functional components, `StyleSheet.create` at bottom, typed nav props.
- **RLS everywhere:** users read their own rows + rows from people they follow.

## Database workflow (IMPORTANT)

`supabase/migrations/` is the **source of truth**. Never hand-edit `schema.sql` to make a
change — it's a generated snapshot. To change the schema:

1. Add `supabase/migrations/<YYYYMMDDHHMMSS>_desc.sql` (forward-only SQL; prefer
   idempotent guards like `if not exists` / `drop policy if exists`).
2. Apply to the live DB via the Supabase Management API. **Build the JSON payload with
   Python** (raw newlines in the JSON string fail silently, returning `[]` with nothing
   applied). **Use curl, not Python urllib** (Cloudflare 403s urllib):
   ```sh
   python3 -c "import json; open('/tmp/p.json','w').write(json.dumps({'query': open('supabase/migrations/<file>.sql').read()}))"
   curl -s -X POST "https://api.supabase.com/v1/projects/<REF>/database/query" \
     -H "Authorization: Bearer <TOKEN>" -H "Content-Type: application/json" --data @/tmp/p.json
   ```
   `[]` = success for DDL.
3. **Verify** it applied (query `information_schema.columns`).
4. Update `schema.sql` snapshot to match; commit migration + snapshot together.

## Edge Functions

Deno functions live in `supabase/functions/<name>/`. Deploy with the CLI (no Docker
needed — it bundles via API). Auth the CLI with the access token from
`.claude/settings.local.json`:

```sh
# set a secret (server-side env var for the function)
SUPABASE_ACCESS_TOKEN=<token> supabase secrets set NAME=value --project-ref ckfpzzddogzdbjtxmahq
# deploy
SUPABASE_ACCESS_TOKEN=<token> supabase functions deploy <name> --project-ref ckfpzzddogzdbjtxmahq
```

`places` proxies Google Places (New). `verify_jwt = true`, so callers need a valid
Supabase session — `supabase.functions.invoke('places', { body })` passes it automatically.
The Google key is the `GOOGLE_PLACES_API_KEY` function secret, NOT a client env var.
Functions are excluded from the app's `tsconfig` (they're Deno, not RN).

## Project config & secrets

- **Supabase project ref:** `ckfpzzddogzdbjtxmahq`
- **Management token + MCP config:** `.claude/settings.local.json` (gitignored — never
  paste the token into committed files like this one).
- **Env vars** (`.env`, gitignored — see `.env.example`):
  `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_GOOGLE_PLACES_API_KEY`.
- **Auth testing:** SMS uses Supabase test OTPs (no Twilio yet). Test numbers are mapped
  to code `123456` in the Supabase dashboard; add more there as needed.

## Status / what's next

Built: auth flow, the log + rank loop, trips, DB migration setup, Google Places (via Edge
Function proxy) wired into AddExperience.
Deferred TODOs (have inline markers): photo upload to Supabase Storage (picker currently
keeps local URIs), and wiring real data into Profile + Feed.
