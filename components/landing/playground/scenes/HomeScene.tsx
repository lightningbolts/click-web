'use client';

import { useState } from 'react';
import { CardVisualHero } from '@/components/ui/CardVisualSurface';
import { PlaygroundAvatar } from '../DeviceChrome';
import { DEMO_USER_NAME, PLAYGROUND_EVENTS, PLAYGROUND_PEOPLE } from '../mockData';
import type { PlaygroundActions, PlaygroundState } from '../types';

/** Local fixtures, presented in the same order as HomeSocialFeed and the iOS home screen. */
export default function HomeScene({ state, actions, phone = false }: {
  state: PlaygroundState; actions: PlaygroundActions; phone?: boolean;
}) {
  const [query, setQuery] = useState('');
  const connected = PLAYGROUND_PEOPLE.filter((p) => state.connectedIds.has(p.id));
  const matches = (text: string) => text.toLowerCase().includes(query.trim().toLowerCase());
  const events = PLAYGROUND_EVENTS.filter((e) => matches(`${e.title} ${e.venue}`));
  const saved = events.filter((e) => state.rsvpIds.has(e.id));
  const plans = connected.flatMap((person) => (state.messages[person.id] ?? [])
    .filter((m) => m.plan?.going).map((m) => ({ id: m.id, person, plan: m.plan! })));
  const openChat = (id: string) => {
    actions.setOpenChatId(id);
    actions.setDashboardTab('clicks');
    if (phone) actions.setScene('clicks');
  };
  const explore = (tab: 'events' | 'map' | 'hubs', eventId?: string) => {
    if (eventId) actions.setSelectedEventId(eventId);
    actions.setDashboardTab(tab);
    if (phone) actions.setScene(tab);
  };
  return <div data-testid="playground-scene-home" className={phone ? 'h-full space-y-4 overflow-auto p-3' : 'space-y-4'}>
    <header className="border border-hairline bg-surface rounded-2xl p-4">
      <h3 className="text-xl font-bold">Hello, {DEMO_USER_NAME.split(' ')[0]}.</h3>
      <p className="mt-1 text-sm text-fg-secondary">Ready to connect today?</p>
      <button type="button" className="mt-3 text-sm font-semibold text-accent underline" onClick={() => {
        actions.setOpenChatId(null); actions.setDashboardTab('clicks');
        if (phone) actions.setScene('clicks');
      }}>Find a conversation</button>
    </header>
    {phone ? <input aria-label="Search people, places, events" placeholder="Search people, places, events…" className="rounded-lg border border-hairline bg-surface-raised text-fg outline-none focus:ring-2 focus:ring-accent w-full px-3 py-3 text-sm" value={query} onChange={(e) => setQuery(e.target.value)} /> : null}
    <section className="border border-hairline bg-surface rounded-2xl p-4">
      <h4 className="font-bold">I’m down for…</h4>
      <p className="mt-1 text-xs text-fg-secondary">Share an intent. Your connections can see it while it’s active.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {['Coffee', 'Study session', 'Walk', 'Live music'].map((intent) => <button key={intent} type="button" aria-pressed={state.intents.has(intent)} onClick={() => actions.toggleIntent(intent)} className={`min-h-9 rounded-full border-2 px-3 text-xs font-semibold ${state.intents.has(intent) ? 'border-action bg-action text-on-action' : 'border-hairline bg-surface'}`}>{intent}</button>)}
      </div>
      {state.intents.has('Coffee') ? <p className="mt-3 text-xs text-fg-secondary">Maya is also down for coffee. <button type="button" className="font-semibold text-accent underline" onClick={() => openChat('maya')}>Plan together</button></p> : null}
    </section>
    <section className="border border-hairline bg-surface rounded-2xl p-4" aria-label="Recent connections">
      <h4 className="font-bold">Recent connections</h4>
      <ul className="mt-3 flex gap-3 overflow-x-auto">
        {connected.filter((p) => matches(`${p.name} ${state.memories[p.id]?.place ?? p.memory?.place ?? ''}`)).map((p) => <li key={p.id} className="w-16 shrink-0"><button type="button" aria-label={`Say hi to ${p.name}`} onClick={() => openChat(p.id)} className="w-full rounded-xl py-1 text-center hover:bg-surface-raised"><PlaygroundAvatar initials={p.initials} /><span className="mt-1 block truncate text-xs font-semibold">{p.name.split(' ')[0]}</span></button></li>)}
      </ul>
    </section>
    <section data-testid="playground-coming-up" className="border border-hairline bg-surface rounded-2xl p-4">
      <h4 className="font-bold">Coming up</h4>
      <p className="mt-1 text-xs text-fg-secondary">Plans from your chats and events you RSVP’d to</p>
      <ul className="mt-3 space-y-2">{plans.map(({ id, person, plan }) => <li key={id}><button type="button" className="w-full rounded-xl bg-selection p-3 text-left text-accent" onClick={() => openChat(person.id)}><p className="text-sm font-bold">{plan.title} with {person.name.split(' ')[0]}</p><p className="text-xs">{plan.when} · {plan.place}</p></button></li>)}{saved.map((e) => <li key={e.id}><button type="button" onClick={() => explore('events', e.id)} className="w-full rounded-xl bg-selection p-3 text-left text-accent"><p className="text-sm font-bold">{e.title}</p><p className="text-xs">{e.when} · {e.venue}</p></button></li>)}</ul>
      {!plans.length && !saved.length ? <p className="mt-3 text-xs text-fg-secondary">Nothing planned yet. Send a plan from a chat.</p> : null}
    </section>
    <section aria-label="Explore nearby">
      <h4 className="mb-3 font-bold">Explore nearby</h4>
      <div className="grid gap-3 sm:grid-cols-2">{events.map((e) => <button key={e.id} type="button" onClick={() => explore('events', e.id)} className="overflow-hidden rounded-2xl border-2 border-hairline bg-surface text-left"><CardVisualHero id={e.id} chipLabel="Event" className="h-20" /><div className="p-3"><p className="text-sm font-bold">{e.title}</p><p className="mt-1 text-xs text-fg-secondary">{e.when} · {e.venue}</p></div></button>)}</div>
      {query && !events.length ? <p className="text-sm text-fg-secondary">No matching events.</p> : null}
      <div className="mt-3 flex flex-wrap gap-4"><button type="button" onClick={() => explore('map')} className="text-sm font-semibold text-accent underline">Open Map</button><button type="button" onClick={() => explore('hubs')} className="text-sm font-semibold text-accent underline">Explore hubs</button></div>
    </section>
  </div>;
}
