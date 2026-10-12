/** A 1:1 thread is keyed by the person's id; groups, hubs and event chats by their own id. */
export type ThreadId = string;

export type LatLng = { lat: number; lng: number };

export type DemoPerson = {
  id: string;
  name: string;
  first: string;
  core?: boolean;
  online?: boolean;
  /** Where you first Clicked (the shared timeline's first entry). */
  met: { place: string; label: string; when: string };
  geo: LatLng;
};

export type DemoEvent = {
  id: string;
  title: string;
  venue: string;
  address: string;
  month: string;
  day: number;
  when: string;
  live?: boolean;
  host: string;
  tags: readonly string[];
  about: string;
  /** Your Clicks who are going. */
  goingIds: readonly string[];
  going: number;
  geo: LatLng;
};

/** A hangout plan sent in chat: same fields as the app's plan card. */
export type DemoPlan = { title: string; when: string; place: string; going: boolean };

export type DemoMessage = {
  id: string;
  /** `you`, `system`, or the sender's person id. */
  from: string;
  text: string;
  time: string;
  plan?: DemoPlan;
};

export type DemoDrop = {
  id: string;
  personId: string;
  caption: string;
  age: string;
  /** Still developing: shown blurred until then. */
  developsIn?: string;
};

export type PhoneTab = 'home' | 'add' | 'clicks' | 'map' | 'me';

/** One pushed screen over a tab root, like a NavigationStack one level deep. */
export type PhoneRoute =
  | { kind: 'thread'; id: ThreadId }
  | { kind: 'event'; id: string }
  | { kind: 'drop'; id: string }
  | { kind: 'tap' }
  | { kind: 'group' }
  | { kind: 'qr' }
  | { kind: 'scan' }
  | { kind: 'hub' }
  | { kind: 'availability' };

export type WebSection = 'home' | 'clicks' | 'map' | 'events' | 'add' | 'me';

export type Device = 'phone' | 'web';

export type DemoState = {
  connected: readonly string[];
  messages: Readonly<Record<ThreadId, readonly DemoMessage[]>>;
  rsvps: readonly string[];
  saved: readonly string[];
  intents: readonly string[];
  free: boolean;
  group: { name: string } | null;
  hub: { name: string } | null;
  /** The tag picked on the Tap result ("What brought you together?"). */
  tapTag: string | null;
  phone: { tab: PhoneTab; route: PhoneRoute | null };
  web: { section: WebSection; threadId: ThreadId | null; eventId: string | null; dropId: string | null };
};
