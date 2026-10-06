import type { NoiseLevelKey } from '@/lib/dashboard/connectionExtras';
import type { ConnectionDisplayStatus } from '@/lib/dashboard/connectionStatus';

/**
 * The connection row shape shared by Clicks, the map and chat (the table UI that once lived here
 * was retired with the Memory Box).
 */

export interface ConnectionEncounterBrief {
  id: string;
  encounteredAt: Date;
  locationName?: string;
  displayLocation?: string;
  /** `connection_encounters.semantic_location` for neighbourhood-aware labels */
  semanticLocation?: unknown;
  contextTags: string[];
  /** Present only when the crossing stored a calibrated SPL reading */
  exactNoiseLevelDb?: number;
  /** Raw `weather_snapshot` for ambient mesh (newest crossing is `encounters[0]`). */
  weatherSnapshot?: unknown;
  /** Present only when barometric altitude was captured */
  exactBarometricElevationM?: number;
  /** AGL relative to terrain when derived; prefer over absolute barometric for UI */
  relativeAltitudeM?: number;
  luxLevel?: number;
  motionVariance?: number;
  compassAzimuth?: number;
  batteryLevel?: number;
}

export interface ConnectionRecord {
  id: string;
  /** Direct 1:1 vs mathematically verified group clique chat */
  chatKind?: 'direct' | 'group_clique';
  /** When [chatKind] is `group_clique`, the `public.chats.id` for this group (messages + realtime). */
  groupChatId?: string;
  /** `public.groups.created_by` when [chatKind] is `group_clique`. */
  groupCreatedByUserId?: string;
  otherUserId?: string;
  /** Both user IDs from the connection (needed for E2EE key derivation) */
  userIds?: string[];
  name: string;
  dateMet: Date;
  location: string;
  /** Event / context tag (from memory_capsule or context_tag_id) */
  context?: string;
  /** Weather when you connected, if captured */
  weatherSummary?: string;
  /** Noise level category and/or measured dB */
  noiseSummary?: string;
  /** Tier for volume-bar display (1 / 2 / 3 bars) */
  noiseCategory?: NoiseLevelKey;
  status: ConnectionDisplayStatus;
  /** Server `last_message_at` (ms) for auto-archive countdowns in the dashboard */
  lastMessageAt?: number | null;
  /** Raw `created` (ms) from Supabase when available */
  connectionCreatedMs?: number;
  hasBegun?: boolean;
  expiryState?: string | null;
  /** Other participant's `public.users.image` when known (nullable). */
  avatarUrl?: string | null;
  geo_location?: {
    latitude: number;
    longitude: number;
  };
  chatPreview?: string | null;
  chatLastMessageAt?: number | null;
  chatUpdatedAt?: number | null;
  /** Newest-first timeline from `connection_encounters`, when present */
  encounters?: ConnectionEncounterBrief[];
  /** When viewer and peer share an active intent tag or timeframe */
  intentOverlapLabel?: string | null;
  /** handshake (default) vs self-reported prior */
  source?: 'handshake' | 'prior' | string | null;
  knownSince?: string | null;
}
