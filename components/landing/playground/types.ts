export type PlaygroundScene = 'connect' | 'events' | 'dashboard' | 'clicks' | 'map' | 'settings';

export type DashboardTab = 'memory' | 'map' | 'chat' | 'identity';

export type MemoryCapsule = {
  place: string;
  label: string;
  weather: string;
  when: string;
  noise: string;
  volume: 1 | 2 | 3;
};

export type ChatMessage = {
  id: string;
  from: 'you' | 'them';
  text: string;
  time: string;
};

export type PlaygroundPerson = {
  id: string;
  name: string;
  initials: string;
  nearbyMeters?: number;
  memory?: MemoryCapsule;
  geo: { lat: number; lng: number };
  status: 'active' | 'kept';
  dateMet: string;
  chatPreview: string;
  chatTime: string;
  online?: boolean;
};

export type PlaygroundEvent = {
  id: string;
  title: string;
  venue: string;
  when: string;
  host: string;
  description: string;
  attendeeIds: string[];
  geo: { lat: number; lng: number };
};

export type PlaygroundState = {
  connectedIds: ReadonlySet<string>;
  rsvpIds: ReadonlySet<string>;
  routeIds: ReadonlySet<string>;
  memories: Readonly<Record<string, MemoryCapsule>>;
  messages: Readonly<Record<string, ChatMessage[]>>;
  openChatId: string | null;
  dashboardTab: DashboardTab;
};

export type PlaygroundActions = {
  connectPerson: (id: string, memory: MemoryCapsule) => void;
  toggleRsvp: (eventId: string) => void;
  toggleRoute: (eventId: string) => void;
  sendMessage: (personId: string, text: string) => void;
  setOpenChatId: (id: string | null) => void;
  setDashboardTab: (tab: DashboardTab) => void;
  setScene: (scene: PlaygroundScene) => void;
};
