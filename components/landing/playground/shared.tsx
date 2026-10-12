'use client';

import { QRCodeSVG } from 'qrcode.react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Bookmark,
  BookmarkCheck,
  CalendarDays,
  CalendarPlus,
  Check,
  Clock,
  Hourglass,
  MapPin,
  MessageCircle,
  Navigation,
  Plus,
  SendHorizontal,
  QrCode,
  Star,
  Ticket,
  UsersRound,
  X,
} from 'lucide-react';
import { Avatar, AvatarStack, GroupAvatar } from '@/components/ds/Avatar';
import { Button } from '@/components/ds/Button';
import { CardVisual } from '@/components/ds/CardVisual';
import { DateTile } from '@/components/ds/DateTile';
import { ListGroup, ListRow } from '@/components/ds/ListGroup';
import { Toggle } from '@/components/ds/Toggle';
import { StatusPill } from '@/components/ds/StatusPill';
import { cn } from '@/lib/cn';
import { DEMO_QR_URL, DROPS, EVENT, EVENTS, ME, PERSON, eventThreadId } from './mockData';
import { isNewClick, threadSummary, upcoming, useDemo, type ThreadSummary, type UpcomingItem } from './state';
import type { DemoMessage, DemoPlan, ThreadId } from './types';

/* ---------- Avatars ---------- */

export function ThreadAvatar({ summary, size }: { summary: ThreadSummary; size: 40 | 48 }) {
  if (summary.kind === 'person')
    return <Avatar seed={summary.seeds[0]} name={summary.title} size={size} presence={summary.online} />;
  if (summary.kind === 'group')
    return (
      <GroupAvatar
        seed={summary.id}
        name={summary.title}
        members={summary.seeds.map((id) => ({ seed: id, name: PERSON[id]?.name }))}
        size={size}
      />
    );
  return (
    <CardVisual
      seed={summary.seeds[0]}
      radius="xl"
      className={cn('shrink-0 rounded-full', size === 48 ? 'size-12' : 'size-10')}
      glyph={summary.kind === 'event' ? <CalendarDays /> : <UsersRound />}
    />
  );
}

/* ---------- Inbox ---------- */

export function ThreadRow({
  summary,
  onOpen,
  selected,
}: {
  summary: ThreadSummary;
  onOpen: () => void;
  selected?: boolean;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        data-testid={`thread-row-${summary.id}`}
        aria-current={selected || undefined}
        className={cn(
          'flex h-[72px] w-full items-center gap-3 rounded-md px-3 text-left transition-colors duration-[var(--d-fast)]',
          selected ? 'bg-selection' : 'hover:bg-hover',
        )}
      >
        <ThreadAvatar summary={summary} size={48} />
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-center gap-1">
            <span className="type-body-strong min-w-0 truncate text-fg">{summary.title}</span>
            {summary.core ? <Star size={14} aria-label="Core" className="shrink-0 fill-[var(--accent)] text-accent" /> : null}
            <span className="type-meta tabular ml-auto shrink-0 pl-2 text-fg-tertiary">{summary.time === 'now' ? 'Now' : summary.time}</span>
          </span>
          <span className="mt-0.5 flex min-w-0 items-center gap-2">
            <span className={cn('type-body min-w-0 flex-1 truncate', summary.sayHi ? 'text-fg' : 'text-fg-secondary')}>
              {summary.preview}
            </span>
            {summary.sayHi ? (
              <StatusPill variant="tinted" className="shrink-0">
                48h left
              </StatusPill>
            ) : null}
          </span>
        </span>
      </button>
    </li>
  );
}

export function InboxEmpty({ children }: { children: ReactNode }) {
  return <p className="type-body px-6 py-10 text-center text-fg-secondary">{children}</p>;
}

/* ---------- Thread ---------- */

function sayHiPrompts(first: string, place: string) {
  return [`Great meeting you at ${place}!`, `Hey ${first}! Want to grab coffee this week?`];
}

