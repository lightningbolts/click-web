import { Suspense, type CSSProperties } from "react";
import { ArrowUpRight, MapPin } from "lucide-react";
import { CardVisual } from "@/components/ds/CardVisual";
import { cardClassName } from "@/components/ds/Card";
import { DateTile } from "@/components/ds/DateTile";
import { IconButton } from "@/components/ds/IconButton";
import { InlineNotice } from "@/components/ds/InlineNotice";
import { MetaRow } from "@/components/ds/MetaRow";
import { SectionHeader } from "@/components/ds/SectionHeader";
import { Skeleton } from "@/components/ds/Skeleton";
import { StatusPill } from "@/components/ds/StatusPill";
import { Button } from "@/components/ds/Button";
import { EventCalendarMenu } from "@/components/events/EventCalendarMenu";
import { EventChatSheet } from "@/components/events/EventChatSheet";
import EventHostRow, { EventHostCard } from "@/components/events/EventHostRow";
import { EventLocationSection } from "@/components/events/EventLocationSection";
import EventMarkdownContent from "@/components/events/EventMarkdownContent";
import { EventGoingMetaRow, EventPeopleSection } from "@/components/events/EventPeopleSection";
import { EventRsvpCard } from "@/components/events/EventRsvpCard";
import { EventShareButton } from "@/components/events/EventShareButton";
import SeedRoomTeaser from "@/components/events/SeedRoomTeaser";
import { APP_CONFIG } from "@/lib/config";
import type { CalendarEvent } from "@/lib/events/calendarLinks";
import {
  eventDescriptionPlainText,
  eventDisplayTitle,
  eventIsPast,
  eventSubtitle,
  eventWhereLabel,
} from "@/lib/events/eventMetadata";
import { eventDeepLink, eventManagePath, eventShareUrl, publicOrigin } from "@/lib/events/eventUrls";
import { eventWhenLines } from "@/lib/events/eventWhen";
import type { PublicEventPayload } from "@/lib/events/publicEvent";
import { dayKey } from "@/lib/home/selectOpportunity";
import { loadEventViewer } from "@/lib/server/events/eventViewer";
import { generateCardVisual } from "@/lib/ui/generateCardVisual";


const THREE_HOURS = 3 * 3_600_000;

/** Host bar (spec §7.6.2): only hosts and Place managers, streamed after the cached body. */
async function HostBar({ event, title, shareUrl }: { event: PublicEventPayload; title: string; shareUrl: string }) {
  const viewer = await loadEventViewer(event.beacon_id, event.creator_id, event.venue_id);
  if (!viewer.canManage) return null;
  return (
    <InlineNotice
      variant="info"
      className="mb-5"
      action={
        <span className="flex gap-2">
          <EventShareButton url={shareUrl} title={title} />
          <Button href={eventManagePath(event.beacon_id)} variant="primary" size="sm">
            Manage
          </Button>
        </span>
      }
    >
      <span className="flex-1 font-semibold">You’re hosting this event</span>
    </InlineNotice>
  );
}

async function RsvpIsland(props: Omit<React.ComponentProps<typeof EventRsvpCard>, "initialViewer"> & { event: PublicEventPayload }) {
  const { event, ...card } = props;
  const viewer = await loadEventViewer(event.beacon_id, event.creator_id, event.venue_id);
  return <EventRsvpCard {...card} initialViewer={viewer.rsvp} />;
}

async function ChatIsland({ event, ended }: { event: PublicEventPayload; ended: boolean }) {
  const viewer = await loadEventViewer(event.beacon_id, event.creator_id, event.venue_id);
  if (!viewer.userId) return null;
  const going = viewer.rsvp.kind === "member" ? viewer.rsvp.going : null;
  return <EventChatSheet beaconId={event.beacon_id} creatorId={event.creator_id} ended={ended} initialGoing={going} />;
}

function RsvpSkeleton() {
  return (
    <div className={cardClassName({ className: "rounded-xl" })} aria-hidden>
      <Skeleton rounded="sm" className="h-4 w-24" />
      <Skeleton rounded="full" className="mt-4 h-12 w-full" />
    </div>
  );
}

