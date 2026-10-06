import { cardClassName } from "@/components/ds/Card";
import { StatusPill } from "@/components/ds/StatusPill";
import { confidenceChip, hereNowLine, patternLine, pulseLine } from "@/lib/places/labels";
import type { PlaceDetail } from "@/lib/places/types";

const ENERGY_NAMES = ["Chill", "Steady", "Lively", "Packed"] as const;

/**
 * The Place "Now" section (spec §7.12): live / stale / no Pulse, energy bars with their counts,
 * the usual pattern and how many people are here. A single report shows with its count and age.
 */
export default function PlaceNowCard({ place, nowMs }: { place: PlaceDetail; nowMs: number }) {
  const { pulse } = place;
  const chip = pulse.state === "live" ? confidenceChip(pulse.confidence) : null;
  const hereNow = hereNowLine(place.here_now_count);
  const total = pulse.distribution.reduce((a, b) => a + b, 0);

  return (
    <section aria-labelledby="place-now-heading" className={cardClassName({ className: "flex flex-col gap-3" })} data-testid="place-now">
      <div className="flex items-center justify-between gap-3">
        <h2 id="place-now-heading" className="type-headline text-fg">
          Now
        </h2>
        {pulse.state === "live" ? <StatusPill variant="live">Live</StatusPill> : null}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <p className="type-body-strong text-fg">{pulseLine(pulse, nowMs)}</p>
        {chip ? <StatusPill variant="neutral">{chip}</StatusPill> : null}
      </div>
      {pulse.state === "live" && total > 0 ? (
        <ul className="grid grid-cols-4 gap-2" aria-label={`Energy reports, n = ${total}`}>
          {pulse.distribution.map((count, i) => (
            <li key={ENERGY_NAMES[i]}>
              <div className="flex h-16 items-end overflow-hidden rounded-md bg-fill-subtle" aria-hidden>
                <div className="w-full rounded-md bg-accent" style={{ height: `${Math.round((count / total) * 100)}%` }} />
              </div>
              <p className="type-meta tabular mt-1 text-center text-fg-secondary">
                {ENERGY_NAMES[i]} {count}
              </p>
            </li>
          ))}
        </ul>
      ) : null}
      {place.pattern ? <p className="type-meta text-fg-secondary">{patternLine(place.pattern)}</p> : null}
      {hereNow ? <p className="type-body-strong text-fg">{hereNow}</p> : null}
    </section>
  );
}
