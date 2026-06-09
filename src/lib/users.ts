import { supabase } from '@/lib/supabase';
import { User, Experience, Trip } from '@/types';

// Normalize a handle to the stored form: lowercase, only [a-z0-9_].
export function cleanHandle(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9_]/g, '');
}

export type UpdateProfileResult = { ok: true } | { ok: false; error: 'handle_taken' | 'unknown' };

// Update the current user's name + handle. Returns a typed result so callers can
// surface the unique-handle collision (Postgres 23505) distinctly.
export async function updateProfile(
  userId: string,
  fields: { name: string; handle: string },
): Promise<UpdateProfileResult> {
  const { error } = await supabase
    .from('users')
    .update({ name: fields.name, handle: fields.handle })
    .eq('id', userId);
  if (!error) return { ok: true };
  if (error.code === '23505') return { ok: false, error: 'handle_taken' };
  return { ok: false, error: 'unknown' };
}

export type UserProfileData = {
  profile: User | null;
  experiences: Experience[];
  trips: Trip[];
};

// Fetch another user's public profile: header (users is world-readable) plus their
// experiences and trips. Experiences/trips are readable thanks to the public-profiles
// RLS policies (see migration 20260608220000_public_profiles).
export async function getUserProfile(userId: string): Promise<UserProfileData> {
  const [{ data: prof }, { data: exps }, { data: tr }] = await Promise.all([
    supabase.from('users').select('*').eq('id', userId).maybeSingle(),
    supabase.from('experiences').select('*').eq('user_id', userId).order('rank_key', { ascending: true }),
    supabase.from('trips').select('*').eq('user_id', userId).order('created_at', { ascending: false }),
  ]);
  return {
    profile: (prof as User) ?? null,
    experiences: (exps ?? []) as Experience[],
    trips: (tr ?? []) as Trip[],
  };
}
