import type { DemoDrop, DemoEvent, DemoMessage, DemoPerson, ThreadId } from './types';

/** The visitor plays Alex, the account in the App Store screenshots. */
export const ME = { id: 'alex', name: 'Alex Rivera', first: 'Alex', bio: 'Coffee, live music and long walks.' } as const;

export const JORDAN_ID = 'jordan';

/** Seattle fixtures: the playground map is clamped to the city (see playgroundMapStyle). */
export const PEOPLE: readonly DemoPerson[] = [
  {
    id: 'maya',
    name: 'Maya Lin',
    first: 'Maya',
    core: true,
    online: true,
    met: { place: 'Suzzallo Library', label: 'Study session', when: 'Aug 21' },
    geo: { lat: 47.6546, lng: -122.3086 },
  },
  {
    id: 'sam',
    name: 'Sam Ortiz',
    first: 'Sam',
    core: true,
    met: { place: 'IMA climbing wall', label: 'Climbing', when: 'Sep 30' },
    geo: { lat: 47.6528, lng: -122.3005 },
  },
  {
    id: 'priya',
    name: 'Priya Nair',
    first: 'Priya',
    online: true,
    met: { place: 'Pike Place Market', label: 'Comedy show', when: 'Oct 4' },
    geo: { lat: 47.6612, lng: -122.3132 },
  },
  {
    id: JORDAN_ID,
    name: 'Jordan Hale',
    first: 'Jordan',
    online: true,
    met: { place: 'Kane Hall', label: 'Dawg Daze Mixer', when: 'Today' },
    geo: { lat: 47.6574, lng: -122.3104 },
  },
];

export const PERSON: Readonly<Record<string, DemoPerson>> = Object.fromEntries(PEOPLE.map((p) => [p.id, p]));

export const EVENTS: readonly DemoEvent[] = [
  {
    id: 'mixer',
    title: 'Dawg Daze Mixer',
    venue: 'Kane Hall',
    address: '4069 Spokane Ln NE',
    month: 'Oct',
    day: 12,
    when: 'Tonight, 7–10 PM',
    live: true,
    host: 'ASUW',
    tags: ['Social', 'Campus'],
    about: 'Orientation week mixer. The room is set up for same-room intros, so bring your phone.',
    goingIds: ['maya', 'priya'],
    going: 48,
    geo: { lat: 47.6566, lng: -122.3091 },
  },
  {
    id: 'climb',
    title: 'Friday Night Climb',
    venue: 'IMA climbing wall',
    address: '3924 Montlake Blvd NE',
    month: 'Oct',
    day: 16,
    when: 'Fri, 6–9 PM',
    host: 'UW Climbing Club',
    tags: ['Sports', 'Beginner friendly'],
    about: 'Open belay night. Shoes provided. RSVP so your Clicks can find you on the wall.',
    goingIds: ['sam'],
    going: 21,
    geo: { lat: 47.6536, lng: -122.3015 },
  },
  {
    id: 'comedy',
    title: 'Campus Comedy Night',
    venue: 'Husky Union Building',
    address: '4001 E Stevens Way NE',
    month: 'Oct',
    day: 17,
    when: 'Sat, 8–10:30 PM',
    host: 'HUB Activities',
    tags: ['Comedy', 'Live'],
    about: 'Student comics, then everyone hangs out in the lobby.',
    goingIds: ['priya', 'maya'],
    going: 112,
    geo: { lat: 47.6554, lng: -122.305 },
  },
];

export const EVENT: Readonly<Record<string, DemoEvent>> = Object.fromEntries(EVENTS.map((e) => [e.id, e]));

/** Event chats are threads keyed `event:<id>`. */
export const eventThreadId = (eventId: string): ThreadId => `event:${eventId}`;

export const GROUP = { id: 'group', memberIds: ['maya', 'sam'], defaultName: 'Study group' } as const;

export const HUB = { id: 'hub', defaultName: 'Kane Hall community', place: 'Kane Hall', members: 12, distance: '40 m away' } as const;

/** "What brought you together?" suggestions from the iOS Tap result. */
export const CONTEXT_TAGS = ['🎉 Party', '☕ Cafe / Coffee', '📚 Study Session', '🎓 Lecture / Class', '🏟️ Campus Event'] as const;

/** Suggestions in the availability sheet. */
export const INTENT_OPTIONS = ['Coffee', 'Study session', 'Walk', 'Live music', 'Dinner'] as const;
export const INITIAL_INTENTS = ['Coffee'] as const;

/** Maya's own availability, which makes the "matching plans" row on Home. */
export const MAYA_INTENT = 'Coffee';

export const INITIAL_MESSAGES: Readonly<Record<ThreadId, readonly DemoMessage[]>> = {
  maya: [
    { id: 'm1', from: 'maya', text: 'Are you going to comedy night on Saturday?', time: '2:14 PM' },
    { id: 'm2', from: 'you', text: 'Already RSVP’d. Meet in the HUB lobby?', time: '2:16 PM' },
    { id: 'm3', from: 'maya', text: 'Perfect, see you there', time: '2:17 PM' },
  ],
  sam: [{ id: 's1', from: 'sam', text: 'Friday night climb?', time: 'Mon' }],
  priya: [
    { id: 'p1', from: 'priya', text: 'That set was wild', time: 'Sat' },
    { id: 'p2', from: 'you', text: 'Still laughing about the ferry bit.', time: 'Sat' },
  ],
  [HUB.id]: [{ id: 'hub1', from: 'maya', text: 'Anyone heading to the mixer after class?', time: '5:02 PM' }],
};

/** One reply per 1:1 thread after you write, so a conversation feels like one. */
export const REPLIES: Readonly<Record<string, string>> = {
  jordan: 'Great meeting you too! That mixer was packed 😄',
  maya: 'Sounds good to me',
  sam: 'Yes! I’ll bring an extra harness',
  priya: 'Haha same. Next show?',
};

/** Shared Drops on Home. A new drop develops an hour after it's taken, like the app. */
export const DROPS: readonly DemoDrop[] = [
  { id: 'drop-maya', personId: 'maya', caption: 'Golden hour on the Quad', age: '2h' },
  { id: 'drop-sam', personId: 'sam', caption: 'Sent my first V4', age: '5h' },
  { id: 'drop-priya', personId: 'priya', caption: 'Ferry ride home', age: '12m', developsIn: '48m' },
];

export const DEMO_QR_URL = 'https://joinclick.co/c/demo-ck-1842';
