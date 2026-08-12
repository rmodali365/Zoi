import { supabase } from '@/lib/supabase';
import { Trip, Experience, Location, TripMember } from '@/types';
import { primaryLocation, localityLabel, experienceTitle } from '@/lib/experienceDisplay';
import { keyAfter, keyBefore, keyBetween, initialRankKey } from '@/lib/ranking';
import { daysBetween, formatDay } from '@/lib/dates';
import { haptics } from '@/lib/haptics';
import { getTripMembers } from '@/lib/tripMembers';
import { getMyUserId } from '@/lib/auth';
import { newGroupId } from '@/lib/ids';

export type TripDetail = {
  trip: Trip | null;
  items: Experience[];
  members: TripMember[];
  // The viewing user, so the screen can resolve permissions without a second query.
  myUserId: string | null;
};

// A trip plus its itinerary items (planned + ranked), ordered by trip_position.
// Rows with a null trip_position (logged before itinerary ordering existed) sort
// last, then by creation time.
//
// Items carry their author now that a trip can be collaborative — the itinerary
// shows who added what, and several rows can describe the SAME stop (one per
// participant, linked by group_id — see groupStops).
export async function getTripDetail(tripId: string): Promise<TripDetail> {
  const [{ data: t }, { data: exps }, members, myUserId] = await Promise.all([
    // Name the FK: `trips` now has two paths to `users` (owner FK + the
    // many-to-many via trip_members), so a bare `users(...)` is ambiguous.
    supabase
      .from('trips')
      .select('*, user:users!trips_user_id_fkey(id, name, handle, avatar_url)')
      .eq('id', tripId)
      .maybeSingle(),
    supabase
      .from('experiences')
      .select('*, user:users!experiences_user_id_fkey(id, name, handle, avatar_url)')
      .eq('trip_id', tripId)
      .order('trip_position', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true }),
    getTripMembers(tripId),
    getMyUserId(),
  ]);
  return {
    trip: (t as Trip) ?? null,
    items: (exps ?? []) as Experience[],
    members,
    myUserId,
  };
}

// Can this user build the itinerary? Owner or joined member. Mirrors the
// `is_trip_member` SQL function — RLS is the real gate, this just drives the UI.
export function canEditTrip(
  trip: Trip | null, members: TripMember[], userId: string | null,
): boolean {
  if (!trip || !userId) return false;
  if (trip.user_id === userId) return true;
  return members.some((m) => m.user_id === userId && m.status === 'joined');
}

// Accepts 'YYYY-MM-DD' (or empty → null). Throws on a non-empty malformed value
// so callers can surface a friendly message.
export function parseDateInput(s: string): string | null {
  const t = s.trim();
  if (!t) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t) || Number.isNaN(new Date(t).getTime())) {
    throw new Error('Use the date format YYYY-MM-DD.');
  }
  return t;
}

// Create a new trip container for the current user; returns its id. Cover photo
// (if any) should already be uploaded to a public URL by the caller.
export async function createTrip(fields: {
  title: string;
  destination: string | null;
  start_date: string | null;
  end_date: string | null;
  cover_photo: string | null;
}): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in');
  const { data, error } = await supabase
    .from('trips')
    .insert({ user_id: user.id, ...fields })
    .select('id')
    .single();
  if (error || !data) throw error ?? new Error('Could not create trip.');
  return data.id;
}

// Update a trip's editable fields (owner only, enforced by RLS).
export async function updateTrip(
  tripId: string,
  fields: Partial<Pick<Trip, 'title' | 'destination' | 'start_date' | 'end_date' | 'cover_photo'>>,
): Promise<void> {
  const { error } = await supabase.from('trips').update(fields).eq('id', tripId);
  if (error) throw error;
}

// --- Stop groups (the collaborative unit of an itinerary) ---

