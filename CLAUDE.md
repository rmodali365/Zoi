# Zoi

Social experience-ranking iOS app. Tagline: **"Rank what you do. Share your taste."**
Think Beli, but for non-food experiences — hikes, dinners, bars, museums, day trips,
getaways. Two purposes, equally core:

1. **The ranking IS the content.** No star ratings — logging an experience places it in
   your single overall ranked list via head-to-head comparisons.
2. **Trips are shareable inspiration.** Your trips double as itineraries; when a friend
   is going to the same place, they browse your trip and copy stops into their own plan
   (or save individual experiences to their Wishlist). Plan → do → rank is one loop.

Solo project, built to move fast.

## Stack

- **Frontend:** React Native + Expo (SDK 54, RN 0.81), TypeScript (strict), iOS-first
- **Backend:** Supabase — auth (phone OTP), Postgres (RLS), storage, Edge Functions
- **Navigation:** React Navigation (native-stack + bottom-tabs); deep links via
  expo-linking (`zoi://user/<id>` → UserProfile in the Feed stack, see `navigation/index.tsx`)
- **Server state:** React Query (`@tanstack/react-query`) with centralized keys (`qk`)
- **Maps:** react-native-maps — map view toggle on Experiences tab + trip itinerary map
- **Location:** Google Places API (New), proxied through a Supabase Edge Function so the
  key stays server-side. Client calls `src/lib/places.ts`; never the Google API directly.
- **Images:** expo-image-picker → uploaded to Supabase Storage via `src/lib/storage.ts`
  (expo-file-system `File.bytes()`). Buckets: `experience-photos` (at log-save) and `avatars`
  (profile pic). Both public, per-user folder RLS (`<uid>/...`).
- Installed but not yet wired: expo-contacts (planned contacts-invite flow).

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
App.tsx                     # root: QueryClientProvider + StatusBar + RootNavigator
index.js                    # registerRootComponent(App)
src/
  lib/                      # data layer — screens NEVER touch supabase directly
    supabase.ts             # Supabase client (SecureStore session persistence)
    auth.ts                 # getMyUserId, sendOtp, verifyOtp, signOut
    me.ts                   # current user's experiences/trips/profile (shared qk cache)
    users.ts                # profile CRUD, handle validation, avatar update
    experiences.ts          # getRankedExperiences, insertRankedExperience, graduatePlannedStop
    experienceDisplay.ts    # display helpers: title/locality/sentiment label, multi-location tolerant
    trips.ts                # trip CRUD + itinerary: city grouping, trip_position ordering,
                            #   planned stops, remove/detach, copyStopToTrip (the "inspiration" mechanic)
    follows.ts              # search users, follow/unfollow, counts, lists, getSuggestedUsers
    feed.ts                 # getFeed() — followed users' ranked experiences + author rank position
    saves.ts                # Wishlist (want-to-do): save/unsave, getSavedIds, saved list w/ authors
    share.ts                # shareProfile() — native share sheet w/ zoi:// deep link
    places.ts               # client wrapper for the `places` Edge Function
    storage.ts              # uploadExperiencePhotos() + uploadAvatar() — local URIs -> public URLs
    ranking.ts              # fractional-index helpers (used by BOTH rank_key and trip_position)
    queryClient.ts          # shared React Query client
    queryKeys.ts            # qk — centralized query keys (reads + invalidations can't drift)
  components/
    ui/                     # primitives: AppText, Avatar, Card, Chip, SegmentedControl
    ExperienceCard.tsx      # feed card: author, photo, place, rank, tags, quick take, save button
    ExperienceRow.tsx       # compact ranked-list row
    TripCard.tsx            # trip cover card (Trips subtab / profile strip)
    UserRow.tsx             # user row w/ follow button (FindPeople, FollowList)
    SuggestedUsers.tsx      # horizontal user cards w/ Follow ("Suggested for you")
    LocationSearch.tsx      # debounced Places autocomplete + select
    README.md               # design-system usage guide
  constants/
    theme.ts                # COLORS / SPACING / RADIUS / FONT design tokens
    experiences.ts          # SENTIMENTS, thirdBounds, score-from-rank (unused), TAGS + labels
  contexts/
    AuthContext.tsx         # setProfileComplete — lets a screen flip RootNavigator to App
  types/index.ts            # all shared types + navigation param lists
  navigation/
    index.tsx               # RootNavigator: session+profile -> App, else Auth; deep-link config
    AuthNavigator.tsx       # Welcome -> PhoneAuth -> VerifyOtp -> SetupProfile
    AppNavigator.tsx        # bottom tabs (Ionicons): Feed / Experiences / Log / Profile
    FeedNavigator.tsx       # FeedHome, FindPeople (modal), UserProfile, FollowList, TripDetail
    ExperiencesNavigator.tsx# ExperiencesHome (MyListScreen) + TripDetail
    LogNavigator.tsx        # LogHome, AddExperience, RankExperience, StartTrip
    ProfileNavigator.tsx    # ProfileHome, TripDetail, UserProfile, FollowList, EditProfile (modal)
  screens/
    auth/                   # Welcome, PhoneAuth, VerifyOtp, SetupProfile
    feed/FeedScreen.tsx     # followed users' experiences; pull-to-refresh, save, Find friends
    feed/FindPeopleScreen.tsx  # search users by name/@handle, follow/unfollow
    list/MyListScreen.tsx   # Experiences tab: Ranked (list/map toggle) / Trips / Wishlist subtabs
    log/                    # LogScreen (home), AddExperience, RankExperience, StartTrip
    profile/ProfileScreen.tsx     # own profile: avatar, counts, share, trips strip, ranked list
    profile/UserProfileScreen.tsx # someone else's profile (follow, browse trips/experiences)
    profile/FollowListScreen.tsx  # followers / following list
    profile/EditProfileScreen.tsx # edit name/@handle/avatar (modal)
    profile/TripDetailScreen.tsx  # trip itinerary: city sections, map, owner edit / visitor copy
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