function PlanCard({ plan, mine, onToggle }: { plan: DemoPlan; mine: boolean; onToggle: () => void }) {
  return (
    <div
      data-testid="plan-card"
      className={cn(
        'w-[min(100%,260px)] overflow-hidden rounded-bubble bg-surface dark:shadow-[inset_0_0_0_1px_var(--hairline)]',
        mine ? 'ml-auto rounded-br-xs' : 'rounded-bl-xs',
      )}
    >
      <div className="flex gap-3 p-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-sm bg-selection text-accent">
          <CalendarDays size={20} aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="type-body-strong text-fg">{plan.title}</p>
          <p className="type-meta text-fg-secondary">{plan.when}</p>
          <p className="type-meta mt-0.5 flex items-center gap-1 font-semibold text-accent">
            <MapPin size={12} aria-hidden />
            {plan.place}
          </p>
        </div>
      </div>
      <div className="flex items-center justify-between gap-2 border-t border-hairline px-3 py-2">
        <span className="type-meta text-fg-secondary">{plan.going ? 'You’re going' : 'Not going'}</span>
        <Button size="sm" variant={plan.going ? 'primary' : 'secondary'} icon={Check} onClick={onToggle} aria-pressed={plan.going}>
          Going
        </Button>
      </div>
    </div>
  );
}

function Bubble({ message, showSender, onPlanToggle }: { message: DemoMessage; showSender: boolean; onPlanToggle: () => void }) {
  const mine = message.from === 'you';
  if (message.from === 'system')
    return (
      <li className="type-meta mx-auto my-1 rounded-pill bg-fill-subtle px-3 py-1 text-center font-semibold text-fg-secondary">
        {message.text}
      </li>
    );
  return (
    <li className={cn('flex flex-col', mine ? 'items-end' : 'items-start')}>
      {showSender && PERSON[message.from] ? (
        <span className="type-meta mb-0.5 px-3 font-semibold text-fg-secondary">{PERSON[message.from].first}</span>
      ) : null}
      {message.plan ? (
        <PlanCard plan={message.plan} mine={mine} onToggle={onPlanToggle} />
      ) : (
        <div
          className={cn(
            'type-body max-w-[80%] whitespace-pre-wrap break-words rounded-bubble px-3 py-2',
            mine ? 'rounded-br-xs bg-bubble-out text-white' : 'rounded-bl-xs bg-bubble-in text-fg',
          )}
        >
          {message.text}
          <span className={cn('type-badge tabular float-right ml-2 mt-1.5 translate-y-1', mine ? 'text-white/70' : 'text-fg-tertiary')}>
            {message.time === 'now' ? 'Now' : message.time}
          </span>
        </div>
      )}
    </li>
  );
}

const PLAN_SUGGESTION = (place: string): Omit<DemoPlan, 'going'> => ({ title: 'Coffee', when: 'Tomorrow, 10 AM', place });

/**
 * One conversation: bubbles, plan cards, the say-hi prompt for a new Click, and a composer
 * with Plan. The iPhone and web previews render the same thread from shared state.
 */
