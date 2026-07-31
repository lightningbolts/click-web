import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import { createAdminSupabaseClient } from '@/lib/server/admin/supabaseAdmin';

const REPORT_LIMIT = 120;
const FORWARDED_MESSAGE_LIMIT = 160;
const CONNECTION_GRAPH_LIMIT = 1200;
const HANDSHAKE_SAMPLE_LIMIT = 1000;

type Primitive = string | number | boolean | null;

type RecordValue = Record<string, unknown>;

export type VenueTier = 'Spark' | 'Pulse' | 'Nexus' | 'Enterprise';

export type ModerationReportItem = {
  id: string;
  connectionId: string;
  reporterId: string;
  reporterLabel: string;
  reportedId: string;
  reportedLabel: string;
  reason: string;
  createdAt: Primitive;
};

export type ForwardedMessageItem = {
  id: string;
  chatId: string;
  connectionId: string | null;
  senderId: string;
  senderLabel: string;
  content: string;
  messageType: string;
  createdAt: Primitive;
};

export type GraphAnomalyItem = {
  userId: string;
  userLabel: string;
  recentConnectionDegree: number;
};

export type VenueSubscriptionItem = {
  id: string;
  name: string;
  location: string | null;
  subscriptionStatus: string;
  inferredTier: VenueTier;
  managerCount: number;
  createdAt: Primitive;
};

export type VenueVerificationQueueItem = {
  venueId: string;
  venueName: string;
  subscriptionStatus: string;
  ownerCount: number;
  createdAt: Primitive;
};

export type PopUpBeaconItem = {
  id: string;
  venueId: string;
  venueName: string;
  categoryTarget: string;
  perkDescription: string;
  startsAt: Primitive;
  endsAt: Primitive;
  latitude: number | null;
  longitude: number | null;
};

export type EncounterDiagnostics = {
  sampledHandshakeEvents24h: number;
  sampledHandshakeFailures24h: number;
  uniqueConstraintCrashProxy24h: number;
  encountersInserted24h: number;
  estimatedSuccessRatePct: number;
  /** Count of rows in `connection_flow_events` (0 when table missing). */
  connectionFlowEvents24h: number;
};

export type AdminDashboardData = {
  moderation: {
    reports: ModerationReportItem[];
    forwardedMessages: ForwardedMessageItem[];
    graphAnomalies: GraphAnomalyItem[];
  };
  insights: {
    subscriptions: VenueSubscriptionItem[];
    activeTierCounts: Record<VenueTier, number>;
    verificationQueue: VenueVerificationQueueItem[];
    activeBeacons: PopUpBeaconItem[];
  };
  operations: {
    encounterDiagnostics: EncounterDiagnostics;
    waitlistCount: number;
    activeAccountCount: number;
  };
  warnings: string[];
};

function asRecord(value: unknown): RecordValue | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as RecordValue)
    : null;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function asBoolean(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
}

function shortId(id: string): string {
  if (id.length <= 10) return id;
  return `${id.slice(0, 6)}...${id.slice(-4)}`;
}

function normalizeSubscriptionStatus(value: string | null): string {
  return value?.trim().toLowerCase() || 'inactive';
}

function inferTierFromVenueRow(row: RecordValue): VenueTier {
  const seed = [
    asString(row.subscription_tier),
    asString(row.tier),
    asString(row.plan_tier),
    asString(row.stripe_subscription_id),
    asString(row.name),
  ]
    .filter((value): value is string => Boolean(value))
    .join(' ')
    .toLowerCase();

  if (seed.includes('enterprise')) return 'Enterprise';
  if (seed.includes('nexus')) return 'Nexus';
  if (seed.includes('pulse')) return 'Pulse';
  if (seed.includes('spark')) return 'Spark';

  const status = normalizeSubscriptionStatus(asString(row.subscription_status));
  if (status === 'active') return 'Pulse';
  if (status === 'trialing') return 'Spark';
  if (status === 'past_due' || status === 'unpaid') return 'Nexus';
  return 'Spark';
}

