import { supabase } from '@/lib/supabase';
import { getMyUserId } from '@/lib/auth';
import { Experience, Ranking, RankedExperience, Sentiment } from '@/types';

// The personal half of an experience. One shared post, one ranking per person —
// each with their own sentiment, position, take and photos.
//
// EMBED GOTCHA: `experiences` now reaches `users` four ways (created_by FK, plus
// many-to-many through rankings, participants and saves), so any embed of users
// from experiences MUST name the FK: `creator:users!experiences_created_by_fkey`.

// Everything needed to render a shared post: the outing, plus every ranking on
// it with its author.
export const EXPERIENCE_WITH_RANKINGS =
  '*, creator:users!experiences_created_by_fkey(id, name, handle, avatar_url)'
  + ', trip:trips(id, title)'
  + ', rankings:experience_rankings(*, user:users!experience_rankings_user_id_fkey(id, name, handle, avatar_url))';

// Attach the viewer's own ranking (if any) so list rows can show "my" sentiment.
export function withMine(exp: Experience, myUserId: string | null): RankedExperience {
  const rankings = exp.rankings ?? [];
  return {
    ...exp,
    rankings,
    mine: (myUserId && rankings.find((r) => r.user_id === myUserId)) || null,
  };
}

// Every photo on a shared post, everyone's pooled — the viewer's first, so their
// own view of the night leads.
export function pooledPhotos(exp: RankedExperience): string[] {
  const mine = exp.mine?.photos ?? [];
  const others = exp.rankings.filter((r) => r.user_id !== exp.mine?.user_id).flatMap((r) => r.photos);
  return [...mine, ...others];
}

// One person's ranked list, best first. This IS their list: rankings ordered by
// rank_key, with the shared post embedded.
export async function getRankedList(userId: string, viewerId?: string | null): Promise<RankedExperience[]> {
  const { data, error } = await supabase
    .from('experience_rankings')
    .select(`*, experience:experiences(${EXPERIENCE_WITH_RANKINGS})`)
    .eq('user_id', userId)
    .order('rank_key', { ascending: true });
  if (error) throw error;

  const viewer = viewerId === undefined ? userId : viewerId;
  const rows = (data ?? []) as unknown as (Ranking & { experience: Experience | null })[];
  return rows
    .filter((r): r is Ranking & { experience: Experience } => !!r.experience)
    .map((r) => withMine(r.experience, viewer));
}

export async function getMyRankedList(): Promise<RankedExperience[]> {
  const userId = await getMyUserId();
  if (!userId) return [];
  return getRankedList(userId, userId);
}

// The comparison pool for the binary "which did you enjoy more?" step: the
// user's own rankings, ordered. Lighter than getRankedList — no embeds needed
// beyond the title shown on the comparison card.
export async function getRankingPool(userId: string): Promise<(Ranking & { experience: Experience | null })[]> {
  const { data, error } = await supabase
    .from('experience_rankings')
    .select('*, experience:experiences(id, title, locations, location, experience_date)')
    .eq('user_id', userId)
    .order('rank_key', { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as (Ranking & { experience: Experience | null })[];
}

// The viewer's ranking of one experience, if they have one.
export async function getMyRanking(experienceId: string): Promise<Ranking | null> {
  const userId = await getMyUserId();
  if (!userId) return null;
  const { data } = await supabase
    .from('experience_rankings')
    .select('*')
    .eq('experience_id', experienceId)
    .eq('user_id', userId)
    .maybeSingle();
  return (data as Ranking) ?? null;
}

// Rank an experience into your list. A DB trigger joins you to the experience
// and flips it to 'ranked' — so ranking a trip mate's stop is exactly this call,
// with nothing of theirs touched.
export async function upsertRanking(args: {
  experienceId: string;
  sentiment: Sentiment;
  rankKey: string;
  quickTake: string;
  photos: string[];
}): Promise<void> {
  const userId = await getMyUserId();
  if (!userId) throw new Error('Not signed in');
  const { error } = await supabase.from('experience_rankings').upsert({
    experience_id: args.experienceId,
    user_id: userId,
    sentiment: args.sentiment,
    rank_key: args.rankKey,
    quick_take: args.quickTake,
    photos: args.photos,
  }, { onConflict: 'experience_id,user_id' });
  if (error) throw error;
}

// Re-rank: ONLY sentiment + rank_key move. Content and photos stay put.
export async function moveRanking(args: {
  experienceId: string;
  sentiment: Sentiment;
  rankKey: string;
}): Promise<void> {
  const userId = await getMyUserId();
  if (!userId) throw new Error('Not signed in');
  const { error } = await supabase
    .from('experience_rankings')
    .update({ sentiment: args.sentiment, rank_key: args.rankKey })
    .eq('experience_id', args.experienceId)
    .eq('user_id', userId);
  if (error) throw error;
}

// Leave an experience: your ranking, your take and your photos go; the post
// stays for everyone else. A DB trigger removes you as a participant and, if you
// were the last one, retires the post (back to a planned stop inside a trip, or
// deleted outright when it was standalone).
export async function leaveExperience(experienceId: string): Promise<void> {
  const userId = await getMyUserId();
  if (!userId) throw new Error('Not signed in');
  const { error } = await supabase
    .from('experience_rankings')
    .delete()
    .eq('experience_id', experienceId)
    .eq('user_id', userId);
  if (error) throw error;
}

// How many experiences are in someone's list — the "of N" in "#3 of 41".
export async function getRankedCount(userId: string): Promise<number> {
  const { count } = await supabase
    .from('experience_rankings')
    .select('experience_id', { count: 'exact', head: true })
    .eq('user_id', userId);
  return count ?? 0;
}

// 1-based position of a ranking in its author's list (count of rank_keys at or
// before it), plus that list's size.
export async function getRankPosition(
  userId: string, rankKey: string,
): Promise<{ position: number; total: number }> {
  const [{ count: at }, { count: total }] = await Promise.all([
    supabase
      .from('experience_rankings')
      .select('experience_id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .lte('rank_key', rankKey),
    supabase
      .from('experience_rankings')
      .select('experience_id', { count: 'exact', head: true })
      .eq('user_id', userId),
  ]);
  return { position: at ?? 0, total: total ?? 0 };
}
