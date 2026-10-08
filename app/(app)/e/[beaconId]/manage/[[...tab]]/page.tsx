import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { Lock } from "lucide-react";
import { EmptyState } from "@/components/ds/EmptyState";
import EventForm from "@/components/events/EventForm";
import { ManageGuests } from "@/components/events/manage/ManageGuests";
import { ManageInsights } from "@/components/events/manage/ManageInsights";
import { ManageOverview } from "@/components/events/manage/ManageOverview";
import { ManageRecap, recapStage } from "@/components/events/manage/ManageRecap";
import { loadEventEditDraft } from "@/lib/events/eventEditDraft";
import { loadGuestRsvps, loadManageAttendees, loadManageCounts, loadRsvpRequests } from "@/lib/events/eventManageData";
import { eventDisplayTitle, eventIsPast, parseIsoMs } from "@/lib/events/eventMetadata";
import { loadRecapSummary } from "@/lib/events/eventRecap";
import { loadLatestGuestListStatus } from "@/lib/events/guestListService";
import { createAdminSupabaseClient } from "@/lib/server/admin/supabaseAdmin";
import { loadDropEvent, eventDropsConfigFrom } from "@/lib/server/eventDrops";
import { loadEventManageContext } from "@/lib/server/events/loadEventManage";
import { resolveFeature } from "@/lib/server/featureFlags";
import { ticketingEnabled } from "@/lib/server/ticketing/enabled";
import { TIME_ZONE_COOKIE, validTimeZone } from "@/lib/time/viewerTimeZone";

export const dynamic = "force-dynamic";

const TABS = ["guests", "edit", "insights", "recap"] as const;
type Tab = "overview" | (typeof TABS)[number];
const TAB_TITLE: Record<Tab, string> = {
  overview: "Manage",
  guests: "Guests",
  edit: "Edit",
  insights: "Insights",
  recap: "Recap & summary",
};

type Params = Promise<{ beaconId: string; tab?: string[] }>;

function parseTab(segments: string[] | undefined): Tab | null {
  if (!segments || segments.length === 0) return "overview";
  if (segments.length > 1) return null;
  return (TABS as readonly string[]).includes(segments[0]) ? (segments[0] as Tab) : null;
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { beaconId, tab } = await params;
  const ctx = await loadEventManageContext(beaconId);
  const name = ctx.kind === "ok" ? eventDisplayTitle(ctx.event.title, ctx.event.location_name, ctx.event.description) : "Event";
  return { title: `${TAB_TITLE[parseTab(tab) ?? "overview"]} · ${name} · Click`, robots: { index: false } };
}

/** One manage tab (spec §7.6.4). The layout has already authorized the viewer. */
export default async function EventManageTabPage({ params }: { params: Params }) {
  const { beaconId, tab: segments } = await params;
  const tab = parseTab(segments);
  if (tab == null) notFound();
  const ctx = await loadEventManageContext(beaconId);
  if (ctx.kind !== "ok") notFound();

  const admin = createAdminSupabaseClient();
  const { event, access } = ctx;
  // eslint-disable-next-line react-hooks/purity -- server component, rendered per request
  const nowMs = Date.now();
  const ended = eventIsPast({ event_end_at: event.event_end_at, event_start_at: event.event_start_at }, nowMs);

  switch (tab) {
    case "overview": {
      const counts = await loadManageCounts(admin, beaconId);
      return <ManageOverview event={event} counts={counts} access={access} ended={ended} summaryPublished={ctx.summary.published} />;
    }
    case "guests": {
      const [requests, attendees, guests, guestList] = await Promise.all([
        loadRsvpRequests(admin, beaconId),
        loadManageAttendees(admin, beaconId),
        loadGuestRsvps(admin, beaconId, { showContact: access === "manage" }),
        access === "manage" ? loadLatestGuestListStatus(admin, beaconId) : Promise.resolve(null),
      ]);
      return (
        <ManageGuests
          beaconId={beaconId}
          access={access}
          requests={requests}
          attendees={attendees}
          guests={guests}
          guestList={guestList}
          timeZone={event.timezone}
        />
      );
    }
    case "edit": {
      if (access !== "manage") {
        return (
          <EmptyState
            icon={Lock}
            title="View only"
            body="Only the host or a manager of this Place can edit the event."
            className="rounded-lg bg-surface dark:shadow-[inset_0_0_0_1px_var(--hairline)]"
          />
        );
      }
      const [draft, jar] = await Promise.all([loadEventEditDraft(admin, beaconId), cookies()]);
      if (draft == null) notFound();
      return (
        <EventForm
          beaconId={beaconId}
          initial={draft}
          defaultTimeZone={validTimeZone(jar.get(TIME_ZONE_COOKIE)?.value)}
          nowMs={nowMs}
          ticketing={
            ticketingEnabled()
              ? {
                  status: event.ticketing?.status ?? null,
                  cancelled: event.ticketing?.cancelled ?? false,
                }
              : null
          }
        />
      );
    }
    case "insights": {
      const [counts, summary] = await Promise.all([loadManageCounts(admin, beaconId), loadRecapSummary(admin, beaconId)]);
      const startMs = parseIsoMs(event.event_start_at);
      return <ManageInsights counts={counts} summary={summary} started={startMs != null && startMs <= nowMs} />;
    }
    case "recap": {
      const drops = await resolveFeature(admin, "event_drops", ctx.userId);
      let recap = null;
      if (drops.enabled) {
        const [dropEvent, { count }] = await Promise.all([
          loadDropEvent(admin, beaconId, eventDropsConfigFrom(drops.config)),
          admin.from("event_drops").select("id", { count: "exact", head: true }).eq("beacon_id", beaconId).is("deleted_at", null),
        ]);
        const reveal = dropEvent?.schedule.revealAtMs;
        recap = {
          stage: recapStage(nowMs, dropEvent?.schedule ?? null),
          drops: count ?? 0,
          revealLabel:
            reveal != null
              ? new Intl.DateTimeFormat("en-US", {
                  weekday: "short",
                  hour: "numeric",
                  minute: "2-digit",
                  ...(event.timezone ? { timeZone: event.timezone } : {}),
                }).format(new Date(reveal))
              : null,
        };
      }
      return <ManageRecap beaconId={beaconId} access={access} recap={recap} summary={ctx.summary} />;
    }
  }
}