export function ThreadBody({ id, glassComposer }: { id: ThreadId; glassComposer?: boolean }) {
  const { state, dispatch, typing } = useDemo();
  const [draft, setDraft] = useState('');
  const listRef = useRef<HTMLUListElement>(null);
  const messages = state.messages[id] ?? [];
  const summary = threadSummary(state, id);
  const person = PERSON[id];
  const multi = summary?.kind !== 'person';
  const event = id.startsWith('event:') ? EVENT[id.slice(6)] : null;
  const place = person?.met.place ?? event?.venue ?? 'Suzzallo Espresso';
  const isTyping = typing.has(id);

  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [messages.length, isTyping]);

  const send = (text: string) => {
    dispatch({ type: 'send', thread: id, text });
    setDraft('');
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ul ref={listRef} className="no-scrollbar flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto px-3 py-4" aria-label="Messages">
        <li className="type-badge mx-auto mb-1 rounded-pill bg-fill-subtle px-2.5 py-0.5 text-fg-secondary">Today</li>
        {messages.length === 0 && event ? (
          <li className="type-meta mx-auto max-w-[32ch] py-6 text-center text-fg-secondary">
            Say hello to the {event.going} people going to {event.title}.
          </li>
        ) : null}
        {messages.map((m, i) => (
          <Bubble
            key={m.id}
            message={m}
            showSender={multi && m.from !== messages[i - 1]?.from}
            onPlanToggle={() => dispatch({ type: 'planGoing', thread: id, messageId: m.id })}
          />
        ))}
        {isTyping ? (
          <li className="type-meta px-1 text-fg-tertiary" aria-live="polite">
            {person?.first} is typing…
          </li>
        ) : null}
        {person && isNewClick(messages) ? (
          <li className="mt-auto rounded-lg bg-surface p-3 dark:shadow-[inset_0_0_0_1px_var(--hairline)]" data-testid="say-hi">
            <p className="type-body-strong text-fg">Say hi to {person.first}</p>
            <p className="type-meta mt-0.5 text-fg-secondary">A new Click stays in Active for 48 hours. A hello keeps it there.</p>
            <div className="mt-2 flex flex-col items-start gap-1.5">
              {sayHiPrompts(person.first, place).map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => send(prompt)}
                  className="press type-body rounded-bubble bg-fill-subtle px-3 py-1.5 text-left text-fg hover:bg-fill-strong"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </li>
        ) : null}
      </ul>
      <form
        className={cn('flex shrink-0 items-end gap-2 border-t border-hairline px-3 pt-2', glassComposer ? 'material-glass pb-6' : 'bg-surface pb-3')}
        onSubmit={(e) => {
          e.preventDefault();
          send(draft);
        }}
      >
        <button
          type="button"
          onClick={() => dispatch({ type: 'plan', thread: id, plan: PLAN_SUGGESTION(place) })}
          aria-label={`Send a plan to ${summary?.title ?? 'this chat'}`}
          data-testid="composer-plan"
          className="press flex size-10 shrink-0 items-center justify-center rounded-full bg-fill-subtle text-accent hover:bg-fill-strong"
        >
          <CalendarPlus size={20} aria-hidden />
        </button>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={`Message ${person?.first ?? summary?.title ?? ''}`}
          aria-label="Message"
          className="type-body h-10 min-w-0 flex-1 rounded-pill bg-fill-subtle px-4 text-fg outline-none placeholder:text-fg-tertiary focus:shadow-[0_0_0_2px_var(--accent)]"
        />
        <button
          type="submit"
          disabled={!draft.trim()}
          aria-label="Send"
          className="press flex size-10 shrink-0 items-center justify-center rounded-full bg-action text-on-action transition-opacity disabled:opacity-40"
        >
          <SendHorizontal size={18} aria-hidden />
        </button>
      </form>
    </div>
  );
}

/** Name line for a thread header: person presence, or the group's members. */
export function ThreadTitle({ id }: { id: ThreadId }) {
  const { state } = useDemo();
  const summary = threadSummary(state, id);
  if (!summary) return null;
  return (
    <span className="flex min-w-0 items-center gap-2.5">
      <ThreadAvatar summary={summary} size={40} />
      <span className="min-w-0">
        <span className="type-body-strong block truncate text-fg">{summary.title}</span>
        <span className={cn('type-meta block truncate', summary.online ? 'text-online-text' : 'text-fg-tertiary')}>
          {summary.kind === 'person' ? (summary.online ? 'Online' : summary.subtitle) : summary.subtitle}
        </span>
      </span>
    </span>
  );
}

/* ---------- Events ---------- */

