import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { APP_CONFIG } from "@/lib/config";

type PublicEvent = {
  beacon_id: string;
  title: string | null;
  description: string | null;
  event_start_at: string | null;
  event_end_at: string | null;
  latitude: number | null;
  longitude: number | null;
  host_name: string | null;
};

const BASE_URL =
  process.env.NEXT_PUBLIC_BASE_URL?.replace(/\/$/, "") || "https://joinclick.co";
const IOS_APP_ID = process.env.NEXT_PUBLIC_IOS_APP_ID || "6757996346";

function isUuidLike(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    v,
  );
}

async function fetchPublicEvent(beaconId: string): Promise<PublicEvent | null> {
  const origin =
    process.env.NEXT_PUBLIC_BASE_URL?.replace(/\/$/, "") ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

  const res = await fetch(`${origin}/api/beacons/${beaconId}/public`, {
    next: { revalidate: 60 },
  });
  if (!res.ok) return null;
  return res.json() as Promise<PublicEvent>;
}

function formatSchedule(start: string | null, end: string | null): string | null {
  if (!start) return null;
  const startMs = Date.parse(start);
  if (!Number.isFinite(startMs)) return null;
  const startLabel = new Date(startMs).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  if (!end) return startLabel;
  const endMs = Date.parse(end);
  if (!Number.isFinite(endMs)) return startLabel;
  const endLabel = new Date(endMs).toLocaleString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
  return `${startLabel} – ${endLabel}`;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ beaconId: string }>;
}): Promise<Metadata> {
  const { beaconId } = await params;
  const event = isUuidLike(beaconId) ? await fetchPublicEvent(beaconId) : null;
  const title = event?.title?.trim() || "Click event";
  const universalLink = `${BASE_URL}/e/${beaconId}`;
  const description =
    event?.description?.trim() ||
    formatSchedule(event?.event_start_at ?? null, event?.event_end_at ?? null) ||
    "Open this event in Click.";

  return {
    title: `${title} · Click`,
    description,
    openGraph: {
      title,
      description,
      url: universalLink,
      type: "website",
    },
    other: {
      "apple-itunes-app": `app-id=${IOS_APP_ID}, app-argument=${universalLink}`,
    },
  };
}

export default async function EventShareLandingPage({
  params,
}: {
  params: Promise<{ beaconId: string }>;
}) {
  const { beaconId } = await params;
  if (!isUuidLike(beaconId)) notFound();

  const event = await fetchPublicEvent(beaconId);
  if (!event) notFound();

  const title = event.title?.trim() || "Click event";
  const schedule = formatSchedule(event.event_start_at, event.event_end_at);
  const deepLink = `click://e/${beaconId}`;
  const universalLink = `${BASE_URL}/e/${beaconId}`;

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 rounded-full blur-[150px] opacity-25 bg-sky-500" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 rounded-full blur-[150px] opacity-20 bg-emerald-500" />
      </div>

      <div className="relative z-10 w-full max-w-sm">
        <div className="rounded-3xl border border-zinc-800 bg-zinc-900/80 backdrop-blur-xl p-8 text-center shadow-2xl">
          <p className="text-xs uppercase tracking-widest text-zinc-500 mb-1">Event on Click</p>
          <h1 className="text-2xl font-bold text-white mb-2">{title}</h1>
          {schedule ? <p className="text-zinc-400 text-sm mb-2">{schedule}</p> : null}
          {event.host_name ? (
            <p className="text-zinc-500 text-sm mb-6">Hosted by {event.host_name}</p>
          ) : (
            <p className="text-zinc-400 text-sm mb-6">Open Click to view details and RSVP.</p>
          )}

          <div className="space-y-3">
            <a
              href={deepLink}
              className="flex items-center justify-center w-full py-3.5 rounded-xl font-semibold text-white bg-sky-600 transition-opacity hover:opacity-90"
            >
              Open in Click
            </a>

            <a
              href={APP_CONFIG.ios_store_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 w-full py-3.5 bg-white text-black rounded-xl font-medium hover:bg-zinc-200 transition-colors"
            >
              Download on the App Store
            </a>

            <a
              href={universalLink}
              className="block text-xs text-zinc-600 hover:text-zinc-400 break-all"
            >
              {universalLink}
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
