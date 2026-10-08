import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SWRConfig } from "swr";
import { PassScanner } from "@/components/events/PassScanner";

let mockOnRead: ((raw: string) => void) | null = null;
jest.mock("@/lib/ui/useQrScanner", () => ({
  useQrScanner: (_on: boolean, onRead: (raw: string) => void) => {
    mockOnRead = onRead;
    return { videoRef: { current: null }, status: "scanning" };
  },
}));
jest.mock("@/lib/ui/useWakeLock", () => ({ useWakeLock: () => undefined }));
jest.mock("@/components/ds/useMediaQuery", () => ({ useMediaQuery: () => true }));
jest.mock("@/lib/auth/freshAuthHeaders", () => ({ getFreshAuthHeaders: async () => ({}) }));

const EVENT = "11111111-1111-4111-8111-111111111111";
const ALEX = { user_id: "u1", name: "Alex Chen", avatar_url: null };
// jsdom has no Response; the scanner reads only ok, status and json().
const json = (body: unknown, status = 200) => Promise.resolve({ ok: status < 400, status, json: async () => body });
const mockFetch = jest.fn();
global.fetch = mockFetch;

function renderScanner(ticketed = true) {
  return render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <PassScanner beaconId={EVENT} title="Jazz night" closeHref="/e/x" timeZone="America/Los_Angeles" ticketed={ticketed} />
    </SWRConfig>,
  );
}

async function scan(body: unknown) {
  mockFetch.mockImplementationOnce(() => json(body));
  await act(async () => mockOnRead!(`https://joinclick.co/e/${EVENT}?pass=2.x.y${Math.random()}`));
}

describe("PassScanner", () => {
  beforeEach(() => mockFetch.mockReset());

  it("names itself for the kind of event", () => {
    const { unmount } = renderScanner(true);
    expect(screen.getByRole("heading", { name: "Scan Tickets" })).toBeInTheDocument();
    expect(screen.getByText("Guests find their ticket on the event page.")).toBeInTheDocument();
    unmount();
    renderScanner(false);
    expect(screen.getByRole("heading", { name: "Scan Passes" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Look up guest" })).not.toBeInTheDocument();
  });

  it("shows the holder and their ticket type", async () => {
    renderScanner();
    await scan({ result: "checked_in", attendee: ALEX, tier_name: "VIP", checked_in_at: "2026-10-10T03:04:00Z", check_in_count: 12 });
    expect(await screen.findByText("Checked in")).toBeInTheDocument();
    expect(screen.getByText("Alex Chen")).toBeInTheDocument();
    expect(screen.getByText("VIP")).toBeInTheDocument();
  });

  it.each([
    ["refunded", "Refunded", "This ticket was refunded."],
    ["event_cancelled", "Event cancelled", "Tickets for this event no longer admit anyone."],
  ])("explains a %s ticket", async (result, title, detail) => {
    renderScanner();
    await scan({ result, attendee: ALEX, tier_name: "General", checked_in_at: null });
    expect(await screen.findByText(title)).toBeInTheDocument();
    expect(screen.getByText(detail)).toBeInTheDocument();
  });

  it("checks a guest in by name when their code won't scan", async () => {
    mockFetch.mockImplementation((url: string, init?: RequestInit) => {
      if (String(url).includes("/tickets/attendees")) {
        return json({
          attendees: [
            { ticket_id: "t1", order_id: "o1", user_id: "u1", name: "Alex Chen", avatar_url: null, tier_name: "General", status: "valid", checked_in_at: null, ticket_number: "CLK-7Q2M-0001", refundable: true },
          ],
          next_cursor: null,
        });
      }
      if (String(url).endsWith("/pass/scan") && init?.method === "POST") {
        return json({ result: "checked_in", attendee: ALEX, tier_name: "General", checked_in_at: "2026-10-10T03:04:00Z", check_in_count: 13 });
      }
      return json({}, 404);
    });
    renderScanner();
    await userEvent.click(screen.getByRole("button", { name: "Look up guest" }));
    const sheet = await screen.findByRole("dialog", { name: "Look up guest" });
    await userEvent.click(await within(sheet).findByRole("button", { name: "Check in Alex Chen" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Look up guest" })).not.toBeInTheDocument());
    expect(await screen.findByText("Checked in")).toBeInTheDocument();
    expect(screen.getByText("13 here now")).toBeInTheDocument();
    const post = mockFetch.mock.calls.find(([u, i]) => String(u).endsWith("/pass/scan") && i?.method === "POST");
    expect(JSON.parse(String(post![1].body))).toEqual({ ticket_id: "t1" });
  });
});
