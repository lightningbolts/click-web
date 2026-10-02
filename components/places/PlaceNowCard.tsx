import { FcCard, FcChip } from "@/components/fc";
import { confidenceChip, hereNowLine, patternLine, pulseLine } from "@/lib/places/labels";
import type { PlaceDetail } from "@/lib/places/types";

const ENERGY_NAMES = ["Chill", "Steady", "Lively", "Packed"] as const;

/**
 * The Place "Now" section (§4.11 copy): live / stale / no Pulse, the usual pattern and how many
 * people are here. No thresholds: a single report is shown with its count and age.
 */
export default function PlaceNowCard({ place, nowMs }: { place: PlaceDetail; nowMs: number }) {
  const { pulse } = place;
  const chip = pulse.state === "live" ? confidenceChip(pulse.confidence) : null;
  const hereNow = hereNowLine(place.here_now_count);
  const total = pulse.distribution.reduce((a, b) => a + b, 0);

  return (
    <FcCard className="space-y-3 p-6" data-testid="place-now">
      <h2 className="text-lg font-bold text-on-surface">Now</h2>
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-base font-semibold text-on-surface">{pulseLine(pulse, nowMs)}</p>
        {chip ? <FcChip>{chip}</FcChip> : null}
      </div>
      {pulse.state === "live" && total > 0 ? (
        <ul className="grid grid-cols-4 gap-2" aria-label={`Energy reports, ${total} total`}>
          {pulse.distribution.map((count, i) => (
            <li key={ENERGY_NAMES[i]} className="text-center">
              <div className="flex h-16 w-full items-end overflow-hidden rounded-md border-2 border-border-hard" aria-hidden>
                <div className="w-full bg-primary" style={{ height: `${Math.round((count / total) * 100)}%` }} />
              </div>
              <p className="mt-1 text-xs font-semibold text-on-surface-variant">
                {ENERGY_NAMES[i]} {count}
              </p>
            </li>
          ))}
        </ul>
      ) : null}
      {place.pattern ? <p className="text-sm text-on-surface-variant">{patternLine(place.pattern)}</p> : null}
      {hereNow ? <p className="text-sm font-semibold text-on-surface">{hereNow}</p> : null}
    </FcCard>
  );
}
