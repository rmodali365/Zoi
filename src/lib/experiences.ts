import { supabase } from '@/lib/supabase';
import { Experience, ExperienceDraft, Sentiment } from '@/types';
import { keyAfter, initialRankKey } from '@/lib/ranking';
import { uploadExperiencePhotos } from '@/lib/storage';

// Mutations + reads behind the rank-and-log flow. Keeps RankExperienceScreen a thin
// orchestrator (sentiment → binary compare → save) with no inline Supabase calls.

export type ExperienceDetail = Experience & {
  // 1-based position in the author's overall ranked list (null for planned stops)
  // and the size of that list — the "#N of M" shown on the detail screen.
  rankPosition: number | null;
  authorTotal: number;
};

// One experience with its author + trip embedded, plus the author's rank position
// computed server-side (count of rank_keys at or before this one). Readable for any
// authenticated user thanks to the public-profiles RLS.
export async function getExperience(id: string): Promise<ExperienceDetail | null> {
  const { data, error } = await supabase
    .from('experiences')
    .select('*, user:users!experiences_user_id_fkey(id, name, handle, avatar_url), trip:trips(id, title)')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const exp = data as Experience;

  const ranked = supabase
    .from('experiences')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', exp.user_id)
    .eq('status', 'ranked');
  const { count: total } = await ranked;

  let rankPosition: number | null = null;
  if (exp.status === 'ranked' && exp.rank_key) {
    const { count } = await supabase
      .from('experiences')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', exp.user_id)
      .eq('status', 'ranked')
      .lte('rank_key', exp.rank_key);
    rankPosition = count ?? null;
  }
  return { ...exp, rankPosition, authorTotal: total ?? 0 };
}

// The ranked pool for a user — the candidates a new experience is binary-compared
// against. One overall ranked list per user; planned trip stops are excluded.
export async function getRankedExperiences(userId: string): Promise<Experience[]> {
  const { data } = await supabase
    .from('experiences')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'ranked')
    .order('rank_key', { ascending: true });
  return (data ?? []) as Experience[];
}

// Graduate an existing planned stop: flip it to ranked in place, keeping its trip
// membership, position, place, photos and note untouched.
export async function graduatePlannedStop(
  experienceId: string, sentiment: Sentiment, rankKey: string,
): Promise<void> {
  const { error } = await supabase
    .from('experiences')
    .update({ status: 'ranked', sentiment, rank_key: rankKey })
    .eq('id', experienceId);
  if (error) throw error;
}

// Insert a freshly logged + ranked experience. Photos are uploaded first; if the
// upload fails the row is still saved without them and `onPhotoError` is invoked so
// the UI can warn. When logging into a trip, the stop is appended to its itinerary.
export async function insertRankedExperience(args: {
  userId: string;
  draft: ExperienceDraft;
  sentiment: Sentiment;
  rankKey: string;
  onPhotoError?: () => void;
}): Promise<void> {
  const { userId, draft, sentiment, rankKey, onPhotoError } = args;

  let photoUrls: string[] = [];
  try {
    photoUrls = await uploadExperiencePhotos(userId, draft.photos);
  } catch {
    if (draft.photos.length > 0) onPhotoError?.();
  }

  let tripPosition: string | null = null;
  if (draft.trip_id) {
    const { data: rows } = await supabase
      .from('experiences')
      .select('trip_position, rank_key')
      .eq('trip_id', draft.trip_id);
    const ps = (rows ?? [])
      .map((r) => r.trip_position ?? r.rank_key)
      .filter((p): p is string => !!p)
      .sort();
    tripPosition = ps.length ? keyAfter(ps[ps.length - 1]) : initialRankKey();
  }

  const { error } = await supabase.from('experiences').insert({
    user_id: userId,
    sentiment,
    trip_id: draft.trip_id,
    trip_position: tripPosition,
    title: draft.title,
    locations: draft.locations,
    // Representative location (= locations[0]) for the map pin / legacy reads.
    location: draft.locations[0] ?? null,
    tags: draft.tags,
    photos: photoUrls,
    quick_take: draft.quick_take,
    rank_key: rankKey,
    experience_date: draft.experience_date,
  });
  if (error) throw error;
}
