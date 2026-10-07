import 'server-only';
import { inboxPeerIds, type InboxPreload } from '@/lib/clicks/inboxPreload';
import { loadDashboardBundle } from '@/lib/server/connections/dashboardBundle';
import { getServerUser } from '@/lib/server/getServerUser';
import { createSupabaseServerClient } from '@/lib/server/supabaseServer';
import { resolveDisplayNames } from '@/lib/server/users/displayNames';

/**
 * The inbox's first load in two parallel rounds (bundle + own availability, then names + peers'
 * availability). Never rejects: on any failure the client fetches as before.
 */
export async function loadInboxPreload(): Promise<InboxPreload | null> {
  try {
    const user = await getServerUser();
    if (!user) return null;
    const supabase = await createSupabaseServerClient();
    const [result, mine] = await Promise.all([
      loadDashboardBundle(supabase, user.id),
      supabase.from('availability_intents').select('id,timeframe,intent_tag,expires_at').eq('user_id', user.id),
    ]);
    if (!result.ok) return null;

    const peerIds = inboxPeerIds(result.bundle, user.id);
    const [names, peers] = await Promise.all([
      peerIds.length > 0 ? resolveDisplayNames(peerIds).catch(() => null) : { names: {}, images: {} },
      peerIds.length > 0
        ? supabase
            .from('availability_intents')
            .select('user_id,id,timeframe,intent_tag,expires_at')
            .in('user_id', peerIds)
        : null,
    ]);
    // Without names the rows would render as "Unknown"; let the client resolve them instead.
    if (!names) return null;

    return {
      userId: user.id,
      loadedAt: Date.now(),
      bundle: result.bundle,
      names: names.names,
      images: names.images,
      selfIntents: (mine.data ?? []) as Record<string, unknown>[],
      peerIntents: (peers && !peers.error ? (peers.data ?? []) : []) as Record<string, unknown>[],
    };
  } catch (err) {
    console.error('[clicks] inbox preload failed:', err);
    return null;
  }
}
