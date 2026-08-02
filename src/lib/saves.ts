import { supabase } from '@/lib/supabase';
import { Experience } from '@/types';

// A saved experience, with its author embedded for display in the want-to-do list.
export type SavedExperience = Experience & { savedAt: string };

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
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  const { error } = await supabase
    .from('saves')
    .insert({ user_id: user.id, experience_id: experienceId });
  if (error) throw error;
}

export async function unsaveExperience(experienceId: string): Promise<void> {
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

// The current user's want-to-do list: saved experiences with their author embedded.
// Saves persist across unfollows: experiences are authenticated-public (public-profiles
// RLS), so a saved experience stays readable even after unfollowing its author (#7).
// GOTCHA: experiences↔users is ambiguous (author FK vs the saves m2m), so the embed
// must name the explicit author FK.
export async function getSaves(): Promise<SavedExperience[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from('saves')
    .select('created_at, experience:experiences!saves_experience_id_fkey(*, user:users!experiences_user_id_fkey(id, name, handle, avatar_url))')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });
  if (error) throw error;

  // PostgREST infers the embed as an array shape; the FK is to-one, so coerce.
  const rows = (data ?? []) as unknown as { created_at: string; experience: Experience | null }[];
  return rows
    .filter((row): row is { created_at: string; experience: Experience } => row.experience !== null)
    .map((row) => ({ ...row.experience, savedAt: row.created_at }));
}
