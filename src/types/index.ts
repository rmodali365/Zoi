// Sentiment tier — drives ranking scope and score range
export type Sentiment = 'loved' | 'liked' | 'fine';

// Experience lifecycle — 'planned' stops live in a trip but aren't ranked yet.
export type ExperienceStatus = 'planned' | 'ranked';

export type Tag =
  | 'outdoors' | 'drinks' | 'culture' | 'nightlife' | 'active' | 'chill' | 'food-adjacent'
  | 'wine' | 'beach' | 'ski' | 'food-focused' | 'scenic-drive'
  | 'city' | 'nature' | 'party' | 'romantic' | 'adventure'
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
  city?: string | null;
  region?: string | null;
  country?: string | null;
  formattedAddress?: string | null;
}

export interface Trip {
  id: string;
  user_id: string;
  title: string;
  destination: string | null;
  start_date: string | null;
  end_date: string | null;
  cover_photo: string | null;
  created_at: string;
  updated_at: string;
  // Joined
  user?: User;
  experiences?: Experience[];
}

export interface Experience {
  id: string;
  user_id: string;
  // Lifecycle: 'planned' = a trip stop not yet ranked; 'ranked' = logged + ranked.
  // Planned stops are hidden from all ranked surfaces (filtered by status).
  status: ExperienceStatus;
  // Null for planned stops (they have no sentiment until ranked).
  sentiment: Sentiment | null;
  // Optional membership in a trip container
  trip_id: string | null;
  // Short display headline ("SoMa bar crawl"); the primary label shown everywhere.
  title: string;
  // One or more locations for this outing.
  locations: Location[];
  // Denormalized representative location (= locations[0]); kept for the map pin and
  // older data. May be absent on very old rows.
  location: Location;
  tags: Tag[];
  photos: string[];
  quick_take: string;
  // Fractional rank string — lower sorts first, scoped within (user_id, sentiment).
  // Null for planned stops (set when the stop is ranked).
  rank_key: string | null;
  // Per-trip itinerary order (fractional index), independent of rank_key. Null
  // when the experience isn't in a trip.
  trip_position: string | null;
  // Optional reminder text on a planned stop.
  note: string | null;
  created_at: string;
  updated_at: string;
  // Joined
  user?: User;
  trip?: Trip;
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
  SetupProfile: { phone: string };
};

export type AppTabParamList = {
  Feed: undefined;
  List: undefined;
  Log: undefined;
  Profile: { userId?: string };
};

// Draft passed from AddExperience into the ranking step before insert
export type ExperienceDraft = {
  title: string;
  locations: Location[];
  tags: Tag[];
  photos: string[];
  quick_take: string;
  trip_id: string | null;
};

export type LogStackParamList = {
  LogHome: undefined;
  AddExperience: { tripId?: string } | undefined;
  // experienceId set when ranking ("graduating") an existing planned trip stop —
  // save updates that row in place instead of inserting a new experience.
  RankExperience: { draft: ExperienceDraft; experienceId?: string };
  StartTrip: undefined;
};

export type FeedStackParamList = {
  FeedHome: undefined;
  FindPeople: undefined;
  UserProfile: { userId: string };
  FollowList: { userId: string; mode: 'followers' | 'following' };
};

// Experiences tab (formerly "My List") — now a stack so trips are tappable.
export type ExperiencesStackParamList = {
  ExperiencesHome: undefined;
  TripDetail: { tripId: string };
};

export type ProfileStackParamList = {
  ProfileHome: undefined;
  TripDetail: { tripId: string };
  UserProfile: { userId: string };
  FollowList: { userId: string; mode: 'followers' | 'following' };
  EditProfile: undefined;
};
