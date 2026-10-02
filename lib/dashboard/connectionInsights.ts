import type { ConnectionRecord } from '@/components/dashboard/ConnectionTable';
import { isActiveChatListStatus } from './connectionStatus';

const DAY = 86_400_000;

/** Mirrors mobile ReconnectModels.kt (main c0bd263): inclusive 7/14/30 day thresholds. */
export function connectionActivity(days: number): 'active' | 'cooling' | 'dormant' | 'inactive' {
  if (days <= 7) return 'active';
  if (days <= 14) return 'cooling';
  if (days <= 30) return 'dormant';
  return 'inactive';
}

export function buildConnectionInsights(records: ConnectionRecord[], now: number) {
  const connections = records.filter((c) => isActiveChatListStatus(c.status) && c.chatKind !== 'group_clique');
  const activity = connections.map((connection) => {
    const created = connection.connectionCreatedMs ?? connection.dateMet.getTime();
    const timestamps = [connection.chatLastMessageAt, connection.lastMessageAt, created]
      .filter((n): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0);
    const lastContact = timestamps.length ? Math.max(...timestamps) : now;
    const days = Math.max(0, Math.floor((now - lastContact) / DAY));
    return { connection, days, status: connectionActivity(days), created };
  });
  const kept = connections.filter((c) => c.status === 'kept').length;
  return {
    total: connections.length,
    kept,
    keepRate: connections.length ? Math.round(kept / connections.length * 100) : 0,
    active: activity.filter((a) => a.status === 'active').length,
    dormant: activity.filter((a) => a.status === 'dormant' || a.status === 'inactive').length,
    thisWeek: activity.filter((a) => a.created >= now - 7 * DAY && a.created <= now).length,
    reminders: activity.filter((a) => a.status !== 'active').sort((a, b) => b.days - a.days).slice(0, 10),
  };
}
