import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SWRConfig } from "swr";
import { TicketPurchaseCard } from "@/components/events/tickets/TicketPurchaseCard";
import { TicketingError } from "@/lib/ticketing/ticketingClient";
import type { EventTicketing, TicketOffering } from "@/lib/ticketing/types";

const mockPush = jest.fn();
const mockFetchOfferings = jest.fn();
const mockStartCheckout = jest.fn();
const mockAssign = jest.fn();

jest.mock("next/navigation", () => ({ useRouter: () => ({ push: mockPush, refresh: jest.fn() }) }));
jest.mock("@/lib/ticketing/ticketingClient", () => {
  const actual = jest.requireActual("@/lib/ticketing/ticketingClient");
  return {
    ...actual,
    fetchOfferings: (...args: unknown[]) => mockFetchOfferings(...args),
    startCheckout: (...args: unknown[]) => mockStartCheckout(...args),
  };
});
jest.mock("@/lib/navigation/assignLocation", () => ({ assignLocation: (url: string) => mockAssign(url) }));

const ID = "11111111-1111-4111-8111-111111111111";
const TICKETING: EventTicketing = { status: "sales_open", cancelled: false, from_amount: 1200, currency: "usd", available: true };

const offering = (id: string, over: Partial<TicketOffering> = {}): TicketOffering => ({
  id,
  name: id === "ga" ? "General" : id === "vip" ? "VIP" : "Free entry",
  description: null,
  unit_amount: 1200,
  currency: "usd",
  availability: "on_sale",
  remaining: null,
  max_quantity: 8,
  sales_start_at: null,
  sales_end_at: null,
  ...over,
});

function renderCard(props: Partial<React.ComponentProps<typeof TicketPurchaseCard>> = {}) {
  return render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <TicketPurchaseCard beaconId={ID} ticketing={TICKETING} myTicketCount={0} signedIn {...props} />
    </SWRConfig>,
  );
}

const cta = () => screen.getByTestId("ticket-cta");

describe("TicketPurchaseCard", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFetchOfferings.mockResolvedValue([offering("ga")]);
  });

  it("shows one stepper, starting at one, for a single ticket type", async () => {
    renderCard();
    expect(await screen.findByRole("button", { name: "More General" })).toBeInTheDocument();
    expect(screen.queryAllByTestId("ticket-row")).toHaveLength(0);
    expect(screen.getByTestId("ticket-quantity")).toHaveTextContent("1");
    expect(cta()).toHaveTextContent("Checkout · $12.00");
    expect(screen.getByText("Fees")).toBeInTheDocument();
    expect(screen.getByText("None")).toBeInTheDocument();
  });

  it("lists every ticket type with its own stepper and status", async () => {
    mockFetchOfferings.mockResolvedValue([
      offering("ga"),
      offering("vip", { unit_amount: 2500, availability: "sold_out", max_quantity: 0 }),
      offering("free", { unit_amount: 0, availability: "not_started", max_quantity: 0, sales_start_at: "2026-10-03T19:00:00Z" }),
    ]);
    renderCard();
    const rows = await screen.findAllByTestId("ticket-row");
    expect(rows).toHaveLength(3);
    expect(within(rows[1]!).getByText("Sold out")).toBeInTheDocument();
    expect(within(rows[1]!).getByRole("button", { name: "More VIP" })).toBeDisabled();
    expect(within(rows[2]!).getByText("On sale Oct 3")).toBeInTheDocument();
    expect(cta()).toHaveTextContent("Get tickets");
    expect(cta()).toBeDisabled();

    await userEvent.click(within(rows[0]!).getByRole("button", { name: "More General" }));
    await userEvent.click(within(rows[0]!).getByRole("button", { name: "More General" }));
    expect(cta()).toHaveTextContent("Checkout · $24.00");
  });

  it("never steps past the buyer's limit", async () => {
    mockFetchOfferings.mockResolvedValue([offering("ga", { max_quantity: 2 })]);
    renderCard();
    const more = await screen.findByRole("button", { name: "More General" });
    await userEvent.click(more);
    expect(screen.getByTestId("ticket-quantity")).toHaveTextContent("2");
    expect(more).toBeDisabled();
  });

  it("claims free tickets and opens them", async () => {
    mockFetchOfferings.mockResolvedValue([offering("free", { unit_amount: 0 })]);
    mockStartCheckout.mockResolvedValue({ order_id: "o", status: "fulfilled" });
    renderCard();
    await waitFor(() => expect(cta()).toHaveTextContent("Claim free ticket"));
    await userEvent.click(cta());
    expect(mockStartCheckout).toHaveBeenCalledWith(ID, [{ ticket_tier_id: "free", quantity: 1 }]);
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith(`/e/${ID}/pass`));
  });

  it("sends paid orders to Stripe, once", async () => {
    let finish: (value: unknown) => void = () => undefined;
    mockStartCheckout.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    renderCard();
    await waitFor(() => expect(cta()).toBeEnabled());
    await userEvent.click(cta());
    expect(cta()).toBeDisabled();
    await userEvent.click(cta());
    expect(mockStartCheckout).toHaveBeenCalledTimes(1);
    finish({ order_id: "o", checkout_url: "https://checkout.stripe.com/c/pay/cs_1" });
    await waitFor(() => expect(mockAssign).toHaveBeenCalledWith("https://checkout.stripe.com/c/pay/cs_1"));
  });

  it("refreshes availability when tickets ran out mid-checkout", async () => {
    mockStartCheckout.mockRejectedValue(new TicketingError(409, "insufficient_inventory", 1));
    renderCard();
    const more = await screen.findByRole("button", { name: "More General" });
    await userEvent.click(more);
    mockFetchOfferings.mockResolvedValue([offering("ga", { max_quantity: 1, remaining: 1 })]);
    await userEvent.click(cta());
    expect(await screen.findByText("Only 1 left. We updated your selection.")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId("ticket-quantity")).toHaveTextContent("1"));
    expect(mockFetchOfferings).toHaveBeenCalledTimes(2);
  });

  it("asks signed-out visitors to log in first", async () => {
    renderCard({ signedIn: false });
    const login = await screen.findByRole("link", { name: "Log in to get tickets" });
    expect(login).toHaveAttribute("href", `/login?next=${encodeURIComponent(`/e/${ID}`)}`);
  });

  it("links ticket holders to their tickets", async () => {
    renderCard({ myTicketCount: 2 });
    expect(await screen.findByRole("link", { name: /You have 2 tickets/ })).toHaveAttribute("href", `/e/${ID}/pass`);
  });

  it("says when an event was cancelled, with nothing to buy", () => {
    renderCard({ ticketing: { ...TICKETING, cancelled: true, available: false } });
    expect(screen.getByText("This event was cancelled")).toBeInTheDocument();
    expect(screen.queryByTestId("ticket-cta")).not.toBeInTheDocument();
    expect(mockFetchOfferings).not.toHaveBeenCalled();
  });
});
