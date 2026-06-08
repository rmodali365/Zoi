import { Sentiment, Tag } from '@/types';

// Sentiment tiers — ranking is scoped within a tier, and the tier
// determines which slice of the 0–10 score range an experience can land in.
export const SENTIMENTS: Sentiment[] = ['loved', 'liked', 'fine'];

export const SENTIMENT_LABELS: Record<Sentiment, string> = {
  loved: 'Loved it',
  liked: 'Liked it',
  fine: 'It was fine',
};

export const SENTIMENT_EMOJI: Record<Sentiment, string> = {
  loved: '😍',
  liked: '🙂',
  fine: '😐',
};

// Score range each tier maps onto (inclusive). Position within the tier's
// ranked list determines where in this range the experience lands.
export const SENTIMENT_RANGE: Record<Sentiment, { min: number; max: number }> = {
  loved: { min: 8.5, max: 10.0 },
  liked: { min: 6.0, max: 8.4 },
  fine: { min: 0.0, max: 5.9 },
};

/**
 * Derive a 0–10 score from an experience's position within its sentiment tier.
 * Rank 0 = top of the tier (best), so it maps to the high end of the range.
 *
 * @param rankIndex  0-based position in the tier's ranked list (0 = best)
 * @param tierCount  total number of experiences in that tier
 */
export function scoreFromRank(sentiment: Sentiment, rankIndex: number, tierCount: number): number {
  const { min, max } = SENTIMENT_RANGE[sentiment];
  if (tierCount <= 1) return max;
  // Top of list (rankIndex 0) → max; bottom → min
  const t = rankIndex / (tierCount - 1);
  const score = max - t * (max - min);
  return Math.round(score * 10) / 10;
}

// Flat tag list — metadata for filtering experiences (not ranking scope).
export const TAGS: Tag[] = [
  'outdoors', 'drinks', 'culture', 'nightlife', 'active', 'chill', 'food-adjacent',
  'wine', 'beach', 'ski', 'food-focused', 'scenic-drive',
  'city', 'nature', 'party', 'romantic', 'adventure',
  'international', 'domestic', 'relaxation',
];

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
