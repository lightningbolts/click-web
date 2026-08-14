'use client';

import type { ReactNode } from 'react';
import { generateCardVisual, type CardVisual } from '@/lib/ui/generateCardVisual';
import { cardVisualStyle } from '@/lib/ui/cardVisualPattern';

/**
 * Web counterpart of mobile `ui/components/CardVisualSurface.kt`.
 *
 * Any surface that shows a generated identity for an entity — beacon rows, event headers, chapter
 * cards, avatar fallbacks — paints through here, seeded with the **raw entity id** so an item looks
 * the same on the map popup, in a list, and in its detail panel, and the same as it does on mobile.
 */
export type CardVisualHeroProps = {
  /** Raw entity id (e.g. `beacon.id`). Never a list-key prefix, or the visual will drift. */
  id: string;
  className?: string;
  imageUrl?: string | null;
  /** Short category tag. Deliberately the only text this decorative band renders. */
  chipLabel?: string | null;
  visual?: CardVisual;
  children?: ReactNode;
};

export function CardVisualHero({
  id,
  className = '',
  imageUrl,
  chipLabel,
  visual,
  children,
}: CardVisualHeroProps) {
  const resolved = visual ?? generateCardVisual(id);
  return (
    <div
      className={`relative overflow-hidden ${className}`}
      style={cardVisualStyle(resolved)}
    >
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imageUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
      ) : null}
      <div
        className="absolute inset-0"
        style={{ background: resolved.contentScrim }}
        aria-hidden
      />
      {chipLabel ? (
        <span className="absolute left-2.5 top-2.5 z-10 rounded-[8px] bg-black/40 px-2 py-1 text-[11px] font-bold text-white">
          {chipLabel}
        </span>
      ) : null}
      {children ? <div className="relative z-10 h-full">{children}</div> : null}
    </div>
  );
}

export { cardVisualStyle };
