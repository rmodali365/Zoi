import { supabase } from '@/lib/supabase';
import { User, Experience, Trip } from '@/types';

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
