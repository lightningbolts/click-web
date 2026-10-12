'use client';

import { useState, type ReactNode } from 'react';
import { ChevronLeft, QrCode, Smartphone, Waypoints } from 'lucide-react';
import { Avatar } from '@/components/ds/Avatar';
import { Button } from '@/components/ds/Button';
import { ClickMark } from '@/components/ds/ClickMark';
import { SegmentedControl } from '@/components/ds/SegmentedControl';
import { appNavItems } from '@/lib/shell/appNav';
import { cn } from '@/lib/cn';
import { BrowserFrame } from './Frames';
import { MapPanel } from './MapPanel';
import { EVENTS, INTENT_OPTIONS, ME, PERSON } from './mockData';
import {
  AvailabilityList,
  AvailabilityPicker,
  DropStory,
  DropsRow,
  EventDetail,
  EventListRow,
  InboxEmpty,
  MeContent,
  NearbyEvents,
  QrCard,
  RecapStats,
  SectionTitle,
  ThreadBody,
  ThreadRow,
  ThreadTitle,
  UpcomingList,
  groupedSurface,
} from './shared';
import { activeThreads, groupThreads, recap, sayHiCount, useDemo } from './state';
import type { ThreadId, WebSection } from './types';

const NAV = appNavItems({ managesPlaces: false });

function webPath(section: WebSection, threadId: string | null, eventId: string | null) {
  if (section === 'home') return '/';
  if (section === 'clicks' && threadId) return `/clicks/${threadId.replace(':', '-')}`;
  if (section === 'events' && eventId) return `/events/${eventId}`;
  return `/${section}`;
}

/** joinclick.co signed in: the same top bar, sections and two-pane layouts as the web app. */
export function WebApp() {
  const { state, dispatch } = useDemo();
  const { section, threadId, eventId, dropId } = state.web;
  const go = (s: WebSection) => dispatch({ type: 'webSection', section: s });
  const badge = sayHiCount(state);

  return (
    <BrowserFrame path={webPath(section, threadId, eventId)}>
      <header className="material-glass relative z-20 flex h-14 shrink-0 items-center gap-1 border-b border-hairline px-3 @2xl:gap-6 @2xl:px-5">
        <span className="flex items-center gap-2 pr-1">
          <ClickMark size={24} />
          <span className="type-headline hidden text-fg @md:inline">Click</span>
        </span>
        <nav aria-label="Web app" className="flex min-w-0 flex-1 items-center gap-0.5 @2xl:gap-1">
          {NAV.map((item) => {
            const id = item.id as WebSection;
            const active = section === id;
            const Icon = item.icon;
            return (
              <button
                key={id}
                type="button"
                onClick={() => go(id)}
                aria-current={active ? 'page' : undefined}
                aria-label={id === 'clicks' && badge ? `${item.label}, ${badge} new` : item.label}
                data-testid={`web-nav-${id}`}
                className={cn(
                  'type-body-strong relative flex h-10 items-center gap-1.5 rounded-pill px-2.5 transition-colors duration-[var(--d-fast)] @2xl:px-3',
                  active ? 'text-fg' : 'text-fg-secondary hover:bg-hover hover:text-fg',
                )}
              >
                <Icon size={18} aria-hidden className="@2xl:hidden" />
                <span className="hidden @2xl:inline">{item.label}</span>
                {id === 'clicks' && badge ? <span className="size-2 rounded-full bg-live" aria-hidden /> : null}
                {active ? <span aria-hidden className="absolute inset-x-3 -bottom-[9px] h-0.5 rounded-pill bg-accent" /> : null}
              </button>
            );
          })}
        </nav>
        <Button size="sm" icon={QrCode} onClick={() => go('add')} className="shrink-0" aria-label="Add Click">
          <span className="hidden @lg:inline">Add Click</span>
        </Button>
        <button
          type="button"
          onClick={() => go('me')}
          aria-label="Your profile"
          aria-current={section === 'me' ? 'page' : undefined}
          className={cn('press ml-1 shrink-0 rounded-full', section === 'me' && 'ring-2 ring-accent ring-offset-2 ring-offset-[var(--bg)]')}
        >
          <Avatar seed={ME.id} name={ME.name} size={32} presence={state.free} />
        </button>
      </header>
      <main className="relative min-h-0 flex-1" data-testid={`web-${section}`}>
        {section === 'home' ? <WebHome /> : null}
        {section === 'clicks' ? <WebClicks /> : null}
        {section === 'map' ? (
          <MapPanel
            testId="web-map"
            onOpenEvent={(id) => dispatch({ type: 'webEvent', id })}
            onOpenThread={(id) => dispatch({ type: 'webThread', id })}
            sheetClassName="@xl:right-auto @xl:w-[360px]"
          />
        ) : null}
        {section === 'events' ? <WebEvents /> : null}
        {section === 'add' ? <WebAdd /> : null}
        {section === 'me' ? (
          <Scroll className="mx-auto max-w-[560px]">
            <MeContent
              onAvailability={() => go('home')}
              onOpenEvent={(id) => dispatch({ type: 'webEvent', id })}
              onQr={() => go('add')}
            />
          </Scroll>
        ) : null}
        {dropId ? <DropStory id={dropId} onClose={() => dispatch({ type: 'webDrop', id: null })} /> : null}
      </main>
    </BrowserFrame>
  );
}

