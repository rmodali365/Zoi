import { supabase } from '@/lib/supabase';
import { getFollowingIds } from '@/lib/follows';
import { Experience } from '@/types';

export type FeedItem = Experience & {
  // 1-based position within the author's own overall ranked list, and their list size.
  rankPosition: number;
  authorTotal: number;
};

// Experiences from people the current user follows, newest first. Each item carries the
// author's ranking position for that experience (computed from per-user rank_key order).
export async function getFeed(): Promise<FeedItem[]> {
  const followingIds = [...(await getFollowingIds())];
  if (followingIds.length === 0) return [];

  const { data, error } = await supabase
    .from('experiences')
    .select('*, user:users!experiences_user_id_fkey(id, name, handle, avatar_url), trip:trips(id, title)')
    .in('user_id', followingIds)
    .order('rank_key', { ascending: true });
  if (error) throw error;

  const all = (data ?? []) as Experience[];

  // Per-author totals, then assign 1-based positions by walking rank_key-ascending order.
  const totals: Record<string, number> = {};
  for (const e of all) totals[e.user_id] = (totals[e.user_id] ?? 0) + 1;

  const seen: Record<string, number> = {};
  const items: FeedItem[] = all.map((e) => {
    const pos = (seen[e.user_id] = (seen[e.user_id] ?? 0) + 1);
    return { ...e, rankPosition: pos, authorTotal: totals[e.user_id] };
  });

  // Display newest first.
  items.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  return items;
}
