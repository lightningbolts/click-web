'use client';

import { m as motion } from 'framer-motion';
import {
  BookOpen,
  MapPin,
  MessageCircle,
  QrCode,
  Search,
  Users,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { PlaygroundAvatar, VolumeBars } from '../DeviceChrome';
import { DEMO_USER_NAME, PLAYGROUND_EVENTS, PLAYGROUND_PEOPLE } from '../mockData';
import type { DashboardTab, PlaygroundActions, PlaygroundState } from '../types';
import ChatPane from './ChatPane';
import IdentityPane from './IdentityPane';
import MapScene from './MapScene';

const TABS: { id: DashboardTab; label: string; icon: typeof BookOpen }[] = [
  { id: 'memory', label: 'Memory Box', icon: BookOpen },
  { id: 'map', label: 'Map', icon: MapPin },
  { id: 'chat', label: 'Chat', icon: MessageCircle },
  { id: 'identity', label: 'QR Identity', icon: QrCode },
];

export default function DashboardScene({
  state,
  actions,
}: {
  state: PlaygroundState;
  actions: PlaygroundActions;
}) {
  const connected = PLAYGROUND_PEOPLE.filter((p) => state.connectedIds.has(p.id));
  const rsvps = PLAYGROUND_EVENTS.filter((e) => state.rsvpIds.has(e.id));
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return connected;
    return connected.filter((p) => {
      const memory = state.memories[p.id] ?? p.memory;
      return (
        p.name.toLowerCase().includes(q) ||
        (memory?.place ?? '').toLowerCase().includes(q) ||
        (memory?.label ?? '').toLowerCase().includes(q)
      );
    });
  }, [connected, query, state.memories]);

  const kept = connected.filter((p) => p.status === 'kept').length;
  const recent = [...connected].reverse().slice(0, 4);
  const upcoming = [
    ...connected.flatMap((person) =>
      (state.messages[person.id] ?? [])
        .filter((m) => m.plan?.going)
        .map((m) => ({
          key: m.id,
          title: `${m.plan!.title} with ${person.name.split(' ')[0]}`,
          detail: `${m.plan!.when} · ${m.plan!.place}`,
        })),
    ),
    ...rsvps.map((event) => ({ key: event.id, title: event.title, detail: `${event.when} · ${event.venue}` })),
  ];

  return (
    <div className="flex h-full min-h-0 flex-col bg-bg text-fg" data-testid="playground-scene-dashboard">
      <div className="shrink-0 px-4 pt-5 pb-3 md:px-6">
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-2"
        >
          <div>
            <h2 className="text-xl font-bold">
              Welcome back, <span className="text-accent">{DEMO_USER_NAME.split(' ')[0]}</span>
            </h2>
            <p className="text-xs text-fg-secondary">Your digital memory box</p>
          </div>
        </motion.div>
      </div>

      <div className="flex min-h-0 flex-1 items-stretch">
        <nav
          className="flex w-28 shrink-0 flex-col gap-1 self-stretch border-r border-hairline bg-surface p-2 sm:w-40"
          role="tablist"
          aria-label="Dashboard tabs"
        >
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const selected = state.dashboardTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => {
                  actions.setDashboardTab(tab.id);
                  if (tab.id !== 'chat') actions.setOpenChatId(null);
                }}
                className={`flex items-center gap-2 rounded-[8px] px-2 py-2 text-left text-xs font-semibold sm:px-3 sm:text-sm ${
                  selected
                    ? 'bg-selection text-accent'
                    : 'text-fg-secondary hover:bg-surface-raised hover:text-fg'
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="truncate">{tab.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="min-h-0 min-w-0 flex-1 overflow-hidden px-4 py-5 md:px-6">
        {state.dashboardTab === 'memory' ? (
            <div className="h-full space-y-6 overflow-y-auto">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="rounded-[16px] border border-hairline bg-surface p-4" data-testid="playground-coming-up">
                <p className="text-sm font-semibold text-fg">Coming up</p>
                <p className="text-xs text-fg-secondary">Plans from your chats and events you RSVP’d to</p>
                {upcoming.length === 0 ? (
                  <p className="mt-3 text-xs text-fg-secondary">Nothing planned yet. Send a plan from a chat.</p>
                ) : (
                  <ul className="mt-3 space-y-2">
                    {upcoming.map((item) => (
                      <li key={item.key} className="rounded-[12px] border border-hairline bg-selection px-3 py-2">
                        <p className="text-sm font-semibold text-accent">{item.title}</p>
                        <p className="text-xs text-accent">{item.detail}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="rounded-[16px] border border-hairline bg-surface p-4">
                <p className="text-sm font-semibold text-fg">Recent connections</p>
                <ul className="mt-3 space-y-2">
                  {recent.map((person) => {
                    const memory = state.memories[person.id] ?? person.memory;
                    return (
                      <li key={person.id}>
                        <button
                          type="button"
                          onClick={() => {
                            actions.setOpenChatId(person.id);
                            actions.setDashboardTab('chat');
                          }}
                          className="flex w-full items-center gap-2.5 rounded-[10px] px-1.5 py-1 text-left hover:bg-surface-raised"
                        >
                          <PlaygroundAvatar initials={person.initials} size="sm" online={person.online} />
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-semibold text-fg">{person.name}</span>
                            <span className="block truncate text-xs text-fg-secondary">
                              {memory ? `${memory.label} · ${memory.place}` : person.dateMet}
                            </span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </div>

            <div className="rounded-[16px] border border-hairline bg-surface p-4">
              <p className="text-sm font-semibold text-fg">Availability</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <span className="rounded-full bg-action px-3 py-1 text-[11px] font-semibold text-on-action">
                  Coffee
                </span>
                <span className="text-xs text-fg-secondary">Fri afternoon</span>
              </div>
              <p className="mt-2 text-xs font-medium text-fg">
                Maya Chen overlaps Friday afternoon.
              </p>
            </div>

            <div className="rounded-[16px] border border-hairline bg-surface p-4">
              <div className="mb-4 flex items-center gap-3">
                <div className="rounded-xl bg-action/20 p-2">
                  <Users className="h-5 w-5 text-accent" />
                </div>
                <div>
                  <h3 className="text-lg font-bold">People I&apos;ve Met</h3>
                  <p className="text-xs text-fg-secondary">
                    Total {connected.length} · Kept {kept} · Active {connected.length - kept}
                  </p>
                </div>
              </div>
              <div className="relative mb-3">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-secondary" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search by name, place, or event…"
                  className="block w-full rounded-md bg-surface-raised text-fg outline-none placeholder:text-fg-tertiary focus:bg-surface focus:shadow-[0_0_0_2px_var(--accent)] w-full py-2.5 pl-10 pr-3"
                  aria-label="Search connections"
                />
              </div>
              <div className="overflow-x-auto rounded-[12px] border border-hairline">
                <table className="w-full min-w-[520px] text-left text-sm">
                  <thead className="bg-surface-raised text-[11px] uppercase tracking-wider text-fg-secondary">
                    <tr>
                      <th className="px-3 py-2 font-medium">Name</th>
                      <th className="px-3 py-2 font-medium">Date met</th>
                      <th className="px-3 py-2 font-medium">Location</th>
                      <th className="px-3 py-2 font-medium">Moment</th>
                      <th className="px-3 py-2 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((person) => {
                      const memory = state.memories[person.id] ?? person.memory;
                      return (
                        <tr
                          key={person.id}
                          className="cursor-pointer border-t border-hairline hover:bg-surface-raised"
                          onClick={() => {
                            actions.setOpenChatId(person.id);
                            actions.setDashboardTab('chat');
                          }}
                        >
                          <td className="px-3 py-2.5">
                            <span className="flex items-center gap-2">
                              <PlaygroundAvatar initials={person.initials} size="sm" online={person.online} />
                              <span className="font-semibold">{person.name}</span>
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-fg-secondary">{person.dateMet}</td>
                          <td className="px-3 py-2.5 text-fg-secondary">{memory?.place ?? '-'}</td>
                          <td className="px-3 py-2.5">
                            {memory ? (
                              <span className="flex flex-col gap-0.5 text-xs">
                                <span>{memory.label}</span>
                                <span className="flex items-center gap-1.5 text-fg-secondary">
                                  {memory.weather} <VolumeBars count={memory.volume} />
                                </span>
                              </span>
                            ) : (
                              '-'
                            )}
                          </td>
                          <td className="px-3 py-2.5">
                            <span
                              className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                                person.status === 'kept'
                                  ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                                  : 'bg-sky-500/10 text-sky-700 dark:text-sky-300'
                              }`}
                            >
                              {person.status === 'kept' ? 'Kept' : 'Active'}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="mt-3 text-center text-[11px] text-fg-tertiary">
                Your data belongs to you. Export anytime, delete anytime.
              </p>
            </div>
            </div>
          ) : null}

          {state.dashboardTab === 'map' ? (
            <div className="h-full min-h-0 overflow-hidden">
              <MapScene state={state} actions={actions} />
            </div>
          ) : null}
          {state.dashboardTab === 'chat' ? (
            <div className="h-full min-h-0">
              <ChatPane state={state} actions={actions} compact />
            </div>
          ) : null}
          {state.dashboardTab === 'identity' ? (
            <IdentityPane />
          ) : null}
        </div>
      </div>
    </div>
  );
}
