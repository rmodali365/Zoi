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

// The append-to-end trip_position for a trip's itinerary (same fractional-index
// convention as trips.ts: nulls fall back to rank_key for pre-itinerary rows).
async function appendTripPosition(tripId: string): Promise<string> {
  const { data: rows } = await supabase
    .from('experiences')
    .select('trip_position, rank_key')
    .eq('trip_id', tripId);
  const ps = (rows ?? [])
    .map((r) => r.trip_position ?? r.rank_key)
    .filter((p): p is string => !!p)
    .sort();
  return ps.length ? keyAfter(ps[ps.length - 1]) : initialRankKey();
}

// Upload any local photo URIs, keeping already-remote URLs; on upload failure the
// caller is warned and only the already-remote photos are kept (save still succeeds).
async function resolvePhotos(
  userId: string, photos: string[], onPhotoError?: () => void,
): Promise<string[]> {
  try {
    return await uploadExperiencePhotos(userId, photos);
  } catch {
    const hadLocal = photos.some((p) => !p.startsWith('http'));
    if (hadLocal) onPhotoError?.();
    return photos.filter((p) => p.startsWith('http'));
  }
}

// Graduate an existing planned stop: flip it to ranked in place — keeping its trip
// membership + position — and persist everything captured on the way (title, photos,
// quick take, tags, date), so a graduated stop is a full experience (#51).
export async function graduatePlannedStop(args: {
  experienceId: string;
  draft: ExperienceDraft;
  sentiment: Sentiment;
  rankKey: string;
  onPhotoError?: () => void;
}): Promise<void> {
  const { experienceId, draft, sentiment, rankKey, onPhotoError } = args;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in');

  const photos = await resolvePhotos(user.id, draft.photos, onPhotoError);

  const { error } = await supabase
    .from('experiences')
    .update({
      status: 'ranked',
      sentiment,
      rank_key: rankKey,
      title: draft.title,
      locations: draft.locations,
      location: draft.locations[0] ?? null,
      tags: draft.tags,
      photos,
      quick_take: draft.quick_take,
      experience_date: draft.experience_date,
    })
    .eq('id', experienceId);
  if (error) throw error;
}

// Owner edit: update an experience's content (never its sentiment/rank_key — moving
// in the list is a re-ranking flow). Changing trips appends the row to the target
// itinerary; leaving a trip clears the itinerary position.
export async function updateExperience(args: {
  id: string;
  draft: ExperienceDraft;
  onPhotoError?: () => void;
}): Promise<void> {
  const { id, draft, onPhotoError } = args;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in');

  const photos = await resolvePhotos(user.id, draft.photos, onPhotoError);

  const { data: row } = await supabase
    .from('experiences')
    .select('trip_id, trip_position')
    .eq('id', id)
    .maybeSingle();
  let tripPosition = row?.trip_position ?? null;
  if ((row?.trip_id ?? null) !== draft.trip_id) {
    tripPosition = draft.trip_id ? await appendTripPosition(draft.trip_id) : null;
  }

  const { error } = await supabase
    .from('experiences')
    .update({
      title: draft.title,
      locations: draft.locations,
      location: draft.locations[0] ?? null,
      tags: draft.tags,
      photos,
      quick_take: draft.quick_take,
      experience_date: draft.experience_date,
      trip_id: draft.trip_id,
      trip_position: tripPosition,
    })
    .eq('id', id);
  if (error) throw error;
}

// Owner delete. RLS restricts to own rows; saves cascade via FK, and rank positions
// are derived from rank_key order, so nothing else needs re-keying.
export async function deleteExperience(id: string): Promise<void> {
  const { error } = await supabase.from('experiences').delete().eq('id', id);
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

  const photoUrls = await resolvePhotos(userId, draft.photos, onPhotoError);
  const tripPosition = draft.trip_id ? await appendTripPosition(draft.trip_id) : null;

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
