import { Share } from 'react-native';
import * as Linking from 'expo-linking';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL!;

// In-app deep link for a user profile, e.g. zoi://user/<id> (exp://… in dev).
// Matches the `user/:userId` route in the NavigationContainer linking config.
export function userProfileUrl(userId: string): string {
  return Linking.createURL(`user/${userId}`);
}

// Shareable https link for a profile — lands on the public `link` Edge Function,
// which opens the app (via the zoi:// deep link) when installed and shows a
// get-the-app fallback otherwise. Custom-scheme URLs are dead ends for anyone
// without the app, so never share zoi:// directly (#56).
export function webProfileUrl(userId: string): string {
  return `${SUPABASE_URL}/functions/v1/link/user/${userId}`;
}

// Open the native share sheet with a message + a link to this profile.
export async function shareProfile(userId: string, handle: string | null | undefined): Promise<void> {
  const url = webProfileUrl(userId);
  const who = handle ? `@${handle}` : 'this profile';
  try {
    await Share.share({ message: `See what ${who} is into on Zoi ${url}`, url });
  } catch {
    // User dismissed the sheet or sharing failed — nothing to do.
  }
}
