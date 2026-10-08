import 'server-only';
import { ticketingEnabled } from '@/lib/server/ticketing/enabled';

import { cache } from 'react';
import { createAdminSupabaseClient } from '@/lib/server/admin/supabaseAdmin';
import { createSupabaseServerClient } from '@/lib/server/supabaseServer';
import { getServerUser } from '@/lib/server/getServerUser';
import { displayNameFromUserMetadata } from '@/lib/userDisplayName';
import type { SessionBootstrap } from '@/lib/shell/sessionBootstrap';

export type { SessionBootstrap } from '@/lib/shell/sessionBootstrap';

type ProfileRow = { name: string | null; first_name: string | null; last_name: string | null; image: string | null };

function viewerName(profile: ProfileRow | null, metadata: Record<string, unknown> | undefined, email?: string) {
  const first = profile?.first_name?.trim() ?? '';
  const last = profile?.last_name?.trim() ?? '';
  return (
    [first, last].filter(Boolean).join(' ') ||
    profile?.name?.trim() ||
    displayNameFromUserMetadata(metadata) ||
    email?.split('@')[0] ||
    'You'
  );
}

/** The viewer's `users` row, shared by the shell bootstrap and pages that only need a name. */
const loadViewerProfile = cache(async (userId: string): Promise<ProfileRow | null> => {
  try {
    const { data } = await createAdminSupabaseClient()
      .from('users')
      .select('name, first_name, last_name, image')
      .eq('id', userId)
      .maybeSingle();
    return (data as ProfileRow | null) ?? null;
  } catch {
    return null;
  }
});

/** The viewer's display name with one query, for pages that don't need the whole bootstrap. */
export const loadViewerName = cache(async (): Promise<string | null> => {
  const user = await getServerUser();
  if (!user) return null;
  return viewerName(await loadViewerProfile(user.id), user.user_metadata, user.email);
});

/**
 * Signed-in shell bootstrap (spec §11.4.5): viewer, unread total, unseen activity and whether
 * they manage a Place, in one parallel batch. Each part degrades to its empty value so the
 * shell always renders.
 */
export const loadSessionBootstrap = cache(async (): Promise<SessionBootstrap | null> => {
  const user = await getServerUser();
  if (!user) return null;

  let admin: ReturnType<typeof createAdminSupabaseClient> | null = null;
  try {
    admin = createAdminSupabaseClient();
  } catch {
    admin = null;
  }

  const [profile, unreadTotal, hasActivity, managesPlaces] = await Promise.all([
    loadViewerProfile(user.id),
    (async () => {
      const supabase = await createSupabaseServerClient();
      const { data, error } = await supabase.rpc('get_inbox_previews');
      if (error || !Array.isArray(data)) return 0;
      return data.reduce((sum: number, row: { unread_count?: unknown }) => {
        const n = typeof row?.unread_count === 'number' ? row.unread_count : Number(row?.unread_count ?? 0);
        return sum + (Number.isFinite(n) && n > 0 ? n : 0);
      }, 0);
    })().catch(() => 0),
    (async () => {
      if (!admin) return false;
      const [{ data: latest }, { data: seen }] = await Promise.all([
        admin
          .from('activity_items')
          .select('created_at')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
        admin.from('activity_seen').select('seen_at').eq('user_id', user.id).maybeSingle(),
      ]);
      const latestAt = (latest as { created_at?: string } | null)?.created_at;
      if (!latestAt) return false;
      const seenAt = (seen as { seen_at?: string } | null)?.seen_at;
      return !seenAt || Date.parse(latestAt) > Date.parse(seenAt);
    })().catch(() => false),
    (async () => {
      if (!admin) return false;
      const { count } = await admin
        .from('place_managers')
        .select('place_id', { count: 'exact', head: true })
        .eq('user_id', user.id);
      return (count ?? 0) > 0;
    })().catch(() => false),
  ]);

  const metaImage = typeof user.user_metadata?.avatar_url === 'string' ? user.user_metadata.avatar_url : null;
  return {
    viewer: {
      id: user.id,
      name: viewerName(profile, user.user_metadata, user.email),
      email: user.email ?? null,
      avatarUrl: profile?.image || metaImage || null,
    },
    unreadTotal,
    hasActivity,
    managesPlaces,
    ticketing: ticketingEnabled(),
  };
});