function isConsentForwardedMessage(row: RecordValue): boolean {
  const messageType = asString(row.message_type)?.toLowerCase() ?? 'text';
  if (messageType === 'report_forward') return true;

  const metadata = asRecord(row.metadata);
  if (!metadata) return false;

  const candidateFlags = [
    metadata.consent_forwarded,
    metadata.report_consent,
    metadata.moderation_forwarded,
    metadata.forwarded_for_moderation,
  ];

  return candidateFlags.some((flag) => {
    const boolValue = asBoolean(flag);
    if (boolValue !== null) return boolValue;
    return asString(flag)?.toLowerCase() === 'true';
  });
}

function displayNameForUser(userId: string, directory: Map<string, string>): string {
  return directory.get(userId) ?? `User ${shortId(userId)}`;
}

async function fetchUserDirectory(
  admin: SupabaseClient,
  userIds: string[],
  warnings: string[],
): Promise<Map<string, string>> {
  const normalized = Array.from(new Set(userIds.filter((id) => id.trim().length > 0)));
  if (normalized.length === 0) return new Map<string, string>();

  const selectAttempts = ['id,name,full_name,email', 'id,name,email', 'id,name', 'id,email', 'id'];

  for (const selection of selectAttempts) {
    const { data, error } = await admin.from('users').select(selection).in('id', normalized);

    if (error) {
      continue;
    }

    const directory = new Map<string, string>();
    for (const raw of data ?? []) {
      const row = asRecord(raw);
      if (!row) continue;

      const id = asString(row.id);
      if (!id) continue;

      const label =
        asString(row.name)?.trim() ||
        asString(row.full_name)?.trim() ||
        asString(row.email)?.trim() ||
        `User ${shortId(id)}`;

      directory.set(id, label);
    }

    return directory;
  }

  warnings.push('Could not resolve display names from public.users; showing user IDs.');
  return new Map<string, string>();
}

async function fetchModerationReports(
  admin: SupabaseClient,
  warnings: string[],
): Promise<ModerationReportItem[]> {
  const { data: rawReports, error: reportError } = await admin
    .from('connection_reports')
    .select('id, connection_id, reporter_id, reason, created_at')
    .order('created_at', { ascending: false })
    .limit(REPORT_LIMIT);

  if (reportError) {
    warnings.push(`connection_reports unavailable: ${reportError.message}`);
    return [];
  }

  const reports = (rawReports ?? [])
    .map((raw) => asRecord(raw))
    .filter((row): row is RecordValue => row !== null);

  const connectionIds = Array.from(
    new Set(
      reports
        .map((row) => asString(row.connection_id))
        .filter((id): id is string => Boolean(id)),
    ),
  );

  const connectionById = new Map<string, string[]>();
  if (connectionIds.length > 0) {
    const { data: rawConnections, error: connectionError } = await admin
      .from('connections')
      .select('id, user_ids')
      .in('id', connectionIds);

    if (connectionError) {
      warnings.push(`Could not join connections for reports: ${connectionError.message}`);
    } else {
      for (const raw of rawConnections ?? []) {
        const row = asRecord(raw);
        if (!row) continue;
        const id = asString(row.id);
        if (!id) continue;
        connectionById.set(id, asStringArray(row.user_ids));
      }
    }
  }

  const relevantUserIds = new Set<string>();
  for (const row of reports) {
    const reporterId = asString(row.reporter_id);
    if (reporterId) relevantUserIds.add(reporterId);

    const connectionId = asString(row.connection_id);
    if (!connectionId) continue;

    const participants = connectionById.get(connectionId) ?? [];
    for (const participant of participants) {
      relevantUserIds.add(participant);
    }
  }

  const userDirectory = await fetchUserDirectory(admin, Array.from(relevantUserIds), warnings);

  const mapped: ModerationReportItem[] = [];
  for (const row of reports) {
    const reportId = asString(row.id);
    const connectionId = asString(row.connection_id);
    const reporterId = asString(row.reporter_id);
    if (!reportId || !connectionId || !reporterId) continue;

    const participants = connectionById.get(connectionId) ?? [];
    const reportedId = participants.find((id) => id !== reporterId) ?? 'unknown';

    mapped.push({
      id: reportId,
      connectionId,
      reporterId,
      reporterLabel: displayNameForUser(reporterId, userDirectory),
      reportedId,
      reportedLabel:
        reportedId === 'unknown' ? 'Unknown participant' : displayNameForUser(reportedId, userDirectory),
      reason: asString(row.reason)?.trim() || '(no reason provided)',
      createdAt: (row.created_at as Primitive) ?? null,
    });
  }

  return mapped;
}

