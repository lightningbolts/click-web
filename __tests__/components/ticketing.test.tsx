import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import useSWR from "swr";
import { ticketingApi } from "@/lib/ticketing/api";
import TicketPurchasePanel from "@/components/events/ticketing/TicketPurchasePanel";
import TicketQrCard from "@/components/events/ticketing/TicketQrCard";
import TicketWallet from "@/components/events/ticketing/TicketWallet";
import TicketOrderStatus from "@/components/events/ticketing/TicketOrderStatus";
import TicketRefundDialog from "@/components/events/ticketing/TicketRefundDialog";
import TicketSalesControls from "@/components/events/ticketing/TicketSalesControls";
import TicketTierEditor from "@/components/events/ticketing/TicketTierEditor";
import TicketSalesDashboard from "@/components/events/ticketing/TicketSalesDashboard";
import OrganizerPayoutCard from "@/components/events/ticketing/OrganizerPayoutCard";
import TicketingGate from "@/components/events/ticketing/TicketingGate";
import ConnectReturn from "@/components/events/ticketing/ConnectReturn";
import type { TicketOrder, TicketTier, TicketingEvent } from "@/lib/ticketing/types";

jest.mock("swr", () => ({ __esModule: true, default: jest.fn() }));
jest.mock("@/lib/ticketing/api", () => ({ ticketingApi: jest.fn() }));
jest.mock("@/lib/AuthContext", () => ({ useAuth: () => ({ user: { id: "buyer" } }) }));
jest.mock("@/components/LoginModal", () => ({ __esModule: true, default: () => null }));
const swr = jest.mocked(useSWR);
const api = jest.mocked(ticketingApi);
const mutate = jest.fn();
const event: TicketingEvent = {
  admission_type: "paid",
  ticketing_status: "sales_open",
  ticket_sales_start_at: null,
  ticket_sales_end_at: null,
};
const tier: TicketTier = {
  id: "tier",
  name: "General",
  description: null,
  currency: "usd",
  unit_amount: 1500,
  capacity: 10,
  remaining: 2,
  sold: 7,
  held: 1,
  max_per_order: 8,
  max_per_user: 2,
  sales_start_at: null,
  sales_end_at: null,
  is_active: true,
  sort_order: 0,
};
const order: TicketOrder = {
  id: "order",
  beacon_id: "event",
  currency: "usd",
  total_amount: 3000,
  order_state: "paid",
  fulfillment_state: "fulfilled",
  ticket_order_items: [
    { ticket_tier_id: "tier", tier_name_snapshot: "General", quantity: 2, unit_amount: 1500 },
  ],
  tickets: [
    { id: "t1", ticket_tier_id: "tier", ticket_number: "ABC", status: "valid" },
    { id: "t2", ticket_tier_id: "tier", ticket_number: "DEF", status: "checked_in" },
  ],
};

beforeEach(() => {
  jest.clearAllMocks();
  swr.mockReturnValue({
    data: { tiers: [tier], event },
    mutate,
    isLoading: false,
  } as unknown as ReturnType<typeof useSWR>);
  Object.defineProperty(globalThis.crypto, "randomUUID", {
    configurable: true,
    value: () => "11111111-1111-4111-8111-111111111111",
  });
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
});

