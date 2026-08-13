// Centralized React Query keys so reads and invalidations can't drift apart.
export const qk = {
  feed: ['feed'] as const,
  savedIds: ['saved-ids'] as const,
  saves: ['saves'] as const,
  myExperiences: ['experiences', 'me'] as const,
  myTrips: ['trips', 'me'] as const,
  myProfile: ['profile', 'me'] as const,
  trip: (id: string) => ['trip', id] as const,
  tripMembers: (id: string) => ['trip-members', id] as const,
  tripInvites: ['trip-invites'] as const,
  experienceInvites: ['experience-invites'] as const,
  experience: (id: string) => ['experience', id] as const,
  notifications: ['notifications'] as const,
  notificationsUnread: ['notifications', 'unread'] as const,
  saveCounts: (ids: string[]) => ['save-counts', ids] as const,
};
