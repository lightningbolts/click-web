/**
 * Click Places API shapes (CLICK_PLACES_SPEC.md §4–§5). snake_case keys match the JSON the
 * iOS client decodes; extend both sides together.
 */

export type PlaceCategory =
  | 'cafe'
  | 'bar'
  | 'nightlife'
  | 'music_venue'
  | 'restaurant'
  | 'gym'
  | 'coworking'
  | 'study_space'
  | 'entertainment'
  | 'bookstore'
  | 'campus_space'
  | 'event_space'
  | 'office'
  | 'other';

export type EnergyLabel = 'chill' | 'steady' | 'lively' | 'packed';
/** 1 Chill, 2 Steady, 3 Lively, 4 Packed. */
export type EnergyLevel = 1 | 2 | 3 | 4;

export type CategoryQuestionKey = 'seats' | 'line' | 'wait' | 'equipment';
export type PlaceVerificationStatus = 'draft' | 'pending' | 'verified' | 'suspended';
export type PlaceManagerRole = 'owner' | 'manager' | 'viewer';

export type PresenceProof = 'qr' | 'gps' | 'event' | 'encounter';
export type CheckInProof = 'qr' | 'gps';
export type DistanceBucket = '0_25' | '25_75' | '75_150' | '150_400' | '400_plus';
export type AccuracyBucket = '0_20' | '20_50' | '50_100' | '100_plus';
export type CheckInRejectReason = 'no_location' | 'low_accuracy' | 'out_of_bounds' | 'invalid_anchor';

/** `places.hours`: keys mon…sun, `HH:MM` 24 h intervals in `places.timezone`. */
export type PlaceHours = Partial<Record<Weekday, [string, string][]>>;
export type Weekday = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

export type PulseQuestion = {
  key: 'energy' | 'talkable' | 'category' | 'would_return';
  category_question?: CategoryQuestionKey;
  prompt: string;
  required: boolean;
  phase: 'present' | 'leaving';
  options: { value: number; label: string }[];
};

export type PulseSummary = {
  state: 'live' | 'stale' | 'none';
  label: EnergyLabel | null;
  energy_score: number | null;
  report_count: number;
  newest_at: string | null;
  confidence: 'low' | 'medium' | 'high' | null;
  distribution: [number, number, number, number];
  talkable: { yes: number; no: number };
  category: { question: CategoryQuestionKey; counts: [number, number, number] } | null;
  window_minutes: number;
};

export type PulsePattern = { label: EnergyLabel; report_count: number; weeks: number };

export type PlaceEventRef = {
  beacon_id: string;
  title: string;
  starts_at: string | null;
  ends_at: string | null;
  is_live: boolean;
};

export type PlaceViewerFlags = {
  checked_in: boolean;
  has_history: boolean;
  connections_been_here_count: number;
};

export type PlaceSummary = {
  id: string;
  slug: string;
  name: string;
  category: PlaceCategory;
  photo_url: string | null;
  latitude: number;
  longitude: number;
  radius_meters: number;
  distance_meters: number | null;
  address_line: string | null;
  city: string | null;
  open_now: boolean | null;
  pulse: PulseSummary;
  here_now_count: number;
  events_today_count: number;
  next_event: PlaceEventRef | null;
  hub_id: string | null;
  viewer: PlaceViewerFlags | null;
};

export type PlacePerson = { user_id: string; name: string; avatar_url: string | null };

export type PlaceCheckInState = {
  active: boolean;
  check_in_id: string;
  checked_in_at: string;
  expires_at: string;
  proof: CheckInProof;
  share_with_connections: boolean;
};

export type PulseEligibility = {
  can_pulse: boolean;
  reason: 'not_present' | 'cooldown' | 'manager' | null;
  cooldown_until: string | null;
  questions: PulseQuestion[];
  leaving_questions: PulseQuestion[];
  my_last_pulse: { id: string; energy: number | null; created_at: string; editable_until: string } | null;
};

export type PlaceDetail = PlaceSummary & {
  description: string | null;
  website_url: string | null;
  timezone: string;
  hours: PlaceHours | null;
  today_hours_label: string | null;
  directions: { apple_maps_url: string; google_maps_url: string };
  pattern: PulsePattern | null;
  /** `image_url`: the event's own picture, so the Place page can show it (else its cover). */
  upcoming_events: (PlaceEventRef & { cover_theme_id: string | null; image_url: string | null })[];
  here_now_connections: PlacePerson[];
  clicks_been_here: { count: number; names: string[] } | null;
  you_met_here: { total: number; people: (PlacePerson & { last_met_at: string })[] } | null;
  own_history: { check_in_count: number; last_check_in_at: string | null; encounter_count: number } | null;
  check_in: PlaceCheckInState | null;
  pulse_eligibility: PulseEligibility | null;
  hub: { id: string; name: string; joined: boolean } | null;
  is_manager: boolean;
};

/** One Pulse row as the pure functions need it. */
export type PulseRow = {
  energy: number | null;
  proof_weight: number;
  created_at: string;
  talkable?: number | null;
  category_question?: CategoryQuestionKey | null;
  category_answer?: number | null;
  would_return?: number | null;
  user_id?: string | null;
};
