import type { ConnectionLifecycleStatus } from '@/types/connection';

/** UI / table status includes legacy `expired` from older schemas. */
export type ConnectionDisplayStatus = ConnectionLifecycleStatus | 'expired';

const MS_48H = 48 * 60 * 60 * 1000;
const MS_7D = 7 * 24 * 60 * 60 * 1000;
const WARNING_WINDOW_MS = 6 * 60 * 60 * 1000; // show “soon” inside 6h of deadline

export type ArchiveCountdownKind = 'initial_message' | 'follow_up';

export type ArchiveCountdownInfo = {
  kind: ArchiveCountdownKind;
  deadlineMs: number;
  /** Milliseconds remaining until auto-archive (negative if past deadline). */
  remainingMs: number;
  /** True when within WARNING_WINDOW_MS of deadline and still visible in active chat. */
  isUrgent: boolean;
};

function asFiniteNumber(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/**
 * Prefer explicit `status`, then map legacy `expiry_state` / chat heuristics.
 */
export function normalizeConnectionStatus(row: Record<string, unknown>): ConnectionDisplayStatus {
  const raw = row.status;
  if (
    raw === 'pending' ||
    raw === 'active' ||
    raw === 'kept' ||
    raw === 'archived' ||
    raw === 'removed'
  ) {
    return raw;
  }

  const expiry = row.expiry_state;
  if (expiry === 'kept') return 'kept';
  if (expiry === 'pending') return 'pending';
  if (expiry === 'expired') return 'expired';

  const hasBegun = row.has_begun === true;
  if (hasBegun) return 'active';

  return 'pending';
}

/** PostgREST `.or()` filter for rows visible in the main connections / chat list (matches GET default). */
export const ACTIVE_CONNECTIONS_DB_OR_FILTER =
  'status.is.null,status.eq.pending,status.eq.active,status.eq.kept';

/** Shown in active chat lists (not removed/archived by server or legacy expired). */
export function isActiveChatListStatus(status: ConnectionDisplayStatus): boolean {
  if (status === 'removed' || status === 'archived' || status === 'expired') return false;
  return status === 'pending' || status === 'active' || status === 'kept';
}

export function connectionRowTimestampMs(row: Record<string, unknown>): number {
  const created = asFiniteNumber(row.created);
  if (created != null && created > 0) return created;
  const createdUtc = row.created_utc;
  if (typeof createdUtc === 'string') {
    const t = Date.parse(createdUtc);
    if (Number.isFinite(t)) return t;
  }
  const createdAt = row.created_at;
  if (typeof createdAt === 'string') {
    const t = Date.parse(createdAt);
    if (Number.isFinite(t)) return t;
  }
  return Date.now();
}

export function lastMessageTimestampMs(row: Record<string, unknown>): number | null {
  const lm = asFiniteNumber(row.last_message_at);
  if (lm != null && lm > 0) return lm;
  return null;
}

/**
 * Computes auto-archive countdown from connection row (48h first message, 7d follow-up).
 * Returns null when not applicable (e.g. kept, already archived, or no threshold).
 */
export function getArchiveCountdown(
  row: Record<string, unknown>,
  nowMs: number = Date.now(),
): ArchiveCountdownInfo | null {
  const status = normalizeConnectionStatus(row);
  if (!isActiveChatListStatus(status)) return null;
  if (status === 'kept') return null;

  const createdMs = connectionRowTimestampMs(row);
  const lastMsg = lastMessageTimestampMs(row);

  if (lastMsg == null) {
    const deadlineMs = createdMs + MS_48H;
    const remainingMs = deadlineMs - nowMs;
    return {
      kind: 'initial_message',
      deadlineMs,
      remainingMs,
      isUrgent: remainingMs <= WARNING_WINDOW_MS && remainingMs > 0,
    };
  }

  const deadlineMs = lastMsg + MS_7D;
  const remainingMs = deadlineMs - nowMs;
  return {
    kind: 'follow_up',
    deadlineMs,
    remainingMs,
    isUrgent: remainingMs <= WARNING_WINDOW_MS && remainingMs > 0,
  };
}

/** Fields needed to evaluate auto-archive countdown on the client. */
export type ArchiveCountdownConnectionInput = {
  status: ConnectionDisplayStatus;
  lastMessageAt?: number | null;
  connectionCreatedMs?: number;
  dateMet: Date;
  hasBegun?: boolean;
  expiryState?: string | null;
};

export function connectionRecordToArchiveRow(c: ArchiveCountdownConnectionInput): Record<string, unknown> {
  return {
    status: c.status,
    last_message_at: c.lastMessageAt ?? null,
    created: c.connectionCreatedMs ?? c.dateMet.getTime(),
    created_utc: c.dateMet.toISOString(),
    has_begun: c.hasBegun === true,
    expiry_state: c.expiryState ?? null,
  };
}

const MS_24H = 24 * 60 * 60 * 1000;

/** Show a list-row hint when within 24h of auto-archive (or already in the urgent 6h window). */
export function shouldShowArchiveWarning(info: ArchiveCountdownInfo): boolean {
  if (info.remainingMs <= 0) return false;
  return info.isUrgent || info.remainingMs <= MS_24H;
}

export function formatArchiveCountdownLabel(info: ArchiveCountdownInfo): string {
  if (info.remainingMs <= 0) {
    return info.kind === 'initial_message'
      ? 'Archive pending — send a first message'
      : 'Archive pending — send a follow-up';
  }
  const totalMinutes = Math.ceil(info.remainingMs / 60_000);
  if (totalMinutes < 60) {
    return `${totalMinutes}m left to ${info.kind === 'initial_message' ? 'send first message' : 'follow up'}`;
  }
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  if (hours < 24) {
    return mins > 0
      ? `${hours}h ${mins}m left`
      : `${hours}h left`;
  }
  const days = Math.floor(hours / 24);
  const remH = hours % 24;
  return remH > 0 ? `${days}d ${remH}h left` : `${days}d left`;
}
