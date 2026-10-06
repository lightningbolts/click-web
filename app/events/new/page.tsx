import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import EventForm from "@/components/events/EventForm";
import { getServerUser } from "@/lib/server/getServerUser";
import { loginHref } from "@/lib/shell/appNav";
import { TIME_ZONE_COOKIE, validTimeZone } from "@/lib/time/viewerTimeZone";

export const metadata: Metadata = { title: "Create event · Click", robots: { index: false } };

/** `?host=place:{id}` preselects a Place in "Host as" (spec §7.6.3). */
function hostPlaceId(raw: string | string[] | undefined): string | null {
  const v = Array.isArray(raw) ? raw[0] : raw;
  const m = /^place:([0-9a-f-]{36})$/i.exec(v ?? "");
  return m ? m[1] : null;
}

export default async function NewEventPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [params, user, jar] = await Promise.all([searchParams, getServerUser(), cookies()]);
  const host = hostPlaceId(params.host);
  if (!user) redirect(loginHref(host ? `/events/new?host=place:${host}` : "/events/new"));
  // eslint-disable-next-line react-hooks/purity -- server component, rendered per request
  const nowMs = Date.now();

  return (
    <div className="container-page pb-16 pt-6 md:pt-10">
      <h1 className="type-title-1 mb-6 text-fg md:mb-8">Create event</h1>
      <EventForm
        defaultTimeZone={validTimeZone(jar.get(TIME_ZONE_COOKIE)?.value)}
        nowMs={nowMs}
        initialHostPlaceId={host}
      />
    </div>
  );
}
