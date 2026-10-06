import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { ActivityFeed } from '@/components/activity/ActivityFeed';
import { requestConnectionId } from '@/lib/activity/activityView';
import { createAdminSupabaseClient } from '@/lib/server/admin/supabaseAdmin';
import { loadActivity, pendingPriorRequests } from '@/lib/server/activity';
import { getServerUser } from '@/lib/server/getServerUser';
import { TIME_ZONE_COOKIE, validTimeZone } from '@/lib/time/viewerTimeZone';

export const metadata: Metadata = { title: 'Activity · Click' };

/** Activity (spec §7.9): server-rendered first page, grouped by recency. */
export default async function ActivityPage() {
  const [user, jar] = await Promise.all([getServerUser(), cookies()]);
  if (!user) redirect('/login?next=/activity');
  const admin = createAdminSupabaseClient();
  const page = await loadActivity(admin, user.id);
  const pending = await pendingPriorRequests(admin, user.id, page.items.flatMap((i) => requestConnectionId(i) ?? []));
  // eslint-disable-next-line react-hooks/purity -- server component, rendered per request
  const nowMs = Date.now();
  return (
    <div className="container-content pb-16 pt-6 md:pt-10">
      <h1 className="type-title-1 mb-4 text-fg">Activity</h1>
      <ActivityFeed
        initial={{ ...page, pending_requests: [...pending] }}
        nowMs={nowMs}
        timeZone={validTimeZone(jar.get(TIME_ZONE_COOKIE)?.value) ?? 'UTC'}
      />
    </div>
  );
}
