/**
 * The shared Click Drop develop state machine (spec §2), used by chat, event and shared drops.
 *
 *   pending   → before reveal_at: pixelated, countdown visible.
 *   ready     → reveal_at passed, this viewer hasn't developed it yet. Quiet, no badge.
 *   developed → the viewer tapped (or was watching when the timer hit zero). Permanent per viewer.
 *
 * Clients mirror this in Swift (`ClickDropDevelopState`) and Kotlin; keep the three in step.
 */
export type DropKind = 'chat' | 'event' | 'shared';
export const DROP_KINDS: readonly DropKind[] = ['chat', 'event', 'shared'];

export type DropDevelopState = 'pending' | 'ready' | 'developed';

export function dropDevelopState(
  revealAtMs: number,
  developedAt: string | null | undefined,
  nowMs: number = Date.now(),
): DropDevelopState {
  if (!Number.isFinite(revealAtMs) || nowMs < revealAtMs) return 'pending';
  return developedAt ? 'developed' : 'ready';
}

/** Reveal time from chat-drop metadata (`reveal_at`, else the legacy `collaboration_ttl`). */
export function chatDropRevealAtMs(metadata: unknown): number | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null;
  const meta = metadata as Record<string, unknown>;
  if (meta.disposable_roll !== true) return null;
  const raw = meta.reveal_at ?? meta.collaboration_ttl;
  const ms = typeof raw === 'string' ? Date.parse(raw) : NaN;
  return Number.isFinite(ms) ? ms : null;
}