test("purchase quantity is capped by available inventory and is accessibly named", () => {
  render(<TicketPurchasePanel beaconId="event" initial={event} enabled />);
  const add = screen.getByRole("button", { name: "Add one General ticket" });
  fireEvent.click(add);
  fireEvent.click(add);
  expect(add).toBeDisabled();
  expect(screen.getByText("$30.00")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Remove one General ticket" }));
  expect(add).not.toBeDisabled();
});

test.each(["sales_paused", "sales_closed", "draft"])("purchase disabled for %s", (status) => {
  swr.mockReturnValue({
    data: { tiers: [tier], event: { ...event, ticketing_status: status } },
    mutate,
  } as unknown as ReturnType<typeof useSWR>);
  render(<TicketPurchasePanel beaconId="event" initial={event} enabled />);
  expect(screen.getByRole("button", { name: "Continue to checkout" })).toBeDisabled();
});

test("checkout retries keep the same attempt and send no financial amounts", async () => {
  api.mockRejectedValue(new Error("insufficient_inventory"));
  render(<TicketPurchasePanel beaconId="event" initial={event} enabled />);
  fireEvent.click(screen.getByRole("button", { name: "Add one General ticket" }));
  fireEvent.click(screen.getByRole("button", { name: "Continue to checkout" }));
  await screen.findByText(/not enough tickets left/);
  fireEvent.click(screen.getByRole("button", { name: "Continue to checkout" }));
  await waitFor(() => expect(api).toHaveBeenCalledTimes(2));
  expect(api.mock.calls[0][1]).toEqual(api.mock.calls[1][1]);
  expect(api.mock.calls[0][1]).toEqual({
    attempt_id: expect.any(String),
    items: [{ ticket_tier_id: "tier", quantity: 1 }],
  });
});

test("feature flag hides organizer controls and purchase action", () => {
  swr.mockReturnValue({ data: { enabled: false }, mutate } as unknown as ReturnType<typeof useSWR>);
  render(
    <>
      <TicketingGate>
        <button>Private control</button>
      </TicketingGate>
      <TicketPurchasePanel beaconId="event" initial={event} enabled={false} />
    </>,
  );
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
});

test("QR issuance only happens on explicit action; remount does not rotate", async () => {
  api.mockResolvedValue({ credential_url: "https://click.example/t/opaque-token" });
  const ticket = {
    id: "t1",
    ticket_number: "ABC",
    tier_name: "General",
    status: "valid",
    checked_in_at: null,
  };
  const view = render(<TicketQrCard beaconId="event" ticket={ticket} />);
  expect(api).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Show QR" }));
  await screen.findByRole("button", { name: "Regenerate QR" });
  expect(api).toHaveBeenCalledWith("/api/beacons/event/tickets/t1/credential", {});
  view.unmount();
  render(<TicketQrCard beaconId="event" ticket={ticket} />);
  expect(api).toHaveBeenCalledTimes(1);
});

test.each(["refunded", "void", "checked_in"])("%s ticket has no QR action", (status) => {
  render(
    <TicketQrCard
      beaconId="event"
      ticket={{ id: "t1", ticket_number: "ABC", tier_name: "General", status, checked_in_at: null }}
    />,
  );
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
});

test("wallet empty state has no credential side effects", () => {
  swr.mockReturnValue({ data: { tickets: [] }, mutate } as unknown as ReturnType<typeof useSWR>);
  render(<TicketWallet beaconId="event" />);
  expect(screen.getByText(/do not have tickets/)).toBeInTheDocument();
  expect(api).not.toHaveBeenCalled();
});

test("order return waits for local fulfillment, not a redirect parameter", async () => {
  api.mockResolvedValue({
    order: { ...order, order_state: "checkout_created", fulfillment_state: "unfulfilled" },
  });
  const view = render(<TicketOrderStatus beaconId="event" orderId="order" />);
  await waitFor(() => expect(api).toHaveBeenCalledTimes(1));
  expect(screen.getByRole("status")).toHaveTextContent("Waiting for payment confirmation");
  view.unmount();
  api.mockResolvedValue({ order });
  render(<TicketOrderStatus beaconId="event" orderId="order" />);
  await screen.findByText("Payment confirmed. Your tickets are ready.");
});

test("refund confirms exact selected amount and stays pending while request runs", async () => {
  let resolve!: (value: unknown) => void;
  api.mockImplementation(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  const saved = jest.fn(),
    close = jest.fn();
  render(<TicketRefundDialog order={order} onSaved={saved} onClose={close} />);
  fireEvent.click(screen.getByLabelText("ABC · valid"));
  expect(screen.getByText("$15.00")).toBeInTheDocument();
  fireEvent.submit(screen.getByRole("button", { name: "Confirm refund" }).closest("form")!);
  expect(screen.getByRole("button", { name: "Submitting…" })).toBeDisabled();
  expect(saved).not.toHaveBeenCalled();
  resolve({ refund_id: "refund" });
  await waitFor(() => expect(saved).toHaveBeenCalledTimes(1));
  expect(api.mock.calls[0][1]).toEqual({
    request_id: expect.any(String),
    ticket_ids: ["t1"],
    reason: null,
  });
});

test("closed sales are terminal in controls", () => {
  render(
    <TicketSalesControls
      beaconId="event"
      event={{ ...event, ticketing_status: "sales_closed" }}
      refresh={mutate}
    />,
  );
  expect(screen.queryByRole("button", { name: "Open sales" })).not.toBeInTheDocument();
});

test("tier deactivation uses PATCH and reports capacity errors", async () => {
  api.mockRejectedValue(new Error("capacity_below_committed"));
  render(<TicketTierEditor beaconId="event" tiers={[tier]} refresh={mutate} />);
  fireEvent.click(screen.getByRole("button", { name: "Deactivate General" }));
  await screen.findByText(/Capacity cannot be lower/);
  expect(api).toHaveBeenCalledWith(
    "/api/beacons/event/tickets/tiers/tier",
    { is_active: false },
    "PATCH",
  );
});

test("payout ready status uses normalized capability", () => {
  swr.mockReturnValue({
    data: { can_sell: true, onboarding_state: "ready" },
    mutate,
  } as unknown as ReturnType<typeof useSWR>);
  render(<OrganizerPayoutCard beaconId="event" />);
  expect(screen.getByRole("status")).toHaveTextContent("Ready to receive ticket payments");
});

test("sales dashboard shows server totals and pagination", () => {
  swr.mockImplementation(
    (key: unknown) =>
      ({
        data: String(key).endsWith("/summary")
          ? {
              gross: 10000,
              platform_fee: 1000,
              refunded: 0,
              net_before_stripe_fees: 9000,
              sold: 10,
              checked_in: 2,
            }
          : { orders: [], total: 26 },
        mutate,
      }) as unknown as ReturnType<typeof useSWR>,
  );
  render(<TicketSalesDashboard beaconId="event" canRefund={false} />);
  expect(screen.getByText("$90.00")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  expect(screen.getByText("Page 2")).toBeInTheDocument();
});

test("Connect return forces server sync and does not assume readiness", async () => {
  api.mockResolvedValue({ can_sell: false });
  render(<ConnectReturn returnTo="/events" refresh={false} />);
  await screen.findByText(/still needs attention/);
  expect(api).toHaveBeenCalledWith("/api/payments/connect/status?sync=1");
});
