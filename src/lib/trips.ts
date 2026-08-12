import { supabase } from '@/lib/supabase';
import { Trip, Experience, Location, TripMember, RankedExperience } from '@/types';
import { primaryLocation, localityLabel, experienceTitle } from '@/lib/experienceDisplay';
import { keyAfter, keyBefore, keyBetween, initialRankKey } from '@/lib/ranking';
import { daysBetween, formatDay } from '@/lib/dates';
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

// --- Itinerary sections ---
//
// A stop used to be N experience rows (one per person, merged for display). Now
// it's ONE shared post carrying everyone's rankings, so the itinerary is a plain
// list again — no grouping layer.

export type CitySection = { city: string; items: RankedExperience[] };

// Group stops into city sections. Input is assumed already ordered, so a city's
// order = where its first stop falls (your "ordered by which city came first"
// rule), and stops keep their within-city order.
export function groupByCity(stops: RankedExperience[]): CitySection[] {
  const sections: CitySection[] = [];
  const indexByCity: Record<string, number> = {};
  for (const stop of stops) {
    const city = primaryLocation(stop)?.city || localityLabel(stop) || 'Other';
    if (indexByCity[city] === undefined) {
      indexByCity[city] = sections.length;
      sections.push({ city, items: [] });
    }
    sections[indexByCity[city]].items.push(stop);
  }
  return sections;
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

// Add an unranked planned stop to a trip from a picked place. One stop, one row —
// everyone on the trip ranks this same post when they've done it.
export async function addPlannedStop(args: {
  tripId: string; location: Location; note: string | null; position: string;
  // When the stop is planned for ('YYYY-MM-DD'); the UI defaults it to today.
  date: string;
}): Promise<void> {
  const userId = await getMyUserId();
  if (!userId) throw new Error('Not signed in');
  const { error } = await supabase.from('experiences').insert({
    created_by: userId,
    status: 'planned',
    trip_id: args.tripId,
    title: args.location.name,
    locations: [args.location],
    location: args.location,
    note: args.note,
    trip_position: args.position,
    experience_date: args.date,
  });
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

// Copy another user's stop into one of your own trips as a fresh planned stop
// (place + note only — the original's ranking/quick take are left behind). Lands
// at the end of the target trip's itinerary.
export async function copyStopToTrip(item: Experience, tripId: string): Promise<void> {
  haptics.lightTap();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in');
  const { data: rows } = await supabase
    .from('experiences').select('trip_position').eq('trip_id', tripId);
  const ps = (rows ?? [])
    .map((r) => r.trip_position)
    .filter((p): p is string => !!p)
    .sort();
  const position = ps.length ? keyAfter(ps[ps.length - 1]) : initialRankKey();
  const locs = item.locations?.length ? item.locations : (item.location ? [item.location] : []);
  const { error } = await supabase.from('experiences').insert({
    created_by: user.id,
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
      created_by: user.id,
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
