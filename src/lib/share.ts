import { Share } from 'react-native';
import * as Linking from 'expo-linking';

// Build the deep link for a user profile, e.g. zoi://user/<id> (exp://… in dev).
// Matches the `user/:userId` route in the NavigationContainer linking config.
export function userProfileUrl(userId: string): string {
  return Linking.createURL(`user/${userId}`);
}

// Open the native share sheet with a message + a deep link to this profile.
export async function shareProfile(userId: string, handle: string | null | undefined): Promise<void> {
  const url = userProfileUrl(userId);
  const who = handle ? `@${handle}` : 'this profile';
  try {
    await Share.share({ message: `See what ${who} is into on Zoi ${url}`, url });
  } catch {
    // User dismissed the sheet or sharing failed — nothing to do.
  }
}
