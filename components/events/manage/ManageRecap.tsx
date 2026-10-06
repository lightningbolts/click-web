import { ArrowUpRight, Camera, FileText } from "lucide-react";
import { Button } from "@/components/ds/Button";
import { cardClassName } from "@/components/ds/Card";
import { StatusPill } from "@/components/ds/StatusPill";
import { CopyTextButton } from "@/components/events/manage/CopyTextButton";
import { PublishSummaryButton } from "@/components/events/manage/PublishSummaryButton";
import type { EventAccess } from "@/lib/events/beaconManageAuth";
import { publicOrigin } from "@/lib/events/eventUrls";

export type RecapStage = "before" | "open" | "developing" | "live";

/** Where the drop recap is, from the drop schedule (spec §7.6.5). */
export function recapStage(
  nowMs: number,
  schedule: {
    opensAtMs: number;
    closesAtMs: number;
    revealAtMs: number;
  } | null,
): RecapStage {
  if (!schedule || nowMs < schedule.opensAtMs) return "before";
  if (nowMs < schedule.closesAtMs) return "open";
  if (nowMs < schedule.revealAtMs) return "developing";
  return "live";
}

const STAGE: Record<
  RecapStage,
  { pill: string; variant: "neutral" | "live" | "warning" | "success" }
> = {
  before: { pill: "Not started", variant: "neutral" },
  open: { pill: "Dropping", variant: "live" },
  developing: { pill: "Developing", variant: "warning" },
  live: { pill: "Ready", variant: "success" },
};

export function ManageRecap({
  beaconId,
  access,
  recap,
  summary,
}: {
  beaconId: string;
  access: EventAccess;
  /** Null when photo drops are off for this account. `revealLabel` is in the event's zone. */
  recap: {
    stage: RecapStage;
    drops: number;
    revealLabel: string | null;
  } | null;
  summary: { published: boolean; token: string | null };
}) {
  const summaryPath =
    summary.published && summary.token
      ? `/e/${beaconId}/summary?token=${summary.token}`
      : null;
  const { stage, drops, revealLabel } = recap ?? {
    stage: "before" as const,
    drops: 0,
    revealLabel: null,
  };
  const recapBody: Record<RecapStage, string> = {
    before: "Guests can drop photos from the moment the event starts.",
    open: `${drops} ${drops === 1 ? "drop" : "drops"} so far. Everyone’s drops develop together${revealLabel ? ` ${revealLabel}` : " the next morning"}.`,
    developing: `${drops} ${drops === 1 ? "drop" : "drops"} developing${revealLabel ? `, ready ${revealLabel}` : ""}.`,
    live: `${drops} ${drops === 1 ? "drop" : "drops"} in the recap.`,
  };

  return (
    <div
      className="grid gap-4 min-[900px]:grid-cols-2"
      data-testid="manage-recap"
    >
      {recap ? (
        <section
          aria-labelledby="manage-recap-heading"
          className={cardClassName({ className: "flex flex-col gap-3" })}
        >
          <div className="flex items-center justify-between gap-3">
            <h2
              id="manage-recap-heading"
              className="type-headline flex items-center gap-2 text-fg"
            >
              <Camera
                size={20}
                strokeWidth={1.75}
                aria-hidden
                className="text-fg-secondary"
              />
              Recap
            </h2>
            <StatusPill variant={STAGE[stage].variant}>
              {STAGE[stage].pill}
            </StatusPill>
          </div>
          <p className="type-body text-fg-secondary">{recapBody[stage]}</p>
          {stage === "live" && drops > 0 ? (
            <Button
              href={`/e/${beaconId}/recap`}
              size="sm"
              trailingIcon={ArrowUpRight}
              className="self-start"
            >
              Open recap
            </Button>
          ) : null}
        </section>
      ) : null}

      <section
        aria-labelledby="manage-summary-heading"
        className={cardClassName({ className: "flex flex-col gap-3" })}
      >
        <div className="flex items-center justify-between gap-3">
          <h2
            id="manage-summary-heading"
            className="type-headline flex items-center gap-2 text-fg"
          >
            <FileText
              size={20}
              strokeWidth={1.75}
              aria-hidden
              className="text-fg-secondary"
            />
            Summary
          </h2>
          <StatusPill variant={summaryPath ? "success" : "neutral"}>
            {summaryPath ? "Published" : "Not published"}
          </StatusPill>
        </div>
        <p className="type-body text-fg-secondary">
          A one-page report with turnout and connection totals. Only people with
          the link can open it, and it never names guests.
        </p>
        {summaryPath ? (
          <>
            <div className="flex min-w-0 items-center gap-2 rounded-md bg-fill-subtle py-1 pl-3 pr-1">
              <span
                className="type-meta min-w-0 flex-1 truncate text-fg"
                data-testid="manage-summary-url"
              >
                {`${publicOrigin()}${summaryPath}`}
              </span>
              <CopyTextButton
                text={`${publicOrigin()}${summaryPath}`}
                label="Copy summary link"
                toastText="Link copied"
              />
            </div>
            <Button
              href={summaryPath}
              size="sm"
              trailingIcon={ArrowUpRight}
              className="self-start"
            >
              Open summary
            </Button>
          </>
        ) : access === "manage" ? (
          <div>
            <PublishSummaryButton beaconId={beaconId} />
          </div>
        ) : (
          <p className="type-meta text-fg-tertiary">
            A host or Place manager can publish it.
          </p>
        )}
      </section>
    </div>
  );
}
