import type { Metadata } from "next";
import { Suspense } from "react";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { unstable_cache } from "next/cache";
import { Building2, Navigation } from "lucide-react";
import { Button } from "@/components/ds/Button";
import { CardVisual } from "@/components/ds/CardVisual";
import { EventRow } from "@/components/ds/EventRow";
import { InlineNotice } from "@/components/ds/InlineNotice";
import { ListGroup, ListRow } from "@/components/ds/ListGroup";
import { SectionHeader } from "@/components/ds/SectionHeader";
import { StatusPill } from "@/components/ds/StatusPill";
import { TextLink } from "@/components/ds/TextLink";
import { Timeline, TimelineDay } from "@/components/ds/Timeline";
import { EventLocationSection } from "@/components/events/EventLocationSection";
import { ManagePlaceButton } from "@/components/places/ManagePlaceButton";
import PlaceNowCard from "@/components/places/PlaceNowCard";
import { brandShareImage } from "@/lib/brand/shareImage";
import { groupByDay } from "@/lib/events/directory";
import { publicOrigin } from "@/lib/events/eventUrls";
import { categoryLabel } from "@/lib/places/categories";
import { weekHoursRows } from "@/lib/places/hours";
import { isValidSlug } from "@/lib/places/slug";
import { createAdminSupabaseClient } from "@/lib/server/admin/supabaseAdmin";
import { loadPublicPlace, placesPublicPagesEnabled } from "@/lib/server/places/publicPlace";
import { eventHref } from "@/lib/shell/appNav";
import { TIME_ZONE_COOKIE, validTimeZone } from "@/lib/time/viewerTimeZone";

export const dynamic = "force-dynamic";

/** QR anchor tokens are uuids; anything else is ignored rather than echoed. */
const TOKEN_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Shared, tagged cache of the anonymous Place payload (spec §11.3 `place:{slug}`). */
const loadPlace = (slug: string) =>
  unstable_cache(
    async () => loadPublicPlace(createAdminSupabaseClient(), slug),
    ["public-place-v1", slug],
    { revalidate: 60, tags: ["places", `place:${slug}`] },
  )();

function placeUrl(slug: string): string {
  return `${publicOrigin()}/p/${slug}`;
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const place = placesPublicPagesEnabled() && isValidSlug(slug) ? await loadPlace(slug) : null;
  if (!place) return { title: "Place · Click" };
  const category = categoryLabel(place.category);
  const title = `${place.name} · Click`;
  const description = place.city
    ? `${category} in ${place.city}. See what's on and how it feels right now.`
    : `${category}. See what's on and how it feels right now.`;
  const image = place.photo_url ? { url: place.photo_url } : brandShareImage();
  return {
    title,
    description,
    alternates: { canonical: placeUrl(place.slug) },
    openGraph: { title: place.name, description, url: placeUrl(place.slug), type: "website", images: [image] },
    twitter: { card: place.photo_url ? "summary_large_image" : "summary", images: [image.url] },
  };
}

