import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SWRConfig } from "swr";
import { TicketWallet } from "@/components/events/tickets/TicketWallet";
import type { MyTicketsGroup, OwnedTicket } from "@/lib/ticketing/types";

const mockReplace = jest.fn();
const mockFetchMyTickets = jest.fn();

jest.mock("next/navigation", () => ({ useRouter: () => ({ replace: mockReplace, push: jest.fn(), refresh: jest.fn() }) }));
jest.mock("@/lib/ticketing/ticketingClient", () => {
  const actual = jest.requireActual("@/lib/ticketing/ticketingClient");
  return { ...actual, fetchMyTickets: (...args: unknown[]) => mockFetchMyTickets(...args) };
});

const EVENT = "11111111-1111-4111-8111-111111111111";
const ticket = (tier: string): OwnedTicket => ({
  id: `t-${tier}-${Math.random()}`,
  beacon_id: EVENT,
  order_id: "o",
  status: "valid",
  tier_name: tier,
  ticket_number: "CLK-AAAA-0001",
  issued_at: "2026-10-01T00:00:00Z",
  checked_in_at: null,
  credential_url: "https://joinclick.co/e/x?pass=2.a.b",
  code: "K7P-4QX",
});
const group = (over: Partial<MyTicketsGroup["event"]> = {}, tickets = [ticket("General"), ticket("General")]): MyTicketsGroup => ({
  event: {
    beacon_id: EVENT,
    title: "Rooftop jazz",
    start_at: "2026-10-17T03:00:00Z",
    end_at: null,
    timezone: "America/Los_Angeles",
    location_name: "Cafe Allegro",
    image_url: null,
    visual_seed: "seed",
    cancelled: false,
    ...over,
  },
  tickets,
});

function renderWallet(props: Partial<React.ComponentProps<typeof TicketWallet>> = {}) {
  return render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <TicketWallet initialScope="upcoming" timeZone="America/Los_Angeles" {...props} />
    </SWRConfig>,
  );
}

describe("TicketWallet", () => {
  beforeEach(() => jest.clearAllMocks());

  it("lists each event once, with its tickets summed up and a link to them", async () => {
    mockFetchMyTickets.mockResolvedValue([group({}, [ticket("General"), ticket("VIP")])]);
    renderWallet();
    const row = await screen.findByRole("link", { name: /Rooftop jazz/ });
    expect(row).toHaveAttribute("href", `/e/${EVENT}/pass`);
    expect(within(row).getByText("2 tickets · General, VIP")).toBeInTheDocument();
    expect(within(row).getByText(/8:00 PM/)).toBeInTheDocument();
  });

  it("uses the singular for one ticket", async () => {
    mockFetchMyTickets.mockResolvedValue([group({}, [ticket("General")])]);
    renderWallet();
    expect(await screen.findByText("1 ticket · General")).toBeInTheDocument();
  });

  it("marks cancelled events", async () => {
    mockFetchMyTickets.mockResolvedValue([group({ cancelled: true })]);
    renderWallet();
    expect(await screen.findByText("Cancelled")).toBeInTheDocument();
  });

  it("switches between upcoming and past, keeping the URL in step", async () => {
    mockFetchMyTickets.mockImplementation(async (scope: string) => (scope === "past" ? [group({ title: "Last summer" })] : [group()]));
    renderWallet();
    await screen.findByText("Rooftop jazz");
    await userEvent.click(screen.getByRole("radio", { name: "Past" }));
    expect(await screen.findByText("Last summer")).toBeInTheDocument();
    expect(mockFetchMyTickets).toHaveBeenLastCalledWith("past");
    expect(mockReplace).toHaveBeenCalledWith("/tickets?scope=past", { scroll: false });
  });

  it("suggests events when nothing is coming up", async () => {
    mockFetchMyTickets.mockResolvedValue([]);
    renderWallet();
    expect(await screen.findByText("No upcoming tickets")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Browse events" })).toHaveAttribute("href", "/events");
  });

  it("paints the server's first page without waiting", () => {
    mockFetchMyTickets.mockReturnValue(new Promise(() => undefined));
    renderWallet({ initialGroups: [group()] });
    expect(screen.getByText("Rooftop jazz")).toBeInTheDocument();
  });
});
