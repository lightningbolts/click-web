import { notFound, redirect } from "next/navigation";
import { Lock } from "lucide-react";
import { Button } from "@/components/ds/Button";
import { EmptyState } from "@/components/ds/EmptyState";
import { ManageHeader } from "@/components/events/manage/ManageHeader";
import { EVENT_BEACON_UUID_RE } from "@/lib/events/eventMetadata";
import { eventManagePath, eventSharePath } from "@/lib/events/eventUrls";
import { loadEventManageContext } from "@/lib/server/events/loadEventManage";
import { loginHref } from "@/lib/shell/appNav";

export const dynamic = "force-dynamic";

/** Manage shell (spec §7.6.4): authorizes once, then header + URL tabs over every tab page. */
export default async function EventManageLayout({
  params,
  children,
}: {
  params: Promise<{ beaconId: string }>;
  children: React.ReactNode;
}) {
  const { beaconId } = await params;
  if (!EVENT_BEACON_UUID_RE.test(beaconId)) notFound();

  const ctx = await loadEventManageContext(beaconId);
  if (ctx.kind === "signed-out") redirect(loginHref(eventManagePath(beaconId)));
  if (ctx.kind === "missing") notFound();
  if (ctx.kind === "forbidden") {
    return (
      <div className="container-content py-16">
        <EmptyState
          icon={Lock}
          title="Only hosts can manage this event"
          body="Ask the host or a manager of its Place for access."
          action={
            <Button variant="secondary" href={eventSharePath(beaconId)}>
              View event
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="container-page pb-16 pt-6 md:pt-8">
      <ManageHeader event={ctx.event} place={ctx.place} access={ctx.access} />
      <div className="pt-6 md:pt-8">{children}</div>
    </div>
  );
}
