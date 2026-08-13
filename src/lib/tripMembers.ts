import { supabase } from '@/lib/supabase';
import { getMyUserId } from '@/lib/auth';
import { haptics } from '@/lib/haptics';
import { Trip, TripMember, User } from '@/types';
import { UserResult } from '@/lib/follows';

// Collaborative trips (#67). The trip OWNER is `trips.user_id` and never has a
// row here — `trip_members` holds only the other people, which is why there's no
// role column. Only 'joined' grants any write capability, and that's enforced by
// RLS via the `is_trip_member` definer function, not by these helpers.
//
// GOTCHA: trip_members has THREE FKs to users/trips (user_id, invited_by,
// trip_id), so every embed must name its FK explicitly — a bare `users(...)`
// errors with PGRST201, same as the experiences↔users case.

const MEMBER_WITH_USER =
  '*, user:users!trip_members_user_id_fkey(id, name, handle, avatar_url)';

// Everyone on a trip besides the owner, invited and joined alike (the roster UI
// shows pending invites greyed out). Declined rows are dropped — a decline
// should disappear rather than linger as a rejection notice.
export async function getTripMembers(tripId: string): Promise<TripMember[]> {
  const { data, error } = await supabase
    .from('trip_members')
    .select(MEMBER_WITH_USER)
    .eq('trip_id', tripId)
    .neq('status', 'declined')
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as TripMember[];
}

// Trip ids the current user has JOINED (not merely been invited to) — unioned
// with owned trips wherever "my trips" is shown.
export async function getJoinedTripIds(): Promise<string[]> {
  const userId = await getMyUserId();
  if (!userId) return [];
  const { data } = await supabase
    .from('trip_members')
    .select('trip_id')
    .eq('user_id', userId)
    .eq('status', 'joined');
  return (data ?? []).map((r: { trip_id: string }) => r.trip_id);
}

// Trips these users have JOINED (as opposed to own) — lets the feed surface a
// shared trip to the followers of everyone building it, not just its creator.
export async function getTripIdsForMembers(userIds: string[]): Promise<string[]> {
  if (userIds.length === 0) return [];
  const { data } = await supabase
    .from('trip_members')
    .select('trip_id')
    .in('user_id', userIds)
    .eq('status', 'joined');
  return [...new Set((data ?? []).map((r: { trip_id: string }) => r.trip_id))];
}

// Rosters for several trips at once, keyed by trip id — lets a list of trip
// cards show member avatars without a query per card.
export async function getMembersByTrip(
  tripIds: string[],
): Promise<Record<string, TripMember[]>> {
  if (tripIds.length === 0) return {};
  const { data, error } = await supabase
    .from('trip_members')
    .select(MEMBER_WITH_USER)
    .in('trip_id', tripIds)
    .neq('status', 'declined');
  if (error) throw error;

  const byTrip: Record<string, TripMember[]> = {};
  for (const m of (data ?? []) as unknown as TripMember[]) {
    (byTrip[m.trip_id] ??= []).push(m);
  }
  return byTrip;
}

export type TripInvite = TripMember & {
  trip: Trip | null;
  inviter: UserResult | null;
};

// The current user's outstanding invitations, newest first (Activity screen).
export async function getMyTripInvites(): Promise<TripInvite[]> {
  const userId = await getMyUserId();
  if (!userId) return [];
  const { data, error } = await supabase
    .from('trip_members')
    .select(
      '*, trip:trips(*), inviter:users!trip_members_invited_by_fkey(id, name, handle, avatar_url)',
    )
    .eq('user_id', userId)
    .eq('status', 'invited')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as TripInvite[];
}

// Invite people to a trip. Anyone already in the trip can invite (RLS checks
// membership + that invited_by is you). Re-inviting someone who declined
// revives their existing row rather than failing the primary key.
export async function inviteToTrip(tripId: string, userIds: string[]): Promise<void> {
  if (userIds.length === 0) return;
  haptics.lightTap();
  const me = await getMyUserId();
  if (!me) throw new Error('Not signed in');

  const { error } = await supabase.from('trip_members').upsert(
    userIds.map((user_id) => ({
      trip_id: tripId,
      user_id,
      status: 'invited',
      invited_by: me,
    })),
    { onConflict: 'trip_id,user_id' },
  );
  if (error) throw error;
}

// Accept an invitation — this is the moment the person gains write access to the
// itinerary (RLS reads status = 'joined'), and it notifies the owner via trigger.
export async function acceptTripInvite(tripId: string): Promise<void> {
  haptics.success();
  const userId = await getMyUserId();
  if (!userId) throw new Error('Not signed in');
  const { error } = await supabase
    .from('trip_members')
    .update({ status: 'joined' })
    .eq('trip_id', tripId)
    .eq('user_id', userId);
  if (error) throw error;
}

// Decline. The row is kept (not deleted) so the same person can be re-invited
// without tripping the primary key; getTripMembers filters declines out.
export async function declineTripInvite(tripId: string): Promise<void> {
  const userId = await getMyUserId();
  if (!userId) throw new Error('Not signed in');
  const { error } = await supabase
    .from('trip_members')
    .update({ status: 'declined' })
    .eq('trip_id', tripId)
    .eq('user_id', userId);
  if (error) throw error;
}

// Leave a trip you joined. Your stops stay on the itinerary — planned stops are
// group scratch work, and ranked experiences are yours and stay in your list.
export async function leaveTrip(tripId: string): Promise<void> {
  const userId = await getMyUserId();
  if (!userId) throw new Error('Not signed in');
  const { error } = await supabase
    .from('trip_members')
    .delete()
    .eq('trip_id', tripId)
    .eq('user_id', userId);
  if (error) throw error;
}

// Owner removes someone (RLS restricts this to the trip owner).
export async function removeTripMember(tripId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('trip_members')
    .delete()
    .eq('trip_id', tripId)
    .eq('user_id', userId);
  if (error) throw error;
}

// Everyone who can edit a trip, owner first — the roster shown on TripDetail.
export function rosterUsers(owner: User | undefined, members: TripMember[]): UserResult[] {
  const users: UserResult[] = owner ? [owner] : [];
  for (const m of members) if (m.user) users.push(m.user);
  return users;
}
