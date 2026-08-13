import { supabase } from '@/lib/supabase';
import { unregisterPush } from '@/lib/push';

// Auth + current-user helpers. Screens go through these instead of touching
// `supabase.auth` / the `users` table directly, so the data layer stays in lib/.

// Current auth user id, or null if the session is gone.
export async function getMyUserId(): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id ?? null;
}

// Send a phone OTP. Throws on failure so the caller can surface the message.
export async function sendOtp(phone: string): Promise<void> {
  const { error } = await supabase.auth.signInWithOtp({ phone });
  if (error) throw error;
}

// Verify the SMS code. Throws on an invalid code. On success, reports whether the
// authenticated user already has a profile row (returning user) or not (new user).
export async function verifyOtp(phone: string, token: string): Promise<{ hasProfile: boolean }> {
  const { data, error } = await supabase.auth.verifyOtp({ phone, token, type: 'sms' });
  if (error) throw error;
  const userId = data.user?.id;
  if (!userId) return { hasProfile: false };
  const { data: profile } = await supabase.from('users').select('id').eq('id', userId).maybeSingle();
  return { hasProfile: !!profile };
}

export async function signOut(): Promise<void> {
  // Drop this device's push token FIRST — deleting it is owner-only under RLS,
  // so after signOut() there's no auth.uid() left to authorise it and the row
  // would linger, pushing this account's notifications to whoever signs in next.
  await unregisterPush();
  await supabase.auth.signOut();
}
