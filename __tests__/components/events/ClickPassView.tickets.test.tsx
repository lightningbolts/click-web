import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SWRConfig } from "swr";
import { ClickPassView } from "@/components/events/ClickPassView";
import type { ClickPassState } from "@/lib/events/eventPassClient";
import type { OwnedTicket } from "@/lib/ticketing/types";

const mockFetchTicketDetail = jest.fn();

jest.mock("next/navigation", () => ({ useRouter: () => ({ push: jest.fn(), replace: jest.fn(), refresh: jest.fn() }) }));
jest.mock("@/components/ds/useMediaQuery", () => ({ useMediaQuery: () => false }));
jest.mock("@/lib/ui/useWakeLock", () => ({ useWakeLock: () => undefined }));
jest.mock("@/components/events/EventCalendarMenu", () => ({ EventCalendarMenu: () => null }));
jest.mock("@/components/events/MapsMenu", () => ({ MapsMenu: () => null }));
jest.mock("@/components/events/HostContactMenu", () => ({ HostContactMenu: () => null }));
jest.mock("@/lib/ticketing/ticketingClient", () => {
  const actual = jest.requireActual("@/lib/ticketing/ticketingClient");
  return { ...actual, fetchTicketDetail: (...args: unknown[]) => mockFetchTicketDetail(...args) };
});

const EVENT = "11111111-1111-4111-8111-111111111111";
const ticket = (n: number, over: Partial<OwnedTicket> = {}): OwnedTicket => ({
  id: `00000000-0000-4000-8000-00000000000${n}`,
  beacon_id: EVENT,
  order_id: "22222222-2222-4222-8222-222222222222",
  status: "valid",
  tier_name: n === 1 ? "General" : "VIP",
  ticket_number: `CLK-AAAA-000${n}`,
  issued_at: "2026-10-01T00:00:00Z",
  checked_in_at: null,
  credential_url: `https://joinclick.co/e/${EVENT}?pass=2.t${n}.sig`,
  code: `K7P-4Q${n}`,
  ...over,
});

function renderView(initial: ClickPassState, props: Partial<React.ComponentProps<typeof ClickPassView>> = {}) {
  return render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 60_000 }}>
      <ClickPassView
        beaconId={EVENT}
        initial={initial}
        ticket={{ title: "Rooftop", seed: "s", imageUrl: null, when: null, where: null }}
        holder={{ userId: "u1", name: "Maya", avatarUrl: null }}
        startMs={null}
        endMs={null}
        live={false}
        timeZone="America/Los_Angeles"
        calendar={{ id: EVENT, title: "Rooftop", startAt: null, endAt: null, location: null, description: null, url: "https://x" }}
        destination={null}
        contact={{ place: null, host: null }}
        ticketed
        {...props}
      />
    </SWRConfig>,
  );
}

const setUserAgent = (ua: string) => Object.defineProperty(window.navigator, "userAgent", { value: ua, configurable: true });

