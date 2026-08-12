import { supabase } from '@/lib/supabase';
import { User, Experience, Trip } from '@/types';
import { getJoinedTripIds } from '@/lib/tripMembers';

// Current-user data fetchers, shared by My List + Profile so they hit the same
// React Query cache entries (qk.myExperiences / qk.myTrips / qk.myProfile).

export async function getMyExperiences(): Promise<Experience[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  const { data } = await supabase
    .from('experiences')
    .select('*')
    .eq('user_id', user.id)
    // Ranked surfaces never show planned trip stops.
    .eq('status', 'ranked')
    .order('rank_key', { ascending: true });
  return (data ?? []) as Experience[];
}

// Trips you own PLUS trips you've joined (#67) — a shared trip is as much yours
// as one you created, so it belongs in the same list. `or` needs the joined ids
// inline, so they're fetched first.
export async function getMyTrips(): Promise<Trip[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const joined = await getJoinedTripIds();
  // The owner is embedded because a joined trip may belong to someone else — the
  // trip card credits whoever created it. FK named: trips now reaches users two
  // ways (owner + the many-to-many through trip_members).
  let query = supabase
    .from('trips')
    .select('*, user:users!trips_user_id_fkey(id, name, handle, avatar_url)');
  query = joined.length > 0
    ? query.or(`user_id.eq.${user.id},id.in.(${joined.join(',')})`)
    : query.eq('user_id', user.id);

  const { data } = await query.order('created_at', { ascending: false });
  return (data ?? []) as Trip[];
}

export async function getMyProfile(): Promise<User | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from('users').select('*').eq('id', user.id).maybeSingle();
  return (data as User) ?? null;
}
