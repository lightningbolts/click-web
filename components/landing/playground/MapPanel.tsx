'use client';

import { useMemo, useState } from 'react';
import { CalendarDays, MessageCircle, X } from 'lucide-react';
import { Avatar } from '@/components/ds/Avatar';
import { Button } from '@/components/ds/Button';
import { CardVisual } from '@/components/ds/CardVisual';
import { StatusPill } from '@/components/ds/StatusPill';
import { cn } from '@/lib/cn';
import PlaygroundMapLazy from './PlaygroundMapLazy';
import type { MapPinData } from './PlaygroundMap';
import { EVENT, EVENTS, PERSON } from './mockData';
import { useDemo } from './state';
import type { ThreadId } from './types';

/**
 * Map with the iOS "Nearby" sheet: your Clicks and events as pins; picking one swaps the
 * sheet for that pin's card. Both previews use it; the phone lifts it above the tab bar.
 */
export function MapPanel({
  onOpenEvent,
  onOpenThread,
  sheetClassName,
  mapClassName,
  testId,
}: {
  onOpenEvent: (id: string) => void;
  onOpenThread: (id: ThreadId) => void;
  sheetClassName?: string;
  /** e.g. pushing the zoom control below a phone's status bar. */
  mapClassName?: string;
  testId?: string;
}) {
  const { state } = useDemo();
  const [selected, setSelected] = useState<string | null>(null);
  const pins = useMemo<MapPinData[]>(
    () => [
      ...EVENTS.map((e) => ({ id: e.id, kind: 'event' as const, label: e.title, geo: e.geo })),
      ...state.connected.map((id) => ({ id, kind: 'person' as const, label: PERSON[id].name, geo: PERSON[id].geo })),
    ],
    [state.connected],
  );
  const event = selected ? EVENT[selected] : undefined;
  const person = selected ? PERSON[selected] : undefined;
  const going = event ? state.rsvps.includes(event.id) : false;

  return (
    <div className="relative h-full" data-testid={testId}>
      <PlaygroundMapLazy pins={pins} selectedId={selected} onSelect={setSelected} className={cn('absolute inset-0', mapClassName)} />
      <div
        className={cn(
          'material-glass absolute inset-x-3 bottom-3 z-10 rounded-xl p-3 shadow-overlay',
          sheetClassName,
        )}
        data-testid="map-sheet"
      >
        {event ? (
          <div className="flex items-center gap-3">
            <CardVisual seed={event.id} radius="md" glyph={<CalendarDays />} className="size-12 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="type-body-strong truncate text-fg">{event.title}</p>
              <p className="type-meta truncate text-fg-secondary">
                {event.when} · {going ? 'You’re going' : `${event.going} going`}
              </p>
            </div>
            <Button size="sm" variant="primary" onClick={() => onOpenEvent(event.id)}>
              View
            </Button>
            <CloseButton onClick={() => setSelected(null)} />
          </div>
        ) : person ? (
          <div className="flex items-center gap-3">
            <Avatar seed={person.id} name={person.name} size={48} presence={person.online} />
            <div className="min-w-0 flex-1">
              <p className="type-body-strong truncate text-fg">{person.name}</p>
              <p className="type-meta truncate text-fg-secondary">Met at {person.met.place}</p>
            </div>
            <Button size="sm" variant="primary" icon={MessageCircle} onClick={() => onOpenThread(person.id)}>
              Chat
            </Button>
            <CloseButton onClick={() => setSelected(null)} />
          </div>
        ) : (
          <>
            <p className="type-headline px-1 text-fg">Nearby</p>
            <ul className="no-scrollbar mt-2 flex gap-2 overflow-x-auto">
              {EVENTS.map((e) => (
                <li key={e.id} className="shrink-0">
                  <button
                    type="button"
                    onClick={() => setSelected(e.id)}
                    className="press type-body-strong flex h-9 items-center gap-1.5 rounded-pill bg-fill-subtle px-3 text-fg hover:bg-fill-strong"
                  >
                    {e.title}
                    {e.live ? <StatusPill variant="live">Live</StatusPill> : null}
                  </button>
                </li>
              ))}
            </ul>
            <p className="type-meta mt-2 px-1 text-fg-tertiary">
              {state.connected.length} Clicks and {EVENTS.length} events within about 5 km.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

function CloseButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Close"
      className="press -mr-1 flex size-8 shrink-0 items-center justify-center rounded-full text-fg-secondary hover:bg-hover"
    >
      <X size={18} aria-hidden />
    </button>
  );
}
