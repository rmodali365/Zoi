import { supabase } from '@/lib/supabase';
import { getFollowingIds } from '@/lib/follows';
import { getTripIdsForMembers } from '@/lib/tripMembers';
import { Experience, Trip, User } from '@/types';
import { primaryLocation } from '@/lib/experienceDisplay';

export type FeedItem = Experience & {
  // 1-based position within the author's own overall ranked list, and their list size.
  rankPosition: number;
  authorTotal: number;
};

// A followed user's trip, summarized for an itinerary card in the feed.
export type FeedTrip = Trip & {
  stopCount: number;
  plannedCount: number;
  cities: string[];
  // Everyone building this trip (owner first) — a shared trip is credited to the
  // whole group, not just whoever created it.
  builders: Pick<User, 'id' | 'name' | 'handle' | 'avatar_url'>[];
};

// The feed mixes ranked experiences and (non-empty) trips, newest first.
export type FeedEntry =
  | { kind: 'experience'; id: string; createdAt: string; item: FeedItem }
  | { kind: 'trip'; id: string; createdAt: string; trip: FeedTrip };

// Experiences + trips from people the current user follows, newest first. Each
// experience carries the author's ranking position (computed from per-user rank_key
// order); each trip carries a stop/city summary for its card.
export async function getFeed(): Promise<FeedEntry[]> {
  const followingIds = [...(await getFollowingIds())];
  if (followingIds.length === 0) return [];

  // A shared trip belongs to everyone building it, so it should reach the
  // followers of any member — not only the creator's.
  const sharedTripIds = await getTripIdsForMembers(followingIds);

  const [expRes, tripRes] = await Promise.all([
    supabase
      .from('experiences')
      .select('*, user:users!experiences_user_id_fkey(id, name, handle, avatar_url), trip:trips(id, title)')
      .in('user_id', followingIds)
      // Feed shows ranked experiences only — never planned trip stops.
      .eq('status', 'ranked')
      .order('rank_key', { ascending: true }),
    // Name the owner FK: `trips` now has two paths to `users` (owner FK + the
    // many-to-many via trip_members), so a bare `users(...)` is ambiguous
    // (PGRST201), the same gotcha experiences↔users already had.
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

  const all = (expRes.data ?? []) as Experience[];

  // Per-author totals, then assign 1-based positions by walking rank_key-ascending order.
  const totals: Record<string, number> = {};
  for (const e of all) totals[e.user_id] = (totals[e.user_id] ?? 0) + 1;

  const seen: Record<string, number> = {};
  const entries: FeedEntry[] = all.map((e) => {
    const pos = (seen[e.user_id] = (seen[e.user_id] ?? 0) + 1);
    return {
      kind: 'experience',
      id: `experience-${e.id}`,
      createdAt: e.created_at,
      item: { ...e, rankPosition: pos, authorTotal: totals[e.user_id] },
    };
  });

  type FeedMember = { status: string; user: FeedTrip['builders'][number] | null };
  // The member embed is a projection, not full TripMember rows, so `members` is
  // replaced rather than intersected.
  type TripRow = Omit<Trip, 'members'> & {
    experiences?: Pick<Experience, 'id' | 'status' | 'location' | 'locations'>[];
    members?: FeedMember[];
  };
  // Cast through unknown: the nested member→user embed is deeper than the
  // generated PostgREST result types model.
  for (const t of (tripRes.data ?? []) as unknown as TripRow[]) {
    const stops = t.experiences ?? [];
    if (stops.length === 0) continue; // an empty itinerary isn't feed-worthy
    const cities = [...new Set(stops.map((s) => primaryLocation(s)?.city).filter((c): c is string => !!c))];
    const joined = (t.members ?? [])
      .filter((m) => m.status === 'joined' && m.user)
      .map((m) => m.user as FeedTrip['builders'][number]);
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
  experiences.sort((a, b) => a.rankPosition - b.rankPosition);
  return { experiences, trips };
}
