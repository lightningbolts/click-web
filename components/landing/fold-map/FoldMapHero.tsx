'use client';

import ClickLogo from '@/components/ClickLogo';
import FoldMapLazy from '@/components/landing/fold-map/FoldMapLazy';
import type { PresenceHeatmapCell } from '@/lib/landing/presenceHeatmap';

const DIRECTION_CONTRACT = ` THESIS: The first viewport is the city: a quiet map of real handshake density, not a logo splash and not a feed. The handshake offer sits on one plate over that place.
 OWN-WORLD: Functional Clarity: opaque plate, 1px seam, Click Violet #7C3AED, Manrope, 8px buttons and 16px card, Carto map as content not chrome.
 STORY: A first-time visitor sees they are invited into a real city of verified presence, understands this is an in-person handshake (phone), and joins the mobile-app waitlist. The web companion is already live.
 FIRST VIEWPORT: Full-bleed map under the existing navbar; violet heatmap of real handshake GPS (block-offset); zoom 9–18 to building; lower-left plate with mark, handshake line, tagline, proof sentence, Join the Waitlist, Why Click exists.
 FORM: The Fold Map; grounded structure 4 of 7; seed 5738aa14.
 FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
`;

export default function FoldMapHero({
  onJoinWaitlist,
  onPrefetchWaitlist,
  cells,
}: {
  onJoinWaitlist: () => void;
  onPrefetchWaitlist?: () => void;
  cells: readonly PresenceHeatmapCell[];
}) {
  return (
    <section
      className="relative isolate z-10 min-h-[calc(100svh-var(--navbar-height))] w-full overflow-hidden bg-[#ebeef1] dark:bg-[#15121c]"
      data-testid="landing-fold-map"
      data-heatmap-cells={cells.length}
      aria-labelledby="landing-hero-heading"
    >
      <span className="sr-only" dangerouslySetInnerHTML={{ __html: `<!--${DIRECTION_CONTRACT}-->` }} />
      <FoldMapLazy cells={cells} />
      <div className="pointer-events-none absolute inset-0 z-[2] flex items-end p-4 sm:p-6 md:p-8">
        <div className="pointer-events-auto w-full max-w-md rounded-[16px] border border-border-hard bg-surface p-6 shadow-lg sm:p-8">
          <ClickLogo variant="mark" size={56} className="h-14 w-14" priority />
          <h1
            id="landing-hero-heading"
            className="mt-5 text-4xl font-bold leading-[1.15] tracking-tight text-on-surface sm:text-5xl"
          >
            <span className="text-on-surface">Click:</span>{' '}
            <span className="text-primary">from handshake to friendship.</span>
          </h1>
          <p className="mt-3 max-w-sm text-base font-medium leading-relaxed text-on-surface-variant">
            Stop scrolling. Start living.
          </p>
          <p className="mt-3 max-w-sm text-sm font-medium leading-relaxed text-on-surface-variant">
            Your phones confirm you were in the same room. No feed. Just the people you actually
            met.
          </p>
          <div className="mt-6 flex flex-col items-start gap-4">
            <button
              type="button"
              onClick={onJoinWaitlist}
              onPointerEnter={onPrefetchWaitlist}
              onFocus={onPrefetchWaitlist}
              data-testid="waitlist-cta"
              className="fc-btn-primary h-11 px-8 py-2.5"
            >
              Join the Waitlist
            </button>
            <a
              href="#why"
              className="inline-flex min-h-11 items-center text-sm font-semibold text-on-surface-variant hover:text-primary"
            >
              Why Click exists
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