// One real-world stop on the itinerary. On a solo trip that's exactly one
// experience row; on a shared trip it's every participant's row for the same
// outing, linked by group_id — because each person ranks into their OWN list and
// so needs their own row. The itinerary renders one line per group, not per row.
export type StopGroup = {
  // Stable list key: the group_id, or the row id for an ungrouped (solo) stop.
  key: string;
  // The row to display: yours when you have one (so you see your own take),
  // otherwise the first-added row.
  lead: Experience;
  // Every participant's row for this stop.
  rows: Experience[];
  // Your row, if you're part of this stop.
  mine: Experience | null;
  // How many participants have ranked it (vs. still planned).
  rankedCount: number;
  // Itinerary order — the earliest position among the group's rows, so a group
  // can't drift apart if two people's rows carry different positions.
  position: string;
};

// Collapse itinerary rows into stop groups, preserving itinerary order. Input is
// assumed already ordered by trip_position.
export function groupStops(items: Experience[], myUserId: string | null): StopGroup[] {
  const groups: StopGroup[] = [];
  const indexByKey: Record<string, number> = {};

  for (const item of items) {
    const key = item.group_id ?? item.id;
    let idx = indexByKey[key];
    if (idx === undefined) {
      idx = indexByKey[key] = groups.length;
      groups.push({
        key, lead: item, rows: [], mine: null, rankedCount: 0, position: posOf(item),
      });
    }
    const g = groups[idx];
    g.rows.push(item);
    if (item.status === 'ranked') g.rankedCount += 1;
    if (myUserId && item.user_id === myUserId) {
      g.mine = item;
      g.lead = item; // your own row wins as the displayed one
    }
    if (posOf(item) < g.position) g.position = posOf(item);
  }

  return groups.sort((a, b) => (a.position < b.position ? -1 : a.position > b.position ? 1 : 0));
}

export type CitySection = { city: string; items: StopGroup[] };

// Group stops into city sections. Input is assumed already ordered, so a city's
// order = where its first stop falls (your "ordered by which city came first"
// rule), and stops keep their within-city order.
export function groupByCity(groups: StopGroup[]): CitySection[] {
  const sections: CitySection[] = [];
  const indexByCity: Record<string, number> = {};
  for (const group of groups) {
    const city = primaryLocation(group.lead)?.city || localityLabel(group.lead) || 'Other';
    if (indexByCity[city] === undefined) {
      indexByCity[city] = sections.length;
      sections.push({ city, items: [] });
    }
    sections[indexByCity[city]].items.push(group);
  }
  return sections;
}

export type DaySection = { key: string; label: string; items: StopGroup[] };

// Group stops by their experience_date — "Day N · Jun 3" relative to the trip's
// start date (dates before the start, or when there's no start, fall back to the
// bare date label). Days ascend; within a day stops keep itinerary order.
export function groupByDay(groups: StopGroup[], startDate: string | null): DaySection[] {
  const byDate = [...groups].sort((a, b) =>
    a.lead.experience_date < b.lead.experience_date ? -1
    : a.lead.experience_date > b.lead.experience_date ? 1
    : a.position < b.position ? -1 : 1);

  const sections: DaySection[] = [];
  const indexByKey: Record<string, number> = {};
  for (const group of byDate) {
    const date = group.lead.experience_date;
    const dayNum = startDate ? daysBetween(startDate, date) + 1 : 0;
    const label = dayNum >= 1 ? `Day ${dayNum} · ${formatDay(date)}` : formatDay(date);
    if (indexByKey[date] === undefined) {
      indexByKey[date] = sections.length;
      sections.push({ key: date, label, items: [] });
    }
    sections[indexByKey[date]].items.push(group);
  }
  return sections;
}

// --- Itinerary ordering (fractional index over trip_position) ---

// An item's effective itinerary position. Ranked rows logged before trip_position
// existed fall back to their rank_key (also a valid fractional index).
export function posOf(item: Experience): string {
  return item.trip_position ?? item.rank_key ?? initialRankKey();
}

// A trip_position that appends to the very end of the itinerary. A new stop sorts
// last overall, which means it lands at the end of its own city section.
export function nextTripPosition(items: Experience[]): string {
  const ps = items.map(posOf).sort();
  return ps.length ? keyAfter(ps[ps.length - 1]) : initialRankKey();
}

