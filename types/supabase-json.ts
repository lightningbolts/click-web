/** Matches Supabase `Json` for JSON/JSONB columns (e.g. context_tags, sensor_payload). */
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

/** 48-hour async match window for pending proximity handshakes. */
export const PENDING_HANDSHAKE_TTL_MS = 48 * 60 * 60 * 1000;

/** Tri-factor proximity bind request body (mirrors legacy bind-proximity-connection). */
export interface ProximityHandshakeRequest {
  my_token?: unknown;
  tokens?: unknown[];
  heard_tokens?: unknown[];
  detected_devices?: unknown[];
  latitude?: unknown;
  longitude?: unknown;
  gps_lat?: unknown;
  gps_lon?: unknown;
  exact_barometric_elevation_m?: unknown;
  noise_level?: unknown;
  exact_noise_level_db?: unknown;
  context_tags?: unknown;
  height_category?: unknown;
  lux_level?: unknown;
  motion_variance?: unknown;
  compass_azimuth?: unknown;
  battery_level?: unknown;
  location_name?: unknown;
  weather_snapshot?: unknown;
  simulator_mock?: unknown;
  timezone_offset_minutes?: unknown;
  client_context_first?: unknown;
}

/** Extra sensor / enrichment fields stored in pending_handshakes.sensor_payload. */
export interface ProximitySensorPayloadJson extends Record<string, Json | undefined> {
  exact_barometric_elevation_m?: number | null;
  noise_level?: string | null;
  exact_noise_level_db?: number | null;
  context_tags?: string[];
  height_category?: string | null;
  location_name?: string | null;
  weather_snapshot?: string | null;
  detected_devices_ble?: string[];
  heard_tokens_audio?: string[];
  timezone_offset_minutes?: number;
}

export interface PendingHandshakeRow {
  id: string;
  user_id: string;
  my_token: string;
  heard_tokens: string[];
  lat: number | null;
  lon: number | null;
  lux_level: number | null;
  motion_variance: number | null;
  compass_azimuth: number | null;
  battery_level: number | null;
  sensor_payload: ProximitySensorPayloadJson;
  created_at: string;
  expires_at: string;
  matched_at: string | null;
}

export interface ProximityMatchUserProfile {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
  created_at: number;
  connection_id: string | null;
  encounter_logged: boolean;
  is_new_connection: boolean;
  encounter_persisted_on_bind: boolean;
  reason?: string;
}

export interface ProximityBindOkResponse {
  success: true;
  encounter_logged: boolean;
  matches: ProximityMatchUserProfile[];
  connection_id?: string;
  is_new_connection?: boolean;
  is_group?: boolean;
  group_clique_candidate?: { member_user_ids: string[] };
  encounter_id?: string;
  collaboration_ttl?: string;
  simulator_mock?: boolean;
}

export interface ProximityBindPendingResponse {
  success: true;
  status: 'pending_match';
  pending_handshake_id: string;
  expires_at: string;
  encounter_logged: false;
  matches: [];
}

export interface ProximityBindIgnoredResponse {
  success: false;
  status: 'ignored_empty_payload';
  message: string;
  encounter_logged: false;
  matches: [];
}
