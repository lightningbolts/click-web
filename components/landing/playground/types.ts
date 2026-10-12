export type PlaygroundScene =
  | "home"
  | "connect"
  | "events"
  | "dashboard"
  | "clicks"
  | "map"
  | "hubs"
  | "settings";

import type { AppNavId } from "@/lib/shell/appNav";
export type DashboardTab =
  | Exclude<AppNavId, "business">
  | "add"
  | "me"
  | "hubs";

export type MemoryCapsule = {
  place: string;
  label: string;
  weather: string;
  when: string;
  noise: string;
  volume: 1 | 2 | 3;
};

/** A hangout plan sent in chat (same shape as the app's plan card: title, time, place, RSVP). */
export type DemoPlan = {
  title: string;
  when: string;
  place: string;
  going: boolean;
};

export type ChatMessage = {
  id: string;
  from: "you" | "them" | "system";
  text: string;
  time: string;
  plan?: DemoPlan;
};

export type PlaygroundPerson = {
  id: string;
  name: string;
  initials: string;
  nearbyMeters?: number;
  memory?: MemoryCapsule;
  geo: { lat: number; lng: number };
  status: "active" | "kept";
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
  intents: ReadonlySet<string>;
  hubMessages: readonly string[];
  joinedHub: boolean;
  selectedEventId: string;
  savedEventIds: ReadonlySet<string>;
  inboxTab: "active" | "groups" | "archived";
  groupName: string | null;
  groupMessages: readonly string[];
  hubName: string;
  hubMode: "browse" | "create";
};

export type PlaygroundActions = {
  connectPerson: (id: string, memory: MemoryCapsule) => void;
  toggleRsvp: (eventId: string) => void;
  toggleRoute: (eventId: string) => void;
  sendMessage: (personId: string, text: string) => void;
  sendPlan: (personId: string, plan: Omit<DemoPlan, "going">) => void;
  togglePlanGoing: (personId: string, messageId: string) => void;
  setOpenChatId: (id: string | null) => void;
  setDashboardTab: (tab: DashboardTab) => void;
  setScene: (scene: PlaygroundScene) => void;
  toggleIntent: (intent: string) => void;
  joinHub: () => void;
  sendHubMessage: (text: string) => void;
  setSelectedEventId: (id: string) => void;
  toggleSavedEvent: (id: string) => void;
  setInboxTab: (tab: PlaygroundState["inboxTab"]) => void;
  createGroup: (name: string) => void;
  sendGroupMessage: (text: string) => void;
  createHub: (name: string) => void;
  setHubMode: (mode: PlaygroundState["hubMode"]) => void;
};