async function fetchForwardedMessages(
  admin: SupabaseClient,
  warnings: string[],
): Promise<ForwardedMessageItem[]> {
  let rows: RecordValue[] = [];

  const consentFilter = [
    'message_type.eq.report_forward',
    'metadata->>consent_forwarded.eq.true',
    'metadata->>report_consent.eq.true',
    'metadata->>moderation_forwarded.eq.true',
    'metadata->>forwarded_for_moderation.eq.true',
  ].join(',');

  const primary = await admin
    .from('messages')
    .select('id, chat_id, user_id, content, message_type, metadata, time_created')
    .or(consentFilter)
    .order('time_created', { ascending: false })
    .limit(FORWARDED_MESSAGE_LIMIT);

  if (primary.error) {
    warnings.push(`Forwarded-message metadata filter fallback: ${primary.error.message}`);

    const fallback = await admin
      .from('messages')
      .select('id, chat_id, user_id, content, message_type, metadata, time_created')
      .order('time_created', { ascending: false })
      .limit(FORWARDED_MESSAGE_LIMIT);

    if (fallback.error) {
      warnings.push(`messages unavailable: ${fallback.error.message}`);
      return [];
    }

    rows = (fallback.data ?? [])
      .map((raw) => asRecord(raw))
      .filter((row): row is RecordValue => row !== null)
      .filter((row) => isConsentForwardedMessage(row));
  } else {
    rows = (primary.data ?? [])
      .map((raw) => asRecord(raw))
      .filter((row): row is RecordValue => row !== null);
  }

  const chatIds = Array.from(
    new Set(rows.map((row) => asString(row.chat_id)).filter((id): id is string => Boolean(id))),
  );

  const connectionByChatId = new Map<string, string>();
  if (chatIds.length > 0) {
    const { data: rawChats, error: chatError } = await admin
      .from('chats')
      .select('id, connection_id')
      .in('id', chatIds);

    if (chatError) {
      warnings.push(`Could not map chat IDs to connections: ${chatError.message}`);
    } else {
      for (const raw of rawChats ?? []) {
        const row = asRecord(raw);
        if (!row) continue;
        const chatId = asString(row.id);
        const connectionId = asString(row.connection_id);
        if (!chatId || !connectionId) continue;
        connectionByChatId.set(chatId, connectionId);
      }
    }
  }

  const senderIds = Array.from(
    new Set(rows.map((row) => asString(row.user_id)).filter((id): id is string => Boolean(id))),
  );
  const userDirectory = await fetchUserDirectory(admin, senderIds, warnings);

  return rows
    .map((row) => {
      const id = asString(row.id);
      const chatId = asString(row.chat_id);
      const senderId = asString(row.user_id);
      if (!id || !chatId || !senderId) return null;

      const content = asString(row.content)?.trim() ?? '';
      if (!content || content.startsWith('e2e:')) return null;

      return {
        id,
        chatId,
        connectionId: connectionByChatId.get(chatId) ?? null,
        senderId,
        senderLabel: displayNameForUser(senderId, userDirectory),
        content,
        messageType: asString(row.message_type) || 'text',
        createdAt: (row.time_created as Primitive) ?? null,
      } satisfies ForwardedMessageItem;
    })
    .filter((item): item is ForwardedMessageItem => item !== null)
    .slice(0, FORWARDED_MESSAGE_LIMIT);
}

