import { supabase } from '@/lib/supabase';
import {
  Trip, Experience, Location, TripMember, RankedExperience, StopKind, StopDetails,
} from '@/types';
import { primaryLocation, localityLabel } from '@/lib/experienceDisplay';
import { cityKey, resolveTripCity } from '@/lib/cities';
import { keyAfter, keyBefore, keyBetween, initialRankKey } from '@/lib/ranking';
import { daysBetween, formatDay, todayString } from '@/lib/dates';
import { haptics } from '@/lib/haptics';
import { getTripMembers } from '@/lib/tripMembers';
import { getMyUserId } from '@/lib/auth';
import { EXPERIENCE_WITH_RANKINGS, withMine } from '@/lib/rankings';

export type TripDetail = {
  trip: Trip | null;
  // Itinerary stops. Each is ONE shared post carrying every participant's
  // ranking — `mine` is the viewer's, when they've ranked it.
  items: RankedExperience[];
  members: TripMember[];
  // The viewing user, so the screen can resolve permissions without a second query.
  myUserId: string | null;
};

// A trip plus its itinerary items (planned + ranked), ordered by trip_position.
// Rows with a null trip_position (logged before itinerary ordering existed) sort
// last, then by creation time.
//
// Each stop is ONE shared post carrying every participant's ranking, so the
// itinerary can show who's done what without any grouping layer.
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
      .select(EXPERIENCE_WITH_RANKINGS)
      .eq('trip_id', tripId)
      .order('trip_position', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true }),
    getTripMembers(tripId),
    getMyUserId(),
  ]);
  return {
    trip: (t as Trip) ?? null,
    items: ((exps ?? []) as unknown as Experience[]).map((e) => withMine(e, myUserId)),
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
  destination_location: Location | null;
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
  fields: Partial<Pick<Trip, 'title' | 'destination' | 'destination_location' | 'start_date' | 'end_date' | 'cover_photo'>>,
): Promise<void> {
  const { error } = await supabase.from('trips').update(fields).eq('id', tripId);
  if (error) throw error;
}

// --- Itinerary sections ---
//
// A stop used to be N experience rows (one per person, merged for display). Now
// it's ONE shared post carrying everyone's rankings, so a section's items are
// plain RankedExperiences.
//
// `key` is the stable grouping key (a resolved city_key, or 'other' when a stop
// has no usable city); `city` is the nicest display label seen for that key.
// Generic over the stop shape so the add-stop path can resolve sections from bare
// `Experience` rows, while every render surface gets `RankedExperience` back.
export type CitySection<T extends Experience = RankedExperience> = {
  key: string; city: string; items: T[];
};

// Group itinerary stops into city sections keyed by the stored `city_key` (Part 2
// of #72), falling back to a key derived from the location for legacy/unresolved
// rows. Input is assumed already ordered by trip_position, so a section's order =
// where its first stop falls, and stops keep their within-city order. The
// unresolved "Other" bucket is sorted last.
export function groupByCity<T extends Experience>(stops: T[]): CitySection<T>[] {
  const sections: CitySection<T>[] = [];
  const indexByKey: Record<string, number> = {};
  for (const stop of stops) {
    const loc = primaryLocation(stop);
    const key = stop.city_key || cityKey(loc) || 'other';
    const label = loc?.city || localityLabel(stop) || 'Other';
    let idx = indexByKey[key];
    if (idx === undefined) {
      idx = sections.length;
      indexByKey[key] = idx;
      sections.push({ key, city: label, items: [] });
    } else if (sections[idx].city === 'Other' && label !== 'Other') {
      // Prefer the nicest (non-"Other") label seen for this key.
      sections[idx].city = label;
    }
    sections[idx].items.push(stop);
  }
  // Keep trip_position order, but push the unresolved bucket to the end (stable).
  return sections.sort((a, b) => (a.key === 'other' ? 1 : 0) - (b.key === 'other' ? 1 : 0));
}

export type DaySection = { key: string; label: string; items: RankedExperience[] };

// Group stops by their experience_date — "Day N · Jun 3" relative to the trip's
// start date (dates before the start, or when there's no start, fall back to the
// bare date label). Days ascend; within a day stops keep itinerary order.
export function groupByDay(stops: RankedExperience[], startDate: string | null): DaySection[] {
  const byDate = [...stops].sort((a, b) =>
    a.experience_date < b.experience_date ? -1
    : a.experience_date > b.experience_date ? 1
    : posOf(a) < posOf(b) ? -1 : 1);

  const sections: DaySection[] = [];
  const indexByKey: Record<string, number> = {};
  for (const stop of byDate) {
    const date = stop.experience_date;
    const dayNum = startDate ? daysBetween(startDate, date) + 1 : 0;
    const label = dayNum >= 1 ? `Day ${dayNum} · ${formatDay(date)}` : formatDay(date);
    if (indexByKey[date] === undefined) {
      indexByKey[date] = sections.length;
      sections.push({ key: date, label, items: [] });
    }
    sections[indexByKey[date]].items.push(stop);
  }
  return sections;
}

// --- Itinerary ordering (fractional index over trip_position) ---

