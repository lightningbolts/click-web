import { isActiveChatListStatus, normalizeConnectionStatus } from '@/lib/dashboard/connectionStatus';

export type WidgetVibePayload = {
  status_text: string;
  density_hex_color: string;
  active_counts: number;
};

type ConnectionCountRow = Record<string, unknown>;

function densityColorForCount(n: number): string {
  if (n <= 0) return '#94a3b8';
  if (n <= 3) return '#22c55e';
  if (n <= 8) return '#eab308';
  if (n <= 15) return '#f97316';
  return '#a855f7';
}

function statusTextForCount(n: number): string {
  if (n <= 0) return 'Quiet — open Click when you are ready to vibe.';
  if (n === 1) return 'One active thread — your circle is humming.';
  return `${n} active connections — energy is building on Click.`;
}

export function countActiveConnections(rows: ConnectionCountRow[] | null | undefined): number {
  if (!rows?.length) return 0;
  let n = 0;
  for (const row of rows) {
    const st = normalizeConnectionStatus(row);
    if (isActiveChatListStatus(st)) n += 1;
  }
  return n;
}

export function buildWidgetVibePayload(rows: ConnectionCountRow[] | null | undefined): WidgetVibePayload {
  const active_counts = countActiveConnections(rows);
  return {
    status_text: statusTextForCount(active_counts),
    density_hex_color: densityColorForCount(active_counts),
    active_counts,
  };
}
