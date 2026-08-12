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
- **Contacts:** expo-contacts + expo-crypto — phone numbers are SHA-256 hashed on device
  and matched by the `match-contacts` Edge Function (raw numbers never leave the phone).

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
    experiences.ts          # getRankedExperiences, insertRankedExperience, graduatePlannedStop,
                            #   rerankExperience (sentiment + rank_key only)
    experienceDisplay.ts    # display helpers: title/locality/sentiment label, multi-location tolerant
    trips.ts                # trip CRUD + itinerary: city grouping, trip_position ordering,
                            #   planned stops, remove/detach, copyStopToTrip (the "inspiration" mechanic)
    follows.ts              # search users, follow/unfollow, counts, lists, getSuggestedUsers
    feed.ts                 # getFeed() — followed users' ranked experiences + author rank position
    tripMembers.ts          # collaborative trips: roster, invite/accept/decline, leave/remove,
                            #   joined-trip ids (feeds getMyTrips + the feed)
    experienceTags.ts       # "who were you with?": tag friends, accept (creates YOUR row in
                            #   the group) / decline, group participants
    ids.ts                  # newGroupId() — client-side uuid for experiences.group_id
    saves.ts                # Wishlist (want-to-do): save/unsave, getSavedIds, saved list w/ authors,
                            #   getSaveCounts (aggregate-only, via save_counts definer fn)
    notifications.ts        # in-app activity: follow/save events (written by DB triggers)
    contacts.ts             # contacts -> Zoi users: hash phones on device, match server-side
    share.ts                # shareProfile() — share sheet w/ https link (link Edge Function)
    places.ts               # client wrapper for the `places` Edge Function
    storage.ts              # uploadExperiencePhotos() + uploadAvatar() — local URIs -> public URLs
    ranking.ts              # fractional-index helpers (used by BOTH rank_key and trip_position)
    dates.ts                # date-only ('YYYY-MM-DD') helpers: today/format/daysBetween (local time)
    queryClient.ts          # shared React Query client
    queryKeys.ts            # qk — centralized query keys (reads + invalidations can't drift)
  components/
    ui/                     # primitives: AppText, Avatar, Card, Chip, SegmentedControl, DateField, FollowButton
    ExperienceCard.tsx      # feed card: author, photo, place, rank, tags, quick take, save button
    TripFeedCard.tsx        # feed card for a followed user's trip (cover + itinerary summary)
    ExperienceRow.tsx       # compact ranked-list row
    TripCard.tsx            # trip cover card (Trips subtab / profile strip)
    UserRow.tsx             # user row w/ follow button (FindPeople, FollowList)
    SuggestedUsers.tsx      # horizontal user cards w/ Follow ("Suggested for you")
    LocationSearch.tsx      # debounced Places autocomplete + select
    TripPickerSheet.tsx     # "Add to which trip?" sheet -> copyStopToTrip (TripDetail,
                            #   ExperienceDetail, Wishlist)
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
    FeedNavigator.tsx       # FeedHome, FindPeople (modal), Search, UserProfile, FollowList, TripDetail
    ExperiencesNavigator.tsx# ExperiencesHome (MyListScreen) + TripDetail
    LogNavigator.tsx        # LogHome, AddExperience, RankExperience, StartTrip
    ProfileNavigator.tsx    # ProfileHome, TripDetail, UserProfile, FollowList, EditProfile (modal)
  screens/
    auth/                   # Welcome, PhoneAuth, VerifyOtp, SetupProfile
    feed/FeedScreen.tsx     # followed users' experiences; pull-to-refresh, save, Find friends,
                            #   activity bell (unread dot)
    feed/FindPeopleScreen.tsx  # search users by name/@handle, follow/unfollow, contacts matching + invite
    feed/ActivityScreen.tsx # in-app notifications (follows + saves); opening clears the badge
    list/MyListScreen.tsx   # Experiences tab: Ranked (list/map toggle) / Trips / Wishlist subtabs
    log/                    # LogScreen (home), AddExperience, RankExperience, StartTrip
    experience/ExperienceDetailScreen.tsx  # read-only full view (carousel, rank, map); all stacks
    profile/ProfileScreen.tsx     # own profile: avatar, counts, share, trips strip, ranked list
    profile/UserProfileScreen.tsx # someone else's profile (follow, browse trips/experiences)
    profile/FollowListScreen.tsx  # followers / following list
    profile/EditProfileScreen.tsx # edit name/@handle/avatar (modal)
    profile/TripDetailScreen.tsx  # trip itinerary: city sections, map, owner edit / visitor copy
    search/SearchScreen.tsx # place search over followed users' rankings + trips (Feed stack)
