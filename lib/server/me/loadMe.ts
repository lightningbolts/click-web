import 'server-only';

import { cache } from 'react';
import { cookies } from 'next/headers';
import type { SupabaseClient } from '@supabase/supabase-js';
import { displayNameFromUser, type UserProfileRow } from '@/lib/events/attendeeDirectory';
import { connectionRowTimestampMs, normalizeConnectionStatus } from '@/lib/dashboard/connectionStatus';
import type { MetricConnection } from '@/lib/dashboard/userMetrics';
import type { HomePerson } from '@/lib/home/types';
import { createAdminSupabaseClient } from '@/lib/server/admin/supabaseAdmin';
import { getServerUser } from '@/lib/server/getServerUser';
import { loadConnections, peerOf, type ConnectionRow } from '@/lib/server/home/loadHome';
import { resolveFeature } from '@/lib/server/featureFlags';
import { loadSessionBootstrap } from '@/lib/server/session';
import { loadInterestTags, loadPersonalityTags, loadProfileSettings } from '@/lib/server/settings/loadSettings';
import { TIME_ZONE_COOKIE, validTimeZone } from '@/lib/time/viewerTimeZone';
import type { AvailabilityIntentRow } from '@/lib/userProfile/availability';

const MAX_CORE = 12;

export type MeData = {
  viewer: { id: string; name: string; avatarUrl: string | null; bio: string };
  clicksCount: number;
  core: HomePerson[];
  intents: AvailabilityIntentRow[];
  interestsCount: number;
  personalityCount: number;
  managesPlaces: boolean;
  placesEnabled: boolean;
  historyEnabled: boolean;
  timeZone: string;
  nowMs: number;
};

async function soft<T>(label: string, fallback: T, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (e) {
    console.error(`[me] ${label}:`, e instanceof Error ? e.message : e);
    return fallback;
  }
}

export async function loadPeople(admin: SupabaseClient, ids: string[]): Promise<Map<string, HomePerson>> {
  if (ids.length === 0) return new Map();
  const { data } = await admin.from('users').select('id, name, image, first_name, last_name').in('id', ids);
  return new Map(((data ?? []) as UserProfileRow[]).map((u) => [u.id, { id: u.id, name: displayNameFromUser(u, 'Someone'), avatarUrl: u.image }]));
}

/** Server rows → what the milestone metrics read. */
export function metricConnections(rows: ConnectionRow[]): MetricConnection[] {
  return rows.map((r) => ({
    dateMet: new Date(connectionRowTimestampMs(r)),
    status: normalizeConnectionStatus(r),
    source: typeof r.source === 'string' ? r.source : null,
  }));
}

/** Me (spec §7.7): identity, Core, availability and the counts the section rows show, in one round. */
export const loadMe = cache(async (): Promise<MeData | null> => {
  const [user, bootstrap, jar] = await Promise.all([getServerUser(), loadSessionBootstrap(), cookies()]);
  if (!user || !bootstrap) return null;
  const admin = createAdminSupabaseClient();
  const nowMs = Date.now();

  const [connections, profile, interests, personality, intents, places, history] = await Promise.all([
    soft('connections', null, () => loadConnections(admin, user.id)),
    soft('profile', null, () => loadProfileSettings(admin, user.id)),
    soft('interests', [] as string[], () => loadInterestTags(admin, user.id)),
    soft('personality', [] as string[], () => loadPersonalityTags(admin, user.id)),
    soft('intents', [] as AvailabilityIntentRow[], async () => {
      const { data, error } = await admin
        .from('availability_intents')
        .select('id, timeframe, intent_tag, expires_at')
        .eq('user_id', user.id)
        .gt('expires_at', new Date(nowMs).toISOString())
        .order('expires_at', { ascending: true });
      if (error) throw new Error(error.message);
      return (data ?? []) as AvailabilityIntentRow[];
    }),
    soft('places flag', false, async () => (await resolveFeature(admin, 'click_places', user.id)).enabled),
    soft('history flag', false, async () => (await resolveFeature(admin, 'event_history', user.id)).enabled),
  ]);

  const active = connections?.active ?? [];
  const coreIds = active
    .filter((r) => connections?.core.has(r.id))
    .slice(0, MAX_CORE)
    .map((r) => peerOf(r, user.id)!);
  const people = await soft('core people', new Map<string, HomePerson>(), () => loadPeople(admin, coreIds));

  return {
    viewer: { id: user.id, name: bootstrap.viewer.name, avatarUrl: bootstrap.viewer.avatarUrl, bio: profile?.bio ?? '' },
    clicksCount: active.length,
    core: coreIds.map((id) => people.get(id) ?? { id, name: 'Someone', avatarUrl: null }),
    intents,
    interestsCount: interests.length,
    personalityCount: personality.length,
    managesPlaces: bootstrap.managesPlaces,
    placesEnabled: places,
    historyEnabled: history,
    timeZone: validTimeZone(jar.get(TIME_ZONE_COOKIE)?.value) ?? 'UTC',
    nowMs,
  };
});
