import { render, screen } from "@testing-library/react";
import { SWRConfig } from "swr";
import { YourEventsStrip } from "@/components/events/YourEventsStrip";

const mockFetchMyTickets = jest.fn();

jest.mock("@/lib/AuthContext", () => ({ useAuth: () => ({ user: { id: "u1" } }) }));
jest.mock("@/lib/auth/freshAuthHeaders", () => ({ getFreshAuthHeaders: async () => ({}) }));
jest.mock("@/lib/ticketing/ticketingClient", () => {
  const actual = jest.requireActual("@/lib/ticketing/ticketingClient");
  return { ...actual, fetchMyTickets: (...args: unknown[]) => mockFetchMyTickets(...args) };
});

const group = { event: { beacon_id: "b" }, tickets: [{ id: "t1" }, { id: "t2" }] };

function renderStrip(ticketing: boolean) {
  return render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <YourEventsStrip timeZone="UTC" ticketing={ticketing} />
    </SWRConfig>,
  );
}

describe("YourEventsStrip tickets link", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn(async () => new Response(JSON.stringify({ events: [], bookmarks: [] }), { status: 200 })) as jest.Mock;
  });

  it("links to the ticket wallet when an upcoming ticket exists, even with no other events", async () => {
    mockFetchMyTickets.mockResolvedValue([group]);
    renderStrip(true);
    expect(await screen.findByRole("link", { name: /Your tickets/ })).toHaveAttribute("href", "/tickets");
    expect(mockFetchMyTickets).toHaveBeenCalledWith("upcoming");
  });

  it("asks nothing while ticketing is off", async () => {
    renderStrip(false);
    await screen.findByText(() => true).catch(() => undefined);
    expect(mockFetchMyTickets).not.toHaveBeenCalled();
    expect(screen.queryByRole("link", { name: /Your tickets/ })).not.toBeInTheDocument();
  });
});
