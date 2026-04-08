/**
 * Documented shapes for `public.connections` used by the web app and API.
 * Regenerate from Supabase CLI when the schema changes.
 *
 * Per-user archive/hide uses `connection_archives` and `connection_hidden`, not
 * `status = 'archived' | 'removed'` on this table.
 */
import type { ConnectionLifecycleStatus } from '@/types/connection';

export type ConnectionLifecycleStatusColumn = ConnectionLifecycleStatus;

/** Row shape returned by `/api/connections` (subset used on the client). */
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
  [key: string]: unknown;
};
