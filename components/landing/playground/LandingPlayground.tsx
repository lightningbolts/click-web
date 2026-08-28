'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { useCallback, useMemo, useState, type KeyboardEvent } from 'react';
import CompanionPanel from './CompanionPanel';
import { PhoneChrome, WebChrome } from './DeviceChrome';
import {
  INITIAL_CONNECTED_IDS,
  INITIAL_MESSAGES,
  INITIAL_RSVP_IDS,
  PLAYGROUND_PEOPLE,
} from './mockData';
import ConnectScene from './scenes/ConnectScene';
import ClicksScene from './scenes/ClicksScene';
import DashboardScene from './scenes/DashboardScene';
import EventsScene from './scenes/EventsScene';
import SettingsScene from './scenes/SettingsScene';
import PlaygroundMap from './PlaygroundMapLazy';
import type {
  ChatMessage,
  DashboardTab,
  MemoryCapsule,
  PlaygroundScene,
  PlaygroundState,
} from './types';

const SCENES: { id: PlaygroundScene; label: string }[] = [
  { id: 'connect', label: 'Connect' },
  { id: 'events', label: 'Events' },
  { id: 'dashboard', label: 'Dashboard' },
];

const seedMemories: Record<string, MemoryCapsule> = {};
for (const person of PLAYGROUND_PEOPLE) {
  if (person.memory) seedMemories[person.id] = person.memory;
}

export default function LandingPlayground() {
  const [scene, setScene] = useState<PlaygroundScene>('connect');
  const [dashboardTab, setDashboardTab] = useState<DashboardTab>('memory');
  const [openChatId, setOpenChatId] = useState<string | null>(null);
  const [connectedIds, setConnectedIds] = useState<Set<string>>(
    () => new Set(INITIAL_CONNECTED_IDS),
  );
  const [rsvpIds, setRsvpIds] = useState<Set<string>>(() => new Set(INITIAL_RSVP_IDS));
  const [routeIds, setRouteIds] = useState<Set<string>>(() => new Set());
  const [memories, setMemories] = useState<Record<string, MemoryCapsule>>(seedMemories);
  const [messages, setMessages] = useState<Record<string, ChatMessage[]>>(INITIAL_MESSAGES);
  const [announcement, setAnnouncement] = useState('');

  const state: PlaygroundState = useMemo(
    () => ({
      connectedIds,
      rsvpIds,
      routeIds,
      memories,
      messages,
      openChatId,
      dashboardTab,
    }),
    [connectedIds, rsvpIds, routeIds, memories, messages, openChatId, dashboardTab],
  );

  const connectPerson = useCallback((id: string, memory: MemoryCapsule) => {
    setConnectedIds((prev) => new Set(prev).add(id));
    setMemories((prev) => ({ ...prev, [id]: memory }));
    setMessages((prev) => ({
      ...prev,
      [id]: prev[id] ?? [
        {
          id: `click-${id}`,
          from: 'them',
          text: `Clicked at ${memory.place}.`,
          time: 'now',
        },
      ],
    }));
  }, []);

  const toggleRsvp = useCallback((eventId: string) => {
    setRsvpIds((prev) => {
      const next = new Set(prev);
      if (next.has(eventId)) next.delete(eventId);
      else next.add(eventId);
      return next;
    });
  }, []);

  const toggleRoute = useCallback((eventId: string) => {
    setRouteIds((prev) => {
      const next = new Set(prev);
      if (next.has(eventId)) next.delete(eventId);
      else next.add(eventId);
      return next;
    });
  }, []);

  const sendMessage = useCallback((personId: string, text: string) => {
    const msg: ChatMessage = {
      id: `you-${Date.now()}`,
      from: 'you',
      text,
      time: 'now',
    };
    setMessages((prev) => ({
      ...prev,
      [personId]: [...(prev[personId] ?? []), msg],
    }));
  }, []);

  const goToScene = useCallback((next: PlaygroundScene) => {
    setScene(next);
  }, []);

  const actions = useMemo(
    () => ({
      connectPerson,
      toggleRsvp,
      toggleRoute,
      sendMessage,
      setOpenChatId,
      setDashboardTab,
      setScene: goToScene,
    }),
    [connectPerson, toggleRsvp, toggleRoute, sendMessage, goToScene],
  );

  const isPhone = scene !== 'dashboard';

  const phoneNav =
    scene === 'events' ? 'home'
    : scene === 'clicks' ? 'clicks'
    : scene === 'map' ? 'map'
    : scene === 'settings' ? 'settings'
    : 'add';

  const onTabKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const index = SCENES.findIndex((item) => item.id === scene);
    if (index < 0) return;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      event.preventDefault();
      setScene(SCENES[(index + 1) % SCENES.length].id);
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      event.preventDefault();
      setScene(SCENES[(index - 1 + SCENES.length) % SCENES.length].id);
    }
  };

  return (
    <div data-testid="landing-playground" className="w-full">
      <div
        role="tablist"
        aria-label="Product playground"
        onKeyDown={onTabKeyDown}
        className="mb-6 flex flex-wrap justify-center gap-2"
      >
        {SCENES.map((item) => {
          const selected = scene === item.id;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              id={`playground-tab-${item.id}`}
              aria-selected={selected}
              aria-controls={`playground-panel-${item.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setScene(item.id)}
              className={`rounded-full px-4 py-2 text-sm font-semibold ${
                selected
                  ? 'bg-primary text-on-primary'
                  : 'border border-border-hard bg-surface text-on-surface hover:bg-surface-container'
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </div>

      <div
        role="tabpanel"
        id={`playground-panel-${scene}`}
        aria-labelledby={`playground-tab-${scene}`}
        className="flex flex-col gap-6 lg:flex-row lg:items-stretch"
      >
        {isPhone ? (
          <>
            <PhoneChrome
              label="App"
              activeNav={phoneNav}
              onNav={(next) => {
                if (next === 'map') setDashboardTab('map');
                if (next === 'clicks') setDashboardTab('chat');
                setScene(next);
              }}
            >
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={scene}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{ duration: 0.3 }}
                  className="h-full"
                >
                  {scene === 'events' ? (
                    <EventsScene state={state} actions={actions} onAnnounce={setAnnouncement} />
                  ) : scene === 'clicks' ? (
                    <ClicksScene state={state} actions={actions} />
                  ) : scene === 'map' ? (
                    <div className="h-full p-0" data-testid="playground-scene-phone-map">
                      <PlaygroundMap state={state} actions={actions} fill />
                    </div>
                  ) : scene === 'settings' ? (
                    <SettingsScene />
                  ) : (
                    <ConnectScene state={state} actions={actions} onAnnounce={setAnnouncement} />
                  )}
                </motion.div>
              </AnimatePresence>
            </PhoneChrome>
            <CompanionPanel state={state} actions={actions} />
          </>
        ) : (
          <motion.div
            key="dashboard"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.3 }}
            className="flex min-h-0 min-w-0 flex-1 self-stretch"
          >
            <WebChrome label="Website companion" lockScroll>
              <DashboardScene state={state} actions={actions} />
            </WebChrome>
          </motion.div>
        )}
      </div>

      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>
    </div>
  );
}
