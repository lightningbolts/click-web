/**
 * Handshake vs Prior Connection metric split.
 *
 * Investor / B2B / dashboard vanity totals must never mix self-reported prior
 * connections with mathematically verified physical handshakes.
 */

export const HANDSHAKE_CONNECTION_SOURCE = 'handshake' as const;
export const PRIOR_CONNECTION_SOURCE = 'prior' as const;

export type ConnectionSource = typeof HANDSHAKE_CONNECTION_SOURCE | typeof PRIOR_CONNECTION_SOURCE;

export function isHandshakeSource(source: unknown): boolean {
  if (source == null || source === '') return true;
  return source === HANDSHAKE_CONNECTION_SOURCE;
}

export function isPriorSource(source: unknown): boolean {
  return source === PRIOR_CONNECTION_SOURCE;
}

/** PostgREST filter: only verified physical handshakes (migration backfills existing rows). */
export const HANDSHAKE_SOURCE_FILTER = HANDSHAKE_CONNECTION_SOURCE;

export function formatSplitConnectionMetrics(
  handshakeCount: number,
  priorCount: number,
): string {
  return `${handshakeCount} Verified Handshakes · ${priorCount} Prior Connections`;
}

export function countBySource(rows: Array<{ source?: unknown } | null | undefined>): {
  handshakeCount: number;
  priorCount: number;
  label: string;
} {
  let handshakeCount = 0;
  let priorCount = 0;
  for (const row of rows) {
    if (!row) continue;
    if (isPriorSource(row.source)) priorCount += 1;
    else handshakeCount += 1;
  }
  return {
    handshakeCount,
    priorCount,
    label: formatSplitConnectionMetrics(handshakeCount, priorCount),
  };
}
