export type Bucket = 'single' | 'day_trip' | 'weekend' | 'trip';

export type Tag =
  // Single experience
  | 'outdoors' | 'drinks' | 'culture' | 'nightlife' | 'active' | 'chill' | 'food-adjacent'
  // Day trip
  | 'wine' | 'beach' | 'ski' | 'food-focused' | 'scenic-drive'
  // Weekend trip
  | 'city' | 'nature' | 'party' | 'romantic' | 'adventure'
  // Trip
  | 'international' | 'domestic' | 'relaxation';

export interface User {
  id: string;
  name: string;
  handle: string;
  avatar_url: string | null;
  phone: string | null;
  created_at: string;
}

export interface Follow {
  follower_id: string;
  following_id: string;
  created_at: string;
}

export interface Location {
  lat: number;
  lng: number;
  name: string;
  place_id: string;
  city?: string;
  region?: string;
  country?: string;
}

export interface Experience {
  id: string;
  user_id: string;
  bucket: Bucket;
  location: Location;
  tags: Tag[];
  photos: string[];
  quick_take: string;
  // Fractional rank string (e.g. "0|hzzzzz:") — lower sorts first
  rank_key: string;
  created_at: string;
  updated_at: string;
  // Joined
  user?: User;
}

export interface Save {
  user_id: string;
  experience_id: string;
  created_at: string;
  experience?: Experience;
}

// Navigation param types
export type RootStackParamList = {
  Auth: undefined;
  App: undefined;
};

export type AuthStackParamList = {
  Welcome: undefined;
  PhoneAuth: undefined;
  VerifyOtp: { phone: string };
  Onboarding: undefined;
};

export type AppTabParamList = {
  Feed: undefined;
  Log: undefined;
  Profile: { userId?: string };
  Search: undefined;
};
