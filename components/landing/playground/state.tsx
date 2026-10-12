'use client';

import { createContext, useContext, type Dispatch } from 'react';
import {
  EVENT,
  EVENTS,
  GROUP,
  HUB,
  INITIAL_INTENTS,
  INITIAL_MESSAGES,
  JORDAN_ID,
  PERSON,
  eventThreadId,
} from './mockData';
import type {
  Device,
  DemoMessage,
  DemoPerson,
  DemoPlan,
  DemoState,
  PhoneRoute,
  PhoneTab,
  ThreadId,
  WebSection,
} from './types';

export const INITIAL_CONNECTED = ['maya', 'sam', 'priya'] as const;
export const INITIAL_RSVPS = ['comedy'] as const;
export const INITIAL_SAVED = ['climb'] as const;

export function initialState(): DemoState {
  return {
    connected: INITIAL_CONNECTED,
    messages: INITIAL_MESSAGES,
    rsvps: INITIAL_RSVPS,
    saved: INITIAL_SAVED,
    intents: INITIAL_INTENTS,
    free: true,
    group: null,
    hub: null,
    tapTag: null,
    phone: { tab: 'home', route: null },
    web: { section: 'home', threadId: null, eventId: null, dropId: null },
  };
}

export type DemoAction =
  | { type: 'phoneTab'; tab: PhoneTab }
  | { type: 'phonePush'; route: PhoneRoute }
  | { type: 'phonePop' }
  | { type: 'webSection'; section: WebSection }
  | { type: 'webThread'; id: ThreadId | null }
  | { type: 'webEvent'; id: string | null }
  | { type: 'webDrop'; id: string | null }
  /** Opens the same thing on both devices (the guide's "Show me"). */
  | { type: 'focus'; target: FocusTarget }
  | { type: 'connect'; id: string }
  | { type: 'tapTag'; tag: string }
  | { type: 'send'; thread: ThreadId; text: string; from?: string }
  | { type: 'plan'; thread: ThreadId; plan: Omit<DemoPlan, 'going'> }
  | { type: 'planGoing'; thread: ThreadId; messageId: string }
  | { type: 'rsvp'; id: string }
  | { type: 'save'; id: string }
  | { type: 'intent'; tag: string }
  | { type: 'free'; free: boolean }
  | { type: 'createGroup'; name: string }
  | { type: 'joinHub'; name?: string }
  | { type: 'reset' };

export type FocusTarget =
  | { kind: 'thread'; id: ThreadId }
  | { kind: 'event'; id: string }
  | { kind: 'tap' }
  | { kind: 'availability' };

const toggle = (list: readonly string[], id: string) =>
  list.includes(id) ? list.filter((x) => x !== id) : [...list, id];

const now = () => {
  const d = new Date();
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
};

let seq = 0;
const nextId = (prefix: string) => `${prefix}-${++seq}`;

function append(state: DemoState, thread: ThreadId, message: DemoMessage): DemoState {
  return { ...state, messages: { ...state.messages, [thread]: [...(state.messages[thread] ?? []), message] } };
}

