'use client';

import { useState } from 'react';
import { PlusCircle, UserCircle } from 'lucide-react';
import { appNavItems } from '@/lib/shell/appNav';
import type { DashboardTab, PlaygroundActions, PlaygroundState } from '../types';
import ChatPane from './ChatPane';
import IdentityPane from './IdentityPane';
import MapScene from './MapScene';
import HomeScene from './HomeScene';
import EventsScene from './EventsScene';
import HubsScene from './HubsScene';
import SettingsScene from './SettingsScene';

// Use the current product's top-level sections; Add Click and Me are account actions.
const TABS = [
  ...appNavItems({ managesPlaces: false }),
  { id: 'add' as const, label: 'Add Click', icon: PlusCircle },
  { id: 'me' as const, label: 'Me', icon: UserCircle },
];

export default function DashboardScene({ state, actions }: {
  state: PlaygroundState; actions: PlaygroundActions;
}) {
  const [announcement, setAnnouncement] = useState('');
  return <div className="flex h-full min-h-0 flex-col bg-bg text-fg" data-testid="playground-scene-dashboard">
    <header className="flex shrink-0 items-center justify-between gap-3 border-b border-hairline bg-surface px-4 py-3">
      <span className="text-lg font-extrabold text-accent">Click</span>
      <span className="text-xs text-fg-secondary">Your people. Your places.</span>
    </header>
    <nav role="tablist" aria-label="Dashboard tabs" className="flex shrink-0 gap-1 overflow-x-auto border-b border-hairline bg-surface px-2 py-2">
      {TABS.map((tab) => { const Icon = tab.icon; const selected = state.dashboardTab === tab.id;
        return <button key={tab.id} type="button" role="tab" aria-selected={selected} onClick={() => { actions.setDashboardTab(tab.id as DashboardTab); if (tab.id !== 'clicks') actions.setOpenChatId(null); }} className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold ${selected ? 'bg-selection text-accent' : 'text-fg-secondary hover:bg-surface-raised'}`}><Icon className="h-4 w-4" /><span>{tab.label}</span></button>;
      })}
    </nav>
    <div className="min-h-0 flex-1 overflow-hidden p-3 sm:p-4">
      {state.dashboardTab === 'home' ? <div className="h-full overflow-auto"><HomeScene state={state} actions={actions} /></div> : null}
      {state.dashboardTab === 'map' ? <MapScene state={state} actions={actions} /> : null}
      {state.dashboardTab === 'clicks' ? <ChatPane state={state} actions={actions} compact /> : null}
      {state.dashboardTab === 'add' ? <div className="h-full overflow-auto"><IdentityPane /><p className="mt-3 text-sm text-fg-secondary">Tap to Connect needs the app. Bluetooth, sound and location confirm you’re really together.</p><button type="button" className="mt-3 text-accent underline" onClick={() => actions.setDashboardTab('hubs')}>Join a hub</button></div> : null}
      {state.dashboardTab === 'events' ? <EventsScene state={state} actions={actions} onAnnounce={setAnnouncement} /> : null}
      {state.dashboardTab === 'hubs' ? <HubsScene state={state} actions={actions} /> : null}
      {state.dashboardTab === 'me' ? <SettingsScene /> : null}
    </div>
    <p role="status" className="sr-only">{announcement}</p>
  </div>;
}