export function EventDetail({
  id,
  onOpenThread,
  onDirections,
}: {
  id: string;
  onOpenThread: (thread: ThreadId) => void;
  onDirections: () => void;
}) {
  const { state, dispatch } = useDemo();
  const event = EVENT[id];
  const going = state.rsvps.includes(id);
  const saved = state.saved.includes(id);
  const friends = event.goingIds.filter((pid) => state.connected.includes(pid)).map((pid) => PERSON[pid]);
  const people = going ? [{ seed: ME.id, name: ME.name }, ...friends.map((p) => ({ seed: p.id, name: p.name }))] : friends.map((p) => ({ seed: p.id, name: p.name }));

  return (
    <article data-testid={`event-${id}`} className="flex flex-col gap-4">
      <CardVisual seed={event.id} ratio="16:9" radius="xl" glyph={<CalendarDays />} />
      <div className="flex flex-wrap gap-1.5">
        {event.live ? <StatusPill variant="live">Live</StatusPill> : null}
        {event.tags.map((tag) => (
          <StatusPill key={tag} variant="neutral">
            {tag}
          </StatusPill>
        ))}
      </div>
      <div>
        <h3 className="type-title-2 text-fg">{event.title}</h3>
        <p className="type-body mt-1 flex items-center gap-2 text-fg-secondary">
          <Avatar seed={event.host} name={event.host} size={20} />
          Hosted by <span className="font-semibold text-fg">{event.host}</span>
        </p>
        <p className="type-headline mt-2 text-fg-secondary">{event.when}</p>
      </div>
      <div className="flex gap-2">
        <Button
          size="lg"
          className="min-w-0 flex-1"
          variant={going ? 'secondary' : 'primary'}
          icon={going ? Check : undefined}
          onClick={() => dispatch({ type: 'rsvp', id })}
          aria-pressed={going}
          data-testid={`rsvp-${id}`}
        >
          {going ? 'You’re going' : 'RSVP'}
        </Button>
        <Button
          size="lg"
          variant="secondary"
          icon={Bookmark}
          aria-label={saved ? 'Unsave event' : 'Save event'}
          aria-pressed={saved}
          onClick={() => dispatch({ type: 'save', id })}
          className={cn('w-12 shrink-0 px-0', saved && 'text-accent [&_svg]:fill-current')}
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="secondary" icon={MessageCircle} onClick={() => onOpenThread(eventThreadId(id))}>
          Event chat
        </Button>
        <Button variant="secondary" icon={Navigation} onClick={onDirections}>
          Directions
        </Button>
      </div>
      <section aria-label="Location" className="rounded-lg bg-surface p-4 dark:shadow-[inset_0_0_0_1px_var(--hairline)]">
        <p className="type-body-strong text-fg">{event.venue}</p>
        <p className="type-meta text-fg-secondary">{event.address}</p>
      </section>
      <section aria-label="Who’s going">
        <h4 className="type-headline text-fg">Going</h4>
        <div className="mt-2 flex items-center gap-3">
          {people.length ? <AvatarStack people={people} size={32} max={4} /> : null}
          <p className="type-body text-fg-secondary">
            {friends.length
              ? `${friends.map((p) => p.first).join(' and ')} ${friends.length === 1 ? 'is' : 'are'} going`
              : 'None of your Clicks yet'}
            {` · ${event.going + (going ? 1 : 0)} total`}
          </p>
        </div>
      </section>
      <section aria-label="About">
        <h4 className="type-headline text-fg">About</h4>
        <p className="type-reading mt-1 text-fg-secondary">{event.about}</p>
      </section>
    </article>
  );
}

/** Compact event row: DateTile, title, time and place. */
export function EventListRow({
  id,
  onOpen,
  detail,
  selected,
}: {
  id: string;
  onOpen: () => void;
  detail?: ReactNode;
  selected?: boolean;
}) {
  const event = EVENT[id];
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        aria-current={selected || undefined}
        className={cn(
          'flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left transition-colors duration-[var(--d-fast)]',
          selected ? 'bg-selection' : 'hover:bg-hover',
        )}
      >
        <DateTile month={event.month} day={event.day} />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="type-body-strong truncate text-fg">{event.title}</span>
            {event.live ? <StatusPill variant="live">Live</StatusPill> : null}
          </span>
          <span className="type-meta block truncate text-fg-secondary">{detail ?? `${event.when} · ${event.venue}`}</span>
        </span>
      </button>
    </li>
  );
}