/** Public Place page (spec §7.12). */
export default async function PlacePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ t?: string | string[] }>;
}) {
  if (!placesPublicPagesEnabled()) notFound();
  const { slug } = await params;
  if (!isValidSlug(slug)) notFound();
  const [place, sp, jar] = await Promise.all([loadPlace(slug), searchParams, cookies()]);
  if (!place) notFound();

  const token = typeof sp.t === "string" && TOKEN_RE.test(sp.t) ? sp.t : null;
  // eslint-disable-next-line react-hooks/purity -- server component, rendered per request
  const nowMs = Date.now();
  const viewerZone = validTimeZone(jar.get(TIME_ZONE_COOKIE)?.value) ?? place.timezone;
  const subtitle = [categoryLabel(place.category), place.city].filter(Boolean).join(" · ");
  const address = [place.address_line, place.city].filter(Boolean).join(", ");
  const openInClick = `click://p/${place.slug}${token ? `?t=${encodeURIComponent(token)}` : ""}`;
  const days = groupByDay(place.upcoming_events, (e) => e.starts_at, { timeZone: viewerZone, nowMs });
  const time = new Intl.DateTimeFormat("en-US", { timeZone: viewerZone, hour: "numeric", minute: "2-digit" });
  const hours = place.hours ? weekHoursRows(place.hours, place.timezone, nowMs) : null;

  return (
    <article className="container-content pb-16 pt-4 md:pt-8" data-testid="place-page">
      {token ? (
        <div className="mb-4" data-testid="place-qr-banner">
          <InlineNotice variant="info">You scanned {place.name}’s check-in code. Open in Click to check in.</InlineNotice>
        </div>
      ) : null}

      <div className="relative mb-10">
        <CardVisual
          seed={place.id}
          ratio="16:5"
          radius="xl"
          photoUrl={place.photo_url}
          priority
          sizes="(max-width: 808px) 100vw, 760px"
          className="min-h-36"
        />
        <CardVisual
          seed={place.id}
          glyph={<Building2 />}
          radius="lg"
          className="absolute -bottom-6 left-4 size-[72px] ring-4 ring-bg md:left-6"
        />
      </div>

      <header>
        <h1 className="type-title-1 text-balance text-fg">{place.name}</h1>
        {subtitle ? <p className="type-body mt-1 text-fg-secondary">{subtitle}</p> : null}
        {place.open_now != null || place.today_hours_label ? (
          <p className="type-meta mt-3 flex flex-wrap items-center gap-2 text-fg-secondary">
            {place.open_now != null ? (
              <StatusPill variant={place.open_now ? "tinted" : "neutral"}>{place.open_now ? "Open" : "Closed"}</StatusPill>
            ) : null}
            {place.today_hours_label ? <span>Today {place.today_hours_label}</span> : null}
          </p>
        ) : null}
        <div className="mt-5 flex flex-wrap gap-2">
          <Button href={openInClick} variant="primary">
            Open in Click
          </Button>
          <Button href={place.directions.apple_maps_url} variant="secondary" icon={Navigation} target="_blank" rel="noopener noreferrer">
            Directions
          </Button>
          <Suspense fallback={null}>
            <ManagePlaceButton placeId={place.id} />
          </Suspense>
        </div>
      </header>

      <div className="mt-10 flex flex-col gap-10">
        <PlaceNowCard place={place} nowMs={nowMs} />

        {days.length > 0 ? (
          <section aria-labelledby="place-events">
            <SectionHeader id="place-events" title="Upcoming events" className="mb-3" />
            <Timeline>
              {days.map((day) => (
                <TimelineDay key={day.key} id={`place-day-${day.key}`} title={day.title} subtitle={day.subtitle}>
                  <ul className="flex flex-col gap-2">
                    {day.events.map((e) => (
                      <li key={e.beacon_id}>
                        <EventRow
                          href={eventHref(e.beacon_id)}
                          id={e.beacon_id}
                          title={e.title}
                          timeLabel={day.key === "tba" || !e.starts_at ? "Time to be announced" : time.format(Date.parse(e.starts_at))}
                          live={e.is_live}
                          host={{ seed: place.id, name: place.name }}
                        />
                      </li>
                    ))}
                  </ul>
                </TimelineDay>
              ))}
            </Timeline>
          </section>
        ) : null}

        {place.description || place.website_url ? (
          <section aria-labelledby="place-about">
            <SectionHeader id="place-about" title="About" />
            {place.description ? (
              <p className="type-reading mt-3 max-w-[68ch] whitespace-pre-line text-fg">{place.description}</p>
            ) : null}
            {place.website_url ? (
              <p className="type-body mt-3">
                <TextLink href={place.website_url} external>
                  Website
                </TextLink>
              </p>
            ) : null}
          </section>
        ) : null}

        {hours ? (
          <section aria-labelledby="place-hours">
            <SectionHeader id="place-hours" title="Hours" className="mb-3" />
            <ListGroup aria-label="Opening hours">
              {hours.map((d) => (
                <ListRow
                  key={d.day}
                  title={d.today ? <strong>{d.name}</strong> : d.name}
                  trailing={<span className={d.today ? "font-semibold text-fg" : undefined}>{d.label}</span>}
                />
              ))}
            </ListGroup>
          </section>
        ) : null}

        <EventLocationSection
          beaconId={place.id}
          label={address || place.name}
          lat={place.latitude}
          lng={place.longitude}
          mapsUrl={place.directions.google_maps_url}
        />

        <p className="type-meta text-fg-tertiary">
          Check-ins and Pulse happen in the Click app, only while you’re here.
        </p>
      </div>
    </article>
  );
}
