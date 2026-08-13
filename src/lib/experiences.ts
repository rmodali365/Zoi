import { supabase } from '@/lib/supabase';
import { Experience, ExperienceDraft, RankedExperience, Ranking, Sentiment } from '@/types';
import { keyAfter, initialRankKey } from '@/lib/ranking';
import { uploadExperiencePhotos } from '@/lib/storage';
import { getMyUserId } from '@/lib/auth';
import { EXPERIENCE_WITH_RANKINGS, withMine, upsertRanking } from '@/lib/rankings';
import { inviteToExperience } from '@/lib/experienceParticipants';

// Reads + writes for the SHARED half of an experience. The personal half
// (sentiment, rank position, quick take, photos) lives in lib/rankings.ts.
//
// A save therefore writes twice: the outing, then your ranking of it. Only the
// second is personal, which is why ranking someone else's experience never
// touches their row.

export type ExperienceDetail = RankedExperience & {
  // 1-based position in the VIEWER's list (null when they haven't ranked it),
  // and the size of that list — the "#N of M" on the detail screen.
  rankPosition: number | null;
  authorTotal: number;
};

// One experience with its creator, trip and every ranking on it.
export async function getExperience(id: string): Promise<ExperienceDetail | null> {
  const myUserId = await getMyUserId();
  const { data, error } = await supabase
    .from('experiences')
    .select(EXPERIENCE_WITH_RANKINGS)
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const exp = withMine(data as unknown as Experience, myUserId);

  // Position is shown for the viewer's own ranking — your list, your number.
  let rankPosition: number | null = null;
  let authorTotal = 0;
  if (myUserId) {
    const [{ count: at }, { count: total }] = await Promise.all([
      exp.mine
        ? supabase
            .from('experience_rankings')
            .select('experience_id', { count: 'exact', head: true })
            .eq('user_id', myUserId)
            .lte('rank_key', exp.mine.rank_key)
        : Promise.resolve({ count: null }),
      supabase
        .from('experience_rankings')
        .select('experience_id', { count: 'exact', head: true })
        .eq('user_id', myUserId),
    ]);
    rankPosition = at ?? null;
    authorTotal = total ?? 0;
  }
  return { ...exp, rankPosition, authorTotal };
}

// The append-to-end trip_position for a trip's itinerary.
async function appendTripPosition(tripId: string): Promise<string> {
  const { data: rows } = await supabase
    .from('experiences')
    .select('trip_position')
    .eq('trip_id', tripId);
  const ps = (rows ?? [])
    .map((r) => r.trip_position)
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

// Update the shared content of an experience. Anyone on it can do this — that's
// what makes it one post rather than two copies. Never touches anyone's ranking.
export async function updateExperienceContent(args: {
  id: string;
  draft: ExperienceDraft;
}): Promise<void> {
  const { id, draft } = args;

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
      experience_date: draft.experience_date,
      trip_id: draft.trip_id,
      trip_position: tripPosition,
    })
    .eq('id', id);
  if (error) throw error;
}

// Owner edit from the detail screen: shared content plus the viewer's own photos
// and quick take (their half of the post).
export async function updateExperience(args: {
  id: string;
  draft: ExperienceDraft;
  onPhotoError?: () => void;
}): Promise<void> {
  const { id, draft, onPhotoError } = args;
  const userId = await getMyUserId();
  if (!userId) throw new Error('Not signed in');

  await updateExperienceContent({ id, draft });

  const { data: mine } = await supabase
    .from('experience_rankings')
    .select('sentiment, rank_key')
    .eq('experience_id', id)
    .eq('user_id', userId)
    .maybeSingle();

  if (mine) {
    const photos = await resolvePhotos(userId, draft.photos, onPhotoError);
    const { error } = await supabase
      .from('experience_rankings')
      .update({ photos, quick_take: draft.quick_take })
      .eq('experience_id', id)
      .eq('user_id', userId);
    if (error) throw error;
  }
}

// Delete the whole post (creator only — RLS enforces it). Everyone's rankings
// cascade. Someone who just wants it out of THEIR list leaves instead
// (`leaveExperience` in lib/rankings.ts).
export async function deleteExperience(id: string): Promise<void> {
  const { error } = await supabase.from('experiences').delete().eq('id', id);
  if (error) throw error;
}

// Create the shared outing. Used by the log flow before ranking, and by trip
// planning for a stop nobody has ranked yet.
export async function createExperience(args: {
  draft: ExperienceDraft;
  status?: 'planned' | 'ranked';
}): Promise<string> {
  const userId = await getMyUserId();
  if (!userId) throw new Error('Not signed in');
  const { draft } = args;

  const tripPosition = draft.trip_id ? await appendTripPosition(draft.trip_id) : null;

  const { data, error } = await supabase
    .from('experiences')
    .insert({
      created_by: userId,
      status: args.status ?? 'planned',
      trip_id: draft.trip_id,
      trip_position: tripPosition,
      title: draft.title,
      locations: draft.locations,
      // Representative location (= locations[0]) for the map pin / legacy reads.
      location: draft.locations[0] ?? null,
      tags: draft.tags,
      experience_date: draft.experience_date,
    })
    .select('id')
    .single();
  if (error || !data) throw error ?? new Error('Could not save that experience.');
  return data.id;
}

// Save a freshly logged experience: create the shared post, rank it into your
// list, and invite anyone you were with. `experienceId` ranks an EXISTING post
// instead — a trip stop, or an experience you were invited to — which is the
// same call, because ranking is always just your own row.
export async function saveRankedExperience(args: {
  draft: ExperienceDraft;
  sentiment: Sentiment;
  rankKey: string;
  experienceId?: string;
  onPhotoError?: () => void;
  onInviteError?: () => void;
}): Promise<string> {
  const { draft, sentiment, rankKey, onPhotoError, onInviteError } = args;
  const userId = await getMyUserId();
  if (!userId) throw new Error('Not signed in');

  const photos = await resolvePhotos(userId, draft.photos, onPhotoError);

  let experienceId = args.experienceId;
  if (experienceId) {
    // Ranking an existing post: refresh the shared details (you may have fixed
    // the date or added a place on the way through the capture step).
    await updateExperienceContent({ id: experienceId, draft });
  } else {
    experienceId = await createExperience({ draft });
  }

  // Your half. The trigger behind this joins you to the experience and flips it
  // to 'ranked'.
  await upsertRanking({
    experienceId,
    sentiment,
    rankKey,
    quickTake: draft.quick_take,
    photos,
  });

  // Inviting is best-effort: the experience is saved and ranked either way.
  if (draft.companion_ids.length > 0) {
    try {
      await inviteToExperience(experienceId, draft.companion_ids);
    } catch {
      onInviteError?.();
    }
  }

  return experienceId;
}

// Re-rank (#61): ONLY sentiment + rank_key move, and only yours.
export async function rerankExperience(args: {
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

// Re-export so callers that think in "the ranked pool" keep one import site.
export type { Ranking };
