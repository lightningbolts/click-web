import { BarChart3 } from "lucide-react";
import { cardClassName } from "@/components/ds/Card";
import { EmptyState } from "@/components/ds/EmptyState";
import { StatTile } from "@/components/ds/StatTile";
import type { ManageCounts } from "@/lib/events/eventManageData";
import type { RecapSummary } from "@/lib/events/eventRecap";

const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0);

/** A labelled horizontal bar; the share is in text too, never color alone. */
function Bar({ label, value, of, tone = "accent" }: { label: string; value: number; of: number; tone?: "accent" | "muted" }) {
  const share = pct(value, of);
  return (
    <div>
      <div className="type-meta flex items-baseline justify-between gap-3">
        <span className="text-fg-secondary">{label}</span>
        <span className="tabular text-fg">
          {value} <span className="text-fg-tertiary">· {share}%</span>
        </span>
      </div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-pill bg-fill-subtle" aria-hidden>
        <div className={tone === "accent" ? "h-full rounded-pill bg-accent" : "h-full rounded-pill bg-fg-tertiary"} style={{ width: `${share}%` }} />
      </div>
    </div>
  );
}

function Chart({ title, n, nLabel, children }: { title: string; n: number; nLabel: string; children: React.ReactNode }) {
  return (
    <section className={cardClassName({ className: "flex flex-col gap-4" })} aria-label={title}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="type-headline text-fg">{title}</h2>
        <span className="type-meta tabular text-fg-tertiary">
          n = {n} {nLabel}
        </span>
      </div>
      {children}
    </section>
  );
}

/** Network health and engagement (spec §7.6.4): aggregate counts only, each chart states n. */
export function ManageInsights({ counts, summary, started }: { counts: ManageCounts; summary: RecapSummary; started: boolean }) {
  if (!started && counts.checkedIn === 0 && summary.connections_made === 0) {
    return (
      <EmptyState
        icon={BarChart3}
        title="Insights start with the event"
        body="Check-ins and connections show up here once people arrive."
        className="rounded-lg bg-surface dark:shadow-[inset_0_0_0_1px_var(--hairline)]"
      />
    );
  }

  return (
    <div className="flex flex-col gap-8" data-testid="manage-insights">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label="Connections made" value={summary.connections_made} />
        <StatTile label="New pairs" value={summary.new_pair_count} />
        <StatTile label="Reconnections" value={summary.repeat_reconnect_count} hint="Knew each other before" />
        <StatTile label="Per check-in" value={summary.density.toFixed(2)} hint="Connections ÷ check-ins" />
      </div>
      <div className="grid gap-4 min-[900px]:grid-cols-2">
        <Chart title="Turnout" n={counts.going} nLabel={counts.going === 1 ? "RSVP" : "RSVPs"}>
          <Bar label="Checked in" value={Math.min(counts.checkedIn, counts.going)} of={counts.going} />
          <Bar label="Didn’t check in" value={Math.max(0, counts.going - counts.checkedIn)} of={counts.going} tone="muted" />
          {counts.checkedIn > counts.going ? (
            <p className="type-meta text-fg-tertiary">{counts.checkedIn - counts.going} checked in without an RSVP.</p>
          ) : null}
        </Chart>
        <Chart title="Connections" n={summary.connections_made} nLabel={summary.connections_made === 1 ? "connection" : "connections"}>
          <Bar label="New pairs" value={summary.new_pair_count} of={summary.connections_made} />
          <Bar label="Reconnections" value={summary.repeat_reconnect_count} of={summary.connections_made} tone="muted" />
        </Chart>
      </div>
      <p className="type-meta text-fg-tertiary">Only totals are shown. Click never shows hosts who connected with whom.</p>
    </div>
  );
}