describe("ClickPassView with tickets", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setUserAgent("Mozilla/5.0 (jsdom)");
  });

  it("pages through several tickets with buttons and arrow keys", async () => {
    renderView({ kind: "tickets", tickets: [ticket(1), ticket(2), ticket(3)] });
    expect(screen.getByText("1 of 3")).toBeInTheDocument();
    expect(screen.getByText("General")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Previous ticket" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Next ticket" }));
    expect(screen.getByText("2 of 3")).toBeInTheDocument();
    expect(screen.getByText("CLK-AAAA-0002")).toBeInTheDocument();
    await userEvent.keyboard("{ArrowRight}");
    expect(screen.getByText("3 of 3")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next ticket" })).toBeDisabled();
    await userEvent.keyboard("{ArrowLeft}");
    expect(screen.getByText("2 of 3")).toBeInTheDocument();
  });

  it("opens on the ticket named in the link", () => {
    renderView({ kind: "tickets", tickets: [ticket(1), ticket(2)] }, { initialTicketId: ticket(2).id });
    expect(screen.getByText("2 of 2")).toBeInTheDocument();
  });

  it("shows a single ticket without paging", () => {
    renderView({ kind: "tickets", tickets: [ticket(1)] });
    expect(screen.queryByRole("button", { name: "Next ticket" })).not.toBeInTheDocument();
    expect(screen.getByTestId("pass-qr")).toBeInTheDocument();
  });

  it("hides the code of a refunded ticket", () => {
    renderView({ kind: "tickets", tickets: [ticket(1, { status: "refunded", credential_url: null, code: null })] });
    expect(screen.getAllByText("Refunded").length).toBeGreaterThan(0);
    expect(screen.queryByTestId("pass-qr")).not.toBeInTheDocument();
    expect(screen.queryByText(/Your host scans this at the door/)).not.toBeInTheDocument();
  });

  it("keeps a checked-in ticket's code at full contrast", () => {
    renderView({ kind: "tickets", tickets: [ticket(1, { status: "checked_in", checked_in_at: "2026-10-10T03:04:00Z" })] });
    const qr = screen.getByTestId("pass-qr");
    expect(qr.querySelector("svg")).not.toHaveClass("opacity-35");
    expect(screen.getByText("Checked in at 8:04 PM")).toBeInTheDocument();
  });

  it("replaces every code once the event is cancelled", () => {
    renderView({ kind: "tickets", tickets: [ticket(1), ticket(2)] }, { cancelled: true });
    expect(screen.getByText("This event was cancelled")).toBeInTheDocument();
    expect(screen.queryByTestId("pass-qr")).not.toBeInTheDocument();
  });

  it("loads the order only when asked", async () => {
    mockFetchTicketDetail.mockResolvedValue({
      ticket: ticket(1),
      event: {},
      order: {
        id: "o",
        items: [{ tier_name: "General", quantity: 2, unit_amount: 1500 }],
        subtotal_amount: 3000,
        platform_fee_amount: 0,
        total_amount: 3000,
        currency: "usd",
        paid_at: "2026-10-01T00:00:00Z",
        refunded_amount: 0,
      },
    });
    renderView({ kind: "tickets", tickets: [ticket(1)] });
    const toggle = screen.getByRole("button", { name: "Order details" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(mockFetchTicketDetail).not.toHaveBeenCalled();
    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    const details = await screen.findByTestId("order-details");
    expect(within(details).getByText("2 × General")).toBeInTheDocument();
    expect(within(details).getByText("None")).toBeInTheDocument();
    expect(within(details).getAllByText("$30.00")).toHaveLength(2);
    expect(mockFetchTicketDetail).toHaveBeenCalledWith(ticket(1).id);
  });

  it("adds the shown ticket to Apple Wallet", async () => {
    setUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 19_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/19.0 Mobile/15E148 Safari/604.1");
    renderView({ kind: "tickets", tickets: [ticket(1), ticket(2)] }, { walletAvailable: true });
    await userEvent.click(screen.getByRole("button", { name: "Next ticket" }));
    expect(screen.getByRole("link", { name: "Add to Apple Wallet" })).toHaveAttribute(
      "href",
      `/api/beacons/${EVENT}/pass/wallet?ticket=${ticket(2).id}`,
    );
  });

  it("points people without a ticket to the event", () => {
    renderView({ kind: "not_going" });
    expect(screen.getByText("No tickets yet")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Get tickets" })).toHaveAttribute("href", `/e/${EVENT}`);
  });

  it("leaves the RSVP pass as it was", () => {
    renderView(
      { kind: "ready", pass: { credential_url: "https://joinclick.co/e/x?pass=1.a.b", code: "K7P-4QX", checked_in_at: null, wallet_available: false } },
      { ticketed: false },
    );
    expect(screen.getByText("K7P-4QX")).toBeInTheDocument();
    expect(screen.getByText("Going")).toBeInTheDocument();
    expect(screen.queryByText(/of \d/)).not.toBeInTheDocument();
  });
});
