import { supabase } from '@/lib/supabase';
import { getMyUserId } from '@/lib/auth';
import { haptics } from '@/lib/haptics';
import { Experience } from '@/types';
import { UserResult } from '@/lib/follows';
import { newGroupId } from '@/lib/ids';
import { experienceLocations } from '@/lib/experienceDisplay';

// Collaborative experiences (#67): "who were you with?" on a log.
//
// A tag is an INVITATION, never a write into someone's list. Accepting creates
// the tagged person's own experience row in the same group, which they rank
// themselves — their sentiment, their photos, their quick take. This is the same
// shape as ranking a shared trip stop (`claimStopForRanking` in lib/trips.ts);
// the only difference is that a tag has no trip behind it.

export type ExperienceTag = {
  id: string;
  group_id: string;
  source_experience_id: string;
  tagged_by: string;
  user_id: string;
  status: 'pending' | 'accepted' | 'declined';
  created_at: string;
  // Joined
  source: Experience | null;
  tagger: UserResult | null;
};

// Tag people on an experience you just logged. Stamps a group_id on your row if
// it doesn't have one yet (a solo log becomes a shared one the moment you tag).
export async function tagCompanions(experienceId: string, userIds: string[]): Promise<void> {
  if (userIds.length === 0) return;
  const me = await getMyUserId();
  if (!me) throw new Error('Not signed in');

  const { data: row, error: readError } = await supabase
    .from('experiences')
    .select('id, group_id')
    .eq('id', experienceId)
    .maybeSingle();
  if (readError) throw readError;
  if (!row) throw new Error('Experience not found.');

  let groupId = row.group_id as string | null;
  if (!groupId) {
    groupId = newGroupId();
    const { error } = await supabase
      .from('experiences')
      .update({ group_id: groupId })
      .eq('id', experienceId);
    if (error) throw error;
  }

  // Upsert so re-tagging someone who declined revives the same row rather than
  // failing the (source_experience_id, user_id) unique constraint.
  const { error } = await supabase.from('experience_tags').upsert(
    userIds.map((user_id) => ({
      group_id: groupId,
      source_experience_id: experienceId,
      tagged_by: me,
      user_id,
      status: 'pending',
    })),
    { onConflict: 'source_experience_id,user_id' },
  );
  if (error) throw error;
}

// Tags waiting on the current user, newest first (Activity screen).
export async function getMyPendingTags(): Promise<ExperienceTag[]> {
  const userId = await getMyUserId();
  if (!userId) return [];
  const { data, error } = await supabase
    .from('experience_tags')
    .select(
      '*, source:experiences!experience_tags_source_experience_id_fkey(*)'
      + ', tagger:users!experience_tags_tagged_by_fkey(id, name, handle, avatar_url)',
    )
    .eq('user_id', userId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as ExperienceTag[];
}

// Everyone already logging this outing, besides you — shown when you're ranking
// a shared stop or an accepted tag, so it's clear whose night you're joining.
export async function getGroupParticipants(groupId: string): Promise<UserResult[]> {
  const me = await getMyUserId();
  const { data, error } = await supabase
    .from('experiences')
    .select('user_id, user:users!experiences_user_id_fkey(id, name, handle, avatar_url)')
    .eq('group_id', groupId);
  if (error) throw error;

  const seen = new Set<string>();
  const users: UserResult[] = [];
  for (const row of (data ?? []) as unknown as { user_id: string; user: UserResult | null }[]) {
    if (!row.user || row.user_id === me || seen.has(row.user_id)) continue;
    seen.add(row.user_id);
    users.push(row.user);
  }
  return users;
}

// Who's been tagged on an experience (the owner's view, so they can untag).
export async function getTagsForExperience(experienceId: string): Promise<ExperienceTag[]> {
  const { data, error } = await supabase
    .from('experience_tags')
    .select('*, tagger:users!experience_tags_tagged_by_fkey(id, name, handle, avatar_url)')
    .eq('source_experience_id', experienceId);
  if (error) throw error;
  return (data ?? []) as unknown as ExperienceTag[];
}

// "I was there too" — create MY row for this outing and return its id so the
// caller can hand off to the normal capture + rank flow. The row starts planned
// with the place/title/date copied over and NOTHING personal: no photos, no
// quick take, no sentiment. Those are the point — you add your own view of the
// same night, then rank it into your own list.
export async function acceptExperienceTag(tag: ExperienceTag): Promise<string> {
  haptics.success();
  const userId = await getMyUserId();
  if (!userId) throw new Error('Not signed in');

  // Already have a row in this group (accepted before)? Reuse it.
  const { data: existing } = await supabase
    .from('experiences')
    .select('id')
    .eq('group_id', tag.group_id)
    .eq('user_id', userId)
    .maybeSingle();

  let experienceId = existing?.id as string | undefined;

  if (!experienceId) {
    const source = tag.source;
    if (!source) throw new Error('That experience is no longer available.');
    const locs = experienceLocations(source);
    const { data, error } = await supabase
      .from('experiences')
      .insert({
        user_id: userId,
        status: 'planned',
        group_id: tag.group_id,
        // Tagged experiences aren't filed under a trip — the tagger's trip is
        // theirs. You can move it into one of yours later from the edit screen.
        trip_id: null,
        title: source.title,
        locations: locs,
        location: locs[0] ?? null,
        experience_date: source.experience_date,
      })
      .select('id')
      .single();
    if (error || !data) throw error ?? new Error('Could not add this to your list.');
    experienceId = data.id;
  }

  const { error: tagError } = await supabase
    .from('experience_tags')
    .update({ status: 'accepted' })
    .eq('id', tag.id);
  if (tagError) throw tagError;

  if (!experienceId) throw new Error('Could not add this to your list.');
  return experienceId;
}

// Not for me. The row is kept as 'declined' (not deleted) so the tagger can't
// silently re-tag on a loop; getMyPendingTags filters it out either way.
export async function declineExperienceTag(tagId: string): Promise<void> {
  const { error } = await supabase
    .from('experience_tags')
    .update({ status: 'declined' })
    .eq('id', tagId);
  if (error) throw error;
}

// Remove a tag entirely — the tagger untagging someone, or someone removing
// themselves from an experience they were tagged on.
export async function removeExperienceTag(tagId: string): Promise<void> {
  const { error } = await supabase.from('experience_tags').delete().eq('id', tagId);
  if (error) throw error;
}
