import { supabase } from '@/lib/supabase';
import { getFollowingIds } from '@/lib/follows';
import { getTripIdsForMembers } from '@/lib/tripMembers';
import { EXPERIENCE_WITH_RANKINGS, withMine } from '@/lib/rankings';
import { getMyUserId } from '@/lib/auth';
import { Experience, Ranking, Trip, User, RankedExperience } from '@/types';
import { primaryLocation } from '@/lib/experienceDisplay';

export type UserBrief = Pick<User, 'id' | 'name' | 'handle' | 'avatar_url'>;

// One person's ranking of a feed experience, with their position in their own
// list. Several of these on one card is the whole point: same night, different
// lists.
export type FeedRanking = Ranking & {
  // 1-based position in that person's list, and its size. Only known for people
  // the viewer follows — we never show a made-up rank.
  rankPosition: number | null;
  authorTotal: number | null;
};

export type FeedItem = RankedExperience & {
  // Every ranking on the post, newest-ranked first, with positions attached.
  ranked: FeedRanking[];
};

// A followed user's trip, summarized for an itinerary card in the feed.
export type FeedTrip = Trip & {
  stopCount: number;
  plannedCount: number;
  cities: string[];
  // Everyone building this trip (owner first) — a shared trip is credited to the
  // whole group, not just whoever created it.
  builders: UserBrief[];
};

// The feed mixes ranked experiences and (non-empty) trips, newest first.
export type FeedEntry =
  | { kind: 'experience'; id: string; createdAt: string; item: FeedItem }
  | { kind: 'trip'; id: string; createdAt: string; trip: FeedTrip };

// Experiences + trips from people the current user follows, newest first.
//
// An experience is ONE post now, so the feed no longer merges duplicate rows —
// it just reads the posts that anyone you follow has ranked, with all their
// rankings attached. A shared night is naturally one card.
export async function getFeed(): Promise<FeedEntry[]> {
  const [followingSet, myUserId] = await Promise.all([getFollowingIds(), getMyUserId()]);
  const followingIds = [...followingSet];
  if (followingIds.length === 0) return [];

  // A shared trip belongs to everyone building it, so it should reach the
  // followers of any member — not only the creator's.
  const sharedTripIds = await getTripIdsForMembers(followingIds);

  // Which posts have the people you follow ranked? That's the feed.
  const { data: theirRankings, error: rankError } = await supabase
    .from('experience_rankings')
    .select('experience_id, user_id, rank_key, created_at')
    .in('user_id', followingIds);
  if (rankError) throw rankError;

  const rankingRows = (theirRankings ?? []) as Pick<
    Ranking, 'experience_id' | 'user_id' | 'rank_key' | 'created_at'
  >[];
  const experienceIds = [...new Set(rankingRows.map((r) => r.experience_id))];
  if (experienceIds.length === 0 && sharedTripIds.length === 0) return [];

  const [expRes, tripRes] = await Promise.all([
    experienceIds.length > 0
      ? supabase.from('experiences').select(EXPERIENCE_WITH_RANKINGS).in('id', experienceIds)
      : Promise.resolve({ data: [], error: null }),
    // Name the owner FK: `trips` reaches `users` two ways (owner FK + the
    // many-to-many via trip_members), so a bare `users(...)` is ambiguous.
    (() => {
      const q = supabase
        .from('trips')
        .select(
          '*, user:users!trips_user_id_fkey(id, name, handle, avatar_url)'
          + ', members:trip_members(status, user:users!trip_members_user_id_fkey(id, name, handle, avatar_url))'
          + ', experiences(id, status, location, locations)',
        );
      return (sharedTripIds.length > 0
        ? q.or(`user_id.in.(${followingIds.join(',')}),id.in.(${sharedTripIds.join(',')})`)
        : q.in('user_id', followingIds)
      ).order('created_at', { ascending: false });
    })(),
  ]);
  if (expRes.error) throw expRes.error;
  if (tripRes.error) throw tripRes.error;

  const entries: FeedEntry[] = [];
  const experiences = (expRes.data ?? []) as unknown as Experience[];

  // A card shows EVERY ranking on the post, which includes people you don't
  // follow (a shared night you were both on) and yourself. Positions have to
  // cover all of them or the same card shows "#3 of 41" for one person and a
  // bare sentiment for the next, which reads as broken. So resolve positions
  // from whoever actually appears, not from who you follow.
  const rankerIds = [
    ...new Set(experiences.flatMap((e) => (e.rankings ?? []).map((r) => r.user_id))),
  ];
  const positions: Record<string, { position: number; total: number }> = {};
  if (rankerIds.length > 0) {
    // Each person's WHOLE list — a position is only meaningful against it.
    const { data: allRankings } = await supabase
      .from('experience_rankings')
      .select('experience_id, user_id, rank_key')
      .in('user_id', rankerIds);
    const byUser: Record<string, { experience_id: string; rank_key: string }[]> = {};
    for (const r of (allRankings ?? []) as { experience_id: string; user_id: string; rank_key: string }[]) {
      (byUser[r.user_id] ??= []).push(r);
    }
    for (const [userId, rows] of Object.entries(byUser)) {
      const ordered = [...rows].sort((a, b) => (a.rank_key < b.rank_key ? -1 : 1));
      ordered.forEach((r, i) => {
        positions[`${r.experience_id}:${userId}`] = { position: i + 1, total: ordered.length };
      });
    }
  }

  for (const row of experiences) {
    const exp = withMine(row, myUserId);
    if (exp.rankings.length === 0) continue;

    // Newest ranking first, so the person who just added it leads the card.
    const ranked: FeedRanking[] = [...exp.rankings]
      .sort((a, b) => (a.created_at < b.created_at ? -1 : 1))
      .map((r) => {
        const pos = positions[`${r.experience_id}:${r.user_id}`];
        return { ...r, rankPosition: pos?.position ?? null, authorTotal: pos?.total ?? null };
      });

    // The card surfaces at the most recent ranking — when a friend ranks a night
    // you already saw, that's new activity worth showing again.
    const createdAt = ranked.reduce((max, r) => (r.created_at > max ? r.created_at : max), ranked[0].created_at);

    entries.push({ kind: 'experience', id: `experience-${exp.id}`, createdAt, item: { ...exp, ranked } });
  }

  type FeedMember = { status: string; user: UserBrief | null };
  // The member embed is a projection, not full TripMember rows, so `members` is
  // replaced rather than intersected.
  type TripRow = Omit<Trip, 'members'> & {
    experiences?: Pick<Experience, 'id' | 'status' | 'location' | 'locations'>[];
    members?: FeedMember[];
  };
  for (const t of (tripRes.data ?? []) as unknown as TripRow[]) {
    const stops = t.experiences ?? [];
    if (stops.length === 0) continue; // an empty itinerary isn't feed-worthy
    const cities = [...new Set(stops.map((s) => primaryLocation(s)?.city).filter((c): c is string => !!c))];
    const joined = (t.members ?? [])
      .filter((m) => m.status === 'joined' && m.user)
      .map((m) => m.user as UserBrief);
    entries.push({
      kind: 'trip',
      id: `trip-${t.id}`,
      createdAt: t.created_at,
      trip: {
        ...t,
        experiences: undefined, // partial stop rows — don't leak them past the summary
        members: undefined,     // summarized into `builders` below
        stopCount: stops.length,
        plannedCount: stops.filter((s) => s.status === 'planned').length,
        cities,
        builders: [...(t.user ? [t.user] : []), ...joined],
      },
    });
  }

  // Display newest first.
  entries.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  return entries;
}