### Data model
Two entity types (NO "buckets"):
- **Experience** = the atomic, rankable unit. Has a **lifecycle**: `status = 'planned' |
  'ranked'`. Ranked rows have a `sentiment` + `rank_key`; planned rows have neither (they're
  trip stops not yet done — just place(s) + optional `note`). Locations are **multi**:
  `locations` jsonb array is canonical, `location` (= locations[0]) is a denormalized
  single kept for the map pin / legacy rows. Also: optional `trip_id`, `title`, tags[],
  photos[], quick_take, and `trip_position` (per-trip itinerary order, independent of
  rank_key — both are fractional indexes from `src/lib/ranking.ts`).
- **Trip** = an itinerary container grouping experiences via `experiences.trip_id`. NOT
  ranked itself. Has title/destination/dates/cover_photo. TripDetail renders city-grouped
  sections ordered by `trip_position` (`groupByCity` in `lib/trips.ts`).

**Planned → ranked ("graduation"):** a planned stop becomes a real ranked experience via
the normal rank flow with `experienceId` set — `graduatePlannedStop` flips the same row in
place, keeping trip membership/position/photos/note. Planned stops are filtered out of ALL
ranked surfaces (feed, ranked lists, comparison pools) via `status = 'ranked'`.

### Ranking & rating (the differentiator)
There is ONE overall ranked list per user. When logging: pick a **sentiment** — Loved /
Liked / Fine — which only seeds the **starting third** of the list (loved=top, liked=middle,
fine=lower; `thirdBounds`). Then a **binary comparison** ("which did you enjoy more?")
refines the exact position within that third, using fractional indexing (`src/lib/ranking.ts`).
`rank_key` orders the whole list (scoped per `user_id`). **We surface rankings (positions)
only — no numerical score for now.** A `scoreFromOverallRank` helper exists for when scores
are reintroduced, but nothing displays it. Sentiment is kept as metadata (emoji in lists).

### Social layer (the inspiration loop)
Profiles are **public to any authenticated user** (RLS: experiences/trips/profiles readable
by all signed-in users; follows still gate the *feed*, not visibility). This exists so
trips work as inspiration: a friend going to the same place browses your profile/trip and
- **copies a stop** into their own trip as a fresh planned stop (`copyStopToTrip` — place +
  note only, your ranking/take stays yours), or
- **saves an experience** to their Wishlist (`saves` table → Wishlist subtab), or
- **shares a profile** via the native share sheet + `zoi://user/<id>` deep link (`lib/share.ts`).
The Feed shows followed users' ranked experiences (newest first) with each item's position
in the author's list ("#3 of 41") — computed client-side in `getFeed()`.

### Log flow (Log tab → LogNavigator)
`LogHome` (two options) → either:
- **Log an experience:** `AddExperience` (title, place(s), photos, quick take, tags,
  optional trip) → `RankExperience` (sentiment + binary compare) → inserts the experience.
- **Start a trip:** `StartTrip` creates a trip container (title/destination/dates/cover),
  optionally jump to add an experience.
Trip owners can also add **planned stops** and log/reorder/delete directly from TripDetail;
ranking a planned stop routes through the same `RankExperience` screen (graduation).

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
  inline. This keeps typography centralized and the UI consistent; PR #44 converted all
  existing screens to this standard, so match it.
- **Data layer (REQUIRED for new/edited screens):** screens never touch `supabase`
  directly — all reads/writes go through a function in `src/lib/` (`auth`, `me`, `users`,
  `trips`, `experiences`, `follows`, `saves`, `feed`, `storage`). Screens stay thin: they
  call lib functions and own only UI state + navigation. For cacheable server reads use
  React Query (`useQuery`) keyed by the centralized keys in `src/lib/queryKeys.ts` (`qk`);
  mutate with `useMutation`/lib calls and `invalidateQueries(qk.…)` so caches can't drift.
  Auth/OTP and one-shot writes can be plain `await lib.fn()` (not every call needs a query).
  Need the current user id? `getMyUserId()` from `@/lib/auth` — don't call
  `supabase.auth.getUser()` in a screen. PR #45 moved every screen onto this pattern; match it.
- **Screens:** functional components, `StyleSheet.create` at bottom, typed nav props.
- **RLS:** writes are owner-only everywhere. Reads: profiles/experiences/trips/follows are
  readable by any **authenticated** user (public taste profiles — migration
  `20260608220000_public_profiles`); `saves` are private to their owner.

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

Built: auth + profiles (edit, avatar, share via deep link), the full log + rank loop,
trips as city-grouped itineraries (planned stops, reorder, graduate-to-ranked, visitor
copy/save), Feed + Wishlist + follows/suggested users, map views, photo upload to Storage,
design system + data layer refactors (PRs #44–46).

Known debt / next up:
- `getFeed()` fetches all followed users' experiences client-side (no pagination) — move
  server-side when usage grows.
- Contacts invite flow (expo-contacts installed, not wired).
- Check-in re-ranking ("does it still hold up?" prompts) — planned.
- Real SMS (Twilio) before external users.