/**
 * The event page (spec §7.6.2): a sticky cover column beside the article. Renders the cached
 * public payload; viewer-specific parts stream in through the Suspense islands above.
 */
export function EventPageView({ event, timeZone, nowMs }: { event: PublicEventPayload; timeZone: string; nowMs: number }) {
  const beaconId = event.beacon_id;
  const title = eventDisplayTitle(event.title, event.location_name, event.description);
  const description = eventSubtitle(title, event.description);
  const where = eventWhereLabel(event.location_name);
  const when = eventWhenLines(event.event_start_at, event.event_end_at, timeZone, event.timezone);
  const ended = eventIsPast({ event_end_at: event.event_end_at, event_start_at: event.event_start_at });
  const start = Date.parse(event.event_start_at ?? "");
  const endMs = Date.parse(event.event_end_at ?? "");
  const live =
    Number.isFinite(start) && start <= nowMs && (Number.isFinite(endMs) && endMs > start ? endMs : start + THREE_HOURS) > nowMs;
  const today = !live && Number.isFinite(start) && start > nowMs && dayKey(start, timeZone) === dayKey(nowMs, timeZone);
  const hasPin = event.latitude != null && event.longitude != null;
  const mapsUrl = hasPin
    ? `https://maps.google.com/?q=${event.latitude},${event.longitude}`
    : where
      ? `https://maps.google.com/?q=${encodeURIComponent(where)}`
      : null;
  const shareUrl = eventShareUrl(beaconId, publicOrigin());
  const reportHref = `mailto:mepsht@uw.edu?subject=${encodeURIComponent(`Report event ${beaconId}`)}&body=${encodeURIComponent(`Event ID: ${beaconId}\nURL: ${shareUrl}\n\nDescribe the issue:\n`)}`;
  const seed = event.visual_seed || beaconId;
  const tint = generateCardVisual(seed).gradient[0];
  const calendar: CalendarEvent = {
    id: beaconId,
    title,
    startAt: event.event_start_at,
    endAt: event.event_end_at,
    location: where,
    description: eventDescriptionPlainText(event.description),
    url: shareUrl,
  };

  const placeCard = event.place ? (
    <a href={`/p/${event.place.slug}`} className={cardClassName({ compact: true, interactive: true, className: "flex items-center gap-3" })}>
      <CardVisual seed={event.place.id} className="size-10 shrink-0" radius="sm" />
      <span className="min-w-0">
        <span className="type-meta block font-semibold text-fg-secondary">Hosted at</span>
        <span className="type-body-strong block truncate text-fg">{event.place.name}</span>
        <span className="type-meta block capitalize text-fg-tertiary">{event.place.category.replace(/_/g, " ")}</span>
      </span>
    </a>
  ) : null;
  const categories = event.categories.length ? (
    <ul className="flex flex-wrap gap-1.5" aria-label="Categories">
      {event.categories.map((c) => (
        <li key={c}>
          <a
            href={`/events?q=${encodeURIComponent(c)}`}
            className="type-meta inline-flex h-[30px] items-center rounded-pill bg-fill-subtle px-3 font-semibold text-fg-secondary hover:bg-hover"
          >
            {c}
          </a>
        </li>
      ))}
    </ul>
  ) : null;

  return (
    <div className="relative isolate">
      <div aria-hidden className="event-tint pointer-events-none absolute inset-x-0 top-0 -z-10 h-[640px]" style={{ "--tint": tint } as CSSProperties} />
      <div className="container-page grid gap-6 pb-24 pt-6 min-[900px]:grid-cols-[340px_minmax(0,1fr)] min-[900px]:gap-10 min-[900px]:pt-8">
        <aside className="space-y-4 self-start min-[900px]:sticky min-[900px]:top-20">
          <CardVisual
            seed={seed}
            photoUrl={event.image_url}
            radius="xl"
            priority
            sizes="(max-width: 900px) 100vw, 340px"
            className="aspect-video w-full min-[900px]:aspect-square"
          />
          <div className="hidden space-y-4 min-[900px]:block">
            <EventHostCard creatorId={event.creator_id} name={event.host_name} avatarUrl={event.host_avatar_url} reportHref={reportHref} />
            {placeCard}
            {categories}
          </div>
        </aside>

        <article className="min-w-0">
          <Suspense fallback={null}>
            <HostBar event={event} title={title} shareUrl={shareUrl} />
          </Suspense>

          {live || today || event.listing.event_visibility !== "public" ? (
            <div className="mb-3 flex flex-wrap gap-1.5">
              {live ? <StatusPill variant="live">Live now</StatusPill> : null}
              {today ? <StatusPill variant="neutral">Today</StatusPill> : null}
              {event.listing.event_visibility === "unlisted" ? <StatusPill variant="neutral">Unlisted</StatusPill> : null}
              {event.listing.event_visibility === "invite_only" ? <StatusPill variant="neutral">Invite only</StatusPill> : null}
            </div>
          ) : null}
          <h1 className="type-title-2 text-fg [text-wrap:balance] min-[900px]:text-[36px] min-[900px]:leading-[42px]">{title}</h1>
          <div className="mt-3 min-[900px]:hidden">
            <EventHostRow creatorId={event.creator_id} name={event.host_name} avatarUrl={event.host_avatar_url} />
          </div>

          <div className="mt-6 space-y-4">
            {when ? (
              <MetaRow
                leading={<DateTile month={when.month} day={when.day} />}
                title={when.dateLine}
                subtitle={
                  when.eventLocal ? (
                    <>
                      {when.timeLine}
                      <span className="block truncate">{when.eventLocal}</span>
                    </>
                  ) : (
                    when.timeLine
                  )
                }
                trailing={ended ? null : <EventCalendarMenu event={calendar} />}
              />
            ) : (
              <MetaRow leading={<DateTile month="TBD" day="–" />} title="Date to be announced" />
            )}
            {where ? (
              <MetaRow
                icon={MapPin}
                title={where}
                trailing={
                  mapsUrl ? (
                    <IconButton icon={ArrowUpRight} size="sm" href={mapsUrl} target="_blank" rel="noopener noreferrer" aria-label="Open in Maps" />
                  ) : null
                }
              />
            ) : null}
            <EventGoingMetaRow beaconId={beaconId} count={event.rsvp_count} ended={ended} />
          </div>

          <div className="mt-6">
            <Suspense fallback={<RsvpSkeleton />}>
              <RsvpIsland
                event={event}
                beaconId={beaconId}
                title={title}
                listing={event.listing}
                rsvpEnabled={event.rsvp_enabled}
                ended={ended}
                count={event.rsvp_count}
                people={event.attendees}
                calendar={calendar}
                shareUrl={shareUrl}
              />
            </Suspense>
          </div>

          <div className="mt-4">
            <SeedRoomTeaser beaconId={beaconId} />
          </div>

          <div className="mt-10 space-y-10">
            {description ? (
              <section aria-labelledby="event-about">
                <SectionHeader id="event-about" title="About" />
                <EventMarkdownContent className="mt-3">{description}</EventMarkdownContent>
              </section>
            ) : null}

            {where ? (
              <EventLocationSection beaconId={beaconId} label={where} lat={event.latitude} lng={event.longitude} mapsUrl={mapsUrl} />
            ) : null}

            <EventPeopleSection beaconId={beaconId} ended={ended} />

            {ended ? (
              <section aria-labelledby="event-recap">
                <SectionHeader id="event-recap" title="Drops & recap" />
                <p className="type-body mt-2 text-fg-secondary">Everyone’s drops develop together the morning after.</p>
                <Button variant="primary" href={`/e/${beaconId}/recap`} className="mt-4">
                  Open the recap
                </Button>
              </section>
            ) : null}

            <Suspense fallback={null}>
              <ChatIsland event={event} ended={ended} />
            </Suspense>

            <div className="space-y-4 min-[900px]:hidden">
              {placeCard}
              {categories}
              <EventHostCard creatorId={event.creator_id} name={null} avatarUrl={null} reportHref={reportHref} />
            </div>

            {APP_CONFIG.app_launched ? (
              <p className="type-meta text-fg-tertiary">
                <a href={eventDeepLink(beaconId)} className="font-semibold text-accent hover:underline">
                  Open in the Click app
                </a>
              </p>
            ) : null}
          </div>
        </article>
      </div>
    </div>
  );
}