export type PlaceSearchResults = { experiences: FeedItem[]; trips: FeedTrip[] };

// "What do my friends rank in Austin?" (#63) — filter already-fetched feed
// entries by place/title text. Pure so SearchScreen can reuse the cached qk.feed
// query instead of refetching per keystroke; same client-side scale caveat as
// getFeed itself. Experiences come back best-ranked-first (the author's own
// ordering is the recommendation).
export function filterFeedByPlace(entries: FeedEntry[], query: string): PlaceSearchResults {
  const q = query.trim().toLowerCase();
  if (!q) return { experiences: [], trips: [] };

  const experiences: FeedItem[] = [];
  const trips: FeedTrip[] = [];
  for (const entry of entries) {
    if (entry.kind === 'experience') {
      const it = entry.item;
      const locs = it.locations?.length ? it.locations : it.location ? [it.location] : [];
      const hay = [it.title, ...locs.flatMap((l) => [l.name, l.city, l.region, l.country])]
        .filter(Boolean)
        .join(' · ')
        .toLowerCase();
      if (hay.includes(q)) experiences.push(it);
    } else {
      const t = entry.trip;
      const hay = [t.title, t.destination, ...t.cities].filter(Boolean).join(' · ').toLowerCase();
      if (hay.includes(q)) trips.push(t);
    }
  }
  // Best position anyone gave it leads the results.
  const best = (i: FeedItem) =>
    Math.min(...i.ranked.map((r) => r.rankPosition ?? Number.MAX_SAFE_INTEGER));
  experiences.sort((a, b) => best(a) - best(b));
  return { experiences, trips };
}
