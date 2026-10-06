import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EventRsvpCard } from "@/components/events/EventRsvpCard";
import type { EventListingOptions } from "@/lib/events/eventOptions";

type Payload = {
  current_user_signed_up?: boolean;
  request_status?: "pending" | "waitlisted" | null;
  attendees?: Array<{ user_id: string; name: string; avatar_url: string | null }>;
  rsvp_count?: number;
};

const authState: { user: { id: string } | null; loading: boolean } = { user: null, loading: false };
const swrState: { data?: Payload } = {};

jest.mock("@/lib/AuthContext", () => ({
  useAuth: () => ({ user: authState.user, loading: authState.loading }),
}));
jest.mock("@/lib/auth/freshAuthHeaders", () => ({ getFreshAuthHeaders: async () => ({}) }));
jest.mock("@/components/ds/Toast", () => ({ toast: { error: jest.fn(), success: jest.fn() } }));

const mutateMock = jest.fn();
jest.mock("swr", () => ({
  __esModule: true,
  default: (key: string | null) => ({ data: key ? swrState.data : undefined }),
  mutate: (...args: unknown[]) => mutateMock(...args),
}));

const ID = "11111111-1111-4111-8111-111111111111";
const LISTING: EventListingOptions = {
  event_visibility: "public",
  event_capacity: null,
  approval_required: false,
  guest_list_visibility: "public",
  cover_theme_id: null,
};

function renderCard(props: Partial<React.ComponentProps<typeof EventRsvpCard>> = {}) {
  return render(
    <EventRsvpCard
      beaconId={ID}
      title="Rooftop"
      listing={LISTING}
      rsvpEnabled
      ended={false}
      count={0}
      people={[]}
      calendar={{ id: ID, title: "Rooftop", startAt: "2026-10-07T01:00:00Z", endAt: null, location: null, description: null, url: "https://x" }}
      shareUrl="https://x"
      {...props}
    />,
  );
}

const state = (s: string) => expect(screen.getByTestId(`rsvp-state-${s}`)).toBeInTheDocument();

describe("EventRsvpCard", () => {
  beforeEach(() => {
    authState.user = null;
    authState.loading = false;
    swrState.data = undefined;
    mutateMock.mockReset();
    global.fetch = jest.fn();
  });

  it("shows the guest form when signed out", () => {
    renderCard();
    state("guest");
    expect(screen.getByTestId("guest-rsvp-form")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Log in/ })).toHaveAttribute("href", `/login?next=${encodeURIComponent(`/e/${ID}`)}`);
  });

  it("shows a skeleton, not a button, while a signed-in RSVP is loading", () => {
    authState.user = { id: "u1" };
    renderCard();
    state("loading");
    expect(screen.queryByRole("button", { name: "RSVP" })).not.toBeInTheDocument();
    expect(screen.queryByTestId("guest-rsvp-form")).not.toBeInTheDocument();
  });

  it("trusts the server snapshot while the client session is loading", () => {
    authState.loading = true;
    renderCard({ initialViewer: { kind: "member", going: true } });
    state("going");
    expect(screen.getByRole("button", { name: /You’re going/ })).toBeInTheDocument();
  });

  it("shows the guest form immediately when the server knows the viewer is signed out", () => {
    authState.loading = true;
    renderCard({ initialViewer: { kind: "guest" } });
    state("guest");
  });

  it("RSVPs with the Click account when signed in", () => {
    authState.user = { id: "u1" };
    swrState.data = { current_user_signed_up: false };
    renderCard();
    state("open");
    expect(screen.getByRole("button", { name: "RSVP" })).toBeInTheDocument();
    expect(screen.queryByLabelText(/email/i)).not.toBeInTheDocument();
  });

  it("asks for approval when the listing requires it", () => {
    authState.user = { id: "u1" };
    swrState.data = { current_user_signed_up: false };
    renderCard({ listing: { ...LISTING, approval_required: true } });
    state("approval");
    expect(screen.getByRole("button", { name: "Request to join" })).toBeInTheDocument();
  });

  it("lets a pending requester withdraw", () => {
    authState.user = { id: "u1" };
    swrState.data = { current_user_signed_up: false, request_status: "pending" };
    renderCard();
    state("requested");
    expect(screen.getByRole("button", { name: "Withdraw" })).toBeEnabled();
  });

  it("lets a waitlisted member leave", () => {
    authState.user = { id: "u1" };
    swrState.data = { current_user_signed_up: false, request_status: "waitlisted" };
    renderCard();
    state("waitlist");
    expect(screen.getByRole("button", { name: "Leave" })).toBeInTheDocument();
  });

  it("offers the waitlist when the event is full", () => {
    authState.user = { id: "u1" };
    swrState.data = { current_user_signed_up: false, rsvp_count: 10 };
    renderCard({ listing: { ...LISTING, event_capacity: 10 } });
    state("full");
    expect(screen.getByRole("button", { name: "Join waitlist" })).toBeInTheDocument();
  });

  it("asks guests to log in to join a full event's waitlist", () => {
    renderCard({ listing: { ...LISTING, event_capacity: 2 }, count: 2 });
    state("full");
    expect(screen.getByRole("link", { name: "Log in to join the waitlist" })).toBeInTheDocument();
  });

  it("points to the recap once the event has ended", () => {
    renderCard({ ended: true, count: 4 });
    state("ended");
    expect(screen.getByRole("link", { name: "See recap" })).toHaveAttribute("href", `/e/${ID}/recap`);
    expect(screen.getByText(/4 went/)).toBeInTheDocument();
  });

  it("says registration is closed when RSVPs are off", () => {
    renderCard({ rsvpEnabled: false });
    state("closed");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("writes the new attendee into the shared RSVP cache", async () => {
    const user = userEvent.setup();
    authState.user = { id: "u1" };
    swrState.data = { current_user_signed_up: false, attendees: [], rsvp_count: 0 };
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, attendee: { user_id: "u1", name: "Ada", avatar_url: null } }),
    });
    renderCard();
    await user.click(screen.getByRole("button", { name: "RSVP" }));
    await waitFor(() => expect(mutateMock).toHaveBeenCalled());
    const updater = mutateMock.mock.calls[0][1] as (cur?: Payload) => Payload;
    const next = updater({ attendees: [], rsvp_count: 2, current_user_signed_up: false });
    expect(next.attendees).toEqual([{ user_id: "u1", name: "Ada", avatar_url: null }]);
    expect(next.rsvp_count).toBe(3);
  });

  it("records a pending request from the API", async () => {
    const user = userEvent.setup();
    authState.user = { id: "u1" };
    swrState.data = { current_user_signed_up: false };
    (global.fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => ({ request_status: "pending" }) });
    renderCard({ listing: { ...LISTING, approval_required: true } });
    await user.click(screen.getByRole("button", { name: "Request to join" }));
    await waitFor(() => expect(mutateMock).toHaveBeenCalled());
    const updater = mutateMock.mock.calls[0][1] as (cur?: Payload) => Payload;
    expect(updater({}).request_status).toBe("pending");
  });
});
