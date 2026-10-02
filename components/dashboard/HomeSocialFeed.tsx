'use client';

import { useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import type { ConnectionRecord } from './ConnectionTable';
import { getFreshAuthHeaders } from '@/lib/auth/freshAuthHeaders';
import { homeGreeting, nudgeConnection, selectHomeOpportunity, type HomeNudge } from '@/lib/dashboard/homeFeed';
import { isActiveChatListStatus } from '@/lib/dashboard/connectionStatus';
import HomeActivityRecap, { fetchHomeData } from './HomeActivityRecap';
import HomeSavedEvents from './HomeSavedEvents';
import { useHomeSavedEvents } from './useHomeSavedEvents';
import { useHomeNearby } from './useHomeNearby';

async function postAction<T>(path: string): Promise<T> {
  const response = await fetch(path, { method: 'POST', headers: await getFreshAuthHeaders() });
  const data = response.status === 204 ? {} : await response.json();
  if (!response.ok) throw new Error(typeof data.error === 'string' ? data.error : 'Couldn’t complete this action. Try again.');
  return data as T;
}

function HomeNudgeCard({ nudge, busy, canOpen, onAction }: {
  nudge: HomeNudge; busy: boolean; canOpen: boolean;
  onAction: (nudge: HomeNudge, action: 'primary' | 'dismiss' | 'decline') => Promise<void>;
}) {
  const sharedEvent = nudge.nudge_type === 'shared_upcoming_event' && nudge.beacon_id;
  const confirmation = nudge.nudge_type === 'hangout_confirm' && typeof nudge.payload.confirmation_id === 'string';
  return <article className="fc-card rounded-2xl p-5">
    <h2 className="break-words text-xl font-bold">{nudge.headline}</h2><p className="mt-2 break-words text-on-surface-variant">{nudge.body}</p>
    <div className="mt-4 flex flex-wrap items-center gap-3">
      {sharedEvent ? <Link className="rounded-xl bg-primary px-4 py-2 font-semibold text-on-primary" href={`/e/${encodeURIComponent(nudge.beacon_id!)}`} onClick={() => {
        void postAction(`/api/me/nudges/${encodeURIComponent(nudge.id)}/acted`).catch(() => undefined);
      }}>View event</Link> : <button type="button" disabled={busy || (!confirmation && !canOpen)} className="rounded-xl bg-primary px-4 py-2 font-semibold text-on-primary disabled:opacity-50" onClick={() => void onAction(nudge, 'primary')}>
        {confirmation ? 'Confirm hangout' : nudge.nudge_type === 'wave' ? 'Wave back' : nudge.nudge_type === 'memory_prompt' ? 'Open conversation' : 'Say hi'}
      </button>}
      {confirmation ? <button type="button" disabled={busy} className="rounded-xl border-2 border-border-hard px-4 py-2 disabled:opacity-50" onClick={() => void onAction(nudge, 'decline')}>We weren’t together</button> : null}
      <button type="button" disabled={busy} className="px-3 py-2 text-sm underline disabled:opacity-50" onClick={() => void onAction(nudge, 'dismiss')}>Not now</button>
    </div>
  </article>;
}

export default function HomeSocialFeed({ userId, name, now, connections, onOpenChat, onOpenProfile, children }: {
  userId: string;
  name: string;
  now: number;
  connections: ConnectionRecord[];
  onOpenChat: (connection: ConnectionRecord) => void;
  onOpenProfile: (userId: string, connectionId: string) => void;
  children: ReactNode;
}) {
  const saved = useHomeSavedEvents(userId);
  const nearby = useHomeNearby(userId, now);
  const { data, error, mutate } = useSWR(['home-nudges', userId], () => fetchHomeData<{ nudges: HomeNudge[] }>('/api/me/nudges'), { refreshInterval: 60_000 });
  const [resolved, setResolved] = useState<Set<string>>(() => new Set());
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const [notice, setNotice] = useState('');
  const [actionError, setActionError] = useState('');
  const active = connections.filter((c) => isActiveChatListStatus(c.status));
  const nudges = (data?.nudges ?? []).filter((n) => !resolved.has(n.id));
  const opportunity = selectHomeOpportunity(saved.events, nudges, active, now, nearby.events);
  const secondary = nudges.find((n) => opportunity?.kind !== 'nudge' || opportunity.nudge.id !== n.id);
  const recent = active.filter((c) => c.chatKind !== 'group_clique').sort((a, b) =>
    (b.chatLastMessageAt ?? b.lastMessageAt ?? b.dateMet.getTime()) - (a.chatLastMessageAt ?? a.lastMessageAt ?? a.dateMet.getTime())).slice(0, 10);

  async function act(nudge: HomeNudge, action: 'primary' | 'dismiss' | 'decline') {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setActionError(''); setNotice('');
    try {
      const confirmationId = typeof nudge.payload.confirmation_id === 'string' ? nudge.payload.confirmation_id : null;
      if (action === 'dismiss') {
        await postAction(`/api/me/nudges/${encodeURIComponent(nudge.id)}/dismiss`);
      } else if (nudge.nudge_type === 'hangout_confirm' && confirmationId) {
        if (action === 'decline') {
          await postAction(`/api/hangouts/${encodeURIComponent(confirmationId)}/decline`);
          setNotice('Hangout declined. Nothing was added to your timeline.');
        } else {
          const result = await postAction<{ status: string; already_logged: boolean }>(`/api/hangouts/${encodeURIComponent(confirmationId)}/confirm`);
          setNotice(result.status === 'waiting' ? 'Confirmed. It will be added once you both confirm.' : result.already_logged ? 'Already on your timeline.' : 'Added to your shared timeline.');
        }
      } else if (nudge.nudge_type === 'wave' && nudge.connection_id) {
        const result = await postAction<{ already_waved_today: boolean }>(`/api/connections/${encodeURIComponent(nudge.connection_id)}/wave`);
        setNotice(result.already_waved_today ? 'You already waved today.' : 'You waved back.');
      } else {
        const connection = nudgeConnection(nudge, active);
        if (!connection) throw new Error('This conversation is no longer available.');
        onOpenChat(connection);
        await postAction(`/api/me/nudges/${encodeURIComponent(nudge.id)}/acted`);
      }
      setResolved((ids) => new Set([...ids, nudge.id]));
      void mutate((current) => current ? { nudges: current.nudges.filter((n) => n.id !== nudge.id) } : current, { revalidate: false });
    } catch (e) { setActionError(e instanceof Error ? e.message : 'Couldn’t complete this action. Try again.'); }
    finally { inFlight.current = false; setBusy(false); }
  }

  return <>
    <header><h2 className="text-3xl font-bold tracking-tight">{homeGreeting(name, now)}</h2><p className="mt-2 text-on-surface-variant">Ready to connect today?</p><Link href="/?tab=chat" className="mt-4 inline-block rounded-xl border-2 border-border-hard px-4 py-3 font-semibold">Find a conversation</Link></header>
    {children}
    {error ? <p role="alert" className="text-sm">Couldn’t refresh your social suggestions. <button type="button" className="underline" onClick={() => void mutate()}>Retry</button></p> : null}
    {actionError ? <p role="alert">{actionError}</p> : null}
    {notice ? <p role="status">{notice}</p> : null}
    {opportunity?.kind === 'event' ? <article className="fc-card rounded-2xl p-5"><p className="text-sm font-semibold text-primary">{opportunity.nearby ? 'Happening near you' : 'Your saved event'}</p><h2 className="mt-2 break-words text-2xl font-bold">{opportunity.event.title || 'Event'}</h2><p className="mt-2 text-on-surface-variant">{new Date(opportunity.event.event_start_at!).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</p><Link href={`/e/${encodeURIComponent(opportunity.event.beacon_id)}`} className="mt-4 inline-block rounded-xl bg-primary px-4 py-2 font-semibold text-on-primary">View event</Link></article>
      : opportunity?.kind === 'nudge' ? <HomeNudgeCard nudge={opportunity.nudge} busy={busy} canOpen={!!nudgeConnection(opportunity.nudge, active)} onAction={act} />
      : opportunity?.kind === 'sayHi' ? <article className="fc-card rounded-2xl p-5"><h2 className="text-xl font-bold">Say hi to {opportunity.connection.name}</h2><p className="mt-2 text-on-surface-variant">Start your conversation before this connection moves to your archive.</p><button type="button" onClick={() => onOpenChat(opportunity.connection)} className="mt-4 rounded-xl bg-primary px-4 py-2 font-semibold text-on-primary">Say hi</button></article>
      : !data && !error ? <div role="status" className="min-h-32 rounded-2xl bg-surface p-5 text-on-surface-variant">Finding your next opportunity…</div> : null}
    {recent.length ? <section aria-label="Recent connections" className="fc-card min-w-0 rounded-2xl p-5"><div className="flex items-center justify-between gap-3"><h2 className="text-xl font-bold">Recent connections</h2><Link href="/?tab=chat" className="text-sm text-primary underline">See all</Link></div><ul className="mt-4 flex gap-4 overflow-x-auto pb-2">{recent.map((person) => <li key={person.id} className="w-20 shrink-0"><button type="button" className="w-full rounded-xl p-1 text-center hover:bg-surface-variant" onClick={() => person.otherUserId ? onOpenProfile(person.otherUserId, person.id) : onOpenChat(person)} aria-label={`Open ${person.name}`}><span className="mx-auto flex size-14 items-center justify-center rounded-full border-2 border-border-hard bg-surface text-lg font-bold text-primary">{person.name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('')}</span><span className="mt-2 block truncate text-sm font-semibold">{person.name.split(/\s+/)[0]}</span></button></li>)}</ul></section> : null}
    {secondary ? <HomeNudgeCard nudge={secondary} busy={busy} canOpen={!!nudgeConnection(secondary, active)} onAction={act} /> : null}
    <HomeActivityRecap userId={userId} />
    <HomeSavedEvents userId={userId} now={now} promotedEventId={opportunity?.kind === 'event' && !opportunity.nearby ? opportunity.event.beacon_id : undefined} />
    <section aria-label="Nearby discovery" className="fc-card rounded-2xl p-5">
      <h2 className="text-xl font-bold">Nearby</h2>
      {nearby.locationMessage ? <p className="mt-2 text-sm text-on-surface-variant">{nearby.locationMessage}</p>
        : nearby.error ? <p role="alert" className="mt-2 text-sm">Couldn’t refresh nearby activity. <button type="button" className="underline" onClick={() => void nearby.mutate()}>Retry</button></p>
        : !nearby.data ? <p role="status" className="mt-2 text-sm">Loading nearby activity…</p> : null}
      {!nearby.locationMessage && nearby.data ? <p className="mt-3">{nearby.beaconCount} beacons · {nearby.hubCount} community hubs{nearby.error ? ' · Previously loaded' : ''}</p> : null}
      <div className="mt-3 flex flex-wrap gap-4"><Link href="/?tab=map" className="font-semibold text-primary underline">Open Map</Link><Link href="/?tab=hubs" className="font-semibold text-primary underline">Explore hubs</Link></div>
    </section>
  </>;
}
