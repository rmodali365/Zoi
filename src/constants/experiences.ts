import { Sentiment, Tag } from '@/types';

// There is ONE overall ranked list per user. Sentiment is just the coarse starting
// placement — it seeds which third of the list a new experience drops into, then binary
// comparison refines the exact position. loved=top, liked=middle, fine=lower third.
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

/**
 * Initial insert window [lo, hi] (index bounds) into the existing ranked list of size n,
 * based on the chosen sentiment. The new item is placed within this window by binary
 * comparison. loved → top third, liked → middle third, fine → lower third.
 */
export function thirdBounds(sentiment: Sentiment, n: number): [number, number] {
  const t1 = Math.round(n / 3);
  const t2 = Math.round((2 * n) / 3);
  switch (sentiment) {
    case 'loved': return [0, t1];
    case 'liked': return [t1, t2];
    case 'fine': return [t2, n];
  }
}

/**
 * Derive a 0–10 score from an experience's position in the OVERALL ranked list.
 * Top of the list (index 0) = 10.0, bottom = 0.0.
 *
 * @param index  0-based position in the full ranked list (0 = best)
 * @param total  total number of experiences in the list
 */
export function scoreFromOverallRank(index: number, total: number): number {
  if (total <= 1) return 10.0;
  const score = 10 - (index / (total - 1)) * 10;
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
