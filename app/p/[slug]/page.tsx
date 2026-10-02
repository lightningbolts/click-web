import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { unstable_cache } from "next/cache";
import { CalendarDays, Clock, Globe, MapPin } from "lucide-react";
import { FcButton, FcCard, FcChip } from "@/components/fc";
import { CardVisualHero } from "@/components/ui/CardVisualSurface";
import EventPageShell from "@/components/events/EventPageShell";
import PlaceNowCard from "@/components/places/PlaceNowCard";
import { APP_CONFIG } from "@/lib/config";
import { brandShareImage } from "@/lib/brand/shareImage";
import { publicOrigin } from "@/lib/events/eventUrls";
import { formatEventWhen } from "@/lib/events/formatEventWhen";
import { categoryLabel } from "@/lib/places/categories";
import { isValidSlug } from "@/lib/places/slug";
import { createAdminSupabaseClient } from "@/lib/server/admin/supabaseAdmin";
import { loadPublicPlace, placesPublicPagesEnabled } from "@/lib/server/places/publicPlace";

export const dynamic = "force-dynamic";

/** Render-time clock (dynamic route: evaluated per request). */
function requestTimeMs(): number {
  return Date.now();
}

/** QR anchor tokens are uuids; anything else is ignored rather than echoed. */
const TOKEN_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
  if (!place) return { title: "Click" };
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
  const place = await loadPlace(slug);
  if (!place) notFound();

  const rawToken = (await searchParams).t;
  const token = typeof rawToken === "string" && TOKEN_RE.test(rawToken) ? rawToken : null;
  const nowMs = requestTimeMs();
  const category = categoryLabel(place.category);
  const subtitle = [category, place.city].filter(Boolean).join(" · ");
  const address = [place.address_line, place.city].filter(Boolean).join(", ");

  return (
    <EventPageShell className="py-8 md:py-12">
      <article data-testid="place-page">
        {token ? (
          <FcCard className="mb-6 flex flex-col gap-3 border-primary p-5 sm:flex-row sm:items-center sm:justify-between" data-testid="place-qr-banner">
            <p className="text-sm font-semibold text-on-surface">
              You scanned {place.name}&apos;s check-in code. Open in Click to check in.
            </p>
            <a href={`click://p/${place.slug}?t=${encodeURIComponent(token)}`} className="shrink-0">
              <FcButton type="button" className="h-11 w-full sm:w-auto">
                Open in Click
              </FcButton>
            </a>
          </FcCard>
        ) : null}

        <CardVisualHero id={place.id} imageUrl={place.photo_url} chipLabel={category} className="h-56 overflow-hidden rounded-[16px] md:h-72">
          <div className="flex h-full flex-col justify-end p-6 md:p-8">
            <h1 className="font-display max-w-3xl text-3xl font-semibold leading-tight tracking-tight text-white md:text-5xl">
              {place.name}
            </h1>
            {subtitle ? <p className="mt-2 text-base font-medium text-white/90 md:text-lg">{subtitle}</p> : null}
          </div>
        </CardVisualHero>

        <div className="mt-8 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="space-y-6">
            <PlaceNowCard place={place} nowMs={nowMs} />

            {place.upcoming_events.length > 0 ? (
              <FcCard className="space-y-3 p-6">
                <h2 className="text-lg font-bold text-on-surface">Happening here</h2>
                <ul className="divide-y-2 divide-border-hard">
                  {place.upcoming_events.map((event) => (
                    <li key={event.beacon_id} className="py-3 first:pt-0 last:pb-0">
                      <a href={`/e/${event.beacon_id}`} className="flex items-start gap-3 hover:underline">
                        <CalendarDays className="mt-0.5 h-5 w-5 shrink-0 text-on-surface-variant" aria-hidden />
                        <span className="min-w-0">
                          <span className="flex flex-wrap items-center gap-2 text-sm font-semibold text-on-surface">
                            {event.title}
                            {event.is_live ? <FcChip>Live</FcChip> : null}
                          </span>
                          <span className="block text-sm text-on-surface-variant">
                            {formatEventWhen(event.starts_at, event.ends_at, place.timezone) ?? "Time TBD"}
                          </span>
                        </span>
                      </a>
                    </li>
                  ))}
                </ul>
              </FcCard>
            ) : null}

            <FcCard className="space-y-4 p-6">
              <h2 className="text-lg font-bold text-on-surface">About</h2>
              {place.description ? <p className="max-w-prose text-sm text-on-surface">{place.description}</p> : null}
              {place.today_hours_label ? (
                <p className="flex items-center gap-2 text-sm text-on-surface">
                  <Clock className="h-4 w-4 text-on-surface-variant" aria-hidden />
                  <span>Today: {place.today_hours_label}</span>
                  {place.open_now != null ? <FcChip>{place.open_now ? "Open" : "Closed"}</FcChip> : null}
                </p>
              ) : null}
              {address ? (
                <p className="flex flex-wrap items-center gap-2 text-sm text-on-surface">
                  <MapPin className="h-4 w-4 text-on-surface-variant" aria-hidden />
                  <span>{address}</span>
                  <a href={place.directions.apple_maps_url} className="font-semibold text-primary hover:underline">
                    Directions
                  </a>
                  <a href={place.directions.google_maps_url} className="font-semibold text-primary hover:underline">
                    Google Maps
                  </a>
                </p>
              ) : (
                <p className="text-sm">
                  <a href={place.directions.apple_maps_url} className="font-semibold text-primary hover:underline">
                    Directions
                  </a>
                </p>
              )}
              {place.website_url ? (
                <p className="flex items-center gap-2 text-sm">
                  <Globe className="h-4 w-4 text-on-surface-variant" aria-hidden />
                  <a href={place.website_url} rel="noopener noreferrer" target="_blank" className="font-semibold text-primary hover:underline">
                    Website
                  </a>
                </p>
              ) : null}
            </FcCard>
          </div>

          <aside className="space-y-4 lg:sticky lg:top-24">
            <FcCard className="space-y-3 p-6">
              <h2 className="text-lg font-bold text-on-surface">Check in and share the vibe with the Click app</h2>
              <p className="text-sm text-on-surface-variant">
                Check-ins and Pulse happen in the app, only when you&apos;re here.
              </p>
              <a href={`click://p/${place.slug}`} className="block">
                <FcButton type="button" className="h-11 w-full">
                  Open in Click
                </FcButton>
              </a>
              {/* Store links only once the mobile app is public; before that they resolve to `#waitlist`. */}
              {APP_CONFIG.app_launched ? (
                <a href={APP_CONFIG.ios_store_url} target="_blank" rel="noopener noreferrer" className="block">
                  <FcButton type="button" variant="secondary" className="h-11 w-full">
                    Get the app
                  </FcButton>
                </a>
              ) : null}
            </FcCard>
          </aside>
        </div>
      </article>
    </EventPageShell>
  );
}
