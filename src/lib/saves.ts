import { supabase } from '@/lib/supabase';
import { haptics } from '@/lib/haptics';
import { getMyUserId } from '@/lib/auth';
import { Experience, RankedExperience } from '@/types';
import { EXPERIENCE_WITH_RANKINGS, withMine } from '@/lib/rankings';

// A saved experience, with everyone on it embedded for the want-to-do list.
// Now that an outing is ONE post, a save points at the outing itself rather than
// at whichever person's copy you happened to be looking at.
export type SavedExperience = RankedExperience & { savedAt: string };

// IDs of experiences the current user has saved — used to seed bookmark state in feeds.
export async function getSavedIds(): Promise<Set<string>> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Set();

  const { data } = await supabase
    .from('saves')
    .select('experience_id')
    .eq('user_id', user.id);

  return new Set((data ?? []).map((r: { experience_id: string }) => r.experience_id));
}

export async function saveExperience(experienceId: string): Promise<void> {
  haptics.lightTap();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  const { error } = await supabase
    .from('saves')
    .insert({ user_id: user.id, experience_id: experienceId });
  if (error) throw error;
}

export async function unsaveExperience(experienceId: string): Promise<void> {
  haptics.lightTap();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  const { error } = await supabase
    .from('saves')
    .delete()
    .eq('user_id', user.id)
    .eq('experience_id', experienceId);
  if (error) throw error;
}

// Aggregate save counts for a set of experiences ("N friends want to do this").
// saves are owner-private, so this goes through the security-definer save_counts
// function — it returns ONLY counts, never who saved (#59).
export async function getSaveCounts(experienceIds: string[]): Promise<Record<string, number>> {
  if (experienceIds.length === 0) return {};
  const { data, error } = await supabase.rpc('save_counts', { exp_ids: experienceIds });
  if (error) throw error;
  const counts: Record<string, number> = {};
  for (const row of (data ?? []) as { experience_id: string; saves: number }[]) {
    counts[row.experience_id] = Number(row.saves);
  }
  return counts;
}

// The current user's want-to-do list: saved experiences with everyone on them.
// Saves persist across unfollows: experiences are authenticated-public (public-profiles
// RLS), so a saved experience stays readable even after unfollowing its author (#7).
// GOTCHA: experiences↔users is ambiguous several ways over (created_by FK plus the
// rankings/participants/saves many-to-manys), so every embed names its FK.
export async function getSaves(): Promise<SavedExperience[]> {
  const userId = await getMyUserId();
  if (!userId) return [];

  const { data, error } = await supabase
    .from('saves')
    .select(`created_at, experience:experiences!saves_experience_id_fkey(${EXPERIENCE_WITH_RANKINGS})`)
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;

  // PostgREST infers the embed as an array shape; the FK is to-one, so coerce.
  const rows = (data ?? []) as unknown as { created_at: string; experience: Experience | null }[];
  return rows
    .filter((row): row is { created_at: string; experience: Experience } => row.experience !== null)
    .map((row) => ({ ...withMine(row.experience, userId), savedAt: row.created_at }));
}
