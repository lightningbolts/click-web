import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { CheckoutReturn } from "@/components/events/tickets/CheckoutReturn";
import { EVENT_BEACON_UUID_RE } from "@/lib/events/eventMetadata";
import { eventTicketsReturnPath } from "@/lib/events/eventUrls";
import { getServerUser } from "@/lib/server/getServerUser";
import { loginHref } from "@/lib/shell/appNav";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Your order · Click", robots: { index: false } };

/** Stripe Checkout's success and cancel URL (spec §5.3). */
export default async function CheckoutReturnPage({
  params,
  searchParams,
}: {
  params: Promise<{ beaconId: string }>;
  searchParams: Promise<{ order?: string | string[]; canceled?: string | string[] }>;
}) {
  const [{ beaconId }, query] = await Promise.all([params, searchParams]);
  const orderId = typeof query.order === "string" ? query.order : "";
  if (!EVENT_BEACON_UUID_RE.test(beaconId) || !EVENT_BEACON_UUID_RE.test(orderId)) notFound();
  const canceled = query.canceled === "1";

  if (!(await getServerUser())) redirect(loginHref(eventTicketsReturnPath(beaconId, orderId, canceled)));

  return (
    <div className="container-page mx-auto max-w-[440px] pt-10">
      <CheckoutReturn beaconId={beaconId} orderId={orderId} canceledParam={canceled} />
    </div>
  );
}