async function fetchConnectionGraphAnomalies(
  admin: SupabaseClient,
  warnings: string[],
): Promise<GraphAnomalyItem[]> {
  const sinceMs = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const { data: rawConnections, error } = await admin
    .from('connections')
    .select('id, user_ids, created')
    .gte('created', sinceMs)
    .order('created', { ascending: false })
    .limit(CONNECTION_GRAPH_LIMIT);

  if (error) {
    warnings.push(`Connection graph diagnostics unavailable: ${error.message}`);
    return [];
  }

  const degreeByUser = new Map<string, number>();

  for (const raw of rawConnections ?? []) {
    const row = asRecord(raw);
    if (!row) continue;
    for (const userId of asStringArray(row.user_ids)) {
      degreeByUser.set(userId, (degreeByUser.get(userId) ?? 0) + 1);
    }
  }

  const suspiciousUsers = Array.from(degreeByUser.entries())
    .filter(([, degree]) => degree >= 30)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([userId]) => userId);

  const userDirectory = await fetchUserDirectory(admin, suspiciousUsers, warnings);

  return suspiciousUsers.map((userId) => ({
    userId,
    userLabel: displayNameForUser(userId, userDirectory),
    recentConnectionDegree: degreeByUser.get(userId) ?? 0,
  }));
}

async function fetchSubscriptions(
  admin: SupabaseClient,
  warnings: string[],
): Promise<{
  subscriptions: VenueSubscriptionItem[];
  activeTierCounts: Record<VenueTier, number>;
  verificationQueue: VenueVerificationQueueItem[];
}> {
  const { data: rawVenues, error: venueError } = await admin
    .from('venues')
    .select('id, name, location, subscription_status, stripe_subscription_id, created_at')
    .order('created_at', { ascending: false });

  const emptyTierCounts: Record<VenueTier, number> = {
    Spark: 0,
    Pulse: 0,
    Nexus: 0,
    Enterprise: 0,
  };

  if (venueError) {
    warnings.push(`venues unavailable: ${venueError.message}`);
    return {
      subscriptions: [],
      activeTierCounts: emptyTierCounts,
      verificationQueue: [],
    };
  }

  const venues = (rawVenues ?? [])
    .map((raw) => asRecord(raw))
    .filter((row): row is RecordValue => row !== null);

  const venueIds = venues
    .map((row) => asString(row.id))
    .filter((id): id is string => Boolean(id));

  const managerCountByVenue = new Map<string, number>();
  if (venueIds.length > 0) {
    const { data: managerRows, error: managerError } = await admin
      .from('venue_managers')
      .select('venue_id')
      .in('venue_id', venueIds);

    if (managerError) {
      warnings.push(`venue_managers unavailable: ${managerError.message}`);
    } else {
      for (const raw of managerRows ?? []) {
        const row = asRecord(raw);
        const venueId = row ? asString(row.venue_id) : null;
        if (!venueId) continue;
        managerCountByVenue.set(venueId, (managerCountByVenue.get(venueId) ?? 0) + 1);
      }
    }
  }

  const subscriptions: VenueSubscriptionItem[] = venues
    .map((row) => {
      const id = asString(row.id);
      const name = asString(row.name);
      if (!id || !name) return null;

      return {
        id,
        name,
        location: asString(row.location),
        subscriptionStatus: normalizeSubscriptionStatus(asString(row.subscription_status)),
        inferredTier: inferTierFromVenueRow(row),
        managerCount: managerCountByVenue.get(id) ?? 0,
        createdAt: (row.created_at as Primitive) ?? null,
      } satisfies VenueSubscriptionItem;
    })
    .filter((item): item is VenueSubscriptionItem => item !== null);

  const activeTierCounts: Record<VenueTier, number> = {
    Spark: 0,
    Pulse: 0,
    Nexus: 0,
    Enterprise: 0,
  };

  for (const venue of subscriptions) {
    if (venue.subscriptionStatus === 'active' || venue.subscriptionStatus === 'trialing') {
      activeTierCounts[venue.inferredTier] += 1;
    }
  }

  const pendingStatuses = new Set(['inactive', 'incomplete', 'past_due']);
  const verificationQueue = subscriptions
    .filter((venue) => pendingStatuses.has(venue.subscriptionStatus))
    .map((venue) => ({
      venueId: venue.id,
      venueName: venue.name,
      subscriptionStatus: venue.subscriptionStatus,
      ownerCount: venue.managerCount,
      createdAt: venue.createdAt,
    }))
    .slice(0, 40);

  return {
    subscriptions,
    activeTierCounts,
    verificationQueue,
  };
}

