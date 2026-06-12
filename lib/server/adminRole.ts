import type { User } from '@supabase/supabase-js';

/**
 * Admin status comes exclusively from `app_metadata`, which only the service
 * role can write (Dashboard / `auth.admin.updateUserById`). `user_metadata` is
 * end-user writable via `supabase.auth.updateUser({ data: ... })` and must
 * never gate admin surfaces.
 *
 * Migration 20260612091000_admin_role_app_metadata.sql copies existing
 * `user_metadata.role = 'admin'` grants into `app_metadata`.
 */
export function isAdminUser(user: User | null | undefined): boolean {
  return user?.app_metadata?.role === 'admin';
}
