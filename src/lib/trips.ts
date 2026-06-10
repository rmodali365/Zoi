import { supabase } from '@/lib/supabase';
import { Trip, Experience } from '@/types';
import { primaryLocation, localityLabel } from '@/lib/experienceDisplay';

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