async function fetchActiveBeacons(
  admin: SupabaseClient,
  warnings: string[],
): Promise<PopUpBeaconItem[]> {
  const nowIso = new Date().toISOString();

  const { data: rawBeacons, error: beaconError } = await admin
    .from('venue_pop_up_hubs')
    .select('id, venue_id, category_target, perk_description, starts_at, ends_at')
    .lte('starts_at', nowIso)
    .gte('ends_at', nowIso)
    .order('starts_at', { ascending: false })
    .limit(300);

  if (beaconError) {
    warnings.push(`venue_pop_up_hubs unavailable: ${beaconError.message}`);
    return [];
  }

  const beacons = (rawBeacons ?? [])
    .map((raw) => asRecord(raw))
    .filter((row): row is RecordValue => row !== null);

  const venueIds = Array.from(
    new Set(beacons.map((row) => asString(row.venue_id)).filter((id): id is string => Boolean(id))),
  );

  const venueDirectory = new Map<string, { name: string; latitude: number | null; longitude: number | null }>();

  if (venueIds.length > 0) {
    const { data: rawVenues, error: venueError } = await admin
      .from('venues')
      .select('id, name, latitude, longitude')
      .in('id', venueIds);

    if (venueError) {
      warnings.push(`Could not hydrate beacon venue metadata: ${venueError.message}`);
    } else {
      for (const raw of rawVenues ?? []) {
        const row = asRecord(raw);
        if (!row) continue;
        const id = asString(row.id);
        const name = asString(row.name);
        if (!id || !name) continue;

        venueDirectory.set(id, {
          name,
          latitude: asNumber(row.latitude),
          longitude: asNumber(row.longitude),
        });
      }
    }
  }

  return beacons
    .map((row) => {
      const id = asString(row.id);
      const venueId = asString(row.venue_id);
      if (!id || !venueId) return null;

      const venue = venueDirectory.get(venueId);
      return {
        id,
        venueId,
        venueName: venue?.name ?? `Venue ${shortId(venueId)}`,
        categoryTarget: asString(row.category_target)?.trim() || 'Unspecified',
        perkDescription: asString(row.perk_description)?.trim() || '(no description)',
        startsAt: (row.starts_at as Primitive) ?? null,
        endsAt: (row.ends_at as Primitive) ?? null,
        latitude: venue?.latitude ?? null,
        longitude: venue?.longitude ?? null,
      } satisfies PopUpBeaconItem;
    })
    .filter((item): item is PopUpBeaconItem => item !== null)
    .slice(0, 120);
}

