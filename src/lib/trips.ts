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
