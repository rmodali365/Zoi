import { Bucket, Tag } from '@/types';

export const BUCKET_LABELS: Record<Bucket, string> = {
  single: 'Single Experience',
  day_trip: 'Day Trip',
  weekend: 'Weekend Trip',
  trip: 'Trip',
};

export const BUCKET_DESCRIPTIONS: Record<Bucket, string> = {
  single: 'One activity, a few hours or less',
  day_trip: 'Out and back in one day',
  weekend: '1–3 nights away',
  trip: '4+ nights, real travel',
};

export const BUCKET_TAGS: Record<Bucket, Tag[]> = {
  single: ['outdoors', 'drinks', 'culture', 'nightlife', 'active', 'chill', 'food-adjacent'],
  day_trip: ['wine', 'beach', 'outdoors', 'ski', 'food-focused', 'scenic-drive'],
  weekend: ['ski', 'beach', 'city', 'nature', 'party', 'romantic', 'adventure'],
  trip: ['international', 'domestic', 'adventure', 'relaxation', 'culture', 'food-focused'],
};

export const TAG_LABELS: Record<Tag, string> = {
  outdoors: 'Outdoors',
  drinks: 'Drinks',
  culture: 'Culture',
  nightlife: 'Nightlife',
  active: 'Active',
  chill: 'Chill',
  'food-adjacent': 'Food',
  wine: 'Wine',
  beach: 'Beach',
  ski: 'Ski',
  'food-focused': 'Food',
  'scenic-drive': 'Scenic Drive',
  city: 'City',
  nature: 'Nature',
  party: 'Party',
  romantic: 'Romantic',
  adventure: 'Adventure',
  international: 'International',
  domestic: 'Domestic',
  relaxation: 'Relaxation',
};

// Auto-sort bucket rules (simple rules engine per spec §3.5)
export function suggestBucket(params: {
  overnights: number;
  durationHours: number;
  distanceKm: number;
}): Bucket {
  const { overnights, durationHours, distanceKm } = params;

  if (overnights >= 4) return 'trip';
  if (overnights >= 1) return 'weekend';
  if (durationHours > 8 || distanceKm > 80) return 'day_trip';
  return 'single';
}
