import { supabase } from '@/lib/supabase';
import { getMyUserId } from '@/lib/auth';
import { haptics } from '@/lib/haptics';
import { Experience, ExperienceParticipant } from '@/types';
import { UserResult } from '@/lib/follows';

// Who's on a shared experience. Replaces the old experience_tags table: with one
// post instead of N copies, "being tagged" and "being on it" are the same thing.
//
// Inviting someone doesn't touch their list. They accept, rank it themselves,
// and a DB trigger joins them. Leaving deletes their ranking (see
// `leaveExperience` in lib/rankings.ts) — never the post.

const PARTICIPANT_WITH_USER =
  '*, user:users!experience_participants_user_id_fkey(id, name, handle, avatar_url)';

// Everyone on an experience besides declines. Pending invites are only visible
// to the two people involved (RLS), so a bystander sees just the joined people.
export async function getParticipants(experienceId: string): Promise<ExperienceParticipant[]> {
  const { data, error } = await supabase
    .from('experience_participants')
    .select(PARTICIPANT_WITH_USER)
    .eq('experience_id', experienceId)
    .neq('status', 'declined')
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as ExperienceParticipant[];
}

// Invite people onto an experience. Re-inviting someone who declined revives
// their row rather than failing the primary key.
export async function inviteToExperience(experienceId: string, userIds: string[]): Promise<void> {
  if (userIds.length === 0) return;
  const me = await getMyUserId();
  if (!me) throw new Error('Not signed in');

  const { error } = await supabase.from('experience_participants').upsert(
    userIds.map((user_id) => ({
      experience_id: experienceId,
      user_id,
      status: 'invited',
      invited_by: me,
    })),
    { onConflict: 'experience_id,user_id' },
  );
  if (error) throw error;
}

export type ExperienceInvite = ExperienceParticipant & {
  experience: Experience | null;
  inviter: UserResult | null;
};

// Invitations waiting on the current user (Activity screen).
export async function getMyExperienceInvites(): Promise<ExperienceInvite[]> {
  const userId = await getMyUserId();
  if (!userId) return [];
  const { data, error } = await supabase
    .from('experience_participants')
    .select(
      '*, experience:experiences(*)'
      + ', inviter:users!experience_participants_invited_by_fkey(id, name, handle, avatar_url)',
    )
    .eq('user_id', userId)
    .eq('status', 'invited')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as ExperienceInvite[];
}

// Accepting only marks you joined — it deliberately does NOT create a ranking.
// You still go through the capture step and rank it yourself, with your own
// photos and your own take. That's the whole point of the personal layer.
export async function acceptExperienceInvite(experienceId: string): Promise<void> {
  haptics.success();
  const userId = await getMyUserId();
  if (!userId) throw new Error('Not signed in');
  const { error } = await supabase
    .from('experience_participants')
    .update({ status: 'joined' })
    .eq('experience_id', experienceId)
    .eq('user_id', userId);
  if (error) throw error;
}

// Kept as 'declined' rather than deleted so a tagger can't silently re-invite on
// a loop; getParticipants filters declines out.
export async function declineExperienceInvite(experienceId: string): Promise<void> {
  const userId = await getMyUserId();
  if (!userId) throw new Error('Not signed in');
  const { error } = await supabase
    .from('experience_participants')
    .update({ status: 'declined' })
    .eq('experience_id', experienceId)
    .eq('user_id', userId);
  if (error) throw error;
}

// The creator removing someone from an experience.
export async function removeParticipant(experienceId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('experience_participants')
    .delete()
    .eq('experience_id', experienceId)
    .eq('user_id', userId);
  if (error) throw error;
}

// Everyone on an experience except the viewer — "you're logging this with…".
export async function getOtherParticipants(experienceId: string): Promise<UserResult[]> {
  const me = await getMyUserId();
  const participants = await getParticipants(experienceId);
  return participants
    .filter((p) => p.status === 'joined' && p.user_id !== me && p.user)
    .map((p) => p.user as UserResult);
}
