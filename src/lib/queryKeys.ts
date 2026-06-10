// Centralized React Query keys so reads and invalidations can't drift apart.
export const qk = {
  feed: ['feed'] as const,
  savedIds: ['saved-ids'] as const,
  saves: ['saves'] as const,
  myExperiences: ['experiences', 'me'] as const,
  myTrips: ['trips', 'me'] as const,
  myProfile: ['profile', 'me'] as const,
  trip: (id: string) => ['trip', id] as const,
};
