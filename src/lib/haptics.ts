import * as Haptics from 'expo-haptics';

// Semantic haptics wrapper. Named by *intent* (not by the underlying generator) so
// call sites read as UX and a later swap to Core Haptics (custom .ahap patterns) is a
// one-file change — screens/components never touch the platform API directly, per the
// repo's data-layer convention. See docs/spikes/haptics.md and issue #68.
//
// All calls are fire-and-forget: they return a promise but callers don't await, and
// expo-haptics no-ops silently on the Simulator, in Low Power Mode, or when the Taptic
// Engine is otherwise unavailable — so they're always safe to call unconditionally.
export const haptics = {
  // The binary comparison pick ("which did you enjoy more?") — Zoi's signature moment.
  compareTap: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium),
  // Selection ticks: sentiment pick + any segmented control change.
  select: () => Haptics.selectionAsync(),
  // A rank is locked in / an experience is saved.
  success: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
  // A user-facing error: wrong OTP, handle taken.
  error: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error),
  // Light confirmation for social taps: save/unsave, follow/unfollow, copy stop.
  lightTap: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light),
};
