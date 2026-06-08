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