export function reducer(state: DemoState, action: DemoAction): DemoState {
  switch (action.type) {
    case 'phoneTab':
      return { ...state, phone: { tab: action.tab, route: null } };
    case 'phonePush':
      return { ...state, phone: { ...state.phone, route: action.route } };
    case 'phonePop':
      return { ...state, phone: { ...state.phone, route: null } };
    case 'webSection':
      return { ...state, web: { section: action.section, threadId: null, eventId: null, dropId: null } };
    case 'webThread':
      return { ...state, web: { ...state.web, section: 'clicks', threadId: action.id, eventId: null } };
    case 'webEvent':
      return { ...state, web: { ...state.web, section: 'events', eventId: action.id, threadId: null } };
    case 'webDrop':
      return { ...state, web: { ...state.web, dropId: action.id } };
    case 'focus': {
      const t = action.target;
      if (t.kind === 'thread')
        return {
          ...state,
          phone: { tab: 'clicks', route: { kind: 'thread', id: t.id } },
          web: { section: 'clicks', threadId: t.id, eventId: null, dropId: null },
        };
      if (t.kind === 'event')
        return {
          ...state,
          phone: { tab: 'home', route: { kind: 'event', id: t.id } },
          web: { section: 'events', threadId: null, eventId: t.id, dropId: null },
        };
      if (t.kind === 'tap')
        return {
          ...state,
          phone: { tab: 'add', route: state.connected.includes(JORDAN_ID) ? null : { kind: 'tap' } },
          web: { section: 'add', threadId: null, eventId: null, dropId: null },
        };
      return {
        ...state,
        phone: { tab: 'home', route: { kind: 'availability' } },
        web: { section: 'home', threadId: null, eventId: null, dropId: null },
      };
    }
    case 'connect': {
      if (state.connected.includes(action.id)) return state;
      const person = PERSON[action.id];
      return append({ ...state, connected: [action.id, ...state.connected] }, action.id, {
        id: nextId('click'),
        from: 'system',
        text: `You Clicked at ${person.met.place}`,
        time: 'now',
      });
    }
    case 'tapTag':
      return { ...state, tapTag: state.tapTag === action.tag ? null : action.tag };
    case 'send': {
      const text = action.text.trim();
      if (!text) return state;
      return append(state, action.thread, { id: nextId('msg'), from: action.from ?? 'you', text, time: now() });
    }
    case 'plan':
      // Whoever proposes a plan is going (same rule as the app).
      return append(state, action.thread, {
        id: nextId('plan'),
        from: 'you',
        text: `${action.plan.title}, ${action.plan.when}`,
        time: now(),
        plan: { ...action.plan, going: true },
      });
    case 'planGoing':
      return {
        ...state,
        messages: {
          ...state.messages,
          [action.thread]: (state.messages[action.thread] ?? []).map((m) =>
            m.id === action.messageId && m.plan ? { ...m, plan: { ...m.plan, going: !m.plan.going } } : m,
          ),
        },
      };
    case 'rsvp':
      return { ...state, rsvps: toggle(state.rsvps, action.id) };
    case 'save':
      return { ...state, saved: toggle(state.saved, action.id) };
    case 'intent':
      return { ...state, intents: toggle(state.intents, action.tag) };
    case 'free':
      return { ...state, free: action.free };
    case 'createGroup': {
      const name = action.name.trim() || GROUP.defaultName;
      if (state.group) return { ...state, group: { name } };
      return append({ ...state, group: { name } }, GROUP.id, {
        id: nextId('group'),
        from: 'system',
        text: 'Verified group: you, Maya and Sam tapped together',
        time: 'now',
      });
    }
    case 'joinHub':
      return { ...state, hub: { name: action.name?.trim() || state.hub?.name || HUB.defaultName } };
    case 'reset':
      return initialState();
  }
}

type DemoContextValue = {
  state: DemoState;
  dispatch: Dispatch<DemoAction>;
  /** Threads where the other person is typing a reply. */
  typing: ReadonlySet<ThreadId>;
  /** Below the side-by-side breakpoint only one device shows; this switches to the other. */
  showDevice: (device: Device) => void;
};

export const DemoContext = createContext<DemoContextValue | null>(null);

export function useDemo(): DemoContextValue {
  const value = useContext(DemoContext);
  if (!value) throw new Error('useDemo must be used inside the landing playground');
  return value;
}

/* ---------- Derived data, shared by the iPhone and web previews ---------- */

export const isNewClick = (thread: readonly DemoMessage[] | undefined) =>
  !thread || thread.every((m) => m.from === 'system');

export const connectedPeople = (s: DemoState): DemoPerson[] => s.connected.map((id) => PERSON[id]);

export type ThreadSummary = {
  id: ThreadId;
  title: string;
  /** Avatar seeds: one for a person, two members for a group. */
  seeds: readonly string[];
  kind: 'person' | 'group' | 'hub' | 'event';
  subtitle: string;
  preview: string;
  time: string;
  sayHi: boolean;
  online?: boolean;
  core?: boolean;
};

function previewOf(messages: readonly DemoMessage[]): string {
  const last = messages.at(-1);
  if (!last) return '';
  if (last.plan) return `Plan: ${last.plan.title}, ${last.plan.when}`;
  return last.from === 'you' ? `You: ${last.text}` : last.text;
}

export function threadSummary(s: DemoState, id: ThreadId): ThreadSummary | null {
  const messages = s.messages[id] ?? [];
  const last = messages.at(-1);
  if (PERSON[id]) {
    const p = PERSON[id];
    const sayHi = isNewClick(messages);
    return {
      id,
      title: p.name,
      seeds: [p.id],
      kind: 'person',
      subtitle: `${p.met.label} at ${p.met.place}`,
      preview: sayHi ? `New Click at ${p.met.place}. Say hi` : previewOf(messages),
      time: last?.time ?? '',
      sayHi,
      online: p.online,
      core: p.core,
    };
  }
  if (id === GROUP.id && s.group)
    return {
      id,
      title: s.group.name,
      seeds: GROUP.memberIds,
      kind: 'group',
      subtitle: 'You, Maya and Sam · Verified group',
      preview: previewOf(messages),
      time: last?.time ?? '',
      sayHi: false,
    };
  if (id === HUB.id && s.hub)
    return {
      id,
      title: s.hub.name,
      seeds: [HUB.id],
      kind: 'hub',
      subtitle: `Community hub · ${HUB.members} people`,
      preview: previewOf(messages),
      time: last?.time ?? '',
      sayHi: false,
    };
  if (id.startsWith('event:')) {
    const e = EVENT[id.slice(6)];
    if (!e) return null;
    return {
      id,
      title: e.title,
      seeds: [e.id],
      kind: 'event',
      subtitle: `Event chat · ${e.going} going`,
      preview: previewOf(messages) || `Chat with people going to ${e.title}`,
      time: last?.time ?? '',
      sayHi: false,
    };
  }
  return null;
}

