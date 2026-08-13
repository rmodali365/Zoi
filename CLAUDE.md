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
    experiences.ts          # the SHARED half: getExperience, createExperience,
                            #   saveRankedExperience (post + your ranking + invites),
                            #   updateExperienceContent, rerankExperience, deleteExperience
    experienceDisplay.ts    # display helpers: title/locality/sentiment label, multi-location tolerant
    trips.ts                # trip CRUD + itinerary: city grouping, trip_position ordering,
                            #   planned stops, remove/detach, copyStopToTrip (the "inspiration" mechanic)
    follows.ts              # search users, follow/unfollow, counts, lists, getSuggestedUsers
    feed.ts                 # getFeed() — followed users' ranked experiences + author rank position
    rankings.ts             # the PERSONAL half: getRankedList/getRankingPool, upsert/move,
                            #   leaveExperience, withMine + pooledPhotos view helpers
    experienceParticipants.ts # who's on an experience: invite/accept/decline/remove
    tripMembers.ts          # collaborative trips: roster, invite/accept/decline, leave/remove,
                            #   joined-trip ids (feeds getMyTrips + the feed)
    saves.ts                # Wishlist (want-to-do): save/unsave, getSavedIds, saved list w/ authors,
                            #   getSaveCounts (aggregate-only, via save_counts definer fn)
    notifications.ts        # in-app activity: follow/save events (written by DB triggers)
    push.ts                 # push notifications: permission + Expo token registration,
                            #   badge count, tap -> deep link (no-ops off a real device)
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
    push/index.ts           # (verify_jwt=false, shared-secret) sends one notifications row
                            #   to the recipient's devices via the Expo Push API
    link/index.ts           # public (verify_jwt=false) share-link landing page: opens the
                            #   app via zoi:// or shows a get-the-app fallback
