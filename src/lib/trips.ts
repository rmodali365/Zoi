import { supabase } from '@/lib/supabase';
import { Trip, Experience, Location, StopKind, StopDetails } from '@/types';
import { primaryLocation, localityLabel } from '@/lib/experienceDisplay';
import { cityKey, resolveTripCity } from '@/lib/cities';
import { keyAfter, keyBefore, keyBetween, initialRankKey } from '@/lib/ranking';
import { daysBetween, formatDay, todayString } from '@/lib/dates';
import { haptics } from '@/lib/haptics';

export type TripDetail = { trip: Trip | null; items: Experience[] };

// A trip plus its itinerary items (planned + ranked), ordered by trip_position.
// Rows with a null trip_position (logged before itinerary ordering existed) sort
// last, then by creation time.
export async function getTripDetail(tripId: string): Promise<TripDetail> {
  const [{ data: t }, { data: exps }] = await Promise.all([
    supabase.from('trips').select('*').eq('id', tripId).maybeSingle(),
    supabase
      .from('experiences')
      .select('*')
      .eq('trip_id', tripId)
      .order('trip_position', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true }),
  ]);
  return { trip: (t as Trip) ?? null, items: (exps ?? []) as Experience[] };
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

// `key` is the stable grouping key (a resolved city_key, or 'other' when a stop
// has no usable city); `city` is the nicest display label seen for that key.
export type CitySection = { key: string; city: string; items: Experience[] };

// Group itinerary items into city sections keyed by the stored `city_key` (Part 2
// of #72), falling back to a key derived from the location for legacy/unresolved
// rows. Input is assumed already ordered by trip_position, so a section's order =
// where its first stop falls, and items keep their within-city order. The
// unresolved "Other" bucket is sorted last.
export function groupByCity(items: Experience[]): CitySection[] {
  const sections: CitySection[] = [];
  const indexByKey: Record<string, number> = {};
  for (const item of items) {
    const loc = primaryLocation(item);
    const key = item.city_key || cityKey(loc) || 'other';
    const label = loc?.city || localityLabel(item) || 'Other';
    let idx = indexByKey[key];
    if (idx === undefined) {
      idx = sections.length;
      indexByKey[key] = idx;
      sections.push({ key, city: label, items: [] });
    } else if (sections[idx].city === 'Other' && label !== 'Other') {
      // Prefer the nicest (non-"Other") label seen for this key.
      sections[idx].city = label;
    }
    sections[idx].items.push(item);
  }
  // Keep trip_position order, but push the unresolved bucket to the end (stable).
  return sections.sort((a, b) => (a.key === 'other' ? 1 : 0) - (b.key === 'other' ? 1 : 0));
}

export type DaySection = { key: string; label: string; items: Experience[] };

// Group itinerary items by their experience_date — "Day N · Jun 3" relative to the
// trip's start date (dates before the start, or when there's no start, fall back to
// the bare date label). Days ascend; within a day items keep itinerary order.
export function groupByDay(items: Experience[], startDate: string | null): DaySection[] {
  const byDate = [...items].sort((a, b) =>
    a.experience_date < b.experience_date ? -1
    : a.experience_date > b.experience_date ? 1
    : posOf(a) < posOf(b) ? -1 : 1);

  const sections: DaySection[] = [];
  const indexByKey: Record<string, number> = {};
  for (const item of byDate) {
    const date = item.experience_date;
    const dayNum = startDate ? daysBetween(startDate, date) + 1 : 0;
    const label = dayNum >= 1 ? `Day ${dayNum} · ${formatDay(date)}` : formatDay(date);
    if (indexByKey[date] === undefined) {
      indexByKey[date] = sections.length;
      sections.push({ key: date, label, items: [] });
    }
    sections[indexByKey[date]].items.push(item);
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

// trip_position to move `items[idx]` one slot earlier within its (already-ordered) list.
export function positionToMoveUp(items: Experience[], idx: number): string | null {
  if (idx <= 0) return null;
  const before = idx - 2 >= 0 ? posOf(items[idx - 2]) : null;
  const after = posOf(items[idx - 1]);
  return before ? keyBetween(before, after) : keyBefore(after);
}

// trip_position to move `items[idx]` one slot later within its (already-ordered) list.
export function positionToMoveDown(items: Experience[], idx: number): string | null {
  if (idx >= items.length - 1) return null;
  const before = posOf(items[idx + 1]);
  const after = idx + 2 <= items.length - 1 ? posOf(items[idx + 2]) : null;
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
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in');

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
    user_id: user.id,
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

// Remove an item from a trip. Planned stops are deleted outright; ranked
// experiences stay in My List but are detached from the trip.
export async function removeTripItem(item: Experience): Promise<void> {
  if (item.status === 'planned') {
    const { error } = await supabase.from('experiences').delete().eq('id', item.id);
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from('experiences')
      .update({ trip_id: null, trip_position: null })
      .eq('id', item.id);
    if (error) throw error;
  }
}

export async function setTripPosition(itemId: string, position: string): Promise<void> {
  const { error } = await supabase
    .from('experiences')
    .update({ trip_position: position })
    .eq('id', itemId);
  if (error) throw error;
}
