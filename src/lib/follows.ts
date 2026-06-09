import { supabase } from '@/lib/supabase';
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

// Simple "who to follow" suggestions: users the current user doesn't already follow.
export async function getSuggestedUsers(limit = 12): Promise<UserResult[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const following = await getFollowingIds();

  const { data } = await supabase
    .from('users')
    .select('id, name, handle, avatar_url')
    .neq('id', user.id)
    .limit(50);

  return ((data ?? []) as UserResult[])
    .filter((u) => !following.has(u.id))
    .slice(0, limit);
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
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  const { error } = await supabase
    .from('follows')
    .insert({ follower_id: user.id, following_id: targetId });
  if (error) throw error;
}

export async function unfollowUser(targetId: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  const { error } = await supabase
    .from('follows')
    .delete()
    .eq('follower_id', user.id)
    .eq('following_id', targetId);
  if (error) throw error;
}
