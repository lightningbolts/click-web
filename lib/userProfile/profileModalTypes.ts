import type { SharedConnectionPayload } from '@/lib/userProfile/formatSharedConnection';
import type { AvailabilityIntentRow } from '@/lib/userProfile/availability';
import type { AttachmentEnvelope } from '@/lib/chat/attachmentCrypto';

export type UserProfilePayload = {
  user: {
    id: string;
    first_name?: string | null;
    last_name?: string | null;
    name?: string | null;
    full_name?: string | null;
    birthday?: string | null;
    image?: string | null;
    email?: string | null;
  };
  tags: string[];
  availability: {
    is_free_this_week?: boolean;
    available_days?: string[];
    preferred_activities?: string[];
    custom_status?: string | null;
  } | null;
  /** Non-expired rows from `availability_intents` (when API can read them). */
  availabilityIntents?: AvailabilityIntentRow[];
  /** Logged-in viewer’s tags (for client-side use; API also sends `sharedInterestTags`). */
  viewerInterestTags?: string[];
  sharedInterestTags?: string[];
  /** Mutual `connections` row for viewer + profile user. */
  sharedConnection?: SharedConnectionPayload | null;
};

/**
 * Locally-decrypted chat messages used to populate the Media / Files / Links
 * subtabs. Message content is E2EE on the wire, so the BFF cannot parse it —
 * clients scan their already-decrypted state.
 */
export type DecryptedProfileMessage = {
  id: string;
  content: string;
  /** Human-readable timestamp already formatted by the caller. */
  timestamp: string;
  /** Message type (e.g. 'text', 'image', 'audio', 'file'). Defaults to 'text'. */
  messageType?: string;
  /** Parsed metadata JSON for media/file messages. */
  metadata?: Record<string, unknown> | null;
};

export type ConnectionTabsPayload = {
  chatId: string | null;
  media: Array<{
    id: string;
    content: string;
    time_created: number | string;
    message_type: string;
    metadata: Record<string, unknown> | null;
  }>;
  files: Array<{
    id: string;
    content: string;
    time_created: number | string;
    message_type: string;
    metadata: Record<string, unknown> | null;
  }>;
  beacons?: Array<{
    id: string;
    content: string;
    time_created: number | string;
    message_type: string;
    metadata: Record<string, unknown> | null;
  }>;
};

export type BeaconPreviewItem = {
  id: string;
  beaconId: string;
  title: string;
  description?: string;
  scheduleLabel?: string;
  locationLabel?: string;
  imageUrl?: string | null;
};

export type EventRecommendationPayload = {
  recommendation: {
    beacon_id: string;
    title: string;
    peer_name?: string;
    event_start_at?: string | null;
    location_name?: string | null;
  } | null;
};

export type ChatMessagesPayload = {
  messages: Array<{
    id: string;
    content: string;
    time_created: number;
    message_type: string;
    metadata: Record<string, unknown> | null;
  }>;
};

export type CollaborationSessionResponse = {
  encounter_id?: unknown;
  collaboration_ttl?: unknown;
};

export type MediaItem = {
  id: string;
  mediaType: 'image' | 'audio';
  sourceUrl: string | null;
  storagePath: string | null;
  caption: string | null;
  mimeType: string | null;
  isEncrypted: boolean;
};
export type FileItem = {
  id: string;
  fileName: string;
  sizeBytes: number;
  mimeType: string;
  timestamp: string;
  downloadUrl: string | null;
  storagePath: string | null;
  envelope: AttachmentEnvelope | null;
};
export type LinkItem = { id: string; url: string; timestamp: string };
