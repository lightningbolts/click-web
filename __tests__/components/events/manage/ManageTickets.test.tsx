import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SWRConfig } from "swr";
import { ManageTickets } from "@/components/events/manage/ManageTickets";
import type { TicketAttendee, TicketSalesSummary } from "@/lib/ticketing/types";

const mockClient = { searchAttendees: jest.fn(), refundOrder: jest.fn(), cancelEvent: jest.fn(), checkInTicket: jest.fn() };
const mockToast = { success: jest.fn(), error: jest.fn() };
const mockRefresh = jest.fn();

jest.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mockRefresh, push: jest.fn() }) }));
jest.mock("@/components/ds/useMediaQuery", () => ({ useMediaQuery: () => true }));
jest.mock("@/components/ds/Toast", () => ({ toast: { success: (m: string) => mockToast.success(m), error: (m: string) => mockToast.error(m) } }));
jest.mock("@/lib/ticketing/ticketingClient", () => {
  const actual = jest.requireActual("@/lib/ticketing/ticketingClient");
  return {
    ...actual,
    searchAttendees: (...a: unknown[]) => mockClient.searchAttendees(...a),
    refundOrder: (...a: unknown[]) => mockClient.refundOrder(...a),
    cancelEvent: (...a: unknown[]) => mockClient.cancelEvent(...a),
    checkInTicket: (...a: unknown[]) => mockClient.checkInTicket(...a),
  };
});

const EVENT = "11111111-1111-4111-8111-111111111111";
const summary: TicketSalesSummary = {
  sold: 87,
  capacity: 120,
  checked_in: 42,
  gross_cents: 130500,
  refunded_cents: 0,
  net_cents: 123975,
  refundable_orders: 61,
  currency: "usd",
  tiers: [
    { id: "ga", name: "General", sold: 80, capacity: 100, unit_amount: 1500 },
    { id: "vip", name: "VIP", sold: 7, capacity: 20, unit_amount: 0 },
  ],
};
const person = (over: Partial<TicketAttendee> = {}): TicketAttendee => ({
  ticket_id: "t1",
  order_id: "o1",
  user_id: "u1",
  name: "Alex Chen",
  avatar_url: null,
  tier_name: "General",
  status: "valid",
  checked_in_at: null,
  ticket_number: "CLK-7Q2M-0001",
  refundable: true,
  ...over,
});

function renderTab(props: Partial<React.ComponentProps<typeof ManageTickets>> = {}) {
  return render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <ManageTickets
        beaconId={EVENT}
        access="manage"
        summary={summary}
        initialAttendees={{ attendees: [person()], next_cursor: null }}
        cancelled={false}
        timeZone="America/Los_Angeles"
        {...props}
      />
    </SWRConfig>,
  );
}

const openRowMenu = async (name = "Alex Chen") => userEvent.click(screen.getByRole("button", { name: `Actions for ${name}` }));

describe("ManageTickets", () => {
  beforeEach(() => jest.clearAllMocks());

  it("sums up sales and each ticket type", () => {
    renderTab();
    expect(screen.getByText("87 / 120")).toBeInTheDocument();
    expect(screen.getByText("42")).toBeInTheDocument();
    expect(screen.getByText("$1,305")).toBeInTheDocument();
    const types = screen.getByRole("region", { name: "Ticket types" });
    expect(within(types).getByText("General")).toBeInTheDocument();
    expect(within(types).getByText("80 / 100 sold")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Open scanner/ })).toHaveAttribute("href", `/e/${EVENT}/scan`);
  });

  it("searches attendees after a pause in typing", async () => {
    jest.useFakeTimers();
    try {
      mockClient.searchAttendees.mockResolvedValue({ attendees: [person({ ticket_id: "t9", name: "Sam Lee" })], next_cursor: null });
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      renderTab();
      await user.type(screen.getByRole("searchbox", { name: "Search attendees" }), "sam");
      expect(mockClient.searchAttendees).not.toHaveBeenCalled();
      await act(() => jest.advanceTimersByTimeAsync(250));
      expect(mockClient.searchAttendees).toHaveBeenCalledWith(`/api/beacons/${EVENT}/tickets/attendees?q=sam`);
      expect(await screen.findByText("Sam Lee")).toBeInTheDocument();
    } finally {
      jest.useRealTimers();
    }
  });

  it("loads the next page", async () => {
    mockClient.searchAttendees.mockResolvedValue({ attendees: [person({ ticket_id: "t2", name: "Robin Park" })], next_cursor: null });
    renderTab({ initialAttendees: { attendees: [person()], next_cursor: "c1" } });
    await userEvent.click(screen.getByRole("button", { name: "Show more" }));
    expect(await screen.findByText("Robin Park")).toBeInTheDocument();
    expect(screen.getByText("Alex Chen")).toBeInTheDocument();
    expect(mockClient.searchAttendees).toHaveBeenCalledWith(`/api/beacons/${EVENT}/tickets/attendees?cursor=c1`);
    expect(screen.queryByRole("button", { name: "Show more" })).not.toBeInTheDocument();
  });

  it("checks someone in by hand", async () => {
    mockClient.checkInTicket.mockResolvedValue({ result: "checked_in", checked_in_at: "2026-10-10T03:04:00Z" });
    renderTab();
    await openRowMenu();
    await userEvent.click(await screen.findByRole("menuitem", { name: "Check in" }));
    expect(mockClient.checkInTicket).toHaveBeenCalledWith(EVENT, "t1");
    const list = screen.getByRole("region", { name: "Attendees" });
    expect(await within(list).findByText("Checked in")).toBeInTheDocument();
  });

  it("refunds one ticket after confirming", async () => {
    mockClient.refundOrder.mockResolvedValue({ refund_id: "r", amount: 1500 });
    renderTab();
    await openRowMenu();
    await userEvent.click(await screen.findByRole("menuitem", { name: "Refund ticket" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Refund $15.00 to Alex Chen?")).toBeInTheDocument();
    expect(within(dialog).getByText("Their ticket stops working right away.")).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "Refund" }));
    await waitFor(() => expect(mockClient.refundOrder).toHaveBeenCalledWith("o1", ["t1"]));
    expect(await screen.findByText("Refunded")).toBeInTheDocument();
    expect(mockToast.success).toHaveBeenCalledWith("Refund started");
    // Opening a dialog from a menu must not leave the page unclickable afterwards.
    await waitFor(() => expect(document.body.style.pointerEvents).not.toBe("none"));
  });

  it("cancels the event and refunds every order", async () => {
    mockClient.cancelEvent.mockResolvedValue({ refunds_started: 60, refunds_failed: 1 });
    renderTab();
    await userEvent.click(screen.getByRole("button", { name: "Cancel event" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Cancel this event?")).toBeInTheDocument();
    expect(within(dialog).getByText("Everyone’s tickets stop working and all 61 paid orders are refunded in full.")).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "Cancel event" }));
    await waitFor(() => expect(mockToast.success).toHaveBeenCalledWith("Event cancelled. 60 refunds started. 1 will retry automatically."));
    expect(mockClient.cancelEvent).toHaveBeenCalledWith(EVENT);
    expect(mockRefresh).toHaveBeenCalled();
  });

  it("is read-only for viewers", () => {
    renderTab({ access: "view" });
    expect(screen.queryByRole("button", { name: "Actions for Alex Chen" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cancel event" })).not.toBeInTheDocument();
  });

  it("explains a cancelled event and stops changes", () => {
    renderTab({ cancelled: true });
    expect(screen.getByText("This event was cancelled. Paid orders are being refunded.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cancel event" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Actions for Alex Chen" })).not.toBeInTheDocument();
  });
});