// trip_position to move `groups[idx]` one slot earlier within its (already-ordered) list.
export function positionToMoveUp(groups: StopGroup[], idx: number): string | null {
  if (idx <= 0) return null;
  const before = idx - 2 >= 0 ? groups[idx - 2].position : null;
  const after = groups[idx - 1].position;
  return before ? keyBetween(before, after) : keyBefore(after);
}

// trip_position to move `groups[idx]` one slot later within its (already-ordered) list.
export function positionToMoveDown(groups: StopGroup[], idx: number): string | null {
  if (idx >= groups.length - 1) return null;
  const before = groups[idx + 1].position;
  const after = idx + 2 <= groups.length - 1 ? groups[idx + 2].position : null;
  return after ? keyBetween(before, after) : keyAfter(before);
}

// --- Mutations ---

// Add an unranked planned stop to a trip from a picked place. Every stop gets a
// group_id up front so trip mates can rank the same outing into their own lists
// without the itinerary splitting into duplicate lines.
export async function addPlannedStop(args: {
  tripId: string; location: Location; note: string | null; position: string;
  // When the stop is planned for ('YYYY-MM-DD'); the UI defaults it to today.
  date: string;
}): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in');
  const { error } = await supabase.from('experiences').insert({
    user_id: user.id,
    status: 'planned',
    trip_id: args.tripId,
    group_id: newGroupId(),
    title: args.location.name,
    locations: [args.location],
    location: args.location,
    note: args.note,
    trip_position: args.position,
    experience_date: args.date,
  });
  if (error) throw error;
}

// Remove a whole stop from the itinerary. Planning is shared scratch work, so
// ANY trip member can clear planned rows — including ones a trip mate added.
// Ranked rows are different: they're someone's list entry, so only your own is
// detached and other people's are left in place (RLS enforces this too).
export async function removeStopGroup(group: StopGroup, myUserId: string | null): Promise<void> {
  const plannedIds = group.rows.filter((r) => r.status === 'planned').map((r) => r.id);
  const myRankedIds = group.rows
    .filter((r) => r.status === 'ranked' && r.user_id === myUserId)
    .map((r) => r.id);

  if (plannedIds.length > 0) {
    const { error } = await supabase.from('experiences').delete().in('id', plannedIds);
    if (error) throw error;
  }
  if (myRankedIds.length > 0) {
    const { error } = await supabase
      .from('experiences')
      .update({ trip_id: null, trip_position: null })
      .in('id', myRankedIds);
    if (error) throw error;
  }
}

// What `removeStopGroup` will actually do, for the confirm dialog — a member
// needs to know a trip mate's ranked memory isn't going anywhere.
export function removalSummary(group: StopGroup, myUserId: string | null): string {
  const otherRanked = group.rows.filter((r) => r.status === 'ranked' && r.user_id !== myUserId);
  const mineRanked = group.rows.some((r) => r.status === 'ranked' && r.user_id === myUserId);
  if (otherRanked.length > 0) {
    const who = otherRanked[0].user?.name ?? 'someone';
    const rest = otherRanked.length > 1 ? ` and ${otherRanked.length - 1} more` : '';
    return `The planned stop is deleted. ${who}${rest} already ranked this, and that stays in their list.`;
  }
  if (mineRanked) return 'The experience stays in your list — it just leaves this trip.';
  return 'This planned stop will be deleted for everyone on the trip.';
}

// Move a whole stop in the itinerary — every participant's row moves together,
// so a group can't tear apart. Reordering someone else's row is the one
// cross-user write a trip member is allowed (guarded column-wise in the DB).
export async function setGroupPosition(group: StopGroup, position: string): Promise<void> {
  const { error } = await supabase
    .from('experiences')
    .update({ trip_position: position })
    .in('id', group.rows.map((r) => r.id));
  if (error) throw error;
}

export async function setTripPosition(itemId: string, position: string): Promise<void> {
  const { error } = await supabase
    .from('experiences')
    .update({ trip_position: position })
    .eq('id', itemId);
  if (error) throw error;
}

