/**
 * Documented shapes for `public.connections` and per-user junction tables used by the web app and API.
 * Regenerate from Supabase CLI when the schema changes.
 *
 * Archiving and explicit removal are **not** expressed as `connections.status = 'archived' | 'removed'`.
 * Visibility is driven by:
 * - `connection_archives` — standard / auto-archive for a user
 * - `connection_hidden` — explicit “remove” (soft delete) for a user
 */
import type { ConnectionLifecycleStatus } from '@/types/connection';

export type ConnectionLifecycleStatusColumn = ConnectionLifecycleStatus;

/** Row in `public.connection_archives`. */
export type ConnectionArchiveRow = {
  id: string;
  user_id: string;
  connection_id: string;
  archived_at: string;
};

/** Row in `public.connection_hidden` (per-user removal). */
export type ConnectionHiddenRow = {
  id: string;
  user_id: string;
  connection_id: string;
  hidden_at: string;
};

/**
 * JSON from `POST /api/users/display-names`: display strings plus optional `users.image` per id
 * (hydrated for connection / chat sidebars; not stored on `connections`).
 */
export type DisplayNamesBatchResponse = {
  names: Record<string, string>;
  images?: Record<string, string | null>;
};

/** Row shape returned by `/api/connections` (subset used on the client). */
/** Subset of `public.messages` columns shared by REST, Realtime, and API consumers. */
export type MessagesTableRow = {
  id: string;
  chat_id: string;
  user_id: string;
  content: string;
  time_created: number;
  time_edited?: number | null;
  is_read: boolean;
  message_type?: string | null;
  metadata?: Record<string, unknown> | null;
  local_sent_at?: number | null;
  read_at?: number | null;
  delivered_at?: number | null;
};

export type ConnectionsApiRow = {
  id: string;
  user_ids: string[];
  status: ConnectionLifecycleStatus | null;
  created?: number | null;
  created_utc?: string | null;
  created_at?: string | null;
  last_message_at?: number | null;
  has_begun?: boolean | null;
  expiry_state?: string | null;
  semantic_location?: string | null;
  full_location?: string | null;
  geo_location?: Record<string, unknown> | null;
  memory_capsule?: unknown;
  context_tag_id?: string | null;
  weather_condition?: string | null;
  noise_level?: string | null;
  source?: 'handshake' | 'prior' | string | null;
  confirmed_by_a?: boolean | null;
  confirmed_by_b?: boolean | null;
  known_since?: string | null;
  context_tag?: string | null;
  connection_method?: string | null;
  [key: string]: unknown;
};
