import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { TicketWallet, type TicketScope } from "@/components/events/tickets/TicketWallet";
import { createAdminSupabaseClient } from "@/lib/server/admin/supabaseAdmin";
import { getServerUser } from "@/lib/server/getServerUser";
import { hasTicketWallet, ticketingEnabled } from "@/lib/server/ticketing/flags";
import { listTicketGroups } from "@/lib/server/ticketing/ownedTickets";
import { loginHref } from "@/lib/shell/appNav";
import { TIME_ZONE_COOKIE, validTimeZone } from "@/lib/time/viewerTimeZone";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Tickets · Click", robots: { index: false } };

/** Your tickets (spec §5.5). The first list renders with the page; switching scope loads in place. */
export default async function TicketsPage({ searchParams }: { searchParams: Promise<{ scope?: string | string[] }> }) {
  const query = await searchParams;
  const scope: TicketScope = query.scope === "past" ? "past" : "upcoming";
  const user = await getServerUser();
  if (!user) {
    // Dark ticketing stays indistinguishable from absent until someone signs in.
    if (!ticketingEnabled()) notFound();
    redirect(loginHref(scope === "past" ? "/tickets?scope=past" : "/tickets"));
  }
  const admin = createAdminSupabaseClient();
  if (!(await hasTicketWallet(admin, user.id).catch(() => false))) notFound();

  const [jar, groups] = await Promise.all([
    cookies(),
    // eslint-disable-next-line react-hooks/purity -- server component, rendered per request
    listTicketGroups(admin, user.id, scope, Date.now()).catch(() => undefined),
  ]);
  const timeZone = validTimeZone(jar.get(TIME_ZONE_COOKIE)?.value) ?? "UTC";

  return (
    <div className="container-content pb-16 pt-6 md:pt-10">
      <div className="mx-auto w-full max-w-[640px]">
        <h1 className="type-title-2 mb-5 text-fg">Tickets</h1>
        <TicketWallet initialScope={scope} initialGroups={groups} timeZone={timeZone} />
      </div>
    </div>
  );
}
