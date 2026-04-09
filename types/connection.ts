/**
 * Lifecycle status for `public.connections.status` (pending / active / kept flow, plus legacy values).
 * Per-user archive and “remove” visibility are modeled in `connection_archives` and `connection_hidden`,
 * not as `status = 'archived' | 'removed'` for new web behavior. Legacy rows may still use
 * `expiry_state` without `status`; the web app normalizes via `normalizeConnectionStatus`.
 */
export type ConnectionLifecycleStatus =
  | 'pending'
  | 'active'
  | 'kept'
  | 'archived'
  | 'removed';
