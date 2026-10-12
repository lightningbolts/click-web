'use client';

import { useEffect, useState } from 'react';
import {
  Bluetooth,
  Check,
  Circle,
  CircleCheck,
  Lock,
  MapPin,
  MessageCircle,
  QrCode,
  ScanLine,
  UsersRound,
  Volume2,
  Waypoints,
} from 'lucide-react';
import { Avatar, AvatarStack } from '@/components/ds/Avatar';
import { Button } from '@/components/ds/Button';
import { CardVisual } from '@/components/ds/CardVisual';
import { ListGroup, ListRow } from '@/components/ds/ListGroup';
import { SearchField } from '@/components/ds/SearchField';
import { SegmentedControl } from '@/components/ds/SegmentedControl';
import { Toggle } from '@/components/ds/Toggle';
import { cn } from '@/lib/cn';
import { PhoneFrame, PhonePushed, PhoneScreen } from './Frames';
import { MapPanel } from './MapPanel';
import { CONTEXT_TAGS, EVENT, GROUP, HUB, INTENT_OPTIONS, JORDAN_ID, ME, PERSON } from './mockData';
import {
  AvailabilityList,
  AvailabilityPicker,
  DropStory,
  DropsRow,
  EventDetail,
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
import type { PhoneRoute, ThreadId } from './types';

/** The iOS app: five tabs, each with at most one pushed screen. */
export function PhoneApp() {
  const { state, dispatch } = useDemo();
  const { tab, route } = state.phone;
  const push = (r: PhoneRoute) => dispatch({ type: 'phonePush', route: r });
  const openThread = (id: ThreadId) => push({ kind: 'thread', id });
  const openEvent = (id: string) => push({ kind: 'event', id });
  const back = () => dispatch({ type: 'phonePop' });

  return (
    <PhoneFrame
      tab={tab}
      onTab={(t) => dispatch({ type: 'phoneTab', tab: t })}
      showTabs={!route || route.kind === 'drop'}
      clicksBadge={sayHiCount(state)}
    >
      {tab === 'home' ? <HomeTab push={push} /> : null}
      {tab === 'add' ? <AddTab push={push} /> : null}
      {tab === 'clicks' ? <ClicksTab openThread={openThread} /> : null}
      {tab === 'map' ? (
        <MapPanel
          testId="phone-map"
          onOpenEvent={openEvent}
          onOpenThread={openThread}
          sheetClassName="bottom-[88px]"
          mapClassName="[&_.maplibregl-ctrl-top-right]:top-11"
        />
      ) : null}
      {tab === 'me' ? <MeTab push={push} /> : null}
      {route && route.kind !== 'drop' ? (
        <div className="absolute inset-0 z-20 bg-bg" data-testid={`phone-route-${route.kind}`}>
          <Route route={route} back={back} push={push} openThread={openThread} />
        </div>
      ) : null}
      {route?.kind === 'drop' ? <DropStory id={route.id} onClose={back} /> : null}
    </PhoneFrame>
  );
}

type Push = (route: PhoneRoute) => void;

function Route({
  route,
  back,
  push,
  openThread,
}: {
  route: Exclude<PhoneRoute, { kind: 'drop' }>;
  back: () => void;
  push: Push;
  openThread: (id: ThreadId) => void;
}) {
  const { dispatch } = useDemo();
  switch (route.kind) {
    case 'thread':
      return (
        <PhonePushed onBack={back} backLabel="Back to Clicks" title={<ThreadTitle id={route.id} />} bodyClassName="flex flex-col">
          <ThreadBody id={route.id} glassComposer />
        </PhonePushed>
      );
    case 'event':
      return (
        <PhonePushed onBack={back} backLabel={`Back from ${EVENT[route.id].title}`} bodyClassName="px-4 pb-8 pt-4">
          <EventDetail
            id={route.id}
            onOpenThread={openThread}
            onDirections={() => {
              dispatch({ type: 'phoneTab', tab: 'map' });
            }}
          />
        </PhonePushed>
      );
    case 'tap':
      return <TapFlow back={back} openThread={openThread} />;
    case 'group':
      return <GroupFlow back={back} openThread={openThread} />;
    case 'hub':
      return <HubFlow back={back} openThread={openThread} />;
    case 'qr':
      return (
        <PhonePushed onBack={back} title="My QR" bodyClassName="px-6 pb-8 pt-8">
          <QrCard />
          <Button variant="secondary" fullWidth icon={ScanLine} className="mt-6" onClick={() => push({ kind: 'scan' })}>
            Scan a code instead
          </Button>
        </PhonePushed>
      );
    case 'scan':
      return <ScanScreen back={back} openThread={openThread} />;
    case 'availability':
      return (
        <PhonePushed onBack={back} title="I’m down for…" bodyClassName="px-4 pb-8 pt-5">
          <AvailabilityEditor />
        </PhonePushed>
      );
  }
}

/* ---------- Home ---------- */

function HomeTab({ push }: { push: Push }) {
  const { state } = useDemo();
  const [period, setPeriod] = useState<'day' | 'week'>('day');
  const newClick = activeThreads(state).find((t) => t.sayHi);
  return (
    <PhoneScreen testId="phone-home">
      <div className="pb-5 pt-2">
        <h3 className="type-title-1 text-fg">Good morning, {ME.first}</h3>
        <p className="type-body text-fg-secondary">Ready to connect today?</p>
      </div>
      <div className="flex flex-col gap-6">
        {newClick ? (
          <button
            type="button"
            onClick={() => push({ kind: 'thread', id: newClick.id })}
            className="press flex items-center gap-3 rounded-lg bg-selection p-3 text-left"
          >
            <Avatar seed={newClick.id} name={newClick.title} size={48} presence={newClick.online} />
            <span className="min-w-0 flex-1">
              <span className="type-body-strong block text-fg">New Click with {PERSON[newClick.id].first}</span>
              <span className="type-meta block text-fg-secondary">Say hi in the next 48 hours</span>
            </span>
            <MessageCircle size={20} className="text-accent" aria-hidden />
          </button>
        ) : null}
        <section>
          <SectionTitle>I’m down for…</SectionTitle>
          <AvailabilityList
            onEdit={() => push({ kind: 'availability' })}
            onOpenThread={(id) => push({ kind: 'thread', id })}
          />
        </section>
        <section>
          <SectionTitle>Drops</SectionTitle>
          <DropsRow onOpen={(id) => push({ kind: 'drop', id })} />
        </section>
        <section>
          <SectionTitle>Upcoming</SectionTitle>
          <UpcomingList
            onOpen={(item) => push(item.kind === 'event' ? { kind: 'event', id: item.id } : { kind: 'thread', id: item.thread })}
          />
        </section>
        <section>
          <SectionTitle>Explore nearby</SectionTitle>
          <NearbyEvents onOpen={(id) => push({ kind: 'event', id })} />
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
      </div>
    </PhoneScreen>
  );
}

function AvailabilityEditor() {
  const { state, dispatch } = useDemo();
  return (
    <div className="flex flex-col gap-6">
      <AvailabilityPicker options={INTENT_OPTIONS} />
      <p className="type-meta text-fg-secondary">
        Your Clicks see this on their Home until 9 PM. When someone’s down for the same thing, you both get a match.
      </p>
      <ListGroup>
        <ListRow
          title="Free currently"
          subtitle="Show a green dot on your profile"
          trailing={<Toggle checked={state.free} onCheckedChange={(free) => dispatch({ type: 'free', free })} aria-label="Free currently" />}
        />
      </ListGroup>
    </div>
  );
}

/* ---------- Add Click ---------- */

function AddTab({ push }: { push: Push }) {
  const { state } = useDemo();
  const quick = [
    { label: 'My QR', icon: QrCode, route: { kind: 'qr' } },
    { label: 'Scan', icon: ScanLine, route: { kind: 'scan' } },
    { label: 'Group', icon: UsersRound, route: { kind: 'group' } },
    { label: 'Join hub', icon: Waypoints, route: { kind: 'hub' } },
  ] as const;
  return (
    <PhoneScreen title="Add Click" testId="phone-add">
      <section className={cn(groupedSurface, 'flex flex-col items-center px-5 py-6 text-center')}>
        <span className="relative flex size-28 items-center justify-center">
          <span aria-hidden className="absolute inset-0 rounded-full bg-selection" />
          <span className="relative flex size-20 items-center justify-center rounded-full bg-action text-on-action">
            <Waypoints size={36} aria-hidden />
          </span>
        </span>
        <h4 className="type-title-3 mt-4 text-fg">Tap to Connect</h4>
        <p className="type-body mt-1 text-fg-secondary">
          Hold phones together. Bluetooth, a short inaudible tone, and location confirm you’re really there.
        </p>
        <Button className="mt-4" size="lg" variant="primary" onClick={() => push({ kind: 'tap' })} data-testid="tap-start">
          {state.connected.includes(JORDAN_ID) ? 'Tap again' : 'Start'}
        </Button>
      </section>
      <div className="mt-4 grid grid-cols-4 gap-2">
        {quick.map(({ label, icon: Icon, route }) => (
          <button
            key={label}
            type="button"
            onClick={() => push(route)}
            className="press type-meta flex flex-col items-center gap-1.5 rounded-lg bg-surface py-3 font-semibold text-fg dark:shadow-[inset_0_0_0_1px_var(--hairline)]"
          >
            <Icon size={22} className="text-accent" aria-hidden />
            {label}
          </button>
        ))}
      </div>
      <ListGroup header="Community" className="mt-6">
        <ListRow icon={Waypoints} title="Join Community Hub" subtitle="Chat with Clicks at a venue" chevron onClick={() => push({ kind: 'hub' })} />
        <ListRow icon={UsersRound} title="Start a group" subtitle="Tap together with several people" chevron onClick={() => push({ kind: 'group' })} />
      </ListGroup>
    </PhoneScreen>
  );
}

const TAP_CHECKS = [
  { label: 'Bluetooth', icon: Bluetooth },
  { label: 'Inaudible tone', icon: Volume2 },
  { label: 'Same place', icon: MapPin },
] as const;

/** Handshake, then the "You Clicked" card with context tags, as on iOS. */
function TapFlow({ back, openThread }: { back: () => void; openThread: (id: ThreadId) => void }) {
  const { state, dispatch } = useDemo();
  const jordan = PERSON[JORDAN_ID];
  const done = state.connected.includes(JORDAN_ID);
  const [step, setStep] = useState(done ? TAP_CHECKS.length : 0);

  useEffect(() => {
    if (done) return;
    if (step >= TAP_CHECKS.length) {
      dispatch({ type: 'connect', id: JORDAN_ID });
      return;
    }
    const t = window.setTimeout(() => setStep((s) => s + 1), 450);
    return () => window.clearTimeout(t);
  }, [step, done, dispatch]);

  if (!done)
    return (
      <PhonePushed onBack={back} backLabel="Cancel" title="Tap to Connect" bodyClassName="flex flex-col items-center justify-center px-6 pb-16">
        <span className="relative flex size-36 items-center justify-center" aria-hidden>
          <span className="absolute inset-0 animate-ping rounded-full bg-selection motion-reduce:animate-none" />
          <span className="relative flex size-24 items-center justify-center rounded-full bg-action text-on-action">
            <Waypoints size={40} />
          </span>
        </span>
        <p className="type-title-3 mt-8 text-center text-fg">Hold phones together</p>
        <p className="type-body mt-1 text-center text-fg-secondary">Connecting with {jordan.first}…</p>
        <ul className="mt-6 flex flex-col gap-2" aria-live="polite">
          {TAP_CHECKS.map(({ label, icon: Icon }, i) => (
            <li key={label} className={cn('type-body flex items-center gap-2', i < step ? 'text-fg' : 'text-fg-tertiary')}>
              {i < step ? <CircleCheck size={18} className="text-online-text" aria-hidden /> : <Circle size={18} aria-hidden />}
              <Icon size={16} aria-hidden />
              {label}
            </li>
          ))}
        </ul>
      </PhonePushed>
    );

  return (
    <PhonePushed
      onBack={back}
      backLabel="Done"
      title="You Clicked"
      bodyClassName="px-4 pb-6 pt-5"
      footer={
        <div className="flex gap-2">
          <Button size="lg" variant="primary" icon={MessageCircle} className="flex-1" onClick={() => openThread(JORDAN_ID)}>
            Say hi
          </Button>
          <Button size="lg" variant="secondary" onClick={back}>
            Done
          </Button>
        </div>
      }
    >
      <div data-testid="tap-result">
        <CardVisual seed={`hangout-${JORDAN_ID}`} ratio="4:3" radius="xl">
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
            <Avatar seed={jordan.id} name={jordan.name} size={72} ringColor="rgba(255,255,255,0.9)" />
            <p className="type-title-2">{jordan.name}</p>
            <p className="type-meta flex items-center gap-1 opacity-90">
              <MapPin size={12} aria-hidden />
              {jordan.met.place} · just now
            </p>
          </div>
        </CardVisual>
        <h4 className="type-headline mt-5 text-fg">What brought you together?</h4>
        <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="What brought you together?">
          {CONTEXT_TAGS.map((tag) => {
            const on = state.tapTag === tag;
            return (
              <button
                key={tag}
                type="button"
                aria-pressed={on}
                onClick={() => dispatch({ type: 'tapTag', tag })}
                className={cn(
                  'press type-meta h-8 rounded-pill px-3 font-semibold',
                  on ? 'bg-action text-on-action' : 'bg-fill-subtle text-fg hover:bg-fill-strong',
                )}
              >
                {tag}
              </button>
            );
          })}
        </div>
      </div>
    </PhonePushed>
  );
}

function GroupFlow({ back, openThread }: { back: () => void; openThread: (id: ThreadId) => void }) {
  const { state, dispatch } = useDemo();
  const [name, setName] = useState(state.group?.name ?? GROUP.defaultName);
  const members = GROUP.memberIds.map((id) => PERSON[id]);
  return (
    <PhonePushed onBack={back} title={state.group ? 'Group created' : 'Start a group'} bodyClassName="px-4 pb-8 pt-6">
      <div className="flex flex-col items-center text-center">
        <AvatarStack
          size={56}
          people={[{ seed: ME.id, name: ME.name }, ...members.map((p) => ({ seed: p.id, name: p.name }))]}
        />
        <p className="type-body mt-3 text-fg-secondary">
          {state.group
            ? `You’re in a verified group with ${members.map((p) => p.first).join(' and ')}.`
            : `Everyone holds phones together. ${members.map((p) => p.first).join(' and ')} are nearby.`}
        </p>
      </div>
      <label className="mt-6 block">
        <span className="type-meta px-1 font-semibold text-fg-secondary">Group name</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="type-body mt-1 h-11 w-full rounded-md bg-fill-subtle px-3 text-fg outline-none focus:shadow-[0_0_0_2px_var(--accent)]"
        />
      </label>
      <Button
        fullWidth
        size="lg"
        variant="primary"
        className="mt-5"
        icon={state.group ? MessageCircle : Check}
        onClick={() => {
          dispatch({ type: 'createGroup', name });
          openThread(GROUP.id);
        }}
      >
        {state.group ? 'Open group chat' : 'Create group'}
      </Button>
    </PhonePushed>
  );
}

function HubFlow({ back, openThread }: { back: () => void; openThread: (id: ThreadId) => void }) {
  const { state, dispatch } = useDemo();
  return (
    <PhonePushed onBack={back} title="Community hubs" bodyClassName="px-4 pb-8 pt-5">
      <p className="type-body text-fg-secondary">Hubs are chats for a venue. You can join one when you’re there.</p>
      <div className={cn(groupedSurface, 'mt-4 p-4')}>
        <div className="flex items-center gap-3">
          <CardVisual seed={HUB.id} radius="md" glyph={<Waypoints />} className="size-12 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="type-body-strong truncate text-fg">{state.hub?.name ?? HUB.defaultName}</p>
            <p className="type-meta text-fg-secondary">
              {HUB.distance} · {HUB.members} people
            </p>
          </div>
        </div>
        <Button
          fullWidth
          variant="primary"
          className="mt-4"
          icon={state.hub ? MessageCircle : undefined}
          onClick={() => {
            dispatch({ type: 'joinHub' });
            openThread(HUB.id);
          }}
        >
          {state.hub ? 'Open hub chat' : 'Join hub'}
        </Button>
      </div>
    </PhonePushed>
  );
}

function ScanScreen({ back, openThread }: { back: () => void; openThread: (id: ThreadId) => void }) {
  const { dispatch } = useDemo();
  return (
    <PhonePushed onBack={back} title="Scan" bodyClassName="flex flex-col items-center justify-center bg-black px-8 pb-12 text-white">
      <div className="relative aspect-square w-full max-w-[220px]" aria-hidden>
        {['left-0 top-0 border-l-4 border-t-4 rounded-tl-lg', 'right-0 top-0 border-r-4 border-t-4 rounded-tr-lg', 'bottom-0 left-0 border-b-4 border-l-4 rounded-bl-lg', 'bottom-0 right-0 border-b-4 border-r-4 rounded-br-lg'].map(
          (c) => (
            <span key={c} className={cn('absolute size-10 border-white', c)} />
          ),
        )}
        <span className="absolute inset-x-4 top-1/2 h-0.5 bg-white/70" />
      </div>
      <p className="type-body mt-6 text-center text-white/80">Point your camera at someone’s Click code.</p>
      <Button
        variant="primary"
        className="mt-6"
        onClick={() => {
          dispatch({ type: 'connect', id: JORDAN_ID });
          openThread(JORDAN_ID);
        }}
      >
        Scan Jordan’s code
      </Button>
    </PhonePushed>
  );
}

/* ---------- Clicks ---------- */

function ClicksTab({ openThread }: { openThread: (id: ThreadId) => void }) {
  const { state } = useDemo();
  const [segment, setSegment] = useState<'active' | 'groups'>('active');
  const [query, setQuery] = useState('');
  const active = activeThreads(state);
  const groups = groupThreads(state);
  const list = (segment === 'active' ? active : groups).filter((t) => t.title.toLowerCase().includes(query.trim().toLowerCase()));
  return (
    <PhoneScreen title="Clicks" testId="phone-clicks">
      <SearchField value={query} onValueChange={setQuery} label="Search Clicks" />
      <SegmentedControl
        className="mt-3"
        fullWidth
        label="Clicks"
        value={segment}
        onChange={setSegment}
        segments={[
          { value: 'active', label: `Active ${active.length}` },
          { value: 'groups', label: `Groups ${groups.length}` },
        ]}
      />
      <ul className="-mx-2 mt-2">
        {list.map((t) => (
          <ThreadRow key={t.id} summary={t} onOpen={() => openThread(t.id)} />
        ))}
      </ul>
      {list.length === 0 ? (
        <InboxEmpty>
          {query ? `No Clicks match “${query}”.` : 'Verified groups, event chats, and hubs you join appear here.'}
        </InboxEmpty>
      ) : null}
      <p className="type-meta mt-4 flex items-center justify-center gap-1 text-fg-tertiary">
        <Lock size={12} aria-hidden />
        Private chats are end-to-end encrypted
      </p>
    </PhoneScreen>
  );
}

/* ---------- Me ---------- */

function MeTab({ push }: { push: Push }) {
  return (
    <PhoneScreen testId="phone-me">
      <MeContent
        onAvailability={() => push({ kind: 'availability' })}
        onOpenEvent={(id) => push({ kind: 'event', id })}
        onQr={() => push({ kind: 'qr' })}
      />
    </PhoneScreen>
  );
}