/* ---------- Home sections (one source, two layouts) ---------- */

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-2 flex items-baseline justify-between gap-3 px-1">
      <h4 className="type-title-3 text-fg">{children}</h4>
      {action}
    </div>
  );
}

export const groupedSurface = 'overflow-hidden rounded-lg bg-surface dark:shadow-[inset_0_0_0_1px_var(--hairline)]';

/** "I'm down for…": your live intents, a match with a Click, and the edit row. */
export function AvailabilityList({ onEdit, onOpenThread }: { onEdit: () => void; onOpenThread: (id: ThreadId) => void }) {
  const { state } = useDemo();
  const match = state.intents.includes('Coffee') && state.connected.includes('maya');
  const row = 'flex min-h-14 w-full items-center gap-3 px-4 text-left';
  return (
    <ul className={groupedSurface}>
      {state.intents.map((tag) => (
        <li key={tag} className="border-b border-hairline last:border-0">
          <button type="button" onClick={onEdit} className={cn(row, 'hover:bg-hover')}>
            <span aria-hidden className="flex w-7 justify-center">
              <span className="size-3 rounded-full bg-online" />
            </span>
            <span className="min-w-0 flex-1 py-2">
              <span className="type-body block text-fg">{tag}</span>
              <span className="type-meta block text-fg-tertiary">Visible to your Clicks · until 9 PM</span>
            </span>
          </button>
        </li>
      ))}
      {match ? (
        <li className="border-b border-hairline">
          <button type="button" onClick={() => onOpenThread('maya')} className={cn(row, 'hover:bg-hover')}>
            <Avatar seed="maya" name="Maya Lin" size={32} />
            <span className="min-w-0 flex-1 py-2">
              <span className="type-body-strong block text-fg">Maya is down for coffee too</span>
              <span className="type-meta block text-fg-tertiary">Matching plans · say hi</span>
            </span>
          </button>
        </li>
      ) : null}
      <li>
        <button type="button" onClick={onEdit} className={cn(row, 'text-accent hover:bg-hover')} data-testid="edit-availability">
          <span className="flex w-7 justify-center">
            <Plus size={20} strokeWidth={2.25} aria-hidden />
          </span>
          <span className="type-body">{state.intents.length ? 'Add or change plans' : 'Share what you’re down for'}</span>
        </button>
      </li>
    </ul>
  );
}

/** Pick intents: the sheet behind "Add or change plans". */
export function AvailabilityPicker({ options }: { options: readonly string[] }) {
  const { state, dispatch } = useDemo();
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="I’m down for">
      {options.map((tag) => {
        const on = state.intents.includes(tag);
        return (
          <button
            key={tag}
            type="button"
            aria-pressed={on}
            onClick={() => dispatch({ type: 'intent', tag })}
            className={cn(
              'press type-body-strong inline-flex h-10 items-center gap-1.5 rounded-pill px-4',
              on ? 'bg-action text-on-action' : 'bg-fill-subtle text-fg hover:bg-fill-strong',
            )}
          >
            {on ? <Check size={16} strokeWidth={2.5} aria-hidden /> : null}
            {tag}
          </button>
        );
      })}
    </div>
  );
}

