"use client";
import { useState } from "react";
import useSWR from "swr";
import { FcButton } from "@/components/fc";
import { ticketingApi } from "@/lib/ticketing/api";
import { ticketingError } from "@/lib/ticketing/errors";
import { money } from "@/lib/ticketing/format";
import type { TicketOrder } from "@/lib/ticketing/types";
import TicketOrderDrawer from "./TicketOrderDrawer";
type Summary = {
  gross: number;
  platform_fee: number;
  refunded: number;
  net_before_stripe_fees: number;
  sold: number;
  checked_in: number;
  refunded_tickets: number;
};
export default function TicketSalesDashboard({
  beaconId,
  canRefund,
}: {
  beaconId: string;
  canRefund: boolean;
}) {
  const [page, setPage] = useState(0);
  const base = "/api/beacons/" + beaconId + "/tickets";
  const summary = useSWR<Summary>(base + "/summary", ticketingApi);
  const orders = useSWR<{ orders: TicketOrder[]; total: number }>(
    base + "/orders?page=" + page,
    ticketingApi,
  );
  const refresh = () => {
    void summary.mutate();
    void orders.mutate();
  };
  return (
    <section className="space-y-4">
      <h3 className="font-bold">Ticket sales</h3>
      <FcButton variant="secondary" onClick={refresh}>
        Refresh sales
      </FcButton>
      {summary.error || orders.error ? (
        <p role="alert">{ticketingError(summary.error ?? orders.error)}</p>
      ) : null}
      {summary.data ? (
        <dl className="grid grid-cols-2 gap-3">
          <div>
            <dt>Gross sales</dt>
            <dd>{money(summary.data.gross)}</dd>
          </div>
          <div>
            <dt>Platform fees</dt>
            <dd>{money(summary.data.platform_fee)}</dd>
          </div>
          <div>
            <dt>Refunded</dt>
            <dd>{money(summary.data.refunded)}</dd>
          </div>
          <div>
            <dt>Net before Stripe fees</dt>
            <dd>{money(summary.data.net_before_stripe_fees)}</dd>
          </div>
          <div>
            <dt>Active tickets</dt>
            <dd>{summary.data.sold}</dd>
          </div>
          <div>
            <dt>Checked in</dt>
            <dd>{summary.data.checked_in}</dd>
          </div>
        </dl>
      ) : (
        <p role="status">Loading sales…</p>
      )}
      {orders.data?.orders.map((o) => (
        <TicketOrderDrawer key={o.id} order={o} canRefund={canRefund} refresh={refresh} />
      ))}
      {orders.data?.total === 0 ? <p>No orders yet.</p> : null}
      <div className="flex gap-3">
        <FcButton disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
          Previous
        </FcButton>
        <span>Page {page + 1}</span>
        <FcButton
          disabled={!orders.data || (page + 1) * 25 >= orders.data.total}
          onClick={() => setPage((p) => p + 1)}
        >
          Next
        </FcButton>
      </div>
    </section>
  );
}