// An item's effective itinerary position. Rows from before trip_position existed
// sort last rather than falling back to rank_key, which lives on rankings now.
export function posOf(item: Experience): string {
  return item.trip_position ?? initialRankKey();
}

// A trip_position that appends to the very end of the itinerary. A new stop sorts
// last overall, which means it lands at the end of its own city section.
export function nextTripPosition(items: Experience[]): string {
  const ps = items.map(posOf).sort();
  return ps.length ? keyAfter(ps[ps.length - 1]) : initialRankKey();
}

// trip_position to move `stops[idx]` one slot earlier within its (already-ordered) list.
export function positionToMoveUp(stops: Experience[], idx: number): string | null {
  if (idx <= 0) return null;
  const before = idx - 2 >= 0 ? posOf(stops[idx - 2]) : null;
  const after = posOf(stops[idx - 1]);
  return before ? keyBetween(before, after) : keyBefore(after);
}

// trip_position to move `stops[idx]` one slot later within its (already-ordered) list.
export function positionToMoveDown(stops: Experience[], idx: number): string | null {
  if (idx >= stops.length - 1) return null;
  const before = posOf(stops[idx + 1]);
  const after = idx + 2 <= stops.length - 1 ? posOf(stops[idx + 2]) : null;
  return after ? keyBetween(before, after) : keyAfter(before);
}

// --- Mutations ---

// Add an unranked planned stop to a trip from a picked place — the single path
// for adding any stop by hand OR from the Wishlist (Part 3 of #72 replaced the
// old row-copy with this). Resolves the stop's city section against the trip's
// existing sections so a hotel lands under the city heading that's already there;
// pass `cityKey` to override (a caller that already resolved it, or "move to
// section"). Appends to the end of the itinerary.
export async function addStopFromPlace(args: {
  tripId: string;
  location: Location;
  kind?: StopKind;
  details?: StopDetails;
  note?: string | null;
  // When the stop is planned for ('YYYY-MM-DD'); defaults to today.
  date?: string;
  // Explicit section key. `undefined` = resolve internally; a string/null overrides.
  cityKey?: string | null;
}): Promise<void> {
  haptics.lightTap();
  const userId = await getMyUserId();
  if (!userId) throw new Error('Not signed in');

  const [{ data: trip }, { data: rows }] = await Promise.all([
    supabase.from('trips').select('destination_location').eq('id', args.tripId).maybeSingle(),
    supabase.from('experiences').select('*').eq('trip_id', args.tripId),
  ]);
  const items = (rows ?? []) as Experience[];
  const resolvedKey =
    args.cityKey !== undefined
      ? args.cityKey
      : resolveTripCity(args.location, groupByCity(items), (trip as Pick<Trip, 'destination_location'>) ?? null);

  const { error } = await supabase.from('experiences').insert({
    created_by: userId,
    status: 'planned',
    kind: args.kind ?? 'experience',
    details: args.details ?? {},
    trip_id: args.tripId,
    title: args.location.name,
    locations: [args.location],
    location: args.location,
    note: args.note ?? null,
    trip_position: nextTripPosition(items),
    city_key: resolvedKey,
    experience_date: args.date ?? todayString(),
  });
  if (error) throw error;
}

// Reassign a stop to a section by hand ("Move to section"). Writes city_key
// directly so a manual correction sticks across refetches.
export async function setStopCity(itemId: string, cityKey: string | null): Promise<void> {
  const { error } = await supabase
    .from('experiences')
    .update({ city_key: cityKey })
    .eq('id', itemId);
  if (error) throw error;
}

// Remove a stop from the itinerary.
//   * Nobody has ranked it -> it's shared scratch work; any trip member deletes it.
//   * Someone has -> it's a real experience. It leaves the itinerary but stays in
//     the lists of everyone who ranked it, because their rankings are untouched.
export async function removeTripStop(stop: RankedExperience): Promise<void> {
  if (stop.rankings.length === 0) {
    const { error } = await supabase.from('experiences').delete().eq('id', stop.id);
    if (error) throw error;
    return;
  }
  const { error } = await supabase
    .from('experiences')
    .update({ trip_id: null, trip_position: null })
    .eq('id', stop.id);
  if (error) throw error;
}

// What `removeTripStop` will actually do, for the confirm dialog.
export function removalSummary(stop: RankedExperience, myUserId: string | null): string {
  const others = stop.rankings.filter((r) => r.user_id !== myUserId);
  if (stop.rankings.length === 0) {
    return 'This planned stop will be deleted for everyone on the trip.';
  }
  if (others.length > 0) {
    const who = others[0].user?.name ?? 'someone';
    const rest = others.length > 1 ? ` and ${others.length - 1} more` : '';
    return `It leaves the itinerary but stays in your list${who ? ` — and in ${who}${rest}'s` : ''}.`;
  }
  return 'The experience stays in your list — it just leaves this trip.';
}

export async function setTripPosition(itemId: string, position: string): Promise<void> {
  const { error } = await supabase
    .from('experiences')
    .update({ trip_position: position })
    .eq('id', itemId);
  if (error) throw error;
}
