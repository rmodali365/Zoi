import { supabase } from '@/lib/supabase';
import { uploadAvatar } from '@/lib/storage';
import { getMyUserId } from '@/lib/auth';
import { getRankedList } from '@/lib/rankings';
import { User, RankedExperience, Trip } from '@/types';

// Normalize a handle to the stored form: lowercase, only [a-z0-9_].
export function cleanHandle(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9_]/g, '');
}

// Whether a handle is already taken (used to pre-check before profile creation).
export async function handleTaken(handle: string): Promise<boolean> {
  const { data } = await supabase.from('users').select('id').eq('handle', handle).maybeSingle();
  return !!data;
}

// Create the current user's profile row (first run, after OTP verification).
export async function createProfile(args: {
  id: string; name: string; handle: string; phone: string;
}): Promise<void> {
  const { error } = await supabase.from('users').insert(args);
  if (error) throw error;
}

// Upload a new avatar and persist it on the user's row; returns the public URL.
// Shared by the Profile header and Edit Profile.
export async function updateAvatar(userId: string, localUri: string): Promise<string> {
  const url = await uploadAvatar(userId, localUri);
  const { error } = await supabase.from('users').update({ avatar_url: url }).eq('id', userId);
  if (error) throw error;
  return url;
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
  experiences: RankedExperience[];
  trips: Trip[];
};

// Fetch another user's public profile: header (users is world-readable) plus their
// ranked list and trips. Everything here is readable thanks to the public-profiles
// RLS policies (see migration 20260608220000_public_profiles).
//
// Their list is their RANKINGS — a shared experience appears in both people's
// lists at each of their own positions, which is the point of the split.
export async function getUserProfile(userId: string): Promise<UserProfileData> {
  const [{ data: prof }, experiences, { data: tr }] = await Promise.all([
    supabase.from('users').select('*').eq('id', userId).maybeSingle(),
    getRankedList(userId, await getMyUserId()),
    supabase.from('trips').select('*').eq('user_id', userId).order('created_at', { ascending: false }),
  ]);
  return {
    profile: (prof as User) ?? null,
    experiences,
    trips: (tr ?? []) as Trip[],
  };
}
