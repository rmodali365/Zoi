import { Location, Sentiment } from '@/types';
import { SENTIMENT_EMOJI, SENTIMENT_LABELS } from '@/constants/experiences';

// Sentiment emoji/label, tolerant of planned stops (null sentiment → empty string).
export function sentimentEmoji(sentiment: Sentiment | null | undefined): string {
  return sentiment ? SENTIMENT_EMOJI[sentiment] : '';
}

export function sentimentLabel(sentiment: Sentiment | null | undefined): string {
  return sentiment ? SENTIMENT_LABELS[sentiment] : '';
}

// Tolerant shape: works for Experience / FeedItem / SavedExperience and legacy rows
// that only have the single `location`.
type Loccable = { title?: string | null; location?: Location | null; locations?: Location[] | null };

// Normalize to a non-empty locations array, falling back to the legacy single location.
export function experienceLocations(e: Loccable): Location[] {
  if (e.locations && e.locations.length > 0) return e.locations;
  return e.location ? [e.location] : [];
}

export function primaryLocation(e: Loccable): Location | null {
  return experienceLocations(e)[0] ?? null;
}

// The display headline: the user-given title, falling back to the first place name.
export function experienceTitle(e: Loccable): string {
  if (e.title && e.title.trim()) return e.title;
  return primaryLocation(e)?.name ?? 'Experience';
}

// City/region line. If all locations share a city, show it; if they span cities,
// show "Multiple locations". Single-location behaves exactly as before.
export function localityLabel(e: Loccable): string {
  const locs = experienceLocations(e);
  if (locs.length === 0) return '';
  const cities = [...new Set(locs.map((l) => l.city).filter(Boolean))];
  if (locs.length > 1 && cities.length !== 1) return 'Multiple locations';
  const p = locs[0];
  return [p.city, p.region].filter(Boolean).join(', ');
}
