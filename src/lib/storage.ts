import { File } from 'expo-file-system';
import { supabase } from '@/lib/supabase';

const BUCKET = 'experience-photos';
const AVATAR_BUCKET = 'avatars';

function contentTypeFor(ext: string): string {
  switch (ext) {
    case 'png': return 'image/png';
    case 'webp': return 'image/webp';
    case 'heic': return 'image/heic';
    default: return 'image/jpeg';
  }
}

/**
 * Uploads local image URIs to Storage under the user's folder and returns public URLs.
 * URIs that are already remote (http...) are passed through unchanged.
 */
export async function uploadExperiencePhotos(userId: string, localUris: string[]): Promise<string[]> {
  const urls: string[] = [];

  for (let i = 0; i < localUris.length; i++) {
    const uri = localUris[i];
    if (uri.startsWith('http')) {
      urls.push(uri);
      continue;
    }

    const bytes = await new File(uri).bytes();
    const ext = (uri.split('.').pop() ?? 'jpg').split('?')[0].toLowerCase();
    const path = `${userId}/${Date.now()}-${i}.${ext}`;

    const { error } = await supabase.storage.from(BUCKET).upload(path, bytes, {
      contentType: contentTypeFor(ext),
      upsert: false,
    });
    if (error) throw error;

    urls.push(supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl);
  }

  return urls;
}

/**
 * Uploads a profile picture to the avatars bucket under the user's folder and returns its
 * public URL.
 */
export async function uploadAvatar(userId: string, localUri: string): Promise<string> {
  const bytes = await new File(localUri).bytes();
  const ext = (localUri.split('.').pop() ?? 'jpg').split('?')[0].toLowerCase();
  const path = `${userId}/avatar-${Date.now()}.${ext}`;

  const { error } = await supabase.storage.from(AVATAR_BUCKET).upload(path, bytes, {
    contentType: contentTypeFor(ext),
    upsert: false,
  });
  if (error) throw error;

  return supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path).data.publicUrl;
}
