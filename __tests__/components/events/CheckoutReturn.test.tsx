import { act, render, screen } from "@testing-library/react";
import { CheckoutReturn } from "@/components/events/tickets/CheckoutReturn";
import { TicketingError, type OrderProjection } from "@/lib/ticketing/ticketingClient";

const mockReplace = jest.fn();
const mockRedirect = jest.fn((url: string) => {
  throw new Error(`redirect:${url}`);
});
const mockFetchOrder = jest.fn();
const mockUser: { current: { id: string } | null } = { current: null };

jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockReplace, push: jest.fn(), refresh: jest.fn() }),
  redirect: (url: string) => mockRedirect(url),
  notFound: () => {
    throw new Error("not-found");
  },
}));
jest.mock("@/lib/server/getServerUser", () => ({ getServerUser: async () => mockUser.current }));
jest.mock("@/lib/ticketing/ticketingClient", () => {
  const actual = jest.requireActual("@/lib/ticketing/ticketingClient");
  return { ...actual, fetchOrder: (...args: unknown[]) => mockFetchOrder(...args) };
});

const EVENT = "11111111-1111-4111-8111-111111111111";
const ORDER = "22222222-2222-4222-8222-222222222222";
const order = (order_state: string, fulfillment_state = "unfulfilled"): OrderProjection => ({
  id: ORDER,
  beacon_id: EVENT,
  order_state,
  fulfillment_state,
  total_amount: 2400,
  ticket_count: 0,
});

const flush = async (ms = 0) => {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(ms);
  });
};

describe("CheckoutReturn", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
  });
  afterEach(() => jest.useRealTimers());

  it("opens the tickets once the webhook has issued them", async () => {
    mockFetchOrder.mockResolvedValueOnce(order("checkout_created")).mockResolvedValue(order("paid", "fulfilled"));
    render(<CheckoutReturn beaconId={EVENT} orderId={ORDER} canceledParam={false} />);
    await flush();
    expect(screen.getByText("Confirming your order…")).toBeInTheDocument();
    await flush(1000);
    expect(mockReplace).toHaveBeenCalledWith(`/e/${EVENT}/pass`);
  });

  it("polls every second, then every three, and stops calmly after a minute", async () => {
    mockFetchOrder.mockResolvedValue(order("payment_processing"));
    render(<CheckoutReturn beaconId={EVENT} orderId={ORDER} canceledParam={false} />);
    await flush();
    await flush(10_000);
    expect(mockFetchOrder).toHaveBeenCalledTimes(11);
    await flush(9_000);
    expect(mockFetchOrder).toHaveBeenCalledTimes(14);
    await flush(60_000);
    const calls = mockFetchOrder.mock.calls.length;
    expect(screen.getByText("Still confirming…")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    await flush(30_000);
    expect(mockFetchOrder).toHaveBeenCalledTimes(calls);
    expect(screen.getByRole("link", { name: "Back to event" })).toHaveAttribute("href", `/e/${EVENT}`);
  });

  it("says no charge was made when the buyer left checkout", async () => {
    mockFetchOrder.mockResolvedValue(order("checkout_created"));
    render(<CheckoutReturn beaconId={EVENT} orderId={ORDER} canceledParam />);
    expect(screen.getByText("No charge was made")).toBeInTheDocument();
    await flush(5_000);
    expect(mockFetchOrder).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("link", { name: "Back to event" })).toHaveAttribute("href", `/e/${EVENT}`);
  });

  it("still opens the tickets if a canceled return actually paid", async () => {
    mockFetchOrder.mockResolvedValue(order("paid", "fulfilled"));
    render(<CheckoutReturn beaconId={EVENT} orderId={ORDER} canceledParam />);
    await flush();
    expect(mockReplace).toHaveBeenCalledWith(`/e/${EVENT}/pass`);
  });

  it.each([
    ["payment_failed", "Payment didn’t go through"],
    ["expired", "Checkout timed out"],
  ])("offers another try after %s", async (state, title) => {
    mockFetchOrder.mockResolvedValue(order(state));
    render(<CheckoutReturn beaconId={EVENT} orderId={ORDER} canceledParam={false} />);
    await flush();
    expect(screen.getByText(title)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Try again" })).toHaveAttribute("href", `/e/${EVENT}`);
    await flush(5_000);
    expect(mockFetchOrder).toHaveBeenCalledTimes(1);
  });

  it("explains a payment that was refunded instead of issued", async () => {
    mockFetchOrder.mockResolvedValue(order("refunded", "voided"));
    render(<CheckoutReturn beaconId={EVENT} orderId={ORDER} canceledParam={false} />);
    await flush();
    expect(screen.getByText("Your payment was refunded")).toBeInTheDocument();
  });

  it("can't find someone else's order", async () => {
    mockFetchOrder.mockRejectedValue(new TicketingError(404, "order_not_found"));
    render(<CheckoutReturn beaconId={EVENT} orderId={ORDER} canceledParam={false} />);
    await flush();
    expect(screen.getByText("We couldn’t find this order.")).toBeInTheDocument();
    await flush(5_000);
    expect(mockFetchOrder).toHaveBeenCalledTimes(1);
  });

  it("keeps waiting through a dropped connection", async () => {
    mockFetchOrder.mockRejectedValueOnce(new TicketingError(0, "network")).mockResolvedValue(order("paid", "fulfilled"));
    render(<CheckoutReturn beaconId={EVENT} orderId={ORDER} canceledParam={false} />);
    await flush();
    expect(screen.getByText("Confirming your order…")).toBeInTheDocument();
    await flush(1000);
    expect(mockReplace).toHaveBeenCalledWith(`/e/${EVENT}/pass`);
  });
});

describe("checkout return page", () => {
  it("sends signed-out visitors to log in and come back", async () => {
    mockUser.current = null;
    const { default: Page } = await import("@/app/(app)/e/[beaconId]/tickets/return/page");
    await expect(
      Page({ params: Promise.resolve({ beaconId: EVENT }), searchParams: Promise.resolve({ order: ORDER }) }),
    ).rejects.toThrow(`redirect:/login?next=${encodeURIComponent(`/e/${EVENT}/tickets/return?order=${ORDER}`)}`);
  });
});
