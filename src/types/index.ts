import { NavigatorScreenParams } from '@react-navigation/native';

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
  // Everyone in the trip besides the owner (collaborative trips). Only loaded
  // where the roster is shown — TripDetail, trip cards.
  members?: TripMember[];
}

// Where an invited person stands. Only 'joined' grants write capability (RLS).
export type TripMemberStatus = 'invited' | 'joined' | 'declined';

// A person in a shared trip. The OWNER is trips.user_id and never appears here,
// which is why there's no role — there's nothing to escalate to.
export interface TripMember {
  trip_id: string;
  user_id: string;
  status: TripMemberStatus;
  invited_by: string | null;
  created_at: string;
  // Joined
  user?: User;
  trip?: Trip;
}

// The SHARED half of an outing: what happened, held once no matter how many
// people were there. Everything personal (sentiment, rank position, quick take,
// photos) lives on a Ranking, because those can't be shared — it's #3 in your
// list and #12 in theirs.
export interface Experience {
  id: string;
  // Who first logged it. NOT an owner: everyone on the experience can edit it,
  // and the post outlives any one person leaving.
  created_by: string;
  // Lifecycle: 'planned' = a trip stop nobody has ranked yet; 'ranked' = at least
  // one participant has ranked it. Maintained by DB triggers on rankings.
  status: ExperienceStatus;
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
  // Per-trip itinerary order (fractional index). Null when not in a trip.
  trip_position: string | null;
  // Optional reminder text on a planned stop.
  note: string | null;
  // When the experience happened (ranked) or is planned for (planned stop).
  // 'YYYY-MM-DD'; defaults to the log date.
  experience_date: string;
  created_at: string;
  updated_at: string;
  // Joined
  creator?: User;
  trip?: Trip;
  rankings?: Ranking[];
  participants?: ExperienceParticipant[];
}

// One person's take on a shared experience. This is what "my ranked list" reads:
// rankings for me, ordered by rank_key.
export interface Ranking {
  experience_id: string;
  user_id: string;
  sentiment: Sentiment;
  // Fractional index over this user's single overall list.
  rank_key: string;
  quick_take: string;
  // Your photos of the shared night. The post pools everyone's for display, but
  // each photo belongs to whoever added it — your view of the same evening.
  photos: string[];
  created_at: string;
  updated_at: string;
  // Joined
  user?: User;
  experience?: Experience;
}

export type ParticipantStatus = 'invited' | 'joined' | 'declined';

// Who's on an experience. Ranking it auto-joins you (DB trigger).
export interface ExperienceParticipant {
  experience_id: string;
  user_id: string;
  status: ParticipantStatus;
  invited_by: string | null;
  created_at: string;
  // Joined
  user?: User;
}

// The shape every list surface renders: the shared post, everyone's rankings,
// and — when the viewer has one — theirs pulled out as `mine`.
export type RankedExperience = Experience & {
  rankings: Ranking[];
  mine: Ranking | null;
};

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
  Feed: NavigatorScreenParams<FeedStackParamList> | undefined;
  List: NavigatorScreenParams<ExperiencesStackParamList> | undefined;
  Log: NavigatorScreenParams<LogStackParamList> | undefined;
  Profile: NavigatorScreenParams<ProfileStackParamList> | undefined;
};

// Draft passed from AddExperience into the ranking step before insert. Mixes the
// shared fields (title/locations/tags/date/trip) with the personal ones
// (photos/quick_take) — the save splits them across the two tables.
export type ExperienceDraft = {
  title: string;
  locations: Location[];
  tags: Tag[];
  photos: string[];
  quick_take: string;
  trip_id: string | null;
  // When it happened ('YYYY-MM-DD'); required, defaults to today in the UI.
  experience_date: string;
  // Friends you did this with (#67). They're TAGGED, not written to: each gets an
  // invitation, and accepting creates their own row in the same group for them to
  // rank themselves. Empty for a solo log.
  companion_ids: string[];
};

export type LogStackParamList = {
  LogHome: undefined;
  // tripId: preset trip when logging from a trip. graduateExperienceId: capture step
  // for ranking an existing planned stop — prefills from that row (#51).
  AddExperience: { tripId?: string; graduateExperienceId?: string } | undefined;
  // experienceId set when the flow operates on an existing row instead of
  // inserting: graduating a planned stop, or (with rerank) re-ranking an
  // already-ranked experience — sentiment + rank_key move, content stays.
  // NOTE: rerank has no user-facing entry point BY DESIGN — on-demand re-ranking
  // was cut; the planned periodic check-in flow ("does it still hold up?") will
  // be the only driver.
  RankExperience: { draft: ExperienceDraft; experienceId?: string; rerank?: boolean };
  StartTrip: undefined;
};

export type FeedStackParamList = {
  FeedHome: undefined;
  FindPeople: undefined;
  Search: undefined;
  Activity: undefined;
  UserProfile: { userId: string };
  FollowList: { userId: string; mode: 'followers' | 'following' };
  TripDetail: { tripId: string };
  ExperienceDetail: { experienceId: string };
  EditExperience: { experienceId: string };
};

// Experiences tab (formerly "My List") — now a stack so trips are tappable.
// UserProfile/FollowList are registered here too so an experience's author
// (e.g. from a Wishlist row) can be opened without leaving the tab.
export type ExperiencesStackParamList = {
  ExperiencesHome: undefined;
  TripDetail: { tripId: string };
  ExperienceDetail: { experienceId: string };
  EditExperience: { experienceId: string };
  UserProfile: { userId: string };
  FollowList: { userId: string; mode: 'followers' | 'following' };
};

export type ProfileStackParamList = {
  ProfileHome: undefined;
  TripDetail: { tripId: string };
  UserProfile: { userId: string };
  FollowList: { userId: string; mode: 'followers' | 'following' };
  EditProfile: undefined;
  ExperienceDetail: { experienceId: string };
  EditExperience: { experienceId: string };
};