function Scroll({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className="no-scrollbar h-full overflow-y-auto">
      <div className={cn('px-4 py-6 @2xl:px-8', className)}>{children}</div>
    </div>
  );
}

/* ---------- Home: main column and a rail, as on joinclick.co ---------- */

function WebHome() {
  const { state, dispatch } = useDemo();
  const [editing, setEditing] = useState(false);
  const [period, setPeriod] = useState<'day' | 'week'>('week');
  const openThread = (id: ThreadId) => dispatch({ type: 'webThread', id });
  const newClick = activeThreads(state).find((t) => t.sayHi);

  const rail = (
    <>
      <section>
        <SectionTitle
          action={
            editing ? (
              <button type="button" onClick={() => setEditing(false)} className="type-body-strong text-accent">
                Done
              </button>
            ) : null
          }
        >
          I’m down for…
        </SectionTitle>
        {editing ? (
          <div className={cn(groupedSurface, 'p-3')}>
            <AvailabilityPicker options={INTENT_OPTIONS} />
          </div>
        ) : (
          <AvailabilityList onEdit={() => setEditing(true)} onOpenThread={openThread} />
        )}
      </section>
      <section>
        <SectionTitle
          action={
            <SegmentedControl
              size="sm"
              label="Recap period"
              value={period}
              onChange={setPeriod}
              segments={[
                { value: 'day', label: 'Day' },
                { value: 'week', label: 'Week' },
              ]}
            />
          }
        >
          Your recap
        </SectionTitle>
        <RecapStats stats={recap(state, period)} />
      </section>
    </>
  );

  return (
    <Scroll className="mx-auto max-w-[1080px]">
      <h2 className="type-title-1 text-fg">Good morning, {ME.first}</h2>
      <div className="mt-6 grid gap-8 @3xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="flex min-w-0 flex-col gap-8">
          {newClick ? (
            <button
              type="button"
              onClick={() => openThread(newClick.id)}
              className="press flex items-center gap-3 rounded-lg bg-selection p-4 text-left"
            >
              <Avatar seed={newClick.id} name={newClick.title} size={48} presence={newClick.online} />
              <span className="min-w-0 flex-1">
                <span className="type-body-strong block text-fg">New Click with {PERSON[newClick.id].first}</span>
                <span className="type-meta block text-fg-secondary">Say hi in the next 48 hours</span>
              </span>
              <span className="type-body-strong text-accent">Say hi</span>
            </button>
          ) : null}
          <div className="flex flex-col gap-8 @3xl:hidden">{rail}</div>
          <section>
            <SectionTitle>Upcoming</SectionTitle>
            <UpcomingList
              onOpen={(item) =>
                item.kind === 'event' ? dispatch({ type: 'webEvent', id: item.id }) : openThread(item.thread)
              }
            />
          </section>
          <section>
            <SectionTitle>Drops</SectionTitle>
            <DropsRow onOpen={(id) => dispatch({ type: 'webDrop', id })} />
          </section>
          <section>
            <SectionTitle>Explore nearby</SectionTitle>
            <NearbyEvents columns onOpen={(id) => dispatch({ type: 'webEvent', id })} />
          </section>
        </div>
        <aside className="hidden flex-col gap-8 @3xl:flex">{rail}</aside>
      </div>
    </Scroll>
  );
}

/* ---------- Two-pane layouts (Clicks, Events) ---------- */

/** List and detail side by side when there's room; otherwise one at a time with Back. */
function TwoPane({
  list,
  detail,
  onBack,
  empty,
}: {
  list: ReactNode;
  detail: ReactNode | null;
  onBack: () => void;
  empty: string;
}) {
  return (
    <div className="flex h-full">
      <div
        className={cn(
          'no-scrollbar h-full w-full shrink-0 overflow-y-auto border-hairline @2xl:w-[320px] @2xl:border-r',
          detail && 'hidden @2xl:block',
        )}
      >
        {list}
      </div>
      <div className={cn('min-w-0 flex-1 flex-col', detail ? 'flex' : 'hidden @2xl:flex')}>
        {detail ? (
          <>
            <button
              type="button"
              onClick={onBack}
              className="type-body-strong flex h-10 shrink-0 items-center gap-1 border-b border-hairline px-2 text-accent @2xl:hidden"
            >
              <ChevronLeft size={20} aria-hidden />
              Back
            </button>
            {detail}
          </>
        ) : (
          <p className="type-body m-auto px-6 text-center text-fg-tertiary">{empty}</p>
        )}
      </div>
    </div>
  );
}

