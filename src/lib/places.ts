import { supabase } from '@/lib/supabase';
import { Location } from '@/types';

// Talks to the `places` Edge Function, which proxies Google Places (key stays server-side).

export type PlaceSuggestion = {
  placeId: string;
  primary: string;
  secondary: string;
  description: string;
};

export async function autocompletePlaces(
  input: string,
  sessionToken?: string,
): Promise<PlaceSuggestion[]> {
  const { data, error } = await supabase.functions.invoke('places', {
    body: { action: 'autocomplete', input, sessionToken },
  });
  if (error) throw error;
  return (data?.suggestions ?? []) as PlaceSuggestion[];
}

export async function getPlaceDetails(
  placeId: string,
  sessionToken?: string,
): Promise<Location> {
  const { data, error } = await supabase.functions.invoke('places', {
    body: { action: 'details', placeId, sessionToken },
  });
  if (error) throw error;
  return data.location as Location;
}