supabase/
  migrations/               # SOURCE OF TRUTH for the DB (see DB section)
  schema.sql                # generated snapshot, read-only
  README.md                 # DB workflow
  config.toml               # project ref + function config (verify_jwt)
  functions/
    places/index.ts         # Deno Edge Function: Google Places proxy (key server-side)
    match-contacts/index.ts # phone-hash contact matching (service role, hashes only in transit)
    link/index.ts           # public (verify_jwt=false) share-link landing page: opens the
                            #   app via zoi:// or shows a get-the-app fallback
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
  photos[], quick_take, `experience_date` (required 'YYYY-MM-DD' — when it happened /
  is planned for; defaults to today via `ui/DateField`), and `trip_position` (per-trip
  itinerary order, independent of rank_key — both are fractional indexes from
  `src/lib/ranking.ts`).
- **Trip** = an itinerary container grouping experiences via `experiences.trip_id`. NOT
  ranked itself. Has title/destination/dates/cover_photo. TripDetail renders city-grouped
  sections ordered by `trip_position` (`groupByCity` in `lib/trips.ts`), with an optional
  day-grouped view (`groupByDay` over `experience_date`) when the trip has a start date.
  Trips can be **collaborative** — see below.

### Collaborative trips (#67)
A trip can have members: `trip_members (trip_id, user_id, status, invited_by)`. The
**owner is `trips.user_id` and never has a member row**, which is why there's no role
column — there's nothing to escalate to. Only `status = 'joined'` grants write access.

The load-bearing rule: **one ranked list per user survives collaboration.** A stop is
never one shared row that several people rank — each participant gets their OWN
`experiences` row (own `sentiment`, `rank_key`, `quick_take`), linked by
**`experiences.group_id`**. `groupStops()` collapses those rows into a `StopGroup` so
the itinerary shows one line per real-world stop, displaying *your* row when you have
one. Ranking a stop a trip mate added goes through `claimStopForRanking()`, which
inserts your own row in the same group and hands off to the normal graduate flow — we
never flip someone else's row. Ranking is opt-in per person: skipping a stop is normal,
so nothing lands in your list that you didn't do.

Capabilities (RLS, verified by a behavioural test — see the migration):
- Any joined member: add stops, reorder ANY stop, edit trip details, invite others.
- Any joined member: **delete any planned stop**, including a trip mate's — planning is
  shared scratch work.
