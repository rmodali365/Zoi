import { Experience, Location, Trip } from '@/types';
import { primaryLocation } from '@/lib/experienceDisplay';

// City grouping is decided by Google Place data only — never a stop's title. This
// module turns a picked place's coordinates + address components into a canonical
// section key, and snaps a newly added stop onto a trip's existing sections so a
// Brooklyn hotel lands under the "New York" heading instead of forking a new one.

// A stop within this many km of an existing section's centroid (or the trip's
// destination) joins that section. Comfortably covers a metro without merging
// genuinely distinct cities on a road trip.
const SNAP_KM = 25;

type Coord = { lat: number; lng: number };

// A section as far as resolution cares: its key + the stops it holds (for centroid).
export type ResolvableSection = { key: string; items: Experience[] };

// Lowercased, diacritics + punctuation stripped, a trailing "city" dropped
// ("New York City" -> "newyork"). Empty string for blank input.
function slug(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .replace(/city$/, '');
}

// Canonical grouping key `city|region|country` for a location, or null when Google
// returned no usable city component (national park, some rural/airport addresses).
// Prefers the key the Edge Function already computed so stored keys and re-derived
// ones can't drift; falls back to computing it for legacy locations.
export function cityKey(loc: Location | null | undefined): string | null {
  if (!loc) return null;
  if (loc.city_key) return loc.city_key;
  const city = loc.city ? slug(loc.city) : '';
  if (!city) return null;
  const region = loc.region ? slug(loc.region) : '';
  const country = loc.country ? slug(loc.country) : '';
  return [city, region, country].filter(Boolean).join('|');
}

function coordOf(loc: Location | null | undefined): Coord | null {
  if (!loc) return null;
  const { lat, lng } = loc;
  if (
    typeof lat !== 'number' || typeof lng !== 'number' ||
    !Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)
  ) return null;
  return { lat, lng };
}

// Great-circle distance in km between two coordinates.
export function haversineKm(a: Coord, b: Coord): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Mean lat/lng of a section's pinnable stops, or null if none have coordinates.
export function sectionCentroid(items: Experience[]): Coord | null {
  const coords = items.map((i) => coordOf(primaryLocation(i))).filter((c): c is Coord => !!c);
  if (coords.length === 0) return null;
  const lat = coords.reduce((s, c) => s + c.lat, 0) / coords.length;
  const lng = coords.reduce((s, c) => s + c.lng, 0) / coords.length;
  return { lat, lng };
}

// Decide which section a newly picked place belongs to, as a city_key (or null →
// "Other"). Pure geometry + address components, no text matching:
//   1. exact city_key match on an existing section -> join it
//   2. within ~25km of an existing section's centroid -> join it
//   3. within ~25km of the trip's destination -> use the destination's city_key
//   4. otherwise start a new section from the resolved city (null if none)
export function resolveTripCity(
  location: Location,
  sections: ResolvableSection[],
  trip: Pick<Trip, 'destination_location'> | null,
): string | null {
  const key = cityKey(location);

  if (key) {
    const exact = sections.find((s) => s.key === key);
    if (exact) return exact.key;
  }

  const coord = coordOf(location);
  if (coord) {
    for (const s of sections) {
      const c = sectionCentroid(s.items);
      if (c && haversineKm(coord, c) <= SNAP_KM) return s.key;
    }
    const dest = trip?.destination_location ?? null;
    const destCoord = coordOf(dest);
    if (destCoord && haversineKm(coord, destCoord) <= SNAP_KM) {
      return cityKey(dest) ?? key;
    }
  }

  return key;
}
