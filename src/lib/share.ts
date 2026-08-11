import { Share } from 'react-native';
import * as Linking from 'expo-linking';

// In-app deep link for a user profile, e.g. zoi://user/<id> (exp://… in dev).
// Matches the `user/:userId` route in the NavigationContainer linking config.
export function userProfileUrl(userId: string): string {
  return Linking.createURL(`user/${userId}`);
}

// Shareable https link for a profile — served by the zoisocial.com Cloudflare Worker.
// As a Universal Link it opens the app directly when installed; otherwise the page shows
// a get-the-app fallback. Custom-scheme URLs are dead ends for anyone without the app, so
// never share zoi:// directly (#56, #75).
export function webProfileUrl(userId: string): string {
  return `https://zoisocial.com/user/${userId}`;
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