// "I did this too" — get the row THIS user will rank for a shared stop, and
// return its id for the normal graduate flow (AddExperience prefilled → rank).
//
// This is the heart of collaborative ranking: we never flip a trip mate's row to
// ranked, because their sentiment and rank_key are theirs. Instead you get your
// own planned row in the same group, and rank it into your own list. If you
// already have a row here (you added the stop, or ranked it before), that one is
// reused.
export async function claimStopForRanking(
  group: StopGroup, myUserId: string,
): Promise<string> {
  if (group.mine) return group.mine.id;

  const source = group.lead;
  const locs = source.locations?.length
    ? source.locations
    : source.location ? [source.location] : [];

  const { data, error } = await supabase
    .from('experiences')
    .insert({
      user_id: myUserId,
      status: 'planned',
      trip_id: source.trip_id,
      // Same group = same outing. This is what keeps the itinerary showing one
      // line, and what will let the feed show one card for several people.
      group_id: source.group_id ?? newGroupId(),
      title: experienceTitle(source),
      locations: locs,
      location: locs[0] ?? null,
      note: source.note,
      trip_position: group.position,
      experience_date: source.experience_date,
    })
    .select('id')
    .single();
  if (error || !data) throw error ?? new Error('Could not add this stop to your list.');
  return data.id;
}

// Backfill a group_id onto a stop that predates grouping, so trip mates can join
// it. Only the row's owner can do this (RLS + the column guard trigger).
export async function ensureStopGroupId(item: Experience): Promise<string> {
  if (item.group_id) return item.group_id;
  const groupId = newGroupId();
  const { error } = await supabase
    .from('experiences')
    .update({ group_id: groupId })
    .eq('id', item.id);
  if (error) throw error;
  return groupId;
}

// Copy another user's stop into one of your own trips as a fresh planned stop
// (place + note only — the original's ranking/quick take are left behind). Lands
// at the end of the target trip's itinerary.
export async function copyStopToTrip(item: Experience, tripId: string): Promise<void> {
  haptics.lightTap();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in');
  const { data: rows } = await supabase
    .from('experiences').select('trip_position, rank_key').eq('trip_id', tripId);
  const ps = (rows ?? [])
    .map((r) => r.trip_position ?? r.rank_key)
    .filter((p): p is string => !!p)
    .sort();
  const position = ps.length ? keyAfter(ps[ps.length - 1]) : initialRankKey();
  const locs = item.locations?.length ? item.locations : (item.location ? [item.location] : []);
  const { error } = await supabase.from('experiences').insert({
    user_id: user.id,
    status: 'planned',
    trip_id: tripId,
    title: item.title ?? locs[0]?.name ?? 'Stop',
    locations: locs,
    location: locs[0] ?? null,
    note: item.note,
    trip_position: position,
  });
  if (error) throw error;
}

// "Follow this trip": duplicate someone else's whole itinerary into a NEW trip you
// own. Every stop lands as `planned` (place, title, note kept; the owner's rankings,
// quick takes, photos and dates stay behind). Returns the new trip's id.
export async function forkTrip(source: Trip, items: Experience[]): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in');

  const { data: t, error } = await supabase
    .from('trips')
    .insert({
      user_id: user.id,
      title: source.title,
      destination: source.destination,
      cover_photo: source.cover_photo,
    })
    .select('id')
    .single();
  if (error || !t) throw error ?? new Error('Could not copy trip.');

  let pos = initialRankKey();
  const rows = items.map((item) => {
    const locs = item.locations?.length ? item.locations : (item.location ? [item.location] : []);
    const row = {
      user_id: user.id,
      status: 'planned',
      trip_id: t.id,
      title: experienceTitle(item),
      locations: locs,
      location: locs[0] ?? null,
      note: item.note,
      trip_position: pos,
    };
    pos = keyAfter(pos);
    return row;
  });
  if (rows.length > 0) {
    const { error: stopsError } = await supabase.from('experiences').insert(rows);
    if (stopsError) throw stopsError;
  }
  return t.id;
}
