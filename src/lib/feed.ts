import { supabase } from '@/lib/supabase';
import { getFollowingIds } from '@/lib/follows';
import { Experience, Trip } from '@/types';
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

  const [expRes, tripRes] = await Promise.all([
    supabase
      .from('experiences')
      .select('*, user:users!experiences_user_id_fkey(id, name, handle, avatar_url), trip:trips(id, title)')
      .in('user_id', followingIds)
      // Feed shows ranked experiences only — never planned trip stops.
      .eq('status', 'ranked')
      .order('rank_key', { ascending: true }),
    supabase
      .from('trips')
      .select('*, user:users(id, name, handle, avatar_url), experiences(id, status, location, locations)')
      .in('user_id', followingIds)
      .order('created_at', { ascending: false }),
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

  type TripRow = Trip & { experiences?: Pick<Experience, 'id' | 'status' | 'location' | 'locations'>[] };
  for (const t of (tripRes.data ?? []) as TripRow[]) {
    const stops = t.experiences ?? [];
    if (stops.length === 0) continue; // an empty itinerary isn't feed-worthy
    const cities = [...new Set(stops.map((s) => primaryLocation(s)?.city).filter((c): c is string => !!c))];
    entries.push({
      kind: 'trip',
      id: `trip-${t.id}`,
      createdAt: t.created_at,
      trip: {
        ...t,
        experiences: undefined, // partial stop rows — don't leak them past the summary
        stopCount: stops.length,
        plannedCount: stops.filter((s) => s.status === 'planned').length,
        cities,
      },
    });
  }

  // Display newest first.
  entries.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  return entries;
}
