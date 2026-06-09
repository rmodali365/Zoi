import { supabase } from '@/lib/supabase';
import { User, Experience, Trip } from '@/types';

// Current-user data fetchers, shared by My List + Profile so they hit the same
// React Query cache entries (qk.myExperiences / qk.myTrips / qk.myProfile).

export async function getMyExperiences(): Promise<Experience[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  const { data } = await supabase
    .from('experiences')
    .select('*')
    .eq('user_id', user.id)
    .order('rank_key', { ascending: true });
  return (data ?? []) as Experience[];
}

export async function getMyTrips(): Promise<Trip[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  const { data } = await supabase
    .from('trips')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });
  return (data ?? []) as Trip[];
}

export async function getMyProfile(): Promise<User | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from('users').select('*').eq('id', user.id).maybeSingle();
  return (data as User) ?? null;
}