function WebClicks() {
  const { state, dispatch } = useDemo();
  const id = state.web.threadId;
  const open = (t: ThreadId) => dispatch({ type: 'webThread', id: t });
  const active = activeThreads(state);
  const groups = groupThreads(state);
  return (
    <TwoPane
      empty="Pick a conversation"
      onBack={() => dispatch({ type: 'webThread', id: null })}
      list={
        <div className="p-2">
          <h3 className="type-title-3 px-3 pb-1 pt-2 text-fg">Active</h3>
          <ul>
            {active.map((t) => (
              <ThreadRow key={t.id} summary={t} selected={t.id === id} onOpen={() => open(t.id)} />
            ))}
          </ul>
          <h3 className="type-title-3 px-3 pb-1 pt-4 text-fg">Groups</h3>
          {groups.length ? (
            <ul>
              {groups.map((t) => (
                <ThreadRow key={t.id} summary={t} selected={t.id === id} onOpen={() => open(t.id)} />
              ))}
            </ul>
          ) : (
            <InboxEmpty>Verified groups, event chats, and hubs you join appear here.</InboxEmpty>
          )}
        </div>
      }
      detail={
        id ? (
          <div className="flex min-h-0 flex-1 flex-col" data-testid="web-thread">
            <div className="flex h-16 shrink-0 items-center border-b border-hairline px-4">
              <ThreadTitle id={id} />
            </div>
            <ThreadBody id={id} />
          </div>
        ) : null
      }
    />
  );
}

function WebEvents() {
  const { state, dispatch } = useDemo();
  const id = state.web.eventId;
  return (
    <TwoPane
      empty="Pick an event to see who’s going"
      onBack={() => dispatch({ type: 'webEvent', id: null })}
      list={
        <div className="p-2">
          <h3 className="type-title-3 px-3 pb-1 pt-2 text-fg">This week near you</h3>
          <ul>
            {EVENTS.map((e) => (
              <EventListRow
                key={e.id}
                id={e.id}
                selected={e.id === id}
                onOpen={() => dispatch({ type: 'webEvent', id: e.id })}
                detail={state.rsvps.includes(e.id) ? `${e.when} · Going` : undefined}
              />
            ))}
          </ul>
        </div>
      }
      detail={
        id ? (
          <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto">
            <div className="mx-auto max-w-[560px] px-4 py-6 @2xl:px-8">
              <EventDetail
                id={id}
                onOpenThread={(t) => dispatch({ type: 'webThread', id: t })}
                onDirections={() => dispatch({ type: 'webSection', section: 'map' })}
              />
            </div>
          </div>
        ) : null
      }
    />
  );
}

/* ---------- Add Click: QR on the web, Tap on the phone ---------- */

function WebAdd() {
  const { dispatch, showDevice } = useDemo();
  return (
    <Scroll className="mx-auto max-w-[720px]">
      <h2 className="type-title-1 text-fg">Add Click</h2>
      <div className="mt-6 grid gap-4 @xl:grid-cols-2">
        <section className={cn(groupedSurface, 'p-6')}>
          <QrCard />
        </section>
        <div className="flex flex-col gap-4">
          <section className={cn(groupedSurface, 'p-5')}>
            <Smartphone size={22} className="text-accent" aria-hidden />
            <h3 className="type-headline mt-2 text-fg">Tap to Connect is on the app</h3>
            <p className="type-body mt-1 text-fg-secondary">
              It needs Bluetooth and the microphone to confirm you’re in the same room. On the web, show your code instead.
            </p>
            <Button size="sm" variant="tinted" className="mt-3" onClick={() => {
                dispatch({ type: 'focus', target: { kind: 'tap' } });
                showDevice('phone');
              }}>
              Try it on the iPhone
            </Button>
          </section>
          <section className={cn(groupedSurface, 'p-5')}>
            <Waypoints size={22} className="text-accent" aria-hidden />
            <h3 className="type-headline mt-2 text-fg">Community hubs</h3>
            <p className="type-body mt-1 text-fg-secondary">Hubs you join on your phone show up in Clicks here too.</p>
          </section>
        </div>
      </div>
    </Scroll>
  );
}
