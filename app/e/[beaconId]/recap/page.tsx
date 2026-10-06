import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { Camera, Hourglass } from "lucide-react";
import { Avatar } from "@/components/ds/Avatar";
import { Button } from "@/components/ds/Button";
import { EmptyState } from "@/components/ds/EmptyState";
import { ListGroup, ListRow } from "@/components/ds/ListGroup";
import { EventRecapViewer } from "@/components/events/EventRecapViewer";
import type { RecapPerson } from "@/lib/events/eventRecap";
import { EVENT_BEACON_UUID_RE } from "@/lib/events/eventMetadata";
import { eventSharePath } from "@/lib/events/eventUrls";
import { getServerUser } from "@/lib/server/getServerUser";
import { loadEventRecap } from "@/lib/server/events/loadEventRecap";
import { loginHref, threadHref } from "@/lib/shell/appNav";
import { TIME_ZONE_COOKIE, validTimeZone } from "@/lib/time/viewerTimeZone";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Recap · Click", robots: { index: false } };

function PeopleList({ people }: { people: RecapPerson[] }) {
  if (people.length === 0) return null;
  return (
    <ListGroup header="People you Clicked with here" className="mt-8 text-left">
      {people.map((p) => (
        <ListRow
          key={p.user_id}
          href={threadHref(p.connection_id)}
          leading={<Avatar seed={p.user_id} name={p.name} src={p.avatar_url} size={40} />}
          title={p.name}
          strong
        />
      ))}
    </ListGroup>
  );
}

/** Event recap (spec §7.6.5): the story viewer once drops develop, otherwise a calm waiting state. */
export default async function EventRecapPage({ params }: { params: Promise<{ beaconId: string }> }) {
  const { beaconId } = await params;
  if (!EVENT_BEACON_UUID_RE.test(beaconId)) notFound();
  const user = await getServerUser();
  if (!user) redirect(loginHref(`/e/${beaconId}/recap`));

  // eslint-disable-next-line react-hooks/purity -- server component, rendered per request
  const nowMs = Date.now();
  const [view, jar] = await Promise.all([loadEventRecap(beaconId, user.id, nowMs), cookies()]);
  const timeZone = validTimeZone(jar.get(TIME_ZONE_COOKIE)?.value);
  if (view.kind === "missing") notFound();
  const back = (
    <Button variant="secondary" href={eventSharePath(beaconId)}>
      Back to event
    </Button>
  );

  if (view.kind === "ready" && (view.drops.length > 0 || view.people.length > 0)) {
    return <EventRecapViewer title={view.title} drops={view.drops} people={view.people} closeHref={eventSharePath(beaconId)} />;
  }

  return (
    <div className="container-content py-12">
      <h1 className="sr-only">{view.title} recap</h1>
      {view.kind === "developing" ? (
        <EmptyState
          icon={Hourglass}
          title="Still developing"
          body={
            view.mine > 0
              ? `Your ${view.mine === 1 ? "drop is" : `${view.mine} drops are`} in. Everyone’s drops develop together ${new Intl.DateTimeFormat("en-US", { weekday: "long", hour: "numeric", minute: "2-digit", ...(timeZone ? { timeZone } : {}) }).format(view.revealAtMs)}.`
              : "Everyone’s drops develop together tomorrow morning."
          }
          action={back}
        />
      ) : view.kind === "ready" ? (
        <EmptyState icon={Camera} title="No drops from this event" body="Nobody dropped a photo this time." action={back} />
      ) : (
        <EmptyState
          icon={Camera}
          title="Recaps are for people who were there"
          body="Check in at an event to drop photos and see everyone’s recap the next morning."
          action={back}
        />
      )}
      <PeopleList people={view.people} />
    </div>
  );
}
