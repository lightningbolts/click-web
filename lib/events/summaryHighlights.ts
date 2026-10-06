import type { RecapSummary } from "@/lib/events/eventRecap";

const pct = (part: number, whole: number) => Math.round((part / whole) * 100);

/** Plain-sentence takeaways; each only when its denominator is real (honest UI, spec §3.1). */
export function summaryHighlights(s: Pick<RecapSummary, "rsvp_count" | "check_in_count" | "connections_made" | "new_pair_count" | "density">): string[] {
  const out: string[] = [];
  if (s.rsvp_count > 0 && s.check_in_count > 0) {
    out.push(`${pct(Math.min(s.check_in_count, s.rsvp_count), s.rsvp_count)}% of people who RSVP’d checked in (n = ${s.rsvp_count}).`);
  }
  if (s.connections_made > 0) {
    out.push(
      `${s.connections_made} ${s.connections_made === 1 ? "Click was" : "Clicks were"} made here, ${s.new_pair_count} between people meeting for the first time.`,
    );
  }
  if (s.check_in_count > 0 && s.connections_made > 0) {
    out.push(`About ${s.density.toFixed(1)} new Clicks for every person who checked in.`);
  }
  return out;
}