export function UpcomingList({ onOpen }: { onOpen: (item: UpcomingItem) => void }) {
  const { state } = useDemo();
  const items = upcoming(state);
  if (!items.length)
    return (
      <div className={cn(groupedSurface, 'px-4 py-6 text-center')}>
        <p className="type-body-strong text-fg">Nothing coming up</p>
        <p className="type-meta text-fg-secondary">Events you RSVP to or save, and plans from chats, appear here.</p>
      </div>
    );
  return (
    <ul className={cn(groupedSurface, 'p-1')} data-testid="upcoming">
      {items.map((item) => (
        <li key={`${item.kind}-${item.id}`}>
          <button
            type="button"
            onClick={() => onOpen(item)}
            className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left hover:bg-hover"
          >
            <DateTile month={item.month} day={item.day} />
            <span className="min-w-0 flex-1">
              <span className="type-body-strong block truncate text-fg">{item.title}</span>
              <span className="type-meta flex items-center gap-1 truncate text-fg-secondary">
                {item.kind === 'plan' ? <Clock size={12} aria-hidden /> : null}
                {item.detail}
              </span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

export function DropsRow({ onOpen }: { onOpen: (id: string) => void }) {
  return (
    <ul className="no-scrollbar -mx-1 flex gap-2.5 overflow-x-auto px-1 pb-1" aria-label="Drops from your Clicks">
      {DROPS.map((drop) => {
        const person = PERSON[drop.personId];
        const pending = Boolean(drop.developsIn);
        return (
          <li key={drop.id} className="w-[104px] shrink-0">
            <button
              type="button"
              disabled={pending}
              onClick={() => onOpen(drop.id)}
              aria-label={pending ? `${person.first}’s drop develops in ${drop.developsIn}` : `Open ${person.first}’s drop`}
              className="press block w-full text-left disabled:cursor-default"
            >
              <CardVisual seed={drop.id} radius="md" className="aspect-[3/4] w-full">
                <span className={cn('flex h-full flex-col justify-between p-2', pending && 'backdrop-saturate-50')}>
                  <Avatar seed={person.id} name={person.name} size={24} ringColor="transparent" />
                  {pending ? (
                    <span className="type-badge flex items-center gap-1 text-white">
                      <Hourglass size={12} aria-hidden />
                      {drop.developsIn}
                    </span>
                  ) : (
                    <span className="type-badge line-clamp-2 text-white">{drop.caption}</span>
                  )}
                </span>
              </CardVisual>
              <span className="type-meta mt-1 block truncate text-fg-secondary">
                {person.first} · {drop.age}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** A developed drop, full frame, story style. */
export function DropStory({ id, onClose }: { id: string; onClose: () => void }) {
  const drop = DROPS.find((d) => d.id === id) ?? DROPS[0];
  const person = PERSON[drop.personId];
  return (
    <div className="absolute inset-0 z-40 bg-black" role="dialog" aria-label={`${person.first}’s drop`} data-testid="drop-story">
      <CardVisual seed={drop.id} radius={0} className="size-full">
        <div className="flex h-full flex-col p-4 pt-12">
          <div aria-hidden className="h-0.5 w-full rounded-pill bg-white/90" />
          <div className="mt-3 flex items-center gap-2">
            <Avatar seed={person.id} name={person.name} size={32} ringColor="transparent" />
            <span className="type-body-strong">{person.first}</span>
            <span className="type-meta text-white/75">{drop.age}</span>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close drop"
              className="press ml-auto flex size-9 items-center justify-center rounded-full bg-black/25 text-white"
            >
              <X size={20} aria-hidden />
            </button>
          </div>
          <p className="type-title-3 mt-auto pb-6">{drop.caption}</p>
        </div>
      </CardVisual>
    </div>
  );
}

export function NearbyEvents({ onOpen, columns }: { onOpen: (id: string) => void; columns?: boolean }) {
  return (
    <ul className={cn('grid gap-3', columns && '@xl:grid-cols-3')}>
      {EVENTS.map((event) => (
        <li key={event.id}>
          <button type="button" onClick={() => onOpen(event.id)} className="press block w-full text-left">
            <CardVisual seed={event.id} ratio="16:9" radius="lg" glyph={<CalendarDays />} />
            <span className="mt-2 flex items-center gap-2 px-1">
              <span className="type-body-strong truncate text-fg">{event.title}</span>
              {event.live ? <StatusPill variant="live">Live</StatusPill> : null}
            </span>
            <span className="type-meta block truncate px-1 text-fg-secondary">
              {event.when} · {event.venue}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

export function RecapStats({ stats }: { stats: { label: string; value: number }[] }) {
  return (
    <dl className="grid grid-cols-3 gap-2">
      {stats.map((s) => (
        <div key={s.label} className="rounded-md bg-surface-raised px-3 py-2.5">
          <dd className="type-title-2 tabular text-fg">{s.value}</dd>
          <dt className="type-meta text-fg-secondary">{s.label}</dt>
        </div>
      ))}
    </dl>
  );
}

/* ---------- Add Click ---------- */

/** Single-use QR that rotates every 90 seconds, on white so any camera reads it. */
export function QrCard() {
  const [left, setLeft] = useState(72);
  useEffect(() => {
    const t = window.setInterval(() => setLeft((s) => (s <= 1 ? 90 : s - 1)), 1000);
    return () => window.clearInterval(t);
  }, []);
  return (
    <div className="flex flex-col items-center text-center">
      <div className="flex aspect-square w-full max-w-[232px] items-center justify-center rounded-xl bg-white p-5 dark:shadow-[inset_0_0_0_1px_var(--hairline)]">
        <QRCodeSVG value={DEMO_QR_URL} size={192} level="M" marginSize={0} className="h-auto w-full" title={`Click QR code for ${ME.name}`} />
      </div>
      <p className="type-body-strong mt-3 text-fg">{ME.name}</p>
      <p className="type-meta tabular mt-1 text-fg-secondary">New code in {left}s</p>
      <p className="type-meta mt-2 max-w-[34ch] text-fg-tertiary">
        Single-use code. It changes every 90 seconds so screenshots can’t be reused.
      </p>
    </div>
  );
}

/* ---------- Me ---------- */

export function MeContent({
  onAvailability,
  onOpenEvent,
  onQr,
}: {
  onAvailability: () => void;
  onOpenEvent: (id: string) => void;
  onQr: () => void;
}) {
  const { state, dispatch } = useDemo();
  const core = state.connected.filter((id) => PERSON[id].core).map((id) => PERSON[id]);
  const saved = state.saved[0];
  const freeToggle = (
    <Toggle checked={state.free} onCheckedChange={(free) => dispatch({ type: 'free', free })} aria-label="Free currently" />
  );
  return (
    <div data-testid="me-content">
      <div className="flex flex-col items-center pt-4 text-center">
        <Avatar seed={ME.id} name={ME.name} size={96} presence={state.free} />
        <h3 className="type-title-2 mt-3 text-fg">{ME.name}</h3>
        <p className="type-body text-fg-secondary">{ME.bio}</p>
        <p className="type-meta mt-1 font-semibold text-fg-secondary">
          <span className="tabular text-fg">{state.connected.length}</span> Clicks
        </p>
      </div>
      <div className={cn(groupedSurface, 'mt-5 flex items-center gap-3 p-3')}>
        <AvatarStack size={32} people={core.map((p) => ({ seed: p.id, name: p.name }))} />
        <span className="min-w-0">
          <span className="type-body-strong block text-fg">Core</span>
          <span className="type-meta block truncate text-fg-secondary">{core.map((p) => p.first).join(', ')}</span>
        </span>
      </div>
      <ListGroup className="mt-5">
        <ListRow title="Free currently" trailing={freeToggle} />
        <ListRow title="I’m down for…" subtitle={state.intents.join(', ') || 'Nothing shared'} chevron onClick={onAvailability} />
      </ListGroup>
      <ListGroup className="mt-5">
        <ListRow
          icon={BookmarkCheck}
          title="Saved events"
          trailing={<span className="type-body tabular text-fg-tertiary">{state.saved.length}</span>}
          chevron={Boolean(saved)}
          disabled={!saved}
          onClick={() => saved && onOpenEvent(saved)}
        />
        <ListRow icon={Ticket} title="Going" trailing={<span className="type-body tabular text-fg-tertiary">{state.rsvps.length}</span>} />
        <ListRow icon={QrCode} title="My QR" chevron onClick={onQr} />
      </ListGroup>
    </div>
  );
}
