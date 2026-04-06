/**
 * Lifecycle status for `public.connections.status` (aligned with mobile auto-archive + soft remove).
 * Legacy rows may still use `expiry_state` without `status`; the web app normalizes via
 * `normalizeConnectionStatus` in `@/lib/dashboard/connectionStatus`.
 */
export type ConnectionLifecycleStatus =
  | 'pending'
  | 'active'
  | 'kept'
  | 'archived'
  | 'removed';
