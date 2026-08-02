import { supabase } from '@/lib/supabase';
import { Experience } from '@/types';
import { UserResult } from '@/lib/follows';

// In-app activity (#59). Rows are written server-side by DB triggers on follows
// and saves inserts — the client only reads and marks them.

export type Notification = {
  id: string;
  user_id: string;
  actor_id: string;
  type: 'follow' | 'save';
  experience_id: string | null;
  read: boolean;
  created_at: string;
  // Joined
  actor: UserResult | null;
  experience: Experience | null;
};

// Newest-first activity for the current user (RLS scopes to own rows).
// GOTCHA: notifications has TWO FKs to users (recipient + actor), so the embed
// must name the actor FK explicitly.
export async function getNotifications(): Promise<Notification[]> {
  const { data, error } = await supabase
    .from('notifications')
    .select('*, actor:users!notifications_actor_id_fkey(id, name, handle, avatar_url), experience:experiences(*)')
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data ?? []) as unknown as Notification[];
}

// Unread badge count for the Feed bell.
export async function getUnreadCount(): Promise<number> {
  const { count } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('read', false);
  return count ?? 0;
}

// Opening the Activity screen clears the badge.
export async function markAllRead(): Promise<void> {
  const { error } = await supabase
    .from('notifications')
    .update({ read: true })
    .eq('read', false);
  if (error) throw error;
}
