import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { ClickPassView } from "@/components/events/ClickPassView";
import { findActivePairwiseConnectionId } from "@/lib/chat/groupCliqueKey";
import { calendarEventFor } from "@/lib/events/calendarLinks";
import { EVENT_BEACON_UUID_RE, eventDisplayTitle, eventWhereLabel, parseIsoMs } from "@/lib/events/eventMetadata";
import type { ClickPassState } from "@/lib/events/eventPassClient";
import { eventPassPath } from "@/lib/events/eventUrls";
import { eventWhenLines } from "@/lib/events/eventWhen";
import { eventMapsDestination } from "@/lib/events/mapsLinks";
import { createAdminSupabaseClient } from "@/lib/server/admin/supabaseAdmin";
import { activeCheckIn, eventPassKey, hasRsvpPass, issueEventPass, loadPassHolder, walletConfig } from "@/lib/server/eventPass";
import { loadPublicEvent } from "@/lib/server/events/loadPublicEvent";
import { listOwnedTickets } from "@/lib/server/ticketing/ownedTickets";
import { getServerUser } from "@/lib/server/getServerUser";
import { loginHref } from "@/lib/shell/appNav";
import { TIME_ZONE_COOKIE, validTimeZone } from "@/lib/time/viewerTimeZone";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Click Pass · Click", robots: { index: false } };

/** Without an end time an event counts as on for six hours (`eventIsPast`). */
const OPEN_ENDED_MS = 6 * 3_600_000;

/**
 * The attendee's Click Pass (spec 06 §1). Issued with the page (the same HMAC the API signs),
 * so the QR is there on first paint; the client takes over to watch for the host's scan.
 */
export default async function EventPassPage({
  params,
  searchParams,
}: {
  params: Promise<{ beaconId: string }>;
  searchParams: Promise<{ ticket?: string | string[] }>;
}) {
  const [{ beaconId }, query] = await Promise.all([params, searchParams]);
  if (!EVENT_BEACON_UUID_RE.test(beaconId)) notFound();
  const ticketId = typeof query.ticket === "string" && EVENT_BEACON_UUID_RE.test(query.ticket) ? query.ticket : null;
  const user = await getServerUser();
  if (!user) redirect(loginHref(`${eventPassPath(beaconId)}${ticketId ? `?ticket=${ticketId}` : ""}`));

  const [event, jar] = await Promise.all([loadPublicEvent(beaconId).catch(() => null), cookies()]);
  if (!event) notFound();

  const admin = createAdminSupabaseClient();
  const key = eventPassKey();
  const hostId = event.creator_id && event.creator_id !== user.id ? event.creator_id : null;
  const [initial, holder, connectionId] = await Promise.all([
    (async (): Promise<ClickPassState | null> => {
      // A ticket replaces the RSVP on ticketed events (spec §5.4); an RSVP from before tickets
      // went on sale keeps its pass.
      if (event.ticketing) {
        const tickets = await listOwnedTickets(admin, user.id, { beaconId });
        if (tickets.length) return { kind: "tickets", tickets };
      }
      if (!key) return { kind: "unavailable" };
      if (!(await hasRsvpPass(admin, beaconId, user.id))) return { kind: "not_going" };
      const pass = issueEventPass(key, beaconId, user.id);
      return {
        kind: "ready",
        pass: {
          credential_url: pass.url,
          code: pass.code,
          checked_in_at: await activeCheckIn(admin, beaconId, user.id),
          wallet_available: walletConfig() != null,
        },
      };
    })().catch(() => null),
    loadPassHolder(admin, user.id).catch(() => ({ userId: user.id, name: "You", avatarUrl: null })),
    hostId ? findActivePairwiseConnectionId(admin, user.id, hostId) : Promise.resolve(null),
  ]);

  const timeZone = validTimeZone(jar.get(TIME_ZONE_COOKIE)?.value) ?? event.timezone ?? "UTC";
  const title = eventDisplayTitle(event.title, event.location_name, event.description);
  const when = eventWhenLines(event.event_start_at, event.event_end_at, timeZone, event.timezone);
  const where = eventWhereLabel(event.location_name);
  const startMs = parseIsoMs(event.event_start_at);
  const endMs = parseIsoMs(event.event_end_at) ?? (startMs != null ? startMs + OPEN_ENDED_MS : null);
  // eslint-disable-next-line react-hooks/purity -- server component, rendered per request
  const nowMs = Date.now();
  const firstName = event.host_name?.trim().split(/\s+/)[0] ?? null;

  return (
    <div className="container-content pb-16 pt-4 md:pt-8">
      <div className="mx-auto w-full max-w-[440px]">
        <ClickPassView
          beaconId={beaconId}
          initial={initial}
          ticket={{
            title,
            seed: event.visual_seed || beaconId,
            imageUrl: event.image_url,
            when: when ? `${when.dateLine} · ${when.timeLine}` : null,
            where: where ?? event.address,
          }}
          holder={holder}
          startMs={startMs}
          endMs={endMs}
          live={startMs != null && endMs != null && startMs <= nowMs && nowMs < endMs}
          timeZone={timeZone}
          calendar={calendarEventFor(event, title)}
          destination={eventMapsDestination(event)}
          contact={{
            place: event.place ? { name: event.place.name, slug: event.place.slug } : null,
            host: connectionId && firstName ? { firstName, connectionId } : null,
          }}
          ticketed={event.ticketing != null}
          cancelled={event.ticketing?.cancelled ?? false}
          initialTicketId={ticketId}
          walletAvailable={walletConfig() != null}
        />
      </div>
    </div>
  );
}
