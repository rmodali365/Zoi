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
- **Images:** expo-image-picker → uploaded to Supabase Storage via `src/lib/storage.ts`
  (expo-file-system `File.bytes()`). Buckets: `experience-photos` (at log-save) and `avatars`
  (profile pic). Both public, per-user folder RLS (`<uid>/...`).

## Running

```sh
npx expo start          # dev server
npx expo start --clear  # when Metro serves stale modules (common after deletes/renames)
npm run ios             # iOS simulator
```

Many "syntax errors" seen in the editor are a stale TS server (restart: Cmd+Shift+P →
"TypeScript: Restart TS Server") or a stale Metro cache (`--clear`). Both gates must be
clean before considering work done:

```sh
npm run typecheck    # tsc --noEmit
npm run lint         # eslint — enforces design tokens (react-native/no-color-literals)
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
    follows.ts              # search users, follow/unfollow, getFollowingIds
    feed.ts                 # getFeed() — followed users' experiences + author rank position
    follows.ts              # ...also getSuggestedUsers() (who-to-follow)
    storage.ts              # uploadExperiencePhotos() + uploadAvatar() — local URIs -> public URLs
  components/
    LocationSearch.tsx      # debounced Places autocomplete + select (used in AddExperience)
    ExperienceCard.tsx      # feed card: author, photo, place, sentiment, rank, tags, quick take
    SuggestedUsers.tsx      # horizontal square user cards w/ Follow (profile "Suggested for you")
  constants/
    theme.ts                # COLORS / SPACING / RADIUS / FONT design tokens
    experiences.ts          # SENTIMENTS, score-from-rank, flat TAGS + labels
  contexts/
    AuthContext.tsx         # setProfileComplete — lets a screen flip RootNavigator to App
  types/index.ts            # all shared types + navigation param lists
  navigation/
    index.tsx               # RootNavigator: session+profile -> App, else Auth
    AuthNavigator.tsx       # Welcome -> PhoneAuth -> VerifyOtp -> SetupProfile
    AppNavigator.tsx        # bottom tabs (w/ Ionicons): Feed / My List / Log / Profile
    FeedNavigator.tsx       # Feed tab stack: FeedHome + FindPeople (modal)
    LogNavigator.tsx        # Log tab stack (see Log flow below)
    ProfileNavigator.tsx    # Profile tab stack: ProfileHome + TripDetail
  screens/
    auth/                   # Welcome, PhoneAuth, VerifyOtp, SetupProfile
    feed/FeedScreen.tsx     # followed users' experiences (wired); pull-to-refresh + Find friends
    feed/FindPeopleScreen.tsx  # search users by name/@handle, follow/unfollow
    list/MyListScreen.tsx   # your single overall ranked list w/ derived scores (wired)
    log/                    # LogScreen (home), AddExperience, RankExperience, StartTrip
    profile/ProfileScreen.tsx  # name/@handle, avatar upload, Suggested-for-you, Trips strip, exp list, sign out
    profile/TripDetailScreen.tsx  # a trip's experiences (detailed), reached from the Trips strip
    search/SearchScreen.tsx # stub, NOT mounted in tabs (kept for later repurpose)
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
There is ONE overall ranked list per user. When logging: pick a **sentiment** — Loved /
Liked / Fine — which only seeds the **starting third** of the list (loved=top, liked=middle,
fine=lower; `thirdBounds`). Then a **binary comparison** ("which did you enjoy more?")
refines the exact position within that third, using fractional indexing (`src/lib/ranking.ts`).
`rank_key` orders the whole list (scoped per `user_id`). **We surface rankings (positions)
only — no numerical score for now.** A `scoreFromOverallRank` helper exists for when scores
are reintroduced, but nothing displays it. Sentiment is kept as metadata (emoji in lists).

### Log flow (Log tab → LogNavigator)
`LogHome` (two options) → either:
- **Log an experience:** `AddExperience` (place, photos, quick take, tags, optional trip)
  → `RankExperience` (sentiment + binary compare) → inserts the experience.
- **Start a trip:** `StartTrip` creates a trip container, optionally jump to add an experience.

## Conventions

- **Path alias:** `@/` → `src/` (configured in both `babel.config.js` and `tsconfig.json`).
- **Styling / design system:** tokens in `@/constants/theme` (COLORS/SPACING/RADIUS/FONT/
  FONT_SIZE) are the source of truth — `no-color-literals` is lint-enforced. Use `<AppText
  variant=…>` instead of raw `fontSize`, and the primitives in `src/components/ui/`
  (Avatar/Chip/Card/SegmentedControl) + domain components (ExperienceCard/ExperienceRow/
  TripCard/UserRow). Brand = ocean blue `COLORS.brand` for standout elements only. See
  `src/components/README.md`. Beli-inspired warm cream aesthetic; no external UI lib.
- **Reuse the component layer (REQUIRED for new/edited screens):** every text node is an
  `<AppText variant=…>` — never a raw `<Text>` with `fontSize`/`fontWeight`/`color` in a
  StyleSheet (StyleSheets should only carry layout: margins, padding, letterSpacing,
  textAlign, lineHeight, flex). Pick the `variant` by size, then override exact `weight`/
  `color` via props. Before hand-rolling a row/card/pill/avatar/segmented control/follow
  button, reach for the matching primitive or domain component above — don't duplicate one
  inline. This keeps typography centralized and the UI consistent; PR #1 converted all
  existing screens to this standard, so match it.
- **Data layer (REQUIRED for new/edited screens):** screens never touch `supabase`
  directly — all reads/writes go through a function in `src/lib/` (`auth`, `me`, `users`,
  `trips`, `experiences`, `follows`, `saves`, `feed`, `storage`). Screens stay thin: they
  call lib functions and own only UI state + navigation. For cacheable server reads use
  React Query (`useQuery`) keyed by the centralized keys in `src/lib/queryKeys.ts` (`qk`);
  mutate with `useMutation`/lib calls and `invalidateQueries(qk.…)` so caches can't drift.
  Auth/OTP and one-shot writes can be plain `await lib.fn()` (not every call needs a query).
  Need the current user id? `getMyUserId()` from `@/lib/auth` — don't call
  `supabase.auth.getUser()` in a screen. PR #2 moved every screen onto this pattern; match it.
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

### PostgREST embed gotcha
`experiences` ↔ `users` has TWO relationships (author FK + many-to-many via `saves`), so an
embed must name the FK explicitly: `user:users!experiences_user_id_fkey(...)`. A bare
`users(...)` errors with PGRST201 (ambiguous). `trips` embed is unambiguous.

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
