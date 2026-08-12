import type { ChatMessage, MemoryCapsule, PlaygroundEvent, PlaygroundPerson } from './types';

export const JORDAN_ID = 'jordan';

export const JORDAN: PlaygroundPerson = {
  id: JORDAN_ID,
  name: 'Jordan Hale',
  initials: 'JH',
  nearbyMeters: 4,
  geo: { lat: 47.6566, lng: -122.3091 },
  status: 'active',
  dateMet: 'Just now',
  chatPreview: 'You Clicked in Kane Hall lobby.',
  chatTime: 'now',
  online: true,
};

export const PLAYGROUND_PEOPLE: PlaygroundPerson[] = [
  {
    id: 'maya',
    name: 'Maya Chen',
    initials: 'MC',
    memory: {
      place: 'Red Square',
      label: 'Outdoor concert',
      weather: 'Sunny · 68°F',
      when: 'Yesterday afternoon',
      noise: 'Loud',
      volume: 3,
    },
    geo: { lat: 47.6553, lng: -122.3095 },
    status: 'kept',
    dateMet: 'Aug 11, 2026',
    chatPreview: 'You going to comedy night?',
    chatTime: '2h',
    online: true,
  },
  {
    id: 'historia',
    name: 'Historia',
    initials: 'H',
    memory: {
      place: 'Pike Place',
      label: 'Indoor comedy show',
      weather: 'Drizzle · 52°F',
      when: 'Last week',
      noise: 'Moderate',
      volume: 2,
    },
    geo: { lat: 47.6097, lng: -122.3421 },
    status: 'active',
    dateMet: 'Aug 5, 2026',
    chatPreview: 'That set was wild',
    chatTime: 'Sat',
  },
  {
    id: 'ymir',
    name: 'Ymir',
    initials: 'Y',
    memory: {
      place: 'IMA Climbing Wall',
      label: 'Climbing session',
      weather: 'Clear · 61°F',
      when: '3 days ago',
      noise: 'Quiet',
      volume: 1,
    },
    geo: { lat: 47.6536, lng: -122.3015 },
    status: 'active',
    dateMet: 'Aug 9, 2026',
    chatPreview: 'Friday night climb?',
    chatTime: 'Mon',
    online: true,
  },
  JORDAN,
];

export const PLAYGROUND_EVENTS: PlaygroundEvent[] = [
  {
    id: 'mixer',
    title: 'Dawg Daze Mixer',
    venue: 'Kane Hall',
    when: 'Tonight · 7:00–10:00 PM',
    host: 'ASUW',
    description: 'Orientation week mixer. Bring a Click — the room is built for same-room intros.',
    attendeeIds: ['maya'],
    geo: { lat: 47.6566, lng: -122.3091 },
  },
  {
    id: 'climb',
    title: 'Friday Night Climb',
    venue: 'IMA Climbing Wall',
    when: 'Fri · 6:00–9:00 PM',
    host: 'UW Climbing Club',
    description: 'Open belay night. RSVP so your Clicks can find you on the wall.',
    attendeeIds: ['ymir'],
    geo: { lat: 47.6536, lng: -122.3015 },
  },
  {
    id: 'comedy',
    title: 'Campus Comedy Night',
    venue: 'Husky Union Building',
    when: 'Sat · 8:00–10:30 PM',
    host: 'HUB Activities',
    description: 'Student comics, then hang in the lobby. Historia is already in.',
    attendeeIds: ['historia', 'maya'],
    geo: { lat: 47.6554, lng: -122.305 },
  },
];

export const INITIAL_CONNECTED_IDS = ['maya', 'historia', 'ymir'] as const;
export const INITIAL_RSVP_IDS = ['comedy'] as const;

export const MEMORY_PRESETS = ['Party', 'Class', 'Show', 'Coffee'] as const;

export const JORDAN_DEFAULT_MEMORY: MemoryCapsule = {
  place: 'Kane Hall lobby',
  label: 'Party',
  weather: 'Clear · 64°F',
  when: 'Just now',
  noise: 'Loud',
  volume: 3,
};

export const INITIAL_MESSAGES: Record<string, ChatMessage[]> = {
  maya: [
    { id: 'm1', from: 'them', text: 'You going to comedy night?', time: '2:14 PM' },
    { id: 'm2', from: 'you', text: 'Already RSVP’d. Meet in the HUB lobby?', time: '2:16 PM' },
  ],
  historia: [
    { id: 'h1', from: 'them', text: 'That set was wild', time: 'Sat 10:41 PM' },
    { id: 'h2', from: 'you', text: 'Still laughing about the Pike Place bit.', time: 'Sat 10:44 PM' },
  ],
  ymir: [
    { id: 'y1', from: 'them', text: 'Friday night climb?', time: 'Mon 4:02 PM' },
  ],
};

export const DEMO_QR_URL = 'https://click.app/c/demo-ck-1842';
export const DEMO_CLICK_ID = 'CK-1842';
export const DEMO_USER_NAME = 'Alex Rivera';
