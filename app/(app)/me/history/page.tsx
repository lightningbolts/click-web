import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { CalendarDays, Check, Users } from 'lucide-react';
import { PushedPage } from '@/components/app-shell/ShellContext';
import { Avatar } from '@/components/ds/Avatar';
import { CardVisual } from '@/components/ds/CardVisual';
import { EmptyState } from '@/components/ds/EmptyState';
import { ListGroup, ListRow } from '@/components/ds/ListGroup';
import { StatTile } from '@/components/ds/StatTile';
import { StatusPill } from '@/components/ds/StatusPill';
import { HistoryViewControl, type HistoryView } from '@/components/me/HistoryViewControl';
import { connectionRowTimestampMs } from '@/lib/dashboard/connectionStatus';
import { buildDashboardMetrics, getAllAchievements, getNextMilestone } from '@/lib/dashboard/userMetrics';
import { groupByMonth } from '@/lib/me/monthGroups';
import { createAdminSupabaseClient } from '@/lib/server/admin/supabaseAdmin';
import { getServerUser } from '@/lib/server/getServerUser';
import { resolveFeature } from '@/lib/server/featureFlags';
import { loadHistoryPage } from '@/lib/server/history';
import { loadConnections, peerOf } from '@/lib/server/home/loadHome';
import { loadPeople, metricConnections } from '@/lib/server/me/loadMe';
import { eventHref, personHref } from '@/lib/shell/appNav';
import { TIME_ZONE_COOKIE, validTimeZone } from '@/lib/time/viewerTimeZone';

export const metadata: Metadata = { title: 'History · Click' };

const MAX_ROWS = 300;
const VIEWS: readonly HistoryView[] = ['clicks', 'events', 'milestones'];

/** History (spec §7.7): Clicks and Events by month, and honest milestones. */
export default async function HistoryPage({ searchParams }: { searchParams: Promise<{ view?: string | string[] }> }) {
  const [user, sp, jar] = await Promise.all([getServerUser(), searchParams, cookies()]);
  if (!user) redirect('/login?next=/me/history');
  const view: HistoryView = VIEWS.includes(sp.view as HistoryView) ? (sp.view as HistoryView) : 'clicks';
  const timeZone = validTimeZone(jar.get(TIME_ZONE_COOKIE)?.value) ?? 'UTC';
  const admin = createAdminSupabaseClient();
  const dateFmt = new Intl.DateTimeFormat('en-US', { timeZone, month: 'short', day: 'numeric' });

  let body: React.ReactNode;
  if (view === 'events') {
    const enabled = (await resolveFeature(admin, 'event_history', user.id)).enabled;
    const items = enabled ? (await loadHistoryPage(admin, user.id, 'events', null, MAX_ROWS)).items : [];
    const months = groupByMonth(items, (i) => Date.parse(i.at), timeZone);
    body =
      months.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title={enabled ? 'No events yet' : 'Event history is on its way'}
          body={enabled ? 'Events you host, go to or check in at show up here.' : 'It’s rolling out to more people soon.'}
        />
      ) : (
        months.map((m) => (
          <ListGroup key={m.key} header={m.title}>
            {m.items.map((item) => {
              const row = {
                leading: <CardVisual seed={item.beacon_id ?? item.id} photoUrl={item.image_url} radius="sm" className="size-10" sizes="40px" />,
                title: item.title,
                subtitle: [item.detail, item.place, dateFmt.format(Date.parse(item.at))].filter(Boolean).join(' · '),
                trailing: item.recap?.state === 'ready' ? <StatusPill variant="tinted">Recap</StatusPill> : undefined,
              };
              return item.beacon_id ? <ListRow key={item.id} href={eventHref(item.beacon_id)} {...row} /> : <ListRow key={item.id} {...row} />;
            })}
          </ListGroup>
        ))
      );
  } else {
    const connections = await loadConnections(admin, user.id);
    const rows = connections.visible
      .map((r) => ({ row: r, peer: peerOf(r, user.id), ms: connectionRowTimestampMs(r) }))
      .filter((x): x is typeof x & { peer: string } => x.peer != null)
      .sort((a, b) => b.ms - a.ms);

    if (view === 'milestones') {
      const metrics = buildDashboardMetrics(metricConnections(connections.visible));
      const achievements = getAllAchievements(metrics);
      const next = getNextMilestone(metrics.totalConnections);
      body = (
        <>
          <section aria-label="Totals" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatTile label="Clicks" value={metrics.totalConnections} hint="In person" />
            <StatTile label="This month" value={metrics.thisMonth} />
            <StatTile label="Longest run" value={metrics.streak} hint={metrics.streak === 1 ? 'day' : 'days in a row'} />
            <StatTile label="Still talking" value={`${metrics.retentionRate}%`} hint={`n = ${metrics.totalConnections}`} />
          </section>
          <p className="type-body text-fg-secondary">
            {next.target - metrics.totalConnections} more {next.target - metrics.totalConnections === 1 ? 'Click' : 'Clicks'} to {next.target}.
          </p>
          <section aria-labelledby="history-badges">
            <h2 id="history-badges" className="type-meta mb-2 px-1 font-semibold text-fg-secondary">
              Milestones
            </h2>
            <ul className="flex flex-wrap gap-2">
              {achievements.map((a) => (
                <li
                  key={a.id}
                  title={a.description}
                  className={
                    a.unlocked
                      ? 'type-meta inline-flex h-9 items-center gap-1.5 rounded-pill bg-selection px-3.5 font-semibold text-accent'
                      : 'type-meta inline-flex h-9 items-center gap-1.5 rounded-pill bg-fill-subtle px-3.5 text-fg-tertiary'
                  }
                >
                  {a.unlocked ? <Check size={14} strokeWidth={2.5} aria-hidden /> : null}
                  {a.title}
                  <span className="sr-only">{a.unlocked ? ', earned' : `, not yet: ${a.description}`}</span>
                </li>
              ))}
            </ul>
          </section>
        </>
      );
    } else {
      const shown = rows.slice(0, MAX_ROWS);
      const people = await loadPeople(admin, [...new Set(shown.map((x) => x.peer))]);
      const months = groupByMonth(shown, (x) => x.ms, timeZone);
      body =
        months.length === 0 ? (
          <EmptyState icon={Users} title="No Clicks yet" body="When you Click with someone in person, they show up here." />
        ) : (
          months.map((m) => (
            <ListGroup key={m.key} header={m.title}>
              {m.items.map(({ row, peer, ms }) => {
                const p = people.get(peer);
                return (
                  <ListRow
                    key={row.id}
                    href={personHref(peer)}
                    leading={<Avatar seed={peer} name={p?.name} src={p?.avatarUrl} size={40} />}
                    title={p?.name ?? 'Someone'}
                    subtitle={`Clicked ${dateFmt.format(ms)}`}
                    trailing={connections.active.some((a) => a.id === row.id) ? undefined : <StatusPill variant="neutral">Archived</StatusPill>}
                  />
                );
              })}
            </ListGroup>
          ))
        );
    }
  }

  return (
    <div className="container-content pb-16 pt-6 md:pt-10">
      <PushedPage title="History" backHref="/me" />
      <h1 className="type-title-1 mb-5 text-fg">History</h1>
      <HistoryViewControl value={view} />
      <div className="mt-6 flex flex-col gap-6">{body}</div>
    </div>
  );
}
