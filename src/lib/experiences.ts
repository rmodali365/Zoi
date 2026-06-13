import { supabase } from '@/lib/supabase';
import { Experience, ExperienceDraft, Sentiment } from '@/types';
import { keyAfter, initialRankKey } from '@/lib/ranking';
import { uploadExperiencePhotos } from '@/lib/storage';

// Mutations + reads behind the rank-and-log flow. Keeps RankExperienceScreen a thin
// orchestrator (sentiment → binary compare → save) with no inline Supabase calls.

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
  });
  if (error) throw error;
}
