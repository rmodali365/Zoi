import { supabase } from '@/lib/supabase';
import { haptics } from '@/lib/haptics';
import { User } from '@/types';

export type UserResult = Pick<User, 'id' | 'name' | 'handle' | 'avatar_url'>;

// Search users by handle or name (excludes the current user).
export async function searchUsers(query: string): Promise<UserResult[]> {
  const q = query.trim();
  if (q.length < 1) return [];

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from('users')
    .select('id, name, handle, avatar_url')
    .or(`handle.ilike.%${q}%,name.ilike.%${q}%`)
    .neq('id', user.id)
    .limit(20);

  if (error) throw error;
  return (data ?? []) as UserResult[];
}

// IDs the current user currently follows.
export async function getFollowingIds(): Promise<Set<string>> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Set();

  const { data } = await supabase
    .from('follows')
    .select('following_id')
    .eq('follower_id', user.id);

  return new Set((data ?? []).map((r: { following_id: string }) => r.following_id));
}

// "Who to follow" suggestions: friends-of-friends first (people followed by the
// people you follow, ranked by how many of your follows follow them), topped up
// with recent users when that isn't enough (#60).
export async function getSuggestedUsers(limit = 12): Promise<UserResult[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const following = await getFollowingIds();
  const suggestions: UserResult[] = [];

  if (following.size > 0) {
    const { data: fof } = await supabase
      .from('follows')
      .select('following:users!follows_following_id_fkey(id, name, handle, avatar_url)')
      .in('follower_id', [...following]);

    // Count how many of my follows follow each candidate; more mutuals ranks higher.
    const counts = new Map<string, { user: UserResult; n: number }>();
    for (const row of fof ?? []) {
      const u = (row as unknown as { following: UserResult | null }).following;
      if (!u || u.id === user.id || following.has(u.id)) continue;
      const entry = counts.get(u.id) ?? { user: u, n: 0 };
      entry.n += 1;
      counts.set(u.id, entry);
    }
    suggestions.push(
      ...[...counts.values()].sort((a, b) => b.n - a.n).map((e) => e.user),
    );
  }

  // Top up with recent users the pool didn't already produce.
  if (suggestions.length < limit) {
    const seen = new Set(suggestions.map((u) => u.id));
    const { data } = await supabase
      .from('users')
      .select('id, name, handle, avatar_url')
      .neq('id', user.id)
      .order('created_at', { ascending: false })
      .limit(50);
    for (const u of (data ?? []) as UserResult[]) {
      if (!following.has(u.id) && !seen.has(u.id)) suggestions.push(u);
    }
  }

  return suggestions.slice(0, limit);
}

// Follower (people who follow `userId`) and following (people `userId` follows) counts.
export async function getFollowCounts(userId: string): Promise<{ followers: number; following: number }> {
  const [{ count: followers }, { count: following }] = await Promise.all([
    supabase.from('follows').select('*', { count: 'exact', head: true }).eq('following_id', userId),
    supabase.from('follows').select('*', { count: 'exact', head: true }).eq('follower_id', userId),
  ]);
  return { followers: followers ?? 0, following: following ?? 0 };
}

// Users who follow `userId`. (follows↔users is ambiguous — name the explicit FK.)
export async function getFollowers(userId: string): Promise<UserResult[]> {
  const { data, error } = await supabase
    .from('follows')
    .select('follower:users!follows_follower_id_fkey(id, name, handle, avatar_url)')
    .eq('following_id', userId);
  if (error) throw error;
  return (data ?? [])
    .map((r) => (r as unknown as { follower: UserResult | null }).follower)
    .filter((u): u is UserResult => u !== null);
}

// Users `userId` follows.
export async function getFollowing(userId: string): Promise<UserResult[]> {
  const { data, error } = await supabase
    .from('follows')
    .select('following:users!follows_following_id_fkey(id, name, handle, avatar_url)')
    .eq('follower_id', userId);
  if (error) throw error;
  return (data ?? [])
    .map((r) => (r as unknown as { following: UserResult | null }).following)
    .filter((u): u is UserResult => u !== null);
}

export async function followUser(targetId: string): Promise<void> {
  haptics.lightTap();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  const { error } = await supabase
    .from('follows')
    .insert({ follower_id: user.id, following_id: targetId });
  if (error) throw error;
}

export async function unfollowUser(targetId: string): Promise<void> {
  haptics.lightTap();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  const { error } = await supabase
    .from('follows')
    .delete()
    .eq('follower_id', user.id)
    .eq('following_id', targetId);
  if (error) throw error;
}
