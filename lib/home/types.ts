import type { HomeNudge } from '@/lib/dashboard/homeFeed';
import type { ActivityRecap } from '@/lib/me/activityRecap';
import type { AvailabilityIntentRow } from '@/lib/userProfile/availability';

/** Wire types for the signed-in Home (spec §7.1). Plain JSON: server → client props. */

export type HomePerson = { id: string; name: string; avatarUrl: string | null };

export type HomeEvent = {
  id: string;
  title: string;
  startAt: string | null;
  endAt: string | null;
  locationName: string | null;
  imageUrl: string | null;
  /** How it is yours: hosting, going, or saved. */
  relation: 'hosting' | 'going' | 'saved';
};

/** A new Click still inside its 48 h say-hi window. */
export type HomeSayHi = { connectionId: string; person: HomePerson; deadlineMs: number };

export type HomeOpportunity =
  | { kind: 'event'; event: HomeEvent; live: boolean }
  | ({ kind: 'sayHi' } & HomeSayHi)
  | { kind: 'nudge'; nudge: HomeNudge; person: HomePerson | null };

export type HomeDrop = {
  id: string;
  user: { id: string; name: string; avatar_url: string | null };
  is_mine: boolean;
  connection_id: string | null;
  created_at: string;
  reveal_at: string;
  developed_at: string | null;
  preview_url: string | null;
  original_url: string | null;
  caption: string | null;
};

export type HomeChapter = {
  id: string;
  /** First day of the month, ISO. */
  monthStart: string;
  count: number;
  people: HomePerson[];
};

export type HomeAvailability = {
  intents: AvailabilityIntentRow[];
  /** Active connections whose current intent overlaps yours. */
  matches: { connectionId: string; person: HomePerson; label: string }[];
};

export type HomeActivityRow = {
  id: string;
  type: string;
  title: string;
  body: string;
  data: Record<string, string>;
  created_at: string;
  actor: { id: string; name: string; avatar_url: string | null } | null;
};

export type HomeData = {
  viewer: { id: string; firstName: string };
  /** IANA zone the server used for "today" (from the `click_tz` cookie). */
  timeZone: string;
  nowMs: number;
  opportunity: HomeOpportunity | null;
  newClicks: HomeSayHi[];
  drops: { enabled: boolean; items: HomeDrop[] };
  upcoming: HomeEvent[];
  recap: { day: ActivityRecap; week: ActivityRecap } | null;
  memories: HomeChapter[];
  availability: HomeAvailability;
  core: HomePerson[];
  activityPreview: HomeActivityRow[];
};