- Nobody but the owner touches a **ranked** row: no editing, ranking, detaching or
  deleting someone else's. `guard_foreign_stop_update()` is the column-level guard behind
  the broad "Members reorder shared trip stops" policy (RLS can't scope to columns) —
  a non-owner may change `trip_position` and nothing else.
- `getMyTrips` unions owned + joined trips; the feed surfaces a shared trip to the
  followers of every member, credited to all of them (`FeedTrip.builders`).

### Collaborative experiences (#67, second half)
The same group mechanic outside a trip: on any log, **"Who were you with?"** tags
friends. A tag is an invitation (`experience_tags`), never a write into their list —
accepting creates *their* row in the same `group_id` with only the place/title/date
copied, then drops them into the normal capture step so they add **their own photos and
quick take** before ranking. Declining leaves nothing behind. A pending tag is private
to the two people involved: being named in someone's night before you agree to it isn't
public.

**The feed groups by `group_id`** (`getFeed`): one card per outing, not one per person.
It carries every participant (`FeedItem.companions`, fetched separately so people you
don't follow still appear), everyone's photos in one strip, and each person's own
ranking side by side — "Rushil: 😍 Loved · #3 of 41 / Alex: 🙂 Liked · #12 of 30". That
contrast is the point: same night, different lists. The earliest row leads the card;
the card resurfaces when a new person ranks it.

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
- **follows a whole trip** (`forkTrip` — clones every stop as `planned` into a new trip
  they own; rankings/takes/photos stay behind), or
- **saves an experience** to their Wishlist (`saves` table → Wishlist subtab), or
- **shares a profile** via the native share sheet (`lib/share.ts`) — an https link to the
  public `link` Edge Function, which deep-links installed users into the app
  (`zoi://user/<id>`) and shows a get-the-app fallback to everyone else.
The Feed mixes followed users' ranked experiences and non-empty trips (newest first);
experiences carry the author's rank position ("#3 of 41") — computed client-side in
`getFeed()`. Tapping any experience anywhere opens the read-only **ExperienceDetail**
screen (photo carousel, rank strip, tags, map pin, trip link) — registered in the Feed,
Experiences and Profile stacks.

### Log flow (Log tab → LogNavigator)
`LogHome` (two options) → either:
- **Log an experience:** `AddExperience` (title, place(s), date, photos, quick take, tags,
  optional trip) → `RankExperience` (sentiment + binary compare) → inserts the experience.
- **Start a trip:** `StartTrip` creates a trip container (title/destination/dates/cover),
  optionally jump to add an experience.
`AddExperienceScreen` is a **three-mode form** (`ExperienceForm`): `create` (above),
`graduate` (Rank on a planned stop opens it prefilled — add photos/take/tags/confirm the
date, then rank; the save updates the row in place), and `edit` (registered as
`EditExperience` modal in the Feed/Experiences/Profile stacks — owner content edits via
`updateExperience`; sentiment/rank_key are never editable here). Re-rank machinery exists —
`RankExperience` with `rerank: true` excludes the row from its own comparison pool and
updates ONLY sentiment + rank_key via `rerankExperience` — but it deliberately has NO
user-facing entry point: on-demand re-ranking was cut as a product decision, and the
planned periodic check-in flow ("does it still hold up?") will be its only driver. Owners
can also **delete** from ExperienceDetail (`deleteExperience`; saves cascade, positions
self-heal since they derive from rank_key order).
Finishing any rank flow **resets the Log stack to LogHome** and jumps to where the result
is visible (the trip's itinerary if the log belongs to a trip — re-ranks always go to the
ranked list — else the Experiences ranked list) — plain `popToTop()` breaks when the flow
was deep-navigated into (AddExperience can be the stack root).

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
`users(...)` errors with PGRST201 (ambiguous). **Since `trip_members` landed, `trips` ↔
`users` is ambiguous too** (owner FK + many-to-many through members) — always
`user:users!trips_user_id_fkey(...)`. Same for `trip_members` itself, which reaches
`users` via both `user_id` and `invited_by`.

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

Built: auth + profiles (edit, avatar, share via deep link), the full log + rank loop
(with required experience dates), trips as city- or day-grouped itineraries (planned
stops, reorder, graduate-to-ranked, visitor copy/save/fork), Feed with experience + trip
cards, ExperienceDetail screen, Wishlist + follows/suggested users, map views, photo
upload to Storage, design system + data layer refactors (PRs #44–46).

Known debt / next up:
- `getFeed()` fetches all followed users' experiences + trips client-side (no
  pagination) — move server-side when usage grows.
- Contacts invite flow (expo-contacts installed, not wired).
- Check-in re-ranking ("does it still hold up?" prompts) — planned.
- Real SMS (Twilio) before external users.
