'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { ConnectionRecord } from './ConnectionTable';
import { contextualIcebreaker, sendHomeIcebreaker } from '@/lib/dashboard/homeActions';
import { buildConnectionInsights } from '@/lib/dashboard/connectionInsights';
import { connectionRecordToArchiveRow, formatArchiveCountdownLabel, getArchiveCountdown, shouldShowArchiveWarning } from '@/lib/dashboard/connectionStatus';

export default function HomeConnectionInsights({ connections, now, onOpenChat, userId }: {
  userId?: string;
  connections: ConnectionRecord[];
  now: number;
  onOpenChat: (connection: ConnectionRecord) => void;
}) {
  const insights = useMemo(() => buildConnectionInsights(connections, now), [connections, now]);
  const [dismissed, setDismissed] = useState<string[]>([]);
  const reminders = insights.reminders.filter((r) => !dismissed.includes(r.connection.id));
  const archiveWarning = connections
    .filter((c) => c.chatKind !== 'group_clique')
    .map((connection) => ({ connection, countdown: getArchiveCountdown(connectionRecordToArchiveRow(connection), now) }))
    .filter((item) => item.countdown && shouldShowArchiveWarning(item.countdown))
    .sort((a, b) => a.countdown!.deadlineMs - b.countdown!.deadlineMs)[0];
  const [sending, setSending] = useState<string | null>(null);
  const [sent, setSent] = useState<string[]>([]);
  const [sendError, setSendError] = useState('');
  const inFlight = useRef(false);
  const cooldown = useRef(0);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const places = useMemo(() => {
    const groups = new Map<string, ConnectionRecord[]>();
    for (const connection of connections.filter((c) => c.chatKind !== 'group_clique')) {
      const place = connection.location.trim() || 'Other places';
      groups.set(place, [...(groups.get(place) ?? []), connection]);
    }
    return [...groups.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
  }, [connections]);
  async function sendPrompt(connection: ConnectionRecord) {
    if (!userId || inFlight.current) return;
    if (Date.now() < cooldown.current) { setSendError('Wait a few seconds before sending another icebreaker.'); return; }
    inFlight.current = true; setSending(connection.id); setSendError('');
    try {
      await sendHomeIcebreaker(connection, userId, contextualIcebreaker(connection));
      cooldown.current = Date.now() + 15_000;
      if (mounted.current) setSent((ids) => [...ids, connection.id]);
    } catch (e) { if (mounted.current) setSendError((e as Error).message); }
    finally { inFlight.current = false; if (mounted.current) setSending(null); }
  }
  return <section className="space-y-4" aria-label="Your connections">
    {archiveWarning?.countdown ? <div className="fc-card flex flex-wrap items-center gap-3 rounded-2xl p-5">
      <div className="flex-1"><h2 className="font-bold">Keep the conversation going with {archiveWarning.connection.name}</h2><p className="text-sm text-on-surface-variant">{formatArchiveCountdownLabel(archiveWarning.countdown)} before this connection moves to your archive.</p></div>
      <button type="button" className="rounded-xl bg-primary px-4 py-2 font-semibold text-white" onClick={() => onOpenChat(archiveWarning.connection)}>Open chat</button>
    </div> : null}
    <details className="fc-card rounded-2xl p-5">
      <summary className="cursor-pointer text-xl font-bold">Connection insights</summary>
      <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
        {([
          ['Connections', insights.total], ['Active in the last week', insights.active],
          ['Dormant connections', insights.dormant], ['Kept connections', insights.kept],
          ['Keep rate', `${insights.keepRate}%`], ['New this week', insights.thisWeek],
        ] as const).map(([label, value]) => <div key={label}><dt className="text-sm text-on-surface-variant">{label}</dt><dd className="text-2xl font-bold">{value}</dd></div>)}
      </dl>
    </details>
    {reminders.length > 0 ? <div className="fc-card rounded-2xl p-5">
      <h2 className="text-xl font-bold">Keep in touch</h2>
      <p className="mt-1 text-sm text-on-surface-variant">Pick up where you left off.</p>
      <ul className="mt-4 divide-y divide-border-hard">
        {reminders.map(({ connection, days }) => <li key={connection.id} className="flex flex-wrap items-center gap-3 py-3">
          <div className="min-w-0 flex-1"><p className="break-words font-semibold">{connection.name}</p><p className="text-sm text-on-surface-variant">{days} days since your last conversation</p></div>
          <button type="button" className="rounded-xl bg-primary px-4 py-2 font-semibold text-white" onClick={() => onOpenChat(connection)}>Chat</button>
          {userId ? <div className="basis-full rounded-xl border-2 border-border-hard p-3"><p className="text-sm">{contextualIcebreaker(connection)}</p><button type="button" disabled={!!sending || sent.includes(connection.id)} onClick={() => void sendPrompt(connection)} className="mt-2 text-sm font-semibold text-primary underline disabled:opacity-50">{sent.includes(connection.id) ? 'Icebreaker sent' : sending === connection.id ? 'Sending…' : 'Send icebreaker'}</button></div> : null}
          <button type="button" className="px-2 py-2 text-sm underline" aria-label={`Dismiss reminder for ${connection.name}`} onClick={() => setDismissed((ids) => [...ids, connection.id])}>Dismiss</button>
        </li>)}
      </ul>
    </div> : null}
    {sendError ? <p role="alert" className="text-sm">{sendError}</p> : null}
    {places.length ? <div className="fc-card rounded-2xl p-5"><h2 className="text-xl font-bold">Where you connected</h2><div className="mt-3 space-y-3">{places.map(([place, people]) => <details key={place}><summary className="cursor-pointer font-semibold">{place} · {people.length}</summary><ul className="mt-2 flex flex-wrap gap-2">{people.map((person) => <li key={person.id}><button type="button" className="rounded-xl border-2 border-border-hard px-3 py-2 text-sm" onClick={() => onOpenChat(person)}>{person.name}</button></li>)}</ul></details>)}</div></div> : null}
  </section>;
}
