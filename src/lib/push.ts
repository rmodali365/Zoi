import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { supabase } from '@/lib/supabase';

// NB: deliberately does NOT import from lib/auth — auth's signOut() has to call
// unregisterPush() before dropping the session, and importing back the other way
// would make a cycle. The one thing needed from auth (the current user id) is
// read straight off the client instead.

// Push notifications (#74). The server half is the `notifications_push` DB
// trigger -> `push` Edge Function; this side only manages the device token and
// what happens when a notification is tapped.
//
// REQUIRES A DEV OR PRODUCTION BUILD. Remote push doesn't work in Expo Go, and
// tokens can't be issued on the Simulator — every function here no-ops on a
// non-device so the app still runs there.

// Show a banner even when the app is foregrounded. Without this the OS hands the
// notification straight to the handler and the user sees nothing while in-app.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

// The tap payload the `push` Edge Function attaches (see deepLinkData there).
export type PushTarget = {
  screen?: 'TripDetail' | 'ExperienceDetail' | 'UserProfile';
  tripId?: string;
  experienceId?: string;
  userId?: string;
  notificationId?: string;
};

function projectId(): string | undefined {
  return (
    Constants.expoConfig?.extra?.eas?.projectId
    ?? (Constants as { easConfig?: { projectId?: string } }).easConfig?.projectId
  );
}

// Ask for permission and register this device against the signed-in user.
// Safe to call on every launch: the token is stable per install, so this is an
// upsert, and re-registering after a reinstall moves the row to the new token.
//
// Returns the token when registration succeeded, or null with a reason — the
// caller can stay quiet (a declined permission is a valid answer, not an error).
export async function registerForPush(): Promise<string | null> {
  if (!Device.isDevice) return null; // Simulator can't receive remote pushes

  const existing = await Notifications.getPermissionsAsync();
  let granted = existing.granted;
  if (!granted && existing.canAskAgain) {
    const asked = await Notifications.requestPermissionsAsync();
    granted = asked.granted;
  }
  if (!granted) return null;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const userId = user.id;

  const id = projectId();
  if (!id) return null; // no EAS project configured — nothing to register against

  const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId: id });
  if (!token) return null;

  const { error } = await supabase.from('device_tokens').upsert(
    {
      token,
      user_id: userId,
      platform: Platform.OS === 'ios' ? 'ios' : 'android',
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'token' },
  );
  if (error) throw error;
  return token;
}

// Drop this device's token on sign-out, so the next person to use the phone
// doesn't receive the previous account's notifications.
export async function unregisterPush(): Promise<void> {
  if (!Device.isDevice) return;
  const id = projectId();
  if (!id) return;
  try {
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId: id });
    if (!token) return;
    await supabase.from('device_tokens').delete().eq('token', token);
  } catch {
    // Token lookup can fail offline or without permission — signing out must
    // never be blocked by it.
  }
}

// Keep the app icon badge in step with the unread count the Activity bell shows.
export async function setBadgeCount(count: number): Promise<void> {
  try {
    await Notifications.setBadgeCountAsync(count);
  } catch {
    // Unsupported on some platforms/emulators; not worth surfacing.
  }
}

// Subscribe to notification taps. Returns an unsubscribe function.
// Fires for both a tap while running and a cold start from a notification.
export function onPushTapped(handler: (target: PushTarget) => void): () => void {
  const sub = Notifications.addNotificationResponseReceivedListener((response) => {
    handler((response.notification.request.content.data ?? {}) as PushTarget);
  });

  // Cold start: the tap that launched the app isn't delivered to the listener.
  Notifications.getLastNotificationResponseAsync().then((response) => {
    if (response) handler((response.notification.request.content.data ?? {}) as PushTarget);
  });

  return () => sub.remove();
}
