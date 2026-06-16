import { supabase } from '@/lib/supabase';
import { Trip, Experience, Location } from '@/types';
import { primaryLocation, localityLabel } from '@/lib/experienceDisplay';
import { keyAfter, keyBefore, keyBetween, initialRankKey } from '@/lib/ranking';

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

export type CitySection = { city: string; items: Experience[] };

// Group itinerary items into city sections. Input is assumed already ordered by
// trip_position, so a city's order = where its first stop falls (your "ordered by
// which city came first" rule), and items keep their within-city order.
export function groupByCity(items: Experience[]): CitySection[] {
  const sections: CitySection[] = [];
  const indexByCity: Record<string, number> = {};
  for (const item of items) {
    const city = primaryLocation(item)?.city || localityLabel(item) || 'Other';
    if (indexByCity[city] === undefined) {
      indexByCity[city] = sections.length;
      sections.push({ city, items: [] });
    }
    sections[indexByCity[city]].items.push(item);
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

// Add an unranked planned stop to a trip from a picked place.
export async function addPlannedStop(args: {
  tripId: string; location: Location; note: string | null; position: string;
}): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in');
  const { error } = await supabase.from('experiences').insert({
    user_id: user.id,
    status: 'planned',
    trip_id: args.tripId,
    title: args.location.name,
    locations: [args.location],
    location: args.location,
    note: args.note,
    trip_position: args.position,
  });
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

// Copy another user's stop into one of your own trips as a fresh planned stop
// (place + note only — the original's ranking/quick take are left behind). Lands
// at the end of the target trip's itinerary.
export async function copyStopToTrip(item: Experience, tripId: string): Promise<void> {
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