export const activeThreads = (s: DemoState) =>
  s.connected.map((id) => threadSummary(s, id)).filter((t): t is ThreadSummary => Boolean(t));

export const groupThreads = (s: DemoState) =>
  [
    s.group ? GROUP.id : null,
    s.hub ? HUB.id : null,
    ...EVENTS.filter((e) => s.messages[eventThreadId(e.id)]).map((e) => eventThreadId(e.id)),
  ]
    .filter((id): id is string => Boolean(id))
    .map((id) => threadSummary(s, id))
    .filter((t): t is ThreadSummary => Boolean(t));

/** Unread-style badge on the Clicks tab: new Clicks waiting for a hello. */
export const sayHiCount = (s: DemoState) => activeThreads(s).filter((t) => t.sayHi).length;

export type UpcomingItem =
  | { kind: 'event'; id: string; title: string; detail: string; month: string; day: number }
  | { kind: 'plan'; id: string; thread: ThreadId; title: string; detail: string; month: string; day: number };

/** Events you RSVP'd to or saved, then plans you're going to, as one list (Home "Upcoming"). */
export function upcoming(s: DemoState): UpcomingItem[] {
  const events: UpcomingItem[] = EVENTS.filter((e) => s.rsvps.includes(e.id) || s.saved.includes(e.id)).map((e) => ({
    kind: 'event',
    id: e.id,
    title: e.title,
    detail: `${e.when} · ${s.rsvps.includes(e.id) ? 'Going' : 'Saved'}`,
    month: e.month,
    day: e.day,
  }));
  const plans: UpcomingItem[] = Object.entries(s.messages).flatMap(([thread, messages]) =>
    messages
      .filter((m) => m.plan?.going)
      .map((m) => {
        const with_ = threadSummary(s, thread)?.title.split(' ')[0] ?? '';
        return {
          kind: 'plan' as const,
          id: m.id,
          thread,
          title: `${m.plan!.title} with ${with_}`,
          detail: `${m.plan!.when} · ${m.plan!.place}`,
          month: 'Oct',
          day: 13,
        };
      }),
  );
  return [...plans, ...events].sort((a, b) => a.day - b.day);
}

export function recap(s: DemoState, period: 'day' | 'week') {
  const sent = Object.values(s.messages)
    .flat()
    .filter((m) => m.from === 'you').length;
  const newClicks = s.connected.filter((id) => !(INITIAL_CONNECTED as readonly string[]).includes(id)).length;
  return [
    { label: 'New Clicks', value: period === 'day' ? newClicks : newClicks + 2 },
    { label: 'Messages', value: period === 'day' ? Math.max(0, sent - 2) : sent + 9 },
    { label: 'Events', value: s.rsvps.length + (period === 'week' ? 1 : 0) },
  ];
}

/* ---------- The guided tour ---------- */

export type GuideStep = { id: string; title: string; done: boolean; target: FocusTarget };

export function guideSteps(s: DemoState): GuideStep[] {
  const jordan = s.messages[JORDAN_ID] ?? [];
  const planned = Object.values(s.messages).some((t) => t.some((m) => m.plan && m.from === 'you'));
  return [
    { id: 'tap', title: 'Tap to Connect with Jordan', done: s.connected.includes(JORDAN_ID), target: { kind: 'tap' } },
    {
      id: 'hi',
      title: 'Say hi before the 48 hours are up',
      done: jordan.some((m) => m.from === 'you'),
      target: { kind: 'thread', id: s.connected.includes(JORDAN_ID) ? JORDAN_ID : 'maya' },
    },
    {
      id: 'plan',
      title: 'Send a plan from the chat',
      done: planned,
      target: { kind: 'thread', id: s.connected.includes(JORDAN_ID) ? JORDAN_ID : 'maya' },
    },
    {
      id: 'rsvp',
      title: 'RSVP to tonight’s mixer',
      done: s.rsvps.includes('mixer'),
      target: { kind: 'event', id: 'mixer' },
    },
    {
      id: 'intent',
      title: 'Share what you’re down for',
      done: s.intents.length !== INITIAL_INTENTS.length || s.intents.some((t) => !(INITIAL_INTENTS as readonly string[]).includes(t)),
      target: { kind: 'availability' },
    },
  ];
}
