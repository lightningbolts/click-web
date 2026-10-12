'use client';

import { useState } from 'react';
import { CardVisualHero } from '@/components/ui/CardVisualSurface';
import type { PlaygroundActions, PlaygroundState } from '../types';

export default function HubsScene({ state, actions }: { state: PlaygroundState; actions: PlaygroundActions }) {
  const [discovered, setDiscovered] = useState(false);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  return <div data-testid="playground-scene-hubs" className="h-full space-y-4 overflow-auto p-3">
    <h3 className="text-xl font-bold">Community Hubs</h3>
    {open ? <>
      <button type="button" className="text-sm text-accent underline" onClick={() => setOpen(false)}>Back to hubs</button>
      <section className="border border-hairline bg-surface rounded-2xl p-4">
        <h4 className="font-bold">Kane Hall community</h4>
        <p className="mt-1 text-xs text-fg-secondary">Venue hub · 12 participants</p>
        <p className="mt-3 text-xs text-fg-secondary">In Click, location is checked when you join or send. This demo simulates being at Kane Hall.</p>
        <ul className="my-4 space-y-2" aria-label="Hub messages">
          <li className="rounded-xl bg-surface-raised p-3 text-sm"><strong>Maya</strong><p>Anyone heading to the mixer after class?</p></li>
          {state.hubMessages.map((text, i) => <li key={i} className="rounded-xl bg-selection p-3 text-sm text-accent"><strong>You</strong><p className="break-words">{text}</p></li>)}
        </ul>
        <form onSubmit={(e) => { e.preventDefault(); actions.sendHubMessage(draft); setDraft(''); }} className="flex gap-2">
          <input className="rounded-lg border border-hairline bg-surface-raised text-fg outline-none focus:ring-2 focus:ring-accent min-w-0 flex-1 px-3 py-2" aria-label="Hub message" placeholder="Message the hub…" value={draft} onChange={(e) => setDraft(e.target.value)} />
          <button className="rounded-pill bg-action font-semibold text-on-action disabled:opacity-40 px-3 py-2" disabled={!draft.trim()}>Send</button>
        </form>
      </section>
    </> : <>
      <section className="border border-hairline bg-surface rounded-2xl p-4"><h4 className="font-bold">Meet your local community</h4><p className="my-3 text-sm text-fg-secondary">Discover nearby spaces and join the conversation while you’re there.</p><button type="button" className="rounded-pill bg-action font-semibold text-on-action disabled:opacity-40 px-4 py-2" onClick={() => setDiscovered(true)}>Find nearby hubs</button></section>
      {discovered || state.joinedHub ? <article className="overflow-hidden rounded-2xl border-2 border-hairline bg-surface"><CardVisualHero id="kane-hall-community" className="h-24" chipLabel="Community hub" /><div className="p-4"><h4 className="font-bold">Kane Hall community</h4><p className="my-3 text-sm text-fg-secondary">12 participants · 4 m away</p><button type="button" className="rounded-pill border border-hairline bg-surface font-semibold text-fg px-4 py-2" onClick={() => { actions.joinHub(); setOpen(true); }}>{state.joinedHub ? 'Open hub' : 'Join hub'}</button></div></article> : null}
    </>}
  </div>;
}