```

## Core concepts

### Auth flow
Phone OTP via Supabase. `VerifyOtpScreen` keys off the **auth user** (1:1 with phone):
existing profile row → straight into app; no profile row → `SetupProfile` (name + handle)
→ `setProfileComplete(true)`. No separate onboarding screen.

### Data model
An outing is split in two, and that split is the most important thing in the schema
(migration `20260813000000_shared_experiences`):

- **Experience** = the **shared** half: what happened, held **once** no matter how many
  people were there. `created_by` (who first logged it — NOT an owner), `status =
  'planned' | 'ranked'`, `title`, `tags`, `experience_date`, optional `trip_id` +
  `trip_position`, and `note` on planned stops. Locations are **multi**: `locations`
  jsonb array is canonical, `location` (= locations[0]) is a denormalized single kept
  for the map pin / legacy rows.
- **Ranking** (`experience_rankings`, PK `(experience_id, user_id)`) = the **personal**
  half: `sentiment`, `rank_key`, `quick_take`, `photos`. One row per person.
- **Participant** (`experience_participants`) = who's on it. Ranking auto-joins you.
- **Trip** = an itinerary container grouping experiences via `experiences.trip_id`. NOT
  ranked itself. Has title/destination/dates/cover_photo. TripDetail renders city-grouped
  sections ordered by `trip_position` (`groupByCity` in `lib/trips.ts`), with an optional
  day-grouped view (`groupByDay` over `experience_date`) when the trip has a start date.
  Trips can be **collaborative** — see below.

**Why split:** ranking cannot be shared. The same night is #3 in your list and #12 in
theirs, Loved by you and Fine by them. Everything that can be common lives on the
experience; everything that's a personal judgement lives on the ranking. A shared night
is therefore ONE post in one place — not a copy each — which is what makes it behave
consistently in the feed, your list, search and the wishlist.

`RankedExperience` (in `types/`) is the shape every list surface renders: the post, all
its `rankings`, and `mine` pulled out when the viewer has one. Build it with `withMine()`
from `lib/rankings.ts`; `pooledPhotos()` merges everyone's photos, viewer's first.

**"My ranked list" is now literally my rankings** — `experience_rankings where user_id =
me order by rank_key`, with the post embedded (`getRankedList`). Planned stops have no
ranking, so they can't leak into ranked surfaces; the old `status = 'ranked'` filter is
structural now.

**Ranking something = inserting your own ranking row.** There is no "graduation" flipping
a row any more, and no claiming/copying: ranking a planned trip stop, ranking an
experience someone added you to, and logging something new are all `saveRankedExperience`
— the only difference is whether the post already exists. Ranking is opt-in per person:
skipping a stop is normal, so nothing lands in your list that you didn't do.

**Leaving vs deleting.** Leaving (`leaveExperience`) deletes only YOUR ranking; the post
survives for everyone else. DB triggers then clean up: the last ranking leaving a
standalone post deletes it, and leaving a trip stop reverts it to `planned`. Only
`created_by` can delete the post outright, which removes it for everyone — the detail
screen says so and offers "just leave" instead.

### Collaborative trips (#67)
A trip can have members: `trip_members (trip_id, user_id, status, invited_by)`. The
**owner is `trips.user_id` and never has a member row**, which is why there's no role
column — there's nothing to escalate to. Only `status = 'joined'` grants write access.

A stop is one shared post, so the itinerary is a plain ordered list — no grouping layer.
Capabilities (RLS, verified by behavioural tests — see the migrations):
- Any joined member: add stops, reorder any stop, edit trip details, invite others.
- Any joined member: **delete any planned stop**, including a trip mate's — planning is
  shared scratch work. Removing a stop that people HAVE ranked detaches it from the
  itinerary for everyone, but stays in each of their lists (their rankings are untouched).
- `getMyTrips` unions owned + joined trips; the feed surfaces a shared trip to the
  followers of every member, credited to all of them (`FeedTrip.builders`).

### Collaborative experiences (#67)
On any log, **"Who were you with?"** invites friends onto the post. An invitation never
writes into their list — accepting only marks them joined; they still go through the
capture step and rank it themselves, with **their own photos and quick take**. A pending
invite is private to the two people involved (RLS): being named in someone's night before
you agree to it isn't public.

Two security-definer helpers gate this (same recursion reason as `is_trip_member`):
- `can_rank_experience` — creator, participant (invited or joined), or trip member.
- `can_edit_experience` — the SHARED content: creator or joined participant, plus trip
  members **only while the stop is still `planned`**. Once someone has ranked it, only
  the people who were there can change it.

**The feed reads posts, not copies** (`getFeed`): the experiences anyone you follow has
ranked, with all their rankings attached. One card per outing, carrying everyone's photos
in one strip and each person's own ranking side by side — "Rushil: 😍 Loved · #3 of 41 /
Alex: 🙂 Liked · #12 of 30". That contrast is the point: same night, different lists. The
card resurfaces at the newest ranking, so it reappears when a friend adds theirs.

### Ranking & rating (the differentiator)
There is ONE overall ranked list per user. When logging: pick a **sentiment** — Loved /
Liked / Fine — which only seeds the **starting third** of the list (loved=top, liked=middle,
fine=lower; `thirdBounds`). Then a **binary comparison** ("which did you enjoy more?")
refines the exact position within that third, using fractional indexing (`src/lib/ranking.ts`).
`experience_rankings.rank_key` orders the whole list (scoped per `user_id`). The
comparison pool is `getRankingPool(userId)` — your own rankings, in your order. **We
surface rankings (positions) only — no numerical score for now.** A `scoreFromOverallRank`
helper exists for when scores are reintroduced, but nothing displays it. Sentiment is kept
as metadata (emoji in lists).

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
`graduate` (Rank on an existing post — a planned trip stop, or one you were added to —
opens prefilled: the SHARED fields from the post, the personal ones from *your* ranking,
which is empty until you rank it. That blank take/photo area is deliberate: it's where
your view of the night goes), and `edit` (registered as `EditExperience` modal in the
Feed/Experiences/Profile stacks — shared content + your own photos/take via
`updateExperience`; sentiment/rank_key are never editable here). Re-rank machinery exists —
`RankExperience` with `rerank: true` excludes the row from its own comparison pool and
updates ONLY sentiment + rank_key via `rerankExperience` — but it deliberately has NO
user-facing entry point: on-demand re-ranking was cut as a product decision, and the
planned periodic check-in flow ("does it still hold up?") will be its only driver. From
ExperienceDetail you can **leave** (drops your ranking only) or, if you created it,
**delete** for everyone; saves cascade and positions self-heal from rank_key order.
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

### SECURITY DEFINER functions are PUBLIC by default

Every function is created with an EXECUTE grant to `PUBLIC`, and **`revoke ... from anon`
does not remove it** — anon inherits through PUBLIC, so revoking a role that only ever had
access via PUBLIC changes nothing. Anything in the `public` schema is also an RPC endpoint
(`POST /rest/v1/rpc/<name>`), reachable with the anon key that ships in the app bundle.

This shipped a real hole: `push_config()` returns the push shared secret and was readable
by anon. Fixed in `20260814120000_lock_down_definer_functions`. The pattern to use:

```sql
revoke execute on function public.fn(args) from public, anon;
grant  execute on function public.fn(args) to authenticated;  -- only if RLS needs it
```

Keep the `authenticated` grant for anything called inside an RLS policy — policies are
evaluated as the invoking role — and drop it entirely for anything returning a credential.
Check with `select proacl from pg_proc where proname = '…'`; a leading `=X/` entry means
PUBLIC still has it.

### PostgREST embed gotcha
Nearly every path from a table to `users` is now ambiguous, so **always name the FK**. A
bare `users(...)` errors with PGRST201:
- `experiences` → `creator:users!experiences_created_by_fkey(...)` (created_by FK, plus
  many-to-manys through rankings, participants and saves).
- `trips` → `user:users!trips_user_id_fkey(...)` (owner FK + members m2m).
- `trip_members` / `experience_participants` → both reach users via `user_id` **and**
  `invited_by`.
- `experience_rankings` → `user:users!experience_rankings_user_id_fkey(...)`.

`EXPERIENCE_WITH_RANKINGS` in `lib/rankings.ts` is the canonical select for a shared post
(creator + trip + every ranking with its author) — reuse it rather than rewriting embeds.

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

### Push notifications (#74)

Push mirrors the in-app activity feed rather than duplicating it: **one** trigger
(`notifications_push`) on `notifications` insert calls the `push` function via pg_net, so
every type is covered — including ones added later. Delivery is fire-and-forget; a failed
push must never roll back the write that caused it.

`push` is called by the database, not the app, so `verify_jwt = false` and it authenticates
on the `x-push-secret` header. It's handed only a row id and re-reads everything with the
service role, so the copy and the recipient can't be forged. Tokens live in `device_tokens`
(owner-only RLS — unlike the rest of the app's data these are never world-readable), and
Expo's `DeviceNotRegistered` receipts prune dead ones.

**Per-environment setup, not in migrations** (endpoint differs, secret is a credential):

```sh
supabase secrets set PUSH_SECRET=<random> --project-ref <ref>     # for the function
```
```sql
select vault.create_secret('https://<ref>.supabase.co/functions/v1/push', 'push_endpoint');
select vault.create_secret('<same random>', 'push_secret');        -- for the trigger
```

`push_config()` returns nulls until both Vault secrets exist, and the trigger no-ops on
null — so a fresh database or restored backup simply has push disabled rather than
erroring on every notification.

**Verified end-to-end on a physical device (2026-08-13)** — a real trip invite produced a
lock-screen notification. Note what testing it requires: a dev/preview build (remote push
doesn't work in Expo Go, and the Simulator can't even issue a token) plus APNs credentials
in EAS. The `preview` EAS profile points at the **dev** project, which is where the push
secrets live; `production` points at `zoi-prod`, which has none of this yet, so push there
silently does nothing until the migration and secrets are promoted.

Debugging without a device still works: `select content from net._http_response order by id
desc` shows what the Edge Function returned. `{"skipped":"no devices"}` means the chain is
fine and nothing is registered; `{"sent":N,"pruned":M}` means Expo accepted N and M tokens
were dead and dropped.

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