async function fetchEncounterDiagnostics(
  admin: SupabaseClient,
  warnings: string[],
): Promise<EncounterDiagnostics> {
  const empty: EncounterDiagnostics = {
    sampledHandshakeEvents24h: 0,
    sampledHandshakeFailures24h: 0,
    uniqueConstraintCrashProxy24h: 0,
    encountersInserted24h: 0,
    estimatedSuccessRatePct: 0,
    connectionFlowEvents24h: 0,
  };

  const sinceIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const handshakesQuery = await admin
    .from('proximity_handshake_events')
    .select('id, user_id, my_token, heard_tokens, lat, lon, created_at')
    .gte('created_at', sinceIso)
    .order('created_at', { ascending: false })
    .limit(HANDSHAKE_SAMPLE_LIMIT);

  if (handshakesQuery.error) {
    warnings.push(`proximity_handshake_events unavailable: ${handshakesQuery.error.message}`);
    return empty;
  }

  const handshakeRows = (handshakesQuery.data ?? [])
    .map((raw) => asRecord(raw))
    .filter((row): row is RecordValue => row !== null);

  const sampledHandshakeEvents24h = handshakeRows.length;

  let sampledHandshakeFailures24h = 0;
  const duplicatesByToken = new Map<string, number>();

  for (const row of handshakeRows) {
    const heardTokens = asStringArray(row.heard_tokens);
    const lat = asNumber(row.lat);
    const lon = asNumber(row.lon);

    if (lat === null || lon === null || heardTokens.length === 0) {
      sampledHandshakeFailures24h += 1;
    }

    const userId = asString(row.user_id) ?? 'unknown';
    const myToken = asString(row.my_token) ?? 'unknown';
    const key = `${userId}:${myToken}`;
    duplicatesByToken.set(key, (duplicatesByToken.get(key) ?? 0) + 1);
  }

  let uniqueConstraintCrashProxy24h = 0;
  for (const count of duplicatesByToken.values()) {
    if (count > 1) uniqueConstraintCrashProxy24h += count - 1;
  }

  const encountersCount = await admin
    .from('connection_encounters')
    .select('id', { head: true, count: 'exact' })
    .gte('encountered_at', sinceIso);

  if (encountersCount.error) {
    warnings.push(`connection_encounters count unavailable: ${encountersCount.error.message}`);
  }

  const encountersInserted24h = encountersCount.count ?? 0;
  const denominator = Math.max(sampledHandshakeEvents24h, 1);
  const estimatedSuccessRatePct = Math.max(
    0,
    Math.min(100, Math.round((encountersInserted24h / denominator) * 1000) / 10),
  );

  let connectionFlowEvents24h = 0;
  const flowCount = await admin
    .from('connection_flow_events')
    .select('id', { head: true, count: 'exact' })
    .gte('created_at', sinceIso);
  if (flowCount.error) {
    // Non-breaking: migration may not be applied yet.
    warnings.push(`connection_flow_events count unavailable: ${flowCount.error.message}`);
  } else {
    connectionFlowEvents24h = flowCount.count ?? 0;
  }

  return {
    sampledHandshakeEvents24h,
    sampledHandshakeFailures24h,
    uniqueConstraintCrashProxy24h,
    encountersInserted24h,
    estimatedSuccessRatePct,
    connectionFlowEvents24h,
  };
}

async function fetchBetaFunnel(
  admin: SupabaseClient,
  warnings: string[],
): Promise<{ waitlistCount: number; activeAccountCount: number }> {
  const [waitlistResult, usersResult] = await Promise.all([
    admin.from('waitlist').select('id', { head: true, count: 'exact' }),
    admin.from('users').select('id', { head: true, count: 'exact' }),
  ]);

  if (waitlistResult.error) {
    warnings.push(`waitlist count unavailable: ${waitlistResult.error.message}`);
  }

  if (usersResult.error) {
    warnings.push(`active account count unavailable: ${usersResult.error.message}`);
  }

  return {
    waitlistCount: waitlistResult.count ?? 0,
    activeAccountCount: usersResult.count ?? 0,
  };
}

export async function getAdminDashboardData(): Promise<AdminDashboardData> {
  const warnings: string[] = [];
  const admin = createAdminSupabaseClient();

  const [reports, forwardedMessages, graphAnomalies, subscriptionsData, activeBeacons, encounterDiagnostics, betaFunnel] =
    await Promise.all([
      fetchModerationReports(admin, warnings),
      fetchForwardedMessages(admin, warnings),
      fetchConnectionGraphAnomalies(admin, warnings),
      fetchSubscriptions(admin, warnings),
      fetchActiveBeacons(admin, warnings),
      fetchEncounterDiagnostics(admin, warnings),
      fetchBetaFunnel(admin, warnings),
    ]);

  return {
    moderation: {
      reports,
      forwardedMessages,
      graphAnomalies,
    },
    insights: {
      subscriptions: subscriptionsData.subscriptions,
      activeTierCounts: subscriptionsData.activeTierCounts,
      verificationQueue: subscriptionsData.verificationQueue,
      activeBeacons,
    },
    operations: {
      encounterDiagnostics,
      waitlistCount: betaFunnel.waitlistCount,
      activeAccountCount: betaFunnel.activeAccountCount,
    },
    warnings,
  };
}
