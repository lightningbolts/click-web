'use client';

import { motion } from 'framer-motion';
import {
  BookOpen,
  Calendar,
  Flame,
  Heart,
  MapPin,
  MessageCircle,
  QrCode,
  Search,
  Sparkles,
  Target,
  Users,
  Zap,
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
  const milestoneTarget = 5;
  const firstFiveUnlocked = connected.length >= 5;

  return (
    <div className="flex h-full min-h-0 flex-col bg-background text-on-surface" data-testid="playground-scene-dashboard">
      <div className="shrink-0 px-4 pt-5 pb-3 md:px-6">
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-2"
        >
          <Sparkles className="h-4 w-4 text-primary" />
          <div>
            <h2 className="text-xl font-bold">
              Welcome back, <span className="text-primary">{DEMO_USER_NAME.split(' ')[0]}</span>
            </h2>
            <p className="text-xs text-on-surface-variant">Your digital memory box</p>
          </div>
        </motion.div>
      </div>

      <div className="flex min-h-0 flex-1 items-stretch">
        <nav
          className="flex w-28 shrink-0 flex-col gap-1 self-stretch border-r border-border-hard bg-surface p-2 sm:w-40"
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
                    ? 'bg-primary-container text-on-primary-container'
                    : 'text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface'
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
            <motion.div
              className="grid grid-cols-2 gap-3 md:grid-cols-4"
              initial="hidden"
              animate="visible"
              variants={{
                hidden: { opacity: 0 },
                visible: { opacity: 1, transition: { staggerChildren: 0.1 } },
              }}
            >
              <StatCard icon={Users} label="Total Connections" value={connected.length} trend="+2" />
              <StatCard icon={Calendar} label="This Month" value={connected.length} />
              <StatCard icon={Flame} label="Connection Streak" value="4 days" accent="text-secondary" />
              <StatCard icon={Heart} label="Retention Rate" value="100%" accent="text-primary" />
            </motion.div>

            <div className="rounded-[16px] border border-border-hard bg-surface p-4">
              <p className="text-sm font-semibold text-on-surface">Availability</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <span className="rounded-full bg-secondary px-3 py-1 text-[11px] font-semibold text-on-secondary">
                  Coffee
                </span>
                <span className="text-xs text-on-surface-variant">Fri afternoon</span>
              </div>
              <p className="mt-2 text-xs font-medium text-amber-800 dark:text-amber-100">
                Maya Chen overlaps Friday afternoon.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <p className="mb-2 text-xs font-medium text-on-surface-variant">Recent Achievements</p>
                <div className="rounded-[12px] border border-border-hard bg-surface p-3">
                  <p className="text-sm font-semibold text-on-surface">First Click</p>
                  <p className="text-xs text-on-surface-variant">You met someone in the same room.</p>
                </div>
              </div>
              <div>
                <p className="mb-2 text-xs font-medium text-on-surface-variant">Next Milestone</p>
                <div className="rounded-[12px] border border-border-hard bg-surface p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="inline-flex items-center gap-1 text-sm font-medium">
                      <Target className="h-4 w-4 text-primary" /> First Five
                    </span>
                    <span className="text-xs text-on-surface-variant">
                      {connected.length}/{milestoneTarget}
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-surface-container">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.min((connected.length / milestoneTarget) * 100, 100)}%` }}
                      transition={{ duration: 1, ease: 'easeOut' }}
                      className="h-full bg-primary"
                    />
                  </div>
                  <p className="mt-2 flex items-center gap-1 text-xs text-on-surface-variant">
                    <Zap className="h-3 w-3 text-secondary" />
                    {firstFiveUnlocked ? 'Unlocked.' : 'Tap Jordan in the app to hit five.'}
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-[16px] border border-border-hard bg-surface p-4">
              <p className="text-sm font-semibold text-on-surface">This week</p>
              <p className="text-xs text-on-surface-variant">
                {connected.length} Clicks · UW campus · {rsvps.length} upcoming event
                {rsvps.length === 1 ? '' : 's'}
              </p>
              {rsvps.length > 0 ? (
                <ul className="mt-3 space-y-2">
                  {rsvps.map((event) => (
                    <li
                      key={event.id}
                      className="rounded-[12px] border border-border-hard bg-secondary-container px-3 py-2"
                    >
                      <p className="text-sm font-semibold text-on-secondary-container">{event.title}</p>
                      <p className="text-xs text-on-secondary-container">
                        {event.when} · {event.venue}
                      </p>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>

            <div className="rounded-[16px] border border-border-hard bg-surface p-4">
              <div className="mb-4 flex items-center gap-3">
                <div className="rounded-xl bg-primary/20 p-2">
                  <Users className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h3 className="text-lg font-bold">People I&apos;ve Met</h3>
                  <p className="text-xs text-on-surface-variant">
                    Total {connected.length} · Kept {kept} · Active {connected.length - kept}
                  </p>
                </div>
              </div>
              <div className="relative mb-3">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-on-surface-variant" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search by name, place, or event…"
                  className="fc-input w-full py-2.5 pl-10 pr-3"
                  aria-label="Search connections"
                />
              </div>
              <div className="overflow-x-auto rounded-[12px] border border-border-hard">
                <table className="w-full min-w-[520px] text-left text-sm">
                  <thead className="bg-surface-container text-[11px] uppercase tracking-wider text-on-surface-variant">
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
                          className="cursor-pointer border-t border-border-hard hover:bg-surface-container"
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
                          <td className="px-3 py-2.5 text-on-surface-variant">{person.dateMet}</td>
                          <td className="px-3 py-2.5 text-on-surface-variant">{memory?.place ?? '—'}</td>
                          <td className="px-3 py-2.5">
                            {memory ? (
                              <span className="flex flex-col gap-0.5 text-xs">
                                <span>{memory.label}</span>
                                <span className="flex items-center gap-1.5 text-on-surface-variant">
                                  {memory.weather} <VolumeBars count={memory.volume} />
                                </span>
                              </span>
                            ) : (
                              '—'
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
              <p className="mt-3 text-center text-[11px] text-outline">
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

function StatCard({
  icon: Icon,
  label,
  value,
  trend,
  accent,
}: {
  icon: typeof Users;
  label: string;
  value: string | number;
  trend?: string;
  accent?: string;
}) {
  return (
    <motion.div
      variants={{ hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } }}
      className="rounded-[16px] border border-border-hard bg-surface p-3"
    >
      <div className="mb-2 flex items-start justify-between">
        <span className="rounded-xl bg-primary/15 p-2">
          <Icon className={`h-4 w-4 ${accent ?? 'text-primary'}`} />
        </span>
        {trend ? <span className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">{trend}</span> : null}
      </div>
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-xs text-on-surface-variant">{label}</p>
    </motion.div>
  );
}
