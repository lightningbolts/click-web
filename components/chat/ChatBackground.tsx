import { generateCardVisual } from '@/lib/ui/generateCardVisual';
import { cn } from '@/lib/cn';

function withAlpha(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h.slice(0, 6);
  const n = Number.parseInt(full, 16);
  if (!Number.isFinite(n)) return 'transparent';
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

/**
 * A conversation's backdrop (spec §7.2, ported from iOS `ChatBackground.swift`, classic style):
 * a vertical wash, two glows in the conversation's CardVisual colors, and a dot grid. One
 * absolutely positioned layer of CSS gradients; no canvas, no animation.
 */
export function ChatBackground({ seed, className }: { seed: string; className?: string }) {
  const { gradient } = generateCardVisual(seed);
  const first = gradient[0] ?? '#7c3aed';
  const last = gradient[gradient.length - 1] ?? first;
  return (
    <div
      aria-hidden
      data-chat-background
      className={cn('chat-background pointer-events-none absolute inset-0', className)}
      style={
        {
          '--glow-a-light': withAlpha(first, 0.28),
          '--glow-b-light': withAlpha(last, 0.28),
          '--glow-a-dark': withAlpha(first, 0.22),
          '--glow-b-dark': withAlpha(last, 0.22),
        } as React.CSSProperties
      }
    />
  );
}
